/**
 * Deterministic tests for the SPY 0DTE Bias and Confidence BIAS_V1 engine.
 * Run: npx --no-install tsx apps/server/src/services/market-bias.spec.ts
 */
import assert from "node:assert/strict";
import {
  SpyZeroDteDeterministicBiasResponseSchema,
  SpyZeroDteDeterministicMarketStateResponseSchema,
  type MarketStateFeatureId,
  type SpyZeroDteDeterministicMarketStateResponse,
} from "@spy-copilot/shared";
import {
  DIRECTIONAL_FEATURE_IDS,
  MINIMUM_USABLE_DIRECTIONAL_EVIDENCE_COUNT,
  NON_DIRECTIONAL_FEATURE_IDS,
  buildSpyZeroDteDeterministicBias,
  calculateDeterministicBias,
  mapMarketStateToBiasEvidence,
} from "./market-bias.logic";

const MARKET_DATE = "2026-07-17";
const PREVIOUS_DATE = "2026-07-16";
const STATE_AT = "2026-07-17T14:00:00.000Z";
const BIAS_AT_MS = Date.parse("2026-07-17T14:00:01.000Z");
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

function cloneState(): SpyZeroDteDeterministicMarketStateResponse {
  const state = structuredClone(baseMarketState());
  sync(state);
  return state;
}

function featureById(state: SpyZeroDteDeterministicMarketStateResponse, id: MarketStateFeatureId) {
  return Object.values(state.features).find((feature) => feature.featureId === id)!;
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

// baseMarketState initially needs status arrays after Zod construction.
const originalBase = baseMarketState;
function validatedBase(): SpyZeroDteDeterministicMarketStateResponse {
  const state = originalBase();
  sync(state);
  return SpyZeroDteDeterministicMarketStateResponseSchema.parse(state);
}
// Replace the fixture function used below with the validated version.
// eslint-disable-next-line @typescript-eslint/no-unused-vars
const _fixtureSanity = validatedBase();

test("methodology exposes the locked product, version, weights, and minimum", () => {
  const result = buildSpyZeroDteDeterministicBias(validatedBase(), BIAS_AT_MS);
  assert.equal(result.product, "SPY_ZERO_DTE_DETERMINISTIC_BIAS_CONFIDENCE");
  assert.equal(result.methodologyVersion, "BIAS_V1");
  assert.equal(result.minimumUsableDirectionalEvidenceCount, 2);
  assert.equal(result.methodology.minimumUsableDirectionalEvidenceCount, 2);
  assert.deepEqual(result.methodology.featureWeights.map((item) => item.weight), [1, 1, 1, 1]);
});

test("exact directional and non-directional feature sets are locked", () => {
  assert.deepEqual([...DIRECTIONAL_FEATURE_IDS], [
    "PRICE_VS_VWAP",
    "PRICE_VS_PRIOR_DAY_RANGE",
    "PRICE_VS_PREMARKET_RANGE",
    "PRICE_VS_OPENING_RANGE",
  ]);
  assert.deepEqual([...NON_DIRECTIONAL_FEATURE_IDS], [
    "SESSION_PHASE",
    "RTH_GAP_CONTEXT",
    "PRICE_VS_EXPECTED_MOVE_RANGE",
    "RETURNED_WINDOW_NET_GEX_SIGN",
    "RETURNED_WINDOW_NET_DEX_SIGN",
  ]);
  assert.equal(MINIMUM_USABLE_DIRECTIONAL_EVIDENCE_COUNT, 2);
});

for (const [stateValue, direction, rationale] of [
  ["ABOVE", "BULLISH", "PRICE_ABOVE_VWAP"],
  ["BELOW", "BEARISH", "PRICE_BELOW_VWAP"],
  ["EQUAL", "NEUTRAL", "PRICE_EQUAL_VWAP"],
] as const) {
  test(`VWAP ${stateValue} maps to ${direction}`, () => {
    const state = validatedBase();
    state.features.priceVsVwap.state = stateValue;
    const item = mapMarketStateToBiasEvidence(state).find((entry) => entry.featureId === "PRICE_VS_VWAP")!;
    assert.equal(item.evidenceDirection, direction);
    assert.equal(item.rationaleCode, rationale);
    assert.equal(item.configuredWeight, 1);
    assert.equal(item.appliedWeight, 1);
  });
}

test("NOT_APPLICABLE directional evidence keeps configured weight but applies zero", () => {
  const state = validatedBase();
  state.features.priceVsVwap.status = "NOT_APPLICABLE";
  state.features.priceVsVwap.state = null;
  const item = mapMarketStateToBiasEvidence(state).find((entry) => entry.featureId === "PRICE_VS_VWAP")!;
  assert.equal(item.evidenceDirection, "NOT_APPLICABLE");
  assert.equal(item.configuredWeight, 1);
  assert.equal(item.appliedWeight, 0);
  assert.equal(item.weightedContribution, 0);
});

test("UNAVAILABLE directional evidence keeps configured weight but applies zero", () => {
  const state = validatedBase();
  state.features.priceVsVwap.status = "UNAVAILABLE";
  state.features.priceVsVwap.state = null;
  const item = mapMarketStateToBiasEvidence(state).find((entry) => entry.featureId === "PRICE_VS_VWAP")!;
  assert.equal(item.evidenceDirection, "UNAVAILABLE");
  assert.equal(item.configuredWeight, 1);
  assert.equal(item.appliedWeight, 0);
});

for (const [rangeState, direction] of [
  ["ABOVE_RANGE", "BULLISH"],
  ["BELOW_RANGE", "BEARISH"],
  ["AT_HIGH", "NEUTRAL"],
  ["AT_LOW", "NEUTRAL"],
  ["AT_BOUNDARY", "NEUTRAL"],
  ["INSIDE_RANGE", "NEUTRAL"],
] as const) {
  test(`prior-day ${rangeState} maps to ${direction}`, () => {
    const state = validatedBase();
    state.features.priceVsPriorDayRange.state = rangeState;
    const item = mapMarketStateToBiasEvidence(state).find(
      (entry) => entry.featureId === "PRICE_VS_PRIOR_DAY_RANGE",
    )!;
    assert.equal(item.evidenceDirection, direction);
  });

  test(`premarket ${rangeState} maps to ${direction}`, () => {
    const state = validatedBase();
    state.features.priceVsPremarketRange.state = rangeState;
    const item = mapMarketStateToBiasEvidence(state).find(
      (entry) => entry.featureId === "PRICE_VS_PREMARKET_RANGE",
    )!;
    assert.equal(item.evidenceDirection, direction);
  });
}

test("Opening Range NOT_STARTED is not applicable directional evidence", () => {
  const state = validatedBase();
  state.features.priceVsOpeningRange.status = "NOT_APPLICABLE";
  state.features.priceVsOpeningRange.state = "NOT_STARTED";
  const item = mapMarketStateToBiasEvidence(state).find(
    (entry) => entry.featureId === "PRICE_VS_OPENING_RANGE",
  )!;
  assert.equal(item.evidenceDirection, "NOT_APPLICABLE");
  assert.equal(item.rationaleCode, "OPENING_RANGE_NOT_STARTED");
});

test("Opening Range FORMING is not applicable even when source feature is PARTIAL", () => {
  const state = validatedBase();
  state.features.priceVsOpeningRange.status = "PARTIAL";
  state.features.priceVsOpeningRange.state = "FORMING";
  state.features.priceVsOpeningRange.warningCode = "OPENING_RANGE_FORMING";
  const item = mapMarketStateToBiasEvidence(state).find(
    (entry) => entry.featureId === "PRICE_VS_OPENING_RANGE",
  )!;
  assert.equal(item.evidenceDirection, "NOT_APPLICABLE");
  assert.equal(item.appliedWeight, 0);
  assert.equal(item.rationaleCode, "OPENING_RANGE_FORMING");
});

for (const id of NON_DIRECTIONAL_FEATURE_IDS) {
  test(`${id} remains non-directional`, () => {
    const state = validatedBase();
    const item = mapMarketStateToBiasEvidence(state).find((entry) => entry.featureId === id)!;
    assert.equal(item.evidenceDirection, "NON_DIRECTIONAL");
    assert.equal(item.configuredWeight, 0);
    assert.equal(item.appliedWeight, 0);
  });
}

test("base fixture score and category math are exact", () => {
  const result = buildSpyZeroDteDeterministicBias(validatedBase(), BIAS_AT_MS);
  assert.equal(result.biasState, "BULLISH");
  assert.equal(result.bullishScore, 2);
  assert.equal(result.bearishScore, 1);
  assert.equal(result.neutralEvidenceWeight, 1);
  assert.equal(result.netDirectionalScore, 1);
  assert.equal(result.applicableDirectionalWeight, 4);
  assert.equal(result.usableDirectionalWeight, 4);
  assert.equal(result.directionalSupportRatio, 0.5);
  assert.equal(result.sufficiencyRatio, 1);
  assert.equal(result.contradictionRatio, 0.25);
  assert.equal(result.neutralEvidenceRatio, 0.25);
  assert.equal(result.confidenceScore, 50);
});

test("one isolated directional feature cannot produce Bias", () => {
  const state = validatedBase();
  for (const id of ["PRICE_VS_PRIOR_DAY_RANGE", "PRICE_VS_PREMARKET_RANGE", "PRICE_VS_OPENING_RANGE"] as const) {
    const feature = featureById(state, id);
    feature.status = "NOT_APPLICABLE";
    feature.state = id === "PRICE_VS_OPENING_RANGE" ? "NOT_STARTED" : null;
  }
  const result = buildSpyZeroDteDeterministicBias(state, BIAS_AT_MS);
  assert.equal(result.biasState, "UNAVAILABLE");
  assert.equal(result.engineState, "UNAVAILABLE");
  assert.equal(result.warningCode, "INSUFFICIENT_DIRECTIONAL_EVIDENCE");
  assert.equal(result.confidenceScore, null);
});

test("two usable directional features meet the minimum", () => {
  const state = validatedBase();
  state.features.priceVsPremarketRange.status = "NOT_APPLICABLE";
  state.features.priceVsPremarketRange.state = null;
  state.features.priceVsOpeningRange.status = "NOT_APPLICABLE";
  state.features.priceVsOpeningRange.state = "NOT_STARTED";
  const result = buildSpyZeroDteDeterministicBias(state, BIAS_AT_MS);
  assert.equal(result.usableDirectionalEvidenceCount, 2);
  assert.notEqual(result.biasState, "UNAVAILABLE");
});

test("positive, negative, and zero valid Net Scores classify symmetrically", () => {
  const bullish = validatedBase();
  bullish.features.priceVsOpeningRange.state = "INSIDE_RANGE";
  assert.equal(buildSpyZeroDteDeterministicBias(bullish, BIAS_AT_MS).biasState, "BULLISH");

  const bearish = validatedBase();
  bearish.features.priceVsVwap.state = "BELOW";
  bearish.features.priceVsPremarketRange.state = "INSIDE_RANGE";
  assert.equal(buildSpyZeroDteDeterministicBias(bearish, BIAS_AT_MS).biasState, "BEARISH");

  const neutral = validatedBase();
  neutral.features.priceVsPremarketRange.state = "INSIDE_RANGE";
  assert.equal(buildSpyZeroDteDeterministicBias(neutral, BIAS_AT_MS).biasState, "NEUTRAL");
});

test("full directional agreement with complete evidence yields structural Confidence 100", () => {
  const state = validatedBase();
  state.features.priceVsPriorDayRange.state = "ABOVE_RANGE";
  state.features.priceVsOpeningRange.state = "ABOVE_RANGE";
  const result = buildSpyZeroDteDeterministicBias(state, BIAS_AT_MS);
  assert.equal(result.bullishScore, 4);
  assert.equal(result.directionalSupportRatio, 1);
  assert.equal(result.sufficiencyRatio, 1);
  assert.equal(result.confidenceScore, 100);
});

test("three supporting and one opposing feature yields Confidence 75", () => {
  const state = validatedBase();
  state.features.priceVsPriorDayRange.state = "ABOVE_RANGE";
  const result = buildSpyZeroDteDeterministicBias(state, BIAS_AT_MS);
  assert.equal(result.bullishScore, 3);
  assert.equal(result.bearishScore, 1);
  assert.equal(result.directionalSupportRatio, 0.75);
  assert.equal(result.confidenceScore, 75);
});

test("unavailable applicable evidence reduces sufficiency without synthetic weight", () => {
  const state = validatedBase();
  state.features.priceVsOpeningRange.status = "UNAVAILABLE";
  state.features.priceVsOpeningRange.state = null;
  const result = buildSpyZeroDteDeterministicBias(state, BIAS_AT_MS);
  assert.equal(result.applicableDirectionalWeight, 4);
  assert.equal(result.usableDirectionalWeight, 3);
  assert.equal(result.sufficiencyRatio, 0.75);
  assert.equal(result.engineState, "PARTIAL");
  assert.equal(result.warningCode, "PARTIAL_BIAS_INPUTS");
});

test("NOT_APPLICABLE evidence is excluded from applicable and usable denominators", () => {
  const state = validatedBase();
  state.features.priceVsOpeningRange.status = "NOT_APPLICABLE";
  state.features.priceVsOpeningRange.state = "NOT_STARTED";
  const result = buildSpyZeroDteDeterministicBias(state, BIAS_AT_MS);
  assert.equal(result.applicableDirectionalWeight, 3);
  assert.equal(result.usableDirectionalWeight, 3);
  assert.equal(result.sufficiencyRatio, 1);
  assert.equal(result.notApplicableDirectionalEvidenceCount, 1);
});

test("PARTIAL directional evidence contributes full weight with PARTIAL provenance", () => {
  const state = validatedBase();
  state.features.priceVsVwap.status = "PARTIAL";
  state.features.priceVsVwap.warningCode = "PARTIAL_SOURCE_COMPONENT";
  const result = buildSpyZeroDteDeterministicBias(state, BIAS_AT_MS);
  const vwap = result.bullishEvidence.find((item) => item.featureId === "PRICE_VS_VWAP")!;
  assert.equal(vwap.configuredWeight, 1);
  assert.equal(vwap.appliedWeight, 1);
  assert.equal(result.engineState, "PARTIAL");
  assert.equal(result.sourceQualityState, "PARTIAL");
  assert.equal(result.confidenceScore, 50);
});

test("STALE directional warning receives stale overall warning precedence", () => {
  const state = validatedBase();
  state.features.priceVsVwap.status = "PARTIAL";
  state.features.priceVsVwap.warningCode = "STALE_SOURCE_COMPONENT";
  const result = buildSpyZeroDteDeterministicBias(state, BIAS_AT_MS);
  assert.equal(result.warningCode, "STALE_DIRECTIONAL_INPUTS");
});

test("unrelated partial GEX does not weaken directional Bias", () => {
  const state = validatedBase();
  state.features.netGexProxySign.status = "PARTIAL";
  state.features.netGexProxySign.warningCode = "PARTIAL_GEX_INPUTS";
  const result = buildSpyZeroDteDeterministicBias(state, BIAS_AT_MS);
  assert.equal(result.engineState, "AVAILABLE");
  assert.equal(result.sourceQualityState, "COMPLETE");
  assert.equal(result.warningCode, null);
});

test("unavailable DEX remains visible but does not weaken Bias", () => {
  const state = validatedBase();
  state.features.netDexProxySign.status = "UNAVAILABLE";
  state.features.netDexProxySign.state = null;
  state.features.netDexProxySign.warningCode = "MISSING_REQUIRED_INPUT";
  const result = buildSpyZeroDteDeterministicBias(state, BIAS_AT_MS);
  assert.equal(result.engineState, "AVAILABLE");
  assert.ok(result.unavailableEvidence.some((item) => item.featureId === "RETURNED_WINDOW_NET_DEX_SIGN"));
});

test("balanced bullish and bearish evidence produces Neutral with explicit reason", () => {
  const state = validatedBase();
  state.features.priceVsPremarketRange.state = "INSIDE_RANGE";
  const result = buildSpyZeroDteDeterministicBias(state, BIAS_AT_MS);
  assert.equal(result.biasState, "NEUTRAL");
  assert.equal(result.neutralReason, "BALANCED_DIRECTIONAL_EVIDENCE");
  assert.equal(result.neutralBalanceRatio, 1);
  assert.equal(result.confidenceScore, 100);
});

test("all-neutral usable directional states produce explicit Neutral reason", () => {
  const state = validatedBase();
  state.features.priceVsVwap.state = "EQUAL";
  state.features.priceVsPriorDayRange.state = "INSIDE_RANGE";
  state.features.priceVsPremarketRange.state = "AT_HIGH";
  state.features.priceVsOpeningRange.state = "AT_LOW";
  const result = buildSpyZeroDteDeterministicBias(state, BIAS_AT_MS);
  assert.equal(result.biasState, "NEUTRAL");
  assert.equal(result.neutralReason, "ALL_NEUTRAL_DIRECTIONAL_STATES");
  assert.equal(result.confidenceScore, 100);
});

test("canonical evidence categories contain every feature exactly once", () => {
  const result = buildSpyZeroDteDeterministicBias(validatedBase(), BIAS_AT_MS);
  const all = [
    ...result.bullishEvidence,
    ...result.bearishEvidence,
    ...result.neutralEvidence,
    ...result.nonDirectionalContext,
    ...result.notApplicableEvidence,
    ...result.unavailableEvidence,
  ];
  assert.equal(all.length, 9);
  assert.equal(new Set(all.map((item) => item.featureId)).size, 9);
});

test("supporting and counter directions are metadata rather than duplicate arrays", () => {
  const result = buildSpyZeroDteDeterministicBias(validatedBase(), BIAS_AT_MS) as unknown as Record<string, unknown>;
  assert.equal(result.supportingEvidenceDirection, "BULLISH");
  assert.equal(result.counterEvidenceDirection, "BEARISH");
  assert.equal("supportingEvidence" in result, false);
  assert.equal("counterEvidence" in result, false);
});

test("source Market-State calculatedAt remains distinct from Bias calculatedAt", () => {
  const result = buildSpyZeroDteDeterministicBias(validatedBase(), BIAS_AT_MS);
  assert.equal(result.sourceMarketStateCalculatedAt, STATE_AT);
  assert.equal(result.calculatedAt, new Date(BIAS_AT_MS).toISOString());
  assert.notEqual(result.sourceMarketStateCalculatedAt, result.calculatedAt);
});

test("Market-State UNAVAILABLE outranks otherwise mapped evidence", () => {
  const state = validatedBase();
  state.engineState = "UNAVAILABLE";
  state.warningCode = "CURRENT_PRICE_UNAVAILABLE";
  const items = mapMarketStateToBiasEvidence(state);
  const result = calculateDeterministicBias(state, items);
  assert.equal(result.engineState, "UNAVAILABLE");
  assert.equal(result.biasState, "UNAVAILABLE");
  assert.equal(result.warningCode, "MARKET_STATE_UNAVAILABLE");
});

test("missing canonical price returns CURRENT_PRICE_UNAVAILABLE", () => {
  const state = validatedBase();
  state.price = null;
  state.priceSource = null;
  state.quoteTimestamp = null;
  const result = buildSpyZeroDteDeterministicBias(state, BIAS_AT_MS);
  assert.equal(result.biasState, "UNAVAILABLE");
  assert.equal(result.warningCode, "CURRENT_PRICE_UNAVAILABLE");
});

test("Confidence output is structural, bounded, and not a probability label", () => {
  const result = buildSpyZeroDteDeterministicBias(validatedBase(), BIAS_AT_MS);
  assert.equal(result.confidenceUnit, "PERCENT");
  assert.equal(result.confidenceScope, "STRUCTURAL_EVIDENCE_ONLY");
  assert.equal(result.confidenceMethodology, "DIRECTIONAL_SUPPORT_TIMES_SUFFICIENCY");
  assert.ok(result.confidenceScore !== null && result.confidenceScore >= 0 && result.confidenceScore <= 100);
});

test("response schema validates and does not duplicate Market State", () => {
  const result = buildSpyZeroDteDeterministicBias(validatedBase(), BIAS_AT_MS);
  assert.deepEqual(SpyZeroDteDeterministicBiasResponseSchema.parse(result), result);
  const raw = result as unknown as Record<string, unknown>;
  assert.equal("marketState" in raw, false);
  assert.equal("state" in raw, false);
});

test("response has no trade-plan, contract, AI, or dealer fields", () => {
  const result = buildSpyZeroDteDeterministicBias(validatedBase(), BIAS_AT_MS);
  const names = Object.keys(result).filter((name) =>
    /^(calls|puts|buy|sell|entry|stop|target|riskReward|positionSizing|contractSelection|tradePlan|recommendation|dealerPositioning)$/i.test(name),
  );
  assert.deepEqual(names, []);
});

console.log(`\n${passed} passed, ${failed} failed (${passed + failed} total)`);
if (failed > 0) process.exit(1);
