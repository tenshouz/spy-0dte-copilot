/**
 * Deterministic tests for explicit Discord delivery of Trade Plan alert transitions.
 * Run: npx --no-install tsx apps/server/src/services/discord-trade-plan-alert.spec.ts
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  DiscordTradePlanAlertDeliveryResponseSchema,
  SpyZeroDteTradePlanAlertCandidateResponseSchema,
  type SpyZeroDteTradePlanAlertCandidateResponse,
} from "@spy-copilot/shared";
import {
  buildDiscordTradePlanAlertDeliveryResponse,
  buildDiscordTradePlanAlertPayload,
  mapDiscordTradePlanAlertProviderFailure,
  resetDiscordTradePlanTransitionFingerprintClaimsForTests,
} from "./discord-trade-plan-alert.logic";
import {
  createSerializedDiscordTradePlanAlertSender,
  sendDiscordTradePlanAlertWithDependencies,
  type DiscordTradePlanAlertDeliveryDependencies,
} from "./discord-trade-plan-alert.service";
import { validateDiscordWebhookUrl } from "./discord-webhook.logic";
import { createEmptyTradePlanAlertTransitionMemoryState } from "./trade-plan-alert-transition.logic";
import { createInMemoryTradePlanAlertTransitionStateStore } from "./trade-plan-alert-transition.service";

const VALID_URL =
  "https://discord.com/api/webhooks/123456789012345678/abcdefghijklmnopqrstuvwxyz123456";
const MARKET_DATE = "2026-07-20";
const NOW = Date.parse("2026-07-20T14:30:01.000Z");

function candidateResponse(
  key = "SPY|2026-07-20|PLAN_READY|CALLS|SPY_CALL_640",
): SpyZeroDteTradePlanAlertCandidateResponse {
  return SpyZeroDteTradePlanAlertCandidateResponseSchema.parse({
    symbol: "SPY",
    product: "SPY_ZERO_DTE_DETERMINISTIC_TRADE_PLAN_ALERT_CANDIDATE",
    methodologyVersion: "TRADE_PLAN_ALERT_CANDIDATE_V1",
    currentMarketDate: MARKET_DATE,
    calculatedAt: "2026-07-20T14:30:00.000Z",
    engineState: "AVAILABLE",
    alertState: "CANDIDATE",
    primaryReasonCode: "PLAN_READY_CANDIDATE",
    warningCode: null,
    sourceAssembly: {
      product: "SPY_ZERO_DTE_DETERMINISTIC_TRADE_PLAN_ASSEMBLY",
      methodologyVersion: "ASSEMBLY_V1",
      currentMarketDate: MARKET_DATE,
      calculatedAt: "2026-07-20T14:30:00.000Z",
      engineState: "AVAILABLE",
      planState: "READY",
      direction: "CALLS",
      primaryReasonCode: "TRADE_PLAN_READY",
      warningCode: null,
    },
    candidate: {
      deduplicationKey: key,
      category: "PLAN_READY",
      severity: "OPPORTUNITY",
      title: "Qualified CALLS trade plan is ready",
      message:
        "A deterministic CALLS plan has a satisfied entry condition, qualified underlying objective, and selected contract reference. Review the current snapshot before acting.",
      direction: "CALLS",
      currentPrice: 640.25,
      planningReferenceType: "CURRENT_PRICE",
      planningReferencePrice: 640.25,
      triggerLevel: 640,
      triggerComparison: "PRICE_GREATER_THAN",
      selectedContractSymbol: "SPY   260720C00640000",
      selectedContractAsk: 1.25,
      selectedContractQuoteAt: "2026-07-20T14:29:59.000Z",
      structuralInvalidationLevel: 639.5,
      primaryObjectiveLevel: 642,
      rewardRiskRatio: 2.33,
    },
    disclosures: {
      currentSnapshotOnly: true,
      candidateOnly: true,
      noTransitionDetection: true,
      noDeduplicationState: true,
      noPersistence: true,
      noNotificationDelivery: true,
      noPrivateAccountData: true,
      noOrderExecution: true,
    },
    methodology: {
      sourceProduct: "SPY_ZERO_DTE_DETERMINISTIC_TRADE_PLAN_ASSEMBLY",
      sourceMethodology: "ASSEMBLY_V1",
      evaluationScope: "CURRENT_ASSEMBLY_SNAPSHOT",
      candidateStates: [
        "READY",
        "WAITING_FOR_TRIGGER",
        "NO_QUALIFIED_CONTRACT",
        "NOT_QUALIFIED",
      ],
      suppressedStates: ["NO_SETUP", "NOT_APPLICABLE"],
      unavailableState: "UNAVAILABLE",
      transitionDetectionMethod: "NONE",
      deliveryMethod: "NONE",
      deduplicationMethod: "STABLE_CANDIDATE_KEY_ONLY",
    },
  });
}

function waitingResponse(): SpyZeroDteTradePlanAlertCandidateResponse {
  const value = candidateResponse(
    "SPY|2026-07-20|CALLS|VWAP_RECLAIM_BREAKOUT|WAITING_FOR_TRIGGER|ARMED",
  );
  return SpyZeroDteTradePlanAlertCandidateResponseSchema.parse({
    ...value,
    primaryReasonCode: "WAITING_FOR_TRIGGER_CANDIDATE",
    sourceAssembly: {
      ...value.sourceAssembly,
      planState: "WAITING_FOR_TRIGGER",
      primaryReasonCode: "TRADE_PLAN_WAITING_FOR_TRIGGER",
    },
    candidate: {
      ...value.candidate,
      category: "WAITING_FOR_TRIGGER",
      severity: "INFO",
      title: "CALLS setup waiting for its trigger",
      message: "The deterministic CALLS setup remains conditional.",
      planningReferenceType: "TRIGGER_LEVEL",
      planningReferencePrice: 640,
      triggerLevel: 640,
      selectedContractSymbol: null,
      selectedContractAsk: null,
      selectedContractQuoteAt: null,
    },
  });
}

function suppressedResponse(): SpyZeroDteTradePlanAlertCandidateResponse {
  const value = candidateResponse();
  return SpyZeroDteTradePlanAlertCandidateResponseSchema.parse({
    ...value,
    alertState: "SUPPRESSED",
    primaryReasonCode: "NOT_APPLICABLE_SUPPRESSED",
    sourceAssembly: {
      ...value.sourceAssembly,
      planState: "NOT_APPLICABLE",
      direction: "NONE",
      primaryReasonCode: "TRADE_PLAN_NOT_APPLICABLE",
    },
    candidate: null,
  });
}

function dependencies(args: {
  fetch?: typeof fetch;
  getCandidate?: () => Promise<unknown>;
  config?: ReturnType<typeof validateDiscordWebhookUrl>;
  now?: () => number;
  persistentBackendDeliveryActive?: boolean;
} = {}): DiscordTradePlanAlertDeliveryDependencies {
  return {
    getConfig: () => args.config ?? validateDiscordWebhookUrl(VALID_URL),
    getCandidate: args.getCandidate ?? (async () => candidateResponse()),
    stateStore: createInMemoryTradePlanAlertTransitionStateStore(
      createEmptyTradePlanAlertTransitionMemoryState(),
    ),
    fetch:
      args.fetch ??
      ((async () => new Response("{}", { status: 200 })) as typeof fetch),
    now: args.now ?? (() => NOW),
    timeoutMs: 20,
    cooldownMs: 60_000,
    getMarketDate: () => MARKET_DATE,
    isPersistentBackendTradePlanDeliveryActive: async () =>
      args.persistentBackendDeliveryActive ?? false,
  };
}

const tests: Array<[string, () => void | Promise<void>]> = [];
function test(name: string, fn: () => void | Promise<void>): void {
  tests.push([name, fn]);
}

test("methodology is explicit-only delivery V1", () => {
  const response = buildDiscordTradePlanAlertDeliveryResponse({
    reasonCode: "WEBHOOK_NOT_CONFIGURED",
    attemptedAtMs: NOW,
  });
  assert.equal(
    response.methodologyVersion,
    "DISCORD_TRADE_PLAN_ALERT_DELIVERY_V1",
  );
  assert.equal(response.methodology.deliveryTrigger, "EXPLICIT_POST_ONLY");
  assert.equal(response.disclosures.noAutomaticDelivery, true);
});

test("missing webhook short-circuits before candidate and provider", async () => {
  let candidateCalls = 0;
  let fetchCalls = 0;
  const deps = dependencies({
    config: { status: "missing" },
    getCandidate: async () => {
      candidateCalls += 1;
      return candidateResponse();
    },
    fetch: (async () => {
      fetchCalls += 1;
      return new Response("{}", { status: 200 });
    }) as typeof fetch,
  });
  const response = await sendDiscordTradePlanAlertWithDependencies(deps);
  assert.equal(response.primaryReasonCode, "WEBHOOK_NOT_CONFIGURED");
  assert.equal(candidateCalls, 0);
  assert.equal(fetchCalls, 0);
  assert.equal(deps.stateStore.read().marketDate, null);
});

test("invalid webhook short-circuits before candidate and provider", async () => {
  let candidateCalls = 0;
  const deps = dependencies({
    config: { status: "invalid", reason: "invalid" },
    getCandidate: async () => {
      candidateCalls += 1;
      return candidateResponse();
    },
  });
  const response = await sendDiscordTradePlanAlertWithDependencies(deps);
  assert.equal(response.primaryReasonCode, "WEBHOOK_CONFIG_INVALID");
  assert.equal(candidateCalls, 0);
});

test("suppressed candidate commits non-delivery transition state without provider call", async () => {
  let fetchCalls = 0;
  const deps = dependencies({
    getCandidate: async () => suppressedResponse(),
    fetch: (async () => {
      fetchCalls += 1;
      return new Response("{}", { status: 200 });
    }) as typeof fetch,
  });
  const response = await sendDiscordTradePlanAlertWithDependencies(deps);
  assert.equal(response.primaryReasonCode, "NO_EMITTED_TRANSITION");
  assert.equal(response.transition?.transitionState, "SUPPRESSED");
  assert.equal(response.providerRequestAttempted, false);
  assert.equal(response.state.transitionStateCommitted, true);
  assert.equal(deps.stateStore.read().marketDate, MARKET_DATE);
  assert.equal(fetchCalls, 0);
});


test("persistent backend delivery suppresses competing foreground sender", async () => {
  let candidateCalls = 0;
  let fetchCalls = 0;
  const response = await sendDiscordTradePlanAlertWithDependencies(
    dependencies({
      persistentBackendDeliveryActive: true,
      getCandidate: async () => {
        candidateCalls += 1;
        return candidateResponse();
      },
      fetch: (async () => {
        fetchCalls += 1;
        return new Response("{}", { status: 200 });
      }) as typeof fetch,
    }),
  );
  assert.equal(response.primaryReasonCode, "NO_EMITTED_TRANSITION");
  assert.equal(response.providerRequestAttempted, false);
  assert.equal(candidateCalls, 0);
  assert.equal(fetchCalls, 0);
});

test("non-actionable WAITING transition is captured but never posted", async () => {
  let fetchCalls = 0;
  const deps = dependencies({
    getCandidate: async () => waitingResponse(),
    fetch: (async () => {
      fetchCalls += 1;
      return new Response("{}", { status: 200 });
    }) as typeof fetch,
  });
  const response = await sendDiscordTradePlanAlertWithDependencies(deps);
  assert.equal(response.primaryReasonCode, "NO_EMITTED_TRANSITION");
  assert.equal(response.providerRequestAttempted, false);
  assert.equal(response.state.transitionStateCommitted, true);
  assert.equal(deps.stateStore.read().activeCandidate?.category, "WAITING_FOR_TRIGGER");
  assert.equal(fetchCalls, 0);
});

test("candidate service failure is retryable and does not mutate state", async () => {
  const deps = dependencies({
    getCandidate: async () => {
      throw new Error("private detail");
    },
  });
  const response = await sendDiscordTradePlanAlertWithDependencies(deps);
  assert.equal(response.primaryReasonCode, "TRANSITION_UNAVAILABLE");
  assert.equal(response.state.retryEligible, true);
  assert.equal(response.state.transitionStateCommitted, false);
  assert.equal(deps.stateStore.read().marketDate, null);
  assert.equal(JSON.stringify(response).includes("private detail"), false);
});

test("invalid candidate fails closed without provider or state mutation", async () => {
  let fetchCalls = 0;
  const deps = dependencies({
    getCandidate: async () => ({ invalid: true }),
    fetch: (async () => {
      fetchCalls += 1;
      return new Response("{}", { status: 200 });
    }) as typeof fetch,
  });
  const response = await sendDiscordTradePlanAlertWithDependencies(deps);
  assert.equal(response.primaryReasonCode, "TRANSITION_UNAVAILABLE");
  assert.equal(fetchCalls, 0);
  assert.equal(deps.stateStore.read().marketDate, null);
});

test("emitted transition builds a mention-safe decision-support payload", async () => {
  let body = "";
  let url = "";
  const deps = dependencies({
    fetch: (async (input, init) => {
      url = String(input);
      body = String(init?.body);
      return new Response("{\"id\":\"provider-message\"}", { status: 200 });
    }) as typeof fetch,
  });
  const response = await sendDiscordTradePlanAlertWithDependencies(deps);
  const payload = JSON.parse(body) as Record<string, unknown>;
  assert.equal(url, `${VALID_URL}?wait=true`);
  assert.deepEqual(payload.allowed_mentions, { parse: [] });
  assert.ok(Array.isArray(payload.embeds));
  const serialized = JSON.stringify(payload).toLowerCase();
  for (const forbidden of [
    "@everyone",
    "@here",
    "place order",
    "execute trade",
    VALID_URL.toLowerCase(),
  ]) {
    assert.equal(serialized.includes(forbidden), false);
  }
  assert.equal(response.deliveryState, "DELIVERED");
  assert.equal(response.state.transitionStateCommitted, true);
  assert.equal(response.transition?.event?.transitionType, "INITIAL_CANDIDATE");
  assert.equal(JSON.stringify(response).includes("provider-message"), false);
  DiscordTradePlanAlertDeliveryResponseSchema.parse(response);
});

test("successful delivery commits state and suppresses the next duplicate", async () => {
  let fetchCalls = 0;
  const deps = dependencies({
    fetch: (async () => {
      fetchCalls += 1;
      return new Response("{}", { status: 200 });
    }) as typeof fetch,
  });
  const first = await sendDiscordTradePlanAlertWithDependencies(deps);
  const second = await sendDiscordTradePlanAlertWithDependencies(deps);
  assert.equal(first.primaryReasonCode, "ALERT_DELIVERED");
  assert.equal(second.primaryReasonCode, "NO_EMITTED_TRANSITION");
  assert.equal(second.transition?.primaryReasonCode, "ACTIVE_DUPLICATE_SUPPRESSED");
  assert.equal(fetchCalls, 1);
});

test("process-wide fingerprint claim blocks competing senders", async () => {
  let fetchCalls = 0;
  const sharedFetch = (async () => {
    fetchCalls += 1;
    return new Response("{}", { status: 200 });
  }) as typeof fetch;
  const first = await sendDiscordTradePlanAlertWithDependencies(
    dependencies({ fetch: sharedFetch }),
  );
  const second = await sendDiscordTradePlanAlertWithDependencies(
    dependencies({ fetch: sharedFetch }),
  );
  assert.equal(first.primaryReasonCode, "ALERT_DELIVERED");
  assert.equal(second.primaryReasonCode, "NO_EMITTED_TRANSITION");
  assert.equal(second.state.transitionStateCommitted, true);
  assert.equal(fetchCalls, 1);
});

test("provider failure does not commit the emitted transition and permits explicit retry", async () => {
  let fetchCalls = 0;
  const deps = dependencies({
    fetch: (async () => {
      fetchCalls += 1;
      return new Response("provider secret", {
        status: fetchCalls === 1 ? 500 : 200,
      });
    }) as typeof fetch,
  });
  const first = await sendDiscordTradePlanAlertWithDependencies(deps);
  assert.equal(first.primaryReasonCode, "WEBHOOK_PROVIDER_FAILURE");
  assert.equal(first.state.transitionStateCommitted, false);
  assert.equal(first.state.retryEligible, true);
  assert.equal(deps.stateStore.read().activeCandidate, null);
  assert.equal(JSON.stringify(first).includes("provider secret"), false);

  const second = await sendDiscordTradePlanAlertWithDependencies(deps);
  assert.equal(second.primaryReasonCode, "ALERT_DELIVERED");
  assert.equal(fetchCalls, 2);
});

test("provider status mapping is deterministic", () => {
  assert.equal(mapDiscordTradePlanAlertProviderFailure(429), "WEBHOOK_RATE_LIMITED");
  assert.equal(mapDiscordTradePlanAlertProviderFailure(404), "WEBHOOK_REJECTED");
  assert.equal(mapDiscordTradePlanAlertProviderFailure(503), "WEBHOOK_PROVIDER_FAILURE");
});

test("network failure is sanitized and retryable", async () => {
  const deps = dependencies({
    fetch: (async () => {
      throw new Error("network internals");
    }) as typeof fetch,
  });
  const response = await sendDiscordTradePlanAlertWithDependencies(deps);
  assert.equal(response.primaryReasonCode, "WEBHOOK_NETWORK_FAILURE");
  assert.equal(response.state.retryEligible, true);
  assert.equal(JSON.stringify(response).includes("network internals"), false);
});

test("timeout is classified without automatic retry", async () => {
  let calls = 0;
  const deps = dependencies({
    fetch: (async (_input, init) => {
      calls += 1;
      return await new Promise<Response>((_resolve, reject) => {
        init?.signal?.addEventListener("abort", () => {
          const error = new Error("aborted");
          error.name = "AbortError";
          reject(error);
        });
      });
    }) as typeof fetch,
  });
  deps.timeoutMs = 1;
  const response = await sendDiscordTradePlanAlertWithDependencies(deps);
  assert.equal(response.primaryReasonCode, "WEBHOOK_REQUEST_TIMEOUT");
  assert.equal(response.state.retryEligible, true);
  assert.equal(calls, 1);
});

test("serialized sender prevents concurrent duplicate Discord posts", async () => {
  let fetchCalls = 0;
  const deps = dependencies({
    fetch: (async () => {
      fetchCalls += 1;
      await new Promise((resolve) => setTimeout(resolve, 5));
      return new Response("{}", { status: 200 });
    }) as typeof fetch,
  });
  const sender = createSerializedDiscordTradePlanAlertSender(deps);
  const [first, second] = await Promise.all([sender(), sender()]);
  assert.equal(first.primaryReasonCode, "ALERT_DELIVERED");
  assert.equal(second.primaryReasonCode, "NO_EMITTED_TRANSITION");
  assert.equal(fetchCalls, 1);
});

test("payload builder rejects suppressed transitions", () => {
  const response = buildDiscordTradePlanAlertDeliveryResponse({
    reasonCode: "NO_EMITTED_TRANSITION",
    attemptedAtMs: NOW,
    transition: {
      symbol: "SPY",
      product: "SPY_ZERO_DTE_DETERMINISTIC_TRADE_PLAN_ALERT_TRANSITION",
      methodologyVersion: "TRADE_PLAN_ALERT_TRANSITION_V1",
      currentMarketDate: MARKET_DATE,
      evaluatedAt: new Date(NOW).toISOString(),
      engineState: "AVAILABLE",
      transitionState: "SUPPRESSED",
      primaryReasonCode: "NO_CANDIDATE_SUPPRESSED",
      warningCode: null,
      sourceCandidate: null,
      event: null,
      cooldown: {
        reappearanceCooldownMilliseconds: 60_000,
        remainingMilliseconds: 0,
      },
      state: {
        storageMethod: "PROCESS_MEMORY_ONLY",
        marketDateBefore: null,
        marketDateAfter: MARKET_DATE,
        activeCandidateKeyBefore: null,
        activeCandidateKeyAfter: null,
        lastClearedCandidateKeyAfter: null,
        marketDateReset: false,
        mutationApplied: true,
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
    },
    transitionStateCommitted: true,
  });
  assert.throws(() => buildDiscordTradePlanAlertPayload(response.transition as never));
});

test("schema rejects delivered response without committed transition state", () => {
  const deps = dependencies();
  return sendDiscordTradePlanAlertWithDependencies(deps).then((response) => {
    assert.throws(() =>
      DiscordTradePlanAlertDeliveryResponseSchema.parse({
        ...response,
        state: { ...response.state, transitionStateCommitted: false },
      }),
    );
  });
});

test("route validates origin query and body before delivery service", () => {
  const source = readFileSync(
    resolve(process.cwd(), "apps/server/src/routes/discord-webhook.routes.ts"),
    "utf8",
  );
  const routeIndex = source.indexOf('router.post("/trade-plan-alert"');
  const originIndex = source.indexOf("isAllowedAccountRiskOrigin", routeIndex);
  const queryIndex = source.indexOf("Object.keys(req.query)", originIndex);
  const bodyIndex = source.indexOf(
    "DiscordTradePlanAlertDeliveryRequestSchema.safeParse",
    queryIndex,
  );
  const sendIndex = source.indexOf("deps.sendTradePlanAlert()", bodyIndex);
  assert.ok(
    routeIndex >= 0 &&
      originIndex > routeIndex &&
      queryIndex > originIndex &&
      bodyIndex > queryIndex &&
      sendIndex > bodyIndex,
  );
});

test("invalid JSON receives sanitized Discord headers", () => {
  const source = readFileSync(
    resolve(process.cwd(), "apps/server/src/index.ts"),
    "utf8",
  );
  assert.equal(
    source.includes('/api/discord/trade-plan-alert'),
    true,
  );
  assert.equal(
    source.includes('INVALID_DISCORD_TRADE_PLAN_ALERT_REQUEST'),
    true,
  );
});

test("API client validates the explicit delivery route", () => {
  const source = readFileSync(
    resolve(process.cwd(), "apps/web/src/lib/api-client.ts"),
    "utf8",
  );
  assert.equal(source.includes("sendDiscordTradePlanAlert"), true);
  assert.equal(source.includes("/api/discord/trade-plan-alert"), true);
  assert.equal(
    source.includes("DiscordTradePlanAlertDeliveryResponseSchema"),
    true,
  );
});

test("foreground delivery has no direct Prisma private-account or order dependency", () => {
  const source = readFileSync(
    resolve(
      process.cwd(),
      "apps/server/src/services/discord-trade-plan-alert.service.ts",
    ),
    "utf8",
  );
  for (const forbidden of [
    "prisma",
    "account-risk",
    "getAccount",
    "positions",
    "orders",
    "transactions",
    "orderQuantity",
  ]) {
    assert.equal(source.toLowerCase().includes(forbidden.toLowerCase()), false);
  }
});

async function main(): Promise<void> {
  let passed = 0;
  let failed = 0;

  for (const [name, fn] of tests) {
    try {
      resetDiscordTradePlanTransitionFingerprintClaimsForTests();
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
    `\nDiscord Trade Plan alert-delivery tests: ${passed} passed, ${failed} failed`,
  );
  if (failed > 0) process.exitCode = 1;
}

void main();
