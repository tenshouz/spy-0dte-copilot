import {
  CANDLE_FRESHNESS_THRESHOLD_MS,
  SpySessionDataFoundationResponseSchema,
  type CandleWarningCode,
  type CoverageState,
  type ObservedMarketDateCoverage,
  type SessionWindowCoverage,
  type SpyCandle,
  type SpySessionDataFoundationResponse,
} from "@spy-copilot/shared";
import { decideCandleState, type CachedCandleDataset } from "./schwab-candles.logic";

export const SESSION_DATA_LOOKBACK_MS = 7 * 24 * 60 * 60 * 1000;
export const SESSION_DATA_SHORT_CACHE_MS = 60_000;
export const FIVE_MINUTES_MS = 5 * 60 * 1000;
export const MARKET_TIME_ZONE = "America/New_York";
const MAX_REPORTED_GAPS = 20;

export type MarketSessionName = "PREMARKET" | "RTH" | "AFTER_HOURS";

interface SessionWindowDefinition {
  name: MarketSessionName;
  startMinute: number;
  endMinute: number;
}

export const SESSION_WINDOWS: readonly SessionWindowDefinition[] = [
  { name: "PREMARKET", startMinute: 4 * 60, endMinute: 9 * 60 + 30 },
  { name: "RTH", startMinute: 9 * 60 + 30, endMinute: 16 * 60 },
  { name: "AFTER_HOURS", startMinute: 16 * 60, endMinute: 20 * 60 },
] as const;

interface NewYorkParts {
  marketDate: string;
  hour: number;
  minute: number;
  second: number;
}

const nyFormatter = new Intl.DateTimeFormat("en-US", {
  timeZone: MARKET_TIME_ZONE,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
  hourCycle: "h23",
});

function getNewYorkParts(timestampMs: number): NewYorkParts {
  const parts = nyFormatter.formatToParts(new Date(timestampMs));
  const values = new Map(parts.map((part) => [part.type, part.value]));
  const year = values.get("year");
  const month = values.get("month");
  const day = values.get("day");
  const hour = Number(values.get("hour"));
  const minute = Number(values.get("minute"));
  const second = Number(values.get("second"));
  if (!year || !month || !day || !Number.isInteger(hour) || !Number.isInteger(minute) || !Number.isInteger(second)) {
    throw new Error("Unable to convert timestamp to America/New_York parts.");
  }
  return { marketDate: `${year}-${month}-${day}`, hour, minute, second };
}

function minuteOfDay(parts: NewYorkParts): number {
  return parts.hour * 60 + parts.minute;
}

export function getObservedMarketDate(timestampMs: number): string {
  return getNewYorkParts(timestampMs).marketDate;
}

export function classifyMarketSession(timestampMs: number): MarketSessionName | null {
  const minute = minuteOfDay(getNewYorkParts(timestampMs));
  const window = SESSION_WINDOWS.find((candidate) => minute >= candidate.startMinute && minute < candidate.endMinute);
  return window?.name ?? null;
}

export interface GapDiagnostic {
  fromAt: string;
  toAt: string;
  gapMs: number;
}

export interface GapSummary {
  gapCount: number;
  largestGapMs: number;
  gaps: GapDiagnostic[];
}

export function detectTimestampGaps(candles: readonly SpyCandle[]): GapSummary {
  let gapCount = 0;
  let largestGapMs = 0;
  const gaps: GapDiagnostic[] = [];

  for (let index = 1; index < candles.length; index += 1) {
    const previous = candles[index - 1]!;
    const current = candles[index]!;
    const gapMs = current.timestamp - previous.timestamp;
    if (gapMs > FIVE_MINUTES_MS) {
      gapCount += 1;
      largestGapMs = Math.max(largestGapMs, gapMs);
      if (gaps.length < MAX_REPORTED_GAPS) {
        gaps.push({
          fromAt: new Date(previous.timestamp).toISOString(),
          toAt: new Date(current.timestamp).toISOString(),
          gapMs,
        });
      }
    }
  }

  return { gapCount, largestGapMs, gaps };
}

function expectedLastObservedMinute(
  marketDate: string,
  window: SessionWindowDefinition,
  nowMs: number,
): { status: "NOT_STARTED" | "ACTIVE" | "ENDED"; minute: number | null } {
  const now = getNewYorkParts(nowMs);
  if (marketDate < now.marketDate) {
    return { status: "ENDED", minute: window.endMinute - 5 };
  }
  if (marketDate > now.marketDate) {
    return { status: "NOT_STARTED", minute: null };
  }

  const nowMinute = minuteOfDay(now);
  if (nowMinute < window.startMinute) {
    return { status: "NOT_STARTED", minute: null };
  }
  if (nowMinute >= window.endMinute) {
    return { status: "ENDED", minute: window.endMinute - 5 };
  }

  // Latest fully elapsed five-minute bucket start. This is only an observed
  // coverage checkpoint; provider candle-boundary semantics remain explicitly
  // unverified and are reported as such in the response contract.
  const secondsSinceMidnight = nowMinute * 60 + now.second;
  const currentBucketStartMinute = Math.floor(secondsSinceMidnight / 300) * 5;
  const latestCompletedBucketStartMinute = currentBucketStartMinute - 5;
  return {
    status: "ACTIVE",
    minute: Math.max(window.startMinute, latestCompletedBucketStartMinute),
  };
}

function analyzeSessionWindow(
  marketDate: string,
  candles: readonly SpyCandle[],
  window: SessionWindowDefinition,
  nowMs: number,
): SessionWindowCoverage {
  const sessionCandles = candles.filter((candle) => {
    const parts = getNewYorkParts(candle.timestamp);
    const minute = minuteOfDay(parts);
    return parts.marketDate === marketDate && minute >= window.startMinute && minute < window.endMinute;
  });

  const gapSummary = detectTimestampGaps(sessionCandles);
  const first = sessionCandles[0] ?? null;
  const last = sessionCandles[sessionCandles.length - 1] ?? null;
  const expected = expectedLastObservedMinute(marketDate, window, nowMs);

  let state: CoverageState;
  if (!first || !last) {
    state = expected.status === "ENDED" ? "UNAVAILABLE" : "UNKNOWN";
  } else {
    const firstMinute = minuteOfDay(getNewYorkParts(first.timestamp));
    const lastMinute = minuteOfDay(getNewYorkParts(last.timestamp));

    if (firstMinute > window.startMinute) {
      // Definitively missing the beginning of the defined session window.
      state = "PARTIAL";
    } else if (gapSummary.gapCount > 0) {
      // A gap is factual, but provider no-trade omission behavior is not yet
      // proven. Do not automatically call this PARTIAL.
      state = "UNKNOWN";
    } else if (expected.status === "NOT_STARTED" || expected.minute === null) {
      state = "UNKNOWN";
    } else if (lastMinute >= expected.minute) {
      state = "COMPLETE";
    } else if (expected.status === "ENDED") {
      state = "PARTIAL";
    } else {
      state = "UNKNOWN";
    }
  }

  return {
    state,
    firstCandleAt: first ? new Date(first.timestamp).toISOString() : null,
    lastCandleAt: last ? new Date(last.timestamp).toISOString() : null,
    candleCount: sessionCandles.length,
    gapCount: gapSummary.gapCount,
    largestGapMs: gapSummary.largestGapMs,
    gaps: gapSummary.gaps,
  };
}

export function analyzeObservedMarketDates(
  candles: readonly SpyCandle[],
  nowMs: number,
): ObservedMarketDateCoverage[] {
  const grouped = new Map<string, SpyCandle[]>();
  for (const candle of candles) {
    const marketDate = getObservedMarketDate(candle.timestamp);
    const group = grouped.get(marketDate);
    if (group) group.push(candle);
    else grouped.set(marketDate, [candle]);
  }

  return [...grouped.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([marketDate, dateCandles]) => {
      const sorted = [...dateCandles].sort((a, b) => a.timestamp - b.timestamp);
      const first = sorted[0]!;
      const last = sorted[sorted.length - 1]!;
      const fullGapSummary = detectTimestampGaps(sorted);
      return {
        marketDate,
        firstCandleAt: new Date(first.timestamp).toISOString(),
        lastCandleAt: new Date(last.timestamp).toISOString(),
        candleCount: sorted.length,
        gapCount: fullGapSummary.gapCount,
        largestGapMs: fullGapSummary.largestGapMs,
        premarket: analyzeSessionWindow(marketDate, sorted, SESSION_WINDOWS[0]!, nowMs),
        rth: analyzeSessionWindow(marketDate, sorted, SESSION_WINDOWS[1]!, nowMs),
        afterHours: analyzeSessionWindow(marketDate, sorted, SESSION_WINDOWS[2]!, nowMs),
      } satisfies ObservedMarketDateCoverage;
    });
}

export function buildSessionDataRequestWindow(nowMs: number): { startDateMs: number; endDateMs: number } {
  return { startDateMs: nowMs - SESSION_DATA_LOOKBACK_MS, endDateMs: nowMs };
}

export function selectLatestDefinedMarketDate(
  candles: readonly SpyCandle[],
): string | null {
  const eligible = candles.filter((candle) => classifyMarketSession(candle.timestamp) !== null);
  if (eligible.length === 0) return null;
  return getObservedMarketDate(eligible.at(-1)!.timestamp);
}

export function selectMarketSessionCandles(
  candles: readonly SpyCandle[],
  marketDate: string,
  session: MarketSessionName,
): SpyCandle[] {
  return candles.filter(
    (candle) =>
      getObservedMarketDate(candle.timestamp) === marketDate &&
      classifyMarketSession(candle.timestamp) === session,
  );
}

export function selectLatestDefinedSessionDataset(
  dataset: CachedCandleDataset,
): CachedCandleDataset | null {
  const latestMarketDate = selectLatestDefinedMarketDate(dataset.candles);
  if (latestMarketDate === null) return null;

  // Keep every defined session for the selected date so the existing chart
  // can display Premarket + RTH + After-Hours while excluding overnight data.
  const candles = dataset.candles.filter(
    (candle) =>
      getObservedMarketDate(candle.timestamp) === latestMarketDate &&
      classifyMarketSession(candle.timestamp) !== null,
  );
  const newest = candles.at(-1) ?? null;

  return {
    candles,
    latestCandleAt: newest ? new Date(newest.timestamp).toISOString() : null,
    fetchedAtMs: dataset.fetchedAtMs,
  };
}

export function toSpySessionDataFoundationResponse(
  dataset: CachedCandleDataset,
  requestedStartAtMs: number,
  requestedEndAtMs: number,
  nowMs: number,
  warningCode: CandleWarningCode | null,
): SpySessionDataFoundationResponse {
  const observedDates = analyzeObservedMarketDates(dataset.candles, nowMs);
  const currentObservedMarketDate = observedDates.at(-1)?.marketDate ?? null;
  const previousObservedMarketDate = observedDates.at(-2)?.marketDate ?? null;
  const first = dataset.candles[0] ?? null;
  const last = dataset.candles.at(-1) ?? null;

  return SpySessionDataFoundationResponseSchema.parse({
    symbol: "SPY",
    timeframe: "5m",
    sourceState: decideCandleState(dataset.fetchedAtMs, nowMs),
    fetchedAt: new Date(dataset.fetchedAtMs).toISOString(),
    dataAgeMs: Math.max(0, nowMs - dataset.fetchedAtMs),
    requestStrategy: "EXPLICIT_BOUNDED_WINDOW",
    requestedStartAt: new Date(requestedStartAtMs).toISOString(),
    requestedEndAt: new Date(requestedEndAtMs).toISOString(),
    firstCandleAt: first ? new Date(first.timestamp).toISOString() : null,
    lastCandleAt: last ? new Date(last.timestamp).toISOString() : null,
    candleCount: dataset.candles.length,
    extendedHoursRequested: true,
    timestampSemantics: "PROVIDER_TIMESTAMP_UNVERIFIED",
    currentObservedMarketDate,
    previousObservedMarketDate,
    observedDates,
    warningCode,
  });
}

export function toUnavailableSessionDataFoundationResponse(
  requestedStartAtMs: number,
  requestedEndAtMs: number,
  nowMs: number,
  warningCode: CandleWarningCode,
): SpySessionDataFoundationResponse {
  return SpySessionDataFoundationResponseSchema.parse({
    symbol: "SPY",
    timeframe: "5m",
    sourceState: "MOCK",
    fetchedAt: new Date(nowMs).toISOString(),
    dataAgeMs: 0,
    requestStrategy: "EXPLICIT_BOUNDED_WINDOW",
    requestedStartAt: new Date(requestedStartAtMs).toISOString(),
    requestedEndAt: new Date(requestedEndAtMs).toISOString(),
    firstCandleAt: null,
    lastCandleAt: null,
    candleCount: 0,
    extendedHoursRequested: true,
    timestampSemantics: "PROVIDER_TIMESTAMP_UNVERIFIED",
    currentObservedMarketDate: null,
    previousObservedMarketDate: null,
    observedDates: [],
    warningCode,
  });
}

export { CANDLE_FRESHNESS_THRESHOLD_MS };
