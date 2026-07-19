import {
  SpyZeroDteDeterministicScheduledReportResponseSchema,
  type DeterministicScheduledReportRequest,
  type DiscordScheduledReportDeliveryResponse,
} from "@spy-copilot/shared";
import {
  buildDiscordScheduledReportDeliveryResponse,
  buildDiscordScheduledReportPayload,
  mapDiscordScheduledReportProviderFailure,
} from "./discord-scheduled-report.logic";
import {
  getDiscordWebhookConfig,
  type DiscordWebhookConfig,
} from "./discord-webhook.logic";

export interface DiscordScheduledReportDeliveryDependencies {
  getConfig: () => DiscordWebhookConfig;
  getReport: (request: DeterministicScheduledReportRequest) => Promise<unknown>;
  fetch: typeof fetch;
  now: () => number;
  timeoutMs: number;
}

const DEFAULT_TIMEOUT_MS = 10_000;

const defaultDependencies: DiscordScheduledReportDeliveryDependencies = {
  getConfig: getDiscordWebhookConfig,
  getReport: async (request) => {
    const { getSpyZeroDteDeterministicScheduledReport } = await import(
      "./deterministic-scheduled-report.service"
    );
    return getSpyZeroDteDeterministicScheduledReport(request);
  },
  fetch: globalThis.fetch,
  now: Date.now,
  timeoutMs: DEFAULT_TIMEOUT_MS,
};

export async function sendDiscordScheduledReportWithDependencies(
  request: DeterministicScheduledReportRequest,
  dependencies: DiscordScheduledReportDeliveryDependencies,
): Promise<DiscordScheduledReportDeliveryResponse> {
  const attemptedAtMs = dependencies.now();
  const config = dependencies.getConfig();

  if (config.status === "missing") {
    return buildDiscordScheduledReportDeliveryResponse({
      reasonCode: "WEBHOOK_NOT_CONFIGURED",
      reportType: request.reportType,
      attemptedAtMs,
    });
  }
  if (config.status === "invalid") {
    return buildDiscordScheduledReportDeliveryResponse({
      reasonCode: "WEBHOOK_CONFIG_INVALID",
      reportType: request.reportType,
      attemptedAtMs,
    });
  }

  let rawReport: unknown;
  try {
    rawReport = await dependencies.getReport(request);
  } catch {
    return buildDiscordScheduledReportDeliveryResponse({
      reasonCode: "REPORT_GENERATION_FAILURE",
      reportType: request.reportType,
      attemptedAtMs,
    });
  }

  const parsedReport = SpyZeroDteDeterministicScheduledReportResponseSchema.safeParse(
    rawReport,
  );
  if (!parsedReport.success) {
    return buildDiscordScheduledReportDeliveryResponse({
      reasonCode: "REPORT_GENERATION_FAILURE",
      reportType: request.reportType,
      attemptedAtMs,
    });
  }

  const report = parsedReport.data;
  if (report.reportState === "UNAVAILABLE") {
    return buildDiscordScheduledReportDeliveryResponse({
      reasonCode: "REPORT_UNAVAILABLE",
      reportType: request.reportType,
      attemptedAtMs,
      report,
    });
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), dependencies.timeoutMs);

  try {
    const response = await dependencies.fetch(`${config.webhookUrl}?wait=true`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(buildDiscordScheduledReportPayload(report)),
      signal: controller.signal,
    });

    if (response.ok) {
      return buildDiscordScheduledReportDeliveryResponse({
        reasonCode: "REPORT_DELIVERED",
        reportType: request.reportType,
        attemptedAtMs,
        report,
        providerStatusCode: response.status,
        providerRequestAttempted: true,
      });
    }

    return buildDiscordScheduledReportDeliveryResponse({
      reasonCode: mapDiscordScheduledReportProviderFailure(response.status),
      reportType: request.reportType,
      attemptedAtMs,
      report,
      providerStatusCode: response.status,
      providerRequestAttempted: true,
    });
  } catch (error) {
    const timedOut = error instanceof Error && error.name === "AbortError";
    return buildDiscordScheduledReportDeliveryResponse({
      reasonCode: timedOut ? "WEBHOOK_REQUEST_TIMEOUT" : "WEBHOOK_NETWORK_FAILURE",
      reportType: request.reportType,
      attemptedAtMs,
      report,
      providerRequestAttempted: true,
    });
  } finally {
    clearTimeout(timeout);
  }
}

export function sendDiscordScheduledReport(
  request: DeterministicScheduledReportRequest,
): Promise<DiscordScheduledReportDeliveryResponse> {
  return sendDiscordScheduledReportWithDependencies(request, defaultDependencies);
}
