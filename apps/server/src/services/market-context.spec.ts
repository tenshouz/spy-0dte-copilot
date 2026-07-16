/**
 * Deterministic tests for the unified SPY 0DTE Market Context foundation.
 * Run: npx --no-install tsx apps/server/src/services/market-context.spec.ts
 */
import assert from "node:assert/strict";
import type {
  NormalizedOptionContract,
  MarketContextComponentStatus,
  SpyOpeningRangeResponse,
  SpyQuote,
  SpyRthGapResponse,
  SpyRthVwapResponse,
  SpySessionDataFoundationResponse,
  SpySessionLevelsResponse,
  SpyZeroDteDexProxyResponse,
  SpyZeroDteExpectedMoveResponse,
  SpyZeroDteGexProxyResponse,
  SpyZeroDteOptionsChainResponse,
} from "@spy-copilot/shared";
import {
  buildSpyZeroDteMarketContext,
  deriveMarketContextState,
  selectMostRecentRthSessionDate,
  summarizeSpyCandles,
  type SpyMarketContextInputs,
} from "./market-context.logic";

const MARKET_DATE = "2026-07-16";
const PREVIOUS_DATE = "2026-07-15";
const NOW = Date.parse("2026-07-16T14:00:00.000Z"); // 10:00 EDT, RTH
const FETCHED_AT = "2026-07-16T13:59:45.000Z";
const LATEST_AT = "2026-07-16T13:55:00.000Z";

function contract(optionType: "CALL" | "PUT", strikePrice: number): NormalizedOptionContract {
  return {
    contractSymbol: `SPY-${optionType}-${strikePrice}`,
    underlyingSymbol: "SPY",
    optionType,
    expirationDate: MARKET_DATE,
    strikePrice,
    description: null,
    bid: 1,
    ask: 1.1,
    last: 1.05,
    mark: 1.05,
    bidSize: 1,
    askSize: 1,
    lastSize: 1,
    volume: 10,
    openInterest: 100,
    impliedVolatilityPercent: 20,
    delta: optionType === "CALL" ? 0.5 : -0.5,
    gamma: 0.01,
    theta: -0.02,
    vega: 0.01,
    rho: 0,
    inTheMoney: false,
    nonStandard: false,
    mini: false,
    multiplier: 100,
    quoteAt: LATEST_AT,
    tradeAt: null,
  };
}

function baseInputs(): SpyMarketContextInputs {
  const quote: SpyQuote = {
    symbol: "SPY",
    lastPrice: 754.5,
    bidPrice: 754.49,
    askPrice: 754.51,
    volume: 1_000_000,
    quoteTimestamp: LATEST_AT,
    fetchedAt: FETCHED_AT,
    marketStatus: "NORMAL",
    sourceState: "LIVE",
    dataAgeMs: 15_000,
    warningCode: null,
  };

  const candles = {
    symbol: "SPY" as const,
    timeframe: "5m" as const,
    sourceState: "LIVE" as const,
    candles: [
      { timestamp: Date.parse("2026-07-16T13:30:00.000Z"), open: 752, high: 753, low: 751, close: 752.5, volume: 100 },
      { timestamp: Date.parse("2026-07-16T13:35:00.000Z"), open: 752.5, high: 754, low: 752, close: 753.5, volume: 120 },
      { timestamp: Date.parse(LATEST_AT), open: 753.5, high: 755, low: 753, close: 754.5, volume: 150 },
    ],
    fetchedAt: FETCHED_AT,
    latestCandleAt: LATEST_AT,
    dataAgeMs: 15_000,
    isExtendedHoursIncluded: true,
    warningCode: null,
  };

  const completeWindow = {
    state: "COMPLETE" as const,
    firstCandleAt: "2026-07-16T13:30:00.000Z",
    lastCandleAt: LATEST_AT,
    candleCount: 6,
    gapCount: 0,
    largestGapMs: 0,
    gaps: [],
  };
  const emptyWindow = {
    state: "UNAVAILABLE" as const,
    firstCandleAt: null,
    lastCandleAt: null,
    candleCount: 0,
    gapCount: 0,
    largestGapMs: 0,
    gaps: [],
  };
  const sessionData: SpySessionDataFoundationResponse = {
    symbol: "SPY",
    timeframe: "5m",
    sourceState: "LIVE",
    fetchedAt: FETCHED_AT,
    dataAgeMs: 15_000,
    requestStrategy: "EXPLICIT_BOUNDED_WINDOW",
    requestedStartAt: "2026-07-09T14:00:00.000Z",
    requestedEndAt: "2026-07-16T14:00:00.000Z",
    firstCandleAt: "2026-07-15T13:30:00.000Z",
    lastCandleAt: LATEST_AT,
    candleCount: 12,
    extendedHoursRequested: true,
    timestampSemantics: "PROVIDER_TIMESTAMP_UNVERIFIED",
    currentObservedMarketDate: MARKET_DATE,
    previousObservedMarketDate: PREVIOUS_DATE,
    observedDates: [
      {
        marketDate: PREVIOUS_DATE,
        firstCandleAt: "2026-07-15T13:30:00.000Z",
        lastCandleAt: "2026-07-15T20:00:00.000Z",
        candleCount: 6,
        gapCount: 0,
        largestGapMs: 0,
        premarket: emptyWindow,
        rth: { ...completeWindow, firstCandleAt: "2026-07-15T13:30:00.000Z", lastCandleAt: "2026-07-15T20:00:00.000Z" },
        afterHours: emptyWindow,
      },
      {
        marketDate: MARKET_DATE,
        firstCandleAt: "2026-07-16T13:30:00.000Z",
        lastCandleAt: LATEST_AT,
        candleCount: 6,
        gapCount: 0,
        largestGapMs: 0,
        premarket: emptyWindow,
        rth: completeWindow,
        afterHours: emptyWindow,
      },
    ],
    warningCode: null,
  };

  const vwap: SpyRthVwapResponse = {
    symbol: "SPY",
    metric: "RTH_VWAP",
    priceSource: "HLC3",
    marketDate: MARKET_DATE,
    metricState: "LIVE",
    candleSourceState: "LIVE",
    latestVwap: 753.2,
    series: [{ timestamp: Date.parse(LATEST_AT), value: 753.2 }],
    fetchedAt: FETCHED_AT,
    dataAgeMs: 15_000,
    latestRthCandleAt: LATEST_AT,
    rthCandleCount: 6,
    warningCode: null,
  };

  const liveLevel = (value: number) => ({ value, state: "LIVE" as const });
  const sessionLevels: SpySessionLevelsResponse = {
    symbol: "SPY",
    currentMarketDate: MARKET_DATE,
    currentMarketDateHasDefinedSessionData: true,
    previousRthMarketDate: PREVIOUS_DATE,
    candleSourceState: "LIVE",
    premarketCoverageState: "COMPLETE",
    previousRthCoverageState: "COMPLETE",
    premarketHigh: liveLevel(753),
    premarketLow: liveLevel(749),
    previousDayHigh: liveLevel(756),
    previousDayLow: liveLevel(745),
    previousDayClose: liveLevel(750),
    fetchedAt: FETCHED_AT,
    dataAgeMs: 15_000,
    latestCandleAt: LATEST_AT,
    warningCode: null,
  };

  const gap: SpyRthGapResponse = {
    symbol: "SPY",
    metric: "RTH_GAP",
    currentMarketDate: MARKET_DATE,
    previousRthMarketDate: PREVIOUS_DATE,
    metricState: "LIVE",
    candleSourceState: "LIVE",
    currentRthOpen: 752,
    currentRthOpenAt: "2026-07-16T13:30:00.000Z",
    previousDayClose: 750,
    gapPoints: 2,
    gapPercent: 0.2666666667,
    direction: "UP",
    fillState: "UNFILLED",
    firstObservedFillCandleAt: null,
    currentRthCoverageState: "COMPLETE",
    previousRthCoverageState: "COMPLETE",
    fetchedAt: FETCHED_AT,
    dataAgeMs: 15_000,
    latestRthCandleAt: LATEST_AT,
    currentRthCandleCount: 6,
    warningCode: null,
  };

  const openingRange: SpyOpeningRangeResponse = {
    symbol: "SPY",
    metric: "OPENING_RANGE_15M",
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
  };

  const calls = [contract("CALL", 754), contract("CALL", 755)];
  const puts = [contract("PUT", 754), contract("PUT", 755)];
  const options: SpyZeroDteOptionsChainResponse = {
    symbol: "SPY",
    metric: "ZERO_DTE_OPTIONS_CHAIN",
    currentMarketDate: MARKET_DATE,
    requestedExpirationDate: MARKET_DATE,
    returnedExpirationDate: MARKET_DATE,
    metricState: "LIVE",
    sourceState: "LIVE",
    isDelayed: false,
    underlyingPrice: 754.5,
    underlyingPriceSource: "CHAIN_RESPONSE",
    calls,
    puts,
    requestedStrikeCount: 40,
    returnedUniqueStrikeCount: 2,
    callContractCount: 2,
    putContractCount: 2,
    minimumReturnedStrike: 754,
    maximumReturnedStrike: 755,
    providerContractCount: 4,
    totalContracts: 4,
    contractsWithBidAsk: 4,
    contractsWithGreeks: 4,
    contractsWithOpenInterest: 4,
    contractsWithVolume: 4,
    rejectedContractCount: 0,
    fetchedAt: FETCHED_AT,
    dataAgeMs: 15_000,
    latestOptionQuoteAt: LATEST_AT,
    latestOptionTradeAt: null,
    warningCode: null,
  };

  const expectedMove: SpyZeroDteExpectedMoveResponse = {
    symbol: "SPY",
    metric: "ZERO_DTE_ATM_IMPLIED_MOVE",
    methodology: "ATM_STRADDLE_MARK",
    currentMarketDate: MARKET_DATE,
    expirationDate: MARKET_DATE,
    metricState: "LIVE",
    sourceState: "LIVE",
    underlyingPrice: 754.5,
    underlyingPriceSource: "CHAIN_RESPONSE",
    atmStrike: 754,
    callContractSymbol: calls[0]!.contractSymbol,
    putContractSymbol: puts[0]!.contractSymbol,
    callMark: 1.05,
    putMark: 1.05,
    impliedMovePoints: 2.1,
    impliedMovePercent: 0.278329,
    upperImpliedMoveLevel: 756.6,
    lowerImpliedMoveLevel: 752.4,
    callQuoteAt: LATEST_AT,
    putQuoteAt: LATEST_AT,
    latestSelectedContractQuoteAt: LATEST_AT,
    chainFetchedAt: FETCHED_AT,
    fetchedAt: FETCHED_AT,
    dataAgeMs: 15_000,
    warningCode: null,
  };

  const gex: SpyZeroDteGexProxyResponse = {
    symbol: "SPY",
    metric: "ZERO_DTE_ATM_WINDOW_GEX_PROXY",
    methodology: "OI_WEIGHTED_GAMMA_PER_1PCT_MOVE",
    coverageScope: "RETURNED_CHAIN_WINDOW",
    currentMarketDate: MARKET_DATE,
    expirationDate: MARKET_DATE,
    metricState: "LIVE",
    sourceState: "LIVE",
    coverageState: "COMPLETE",
    underlyingPrice: 754.5,
    underlyingPriceSource: "CHAIN_RESPONSE",
    requestedStrikeCount: 40,
    returnedUniqueStrikeCount: 2,
    minimumReturnedStrike: 754,
    maximumReturnedStrike: 755,
    returnedWindowCallGammaExposure: 100,
    returnedWindowPutGammaExposureMagnitude: 80,
    returnedWindowNetGammaExposureProxy: 20,
    eligibleCallContractCount: 2,
    eligiblePutContractCount: 2,
    excludedCallContractCount: 0,
    excludedPutContractCount: 0,
    contractsMissingGamma: 0,
    contractsMissingOpenInterest: 0,
    contractsMissingMultiplier: 0,
    nonstandardContractsExcluded: 0,
    miniContractsExcluded: 0,
    invalidMultiplierContractsExcluded: 0,
    duplicateContractsExcluded: 0,
    outOfScopeContractsExcluded: 0,
    upstreamRejectedContractCount: 0,
    eligibleStrikeCount: 2,
    strikes: [
      { strikePrice: 754, callContractCount: 1, putContractCount: 1, callOpenInterest: 100, putOpenInterest: 100, callGammaExposure: 40, putGammaExposureMagnitude: 30, netGammaExposureProxy: 10 },
      { strikePrice: 755, callContractCount: 1, putContractCount: 1, callOpenInterest: 100, putOpenInterest: 100, callGammaExposure: 60, putGammaExposureMagnitude: 50, netGammaExposureProxy: 10 },
    ],
    latestOptionQuoteAt: LATEST_AT,
    chainFetchedAt: FETCHED_AT,
    fetchedAt: FETCHED_AT,
    dataAgeMs: 15_000,
    warningCode: null,
  };

  const dex: SpyZeroDteDexProxyResponse = {
    symbol: "SPY",
    metric: "ZERO_DTE_RETURNED_WINDOW_DEX_PROXY",
    methodology: "OI_WEIGHTED_DELTA_NOTIONAL",
    coverageScope: "RETURNED_CHAIN_WINDOW",
    currentMarketDate: MARKET_DATE,
    expirationDate: MARKET_DATE,
    metricState: "LIVE",
    sourceState: "LIVE",
    coverageState: "COMPLETE",
    underlyingPrice: 754.5,
    underlyingPriceSource: "CHAIN_RESPONSE",
    requestedStrikeCount: 40,
    returnedUniqueStrikeCount: 2,
    minimumReturnedStrike: 754,
    maximumReturnedStrike: 755,
    returnedWindowCallDeltaExposure: 100,
    returnedWindowPutDeltaExposureMagnitude: 80,
    returnedWindowNetDeltaExposureProxy: 20,
    eligibleCallContractCount: 2,
    eligiblePutContractCount: 2,
    excludedCallContractCount: 0,
    excludedPutContractCount: 0,
    contractsMissingDelta: 0,
    contractsWithInvalidDelta: 0,
    contractsMissingOpenInterest: 0,
    contractsMissingMultiplier: 0,
    nonstandardContractsExcluded: 0,
    miniContractsExcluded: 0,
    invalidMultiplierContractsExcluded: 0,
    duplicateContractsExcluded: 0,
    outOfScopeContractsExcluded: 0,
    upstreamRejectedContractCount: 0,
    eligibleStrikeCount: 2,
    strikes: [
      { strikePrice: 754, callContractCount: 1, putContractCount: 1, callOpenInterest: 100, putOpenInterest: 100, callDeltaExposure: 40, putDeltaExposureMagnitude: 30, netDeltaExposureProxy: 10 },
      { strikePrice: 755, callContractCount: 1, putContractCount: 1, callOpenInterest: 100, putOpenInterest: 100, callDeltaExposure: 60, putDeltaExposureMagnitude: 50, netDeltaExposureProxy: 10 },
    ],
    latestOptionQuoteAt: LATEST_AT,
    chainFetchedAt: FETCHED_AT,
    fetchedAt: FETCHED_AT,
    dataAgeMs: 15_000,
    warningCode: null,
  };

  return { quote, candles, sessionData, vwap, sessionLevels, gap, openingRange, options, expectedMove, gex, dex };
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

function component(response: ReturnType<typeof buildSpyZeroDteMarketContext>, name: string) {
  return response.components.find((item) => item.component === name)!;
}

test("healthy RTH inputs create a READY validated context", () => {
  const result = buildSpyZeroDteMarketContext(baseInputs(), NOW);
  assert.equal(result.product, "SPY_ZERO_DTE_MARKET_CONTEXT");
  assert.equal(result.contextState, "READY");
  assert.equal(result.components.length, 11);
});

test("assembledAt is assembly time and does not replace source timestamps", () => {
  const result = buildSpyZeroDteMarketContext(baseInputs(), NOW);
  assert.equal(result.assembledAt, new Date(NOW).toISOString());
  assert.equal(result.quote.fetchedAt, FETCHED_AT);
  assert.notEqual(result.assembledAt, result.quote.fetchedAt);
});

test("current New York date and most recent RTH session date are explicit", () => {
  const result = buildSpyZeroDteMarketContext(baseInputs(), NOW);
  assert.equal(result.currentMarketDate, MARKET_DATE);
  assert.equal(result.mostRecentRthSessionDate, MARKET_DATE);
});

test("most recent RTH date selects latest date with RTH evidence", () => {
  const inputs = baseInputs();
  inputs.sessionData.observedDates[1]!.rth = {
    ...inputs.sessionData.observedDates[1]!.rth,
    state: "UNAVAILABLE",
    candleCount: 0,
    firstCandleAt: null,
    lastCandleAt: null,
  };
  assert.equal(selectMostRecentRthSessionDate(inputs.sessionData), PREVIOUS_DATE);
});

test("focused candle summary preserves latest and previous candles", () => {
  const summary = summarizeSpyCandles(baseInputs().candles);
  assert.equal(summary.candleCount, 3);
  assert.equal(summary.sessionOpen, 752);
  assert.equal(summary.sessionHigh, 755);
  assert.equal(summary.sessionLow, 751);
  assert.equal(summary.latestCandle?.close, 754.5);
  assert.equal(summary.previousCandle?.close, 753.5);
});

test("context does not duplicate full candle, option, GEX, or DEX arrays", () => {
  const result = buildSpyZeroDteMarketContext(baseInputs(), NOW) as unknown as Record<string, unknown>;
  const options = result.options as Record<string, unknown>;
  const gex = result.gex as Record<string, unknown>;
  const dex = result.dex as Record<string, unknown>;
  assert.equal("calls" in options, false);
  assert.equal("puts" in options, false);
  assert.equal("strikes" in gex, false);
  assert.equal("strikes" in dex, false);
});

test("Options ATM summary uses deterministic lower-strike tie break", () => {
  const result = buildSpyZeroDteMarketContext(baseInputs(), NOW);
  assert.equal(result.options.atmStrike, 754);
});

test("Quote values and provenance are preserved without recalculation", () => {
  const result = buildSpyZeroDteMarketContext(baseInputs(), NOW);
  assert.equal(result.quote.lastPrice, 754.5);
  assert.equal(result.quote.quoteTimestamp, LATEST_AT);
  assert.equal(result.quote.sourceState, "LIVE");
});

test("VWAP summary preserves native session date and provider timestamp", () => {
  const result = buildSpyZeroDteMarketContext(baseInputs(), NOW);
  assert.equal(result.vwap.marketDate, MARKET_DATE);
  assert.equal(result.vwap.latestVwap, 753.2);
  assert.equal(result.vwap.latestRthCandleAt, LATEST_AT);
});

test("GEX and DEX summaries preserve methodology and returned-window totals", () => {
  const result = buildSpyZeroDteMarketContext(baseInputs(), NOW);
  assert.equal(result.gex.methodology, "OI_WEIGHTED_GAMMA_PER_1PCT_MOVE");
  assert.equal(result.gex.returnedWindowNetGammaExposureProxy, 20);
  assert.equal(result.dex.methodology, "OI_WEIGHTED_DELTA_NOTIONAL");
  assert.equal(result.dex.returnedWindowNetDeltaExposureProxy, 20);
});

test("MOCK required Quote makes the context UNAVAILABLE", () => {
  const inputs = baseInputs();
  inputs.quote = { ...inputs.quote, sourceState: "MOCK", warningCode: "NOT_CONNECTED" };
  const result = buildSpyZeroDteMarketContext(inputs, NOW);
  assert.equal(result.contextState, "UNAVAILABLE");
  assert.equal(result.warningCode, "AUTH_REQUIRED");
});

test("STALE required Quote produces DEGRADED with stale warning", () => {
  const inputs = baseInputs();
  inputs.quote = { ...inputs.quote, sourceState: "STALE" };
  const result = buildSpyZeroDteMarketContext(inputs, NOW);
  assert.equal(result.contextState, "DEGRADED");
  assert.equal(result.warningCode, "RETAINED_STALE_COMPONENTS");
});

test("PARTIAL GEX coverage degrades but does not erase healthy components", () => {
  const inputs = baseInputs();
  inputs.gex = { ...inputs.gex, coverageState: "PARTIAL", warningCode: "PARTIAL_GEX_INPUTS" };
  const result = buildSpyZeroDteMarketContext(inputs, NOW);
  assert.equal(result.contextState, "DEGRADED");
  assert.equal(component(result, "GEX").status, "PARTIAL");
  assert.equal(result.quote.lastPrice, 754.5);
});

test("no current-date expiration makes all Options-derived components NOT_APPLICABLE", () => {
  const inputs = baseInputs();
  inputs.options = {
    ...inputs.options,
    returnedExpirationDate: null,
    metricState: "UNAVAILABLE",
    sourceState: "LIVE",
    calls: [],
    puts: [],
    returnedUniqueStrikeCount: 0,
    callContractCount: 0,
    putContractCount: 0,
    minimumReturnedStrike: null,
    maximumReturnedStrike: null,
    totalContracts: 0,
    warningCode: "NO_CURRENT_DATE_EXPIRATION",
  };
  const result = buildSpyZeroDteMarketContext(inputs, NOW);
  for (const name of ["OPTIONS_CHAIN", "EXPECTED_MOVE", "GEX", "DEX"]) {
    assert.equal(component(result, name).status, "NOT_APPLICABLE");
  }
});

test("pre-open Opening Range is NOT_APPLICABLE rather than a failure", () => {
  const inputs = baseInputs();
  inputs.openingRange = {
    ...inputs.openingRange,
    metricState: "UNAVAILABLE",
    phase: "PRE_OPEN",
    openingRangeHigh: null,
    openingRangeLow: null,
    openingRangeStartAt: null,
    openingRangeEndAt: null,
    openingRangeCandleCount: 0,
    coverageState: "UNAVAILABLE",
    firstOpeningRangeCandleAt: null,
    latestOpeningRangeCandleAt: null,
    warningCode: null,
  };
  const result = buildSpyZeroDteMarketContext(inputs, Date.parse("2026-07-16T13:00:00.000Z"));
  assert.equal(component(result, "OPENING_RANGE").status, "NOT_APPLICABLE");
});

test("forming Opening Range is PARTIAL and does not become an unavailable provider failure", () => {
  const inputs = baseInputs();
  inputs.openingRange = {
    ...inputs.openingRange,
    metricState: "UNAVAILABLE",
    phase: "FORMING",
    openingRangeHigh: null,
    openingRangeLow: null,
    openingRangeCandleCount: 1,
    coverageState: "PARTIAL",
    warningCode: "OPENING_RANGE_INCOMPLETE",
  };
  const result = buildSpyZeroDteMarketContext(inputs, Date.parse("2026-07-16T13:35:00.000Z"));
  assert.equal(component(result, "OPENING_RANGE").status, "PARTIAL");
});

test("Options dependency group identifies shared Chain provenance", () => {
  const result = buildSpyZeroDteMarketContext(baseInputs(), NOW);
  for (const name of ["OPTIONS_CHAIN", "EXPECTED_MOVE", "GEX", "DEX"]) {
    assert.equal(component(result, name).dependencyGroup, "OPTIONS_CHAIN");
  }
});

test("bounded-candle dependency group identifies related session analytics", () => {
  const result = buildSpyZeroDteMarketContext(baseInputs(), NOW);
  for (const name of ["SESSION_DATA", "SESSION_LEVELS", "GAP", "OPENING_RANGE"]) {
    assert.equal(component(result, name).dependencyGroup, "BOUNDED_CANDLES");
  }
});

test("native warning codes are preserved in componentWarnings", () => {
  const inputs = baseInputs();
  inputs.options = { ...inputs.options, warningCode: "PARTIAL_CONTRACT_DATA" };
  const result = buildSpyZeroDteMarketContext(inputs, NOW);
  assert.ok(result.componentWarnings.some((item) => item.component === "OPTIONS_CHAIN" && item.warningCode === "PARTIAL_CONTRACT_DATA"));
});

test("legitimate zero analytics values remain zero", () => {
  const inputs = baseInputs();
  inputs.gap = { ...inputs.gap, currentRthOpen: 750, gapPoints: 0, gapPercent: 0, direction: "FLAT", fillState: "NOT_APPLICABLE" };
  const result = buildSpyZeroDteMarketContext(inputs, NOW);
  assert.equal(result.gap.gapPoints, 0);
  assert.equal(result.gap.gapPercent, 0);
});

test("overnight context may use prior RTH date without date inconsistency", () => {
  const inputs = baseInputs();
  inputs.sessionData.currentObservedMarketDate = PREVIOUS_DATE;
  inputs.sessionData.observedDates = [inputs.sessionData.observedDates[0]!];
  const overnight = Date.parse("2026-07-16T05:30:00.000Z");
  const result = buildSpyZeroDteMarketContext(inputs, overnight);
  assert.equal(result.currentMarketDate, MARKET_DATE);
  assert.equal(result.mostRecentRthSessionDate, PREVIOUS_DATE);
  assert.equal(result.session.currentSessionWindow, "CLOSED");
  assert.equal(component(result, "CANDLES").status, "NOT_APPLICABLE");
});


test("active-session prior-date candles degrade instead of masquerading as current", () => {
  const inputs = baseInputs();
  inputs.candles.candles = inputs.candles.candles.map((item) => ({
    ...item,
    timestamp: item.timestamp - 24 * 60 * 60 * 1000,
  }));
  inputs.candles.latestCandleAt = "2026-07-15T13:55:00.000Z";
  inputs.sessionData.currentObservedMarketDate = PREVIOUS_DATE;
  const result = buildSpyZeroDteMarketContext(inputs, NOW);
  assert.equal(component(result, "CANDLES").status, "UNAVAILABLE");
  assert.equal(component(result, "SESSION_DATA").status, "UNAVAILABLE");
  assert.equal(result.contextState, "DEGRADED");
});

test("holiday-like no-expiration condition makes active-session data conditionally not applicable", () => {
  const inputs = baseInputs();
  inputs.sessionData.currentObservedMarketDate = PREVIOUS_DATE;
  inputs.options = {
    ...inputs.options,
    returnedExpirationDate: null,
    metricState: "UNAVAILABLE",
    sourceState: "LIVE",
    calls: [],
    puts: [],
    returnedUniqueStrikeCount: 0,
    callContractCount: 0,
    putContractCount: 0,
    minimumReturnedStrike: null,
    maximumReturnedStrike: null,
    totalContracts: 0,
    warningCode: "NO_CURRENT_DATE_EXPIRATION",
  };
  const result = buildSpyZeroDteMarketContext(inputs, NOW);
  assert.equal(component(result, "CANDLES").status, "NOT_APPLICABLE");
  assert.equal(component(result, "SESSION_DATA").status, "NOT_APPLICABLE");
  assert.equal(component(result, "VWAP").status, "NOT_APPLICABLE");
  assert.equal(component(result, "GAP").status, "NOT_APPLICABLE");
});

test("RTH makes Candles, Session Data, and VWAP conditionally required", () => {
  const result = buildSpyZeroDteMarketContext(baseInputs(), NOW);
  for (const name of ["CANDLES", "SESSION_DATA", "VWAP"]) {
    const item = component(result, name);
    assert.equal(item.requirement, "SESSION_CONDITIONALLY_REQUIRED");
    assert.equal(item.applicable, true);
  }
});

test("outside RTH VWAP is NOT_APPLICABLE for readiness", () => {
  const afterHours = Date.parse("2026-07-16T21:00:00.000Z");
  const result = buildSpyZeroDteMarketContext(baseInputs(), afterHours);
  assert.equal(component(result, "VWAP").status, "NOT_APPLICABLE");
});

test("deriveMarketContextState treats only an unavailable required Quote as terminal", () => {
  const components: MarketContextComponentStatus[] = [
    {
      component: "QUOTE",
      status: "UNAVAILABLE",
      requirement: "REQUIRED",
      applicable: true,
      dependencyGroup: null,
      sourceState: "MOCK",
      metricState: null,
      coverageState: null,
      currentMarketDate: MARKET_DATE,
      sessionDate: null,
      expirationDate: null,
      latestDataAt: null,
      fetchedAt: FETCHED_AT,
      dataAgeMs: 0,
      warningCode: "NOT_CONNECTED",
    },
  ];
  assert.deepEqual(deriveMarketContextState(components), {
    contextState: "UNAVAILABLE",
    warningCode: "AUTH_REQUIRED",
  });
});

test("response contains no bias, confidence, trade plan, or recommendation fields", () => {
  const result = buildSpyZeroDteMarketContext(baseInputs(), NOW) as unknown as Record<string, unknown>;
  for (const key of ["bias", "confidence", "tradePlan", "recommendation", "signal"]) {
    assert.equal(key in result, false);
  }
});

console.log(`\n${passed} passed, ${failed} failed (${passed + failed} total)`);
if (failed > 0) process.exit(1);
