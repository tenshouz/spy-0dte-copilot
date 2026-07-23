import {
  SpyZeroDteTradePlanAlertTransitionResponseSchema,
  type SpyZeroDteTradePlanAlertCandidateResponse,
  type SpyZeroDteTradePlanAlertTransitionResponse,
  type TradePlanAlertTransitionCandidateSummary,
  type TradePlanAlertTransitionEvent,
  type TradePlanAlertTransitionPrimaryReasonCode,
} from "@spy-copilot/shared";

export const TRADE_PLAN_ALERT_TRANSITION_METHODOLOGY_VERSION =
  "TRADE_PLAN_ALERT_TRANSITION_V1" as const;

export const TRADE_PLAN_ALERT_REAPPEARANCE_COOLDOWN_MS = 60_000;
export const TRADE_PLAN_ALERT_CLEAR_CONFIRMATION_POLLS = 3;
export const TRADE_PLAN_ALERT_FINGERPRINT_HISTORY_LIMIT = 100;

export interface TradePlanAlertTransitionMemoryState {
  marketDate: string | null;
  activeCandidate: TradePlanAlertTransitionCandidateSummary | null;
  activeSinceMs: number | null;
  lastClearedCandidate: TradePlanAlertTransitionCandidateSummary | null;
  lastClearedAtMs: number | null;
  consecutiveMissingCandidatePolls: number;
  emittedTransitionFingerprints: string[];
  activeEpisodeId: string | null;
  lastClearedEpisodeId: string | null;
  nextEpisodeSequence: number;
}

export interface TradePlanAlertTransitionEvaluation {
  response: SpyZeroDteTradePlanAlertTransitionResponse;
  nextState: TradePlanAlertTransitionMemoryState;
}

const DISCLOSURES = {
  processMemoryOnly: true as const,
  resetsOnProcessRestart: true as const,
  noDatabasePersistence: true as const,
  noAutomaticScheduler: true as const,
  noNotificationDelivery: true as const,
  noPrivateAccountData: true as const,
  noOrderExecution: true as const,
};

function methodology(cooldownMs: number) {
  return {
    sourceProduct:
      "SPY_ZERO_DTE_DETERMINISTIC_TRADE_PLAN_ALERT_CANDIDATE" as const,
    sourceMethodology: "TRADE_PLAN_ALERT_CANDIDATE_V2" as const,
    evaluationScope: "CURRENT_CANDIDATE_VS_PROCESS_MEMORY" as const,
    duplicateSuppressionMethod: "ACTIVE_CANDIDATE_KEY_EQUALITY" as const,
    reappearanceMethod: "SAME_KEY_AFTER_CLEAR_AND_COOLDOWN" as const,
    candidateChangeMethod: "DEDUPLICATION_KEY_CHANGE" as const,
    marketDateBoundaryMethod: "RESET_WITHOUT_CARRYOVER" as const,
    reappearanceCooldownMilliseconds: cooldownMs,
    persistenceMethod: "NONE" as const,
    schedulerMethod: "NONE" as const,
    deliveryMethod: "NONE" as const,
  };
}

export function createEmptyTradePlanAlertTransitionMemoryState(
  marketDate: string | null = null,
): TradePlanAlertTransitionMemoryState {
  return {
    marketDate,
    activeCandidate: null,
    activeSinceMs: null,
    lastClearedCandidate: null,
    lastClearedAtMs: null,
    consecutiveMissingCandidatePolls: 0,
    emittedTransitionFingerprints: [],
    activeEpisodeId: null,
    lastClearedEpisodeId: null,
    nextEpisodeSequence: 0,
  };
}

export function cloneTradePlanAlertTransitionMemoryState(
  state: TradePlanAlertTransitionMemoryState,
): TradePlanAlertTransitionMemoryState {
  return {
    marketDate: state.marketDate,
    activeCandidate: state.activeCandidate ? { ...state.activeCandidate } : null,
    activeSinceMs: state.activeSinceMs,
    lastClearedCandidate: state.lastClearedCandidate
      ? { ...state.lastClearedCandidate }
      : null,
    lastClearedAtMs: state.lastClearedAtMs,
    consecutiveMissingCandidatePolls:
      Number.isInteger(state.consecutiveMissingCandidatePolls) &&
      state.consecutiveMissingCandidatePolls >= 0
        ? state.consecutiveMissingCandidatePolls
        : 0,
    emittedTransitionFingerprints: Array.isArray(
      state.emittedTransitionFingerprints,
    )
      ? [...state.emittedTransitionFingerprints].slice(
          -TRADE_PLAN_ALERT_FINGERPRINT_HISTORY_LIMIT,
        )
      : [],
    activeEpisodeId:
      typeof state.activeEpisodeId === "string" && state.activeEpisodeId.length > 0
        ? state.activeEpisodeId
        : null,
    lastClearedEpisodeId:
      typeof state.lastClearedEpisodeId === "string" &&
      state.lastClearedEpisodeId.length > 0
        ? state.lastClearedEpisodeId
        : null,
    nextEpisodeSequence:
      Number.isInteger(state.nextEpisodeSequence) && state.nextEpisodeSequence >= 0
        ? state.nextEpisodeSequence
        : 0,
  };
}

function candidateSummary(
  source: SpyZeroDteTradePlanAlertCandidateResponse,
): TradePlanAlertTransitionCandidateSummary | null {
  if (source.alertState !== "CANDIDATE" || source.candidate === null) return null;
  return {
    deduplicationKey: source.candidate.deduplicationKey,
    category: source.candidate.category,
    severity: source.candidate.severity,
    direction: source.candidate.direction,
  };
}

function sourceSummary(source: SpyZeroDteTradePlanAlertCandidateResponse) {
  return {
    product: source.product,
    methodologyVersion: source.methodologyVersion,
    currentMarketDate: source.currentMarketDate,
    calculatedAt: source.calculatedAt,
    engineState: source.engineState,
    alertState: source.alertState,
    primaryReasonCode: source.primaryReasonCode,
    warningCode: source.warningCode,
    candidate: candidateSummary(source),
  };
}

function stateChanged(
  previous: TradePlanAlertTransitionMemoryState,
  next: TradePlanAlertTransitionMemoryState,
): boolean {
  return JSON.stringify(previous) !== JSON.stringify(next);
}

function transitionFingerprint(
  marketDate: string,
  episodeId: string,
  transitionType: TradePlanAlertTransitionEvent["transitionType"],
  previousCandidate: TradePlanAlertTransitionCandidateSummary | null,
  currentCandidate: TradePlanAlertTransitionCandidateSummary | null,
): string {
  return [
    "SPY",
    marketDate,
    episodeId,
    transitionType,
    previousCandidate?.deduplicationKey ?? "NONE",
    currentCandidate?.deduplicationKey ?? "NONE",
  ].join("|");
}


function allocateEpisodeId(
  state: TradePlanAlertTransitionMemoryState,
  marketDate: string,
): string {
  state.nextEpisodeSequence += 1;
  return `SPY|${marketDate}|EPISODE_${state.nextEpisodeSequence}`;
}

function fingerprintAlreadyEmitted(
  state: TradePlanAlertTransitionMemoryState,
  fingerprint: string,
): boolean {
  return state.emittedTransitionFingerprints.includes(fingerprint);
}

function rememberEmittedFingerprint(
  state: TradePlanAlertTransitionMemoryState,
  fingerprint: string,
): void {
  state.emittedTransitionFingerprints = [
    ...state.emittedTransitionFingerprints.filter((item) => item !== fingerprint),
    fingerprint,
  ].slice(-TRADE_PLAN_ALERT_FINGERPRINT_HISTORY_LIMIT);
}

function resetMissingCandidatePolls(
  state: TradePlanAlertTransitionMemoryState,
): void {
  state.consecutiveMissingCandidatePolls = 0;
}

function buildEvent(
  marketDate: string,
  episodeId: string,
  transitionType: TradePlanAlertTransitionEvent["transitionType"],
  previousCandidate: TradePlanAlertTransitionCandidateSummary | null,
  currentCandidate: TradePlanAlertTransitionCandidateSummary | null,
  source: SpyZeroDteTradePlanAlertCandidateResponse,
): TradePlanAlertTransitionEvent {
  const currentPayload = source.candidate;

  switch (transitionType) {
    case "INITIAL_CANDIDATE":
      if (currentCandidate === null || currentPayload === null) {
        throw new Error("INITIAL_CANDIDATE requires a current candidate");
      }
      return {
        transitionFingerprint: transitionFingerprint(
          marketDate,
          episodeId,
          transitionType,
          null,
          currentCandidate,
        ),
        transitionType,
        severity: currentCandidate.severity,
        title: currentPayload.title,
        message: currentPayload.message,
        previousCandidate: null,
        currentCandidate,
      };

    case "CANDIDATE_CHANGED":
      if (
        previousCandidate === null ||
        currentCandidate === null ||
        currentPayload === null
      ) {
        throw new Error("CANDIDATE_CHANGED requires previous and current candidates");
      }
      const readyWithdrawn =
        previousCandidate.category === "PLAN_READY" &&
        currentCandidate.category !== "PLAN_READY";
      const becameReady = currentCandidate.category === "PLAN_READY";
      return {
        transitionFingerprint: transitionFingerprint(
          marketDate,
          episodeId,
          transitionType,
          previousCandidate,
          currentCandidate,
        ),
        transitionType,
        severity: readyWithdrawn
          ? "WARNING"
          : currentCandidate.severity,
        title: readyWithdrawn
          ? "Qualified trade plan no longer active"
          : becameReady
            ? currentPayload.title
            : "Trade plan alert state changed",
        message: readyWithdrawn
          ? `The previously qualified ${previousCandidate.direction} plan is no longer READY. Current state: ${currentCandidate.category}. Revalidate the dashboard before considering any new entry.`
          : becameReady
            ? currentPayload.message
            : `The deterministic alert state changed from ${previousCandidate.category} to ${currentCandidate.category}. ${currentPayload.message}`,
        previousCandidate,
        currentCandidate,
      };

    case "CANDIDATE_CLEARED":
      if (previousCandidate === null) {
        throw new Error("CANDIDATE_CLEARED requires a previous candidate");
      }
      return {
        transitionFingerprint: transitionFingerprint(
          marketDate,
          episodeId,
          transitionType,
          previousCandidate,
          null,
        ),
        transitionType,
        severity: "INFO",
        title: "Trade plan alert candidate cleared",
        message: `The previously active ${previousCandidate.category} candidate is no longer present in the current deterministic snapshot. No notification or order action was performed.`,
        previousCandidate,
        currentCandidate: null,
      };

    case "CANDIDATE_REAPPEARED":
      if (
        previousCandidate === null ||
        currentCandidate === null ||
        currentPayload === null
      ) {
        throw new Error("CANDIDATE_REAPPEARED requires previous and current candidates");
      }
      return {
        transitionFingerprint: transitionFingerprint(
          marketDate,
          episodeId,
          transitionType,
          previousCandidate,
          currentCandidate,
        ),
        transitionType,
        severity: currentCandidate.severity,
        title: "Trade plan alert candidate reappeared",
        message: `The ${currentCandidate.category} candidate remained present beyond the reappearance cooldown. ${currentPayload.message}`,
        previousCandidate,
        currentCandidate,
      };
  }
}

interface ResponseInput {
  source: SpyZeroDteTradePlanAlertCandidateResponse | null;
  currentMarketDate: string;
  evaluatedAtMs: number;
  previousState: TradePlanAlertTransitionMemoryState;
  nextState: TradePlanAlertTransitionMemoryState;
  marketDateReset: boolean;
  transitionState: "EMIT" | "SUPPRESSED" | "UNAVAILABLE";
  primaryReasonCode: TradePlanAlertTransitionPrimaryReasonCode;
  event: TradePlanAlertTransitionEvent | null;
  cooldownMs: number;
  remainingCooldownMs?: number;
}

function buildResponse(input: ResponseInput): SpyZeroDteTradePlanAlertTransitionResponse {
  const source = input.source;
  return SpyZeroDteTradePlanAlertTransitionResponseSchema.parse({
    symbol: "SPY",
    product: "SPY_ZERO_DTE_DETERMINISTIC_TRADE_PLAN_ALERT_TRANSITION",
    methodologyVersion: TRADE_PLAN_ALERT_TRANSITION_METHODOLOGY_VERSION,
    currentMarketDate: input.currentMarketDate,
    evaluatedAt: new Date(input.evaluatedAtMs).toISOString(),
    engineState:
      input.transitionState === "UNAVAILABLE"
        ? "UNAVAILABLE"
        : source?.engineState ?? "UNAVAILABLE",
    transitionState: input.transitionState,
    primaryReasonCode: input.primaryReasonCode,
    warningCode: source?.warningCode ?? null,
    sourceCandidate: source ? sourceSummary(source) : null,
    event: input.event,
    cooldown: {
      reappearanceCooldownMilliseconds: input.cooldownMs,
      remainingMilliseconds: input.remainingCooldownMs ?? 0,
    },
    state: {
      storageMethod: "PROCESS_MEMORY_ONLY",
      marketDateBefore: input.previousState.marketDate,
      marketDateAfter: input.nextState.marketDate,
      activeCandidateKeyBefore:
        input.previousState.activeCandidate?.deduplicationKey ?? null,
      activeCandidateKeyAfter:
        input.nextState.activeCandidate?.deduplicationKey ?? null,
      lastClearedCandidateKeyAfter:
        input.nextState.lastClearedCandidate?.deduplicationKey ?? null,
      marketDateReset: input.marketDateReset,
      mutationApplied: stateChanged(input.previousState, input.nextState),
    },
    disclosures: DISCLOSURES,
    methodology: methodology(input.cooldownMs),
  });
}

export function buildUnavailableSpyZeroDteTradePlanAlertTransition(
  currentMarketDate: string,
  evaluatedAtMs: number,
  previousState: TradePlanAlertTransitionMemoryState,
  reason: Extract<
    TradePlanAlertTransitionPrimaryReasonCode,
    "SOURCE_CANDIDATE_INCONSISTENT" | "SOURCE_CANDIDATE_SERVICE_FAILURE"
  >,
  cooldownMs = TRADE_PLAN_ALERT_REAPPEARANCE_COOLDOWN_MS,
): TradePlanAlertTransitionEvaluation {
  const nextState = cloneTradePlanAlertTransitionMemoryState(previousState);
  return {
    response: buildResponse({
      source: null,
      currentMarketDate,
      evaluatedAtMs,
      previousState,
      nextState,
      marketDateReset: false,
      transitionState: "UNAVAILABLE",
      primaryReasonCode: reason,
      event: null,
      cooldownMs,
    }),
    nextState,
  };
}

export function evaluateSpyZeroDteTradePlanAlertTransition(
  source: SpyZeroDteTradePlanAlertCandidateResponse,
  previousMemoryState: TradePlanAlertTransitionMemoryState,
  evaluatedAtMs: number,
  cooldownMs = TRADE_PLAN_ALERT_REAPPEARANCE_COOLDOWN_MS,
): TradePlanAlertTransitionEvaluation {
  const previousState = cloneTradePlanAlertTransitionMemoryState(previousMemoryState);

  if (source.engineState === "UNAVAILABLE" || source.alertState === "UNAVAILABLE") {
    const nextState = cloneTradePlanAlertTransitionMemoryState(previousState);
    return {
      response: buildResponse({
        source,
        currentMarketDate: source.currentMarketDate,
        evaluatedAtMs,
        previousState,
        nextState,
        marketDateReset: false,
        transitionState: "UNAVAILABLE",
        primaryReasonCode: "SOURCE_CANDIDATE_UNAVAILABLE",
        event: null,
        cooldownMs,
      }),
      nextState,
    };
  }

  let nextState = cloneTradePlanAlertTransitionMemoryState(previousState);
  let marketDateReset = false;

  if (nextState.marketDate === null) {
    nextState.marketDate = source.currentMarketDate;
  } else if (nextState.marketDate !== source.currentMarketDate) {
    nextState = createEmptyTradePlanAlertTransitionMemoryState(
      source.currentMarketDate,
    );
    marketDateReset = true;
  }

  const currentCandidate = candidateSummary(source);

  if (currentCandidate !== null) {
    resetMissingCandidatePolls(nextState);

    if (nextState.activeCandidate !== null) {
      if (nextState.activeEpisodeId === null) {
        nextState.activeEpisodeId = allocateEpisodeId(
          nextState,
          source.currentMarketDate,
        );
      }

      if (
        nextState.activeCandidate.deduplicationKey ===
        currentCandidate.deduplicationKey
      ) {
        // Refresh the semantic candidate summary without treating live price,
        // confidence, target, contract quote, or VWAP movement as a new event.
        nextState.activeCandidate = { ...currentCandidate };
        return {
          response: buildResponse({
            source,
            currentMarketDate: source.currentMarketDate,
            evaluatedAtMs,
            previousState,
            nextState,
            marketDateReset,
            transitionState: "SUPPRESSED",
            primaryReasonCode: "ACTIVE_DUPLICATE_SUPPRESSED",
            event: null,
            cooldownMs,
          }),
          nextState,
        };
      }

      const previousCandidate = { ...nextState.activeCandidate };
      const eventEpisodeId = nextState.activeEpisodeId;
      nextState.activeCandidate = { ...currentCandidate };
      nextState.activeSinceMs = evaluatedAtMs;
      nextState.lastClearedCandidate = null;
      nextState.lastClearedAtMs = null;
      nextState.lastClearedEpisodeId = null;

      const event = buildEvent(
        source.currentMarketDate,
        eventEpisodeId,
        "CANDIDATE_CHANGED",
        previousCandidate,
        currentCandidate,
        source,
      );

      // A READY withdrawal ends the completed attempt. The current non-ready
      // state starts a fresh semantic episode so a later requalification may
      // alert once without reusing the prior database delivery key.
      if (
        previousCandidate.category === "PLAN_READY" &&
        currentCandidate.category !== "PLAN_READY"
      ) {
        nextState.activeEpisodeId = allocateEpisodeId(
          nextState,
          source.currentMarketDate,
        );
      }

      if (fingerprintAlreadyEmitted(nextState, event.transitionFingerprint)) {
        return {
          response: buildResponse({
            source,
            currentMarketDate: source.currentMarketDate,
            evaluatedAtMs,
            previousState,
            nextState,
            marketDateReset,
            transitionState: "SUPPRESSED",
            primaryReasonCode: "ACTIVE_DUPLICATE_SUPPRESSED",
            event: null,
            cooldownMs,
          }),
          nextState,
        };
      }

      rememberEmittedFingerprint(nextState, event.transitionFingerprint);
      return {
        response: buildResponse({
          source,
          currentMarketDate: source.currentMarketDate,
          evaluatedAtMs,
          previousState,
          nextState,
          marketDateReset,
          transitionState: "EMIT",
          primaryReasonCode: "CANDIDATE_CHANGED_EMIT",
          event,
          cooldownMs,
        }),
        nextState,
      };
    }

    if (nextState.lastClearedCandidate !== null) {
      const previousCandidate = { ...nextState.lastClearedCandidate };
      const sameSemanticCandidate =
        previousCandidate.deduplicationKey === currentCandidate.deduplicationKey;
      const elapsedSinceClear =
        nextState.lastClearedAtMs === null
          ? Number.POSITIVE_INFINITY
          : Math.max(0, evaluatedAtMs - nextState.lastClearedAtMs);

      if (sameSemanticCandidate && elapsedSinceClear < cooldownMs) {
        nextState.activeCandidate = { ...currentCandidate };
        nextState.activeSinceMs = evaluatedAtMs;
        nextState.activeEpisodeId =
          nextState.lastClearedEpisodeId ??
          allocateEpisodeId(nextState, source.currentMarketDate);
        nextState.lastClearedCandidate = null;
        nextState.lastClearedAtMs = null;
        nextState.lastClearedEpisodeId = null;
        return {
          response: buildResponse({
            source,
            currentMarketDate: source.currentMarketDate,
            evaluatedAtMs,
            previousState,
            nextState,
            marketDateReset,
            transitionState: "SUPPRESSED",
            primaryReasonCode: "ACTIVE_DUPLICATE_SUPPRESSED",
            event: null,
            cooldownMs,
          }),
          nextState,
        };
      }

      const eventEpisodeId = allocateEpisodeId(
        nextState,
        source.currentMarketDate,
      );
      nextState.activeCandidate = { ...currentCandidate };
      nextState.activeSinceMs = evaluatedAtMs;
      nextState.activeEpisodeId = eventEpisodeId;
      nextState.lastClearedCandidate = null;
      nextState.lastClearedAtMs = null;
      nextState.lastClearedEpisodeId = null;

      const event = buildEvent(
        source.currentMarketDate,
        eventEpisodeId,
        sameSemanticCandidate ? "CANDIDATE_REAPPEARED" : "CANDIDATE_CHANGED",
        previousCandidate,
        currentCandidate,
        source,
      );

      if (fingerprintAlreadyEmitted(nextState, event.transitionFingerprint)) {
        return {
          response: buildResponse({
            source,
            currentMarketDate: source.currentMarketDate,
            evaluatedAtMs,
            previousState,
            nextState,
            marketDateReset,
            transitionState: "SUPPRESSED",
            primaryReasonCode: "ACTIVE_DUPLICATE_SUPPRESSED",
            event: null,
            cooldownMs,
          }),
          nextState,
        };
      }

      rememberEmittedFingerprint(nextState, event.transitionFingerprint);
      return {
        response: buildResponse({
          source,
          currentMarketDate: source.currentMarketDate,
          evaluatedAtMs,
          previousState,
          nextState,
          marketDateReset,
          transitionState: "EMIT",
          primaryReasonCode: sameSemanticCandidate
            ? "CANDIDATE_REAPPEARED_EMIT"
            : "CANDIDATE_CHANGED_EMIT",
          event,
          cooldownMs,
        }),
        nextState,
      };
    }

    const eventEpisodeId = allocateEpisodeId(
      nextState,
      source.currentMarketDate,
    );
    nextState.activeCandidate = { ...currentCandidate };
    nextState.activeSinceMs = evaluatedAtMs;
    nextState.activeEpisodeId = eventEpisodeId;

    const event = buildEvent(
      source.currentMarketDate,
      eventEpisodeId,
      "INITIAL_CANDIDATE",
      null,
      currentCandidate,
      source,
    );

    if (fingerprintAlreadyEmitted(nextState, event.transitionFingerprint)) {
      return {
        response: buildResponse({
          source,
          currentMarketDate: source.currentMarketDate,
          evaluatedAtMs,
          previousState,
          nextState,
          marketDateReset,
          transitionState: "SUPPRESSED",
          primaryReasonCode: "ACTIVE_DUPLICATE_SUPPRESSED",
          event: null,
          cooldownMs,
        }),
        nextState,
      };
    }

    rememberEmittedFingerprint(nextState, event.transitionFingerprint);
    return {
      response: buildResponse({
        source,
        currentMarketDate: source.currentMarketDate,
        evaluatedAtMs,
        previousState,
        nextState,
        marketDateReset,
        transitionState: "EMIT",
        primaryReasonCode: "INITIAL_CANDIDATE_EMIT",
        event,
        cooldownMs,
      }),
      nextState,
    };
  }

  if (nextState.activeCandidate !== null) {
    nextState.consecutiveMissingCandidatePolls += 1;

    if (
      nextState.consecutiveMissingCandidatePolls >=
      TRADE_PLAN_ALERT_CLEAR_CONFIRMATION_POLLS
    ) {
      // A clear is state maintenance only. Discord should not receive a
      // "candidate cleared" message from a transient or routine no-candidate
      // snapshot. Three consecutive misses are required before state clears.
      nextState.lastClearedCandidate = { ...nextState.activeCandidate };
      nextState.lastClearedAtMs = evaluatedAtMs;
      nextState.lastClearedEpisodeId = nextState.activeEpisodeId;
      nextState.activeCandidate = null;
      nextState.activeSinceMs = null;
      nextState.activeEpisodeId = null;
      nextState.consecutiveMissingCandidatePolls = 0;
    }

    return {
      response: buildResponse({
        source,
        currentMarketDate: source.currentMarketDate,
        evaluatedAtMs,
        previousState,
        nextState,
        marketDateReset,
        transitionState: "SUPPRESSED",
        primaryReasonCode: "NO_CANDIDATE_SUPPRESSED",
        event: null,
        cooldownMs,
      }),
      nextState,
    };
  }

  resetMissingCandidatePolls(nextState);
  return {
    response: buildResponse({
      source,
      currentMarketDate: source.currentMarketDate,
      evaluatedAtMs,
      previousState,
      nextState,
      marketDateReset,
      transitionState: "SUPPRESSED",
      primaryReasonCode: marketDateReset
        ? "MARKET_DATE_RESET_SUPPRESSED"
        : "NO_CANDIDATE_SUPPRESSED",
      event: null,
      cooldownMs,
    }),
    nextState,
  };
}
