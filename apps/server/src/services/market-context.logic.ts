import {
  SpyZeroDteMarketContextResponseSchema,
  selectAtmStrike,
  type MarketContextComponent,
  type MarketContextComponentStatus,
  type MarketContextComponentStatusValue,
  type MarketContextRequirement,
  type MarketContextSessionWindow,
  type MarketContextWarningCode,
  type SpyCandleResponse,
  type SpyOpeningRangeResponse,
  type SpyQuote,
  type SpyRthGapResponse,
  type SpyRthVwapResponse,
  type SpySessionDataFoundationResponse,
  type SpySessionLevelsResponse,
  type SpyZeroDteDexProxyResponse,
  type SpyZeroDteExpectedMoveResponse,
  type SpyZeroDteGexProxyResponse,
  type SpyZeroDteMarketContextResponse,
  type SpyZeroDteOptionsChainResponse,
} from "@spy-copilot/shared";
import {
  classifyMarketSession,
  getObservedMarketDate,
} from "./session-data.logic";
import { deriveSpyZeroDteExposureStructure } from "./spy-exposure-structure.logic";

export interface SpyMarketContextInputs {
  quote: SpyQuote;
  candles: SpyCandleResponse;
  sessionData: SpySessionDataFoundationResponse;
  vwap: SpyRthVwapResponse;
  sessionLevels: SpySessionLevelsResponse;
  gap: SpyRthGapResponse;
  openingRange: SpyOpeningRangeResponse;
  options: SpyZeroDteOptionsChainResponse;
  expectedMove: SpyZeroDteExpectedMoveResponse;
  gex: SpyZeroDteGexProxyResponse;
  dex: SpyZeroDteDexProxyResponse;
}

type DependencyGroup = "OPTIONS_CHAIN" | "BOUNDED_CANDLES" | null;

interface ComponentDescriptor {
  component: MarketContextComponent;
  requirement: MarketContextRequirement;
  applicable: boolean;
  dependencyGroup: DependencyGroup;
  sourceState: string | null;
  metricState: string | null;
  coverageState: string | null;
  currentMarketDate: string | null;
  sessionDate: string | null;
  expirationDate: string | null;
  latestDataAt: string | null;
  fetchedAt: string | null;
  dataAgeMs: number | null;
  warningCode: string | null;
  status: MarketContextComponentStatusValue;
}

function isWeekdayMarketDate(marketDate: string): boolean {
  const [year, month, day] = marketDate.split("-").map(Number);
  if (!year || !month || !day) return false;
  const weekday = new Date(Date.UTC(year, month - 1, day)).getUTCDay();
  return weekday !== 0 && weekday !== 6;
}

function currentSessionWindow(nowMs: number, marketDate: string): MarketContextSessionWindow {
  if (!isWeekdayMarketDate(marketDate)) return "CLOSED";
  return classifyMarketSession(nowMs) ?? "CLOSED";
}

export function selectMostRecentRthSessionDate(
  sessionData: SpySessionDataFoundationResponse,
): string | null {
  const dates = sessionData.observedDates
    .filter((item) => item.rth.candleCount > 0)
    .map((item) => item.marketDate)
    .sort();
  return dates[dates.length - 1] ?? null;
}

export function summarizeSpyCandles(candles: SpyCandleResponse, nowMs = Date.now()) {
  const sorted = [...candles.candles].sort((a, b) => a.timestamp - b.timestamp);
  const latest = sorted[sorted.length - 1] ?? null;
  const previous = sorted[sorted.length - 2] ?? null;
  const marketDate = latest ? getObservedMarketDate(latest.timestamp) : null;
  const sessionOpen = sorted[0]?.open ?? null;
  const sessionHigh = sorted.length > 0 ? Math.max(...sorted.map((item) => item.high)) : null;
  const sessionLow = sorted.length > 0 ? Math.min(...sorted.map((item) => item.low)) : null;
  const currentMarketDate = getObservedMarketDate(nowMs);
  const recentCompletedRthCandles = sorted
    .filter((item) =>
      item.timestamp + 5 * 60_000 <= nowMs &&
      getObservedMarketDate(item.timestamp) === currentMarketDate &&
      classifyMarketSession(item.timestamp) === "RTH"
    )
    .slice(-12);

  return {
    marketDate,
    timeframe: "5m" as const,
    sourceState: candles.sourceState,
    candleCount: sorted.length,
    sessionOpen,
    sessionHigh,
    sessionLow,
    latestCandle: latest,
    previousCandle: previous,
    latestCandleAt: candles.latestCandleAt,
    recentCompletedRthCandles,
    fetchedAt: candles.fetchedAt,
    dataAgeMs: candles.dataAgeMs,
    warningCode: candles.warningCode,
  };
}

export const MAXIMUM_MARKET_STRUCTURE_SKEW_MS = 30_000;
export const MAXIMUM_EXECUTION_SKEW_MS = 45_000;

function parsedTimestamp(value: string | null | undefined): number | null {
  if (!value) return null;
  const parsed = Date.parse(value);
  return Number.isNaN(parsed) ? null : parsed;
}

function timestampSkew(values: readonly (number | null)[]): number | null {
  const available = values.filter((value): value is number => value !== null);
  if (available.length !== values.length || available.length < 2) return null;
  return Math.max(...available) - Math.min(...available);
}

export function buildMarketContextSnapshotIntegrity(
  inputs: SpyMarketContextInputs,
  nowMs = Date.now(),
) {
  const assembledAt = new Date(nowMs).toISOString();
  const quoteAt = parsedTimestamp(inputs.quote.fetchedAt);
  const candlesAt = parsedTimestamp(inputs.candles.fetchedAt);
  const optionsUsable =
    inputs.options.sourceState !== "UNAVAILABLE" &&
    inputs.options.metricState !== "UNAVAILABLE" &&
    inputs.options.sourceState !== "MOCK";
  const optionsAt = optionsUsable ? parsedTimestamp(inputs.options.fetchedAt) : null;
  const marketStructureSkewMilliseconds = timestampSkew([quoteAt, candlesAt]);
  const executionSkewMilliseconds = optionsUsable
    ? timestampSkew([quoteAt, candlesAt, optionsAt])
    : marketStructureSkewMilliseconds;
  const warningCodes: Array<
    | "QUOTE_TIMESTAMP_UNAVAILABLE"
    | "CANDLE_TIMESTAMP_UNAVAILABLE"
    | "OPTIONS_TIMESTAMP_UNAVAILABLE"
    | "MARKET_STRUCTURE_SKEW_EXCEEDED"
    | "EXECUTION_SKEW_EXCEEDED"
    | "MOCK_SOURCE_PRESENT"
  > = [];

  if (quoteAt === null) warningCodes.push("QUOTE_TIMESTAMP_UNAVAILABLE");
  if (candlesAt === null) warningCodes.push("CANDLE_TIMESTAMP_UNAVAILABLE");
  if (optionsUsable && optionsAt === null) warningCodes.push("OPTIONS_TIMESTAMP_UNAVAILABLE");
  if (inputs.quote.sourceState === "MOCK" || inputs.candles.sourceState === "MOCK") {
    warningCodes.push("MOCK_SOURCE_PRESENT");
  }
  if (
    marketStructureSkewMilliseconds !== null &&
    marketStructureSkewMilliseconds > MAXIMUM_MARKET_STRUCTURE_SKEW_MS
  ) {
    warningCodes.push("MARKET_STRUCTURE_SKEW_EXCEEDED");
  }
  if (
    executionSkewMilliseconds !== null &&
    executionSkewMilliseconds > MAXIMUM_EXECUTION_SKEW_MS
  ) {
    warningCodes.push("EXECUTION_SKEW_EXCEEDED");
  }

  const unavailable =
    quoteAt === null ||
    candlesAt === null ||
    inputs.quote.sourceState === "MOCK" ||
    inputs.candles.sourceState === "MOCK";
  const skewed =
    !unavailable &&
    (marketStructureSkewMilliseconds === null ||
      marketStructureSkewMilliseconds > MAXIMUM_MARKET_STRUCTURE_SKEW_MS ||
      (optionsUsable &&
        (executionSkewMilliseconds === null ||
          executionSkewMilliseconds > MAXIMUM_EXECUTION_SKEW_MS)));

  return {
    methodologyVersion: "SNAPSHOT_INTEGRITY_V1" as const,
    snapshotId: [
      "SPY",
      getObservedMarketDate(nowMs),
      inputs.quote.fetchedAt,
      inputs.candles.fetchedAt,
      optionsUsable ? inputs.options.fetchedAt : "NO_OPTIONS",
    ].join("|"),
    assembledAt,
    quoteFetchedAt: quoteAt === null ? null : inputs.quote.fetchedAt,
    candlesFetchedAt: candlesAt === null ? null : inputs.candles.fetchedAt,
    optionsChainFetchedAt: optionsAt === null ? null : inputs.options.fetchedAt,
    marketStructureSkewMilliseconds,
    maximumMarketStructureSkewMilliseconds: MAXIMUM_MARKET_STRUCTURE_SKEW_MS as 30_000,
    executionSkewMilliseconds,
    maximumExecutionSkewMilliseconds: MAXIMUM_EXECUTION_SKEW_MS as 45_000,
    optionsIncludedInExecutionSkew: optionsUsable,
    state: unavailable ? ("UNAVAILABLE" as const) : skewed ? ("SKEWED" as const) : ("COHERENT" as const),
    warningCodes,
  };
}

function sourceStatus(sourceState: string | null): MarketContextComponentStatusValue {
  if (sourceState === "LIVE") return "AVAILABLE";
  if (sourceState === "STALE") return "STALE";
  return "UNAVAILABLE";
}

function metricStatus(
  metricState: string | null,
  sourceState: string | null,
  coverageState: string | null = null,
): MarketContextComponentStatusValue {
  if (metricState === "UNAVAILABLE" || metricState === "MOCK") return "UNAVAILABLE";
  if (metricState === "STALE" || sourceState === "STALE") return "STALE";
  if (coverageState === "PARTIAL" || coverageState === "UNKNOWN") return "PARTIAL";
  if (coverageState === "UNAVAILABLE") return "UNAVAILABLE";
  if (metricState === "LIVE" || sourceState === "LIVE") return "AVAILABLE";
  return "UNAVAILABLE";
}

function buildDescriptors(
  inputs: SpyMarketContextInputs,
  nowMs: number,
): ComponentDescriptor[] {
  const currentMarketDate = getObservedMarketDate(nowMs);
  const sessionWindow = currentSessionWindow(nowMs, currentMarketDate);
  const weekday = isWeekdayMarketDate(currentMarketDate);
  const optionsNotApplicable = inputs.options.warningCode === "NO_CURRENT_DATE_EXPIRATION";
  const holidayLike =
    weekday &&
    inputs.sessionData.currentObservedMarketDate !== currentMarketDate &&
    optionsNotApplicable;
  const activeDefinedSession =
    weekday &&
    !holidayLike &&
    ["PREMARKET", "RTH", "AFTER_HOURS"].includes(sessionWindow);
  const duringRth = weekday && !holidayLike && sessionWindow === "RTH";
  const openingRangeApplicable =
    inputs.openingRange.phase !== "PRE_OPEN" && weekday && !holidayLike;
  const gapApplicable =
    weekday && !holidayLike && ["RTH", "AFTER_HOURS"].includes(sessionWindow);
  const optionsApplicable = weekday && !optionsNotApplicable;

  const levelsAvailable = [
    inputs.sessionLevels.premarketHigh,
    inputs.sessionLevels.premarketLow,
    inputs.sessionLevels.previousDayHigh,
    inputs.sessionLevels.previousDayLow,
    inputs.sessionLevels.previousDayClose,
  ].filter((item) => item.state !== "UNAVAILABLE");
  let levelsStatus = sourceStatus(inputs.sessionLevels.candleSourceState);
  if (levelsStatus === "AVAILABLE") {
    if (levelsAvailable.length === 0) levelsStatus = "UNAVAILABLE";
    else if (
      levelsAvailable.length < 5 ||
      inputs.sessionLevels.premarketCoverageState === "PARTIAL" ||
      inputs.sessionLevels.previousRthCoverageState === "PARTIAL"
    ) {
      levelsStatus = "PARTIAL";
    }
  }

  let openingRangeStatus: MarketContextComponentStatusValue;
  if (!openingRangeApplicable) openingRangeStatus = "NOT_APPLICABLE";
  else if (inputs.openingRange.phase === "FORMING") openingRangeStatus = "PARTIAL";
  else {
    openingRangeStatus = metricStatus(
      inputs.openingRange.metricState,
      inputs.openingRange.candleSourceState,
      inputs.openingRange.coverageState,
    );
  }

  let optionsStatus = metricStatus(inputs.options.metricState, inputs.options.sourceState);
  if (!optionsApplicable) optionsStatus = "NOT_APPLICABLE";
  else if (optionsStatus === "AVAILABLE" && inputs.options.warningCode === "PARTIAL_CONTRACT_DATA") {
    optionsStatus = "PARTIAL";
  }

  const candleMarketDate = summarizeSpyCandles(inputs.candles).marketDate;
  const candleStatus = activeDefinedSession
    ? candleMarketDate === currentMarketDate
      ? sourceStatus(inputs.candles.sourceState)
      : "UNAVAILABLE"
    : "NOT_APPLICABLE";
  const sessionDataStatus = activeDefinedSession
    ? inputs.sessionData.currentObservedMarketDate === currentMarketDate
      ? sourceStatus(inputs.sessionData.sourceState)
      : "UNAVAILABLE"
    : "NOT_APPLICABLE";

  const expectedStatus = optionsApplicable
    ? metricStatus(inputs.expectedMove.metricState, inputs.expectedMove.sourceState)
    : "NOT_APPLICABLE";
  const gexStatus = optionsApplicable
    ? metricStatus(inputs.gex.metricState, inputs.gex.sourceState, inputs.gex.coverageState)
    : "NOT_APPLICABLE";
  const dexStatus = optionsApplicable
    ? metricStatus(inputs.dex.metricState, inputs.dex.sourceState, inputs.dex.coverageState)
    : "NOT_APPLICABLE";

  return [
    {
      component: "QUOTE",
      requirement: "REQUIRED",
      applicable: true,
      dependencyGroup: null,
      sourceState: inputs.quote.sourceState,
      metricState: null,
      coverageState: null,
      currentMarketDate,
      sessionDate: null,
      expirationDate: null,
      latestDataAt: inputs.quote.quoteTimestamp,
      fetchedAt: inputs.quote.fetchedAt,
      dataAgeMs: inputs.quote.dataAgeMs,
      warningCode: inputs.quote.warningCode,
      status: sourceStatus(inputs.quote.sourceState),
    },
    {
      component: "CANDLES",
      requirement: "SESSION_CONDITIONALLY_REQUIRED",
      applicable: activeDefinedSession,
      dependencyGroup: null,
      sourceState: inputs.candles.sourceState,
      metricState: null,
      coverageState: null,
      currentMarketDate,
      sessionDate: candleMarketDate,
      expirationDate: null,
      latestDataAt: inputs.candles.latestCandleAt,
      fetchedAt: inputs.candles.fetchedAt,
      dataAgeMs: inputs.candles.dataAgeMs,
      warningCode: inputs.candles.warningCode,
      status: candleStatus,
    },
    {
      component: "SESSION_DATA",
      requirement: "SESSION_CONDITIONALLY_REQUIRED",
      applicable: activeDefinedSession,
      dependencyGroup: "BOUNDED_CANDLES",
      sourceState: inputs.sessionData.sourceState,
      metricState: null,
      coverageState: null,
      currentMarketDate,
      sessionDate: inputs.sessionData.currentObservedMarketDate,
      expirationDate: null,
      latestDataAt: inputs.sessionData.lastCandleAt,
      fetchedAt: inputs.sessionData.fetchedAt,
      dataAgeMs: inputs.sessionData.dataAgeMs,
      warningCode: inputs.sessionData.warningCode,
      status: sessionDataStatus,
    },
    {
      component: "VWAP",
      requirement: "SESSION_CONDITIONALLY_REQUIRED",
      applicable: duringRth,
      dependencyGroup: null,
      sourceState: inputs.vwap.candleSourceState,
      metricState: inputs.vwap.metricState,
      coverageState: null,
      currentMarketDate,
      sessionDate: inputs.vwap.marketDate,
      expirationDate: null,
      latestDataAt: inputs.vwap.latestRthCandleAt,
      fetchedAt: inputs.vwap.fetchedAt,
      dataAgeMs: inputs.vwap.dataAgeMs,
      warningCode: inputs.vwap.warningCode,
      status: duringRth
        ? metricStatus(inputs.vwap.metricState, inputs.vwap.candleSourceState)
        : "NOT_APPLICABLE",
    },
    {
      component: "SESSION_LEVELS",
      requirement: "OPTIONAL_ENRICHMENT",
      applicable: true,
      dependencyGroup: "BOUNDED_CANDLES",
      sourceState: inputs.sessionLevels.candleSourceState,
      metricState: null,
      coverageState: `${inputs.sessionLevels.premarketCoverageState}/${inputs.sessionLevels.previousRthCoverageState}`,
      currentMarketDate: inputs.sessionLevels.currentMarketDate,
      sessionDate: inputs.sessionLevels.previousRthMarketDate,
      expirationDate: null,
      latestDataAt: inputs.sessionLevels.latestCandleAt,
      fetchedAt: inputs.sessionLevels.fetchedAt,
      dataAgeMs: inputs.sessionLevels.dataAgeMs,
      warningCode: inputs.sessionLevels.warningCode,
      status: levelsStatus,
    },
    {
      component: "GAP",
      requirement: "OPTIONAL_ENRICHMENT",
      applicable: gapApplicable,
      dependencyGroup: "BOUNDED_CANDLES",
      sourceState: inputs.gap.candleSourceState,
      metricState: inputs.gap.metricState,
      coverageState: `${inputs.gap.currentRthCoverageState}/${inputs.gap.previousRthCoverageState}`,
      currentMarketDate: inputs.gap.currentMarketDate,
      sessionDate: inputs.gap.previousRthMarketDate,
      expirationDate: null,
      latestDataAt: inputs.gap.latestRthCandleAt,
      fetchedAt: inputs.gap.fetchedAt,
      dataAgeMs: inputs.gap.dataAgeMs,
      warningCode: inputs.gap.warningCode,
      status: gapApplicable
        ? metricStatus(inputs.gap.metricState, inputs.gap.candleSourceState)
        : "NOT_APPLICABLE",
    },
    {
      component: "OPENING_RANGE",
      requirement: "OPTIONAL_ENRICHMENT",
      applicable: openingRangeApplicable,
      dependencyGroup: "BOUNDED_CANDLES",
      sourceState: inputs.openingRange.candleSourceState,
      metricState: inputs.openingRange.metricState,
      coverageState: inputs.openingRange.coverageState,
      currentMarketDate: inputs.openingRange.currentMarketDate,
      sessionDate: inputs.openingRange.currentMarketDate,
      expirationDate: null,
      latestDataAt: inputs.openingRange.latestOpeningRangeCandleAt,
      fetchedAt: inputs.openingRange.fetchedAt,
      dataAgeMs: inputs.openingRange.dataAgeMs,
      warningCode: inputs.openingRange.warningCode,
      status: openingRangeStatus,
    },
    {
      component: "OPTIONS_CHAIN",
      requirement: "OPTIONAL_ENRICHMENT",
      applicable: optionsApplicable,
      dependencyGroup: "OPTIONS_CHAIN",
      sourceState: inputs.options.sourceState,
      metricState: inputs.options.metricState,
      coverageState: null,
      currentMarketDate: inputs.options.currentMarketDate,
      sessionDate: null,
      expirationDate: inputs.options.returnedExpirationDate,
      latestDataAt: inputs.options.latestOptionQuoteAt,
      fetchedAt: inputs.options.fetchedAt,
      dataAgeMs: inputs.options.dataAgeMs,
      warningCode: inputs.options.warningCode,
      status: optionsStatus,
    },
    {
      component: "EXPECTED_MOVE",
      requirement: "OPTIONAL_ENRICHMENT",
      applicable: optionsApplicable,
      dependencyGroup: "OPTIONS_CHAIN",
      sourceState: inputs.expectedMove.sourceState,
      metricState: inputs.expectedMove.metricState,
      coverageState: null,
      currentMarketDate: inputs.expectedMove.currentMarketDate,
      sessionDate: null,
      expirationDate: inputs.expectedMove.expirationDate,
      latestDataAt: inputs.expectedMove.latestSelectedContractQuoteAt,
      fetchedAt: inputs.expectedMove.fetchedAt,
      dataAgeMs: inputs.expectedMove.dataAgeMs,
      warningCode: inputs.expectedMove.warningCode,
      status: expectedStatus,
    },
    {
      component: "GEX",
      requirement: "OPTIONAL_ENRICHMENT",
      applicable: optionsApplicable,
      dependencyGroup: "OPTIONS_CHAIN",
      sourceState: inputs.gex.sourceState,
      metricState: inputs.gex.metricState,
      coverageState: inputs.gex.coverageState,
      currentMarketDate: inputs.gex.currentMarketDate,
      sessionDate: null,
      expirationDate: inputs.gex.expirationDate,
      latestDataAt: inputs.gex.latestOptionQuoteAt,
      fetchedAt: inputs.gex.fetchedAt,
      dataAgeMs: inputs.gex.dataAgeMs,
      warningCode: inputs.gex.warningCode,
      status: gexStatus,
    },
    {
      component: "DEX",
      requirement: "OPTIONAL_ENRICHMENT",
      applicable: optionsApplicable,
      dependencyGroup: "OPTIONS_CHAIN",
      sourceState: inputs.dex.sourceState,
      metricState: inputs.dex.metricState,
      coverageState: inputs.dex.coverageState,
      currentMarketDate: inputs.dex.currentMarketDate,
      sessionDate: null,
      expirationDate: inputs.dex.expirationDate,
      latestDataAt: inputs.dex.latestOptionQuoteAt,
      fetchedAt: inputs.dex.fetchedAt,
      dataAgeMs: inputs.dex.dataAgeMs,
      warningCode: inputs.dex.warningCode,
      status: dexStatus,
    },
  ];
}

export function deriveMarketContextState(
  components: readonly MarketContextComponentStatus[],
): { contextState: "READY" | "DEGRADED" | "UNAVAILABLE"; warningCode: MarketContextWarningCode | null } {
  const quote = components.find((item) => item.component === "QUOTE");
  if (!quote || quote.status === "UNAVAILABLE") {
    const authWarnings = new Set([
      "NOT_CONNECTED",
      "AUTH_EXPIRED",
      "RECONNECT_REQUIRED",
      "AUTH_REQUIRED",
      "DATABASE_ERROR",
    ]);
    return {
      contextState: "UNAVAILABLE",
      warningCode: quote?.warningCode && authWarnings.has(quote.warningCode)
        ? "AUTH_REQUIRED"
        : "CURRENT_PRICE_UNAVAILABLE",
    };
  }

  const applicable = components.filter((item) => item.applicable);
  const degraded = applicable.some((item) => item.status !== "AVAILABLE");
  if (!degraded) return { contextState: "READY", warningCode: null };

  const hasStale = applicable.some((item) => item.status === "STALE");
  return {
    contextState: "DEGRADED",
    warningCode: hasStale ? "RETAINED_STALE_COMPONENTS" : "PARTIAL_MARKET_CONTEXT",
  };
}

function toComponentStatus(descriptor: ComponentDescriptor): MarketContextComponentStatus {
  return {
    component: descriptor.component,
    status: descriptor.status,
    requirement: descriptor.requirement,
    applicable: descriptor.applicable,
    dependencyGroup: descriptor.dependencyGroup,
    sourceState: descriptor.sourceState,
    metricState: descriptor.metricState,
    coverageState: descriptor.coverageState,
    currentMarketDate: descriptor.currentMarketDate,
    sessionDate: descriptor.sessionDate,
    expirationDate: descriptor.expirationDate,
    latestDataAt: descriptor.latestDataAt,
    fetchedAt: descriptor.fetchedAt,
    dataAgeMs: descriptor.dataAgeMs,
    warningCode: descriptor.warningCode,
  };
}

export function buildSpyZeroDteMarketContext(
  inputs: SpyMarketContextInputs,
  nowMs = Date.now(),
): SpyZeroDteMarketContextResponse {
  const currentMarketDate = getObservedMarketDate(nowMs);
  const sessionWindow = currentSessionWindow(nowMs, currentMarketDate);
  const mostRecentRthSessionDate = selectMostRecentRthSessionDate(inputs.sessionData);
  const descriptors = buildDescriptors(inputs, nowMs);
  const components = descriptors.map(toComponentStatus);
  const { contextState, warningCode } = deriveMarketContextState(components);
  const componentWarnings = components
    .filter((item) => item.warningCode !== null)
    .map((item) => ({
      component: item.component,
      warningCode: item.warningCode!,
      dependencyGroup: item.dependencyGroup,
    }));

  const strikes = [...inputs.options.calls, ...inputs.options.puts].map((item) => item.strikePrice);
  const atmStrike = selectAtmStrike(strikes, inputs.options.underlyingPrice);
  const candleSummary = summarizeSpyCandles(inputs.candles, nowMs);
  const snapshotIntegrity = buildMarketContextSnapshotIntegrity(inputs, nowMs);
  const exposureStructure = deriveSpyZeroDteExposureStructure(
    inputs.gex,
    inputs.dex,
    nowMs,
  );

  return SpyZeroDteMarketContextResponseSchema.parse({
    symbol: "SPY",
    product: "SPY_ZERO_DTE_MARKET_CONTEXT",
    currentMarketDate,
    mostRecentRthSessionDate,
    assembledAt: new Date(nowMs).toISOString(),
    snapshotIntegrity,
    contextState,
    quote: {
      symbol: inputs.quote.symbol,
      lastPrice: inputs.quote.lastPrice,
      bidPrice: inputs.quote.bidPrice,
      askPrice: inputs.quote.askPrice,
      volume: inputs.quote.volume,
      quoteTimestamp: inputs.quote.quoteTimestamp,
      fetchedAt: inputs.quote.fetchedAt,
      marketStatus: inputs.quote.marketStatus,
      sourceState: inputs.quote.sourceState,
      dataAgeMs: inputs.quote.dataAgeMs,
      warningCode: inputs.quote.warningCode,
    },
    candles: candleSummary,
    session: {
      currentMarketDate,
      currentSessionWindow: sessionWindow,
      currentObservedMarketDate: inputs.sessionData.currentObservedMarketDate,
      previousObservedMarketDate: inputs.sessionData.previousObservedMarketDate,
      mostRecentRthSessionDate,
      sourceState: inputs.sessionData.sourceState,
      fetchedAt: inputs.sessionData.fetchedAt,
      dataAgeMs: inputs.sessionData.dataAgeMs,
      warningCode: inputs.sessionData.warningCode,
    },
    vwap: {
      marketDate: inputs.vwap.marketDate,
      metricState: inputs.vwap.metricState,
      candleSourceState: inputs.vwap.candleSourceState,
      latestVwap: inputs.vwap.latestVwap,
      latestRthCandleAt: inputs.vwap.latestRthCandleAt,
      rthCandleCount: inputs.vwap.rthCandleCount,
      fetchedAt: inputs.vwap.fetchedAt,
      dataAgeMs: inputs.vwap.dataAgeMs,
      warningCode: inputs.vwap.warningCode,
    },
    sessionLevels: {
      currentMarketDate: inputs.sessionLevels.currentMarketDate,
      currentMarketDateHasDefinedSessionData:
        inputs.sessionLevels.currentMarketDateHasDefinedSessionData,
      previousRthMarketDate: inputs.sessionLevels.previousRthMarketDate,
      candleSourceState: inputs.sessionLevels.candleSourceState,
      premarketCoverageState: inputs.sessionLevels.premarketCoverageState,
      previousRthCoverageState: inputs.sessionLevels.previousRthCoverageState,
      premarketHigh: inputs.sessionLevels.premarketHigh,
      premarketLow: inputs.sessionLevels.premarketLow,
      previousDayHigh: inputs.sessionLevels.previousDayHigh,
      previousDayLow: inputs.sessionLevels.previousDayLow,
      previousDayClose: inputs.sessionLevels.previousDayClose,
      fetchedAt: inputs.sessionLevels.fetchedAt,
      dataAgeMs: inputs.sessionLevels.dataAgeMs,
      latestCandleAt: inputs.sessionLevels.latestCandleAt,
      warningCode: inputs.sessionLevels.warningCode,
    },
    gap: {
      currentMarketDate: inputs.gap.currentMarketDate,
      previousRthMarketDate: inputs.gap.previousRthMarketDate,
      metricState: inputs.gap.metricState,
      candleSourceState: inputs.gap.candleSourceState,
      currentRthOpen: inputs.gap.currentRthOpen,
      currentRthOpenAt: inputs.gap.currentRthOpenAt,
      previousDayClose: inputs.gap.previousDayClose,
      gapPoints: inputs.gap.gapPoints,
      gapPercent: inputs.gap.gapPercent,
      direction: inputs.gap.direction,
      fillState: inputs.gap.fillState,
      firstObservedFillCandleAt: inputs.gap.firstObservedFillCandleAt,
      currentRthCoverageState: inputs.gap.currentRthCoverageState,
      previousRthCoverageState: inputs.gap.previousRthCoverageState,
      latestRthCandleAt: inputs.gap.latestRthCandleAt,
      fetchedAt: inputs.gap.fetchedAt,
      dataAgeMs: inputs.gap.dataAgeMs,
      warningCode: inputs.gap.warningCode,
    },
    openingRange: {
      currentMarketDate: inputs.openingRange.currentMarketDate,
      metricState: inputs.openingRange.metricState,
      candleSourceState: inputs.openingRange.candleSourceState,
      phase: inputs.openingRange.phase,
      openingRangeHigh: inputs.openingRange.openingRangeHigh,
      openingRangeLow: inputs.openingRange.openingRangeLow,
      openingRangeStartAt: inputs.openingRange.openingRangeStartAt,
      openingRangeEndAt: inputs.openingRange.openingRangeEndAt,
      openingRangeCandleCount: inputs.openingRange.openingRangeCandleCount,
      coverageState: inputs.openingRange.coverageState,
      firstOpeningRangeCandleAt: inputs.openingRange.firstOpeningRangeCandleAt,
      latestOpeningRangeCandleAt: inputs.openingRange.latestOpeningRangeCandleAt,
      fetchedAt: inputs.openingRange.fetchedAt,
      dataAgeMs: inputs.openingRange.dataAgeMs,
      warningCode: inputs.openingRange.warningCode,
    },
    options: {
      underlyingPrice: inputs.options.underlyingPrice,
      underlyingPriceSource: inputs.options.underlyingPriceSource,
      currentMarketDate: inputs.options.currentMarketDate,
      requestedExpirationDate: inputs.options.requestedExpirationDate,
      returnedExpirationDate: inputs.options.returnedExpirationDate,
      requestedStrikeCount: inputs.options.requestedStrikeCount,
      returnedUniqueStrikeCount: inputs.options.returnedUniqueStrikeCount,
      minimumReturnedStrike: inputs.options.minimumReturnedStrike,
      maximumReturnedStrike: inputs.options.maximumReturnedStrike,
      atmStrike,
      callContractCount: inputs.options.callContractCount,
      putContractCount: inputs.options.putContractCount,
      rejectedContractCount: inputs.options.rejectedContractCount,
      sourceState: inputs.options.sourceState,
      metricState: inputs.options.metricState,
      latestOptionQuoteAt: inputs.options.latestOptionQuoteAt,
      chainFetchedAt: inputs.options.fetchedAt,
      dataAgeMs: inputs.options.dataAgeMs,
      warningCode: inputs.options.warningCode,
    },
    expectedMove: {
      methodology: inputs.expectedMove.methodology,
      currentMarketDate: inputs.expectedMove.currentMarketDate,
      expirationDate: inputs.expectedMove.expirationDate,
      metricState: inputs.expectedMove.metricState,
      sourceState: inputs.expectedMove.sourceState,
      underlyingPrice: inputs.expectedMove.underlyingPrice,
      underlyingPriceSource: inputs.expectedMove.underlyingPriceSource,
      atmStrike: inputs.expectedMove.atmStrike,
      callContractSymbol: inputs.expectedMove.callContractSymbol,
      putContractSymbol: inputs.expectedMove.putContractSymbol,
      callMark: inputs.expectedMove.callMark,
      putMark: inputs.expectedMove.putMark,
      impliedMovePoints: inputs.expectedMove.impliedMovePoints,
      impliedMovePercent: inputs.expectedMove.impliedMovePercent,
      upperImpliedMoveLevel: inputs.expectedMove.upperImpliedMoveLevel,
      lowerImpliedMoveLevel: inputs.expectedMove.lowerImpliedMoveLevel,
      callQuoteAt: inputs.expectedMove.callQuoteAt,
      putQuoteAt: inputs.expectedMove.putQuoteAt,
      latestSelectedContractQuoteAt: inputs.expectedMove.latestSelectedContractQuoteAt,
      chainFetchedAt: inputs.expectedMove.chainFetchedAt,
      fetchedAt: inputs.expectedMove.fetchedAt,
      dataAgeMs: inputs.expectedMove.dataAgeMs,
      warningCode: inputs.expectedMove.warningCode,
    },
    gex: {
      methodology: inputs.gex.methodology,
      coverageScope: inputs.gex.coverageScope,
      currentMarketDate: inputs.gex.currentMarketDate,
      expirationDate: inputs.gex.expirationDate,
      metricState: inputs.gex.metricState,
      sourceState: inputs.gex.sourceState,
      coverageState: inputs.gex.coverageState,
      underlyingPrice: inputs.gex.underlyingPrice,
      requestedStrikeCount: inputs.gex.requestedStrikeCount,
      returnedUniqueStrikeCount: inputs.gex.returnedUniqueStrikeCount,
      minimumReturnedStrike: inputs.gex.minimumReturnedStrike,
      maximumReturnedStrike: inputs.gex.maximumReturnedStrike,
      returnedWindowCallGammaExposure: inputs.gex.returnedWindowCallGammaExposure,
      returnedWindowPutGammaExposureMagnitude: inputs.gex.returnedWindowPutGammaExposureMagnitude,
      returnedWindowNetGammaExposureProxy: inputs.gex.returnedWindowNetGammaExposureProxy,
      eligibleCallContractCount: inputs.gex.eligibleCallContractCount,
      eligiblePutContractCount: inputs.gex.eligiblePutContractCount,
      eligibleStrikeCount: inputs.gex.eligibleStrikeCount,
      latestOptionQuoteAt: inputs.gex.latestOptionQuoteAt,
      chainFetchedAt: inputs.gex.chainFetchedAt,
      fetchedAt: inputs.gex.fetchedAt,
      dataAgeMs: inputs.gex.dataAgeMs,
      warningCode: inputs.gex.warningCode,
    },
    dex: {
      methodology: inputs.dex.methodology,
      coverageScope: inputs.dex.coverageScope,
      currentMarketDate: inputs.dex.currentMarketDate,
      expirationDate: inputs.dex.expirationDate,
      metricState: inputs.dex.metricState,
      sourceState: inputs.dex.sourceState,
      coverageState: inputs.dex.coverageState,
      underlyingPrice: inputs.dex.underlyingPrice,
      requestedStrikeCount: inputs.dex.requestedStrikeCount,
      returnedUniqueStrikeCount: inputs.dex.returnedUniqueStrikeCount,
      minimumReturnedStrike: inputs.dex.minimumReturnedStrike,
      maximumReturnedStrike: inputs.dex.maximumReturnedStrike,
      returnedWindowCallDeltaExposure: inputs.dex.returnedWindowCallDeltaExposure,
      returnedWindowPutDeltaExposureMagnitude: inputs.dex.returnedWindowPutDeltaExposureMagnitude,
      returnedWindowNetDeltaExposureProxy: inputs.dex.returnedWindowNetDeltaExposureProxy,
      eligibleCallContractCount: inputs.dex.eligibleCallContractCount,
      eligiblePutContractCount: inputs.dex.eligiblePutContractCount,
      eligibleStrikeCount: inputs.dex.eligibleStrikeCount,
      latestOptionQuoteAt: inputs.dex.latestOptionQuoteAt,
      chainFetchedAt: inputs.dex.chainFetchedAt,
      fetchedAt: inputs.dex.fetchedAt,
      dataAgeMs: inputs.dex.dataAgeMs,
      warningCode: inputs.dex.warningCode,
    },
    exposureStructure,
    components,
    componentWarnings,
    warningCode,
  });
}
