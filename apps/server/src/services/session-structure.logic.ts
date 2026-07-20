import {
  SpyDeterministicSessionStructureResponseSchema,
  type CoverageState,
  type OpeningRangePhase,
  type QuoteSourceState,
  type SessionOpeningRangeDuration,
  type SessionOpeningRangeInteractionState,
  type SessionOpeningRangePricePosition,
  type SessionOpeningRangeWindow,
  type SpyCandle,
  type SpyDeterministicSessionStructureResponse,
  type SpyQuote,
  type TraditionalPivotSet,
  type TraditionalPivotWarningCode,
} from "@spy-copilot/shared";
import { decideCandleState } from "./schwab-candles.logic";
import {
  FIVE_MINUTES_MS,
  detectTimestampGaps,
  getObservedMarketDate,
  getObservedMarketMinute,
  selectMarketSessionCandles,
  selectMarketSessionOpeningCandle,
  selectPreviousRthMarketDate,
} from "./session-data.logic";
import type { SpyBoundedCandleAccessResult } from "./session-data.service";
import {
  NYSE_SESSION_CALENDAR_METHOD,
  evaluateNyseTradingSessionCalendar,
} from "./nyse-session-calendar.logic";

export const SESSION_STRUCTURE_LOOKBACK_CALENDAR_DAYS = 21 as const;
export const OPENING_RANGE_DURATIONS = [5, 15, 30] as const;
const OPENING_RANGE_START_MINUTE = 9 * 60 + 30;
const PRICE_EQUALITY_TOLERANCE = 0.005;

interface CompleteRthSession {
  marketDate: string;
  candles: SpyCandle[];
  high: number;
  low: number;
  close: number;
  earlyClose: boolean;
}

interface PivotInputs {
  high: number;
  low: number;
  close: number;
}

export interface TraditionalPivotCalculation {
  pivot: number;
  resistance1: number;
  support1: number;
  resistance2: number;
  support2: number;
}

export function calculateTraditionalPivots(
  inputs: PivotInputs,
): TraditionalPivotCalculation | null {
  const { high, low, close } = inputs;
  if (
    !Number.isFinite(high) ||
    !Number.isFinite(low) ||
    !Number.isFinite(close) ||
    high <= 0 ||
    low <= 0 ||
    close <= 0 ||
    high < low
  ) {
    return null;
  }
  const pivot = (high + low + close) / 3;
  const resistance1 = 2 * pivot - low;
  const support1 = 2 * pivot - high;
  const resistance2 = pivot + (high - low);
  const support2 = pivot - (high - low);
  const values = [pivot, resistance1, support1, resistance2, support2];
  if (values.some((value) => !Number.isFinite(value) || value <= 0)) return null;
  return { pivot, resistance1, support1, resistance2, support2 };
}

function parseMarketDate(marketDate: string): Date | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(marketDate);
  if (!match) return null;
  const date = new Date(
    Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3])),
  );
  return Number.isNaN(date.getTime()) ? null : date;
}

function formatMarketDate(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function addMarketDays(marketDate: string, days: number): string | null {
  const date = parseMarketDate(marketDate);
  if (!date) return null;
  date.setUTCDate(date.getUTCDate() + days);
  return formatMarketDate(date);
}

function targetTradingWeekMonday(marketDate: string): string | null {
  const date = parseMarketDate(marketDate);
  if (!date) return null;
  const weekday = date.getUTCDay();
  if (weekday === 6) {
    date.setUTCDate(date.getUTCDate() + 2);
  } else if (weekday === 0) {
    date.setUTCDate(date.getUTCDate() + 1);
  } else {
    date.setUTCDate(date.getUTCDate() - (weekday - 1));
  }
  return formatMarketDate(date);
}

function expectedTradingDatesForWeek(
  monday: string,
): { dates: string[]; calendarSupported: boolean } {
  const dates: string[] = [];
  for (let offset = 0; offset < 5; offset += 1) {
    const marketDate = addMarketDays(monday, offset);
    if (!marketDate) return { dates: [], calendarSupported: false };
    const calendar = evaluateNyseTradingSessionCalendar(marketDate);
    if (calendar.coverageState !== "SUPPORTED") {
      return { dates: [], calendarSupported: false };
    }
    if (calendar.tradingDayState === "TRADING_DAY") dates.push(marketDate);
  }
  return { dates, calendarSupported: true };
}

function completeRthSession(
  allCandles: readonly SpyCandle[],
  marketDate: string,
): CompleteRthSession | null {
  const calendar = evaluateNyseTradingSessionCalendar(marketDate);
  if (
    calendar.coverageState !== "SUPPORTED" ||
    calendar.tradingDayState !== "TRADING_DAY" ||
    calendar.rthCloseMinute === null
  ) {
    return null;
  }

  const candles = selectMarketSessionCandles(allCandles, marketDate, "RTH")
    .slice()
    .sort((a, b) => a.timestamp - b.timestamp);
  if (candles.length === 0) return null;

  const opening = selectMarketSessionOpeningCandle(
    allCandles,
    marketDate,
    "RTH",
  );
  if (!opening) return null;

  const expectedLastMinute = calendar.rthCloseMinute - 5;
  const last = candles.at(-1)!;
  if (getObservedMarketMinute(last.timestamp) !== expectedLastMinute) return null;
  if (detectTimestampGaps(candles).gapCount > 0) return null;

  let high = candles[0]!.high;
  let low = candles[0]!.low;
  for (const candle of candles.slice(1)) {
    high = Math.max(high, candle.high);
    low = Math.min(low, candle.low);
  }
  const close = last.close;
  if (
    !Number.isFinite(high) ||
    !Number.isFinite(low) ||
    !Number.isFinite(close) ||
    high <= 0 ||
    low <= 0 ||
    close <= 0 ||
    high < low
  ) {
    return null;
  }

  return {
    marketDate,
    candles,
    high,
    low,
    close,
    earlyClose: calendar.earlyClose === true,
  };
}

function unavailablePivots(
  period: "DAILY" | "WEEKLY",
  warningCode: TraditionalPivotWarningCode,
  metadata: Partial<TraditionalPivotSet> = {},
): TraditionalPivotSet {
  return {
    period,
    metricState: "UNAVAILABLE",
    sourceCoverageState: metadata.sourceCoverageState ?? "UNAVAILABLE",
    sourceMarketDateStart: metadata.sourceMarketDateStart ?? null,
    sourceMarketDateEnd: metadata.sourceMarketDateEnd ?? null,
    expectedTradingSessionCount:
      metadata.expectedTradingSessionCount ?? (period === "DAILY" ? 1 : 0),
    observedTradingSessionCount: metadata.observedTradingSessionCount ?? 0,
    sourceHigh: null,
    sourceLow: null,
    sourceClose: null,
    pivot: null,
    resistance1: null,
    support1: null,
    resistance2: null,
    support2: null,
    warningCode,
  };
}

function availablePivots(
  period: "DAILY" | "WEEKLY",
  sourceState: QuoteSourceState,
  sourceStart: string,
  sourceEnd: string,
  expectedCount: number,
  observedCount: number,
  inputs: PivotInputs,
): TraditionalPivotSet {
  const calculation = calculateTraditionalPivots(inputs);
  if (!calculation) {
    return unavailablePivots(period, "INVALID_PIVOT_INPUTS", {
      sourceCoverageState: "COMPLETE",
      sourceMarketDateStart: sourceStart,
      sourceMarketDateEnd: sourceEnd,
      expectedTradingSessionCount: expectedCount,
      observedTradingSessionCount: observedCount,
    });
  }
  return {
    period,
    metricState: sourceState === "LIVE" ? "LIVE" : "STALE",
    sourceCoverageState: "COMPLETE",
    sourceMarketDateStart: sourceStart,
    sourceMarketDateEnd: sourceEnd,
    expectedTradingSessionCount: expectedCount,
    observedTradingSessionCount: observedCount,
    sourceHigh: inputs.high,
    sourceLow: inputs.low,
    sourceClose: inputs.close,
    ...calculation,
    warningCode: null,
  };
}

export function deriveDailyTraditionalPivots(
  candles: readonly SpyCandle[],
  currentMarketDate: string,
  sourceState: QuoteSourceState,
): TraditionalPivotSet {
  const previousDate = selectPreviousRthMarketDate(candles, currentMarketDate);
  if (!previousDate) return unavailablePivots("DAILY", "SOURCE_DATA_UNAVAILABLE");

  const calendar = evaluateNyseTradingSessionCalendar(previousDate);
  if (calendar.coverageState !== "SUPPORTED") {
    return unavailablePivots("DAILY", "CALENDAR_UNSUPPORTED", {
      sourceMarketDateStart: previousDate,
      sourceMarketDateEnd: previousDate,
      expectedTradingSessionCount: 1,
    });
  }

  const session = completeRthSession(candles, previousDate);
  if (!session) {
    return unavailablePivots("DAILY", "SOURCE_SESSION_INCOMPLETE", {
      sourceCoverageState: "PARTIAL",
      sourceMarketDateStart: previousDate,
      sourceMarketDateEnd: previousDate,
      expectedTradingSessionCount: 1,
      observedTradingSessionCount: 1,
    });
  }

  return availablePivots(
    "DAILY",
    sourceState,
    previousDate,
    previousDate,
    1,
    1,
    session,
  );
}

export function deriveWeeklyTraditionalPivots(
  candles: readonly SpyCandle[],
  currentMarketDate: string,
  sourceState: QuoteSourceState,
): TraditionalPivotSet {
  const currentMonday = targetTradingWeekMonday(currentMarketDate);
  const previousMonday = currentMonday ? addMarketDays(currentMonday, -7) : null;
  const previousFriday = previousMonday ? addMarketDays(previousMonday, 4) : null;
  if (!previousMonday || !previousFriday) {
    return unavailablePivots("WEEKLY", "CALENDAR_UNSUPPORTED");
  }

  const expected = expectedTradingDatesForWeek(previousMonday);
  if (!expected.calendarSupported) {
    return unavailablePivots("WEEKLY", "CALENDAR_UNSUPPORTED", {
      sourceMarketDateStart: previousMonday,
      sourceMarketDateEnd: previousFriday,
    });
  }

  const sessions = expected.dates
    .map((marketDate) => completeRthSession(candles, marketDate))
    .filter((session): session is CompleteRthSession => session !== null);

  if (sessions.length !== expected.dates.length || sessions.length === 0) {
    return unavailablePivots("WEEKLY", "SOURCE_WEEK_INCOMPLETE", {
      sourceCoverageState: sessions.length > 0 ? "PARTIAL" : "UNAVAILABLE",
      sourceMarketDateStart: previousMonday,
      sourceMarketDateEnd: previousFriday,
      expectedTradingSessionCount: expected.dates.length,
      observedTradingSessionCount: sessions.length,
    });
  }

  const high = Math.max(...sessions.map((session) => session.high));
  const low = Math.min(...sessions.map((session) => session.low));
  const close = sessions.at(-1)!.close;
  return availablePivots(
    "WEEKLY",
    sourceState,
    expected.dates[0]!,
    expected.dates.at(-1)!,
    expected.dates.length,
    sessions.length,
    { high, low, close },
  );
}

function latestCompletedBucketStartMinute(nowMs: number): number {
  const date = new Date(nowMs);
  const formatted = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/New_York",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  }).formatToParts(date);
  const values = new Map(formatted.map((part) => [part.type, part.value]));
  const minute = Number(values.get("hour")) * 60 + Number(values.get("minute"));
  const second = Number(values.get("second"));
  const currentBucket = Math.floor((minute * 60 + second) / 300) * 5;
  return currentBucket - 5;
}

function phaseForOpeningRange(
  durationMinutes: SessionOpeningRangeDuration,
  currentRthCandles: readonly SpyCandle[],
  nowMs: number,
): OpeningRangePhase {
  const minute = getObservedMarketMinute(nowMs);
  if (minute < OPENING_RANGE_START_MINUTE) return "PRE_OPEN";
  if (currentRthCandles.length === 0) return "UNAVAILABLE";
  return minute < OPENING_RANGE_START_MINUTE + durationMinutes
    ? "FORMING"
    : "COMPLETE";
}

function comparePrice(
  price: number | null,
  high: number | null,
  low: number | null,
  phase: OpeningRangePhase,
): SessionOpeningRangePricePosition {
  if (phase === "PRE_OPEN") return "NOT_STARTED";
  if (phase === "FORMING") return "FORMING";
  if (price === null || high === null || low === null) return "UNAVAILABLE";
  if (Math.abs(price - high) <= PRICE_EQUALITY_TOLERANCE) return "AT_HIGH";
  if (Math.abs(price - low) <= PRICE_EQUALITY_TOLERANCE) return "AT_LOW";
  if (price > high) return "ABOVE";
  if (price < low) return "BELOW";
  return "INSIDE";
}

function acceptedBreakTimestamp(
  candles: readonly SpyCandle[],
  boundary: number,
  direction: "ABOVE" | "BELOW",
): number | null {
  for (let index = 1; index < candles.length; index += 1) {
    const previous = candles[index - 1]!;
    const current = candles[index]!;
    const previousAccepted =
      direction === "ABOVE" ? previous.close > boundary : previous.close < boundary;
    const currentAccepted =
      direction === "ABOVE" ? current.close > boundary : current.close < boundary;
    if (previousAccepted && currentAccepted) return current.timestamp;
  }
  return null;
}

function interactionState(
  phase: OpeningRangePhase,
  postRangeCandles: readonly SpyCandle[],
  high: number | null,
  low: number | null,
  currentPrice: number | null,
): {
  state: SessionOpeningRangeInteractionState;
  acceptedBreakoutAt: string | null;
  acceptedBreakdownAt: string | null;
} {
  if (phase === "PRE_OPEN") {
    return { state: "NOT_STARTED", acceptedBreakoutAt: null, acceptedBreakdownAt: null };
  }
  if (phase === "FORMING") {
    return { state: "FORMING", acceptedBreakoutAt: null, acceptedBreakdownAt: null };
  }
  if (phase !== "COMPLETE" || high === null || low === null) {
    return { state: "UNAVAILABLE", acceptedBreakoutAt: null, acceptedBreakdownAt: null };
  }

  const breakoutAt = acceptedBreakTimestamp(postRangeCandles, high, "ABOVE");
  const breakdownAt = acceptedBreakTimestamp(postRangeCandles, low, "BELOW");
  if (breakoutAt !== null || breakdownAt !== null) {
    const latestIsBreakout =
      breakoutAt !== null && (breakdownAt === null || breakoutAt >= breakdownAt);
    return {
      state: latestIsBreakout ? "BREAKOUT_ACCEPTED" : "BREAKDOWN_ACCEPTED",
      acceptedBreakoutAt:
        breakoutAt === null ? null : new Date(breakoutAt).toISOString(),
      acceptedBreakdownAt:
        breakdownAt === null ? null : new Date(breakdownAt).toISOString(),
    };
  }

  const highExcursion = postRangeCandles.some((candle) => candle.high > high);
  const lowExcursion = postRangeCandles.some((candle) => candle.low < low);
  const fallbackPrice = postRangeCandles.at(-1)?.close ?? null;
  const price = currentPrice ?? fallbackPrice;

  if (price !== null && price > high) {
    return { state: "BREAKOUT_PENDING", acceptedBreakoutAt: null, acceptedBreakdownAt: null };
  }
  if (price !== null && price < low) {
    return { state: "BREAKDOWN_PENDING", acceptedBreakoutAt: null, acceptedBreakdownAt: null };
  }
  if (highExcursion && lowExcursion) {
    return { state: "TWO_SIDED_FALSE_BREAK", acceptedBreakoutAt: null, acceptedBreakdownAt: null };
  }
  if (highExcursion) {
    return { state: "FALSE_BREAK_HIGH", acceptedBreakoutAt: null, acceptedBreakdownAt: null };
  }
  if (lowExcursion) {
    return { state: "FALSE_BREAK_LOW", acceptedBreakoutAt: null, acceptedBreakdownAt: null };
  }
  return { state: "INSIDE", acceptedBreakoutAt: null, acceptedBreakdownAt: null };
}

function unavailableOpeningRange(
  durationMinutes: SessionOpeningRangeDuration,
  phase: OpeningRangePhase,
  warningCode: SessionOpeningRangeWindow["warningCode"],
  metadata: Partial<SessionOpeningRangeWindow> = {},
): SessionOpeningRangeWindow {
  return {
    durationMinutes,
    metricState: "UNAVAILABLE",
    phase,
    coverageState: metadata.coverageState ?? "UNAVAILABLE",
    isComplete: false,
    openingRangeStartAt: metadata.openingRangeStartAt ?? null,
    openingRangeEndAt: metadata.openingRangeEndAt ?? null,
    expectedCandleCount: durationMinutes / 5,
    observedCandleCount: metadata.observedCandleCount ?? 0,
    high: null,
    low: null,
    midpoint: null,
    pricePosition:
      phase === "PRE_OPEN" ? "NOT_STARTED" : phase === "FORMING" ? "FORMING" : "UNAVAILABLE",
    interactionState:
      phase === "PRE_OPEN" ? "NOT_STARTED" : phase === "FORMING" ? "FORMING" : "UNAVAILABLE",
    acceptedBreakoutAt: null,
    acceptedBreakdownAt: null,
    warningCode,
  };
}

export function deriveOpeningRangeWindow(
  candles: readonly SpyCandle[],
  currentMarketDate: string,
  nowMs: number,
  durationMinutes: SessionOpeningRangeDuration,
  candleSourceState: QuoteSourceState,
  currentPrice: number | null,
): SessionOpeningRangeWindow {
  const currentRthCandles = selectMarketSessionCandles(
    candles,
    currentMarketDate,
    "RTH",
  )
    .slice()
    .sort((a, b) => a.timestamp - b.timestamp);
  const phase = phaseForOpeningRange(durationMinutes, currentRthCandles, nowMs);
  if (phase === "PRE_OPEN") {
    return unavailableOpeningRange(durationMinutes, phase, null);
  }
  if (phase === "UNAVAILABLE") {
    return unavailableOpeningRange(durationMinutes, phase, "SOURCE_DATA_UNAVAILABLE");
  }

  const opening = selectMarketSessionOpeningCandle(
    candles,
    currentMarketDate,
    "RTH",
  );
  if (!opening) {
    return unavailableOpeningRange(
      durationMinutes,
      phase,
      "OPENING_CANDLE_MISSING",
      { coverageState: "PARTIAL" },
    );
  }

  const expectedCount = durationMinutes / 5;
  const latestCompletedMinute = latestCompletedBucketStartMinute(nowMs);
  const completedExpectedCount =
    phase === "COMPLETE"
      ? expectedCount
      : Math.max(
          0,
          Math.min(
            expectedCount,
            Math.floor((latestCompletedMinute - OPENING_RANGE_START_MINUTE) / 5) + 1,
          ),
        );
  const byMinute = new Map(
    currentRthCandles.map((candle) => [getObservedMarketMinute(candle.timestamp), candle]),
  );
  const selected: SpyCandle[] = [];
  for (let index = 0; index < completedExpectedCount; index += 1) {
    const candle = byMinute.get(OPENING_RANGE_START_MINUTE + index * 5);
    if (candle) selected.push(candle);
  }

  const startAt = new Date(opening.timestamp).toISOString();
  const endAt = new Date(opening.timestamp + durationMinutes * 60_000).toISOString();
  if (completedExpectedCount === 0) {
    return unavailableOpeningRange(durationMinutes, phase, null, {
      coverageState: "UNKNOWN",
      openingRangeStartAt: startAt,
      openingRangeEndAt: endAt,
    });
  }

  if (selected.length !== completedExpectedCount) {
    return unavailableOpeningRange(
      durationMinutes,
      phase,
      "OPENING_RANGE_INCOMPLETE",
      {
        coverageState: "PARTIAL",
        openingRangeStartAt: startAt,
        openingRangeEndAt: endAt,
        observedCandleCount: selected.length,
      },
    );
  }

  const high = Math.max(...selected.map((candle) => candle.high));
  const low = Math.min(...selected.map((candle) => candle.low));
  const midpoint = (high + low) / 2;
  const endMinute = OPENING_RANGE_START_MINUTE + durationMinutes;
  const postRangeCandles = currentRthCandles.filter((candle) => {
    const minute = getObservedMarketMinute(candle.timestamp);
    return minute >= endMinute && minute <= latestCompletedMinute;
  });
  const interaction = interactionState(
    phase,
    postRangeCandles,
    high,
    low,
    currentPrice,
  );
  const isComplete = phase === "COMPLETE" && selected.length === expectedCount;

  return {
    durationMinutes,
    metricState: candleSourceState === "LIVE" ? "LIVE" : "STALE",
    phase,
    coverageState: "COMPLETE",
    isComplete,
    openingRangeStartAt: startAt,
    openingRangeEndAt: endAt,
    expectedCandleCount: expectedCount,
    observedCandleCount: selected.length,
    high,
    low,
    midpoint,
    pricePosition: comparePrice(currentPrice, high, low, phase),
    interactionState: interaction.state,
    acceptedBreakoutAt: interaction.acceptedBreakoutAt,
    acceptedBreakdownAt: interaction.acceptedBreakdownAt,
    warningCode: currentPrice === null && phase === "COMPLETE" ? "QUOTE_UNAVAILABLE" : null,
  };
}

function uniqueWarnings(items: Array<string | null | undefined>): string[] {
  return [...new Set(items.filter((item): item is string => Boolean(item)))];
}

export function buildSpyDeterministicSessionStructureResponse(
  access: SpyBoundedCandleAccessResult,
  quote: SpyQuote,
  nowMs: number,
): SpyDeterministicSessionStructureResponse {
  const currentMarketDate = getObservedMarketDate(nowMs);
  const validQuote = quote.sourceState === "MOCK" ? null : quote;
  const quotePrice = validQuote?.lastPrice ?? null;

  if (!access.dataset) {
    const daily = unavailablePivots("DAILY", "SOURCE_DATA_UNAVAILABLE");
    const weekly = unavailablePivots("WEEKLY", "SOURCE_DATA_UNAVAILABLE");
    const ranges = {
      fiveMinute: unavailableOpeningRange(5, "UNAVAILABLE", "SOURCE_DATA_UNAVAILABLE"),
      fifteenMinute: unavailableOpeningRange(15, "UNAVAILABLE", "SOURCE_DATA_UNAVAILABLE"),
      thirtyMinute: unavailableOpeningRange(30, "UNAVAILABLE", "SOURCE_DATA_UNAVAILABLE"),
    };
    return SpyDeterministicSessionStructureResponseSchema.parse({
      symbol: "SPY",
      product: "SPY_DETERMINISTIC_SESSION_STRUCTURE",
      methodologyVersion: "SESSION_STRUCTURE_V1",
      currentMarketDate,
      calculatedAt: new Date(nowMs).toISOString(),
      engineState: "UNAVAILABLE",
      candleSourceState: "MOCK",
      quoteSourceState: quote.sourceState,
      price: quotePrice,
      quoteTimestamp: validQuote?.quoteTimestamp ?? null,
      dailyPivots: daily,
      weeklyPivots: weekly,
      openingRanges: ranges,
      warnings: uniqueWarnings([
        access.warningCode,
        quote.warningCode,
        "SOURCE_DATA_UNAVAILABLE",
      ]),
      methodology: {
        pivotFamily: "TRADITIONAL",
        pivotLevels: ["P", "R1", "S1", "R2", "S2"],
        dailyPivotSource: "IMMEDIATE_PREVIOUS_COMPLETE_RTH",
        weeklyPivotSource: "PREVIOUS_COMPLETE_NYSE_TRADING_WEEK",
        openingRangeDurationsMinutes: [5, 15, 30],
        openingRangeAcceptanceRule: "TWO_CONSECUTIVE_COMPLETED_5M_CLOSES",
        boundedCandleLookbackCalendarDays: 21,
        exchangeCalendarMethod: NYSE_SESSION_CALENDAR_METHOD,
      },
      disclosures: {
        deterministicOnly: true,
        currentSnapshotOnly: true,
        noFutureCandles: true,
        traditionalPivotsOnly: true,
        supplementalContextOnly: true,
        noStandaloneSignals: true,
        noPrivateAccountData: true,
        noPositionSizing: true,
        noOrderExecution: true,
      },
    });
  }

  const dataset = access.dataset;
  const candleSourceState = decideCandleState(dataset.fetchedAtMs, nowMs);
  const dailyPivots = deriveDailyTraditionalPivots(
    dataset.candles,
    currentMarketDate,
    candleSourceState,
  );
  const weeklyPivots = deriveWeeklyTraditionalPivots(
    dataset.candles,
    currentMarketDate,
    candleSourceState,
  );
  const fiveMinute = deriveOpeningRangeWindow(
    dataset.candles,
    currentMarketDate,
    nowMs,
    5,
    candleSourceState,
    quotePrice,
  );
  const fifteenMinute = deriveOpeningRangeWindow(
    dataset.candles,
    currentMarketDate,
    nowMs,
    15,
    candleSourceState,
    quotePrice,
  );
  const thirtyMinute = deriveOpeningRangeWindow(
    dataset.candles,
    currentMarketDate,
    nowMs,
    30,
    candleSourceState,
    quotePrice,
  );
  const availableCount = [
    dailyPivots.metricState,
    weeklyPivots.metricState,
    fiveMinute.metricState,
    fifteenMinute.metricState,
    thirtyMinute.metricState,
  ].filter((state) => state !== "UNAVAILABLE").length;
  const engineState =
    availableCount === 0
      ? "UNAVAILABLE"
      : availableCount === 5
        ? "AVAILABLE"
        : "PARTIAL";

  return SpyDeterministicSessionStructureResponseSchema.parse({
    symbol: "SPY",
    product: "SPY_DETERMINISTIC_SESSION_STRUCTURE",
    methodologyVersion: "SESSION_STRUCTURE_V1",
    currentMarketDate,
    calculatedAt: new Date(nowMs).toISOString(),
    engineState,
    candleSourceState,
    quoteSourceState: quote.sourceState,
    price: quotePrice,
    quoteTimestamp: validQuote?.quoteTimestamp ?? null,
    dailyPivots,
    weeklyPivots,
    openingRanges: { fiveMinute, fifteenMinute, thirtyMinute },
    warnings: uniqueWarnings([
      access.warningCode,
      quote.warningCode,
      dailyPivots.warningCode,
      weeklyPivots.warningCode,
      fiveMinute.warningCode,
      fifteenMinute.warningCode,
      thirtyMinute.warningCode,
    ]),
    methodology: {
      pivotFamily: "TRADITIONAL",
      pivotLevels: ["P", "R1", "S1", "R2", "S2"],
      dailyPivotSource: "IMMEDIATE_PREVIOUS_COMPLETE_RTH",
      weeklyPivotSource: "PREVIOUS_COMPLETE_NYSE_TRADING_WEEK",
      openingRangeDurationsMinutes: [5, 15, 30],
      openingRangeAcceptanceRule: "TWO_CONSECUTIVE_COMPLETED_5M_CLOSES",
      boundedCandleLookbackCalendarDays: 21,
      exchangeCalendarMethod: NYSE_SESSION_CALENDAR_METHOD,
    },
    disclosures: {
      deterministicOnly: true,
      currentSnapshotOnly: true,
      noFutureCandles: true,
      traditionalPivotsOnly: true,
      supplementalContextOnly: true,
      noStandaloneSignals: true,
      noPrivateAccountData: true,
      noPositionSizing: true,
      noOrderExecution: true,
    },
  });
}
