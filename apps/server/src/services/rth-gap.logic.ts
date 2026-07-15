import {
  SpyRthGapResponseSchema,
  type CoverageState,
  type GapDirection,
  type GapFillState,
  type GapWarningCode,
  type QuoteSourceState,
  type SpyCandle,
  type SpyRthGapResponse,
} from "@spy-copilot/shared";
import { decideCandleState } from "./schwab-candles.logic";
import {
  analyzeMarketSessionCoverage,
  getObservedMarketDate,
  selectMarketSessionCandles,
  selectMarketSessionOpeningCandle,
} from "./session-data.logic";
import type { SpyBoundedCandleAccessResult } from "./session-data.service";
import { buildSpySessionLevelsResponse } from "./session-levels.logic";

export interface RthGapCalculation {
  gapPoints: number;
  gapPercent: number;
  direction: Exclude<GapDirection, "UNAVAILABLE">;
}

export interface GapFillResult {
  fillState: GapFillState;
  firstObservedFillCandleAtMs: number | null;
}

function normalizeNegativeZero(value: number): number {
  return Object.is(value, -0) ? 0 : value;
}

/**
 * Pure RTH-gap calculation. Inputs are already validated session-derived
 * values; this function owns no timezone, provider, coverage, or HTTP rules.
 */
export function calculateRthGap(
  currentRthOpen: number,
  previousDayClose: number,
): RthGapCalculation | null {
  if (
    !Number.isFinite(currentRthOpen) ||
    !Number.isFinite(previousDayClose) ||
    currentRthOpen <= 0 ||
    previousDayClose <= 0
  ) {
    return null;
  }

  const gapPoints = normalizeNegativeZero(currentRthOpen - previousDayClose);
  const gapPercent = normalizeNegativeZero((gapPoints / previousDayClose) * 100);
  const direction: RthGapCalculation["direction"] =
    gapPoints > 0 ? "UP" : gapPoints < 0 ? "DOWN" : "FLAT";

  return { gapPoints, gapPercent, direction };
}

/**
 * Pure fill detection over already-selected current-date RTH candles. The
 * returned timestamp identifies the earliest returned candle proving a fill;
 * it intentionally does not claim tick-level first-touch precision.
 */
export function detectRthGapFill(
  direction: Exclude<GapDirection, "UNAVAILABLE">,
  previousDayClose: number,
  rthCandles: readonly SpyCandle[],
  coverageState: CoverageState,
): GapFillResult {
  if (direction === "FLAT") {
    return { fillState: "NOT_APPLICABLE", firstObservedFillCandleAtMs: null };
  }

  const sorted = [...rthCandles].sort((a, b) => a.timestamp - b.timestamp);
  const provingCandle = sorted.find((candle) =>
    direction === "UP"
      ? candle.low <= previousDayClose
      : candle.high >= previousDayClose,
  );

  if (provingCandle) {
    return {
      fillState: "FILLED",
      firstObservedFillCandleAtMs: provingCandle.timestamp,
    };
  }

  return {
    fillState: coverageState === "COMPLETE" ? "UNFILLED" : "UNKNOWN",
    firstObservedFillCandleAtMs: null,
  };
}

function gapUnavailableWarning(
  accessWarning: SpyBoundedCandleAccessResult["warningCode"],
  currentRthCandles: readonly SpyCandle[],
  hasOpeningCandle: boolean,
  previousDayClose: number | null,
): GapWarningCode | null {
  if (accessWarning) return accessWarning;
  if (currentRthCandles.length > 0 && !hasOpeningCandle) {
    return "CURRENT_RTH_OPENING_CANDLE_MISSING";
  }
  if (hasOpeningCandle && previousDayClose === null) {
    return "PREVIOUS_DAY_CLOSE_UNAVAILABLE";
  }
  return null;
}

function buildUnavailableGapResponse(
  access: SpyBoundedCandleAccessResult,
  nowMs: number,
): SpyRthGapResponse {
  const currentMarketDate = getObservedMarketDate(nowMs);
  if (!access.dataset) {
    return SpyRthGapResponseSchema.parse({
      symbol: "SPY",
      metric: "RTH_GAP",
      currentMarketDate,
      previousRthMarketDate: null,
      metricState: "UNAVAILABLE",
      candleSourceState: "MOCK",
      currentRthOpen: null,
      currentRthOpenAt: null,
      previousDayClose: null,
      gapPoints: null,
      gapPercent: null,
      direction: "UNAVAILABLE",
      fillState: "UNAVAILABLE",
      firstObservedFillCandleAt: null,
      currentRthCoverageState: "UNAVAILABLE",
      previousRthCoverageState: "UNAVAILABLE",
      fetchedAt: new Date(nowMs).toISOString(),
      dataAgeMs: 0,
      latestRthCandleAt: null,
      currentRthCandleCount: 0,
      warningCode: access.warningCode,
    });
  }

  throw new Error("Unavailable gap response with a real dataset must be composed in the main builder.");
}

/**
 * Compose the current-date RTH gap from one bounded normalized candle snapshot.
 * The trusted PDC is derived through existing Core Session Levels pure logic
 * using the same access object, so no second request or HTTP call is made.
 */
export function buildSpyRthGapResponse(
  access: SpyBoundedCandleAccessResult,
  nowMs: number,
): SpyRthGapResponse {
  if (!access.dataset) return buildUnavailableGapResponse(access, nowMs);

  const dataset = access.dataset;
  const currentMarketDate = getObservedMarketDate(nowMs);
  const candleSourceState: QuoteSourceState = decideCandleState(dataset.fetchedAtMs, nowMs);
  const currentRthCandles = selectMarketSessionCandles(
    dataset.candles,
    currentMarketDate,
    "RTH",
  );
  const currentRthCoverage = analyzeMarketSessionCoverage(
    dataset.candles,
    currentMarketDate,
    "RTH",
    nowMs,
  );
  const openingCandle = selectMarketSessionOpeningCandle(
    dataset.candles,
    currentMarketDate,
    "RTH",
  );
  const latestRthCandle = currentRthCandles.at(-1) ?? null;

  // Reuse the existing trusted immediate-prior-RTH derivation against this
  // exact same bounded dataset snapshot. This calls no service and no route.
  const sessionLevels = buildSpySessionLevelsResponse(access, nowMs);
  const previousDayClose = sessionLevels.previousDayClose.value;
  const calculation =
    openingCandle && previousDayClose !== null
      ? calculateRthGap(openingCandle.open, previousDayClose)
      : null;

  const warningCode = gapUnavailableWarning(
    access.warningCode,
    currentRthCandles,
    openingCandle !== null,
    previousDayClose,
  );

  if (!openingCandle || previousDayClose === null || calculation === null) {
    return SpyRthGapResponseSchema.parse({
      symbol: "SPY",
      metric: "RTH_GAP",
      currentMarketDate,
      previousRthMarketDate: sessionLevels.previousRthMarketDate,
      metricState: "UNAVAILABLE",
      candleSourceState,
      currentRthOpen: null,
      currentRthOpenAt: null,
      previousDayClose,
      gapPoints: null,
      gapPercent: null,
      direction: "UNAVAILABLE",
      fillState: "UNAVAILABLE",
      firstObservedFillCandleAt: null,
      currentRthCoverageState: currentRthCoverage.state,
      previousRthCoverageState: sessionLevels.previousRthCoverageState,
      fetchedAt: new Date(dataset.fetchedAtMs).toISOString(),
      dataAgeMs: Math.max(0, nowMs - dataset.fetchedAtMs),
      latestRthCandleAt: latestRthCandle
        ? new Date(latestRthCandle.timestamp).toISOString()
        : null,
      currentRthCandleCount: currentRthCandles.length,
      warningCode,
    });
  }

  const fill = detectRthGapFill(
    calculation.direction,
    previousDayClose,
    currentRthCandles,
    currentRthCoverage.state,
  );

  return SpyRthGapResponseSchema.parse({
    symbol: "SPY",
    metric: "RTH_GAP",
    currentMarketDate,
    previousRthMarketDate: sessionLevels.previousRthMarketDate,
    metricState: candleSourceState,
    candleSourceState,
    currentRthOpen: openingCandle.open,
    currentRthOpenAt: new Date(openingCandle.timestamp).toISOString(),
    previousDayClose,
    gapPoints: calculation.gapPoints,
    gapPercent: calculation.gapPercent,
    direction: calculation.direction,
    fillState: fill.fillState,
    firstObservedFillCandleAt:
      fill.firstObservedFillCandleAtMs === null
        ? null
        : new Date(fill.firstObservedFillCandleAtMs).toISOString(),
    currentRthCoverageState: currentRthCoverage.state,
    previousRthCoverageState: sessionLevels.previousRthCoverageState,
    fetchedAt: new Date(dataset.fetchedAtMs).toISOString(),
    dataAgeMs: Math.max(0, nowMs - dataset.fetchedAtMs),
    latestRthCandleAt: latestRthCandle
      ? new Date(latestRthCandle.timestamp).toISOString()
      : null,
    currentRthCandleCount: currentRthCandles.length,
    warningCode: access.warningCode,
  });
}
