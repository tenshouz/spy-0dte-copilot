import {
  SpyOpeningRangeResponseSchema,
  type CoverageState,
  type OpeningRangePhase,
  type OpeningRangeWarningCode,
  type QuoteSourceState,
  type SpyCandle,
  type SpyOpeningRangeResponse,
} from "@spy-copilot/shared";
import { decideCandleState } from "./schwab-candles.logic";
import {
  FIVE_MINUTES_MS,
  analyzeMarketSessionCoverage,
  getObservedMarketDate,
  getObservedMarketMinute,
  selectMarketSessionCandles,
  selectMarketSessionOpeningCandle,
} from "./session-data.logic";
import type { SpyBoundedCandleAccessResult } from "./session-data.service";
import { calculateSessionHighLow } from "./session-levels.logic";

export const OPENING_RANGE_START_MINUTE = 9 * 60 + 30;
export const OPENING_RANGE_END_MINUTE = 9 * 60 + 45;
export const OPENING_RANGE_CANDLE_COUNT = 3;

export interface OpeningRangeSelection {
  phase: OpeningRangePhase;
  coverageState: CoverageState;
  eligible: boolean;
  openingCandle: SpyCandle | null;
  selectedCandles: SpyCandle[];
  openingRangeStartAtMs: number | null;
  openingRangeEndAtMs: number | null;
}

function currentPhase(
  nowMs: number,
  currentRthCandles: readonly SpyCandle[],
): OpeningRangePhase {
  const nowMinute = getObservedMarketMinute(nowMs);
  if (nowMinute < OPENING_RANGE_START_MINUTE) return "PRE_OPEN";
  if (currentRthCandles.length === 0) return "UNAVAILABLE";
  return nowMinute < OPENING_RANGE_END_MINUTE ? "FORMING" : "COMPLETE";
}

function selectObservedOpeningRangeCandles(
  currentRthCandles: readonly SpyCandle[],
): SpyCandle[] {
  return currentRthCandles
    .filter((candle) => {
      const minute = getObservedMarketMinute(candle.timestamp);
      return minute >= OPENING_RANGE_START_MINUTE && minute < OPENING_RANGE_END_MINUTE;
    })
    .slice()
    .sort((a, b) => a.timestamp - b.timestamp);
}

function selectExactExpectedCandles(
  candles: readonly SpyCandle[],
  openingTimestamp: number,
): SpyCandle[] {
  const byTimestamp = new Map(candles.map((candle) => [candle.timestamp, candle]));
  return Array.from({ length: OPENING_RANGE_CANDLE_COUNT }, (_, index) =>
    byTimestamp.get(openingTimestamp + index * FIVE_MINUTES_MS),
  ).filter((candle): candle is SpyCandle => candle !== undefined);
}

function isContiguousExpectedPrefix(
  selected: readonly SpyCandle[],
  openingTimestamp: number,
): boolean {
  return selected.every(
    (candle, index) => candle.timestamp === openingTimestamp + index * FIVE_MINUTES_MS,
  );
}

/**
 * Select and validate the current date's fixed [09:30, 09:45) Opening Range.
 * The canonical opening-boundary helper is reused; later RTH candles can never
 * substitute for a missing 09:30 candle.
 */
export function selectOpeningRange(
  candles: readonly SpyCandle[],
  currentMarketDate: string,
  nowMs: number,
): OpeningRangeSelection {
  const currentRthCandles = selectMarketSessionCandles(
    candles,
    currentMarketDate,
    "RTH",
  ).slice().sort((a, b) => a.timestamp - b.timestamp);
  const phase = currentPhase(nowMs, currentRthCandles);
  const openingCandle = selectMarketSessionOpeningCandle(
    candles,
    currentMarketDate,
    "RTH",
  );
  const observedRangeCandles = selectObservedOpeningRangeCandles(currentRthCandles);

  if (phase === "PRE_OPEN") {
    return {
      phase,
      coverageState: "UNAVAILABLE",
      eligible: false,
      openingCandle: null,
      selectedCandles: [],
      openingRangeStartAtMs: null,
      openingRangeEndAtMs: null,
    };
  }

  if (!openingCandle) {
    return {
      phase,
      coverageState:
        currentRthCandles.length > 0 ? "PARTIAL" : "UNAVAILABLE",
      eligible: false,
      openingCandle: null,
      selectedCandles: observedRangeCandles,
      openingRangeStartAtMs: null,
      openingRangeEndAtMs: null,
    };
  }

  const openingRangeStartAtMs = openingCandle.timestamp;
  const openingRangeEndAtMs = openingRangeStartAtMs + 3 * FIVE_MINUTES_MS;
  const selectedCandles = selectExactExpectedCandles(
    observedRangeCandles,
    openingRangeStartAtMs,
  );
  const contiguousPrefix = isContiguousExpectedPrefix(
    selectedCandles,
    openingRangeStartAtMs,
  );

  if (phase === "FORMING") {
    // The existing RTH coverage analyzer requires coverage only through the
    // latest fully elapsed five-minute bucket. It therefore does not treat a
    // current/future Opening Range candle as missing prematurely.
    const throughObservation = analyzeMarketSessionCoverage(
      candles,
      currentMarketDate,
      "RTH",
      nowMs,
    );
    const eligible =
      selectedCandles.length > 0 &&
      contiguousPrefix &&
      throughObservation.state === "COMPLETE";

    return {
      phase,
      coverageState: eligible ? "COMPLETE" : throughObservation.state,
      eligible,
      openingCandle,
      selectedCandles,
      openingRangeStartAtMs,
      openingRangeEndAtMs,
    };
  }

  if (phase === "COMPLETE") {
    const eligible =
      selectedCandles.length === OPENING_RANGE_CANDLE_COUNT && contiguousPrefix;
    return {
      phase,
      coverageState: eligible ? "COMPLETE" : "PARTIAL",
      eligible,
      openingCandle,
      selectedCandles,
      openingRangeStartAtMs,
      openingRangeEndAtMs,
    };
  }

  return {
    phase,
    coverageState: "UNAVAILABLE",
    eligible: false,
    openingCandle,
    selectedCandles,
    openingRangeStartAtMs,
    openingRangeEndAtMs,
  };
}

function warningForSelection(
  accessWarning: SpyBoundedCandleAccessResult["warningCode"],
  selection: OpeningRangeSelection,
): OpeningRangeWarningCode | null {
  if (accessWarning) return accessWarning;
  if (selection.phase === "PRE_OPEN" || selection.phase === "UNAVAILABLE") {
    return null;
  }
  if (!selection.openingCandle) {
    return "OPENING_RANGE_OPENING_CANDLE_MISSING";
  }
  if (!selection.eligible) return "OPENING_RANGE_INCOMPLETE";
  return null;
}

function buildUnavailableResponse(
  access: SpyBoundedCandleAccessResult,
  nowMs: number,
): SpyOpeningRangeResponse {
  const phase: OpeningRangePhase =
    getObservedMarketMinute(nowMs) < OPENING_RANGE_START_MINUTE
      ? "PRE_OPEN"
      : "UNAVAILABLE";
  return SpyOpeningRangeResponseSchema.parse({
    symbol: "SPY",
    metric: "OPENING_RANGE_15M",
    currentMarketDate: getObservedMarketDate(nowMs),
    metricState: "UNAVAILABLE",
    candleSourceState: "MOCK",
    phase,
    openingRangeHigh: null,
    openingRangeLow: null,
    openingRangeStartAt: null,
    openingRangeEndAt: null,
    openingRangeCandleCount: 0,
    coverageState: "UNAVAILABLE",
    firstOpeningRangeCandleAt: null,
    latestOpeningRangeCandleAt: null,
    fetchedAt: new Date(nowMs).toISOString(),
    dataAgeMs: 0,
    warningCode: access.warningCode,
  });
}

/** Compose the fixed current-date Opening Range from one shared bounded snapshot. */
export function buildSpyOpeningRangeResponse(
  access: SpyBoundedCandleAccessResult,
  nowMs: number,
): SpyOpeningRangeResponse {
  if (!access.dataset) return buildUnavailableResponse(access, nowMs);

  const dataset = access.dataset;
  const currentMarketDate = getObservedMarketDate(nowMs);
  const candleSourceState: QuoteSourceState = decideCandleState(
    dataset.fetchedAtMs,
    nowMs,
  );
  const selection = selectOpeningRange(
    dataset.candles,
    currentMarketDate,
    nowMs,
  );
  const extrema = selection.eligible
    ? calculateSessionHighLow(selection.selectedCandles)
    : null;
  const metricState =
    selection.eligible && extrema !== null
      ? candleSourceState
      : "UNAVAILABLE";
  const first = selection.selectedCandles[0] ?? null;
  const latest = selection.selectedCandles.at(-1) ?? null;

  return SpyOpeningRangeResponseSchema.parse({
    symbol: "SPY",
    metric: "OPENING_RANGE_15M",
    currentMarketDate,
    metricState,
    candleSourceState,
    phase: selection.phase,
    openingRangeHigh: extrema?.high ?? null,
    openingRangeLow: extrema?.low ?? null,
    openingRangeStartAt:
      selection.openingRangeStartAtMs === null
        ? null
        : new Date(selection.openingRangeStartAtMs).toISOString(),
    openingRangeEndAt:
      selection.openingRangeEndAtMs === null
        ? null
        : new Date(selection.openingRangeEndAtMs).toISOString(),
    openingRangeCandleCount: selection.selectedCandles.length,
    coverageState: selection.coverageState,
    firstOpeningRangeCandleAt: first
      ? new Date(first.timestamp).toISOString()
      : null,
    latestOpeningRangeCandleAt: latest
      ? new Date(latest.timestamp).toISOString()
      : null,
    fetchedAt: new Date(dataset.fetchedAtMs).toISOString(),
    dataAgeMs: Math.max(0, nowMs - dataset.fetchedAtMs),
    warningCode: warningForSelection(access.warningCode, selection),
  });
}
