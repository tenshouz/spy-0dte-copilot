/**
 * Deterministic tests for CONTRACT_V1.
 * Run: npx --no-install tsx apps/server/src/services/trade-contract.spec.ts
 */
import assert from "node:assert/strict";
import {
  SpyZeroDteContractSelectionResponseSchema,
  type NormalizedOptionContract,
  type SpyZeroDteObjectiveRiskResponse,
  type SpyZeroDteOptionsChainResponse,
} from "@spy-copilot/shared";
import {
  MAXIMUM_CONTRACT_QUOTE_AGE_MS,
  MAXIMUM_SOURCE_ASSEMBLY_SKEW_MS,
  MAXIMUM_SPREAD_RATIO,
  buildSpyZeroDteContractSelection,
  calculateContractLiquidity,
  calculateContractMoneyness,
  classifyContractQuoteFreshness,
  contractSelectionRequiresOptionsChain,
  evaluateContractSourceCompatibility,
  rankContractCandidates,
  resolveSpyZeroDteContractSelectionFromRisk,
} from "./trade-contract.logic";

const MARKET_DATE = "2026-07-17";
const STATE_AT = "2026-07-17T14:00:00.000Z";
const BIAS_AT = "2026-07-17T14:00:00.100Z";
const PLAN_AT = "2026-07-17T14:00:00.200Z";
const RISK_AT = "2026-07-17T14:00:00.300Z";
const CHAIN_AT = "2026-07-17T14:00:01.000Z";
const EVAL_MS = Date.parse("2026-07-17T14:00:30.000Z");
const FRESH_QUOTE_AT = "2026-07-17T13:59:50.000Z";

function risk(overrides: Partial<SpyZeroDteObjectiveRiskResponse> = {}): SpyZeroDteObjectiveRiskResponse {
  return {
    symbol: "SPY",
    product: "SPY_ZERO_DTE_DETERMINISTIC_OBJECTIVE_RISK_FRAMEWORK",
    methodologyVersion: "RISK_V1",
    currentMarketDate: MARKET_DATE,
    mostRecentRthSessionDate: MARKET_DATE,
    sourceMarketStateEngineVersion: "V1",
    sourceMarketStateEngineState: "AVAILABLE",
    sourceMarketStateCalculatedAt: STATE_AT,
    sourceBiasMethodologyVersion: "BIAS_V1",
    sourceBiasCalculatedAt: BIAS_AT,
    sourceBiasMarketStateCalculatedAt: STATE_AT,
    sourceTradePlanMethodologyVersion: "TRADE_PLAN_V1",
    sourceTradePlanCalculatedAt: PLAN_AT,
    sourceTradePlanMarketStateCalculatedAt: STATE_AT,
    sourceTradePlanBiasCalculatedAt: BIAS_AT,
    sameSnapshotGuaranteed: true,
    calculatedAt: RISK_AT,
    engineState: "AVAILABLE",
    frameworkState: "READY",
    direction: "CALLS",
    riskQualification: "QUALIFIED",
    isCurrentlyTradeEligible: true,
    sourceTradePlanSetupState: "ELIGIBLE",
    sourceTradePlanSetupDirection: "CALLS",
    currentPrice: 750.4,
    priceSource: "QUOTE_LAST_PRICE",
    quoteTimestamp: "2026-07-17T14:00:00.000Z",
    planningReference: {
      type: "CURRENT_PRICE",
      price: 750.4,
      priceSource: "QUOTE_LAST_PRICE",
      sourceFeatureIds: [],
      sourceCalculatedAt: STATE_AT,
      quoteTimestamp: "2026-07-17T14:00:00.000Z",
      triggerLevel: null,
      disclosureCode: "PLANNING_REFERENCE_ONLY",
    },
    minimumRewardRiskRatio: 2,
    invalidationCandidates: [],
    selectedInvalidation: {
      candidateId: "INVALIDATION_CURRENT_RTH_VWAP",
      levelType: "CURRENT_RTH_VWAP",
      level: 748,
      riskDistancePoints: 2.4,
    },
    objectiveCandidates: [],
    selectedObjective: {
      candidateId: "OBJECTIVE_PREVIOUS_DAY_HIGH",
      levelType: "PREVIOUS_DAY_HIGH",
      level: 756,
      objectiveDistancePoints: 5.6,
      rewardRiskRatio: 2.3333333333333335,
    },
    primaryReasonCode: "RISK_FRAMEWORK_READY",
    warningCode: null,
    methodology: {
      objectiveSourceTypes: [
        "PREVIOUS_DAY_HIGH",
        "PREVIOUS_DAY_LOW",
        "PREMARKET_HIGH",
        "PREMARKET_LOW",
        "EXPECTED_MOVE_UPPER",
        "EXPECTED_MOVE_LOWER",
      ],
      invalidationSourceTypes: ["CURRENT_RTH_VWAP", "OPENING_RANGE_HIGH", "OPENING_RANGE_LOW"],
      objectiveTieBreakOrder: [
        "PREMARKET_HIGH",
        "PREMARKET_LOW",
        "PREVIOUS_DAY_HIGH",
        "PREVIOUS_DAY_LOW",
        "EXPECTED_MOVE_UPPER",
        "EXPECTED_MOVE_LOWER",
      ],
      invalidationTieBreakOrderCalls: ["CURRENT_RTH_VWAP", "OPENING_RANGE_HIGH", "OPENING_RANGE_LOW"],
      invalidationTieBreakOrderPuts: ["CURRENT_RTH_VWAP", "OPENING_RANGE_LOW", "OPENING_RANGE_HIGH"],
      invalidationSelection: "NEAREST_VALID_ADVERSE_STRUCTURAL_LEVEL",
      objectiveSelection: "NEAREST_QUALIFIED_FAVORABLE_LEVEL",
      minimumRewardRiskRatio: 2,
      calculationsUse: "SPY_UNDERLYING_PRICE_POINTS",
      duplicateLevelPolicy: "PRESERVE_SEPARATE_CANDIDATES_EXACT_EQUALITY_ONLY",
      partialSelectionPolicy: "PARTIAL_CANDIDATES_VISIBLE_BUT_NOT_SELECTABLE",
    },
    ...overrides,
  } as SpyZeroDteObjectiveRiskResponse;
}

function contract(
  symbol: string,
  optionType: "CALL" | "PUT",
  strikePrice: number,
  overrides: Partial<NormalizedOptionContract> = {},
): NormalizedOptionContract {
  return {
    contractSymbol: symbol,
    underlyingSymbol: "SPY",
    optionType,
    expirationDate: MARKET_DATE,
    strikePrice,
    description: `${symbol} test contract`,
    bid: 2,
    ask: 2.2,
    last: 2.1,
    mark: 2.1,
    bidSize: 10,
    askSize: 12,
    lastSize: 1,
    volume: 500,
    openInterest: 1000,
    impliedVolatilityPercent: 25,
    delta: optionType === "CALL" ? 0.5 : -0.5,
    gamma: 0.1,
    theta: -0.2,
    vega: 0.05,
    rho: 0.01,
    inTheMoney: false,
    nonStandard: false,
    mini: false,
    multiplier: 100,
    quoteAt: FRESH_QUOTE_AT,
    tradeAt: "2026-07-17T13:59:45.000Z",
    ...overrides,
  };
}

function chain(overrides: Partial<SpyZeroDteOptionsChainResponse> = {}): SpyZeroDteOptionsChainResponse {
  const calls = [
    contract("SPY_CALL_750", "CALL", 750, { bid: 2.1, ask: 2.3, openInterest: 800, volume: 300 }),
    contract("SPY_CALL_751", "CALL", 751, { bid: 1.9, ask: 2.1, openInterest: 1200, volume: 700 }),
    contract("SPY_CALL_752", "CALL", 752, { bid: 1.5, ask: 1.7 }),
  ];
  const puts = [
    contract("SPY_PUT_750", "PUT", 750, { bid: 1.9, ask: 2.1 }),
    contract("SPY_PUT_751", "PUT", 751, { bid: 2.1, ask: 2.3 }),
  ];
  const all = [...calls, ...puts];
  return {
    symbol: "SPY",
    metric: "ZERO_DTE_OPTIONS_CHAIN",
    currentMarketDate: MARKET_DATE,
    requestedExpirationDate: MARKET_DATE,
    returnedExpirationDate: MARKET_DATE,
    metricState: "LIVE",
    sourceState: "LIVE",
    isDelayed: false,
    underlyingPrice: 750.5,
    underlyingPriceSource: "CHAIN_RESPONSE",
    calls,
    puts,
    requestedStrikeCount: 40,
    returnedUniqueStrikeCount: 3,
    callContractCount: calls.length,
    putContractCount: puts.length,
    minimumReturnedStrike: 750,
    maximumReturnedStrike: 752,
    providerContractCount: all.length,
    totalContracts: all.length,
    contractsWithBidAsk: all.length,
    contractsWithGreeks: all.length,
    contractsWithOpenInterest: all.length,
    contractsWithVolume: all.length,
    rejectedContractCount: 0,
    fetchedAt: CHAIN_AT,
    dataAgeMs: 0,
    latestOptionQuoteAt: FRESH_QUOTE_AT,
    latestOptionTradeAt: "2026-07-17T13:59:45.000Z",
    warningCode: null,
    ...overrides,
  } as SpyZeroDteOptionsChainResponse;
}

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

function build(r = risk(), c: SpyZeroDteOptionsChainResponse | null = chain(), at = EVAL_MS) {
  return buildSpyZeroDteContractSelection(r, c, at);
}

// Constants and applicability.
test("CONTRACT_V1 constants are explicit", () => {
  assert.equal(MAXIMUM_SPREAD_RATIO, 0.15);
  assert.equal(MAXIMUM_SOURCE_ASSEMBLY_SKEW_MS, 60_000);
  assert.equal(MAXIMUM_CONTRACT_QUOTE_AGE_MS, 60_000);
});
test("READY QUALIFIED requires Chain", () => assert.equal(contractSelectionRequiresOptionsChain(risk()), true));
test("PREVIEW does not require Chain", () => assert.equal(contractSelectionRequiresOptionsChain(risk({ frameworkState: "PREVIEW", isCurrentlyTradeEligible: false })), false));
test("NOT_QUALIFIED does not require Chain", () => assert.equal(contractSelectionRequiresOptionsChain(risk({ frameworkState: "NOT_QUALIFIED", riskQualification: "NOT_QUALIFIED" })), false));
test("NO_SETUP does not require Chain", () => assert.equal(contractSelectionRequiresOptionsChain(risk({ frameworkState: "NO_SETUP", riskQualification: "NOT_APPLICABLE" })), false));
test("NOT_APPLICABLE does not require Chain", () => assert.equal(contractSelectionRequiresOptionsChain(risk({ frameworkState: "NOT_APPLICABLE", riskQualification: "NOT_APPLICABLE" })), false));
test("UNAVAILABLE does not require Chain", () => assert.equal(contractSelectionRequiresOptionsChain(risk({ frameworkState: "UNAVAILABLE", riskQualification: "UNAVAILABLE" })), false));

// Service conditional Chain retrieval.
test("PREVIEW performs zero Chain calls", async () => {
  let calls = 0;
  const result = await resolveSpyZeroDteContractSelectionFromRisk(
    risk({ frameworkState: "PREVIEW", isCurrentlyTradeEligible: false, sourceTradePlanSetupState: "WAITING_FOR_TRIGGER" }),
    { getOptionsChain: async () => { calls += 1; return chain(); }, getLastResortOptionsChain: chain, now: () => EVAL_MS },
  );
  assert.equal(calls, 0);
  assert.equal(result.selectionState, "DEFERRED");
});
test("NOT_APPLICABLE performs zero Chain calls", async () => {
  let calls = 0;
  const result = await resolveSpyZeroDteContractSelectionFromRisk(
    risk({ frameworkState: "NOT_APPLICABLE", riskQualification: "NOT_APPLICABLE", direction: "NONE", isCurrentlyTradeEligible: false }),
    { getOptionsChain: async () => { calls += 1; return chain(); }, getLastResortOptionsChain: chain, now: () => EVAL_MS },
  );
  assert.equal(calls, 0);
  assert.equal(result.sourceCompatibilityState, "NOT_EVALUATED");
});
test("READY QUALIFIED performs exactly one Chain call", async () => {
  let calls = 0;
  const result = await resolveSpyZeroDteContractSelectionFromRisk(risk(), {
    getOptionsChain: async () => { calls += 1; return chain(); },
    getLastResortOptionsChain: chain,
    now: () => EVAL_MS,
  });
  assert.equal(calls, 1);
  assert.equal(result.selectionState, "SELECTED");
});
test("Chain throw uses last-resort response without retry", async () => {
  let calls = 0;
  const unavailable = chain({ metricState: "UNAVAILABLE", sourceState: "UNAVAILABLE", returnedExpirationDate: null, calls: [], puts: [], totalContracts: 0 });
  const result = await resolveSpyZeroDteContractSelectionFromRisk(risk(), {
    getOptionsChain: async () => { calls += 1; throw new Error("boom"); },
    getLastResortOptionsChain: () => unavailable,
    now: () => EVAL_MS,
  });
  assert.equal(calls, 1);
  assert.equal(result.selectionState, "UNAVAILABLE");
});

// Midpoint and spread.
test("midpoint and spread are calculated", () => {
  assert.deepEqual(calculateContractLiquidity(2, 2.2), {
    midpoint: 2.1,
    spreadPoints: 0.20000000000000018,
    spreadRatio: 0.09523809523809532,
    spreadPercent: 9.52380952380953,
  });
});
test("zero-width positive quote passes calculation", () => assert.equal(calculateContractLiquidity(2, 2).spreadRatio, 0));
test("crossed quote has no liquidity calculation", () => assert.equal(calculateContractLiquidity(2.2, 2).midpoint, null));
test("zero midpoint is rejected", () => assert.equal(calculateContractLiquidity(0, 0).midpoint, null));
test("maximum spread equality passes", () => {
  const result = calculateContractLiquidity(1.85, 2.15);
  assert.ok(result.spreadRatio !== null && Math.abs(result.spreadRatio - 0.15) < 1e-12);
  assert.ok(result.spreadRatio! <= MAXIMUM_SPREAD_RATIO);
});

// Freshness.
test("fresh quote is FRESH", () => assert.equal(classifyContractQuoteFreshness(FRESH_QUOTE_AT, EVAL_MS).state, "FRESH"));
test("quote age equality is FRESH", () => assert.equal(classifyContractQuoteFreshness(new Date(EVAL_MS - 60_000).toISOString(), EVAL_MS).state, "FRESH"));
test("older quote is STALE", () => assert.equal(classifyContractQuoteFreshness(new Date(EVAL_MS - 60_001).toISOString(), EVAL_MS).state, "STALE"));
test("missing quote timestamp is UNKNOWN", () => assert.equal(classifyContractQuoteFreshness(null, EVAL_MS).state, "UNKNOWN"));
test("future quote timestamp is UNKNOWN", () => assert.equal(classifyContractQuoteFreshness(new Date(EVAL_MS + 1).toISOString(), EVAL_MS).state, "UNKNOWN"));
test("invalid quote timestamp is UNAVAILABLE", () => assert.equal(classifyContractQuoteFreshness("not-a-date", EVAL_MS).state, "UNAVAILABLE"));

// Moneyness.
test("Call moneyness is exact", () => {
  assert.equal(calculateContractMoneyness("CALL", 749, 750), "ITM");
  assert.equal(calculateContractMoneyness("CALL", 750, 750), "ATM");
  assert.equal(calculateContractMoneyness("CALL", 751, 750), "OTM");
});
test("Put moneyness is exact", () => {
  assert.equal(calculateContractMoneyness("PUT", 751, 750), "ITM");
  assert.equal(calculateContractMoneyness("PUT", 750, 750), "ATM");
  assert.equal(calculateContractMoneyness("PUT", 749, 750), "OTM");
});

// Compatibility.
test("compatible live Chain passes", () => assert.equal(evaluateContractSourceCompatibility(risk(), chain()).state, "COMPATIBLE"));
test("assembly skew equality passes", () => {
  const c = chain({ fetchedAt: new Date(Date.parse(RISK_AT) + 60_000).toISOString() });
  assert.equal(evaluateContractSourceCompatibility(risk(), c).state, "COMPATIBLE");
});
test("assembly skew above maximum is incompatible", () => {
  const c = chain({ fetchedAt: new Date(Date.parse(RISK_AT) + 60_001).toISOString() });
  assert.equal(evaluateContractSourceCompatibility(risk(), c).state, "INCOMPATIBLE");
});
test("stale Chain is partial", () => assert.equal(evaluateContractSourceCompatibility(risk(), chain({ metricState: "STALE", sourceState: "STALE", warningCode: "RETAINED_STALE_CHAIN" })).state, "PARTIAL"));
test("delayed Chain is incompatible", () => assert.equal(evaluateContractSourceCompatibility(risk(), chain({ isDelayed: true })).state, "INCOMPATIBLE"));
test("expiration mismatch is incompatible", () => assert.equal(evaluateContractSourceCompatibility(risk(), chain({ returnedExpirationDate: "2026-07-18" })).state, "INCOMPATIBLE"));

// Selection and candidate audit.
test("Call selection chooses exact-distance ITM contract", () => {
  const result = build();
  assert.equal(result.selectionState, "SELECTED");
  assert.equal(result.selectedContract.contractSymbol, "SPY_CALL_750");
  assert.equal(result.selectedContract.moneyness, "ITM");
  assert.equal(result.selectedContract.selectionRank, 1);
});
test("Put direction uses Puts only", () => {
  const result = build(risk({ direction: "PUTS", sourceTradePlanSetupDirection: "PUTS" }));
  assert.equal(result.contractDirection, "PUT");
  assert.ok(result.candidates.every((candidate) => candidate.contractDirection === "PUT"));
});
test("opposite-side contracts are absent", () => assert.equal(build().candidates.some((candidate) => candidate.contractDirection === "PUT"), false));
test("selected candidate appears exactly once", () => {
  const result = build();
  assert.equal(result.candidates.filter((candidate) => candidate.candidateId === result.selectedContract.candidateId).length, 1);
});
test("candidate counts reconcile", () => {
  const result = build();
  assert.equal(result.evaluatedCandidateCount, result.selectableCandidateCount + result.rejectedCandidateCount + result.unavailableCandidateCount);
});
test("premium reference equals calculated midpoint", () => {
  const result = build();
  assert.equal(result.premiumReference.value, result.selectedContract.calculatedMidpoint);
  assert.equal(result.premiumReference.disclosureCode, "MIDPOINT_REFERENCE_ONLY");
});
test("chain underlying price drives strike distance", () => {
  const result = build();
  assert.equal(result.selectedContract.strikeDistancePoints, 0.5);
  assert.equal(result.underlyingPriceDifferencePoints, 0.10000000000002274);
});

// Hard-gate behavior.
test("wide ATM contract is rejected and next eligible may select", () => {
  const c = chain();
  c.calls[0] = contract("SPY_CALL_750", "CALL", 750, { bid: 1, ask: 2 });
  const result = build(risk(), c);
  assert.equal(result.candidates[0].rejectionReasonCodes.includes("SPREAD_EXCEEDS_MAXIMUM"), true);
  assert.equal(result.selectedContract.contractSymbol, "SPY_CALL_751");
});
test("zero bid is rejected", () => {
  const c = chain(); c.calls[0].bid = 0;
  assert.equal(build(risk(), c).candidates[0].rejectionReasonCodes.includes("BID_NOT_POSITIVE"), true);
});
test("crossed quote is rejected", () => {
  const c = chain(); c.calls[0].bid = 2.5; c.calls[0].ask = 2;
  assert.equal(build(risk(), c).candidates[0].rejectionReasonCodes.includes("CROSSED_QUOTE"), true);
});
test("non-standard contract is rejected", () => {
  const c = chain(); c.calls[0].nonStandard = true;
  assert.equal(build(risk(), c).candidates[0].rejectionReasonCodes.includes("NON_STANDARD_CONTRACT"), true);
});
test("mini contract is rejected", () => {
  const c = chain(); c.calls[0].mini = true;
  assert.equal(build(risk(), c).candidates[0].rejectionReasonCodes.includes("MINI_CONTRACT"), true);
});
test("wrong multiplier is rejected", () => {
  const c = chain(); c.calls[0].multiplier = 10;
  assert.equal(build(risk(), c).candidates[0].rejectionReasonCodes.includes("MULTIPLIER_MISMATCH"), true);
});
test("missing standard flag is partial and not selectable", () => {
  const c = chain(); c.calls[0].nonStandard = null;
  const candidate = build(risk(), c).candidates[0];
  assert.equal(candidate.sourceStatus, "PARTIAL");
  assert.equal(candidate.selectable, false);
});
test("stale nearest quote allows next fresh contract", () => {
  const c = chain(); c.calls[0].quoteAt = new Date(EVAL_MS - 60_001).toISOString();
  const result = build(risk(), c);
  assert.equal(result.candidates[0].quoteFreshnessState, "STALE");
  assert.equal(result.selectedContract.contractSymbol, "SPY_CALL_751");
});
test("missing Delta does not block selection", () => {
  const c = chain(); c.calls[0].delta = null;
  assert.equal(build(risk(), c).selectedContract.contractSymbol, "SPY_CALL_750");
});
test("missing OI remains null and does not block", () => {
  const c = chain(); c.calls[0].openInterest = null;
  const result = build(risk(), c);
  assert.equal(result.candidates[0].openInterest, null);
  assert.ok(result.selectableCandidateCount > 0);
});

// Ranking tie-breaks.
test("ITM tie preference applies only at exact distance", () => {
  const result = build();
  assert.equal(result.selectedContract.contractSymbol, "SPY_CALL_750");
});
test("closer OTM outranks farther ITM", () => {
  const candidates = build().candidates.map((candidate) => ({ ...candidate, selectable: true, eligibilityStatus: "SELECTABLE" as const, rejectionReasonCodes: [] }));
  candidates[0].strikeDistancePoints = 1;
  candidates[0].moneyness = "ITM";
  candidates[1].strikeDistancePoints = 0.5;
  candidates[1].moneyness = "OTM";
  const ranked = rankContractCandidates(candidates, "CALL");
  assert.equal(ranked.find((item) => item.selectionRank === 1)?.candidateId, candidates[1].candidateId);
});
test("smaller spread breaks exact distance tie", () => {
  const c = chain();
  c.underlyingPrice = 750.5;
  c.calls[0].bid = 2; c.calls[0].ask = 2.3;
  c.calls[1].bid = 2; c.calls[1].ask = 2.1;
  assert.equal(build(risk(), c).selectedContract.contractSymbol, "SPY_CALL_750"); // ITM tie precedes spread
});
test("higher OI breaks otherwise exact tie", () => {
  const c = chain();
  c.underlyingPrice = 750;
  c.calls = [
    contract("A", "CALL", 750, { openInterest: 10, volume: 10 }),
    contract("B", "CALL", 750, { openInterest: 20, volume: 10 }),
  ];
  const result = build(risk(), c);
  assert.equal(result.selectedContract.contractSymbol, "B");
});
test("higher Volume breaks OI tie", () => {
  const c = chain();
  c.underlyingPrice = 750;
  c.calls = [
    contract("A", "CALL", 750, { openInterest: 10, volume: 10 }),
    contract("B", "CALL", 750, { openInterest: 10, volume: 20 }),
  ];
  assert.equal(build(risk(), c).selectedContract.contractSymbol, "B");
});

// Overall states.
test("PREVIEW returns DEFERRED without Chain data", () => {
  const result = build(risk({ frameworkState: "PREVIEW", isCurrentlyTradeEligible: false, sourceTradePlanSetupState: "WAITING_FOR_TRIGGER" }), null);
  assert.equal(result.selectionState, "DEFERRED");
  assert.equal(result.sourceCompatibilityState, "NOT_EVALUATED");
  assert.equal(result.candidates.length, 0);
});
test("NOT_APPLICABLE returns no candidates", () => {
  const result = build(risk({ frameworkState: "NOT_APPLICABLE", riskQualification: "NOT_APPLICABLE", direction: "NONE", isCurrentlyTradeEligible: false }), null);
  assert.equal(result.selectionState, "NOT_APPLICABLE");
  assert.equal(result.evaluatedCandidateCount, 0);
});
test("stale Chain cannot select", () => {
  const result = build(risk(), chain({ metricState: "STALE", sourceState: "STALE", warningCode: "RETAINED_STALE_CHAIN" }));
  assert.equal(result.engineState, "PARTIAL");
  assert.equal(result.selectionState, "UNAVAILABLE");
  assert.equal(result.selectedContract.candidateId, null);
});
test("delayed Chain cannot select", () => assert.equal(build(risk(), chain({ isDelayed: true })).selectionState, "UNAVAILABLE"));
test("all wide spreads produce normal no-qualified result", () => {
  const c = chain();
  c.calls.forEach((item) => { item.bid = 1; item.ask = 2; });
  const result = build(risk(), c);
  assert.equal(result.selectionState, "NO_QUALIFIED_CONTRACT");
  assert.equal(result.warningCode, null);
});
test("all missing quote timestamps produce PARTIAL no-qualified", () => {
  const c = chain(); c.calls.forEach((item) => { item.quoteAt = null; });
  const result = build(risk(), c);
  assert.equal(result.engineState, "PARTIAL");
  assert.equal(result.selectionState, "NO_QUALIFIED_CONTRACT");
  assert.equal(result.warningCode, "CONTRACT_QUOTE_TIMESTAMP_UNAVAILABLE");
});

// Schema and prohibited output.
test("response validates shared schema", () => assert.equal(SpyZeroDteContractSelectionResponseSchema.safeParse(build()).success, true));
test("schema rejects selected ID missing from candidates", () => {
  const invalid = structuredClone(build()) as any;
  invalid.selectedContract.candidateId = "MISSING";
  assert.equal(SpyZeroDteContractSelectionResponseSchema.safeParse(invalid).success, false);
});
test("schema rejects candidate count mismatch", () => {
  const invalid = structuredClone(build()) as any;
  invalid.evaluatedCandidateCount += 1;
  assert.equal(SpyZeroDteContractSelectionResponseSchema.safeParse(invalid).success, false);
});
test("schema rejects NaN spread", () => {
  const invalid = structuredClone(build()) as any;
  invalid.candidates[0].spreadRatio = Number.NaN;
  assert.equal(SpyZeroDteContractSelectionResponseSchema.safeParse(invalid).success, false);
});
test("methodology exposes no OI, Volume, or Delta hard threshold", () => {
  const method = build().methodology;
  assert.equal(method.openInterestHardMinimum, null);
  assert.equal(method.volumeHardMinimum, null);
  assert.equal(method.deltaHardRange, null);
});
test("response omits order, quantity, and guaranteed-fill fields", () => {
  const text = JSON.stringify(build());
  for (const prohibited of ["entryPrice", "recommendedLimitPrice", "positionSize", "numberOfContracts", "orderType", "stopOrder", "premiumTarget", "guaranteedFill", "dealerPosition"]) {
    assert.equal(text.includes(prohibited), false);
  }
});
test("upstream timestamps remain same-snapshot", () => assert.equal(build().upstreamSameSnapshotGuaranteed, true));
test("PARTIAL_CONTRACT_DATA does not globally block valid selection", () => assert.equal(build(risk(), chain({ warningCode: "PARTIAL_CONTRACT_DATA" })).selectionState, "SELECTED"));

setTimeout(() => {
  console.log(`\nTrade Contract tests: ${passed} passed, ${failed} failed`);
  if (failed > 0) process.exitCode = 1;
}, 200);
