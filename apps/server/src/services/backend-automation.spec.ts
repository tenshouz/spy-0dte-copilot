/**
 * Deterministic tests for persistent BACKEND_AUTOMATION_V1.
 * Run: npx --no-install tsx apps/server/src/services/backend-automation.spec.ts
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  BackendAutomationSettingsUpdateRequestSchema,
  DiscordScheduledReportDeliveryResponseSchema,
  SpyZeroDteTradePlanAlertCandidateResponseSchema,
  type BackendAutomationDeliveryCategory,
  type BackendAutomationDeliveryState,
  type BackendAutomationSettingsUpdateRequest,
  type DeterministicScheduledReportType,
  type DiscordScheduledReportDeliveryResponse,
  type SpyZeroDteTradePlanAlertCandidateResponse,
} from "@spy-copilot/shared";
import {
  BACKEND_AUTOMATION_HEARTBEAT_STALE_SECONDS,
  DEFAULT_BACKEND_AUTOMATION_SETTINGS,
  buildBackendAutomationHistoryResponse,
  buildBackendAutomationSettingsResponse,
  buildBackendAutomationStatusResponse,
  isAutomationTickDue,
  isHeartbeatStale,
  parsePersistentTradePlanTransitionState,
  scheduledReportDeliveryKey,
  type BackendAutomationDeliveryLogRow,
  type BackendAutomationRuntimeRow,
  type BackendAutomationSettingsRow,
} from "./backend-automation.logic";
import {
  getBackendAutomationSettingsWithDependencies,
  runBackendAutomationOnceWithDependencies,
  runBackendAutomationTickWithDependencies,
  startBackendAutomationScheduler,
  type BackendAutomationDependencies,
  type BackendAutomationRepository,
  type DeliveryLogInsert,
} from "./backend-automation.service";
import { evaluateSpyZeroDteScheduledReportSchedule } from "./scheduled-report-schedule.logic";
import { createEmptyTradePlanAlertTransitionMemoryState } from "./trade-plan-alert-transition.logic";
import { resetDiscordTradePlanTransitionFingerprintClaimsForTests } from "./discord-trade-plan-alert.logic";

const NOW = new Date("2026-07-20T13:25:00.000Z");
const USER_ID = "user-1";
const OWNER = "owner-1";

function candidateReady(
  key = "SPY|2026-07-20|PLAN_READY|CALLS|SPY_CALL",
): SpyZeroDteTradePlanAlertCandidateResponse {
  return SpyZeroDteTradePlanAlertCandidateResponseSchema.parse({
    symbol: "SPY",
    product: "SPY_ZERO_DTE_DETERMINISTIC_TRADE_PLAN_ALERT_CANDIDATE",
    methodologyVersion: "TRADE_PLAN_ALERT_CANDIDATE_V1",
    currentMarketDate: "2026-07-20",
    calculatedAt: "2026-07-20T13:25:00.000Z",
    engineState: "AVAILABLE",
    alertState: "CANDIDATE",
    primaryReasonCode: "PLAN_READY_CANDIDATE",
    warningCode: null,
    sourceAssembly: {
      product: "SPY_ZERO_DTE_DETERMINISTIC_TRADE_PLAN_ASSEMBLY",
      methodologyVersion: "ASSEMBLY_V1",
      currentMarketDate: "2026-07-20",
      calculatedAt: "2026-07-20T13:24:59.000Z",
      engineState: "AVAILABLE",
      planState: "READY",
      direction: "CALLS",
      primaryReasonCode: "TRADE_PLAN_READY",
      warningCode: null,
    },
    candidate: {
      deduplicationKey: key,
      category: "PLAN_READY",
      severity: "OPPORTUNITY",
      title: "Deterministic CALLS plan ready",
      message: "A deterministic CALLS plan is ready for review.",
      direction: "CALLS",
      currentPrice: 640.25,
      planningReferenceType: "CURRENT_PRICE",
      planningReferencePrice: 640.25,
      triggerLevel: 640,
      triggerComparison: "PRICE_GREATER_THAN",
      selectedContractSymbol: "SPY   260720C00640000",
      selectedContractAsk: 1.25,
      selectedContractQuoteAt: "2026-07-20T13:24:58.000Z",
      structuralInvalidationLevel: 639.5,
      primaryObjectiveLevel: 642,
      rewardRiskRatio: 2.33,
    },
    disclosures: {
      currentSnapshotOnly: true,
      candidateOnly: true,
      noTransitionDetection: true,
      noDeduplicationState: true,
      noPersistence: true,
      noNotificationDelivery: true,
      noPrivateAccountData: true,
      noOrderExecution: true,
    },
    methodology: {
      sourceProduct: "SPY_ZERO_DTE_DETERMINISTIC_TRADE_PLAN_ASSEMBLY",
      sourceMethodology: "ASSEMBLY_V1",
      evaluationScope: "CURRENT_ASSEMBLY_SNAPSHOT",
      candidateStates: [
        "READY",
        "WAITING_FOR_TRIGGER",
        "NO_QUALIFIED_CONTRACT",
        "NOT_QUALIFIED",
      ],
      suppressedStates: ["NO_SETUP", "NOT_APPLICABLE"],
      unavailableState: "UNAVAILABLE",
      transitionDetectionMethod: "NONE",
      deliveryMethod: "NONE",
      deduplicationMethod: "STABLE_CANDIDATE_KEY_ONLY",
    },
  });
}

function candidateWaiting(): SpyZeroDteTradePlanAlertCandidateResponse {
  const ready = candidateReady(
    "SPY|2026-07-20|CALLS|VWAP_RECLAIM_BREAKOUT|WAITING_FOR_TRIGGER|ARMED",
  );
  return SpyZeroDteTradePlanAlertCandidateResponseSchema.parse({
    ...ready,
    primaryReasonCode: "WAITING_FOR_TRIGGER_CANDIDATE",
    sourceAssembly: {
      ...ready.sourceAssembly,
      planState: "WAITING_FOR_TRIGGER",
      primaryReasonCode: "TRADE_PLAN_WAITING_FOR_TRIGGER",
    },
    candidate: {
      ...ready.candidate,
      category: "WAITING_FOR_TRIGGER",
      severity: "INFO",
      title: "CALLS setup waiting for its trigger",
      message: "The deterministic CALLS setup remains conditional.",
      planningReferenceType: "TRIGGER_LEVEL",
      planningReferencePrice: 640,
      selectedContractSymbol: null,
      selectedContractAsk: null,
      selectedContractQuoteAt: null,
    },
  });
}

function candidateSuppressed(): SpyZeroDteTradePlanAlertCandidateResponse {
  const ready = candidateReady();
  return SpyZeroDteTradePlanAlertCandidateResponseSchema.parse({
    ...ready,
    alertState: "SUPPRESSED",
    primaryReasonCode: "NOT_APPLICABLE_SUPPRESSED",
    sourceAssembly: {
      ...ready.sourceAssembly,
      planState: "NOT_APPLICABLE",
      direction: "NONE",
      primaryReasonCode: "TRADE_PLAN_NOT_APPLICABLE",
    },
    candidate: null,
  });
}

function deliveredReport(
  reportType: DeterministicScheduledReportType,
): DiscordScheduledReportDeliveryResponse {
  const schedule: Record<DeterministicScheduledReportType, string> = {
    PREMARKET_0925: "09:25",
    OPENING_0935: "09:35",
    OPENING_0945: "09:45",
    UPDATE_1000: "10:00",
  };
  return DiscordScheduledReportDeliveryResponseSchema.parse({
    product: "DISCORD_DETERMINISTIC_SCHEDULED_REPORT_DELIVERY",
    methodologyVersion: "DISCORD_SCHEDULED_REPORT_DELIVERY_V1",
    deliveryState: "DELIVERED",
    primaryReasonCode: "REPORT_DELIVERED",
    reportType,
    attemptedAt: NOW.toISOString(),
    deliveredAt: NOW.toISOString(),
    providerStatusCode: 200,
    providerRequestAttempted: true,
    report: {
      product: "SPY_ZERO_DTE_DETERMINISTIC_SCHEDULED_REPORT",
      methodologyVersion: "SCHEDULED_REPORT_V1",
      reportType,
      scheduleReferenceEasternTime: schedule[reportType],
      currentMarketDate: "2026-07-20",
      generatedAt: NOW.toISOString(),
      engineState: "AVAILABLE",
      reportState: "INFORMATIONAL",
      primaryReasonCode: "NOT_APPLICABLE_SUMMARY",
      title: "SPY deterministic report",
      headline: "No applicable plan for the current session state.",
      direction: "NONE",
      checklistItemCount: 5,
      warningCount: 0,
    },
    disclosures: {
      webhookUrlReturned: false,
      webhookTokenReturned: false,
      providerBodyReturned: false,
      explicitDeliveryOnly: true,
      noAutomaticSchedule: true,
      noDatabasePersistence: true,
      deterministicSourceOnly: true,
      noLlmGeneration: true,
      noPrivateAccountData: true,
      noOrderExecution: true,
      mentionsDisabled: true,
    },
    methodology: {
      sourceProduct: "SPY_ZERO_DTE_DETERMINISTIC_SCHEDULED_REPORT",
      sourceMethodology: "SCHEDULED_REPORT_V1",
      deliveryTrigger: "EXPLICIT_POST_ONLY",
      providerConfirmationMethod: "DISCORD_WAIT_TRUE_HTTP_SUCCESS",
      persistenceMethod: "NONE",
      schedulerMethod: "NONE",
      languageModelMethod: "NONE",
    },
  });
}

class FakeRepository implements BackendAutomationRepository {
  settings: BackendAutomationSettingsRow = {
    ...DEFAULT_BACKEND_AUTOMATION_SETTINGS,
    enabled: true,
    updatedAt: NOW,
  };
  runtime: BackendAutomationRuntimeRow = {
    leaseOwner: null,
    leaseExpiresAt: null,
    lastHeartbeatAt: null,
    lastTickAt: null,
    lastTradePlanEvaluatedAt: null,
    lastTradePlanOutcome: null,
    lastTradePlanReasonCode: null,
    lastScheduledEvaluatedAt: null,
    lastScheduledOutcome: null,
    lastScheduledReasonCode: null,
    lastErrorCode: null,
    tradePlanTransitionState: createEmptyTradePlanAlertTransitionMemoryState(),
  };
  allowLease = true;
  released = false;
  renewed = 0;
  tickUpdates = 0;
  deliveryKeys = new Map<string, "DELIVERED" | "AMBIGUOUS">();
  logs: BackendAutomationDeliveryLogRow[] = [];
  tradeStatusWrites: Array<Record<string, unknown>> = [];
  scheduledStatusWrites: Array<Record<string, unknown>> = [];

  async getOrCreateSettings(): Promise<BackendAutomationSettingsRow> {
    return this.settings;
  }
  async updateSettings(
    _userId: string,
    row: BackendAutomationSettingsRow,
  ): Promise<BackendAutomationSettingsRow> {
    this.settings = row;
    return row;
  }
  async getOrCreateRuntime(): Promise<BackendAutomationRuntimeRow> {
    return this.runtime;
  }
  async acquireLease(args: {
    owner: string;
    now: Date;
    expiresAt: Date;
  }): Promise<BackendAutomationRuntimeRow | null> {
    if (!this.allowLease) return null;
    this.runtime = {
      ...this.runtime,
      leaseOwner: args.owner,
      leaseExpiresAt: args.expiresAt,
      lastHeartbeatAt: args.now,
    };
    return this.runtime;
  }
  async renewLease(): Promise<void> {
    this.renewed += 1;
  }
  async releaseLease(): Promise<void> {
    this.released = true;
  }
  async updateTick(_userId: string, _owner: string, tickAt: Date): Promise<void> {
    this.tickUpdates += 1;
    this.runtime.lastTickAt = tickAt;
  }
  async updateTradePlanStatus(args: {
    evaluatedAt: Date;
    outcome: string;
    reasonCode: string;
    transitionState?: unknown;
  }): Promise<void> {
    this.tradeStatusWrites.push(args);
    this.runtime.lastTradePlanEvaluatedAt = args.evaluatedAt;
    this.runtime.lastTradePlanOutcome = args.outcome;
    this.runtime.lastTradePlanReasonCode = args.reasonCode;
    if (args.transitionState) {
      this.runtime.tradePlanTransitionState = args.transitionState;
    }
  }
  async updateScheduledStatus(args: {
    evaluatedAt: Date;
    outcome: string;
    reasonCode: string;
  }): Promise<void> {
    this.scheduledStatusWrites.push(args);
    this.runtime.lastScheduledEvaluatedAt = args.evaluatedAt;
    this.runtime.lastScheduledOutcome = args.outcome;
    this.runtime.lastScheduledReasonCode = args.reasonCode;
  }
  async hasDeliveryKey(
    _userId: string,
    category: BackendAutomationDeliveryCategory,
    deliveryKey: string,
  ): Promise<"DELIVERED" | "AMBIGUOUS" | null> {
    return this.deliveryKeys.get(`${category}|${deliveryKey}`) ?? null;
  }
  async commitDeliveryKey(args: {
    category: BackendAutomationDeliveryCategory;
    deliveryKey: string;
    commitment: "DELIVERED" | "AMBIGUOUS";
  }): Promise<void> {
    this.deliveryKeys.set(
      `${args.category}|${args.deliveryKey}`,
      args.commitment,
    );
  }
  async insertDeliveryLog(
    _userId: string,
    entry: DeliveryLogInsert,
  ): Promise<void> {
    this.logs.unshift({
      id: `log-${this.logs.length + 1}`,
      category: entry.category,
      triggerMode: "BACKEND_SCHEDULER",
      deliveryKey: entry.deliveryKey,
      deliveryState: entry.deliveryState,
      reasonCode: entry.reasonCode,
      providerStatusCode: entry.providerStatusCode,
      providerRequestAttempted: entry.providerRequestAttempted,
      transitionType: entry.transitionType,
      reportType: entry.reportType,
      attemptedAt: entry.attemptedAt,
    });
  }
  async listDeliveryLogs(): Promise<BackendAutomationDeliveryLogRow[]> {
    return this.logs;
  }
}

function dependencies(
  repository: FakeRepository,
  overrides: Partial<BackendAutomationDependencies> = {},
): BackendAutomationDependencies {
  return {
    databaseConfigured: () => true,
    databaseReachable: async () => true,
    getUserId: async () => USER_ID,
    repository,
    getWebhookConfig: () => ({
      status: "valid",
      webhookUrl: "https://discord.com/api/webhooks/123/token",
    }),
    getCandidate: async () => candidateSuppressed(),
    getSchedule: () =>
      evaluateSpyZeroDteScheduledReportSchedule(
        Date.parse("2026-07-20T13:31:00.000Z"),
      ),
    sendScheduledReport: async ({ reportType }) => deliveredReport(reportType),
    fetch: async () => new Response(null, { status: 204 }),
    now: () => NOW,
    providerTimeoutMs: 1_000,
    getMarketDate: () => "2026-07-20",
    log: () => undefined,
    ...overrides,
  };
}

const tests: Array<[string, () => void | Promise<void>]> = [];
function test(name: string, fn: () => void | Promise<void>): void {
  tests.push([name, fn]);
}

test("default automation is disabled and both categories are selected", () => {
  assert.deepEqual(DEFAULT_BACKEND_AUTOMATION_SETTINGS, {
    enabled: false,
    tradePlanAlertsEnabled: true,
    scheduledReportsEnabled: true,
    cadenceSeconds: 30,
    updatedAt: null,
  });
});

test("settings schema rejects enabled automation with no category", () => {
  assert.equal(
    BackendAutomationSettingsUpdateRequestSchema.safeParse({
      enabled: true,
      tradePlanAlertsEnabled: false,
      scheduledReportsEnabled: false,
      cadenceSeconds: 30,
    }).success,
    false,
  );
});

test("settings response exposes persistent safety disclosures", () => {
  const response = buildBackendAutomationSettingsResponse(
    { ...DEFAULT_BACKEND_AUTOMATION_SETTINGS, updatedAt: NOW },
    NOW,
  );
  assert.equal(response.methodologyVersion, "BACKEND_AUTOMATION_V1");
  assert.equal(response.disclosures.persistentSettings, true);
  assert.equal(response.disclosures.noOrderExecution, true);
});

test("cadence is due without a previous tick", () => {
  assert.equal(
    isAutomationTickDue({ now: NOW, lastTickAt: null, cadenceSeconds: 60 }),
    true,
  );
});

test("cadence boundary is start-inclusive", () => {
  assert.equal(
    isAutomationTickDue({
      now: NOW,
      lastTickAt: new Date(NOW.getTime() - 30_000),
      cadenceSeconds: 30,
    }),
    true,
  );
});

test("fresh heartbeat is not stale", () => {
  assert.equal(
    isHeartbeatStale(
      new Date(NOW.getTime() - BACKEND_AUTOMATION_HEARTBEAT_STALE_SECONDS * 1_000),
      NOW,
    ),
    false,
  );
});

test("missing heartbeat is stale", () => {
  assert.equal(isHeartbeatStale(null, NOW), true);
});

test("invalid persisted transition state fails closed to empty", () => {
  assert.deepEqual(
    parsePersistentTradePlanTransitionState({ activeCandidate: "bad" }),
    createEmptyTradePlanAlertTransitionMemoryState(),
  );
});

test("valid persisted transition state is retained", () => {
  const state = {
    marketDate: "2026-07-20",
    activeCandidate: {
      deduplicationKey: "key",
      category: "PLAN_READY",
      severity: "OPPORTUNITY",
      direction: "CALLS",
    },
    activeSinceMs: NOW.getTime(),
    lastClearedCandidate: null,
    lastClearedAtMs: null,
    consecutiveMissingCandidatePolls: 0,
    emittedTransitionFingerprints: [],
    activeEpisodeId: "SPY|2026-07-20|EPISODE_1",
    lastClearedEpisodeId: null,
    nextEpisodeSequence: 1,
  };
  assert.deepEqual(parsePersistentTradePlanTransitionState(state), state);
});

test("scheduled report key is date and report scoped", () => {
  assert.equal(
    scheduledReportDeliveryKey("2026-07-20", "PREMARKET_0925"),
    "SPY|2026-07-20|PREMARKET_0925",
  );
});

test("status is stopped when persistent settings are disabled", () => {
  const response = buildBackendAutomationStatusResponse({
    settings: DEFAULT_BACKEND_AUTOMATION_SETTINGS,
    runtime: null,
    calculatedAt: NOW,
    localLeaseOwner: OWNER,
  });
  assert.equal(response.runtimeState, "STOPPED");
});

test("status is active only for the local unexpired lease", () => {
  const response = buildBackendAutomationStatusResponse({
    settings: { ...DEFAULT_BACKEND_AUTOMATION_SETTINGS, enabled: true },
    runtime: {
      ...new FakeRepository().runtime,
      leaseOwner: OWNER,
      leaseExpiresAt: new Date(NOW.getTime() + 10_000),
      lastHeartbeatAt: NOW,
    },
    calculatedAt: NOW,
    localLeaseOwner: OWNER,
  });
  assert.equal(response.runtimeState, "ACTIVE");
});

test("another healthy lease is standby", () => {
  const response = buildBackendAutomationStatusResponse({
    settings: { ...DEFAULT_BACKEND_AUTOMATION_SETTINGS, enabled: true },
    runtime: {
      ...new FakeRepository().runtime,
      leaseOwner: "other",
      leaseExpiresAt: new Date(NOW.getTime() + 10_000),
      lastHeartbeatAt: NOW,
    },
    calculatedAt: NOW,
    localLeaseOwner: OWNER,
  });
  assert.equal(response.runtimeState, "STANDBY");
});

test("old heartbeat is stale", () => {
  const response = buildBackendAutomationStatusResponse({
    settings: { ...DEFAULT_BACKEND_AUTOMATION_SETTINGS, enabled: true },
    runtime: {
      ...new FakeRepository().runtime,
      lastHeartbeatAt: new Date(NOW.getTime() - 60_000),
    },
    calculatedAt: NOW,
    localLeaseOwner: OWNER,
  });
  assert.equal(response.runtimeState, "STALE");
});

test("history is newest-first and payload-free", () => {
  const response = buildBackendAutomationHistoryResponse(
    [
      {
        id: "1",
        category: "TRADE_PLAN_ALERT",
        triggerMode: "BACKEND_SCHEDULER",
        deliveryKey: "key",
        deliveryState: "DELIVERED",
        reasonCode: "ALERT_DELIVERED",
        providerStatusCode: 204,
        providerRequestAttempted: true,
        transitionType: "INITIAL_CANDIDATE",
        reportType: null,
        attemptedAt: NOW,
      },
    ],
    NOW,
  );
  assert.equal(response.entries[0]?.deliveryState, "DELIVERED");
  assert.equal(response.disclosures.payloadBodyExcluded, true);
});

test("disabled tick releases any local lease", async () => {
  const repository = new FakeRepository();
  repository.settings.enabled = false;
  const result = await runBackendAutomationTickWithDependencies({
    dependencies: dependencies(repository),
    owner: OWNER,
    force: true,
  });
  assert.equal(result.disabled, true);
  assert.equal(repository.released, true);
});

test("lease denial prevents every evaluation", async () => {
  const repository = new FakeRepository();
  repository.allowLease = false;
  let candidates = 0;
  const result = await runBackendAutomationTickWithDependencies({
    dependencies: dependencies(repository, {
      getCandidate: async () => {
        candidates += 1;
        return candidateReady();
      },
    }),
    owner: OWNER,
    force: true,
  });
  assert.equal(result.leaseAcquired, false);
  assert.equal(candidates, 0);
});

test("not-due tick only renews the lease", async () => {
  const repository = new FakeRepository();
  repository.runtime.lastTickAt = new Date(NOW.getTime() - 1_000);
  const result = await runBackendAutomationTickWithDependencies({
    dependencies: dependencies(repository),
    owner: OWNER,
    force: false,
  });
  assert.equal(result.leaseAcquired, true);
  assert.equal(repository.renewed, 1);
  assert.equal(repository.tickUpdates, 0);
});

test("suppressed candidate performs no provider request", async () => {
  const repository = new FakeRepository();
  repository.settings.scheduledReportsEnabled = false;
  let fetches = 0;
  const result = await runBackendAutomationTickWithDependencies({
    dependencies: dependencies(repository, {
      fetch: async () => {
        fetches += 1;
        return new Response(null, { status: 204 });
      },
    }),
    owner: OWNER,
    force: true,
  });
  assert.equal(fetches, 0);
  assert.equal(result.tradePlanAlerts.outcome, "NO_DELIVERY");
  assert.equal(repository.logs.length, 0);
});

test("routine waiting transition is captured but not delivered", async () => {
  const repository = new FakeRepository();
  repository.settings.scheduledReportsEnabled = false;
  let fetches = 0;
  const result = await runBackendAutomationTickWithDependencies({
    dependencies: dependencies(repository, {
      getCandidate: async () => candidateWaiting(),
      fetch: async () => {
        fetches += 1;
        return new Response(null, { status: 204 });
      },
    }),
    owner: OWNER,
    force: true,
  });
  assert.equal(fetches, 0);
  assert.equal(result.tradePlanAlerts.outcome, "NO_DELIVERY");
  assert.equal(
    result.tradePlanAlerts.reasonCode,
    "NON_ACTIONABLE_TRANSITION_SUPPRESSED",
  );
  assert.equal(
    parsePersistentTradePlanTransitionState(
      repository.runtime.tradePlanTransitionState,
    ).activeCandidate?.category,
    "WAITING_FOR_TRIGGER",
  );
});

test("delivered trade transition commits key state and audit", async () => {
  const repository = new FakeRepository();
  repository.settings.scheduledReportsEnabled = false;
  const result = await runBackendAutomationTickWithDependencies({
    dependencies: dependencies(repository, {
      getCandidate: async () => candidateReady(),
    }),
    owner: OWNER,
    force: true,
  });
  assert.equal(result.tradePlanAlerts.outcome, "DELIVERED");
  assert.equal(repository.logs[0]?.category, "TRADE_PLAN_ALERT");
  assert.equal(repository.deliveryKeys.size, 1);
  assert.equal(
    parsePersistentTradePlanTransitionState(
      repository.runtime.tradePlanTransitionState,
    ).activeCandidate?.category,
    "PLAN_READY",
  );
});

test("persisted trade delivery suppresses provider retry", async () => {
  const repository = new FakeRepository();
  repository.settings.scheduledReportsEnabled = false;
  const first = dependencies(repository, {
    getCandidate: async () => candidateReady(),
  });
  await runBackendAutomationTickWithDependencies({
    dependencies: first,
    owner: OWNER,
    force: true,
  });
  repository.runtime.tradePlanTransitionState =
    createEmptyTradePlanAlertTransitionMemoryState();
  let fetches = 0;
  const result = await runBackendAutomationTickWithDependencies({
    dependencies: dependencies(repository, {
      getCandidate: async () => candidateReady(),
      fetch: async () => {
        fetches += 1;
        return new Response(null, { status: 204 });
      },
    }),
    owner: OWNER,
    force: true,
  });
  assert.equal(fetches, 0);
  assert.equal(result.tradePlanAlerts.outcome, "SUPPRESSED");
});

test("ambiguous trade outcome commits a persistent suppression key", async () => {
  const repository = new FakeRepository();
  repository.settings.scheduledReportsEnabled = false;
  const result = await runBackendAutomationTickWithDependencies({
    dependencies: dependencies(repository, {
      getCandidate: async () => candidateReady(),
      fetch: async () => {
        throw new TypeError("network");
      },
    }),
    owner: OWNER,
    force: true,
  });
  assert.equal(result.tradePlanAlerts.outcome, "AMBIGUOUS");
  assert.equal([...repository.deliveryKeys.values()][0], "AMBIGUOUS");
  assert.equal(repository.logs[0]?.deliveryState, "AMBIGUOUS");
});

test("disabled trade-plan delivery still evaluates one capture-only candidate", async () => {
  const repository = new FakeRepository();
  repository.settings.tradePlanAlertsEnabled = false;
  repository.settings.scheduledReportsEnabled = false;
  let candidateEvaluations = 0;
  let providerRequests = 0;
  const result = await runBackendAutomationTickWithDependencies({
    dependencies: dependencies(repository, {
      getCandidate: async () => {
        candidateEvaluations += 1;
        return candidateReady();
      },
      fetch: async () => {
        providerRequests += 1;
        return new Response(null, { status: 204 });
      },
    }),
    owner: OWNER,
    force: true,
  });
  assert.equal(candidateEvaluations, 1);
  assert.equal(providerRequests, 0);
  assert.equal(result.tradePlanAlerts.outcome, "NO_DELIVERY");
  assert.equal(result.tradePlanAlerts.reasonCode, "POINT_IN_TIME_CAPTURE_ONLY");
  assert.equal(repository.runtime.lastTradePlanReasonCode, "POINT_IN_TIME_CAPTURE_ONLY");
});

test("non-due schedule performs no report delivery", async () => {
  const repository = new FakeRepository();
  repository.settings.tradePlanAlertsEnabled = false;
  let sends = 0;
  const result = await runBackendAutomationTickWithDependencies({
    dependencies: dependencies(repository, {
      getSchedule: () =>
        evaluateSpyZeroDteScheduledReportSchedule(
          Date.parse("2026-07-20T13:31:00.000Z"),
        ),
      sendScheduledReport: async ({ reportType }) => {
        sends += 1;
        return deliveredReport(reportType);
      },
    }),
    owner: OWNER,
    force: true,
  });
  assert.equal(sends, 0);
  assert.equal(result.scheduledReports.outcome, "NO_DELIVERY");
});

test("due scheduled report commits one delivery key and audit row", async () => {
  const repository = new FakeRepository();
  repository.settings.tradePlanAlertsEnabled = false;
  const result = await runBackendAutomationTickWithDependencies({
    dependencies: dependencies(repository, {
      getSchedule: () =>
        evaluateSpyZeroDteScheduledReportSchedule(
          Date.parse("2026-07-20T13:25:00.000Z"),
        ),
    }),
    owner: OWNER,
    force: true,
  });
  assert.equal(result.scheduledReports.outcome, "DELIVERED");
  assert.equal(repository.logs[0]?.category, "SCHEDULED_REPORT");
  assert.equal(repository.logs[0]?.reportType, "PREMARKET_0925");
  assert.equal(repository.deliveryKeys.size, 1);
});

test("persisted scheduled-report key suppresses duplicate", async () => {
  const repository = new FakeRepository();
  repository.settings.tradePlanAlertsEnabled = false;
  const key = scheduledReportDeliveryKey("2026-07-20", "PREMARKET_0925");
  repository.deliveryKeys.set(`SCHEDULED_REPORT|${key}`, "DELIVERED");
  let sends = 0;
  const result = await runBackendAutomationTickWithDependencies({
    dependencies: dependencies(repository, {
      getSchedule: () =>
        evaluateSpyZeroDteScheduledReportSchedule(
          Date.parse("2026-07-20T13:25:00.000Z"),
        ),
      sendScheduledReport: async ({ reportType }) => {
        sends += 1;
        return deliveredReport(reportType);
      },
    }),
    owner: OWNER,
    force: true,
  });
  assert.equal(sends, 0);
  assert.equal(result.scheduledReports.outcome, "SUPPRESSED");
});

test("database-not-configured settings response fails safely", async () => {
  const repository = new FakeRepository();
  const response = await getBackendAutomationSettingsWithDependencies(
    dependencies(repository, { databaseConfigured: () => false }),
  );
  assert.equal(response.engineState, "UNAVAILABLE");
  assert.equal(response.primaryReasonCode, "DATABASE_NOT_CONFIGURED");
});

test("run once honors disabled persistent settings", async () => {
  const repository = new FakeRepository();
  repository.settings.enabled = false;
  const response = await runBackendAutomationOnceWithDependencies(
    dependencies(repository),
    OWNER,
  );
  assert.equal(response.primaryReasonCode, "BACKEND_AUTOMATION_DISABLED");
});

test("scheduler does not touch the database when DATABASE_URL is absent", async () => {
  const repository = new FakeRepository();
  let userLookups = 0;
  const scheduler = startBackendAutomationScheduler(
    dependencies(repository, {
      databaseConfigured: () => false,
      getUserId: async () => {
        userLookups += 1;
        return USER_ID;
      },
    }),
    OWNER,
  );
  await scheduler.trigger();
  scheduler.stop();
  assert.equal(userLookups, 0);
});

test("route is no-store and exposes settings status history and run-once", () => {
  const source = readFileSync(
    resolve(process.cwd(), "apps/server/src/routes/backend-automation.routes.ts"),
    "utf8",
  );
  assert.match(source, /Cache-Control", "no-store"/);
  assert.match(source, /router\.get\("\/settings"/);
  assert.match(source, /router\.patch\("\/settings"/);
  assert.match(source, /router\.get\("\/status"/);
  assert.match(source, /router\.get\("\/history"/);
  assert.match(source, /router\.post\("\/run-once"/);
  assert.match(source, /BACKEND_AUTOMATION_ORIGIN_FORBIDDEN/);
});

test("Prisma schema and migration persist automation settings lease keys and audit", () => {
  const schema = readFileSync(
    resolve(process.cwd(), "apps/server/prisma/schema.prisma"),
    "utf8",
  );
  const migration = readFileSync(
    resolve(
      process.cwd(),
      "apps/server/prisma/migrations/20260720150000_add_persistent_backend_automation/migration.sql",
    ),
    "utf8",
  );

  assert.match(schema, /backendAutomationEnabled\s+Boolean\s+@default\(false\)/);
  assert.match(schema, /backendTradePlanAlertsEnabled\s+Boolean\s+@default\(true\)/);
  assert.match(schema, /backendScheduledReportsEnabled\s+Boolean\s+@default\(true\)/);
  assert.match(schema, /backendAutomationCadenceSeconds\s+Int\s+@default\(30\)/);
  assert.match(schema, /model BackendAutomationRuntime/);
  assert.match(schema, /model BackendAutomationDeliveryKey/);
  assert.match(schema, /model BackendAutomationDeliveryLog/);
  assert.match(migration, /CREATE TABLE "BackendAutomationRuntime"/);
  assert.match(migration, /CREATE TABLE "BackendAutomationDeliveryKey"/);
  assert.match(migration, /CREATE TABLE "BackendAutomationDeliveryLog"/);
  assert.match(
    migration,
    /BackendAutomationDeliveryKey_userId_category_deliveryKey_key/,
  );
  assert.doesNotMatch(
    migration,
    /"id" TEXT NOT NULL DEFAULT 'SPY_DISCORD_AUTOMATION'/,
  );
});

test("scheduler is started and stopped with the backend process", () => {
  const source = readFileSync(
    resolve(process.cwd(), "apps/server/src/index.ts"),
    "utf8",
  );
  assert.match(source, /startBackendAutomationScheduler\(\)/);
  assert.match(source, /backendAutomationScheduler\.stop\(\)/);
});

async function main(): Promise<void> {
  let passed = 0;
  for (const [name, fn] of tests) {
    try {
      resetDiscordTradePlanTransitionFingerprintClaimsForTests();
      await fn();
      passed += 1;
      console.log(`✓ ${name}`);
    } catch (error) {
      console.error(`✗ ${name}`);
      throw error;
    }
  }
  console.log(`\nPersistent backend automation tests: ${passed} passed, 0 failed`);
}

void main();
