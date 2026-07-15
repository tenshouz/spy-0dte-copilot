import {
  SpySessionLevelsResponseSchema,
  type QuoteSourceState,
  type SessionLevelState,
  type SessionLevelValue,
  type SpyCandle,
  type SpySessionLevelsResponse,
} from "@spy-copilot/shared";
import { decideCandleState } from "./schwab-candles.logic";
import {
  analyzeMarketSessionCoverage,
  getObservedMarketDate,
  selectMarketSessionCandles,
  selectPreviousRthMarketDate,
} from "./session-data.logic";
import type { SpyBoundedCandleAccessResult } from "./session-data.service";

export interface SessionHighLow {
  high: number;
  low: number;
}

/**
 * Pure extrema calculation over an already-selected session candle set.
 * Deliberately owns no timezone, date, coverage, provider, or HTTP behavior.
 */
export function calculateSessionHighLow(
  candles: readonly SpyCandle[],
): SessionHighLow | null {
  if (candles.length === 0) return null;
  let high = candles[0]!.high;
  let low = candles[0]!.low;
  for (let index = 1; index < candles.length; index += 1) {
    const candle = candles[index]!;
    high = Math.max(high, candle.high);
    low = Math.min(low, candle.low);
  }
  return { high, low };
}

/**
 * Pure close calculation over an already-selected, chronologically ordered
 * session candle set. No timestamp-start/end assumption is made here.
 */
export function calculateFinalSessionClose(
  candles: readonly SpyCandle[],
): number | null {
  return candles.at(-1)?.close ?? null;
}

function unavailableLevel(): SessionLevelValue {
  return { value: null, state: "UNAVAILABLE" };
}

function availableLevel(
  value: number,
  sourceState: QuoteSourceState,
): SessionLevelValue {
  const state: SessionLevelState = sourceState;
  return { value, state };
}

function buildUnavailableResponse(
  nowMs: number,
  warningCode: SpySessionLevelsResponse["warningCode"],
): SpySessionLevelsResponse {
  return SpySessionLevelsResponseSchema.parse({
    symbol: "SPY",
    currentMarketDate: getObservedMarketDate(nowMs),
    currentMarketDateHasDefinedSessionData: false,
    previousRthMarketDate: null,
    candleSourceState: "MOCK",
    premarketCoverageState: "UNAVAILABLE",
    previousRthCoverageState: "UNAVAILABLE",
    premarketHigh: unavailableLevel(),
    premarketLow: unavailableLevel(),
    previousDayHigh: unavailableLevel(),
    previousDayLow: unavailableLevel(),
    previousDayClose: unavailableLevel(),
    fetchedAt: new Date(nowMs).toISOString(),
    dataAgeMs: 0,
    latestCandleAt: null,
    warningCode,
  });
}

/**
 * Compose the five core session levels from the shared bounded normalized
 * candle dataset. Session/date/coverage rules are resolved before the pure
 * high/low/close calculations run.
 */
export function buildSpySessionLevelsResponse(
  access: SpyBoundedCandleAccessResult,
  nowMs: number,
): SpySessionLevelsResponse {
  if (!access.dataset) {
    return buildUnavailableResponse(nowMs, access.warningCode);
  }

  const dataset = access.dataset;
  const currentMarketDate = getObservedMarketDate(nowMs);
  const candleSourceState = decideCandleState(dataset.fetchedAtMs, nowMs);

  const premarketCandles = selectMarketSessionCandles(
    dataset.candles,
    currentMarketDate,
    "PREMARKET",
  );
  const currentMarketDateHasDefinedSessionData =
    premarketCandles.length > 0 ||
    selectMarketSessionCandles(dataset.candles, currentMarketDate, "RTH").length > 0 ||
    selectMarketSessionCandles(dataset.candles, currentMarketDate, "AFTER_HOURS").length > 0;
  const premarketCoverage = analyzeMarketSessionCoverage(
    dataset.candles,
    currentMarketDate,
    "PREMARKET",
    nowMs,
  );
  const premarketCalculation = calculateSessionHighLow(premarketCandles);
  const premarketEligible =
    premarketCoverage.state === "COMPLETE" && premarketCalculation !== null;

  // Select the immediately preceding date with RTH evidence first, then test
  // that exact date's coverage. Never skip an incomplete prior RTH session to
  // substitute an older complete day.
  const previousRthMarketDate = selectPreviousRthMarketDate(
    dataset.candles,
    currentMarketDate,
  );
  const previousRthCandles = previousRthMarketDate
    ? selectMarketSessionCandles(dataset.candles, previousRthMarketDate, "RTH")
    : [];
  const previousRthCoverage = previousRthMarketDate
    ? analyzeMarketSessionCoverage(
        dataset.candles,
        previousRthMarketDate,
        "RTH",
        nowMs,
      )
    : null;
  const previousHighLow = calculateSessionHighLow(previousRthCandles);
  const previousClose = calculateFinalSessionClose(previousRthCandles);
  const previousRthEligible =
    previousRthCoverage?.state === "COMPLETE" &&
    previousHighLow !== null &&
    previousClose !== null;

  return SpySessionLevelsResponseSchema.parse({
    symbol: "SPY",
    currentMarketDate,
    currentMarketDateHasDefinedSessionData,
    previousRthMarketDate,
    candleSourceState,
    premarketCoverageState: premarketCoverage.state,
    previousRthCoverageState: previousRthCoverage?.state ?? "UNAVAILABLE",
    premarketHigh: premarketEligible
      ? availableLevel(premarketCalculation.high, candleSourceState)
      : unavailableLevel(),
    premarketLow: premarketEligible
      ? availableLevel(premarketCalculation.low, candleSourceState)
      : unavailableLevel(),
    previousDayHigh: previousRthEligible
      ? availableLevel(previousHighLow.high, candleSourceState)
      : unavailableLevel(),
    previousDayLow: previousRthEligible
      ? availableLevel(previousHighLow.low, candleSourceState)
      : unavailableLevel(),
    previousDayClose: previousRthEligible
      ? availableLevel(previousClose, candleSourceState)
      : unavailableLevel(),
    fetchedAt: new Date(dataset.fetchedAtMs).toISOString(),
    dataAgeMs: Math.max(0, nowMs - dataset.fetchedAtMs),
    latestCandleAt: dataset.latestCandleAt,
    warningCode: access.warningCode,
  });
}
