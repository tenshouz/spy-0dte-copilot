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

export interface TradePlanAlertTransitionMemoryState {
  marketDate: string | null;
  activeCandidate: TradePlanAlertTransitionCandidateSummary | null;
  activeSinceMs: number | null;
  lastClearedCandidate: TradePlanAlertTransitionCandidateSummary | null;
  lastClearedAtMs: number | null;
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
  transitionType: TradePlanAlertTransitionEvent["transitionType"],
  previousCandidate: TradePlanAlertTransitionCandidateSummary | null,
  currentCandidate: TradePlanAlertTransitionCandidateSummary | null,
): string {
  return [
    "SPY",
    marketDate,
    transitionType,
    previousCandidate?.deduplicationKey ?? "NONE",
    currentCandidate?.deduplicationKey ?? "NONE",
  ].join("|");
}

function buildEvent(
  marketDate: string,
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
      return {
        transitionFingerprint: transitionFingerprint(
          marketDate,
          transitionType,
          previousCandidate,
          currentCandidate,
        ),
        transitionType,
        severity: currentCandidate.severity,
        title: "Trade plan alert candidate changed",
        message: `The deterministic alert candidate changed from ${previousCandidate.category} to ${currentCandidate.category}. ${currentPayload.message}`,
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
    if (nextState.activeCandidate !== null) {
      if (
        nextState.activeCandidate.deduplicationKey ===
        currentCandidate.deduplicationKey
      ) {
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
      nextState.activeCandidate = { ...currentCandidate };
      nextState.activeSinceMs = evaluatedAtMs;
      nextState.lastClearedCandidate = null;
      nextState.lastClearedAtMs = null;
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
          event: buildEvent(
            source.currentMarketDate,
            "CANDIDATE_CHANGED",
            previousCandidate,
            currentCandidate,
            source,
          ),
          cooldownMs,
        }),
        nextState,
      };
    }

    if (nextState.lastClearedCandidate !== null) {
      const previousCandidate = { ...nextState.lastClearedCandidate };
      if (
        previousCandidate.deduplicationKey === currentCandidate.deduplicationKey &&
        nextState.lastClearedAtMs !== null
      ) {
        const elapsedMs = Math.max(0, evaluatedAtMs - nextState.lastClearedAtMs);
        if (elapsedMs < cooldownMs) {
          return {
            response: buildResponse({
              source,
              currentMarketDate: source.currentMarketDate,
              evaluatedAtMs,
              previousState,
              nextState,
              marketDateReset,
              transitionState: "SUPPRESSED",
              primaryReasonCode: "REAPPEARANCE_COOLDOWN_SUPPRESSED",
              event: null,
              cooldownMs,
              remainingCooldownMs: cooldownMs - elapsedMs,
            }),
            nextState,
          };
        }

        nextState.activeCandidate = { ...currentCandidate };
        nextState.activeSinceMs = evaluatedAtMs;
        nextState.lastClearedCandidate = null;
        nextState.lastClearedAtMs = null;
        return {
          response: buildResponse({
            source,
            currentMarketDate: source.currentMarketDate,
            evaluatedAtMs,
            previousState,
            nextState,
            marketDateReset,
            transitionState: "EMIT",
            primaryReasonCode: "CANDIDATE_REAPPEARED_EMIT",
            event: buildEvent(
              source.currentMarketDate,
              "CANDIDATE_REAPPEARED",
              previousCandidate,
              currentCandidate,
              source,
            ),
            cooldownMs,
          }),
          nextState,
        };
      }

      nextState.activeCandidate = { ...currentCandidate };
      nextState.activeSinceMs = evaluatedAtMs;
      nextState.lastClearedCandidate = null;
      nextState.lastClearedAtMs = null;
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
          event: buildEvent(
            source.currentMarketDate,
            "CANDIDATE_CHANGED",
            previousCandidate,
            currentCandidate,
            source,
          ),
          cooldownMs,
        }),
        nextState,
      };
    }

    nextState.activeCandidate = { ...currentCandidate };
    nextState.activeSinceMs = evaluatedAtMs;
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
        event: buildEvent(
          source.currentMarketDate,
          "INITIAL_CANDIDATE",
          null,
          currentCandidate,
          source,
        ),
        cooldownMs,
      }),
      nextState,
    };
  }

  if (nextState.activeCandidate !== null) {
    const previousCandidate = { ...nextState.activeCandidate };
    nextState.activeCandidate = null;
    nextState.activeSinceMs = null;
    nextState.lastClearedCandidate = { ...previousCandidate };
    nextState.lastClearedAtMs = evaluatedAtMs;
    return {
      response: buildResponse({
        source,
        currentMarketDate: source.currentMarketDate,
        evaluatedAtMs,
        previousState,
        nextState,
        marketDateReset,
        transitionState: "EMIT",
        primaryReasonCode: "CANDIDATE_CLEARED_EMIT",
        event: buildEvent(
          source.currentMarketDate,
          "CANDIDATE_CLEARED",
          previousCandidate,
          null,
          source,
        ),
        cooldownMs,
      }),
      nextState,
    };
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
      primaryReasonCode: marketDateReset
        ? "MARKET_DATE_RESET_SUPPRESSED"
        : "NO_CANDIDATE_SUPPRESSED",
      event: null,
      cooldownMs,
    }),
    nextState,
  };
}
