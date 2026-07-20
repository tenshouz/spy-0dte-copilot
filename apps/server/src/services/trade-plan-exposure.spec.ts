/**
 * Deterministic tests for GEX/DEX soft confirmation and confidence adjustment.
 * Run: npx --no-install tsx apps/server/src/services/trade-plan-exposure.spec.ts
 */
import assert from "node:assert/strict";
import {
  TradePlanExposureConfirmationSchema,
  type SpyZeroDteDeterministicMarketStateResponse,
  type SpyZeroDteExposureStructureResponse,
} from "@spy-copilot/shared";
import {
  buildTradePlanExposureConfirmation,
  DEX_REGIME_MAX_ADJUSTMENT_POINTS,
  DIRECTIONAL_WALL_MAX_ADJUSTMENT_POINTS,
  GEX_REGIME_MAX_ADJUSTMENT_POINTS,
} from "./trade-plan-exposure.logic";

const MARKET_DATE = "2026-07-17";

function exposureStructure(
  overrides: Partial<SpyZeroDteExposureStructureResponse> = {},
): SpyZeroDteExposureStructureResponse {
  return {
    symbol: "SPY",
    product: "SPY_ZERO_DTE_DETERMINISTIC_EXPOSURE_STRUCTURE",
    methodologyVersion: "EXPOSURE_STRUCTURE_V1",
    currentMarketDate: MARKET_DATE,
    calculatedAt: "2026-07-17T14:00:00.000Z",
    engineState: "AVAILABLE",
    metricState: "LIVE",
    coverageState: "COMPLETE",
    expirationDate: MARKET_DATE,
    underlyingPrice: 750,
    minimumReturnedStrike: 740,
    maximumReturnedStrike: 760,
    eligibleGexStrikeCount: 10,
    eligibleDexStrikeCount: 10,
    grossGammaExposure: 1_000_000,
    returnedWindowNetGammaExposureProxy: 500_000,
    gammaRegime: "CALL_DOMINANT",
    gammaRegimeRatioPercent: 50,
    callWalls: [
      {
        rank: 1,
        strikePrice: 755,
        exposureMagnitude: 300_000,
        shareOfSidePercent: 40,
        shareOfGrossGammaPercent: 30,
        distanceFromUnderlyingPoints: 5,
        distanceFromUnderlyingPercent: 2 / 3,
      },
    ],
    putWalls: [
      {
        rank: 1,
        strikePrice: 745,
        exposureMagnitude: 250_000,
        shareOfSidePercent: 45,
        shareOfGrossGammaPercent: 25,
        distanceFromUnderlyingPoints: -5,
        distanceFromUnderlyingPercent: -2 / 3,
      },
    ],
    largestPositiveNetGexStrike: 755,
    largestNegativeNetGexStrike: 745,
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
    returnedWindowNetDeltaExposureProxy: 400_000_000,
    dexRegime: "POSITIVE",
    dexRegimeRatioPercent: 40,
    largestAbsoluteDexAnchor: {
      strikePrice: 755,
      netDeltaExposureProxy: 100_000_000,
      absoluteMagnitude: 100_000_000,
      distanceFromUnderlyingPoints: 5,
      distanceFromUnderlyingPercent: 2 / 3,
    },
    sourceGexMetricState: "LIVE",
    sourceGexCoverageState: "COMPLETE",
    sourceDexMetricState: "LIVE",
    sourceDexCoverageState: "COMPLETE",
    latestOptionQuoteAt: "2026-07-17T13:59:59.000Z",
    chainFetchedAt: "2026-07-17T14:00:00.000Z",
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
    ...overrides,
  };
}

function marketState(
  exposure: SpyZeroDteExposureStructureResponse | undefined,
): SpyZeroDteDeterministicMarketStateResponse {
  return { exposureStructure: exposure } as SpyZeroDteDeterministicMarketStateResponse;
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

test("Calls receive the full supportive GEX, DEX, and nearby wall adjustment", () => {
  const result = buildTradePlanExposureConfirmation(
    marketState(exposureStructure()),
    "CALLS",
    50,
  );
  assert.equal(
    result.adjustmentPoints,
    GEX_REGIME_MAX_ADJUSTMENT_POINTS +
      DEX_REGIME_MAX_ADJUSTMENT_POINTS +
      DIRECTIONAL_WALL_MAX_ADJUSTMENT_POINTS,
  );
  assert.equal(result.adjustedConfidenceScore, 68);
  assert.equal(result.state, "SUPPORTIVE");
  assert.equal(result.supportiveComponentCount, 3);
});

test("Puts receive the full supportive inverse exposure adjustment", () => {
  const exposure = exposureStructure({
    returnedWindowNetGammaExposureProxy: -500_000,
    gammaRegime: "PUT_DOMINANT",
    gammaRegimeRatioPercent: -50,
    returnedWindowNetDeltaExposureProxy: -400_000_000,
    dexRegime: "NEGATIVE",
    dexRegimeRatioPercent: -40,
  });
  const result = buildTradePlanExposureConfirmation(
    marketState(exposure),
    "PUTS",
    60,
  );
  assert.equal(result.adjustmentPoints, 18);
  assert.equal(result.adjustedConfidenceScore, 78);
  assert.equal(result.state, "SUPPORTIVE");
});

test("Opposing exposure reduces confidence but remains soft-only", () => {
  const result = buildTradePlanExposureConfirmation(
    marketState(
      exposureStructure({
        putWalls: [
          {
            rank: 1,
            strikePrice: 755,
            exposureMagnitude: 250_000,
            shareOfSidePercent: 45,
            shareOfGrossGammaPercent: 25,
            distanceFromUnderlyingPoints: 5,
            distanceFromUnderlyingPercent: 2 / 3,
          },
        ],
      }),
    ),
    "PUTS",
    60,
  );
  assert.equal(result.adjustmentPoints, -18);
  assert.equal(result.adjustedConfidenceScore, 42);
  assert.equal(result.state, "CONFLICTING");
  assert.ok(result.warnings.includes("EXPOSURE_CONFLICT"));
  assert.equal(result.disclosures.cannotBlockEligibility, true);
  assert.equal(result.disclosures.cannotCreateDirection, true);
});

test("Mixed exposure preserves net signed component contributions", () => {
  const result = buildTradePlanExposureConfirmation(
    marketState(
      exposureStructure({
        returnedWindowNetDeltaExposureProxy: -400_000_000,
        dexRegime: "NEGATIVE",
        dexRegimeRatioPercent: -40,
      }),
    ),
    "CALLS",
    50,
  );
  assert.equal(result.adjustmentPoints, 6);
  assert.equal(result.adjustedConfidenceScore, 56);
  assert.equal(result.state, "MIXED");
  assert.equal(result.supportiveComponentCount, 2);
  assert.equal(result.conflictingComponentCount, 1);
});

test("Partial exposure inputs receive half weight and a warning", () => {
  const result = buildTradePlanExposureConfirmation(
    marketState(
      exposureStructure({
        engineState: "PARTIAL",
        coverageState: "PARTIAL",
        sourceGexCoverageState: "PARTIAL",
        sourceDexCoverageState: "PARTIAL",
        warnings: ["PARTIAL_GEX_COVERAGE", "PARTIAL_DEX_COVERAGE"],
      }),
    ),
    "CALLS",
    50,
  );
  assert.equal(result.adjustmentPoints, 9);
  assert.equal(result.adjustedConfidenceScore, 59);
  assert.equal(result.sourceQuality, "PARTIAL");
  assert.ok(result.warnings.includes("PARTIAL_EXPOSURE_INPUTS"));
});

test("A directional wall farther than one percent is neutral", () => {
  const result = buildTradePlanExposureConfirmation(
    marketState(
      exposureStructure({
        callWalls: [
          {
            rank: 1,
            strikePrice: 765,
            exposureMagnitude: 300_000,
            shareOfSidePercent: 40,
            shareOfGrossGammaPercent: 30,
            distanceFromUnderlyingPoints: 15,
            distanceFromUnderlyingPercent: 2,
          },
        ],
      }),
    ),
    "CALLS",
    50,
  );
  assert.equal(result.adjustmentPoints, 14);
  assert.equal(result.components[2]?.status, "NEUTRAL");
  assert.equal(result.components[2]?.reasonCode, "DIRECTIONAL_WALL_NOT_NEARBY");
});

test("Missing exposure is unavailable and non-adjusting", () => {
  const result = buildTradePlanExposureConfirmation(
    marketState(undefined),
    "CALLS",
    50,
  );
  assert.equal(result.state, "UNAVAILABLE");
  assert.equal(result.adjustmentPoints, 0);
  assert.equal(result.adjustedConfidenceScore, 50);
  assert.ok(result.warnings.includes("EXPOSURE_UNAVAILABLE"));
});

test("No directional thesis is not applicable and cannot create direction", () => {
  const result = buildTradePlanExposureConfirmation(
    marketState(exposureStructure()),
    "NONE",
    50,
  );
  assert.equal(result.evaluatedDirection, "NONE");
  assert.equal(result.state, "NOT_APPLICABLE");
  assert.equal(result.adjustmentPoints, 0);
  assert.equal(result.adjustedConfidenceScore, 50);
});

test("Adjusted confidence clamps to the zero-to-one-hundred range", () => {
  const supportive = buildTradePlanExposureConfirmation(
    marketState(exposureStructure()),
    "CALLS",
    95,
  );
  const conflicting = buildTradePlanExposureConfirmation(
    marketState(exposureStructure()),
    "PUTS",
    10,
  );
  assert.equal(supportive.adjustedConfidenceScore, 100);
  assert.equal(conflicting.adjustedConfidenceScore, 0);
});

test("The public schema validates the complete soft-confirmation disclosure contract", () => {
  const result = buildTradePlanExposureConfirmation(
    marketState(exposureStructure()),
    "CALLS",
    50,
  );
  assert.deepEqual(TradePlanExposureConfirmationSchema.parse(result), result);
  assert.equal(result.disclosures.softConfirmationOnly, true);
  assert.equal(result.disclosures.notObservedDealerInventory, true);
  assert.equal(result.disclosures.directionalWallIsContextNotTarget, true);
  assert.equal(result.disclosures.noOrderExecution, true);
});

console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) process.exitCode = 1;
