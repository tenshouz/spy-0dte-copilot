import type {
  DiscordWebhookStatusResponse,
  DiscordWebhookTestDeliveryResponse,
} from "@spy-copilot/shared";
import {
  buildDiscordTestPayload,
  buildDiscordWebhookStatusResponse,
  buildDiscordWebhookTestResponse,
  getDiscordWebhookConfig,
  mapDiscordProviderFailure,
  type DiscordWebhookConfig,
} from "./discord-webhook.logic";

export interface DiscordWebhookServiceDependencies {
  getConfig: () => DiscordWebhookConfig;
  fetch: typeof fetch;
  now: () => number;
  timeoutMs: number;
}

const DEFAULT_TIMEOUT_MS = 10_000;

const defaultDependencies: DiscordWebhookServiceDependencies = {
  getConfig: getDiscordWebhookConfig,
  fetch: globalThis.fetch,
  now: Date.now,
  timeoutMs: DEFAULT_TIMEOUT_MS,
};

export function getDiscordWebhookStatusWithDependencies(
  dependencies: Pick<DiscordWebhookServiceDependencies, "getConfig">,
): DiscordWebhookStatusResponse {
  return buildDiscordWebhookStatusResponse(dependencies.getConfig());
}

export function getDiscordWebhookStatus(): DiscordWebhookStatusResponse {
  return getDiscordWebhookStatusWithDependencies(defaultDependencies);
}

export async function sendDiscordWebhookTestWithDependencies(
  dependencies: DiscordWebhookServiceDependencies,
): Promise<DiscordWebhookTestDeliveryResponse> {
  const attemptedAtMs = dependencies.now();
  const config = dependencies.getConfig();

  if (config.status === "missing") {
    return buildDiscordWebhookTestResponse({
      reasonCode: "WEBHOOK_NOT_CONFIGURED",
      attemptedAtMs,
    });
  }
  if (config.status === "invalid") {
    return buildDiscordWebhookTestResponse({
      reasonCode: "WEBHOOK_CONFIG_INVALID",
      attemptedAtMs,
    });
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), dependencies.timeoutMs);

  try {
    const response = await dependencies.fetch(`${config.webhookUrl}?wait=true`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(buildDiscordTestPayload()),
      signal: controller.signal,
    });

    if (response.ok) {
      return buildDiscordWebhookTestResponse({
        reasonCode: "TEST_MESSAGE_DELIVERED",
        attemptedAtMs,
        providerStatusCode: response.status,
      });
    }

    return buildDiscordWebhookTestResponse({
      reasonCode: mapDiscordProviderFailure(response.status),
      attemptedAtMs,
      providerStatusCode: response.status,
    });
  } catch (error) {
    const timedOut = error instanceof Error && error.name === "AbortError";
    return buildDiscordWebhookTestResponse({
      reasonCode: timedOut ? "WEBHOOK_REQUEST_TIMEOUT" : "WEBHOOK_NETWORK_FAILURE",
      attemptedAtMs,
    });
  } finally {
    clearTimeout(timeout);
  }
}

export function sendDiscordWebhookTest(): Promise<DiscordWebhookTestDeliveryResponse> {
  return sendDiscordWebhookTestWithDependencies(defaultDependencies);
}
