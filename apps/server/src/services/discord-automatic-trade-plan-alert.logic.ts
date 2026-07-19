import {
  DiscordAutomaticTradePlanAlertDeliveryResponseSchema,
  type DiscordAutomaticTradePlanAlertAttemptSummary,
  type DiscordAutomaticTradePlanAlertDeliveryRequest,
  type DiscordAutomaticTradePlanAlertDeliveryResponse,
  type DiscordTradePlanAlertDeliveryResponse,
} from "@spy-copilot/shared";

export const DISCORD_AUTOMATIC_TRADE_PLAN_ALERT_DELIVERY_METHODOLOGY_VERSION =
  "DISCORD_AUTOMATIC_TRADE_PLAN_ALERT_DELIVERY_V1" as const;
export const DISCORD_AUTOMATIC_TRADE_PLAN_ALERT_MAXIMUM_ATTEMPTS = 2 as const;
export const DISCORD_AUTOMATIC_TRADE_PLAN_ALERT_RETRY_DELAY_MS = 3_000 as const;

export function isDiscordAutomaticTradePlanAlertRetryEligible(
  result: DiscordTradePlanAlertDeliveryResponse,
): boolean {
  return [
    "TRANSITION_UNAVAILABLE",
    "WEBHOOK_RATE_LIMITED",
    "WEBHOOK_PROVIDER_FAILURE",
  ].includes(result.primaryReasonCode);
}

export function summarizeDiscordAutomaticTradePlanAlertAttempt(
  result: DiscordTradePlanAlertDeliveryResponse,
  attemptNumber: number,
): DiscordAutomaticTradePlanAlertAttemptSummary {
  return {
    attemptNumber,
    deliveryState: result.deliveryState,
    primaryReasonCode: result.primaryReasonCode,
    attemptedAt: result.attemptedAt,
    deliveredAt: result.deliveredAt,
    providerStatusCode: result.providerStatusCode,
    providerRequestAttempted: result.providerRequestAttempted,
    transitionState: result.transition?.transitionState ?? null,
    transitionReasonCode: result.transition?.primaryReasonCode ?? null,
    transitionStateCommitted: result.state.transitionStateCommitted,
    retryEligible: result.state.retryEligible,
    automaticRetryEligible:
      isDiscordAutomaticTradePlanAlertRetryEligible(result),
  };
}

function automaticDeliveryState(
  finalAttempt: DiscordAutomaticTradePlanAlertAttemptSummary,
): "DELIVERED" | "NO_DELIVERY" | "FAILED" {
  if (finalAttempt.deliveryState === "DELIVERED") return "DELIVERED";
  if (
    ["NO_EMITTED_TRANSITION", "WEBHOOK_NOT_CONFIGURED"].includes(
      finalAttempt.primaryReasonCode,
    )
  ) {
    return "NO_DELIVERY";
  }
  return "FAILED";
}

export function buildDiscordAutomaticTradePlanAlertDeliveryResponse(args: {
  request: DiscordAutomaticTradePlanAlertDeliveryRequest;
  results: DiscordTradePlanAlertDeliveryResponse[];
}): DiscordAutomaticTradePlanAlertDeliveryResponse {
  if (args.results.length < 1) {
    throw new Error("Automatic Discord delivery requires at least one attempt");
  }

  const attempts = args.results.map((result, index) =>
    summarizeDiscordAutomaticTradePlanAlertAttempt(result, index + 1),
  );
  const finalAttempt = attempts.at(-1);
  if (!finalAttempt) {
    throw new Error("Automatic Discord delivery final attempt is unavailable");
  }

  return DiscordAutomaticTradePlanAlertDeliveryResponseSchema.parse({
    product: "DISCORD_AUTOMATIC_TRADE_PLAN_ALERT_DELIVERY",
    methodologyVersion:
      DISCORD_AUTOMATIC_TRADE_PLAN_ALERT_DELIVERY_METHODOLOGY_VERSION,
    automaticDeliveryState: automaticDeliveryState(finalAttempt),
    primaryReasonCode: finalAttempt.primaryReasonCode,
    evaluatedAt: finalAttempt.attemptedAt,
    clientMode: args.request.clientMode,
    cadenceMilliseconds: args.request.cadenceMilliseconds,
    attemptCount: attempts.length,
    maximumAttempts:
      DISCORD_AUTOMATIC_TRADE_PLAN_ALERT_MAXIMUM_ATTEMPTS,
    retryDelayMilliseconds:
      DISCORD_AUTOMATIC_TRADE_PLAN_ALERT_RETRY_DELAY_MS,
    attempts,
    finalAttempt,
    disclosures: {
      userOptInRequired: true,
      foregroundBrowserSessionOnly: true,
      noBackgroundScheduler: true,
      processMemoryDeduplication: true,
      sharedWithExplicitDeliveryState: true,
      ambiguousProviderOutcomeNotAutomaticallyRetried: true,
      noDatabasePersistence: true,
      webhookUrlReturned: false,
      webhookTokenReturned: false,
      providerBodyReturned: false,
      noPrivateAccountData: true,
      noOrderExecution: true,
      mentionsDisabled: true,
    },
    methodology: {
      sourceDeliveryProduct: "DISCORD_TRADE_PLAN_ALERT_DELIVERY",
      sourceDeliveryMethodology: "DISCORD_TRADE_PLAN_ALERT_DELIVERY_V1",
      deliveryTrigger: "OPT_IN_FOREGROUND_BROWSER_POLL",
      cadenceSource: "CALLER_SELECTED_ALLOWED_VALUE",
      retryMethod:
        "MAX_TWO_ATTEMPTS_FIXED_BACKOFF_FOR_RETRY_ELIGIBLE_RESULTS",
      retryableResultMethod: "UNAMBIGUOUS_AUTOMATIC_RETRY_ALLOWLIST",
      duplicateSuppressionMethod: "SHARED_DISCORD_PROCESS_MEMORY_STATE",
      transitionCooldownMethod:
        "TRADE_PLAN_ALERT_TRANSITION_V1_REAPPEARANCE_COOLDOWN",
      persistenceMethod: "NONE",
      schedulerMethod: "FOREGROUND_BROWSER_TIMER_ONLY",
    },
  });
}
