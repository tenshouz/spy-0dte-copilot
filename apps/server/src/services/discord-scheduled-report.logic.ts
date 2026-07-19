import {
  DiscordScheduledReportDeliveryResponseSchema,
  type DiscordScheduledReportDeliveryPrimaryReasonCode,
  type DiscordScheduledReportDeliveryResponse,
  type SpyZeroDteDeterministicScheduledReportResponse,
} from "@spy-copilot/shared";

export const DISCORD_SCHEDULED_REPORT_DELIVERY_METHODOLOGY_VERSION =
  "DISCORD_SCHEDULED_REPORT_DELIVERY_V1" as const;

function disclosures() {
  return {
    webhookUrlReturned: false as const,
    webhookTokenReturned: false as const,
    providerBodyReturned: false as const,
    explicitDeliveryOnly: true as const,
    noAutomaticSchedule: true as const,
    noDatabasePersistence: true as const,
    deterministicSourceOnly: true as const,
    noLlmGeneration: true as const,
    noPrivateAccountData: true as const,
    noOrderExecution: true as const,
    mentionsDisabled: true as const,
  };
}

function methodology() {
  return {
    sourceProduct: "SPY_ZERO_DTE_DETERMINISTIC_SCHEDULED_REPORT" as const,
    sourceMethodology: "SCHEDULED_REPORT_V1" as const,
    deliveryTrigger: "EXPLICIT_POST_ONLY" as const,
    providerConfirmationMethod: "DISCORD_WAIT_TRUE_HTTP_SUCCESS" as const,
    persistenceMethod: "NONE" as const,
    schedulerMethod: "NONE" as const,
    languageModelMethod: "NONE" as const,
  };
}

function reportSummary(report: SpyZeroDteDeterministicScheduledReportResponse) {
  return {
    product: report.product,
    methodologyVersion: report.methodologyVersion,
    reportType: report.reportType,
    scheduleReferenceEasternTime: report.scheduleReferenceEasternTime,
    currentMarketDate: report.currentMarketDate,
    generatedAt: report.generatedAt,
    engineState: report.engineState,
    reportState: report.reportState,
    primaryReasonCode: report.primaryReasonCode,
    title: report.title,
    headline: report.headline,
    direction: report.sourceAssembly.direction,
    checklistItemCount: report.checklist.length,
    warningCount: report.warnings.length,
  };
}

function formatNumber(value: number | null, digits = 2): string {
  return value === null ? "Unavailable" : value.toFixed(digits);
}

function formatChecklist(report: SpyZeroDteDeterministicScheduledReportResponse): string {
  return report.checklist
    .map((item) => `• ${item.status}: ${item.message}`)
    .join("\n")
    .slice(0, 1000);
}

function formatWarnings(report: SpyZeroDteDeterministicScheduledReportResponse): string {
  if (report.warnings.length === 0) return "None";
  return report.warnings
    .map((warning) => `• ${warning.message}`)
    .join("\n")
    .slice(0, 1000);
}

export function buildDiscordScheduledReportPayload(
  report: SpyZeroDteDeterministicScheduledReportResponse,
): Record<string, unknown> {
  const confidence =
    report.sourceAssembly.confidenceScore === null
      ? "Unavailable"
      : `${report.sourceAssembly.confidenceScore.toFixed(0)}%`;

  return {
    username: "SPY 0DTE Copilot",
    allowed_mentions: { parse: [] },
    embeds: [
      {
        title: report.title,
        description: report.headline,
        fields: [
          { name: "Scheduled reference", value: `${report.scheduleReferenceEasternTime} ET`, inline: true },
          { name: "Report state", value: report.reportState, inline: true },
          { name: "Plan state", value: report.sourceAssembly.planState, inline: true },
          { name: "Direction", value: report.sourceAssembly.direction, inline: true },
          { name: "Bias / confidence", value: `${report.sourceAssembly.biasState} / ${confidence}`, inline: true },
          { name: "SPY", value: formatNumber(report.sourceAssembly.currentPrice), inline: true },
          {
            name: "Entry condition",
            value: `${report.plan.entryCondition.state} · Trigger ${formatNumber(report.plan.entryCondition.triggerLevel)}`,
            inline: false,
          },
          { name: "Opening checklist", value: formatChecklist(report), inline: false },
          { name: "Warnings", value: formatWarnings(report), inline: false },
        ],
        footer: {
          text: "Deterministic decision support only • No order was created or executed",
        },
        timestamp: report.generatedAt,
      },
    ],
  };
}

export function mapDiscordScheduledReportProviderFailure(
  statusCode: number,
): DiscordScheduledReportDeliveryPrimaryReasonCode {
  if (statusCode === 429) return "WEBHOOK_RATE_LIMITED";
  if ([400, 401, 403, 404].includes(statusCode)) return "WEBHOOK_REJECTED";
  return "WEBHOOK_PROVIDER_FAILURE";
}

export function buildDiscordScheduledReportDeliveryResponse(args: {
  reasonCode: DiscordScheduledReportDeliveryPrimaryReasonCode;
  reportType: SpyZeroDteDeterministicScheduledReportResponse["reportType"];
  attemptedAtMs: number;
  report?: SpyZeroDteDeterministicScheduledReportResponse | null;
  providerStatusCode?: number | null;
  providerRequestAttempted?: boolean;
}): DiscordScheduledReportDeliveryResponse {
  const delivered = args.reasonCode === "REPORT_DELIVERED";
  return DiscordScheduledReportDeliveryResponseSchema.parse({
    product: "DISCORD_DETERMINISTIC_SCHEDULED_REPORT_DELIVERY",
    methodologyVersion: DISCORD_SCHEDULED_REPORT_DELIVERY_METHODOLOGY_VERSION,
    deliveryState: delivered ? "DELIVERED" : "NOT_DELIVERED",
    primaryReasonCode: args.reasonCode,
    reportType: args.reportType,
    attemptedAt: new Date(args.attemptedAtMs).toISOString(),
    deliveredAt: delivered ? new Date(args.attemptedAtMs).toISOString() : null,
    providerStatusCode: args.providerStatusCode ?? null,
    providerRequestAttempted: args.providerRequestAttempted ?? false,
    report: args.report ? reportSummary(args.report) : null,
    disclosures: disclosures(),
    methodology: methodology(),
  });
}
