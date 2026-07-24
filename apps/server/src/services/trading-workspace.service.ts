import {
  TradingOpportunitySchema,
  TradingWorkspaceActionResponseSchema,
  TradingWorkspaceResponseSchema,
  type CloseTradingPositionRequest,
  type ConfirmTradingEntryRequest,
  type RecordTradingOverrideRequest,
  type TradingOpportunity,
  type TradingPosition,
  type TradingReadyAlert,
  type TradingWorkspaceActionResponse,
  type TradingWorkspaceResponse,
  type UpsertTradingRestrictedEventRequest,
} from "@spy-copilot/shared";
import { hasDatabaseUrl } from "../config/env";
import { isDatabaseReachable } from "../lib/db-status";
import { buildExitPolicyResearch } from "./exit-policy-research.logic";
import { buildSetupRegistry, buildTradingOpportunityCandidates } from "./setup-registry.logic";
import {
  TRADING_POLICY_V1,
  buildExecutionModel,
  buildTradingRiskLedger,
  calculatePlannedRiskDollars,
  evaluateTradingClock,
  evaluateTradingRestrictions,
  normalizeSetupLevelBucket,
  validateEntryEconomics,
} from "./trading-policy.logic";
import {
  buildTradingOpportunity,
  getSelectedOpportunityCandidate,
} from "./trading-opportunity.logic";
import { getSpyZeroDteTradePlanAssemblyBundleWithDependencies } from "./trade-plan-assembly.service";
import {
  TradingRepositoryConflictError,
  closeTradingPositionTransaction,
  confirmTradingEntryTransaction,
  createReadyAlert,
  deleteTradingRestrictedEvent,
  expireReadyAlerts,
  getDefaultTradingUserId,
  getExitPolicyMarks,
  getTradingWorkspaceRepositorySnapshot,
  insertWorkspaceEvent,
  recordTradingOverride,
  revokeActiveReadyAlert,
  upsertTradingRestrictedEvent,
  type TradingWorkspaceRepositorySnapshot,
} from "./trading-workspace.repository";
import { getSpyZeroDteDeterministicMarketState } from "./market-state.service";
import { resolveWorkspaceAssemblyTimeMs } from "./trading-workspace-time.logic";
import {
  getLastResortSpyZeroDteOptionsChain,
  getSpyZeroDteOptionsChain,
} from "./schwab-options-chain.service";

function nowIso(now: Date): string {
  return now.toISOString();
}

function emptyRepositorySnapshot(): TradingWorkspaceRepositorySnapshot {
  return {
    openPosition: null,
    recentPositions: [],
    activeReadyAlert: null,
    restrictionEvents: [],
    attemptsByEpisode: new Map(),
    runtime: {
      runtimeState: "UNAVAILABLE",
      lastHeartbeatAt: null,
      lastEvaluationAt: null,
      lastOutcome: null,
    },
  };
}

function selectedEpisodeForLedger(
  candidates: ReturnType<typeof buildTradingOpportunityCandidates>,
): string | null {
  const priority: Record<string, number> = {
    READY: 6,
    CONFIRMED: 5,
    ARMED: 4,
    DETECTED: 3,
    INVALIDATED: 2,
    UNAVAILABLE: 1,
  };
  return (
    candidates
      .filter((candidate) => candidate.promotionStatus === "LIVE")
      .sort((a, b) => {
        const lifecycle = (priority[b.lifecycleState] ?? 0) - (priority[a.lifecycleState] ?? 0);
        if (lifecycle !== 0) return lifecycle;
        return (b.confidenceScore ?? -1) - (a.confidenceScore ?? -1);
      })[0]?.setupEpisodeId ?? null
  );
}

function blockOpportunityForStorage(
  opportunity: TradingOpportunity,
): TradingOpportunity {
  if (!["READY", "WAITING"].includes(opportunity.state)) return opportunity;
  return TradingOpportunitySchema.parse({
    ...opportunity,
    state: "BLOCKED",
    primaryReasonCode: "PERSISTENT_TRADING_STORAGE_UNAVAILABLE",
    warningCodes: [
      ...new Set([...opportunity.warningCodes, "DATABASE_PERSISTENCE_UNAVAILABLE"]),
    ].sort(),
    riskLedgerPermitted: false,
  });
}

async function loadRepositoryState(input: {
  userId: string | null;
  marketDate: string;
  now: Date;
}): Promise<{ available: boolean; snapshot: TradingWorkspaceRepositorySnapshot }> {
  if (!input.userId || !hasDatabaseUrl || !(await isDatabaseReachable())) {
    return { available: false, snapshot: emptyRepositorySnapshot() };
  }
  try {
    return {
      available: true,
      snapshot: await getTradingWorkspaceRepositorySnapshot({
        userId: input.userId,
        marketDate: input.marketDate,
        now: input.now,
      }),
    };
  } catch {
    return { available: false, snapshot: emptyRepositorySnapshot() };
  }
}

async function buildAssemblyBundle(now: Date) {
  let assemblyTimeMs = now.getTime();

  return getSpyZeroDteTradePlanAssemblyBundleWithDependencies({
    getMarketState: async () => {
      const marketState = await getSpyZeroDteDeterministicMarketState();
      assemblyTimeMs = resolveWorkspaceAssemblyTimeMs(assemblyTimeMs, marketState);
      return marketState;
    },
    getOptionsChain: getSpyZeroDteOptionsChain,
    getLastResortOptionsChain: getLastResortSpyZeroDteOptionsChain,
    now: () => assemblyTimeMs,
  });
}

async function reconcileReadyAlert(input: {
  userId: string;
  opportunity: TradingOpportunity;
  activeAlert: TradingReadyAlert | null;
  openPosition: TradingPosition | null;
  now: Date;
  snapshot: unknown;
}): Promise<TradingReadyAlert | null> {
  const expiredIds = await expireReadyAlerts(input.userId, input.now);
  for (const id of expiredIds) {
    await insertWorkspaceEvent({
      userId: input.userId,
      marketDate: input.opportunity.marketDate,
      eventType: "READY_ALERT_EXPIRED",
      severity: "INFO",
      dedupeKey: `ready-expired:${id}`,
      relatedReadyAlertId: id,
      payload: {
        title: "READY opportunity expired",
        message: "The manual-entry confirmation window expired after 60 seconds.",
        actionable: false,
      },
    });
  }
  let active = input.activeAlert;
  if (active && expiredIds.includes(active.id)) active = null;

  if (active) {
    const stillSameReady =
      input.opportunity.state === "READY" &&
      input.opportunity.opportunityId === active.opportunityId &&
      !input.openPosition;
    if (!stillSameReady) {
      const revoked = await revokeActiveReadyAlert({
        userId: input.userId,
        alertId: active.id,
        reasonCode: input.openPosition
          ? "POSITION_ALREADY_OPEN"
          : "OPPORTUNITY_NO_LONGER_READY",
        now: input.now,
      });
      if (revoked) {
        await insertWorkspaceEvent({
          userId: input.userId,
          marketDate: active.marketDate,
          eventType: "READY_ALERT_REVOKED",
          severity: "INFO",
          dedupeKey: `ready-revoked:${active.id}`,
          relatedReadyAlertId: active.id,
          payload: {
            title: "READY opportunity revoked",
            message: "The deterministic opportunity no longer satisfies every live-entry gate.",
            actionable: false,
          },
        });
      }
      active = null;
    }
  }

  if (
    !active &&
    !input.openPosition &&
    input.opportunity.state === "READY" &&
    input.opportunity.opportunityId
  ) {
    const selected = getSelectedOpportunityCandidate(input.opportunity);
    if (selected) {
      active = await createReadyAlert({
        userId: input.userId,
        marketDate: input.opportunity.marketDate,
        opportunityId: input.opportunity.opportunityId,
        setupEpisodeId: selected.setupEpisodeId,
        issuedAt: input.now,
        expiresAt: new Date(
          input.now.getTime() + TRADING_POLICY_V1.readyAlertTtlSeconds * 1000,
        ),
        snapshot: input.snapshot,
      });
      await insertWorkspaceEvent({
        userId: input.userId,
        marketDate: input.opportunity.marketDate,
        eventType: "READY_ALERT_CREATED",
        severity: "INFO",
        dedupeKey: `ready-created:${active.id}`,
        relatedReadyAlertId: active.id,
        payload: {
          title: "SPY 0DTE opportunity READY",
          message: "Review the workspace and manually confirm only while the 60-second alert remains active.",
          actionable: false,
          opportunityId: input.opportunity.opportunityId,
          direction: input.opportunity.direction,
          setupId: selected.setupId,
          expiresAt: active.expiresAt,
        },
      });
    }
  }
  return active;
}

export interface GetTradingWorkspaceOptions {
  reconcile?: boolean;
  now?: Date;
}

export async function getTradingWorkspace(
  options: GetTradingWorkspaceOptions = {},
): Promise<TradingWorkspaceResponse> {
  const now = options.now ?? new Date();
  const bundle = await buildAssemblyBundle(now);
  const workspaceCalculatedAt = new Date(
    Math.max(now.getTime(), Date.parse(bundle.assembly.calculatedAt)),
  );
  let userId: string | null = null;
  if (hasDatabaseUrl && (await isDatabaseReachable())) {
    try {
      userId = await getDefaultTradingUserId();
    } catch {
      userId = null;
    }
  }
  let repository = await loadRepositoryState({
    userId,
    marketDate: bundle.assembly.currentMarketDate,
    now,
  });
  const candidates = buildTradingOpportunityCandidates(bundle.marketState, bundle.assembly);
  const selectedEpisode = selectedEpisodeForLedger(candidates);
  const positionsForDate = repository.snapshot.recentPositions.filter(
    (position) => position.marketDate === bundle.assembly.currentMarketDate,
  );
  const ledger = buildTradingRiskLedger({
    marketDate: bundle.assembly.currentMarketDate,
    closedPositions: positionsForDate.map((position) => ({
      realizedPnlDollars: position.realizedPnlDollars,
      closedAt: position.closedAt,
      status: position.status,
    })),
    openPositions: positionsForDate.map((position) => ({
      plannedRiskDollars: position.plannedRiskDollars,
      status: position.status,
    })),
    tradeCount: positionsForDate.filter((position) => position.status !== "CANCELLED").length,
    attemptsForCurrentEpisode: selectedEpisode
      ? repository.snapshot.attemptsByEpisode.get(selectedEpisode) ?? 0
      : 0,
  });
  const clock = evaluateTradingClock(now.getTime());
  const restriction = evaluateTradingRestrictions(
    repository.snapshot.restrictionEvents,
    bundle.assembly.currentMarketDate,
    now.getTime(),
  );
  let opportunity = buildTradingOpportunity({
    marketDate: bundle.assembly.currentMarketDate,
    candidates,
    entryCutoffPassed: clock.entryCutoffPassed,
    eventRestriction: restriction,
    riskLedger: ledger,
  });
  if (!repository.available) opportunity = blockOpportunityForStorage(opportunity);

  let activeReadyAlert = repository.snapshot.activeReadyAlert;
  if (options.reconcile && repository.available && userId) {
    activeReadyAlert = await reconcileReadyAlert({
      userId,
      opportunity,
      activeAlert: activeReadyAlert,
      openPosition: repository.snapshot.openPosition,
      now,
      snapshot: { assembly: bundle.assembly, opportunity },
    });
    repository = await loadRepositoryState({
      userId,
      marketDate: bundle.assembly.currentMarketDate,
      now,
    });
    activeReadyAlert = repository.snapshot.activeReadyAlert;
  }

  const selected = getSelectedOpportunityCandidate(opportunity);
  const executionModel = buildExecutionModel({
    plannedEntryAsk:
      repository.snapshot.openPosition?.plannedEntryAsk ??
      selected?.selectedContractAsk ??
      null,
    currentExitBid: repository.snapshot.openPosition
      ? null
      : selected?.selectedContractBid ?? null,
    actualEntryPrice: repository.snapshot.openPosition?.actualEntryPrice ?? null,
  });
  let researchMarks: Array<{ policy: string; pnl: number | null }> = [];
  if (repository.available && userId) {
    try {
      researchMarks = await getExitPolicyMarks(userId);
    } catch {
      researchMarks = [];
    }
  }
  const warnings: string[] = [];
  if (!repository.available) warnings.push("DATABASE_PERSISTENCE_UNAVAILABLE");
  if (bundle.assembly.warningCode) warnings.push(bundle.assembly.warningCode);
  if (opportunity.directionalConflict) warnings.push("DIRECTIONAL_CONFLICT_FAIL_CLOSED");
  if (clock.absoluteExitDeadlineReached && repository.snapshot.openPosition) {
    warnings.push("ABSOLUTE_EXIT_DEADLINE_BREACHED_OPEN_POSITION");
  }

  return TradingWorkspaceResponseSchema.parse({
    symbol: "SPY",
    product: "SPY_ZERO_DTE_TRADING_WORKSPACE",
    methodologyVersion: "TRADING_WORKSPACE_V1",
    calculatedAt: nowIso(workspaceCalculatedAt),
    currentMarketDate: bundle.assembly.currentMarketDate,
    engineState:
      bundle.assembly.engineState === "UNAVAILABLE"
        ? "UNAVAILABLE"
        : repository.available
          ? bundle.assembly.engineState
          : "PARTIAL",
    primaryReasonCode: !repository.available
      ? "PERSISTENT_TRADING_STORAGE_UNAVAILABLE"
      : opportunity.primaryReasonCode,
    policy: TRADING_POLICY_V1,
    setupRegistry: buildSetupRegistry(now.getTime()),
    restrictionEvents: repository.snapshot.restrictionEvents,
    riskLedger: ledger,
    opportunity,
    activeReadyAlert,
    openPosition: repository.snapshot.openPosition,
    recentPositions: repository.snapshot.recentPositions,
    executionModel,
    exitPolicyResearch: buildExitPolicyResearch(researchMarks),
    automation: {
      ...repository.snapshot.runtime,
      discordOwnership: "PERSISTENT_BACKEND_ONLY",
    },
    sourceAssembly: bundle.assembly,
    warnings: [...new Set(warnings)].sort(),
    disclosures: {
      decisionSupportOnly: true,
      noAutomatedOrderExecution: true,
      manualEntryConfirmationRequired: true,
      manualExitConfirmationRequired: true,
      shadowSetupsCannotTrade: true,
      gammaAndVolatilityRelationshipsResearchOnly: true,
      manualOverridesSeparatedFromPureEnginePerformance: true,
    },
  });
}

function rejectedAction(
  reasonCode: string,
  workspace: TradingWorkspaceResponse | null,
): TradingWorkspaceActionResponse {
  return TradingWorkspaceActionResponseSchema.parse({
    product: "SPY_ZERO_DTE_TRADING_WORKSPACE_ACTION",
    methodologyVersion: "TRADING_WORKSPACE_ACTION_V1",
    actionState: "REJECTED",
    primaryReasonCode: reasonCode,
    calculatedAt: new Date().toISOString(),
    position: workspace?.openPosition ?? null,
    readyAlert: workspace?.activeReadyAlert ?? null,
    workspace,
  });
}

export async function confirmTradingEntry(
  request: ConfirmTradingEntryRequest,
): Promise<TradingWorkspaceActionResponse> {
  const now = new Date();
  const workspace = await getTradingWorkspace({ reconcile: true, now });
  if (!hasDatabaseUrl || !(await isDatabaseReachable())) {
    return rejectedAction("PERSISTENT_TRADING_STORAGE_UNAVAILABLE", workspace);
  }
  if (
    workspace.opportunity.state !== "READY" ||
    !workspace.opportunity.opportunityId ||
    !workspace.activeReadyAlert ||
    workspace.activeReadyAlert.id !== request.readyAlertId
  ) {
    return rejectedAction("ACTIVE_READY_ALERT_REQUIRED", workspace);
  }
  if (Date.parse(workspace.activeReadyAlert.expiresAt) <= now.getTime()) {
    return rejectedAction("READY_ALERT_EXPIRED", workspace);
  }
  const selected = getSelectedOpportunityCandidate(workspace.opportunity);
  if (!selected) return rejectedAction("SELECTED_OPPORTUNITY_CANDIDATE_MISSING", workspace);
  const plannedRiskDollars = calculatePlannedRiskDollars(
    workspace.sourceAssembly.optionRiskReward?.estimatedPremiumRiskPerShare,
  );
  const economics = validateEntryEconomics({
    actualEntryPrice: request.actualEntryPrice,
    plannedRiskDollars,
    underlyingRewardRiskRatio: selected.underlyingRewardRiskRatio,
    optionRewardRiskRatio: selected.optionRewardRiskRatio,
  });
  if (!economics.permitted) return rejectedAction(economics.reasonCode, workspace);
  if (
    !selected.selectedContractSymbol ||
    selected.selectedContractAsk === null ||
    selected.selectedContractStrike === null ||
    !selected.selectedContractExpiration ||
    selected.invalidationLevel === null ||
    selected.target1Level === null ||
    selected.target2Level === null ||
    workspace.sourceAssembly.currentPrice === null ||
    plannedRiskDollars === null
  ) {
    return rejectedAction("COMPLETE_POSITION_PLAN_REQUIRED", workspace);
  }
  const userId = await getDefaultTradingUserId();
  try {
    const position = await confirmTradingEntryTransaction({
      userId,
      marketDate: workspace.currentMarketDate,
      setupId: selected.setupId,
      setupEpisodeId: selected.setupEpisodeId,
      opportunityId: workspace.opportunity.opportunityId,
      readyAlertId: request.readyAlertId,
      direction: selected.direction,
      contractSymbol: selected.selectedContractSymbol,
      strikePrice: selected.selectedContractStrike,
      expirationDate: selected.selectedContractExpiration,
      plannedEntryAsk: selected.selectedContractAsk,
      modeledEntryPrice: selected.selectedContractAsk,
      actualEntryPrice: request.actualEntryPrice,
      entryUnderlyingPrice: workspace.sourceAssembly.currentPrice,
      structuralStopLevel: selected.invalidationLevel,
      target1Level: selected.target1Level,
      target2Level: selected.target2Level,
      target3Level: selected.target3Level,
      plannedRiskDollars,
      sourceSnapshot: {
        pureEngine: workspace.sourceAssembly,
        opportunity: workspace.opportunity,
        manualEntry: {
          actualEntryPrice: request.actualEntryPrice,
          confirmedAt: now.toISOString(),
        },
      },
      levelType: selected.levelType,
      levelBucket: normalizeSetupLevelBucket(selected.triggerLevel),
      openedAt: now,
      entryNote: request.note?.trim() || null,
    });
    await insertWorkspaceEvent({
      userId,
      marketDate: workspace.currentMarketDate,
      eventType: "POSITION_OPENED",
      severity: "ACTION",
      dedupeKey: `position-opened:${position.id}`,
      relatedReadyAlertId: request.readyAlertId,
      relatedPositionId: position.id,
      payload: {
        title: "Paper-equivalent position recorded",
        message: "A one-contract position was manually confirmed. No broker order was submitted.",
        actionable: true,
        positionId: position.id,
        direction: position.direction,
        contractSymbol: position.contractSymbol,
        target2Level: position.target2Level,
        structuralStopLevel: position.structuralStopLevel,
      },
    });
    const fresh = await getTradingWorkspace({ reconcile: false, now: new Date() });
    return TradingWorkspaceActionResponseSchema.parse({
      product: "SPY_ZERO_DTE_TRADING_WORKSPACE_ACTION",
      methodologyVersion: "TRADING_WORKSPACE_ACTION_V1",
      actionState: "COMPLETED",
      primaryReasonCode: "MANUAL_ENTRY_CONFIRMED_POSITION_RECORDED",
      calculatedAt: new Date().toISOString(),
      position,
      readyAlert: fresh.activeReadyAlert,
      workspace: fresh,
    });
  } catch (error) {
    if (error instanceof TradingRepositoryConflictError) {
      return rejectedAction(error.code, await getTradingWorkspace({ reconcile: false }));
    }
    throw error;
  }
}

export async function closeTradingPosition(
  positionId: string,
  request: CloseTradingPositionRequest,
): Promise<TradingWorkspaceActionResponse> {
  if (!hasDatabaseUrl || !(await isDatabaseReachable())) {
    return rejectedAction("PERSISTENT_TRADING_STORAGE_UNAVAILABLE", null);
  }
  const userId = await getDefaultTradingUserId();
  try {
    const position = await closeTradingPositionTransaction({
      userId,
      positionId,
      actualExitPrice: request.actualExitPrice,
      exitReason: request.exitReason,
      exitNote: request.note?.trim() || null,
      closedAt: new Date(),
    });
    await insertWorkspaceEvent({
      userId,
      marketDate: position.marketDate,
      eventType: "POSITION_CLOSED",
      severity: "ACTION",
      dedupeKey: `position-closed:${position.id}`,
      relatedPositionId: position.id,
      payload: {
        title: "Paper-equivalent position closed",
        message: "The manually supplied bid-side exit was recorded for performance analysis.",
        actionable: true,
        positionId: position.id,
        exitReason: position.exitReason,
        realizedPnlDollars: position.realizedPnlDollars,
      },
    });
    const fresh = await getTradingWorkspace({ reconcile: false });
    return TradingWorkspaceActionResponseSchema.parse({
      product: "SPY_ZERO_DTE_TRADING_WORKSPACE_ACTION",
      methodologyVersion: "TRADING_WORKSPACE_ACTION_V1",
      actionState: "COMPLETED",
      primaryReasonCode: "MANUAL_EXIT_RECORDED",
      calculatedAt: new Date().toISOString(),
      position,
      readyAlert: fresh.activeReadyAlert,
      workspace: fresh,
    });
  } catch (error) {
    if (error instanceof TradingRepositoryConflictError) {
      return rejectedAction(error.code, await getTradingWorkspace({ reconcile: false }));
    }
    throw error;
  }
}

export async function recordManualTradingOverride(
  request: RecordTradingOverrideRequest,
): Promise<TradingWorkspaceActionResponse> {
  const workspace = await getTradingWorkspace({ reconcile: false });
  if (!hasDatabaseUrl || !(await isDatabaseReachable())) {
    return rejectedAction("PERSISTENT_TRADING_STORAGE_UNAVAILABLE", workspace);
  }
  const userId = await getDefaultTradingUserId();
  await recordTradingOverride({
    userId,
    marketDate: workspace.currentMarketDate,
    request,
    sourceEngineState: {
      opportunity: workspace.opportunity,
      riskLedger: workspace.riskLedger,
      openPosition: workspace.openPosition,
    },
  });
  return TradingWorkspaceActionResponseSchema.parse({
    product: "SPY_ZERO_DTE_TRADING_WORKSPACE_ACTION",
    methodologyVersion: "TRADING_WORKSPACE_ACTION_V1",
    actionState: "COMPLETED",
    primaryReasonCode: "OVERRIDE_RECORDED_NO_AUTOMATIC_POLICY_BYPASS",
    calculatedAt: new Date().toISOString(),
    position: workspace.openPosition,
    readyAlert: workspace.activeReadyAlert,
    workspace,
  });
}

export async function saveTradingRestrictedEvent(
  request: UpsertTradingRestrictedEventRequest,
  eventId?: string,
) {
  const userId = await getDefaultTradingUserId();
  return upsertTradingRestrictedEvent({ userId, request, eventId });
}

export async function removeTradingRestrictedEvent(eventId: string): Promise<boolean> {
  const userId = await getDefaultTradingUserId();
  return deleteTradingRestrictedEvent(userId, eventId);
}
