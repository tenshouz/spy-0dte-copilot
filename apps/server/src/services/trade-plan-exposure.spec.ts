/** Deterministic tests for EXPOSURE_CONFIRMATION_V2 context-only behavior. */
import assert from "node:assert/strict";
import {
  TradePlanExposureConfirmationSchema,
  type SpyZeroDteDeterministicMarketStateResponse,
  type SpyZeroDteExposureStructureResponse,
} from "@spy-copilot/shared";
import { buildTradePlanExposureConfirmation } from "./trade-plan-exposure.logic";
import { makeV140MarketState, V140_MARKET_DATE, V140_STATE_AT } from "./trade-engine-v140.test-fixtures";

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

function exposure(
  gammaRegime: SpyZeroDteExposureStructureResponse["gammaRegime"] = "CALL_DOMINANT",
  dexRegime: SpyZeroDteExposureStructureResponse["dexRegime"] = "POSITIVE",
): SpyZeroDteExposureStructureResponse {
  const gexSign = gammaRegime === "PUT_DOMINANT" ? -1 : 1;
  const dexSign = dexRegime === "NEGATIVE" ? -1 : 1;
  return {
    symbol: "SPY",
    product: "SPY_ZERO_DTE_DETERMINISTIC_EXPOSURE_STRUCTURE",
    methodologyVersion: "EXPOSURE_STRUCTURE_V1",
    currentMarketDate: V140_MARKET_DATE,
    calculatedAt: V140_STATE_AT,
    engineState: "AVAILABLE",
    metricState: "LIVE",
    coverageState: "COMPLETE",
    expirationDate: V140_MARKET_DATE,
    underlyingPrice: 758.35,
    minimumReturnedStrike: 745,
    maximumReturnedStrike: 770,
    eligibleGexStrikeCount: 20,
    eligibleDexStrikeCount: 20,
    grossGammaExposure: 1_000_000,
    returnedWindowNetGammaExposureProxy: 500_000 * gexSign,
    gammaRegime,
    gammaRegimeRatioPercent: 50 * gexSign,
    callWalls: [{
      rank: 1,
      strikePrice: 760,
      exposureMagnitude: 300_000,
      shareOfSidePercent: 40,
      shareOfGrossGammaPercent: 30,
      distanceFromUnderlyingPoints: 1.65,
      distanceFromUnderlyingPercent: 0.2176,
    }],
    putWalls: [{
      rank: 1,
      strikePrice: 747,
      exposureMagnitude: 300_000,
      shareOfSidePercent: 40,
      shareOfGrossGammaPercent: 30,
      distanceFromUnderlyingPoints: -11.35,
      distanceFromUnderlyingPercent: -1.4967,
    }],
    largestPositiveNetGexStrike: 760,
    largestNegativeNetGexStrike: 747,
    gammaFlipProxy: {
      state: "NO_CROSS",
      estimatedStrike: null,
      lowerStrike: null,
      upperStrike: null,
      cumulativeNetGammaAtLower: null,
      cumulativeNetGammaAtUpper: null,
      distanceFromUnderlyingPoints: null,
      distanceFromUnderlyingPercent: null,
    },
    gammaCliffs: [],
    gammaSignTransitions: [],
    returnedWindowNetDeltaExposureProxy: 400_000_000 * dexSign,
    dexRegime,
    dexRegimeRatioPercent: 40 * dexSign,
    largestAbsoluteDexAnchor: null,
    sourceGexMetricState: "LIVE",
    sourceGexCoverageState: "COMPLETE",
    sourceDexMetricState: "LIVE",
    sourceDexCoverageState: "COMPLETE",
    latestOptionQuoteAt: "2026-07-17T13:59:58.000Z",
    chainFetchedAt: V140_STATE_AT,
    warnings: [],
    disclosures: {
      returnedWindowOnly: true,
      openInterestMayBeStaleIntraday: true,
      analyticalCallPositivePutNegativeConvention: true,
      gammaFlipIsCumulativeBalanceProxy: true,
      gammaSignTransitionsAreAdjacentStrictCrossings: true,
      notObservedDealerInventory: true,
      noStandaloneSignal: true,
      noPrivateAccountData: true,
      noPositionSizing: true,
      noOrderExecution: true,
    },
  };
}

function stateWithExposure(
  gammaRegime: SpyZeroDteExposureStructureResponse["gammaRegime"] = "CALL_DOMINANT",
  dexRegime: SpyZeroDteExposureStructureResponse["dexRegime"] = "POSITIVE",
): SpyZeroDteDeterministicMarketStateResponse {
  const state = makeV140MarketState("CALLS");
  state.exposureStructure = exposure(gammaRegime, dexRegime);
  return state;
}

test("GEX, DEX, and walls remain context-only for Calls", () => {
  const result = buildTradePlanExposureConfirmation(stateWithExposure(), "CALLS", 72);
  assert.equal(result.methodologyVersion, "EXPOSURE_CONFIRMATION_V2");
  assert.equal(result.state, "NEUTRAL");
  assert.equal(result.adjustmentPoints, 0);
  assert.equal(result.adjustedConfidenceScore, 72);
  assert.ok(result.components.every((component) => component.contributionPoints === 0));
  assert.deepEqual(
    result.components.map((component) => component.reasonCode),
    ["GEX_REGIME_CONTEXT_ONLY", "DEX_REGIME_CONTEXT_ONLY", "DIRECTIONAL_WALL_CONTEXT_ONLY"],
  );
});

test("opposing exposure does not become an unvalidated directional penalty", () => {
  const result = buildTradePlanExposureConfirmation(
    stateWithExposure("PUT_DOMINANT", "NEGATIVE"),
    "CALLS",
    72,
  );
  assert.equal(result.state, "NEUTRAL");
  assert.equal(result.adjustmentPoints, 0);
  assert.equal(result.adjustedConfidenceScore, 72);
  assert.equal(result.conflictingComponentCount, 0);
});

test("Puts use the same context-only policy", () => {
  const result = buildTradePlanExposureConfirmation(
    stateWithExposure("PUT_DOMINANT", "NEGATIVE"),
    "PUTS",
    68,
  );
  assert.equal(result.adjustmentPoints, 0);
  assert.equal(result.adjustedConfidenceScore, 68);
  assert.equal(result.primaryDirectionalWall?.strikePrice, 747);
});

test("partial exposure is disclosed but still cannot change confidence", () => {
  const marketState = stateWithExposure();
  marketState.exposureStructure!.sourceGexCoverageState = "PARTIAL";
  const result = buildTradePlanExposureConfirmation(marketState, "CALLS", 64);
  assert.equal(result.sourceQuality, "PARTIAL");
  assert.ok(result.warnings.includes("PARTIAL_EXPOSURE_INPUTS"));
  assert.equal(result.adjustmentPoints, 0);
  assert.equal(result.adjustedConfidenceScore, 64);
});

test("missing exposure is unavailable and non-adjusting", () => {
  const result = buildTradePlanExposureConfirmation(makeV140MarketState("CALLS"), "CALLS", 55);
  assert.equal(result.state, "UNAVAILABLE");
  assert.equal(result.sourceQuality, "UNAVAILABLE");
  assert.equal(result.adjustedConfidenceScore, 55);
  assert.ok(result.components.every((component) => component.status === "UNAVAILABLE"));
});

test("no directional thesis is not applicable", () => {
  const result = buildTradePlanExposureConfirmation(stateWithExposure(), "NONE", 50);
  assert.equal(result.state, "NOT_APPLICABLE");
  assert.equal(result.adjustmentPoints, 0);
  assert.ok(result.components.every((component) => component.status === "NOT_APPLICABLE"));
});

test("null structural confidence remains null", () => {
  const result = buildTradePlanExposureConfirmation(stateWithExposure(), "CALLS", null);
  assert.equal(result.adjustedConfidenceScore, null);
  assert.equal(result.adjustmentPoints, 0);
});

test("public schema validates the V2 context-only disclosure", () => {
  const result = buildTradePlanExposureConfirmation(stateWithExposure(), "CALLS", 77);
  assert.equal(result.disclosures.confidenceAdjustmentDisabledUntilCalibrated, true);
  assert.deepEqual(TradePlanExposureConfirmationSchema.parse(result), result);
});

console.log(`\nExposure Confirmation V2 tests: ${passed} passed, ${failed} failed`);
if (failed > 0) process.exitCode = 1;
