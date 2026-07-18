/**
 * Deterministic tests for ASSEMBLY_V1.
 * Run: npx --no-install tsx apps/server/src/services/trade-plan-assembly.spec.ts
 */
import assert from "node:assert/strict";
import {
  SpyZeroDteTradePlanAssemblyResponseSchema,
  type NormalizedOptionContract,
  type SpyZeroDteDeterministicMarketStateResponse,
  type SpyZeroDteOptionsChainResponse,
} from "@spy-copilot/shared";
import { buildSpyZeroDteDeterministicBias } from "./market-bias.logic";
import { buildSpyZeroDteDeterministicTradePlan } from "./trade-plan.logic";
import { buildSpyZeroDteObjectiveRiskFramework } from "./trade-risk.logic";
import { buildSpyZeroDteContractSelection } from "./trade-contract.logic";
import {
  ASSEMBLY_METHODOLOGY_VERSION,
  buildSpyZeroDteTradePlanAssembly,
  determineTradePlanAssemblyState,
  hasConsistentAssemblySourceComposition,
} from "./trade-plan-assembly.logic";
import { getSpyZeroDteTradePlanAssemblyWithDependencies } from "./trade-plan-assembly.service";
import { SpyZeroDteDeterministicMarketStateResponseSchema } from "@spy-copilot/shared";

const MARKET_DATE = "2026-07-17";
const PREVIOUS_DATE = "2026-07-16";
const STATE_AT = "2026-07-17T14:00:00.000Z";
const BIAS_AT_MS = Date.parse("2026-07-17T14:00:00.100Z");
const PLAN_AT_MS = Date.parse("2026-07-17T14:00:00.200Z");
const RISK_AT_MS = Date.parse("2026-07-17T14:00:00.300Z");
const CHAIN_AT = "2026-07-17T14:00:00.400Z";
const CONTRACT_AT_MS = Date.parse("2026-07-17T14:00:00.500Z");
const ASSEMBLY_AT_MS = Date.parse("2026-07-17T14:00:00.600Z");
const QUOTE_AT = "2026-07-17T13:59:59.000Z";
const FRESH_OPTION_QUOTE_AT = "2026-07-17T13:59:50.000Z";

function baseMarketState(): SpyZeroDteDeterministicMarketStateResponse {
  const state = {
    symbol: "SPY",
    product: "SPY_ZERO_DTE_DETERMINISTIC_MARKET_STATE",
    engineVersion: "V1",
    currentMarketDate: MARKET_DATE,
    mostRecentRthSessionDate: MARKET_DATE,
    sourceContextState: "READY",
    sourceContextAssembledAt: "2026-07-17T13:59:59.500Z",
    calculatedAt: STATE_AT,
    engineState: "AVAILABLE",
    price: 754.5,
    priceSource: "QUOTE_LAST_PRICE",
    quoteTimestamp: QUOTE_AT,
    quoteSourceState: "LIVE",
    features: {
      sessionPhase: {
        featureId: "SESSION_PHASE",
        featureVersion: "V1",
        status: "AVAILABLE",
        state: "RTH",
        sourceComponents: ["SESSION_DATA"],
        referenceDate: MARKET_DATE,
        referenceDateRelation: "CURRENT_MARKET_DATE",
        inputs: {
          currentMarketDate: MARKET_DATE,
          currentSessionWindow: "RTH",
          currentObservedMarketDate: MARKET_DATE,
          sourceState: "LIVE",
        },
        derived: {},
        warningCode: null,
      },
      priceVsVwap: {
        featureId: "PRICE_VS_VWAP",
        featureVersion: "V1",
        status: "AVAILABLE",
        state: "ABOVE",
        sourceComponents: ["QUOTE", "VWAP"],
        referenceDate: MARKET_DATE,
        referenceDateRelation: "CURRENT_MARKET_DATE",
        inputs: {
          price: 754.5,
          priceSource: "QUOTE_LAST_PRICE",
          vwap: 753,
          vwapMarketDate: MARKET_DATE,
          quoteSourceState: "LIVE",
          vwapMetricState: "LIVE",
          vwapSourceState: "LIVE",
        },
        derived: { distancePoints: 1.5, distancePercent: (1.5 / 753) * 100 },
        warningCode: null,
      },
      priceVsPriorDayRange: {
        featureId: "PRICE_VS_PRIOR_DAY_RANGE",
        featureVersion: "V1",
        status: "AVAILABLE",
        state: "INSIDE_RANGE",
        sourceComponents: ["QUOTE", "SESSION_LEVELS"],
        referenceDate: PREVIOUS_DATE,
        referenceDateRelation: "PREVIOUS_RTH_SESSION",
        inputs: {
          price: 754.5,
          priceSource: "QUOTE_LAST_PRICE",
          previousDayHigh: 756,
          previousDayLow: 748,
          previousDayHighState: "LIVE",
          previousDayLowState: "LIVE",
          previousRthMarketDate: PREVIOUS_DATE,
          previousRthCoverageState: "COMPLETE",
        },
        derived: { distanceToHighPoints: -1.5, distanceToLowPoints: 6.5 },
        warningCode: null,
      },
      priceVsPremarketRange: {
        featureId: "PRICE_VS_PREMARKET_RANGE",
        featureVersion: "V1",
        status: "AVAILABLE",
        state: "ABOVE_RANGE",
        sourceComponents: ["QUOTE", "SESSION_LEVELS"],
        referenceDate: MARKET_DATE,
        referenceDateRelation: "CURRENT_MARKET_DATE",
        inputs: {
          price: 754.5,
          priceSource: "QUOTE_LAST_PRICE",
          premarketHigh: 753,
          premarketLow: 749,
          premarketHighState: "LIVE",
          premarketLowState: "LIVE",
          currentMarketDate: MARKET_DATE,
          currentSessionWindow: "RTH",
          currentMarketDateHasDefinedSessionData: true,
          premarketCoverageState: "COMPLETE",
        },
        derived: { distanceToHighPoints: 1.5, distanceToLowPoints: 5.5 },
        warningCode: null,
      },
      priceVsOpeningRange: {
        featureId: "PRICE_VS_OPENING_RANGE",
        featureVersion: "V1",
        status: "AVAILABLE",
        state: "BELOW_RANGE",
        sourceComponents: ["QUOTE", "OPENING_RANGE"],
        referenceDate: MARKET_DATE,
        referenceDateRelation: "CURRENT_MARKET_DATE",
        inputs: {
          price: 754.5,
          priceSource: "QUOTE_LAST_PRICE",
          openingRangeHigh: 758,
          openingRangeLow: 755,
          phase: "COMPLETE",
          currentMarketDate: MARKET_DATE,
          metricState: "LIVE",
          sourceState: "LIVE",
          coverageState: "COMPLETE",
        },
        derived: { distanceToHighPoints: -3.5, distanceToLowPoints: -0.5 },
        warningCode: null,
      },
      gapContext: {
        featureId: "RTH_GAP_CONTEXT",
        featureVersion: "V1",
        status: "AVAILABLE",
        state: "UP",
        sourceComponents: ["GAP"],
        referenceDate: MARKET_DATE,
        referenceDateRelation: "CURRENT_MARKET_DATE",
        inputs: {
          currentMarketDate: MARKET_DATE,
          previousRthMarketDate: PREVIOUS_DATE,
          currentRthOpen: 752,
          previousDayClose: 750,
          gapPoints: 2,
          gapPercent: 0.26666666666666666,
          direction: "UP",
          fillState: "UNFILLED",
          firstObservedFillCandleAt: null,
          metricState: "LIVE",
          sourceState: "LIVE",
          currentRthCoverageState: "COMPLETE",
          previousRthCoverageState: "COMPLETE",
        },
        derived: {},
        warningCode: null,
      },
      priceVsExpectedMoveRange: {
        featureId: "PRICE_VS_EXPECTED_MOVE_RANGE",
        featureVersion: "V1",
        status: "AVAILABLE",
        state: "INSIDE_RANGE",
        sourceComponents: ["QUOTE", "EXPECTED_MOVE"],
        referenceDate: MARKET_DATE,
        referenceDateRelation: "CURRENT_EXPIRATION",
        inputs: {
          price: 754.5,
          priceSource: "QUOTE_LAST_PRICE",
          upperImpliedMoveLevel: 758,
          lowerImpliedMoveLevel: 750,
          expirationDate: MARKET_DATE,
          currentMarketDate: MARKET_DATE,
          metricState: "LIVE",
          sourceState: "LIVE",
        },
        derived: { distanceToUpperPoints: -3.5, distanceToLowerPoints: 4.5 },
        warningCode: null,
      },
      netGexProxySign: {
        featureId: "RETURNED_WINDOW_NET_GEX_SIGN",
        featureVersion: "V1",
        status: "AVAILABLE",
        state: "NEGATIVE",
        sourceComponents: ["GEX"],
        referenceDate: MARKET_DATE,
        referenceDateRelation: "CURRENT_EXPIRATION",
        inputs: {
          netGammaExposureProxy: -500_000_000,
          methodology: "OI_WEIGHTED_GAMMA_PER_1PCT_MOVE",
          coverageScope: "RETURNED_CHAIN_WINDOW",
          coverageState: "COMPLETE",
          metricState: "LIVE",
          sourceState: "LIVE",
          eligibleStrikeCount: 40,
          expirationDate: MARKET_DATE,
        },
        derived: {},
        warningCode: null,
      },
      netDexProxySign: {
        featureId: "RETURNED_WINDOW_NET_DEX_SIGN",
        featureVersion: "V1",
        status: "AVAILABLE",
        state: "POSITIVE",
        sourceComponents: ["DEX"],
        referenceDate: MARKET_DATE,
        referenceDateRelation: "CURRENT_EXPIRATION",
        inputs: {
          netDeltaExposureProxy: 900_000_000,
          methodology: "OI_WEIGHTED_DELTA_NOTIONAL",
          coverageScope: "RETURNED_CHAIN_WINDOW",
          coverageState: "COMPLETE",
          metricState: "LIVE",
          sourceState: "LIVE",
          eligibleStrikeCount: 40,
          expirationDate: MARKET_DATE,
        },
        derived: {},
        warningCode: null,
      },
    },
    featureStatuses: [],
    featureWarnings: [],
    warningCode: null,
  } as unknown as SpyZeroDteDeterministicMarketStateResponse;
  sync(state);
  return SpyZeroDteDeterministicMarketStateResponseSchema.parse(state);
}

function sync(state: SpyZeroDteDeterministicMarketStateResponse): void {
  const features = Object.values(state.features);
  state.featureStatuses = features.map((feature) => ({
    featureId: feature.featureId,
    status: feature.status,
    warningCode: feature.warningCode,
  }));
  state.featureWarnings = features
    .filter((feature) => feature.warningCode !== null)
    .map((feature) => ({ featureId: feature.featureId, warningCode: feature.warningCode! }));
}

function validated(state: SpyZeroDteDeterministicMarketStateResponse): SpyZeroDteDeterministicMarketStateResponse {
  sync(state);
  return SpyZeroDteDeterministicMarketStateResponseSchema.parse(state);
}

function base(): SpyZeroDteDeterministicMarketStateResponse {
  return validated(structuredClone(baseMarketState()));
}

function setPrice(state: SpyZeroDteDeterministicMarketStateResponse, price: number): void {
  state.price = price;
  state.features.priceVsVwap.inputs.price = price;
  state.features.priceVsPriorDayRange.inputs.price = price;
  state.features.priceVsPremarketRange.inputs.price = price;
  state.features.priceVsOpeningRange.inputs.price = price;
  state.features.priceVsExpectedMoveRange.inputs.price = price;
}

function callsState(): SpyZeroDteDeterministicMarketStateResponse {
  const state = base();
  setPrice(state, 760);
  state.features.priceVsVwap.state = "ABOVE";
  state.features.priceVsVwap.inputs.vwap = 753;
  state.features.priceVsPremarketRange.state = "ABOVE_RANGE";
  state.features.priceVsOpeningRange.state = "ABOVE_RANGE";
  state.features.priceVsOpeningRange.inputs.openingRangeHigh = 758;
  state.features.priceVsOpeningRange.inputs.openingRangeLow = 755;
  return validated(state);
}

function putsState(): SpyZeroDteDeterministicMarketStateResponse {
  const state = base();
  setPrice(state, 748);
  state.features.priceVsVwap.state = "BELOW";
  state.features.priceVsVwap.inputs.vwap = 750;
  state.features.priceVsPriorDayRange.state = "BELOW_RANGE";
  state.features.priceVsPremarketRange.state = "BELOW_RANGE";
  state.features.priceVsOpeningRange.state = "BELOW_RANGE";
  state.features.priceVsOpeningRange.inputs.openingRangeHigh = 752;
  state.features.priceVsOpeningRange.inputs.openingRangeLow = 749;
  return validated(state);
}

function waitingCallsState(): SpyZeroDteDeterministicMarketStateResponse {
  const state = callsState();
  setPrice(state, 756);
  state.features.priceVsOpeningRange.state = "INSIDE_RANGE";
  return validated(state);
}

function waitingPutsState(): SpyZeroDteDeterministicMarketStateResponse {
  const state = putsState();
  setPrice(state, 750);
  state.features.priceVsOpeningRange.state = "INSIDE_RANGE";
  state.features.priceVsOpeningRange.inputs.openingRangeHigh = 753;
  state.features.priceVsOpeningRange.inputs.openingRangeLow = 749;
  return validated(state);
}

function qualifiedCallsState(): SpyZeroDteDeterministicMarketStateResponse {
  const state = callsState();
  state.features.priceVsPriorDayRange.inputs.previousDayHigh = 766;
  state.features.priceVsPriorDayRange.derived.distanceToHighPoints = 6;
  state.features.priceVsPremarketRange.inputs.premarketHigh = 764;
  state.features.priceVsPremarketRange.derived.distanceToHighPoints = 4;
  state.features.priceVsExpectedMoveRange.inputs.upperImpliedMoveLevel = 768;
  state.features.priceVsExpectedMoveRange.derived.distanceToUpperPoints = 8;
  return validated(state);
}

function closedState(): SpyZeroDteDeterministicMarketStateResponse {
  const state = qualifiedCallsState();
  state.features.sessionPhase.state = "CLOSED";
  state.features.sessionPhase.inputs.currentSessionWindow = "CLOSED";
  return validated(state);
}

function optionContract(
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
    quoteAt: FRESH_OPTION_QUOTE_AT,
    tradeAt: "2026-07-17T13:59:45.000Z",
    ...overrides,
  };
}

function optionsChain(overrides: Partial<SpyZeroDteOptionsChainResponse> = {}): SpyZeroDteOptionsChainResponse {
  const calls = [
    optionContract("SPY_CALL_760", "CALL", 760, { bid: 2.1, ask: 2.3, openInterest: 800, volume: 300 }),
    optionContract("SPY_CALL_761", "CALL", 761, { bid: 1.9, ask: 2.1, openInterest: 1200, volume: 700 }),
    optionContract("SPY_CALL_762", "CALL", 762, { bid: 1.5, ask: 1.7 }),
  ];
  const puts = [
    optionContract("SPY_PUT_760", "PUT", 760),
    optionContract("SPY_PUT_761", "PUT", 761),
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
    underlyingPrice: 760.5,
    underlyingPriceSource: "CHAIN_RESPONSE",
    calls,
    puts,
    requestedStrikeCount: 40,
    returnedUniqueStrikeCount: 3,
    callContractCount: calls.length,
    putContractCount: puts.length,
    minimumReturnedStrike: 760,
    maximumReturnedStrike: 762,
    providerContractCount: all.length,
    totalContracts: all.length,
    contractsWithBidAsk: all.length,
    contractsWithGreeks: all.length,
    contractsWithOpenInterest: all.length,
    contractsWithVolume: all.length,
    rejectedContractCount: 0,
    fetchedAt: CHAIN_AT,
    dataAgeMs: 0,
    latestOptionQuoteAt: FRESH_OPTION_QUOTE_AT,
    latestOptionTradeAt: "2026-07-17T13:59:45.000Z",
    warningCode: null,
    ...overrides,
  } as SpyZeroDteOptionsChainResponse;
}

function sourceBundle(
  state = qualifiedCallsState(),
  chain: SpyZeroDteOptionsChainResponse | null = optionsChain(),
) {
  const bias = buildSpyZeroDteDeterministicBias(state, BIAS_AT_MS);
  const tradePlan = buildSpyZeroDteDeterministicTradePlan(state, bias, PLAN_AT_MS);
  const risk = buildSpyZeroDteObjectiveRiskFramework(state, bias, tradePlan, RISK_AT_MS);
  const contract = buildSpyZeroDteContractSelection(risk, chain, CONTRACT_AT_MS);
  return { state, bias, tradePlan, risk, contract };
}

function assembled(
  state = qualifiedCallsState(),
  chain: SpyZeroDteOptionsChainResponse | null = optionsChain(),
) {
  const sources = sourceBundle(state, chain);
  return {
    sources,
    response: buildSpyZeroDteTradePlanAssembly(
      sources.state,
      sources.bias,
      sources.tradePlan,
      sources.risk,
      sources.contract,
      ASSEMBLY_AT_MS,
    ),
  };
}

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

async function main(): Promise<void> {
  await test("ASSEMBLY_V1 product and response validate", () => {
    const result = assembled().response;
    assert.equal(ASSEMBLY_METHODOLOGY_VERSION, "ASSEMBLY_V1");
    assert.equal(result.product, "SPY_ZERO_DTE_DETERMINISTIC_TRADE_PLAN_ASSEMBLY");
    assert.equal(SpyZeroDteTradePlanAssemblyResponseSchema.safeParse(result).success, true);
  });

  await test("READY maps from qualified Risk and selected Contract", () => {
    const result = assembled().response;
    assert.equal(result.planState, "READY");
    assert.equal(result.engineState, "AVAILABLE");
    assert.equal(result.direction, "CALLS");
    assert.equal(result.primaryReasonCode, "TRADE_PLAN_READY");
  });

  await test("READY enriches the exact Risk selections", () => {
    const result = assembled().response;
    assert.equal(result.structuralInvalidation.candidateId, "INVALIDATION_OPENING_RANGE_HIGH");
    assert.equal(result.structuralInvalidation.level, 758);
    assert.equal(result.primaryObjective.candidateId, "OBJECTIVE_PREMARKET_HIGH");
    assert.equal(result.primaryObjective.level, 764);
    assert.equal(result.underlyingRiskReward.rewardRiskRatio, 2);
  });

  await test("READY enriches only the selected Contract", () => {
    const result = assembled().response;
    assert.equal(result.selectedContract.contractSymbol, "SPY_CALL_760");
    assert.equal(result.selectedContract.providerMark, 2.1);
    assert.equal(result.selectedContract.selectionRank, 1);
    assert.equal((result as any).candidates, undefined);
  });

  await test("READY midpoint is reference-only and matches CONTRACT_V1", () => {
    const result = assembled().response;
    assert.equal(result.premiumReference.type, "CALCULATED_BID_ASK_MIDPOINT");
    assert.equal(result.premiumReference.value, result.selectedContract.calculatedMidpoint);
    assert.equal(result.premiumReference.disclosureCode, "MIDPOINT_REFERENCE_ONLY");
  });

  await test("same-object source composition is guaranteed", () => {
    const { sources } = assembled();
    assert.equal(
      hasConsistentAssemblySourceComposition(
        sources.state,
        sources.bias,
        sources.tradePlan,
        sources.risk,
        sources.contract,
      ),
      true,
    );
  });

  await test("source timestamp mismatch fails safely", () => {
    const { sources } = assembled();
    const invalidContract = structuredClone(sources.contract);
    invalidContract.sourceRiskCalculatedAt = "2026-07-17T14:00:09.000Z";
    const result = buildSpyZeroDteTradePlanAssembly(
      sources.state,
      sources.bias,
      sources.tradePlan,
      sources.risk,
      invalidContract,
      ASSEMBLY_AT_MS,
    );
    assert.equal(result.planState, "UNAVAILABLE");
    assert.equal(result.warningCode, "UPSTREAM_SNAPSHOT_MISMATCH");
    assert.equal(result.selectedContract.candidateId, null);
  });

  await test("WAITING_FOR_TRIGGER preserves projected Risk and hides Contract", () => {
    const state = waitingCallsState();
    state.features.priceVsPriorDayRange.inputs.previousDayHigh = 766;
    state.features.priceVsPremarketRange.inputs.premarketHigh = 764;
    state.features.priceVsExpectedMoveRange.inputs.upperImpliedMoveLevel = 768;
    const result = assembled(validated(state), null).response;
    assert.equal(result.planState, "WAITING_FOR_TRIGGER");
    assert.equal(result.entryCondition.state, "WAITING");
    assert.equal(result.entryCondition.planningReferenceType, "TRIGGER_LEVEL");
    assert.equal(result.selectedContract.candidateId, null);
    assert.equal(result.premiumReference.type, "UNAVAILABLE");
    assert.notEqual(result.structuralInvalidation.candidateId, null);
    assert.notEqual(result.primaryObjective.candidateId, null);
  });

  await test("NO_QUALIFIED_CONTRACT preserves underlying plan without fallback", () => {
    const chain = optionsChain();
    chain.calls.forEach((item) => { item.bid = 1; item.ask = 2; });
    const result = assembled(qualifiedCallsState(), chain).response;
    assert.equal(result.planState, "NO_QUALIFIED_CONTRACT");
    assert.notEqual(result.structuralInvalidation.candidateId, null);
    assert.notEqual(result.primaryObjective.candidateId, null);
    assert.equal(result.selectedContract.candidateId, null);
    assert.equal(result.premiumReference.value, null);
    assert.equal(result.warningCode, null);
  });

  await test("partial no-qualified Contract cannot become READY", () => {
    const chain = optionsChain();
    chain.calls.forEach((item) => { item.quoteAt = null; });
    const result = assembled(qualifiedCallsState(), chain).response;
    assert.equal(result.planState, "NO_QUALIFIED_CONTRACT");
    assert.equal(result.engineState, "PARTIAL");
    assert.equal(result.warningCode, "CONTRACT_SELECTION_PARTIAL");
  });

  await test("NOT_QUALIFIED does not expose a Contract", () => {
    const result = assembled(callsState(), null).response;
    assert.equal(result.planState, "NOT_QUALIFIED");
    assert.equal(result.selectedContract.candidateId, null);
    assert.equal(result.premiumReference.value, null);
  });

  await test("NOT_APPLICABLE is a normal available result", () => {
    const result = assembled(closedState(), null).response;
    assert.equal(result.planState, "NOT_APPLICABLE");
    assert.equal(result.engineState, "AVAILABLE");
    assert.equal(result.entryCondition.state, "NOT_APPLICABLE");
    assert.equal(result.structuralInvalidation.candidateId, null);
  });

  await test("direction mismatch fails unavailable", () => {
    const { sources } = assembled();
    const mismatched = structuredClone(sources.contract);
    mismatched.contractDirection = "PUT";
    mismatched.selectedContract.contractDirection = "PUT";
    const result = buildSpyZeroDteTradePlanAssembly(
      sources.state,
      sources.bias,
      sources.tradePlan,
      sources.risk,
      mismatched,
      ASSEMBLY_AT_MS,
    );
    assert.equal(result.planState, "UNAVAILABLE");
    assert.equal(result.primaryReasonCode, "SOURCE_DIRECTION_MISMATCH");
  });

  await test("selected Contract must resolve exactly once", () => {
    const { sources } = assembled();
    const invalid = structuredClone(sources.contract);
    invalid.candidates = [];
    const result = buildSpyZeroDteTradePlanAssembly(
      sources.state,
      sources.bias,
      sources.tradePlan,
      sources.risk,
      invalid,
      ASSEMBLY_AT_MS,
    );
    assert.equal(result.planState, "UNAVAILABLE");
    assert.equal(result.primaryReasonCode, "SOURCE_SELECTED_CONTRACT_MISSING");
  });

  await test("selected Contract rank must be one", () => {
    const { sources } = assembled();
    const invalid = structuredClone(sources.contract);
    const selected = invalid.candidates.find((item) => item.candidateId === invalid.selectedContract.candidateId)!;
    selected.selectionRank = 2;
    invalid.selectedContract.selectionRank = 2;
    const result = buildSpyZeroDteTradePlanAssembly(
      sources.state,
      sources.bias,
      sources.tradePlan,
      sources.risk,
      invalid,
      ASSEMBLY_AT_MS,
    );
    assert.equal(result.planState, "UNAVAILABLE");
    assert.equal(result.primaryReasonCode, "SOURCE_SELECTED_CONTRACT_NOT_RANK_ONE");
  });

  await test("selected Contract must remain FRESH", () => {
    const { sources } = assembled();
    const invalid = structuredClone(sources.contract);
    const selected = invalid.candidates.find((item) => item.candidateId === invalid.selectedContract.candidateId)!;
    selected.quoteFreshnessState = "STALE";
    invalid.selectedContract.quoteFreshnessState = "STALE";
    const result = buildSpyZeroDteTradePlanAssembly(
      sources.state,
      sources.bias,
      sources.tradePlan,
      sources.risk,
      invalid,
      ASSEMBLY_AT_MS,
    );
    assert.equal(result.planState, "UNAVAILABLE");
    assert.equal(result.primaryReasonCode, "SOURCE_SELECTED_CONTRACT_NOT_FRESH");
  });

  await test("state mapper rejects unrecognized combinations", () => {
    const { sources } = assembled();
    const invalidRisk = structuredClone(sources.risk);
    invalidRisk.frameworkState = "READY";
    const invalidContract = structuredClone(sources.contract);
    invalidContract.selectionState = "DEFERRED";
    assert.equal(
      determineTradePlanAssemblyState(invalidRisk, invalidContract).reason,
      "SOURCE_STATE_COMBINATION_UNRECOGNIZED",
    );
  });

  await test("BIAS_V1 confidence is preserved exactly", () => {
    const { sources, response } = assembled();
    assert.equal(response.bias.confidenceScore, sources.bias.confidenceScore);
    assert.equal(response.bias.confidenceScope, "STRUCTURAL_EVIDENCE_ONLY");
    assert.equal(response.bias.bullishEvidenceCount, sources.bias.bullishEvidenceCount);
  });

  await test("Assembly service retrieves Market State and Chain exactly once when applicable", async () => {
    let marketCalls = 0;
    let chainCalls = 0;
    let tick = Date.parse("2026-07-17T14:00:00.100Z");
    const result = await getSpyZeroDteTradePlanAssemblyWithDependencies({
      getMarketState: async () => { marketCalls += 1; return qualifiedCallsState(); },
      getOptionsChain: async () => { chainCalls += 1; return optionsChain(); },
      getLastResortOptionsChain: optionsChain,
      now: () => { const value = tick; tick += 100; return value; },
    });
    assert.equal(marketCalls, 1);
    assert.equal(chainCalls, 1);
    assert.equal(result.planState, "READY");
  });

  await test("Assembly service performs zero Chain calls when not applicable", async () => {
    let marketCalls = 0;
    let chainCalls = 0;
    let tick = Date.parse("2026-07-17T14:00:00.100Z");
    const result = await getSpyZeroDteTradePlanAssemblyWithDependencies({
      getMarketState: async () => { marketCalls += 1; return closedState(); },
      getOptionsChain: async () => { chainCalls += 1; return optionsChain(); },
      getLastResortOptionsChain: optionsChain,
      now: () => { const value = tick; tick += 100; return value; },
    });
    assert.equal(marketCalls, 1);
    assert.equal(chainCalls, 0);
    assert.equal(result.planState, "NOT_APPLICABLE");
    assert.equal(result.sourceSummary.contract.sourceOptionsChainFetchedAt, null);
  });

  await test("schema rejects READY without a selected Contract", () => {
    const invalid = structuredClone(assembled().response) as any;
    invalid.selectedContract.candidateId = null;
    assert.equal(SpyZeroDteTradePlanAssemblyResponseSchema.safeParse(invalid).success, false);
  });

  await test("schema rejects a non-READY midpoint", () => {
    const invalid = structuredClone(assembled(closedState(), null).response) as any;
    invalid.premiumReference = {
      type: "CALCULATED_BID_ASK_MIDPOINT",
      value: 2.2,
      disclosureCode: "MIDPOINT_REFERENCE_ONLY",
    };
    assert.equal(SpyZeroDteTradePlanAssemblyResponseSchema.safeParse(invalid).success, false);
  });

  await test("schema rejects NaN", () => {
    const invalid = structuredClone(assembled().response) as any;
    invalid.underlyingRiskReward.rewardRiskRatio = Number.NaN;
    assert.equal(SpyZeroDteTradePlanAssemblyResponseSchema.safeParse(invalid).success, false);
  });

  await test("response excludes prohibited execution and sizing fields", () => {
    const text = JSON.stringify(assembled().response);
    for (const prohibited of [
      "positionSize",
      "numberOfContracts",
      "accountRisk",
      "recommendedLimitPrice",
      "orderType",
      "premiumTarget",
      "premiumStop",
      "guaranteedFill",
      "dealerPosition",
    ]) {
      assert.equal(text.includes(prohibited), false);
    }
  });

  console.log(`\nTrade Plan Assembly tests: ${passed} passed, ${failed} failed`);
  if (failed > 0) process.exitCode = 1;
}

void main();
