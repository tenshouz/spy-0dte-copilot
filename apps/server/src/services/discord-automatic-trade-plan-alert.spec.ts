/**
 * Deterministic tests for opt-in foreground automatic Discord Trade Plan delivery.
 * Run: npx --no-install tsx apps/server/src/services/discord-automatic-trade-plan-alert.spec.ts
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  DiscordAutomaticTradePlanAlertDeliveryRequestSchema,
  DiscordAutomaticTradePlanAlertDeliveryResponseSchema,
  type DiscordAutomaticTradePlanAlertDeliveryRequest,
  type DiscordTradePlanAlertDeliveryResponse,
  type SpyZeroDteTradePlanAlertTransitionResponse,
} from "@spy-copilot/shared";
import {
  DISCORD_AUTOMATIC_TRADE_PLAN_ALERT_MAXIMUM_ATTEMPTS,
  DISCORD_AUTOMATIC_TRADE_PLAN_ALERT_RETRY_DELAY_MS,
  buildDiscordAutomaticTradePlanAlertDeliveryResponse,
} from "./discord-automatic-trade-plan-alert.logic";
import {
  createSerializedDiscordAutomaticTradePlanAlertRunner,
  runDiscordAutomaticTradePlanAlertDeliveryWithDependencies,
  type DiscordAutomaticTradePlanAlertDeliveryDependencies,
} from "./discord-automatic-trade-plan-alert.service";
import { buildDiscordTradePlanAlertDeliveryResponse } from "./discord-trade-plan-alert.logic";

const NOW = Date.parse("2026-07-20T14:30:01.000Z");
const MARKET_DATE = "2026-07-20";
const REQUEST: DiscordAutomaticTradePlanAlertDeliveryRequest =
  DiscordAutomaticTradePlanAlertDeliveryRequestSchema.parse({
    clientMode: "FOREGROUND_BROWSER_SESSION",
    cadenceMilliseconds: 30_000,
  });

function transition(
  state: "EMIT" | "SUPPRESSED" | "UNAVAILABLE",
): SpyZeroDteTradePlanAlertTransitionResponse {
  const emitted = state === "EMIT";
  return {
    symbol: "SPY",
    product: "SPY_ZERO_DTE_DETERMINISTIC_TRADE_PLAN_ALERT_TRANSITION",
    methodologyVersion: "TRADE_PLAN_ALERT_TRANSITION_V1",
    currentMarketDate: MARKET_DATE,
    evaluatedAt: new Date(NOW).toISOString(),
    engineState: state === "UNAVAILABLE" ? "UNAVAILABLE" : "AVAILABLE",
    transitionState: state,
    primaryReasonCode:
      state === "EMIT"
        ? "INITIAL_CANDIDATE_EMIT"
        : state === "SUPPRESSED"
          ? "ACTIVE_DUPLICATE_SUPPRESSED"
          : "SOURCE_CANDIDATE_UNAVAILABLE",
    warningCode: null,
    sourceCandidate: null,
    event: emitted
      ? {
          transitionFingerprint: "INITIAL_CANDIDATE|SPY|2026-07-20|READY|CALLS",
          transitionType: "INITIAL_CANDIDATE",
          severity: "OPPORTUNITY",
          title: "Qualified CALLS trade plan is ready",
          message:
            "A deterministic CALLS plan is ready for review. No order was created.",
          previousCandidate: null,
          currentCandidate: {
            deduplicationKey: "SPY|2026-07-20|READY|CALLS",
            category: "PLAN_READY",
            severity: "OPPORTUNITY",
            direction: "CALLS",
          },
        }
      : null,
    cooldown: {
      reappearanceCooldownMilliseconds: 60_000,
      remainingMilliseconds: 0,
    },
    state: {
      storageMethod: "PROCESS_MEMORY_ONLY",
      marketDateBefore: MARKET_DATE,
      marketDateAfter: MARKET_DATE,
      activeCandidateKeyBefore: null,
      activeCandidateKeyAfter: emitted ? "SPY|2026-07-20|READY|CALLS" : null,
      lastClearedCandidateKeyAfter: null,
      marketDateReset: false,
      mutationApplied: state !== "UNAVAILABLE",
    },
    disclosures: {
      processMemoryOnly: true,
      resetsOnProcessRestart: true,
      noDatabasePersistence: true,
      noAutomaticScheduler: true,
      noNotificationDelivery: true,
      noPrivateAccountData: true,
      noOrderExecution: true,
    },
    methodology: {
      sourceProduct: "SPY_ZERO_DTE_DETERMINISTIC_TRADE_PLAN_ALERT_CANDIDATE",
      sourceMethodology: "TRADE_PLAN_ALERT_CANDIDATE_V1",
      evaluationScope: "CURRENT_CANDIDATE_VS_PROCESS_MEMORY",
      duplicateSuppressionMethod: "ACTIVE_CANDIDATE_KEY_EQUALITY",
      reappearanceMethod: "SAME_KEY_AFTER_CLEAR_AND_COOLDOWN",
      candidateChangeMethod: "DEDUPLICATION_KEY_CHANGE",
      marketDateBoundaryMethod: "RESET_WITHOUT_CARRYOVER",
      reappearanceCooldownMilliseconds: 60_000,
      persistenceMethod: "NONE",
      schedulerMethod: "NONE",
      deliveryMethod: "NONE",
    },
  };
}

function delivered(): DiscordTradePlanAlertDeliveryResponse {
  return buildDiscordTradePlanAlertDeliveryResponse({
    reasonCode: "ALERT_DELIVERED",
    attemptedAtMs: NOW,
    transition: transition("EMIT"),
    providerStatusCode: 200,
    providerRequestAttempted: true,
    transitionStateCommitted: true,
  });
}

function providerFailure(): DiscordTradePlanAlertDeliveryResponse {
  return buildDiscordTradePlanAlertDeliveryResponse({
    reasonCode: "WEBHOOK_PROVIDER_FAILURE",
    attemptedAtMs: NOW,
    transition: transition("EMIT"),
    providerStatusCode: 503,
    providerRequestAttempted: true,
    retryEligible: true,
  });
}

function timeoutFailure(): DiscordTradePlanAlertDeliveryResponse {
  return buildDiscordTradePlanAlertDeliveryResponse({
    reasonCode: "WEBHOOK_REQUEST_TIMEOUT",
    attemptedAtMs: NOW,
    transition: transition("EMIT"),
    providerRequestAttempted: true,
    retryEligible: true,
  });
}

function unavailable(): DiscordTradePlanAlertDeliveryResponse {
  return buildDiscordTradePlanAlertDeliveryResponse({
    reasonCode: "TRANSITION_UNAVAILABLE",
    attemptedAtMs: NOW,
    transition: transition("UNAVAILABLE"),
    retryEligible: true,
  });
}

function noDelivery(): DiscordTradePlanAlertDeliveryResponse {
  return buildDiscordTradePlanAlertDeliveryResponse({
    reasonCode: "NO_EMITTED_TRANSITION",
    attemptedAtMs: NOW,
    transition: transition("SUPPRESSED"),
    transitionStateCommitted: true,
  });
}

function dependencies(
  results: DiscordTradePlanAlertDeliveryResponse[],
  sleeps: number[] = [],
): DiscordAutomaticTradePlanAlertDeliveryDependencies {
  let index = 0;
  return {
    send: async () => results[Math.min(index++, results.length - 1)]!,
    sleep: async (milliseconds) => {
      sleeps.push(milliseconds);
    },
    maximumAttempts: DISCORD_AUTOMATIC_TRADE_PLAN_ALERT_MAXIMUM_ATTEMPTS,
    retryDelayMs: DISCORD_AUTOMATIC_TRADE_PLAN_ALERT_RETRY_DELAY_MS,
  };
}

const tests: Array<[string, () => void | Promise<void>]> = [];
function test(name: string, fn: () => void | Promise<void>): void {
  tests.push([name, fn]);
}

test("request accepts only approved foreground cadences", () => {
  for (const cadenceMilliseconds of [15_000, 30_000, 60_000]) {
    assert.equal(
      DiscordAutomaticTradePlanAlertDeliveryRequestSchema.safeParse({
        clientMode: "FOREGROUND_BROWSER_SESSION",
        cadenceMilliseconds,
      }).success,
      true,
    );
  }
  assert.equal(
    DiscordAutomaticTradePlanAlertDeliveryRequestSchema.safeParse({
      clientMode: "FOREGROUND_BROWSER_SESSION",
      cadenceMilliseconds: 5_000,
    }).success,
    false,
  );
});

test("successful first attempt returns DELIVERED without sleeping", async () => {
  const sleeps: number[] = [];
  const response = await runDiscordAutomaticTradePlanAlertDeliveryWithDependencies(
    REQUEST,
    dependencies([delivered()], sleeps),
  );
  assert.equal(response.automaticDeliveryState, "DELIVERED");
  assert.equal(response.attemptCount, 1);
  assert.deepEqual(sleeps, []);
  DiscordAutomaticTradePlanAlertDeliveryResponseSchema.parse(response);
});

test("suppressed transition returns NO_DELIVERY without retry", async () => {
  const sleeps: number[] = [];
  const response = await runDiscordAutomaticTradePlanAlertDeliveryWithDependencies(
    REQUEST,
    dependencies([noDelivery()], sleeps),
  );
  assert.equal(response.automaticDeliveryState, "NO_DELIVERY");
  assert.equal(response.primaryReasonCode, "NO_EMITTED_TRANSITION");
  assert.equal(response.attemptCount, 1);
  assert.deepEqual(sleeps, []);
});

test("retryable provider failure retries once then delivers", async () => {
  const sleeps: number[] = [];
  const response = await runDiscordAutomaticTradePlanAlertDeliveryWithDependencies(
    REQUEST,
    dependencies([providerFailure(), delivered()], sleeps),
  );
  assert.equal(response.automaticDeliveryState, "DELIVERED");
  assert.equal(response.attemptCount, 2);
  assert.equal(response.attempts[0]?.retryEligible, true);
  assert.deepEqual(sleeps, [3_000]);
});

test("two retryable failures exhaust the bounded policy", async () => {
  const sleeps: number[] = [];
  const response = await runDiscordAutomaticTradePlanAlertDeliveryWithDependencies(
    REQUEST,
    dependencies([providerFailure(), providerFailure()], sleeps),
  );
  assert.equal(response.automaticDeliveryState, "FAILED");
  assert.equal(response.attemptCount, 2);
  assert.equal(response.finalAttempt.retryEligible, true);
  assert.deepEqual(sleeps, [3_000]);
});

test("ambiguous provider timeout is not retried automatically", async () => {
  const sleeps: number[] = [];
  const response = await runDiscordAutomaticTradePlanAlertDeliveryWithDependencies(
    REQUEST,
    dependencies([timeoutFailure(), delivered()], sleeps),
  );
  assert.equal(response.automaticDeliveryState, "FAILED");
  assert.equal(response.attemptCount, 1);
  assert.equal(response.finalAttempt.retryEligible, true);
  assert.equal(response.finalAttempt.automaticRetryEligible, false);
  assert.deepEqual(sleeps, []);
});

test("transition unavailable receives one bounded retry", async () => {
  const response = await runDiscordAutomaticTradePlanAlertDeliveryWithDependencies(
    REQUEST,
    dependencies([unavailable(), noDelivery()]),
  );
  assert.equal(response.automaticDeliveryState, "NO_DELIVERY");
  assert.equal(response.attemptCount, 2);
  assert.equal(response.primaryReasonCode, "NO_EMITTED_TRANSITION");
});

test("configuration failures remain non-retryable", async () => {
  const missing = buildDiscordTradePlanAlertDeliveryResponse({
    reasonCode: "WEBHOOK_NOT_CONFIGURED",
    attemptedAtMs: NOW,
  });
  const response = await runDiscordAutomaticTradePlanAlertDeliveryWithDependencies(
    REQUEST,
    dependencies([missing]),
  );
  assert.equal(response.automaticDeliveryState, "NO_DELIVERY");
  assert.equal(response.attemptCount, 1);
});

test("automatic response records caller-selected cadence", () => {
  const response = buildDiscordAutomaticTradePlanAlertDeliveryResponse({
    request: REQUEST,
    results: [noDelivery()],
  });
  assert.equal(response.cadenceMilliseconds, 30_000);
  assert.equal(response.clientMode, "FOREGROUND_BROWSER_SESSION");
});

test("automatic methodology declares opt-in foreground-only operation", () => {
  const response = buildDiscordAutomaticTradePlanAlertDeliveryResponse({
    request: REQUEST,
    results: [noDelivery()],
  });
  assert.equal(response.disclosures.userOptInRequired, true);
  assert.equal(response.disclosures.foregroundBrowserSessionOnly, true);
  assert.equal(response.disclosures.noBackgroundScheduler, true);
  assert.equal(response.methodology.schedulerMethod, "FOREGROUND_BROWSER_TIMER_ONLY");
  assert.equal(
    response.methodology.transitionCooldownMethod,
    "TRADE_PLAN_ALERT_TRANSITION_V1_REAPPEARANCE_COOLDOWN",
  );
  assert.equal(
    response.methodology.retryableResultMethod,
    "UNAMBIGUOUS_AUTOMATIC_RETRY_ALLOWLIST",
  );
  assert.equal(
    response.disclosures.ambiguousProviderOutcomeNotAutomaticallyRetried,
    true,
  );
});

test("automatic delivery shares the explicit Discord process-memory state", () => {
  const source = readFileSync(
    resolve(
      process.cwd(),
      "apps/server/src/services/discord-automatic-trade-plan-alert.service.ts",
    ),
    "utf8",
  );
  assert.equal(source.includes("sendDiscordTradePlanAlert"), true);
  assert.equal(source.includes("SHARED_DISCORD_PROCESS_MEMORY_STATE"), false);
});

test("response schema rejects an impossible unbounded third attempt", () => {
  const response = buildDiscordAutomaticTradePlanAlertDeliveryResponse({
    request: REQUEST,
    results: [providerFailure(), providerFailure()],
  });
  assert.throws(() =>
    DiscordAutomaticTradePlanAlertDeliveryResponseSchema.parse({
      ...response,
      attemptCount: 3,
    }),
  );
});

test("response schema rejects second attempt without retry eligibility", () => {
  const response = buildDiscordAutomaticTradePlanAlertDeliveryResponse({
    request: REQUEST,
    results: [providerFailure(), delivered()],
  });
  assert.throws(() =>
    DiscordAutomaticTradePlanAlertDeliveryResponseSchema.parse({
      ...response,
      attempts: [
        { ...response.attempts[0], automaticRetryEligible: false },
        response.attempts[1],
      ],
    }),
  );
});

test("serialized runner prevents overlapping automatic evaluations", async () => {
  let active = 0;
  let maximumActive = 0;
  const deps: DiscordAutomaticTradePlanAlertDeliveryDependencies = {
    ...dependencies([noDelivery()]),
    send: async () => {
      active += 1;
      maximumActive = Math.max(maximumActive, active);
      await new Promise((resolve) => setTimeout(resolve, 5));
      active -= 1;
      return noDelivery();
    },
  };
  const runner = createSerializedDiscordAutomaticTradePlanAlertRunner(deps);
  await Promise.all([runner(REQUEST), runner(REQUEST)]);
  assert.equal(maximumActive, 1);
});

test("route validates origin query and body before automatic service", () => {
  const source = readFileSync(
    resolve(process.cwd(), "apps/server/src/routes/discord-webhook.routes.ts"),
    "utf8",
  );
  const routeIndex = source.indexOf('router.post("/trade-plan-alert/automatic"');
  const originIndex = source.indexOf("isAllowedAccountRiskOrigin", routeIndex);
  const queryIndex = source.indexOf("Object.keys(req.query)", originIndex);
  const bodyIndex = source.indexOf(
    "DiscordAutomaticTradePlanAlertDeliveryRequestSchema.safeParse",
    queryIndex,
  );
  const sendIndex = source.indexOf("deps.sendAutomaticTradePlanAlert", bodyIndex);
  assert.ok(
    routeIndex >= 0 &&
      originIndex > routeIndex &&
      queryIndex > originIndex &&
      bodyIndex > queryIndex &&
      sendIndex > bodyIndex,
  );
});

test("invalid JSON receives the automatic route error contract", () => {
  const source = readFileSync(
    resolve(process.cwd(), "apps/server/src/index.ts"),
    "utf8",
  );
  assert.equal(
    source.includes("INVALID_DISCORD_AUTOMATIC_TRADE_PLAN_ALERT_REQUEST"),
    true,
  );
});

test("API client validates the automatic delivery endpoint", () => {
  const source = readFileSync(
    resolve(process.cwd(), "apps/web/src/lib/api-client.ts"),
    "utf8",
  );
  assert.equal(source.includes("sendDiscordAutomaticTradePlanAlert"), true);
  assert.equal(
    source.includes("/api/discord/trade-plan-alert/automatic"),
    true,
  );
  assert.equal(
    source.includes("DiscordAutomaticTradePlanAlertDeliveryResponseSchema"),
    true,
  );
});

test("automatic service contains no persistence account or order dependency", () => {
  const source = readFileSync(
    resolve(
      process.cwd(),
      "apps/server/src/services/discord-automatic-trade-plan-alert.service.ts",
    ),
    "utf8",
  ).toLowerCase();
  for (const forbidden of [
    "prisma",
    "account-risk",
    "positions",
    "orders",
    "transactions",
    "orderquantity",
  ]) {
    assert.equal(source.includes(forbidden), false);
  }
});

async function main(): Promise<void> {
  let passed = 0;
  let failed = 0;

  for (const [name, fn] of tests) {
    try {
      await fn();
      passed += 1;
      console.log(`✓ ${name}`);
    } catch (error) {
      failed += 1;
      console.error(`✗ ${name}`);
      console.error(error);
    }
  }

  console.log(
    `\nAutomatic Discord Trade Plan alert-delivery tests: ${passed} passed, ${failed} failed`,
  );
  if (failed > 0) process.exitCode = 1;
}

void main();
