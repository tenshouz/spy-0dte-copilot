import {
  SpyZeroDteTradePlanAlertCandidateResponseSchema,
  type DiscordTradePlanAlertDeliveryResponse,
} from "@spy-copilot/shared";
import {
  buildDiscordTradePlanAlertDeliveryResponse,
  buildDiscordTradePlanAlertPayload,
  claimDiscordTradePlanTransitionFingerprint,
  isDiscordTradePlanTransitionDeliverable,
  mapDiscordTradePlanAlertProviderFailure,
  releaseDiscordTradePlanTransitionFingerprint,
} from "./discord-trade-plan-alert.logic";
import {
  getDiscordWebhookConfig,
  type DiscordWebhookConfig,
} from "./discord-webhook.logic";
import {
  TRADE_PLAN_ALERT_REAPPEARANCE_COOLDOWN_MS,
  buildUnavailableSpyZeroDteTradePlanAlertTransition,
  createEmptyTradePlanAlertTransitionMemoryState,
  evaluateSpyZeroDteTradePlanAlertTransition,
} from "./trade-plan-alert-transition.logic";
import {
  createInMemoryTradePlanAlertTransitionStateStore,
  type TradePlanAlertTransitionStateStore,
} from "./trade-plan-alert-transition.service";
import { getObservedMarketDate } from "./session-data.logic";

export interface DiscordTradePlanAlertDeliveryDependencies {
  getConfig: () => DiscordWebhookConfig;
  getCandidate: () => Promise<unknown>;
  stateStore: TradePlanAlertTransitionStateStore;
  fetch: typeof fetch;
  now: () => number;
  timeoutMs: number;
  cooldownMs: number;
  getMarketDate: (nowMs: number) => string;
  isPersistentBackendTradePlanDeliveryActive: () => Promise<boolean>;
}

const DEFAULT_TIMEOUT_MS = 10_000;

const defaultStateStore = createInMemoryTradePlanAlertTransitionStateStore(
  createEmptyTradePlanAlertTransitionMemoryState(),
);

const defaultDependencies: DiscordTradePlanAlertDeliveryDependencies = {
  getConfig: getDiscordWebhookConfig,
  getCandidate: async () => {
    const { getSpyZeroDteTradePlanAlertCandidate } = await import(
      "./trade-plan-alert-candidate.service"
    );
    return getSpyZeroDteTradePlanAlertCandidate();
  },
  stateStore: defaultStateStore,
  fetch: globalThis.fetch,
  now: Date.now,
  timeoutMs: DEFAULT_TIMEOUT_MS,
  cooldownMs: TRADE_PLAN_ALERT_REAPPEARANCE_COOLDOWN_MS,
  getMarketDate: getObservedMarketDate,
  isPersistentBackendTradePlanDeliveryActive: async () => {
    const { getBackendAutomationSettings } = await import(
      "./backend-automation.service"
    );
    const result = await getBackendAutomationSettings();
    return (
      result.engineState === "AVAILABLE" &&
      result.settings?.enabled === true &&
      result.settings.tradePlanAlertsEnabled === true
    );
  },
};

export async function sendDiscordTradePlanAlertWithDependencies(
  dependencies: DiscordTradePlanAlertDeliveryDependencies,
): Promise<DiscordTradePlanAlertDeliveryResponse> {
  const attemptedAtMs = dependencies.now();
  const config = dependencies.getConfig();

  // Configuration is checked first so an impossible delivery never consumes
  // or mutates the dedicated Discord transition state.
  if (config.status === "missing") {
    return buildDiscordTradePlanAlertDeliveryResponse({
      reasonCode: "WEBHOOK_NOT_CONFIGURED",
      attemptedAtMs,
    });
  }
  if (config.status === "invalid") {
    return buildDiscordTradePlanAlertDeliveryResponse({
      reasonCode: "WEBHOOK_CONFIG_INVALID",
      attemptedAtMs,
    });
  }

  // Persistent backend automation owns Discord delivery whenever it is active.
  // This server-side gate prevents another browser tab or the foreground
  // polling route from competing with the database-leased delivery path.
  if (await dependencies.isPersistentBackendTradePlanDeliveryActive()) {
    return buildDiscordTradePlanAlertDeliveryResponse({
      reasonCode: "NO_EMITTED_TRANSITION",
      attemptedAtMs,
    });
  }

  const previousState = dependencies.stateStore.read();

  let rawCandidate: unknown;
  try {
    rawCandidate = await dependencies.getCandidate();
  } catch {
    const transition = buildUnavailableSpyZeroDteTradePlanAlertTransition(
      dependencies.getMarketDate(attemptedAtMs),
      attemptedAtMs,
      previousState,
      "SOURCE_CANDIDATE_SERVICE_FAILURE",
      dependencies.cooldownMs,
    ).response;
    return buildDiscordTradePlanAlertDeliveryResponse({
      reasonCode: "TRANSITION_UNAVAILABLE",
      attemptedAtMs,
      transition,
      retryEligible: true,
    });
  }

  const parsedCandidate = SpyZeroDteTradePlanAlertCandidateResponseSchema.safeParse(
    rawCandidate,
  );
  if (!parsedCandidate.success) {
    const transition = buildUnavailableSpyZeroDteTradePlanAlertTransition(
      dependencies.getMarketDate(attemptedAtMs),
      attemptedAtMs,
      previousState,
      "SOURCE_CANDIDATE_INCONSISTENT",
      dependencies.cooldownMs,
    ).response;
    return buildDiscordTradePlanAlertDeliveryResponse({
      reasonCode: "TRANSITION_UNAVAILABLE",
      attemptedAtMs,
      transition,
      retryEligible: true,
    });
  }

  const evaluation = evaluateSpyZeroDteTradePlanAlertTransition(
    parsedCandidate.data,
    previousState,
    attemptedAtMs,
    dependencies.cooldownMs,
  );
  const transition = evaluation.response;

  if (transition.transitionState === "UNAVAILABLE") {
    return buildDiscordTradePlanAlertDeliveryResponse({
      reasonCode: "TRANSITION_UNAVAILABLE",
      attemptedAtMs,
      transition,
      retryEligible: true,
    });
  }

  if (transition.transitionState === "SUPPRESSED") {
    if (transition.state.mutationApplied) {
      dependencies.stateStore.write(evaluation.nextState);
    }
    return buildDiscordTradePlanAlertDeliveryResponse({
      reasonCode: "NO_EMITTED_TRANSITION",
      attemptedAtMs,
      transition,
      transitionStateCommitted: transition.state.mutationApplied,
    });
  }

  if (!isDiscordTradePlanTransitionDeliverable(transition)) {
    dependencies.stateStore.write(evaluation.nextState);
    return buildDiscordTradePlanAlertDeliveryResponse({
      reasonCode: "NO_EMITTED_TRANSITION",
      attemptedAtMs,
      transition,
      transitionStateCommitted: true,
    });
  }

  const transitionFingerprint = transition.event?.transitionFingerprint;
  if (
    transitionFingerprint === undefined ||
    !claimDiscordTradePlanTransitionFingerprint(
      transitionFingerprint,
      attemptedAtMs,
    )
  ) {
    dependencies.stateStore.write(evaluation.nextState);
    return buildDiscordTradePlanAlertDeliveryResponse({
      reasonCode: "NO_EMITTED_TRANSITION",
      attemptedAtMs,
      transition,
      transitionStateCommitted: true,
    });
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), dependencies.timeoutMs);

  try {
    const response = await dependencies.fetch(`${config.webhookUrl}?wait=true`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(buildDiscordTradePlanAlertPayload(transition)),
      signal: controller.signal,
    });

    if (response.ok) {
      dependencies.stateStore.write(evaluation.nextState);
      return buildDiscordTradePlanAlertDeliveryResponse({
        reasonCode: "ALERT_DELIVERED",
        attemptedAtMs,
        transition,
        providerStatusCode: response.status,
        providerRequestAttempted: true,
        transitionStateCommitted: true,
      });
    }

    releaseDiscordTradePlanTransitionFingerprint(transitionFingerprint);
    return buildDiscordTradePlanAlertDeliveryResponse({
      reasonCode: mapDiscordTradePlanAlertProviderFailure(response.status),
      attemptedAtMs,
      transition,
      providerStatusCode: response.status,
      providerRequestAttempted: true,
      retryEligible: true,
    });
  } catch (error) {
    const timedOut = error instanceof Error && error.name === "AbortError";
    return buildDiscordTradePlanAlertDeliveryResponse({
      reasonCode: timedOut
        ? "WEBHOOK_REQUEST_TIMEOUT"
        : "WEBHOOK_NETWORK_FAILURE",
      attemptedAtMs,
      transition,
      providerRequestAttempted: true,
      retryEligible: true,
    });
  } finally {
    clearTimeout(timeout);
  }
}

export function createSerializedDiscordTradePlanAlertSender(
  dependencies: DiscordTradePlanAlertDeliveryDependencies,
): () => Promise<DiscordTradePlanAlertDeliveryResponse> {
  let queue: Promise<void> = Promise.resolve();

  return () => {
    const result = queue.then(() =>
      sendDiscordTradePlanAlertWithDependencies(dependencies),
    );
    queue = result.then(
      () => undefined,
      () => undefined,
    );
    return result;
  };
}

const defaultSender = createSerializedDiscordTradePlanAlertSender(
  defaultDependencies,
);

export function sendDiscordTradePlanAlert(): Promise<DiscordTradePlanAlertDeliveryResponse> {
  return defaultSender();
}
