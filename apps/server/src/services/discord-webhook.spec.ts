/**
 * Deterministic tests for backend-only Discord webhook configuration and explicit test delivery.
 * Run: npx --no-install tsx apps/server/src/services/discord-webhook.spec.ts
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  DiscordWebhookStatusResponseSchema,
  DiscordWebhookTestDeliveryResponseSchema,
} from "@spy-copilot/shared";
import {
  buildDiscordTestPayload,
  buildDiscordWebhookStatusResponse,
  mapDiscordProviderFailure,
  validateDiscordWebhookUrl,
} from "./discord-webhook.logic";
import { sendDiscordWebhookTestWithDependencies } from "./discord-webhook.service";

const VALID_URL =
  "https://discord.com/api/webhooks/123456789012345678/abcdefghijklmnopqrstuvwxyz123456";
const NOW = Date.parse("2026-07-19T20:00:00.000Z");

let passed = 0;
let failed = 0;
function test(name: string, fn: () => void | Promise<void>): void {
  Promise.resolve()
    .then(fn)
    .then(() => {
      passed += 1;
      console.log(`✓ ${name}`);
    })
    .catch((error) => {
      failed += 1;
      console.error(`✗ ${name}`);
      console.error(error);
    });
}

function dependencies(fetchImpl: typeof fetch, config = validateDiscordWebhookUrl(VALID_URL)) {
  return {
    getConfig: () => config,
    fetch: fetchImpl,
    now: () => NOW,
    timeoutMs: 10,
  };
}

test("missing webhook is a normal not-configured state", () => {
  assert.deepEqual(validateDiscordWebhookUrl(undefined), { status: "missing" });
  const response = buildDiscordWebhookStatusResponse({ status: "missing" });
  assert.equal(response.state, "NOT_CONFIGURED");
  assert.equal(response.canSendTest, false);
  DiscordWebhookStatusResponseSchema.parse(response);
});

test("leading or trailing whitespace is rejected", () => {
  assert.equal(validateDiscordWebhookUrl(` ${VALID_URL}`).status, "invalid");
  assert.equal(validateDiscordWebhookUrl(`${VALID_URL} `).status, "invalid");
});

test("webhook must use HTTPS", () => {
  assert.equal(validateDiscordWebhookUrl(VALID_URL.replace("https:", "http:")).status, "invalid");
});

test("webhook must use an official Discord host", () => {
  assert.equal(validateDiscordWebhookUrl(VALID_URL.replace("discord.com", "example.com")).status, "invalid");
});

test("webhook cannot contain query parameters or fragments", () => {
  assert.equal(validateDiscordWebhookUrl(`${VALID_URL}?wait=true`).status, "invalid");
  assert.equal(validateDiscordWebhookUrl(`${VALID_URL}#secret`).status, "invalid");
});

test("webhook path must contain id and token", () => {
  assert.equal(validateDiscordWebhookUrl("https://discord.com/api/webhooks/123").status, "invalid");
});

test("valid webhook is retained exactly without normalization", () => {
  assert.deepEqual(validateDiscordWebhookUrl(VALID_URL), {
    status: "valid",
    webhookUrl: VALID_URL,
  });
});

test("ready status never returns the URL or token", () => {
  const response = buildDiscordWebhookStatusResponse({
    status: "valid",
    webhookUrl: VALID_URL,
  });
  assert.equal(response.state, "READY");
  assert.equal(response.configured, true);
  assert.equal(JSON.stringify(response).includes(VALID_URL), false);
  assert.equal(response.disclosures.webhookUrlReturned, false);
  assert.equal(response.disclosures.webhookTokenReturned, false);
});

test("test payload disables mentions and contains no trading instruction", () => {
  const payload = buildDiscordTestPayload();
  assert.deepEqual(payload.allowed_mentions, { parse: [] });
  const serialized = JSON.stringify(payload).toLowerCase();
  for (const forbidden of ["buy calls", "buy puts", "place order", "execute trade"]) {
    assert.equal(serialized.includes(forbidden), false);
  }
});

test("provider status mapping is deterministic", () => {
  assert.equal(mapDiscordProviderFailure(429), "WEBHOOK_RATE_LIMITED");
  assert.equal(mapDiscordProviderFailure(404), "WEBHOOK_REJECTED");
  assert.equal(mapDiscordProviderFailure(500), "WEBHOOK_PROVIDER_FAILURE");
});

test("missing config short-circuits before fetch", async () => {
  let fetchCalls = 0;
  const response = await sendDiscordWebhookTestWithDependencies(
    dependencies(
      (async () => {
        fetchCalls += 1;
        throw new Error("must not run");
      }) as typeof fetch,
      { status: "missing" },
    ),
  );
  assert.equal(fetchCalls, 0);
  assert.equal(response.primaryReasonCode, "WEBHOOK_NOT_CONFIGURED");
});

test("invalid config short-circuits before fetch", async () => {
  let fetchCalls = 0;
  const response = await sendDiscordWebhookTestWithDependencies(
    dependencies(
      (async () => {
        fetchCalls += 1;
        throw new Error("must not run");
      }) as typeof fetch,
      { status: "invalid", reason: "invalid" },
    ),
  );
  assert.equal(fetchCalls, 0);
  assert.equal(response.primaryReasonCode, "WEBHOOK_CONFIG_INVALID");
});

test("successful provider confirmation delivers the fixed test", async () => {
  let requestedUrl = "";
  let requestedBody = "";
  const response = await sendDiscordWebhookTestWithDependencies(
    dependencies((async (input, init) => {
      requestedUrl = String(input);
      requestedBody = String(init?.body);
      return new Response("{}", { status: 200 });
    }) as typeof fetch),
  );
  assert.equal(requestedUrl, `${VALID_URL}?wait=true`);
  assert.deepEqual(JSON.parse(requestedBody).allowed_mentions, { parse: [] });
  assert.equal(response.deliveryState, "DELIVERED");
  assert.equal(response.providerStatusCode, 200);
  DiscordWebhookTestDeliveryResponseSchema.parse(response);
});

test("rate limit is returned without provider body", async () => {
  const response = await sendDiscordWebhookTestWithDependencies(
    dependencies((async () => new Response("secret body", { status: 429 })) as typeof fetch),
  );
  assert.equal(response.primaryReasonCode, "WEBHOOK_RATE_LIMITED");
  assert.equal(JSON.stringify(response).includes("secret body"), false);
});

test("rejected webhook is sanitized", async () => {
  const response = await sendDiscordWebhookTestWithDependencies(
    dependencies((async () => new Response("invalid token", { status: 404 })) as typeof fetch),
  );
  assert.equal(response.primaryReasonCode, "WEBHOOK_REJECTED");
  assert.equal(response.providerStatusCode, 404);
});

test("network failure is sanitized", async () => {
  const response = await sendDiscordWebhookTestWithDependencies(
    dependencies((async () => {
      throw new Error("network details");
    }) as typeof fetch),
  );
  assert.equal(response.primaryReasonCode, "WEBHOOK_NETWORK_FAILURE");
  assert.equal(JSON.stringify(response).includes("network details"), false);
});

test("timeout is classified without retry", async () => {
  let calls = 0;
  const response = await sendDiscordWebhookTestWithDependencies({
    ...dependencies((async (_input, init) => {
      calls += 1;
      return await new Promise<Response>((_resolve, reject) => {
        init?.signal?.addEventListener("abort", () => {
          const error = new Error("aborted");
          error.name = "AbortError";
          reject(error);
        });
      });
    }) as typeof fetch),
    timeoutMs: 1,
  });
  assert.equal(calls, 1);
  assert.equal(response.primaryReasonCode, "WEBHOOK_REQUEST_TIMEOUT");
});

test("route rejects origin query and body before provider delivery", () => {
  const source = readFileSync(
    resolve(process.cwd(), "apps/server/src/routes/discord-webhook.routes.ts"),
    "utf8",
  );
  const originIndex = source.indexOf("isAllowedAccountRiskOrigin");
  const queryIndex = source.indexOf("Object.keys(req.query)", originIndex);
  const bodyIndex = source.indexOf("DiscordWebhookTestRequestSchema.safeParse", queryIndex);
  const sendIndex = source.indexOf("deps.sendTest()", bodyIndex);
  assert.ok(originIndex >= 0 && queryIndex > originIndex && bodyIndex > queryIndex && sendIndex > bodyIndex);
  assert.equal(source.includes("setDiscordWebhookHeaders(res)"), true);
});

test("environment template exposes only a blank variable", () => {
  const envExample = readFileSync(resolve(process.cwd(), "apps/server/.env.example"), "utf8");
  assert.equal(envExample.includes('DISCORD_WEBHOOK_URL=""'), true);
  assert.equal(envExample.includes(VALID_URL), false);
});

test("API client validates status and explicit test responses", () => {
  const source = readFileSync(resolve(process.cwd(), "apps/web/src/lib/api-client.ts"), "utf8");
  assert.equal(source.includes("getDiscordWebhookStatus"), true);
  assert.equal(source.includes("sendDiscordWebhookTest"), true);
  assert.equal(source.includes("DiscordWebhookStatusResponseSchema"), true);
  assert.equal(source.includes("DiscordWebhookTestDeliveryResponseSchema"), true);
});

setTimeout(() => {
  console.log(`\nDiscord webhook foundation tests: ${passed} passed, ${failed} failed`);
  if (failed > 0) process.exitCode = 1;
}, 50);
