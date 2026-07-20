/**
 * Deterministic tests for the SPY 0DTE TRADE_PLAN_V2 eligibility and soft-exposure engine.
 * Run: npx --no-install tsx apps/server/src/services/trade-plan.spec.ts
 */
import assert from "node:assert/strict";
import {
  SpyZeroDteDeterministicMarketStateResponseSchema,
  SpyZeroDteDeterministicTradePlanResponseSchema,
  type SpyZeroDteDeterministicBiasResponse,
  type SpyZeroDteDeterministicMarketStateResponse,
  type SpyZeroDteExposureStructureResponse,
} from "@spy-copilot/shared";
import { buildSpyZeroDteDeterministicBias } from "./market-bias.logic";
import {
  buildSpyZeroDteDeterministicTradePlan,
  calculateCallsTrigger,
  calculatePutsTrigger,
} from "./trade-plan.logic";

const MARKET_DATE = "2026-07-17";
const PREVIOUS_DATE = "2026-07-16";
const STATE_AT = "2026-07-17T14:00:00.000Z";
const BIAS_AT_MS = Date.parse("2026-07-17T14:00:01.000Z");
const PLAN_AT_MS = Date.parse("2026-07-17T14:00:02.000Z");
const QUOTE_AT = "2026-07-17T13:59:59.000Z";
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


function planExposure(
  gammaRegime: SpyZeroDteExposureStructureResponse["gammaRegime"],
  dexRegime: SpyZeroDteExposureStructureResponse["dexRegime"],
): SpyZeroDteExposureStructureResponse {
  const gexSign = gammaRegime === "PUT_DOMINANT" ? -1 : 1;
  const dexSign = dexRegime === "NEGATIVE" ? -1 : 1;
  return {
    symbol: "SPY",
    product: "SPY_ZERO_DTE_DETERMINISTIC_EXPOSURE_STRUCTURE",
    methodologyVersion: "EXPOSURE_STRUCTURE_V1",
    currentMarketDate: MARKET_DATE,
    calculatedAt: STATE_AT,
    engineState: "AVAILABLE",
    metricState: "LIVE",
    coverageState: "COMPLETE",
    expirationDate: MARKET_DATE,
    underlyingPrice: 760,
    minimumReturnedStrike: 750,
    maximumReturnedStrike: 770,
    eligibleGexStrikeCount: 20,
    eligibleDexStrikeCount: 20,
    grossGammaExposure: 1_000_000,
    returnedWindowNetGammaExposureProxy: 500_000 * gexSign,
    gammaRegime,
    gammaRegimeRatioPercent: 50 * gexSign,
    callWalls: [{
      rank: 1, strikePrice: 765, exposureMagnitude: 300_000,
      shareOfSidePercent: 40, shareOfGrossGammaPercent: 30,
      distanceFromUnderlyingPoints: 5, distanceFromUnderlyingPercent: 5 / 7.6,
    }],
    putWalls: [{
      rank: 1, strikePrice: 755, exposureMagnitude: 300_000,
      shareOfSidePercent: 40, shareOfGrossGammaPercent: 30,
      distanceFromUnderlyingPoints: -5, distanceFromUnderlyingPercent: -5 / 7.6,
    }],
    largestPositiveNetGexStrike: 765,
    largestNegativeNetGexStrike: 755,
    gammaFlipProxy: {
      state: "NO_CROSS", estimatedStrike: null, lowerStrike: null,
      upperStrike: null, cumulativeNetGammaAtLower: null,
      cumulativeNetGammaAtUpper: null, distanceFromUnderlyingPoints: null,
      distanceFromUnderlyingPercent: null,
    },
    gammaCliffs: [],
    returnedWindowNetDeltaExposureProxy: 400_000_000 * dexSign,
    dexRegime,
    dexRegimeRatioPercent: 40 * dexSign,
    largestAbsoluteDexAnchor: null,
    sourceGexMetricState: "LIVE",
    sourceGexCoverageState: "COMPLETE",
    sourceDexMetricState: "LIVE",
    sourceDexCoverageState: "COMPLETE",
    latestOptionQuoteAt: QUOTE_AT,
    chainFetchedAt: STATE_AT,
    warnings: [],
    disclosures: {
      returnedWindowOnly: true,
      openInterestMayBeStaleIntraday: true,
      analyticalCallPositivePutNegativeConvention: true,
      gammaFlipIsCumulativeBalanceProxy: true,
      notObservedDealerInventory: true,
      noStandaloneSignal: true,
      noPrivateAccountData: true,
      noPositionSizing: true,
      noOrderExecution: true,
    },
  };
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

function build(
  state: SpyZeroDteDeterministicMarketStateResponse,
  biasOverride?: SpyZeroDteDeterministicBiasResponse,
) {
  const marketState = validated(state);
  const bias = biasOverride ?? buildSpyZeroDteDeterministicBias(marketState, BIAS_AT_MS);
  return buildSpyZeroDteDeterministicTradePlan(marketState, bias, PLAN_AT_MS);
}

let passed = 0;
let failed = 0;
function test(name: string, fn: () => void): void {
  try {
    fn();
    passed += 1;
    console.log(`✓ ${name}`);
  } catch (error) {
    failed += 1;
    console.error(`✗ ${name}`);
    console.error(error);
  }
}

function gate(result: ReturnType<typeof build>, gateId: string) {
  return result.gates.find((item) => item.gateId === gateId)!;
}

test("locked product, methodology, and route response contract validate", () => {
  const result = build(callsState());
  assert.equal(result.product, "SPY_ZERO_DTE_DETERMINISTIC_CONDITIONAL_TRADE_PLAN");
  assert.equal(result.methodologyVersion, "TRADE_PLAN_V2");
  assert.equal(result.structuralConfidenceScore, result.biasConfidenceScore);
  assert.equal(result.planConfidenceScore, result.exposureConfirmation!.adjustedConfidenceScore);
  assert.deepEqual(SpyZeroDteDeterministicTradePlanResponseSchema.parse(result), result);
});

test("eligible Calls require the complete aligned passing case", () => {
  const result = build(callsState());
  assert.equal(result.engineState, "AVAILABLE");
  assert.equal(result.setupDirection, "CALLS");
  assert.equal(result.setupState, "ELIGIBLE");
  assert.equal(result.primaryReasonCode, "ELIGIBLE_CALLS_SETUP");
  assert.equal(result.warningCode, null);
});

test("eligible Puts are symmetric", () => {
  const result = build(putsState());
  assert.equal(result.engineState, "AVAILABLE");
  assert.equal(result.setupDirection, "PUTS");
  assert.equal(result.setupState, "ELIGIBLE");
  assert.equal(result.primaryReasonCode, "ELIGIBLE_PUTS_SETUP");
});

test("Calls trigger uses max of VWAP and Opening Range High", () => {
  const result = build(callsState());
  assert.equal(result.trigger.sourceValues.vwap, 753);
  assert.equal(result.trigger.sourceValues.openingRangeBoundary, 758);
  assert.equal(result.trigger.level, 758);
});

test("Puts trigger uses min of VWAP and Opening Range Low", () => {
  const result = build(putsState());
  assert.equal(result.trigger.sourceValues.vwap, 750);
  assert.equal(result.trigger.sourceValues.openingRangeBoundary, 749);
  assert.equal(result.trigger.level, 749);
});

test("Calls trigger helper lets VWAP determine the threshold", () => {
  const trigger = calculateCallsTrigger(760, 759, 758)!;
  assert.equal(trigger.level, 759);
  assert.equal(trigger.satisfied, true);
});

test("Calls trigger helper lets Opening Range High determine the threshold", () => {
  const trigger = calculateCallsTrigger(760, 753, 758)!;
  assert.equal(trigger.level, 758);
});

test("Puts trigger helper lets VWAP determine the threshold", () => {
  const trigger = calculatePutsTrigger(748, 749, 750)!;
  assert.equal(trigger.level, 749);
});

test("Puts trigger helper lets Opening Range Low determine the threshold", () => {
  const trigger = calculatePutsTrigger(748, 750, 749)!;
  assert.equal(trigger.level, 749);
});

test("equal Calls source levels remain valid", () => {
  assert.equal(calculateCallsTrigger(760, 758, 758)?.level, 758);
});

test("equal Puts source levels remain valid", () => {
  assert.equal(calculatePutsTrigger(748, 749, 749)?.level, 749);
});

test("Calls strict equality does not satisfy trigger", () => {
  const trigger = calculateCallsTrigger(758, 753, 758)!;
  assert.equal(trigger.satisfied, false);
  assert.equal(trigger.signedDistancePoints, 0);
});

test("Puts strict equality does not satisfy trigger", () => {
  const trigger = calculatePutsTrigger(749, 750, 749)!;
  assert.equal(trigger.satisfied, false);
  assert.equal(trigger.signedDistancePoints, 0);
});

test("Calls signed distance is positive only above trigger", () => {
  assert.equal(calculateCallsTrigger(760, 753, 758)?.signedDistancePoints, 2);
  assert.equal(calculateCallsTrigger(756, 753, 758)?.signedDistancePoints, -2);
});

test("Puts signed distance is positive only below trigger", () => {
  assert.equal(calculatePutsTrigger(748, 750, 749)?.signedDistancePoints, 1);
  assert.equal(calculatePutsTrigger(750, 750, 749)?.signedDistancePoints, -1);
});

test("trigger helpers reject missing, nonpositive, NaN, and Infinity inputs", () => {
  assert.equal(calculateCallsTrigger(Number.NaN, 753, 758), null);
  assert.equal(calculateCallsTrigger(760, Number.POSITIVE_INFINITY, 758), null);
  assert.equal(calculatePutsTrigger(748, 750, 0), null);
  assert.equal(calculatePutsTrigger(748, -1, 749), null);
});

test("waiting Calls exposes a valid unsatisfied trigger", () => {
  const result = build(waitingCallsState());
  assert.equal(result.setupDirection, "CALLS");
  assert.equal(result.setupState, "WAITING_FOR_TRIGGER");
  assert.equal(result.primaryReasonCode, "WAITING_FOR_CALLS_TRIGGER");
  assert.equal(result.trigger.satisfied, false);
  assert.ok(result.trigger.signedDistancePoints! < 0);
});

test("waiting Puts exposes a valid unsatisfied trigger", () => {
  const result = build(waitingPutsState());
  assert.equal(result.setupDirection, "PUTS");
  assert.equal(result.setupState, "WAITING_FOR_TRIGGER");
  assert.equal(result.primaryReasonCode, "WAITING_FOR_PUTS_TRIGGER");
  assert.equal(result.trigger.satisfied, false);
});

test("waiting is a normal outcome without warning", () => {
  assert.equal(build(waitingCallsState()).warningCode, null);
});

test("closed session outranks unavailable Bias and is NOT_APPLICABLE", () => {
  const state = base();
  state.features.sessionPhase.state = "CLOSED";
  state.features.sessionPhase.inputs.currentSessionWindow = "CLOSED";
  const result = build(state);
  assert.equal(result.engineState, "AVAILABLE");
  assert.equal(result.setupDirection, "NONE");
  assert.equal(result.setupState, "NOT_APPLICABLE");
  assert.equal(result.primaryReasonCode, "SESSION_NOT_RTH");
  assert.equal(result.warningCode, null);
});

test("premarket is NOT_APPLICABLE", () => {
  const state = base();
  state.features.sessionPhase.state = "PREMARKET";
  state.features.sessionPhase.inputs.currentSessionWindow = "PREMARKET";
  const result = build(state);
  assert.equal(result.setupState, "NOT_APPLICABLE");
});

test("after-hours is NOT_APPLICABLE", () => {
  const state = base();
  state.features.sessionPhase.state = "AFTER_HOURS";
  state.features.sessionPhase.inputs.currentSessionWindow = "AFTER_HOURS";
  const result = build(state);
  assert.equal(result.setupState, "NOT_APPLICABLE");
});

test("RTH Opening Range not started is NOT_APPLICABLE", () => {
  const state = base();
  state.features.priceVsOpeningRange.status = "NOT_APPLICABLE";
  state.features.priceVsOpeningRange.state = "NOT_STARTED";
  state.features.priceVsOpeningRange.inputs.phase = "PRE_OPEN";
  state.features.priceVsOpeningRange.warningCode = null;
  const result = build(state);
  assert.equal(result.engineState, "AVAILABLE");
  assert.equal(result.setupState, "NOT_APPLICABLE");
  assert.equal(result.primaryReasonCode, "OPENING_RANGE_NOT_STARTED");
});

test("RTH Opening Range forming is NOT_APPLICABLE rather than PARTIAL", () => {
  const state = base();
  state.features.priceVsOpeningRange.status = "PARTIAL";
  state.features.priceVsOpeningRange.state = "FORMING";
  state.features.priceVsOpeningRange.inputs.phase = "FORMING";
  state.features.priceVsOpeningRange.warningCode = "OPENING_RANGE_FORMING";
  const result = build(state);
  assert.equal(result.engineState, "AVAILABLE");
  assert.equal(result.setupState, "NOT_APPLICABLE");
  assert.equal(result.warningCode, null);
});

test("Opening Range unavailable during RTH is UNAVAILABLE", () => {
  const state = base();
  state.features.priceVsOpeningRange.status = "UNAVAILABLE";
  state.features.priceVsOpeningRange.state = null;
  state.features.priceVsOpeningRange.inputs.phase = "UNAVAILABLE";
  state.features.priceVsOpeningRange.warningCode = "MISSING_REQUIRED_INPUT";
  const result = build(state);
  assert.equal(result.engineState, "UNAVAILABLE");
  assert.equal(result.setupState, "UNAVAILABLE");
  assert.equal(result.primaryReasonCode, "OPENING_RANGE_UNAVAILABLE");
});

test("Market-State unavailable produces unavailable plan", () => {
  const state = base();
  state.engineState = "UNAVAILABLE";
  state.price = null;
  state.priceSource = null;
  state.warningCode = "CURRENT_PRICE_UNAVAILABLE";
  const result = build(state);
  assert.equal(result.setupState, "UNAVAILABLE");
  assert.equal(result.warningCode, "MARKET_STATE_UNAVAILABLE");
});

test("same-snapshot mismatch is unavailable", () => {
  const state = callsState();
  const bias = buildSpyZeroDteDeterministicBias(state, BIAS_AT_MS);
  const mismatch = structuredClone(bias);
  mismatch.sourceMarketStateCalculatedAt = "2026-07-17T14:00:03.000Z";
  const result = build(state, mismatch);
  assert.equal(result.sameSnapshotGuaranteed, false);
  assert.equal(result.setupState, "UNAVAILABLE");
  assert.equal(result.warningCode, "SAME_SNAPSHOT_GUARANTEE_UNAVAILABLE");
});

test("current-session date mismatch blocks eligibility", () => {
  const state = callsState();
  state.features.priceVsOpeningRange.referenceDate = PREVIOUS_DATE;
  const result = build(state);
  assert.equal(result.setupState, "UNAVAILABLE");
  assert.equal(result.primaryReasonCode, "CURRENT_SESSION_DATE_MISMATCH");
});

test("prior-session VWAP date blocks eligibility", () => {
  const state = callsState();
  state.features.priceVsVwap.referenceDate = PREVIOUS_DATE;
  state.features.priceVsVwap.inputs.vwapMarketDate = PREVIOUS_DATE;
  const result = build(state);
  assert.equal(result.warningCode, "CURRENT_SESSION_DATE_MISMATCH");
});

test("neutral Bias produces NO_SETUP", () => {
  const state = base();
  state.features.priceVsVwap.state = "ABOVE";
  state.features.priceVsPremarketRange.state = "BELOW_RANGE";
  state.features.priceVsOpeningRange.state = "INSIDE_RANGE";
  const result = build(state);
  assert.equal(result.biasState, "NEUTRAL");
  assert.equal(result.setupDirection, "NONE");
  assert.equal(result.setupState, "NO_SETUP");
  assert.equal(result.primaryReasonCode, "BIAS_NEUTRAL");
  assert.equal(result.warningCode, null);
});

test("Bias unavailable in applicable RTH is unavailable", () => {
  const state = callsState();
  state.features.priceVsVwap.status = "UNAVAILABLE";
  state.features.priceVsVwap.state = null;
  state.features.priceVsVwap.warningCode = "MISSING_REQUIRED_INPUT";
  state.features.priceVsPremarketRange.status = "NOT_APPLICABLE";
  state.features.priceVsPremarketRange.state = null;
  state.features.priceVsPremarketRange.warningCode = null;
  state.features.priceVsPriorDayRange.status = "UNAVAILABLE";
  state.features.priceVsPriorDayRange.state = null;
  state.features.priceVsPriorDayRange.warningCode = "MISSING_REQUIRED_INPUT";
  state.features.priceVsOpeningRange.state = "INSIDE_RANGE";
  const result = build(state);
  assert.equal(result.biasState, "UNAVAILABLE");
  assert.equal(result.setupState, "UNAVAILABLE");
  assert.equal(result.warningCode, "BIAS_UNAVAILABLE");
});

test("bearish counterevidence blocks Calls", () => {
  const state = base();
  const result = build(state);
  assert.equal(result.biasState, "BULLISH");
  assert.ok(result.counterBiasEvidenceIds.length > 0);
  assert.equal(result.setupDirection, "NONE");
  assert.equal(result.setupState, "NO_SETUP");
  assert.equal(result.primaryReasonCode, "CALLS_COUNTEREVIDENCE_PRESENT");
});

test("bullish counterevidence blocks Puts", () => {
  const state = putsState();
  state.features.priceVsPriorDayRange.state = "ABOVE_RANGE";
  state.features.priceVsPremarketRange.state = "BELOW_RANGE";
  state.features.priceVsOpeningRange.state = "BELOW_RANGE";
  state.features.priceVsVwap.state = "BELOW";
  const result = build(state);
  assert.equal(result.biasState, "BEARISH");
  assert.ok(result.counterBiasEvidenceIds.includes("PRICE_VS_PRIOR_DAY_RANGE"));
  assert.equal(result.primaryReasonCode, "PUTS_COUNTEREVIDENCE_PRESENT");
});

test("neutral evidence does not block Calls", () => {
  const result = build(callsState());
  assert.ok(result.supportingBiasEvidenceIds.length >= 2);
  assert.equal(result.counterBiasEvidenceIds.length, 0);
  assert.equal(result.setupState, "ELIGIBLE");
});

test("legacy sign features do not create or block eligibility", () => {
  const state = callsState();
  state.features.netGexProxySign.state = "NEGATIVE";
  state.features.netDexProxySign.state = "POSITIVE";
  assert.equal(build(state).setupState, "ELIGIBLE");
});

test("supportive GEX and DEX increase plan confidence without changing eligibility", () => {
  const state = callsState();
  state.exposureStructure = planExposure("CALL_DOMINANT", "POSITIVE");
  const result = build(state);
  assert.equal(result.setupState, "ELIGIBLE");
  assert.equal(result.exposureConfirmation!.state, "SUPPORTIVE");
  assert.equal(result.exposureConfidenceAdjustmentPoints, 18);
  assert.equal(
    result.planConfidenceScore,
    Math.min(100, result.biasConfidenceScore! + 18),
  );
});

test("conflicting GEX and DEX regimes lower confidence but never block an eligible Calls plan", () => {
  const state = callsState();
  state.exposureStructure = planExposure("PUT_DOMINANT", "NEGATIVE");
  const result = build(state);
  assert.equal(result.setupState, "ELIGIBLE");
  assert.equal(result.setupDirection, "CALLS");
  assert.equal(result.exposureConfirmation!.state, "MIXED");
  assert.equal(result.exposureConfidenceAdjustmentPoints, -10);
  assert.equal(
    result.planConfidenceScore,
    Math.max(0, result.biasConfidenceScore! - 10),
  );
  assert.ok(result.exposureConfirmation!.warnings.includes("EXPOSURE_CONFLICT"));
  assert.equal(result.exposureConfirmation!.disclosures.cannotBlockEligibility, true);
});

test("partial required VWAP blocks ELIGIBLE with PARTIAL engine", () => {
  const state = callsState();
  state.features.priceVsVwap.status = "PARTIAL";
  state.features.priceVsVwap.warningCode = "PARTIAL_SOURCE_COMPONENT";
  const result = build(state);
  assert.equal(result.engineState, "PARTIAL");
  assert.equal(result.setupDirection, "NONE");
  assert.equal(result.setupState, "NO_SETUP");
  assert.equal(result.warningCode, "REQUIRED_INPUT_PARTIAL");
});

test("stale required input uses stale warning", () => {
  const state = callsState();
  state.features.priceVsVwap.status = "PARTIAL";
  state.features.priceVsVwap.warningCode = "STALE_SOURCE_COMPONENT";
  const result = build(state);
  assert.equal(result.engineState, "PARTIAL");
  assert.equal(result.warningCode, "REQUIRED_INPUT_STALE");
});

test("partial required Opening Range blocks ELIGIBLE", () => {
  const state = callsState();
  state.features.priceVsOpeningRange.status = "PARTIAL";
  state.features.priceVsOpeningRange.warningCode = "PARTIAL_SOURCE_COMPONENT";
  assert.equal(build(state).setupState, "NO_SETUP");
});

test("partial required Session blocks ELIGIBLE", () => {
  const state = callsState();
  state.features.sessionPhase.status = "PARTIAL";
  state.features.sessionPhase.warningCode = "STALE_SOURCE_COMPONENT";
  assert.equal(build(state).engineState, "PARTIAL");
});

test("partial Bias blocks ELIGIBLE", () => {
  const state = callsState();
  state.features.priceVsPremarketRange.status = "PARTIAL";
  state.features.priceVsPremarketRange.warningCode = "PARTIAL_SOURCE_COMPONENT";
  const result = build(state);
  assert.equal(result.biasEngineState, "PARTIAL");
  assert.equal(result.setupState, "NO_SETUP");
});

test("unrelated partial GEX does not weaken eligible plan", () => {
  const state = callsState();
  state.engineState = "PARTIAL";
  state.warningCode = "PARTIAL_MARKET_STATE";
  state.features.netGexProxySign.status = "PARTIAL";
  state.features.netGexProxySign.warningCode = "PARTIAL_GEX";
  const result = build(state);
  assert.equal(result.biasEngineState, "AVAILABLE");
  assert.equal(result.engineState, "AVAILABLE");
  assert.equal(result.setupState, "ELIGIBLE");
});

test("unavailable unrelated DEX does not weaken eligible plan", () => {
  const state = callsState();
  state.engineState = "PARTIAL";
  state.warningCode = "PARTIAL_MARKET_STATE";
  state.features.netDexProxySign.status = "UNAVAILABLE";
  state.features.netDexProxySign.state = null;
  state.features.netDexProxySign.warningCode = "DEX_UNAVAILABLE";
  const result = build(state);
  assert.equal(result.engineState, "AVAILABLE");
  assert.equal(result.setupState, "ELIGIBLE");
});

test("eligible Calls expose strict comparison and positive distance", () => {
  const result = build(callsState());
  assert.equal(result.trigger.comparison, "PRICE_GREATER_THAN");
  assert.equal(result.trigger.satisfied, true);
  assert.ok(result.trigger.signedDistancePoints! > 0);
});

test("eligible Puts expose strict comparison and positive distance", () => {
  const result = build(putsState());
  assert.equal(result.trigger.comparison, "PRICE_LESS_THAN");
  assert.equal(result.trigger.satisfied, true);
  assert.ok(result.trigger.signedDistancePoints! > 0);
});

test("all thirteen gates appear exactly once in deterministic order", () => {
  const result = build(callsState());
  assert.equal(result.gates.length, 13);
  assert.equal(new Set(result.gates.map((item) => item.gateId)).size, 13);
  assert.deepEqual(result.gates.map((item) => item.gateId), [
    "MARKET_STATE_AVAILABLE",
    "SAME_SNAPSHOT_GUARANTEED",
    "SESSION_IS_RTH",
    "OPENING_RANGE_COMPLETE",
    "CURRENT_SESSION_DATES_COMPATIBLE",
    "BIAS_AVAILABLE",
    "DIRECTIONAL_BIAS_PRESENT",
    "SOURCE_QUALITY_COMPLETE",
    "COUNTEREVIDENCE_POLICY_PASSED",
    "TRIGGER_INPUTS_VALID",
    "VWAP_ALIGNED",
    "OPENING_RANGE_ALIGNED",
    "TRIGGER_SATISFIED",
  ]);
});

test("every required gate passes for eligible Calls", () => {
  const result = build(callsState());
  assert.ok(result.gates.every((item) => item.status === "PASSED"));
});

test("downstream gates are NOT_APPLICABLE after closed-session result", () => {
  const state = callsState();
  state.features.sessionPhase.state = "CLOSED";
  state.features.sessionPhase.inputs.currentSessionWindow = "CLOSED";
  const result = build(state);
  assert.equal(gate(result, "SESSION_IS_RTH").status, "NOT_APPLICABLE");
  assert.equal(gate(result, "OPENING_RANGE_COMPLETE").status, "NOT_APPLICABLE");
  assert.equal(gate(result, "TRIGGER_SATISFIED").status, "NOT_APPLICABLE");
});

test("waiting Calls visibly fails price gates without becoming NO_SETUP", () => {
  const result = build(waitingCallsState());
  assert.equal(gate(result, "OPENING_RANGE_ALIGNED").status, "FAILED");
  assert.equal(gate(result, "TRIGGER_SATISFIED").status, "FAILED");
  assert.equal(result.setupState, "WAITING_FOR_TRIGGER");
});

test("gate observed values preserve authoritative Market-State values", () => {
  const result = build(callsState());
  const inputGate = gate(result, "TRIGGER_INPUTS_VALID");
  assert.equal(inputGate.gateId, "TRIGGER_INPUTS_VALID");
  if (inputGate.gateId === "TRIGGER_INPUTS_VALID") {
    assert.equal(inputGate.observedValues.currentPrice, 760);
    assert.equal(inputGate.observedValues.vwap, 753);
    assert.equal(inputGate.observedValues.openingRangeHigh, 758);
  }
});

test("same-snapshot gate proves Bias and Plan use the same Market-State timestamp", () => {
  const result = build(callsState());
  assert.equal(result.sameSnapshotGuaranteed, true);
  assert.equal(result.sourceMarketStateCalculatedAt, result.sourceBiasMarketStateCalculatedAt);
  assert.equal(gate(result, "SAME_SNAPSHOT_GUARANTEED").status, "PASSED");
});

test("Market-State, Bias, and Trade-Plan calculation times remain distinct", () => {
  const result = build(callsState());
  assert.equal(result.sourceMarketStateCalculatedAt, STATE_AT);
  assert.equal(result.sourceBiasCalculatedAt, new Date(BIAS_AT_MS).toISOString());
  assert.equal(result.calculatedAt, new Date(PLAN_AT_MS).toISOString());
});

test("Bias Confidence is preserved but is not a threshold", () => {
  const result = build(callsState());
  assert.equal(result.biasConfidenceScope, "STRUCTURAL_EVIDENCE_ONLY");
  assert.equal(result.biasConfidenceScore, buildSpyZeroDteDeterministicBias(callsState(), BIAS_AT_MS).confidenceScore);
  assert.equal(result.setupState, "ELIGIBLE");
});

test("supporting and counter evidence IDs are auditable without full Bias duplication", () => {
  const result = build(callsState());
  assert.ok(result.supportingBiasEvidenceIds.includes("PRICE_VS_VWAP"));
  assert.deepEqual(result.counterBiasEvidenceIds, []);
  const raw = result as unknown as Record<string, unknown>;
  assert.equal("bias" in raw, false);
  assert.equal("marketState" in raw, false);
});

test("non-candidate states do not expose an active trigger", () => {
  const state = callsState();
  state.features.sessionPhase.state = "CLOSED";
  state.features.sessionPhase.inputs.currentSessionWindow = "CLOSED";
  const result = build(state);
  assert.equal(result.trigger.level, null);
  assert.equal(result.trigger.comparison, null);
  assert.equal(result.trigger.satisfied, null);
  assert.equal(result.trigger.signedDistancePoints, null);
});

test("response deliberately has no maintenance condition", () => {
  const raw = build(callsState()) as unknown as Record<string, unknown>;
  assert.equal("maintenanceCondition" in raw, false);
  assert.equal("maintenanceLevel" in raw, false);
});

test("response has no stop, target, risk, sizing, contract, order, AI, or dealer output", () => {
  const raw = build(callsState()) as unknown as Record<string, unknown>;
  const prohibited = Object.keys(raw).filter((name) =>
    /stop|target|riskReward|position|contract|order|execution|aiText|dealer/i.test(name),
  );
  assert.deepEqual(prohibited, []);
});

test("normal counterevidence NO_SETUP has null warning", () => {
  assert.equal(build(base()).warningCode, null);
});

test("normal neutral NO_SETUP has null warning", () => {
  const state = base();
  state.features.priceVsVwap.state = "ABOVE";
  state.features.priceVsPremarketRange.state = "BELOW_RANGE";
  state.features.priceVsOpeningRange.state = "INSIDE_RANGE";
  assert.equal(build(state).warningCode, null);
});

test("schema rejects NaN in trigger", () => {
  const result = build(callsState());
  const invalid = structuredClone(result) as any;
  invalid.trigger.signedDistancePoints = Number.NaN;
  assert.equal(SpyZeroDteDeterministicTradePlanResponseSchema.safeParse(invalid).success, false);
});

test("schema rejects Infinity in current price", () => {
  const result = build(callsState());
  const invalid = structuredClone(result) as any;
  invalid.currentPrice = Number.POSITIVE_INFINITY;
  assert.equal(SpyZeroDteDeterministicTradePlanResponseSchema.safeParse(invalid).success, false);
});

test("schema rejects ELIGIBLE with PARTIAL engine", () => {
  const result = build(callsState());
  const invalid = structuredClone(result) as any;
  invalid.engineState = "PARTIAL";
  assert.equal(SpyZeroDteDeterministicTradePlanResponseSchema.safeParse(invalid).success, false);
});

test("schema rejects WAITING with satisfied trigger", () => {
  const result = build(waitingCallsState());
  const invalid = structuredClone(result) as any;
  invalid.trigger.satisfied = true;
  assert.equal(SpyZeroDteDeterministicTradePlanResponseSchema.safeParse(invalid).success, false);
});

test("schema rejects duplicate or reordered gates", () => {
  const result = build(callsState());
  const invalid = structuredClone(result) as any;
  [invalid.gates[0], invalid.gates[1]] = [invalid.gates[1], invalid.gates[0]];
  assert.equal(SpyZeroDteDeterministicTradePlanResponseSchema.safeParse(invalid).success, false);
});

test("strict trigger calculation preserves full precision without rounding", () => {
  const trigger = calculateCallsTrigger(754.123456789, 753.111111111, 754.000000001)!;
  assert.equal(trigger.level, 754.000000001);
  assert.equal(trigger.signedDistancePoints, 754.123456789 - 754.000000001);
});

console.log(`\n${passed} passed, ${failed} failed (${passed + failed} total)`);
if (failed > 0) process.exit(1);
