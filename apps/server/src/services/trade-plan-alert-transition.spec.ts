/**
 * Deterministic tests for TRADE_PLAN_ALERT_TRANSITION_V1.
 * Run: npx --no-install tsx apps/server/src/services/trade-plan-alert-transition.spec.ts
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  SpyZeroDteTradePlanAlertCandidateResponseSchema,
  SpyZeroDteTradePlanAlertTransitionResponseSchema,
  type SpyZeroDteTradePlanAlertCandidateResponse,
} from "@spy-copilot/shared";
import {
  TRADE_PLAN_ALERT_REAPPEARANCE_COOLDOWN_MS,
  createEmptyTradePlanAlertTransitionMemoryState,
  evaluateSpyZeroDteTradePlanAlertTransition,
} from "./trade-plan-alert-transition.logic";
import {
  createInMemoryTradePlanAlertTransitionStateStore,
  createSerializedTradePlanAlertTransitionEvaluator,
  getSpyZeroDteTradePlanAlertTransitionWithDependencies,
} from "./trade-plan-alert-transition.service";

const MARKET_DATE = "2026-07-20";
const NEXT_MARKET_DATE = "2026-07-21";
const BASE_AT_MS = Date.parse("2026-07-20T14:30:00.000Z");

function candidateResponse(
  overrides: {
    marketDate?: string;
    calculatedAt?: string;
    deduplicationKey?: string;
    contractSymbol?: string;
    direction?: "CALLS" | "PUTS";
    engineState?: "AVAILABLE" | "PARTIAL";
    warningCode?: "RISK_FRAMEWORK_PARTIAL" | null;
  } = {},
): SpyZeroDteTradePlanAlertCandidateResponse {
  const marketDate = overrides.marketDate ?? MARKET_DATE;
  const direction = overrides.direction ?? "CALLS";
  const contractSymbol =
    overrides.contractSymbol ??
    (direction === "CALLS"
      ? "SPY   260720C00640000"
      : "SPY   260720P00640000");
  const deduplicationKey =
    overrides.deduplicationKey ??
    [
      "SPY",
      marketDate,
      "PLAN_READY",
      direction,
      contractSymbol,
      "640.25",
      "640",
      "PRICE_GREATER_THAN",
      "639.5",
      "642",
    ].join("|");

  return SpyZeroDteTradePlanAlertCandidateResponseSchema.parse({
    symbol: "SPY",
    product: "SPY_ZERO_DTE_DETERMINISTIC_TRADE_PLAN_ALERT_CANDIDATE",
    methodologyVersion: "TRADE_PLAN_ALERT_CANDIDATE_V1",
    currentMarketDate: marketDate,
    calculatedAt: overrides.calculatedAt ?? "2026-07-20T14:30:00.000Z",
    engineState: overrides.engineState ?? "AVAILABLE",
    alertState: "CANDIDATE",
    primaryReasonCode: "PLAN_READY_CANDIDATE",
    warningCode: overrides.warningCode ?? null,
    sourceAssembly: {
      product: "SPY_ZERO_DTE_DETERMINISTIC_TRADE_PLAN_ASSEMBLY",
      methodologyVersion: "ASSEMBLY_V1",
      currentMarketDate: marketDate,
      calculatedAt: overrides.calculatedAt ?? "2026-07-20T14:29:59.000Z",
      engineState: overrides.engineState ?? "AVAILABLE",
      planState: "READY",
      direction,
      primaryReasonCode: "TRADE_PLAN_READY",
      warningCode: overrides.warningCode ?? null,
    },
    candidate: {
      deduplicationKey,
      category: "PLAN_READY",
      severity: "OPPORTUNITY",
      title: `Qualified ${direction} plan ready for review`,
      message: `The deterministic ${direction} structure is qualified with ${contractSymbol} selected. Revalidate all live values before any independently entered order.`,
      direction,
      currentPrice: 640.25,
      planningReferenceType: "CURRENT_PRICE",
      planningReferencePrice: 640.25,
      triggerLevel: 640,
      triggerComparison: "PRICE_GREATER_THAN",
      selectedContractSymbol: contractSymbol,
      selectedContractAsk: 1.25,
      selectedContractQuoteAt: "2026-07-20T14:29:59.000Z",
      structuralInvalidationLevel: 639.5,
      primaryObjectiveLevel: 642,
      rewardRiskRatio: 2.3333333333,
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

function suppressedResponse(
  marketDate = MARKET_DATE,
): SpyZeroDteTradePlanAlertCandidateResponse {
  return SpyZeroDteTradePlanAlertCandidateResponseSchema.parse({
    symbol: "SPY",
    product: "SPY_ZERO_DTE_DETERMINISTIC_TRADE_PLAN_ALERT_CANDIDATE",
    methodologyVersion: "TRADE_PLAN_ALERT_CANDIDATE_V1",
    currentMarketDate: marketDate,
    calculatedAt: "2026-07-20T14:31:00.000Z",
    engineState: "AVAILABLE",
    alertState: "SUPPRESSED",
    primaryReasonCode: "NOT_APPLICABLE_SUPPRESSED",
    warningCode: null,
    sourceAssembly: {
      product: "SPY_ZERO_DTE_DETERMINISTIC_TRADE_PLAN_ASSEMBLY",
      methodologyVersion: "ASSEMBLY_V1",
      currentMarketDate: marketDate,
      calculatedAt: "2026-07-20T14:30:59.000Z",
      engineState: "AVAILABLE",
      planState: "NOT_APPLICABLE",
      direction: "NONE",
      primaryReasonCode: "TRADE_PLAN_NOT_APPLICABLE",
      warningCode: null,
    },
    candidate: null,
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

function unavailableResponse(): SpyZeroDteTradePlanAlertCandidateResponse {
  return SpyZeroDteTradePlanAlertCandidateResponseSchema.parse({
    symbol: "SPY",
    product: "SPY_ZERO_DTE_DETERMINISTIC_TRADE_PLAN_ALERT_CANDIDATE",
    methodologyVersion: "TRADE_PLAN_ALERT_CANDIDATE_V1",
    currentMarketDate: MARKET_DATE,
    calculatedAt: "2026-07-20T14:31:00.000Z",
    engineState: "UNAVAILABLE",
    alertState: "UNAVAILABLE",
    primaryReasonCode: "SOURCE_ASSEMBLY_UNAVAILABLE",
    warningCode: null,
    sourceAssembly: {
      product: "SPY_ZERO_DTE_DETERMINISTIC_TRADE_PLAN_ASSEMBLY",
      methodologyVersion: "ASSEMBLY_V1",
      currentMarketDate: MARKET_DATE,
      calculatedAt: "2026-07-20T14:30:59.000Z",
      engineState: "UNAVAILABLE",
      planState: "UNAVAILABLE",
      direction: "NONE",
      primaryReasonCode: "TRADE_PLAN_UNAVAILABLE",
      warningCode: null,
    },
    candidate: null,
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

type Test = { name: string; run: () => void | Promise<void> };
const tests: Test[] = [];
function test(name: string, run: Test["run"]): void {
  tests.push({ name, run });
}

function initialEvaluation() {
  return evaluateSpyZeroDteTradePlanAlertTransition(
    candidateResponse(),
    createEmptyTradePlanAlertTransitionMemoryState(),
    BASE_AT_MS,
  );
}

test("methodology is TRADE_PLAN_ALERT_TRANSITION_V1", () => {
  const { response } = initialEvaluation();
  assert.equal(response.methodologyVersion, "TRADE_PLAN_ALERT_TRANSITION_V1");
  assert.equal(
    response.methodology.reappearanceCooldownMilliseconds,
    TRADE_PLAN_ALERT_REAPPEARANCE_COOLDOWN_MS,
  );
});

test("first meaningful candidate emits INITIAL_CANDIDATE", () => {
  const { response, nextState } = initialEvaluation();
  assert.equal(response.transitionState, "EMIT");
  assert.equal(response.primaryReasonCode, "INITIAL_CANDIDATE_EMIT");
  assert.equal(response.event?.transitionType, "INITIAL_CANDIDATE");
  assert.equal(
    nextState.activeCandidate?.deduplicationKey,
    candidateResponse().candidate?.deduplicationKey,
  );
});

test("same active candidate is suppressed as a duplicate", () => {
  const first = initialEvaluation();
  const second = evaluateSpyZeroDteTradePlanAlertTransition(
    candidateResponse({ calculatedAt: "2026-07-20T14:30:10.000Z" }),
    first.nextState,
    BASE_AT_MS + 10_000,
  );
  assert.equal(second.response.transitionState, "SUPPRESSED");
  assert.equal(second.response.primaryReasonCode, "ACTIVE_DUPLICATE_SUPPRESSED");
  assert.equal(second.response.event, null);
  assert.equal(second.response.state.mutationApplied, false);
});

test("a changed candidate key emits CANDIDATE_CHANGED", () => {
  const first = initialEvaluation();
  const changed = candidateResponse({
    deduplicationKey: "SPY|2026-07-20|PLAN_READY|CALLS|CHANGED_CONTRACT",
    contractSymbol: "SPY   260720C00641000",
  });
  const second = evaluateSpyZeroDteTradePlanAlertTransition(
    changed,
    first.nextState,
    BASE_AT_MS + 15_000,
  );
  assert.equal(second.response.primaryReasonCode, "CANDIDATE_CHANGED_EMIT");
  assert.equal(second.response.event?.transitionType, "CANDIDATE_CHANGED");
  assert.notEqual(
    second.response.event?.previousCandidate?.deduplicationKey,
    second.response.event?.currentCandidate?.deduplicationKey,
  );
});

test("an active candidate disappearing emits CANDIDATE_CLEARED", () => {
  const first = initialEvaluation();
  const cleared = evaluateSpyZeroDteTradePlanAlertTransition(
    suppressedResponse(),
    first.nextState,
    BASE_AT_MS + 20_000,
  );
  assert.equal(cleared.response.primaryReasonCode, "CANDIDATE_CLEARED_EMIT");
  assert.equal(cleared.response.event?.transitionType, "CANDIDATE_CLEARED");
  assert.equal(cleared.nextState.activeCandidate, null);
  assert.ok(cleared.nextState.lastClearedCandidate);
});

test("continued absence after a clear is suppressed", () => {
  const first = initialEvaluation();
  const cleared = evaluateSpyZeroDteTradePlanAlertTransition(
    suppressedResponse(),
    first.nextState,
    BASE_AT_MS + 20_000,
  );
  const absent = evaluateSpyZeroDteTradePlanAlertTransition(
    suppressedResponse(),
    cleared.nextState,
    BASE_AT_MS + 30_000,
  );
  assert.equal(absent.response.primaryReasonCode, "NO_CANDIDATE_SUPPRESSED");
  assert.equal(absent.response.state.mutationApplied, false);
});

test("same candidate reappearance inside cooldown is suppressed", () => {
  const first = initialEvaluation();
  const clearedAt = BASE_AT_MS + 20_000;
  const cleared = evaluateSpyZeroDteTradePlanAlertTransition(
    suppressedResponse(),
    first.nextState,
    clearedAt,
  );
  const reappeared = evaluateSpyZeroDteTradePlanAlertTransition(
    candidateResponse(),
    cleared.nextState,
    clearedAt + 10_000,
  );
  assert.equal(
    reappeared.response.primaryReasonCode,
    "REAPPEARANCE_COOLDOWN_SUPPRESSED",
  );
  assert.equal(
    reappeared.response.cooldown.remainingMilliseconds,
    TRADE_PLAN_ALERT_REAPPEARANCE_COOLDOWN_MS - 10_000,
  );
  assert.equal(reappeared.nextState.activeCandidate, null);
});

test("same candidate after cooldown emits CANDIDATE_REAPPEARED", () => {
  const first = initialEvaluation();
  const clearedAt = BASE_AT_MS + 20_000;
  const cleared = evaluateSpyZeroDteTradePlanAlertTransition(
    suppressedResponse(),
    first.nextState,
    clearedAt,
  );
  const reappeared = evaluateSpyZeroDteTradePlanAlertTransition(
    candidateResponse(),
    cleared.nextState,
    clearedAt + TRADE_PLAN_ALERT_REAPPEARANCE_COOLDOWN_MS,
  );
  assert.equal(reappeared.response.primaryReasonCode, "CANDIDATE_REAPPEARED_EMIT");
  assert.equal(reappeared.response.event?.transitionType, "CANDIDATE_REAPPEARED");
  assert.equal(reappeared.response.cooldown.remainingMilliseconds, 0);
});

test("a different candidate after clear emits immediately", () => {
  const first = initialEvaluation();
  const cleared = evaluateSpyZeroDteTradePlanAlertTransition(
    suppressedResponse(),
    first.nextState,
    BASE_AT_MS + 20_000,
  );
  const changed = evaluateSpyZeroDteTradePlanAlertTransition(
    candidateResponse({
      deduplicationKey: "SPY|2026-07-20|PLAN_READY|PUTS|NEW",
      contractSymbol: "SPY   260720P00640000",
      direction: "PUTS",
    }),
    cleared.nextState,
    BASE_AT_MS + 25_000,
  );
  assert.equal(changed.response.primaryReasonCode, "CANDIDATE_CHANGED_EMIT");
  assert.equal(changed.response.event?.transitionType, "CANDIDATE_CHANGED");
});

test("unavailable source does not mutate process state", () => {
  const first = initialEvaluation();
  const unavailable = evaluateSpyZeroDteTradePlanAlertTransition(
    unavailableResponse(),
    first.nextState,
    BASE_AT_MS + 30_000,
  );
  assert.equal(unavailable.response.transitionState, "UNAVAILABLE");
  assert.equal(unavailable.response.primaryReasonCode, "SOURCE_CANDIDATE_UNAVAILABLE");
  assert.equal(unavailable.response.state.mutationApplied, false);
  assert.deepEqual(unavailable.nextState, first.nextState);
});

test("new market date resets old state before a first candidate", () => {
  const first = initialEvaluation();
  const nextDay = evaluateSpyZeroDteTradePlanAlertTransition(
    candidateResponse({
      marketDate: NEXT_MARKET_DATE,
      calculatedAt: "2026-07-21T14:30:00.000Z",
      deduplicationKey: "SPY|2026-07-21|PLAN_READY|CALLS|NEW_DAY",
    }),
    first.nextState,
    Date.parse("2026-07-21T14:30:01.000Z"),
  );
  assert.equal(nextDay.response.primaryReasonCode, "INITIAL_CANDIDATE_EMIT");
  assert.equal(nextDay.response.state.marketDateReset, true);
  assert.equal(nextDay.response.state.marketDateAfter, NEXT_MARKET_DATE);
});

test("new market date without a candidate resets quietly", () => {
  const first = initialEvaluation();
  const nextDay = evaluateSpyZeroDteTradePlanAlertTransition(
    suppressedResponse(NEXT_MARKET_DATE),
    first.nextState,
    Date.parse("2026-07-21T14:30:01.000Z"),
  );
  assert.equal(nextDay.response.primaryReasonCode, "MARKET_DATE_RESET_SUPPRESSED");
  assert.equal(nextDay.response.state.marketDateReset, true);
  assert.equal(nextDay.nextState.activeCandidate, null);
});

test("PARTIAL candidate remains eligible with warning preserved", () => {
  const partial = evaluateSpyZeroDteTradePlanAlertTransition(
    candidateResponse({ engineState: "PARTIAL", warningCode: "RISK_FRAMEWORK_PARTIAL" }),
    createEmptyTradePlanAlertTransitionMemoryState(),
    BASE_AT_MS,
  );
  assert.equal(partial.response.transitionState, "EMIT");
  assert.equal(partial.response.engineState, "PARTIAL");
  assert.equal(partial.response.warningCode, "RISK_FRAMEWORK_PARTIAL");
});

test("transition fingerprint ignores evaluation timestamp", () => {
  const first = initialEvaluation();
  const second = evaluateSpyZeroDteTradePlanAlertTransition(
    candidateResponse(),
    createEmptyTradePlanAlertTransitionMemoryState(),
    BASE_AT_MS + 45_000,
  );
  assert.equal(
    first.response.event?.transitionFingerprint,
    second.response.event?.transitionFingerprint,
  );
});

test("transition fingerprint changes with candidate key", () => {
  const first = initialEvaluation();
  const second = evaluateSpyZeroDteTradePlanAlertTransition(
    candidateResponse({ deduplicationKey: "SPY|2026-07-20|PLAN_READY|DIFFERENT" }),
    createEmptyTradePlanAlertTransitionMemoryState(),
    BASE_AT_MS,
  );
  assert.notEqual(
    first.response.event?.transitionFingerprint,
    second.response.event?.transitionFingerprint,
  );
});

test("every produced response validates against the shared schema", () => {
  const first = initialEvaluation();
  const duplicate = evaluateSpyZeroDteTradePlanAlertTransition(
    candidateResponse(),
    first.nextState,
    BASE_AT_MS + 1_000,
  );
  const cleared = evaluateSpyZeroDteTradePlanAlertTransition(
    suppressedResponse(),
    first.nextState,
    BASE_AT_MS + 2_000,
  );
  const unavailable = evaluateSpyZeroDteTradePlanAlertTransition(
    unavailableResponse(),
    first.nextState,
    BASE_AT_MS + 3_000,
  );
  for (const result of [first, duplicate, cleared, unavailable]) {
    assert.equal(
      SpyZeroDteTradePlanAlertTransitionResponseSchema.safeParse(result.response)
        .success,
      true,
    );
  }
});

test("schema rejects EMIT without an event", () => {
  const response = structuredClone(initialEvaluation().response);
  response.event = null;
  assert.equal(
    SpyZeroDteTradePlanAlertTransitionResponseSchema.safeParse(response).success,
    false,
  );
});

test("schema rejects SUPPRESSED with an event", () => {
  const first = initialEvaluation();
  const duplicate = evaluateSpyZeroDteTradePlanAlertTransition(
    candidateResponse(),
    first.nextState,
    BASE_AT_MS + 1_000,
  ).response;
  duplicate.event = structuredClone(first.response.event);
  assert.equal(
    SpyZeroDteTradePlanAlertTransitionResponseSchema.safeParse(duplicate).success,
    false,
  );
});

test("schema rejects cooldown suppression without remaining time", () => {
  const first = initialEvaluation();
  const cleared = evaluateSpyZeroDteTradePlanAlertTransition(
    suppressedResponse(),
    first.nextState,
    BASE_AT_MS + 10_000,
  );
  const cooldown = evaluateSpyZeroDteTradePlanAlertTransition(
    candidateResponse(),
    cleared.nextState,
    BASE_AT_MS + 20_000,
  ).response;
  cooldown.cooldown.remainingMilliseconds = 0;
  assert.equal(
    SpyZeroDteTradePlanAlertTransitionResponseSchema.safeParse(cooldown).success,
    false,
  );
});

test("methodology explicitly excludes persistence scheduler and delivery", () => {
  const response = initialEvaluation().response;
  assert.equal(response.methodology.persistenceMethod, "NONE");
  assert.equal(response.methodology.schedulerMethod, "NONE");
  assert.equal(response.methodology.deliveryMethod, "NONE");
  assert.equal(response.disclosures.processMemoryOnly, true);
  assert.equal(response.disclosures.resetsOnProcessRestart, true);
});

test("transition payload contains no private account or execution fields", () => {
  const serialized = JSON.stringify(initialEvaluation().response).toLowerCase();
  for (const prohibited of [
    "accountnumber",
    "accounthash",
    "access_token",
    "refresh_token",
    "orderquantity",
    "orderpayload",
    "webhook",
  ]) {
    assert.equal(serialized.includes(prohibited), false, prohibited);
  }
});

test("transition event copy contains no buy or sell instruction", () => {
  const messages = [
    initialEvaluation().response.event?.title,
    initialEvaluation().response.event?.message,
  ]
    .filter((value): value is string => typeof value === "string")
    .join(" ")
    .toLowerCase();
  assert.equal(/\bbuy\b|\bsell\b/.test(messages), false);
});

test("service retrieves the candidate exactly once", async () => {
  let calls = 0;
  const store = createInMemoryTradePlanAlertTransitionStateStore();
  const response = await getSpyZeroDteTradePlanAlertTransitionWithDependencies({
    getCandidate: async () => {
      calls += 1;
      return candidateResponse();
    },
    stateStore: store,
    now: () => BASE_AT_MS,
    cooldownMs: TRADE_PLAN_ALERT_REAPPEARANCE_COOLDOWN_MS,
    getMarketDate: () => MARKET_DATE,
  });
  assert.equal(calls, 1);
  assert.equal(response.transitionState, "EMIT");
});

test("service writes state only when evaluation mutates", async () => {
  let writes = 0;
  const backing = createInMemoryTradePlanAlertTransitionStateStore();
  const store = {
    read: backing.read,
    write: (state: ReturnType<typeof backing.read>) => {
      writes += 1;
      backing.write(state);
    },
  };
  const dependencies = {
    getCandidate: async () => candidateResponse(),
    stateStore: store,
    now: () => BASE_AT_MS,
    cooldownMs: TRADE_PLAN_ALERT_REAPPEARANCE_COOLDOWN_MS,
    getMarketDate: () => MARKET_DATE,
  };
  await getSpyZeroDteTradePlanAlertTransitionWithDependencies(dependencies);
  await getSpyZeroDteTradePlanAlertTransitionWithDependencies({
    ...dependencies,
    now: () => BASE_AT_MS + 1_000,
  });
  assert.equal(writes, 1);
});

test("service failure returns unavailable without mutating state", async () => {
  let writes = 0;
  const initial = initialEvaluation().nextState;
  const backing = createInMemoryTradePlanAlertTransitionStateStore(initial);
  const response = await getSpyZeroDteTradePlanAlertTransitionWithDependencies({
    getCandidate: async () => {
      throw new Error("fixed test failure");
    },
    stateStore: {
      read: backing.read,
      write: (state) => {
        writes += 1;
        backing.write(state);
      },
    },
    now: () => BASE_AT_MS,
    cooldownMs: TRADE_PLAN_ALERT_REAPPEARANCE_COOLDOWN_MS,
    getMarketDate: () => MARKET_DATE,
  });
  assert.equal(response.primaryReasonCode, "SOURCE_CANDIDATE_SERVICE_FAILURE");
  assert.equal(response.transitionState, "UNAVAILABLE");
  assert.equal(writes, 0);
});

test("invalid source response fails closed without state mutation", async () => {
  let writes = 0;
  const response = await getSpyZeroDteTradePlanAlertTransitionWithDependencies({
    getCandidate: async () => ({ invalid: true }),
    stateStore: {
      read: () => createEmptyTradePlanAlertTransitionMemoryState(),
      write: () => {
        writes += 1;
      },
    },
    now: () => BASE_AT_MS,
    cooldownMs: TRADE_PLAN_ALERT_REAPPEARANCE_COOLDOWN_MS,
    getMarketDate: () => MARKET_DATE,
  });
  assert.equal(response.primaryReasonCode, "SOURCE_CANDIDATE_INCONSISTENT");
  assert.equal(writes, 0);
});

test("serialized evaluator prevents concurrent duplicate emissions", async () => {
  const resolvers: Array<(value: unknown) => void> = [];
  let calls = 0;
  let now = BASE_AT_MS;
  const evaluate = createSerializedTradePlanAlertTransitionEvaluator({
    getCandidate: () => {
      calls += 1;
      return new Promise((resolve) => resolvers.push(resolve));
    },
    stateStore: createInMemoryTradePlanAlertTransitionStateStore(),
    now: () => now++,
    cooldownMs: TRADE_PLAN_ALERT_REAPPEARANCE_COOLDOWN_MS,
    getMarketDate: () => MARKET_DATE,
  });

  const firstPromise = evaluate();
  const secondPromise = evaluate();
  await Promise.resolve();
  assert.equal(calls, 1);
  resolvers[0]?.(candidateResponse());
  const first = await firstPromise;
  await Promise.resolve();
  assert.equal(calls, 2);
  resolvers[1]?.(candidateResponse());
  const second = await secondPromise;
  assert.equal(first.transitionState, "EMIT");
  assert.equal(second.primaryReasonCode, "ACTIVE_DUPLICATE_SUPPRESSED");
});

test("route is GET-only no-store and rejects query parameters", () => {
  const route = readFileSync(
    "apps/server/src/routes/trade-plan-alert.routes.ts",
    "utf8",
  );
  assert.match(route, /get\("\/spy\/transition"/);
  assert.doesNotMatch(route, /post\("\/spy\/transition"/);
  assert.match(route, /Cache-Control", "no-store"/);
  assert.match(route, /Object\.keys\(req\.query\)\.length > 0/);
  assert.match(route, /QUERY_PARAMETERS_NOT_SUPPORTED/);
});

test("API client validates the no-store transition route", () => {
  const client = readFileSync("apps/web/src/lib/api-client.ts", "utf8");
  assert.match(client, /getSpyZeroDteTradePlanAlertTransition/);
  assert.match(client, /\/api\/trade-plan-alert\/spy\/transition/);
  assert.match(client, /SpyZeroDteTradePlanAlertTransitionResponseSchema/);
  assert.match(
    client,
    /getPrivateNoStoreJson\([\s\S]*\/api\/trade-plan-alert\/spy\/transition/,
  );
});

test("transition service has no database delivery or private account dependency", () => {
  const service = readFileSync(
    "apps/server/src/services/trade-plan-alert-transition.service.ts",
    "utf8",
  );
  for (const prohibited of [
    "prisma",
    "discord",
    "webhook",
    "account-risk",
    "schwab-account",
    "order",
    "transaction",
  ]) {
    assert.equal(service.toLowerCase().includes(prohibited), false, prohibited);
  }
  assert.match(service, /getSpyZeroDteTradePlanAlertCandidate/);
});

async function main(): Promise<void> {
  let passed = 0;
  for (const { name, run } of tests) {
    try {
      await run();
      passed += 1;
      console.log(`✓ ${name}`);
    } catch (error) {
      console.error(`✗ ${name}`);
      console.error(error);
    }
  }

  console.log(
    `\nTrade Plan alert-transition tests: ${passed} passed, ${tests.length - passed} failed`,
  );
  if (passed !== tests.length) process.exitCode = 1;
}

void main();
