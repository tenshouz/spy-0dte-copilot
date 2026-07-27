/** Focused deterministic tests for CONTRACT_V3 bounded selection and planned-risk qualification. */
import assert from "node:assert/strict";
import {
  SpyZeroDteContractSelectionResponseSchema,
  type NormalizedOptionContract,
  type SpyZeroDteObjectiveRiskResponse,
  type SpyZeroDteOptionsChainResponse,
} from "@spy-copilot/shared";
import {
  CONTRACT_METHODOLOGY_VERSION,
  MAXIMUM_CANDIDATE_STRIKES,
  MAXIMUM_CONTRACT_PREMIUM_DOLLARS,
  MAXIMUM_CONTRACT_QUOTE_AGE_MS,
  MAXIMUM_PLANNED_STRUCTURAL_LOSS_DOLLARS,
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
  selectBoundedContractStrikeWindow,
} from "./trade-contract.logic";
import {
  V140_CHAIN_AT,
  V140_CONTRACT_EVAL_MS,
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

function callCandidate(result: ReturnType<typeof build>, symbol: string) {
  const candidate = result.candidates.find((item) => item.contractSymbol === symbol);
  assert.ok(candidate, `Expected candidate ${symbol}`);
  return candidate;
}

async function main(): Promise<void> {
  await test("CONTRACT_V3 exposes the bounded-selection and planned-risk policy", () => {
    assert.equal(CONTRACT_METHODOLOGY_VERSION, "CONTRACT_V3");
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
    assert.equal(MAXIMUM_CONTRACT_PREMIUM_DOLLARS, 150);
    assert.equal(MAXIMUM_PLANNED_STRUCTURAL_LOSS_DOLLARS, 50);
    assert.equal(MAXIMUM_CANDIDATE_STRIKES, 3);

    const result = build();
    assert.equal(
      result.methodology.rankingMethod,
      "BOUNDED_THREE_STRIKE_EXECUTION_COST_THEN_DELTA_LIQUIDITY_RR",
    );
    assert.equal(
      result.methodology.atmStrikeSelectionPolicy,
      "NEAREST_RETURNED_STRIKE_LOWER_STRIKE_ON_EXACT_TIE",
    );
    assert.equal(result.methodology.fartherStrikeFallbackPolicy, "BOUNDED_ADJACENT_ONLY");
    assert.equal(
      result.methodology.candidateWindowPolicy,
      "EFFECTIVE_ATM_PLUS_ONE_ADJACENT_STRIKE_EACH_SIDE",
    );
    assert.equal(result.methodology.maximumCandidateStrikes, 3);
    assert.equal(result.methodology.maximumContractPremiumDollars, 150);
    assert.equal(result.methodology.maximumPlannedStructuralLossDollars, 50);
  });

  await test("READY and PREVIEW qualified risk both preflight the chain", () => {
    const ready = makeV140BiasPlanRisk("CALLS").risk;
    const preview = {
      ...ready,
      frameworkState: "PREVIEW",
      isCurrentlyTradeEligible: false,
    } as SpyZeroDteObjectiveRiskResponse;
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

  await test("bounded strike window contains ATM and one adjacent strike on each side", () => {
    const window = selectBoundedContractStrikeWindow([757, 758, 759, 760], 758.35);
    assert.equal(window.effectiveAtmStrike, 758);
    assert.equal(window.lowerAdjacentStrike, 757);
    assert.equal(window.upperAdjacentStrike, 759);
    assert.deepEqual(window.strikes, [757, 758, 759]);
    assert.equal(window.roleByStrike.get(757), "LOWER_ADJACENT");
    assert.equal(window.roleByStrike.get(758), "EFFECTIVE_ATM");
    assert.equal(window.roleByStrike.get(759), "UPPER_ADJACENT");
    assert.equal(window.roleByStrike.has(760), false);
  });

  await test("equal-distance ATM tie keeps the lower strike as canonical ATM", () => {
    const window = selectBoundedContractStrikeWindow([757, 758, 759, 760], 758.5);
    assert.equal(window.effectiveAtmStrike, 758);
    assert.equal(window.roleByStrike.get(758), "EFFECTIVE_ATM");
  });

  await test("qualified Calls select a schema-valid bounded contract", () => {
    const result = build();
    assert.equal(result.methodologyVersion, "CONTRACT_V3");
    assert.equal(result.selectionState, "SELECTED");
    assert.equal(result.selectedContract.contractDirection, "CALL");
    assert.equal(result.selectedContract.contractSymbol, "SPY_CALL_758");
    assert.equal(result.selectedContract.candidateWindowRole, "EFFECTIVE_ATM");
    assert.equal(result.selectedContract.quoteFreshnessState, "FRESH");
    assert.equal(result.selectedContract.optionScenarioState, "QUALIFIED");
    assert.equal(result.evaluatedCandidateCount, 3);
    assert.equal(result.candidates.some((item) => item.strikePrice === 760), false);
    assert.ok(
      result.selectedContract.estimatedPremiumRewardRiskRatio! >=
        MINIMUM_ESTIMATED_PREMIUM_REWARD_RISK_RATIO,
    );
    assert.ok(result.selectedContract.premiumDebitDollars! <= 150);
    assert.ok(result.selectedContract.estimatedPlannedStructuralLossDollars! <= 50);
    assert.equal(result.selectedContract.catastrophicFullPremiumLossDollars, 140);
    assert.equal(result.selectedContract.hardLossBackstopDollars, 50);
    assert.equal(result.selectedContract.hardLossBackstopExitPremium, 0.9);
    assert.deepEqual(SpyZeroDteContractSelectionResponseSchema.parse(result), result);
  });

  await test("Puts are selected symmetrically", () => {
    const { risk } = makeV140BiasPlanRisk("PUTS");
    const result = build(risk, makeV140OptionsChain("PUTS"));
    assert.equal(result.selectionState, "SELECTED");
    assert.equal(result.selectedContract.contractDirection, "PUT");
    assert.ok(result.selectedContract.delta! < 0);
    assert.equal(result.evaluatedCandidateCount, 3);
  });

  await test("PREVIEW preflights the bounded candidates without selecting", () => {
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
    assert.equal(result.preflightContract?.contractSymbol, "SPY_CALL_758");
    assert.equal(result.premiumReference.type, "UNAVAILABLE");
    assert.equal(result.preflightContract?.ask, 1.4);
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

  await test("relative spread above ten percent is rejected without tripping the premium cap", () => {
    const chain = makeV140OptionsChain("CALLS");
    const calls = chain.calls.map((item) => ({ ...item, bid: 1.2, ask: 1.35 }));
    const result = build(undefined, replaceCalls(chain, calls));
    assert.equal(result.selectionState, "NO_QUALIFIED_CONTRACT");
    assert.ok(result.candidates.every((item) => item.rejectionReasonCodes.includes("SPREAD_EXCEEDS_MAXIMUM")));
    assert.ok(result.candidates.every((item) => !item.rejectionReasonCodes.includes("PREMIUM_EXCEEDS_MAXIMUM")));
  });

  await test("absolute spread above twenty cents remains a hard rejection", () => {
    const chain = makeV140OptionsChain("CALLS");
    const calls = chain.calls.map((item) => ({ ...item, bid: 1.2, ask: 1.41 }));
    const result = build(undefined, replaceCalls(chain, calls));
    assert.equal(result.selectionState, "NO_QUALIFIED_CONTRACT");
    assert.ok(result.candidates.every((item) => item.rejectionReasonCodes.includes("SPREAD_POINTS_EXCEEDS_MAXIMUM")));
  });

  await test("displayed bid and ask size are hard execution filters", () => {
    const chain = makeV140OptionsChain("CALLS");
    const calls = chain.calls.map((item) => ({ ...item, bidSize: 0, askSize: 0 }));
    const result = build(undefined, replaceCalls(chain, calls));
    assert.equal(result.selectionState, "NO_QUALIFIED_CONTRACT");
    assert.ok(result.candidates.every((item) => item.rejectionReasonCodes.includes("BID_SIZE_BELOW_MINIMUM")));
    assert.ok(result.candidates.every((item) => item.rejectionReasonCodes.includes("ASK_SIZE_BELOW_MINIMUM")));
  });

  await test("open interest OR current volume can satisfy activity policy", () => {
    const chain = makeV140OptionsChain("CALLS");
    const calls = [
      makeV140Contract("OI_ONLY", "CALL", 757, { openInterest: 100, volume: 0, delta: 0.55 }),
      makeV140Contract("VOLUME_ONLY", "CALL", 758, { openInterest: 0, volume: 20, delta: 0.56 }),
      makeV140Contract("BOTH", "CALL", 759, { openInterest: 100, volume: 20, delta: 0.57 }),
    ];
    const result = build(undefined, replaceCalls(chain, calls));
    assert.equal(result.selectableCandidateCount, 3);
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
      makeV140Contract("NO_DELTA", "CALL", 757, { delta: null }),
      makeV140Contract("LOW_DELTA", "CALL", 758, { delta: 0.2 }),
      makeV140Contract("HIGH_DELTA", "CALL", 759, { delta: 0.9 }),
    ];
    const result = build(undefined, replaceCalls(chain, calls));
    assert.equal(result.selectionState, "NO_QUALIFIED_CONTRACT");
    assert.ok(callCandidate(result, "NO_DELTA").rejectionReasonCodes.includes("DELTA_UNAVAILABLE"));
    assert.ok(callCandidate(result, "LOW_DELTA").rejectionReasonCodes.includes("DELTA_OUTSIDE_RANGE"));
    assert.ok(callCandidate(result, "HIGH_DELTA").rejectionReasonCodes.includes("DELTA_OUTSIDE_RANGE"));
  });

  await test("option scenario must meet premium reward-to-risk after spread", () => {
    const chain = makeV140OptionsChain("CALLS");
    const calls = chain.calls.map((item) => ({ ...item, theta: -10 }));
    const result = build(undefined, replaceCalls(chain, calls));
    assert.equal(result.selectionState, "NO_QUALIFIED_CONTRACT");
    assert.ok(result.candidates.every((item) => item.rejectionReasonCodes.includes("OPTION_REWARD_RISK_BELOW_MINIMUM")));
  });

  await test("a contract above the $150 premium cap is rejected transparently", () => {
    const chain = makeV140OptionsChain("CALLS");
    const calls = chain.calls.map((item) => ({ ...item, bid: 1.49, ask: 1.51 }));
    const result = build(undefined, replaceCalls(chain, calls));
    assert.equal(result.selectionState, "NO_QUALIFIED_CONTRACT");
    assert.ok(result.candidates.every((item) => item.premiumDebitDollars === 151));
    assert.ok(result.candidates.every((item) => item.rejectionReasonCodes.includes("PREMIUM_EXCEEDS_MAXIMUM")));
  });

  await test("a modeled structural loss above $50 is rejected independently of full debit", () => {
    const chain = makeV140OptionsChain("CALLS");
    const baseRisk = makeV140BiasPlanRisk("CALLS").risk;
    const risk = {
      ...baseRisk,
      selectedInvalidation: { ...baseRisk.selectedInvalidation, level: 756.9 },
      selectedObjective: { ...baseRisk.selectedObjective, level: 762 },
    } as SpyZeroDteObjectiveRiskResponse;
    const result = build(risk, chain);
    assert.equal(result.selectionState, "NO_QUALIFIED_CONTRACT");
    assert.ok(
      result.candidates.every((item) =>
        item.rejectionReasonCodes.includes("PLANNED_STRUCTURAL_LOSS_EXCEEDS_MAXIMUM"),
      ),
    );
    assert.ok(result.candidates.every((item) => item.premiumDebitDollars === 140));
  });

  await test("an adjacent strike may be selected when ATM execution quality fails", () => {
    const chain = makeV140OptionsChain("CALLS");
    const calls = [
      makeV140Contract("LOWER_GOOD", "CALL", 757, { delta: 0.62, bid: 1.3, ask: 1.4 }),
      makeV140Contract("ATM_WIDE", "CALL", 758, { delta: 0.55, bid: 1.15, ask: 1.4 }),
      makeV140Contract("UPPER_GOOD", "CALL", 759, { delta: 0.48, bid: 1.28, ask: 1.4 }),
      makeV140Contract("FARTHER_PERFECT", "CALL", 760, { delta: 0.55, bid: 1.39, ask: 1.4 }),
    ];
    const result = build(undefined, replaceCalls(chain, calls));
    assert.equal(result.selectionState, "SELECTED");
    assert.equal(result.selectedContract.contractSymbol, "LOWER_GOOD");
    assert.equal(result.selectedContract.candidateWindowRole, "LOWER_ADJACENT");
    assert.ok(callCandidate(result, "ATM_WIDE").rejectionReasonCodes.includes("SPREAD_POINTS_EXCEEDS_MAXIMUM"));
    assert.equal(result.candidates.some((item) => item.contractSymbol === "FARTHER_PERFECT"), false);
  });

  await test("execution cost ranks before delta proximity inside the bounded window", () => {
    const chain = makeV140OptionsChain("CALLS");
    const calls = [
      makeV140Contract("LOWER_CHEAP_EXECUTION", "CALL", 757, { delta: 0.63, bid: 1.36, ask: 1.4 }),
      makeV140Contract("ATM_TARGET_DELTA", "CALL", 758, { delta: 0.55, bid: 1.3, ask: 1.4 }),
      makeV140Contract("UPPER", "CALL", 759, { delta: 0.48, bid: 1.3, ask: 1.4 }),
    ];
    const result = build(undefined, replaceCalls(chain, calls));
    assert.equal(result.selectedContract.contractSymbol, "LOWER_CHEAP_EXECUTION");
    assert.equal(result.selectedContract.estimatedExecutionCostDollars, 4);
  });

  await test("the selector never reaches a fourth farther strike", () => {
    const chain = makeV140OptionsChain("CALLS");
    const calls = [
      makeV140Contract("LOWER_BAD", "CALL", 757, { bid: 1.1, ask: 1.4 }),
      makeV140Contract("ATM_BAD", "CALL", 758, { bid: 1.1, ask: 1.4 }),
      makeV140Contract("UPPER_BAD", "CALL", 759, { bid: 1.1, ask: 1.4 }),
      makeV140Contract("FARTHER_GOOD", "CALL", 760, { delta: 0.55, bid: 1.39, ask: 1.4 }),
    ];
    const result = build(undefined, replaceCalls(chain, calls));
    assert.equal(result.selectionState, "NO_QUALIFIED_CONTRACT");
    assert.equal(result.evaluatedCandidateCount, 3);
    assert.equal(result.candidates.some((item) => item.contractSymbol === "FARTHER_GOOD"), false);
  });

  await test("multiple contracts at one bounded strike retain deterministic quality ranking", () => {
    const chain = makeV140OptionsChain("CALLS");
    const calls = [
      makeV140Contract("ATM_REJECTED", "CALL", 758, { bid: 1.1, ask: 1.4 }),
      makeV140Contract("ATM_SELECTABLE", "CALL", 758, { delta: 0.55, bid: 1.35, ask: 1.4 }),
      makeV140Contract("UPPER_SELECTABLE", "CALL", 759, { delta: 0.55, bid: 1.3, ask: 1.4 }),
    ];
    const result = build(undefined, replaceCalls(chain, calls));
    assert.equal(result.selectionState, "SELECTED");
    assert.equal(result.selectedContract.contractSymbol, "ATM_SELECTABLE");
    assert.equal(result.selectableCandidateCount, 2);
  });

  await test("PREVIEW reports no qualified contract when all three bounded candidates fail", () => {
    const ready = makeV140BiasPlanRisk("CALLS").risk;
    const preview = {
      ...ready,
      frameworkState: "PREVIEW",
      isCurrentlyTradeEligible: false,
    } as SpyZeroDteObjectiveRiskResponse;
    const chain = makeV140OptionsChain("CALLS");
    const calls = chain.calls.map((item) => ({ ...item, bid: 1.1, ask: 1.4 }));
    const result = build(preview, replaceCalls(chain, calls));
    assert.equal(result.selectionState, "DEFERRED");
    assert.equal(result.preflightState, "NO_QUALIFIED_CONTRACT");
    assert.equal(result.preflightContract?.contractSymbol, null);
    assert.equal(result.evaluatedCandidateCount, 3);
  });

  await test("source assembly skew above thirty seconds fails closed", () => {
    const chain = makeV140OptionsChain("CALLS", {
      fetchedAt: new Date(Date.parse(V140_CHAIN_AT) + 31_000).toISOString(),
    });
    const result = build(undefined, chain);
    assert.equal(result.selectionState, "UNAVAILABLE");
    assert.equal(result.sourceCompatibilityState, "INCOMPATIBLE");
  });

  await test("all stale bounded candidates produce no qualified contract", () => {
    const chain = makeV140OptionsChain("CALLS");
    const staleAt = new Date(V140_CONTRACT_EVAL_MS - 20_001).toISOString();
    const calls = chain.calls.map((item) => ({ ...item, quoteAt: staleAt }));
    const result = build(undefined, replaceCalls(chain, calls));
    assert.equal(result.selectionState, "NO_QUALIFIED_CONTRACT");
    assert.equal(result.engineState, "PARTIAL");
    assert.ok(result.candidates.every((item) => item.quoteFreshnessState === "STALE"));
  });

  await test("liquidity and moneyness calculations retain exact arithmetic", () => {
    const liquidity = calculateContractLiquidity(1.3, 1.4);
    assert.equal(liquidity.midpoint, 1.35);
    assert.ok(Math.abs(liquidity.spreadRatio! - 0.1 / 1.35) < 1e-12);
    assert.equal(calculateContractMoneyness("CALL", 758, 758.35), "ITM");
    assert.equal(calculateContractMoneyness("PUT", 749, 748.65), "ITM");
  });

  await test("put-side bounded candidates use the same three-strike ceiling", () => {
    const { risk } = makeV140BiasPlanRisk("PUTS");
    const chain = makeV140OptionsChain("PUTS");
    const puts = [
      makeV140Contract("PUT_747", "PUT", 747, { delta: -0.4 }),
      makeV140Contract("PUT_748", "PUT", 748, { delta: -0.48 }),
      makeV140Contract("PUT_749", "PUT", 749, { delta: -0.55 }),
      makeV140Contract("PUT_750", "PUT", 750, { delta: -0.68 }),
    ];
    const result = build(risk, replacePuts(chain, puts));
    assert.equal(result.evaluatedCandidateCount, 3);
    assert.equal(result.candidates.some((item) => item.strikePrice === 747), false);
  });

  console.log(`\nContract V3 tests: ${passed} passed, ${failed} failed`);
  if (failed > 0) process.exitCode = 1;
}

void main();
