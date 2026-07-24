/** Focused deterministic tests for CONTRACT_V2 liquidity and option-scenario qualification. */
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
  MAXIMUM_SPREAD_POINTS,
  MAXIMUM_SPREAD_RATIO,
  MAXIMUM_ABSOLUTE_DELTA,
  MINIMUM_ABSOLUTE_DELTA,
  MINIMUM_ASK_SIZE,
  MINIMUM_BID_SIZE,
  MINIMUM_ESTIMATED_PREMIUM_REWARD_RISK_RATIO,
  MINIMUM_OPEN_INTEREST,
  MINIMUM_VOLUME,
  TARGET_ABSOLUTE_DELTA,
  buildSpyZeroDteContractSelection,
  calculateContractLiquidity,
  calculateContractMoneyness,
  classifyContractQuoteFreshness,
  contractSelectionRequiresOptionsChain,
  resolveSpyZeroDteContractSelectionFromRisk,
} from "./trade-contract.logic";
import {
  V140_CHAIN_AT,
  V140_CONTRACT_EVAL_MS,
  V140_CONTRACT_QUOTE_AT,
  makeV140BiasPlanRisk,
  makeV140Contract,
  makeV140OptionsChain,
} from "./trade-engine-v140.test-fixtures";

let passed = 0;
let failed = 0;
async function test(name: string, fn: () => void | Promise<void>): Promise<void> {
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

function build(
  risk: SpyZeroDteObjectiveRiskResponse = makeV140BiasPlanRisk("CALLS").risk,
  chain: SpyZeroDteOptionsChainResponse | null = makeV140OptionsChain("CALLS"),
  at = V140_CONTRACT_EVAL_MS,
) {
  return buildSpyZeroDteContractSelection(risk, chain, at);
}

function replaceCalls(
  chain: SpyZeroDteOptionsChainResponse,
  calls: NormalizedOptionContract[],
): SpyZeroDteOptionsChainResponse {
  return {
    ...chain,
    calls,
    callContractCount: calls.length,
    providerContractCount: calls.length + chain.puts.length,
    totalContracts: calls.length + chain.puts.length,
    contractsWithBidAsk: calls.length + chain.puts.length,
    contractsWithGreeks: calls.length + chain.puts.length,
    contractsWithOpenInterest: calls.length + chain.puts.length,
    contractsWithVolume: calls.length + chain.puts.length,
  };
}

function replacePuts(
  chain: SpyZeroDteOptionsChainResponse,
  puts: NormalizedOptionContract[],
): SpyZeroDteOptionsChainResponse {
  return {
    ...chain,
    puts,
    putContractCount: puts.length,
    providerContractCount: chain.calls.length + puts.length,
    totalContracts: chain.calls.length + puts.length,
    contractsWithBidAsk: chain.calls.length + puts.length,
    contractsWithGreeks: chain.calls.length + puts.length,
    contractsWithOpenInterest: chain.calls.length + puts.length,
    contractsWithVolume: chain.calls.length + puts.length,
  };
}

async function main(): Promise<void> {
await test("CONTRACT_V2 exposes conservative execution thresholds", () => {
  assert.equal(MAXIMUM_SPREAD_RATIO, 0.1);
  assert.equal(MAXIMUM_SPREAD_POINTS, 0.2);
  assert.equal(MAXIMUM_SOURCE_ASSEMBLY_SKEW_MS, 30_000);
  assert.equal(MAXIMUM_CONTRACT_QUOTE_AGE_MS, 20_000);
  assert.equal(MINIMUM_BID_SIZE, 1);
  assert.equal(MINIMUM_ASK_SIZE, 1);
  assert.equal(MINIMUM_OPEN_INTEREST, 100);
  assert.equal(MINIMUM_VOLUME, 20);
  assert.equal(MINIMUM_ABSOLUTE_DELTA, 0.35);
  assert.equal(MAXIMUM_ABSOLUTE_DELTA, 0.75);
  assert.equal(TARGET_ABSOLUTE_DELTA, 0.55);
  assert.equal(MINIMUM_ESTIMATED_PREMIUM_REWARD_RISK_RATIO, 1.25);
  const result = build();
  assert.equal(
    result.methodology.rankingMethod,
    "STRICT_EFFECTIVE_ATM_THEN_OPTION_RR_AND_LIQUIDITY",
  );
  assert.equal(
    result.methodology.atmStrikeSelectionPolicy,
    "NEAREST_RETURNED_STRIKE_LOWER_STRIKE_ON_EXACT_TIE",
  );
  assert.equal(result.methodology.fartherStrikeFallbackPolicy, "PROHIBITED");
});

await test("READY and PREVIEW qualified risk both preflight the chain", () => {
  const ready = makeV140BiasPlanRisk("CALLS").risk;
  const preview = { ...ready, frameworkState: "PREVIEW", isCurrentlyTradeEligible: false } as SpyZeroDteObjectiveRiskResponse;
  assert.equal(contractSelectionRequiresOptionsChain(ready), true);
  assert.equal(contractSelectionRequiresOptionsChain(preview), true);
  assert.equal(
    contractSelectionRequiresOptionsChain({
      ...ready,
      frameworkState: "NOT_QUALIFIED",
      riskQualification: "NOT_QUALIFIED",
      isCurrentlyTradeEligible: false,
    } as SpyZeroDteObjectiveRiskResponse),
    false,
  );
});

await test("qualified Calls select a fresh liquid delta-qualified contract", () => {
  const result = build();
  assert.equal(result.methodologyVersion, "CONTRACT_V2");
  assert.equal(result.selectionState, "SELECTED");
  assert.equal(result.selectedContract.contractDirection, "CALL");
  assert.equal(result.selectedContract.quoteFreshnessState, "FRESH");
  assert.equal(result.selectedContract.optionScenarioState, "QUALIFIED");
  assert.ok(
    result.selectedContract.estimatedPremiumRewardRiskRatio! >=
      MINIMUM_ESTIMATED_PREMIUM_REWARD_RISK_RATIO,
  );
  assert.deepEqual(SpyZeroDteContractSelectionResponseSchema.parse(result), result);
});

await test("Puts are selected symmetrically", () => {
  const { risk } = makeV140BiasPlanRisk("PUTS");
  const result = build(risk, makeV140OptionsChain("PUTS"));
  assert.equal(result.selectionState, "SELECTED");
  assert.equal(result.selectedContract.contractDirection, "PUT");
  assert.ok(result.selectedContract.delta! < 0);
});

await test("PREVIEW performs chain preflight without selecting a contract", () => {
  const ready = makeV140BiasPlanRisk("CALLS").risk;
  const preview = {
    ...ready,
    frameworkState: "PREVIEW",
    isCurrentlyTradeEligible: false,
  } as SpyZeroDteObjectiveRiskResponse;
  const result = build(preview);
  assert.equal(result.selectionState, "DEFERRED");
  assert.equal(result.preflightState, "READY");
  assert.equal(result.selectedContract.contractSymbol, null);
  assert.ok(result.preflightContract?.contractSymbol);
  assert.equal(result.premiumReference.type, "UNAVAILABLE");
  assert.equal(result.preflightContract?.ask, 2.2);
});

await test("PREVIEW service path performs exactly one chain request", async () => {
  const ready = makeV140BiasPlanRisk("CALLS").risk;
  const preview = {
    ...ready,
    frameworkState: "PREVIEW",
    isCurrentlyTradeEligible: false,
  } as SpyZeroDteObjectiveRiskResponse;
  let calls = 0;
  const result = await resolveSpyZeroDteContractSelectionFromRisk(preview, {
    getOptionsChain: async () => {
      calls += 1;
      return makeV140OptionsChain("CALLS");
    },
    getLastResortOptionsChain: () => makeV140OptionsChain("CALLS"),
    now: () => V140_CONTRACT_EVAL_MS,
  });
  assert.equal(calls, 1);
  assert.equal(result.selectionState, "DEFERRED");
});

await test("not-qualified risk performs zero chain requests", async () => {
  const ready = makeV140BiasPlanRisk("CALLS").risk;
  const notQualified = {
    ...ready,
    frameworkState: "NOT_QUALIFIED",
    riskQualification: "NOT_QUALIFIED",
    isCurrentlyTradeEligible: false,
  } as SpyZeroDteObjectiveRiskResponse;
  let calls = 0;
  const result = await resolveSpyZeroDteContractSelectionFromRisk(notQualified, {
    getOptionsChain: async () => {
      calls += 1;
      return makeV140OptionsChain("CALLS");
    },
    getLastResortOptionsChain: () => makeV140OptionsChain("CALLS"),
    now: () => V140_CONTRACT_EVAL_MS,
  });
  assert.equal(calls, 0);
  assert.equal(result.selectionState, "NOT_APPLICABLE");
});

await test("quote freshness uses a strict twenty-second ceiling", () => {
  assert.deepEqual(
    classifyContractQuoteFreshness(
      new Date(V140_CONTRACT_EVAL_MS - 20_000).toISOString(),
      V140_CONTRACT_EVAL_MS,
    ),
    { state: "FRESH", ageMilliseconds: 20_000 },
  );
  assert.equal(
    classifyContractQuoteFreshness(
      new Date(V140_CONTRACT_EVAL_MS - 20_001).toISOString(),
      V140_CONTRACT_EVAL_MS,
    ).state,
    "STALE",
  );
});

await test("relative spread above ten percent is rejected", () => {
  const chain = makeV140OptionsChain("CALLS");
  const calls = chain.calls.map((item) => ({ ...item, bid: 1.8, ask: 2.2 }));
  const result = build(undefined, replaceCalls(chain, calls));
  assert.equal(result.selectionState, "NO_QUALIFIED_CONTRACT");
  assert.ok(
    result.candidates.every((item) =>
      item.rejectionReasonCodes.includes("SPREAD_EXCEEDS_MAXIMUM"),
    ),
  );
});

await test("absolute spread above twenty cents is rejected even with a low percentage", () => {
  const chain = makeV140OptionsChain("CALLS");
  const calls = chain.calls.map((item) => ({ ...item, bid: 10, ask: 10.25 }));
  const result = build(undefined, replaceCalls(chain, calls));
  assert.equal(result.selectionState, "NO_QUALIFIED_CONTRACT");
  assert.ok(
    result.candidates.every((item) =>
      item.rejectionReasonCodes.includes("SPREAD_POINTS_EXCEEDS_MAXIMUM"),
    ),
  );
});

await test("displayed bid and ask size are hard execution filters", () => {
  const chain = makeV140OptionsChain("CALLS");
  const calls = chain.calls.map((item) => ({ ...item, bidSize: 0, askSize: 0 }));
  const result = build(undefined, replaceCalls(chain, calls));
  assert.equal(result.selectionState, "NO_QUALIFIED_CONTRACT");
  assert.ok(result.candidates.every((item) => item.rejectionReasonCodes.includes("BID_SIZE_BELOW_MINIMUM")));
  assert.ok(result.candidates.every((item) => item.rejectionReasonCodes.includes("ASK_SIZE_BELOW_MINIMUM")));
});

await test("open interest OR current volume can satisfy the activity policy", () => {
  const chain = makeV140OptionsChain("CALLS");
  const calls = [
    makeV140Contract("OI_ONLY", "CALL", 758, { openInterest: 100, volume: 0, delta: 0.55 }),
    makeV140Contract("VOLUME_ONLY", "CALL", 758, { openInterest: 0, volume: 20, delta: 0.56 }),
  ];
  const result = build(undefined, replaceCalls(chain, calls));
  assert.equal(result.selectableCandidateCount, 2);
  assert.ok(result.candidates.every((item) => item.liquidityActivityPassed));
});

await test("inactive contracts are rejected", () => {
  const chain = makeV140OptionsChain("CALLS");
  const calls = chain.calls.map((item) => ({ ...item, openInterest: 99, volume: 19 }));
  const result = build(undefined, replaceCalls(chain, calls));
  assert.equal(result.selectionState, "NO_QUALIFIED_CONTRACT");
  assert.ok(result.candidates.every((item) => item.rejectionReasonCodes.includes("LIQUIDITY_ACTIVITY_BELOW_MINIMUM")));
});

await test("missing or out-of-range delta blocks selection", () => {
  const chain = makeV140OptionsChain("CALLS");
  const calls = [
    makeV140Contract("NO_DELTA", "CALL", 758, { delta: null }),
    makeV140Contract("LOW_DELTA", "CALL", 759, { delta: 0.2 }),
    makeV140Contract("HIGH_DELTA", "CALL", 757, { delta: 0.9 }),
  ];
  const result = build(undefined, replaceCalls(chain, calls));
  assert.equal(result.selectionState, "NO_QUALIFIED_CONTRACT");
  assert.ok(result.candidates[0]!.rejectionReasonCodes.includes("DELTA_UNAVAILABLE"));
  assert.ok(result.candidates[1]!.rejectionReasonCodes.includes("DELTA_OUTSIDE_RANGE"));
  assert.ok(result.candidates[2]!.rejectionReasonCodes.includes("DELTA_OUTSIDE_RANGE"));
});

await test("option scenario must meet premium reward-to-risk after spread", () => {
  const chain = makeV140OptionsChain("CALLS");
  const calls = chain.calls.map((item) => ({ ...item, theta: -10 }));
  const result = build(undefined, replaceCalls(chain, calls));
  assert.equal(result.selectionState, "NO_QUALIFIED_CONTRACT");
  assert.ok(
    result.candidates.every((item) =>
      item.rejectionReasonCodes.includes("OPTION_REWARD_RISK_BELOW_MINIMUM"),
    ),
  );
});

await test("strict effective ATM outranks a farther target-delta contract", () => {
  const chain = makeV140OptionsChain("CALLS");
  const calls = [
    makeV140Contract("DELTA_45", "CALL", 758, { delta: 0.45 }),
    makeV140Contract("DELTA_55", "CALL", 759, { delta: 0.55 }),
    makeV140Contract("DELTA_65", "CALL", 760, { delta: 0.65 }),
  ];
  const result = build(undefined, replaceCalls(chain, calls));
  assert.equal(result.selectedContract.contractSymbol, "DELTA_45");
  assert.equal(result.selectedContract.selectionRank, 1);
  assert.ok(
    result.candidates
      .filter((candidate) => candidate.strikePrice !== 758)
      .every((candidate) =>
        candidate.rejectionReasonCodes.includes("NOT_EFFECTIVE_ATM_STRIKE"),
      ),
  );
});

await test("ATM spread failure cannot fall through to a farther liquid strike", () => {
  const chain = makeV140OptionsChain("CALLS");
  const calls = [
    makeV140Contract("ATM_WIDE", "CALL", 758, { bid: 1.8, ask: 2.2 }),
    makeV140Contract("FARTHER_GOOD", "CALL", 759, { delta: 0.55 }),
  ];
  const result = build(undefined, replaceCalls(chain, calls));
  assert.equal(result.selectionState, "NO_QUALIFIED_CONTRACT");
  assert.equal(result.selectableCandidateCount, 0);
  assert.ok(
    result.candidates.find((candidate) => candidate.contractSymbol === "ATM_WIDE")!
      .rejectionReasonCodes.includes("SPREAD_EXCEEDS_MAXIMUM"),
  );
  assert.ok(
    result.candidates.find((candidate) => candidate.contractSymbol === "FARTHER_GOOD")!
      .rejectionReasonCodes.includes("NOT_EFFECTIVE_ATM_STRIKE"),
  );
});

await test("ATM stale quote cannot fall through to a farther fresh strike", () => {
  const chain = makeV140OptionsChain("CALLS");
  const staleAt = new Date(V140_CONTRACT_EVAL_MS - 20_001).toISOString();
  const calls = [
    makeV140Contract("ATM_STALE", "CALL", 758, { quoteAt: staleAt }),
    makeV140Contract("FARTHER_FRESH", "CALL", 759, { delta: 0.55 }),
  ];
  const result = build(undefined, replaceCalls(chain, calls));
  assert.equal(result.selectionState, "NO_QUALIFIED_CONTRACT");
  assert.equal(result.engineState, "PARTIAL");
  assert.equal(result.warningCode, "CONTRACT_QUOTE_STALE");
});

await test("ATM scenario failure cannot fall through to a farther qualified strike", () => {
  const chain = makeV140OptionsChain("CALLS");
  const calls = [
    makeV140Contract("ATM_BAD_SCENARIO", "CALL", 758, { theta: -10 }),
    makeV140Contract("FARTHER_GOOD_SCENARIO", "CALL", 759, { delta: 0.55 }),
  ];
  const result = build(undefined, replaceCalls(chain, calls));
  assert.equal(result.selectionState, "NO_QUALIFIED_CONTRACT");
  assert.ok(
    result.candidates.find((candidate) => candidate.contractSymbol === "ATM_BAD_SCENARIO")!
      .rejectionReasonCodes.includes("OPTION_REWARD_RISK_BELOW_MINIMUM"),
  );
});

await test("multiple contracts at the effective ATM strike retain deterministic quality ranking", () => {
  const chain = makeV140OptionsChain("CALLS");
  const calls = [
    makeV140Contract("ATM_REJECTED", "CALL", 758, { bid: 1.8, ask: 2.2 }),
    makeV140Contract("ATM_SELECTABLE", "CALL", 758, { delta: 0.55 }),
    makeV140Contract("FARTHER_SELECTABLE_BEFORE_ATM_POLICY", "CALL", 759, { delta: 0.55 }),
  ];
  const result = build(undefined, replaceCalls(chain, calls));
  assert.equal(result.selectionState, "SELECTED");
  assert.equal(result.selectedContract.contractSymbol, "ATM_SELECTABLE");
  assert.equal(result.selectableCandidateCount, 1);
});

await test("equal-distance ATM ties choose the lower strike for Calls", () => {
  const chain = makeV140OptionsChain("CALLS", { underlyingPrice: 758.5 });
  const calls = [
    makeV140Contract("LOWER_CALL", "CALL", 758, { delta: 0.55, ask: 2.1 }),
    makeV140Contract("HIGHER_CALL", "CALL", 759, { delta: 0.55, ask: 2.1 }),
  ];
  const result = build(undefined, replaceCalls(chain, calls));
  assert.equal(result.selectionState, "SELECTED");
  assert.equal(result.selectedContract.contractSymbol, "LOWER_CALL");
});

await test("equal-distance ATM ties choose the lower strike for Puts", () => {
  const { risk } = makeV140BiasPlanRisk("PUTS");
  const chain = makeV140OptionsChain("PUTS", { underlyingPrice: 748.5 });
  const puts = [
    makeV140Contract("LOWER_PUT", "PUT", 748, { delta: -0.55, ask: 2.1 }),
    makeV140Contract("HIGHER_PUT", "PUT", 749, { delta: -0.55, ask: 2.1 }),
  ];
  const result = build(risk, replacePuts(chain, puts));
  assert.equal(result.selectionState, "SELECTED");
  assert.equal(result.selectedContract.contractSymbol, "LOWER_PUT");
});

await test("missing selected-side contract at the chain ATM does not permit substitution", () => {
  const chain = makeV140OptionsChain("CALLS", {
    underlyingPrice: 758.2,
    puts: [makeV140Contract("CHAIN_ATM_PUT", "PUT", 758)],
  });
  const calls = [
    makeV140Contract("CALL_759", "CALL", 759, { delta: 0.55 }),
    makeV140Contract("CALL_760", "CALL", 760, { delta: 0.55 }),
  ];
  const result = build(undefined, replaceCalls(chain, calls));
  assert.equal(result.selectionState, "NO_QUALIFIED_CONTRACT");
  assert.equal(result.selectableCandidateCount, 0);
  assert.ok(
    result.candidates.every((candidate) =>
      candidate.rejectionReasonCodes.includes("NOT_EFFECTIVE_ATM_STRIKE"),
    ),
  );
});

await test("PREVIEW strict-ATM preflight reports no qualified contract without fallback", () => {
  const ready = makeV140BiasPlanRisk("CALLS").risk;
  const preview = {
    ...ready,
    frameworkState: "PREVIEW",
    isCurrentlyTradeEligible: false,
  } as SpyZeroDteObjectiveRiskResponse;
  const chain = makeV140OptionsChain("CALLS");
  const calls = [
    makeV140Contract("ATM_WIDE_PREVIEW", "CALL", 758, { bid: 1.8, ask: 2.2 }),
    makeV140Contract("FARTHER_GOOD_PREVIEW", "CALL", 759, { delta: 0.55 }),
  ];
  const result = build(preview, replaceCalls(chain, calls));
  assert.equal(result.selectionState, "DEFERRED");
  assert.equal(result.preflightState, "NO_QUALIFIED_CONTRACT");
  assert.equal(result.preflightContract?.contractSymbol, null);
});

await test("source assembly skew above thirty seconds fails closed", () => {
  const chain = makeV140OptionsChain("CALLS", {
    fetchedAt: new Date(Date.parse(V140_CHAIN_AT) + 31_000).toISOString(),
  });
  const result = build(undefined, chain);
  assert.equal(result.selectionState, "UNAVAILABLE");
  assert.equal(result.sourceCompatibilityState, "INCOMPATIBLE");
});

await test("all stale candidates produce no qualified contract", () => {
  const chain = makeV140OptionsChain("CALLS");
  const staleAt = new Date(V140_CONTRACT_EVAL_MS - 20_001).toISOString();
  const calls = chain.calls.map((item) => ({ ...item, quoteAt: staleAt }));
  const result = build(undefined, replaceCalls(chain, calls));
  assert.equal(result.selectionState, "NO_QUALIFIED_CONTRACT");
  assert.ok(result.candidates.every((item) => item.quoteFreshnessState === "STALE"));
});

await test("liquidity and moneyness calculations retain exact arithmetic", () => {
  const liquidity = calculateContractLiquidity(2, 2.2);
  assert.equal(liquidity.midpoint, 2.1);
  assert.ok(Math.abs(liquidity.spreadRatio! - 0.2 / 2.1) < 1e-12);
  assert.equal(calculateContractMoneyness("CALL", 758, 758.35), "ITM");
  assert.equal(calculateContractMoneyness("PUT", 749, 748.65), "ITM");
});

console.log(`\nContract V2 tests: ${passed} passed, ${failed} failed`);
if (failed > 0) process.exitCode = 1;
}

void main();
