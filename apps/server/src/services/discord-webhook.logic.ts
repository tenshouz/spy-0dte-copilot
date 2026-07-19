import {
  DiscordWebhookStatusResponseSchema,
  DiscordWebhookTestDeliveryResponseSchema,
  type DiscordWebhookStatusResponse,
  type DiscordWebhookTestDeliveryPrimaryReasonCode,
  type DiscordWebhookTestDeliveryResponse,
} from "@spy-copilot/shared";

export type DiscordWebhookConfig =
  | { status: "missing" }
  | { status: "invalid"; reason: string }
  | { status: "valid"; webhookUrl: string };

const OFFICIAL_DISCORD_WEBHOOK_HOSTS = new Set([
  "discord.com",
  "ptb.discord.com",
  "canary.discord.com",
]);

export function validateDiscordWebhookUrl(raw: string | undefined): DiscordWebhookConfig {
  if (raw === undefined || raw === "") return { status: "missing" };
  if (raw !== raw.trim()) {
    return {
      status: "invalid",
      reason: "DISCORD_WEBHOOK_URL has leading or trailing whitespace.",
    };
  }

  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return { status: "invalid", reason: "DISCORD_WEBHOOK_URL is not a parseable URL." };
  }

  if (url.protocol !== "https:") {
    return { status: "invalid", reason: "DISCORD_WEBHOOK_URL must use https://." };
  }
  if (!OFFICIAL_DISCORD_WEBHOOK_HOSTS.has(url.hostname)) {
    return {
      status: "invalid",
      reason: "DISCORD_WEBHOOK_URL must use an official discord.com webhook host.",
    };
  }
  if (url.username || url.password || url.search || url.hash) {
    return {
      status: "invalid",
      reason: "DISCORD_WEBHOOK_URL must not contain credentials, query parameters, or a fragment.",
    };
  }

  const segments = url.pathname.split("/").filter(Boolean);
  if (
    segments.length !== 4 ||
    segments[0] !== "api" ||
    segments[1] !== "webhooks" ||
    !/^\d+$/.test(segments[2] ?? "") ||
    (segments[3]?.length ?? 0) < 20
  ) {
    return {
      status: "invalid",
      reason: "DISCORD_WEBHOOK_URL must match the standard /api/webhooks/<id>/<token> format.",
    };
  }

  return { status: "valid", webhookUrl: raw };
}

export function getDiscordWebhookConfig(): DiscordWebhookConfig {
  return validateDiscordWebhookUrl(process.env.DISCORD_WEBHOOK_URL);
}

export function buildDiscordWebhookStatusResponse(
  config: DiscordWebhookConfig,
): DiscordWebhookStatusResponse {
  if (config.status === "missing") {
    return DiscordWebhookStatusResponseSchema.parse({
      product: "DISCORD_WEBHOOK_CONNECTION_STATUS",
      methodologyVersion: "DISCORD_WEBHOOK_CONNECTION_V1",
      state: "NOT_CONFIGURED",
      primaryReasonCode: "WEBHOOK_URL_MISSING",
      configured: false,
      canSendTest: false,
      detail: "Set DISCORD_WEBHOOK_URL in apps/server/.env and restart the backend.",
      disclosures: discordDisclosures(),
    });
  }

  if (config.status === "invalid") {
    return DiscordWebhookStatusResponseSchema.parse({
      product: "DISCORD_WEBHOOK_CONNECTION_STATUS",
      methodologyVersion: "DISCORD_WEBHOOK_CONNECTION_V1",
      state: "CONFIG_INVALID",
      primaryReasonCode: "WEBHOOK_URL_INVALID",
      configured: false,
      canSendTest: false,
      detail: config.reason,
      disclosures: discordDisclosures(),
    });
  }

  return DiscordWebhookStatusResponseSchema.parse({
    product: "DISCORD_WEBHOOK_CONNECTION_STATUS",
    methodologyVersion: "DISCORD_WEBHOOK_CONNECTION_V1",
    state: "READY",
    primaryReasonCode: "WEBHOOK_READY",
    configured: true,
    canSendTest: true,
    detail: "A validated Discord webhook is configured on the backend.",
    disclosures: discordDisclosures(),
  });
}

export function buildDiscordTestPayload(): Record<string, unknown> {
  return {
    content:
      "SPY 0DTE Copilot connection test: Discord delivery is configured. No trading action was taken.",
    username: "SPY 0DTE Copilot",
    allowed_mentions: { parse: [] },
  };
}

export function mapDiscordProviderFailure(
  statusCode: number,
): DiscordWebhookTestDeliveryPrimaryReasonCode {
  if (statusCode === 429) return "WEBHOOK_RATE_LIMITED";
  if ([400, 401, 403, 404].includes(statusCode)) return "WEBHOOK_REJECTED";
  return "WEBHOOK_PROVIDER_FAILURE";
}

export function buildDiscordWebhookTestResponse(args: {
  reasonCode: DiscordWebhookTestDeliveryPrimaryReasonCode;
  attemptedAtMs: number;
  providerStatusCode?: number | null;
}): DiscordWebhookTestDeliveryResponse {
  const delivered = args.reasonCode === "TEST_MESSAGE_DELIVERED";
  return DiscordWebhookTestDeliveryResponseSchema.parse({
    product: "DISCORD_WEBHOOK_TEST_DELIVERY",
    methodologyVersion: "DISCORD_WEBHOOK_TEST_V1",
    deliveryState: delivered ? "DELIVERED" : "NOT_DELIVERED",
    primaryReasonCode: args.reasonCode,
    attemptedAt: new Date(args.attemptedAtMs).toISOString(),
    deliveredAt: delivered ? new Date(args.attemptedAtMs).toISOString() : null,
    providerStatusCode: args.providerStatusCode ?? null,
    disclosures: discordDisclosures(),
  });
}

function discordDisclosures() {
  return {
    webhookUrlReturned: false as const,
    webhookTokenReturned: false as const,
    noAutomaticDelivery: true as const,
    noPersistence: true as const,
    noPrivateAccountData: true as const,
    noOrderExecution: true as const,
  };
}
