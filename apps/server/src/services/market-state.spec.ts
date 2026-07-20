/**
 * Deterministic tests for the SPY 0DTE Market-State V1 feature engine.
 * Run: npx --no-install tsx apps/server/src/services/market-state.spec.ts
 */
import assert from "node:assert/strict";
import type {
  MarketContextComponent,
  MarketContextComponentStatus,
  SpyZeroDteMarketContextResponse,
  SpyZeroDteExposureStructureResponse,
} from "@spy-copilot/shared";
import {
  buildSpyZeroDteDeterministicMarketState,
  calculatePointAndPercentDistance,
  classifyExactSign,
  classifyExpectedMovePosition,
  classifyRangePosition,
  compareExact,
  deriveMarketStateEngineState,
} from "./market-state.logic";

const MARKET_DATE = "2026-07-16";
const PREVIOUS_DATE = "2026-07-15";
const ASSEMBLED_AT = "2026-07-16T14:00:00.000Z";
const CALCULATED_AT = Date.parse("2026-07-16T14:00:01.000Z");
const FETCHED_AT = "2026-07-16T13:59:45.000Z";
const QUOTE_AT = "2026-07-16T13:59:44.000Z";


function testExposureStructure(): SpyZeroDteExposureStructureResponse {
  return {
    symbol: "SPY",
    product: "SPY_ZERO_DTE_DETERMINISTIC_EXPOSURE_STRUCTURE",
    methodologyVersion: "EXPOSURE_STRUCTURE_V1",
    currentMarketDate: MARKET_DATE,
    calculatedAt: ASSEMBLED_AT,
    engineState: "AVAILABLE",
    metricState: "LIVE",
    coverageState: "COMPLETE",
    expirationDate: MARKET_DATE,
    underlyingPrice: 754.5,
    minimumReturnedStrike: 745,
    maximumReturnedStrike: 765,
    eligibleGexStrikeCount: 10,
    eligibleDexStrikeCount: 10,
    grossGammaExposure: 1_000_000,
    returnedWindowNetGammaExposureProxy: 500_000,
    gammaRegime: "CALL_DOMINANT",
    gammaRegimeRatioPercent: 50,
    callWalls: [{ rank: 1, strikePrice: 755, exposureMagnitude: 300_000, shareOfSidePercent: 40, shareOfGrossGammaPercent: 30, distanceFromUnderlyingPoints: 0.5, distanceFromUnderlyingPercent: 0.06626905235255136 }],
    putWalls: [{ rank: 1, strikePrice: 750, exposureMagnitude: 250_000, shareOfSidePercent: 45, shareOfGrossGammaPercent: 25, distanceFromUnderlyingPoints: -4.5, distanceFromUnderlyingPercent: -0.5964214718356527 }],
    largestPositiveNetGexStrike: 755,
    largestNegativeNetGexStrike: 750,
    gammaFlipProxy: { state: "NO_CROSS", estimatedStrike: null, lowerStrike: null, upperStrike: null, cumulativeNetGammaAtLower: null, cumulativeNetGammaAtUpper: null, distanceFromUnderlyingPoints: null, distanceFromUnderlyingPercent: null },
    gammaCliffs: [],
    returnedWindowNetDeltaExposureProxy: 400_000_000,
    dexRegime: "POSITIVE",
    dexRegimeRatioPercent: 40,
    largestAbsoluteDexAnchor: null,
    sourceGexMetricState: "LIVE",
    sourceGexCoverageState: "COMPLETE",
    sourceDexMetricState: "LIVE",
    sourceDexCoverageState: "COMPLETE",
    latestOptionQuoteAt: QUOTE_AT,
    chainFetchedAt: FETCHED_AT,
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

function component(
  name: MarketContextComponent,
  overrides: Partial<MarketContextComponentStatus> = {},
): MarketContextComponentStatus {
  return {
    component: name,
    status: "AVAILABLE",
    requirement: name === "QUOTE" ? "REQUIRED" : "OPTIONAL_ENRICHMENT",
    applicable: true,
    dependencyGroup:
      ["OPTIONS_CHAIN", "EXPECTED_MOVE", "GEX", "DEX"].includes(name)
        ? "OPTIONS_CHAIN"
        : ["SESSION_DATA", "SESSION_LEVELS", "GAP", "OPENING_RANGE"].includes(name)
          ? "BOUNDED_CANDLES"
          : null,
    sourceState: "LIVE",
    metricState: null,
    coverageState: null,
    currentMarketDate: MARKET_DATE,
    sessionDate: null,
    expirationDate: null,
    latestDataAt: QUOTE_AT,
    fetchedAt: FETCHED_AT,
    dataAgeMs: 15_000,
    warningCode: null,
    ...overrides,
  };
}

function baseContext(): SpyZeroDteMarketContextResponse {
  return {
    symbol: "SPY",
    product: "SPY_ZERO_DTE_MARKET_CONTEXT",
    currentMarketDate: MARKET_DATE,
    mostRecentRthSessionDate: MARKET_DATE,
    assembledAt: ASSEMBLED_AT,
    contextState: "READY",
    quote: {
      symbol: "SPY",
      lastPrice: 754.5,
      bidPrice: 754.49,
      askPrice: 754.51,
      volume: 1_000_000,
      quoteTimestamp: QUOTE_AT,
      fetchedAt: FETCHED_AT,
      marketStatus: "NORMAL",
      sourceState: "LIVE",
      dataAgeMs: 15_000,
      warningCode: null,
    },
    candles: {
      marketDate: MARKET_DATE,
      timeframe: "5m",
      sourceState: "LIVE",
      candleCount: 3,
      sessionOpen: 752,
      sessionHigh: 755,
      sessionLow: 751,
      latestCandle: {
        timestamp: Date.parse("2026-07-16T13:55:00.000Z"),
        open: 753.5,
        high: 755,
        low: 753,
        close: 754.5,
        volume: 150,
      },
      previousCandle: {
        timestamp: Date.parse("2026-07-16T13:50:00.000Z"),
        open: 753,
        high: 754,
        low: 752.5,
        close: 753.5,
        volume: 120,
      },
      latestCandleAt: "2026-07-16T13:55:00.000Z",
      fetchedAt: FETCHED_AT,
      dataAgeMs: 15_000,
      warningCode: null,
    },
    session: {
      currentMarketDate: MARKET_DATE,
      currentSessionWindow: "RTH",
      currentObservedMarketDate: MARKET_DATE,
      previousObservedMarketDate: PREVIOUS_DATE,
      mostRecentRthSessionDate: MARKET_DATE,
      sourceState: "LIVE",
      fetchedAt: FETCHED_AT,
      dataAgeMs: 15_000,
      warningCode: null,
    },
    vwap: {
      marketDate: MARKET_DATE,
      metricState: "LIVE",
      candleSourceState: "LIVE",
      latestVwap: 753.2,
      latestRthCandleAt: "2026-07-16T13:55:00.000Z",
      rthCandleCount: 6,
      fetchedAt: FETCHED_AT,
      dataAgeMs: 15_000,
      warningCode: null,
    },
    sessionLevels: {
      currentMarketDate: MARKET_DATE,
      currentMarketDateHasDefinedSessionData: true,
      previousRthMarketDate: PREVIOUS_DATE,
      candleSourceState: "LIVE",
      premarketCoverageState: "COMPLETE",
      previousRthCoverageState: "COMPLETE",
      premarketHigh: { value: 753, state: "LIVE" },
      premarketLow: { value: 749, state: "LIVE" },
      previousDayHigh: { value: 756, state: "LIVE" },
      previousDayLow: { value: 745, state: "LIVE" },
      previousDayClose: { value: 750, state: "LIVE" },
      fetchedAt: FETCHED_AT,
      dataAgeMs: 15_000,
      latestCandleAt: "2026-07-16T13:55:00.000Z",
      warningCode: null,
    },
    gap: {
      currentMarketDate: MARKET_DATE,
      previousRthMarketDate: PREVIOUS_DATE,
      metricState: "LIVE",
      candleSourceState: "LIVE",
      currentRthOpen: 752,
      currentRthOpenAt: "2026-07-16T13:30:00.000Z",
      previousDayClose: 750,
      gapPoints: 2,
      gapPercent: 0.26666666666666666,
      direction: "UP",
      fillState: "UNFILLED",
      firstObservedFillCandleAt: null,
      currentRthCoverageState: "COMPLETE",
      previousRthCoverageState: "COMPLETE",
      latestRthCandleAt: "2026-07-16T13:55:00.000Z",
      fetchedAt: FETCHED_AT,
      dataAgeMs: 15_000,
      warningCode: null,
    },
    openingRange: {
      currentMarketDate: MARKET_DATE,
      metricState: "LIVE",
      candleSourceState: "LIVE",
      phase: "COMPLETE",
      openingRangeHigh: 754,
      openingRangeLow: 751,
      openingRangeStartAt: "2026-07-16T13:30:00.000Z",
      openingRangeEndAt: "2026-07-16T13:45:00.000Z",
      openingRangeCandleCount: 3,
      coverageState: "COMPLETE",
      firstOpeningRangeCandleAt: "2026-07-16T13:30:00.000Z",
      latestOpeningRangeCandleAt: "2026-07-16T13:40:00.000Z",
      fetchedAt: FETCHED_AT,
      dataAgeMs: 15_000,
      warningCode: null,
    },
    options: {
      underlyingPrice: 754.5,
      underlyingPriceSource: "CHAIN_RESPONSE",
      currentMarketDate: MARKET_DATE,
      requestedExpirationDate: MARKET_DATE,
      returnedExpirationDate: MARKET_DATE,
      requestedStrikeCount: 40,
      returnedUniqueStrikeCount: 40,
      minimumReturnedStrike: 735,
      maximumReturnedStrike: 774,
      atmStrike: 755,
      callContractCount: 40,
      putContractCount: 40,
      rejectedContractCount: 0,
      sourceState: "LIVE",
      metricState: "LIVE",
      latestOptionQuoteAt: QUOTE_AT,
      chainFetchedAt: FETCHED_AT,
      dataAgeMs: 15_000,
      warningCode: null,
    },
    expectedMove: {
      methodology: "ATM_STRADDLE_MARK",
      currentMarketDate: MARKET_DATE,
      expirationDate: MARKET_DATE,
      metricState: "LIVE",
      sourceState: "LIVE",
      underlyingPrice: 754.5,
      underlyingPriceSource: "CHAIN_RESPONSE",
      atmStrike: 755,
      callContractSymbol: "SPY-CALL-755",
      putContractSymbol: "SPY-PUT-755",
      callMark: 1.4,
      putMark: 1.6,
      impliedMovePoints: 3,
      impliedMovePercent: 0.3976,
      upperImpliedMoveLevel: 757.5,
      lowerImpliedMoveLevel: 751.5,
      callQuoteAt: QUOTE_AT,
      putQuoteAt: QUOTE_AT,
      latestSelectedContractQuoteAt: QUOTE_AT,
      chainFetchedAt: FETCHED_AT,
      fetchedAt: FETCHED_AT,
      dataAgeMs: 15_000,
      warningCode: null,
    },
    gex: {
      methodology: "OI_WEIGHTED_GAMMA_PER_1PCT_MOVE",
      coverageScope: "RETURNED_CHAIN_WINDOW",
      currentMarketDate: MARKET_DATE,
      expirationDate: MARKET_DATE,
      metricState: "LIVE",
      sourceState: "LIVE",
      coverageState: "COMPLETE",
      underlyingPrice: 754.5,
      requestedStrikeCount: 40,
      returnedUniqueStrikeCount: 40,
      minimumReturnedStrike: 735,
      maximumReturnedStrike: 774,
      returnedWindowCallGammaExposure: 1_200_000_000,
      returnedWindowPutGammaExposureMagnitude: 700_000_000,
      returnedWindowNetGammaExposureProxy: 500_000_000,
      eligibleCallContractCount: 40,
      eligiblePutContractCount: 40,
      eligibleStrikeCount: 40,
      latestOptionQuoteAt: QUOTE_AT,
      chainFetchedAt: FETCHED_AT,
      fetchedAt: FETCHED_AT,
      dataAgeMs: 15_000,
      warningCode: null,
    },
    dex: {
      methodology: "OI_WEIGHTED_DELTA_NOTIONAL",
      coverageScope: "RETURNED_CHAIN_WINDOW",
      currentMarketDate: MARKET_DATE,
      expirationDate: MARKET_DATE,
      metricState: "LIVE",
      sourceState: "LIVE",
      coverageState: "COMPLETE",
      underlyingPrice: 754.5,
      requestedStrikeCount: 40,
      returnedUniqueStrikeCount: 40,
      minimumReturnedStrike: 735,
      maximumReturnedStrike: 774,
      returnedWindowCallDeltaExposure: 600_000_000,
      returnedWindowPutDeltaExposureMagnitude: 900_000_000,
      returnedWindowNetDeltaExposureProxy: -300_000_000,
      eligibleCallContractCount: 40,
      eligiblePutContractCount: 40,
      eligibleStrikeCount: 40,
      latestOptionQuoteAt: QUOTE_AT,
      chainFetchedAt: FETCHED_AT,
      fetchedAt: FETCHED_AT,
      dataAgeMs: 15_000,
      warningCode: null,
    },
    components: [
      component("QUOTE", { requirement: "REQUIRED" }),
      component("CANDLES", { requirement: "SESSION_CONDITIONALLY_REQUIRED" }),
      component("SESSION_DATA", { requirement: "SESSION_CONDITIONALLY_REQUIRED" }),
      component("VWAP", { requirement: "SESSION_CONDITIONALLY_REQUIRED", metricState: "LIVE", sessionDate: MARKET_DATE }),
      component("SESSION_LEVELS", { coverageState: "COMPLETE/COMPLETE", sessionDate: PREVIOUS_DATE }),
      component("GAP", { metricState: "LIVE", coverageState: "COMPLETE/COMPLETE", sessionDate: PREVIOUS_DATE }),
      component("OPENING_RANGE", { metricState: "LIVE", coverageState: "COMPLETE", sessionDate: MARKET_DATE }),
      component("OPTIONS_CHAIN", { metricState: "LIVE", expirationDate: MARKET_DATE }),
      component("EXPECTED_MOVE", { metricState: "LIVE", expirationDate: MARKET_DATE }),
      component("GEX", { metricState: "LIVE", coverageState: "COMPLETE", expirationDate: MARKET_DATE }),
      component("DEX", { metricState: "LIVE", coverageState: "COMPLETE", expirationDate: MARKET_DATE }),
    ],
    componentWarnings: [],
    warningCode: null,
  };
}

function cloneContext(): SpyZeroDteMarketContextResponse {
  return structuredClone(baseContext());
}

function setComponent(
  context: SpyZeroDteMarketContextResponse,
  name: MarketContextComponent,
  updates: Partial<MarketContextComponentStatus>,
): void {
  const index = context.components.findIndex((item) => item.component === name);
  assert.notEqual(index, -1);
  context.components[index] = { ...context.components[index]!, ...updates };
}

let passed = 0;
let failed = 0;
function test(name: string, fn: () => void) {
  try {
    fn();
    passed += 1;
    console.log(`PASS ${name}`);
  } catch (err) {
    failed += 1;
    console.error(`FAIL ${name}: ${(err as Error).message}`);
  }
}

test("exact comparison returns ABOVE, BELOW, and EQUAL without rounding", () => {
  assert.equal(compareExact(2, 1), "ABOVE");
  assert.equal(compareExact(1, 2), "BELOW");
  assert.equal(compareExact(1, 1), "EQUAL");
  assert.equal(compareExact(Number.NaN, 1), null);
});

test("point and percent distance preserves full precision and rejects invalid denominator", () => {
  assert.deepEqual(calculatePointAndPercentDistance(110, 100), {
    distancePoints: 10,
    distancePercent: 10,
  });
  assert.deepEqual(calculatePointAndPercentDistance(90, 100), {
    distancePoints: -10,
    distancePercent: -10,
  });
  assert.deepEqual(calculatePointAndPercentDistance(100, 100), {
    distancePoints: 0,
    distancePercent: 0,
  });
  assert.equal(calculatePointAndPercentDistance(1, 0), null);
  assert.equal(calculatePointAndPercentDistance(1, -1), null);
});

test("range classifier covers above, boundaries, inside, below, and zero-width boundary", () => {
  assert.equal(classifyRangePosition(11, 10, 5), "ABOVE_RANGE");
  assert.equal(classifyRangePosition(10, 10, 5), "AT_HIGH");
  assert.equal(classifyRangePosition(7, 10, 5), "INSIDE_RANGE");
  assert.equal(classifyRangePosition(5, 10, 5), "AT_LOW");
  assert.equal(classifyRangePosition(4, 10, 5), "BELOW_RANGE");
  assert.equal(classifyRangePosition(5, 5, 5), "AT_BOUNDARY");
  assert.equal(classifyRangePosition(5, 4, 6), null);
});

test("expected-move classifier covers exact bounds and zero-width boundary", () => {
  assert.equal(classifyExpectedMovePosition(11, 10, 5), "ABOVE_UPPER");
  assert.equal(classifyExpectedMovePosition(10, 10, 5), "AT_UPPER");
  assert.equal(classifyExpectedMovePosition(7, 10, 5), "INSIDE_RANGE");
  assert.equal(classifyExpectedMovePosition(5, 10, 5), "AT_LOWER");
  assert.equal(classifyExpectedMovePosition(4, 10, 5), "BELOW_LOWER");
  assert.equal(classifyExpectedMovePosition(5, 5, 5), "AT_BOUNDARY");
});

test("sign classifier preserves legitimate zero", () => {
  assert.equal(classifyExactSign(1), "POSITIVE");
  assert.equal(classifyExactSign(-1), "NEGATIVE");
  assert.equal(classifyExactSign(0), "ZERO");
  assert.equal(classifyExactSign(Number.POSITIVE_INFINITY), null);
});

test("healthy RTH context produces all nine deterministic V1 features", () => {
  const result = buildSpyZeroDteDeterministicMarketState(baseContext(), CALCULATED_AT);
  assert.equal(result.product, "SPY_ZERO_DTE_DETERMINISTIC_MARKET_STATE");
  assert.equal(result.engineVersion, "V1");
  assert.equal(result.featureStatuses.length, 9);
  assert.equal(result.engineState, "AVAILABLE");
  assert.equal(result.warningCode, null);
});

test("Market State preserves the exact exposure structure used by Trade Plan V2", () => {
  const context = cloneContext();
  context.exposureStructure = testExposureStructure();
  const result = buildSpyZeroDteDeterministicMarketState(context, CALCULATED_AT);
  assert.deepEqual(result.exposureStructure, context.exposureStructure);
  assert.equal(result.exposureStructure?.methodologyVersion, "EXPOSURE_STRUCTURE_V1");
});

test("canonical comparison price is Quote lastPrice for every price feature", () => {
  const result = buildSpyZeroDteDeterministicMarketState(baseContext(), CALCULATED_AT);
  assert.equal(result.price, 754.5);
  assert.equal(result.priceSource, "QUOTE_LAST_PRICE");
  assert.equal(result.features.priceVsVwap.inputs.price, 754.5);
  assert.equal(result.features.priceVsPriorDayRange.inputs.price, 754.5);
  assert.equal(result.features.priceVsExpectedMoveRange.inputs.price, 754.5);
});

test("session phase passes through authoritative Context terminology", () => {
  const result = buildSpyZeroDteDeterministicMarketState(baseContext(), CALCULATED_AT);
  assert.equal(result.features.sessionPhase.state, "RTH");
  assert.deepEqual(result.features.sessionPhase.sourceComponents, ["SESSION_DATA"]);
});

test("price versus VWAP calculates exact state and distances", () => {
  const result = buildSpyZeroDteDeterministicMarketState(baseContext(), CALCULATED_AT);
  const feature = result.features.priceVsVwap;
  assert.equal(feature.state, "ABOVE");
  assert.equal(feature.derived.distancePoints, 1.2999999999999545);
  assert.equal(feature.derived.distancePercent, (1.2999999999999545 / 753.2) * 100);
  assert.equal(feature.referenceDateRelation, "CURRENT_MARKET_DATE");
});

test("prior-day range is classified without support or resistance interpretation", () => {
  const feature = buildSpyZeroDteDeterministicMarketState(baseContext(), CALCULATED_AT)
    .features.priceVsPriorDayRange;
  assert.equal(feature.state, "INSIDE_RANGE");
  assert.equal(feature.referenceDate, PREVIOUS_DATE);
  assert.equal(feature.referenceDateRelation, "PREVIOUS_RTH_SESSION");
});

test("premarket range is classified from exact current-date level fields", () => {
  const feature = buildSpyZeroDteDeterministicMarketState(baseContext(), CALCULATED_AT)
    .features.priceVsPremarketRange;
  assert.equal(feature.state, "ABOVE_RANGE");
  assert.equal(feature.status, "AVAILABLE");
});

test("complete Opening Range produces an exact location state", () => {
  const feature = buildSpyZeroDteDeterministicMarketState(baseContext(), CALCULATED_AT)
    .features.priceVsOpeningRange;
  assert.equal(feature.state, "ABOVE_RANGE");
  assert.equal(feature.status, "AVAILABLE");
});

test("Gap feature passes through existing direction, fill state, and numeric values", () => {
  const feature = buildSpyZeroDteDeterministicMarketState(baseContext(), CALCULATED_AT)
    .features.gapContext;
  assert.equal(feature.state, "UP");
  assert.equal(feature.inputs.gapPoints, 2);
  assert.equal(feature.inputs.fillState, "UNFILLED");
});

test("Expected Move feature uses current expiration and exact range comparison", () => {
  const feature = buildSpyZeroDteDeterministicMarketState(baseContext(), CALCULATED_AT)
    .features.priceVsExpectedMoveRange;
  assert.equal(feature.state, "INSIDE_RANGE");
  assert.equal(feature.referenceDateRelation, "CURRENT_EXPIRATION");
});

test("GEX and DEX features expose mathematical signs only", () => {
  const result = buildSpyZeroDteDeterministicMarketState(baseContext(), CALCULATED_AT);
  assert.equal(result.features.netGexProxySign.state, "POSITIVE");
  assert.equal(result.features.netDexProxySign.state, "NEGATIVE");
  assert.equal(result.features.netGexProxySign.inputs.coverageScope, "RETURNED_CHAIN_WINDOW");
  assert.equal(result.features.netDexProxySign.inputs.coverageScope, "RETURNED_CHAIN_WINDOW");
});

test("unrelated DEGRADED Context does not blanket-weaken complete feature inputs", () => {
  const context = cloneContext();
  context.contextState = "DEGRADED";
  context.warningCode = "PARTIAL_MARKET_CONTEXT";
  context.options.warningCode = "PARTIAL_CONTRACT_DATA";
  setComponent(context, "OPTIONS_CHAIN", { status: "PARTIAL", warningCode: "PARTIAL_CONTRACT_DATA" });
  const result = buildSpyZeroDteDeterministicMarketState(context, CALCULATED_AT);
  assert.equal(result.engineState, "AVAILABLE");
  assert.equal(result.features.netGexProxySign.status, "AVAILABLE");
  assert.equal(result.features.netDexProxySign.status, "AVAILABLE");
});

test("STALE Quote remains usable but weakens price-derived features", () => {
  const context = cloneContext();
  context.quote.sourceState = "STALE";
  setComponent(context, "QUOTE", { status: "STALE", sourceState: "STALE" });
  const result = buildSpyZeroDteDeterministicMarketState(context, CALCULATED_AT);
  assert.equal(result.price, 754.5);
  assert.equal(result.features.priceVsVwap.status, "PARTIAL");
  assert.equal(result.engineState, "PARTIAL");
});

test("MOCK or unavailable Quote never becomes a canonical comparison price", () => {
  const context = cloneContext();
  context.contextState = "UNAVAILABLE";
  context.quote.sourceState = "MOCK";
  context.quote.warningCode = "NOT_CONNECTED";
  setComponent(context, "QUOTE", { status: "UNAVAILABLE", sourceState: "MOCK", warningCode: "NOT_CONNECTED" });
  const result = buildSpyZeroDteDeterministicMarketState(context, CALCULATED_AT);
  assert.equal(result.price, null);
  assert.equal(result.priceSource, null);
  assert.equal(result.engineState, "UNAVAILABLE");
  assert.equal(result.warningCode, "MARKET_CONTEXT_UNAVAILABLE");
});

test("VWAP NOT_APPLICABLE remains distinct from unavailable and does not weaken engine", () => {
  const context = cloneContext();
  setComponent(context, "VWAP", { status: "NOT_APPLICABLE", applicable: false });
  const result = buildSpyZeroDteDeterministicMarketState(context, CALCULATED_AT);
  assert.equal(result.features.priceVsVwap.status, "NOT_APPLICABLE");
  assert.equal(result.engineState, "AVAILABLE");
});

test("STALE VWAP produces a PARTIAL feature with deterministic state", () => {
  const context = cloneContext();
  context.vwap.metricState = "STALE";
  context.vwap.candleSourceState = "STALE";
  setComponent(context, "VWAP", { status: "STALE", sourceState: "STALE", metricState: "STALE" });
  const feature = buildSpyZeroDteDeterministicMarketState(context, CALCULATED_AT)
    .features.priceVsVwap;
  assert.equal(feature.status, "PARTIAL");
  assert.equal(feature.state, "ABOVE");
});

test("broad SESSION_LEVELS PARTIAL does not weaken complete prior-day inputs", () => {
  const context = cloneContext();
  setComponent(context, "SESSION_LEVELS", { status: "PARTIAL" });
  const feature = buildSpyZeroDteDeterministicMarketState(context, CALCULATED_AT)
    .features.priceVsPriorDayRange;
  assert.equal(feature.status, "AVAILABLE");
});

test("partial prior-RTH coverage weakens only the prior-day range feature", () => {
  const context = cloneContext();
  context.sessionLevels.previousRthCoverageState = "PARTIAL";
  const result = buildSpyZeroDteDeterministicMarketState(context, CALCULATED_AT);
  assert.equal(result.features.priceVsPriorDayRange.status, "PARTIAL");
  assert.equal(result.features.priceVsPremarketRange.status, "AVAILABLE");
});

test("missing prior-day level is UNAVAILABLE and remains null rather than zero", () => {
  const context = cloneContext();
  context.sessionLevels.previousDayHigh = { value: null, state: "UNAVAILABLE" };
  const feature = buildSpyZeroDteDeterministicMarketState(context, CALCULATED_AT)
    .features.priceVsPriorDayRange;
  assert.equal(feature.status, "UNAVAILABLE");
  assert.equal(feature.state, null);
  assert.equal(feature.inputs.previousDayHigh, null);
});

test("zero-width prior-day range uses AT_BOUNDARY instead of arbitrary high priority", () => {
  const context = cloneContext();
  context.quote.lastPrice = 750;
  context.sessionLevels.previousDayHigh = { value: 750, state: "LIVE" };
  context.sessionLevels.previousDayLow = { value: 750, state: "LIVE" };
  const feature = buildSpyZeroDteDeterministicMarketState(context, CALCULATED_AT)
    .features.priceVsPriorDayRange;
  assert.equal(feature.state, "AT_BOUNDARY");
});

test("premarket range is NOT_APPLICABLE overnight before current-date session data", () => {
  const context = cloneContext();
  context.session.currentSessionWindow = "CLOSED";
  context.sessionLevels.currentMarketDateHasDefinedSessionData = false;
  context.sessionLevels.premarketHigh = { value: null, state: "UNAVAILABLE" };
  context.sessionLevels.premarketLow = { value: null, state: "UNAVAILABLE" };
  const feature = buildSpyZeroDteDeterministicMarketState(context, CALCULATED_AT)
    .features.priceVsPremarketRange;
  assert.equal(feature.status, "NOT_APPLICABLE");
  assert.equal(feature.state, null);
});

test("stale premarket levels produce PARTIAL while retaining location state", () => {
  const context = cloneContext();
  context.sessionLevels.premarketHigh.state = "STALE";
  const feature = buildSpyZeroDteDeterministicMarketState(context, CALCULATED_AT)
    .features.priceVsPremarketRange;
  assert.equal(feature.status, "PARTIAL");
  assert.equal(feature.state, "ABOVE_RANGE");
});

test("Opening Range PRE_OPEN passes through NOT_STARTED without a comparison", () => {
  const context = cloneContext();
  context.openingRange.phase = "PRE_OPEN";
  context.openingRange.metricState = "UNAVAILABLE";
  context.openingRange.openingRangeHigh = null;
  context.openingRange.openingRangeLow = null;
  setComponent(context, "OPENING_RANGE", { status: "NOT_APPLICABLE", applicable: false });
  const feature = buildSpyZeroDteDeterministicMarketState(context, CALCULATED_AT)
    .features.priceVsOpeningRange;
  assert.equal(feature.status, "NOT_APPLICABLE");
  assert.equal(feature.state, "NOT_STARTED");
});

test("Opening Range FORMING stays PARTIAL and does not invent a location state", () => {
  const context = cloneContext();
  context.openingRange.phase = "FORMING";
  context.openingRange.warningCode = "OPENING_RANGE_INCOMPLETE";
  setComponent(context, "OPENING_RANGE", { status: "PARTIAL", warningCode: "OPENING_RANGE_INCOMPLETE" });
  const feature = buildSpyZeroDteDeterministicMarketState(context, CALCULATED_AT)
    .features.priceVsOpeningRange;
  assert.equal(feature.status, "PARTIAL");
  assert.equal(feature.state, "FORMING");
});

test("Gap NOT_APPLICABLE remains distinct from provider failure", () => {
  const context = cloneContext();
  setComponent(context, "GAP", { status: "NOT_APPLICABLE", applicable: false });
  const feature = buildSpyZeroDteDeterministicMarketState(context, CALCULATED_AT)
    .features.gapContext;
  assert.equal(feature.status, "NOT_APPLICABLE");
  assert.equal(feature.warningCode, null);
});

test("partial Gap coverage preserves existing Gap state and marks feature PARTIAL", () => {
  const context = cloneContext();
  context.gap.currentRthCoverageState = "PARTIAL";
  const feature = buildSpyZeroDteDeterministicMarketState(context, CALCULATED_AT)
    .features.gapContext;
  assert.equal(feature.status, "PARTIAL");
  assert.equal(feature.state, "UP");
});

test("Expected Move prior expiration is rejected rather than reused", () => {
  const context = cloneContext();
  context.expectedMove.expirationDate = PREVIOUS_DATE;
  const feature = buildSpyZeroDteDeterministicMarketState(context, CALCULATED_AT)
    .features.priceVsExpectedMoveRange;
  assert.equal(feature.status, "UNAVAILABLE");
  assert.equal(feature.state, null);
  assert.equal(feature.warningCode, "EXPIRATION_MISMATCH");
});

test("Expected Move NOT_APPLICABLE remains non-degrading", () => {
  const context = cloneContext();
  setComponent(context, "EXPECTED_MOVE", { status: "NOT_APPLICABLE", applicable: false });
  const result = buildSpyZeroDteDeterministicMarketState(context, CALCULATED_AT);
  assert.equal(result.features.priceVsExpectedMoveRange.status, "NOT_APPLICABLE");
  assert.equal(result.engineState, "AVAILABLE");
});

test("zero-width Expected Move range uses AT_BOUNDARY", () => {
  const context = cloneContext();
  context.expectedMove.upperImpliedMoveLevel = 754.5;
  context.expectedMove.lowerImpliedMoveLevel = 754.5;
  const feature = buildSpyZeroDteDeterministicMarketState(context, CALCULATED_AT)
    .features.priceVsExpectedMoveRange;
  assert.equal(feature.state, "AT_BOUNDARY");
});

test("PARTIAL GEX coverage retains numeric sign with PARTIAL status", () => {
  const context = cloneContext();
  context.gex.coverageState = "PARTIAL";
  context.gex.warningCode = "PARTIAL_GEX_INPUTS";
  setComponent(context, "GEX", { status: "PARTIAL", coverageState: "PARTIAL", warningCode: "PARTIAL_GEX_INPUTS" });
  const feature = buildSpyZeroDteDeterministicMarketState(context, CALCULATED_AT)
    .features.netGexProxySign;
  assert.equal(feature.status, "PARTIAL");
  assert.equal(feature.state, "POSITIVE");
});

test("exact zero Net GEX and Net DEX produce ZERO", () => {
  const context = cloneContext();
  context.gex.returnedWindowNetGammaExposureProxy = 0;
  context.dex.returnedWindowNetDeltaExposureProxy = 0;
  const result = buildSpyZeroDteDeterministicMarketState(context, CALCULATED_AT);
  assert.equal(result.features.netGexProxySign.state, "ZERO");
  assert.equal(result.features.netDexProxySign.state, "ZERO");
});

test("unavailable GEX remains unavailable rather than synthetic zero", () => {
  const context = cloneContext();
  context.gex.metricState = "UNAVAILABLE";
  context.gex.coverageState = "UNAVAILABLE";
  context.gex.returnedWindowNetGammaExposureProxy = null;
  setComponent(context, "GEX", { status: "UNAVAILABLE", metricState: "UNAVAILABLE", coverageState: "UNAVAILABLE" });
  const feature = buildSpyZeroDteDeterministicMarketState(context, CALCULATED_AT)
    .features.netGexProxySign;
  assert.equal(feature.status, "UNAVAILABLE");
  assert.equal(feature.state, null);
});

test("DEX sign does not inherit unrelated Options Chain partial warning", () => {
  const context = cloneContext();
  context.options.warningCode = "PARTIAL_CONTRACT_DATA";
  setComponent(context, "OPTIONS_CHAIN", { status: "PARTIAL", warningCode: "PARTIAL_CONTRACT_DATA" });
  const feature = buildSpyZeroDteDeterministicMarketState(context, CALCULATED_AT)
    .features.netDexProxySign;
  assert.equal(feature.status, "AVAILABLE");
  assert.equal(feature.state, "NEGATIVE");
});

test("one applicable unavailable feature makes engine PARTIAL when other features remain usable", () => {
  const context = cloneContext();
  context.sessionLevels.previousDayHigh = { value: null, state: "UNAVAILABLE" };
  const result = buildSpyZeroDteDeterministicMarketState(context, CALCULATED_AT);
  assert.equal(result.engineState, "PARTIAL");
  assert.equal(result.warningCode, "PARTIAL_MARKET_STATE");
});

test("only NOT_APPLICABLE features do not automatically weaken engine", () => {
  const statuses = ["AVAILABLE", "NOT_APPLICABLE", "NOT_APPLICABLE"] as const;
  assert.deepEqual(deriveMarketStateEngineState("READY", 100, statuses), {
    engineState: "AVAILABLE",
    warningCode: null,
  });
});

test("Market Context UNAVAILABLE outranks feature-level availability", () => {
  assert.deepEqual(deriveMarketStateEngineState("UNAVAILABLE", 100, ["AVAILABLE"]), {
    engineState: "UNAVAILABLE",
    warningCode: "MARKET_CONTEXT_UNAVAILABLE",
  });
});

test("calculatedAt remains distinct from source Context assembledAt", () => {
  const result = buildSpyZeroDteDeterministicMarketState(baseContext(), CALCULATED_AT);
  assert.equal(result.sourceContextAssembledAt, ASSEMBLED_AT);
  assert.equal(result.calculatedAt, new Date(CALCULATED_AT).toISOString());
  assert.notEqual(result.calculatedAt, result.sourceContextAssembledAt);
});

test("response does not duplicate Unified Market Context or add optional candle-body feature", () => {
  const result = buildSpyZeroDteDeterministicMarketState(baseContext(), CALCULATED_AT) as unknown as Record<string, unknown>;
  assert.equal("context" in result, false);
  assert.equal("marketContext" in result, false);
  const features = result.features as Record<string, unknown>;
  assert.equal("latestObservedCandleBody" in features, false);
});

test("feature-status and warning arrays remain schema-consistent", () => {
  const context = cloneContext();
  context.gex.coverageState = "PARTIAL";
  context.gex.warningCode = "PARTIAL_GEX_INPUTS";
  setComponent(context, "GEX", { status: "PARTIAL", warningCode: "PARTIAL_GEX_INPUTS" });
  const result = buildSpyZeroDteDeterministicMarketState(context, CALCULATED_AT);
  const gexStatus = result.featureStatuses.find((item) => item.featureId === "RETURNED_WINDOW_NET_GEX_SIGN");
  assert.equal(gexStatus?.status, "PARTIAL");
  assert.ok(result.featureWarnings.some((item) => item.featureId === "RETURNED_WINDOW_NET_GEX_SIGN"));
});

console.log(`\n${passed} passed, ${failed} failed (${passed + failed} total)`);
if (failed > 0) process.exit(1);
