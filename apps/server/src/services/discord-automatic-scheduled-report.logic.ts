import {
  DiscordAutomaticScheduledReportDeliveryResponseSchema,
  type DiscordAutomaticScheduledReportDeliveryRequest,
  type DiscordAutomaticScheduledReportDeliveryResponse,
  type DiscordAutomaticScheduledReportPrimaryReasonCode,
  type DiscordScheduledReportDeliveryResponse,
  type SpyZeroDteScheduledReportScheduleEvaluationResponse,
} from "@spy-copilot/shared";

export const DISCORD_AUTOMATIC_SCHEDULED_REPORT_DELIVERY_METHODOLOGY_VERSION =
  "DISCORD_AUTOMATIC_SCHEDULED_REPORT_DELIVERY_V1" as const;

export interface DiscordAutomaticScheduledReportProcessState {
  marketDate: string | null;
  deliveredKeys: Set<string>;
  ambiguousKeys: Set<string>;
}

export function createDiscordAutomaticScheduledReportProcessState(): DiscordAutomaticScheduledReportProcessState {
  return {
    marketDate: null,
    deliveredKeys: new Set<string>(),
    ambiguousKeys: new Set<string>(),
  };
}

export function automaticScheduledReportDeliveryKey(
  schedule: SpyZeroDteScheduledReportScheduleEvaluationResponse,
): string | null {
  return schedule.scheduleState === "DUE" && schedule.dueReportType !== null
    ? `${schedule.easternDate}:${schedule.dueReportType}`
    : null;
}

export function isAmbiguousScheduledReportProviderOutcome(
  delivery: DiscordScheduledReportDeliveryResponse,
): boolean {
  return ["WEBHOOK_REQUEST_TIMEOUT", "WEBHOOK_NETWORK_FAILURE"].includes(
    delivery.primaryReasonCode,
  );
}

export function mapAutomaticScheduledReportReason(
  delivery: DiscordScheduledReportDeliveryResponse,
): DiscordAutomaticScheduledReportPrimaryReasonCode {
  return delivery.primaryReasonCode;
}

function automaticState(
  reason: DiscordAutomaticScheduledReportPrimaryReasonCode,
): "DELIVERED" | "NO_DELIVERY" | "FAILED" | "UNAVAILABLE" {
  if (reason === "REPORT_DELIVERED") return "DELIVERED";
  if (reason === "SCHEDULE_UNAVAILABLE") return "UNAVAILABLE";
  if (
    [
      "NO_REPORT_DUE",
      "DUPLICATE_REPORT_SUPPRESSED",
      "AMBIGUOUS_PROVIDER_OUTCOME_SUPPRESSED",
      "WEBHOOK_NOT_CONFIGURED",
      "WEBHOOK_CONFIG_INVALID",
    ].includes(reason)
  ) {
    return "NO_DELIVERY";
  }
  return "FAILED";
}

export function buildDiscordAutomaticScheduledReportDeliveryResponse(args: {
  request: DiscordAutomaticScheduledReportDeliveryRequest;
  evaluatedAtMs: number;
  reasonCode: DiscordAutomaticScheduledReportPrimaryReasonCode;
  scheduleEvaluation: SpyZeroDteScheduledReportScheduleEvaluationResponse | null;
  deliveryKey: string | null;
  delivery?: DiscordScheduledReportDeliveryResponse | null;
  marketDateBefore: string | null;
  marketDateAfter: string | null;
  marketDateReset: boolean;
  mutationApplied: boolean;
  deliveredKeyCommitted: boolean;
  ambiguousKeyCommitted: boolean;
}): DiscordAutomaticScheduledReportDeliveryResponse {
  return DiscordAutomaticScheduledReportDeliveryResponseSchema.parse({
    product: "DISCORD_AUTOMATIC_SCHEDULED_REPORT_DELIVERY",
    methodologyVersion:
      DISCORD_AUTOMATIC_SCHEDULED_REPORT_DELIVERY_METHODOLOGY_VERSION,
    automaticDeliveryState: automaticState(args.reasonCode),
    primaryReasonCode: args.reasonCode,
    evaluatedAt: new Date(args.evaluatedAtMs).toISOString(),
    clientMode: args.request.clientMode,
    cadenceMilliseconds: args.request.cadenceMilliseconds,
    deliveryKey: args.deliveryKey,
    scheduleEvaluation: args.scheduleEvaluation,
    delivery: args.delivery ?? null,
    state: {
      storageMethod: "PROCESS_MEMORY_ONLY",
      marketDateBefore: args.marketDateBefore,
      marketDateAfter: args.marketDateAfter,
      marketDateReset: args.marketDateReset,
      mutationApplied: args.mutationApplied,
      deliveredKeyCommitted: args.deliveredKeyCommitted,
      ambiguousKeyCommitted: args.ambiguousKeyCommitted,
    },
    disclosures: {
      userOptInRequired: true,
      foregroundBrowserSessionOnly: true,
      noBackgroundScheduler: true,
      processMemoryDeduplication: true,
      resetsOnProcessRestart: true,
      ambiguousProviderOutcomeSuppressed: true,
      noDatabasePersistence: true,
      webhookUrlReturned: false,
      webhookTokenReturned: false,
      providerBodyReturned: false,
      deterministicSourceOnly: true,
      noLlmGeneration: true,
      noPrivateAccountData: true,
      noOrderExecution: true,
      mentionsDisabled: true,
    },
    methodology: {
      scheduleProduct: "SPY_ZERO_DTE_DETERMINISTIC_SCHEDULE_EVALUATION",
      scheduleMethodology: "SCHEDULE_EVALUATION_V2",
      deliveryProduct: "DISCORD_DETERMINISTIC_SCHEDULED_REPORT_DELIVERY",
      deliveryMethodology: "DISCORD_SCHEDULED_REPORT_DELIVERY_V1",
      deliveryTrigger:
        "OPT_IN_FOREGROUND_BROWSER_POLL_DURING_DUE_WINDOW",
      cadenceSource: "CALLER_SELECTED_ALLOWED_VALUE",
      deduplicationKeyMethod: "EASTERN_DATE_AND_REPORT_TYPE",
      stateCommitMethod:
        "COMMIT_ONLY_AFTER_CONFIRMED_DELIVERY_OR_AMBIGUOUS_PROVIDER_OUTCOME",
      ambiguousOutcomeMethod:
        "SUPPRESS_REMAINDER_OF_PROCESS_SESSION_FOR_DELIVERY_KEY",
      persistenceMethod: "NONE",
      schedulerMethod: "FOREGROUND_BROWSER_TIMER_ONLY",
    },
  });
}
