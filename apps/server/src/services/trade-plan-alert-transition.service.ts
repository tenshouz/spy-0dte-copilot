import {
  SpyZeroDteTradePlanAlertCandidateResponseSchema,
  type SpyZeroDteTradePlanAlertTransitionResponse,
} from "@spy-copilot/shared";
import { getObservedMarketDate } from "./session-data.logic";
import {
  TRADE_PLAN_ALERT_REAPPEARANCE_COOLDOWN_MS,
  buildUnavailableSpyZeroDteTradePlanAlertTransition,
  cloneTradePlanAlertTransitionMemoryState,
  createEmptyTradePlanAlertTransitionMemoryState,
  evaluateSpyZeroDteTradePlanAlertTransition,
  type TradePlanAlertTransitionMemoryState,
} from "./trade-plan-alert-transition.logic";

export interface TradePlanAlertTransitionStateStore {
  read: () => TradePlanAlertTransitionMemoryState;
  write: (state: TradePlanAlertTransitionMemoryState) => void;
}

export interface TradePlanAlertTransitionServiceDependencies {
  getCandidate: () => Promise<unknown>;
  stateStore: TradePlanAlertTransitionStateStore;
  now: () => number;
  cooldownMs: number;
  getMarketDate: (nowMs: number) => string;
}

export function createInMemoryTradePlanAlertTransitionStateStore(
  initialState = createEmptyTradePlanAlertTransitionMemoryState(),
): TradePlanAlertTransitionStateStore {
  let state = cloneTradePlanAlertTransitionMemoryState(initialState);
  return {
    read: () => cloneTradePlanAlertTransitionMemoryState(state),
    write: (nextState) => {
      state = cloneTradePlanAlertTransitionMemoryState(nextState);
    },
  };
}

const defaultStateStore = createInMemoryTradePlanAlertTransitionStateStore();

const defaultDependencies: TradePlanAlertTransitionServiceDependencies = {
  getCandidate: async () => {
    const { getSpyZeroDteTradePlanAlertCandidate } = await import(
      "./trade-plan-alert-candidate.service"
    );
    return getSpyZeroDteTradePlanAlertCandidate();
  },
  stateStore: defaultStateStore,
  now: Date.now,
  cooldownMs: TRADE_PLAN_ALERT_REAPPEARANCE_COOLDOWN_MS,
  getMarketDate: getObservedMarketDate,
};

export async function getSpyZeroDteTradePlanAlertTransitionWithDependencies(
  dependencies: TradePlanAlertTransitionServiceDependencies,
): Promise<SpyZeroDteTradePlanAlertTransitionResponse> {
  const evaluatedAtMs = dependencies.now();
  const previousState = dependencies.stateStore.read();

  let rawCandidate: unknown;
  try {
    rawCandidate = await dependencies.getCandidate();
  } catch {
    return buildUnavailableSpyZeroDteTradePlanAlertTransition(
      dependencies.getMarketDate(evaluatedAtMs),
      evaluatedAtMs,
      previousState,
      "SOURCE_CANDIDATE_SERVICE_FAILURE",
      dependencies.cooldownMs,
    ).response;
  }

  const parsedCandidate = SpyZeroDteTradePlanAlertCandidateResponseSchema.safeParse(
    rawCandidate,
  );
  if (!parsedCandidate.success) {
    return buildUnavailableSpyZeroDteTradePlanAlertTransition(
      dependencies.getMarketDate(evaluatedAtMs),
      evaluatedAtMs,
      previousState,
      "SOURCE_CANDIDATE_INCONSISTENT",
      dependencies.cooldownMs,
    ).response;
  }

  const evaluation = evaluateSpyZeroDteTradePlanAlertTransition(
    parsedCandidate.data,
    previousState,
    evaluatedAtMs,
    dependencies.cooldownMs,
  );

  if (evaluation.response.state.mutationApplied) {
    dependencies.stateStore.write(evaluation.nextState);
  }

  return evaluation.response;
}

export function createSerializedTradePlanAlertTransitionEvaluator(
  dependencies: TradePlanAlertTransitionServiceDependencies,
): () => Promise<SpyZeroDteTradePlanAlertTransitionResponse> {
  let queue: Promise<void> = Promise.resolve();

  return () => {
    const result = queue.then(() =>
      getSpyZeroDteTradePlanAlertTransitionWithDependencies(dependencies),
    );
    queue = result.then(
      () => undefined,
      () => undefined,
    );
    return result;
  };
}

const defaultEvaluator = createSerializedTradePlanAlertTransitionEvaluator(
  defaultDependencies,
);

export function getSpyZeroDteTradePlanAlertTransition(): Promise<SpyZeroDteTradePlanAlertTransitionResponse> {
  return defaultEvaluator();
}
