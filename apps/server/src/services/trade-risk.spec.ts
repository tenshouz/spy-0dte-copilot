/**
 * Deterministic tests for the SPY 0DTE RISK_V1 objective/risk framework.
 * Run: npx --no-install tsx apps/server/src/services/trade-risk.spec.ts
 */
import assert from "node:assert/strict";
import {
  SpyZeroDteDeterministicMarketStateResponseSchema,
  SpyZeroDteObjectiveRiskResponseSchema,
  type SpyZeroDteDeterministicBiasResponse,
  type SpyZeroDteDeterministicMarketStateResponse,
  type SpyZeroDteDeterministicTradePlanResponse,
} from "@spy-copilot/shared";
import { buildSpyZeroDteDeterministicBias } from "./market-bias.logic";
import { buildSpyZeroDteDeterministicTradePlan } from "./trade-plan.logic";
import {
  buildSpyZeroDteObjectiveRiskFramework,
  MINIMUM_REWARD_RISK_RATIO,
} from "./trade-risk.logic";

const MARKET_DATE = "2026-07-17";
const PREVIOUS_DATE = "2026-07-16";
const STATE_AT = "2026-07-17T14:00:00.000Z";
const BIAS_AT_MS = Date.parse("2026-07-17T14:00:01.000Z");
const PLAN_AT_MS = Date.parse("2026-07-17T14:00:02.000Z");
const RISK_AT_MS = Date.parse("2026-07-17T14:00:03.000Z");
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
    price: 760,
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
          price: 760,
          priceSource: "QUOTE_LAST_PRICE",
          vwap: 753,
          vwapMarketDate: MARKET_DATE,
          quoteSourceState: "LIVE",
          vwapMetricState: "LIVE",
          vwapSourceState: "LIVE",
        },
        derived: { distancePoints: 7, distancePercent: (7 / 753) * 100 },
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
          price: 760,
          priceSource: "QUOTE_LAST_PRICE",
          previousDayHigh: 764,
          previousDayLow: 744,
          previousDayHighState: "LIVE",
          previousDayLowState: "LIVE",
          previousRthMarketDate: PREVIOUS_DATE,
          previousRthCoverageState: "COMPLETE",
        },
        derived: { distanceToHighPoints: -4, distanceToLowPoints: 16 },
        warningCode: null,
      },
      priceVsPremarketRange: {
        featureId: "PRICE_VS_PREMARKET_RANGE",
        featureVersion: "V1",
        status: "AVAILABLE",
        state: "INSIDE_RANGE",
        sourceComponents: ["QUOTE", "SESSION_LEVELS"],
        referenceDate: MARKET_DATE,
        referenceDateRelation: "CURRENT_MARKET_DATE",
        inputs: {
          price: 760,
          priceSource: "QUOTE_LAST_PRICE",
          premarketHigh: 762,
          premarketLow: 746,
          premarketHighState: "LIVE",
          premarketLowState: "LIVE",
          currentMarketDate: MARKET_DATE,
          currentSessionWindow: "RTH",
          currentMarketDateHasDefinedSessionData: true,
          premarketCoverageState: "COMPLETE",
        },
        derived: { distanceToHighPoints: -2, distanceToLowPoints: 14 },
        warningCode: null,
      },
      priceVsOpeningRange: {
        featureId: "PRICE_VS_OPENING_RANGE",
        featureVersion: "V1",
        status: "AVAILABLE",
        state: "ABOVE_RANGE",
        sourceComponents: ["QUOTE", "OPENING_RANGE"],
        referenceDate: MARKET_DATE,
        referenceDateRelation: "CURRENT_MARKET_DATE",
        inputs: {
          price: 760,
          priceSource: "QUOTE_LAST_PRICE",
          openingRangeHigh: 758,
          openingRangeLow: 755,
          phase: "COMPLETE",
          currentMarketDate: MARKET_DATE,
          metricState: "LIVE",
          sourceState: "LIVE",
          coverageState: "COMPLETE",
        },
        derived: { distanceToHighPoints: 2, distanceToLowPoints: 5 },
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
          price: 760,
          priceSource: "QUOTE_LAST_PRICE",
          upperImpliedMoveLevel: 768,
          lowerImpliedMoveLevel: 740,
          expirationDate: MARKET_DATE,
          currentMarketDate: MARKET_DATE,
          metricState: "LIVE",
          sourceState: "LIVE",
        },
        derived: { distanceToUpperPoints: -8, distanceToLowerPoints: 20 },
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
  return validated(state);
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

function clone(): SpyZeroDteDeterministicMarketStateResponse {
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
  return clone();
}

function putsState(): SpyZeroDteDeterministicMarketStateResponse {
  const state = clone();
  setPrice(state, 748);
  state.features.priceVsVwap.state = "BELOW";
  state.features.priceVsVwap.inputs.vwap = 750;
  state.features.priceVsVwap.derived.distancePoints = -2;
  state.features.priceVsOpeningRange.state = "BELOW_RANGE";
  state.features.priceVsOpeningRange.inputs.openingRangeHigh = 752;
  state.features.priceVsOpeningRange.inputs.openingRangeLow = 749;
  state.features.priceVsPriorDayRange.state = "INSIDE_RANGE";
  state.features.priceVsPremarketRange.state = "INSIDE_RANGE";
  return validated(state);
}

function waitingCallsState(): SpyZeroDteDeterministicMarketStateResponse {
  const state = callsState();
  setPrice(state, 756);
  state.features.priceVsOpeningRange.state = "INSIDE_RANGE";
  state.features.priceVsOpeningRange.derived.distanceToHighPoints = -2;
  state.features.priceVsOpeningRange.derived.distanceToLowPoints = 1;
  return validated(state);
}

function waitingPutsState(): SpyZeroDteDeterministicMarketStateResponse {
  const state = putsState();
  setPrice(state, 750);
  state.features.priceVsVwap.inputs.vwap = 751;
  state.features.priceVsVwap.state = "BELOW";
  state.features.priceVsOpeningRange.state = "INSIDE_RANGE";
  state.features.priceVsOpeningRange.inputs.openingRangeHigh = 753;
  state.features.priceVsOpeningRange.inputs.openingRangeLow = 749;
  return validated(state);
}

function buildUpstream(
  state: SpyZeroDteDeterministicMarketStateResponse,
): {
  state: SpyZeroDteDeterministicMarketStateResponse;
  bias: SpyZeroDteDeterministicBiasResponse;
  tradePlan: SpyZeroDteDeterministicTradePlanResponse;
} {
  const marketState = validated(state);
  const bias = buildSpyZeroDteDeterministicBias(marketState, BIAS_AT_MS);
  const tradePlan = buildSpyZeroDteDeterministicTradePlan(marketState, bias, PLAN_AT_MS);
  return { state: marketState, bias, tradePlan };
}

function build(
  state: SpyZeroDteDeterministicMarketStateResponse,
  mutate?: (
    upstream: {
      state: SpyZeroDteDeterministicMarketStateResponse;
      bias: SpyZeroDteDeterministicBiasResponse;
      tradePlan: SpyZeroDteDeterministicTradePlanResponse;
    },
  ) => void,
) {
  const upstream = buildUpstream(state);
  mutate?.(upstream);
  return buildSpyZeroDteObjectiveRiskFramework(
    upstream.state,
    upstream.bias,
    upstream.tradePlan,
    RISK_AT_MS,
  );
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

function objective(result: ReturnType<typeof build>, levelType: string) {
  return result.objectiveCandidates.find((candidate) => candidate.levelType === levelType)!;
}

function invalidation(result: ReturnType<typeof build>, levelType: string) {
  return result.invalidationCandidates.find((candidate) => candidate.levelType === levelType)!;
}

// Contract and same-snapshot foundation.
test("locked product and methodology validate", () => {
  const result = build(callsState());
  assert.equal(result.product, "SPY_ZERO_DTE_DETERMINISTIC_OBJECTIVE_RISK_FRAMEWORK");
  assert.equal(result.methodologyVersion, "RISK_V1");
  assert.deepEqual(SpyZeroDteObjectiveRiskResponseSchema.parse(result), result);
});

test("minimum reward-to-risk is exactly 2.0", () => {
  assert.equal(MINIMUM_REWARD_RISK_RATIO, 2);
  assert.equal(build(callsState()).minimumRewardRiskRatio, 2);
});

test("same Market-State timestamp is preserved through Bias and Trade Plan", () => {
  const result = build(callsState());
  assert.equal(result.sameSnapshotGuaranteed, true);
  assert.equal(result.sourceMarketStateCalculatedAt, STATE_AT);
  assert.equal(result.sourceBiasMarketStateCalculatedAt, STATE_AT);
  assert.equal(result.sourceTradePlanMarketStateCalculatedAt, STATE_AT);
});

test("Risk calculatedAt remains distinct", () => {
  const result = build(callsState());
  assert.equal(result.calculatedAt, new Date(RISK_AT_MS).toISOString());
  assert.notEqual(result.calculatedAt, result.sourceTradePlanCalculatedAt);
});

test("same-snapshot mismatch makes framework unavailable", () => {
  const result = build(callsState(), ({ tradePlan }) => {
    tradePlan.sourceMarketStateCalculatedAt = "2026-07-17T14:00:09.000Z";
  });
  assert.equal(result.frameworkState, "UNAVAILABLE");
  assert.equal(result.primaryReasonCode, "SAME_SNAPSHOT_GUARANTEE_UNAVAILABLE");
});

test("Bias calculated timestamp must match Trade-Plan source", () => {
  const result = build(callsState(), ({ tradePlan }) => {
    tradePlan.sourceBiasCalculatedAt = "2026-07-17T14:00:09.000Z";
  });
  assert.equal(result.frameworkState, "UNAVAILABLE");
});

// Propagation and planning reference.
test("eligible Calls produce READY", () => {
  const result = build(callsState());
  assert.equal(result.frameworkState, "READY");
  assert.equal(result.direction, "CALLS");
  assert.equal(result.riskQualification, "QUALIFIED");
});

test("eligible Puts produce READY symmetrically", () => {
  const result = build(putsState());
  assert.equal(result.frameworkState, "READY");
  assert.equal(result.direction, "PUTS");
  assert.equal(result.riskQualification, "QUALIFIED");
});

test("waiting Calls produce PREVIEW", () => {
  const result = build(waitingCallsState());
  assert.equal(result.frameworkState, "PREVIEW");
  assert.equal(result.direction, "CALLS");
  assert.equal(result.isCurrentlyTradeEligible, false);
});

test("waiting Puts produce PREVIEW", () => {
  const result = build(waitingPutsState());
  assert.equal(result.frameworkState, "PREVIEW");
  assert.equal(result.direction, "PUTS");
});

test("READY uses current price planning reference", () => {
  const result = build(callsState());
  assert.equal(result.planningReference.type, "CURRENT_PRICE");
  assert.equal(result.planningReference.price, 760);
  assert.equal(result.planningReference.quoteTimestamp, QUOTE_AT);
});

test("PREVIEW uses trigger level planning reference", () => {
  const result = build(waitingCallsState());
  assert.equal(result.planningReference.type, "TRIGGER_LEVEL");
  assert.equal(result.planningReference.price, 758);
  assert.equal(result.planningReference.quoteTimestamp, null);
});

test("planning reference disclosure is explicit", () => {
  assert.equal(build(callsState()).planningReference.disclosureCode, "PLANNING_REFERENCE_ONLY");
});

test("Trade Plan NOT_APPLICABLE propagates without candidates", () => {
  const state = callsState();
  state.features.sessionPhase.state = "CLOSED";
  state.features.sessionPhase.inputs.currentSessionWindow = "CLOSED";
  const result = build(validated(state));
  assert.equal(result.frameworkState, "NOT_APPLICABLE");
  assert.equal(result.objectiveCandidates.length, 0);
  assert.equal(result.warningCode, null);
});

test("Trade Plan NO_SETUP propagates", () => {
  const state = callsState();
  state.features.priceVsPriorDayRange.state = "BELOW_RANGE";
  const result = build(validated(state));
  assert.equal(result.frameworkState, "NO_SETUP");
  assert.equal(result.riskQualification, "NOT_APPLICABLE");
});

test("Trade Plan UNAVAILABLE propagates", () => {
  const state = callsState();
  state.price = null;
  state.priceSource = null;
  const result = build(validated(state));
  assert.equal(result.frameworkState, "UNAVAILABLE");
  assert.equal(result.warningCode, "TRADE_PLAN_UNAVAILABLE");
});

// Objective candidates.
test("Calls objective source set is exact", () => {
  const result = build(callsState());
  assert.deepEqual(result.objectiveCandidates.map((item) => item.levelType), [
    "PREVIOUS_DAY_HIGH",
    "PREMARKET_HIGH",
    "EXPECTED_MOVE_UPPER",
  ]);
});

test("Puts objective source set is exact", () => {
  const result = build(putsState());
  assert.deepEqual(result.objectiveCandidates.map((item) => item.levelType), [
    "PREVIOUS_DAY_LOW",
    "PREMARKET_LOW",
    "EXPECTED_MOVE_LOWER",
  ]);
});

test("Expected Move candidate is labeled implied boundary", () => {
  assert.equal(objective(build(callsState()), "EXPECTED_MOVE_UPPER").levelSemantic, "IMPLIED_MOVE_BOUNDARY");
});

test("Calls objective distance is level minus reference", () => {
  assert.equal(objective(build(callsState()), "PREVIOUS_DAY_HIGH").objectiveDistancePoints, 4);
});

test("Puts objective distance is reference minus level", () => {
  assert.equal(objective(build(putsState()), "PREVIOUS_DAY_LOW").objectiveDistancePoints, 4);
});

test("objective on wrong side is rejected", () => {
  const state = callsState();
  state.features.priceVsPriorDayRange.inputs.previousDayHigh = 759;
  const candidate = objective(build(validated(state)), "PREVIOUS_DAY_HIGH");
  assert.equal(candidate.selectable, false);
  assert.equal(candidate.rejectionReasonCode, "LEVEL_NOT_ON_FAVORABLE_SIDE");
});

test("objective equal to reference is rejected", () => {
  const state = callsState();
  state.features.priceVsPriorDayRange.inputs.previousDayHigh = 760;
  assert.equal(
    objective(build(validated(state)), "PREVIOUS_DAY_HIGH").rejectionReasonCode,
    "LEVEL_EQUALS_PLANNING_REFERENCE",
  );
});

test("partial objective remains visible but not selectable", () => {
  const state = callsState();
  state.features.priceVsExpectedMoveRange.status = "PARTIAL";
  state.features.priceVsExpectedMoveRange.warningCode = "STALE_EXPECTED_MOVE";
  const candidate = objective(build(validated(state)), "EXPECTED_MOVE_UPPER");
  assert.equal(candidate.sourceStatus, "PARTIAL");
  assert.equal(candidate.selectable, false);
});

test("unavailable objective remains auditable", () => {
  const state = callsState();
  state.features.priceVsExpectedMoveRange.status = "UNAVAILABLE";
  state.features.priceVsExpectedMoveRange.state = null;
  state.features.priceVsExpectedMoveRange.inputs.upperImpliedMoveLevel = null;
  state.features.priceVsExpectedMoveRange.warningCode = "EXPECTED_MOVE_UNAVAILABLE";
  const candidate = objective(build(validated(state)), "EXPECTED_MOVE_UPPER");
  assert.equal(candidate.sourceStatus, "UNAVAILABLE");
  assert.equal(candidate.eligibilityStatus, "UNAVAILABLE");
});

test("Premarket date mismatch rejects only that candidate", () => {
  const state = callsState();
  state.features.priceVsPremarketRange.referenceDate = PREVIOUS_DATE;
  const result = build(validated(state));
  assert.equal(objective(result, "PREMARKET_HIGH").rejectionReasonCode, "REFERENCE_DATE_MISMATCH");
  assert.equal(result.frameworkState, "READY");
});

test("Expected Move expiration mismatch rejects only that candidate", () => {
  const state = callsState();
  state.features.priceVsExpectedMoveRange.inputs.expirationDate = PREVIOUS_DATE;
  const result = build(validated(state));
  assert.equal(objective(result, "EXPECTED_MOVE_UPPER").rejectionReasonCode, "EXPIRATION_MISMATCH");
  assert.equal(result.frameworkState, "READY");
});

test("Previous-Day prior-session reference remains valid", () => {
  const candidate = objective(build(callsState()), "PREVIOUS_DAY_HIGH");
  assert.equal(candidate.referenceDate, PREVIOUS_DATE);
  assert.equal(candidate.referenceDateRelation, "PREVIOUS_RTH_SESSION");
  assert.equal(candidate.selectable, true);
});

test("objective ranking uses smallest positive distance", () => {
  const result = build(callsState());
  assert.equal(objective(result, "PREMARKET_HIGH").distanceRank, 1);
  assert.equal(objective(result, "PREVIOUS_DAY_HIGH").distanceRank, 2);
});

test("exact objective ties use Premarket before Previous-Day", () => {
  const state = callsState();
  state.features.priceVsPriorDayRange.inputs.previousDayHigh = 762;
  const result = build(validated(state));
  assert.equal(objective(result, "PREMARKET_HIGH").distanceRank, 1);
  assert.equal(objective(result, "PREVIOUS_DAY_HIGH").distanceRank, 2);
});

test("exact duplicate objective values remain separate", () => {
  const state = callsState();
  state.features.priceVsPriorDayRange.inputs.previousDayHigh = 762;
  const result = build(validated(state));
  assert.equal(result.objectiveCandidates.filter((item) => item.level === 762).length, 2);
});

// Invalidation candidates.
test("invalidation source set is exact", () => {
  assert.deepEqual(build(callsState()).invalidationCandidates.map((item) => item.levelType), [
    "CURRENT_RTH_VWAP",
    "OPENING_RANGE_HIGH",
    "OPENING_RANGE_LOW",
  ]);
});

test("Calls risk distance is reference minus invalidation", () => {
  assert.equal(invalidation(build(callsState()), "OPENING_RANGE_HIGH").riskDistancePoints, 2);
});

test("Puts risk distance is invalidation minus reference", () => {
  assert.equal(invalidation(build(putsState()), "OPENING_RANGE_LOW").riskDistancePoints, 1);
});

test("invalidation on favorable side is rejected", () => {
  const result = build(callsState(), ({ state }) => {
    state.features.priceVsVwap.inputs.vwap = 761;
  });
  assert.equal(
    invalidation(result, "CURRENT_RTH_VWAP").rejectionReasonCode,
    "LEVEL_NOT_ON_ADVERSE_SIDE",
  );
});

test("invalidation equal to planning reference is rejected", () => {
  const result = build(waitingCallsState());
  assert.equal(
    invalidation(result, "OPENING_RANGE_HIGH").rejectionReasonCode,
    "LEVEL_EQUALS_PLANNING_REFERENCE",
  );
});

test("nearest valid adverse invalidation is selected", () => {
  const result = build(callsState());
  assert.equal(result.selectedInvalidation.levelType, "OPENING_RANGE_HIGH");
  assert.equal(result.selectedInvalidation.riskDistancePoints, 2);
});

test("Puts nearest invalidation is symmetric", () => {
  const result = build(putsState());
  assert.equal(result.selectedInvalidation.levelType, "OPENING_RANGE_LOW");
  assert.equal(result.selectedInvalidation.riskDistancePoints, 1);
});

test("Calls preview rejects trigger-equal Opening Range High", () => {
  const result = build(waitingCallsState());
  assert.equal(invalidation(result, "OPENING_RANGE_HIGH").selectable, false);
  assert.equal(result.selectedInvalidation.levelType, "OPENING_RANGE_LOW");
});

test("Puts preview rejects trigger-equal Opening Range Low", () => {
  const result = build(waitingPutsState());
  assert.equal(invalidation(result, "OPENING_RANGE_LOW").selectable, false);
  assert.equal(result.selectedInvalidation.levelType, "CURRENT_RTH_VWAP");
});

test("partial invalidation cannot be selected", () => {
  const result = build(callsState(), ({ state }) => {
    state.features.priceVsOpeningRange.status = "PARTIAL";
    state.features.priceVsOpeningRange.warningCode = "STALE_OPENING_RANGE";
  });
  assert.equal(result.selectedInvalidation.levelType, "CURRENT_RTH_VWAP");
});

test("invalidation tie-break prefers VWAP", () => {
  const state = callsState();
  state.features.priceVsVwap.inputs.vwap = 758;
  const result = build(validated(state));
  assert.equal(result.selectedInvalidation.levelType, "CURRENT_RTH_VWAP");
});

test("all adverse levels absent is normal NOT_QUALIFIED", () => {
  const result = build(callsState(), ({ state }) => {
    state.features.priceVsVwap.inputs.vwap = 761;
    state.features.priceVsOpeningRange.inputs.openingRangeHigh = 762;
    state.features.priceVsOpeningRange.inputs.openingRangeLow = 761;
  });
  assert.equal(result.engineState, "AVAILABLE");
  assert.equal(result.frameworkState, "NOT_QUALIFIED");
  assert.equal(result.warningCode, null);
});

test("all invalidation sources unavailable makes framework unavailable", () => {
  const state = callsState();
  state.features.priceVsVwap.status = "UNAVAILABLE";
  state.features.priceVsVwap.state = null;
  state.features.priceVsVwap.inputs.vwap = null;
  state.features.priceVsVwap.warningCode = "VWAP_UNAVAILABLE";
  state.features.priceVsOpeningRange.status = "UNAVAILABLE";
  state.features.priceVsOpeningRange.state = null;
  state.features.priceVsOpeningRange.inputs.openingRangeHigh = null;
  state.features.priceVsOpeningRange.inputs.openingRangeLow = null;
  state.features.priceVsOpeningRange.warningCode = "OPENING_RANGE_UNAVAILABLE";
  const result = build(state, ({ tradePlan }) => {
    tradePlan.setupState = "ELIGIBLE";
    tradePlan.setupDirection = "CALLS";
    tradePlan.currentPrice = 760;
    tradePlan.priceSource = "QUOTE_LAST_PRICE";
    tradePlan.trigger = {
      level: 758,
      comparison: "PRICE_GREATER_THAN",
      satisfied: true,
      signedDistancePoints: 2,
      sourceFeatureIds: ["PRICE_VS_VWAP", "PRICE_VS_OPENING_RANGE"],
      sourceValues: { vwap: 753, openingRangeBoundary: 758 },
    };
  });
  assert.equal(result.frameworkState, "UNAVAILABLE");
});

// Reward/risk and selection.
test("Calls reward-to-risk uses objective distance divided by selected risk", () => {
  const result = build(callsState());
  assert.equal(objective(result, "PREVIOUS_DAY_HIGH").rewardRiskRatio, 2);
});

test("Puts reward-to-risk is symmetric", () => {
  const result = build(putsState());
  assert.equal(objective(result, "PREMARKET_LOW").rewardRiskRatio, 2);
});

test("ratio equal to 2 qualifies", () => {
  assert.equal(objective(build(callsState()), "PREVIOUS_DAY_HIGH").qualificationStatus, "QUALIFIED");
});

test("ratio below 2 is retained but not qualified", () => {
  const candidate = objective(build(callsState()), "PREMARKET_HIGH");
  assert.equal(candidate.rewardRiskRatio, 1);
  assert.equal(candidate.qualificationStatus, "BELOW_MINIMUM_RATIO");
});

test("nearest unqualified objective is skipped", () => {
  const result = build(callsState());
  assert.equal(objective(result, "PREMARKET_HIGH").distanceRank, 1);
  assert.equal(result.selectedObjective.levelType, "PREVIOUS_DAY_HIGH");
});

test("nearest qualified objective is selected", () => {
  const result = build(callsState());
  assert.equal(result.selectedObjective.candidateId, "OBJECTIVE_PREVIOUS_DAY_HIGH");
  assert.equal(result.selectedObjective.rewardRiskRatio, 2);
});

test("no objective meeting 2.0 produces NOT_QUALIFIED", () => {
  const state = callsState();
  state.features.priceVsPriorDayRange.inputs.previousDayHigh = 763;
  state.features.priceVsExpectedMoveRange.inputs.upperImpliedMoveLevel = 763.5;
  const result = build(validated(state));
  assert.equal(result.frameworkState, "NOT_QUALIFIED");
  assert.equal(result.primaryReasonCode, "NO_OBJECTIVE_MEETS_MINIMUM_RATIO");
  assert.equal(result.warningCode, null);
});

test("no favorable objective is normal NOT_QUALIFIED", () => {
  const state = callsState();
  state.features.priceVsPriorDayRange.inputs.previousDayHigh = 759;
  state.features.priceVsPremarketRange.inputs.premarketHigh = 758;
  state.features.priceVsExpectedMoveRange.inputs.upperImpliedMoveLevel = 760;
  const result = build(validated(state));
  assert.equal(result.frameworkState, "NOT_QUALIFIED");
  assert.equal(result.primaryReasonCode, "NO_FAVORABLE_OBJECTIVE_CANDIDATE");
  assert.equal(result.warningCode, null);
});

test("selected objective ID exists in candidates", () => {
  const result = build(callsState());
  assert.ok(result.objectiveCandidates.some((item) => item.candidateId === result.selectedObjective.candidateId));
});

test("selected invalidation ID exists in candidates", () => {
  const result = build(callsState());
  assert.ok(result.invalidationCandidates.some((item) => item.candidateId === result.selectedInvalidation.candidateId));
});

// Source-quality relevance.
test("unused partial Expected Move does not weaken complete framework", () => {
  const state = callsState();
  state.features.priceVsExpectedMoveRange.status = "PARTIAL";
  state.features.priceVsExpectedMoveRange.warningCode = "STALE_EXPECTED_MOVE";
  const result = build(validated(state));
  assert.equal(result.engineState, "AVAILABLE");
  assert.equal(result.frameworkState, "READY");
});

test("partial-only potential objective produces PARTIAL NOT_QUALIFIED", () => {
  const state = callsState();
  state.features.priceVsPriorDayRange.inputs.previousDayHigh = 759;
  state.features.priceVsPremarketRange.inputs.premarketHigh = 758;
  state.features.priceVsExpectedMoveRange.status = "PARTIAL";
  state.features.priceVsExpectedMoveRange.warningCode = "STALE_EXPECTED_MOVE";
  const result = build(validated(state));
  assert.equal(result.engineState, "PARTIAL");
  assert.equal(result.frameworkState, "NOT_QUALIFIED");
  assert.equal(result.primaryReasonCode, "REQUIRED_LEVEL_PARTIAL");
});

test("partial GEX does not affect Risk", () => {
  const state = callsState();
  state.features.netGexProxySign.status = "PARTIAL";
  state.features.netGexProxySign.warningCode = "PARTIAL_GEX";
  const result = build(validated(state));
  assert.equal(result.engineState, "AVAILABLE");
  assert.equal(result.frameworkState, "READY");
});

test("unavailable DEX does not affect Risk", () => {
  const state = callsState();
  state.features.netDexProxySign.status = "UNAVAILABLE";
  state.features.netDexProxySign.state = null;
  state.features.netDexProxySign.warningCode = "DEX_UNAVAILABLE";
  const result = build(validated(state));
  assert.equal(result.engineState, "AVAILABLE");
  assert.equal(result.frameworkState, "READY");
});

test("partial rejected candidate is never selected", () => {
  const state = callsState();
  state.features.priceVsPriorDayRange.status = "PARTIAL";
  state.features.priceVsPriorDayRange.warningCode = "STALE_PRIOR_LEVELS";
  const result = build(validated(state));
  assert.notEqual(result.selectedObjective.levelType, "PREVIOUS_DAY_HIGH");
});

test("READY selected candidates are AVAILABLE", () => {
  const result = build(callsState());
  const selectedObjective = result.objectiveCandidates.find((item) => item.candidateId === result.selectedObjective.candidateId)!;
  const selectedInvalidation = result.invalidationCandidates.find((item) => item.candidateId === result.selectedInvalidation.candidateId)!;
  assert.equal(selectedObjective.sourceStatus, "AVAILABLE");
  assert.equal(selectedInvalidation.sourceStatus, "AVAILABLE");
});

// Schema and prohibited output.
test("null selected objective is explicit for NOT_QUALIFIED", () => {
  const state = callsState();
  state.features.priceVsPriorDayRange.inputs.previousDayHigh = 759;
  state.features.priceVsPremarketRange.inputs.premarketHigh = 758;
  state.features.priceVsExpectedMoveRange.inputs.upperImpliedMoveLevel = 759;
  const result = build(validated(state));
  assert.deepEqual(result.selectedObjective, {
    candidateId: null,
    levelType: null,
    level: null,
    objectiveDistancePoints: null,
    rewardRiskRatio: null,
  });
});

test("schema rejects NaN reward-to-risk", () => {
  const invalid = structuredClone(build(callsState())) as any;
  invalid.selectedObjective.rewardRiskRatio = Number.NaN;
  assert.equal(SpyZeroDteObjectiveRiskResponseSchema.safeParse(invalid).success, false);
});

test("schema rejects Infinity candidate ratio", () => {
  const invalid = structuredClone(build(callsState())) as any;
  invalid.objectiveCandidates[0].rewardRiskRatio = Number.POSITIVE_INFINITY;
  assert.equal(SpyZeroDteObjectiveRiskResponseSchema.safeParse(invalid).success, false);
});

test("schema rejects QUALIFIED without selections", () => {
  const invalid = structuredClone(build(callsState())) as any;
  invalid.selectedObjective.candidateId = null;
  invalid.selectedObjective.levelType = null;
  invalid.selectedObjective.level = null;
  invalid.selectedObjective.objectiveDistancePoints = null;
  invalid.selectedObjective.rewardRiskRatio = null;
  assert.equal(SpyZeroDteObjectiveRiskResponseSchema.safeParse(invalid).success, false);
});

test("methodology exposes underlying-points scope", () => {
  const result = build(callsState());
  assert.equal(result.methodology.calculationsUse, "SPY_UNDERLYING_PRICE_POINTS");
  assert.equal(result.methodology.minimumRewardRiskRatio, 2);
});

test("duplicate-level policy is explicit", () => {
  assert.equal(
    build(callsState()).methodology.duplicateLevelPolicy,
    "PRESERVE_SEPARATE_CANDIDATES_EXACT_EQUALITY_ONLY",
  );
});

test("partial-selection policy is explicit", () => {
  assert.equal(
    build(callsState()).methodology.partialSelectionPolicy,
    "PARTIAL_CANDIDATES_VISIBLE_BUT_NOT_SELECTABLE",
  );
});

test("response omits options-contract and execution fields", () => {
  const text = JSON.stringify(build(callsState()));
  for (const prohibited of [
    "contractSelection",
    "strikePrice",
    "optionPremium",
    "positionSize",
    "orderType",
    "stopLoss",
    "dealerPosition",
  ]) {
    assert.equal(text.includes(prohibited), false);
  }
});

test("READY is currently eligible", () => {
  assert.equal(build(callsState()).isCurrentlyTradeEligible, true);
});

test("PREVIEW is not currently eligible", () => {
  assert.equal(build(waitingCallsState()).isCurrentlyTradeEligible, false);
});

test("normal NOT_QUALIFIED carries no warning", () => {
  const state = callsState();
  state.features.priceVsPriorDayRange.inputs.previousDayHigh = 761;
  state.features.priceVsPremarketRange.inputs.premarketHigh = 761.5;
  state.features.priceVsExpectedMoveRange.inputs.upperImpliedMoveLevel = 763;
  assert.equal(build(validated(state)).warningCode, null);
});

test("candidate arrays never contain duplicate IDs", () => {
  const result = build(callsState());
  assert.equal(new Set(result.objectiveCandidates.map((item) => item.candidateId)).size, 3);
  assert.equal(new Set(result.invalidationCandidates.map((item) => item.candidateId)).size, 3);
});

test("full backend precision is preserved", () => {
  const state = callsState();
  state.features.priceVsPriorDayRange.inputs.previousDayHigh = 764.123456789;
  const result = build(validated(state));
  assert.equal(objective(result, "PREVIOUS_DAY_HIGH").objectiveDistancePoints, 4.123456788999988);
});

test("Calls and Puts minimum ratio behavior is symmetric", () => {
  assert.equal(build(callsState()).riskQualification, "QUALIFIED");
  assert.equal(build(putsState()).riskQualification, "QUALIFIED");
});

test("Risk direction never flips source Trade-Plan direction", () => {
  const calls = build(callsState());
  const puts = build(putsState());
  assert.equal(calls.direction, calls.sourceTradePlanSetupDirection);
  assert.equal(puts.direction, puts.sourceTradePlanSetupDirection);
});

test("planning-reference source differs for current price and trigger", () => {
  assert.equal(build(callsState()).planningReference.sourceCalculatedAt, STATE_AT);
  assert.equal(build(waitingCallsState()).planningReference.sourceCalculatedAt, new Date(PLAN_AT_MS).toISOString());
});

test("Expected Move expiration is preserved on candidate", () => {
  const candidate = objective(build(callsState()), "EXPECTED_MOVE_UPPER");
  assert.equal(candidate.referenceDate, MARKET_DATE);
  assert.equal(candidate.referenceDateRelation, "CURRENT_EXPIRATION");
});

test("current-session invalidation dates are preserved", () => {
  const result = build(callsState());
  assert.ok(result.invalidationCandidates.every((item) => item.referenceDate === MARKET_DATE));
});

test("Risk response does not duplicate upstream full objects", () => {
  const result = build(callsState()) as any;
  assert.equal("marketState" in result, false);
  assert.equal("bias" in result, false);
  assert.equal("tradePlan" in result, false);
  assert.equal("candles" in result, false);
  assert.equal("optionsChain" in result, false);
});

console.log(`\nTrade Risk tests: ${passed} passed, ${failed} failed`);
if (failed > 0) process.exitCode = 1;
