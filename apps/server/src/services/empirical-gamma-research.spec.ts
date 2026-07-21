/**
 * Deterministic tests for the observational empirical Gamma research engine.
 * Run: npx --no-install tsx apps/server/src/services/empirical-gamma-research.spec.ts
 */
import assert from "node:assert/strict";
import {
  EmpiricalGammaResearchResponseSchema,
  SpyZeroDteExposureStructureResponseSchema,
  SpyZeroDteTradePlanAssemblyResponseSchema,
  type ExposureStructureGammaRegime,
  type SpyZeroDteExposureStructureResponse,
  type SpyZeroDteTradePlanAssemblyResponse,
} from "@spy-copilot/shared";
import { buildSpyZeroDteContractSelection } from "./trade-contract.logic";
import {
  buildEmpiricalGammaResearchPayload,
  buildEmpiricalGammaResearchResponse,
  buildEmpiricalGammaResearchUnavailableResponse,
  extractEmpiricalGammaResearchObservation,
  type EmpiricalGammaResearchRow,
} from "./empirical-gamma-research.logic";
import { buildSpyZeroDteTradePlanAssembly } from "./trade-plan-assembly.logic";
import { buildTradePlanExposureConfirmation } from "./trade-plan-exposure.logic";
import {
  V140_CONTRACT_EVAL_MS,
  V140_MARKET_DATE,
  makeV140BiasPlanRisk,
  makeV140OptionsChain,
} from "./trade-engine-v140.test-fixtures";

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

function gammaContext(
  regime: Exclude<ExposureStructureGammaRegime, "UNAVAILABLE">,
): SpyZeroDteExposureStructureResponse {
  const netGamma =
    regime === "CALL_DOMINANT" ? 100_000_000 : regime === "PUT_DOMINANT" ? -100_000_000 : 0;
  const ratio = regime === "CALL_DOMINANT" ? 10 : regime === "PUT_DOMINANT" ? -10 : 0;
  return SpyZeroDteExposureStructureResponseSchema.parse({
    symbol: "SPY",
    product: "SPY_ZERO_DTE_DETERMINISTIC_EXPOSURE_STRUCTURE",
    methodologyVersion: "EXPOSURE_STRUCTURE_V1",
    currentMarketDate: V140_MARKET_DATE,
    calculatedAt: "2026-07-17T14:00:04.000Z",
    engineState: "AVAILABLE",
    metricState: "LIVE",
    coverageState: "COMPLETE",
    expirationDate: V140_MARKET_DATE,
    underlyingPrice: 758.35,
    minimumReturnedStrike: 750,
    maximumReturnedStrike: 765,
    eligibleGexStrikeCount: 16,
    eligibleDexStrikeCount: 16,
    grossGammaExposure: 1_000_000_000,
    returnedWindowNetGammaExposureProxy: netGamma,
    gammaRegime: regime,
    gammaRegimeRatioPercent: ratio,
    callWalls: [
      {
        rank: 1,
        strikePrice: 760,
        exposureMagnitude: 180_000_000,
        shareOfSidePercent: 30,
        shareOfGrossGammaPercent: 18,
        distanceFromUnderlyingPoints: 1.65,
        distanceFromUnderlyingPercent: 0.2176,
      },
    ],
    putWalls: [
      {
        rank: 1,
        strikePrice: 756,
        exposureMagnitude: 160_000_000,
        shareOfSidePercent: 32,
        shareOfGrossGammaPercent: 16,
        distanceFromUnderlyingPoints: -2.35,
        distanceFromUnderlyingPercent: -0.3099,
      },
    ],
    largestPositiveNetGexStrike: 760,
    largestNegativeNetGexStrike: 756,
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
    gammaCliffs: [
      {
        rank: 1,
        lowerStrike: 758,
        upperStrike: 759,
        midpointStrike: 758.5,
        netGammaAtLower: -20_000_000,
        netGammaAtUpper: 80_000_000,
        netGammaChange: 100_000_000,
        absoluteGammaChange: 100_000_000,
        direction: "POSITIVE_JUMP",
        distanceFromUnderlyingPoints: 0.15,
        distanceFromUnderlyingPercent: 0.0198,
      },
    ],
    gammaSignTransitions: [
      {
        rank: 1,
        lowerStrike: 758,
        upperStrike: 759,
        estimatedStrike: 758.2,
        netGammaAtLower: -20_000_000,
        netGammaAtUpper: 80_000_000,
        absoluteGammaChange: 100_000_000,
        shareOfGrossGammaPercent: 10,
        direction: "NEGATIVE_TO_POSITIVE",
        distanceFromUnderlyingPoints: -0.15,
        distanceFromUnderlyingPercent: -0.0198,
      },
    ],
    returnedWindowNetDeltaExposureProxy: 0,
    dexRegime: "BALANCED",
    dexRegimeRatioPercent: 0,
    largestAbsoluteDexAnchor: {
      strikePrice: 760,
      netDeltaExposureProxy: 200_000_000,
      absoluteMagnitude: 200_000_000,
      distanceFromUnderlyingPoints: 1.65,
      distanceFromUnderlyingPercent: 0.2176,
    },
    sourceGexMetricState: "LIVE",
    sourceGexCoverageState: "COMPLETE",
    sourceDexMetricState: "LIVE",
    sourceDexCoverageState: "COMPLETE",
    latestOptionQuoteAt: "2026-07-17T14:00:03.000Z",
    chainFetchedAt: "2026-07-17T14:00:04.000Z",
    warnings: ["GAMMA_BALANCE_CROSS_NOT_FOUND"],
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
  });
}

function readyAssembly(
  regime: Exclude<ExposureStructureGammaRegime, "UNAVAILABLE">,
  legacyOnly = false,
): SpyZeroDteTradePlanAssemblyResponse {
  const sources = makeV140BiasPlanRisk("CALLS");
  const contract = buildSpyZeroDteContractSelection(
    sources.risk,
    makeV140OptionsChain("CALLS"),
    V140_CONTRACT_EVAL_MS,
  );
  const base = buildSpyZeroDteTradePlanAssembly(
    sources.marketState,
    sources.bias,
    sources.tradePlan,
    sources.risk,
    contract,
    V140_CONTRACT_EVAL_MS + 1000,
  );
  const context = gammaContext(regime);
  if (!legacyOnly) {
    return SpyZeroDteTradePlanAssemblyResponseSchema.parse({
      ...base,
      gammaResearchContext: context,
    });
  }

  const marketStateWithExposure = {
    ...sources.marketState,
    exposureStructure: context,
  };
  return SpyZeroDteTradePlanAssemblyResponseSchema.parse({
    ...base,
    gammaResearchContext: null,
    exposureConfirmation: buildTradePlanExposureConfirmation(
      marketStateWithExposure,
      "CALLS",
      base.planConfidence?.structuralConfidenceScore ?? null,
    ),
  });
}

function row(
  assembly: SpyZeroDteTradePlanAssemblyResponse,
  outcome: "WIN" | "LOSS" | "BREAKEVEN",
  realizedPnlDollars: number,
  overrides: Partial<EmpiricalGammaResearchRow> = {},
): EmpiricalGammaResearchRow {
  return {
    currentMarketDate: V140_MARKET_DATE,
    planState: "READY",
    direction: "CALLS",
    outcomeState: outcome,
    realizedPnlDollars,
    sourceAssembly: assembly,
    ...overrides,
  };
}

test("empty research response is available but explicitly empty", () => {
  const response = buildEmpiricalGammaResearchResponse(
    [],
    new Date("2026-07-21T02:00:00.000Z"),
  );
  assert.equal(response.engineState, "AVAILABLE");
  assert.equal(response.primaryReasonCode, "GAMMA_RESEARCH_EMPTY");
  assert.equal(response.research?.counts.eligibleResearchObservations, 0);
  assert.equal(EmpiricalGammaResearchResponseSchema.safeParse(response).success, true);
});

test("full context extracts regime, wall, cliff, and strict sign-transition features", () => {
  const extracted = extractEmpiricalGammaResearchObservation(
    row(readyAssembly("CALL_DOMINANT"), "WIN", 125),
  );
  assert.equal(extracted.invalidAssembly, false);
  assert.equal(extracted.observation?.contextCompleteness, "FULL_CONTEXT");
  assert.deepEqual(
    extracted.observation?.features.map((item) => item.featureType).sort(),
    [
      "DIRECTIONAL_WALL_LOCATION",
      "GAMMA_REGIME",
      "NEAREST_GAMMA_CLIFF",
      "NEAREST_GAMMA_SIGN_TRANSITION",
      "OPPOSING_WALL_LOCATION",
    ].sort(),
  );
});

test("legacy V1.4 assemblies remain researchable for regime and directional wall", () => {
  const extracted = extractEmpiricalGammaResearchObservation(
    row(readyAssembly("CALL_DOMINANT", true), "WIN", 100),
  );
  assert.equal(extracted.observation?.contextCompleteness, "LEGACY_PARTIAL_CONTEXT");
  assert.deepEqual(
    extracted.observation?.features.map((item) => item.featureType).sort(),
    ["DIRECTIONAL_WALL_LOCATION", "GAMMA_REGIME"].sort(),
  );
});

test("Assembly schema rejects Gamma context calculated after the plan snapshot", () => {
  const assembly = readyAssembly("CALL_DOMINANT");
  const invalid = {
    ...assembly,
    gammaResearchContext: {
      ...assembly.gammaResearchContext!,
      calculatedAt: "2026-07-17T14:01:00.000Z",
    },
  };
  assert.equal(SpyZeroDteTradePlanAssemblyResponseSchema.safeParse(invalid).success, false);
});

test("stale or partial Gamma inputs do not enter feature findings", () => {
  const assembly = readyAssembly("CALL_DOMINANT");
  const staleAssembly = SpyZeroDteTradePlanAssemblyResponseSchema.parse({
    ...assembly,
    gammaResearchContext: {
      ...assembly.gammaResearchContext!,
      engineState: "PARTIAL",
      metricState: "STALE",
      sourceGexMetricState: "STALE",
      warnings: ["RETAINED_STALE_CHAIN"],
    },
  });
  const extracted = extractEmpiricalGammaResearchObservation(
    row(staleAssembly, "WIN", 100),
  );
  assert.equal(extracted.observation?.contextCompleteness, "NO_GAMMA_CONTEXT");
  assert.deepEqual(extracted.observation?.features, []);
});

test("research win rate conservatively includes breakevens in the denominator", () => {
  const assembly = readyAssembly("CALL_DOMINANT");
  const payload = buildEmpiricalGammaResearchPayload([
    row(assembly, "WIN", 100),
    row(assembly, "LOSS", -100),
    row(assembly, "BREAKEVEN", 0),
  ]);
  const baseline = payload.baselines[0];
  assert.equal(baseline?.metrics.tradeCount, 3);
  assert.equal(baseline?.metrics.winRatePercent, 33.33);
});

test("non-READY reviewed rows are excluded rather than treated as trades", () => {
  const assembly = readyAssembly("CALL_DOMINANT");
  const payload = buildEmpiricalGammaResearchPayload([
    row(assembly, "WIN", 100, { planState: "WAITING_FOR_TRIGGER" }),
  ]);
  assert.equal(payload.counts.reviewedTradeOutcomeSnapshots, 1);
  assert.equal(payload.counts.readyReviewedTradeSnapshots, 0);
  assert.equal(payload.counts.skippedNonReadyReviewedTrades, 1);
  assert.equal(payload.counts.eligibleResearchObservations, 0);
});

test("matched samples can surface candidates but never activate a live Gamma weight", () => {
  const positive = readyAssembly("CALL_DOMINANT");
  const negative = readyAssembly("PUT_DOMINANT");
  const rows: EmpiricalGammaResearchRow[] = [];
  for (let index = 0; index < 30; index += 1) {
    rows.push(row(positive, "WIN", 100));
    rows.push(row(negative, "LOSS", -100));
  }
  const payload = buildEmpiricalGammaResearchPayload(rows);
  const positiveFinding = payload.findings.find(
    (item) =>
      item.featureType === "GAMMA_REGIME" &&
      item.bucketKey === "CALL_DOMINANT",
  );
  const negativeFinding = payload.findings.find(
    (item) =>
      item.featureType === "GAMMA_REGIME" &&
      item.bucketKey === "PUT_DOMINANT",
  );
  assert.equal(positiveFinding?.evidenceState, "POSITIVE_CANDIDATE");
  assert.equal(negativeFinding?.evidenceState, "NEGATIVE_CANDIDATE");
  assert.equal(positiveFinding?.eligibleForDirectionalWeight, false);
  assert.ok(positiveFinding?.weightingBlockers.includes("HOLDOUT_VALIDATION_MISSING"));
  assert.equal(payload.weightingPolicy.automaticDirectionalWeightingEnabled, false);
  assert.equal(payload.weightingPolicy.holdoutValidationPresent, false);
});

test("single-bucket samples remain insufficient because no matched comparator exists", () => {
  const assembly = readyAssembly("CALL_DOMINANT");
  const rows = Array.from({ length: 40 }, () => row(assembly, "WIN", 50));
  const payload = buildEmpiricalGammaResearchPayload(rows);
  const finding = payload.findings.find(
    (item) => item.featureType === "GAMMA_REGIME",
  );
  assert.equal(finding?.bucketMetrics.tradeCount, 40);
  assert.equal(finding?.comparatorMetrics.tradeCount, 0);
  assert.equal(finding?.evidenceState, "INSUFFICIENT_SAMPLE");
  assert.ok(
    finding?.weightingBlockers.includes("MINIMUM_COMPARATOR_SAMPLE_NOT_MET"),
  );
});

test("database-unavailable response fails closed with no research payload", () => {
  const response = buildEmpiricalGammaResearchUnavailableResponse(
    "DATABASE_UNAVAILABLE",
    new Date("2026-07-21T02:00:00.000Z"),
  );
  assert.equal(response.engineState, "UNAVAILABLE");
  assert.equal(response.research, null);
  assert.equal(EmpiricalGammaResearchResponseSchema.safeParse(response).success, true);
});

console.log(`\nEmpirical Gamma research tests: ${passed} passed, ${failed} failed`);
if (failed > 0) process.exitCode = 1;
