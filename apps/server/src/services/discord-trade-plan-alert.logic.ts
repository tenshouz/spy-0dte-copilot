import {
  DiscordTradePlanAlertDeliveryResponseSchema,
  type DiscordTradePlanAlertDeliveryPrimaryReasonCode,
  type DiscordTradePlanAlertDeliveryResponse,
  type SpyZeroDteTradePlanAlertTransitionResponse,
} from "@spy-copilot/shared";

export const DISCORD_TRADE_PLAN_ALERT_DELIVERY_METHODOLOGY_VERSION =
  "DISCORD_TRADE_PLAN_ALERT_DELIVERY_V1" as const;

export interface DiscordProviderAttemptResult {
  reasonCode:
    | "ALERT_DELIVERED"
    | "WEBHOOK_REQUEST_TIMEOUT"
    | "WEBHOOK_NETWORK_FAILURE"
    | "WEBHOOK_RATE_LIMITED"
    | "WEBHOOK_REJECTED"
    | "WEBHOOK_PROVIDER_FAILURE";
  providerStatusCode: number | null;
  providerRequestAttempted: true;
}

function transitionSummary(
  transition: SpyZeroDteTradePlanAlertTransitionResponse,
) {
  return {
    product: transition.product,
    methodologyVersion: transition.methodologyVersion,
    currentMarketDate: transition.currentMarketDate,
    evaluatedAt: transition.evaluatedAt,
    engineState: transition.engineState,
    transitionState: transition.transitionState,
    primaryReasonCode: transition.primaryReasonCode,
    warningCode: transition.warningCode,
    event: transition.event,
  };
}

function disclosures() {
  return {
    webhookUrlReturned: false as const,
    webhookTokenReturned: false as const,
    providerBodyReturned: false as const,
    explicitDeliveryOnly: true as const,
    noAutomaticDelivery: true as const,
    noDatabasePersistence: true as const,
    noPrivateAccountData: true as const,
    noOrderExecution: true as const,
    mentionsDisabled: true as const,
  };
}

function methodology() {
  return {
    sourceProduct:
      "SPY_ZERO_DTE_DETERMINISTIC_TRADE_PLAN_ALERT_CANDIDATE" as const,
    sourceMethodology: "TRADE_PLAN_ALERT_CANDIDATE_V2" as const,
    transitionMethodology: "TRADE_PLAN_ALERT_TRANSITION_V1" as const,
    deliveryTrigger: "EXPLICIT_POST_ONLY" as const,
    deliveryStateIsolation: "DEDICATED_PROCESS_MEMORY" as const,
    successfulDeliveryCommit:
      "COMMIT_TRANSITION_STATE_AFTER_PROVIDER_CONFIRMATION" as const,
    failedDeliveryCommit: "DO_NOT_COMMIT_EMITTED_TRANSITION" as const,
    duplicateSuppressionMethod: "TRADE_PLAN_ALERT_TRANSITION_V1" as const,
    providerConfirmationMethod: "DISCORD_WAIT_TRUE_HTTP_SUCCESS" as const,
    retryMethod: "EXPLICIT_USER_RETRY_ONLY" as const,
  };
}

export function buildDiscordTradePlanAlertPayload(
  transition: SpyZeroDteTradePlanAlertTransitionResponse,
): Record<string, unknown> {
  if (transition.transitionState !== "EMIT" || transition.event === null) {
    throw new Error("Discord Trade Plan alert payload requires an emitted transition");
  }

  const event = transition.event;
  const direction =
    event.currentCandidate?.direction ?? event.previousCandidate?.direction ?? "NONE";
  const category =
    event.currentCandidate?.category ?? event.previousCandidate?.category ?? "NONE";

  return {
    username: "SPY 0DTE Copilot",
    allowed_mentions: { parse: [] },
    embeds: [
      {
        title: event.title,
        description: event.message,
        fields: [
          {
            name: "Transition",
            value: event.transitionType.replaceAll("_", " "),
            inline: true,
          },
          {
            name: "Direction",
            value: direction,
            inline: true,
          },
          {
            name: "Category",
            value: category.replaceAll("_", " "),
            inline: true,
          },
          {
            name: "Market date",
            value: transition.currentMarketDate,
            inline: true,
          },
          {
            name: "Severity",
            value: event.severity,
            inline: true,
          },
          {
            name: "Source",
            value: "Deterministic Trade Plan alert transition",
            inline: false,
          },
        ],
        footer: {
          text: "Decision support only • No order was created or executed",
        },
        timestamp: transition.evaluatedAt,
      },
    ],
  };
}

export function mapDiscordTradePlanAlertProviderFailure(
  statusCode: number,
): DiscordProviderAttemptResult["reasonCode"] {
  if (statusCode === 429) return "WEBHOOK_RATE_LIMITED";
  if ([400, 401, 403, 404].includes(statusCode)) return "WEBHOOK_REJECTED";
  return "WEBHOOK_PROVIDER_FAILURE";
}

export function buildDiscordTradePlanAlertDeliveryResponse(args: {
  reasonCode: DiscordTradePlanAlertDeliveryPrimaryReasonCode;
  attemptedAtMs: number;
  transition?: SpyZeroDteTradePlanAlertTransitionResponse | null;
  providerStatusCode?: number | null;
  providerRequestAttempted?: boolean;
  transitionStateCommitted?: boolean;
  retryEligible?: boolean;
}): DiscordTradePlanAlertDeliveryResponse {
  const delivered = args.reasonCode === "ALERT_DELIVERED";

  return DiscordTradePlanAlertDeliveryResponseSchema.parse({
    product: "DISCORD_TRADE_PLAN_ALERT_DELIVERY",
    methodologyVersion: DISCORD_TRADE_PLAN_ALERT_DELIVERY_METHODOLOGY_VERSION,
    deliveryState: delivered ? "DELIVERED" : "NOT_DELIVERED",
    primaryReasonCode: args.reasonCode,
    attemptedAt: new Date(args.attemptedAtMs).toISOString(),
    deliveredAt: delivered ? new Date(args.attemptedAtMs).toISOString() : null,
    providerStatusCode: args.providerStatusCode ?? null,
    providerRequestAttempted: args.providerRequestAttempted ?? false,
    transition: args.transition ? transitionSummary(args.transition) : null,
    state: {
      storageMethod: "PROCESS_MEMORY_ONLY",
      transitionStateCommitted: args.transitionStateCommitted ?? false,
      retryEligible: args.retryEligible ?? false,
    },
    disclosures: disclosures(),
    methodology: methodology(),
  });
}
