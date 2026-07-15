/**
 * Deterministic tests for the pure Session Data Foundation logic and request
 * construction. No Prisma, OAuth, credentials, or live network calls.
 *
 * Run:
 *   npx --no-install tsx apps/server/src/services/session-data.spec.ts
 */
import assert from "node:assert/strict";
import type { SpyCandle } from "@spy-copilot/shared";
import { buildSpyPriceHistoryUrl } from "./schwab-price-history.client";
import {
  FIVE_MINUTES_MS,
  SESSION_DATA_LOOKBACK_MS,
  analyzeObservedMarketDates,
  buildSessionDataRequestWindow,
  classifyMarketSession,
  detectTimestampGaps,
  getObservedMarketDate,
  toSpySessionDataFoundationResponse,
} from "./session-data.logic";

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

function candle(timestamp: number): SpyCandle {
  return { timestamp, open: 750, high: 751, low: 749, close: 750.5, volume: 1000 };
}

function range(startMs: number, endMsInclusive: number): SpyCandle[] {
  const out: SpyCandle[] = [];
  for (let timestamp = startMs; timestamp <= endMsInclusive; timestamp += FIVE_MINUTES_MS) {
    out.push(candle(timestamp));
  }
  return out;
}

function sessionState(
  candles: SpyCandle[],
  marketDate: string,
  session: "premarket" | "rth" | "afterHours",
  nowMs: number,
) {
  const date = analyzeObservedMarketDates(candles, nowMs).find((item) => item.marketDate === marketDate);
  assert.ok(date, `missing observed date ${marketDate}`);
  return date[session];
}

// --- REQUEST CONSTRUCTION ----------------------------------------------------

test("bounded request uses fixed SPY 5-minute extended-hours parameters", () => {
  const startDateMs = Date.parse("2026-07-08T05:00:00.000Z");
  const endDateMs = Date.parse("2026-07-15T05:00:00.000Z");
  const url = new URL(buildSpyPriceHistoryUrl({ kind: "bounded", startDateMs, endDateMs }));
  assert.equal(url.pathname, "/marketdata/v1/pricehistory");
  assert.equal(url.searchParams.get("symbol"), "SPY");
  assert.equal(url.searchParams.get("frequencyType"), "minute");
  assert.equal(url.searchParams.get("frequency"), "5");
  assert.equal(url.searchParams.get("needExtendedHoursData"), "true");
  assert.equal(url.searchParams.get("startDate"), String(startDateMs));
  assert.equal(url.searchParams.get("endDate"), String(endDateMs));
  assert.equal(url.searchParams.has("periodType"), false);
  assert.equal(url.searchParams.has("period"), false);
});

test("chart request preserves the existing one-day request shape", () => {
  const url = new URL(buildSpyPriceHistoryUrl({ kind: "chart" }));
  assert.equal(url.searchParams.get("periodType"), "day");
  assert.equal(url.searchParams.get("period"), "1");
  assert.equal(url.searchParams.has("startDate"), false);
  assert.equal(url.searchParams.has("endDate"), false);
});

test("bounded request rejects invalid date ranges", () => {
  assert.throws(() => buildSpyPriceHistoryUrl({ kind: "bounded", startDateMs: 1000, endDateMs: 1000 }));
});

test("foundation request window is exactly seven calendar days", () => {
  const nowMs = Date.parse("2026-07-15T05:00:00.000Z");
  const window = buildSessionDataRequestWindow(nowMs);
  assert.equal(window.endDateMs, nowMs);
  assert.equal(window.endDateMs - window.startDateMs, SESSION_DATA_LOOKBACK_MS);
});

// --- TIMEZONE + SESSION BOUNDARIES ------------------------------------------

test("New York date grouping can differ from UTC date", () => {
  assert.equal(getObservedMarketDate(Date.parse("2026-07-15T00:30:00.000Z")), "2026-07-14");
});

test("EDT 04:00 boundary is premarket", () => {
  assert.equal(classifyMarketSession(Date.parse("2026-07-15T08:00:00.000Z")), "PREMARKET");
});

test("EST 04:00 boundary is premarket", () => {
  assert.equal(classifyMarketSession(Date.parse("2026-01-15T09:00:00.000Z")), "PREMARKET");
});

test("session boundaries are half-open in America/New_York", () => {
  assert.equal(classifyMarketSession(Date.parse("2026-07-15T07:59:59.000Z")), null); // 03:59:59 ET
  assert.equal(classifyMarketSession(Date.parse("2026-07-15T08:00:00.000Z")), "PREMARKET");
  assert.equal(classifyMarketSession(Date.parse("2026-07-15T13:29:59.000Z")), "PREMARKET");
  assert.equal(classifyMarketSession(Date.parse("2026-07-15T13:30:00.000Z")), "RTH");
  assert.equal(classifyMarketSession(Date.parse("2026-07-15T19:59:59.000Z")), "RTH");
  assert.equal(classifyMarketSession(Date.parse("2026-07-15T20:00:00.000Z")), "AFTER_HOURS");
  assert.equal(classifyMarketSession(Date.parse("2026-07-15T23:59:59.000Z")), "AFTER_HOURS");
  assert.equal(classifyMarketSession(Date.parse("2026-07-16T00:00:00.000Z")), null);
});

// --- COVERAGE ---------------------------------------------------------------

const PAST_NOW = Date.parse("2026-07-16T02:00:00.000Z"); // Jul 15, 22:00 ET
const JUL15_PREMARKET_START = Date.parse("2026-07-15T08:00:00.000Z"); // 04:00 ET
const JUL15_PREMARKET_LAST = Date.parse("2026-07-15T13:25:00.000Z"); // 09:25 ET
const JUL15_0700 = Date.parse("2026-07-15T11:00:00.000Z");

test("full contiguous observed premarket boundaries are COMPLETE", () => {
  const state = sessionState(range(JUL15_PREMARKET_START, JUL15_PREMARKET_LAST), "2026-07-15", "premarket", PAST_NOW);
  assert.equal(state.state, "COMPLETE");
});

test("definite 07:00 start for required 04:00 premarket is PARTIAL", () => {
  const state = sessionState(range(JUL15_0700, JUL15_PREMARKET_LAST), "2026-07-15", "premarket", PAST_NOW);
  assert.equal(state.state, "PARTIAL");
});

test("no past-session candles are UNAVAILABLE", () => {
  const rthStart = Date.parse("2026-07-15T13:30:00.000Z");
  const state = sessionState([candle(rthStart)], "2026-07-15", "premarket", PAST_NOW);
  assert.equal(state.state, "UNAVAILABLE");
});

test("an active session with no observed bars yet is UNKNOWN, not UNAVAILABLE", () => {
  const nowMs = Date.parse("2026-07-15T13:31:00.000Z"); // 09:31 ET
  const afterHoursCandle = candle(Date.parse("2026-07-15T20:00:00.000Z"));
  const state = sessionState([afterHoursCandle], "2026-07-15", "rth", nowMs);
  assert.equal(state.state, "UNKNOWN");
});

test("an ambiguous internal timestamp gap yields UNKNOWN rather than PARTIAL", () => {
  const candles = range(JUL15_PREMARKET_START, JUL15_PREMARKET_LAST).filter(
    (item) => item.timestamp !== JUL15_PREMARKET_START + 30 * 60 * 1000,
  );
  const state = sessionState(candles, "2026-07-15", "premarket", PAST_NOW);
  assert.equal(state.state, "UNKNOWN");
  assert.equal(state.gapCount, 1);
});

test("current RTH can be COMPLETE through the latest fully elapsed bucket", () => {
  const nowMs = Date.parse("2026-07-15T15:02:00.000Z"); // 11:02 ET
  const start = Date.parse("2026-07-15T13:30:00.000Z"); // 09:30 ET
  const lastCompleted = Date.parse("2026-07-15T14:55:00.000Z"); // 10:55 ET
  const state = sessionState(range(start, lastCompleted), "2026-07-15", "rth", nowMs);
  assert.equal(state.state, "COMPLETE");
});

test("LIVE source does not imply COMPLETE coverage", () => {
  const fetchedAtMs = Date.parse("2026-07-15T14:00:00.000Z");
  const candles = range(JUL15_0700, JUL15_PREMARKET_LAST);
  const response = toSpySessionDataFoundationResponse(
    { candles, latestCandleAt: new Date(candles.at(-1)!.timestamp).toISOString(), fetchedAtMs },
    fetchedAtMs - SESSION_DATA_LOOKBACK_MS,
    fetchedAtMs,
    fetchedAtMs,
    null,
  );
  assert.equal(response.sourceState, "LIVE");
  assert.equal(response.observedDates[0]!.premarket.state, "PARTIAL");
});

// --- OBSERVED DATES + GAPS --------------------------------------------------

test("Friday plus Monday selects Friday as previous observed market date", () => {
  const friday = candle(Date.parse("2026-07-10T13:30:00.000Z"));
  const monday = candle(Date.parse("2026-07-13T13:30:00.000Z"));
  const fetchedAtMs = Date.parse("2026-07-13T15:00:00.000Z");
  const response = toSpySessionDataFoundationResponse(
    { candles: [friday, monday], latestCandleAt: new Date(monday.timestamp).toISOString(), fetchedAtMs },
    fetchedAtMs - SESSION_DATA_LOOKBACK_MS,
    fetchedAtMs,
    fetchedAtMs,
    null,
  );
  assert.equal(response.currentObservedMarketDate, "2026-07-13");
  assert.equal(response.previousObservedMarketDate, "2026-07-10");
});

test("gap diagnostics detect factual gaps without synthesizing candles", () => {
  const candles = [candle(JUL15_PREMARKET_START), candle(JUL15_PREMARKET_START + 10 * 60 * 1000)];
  const gaps = detectTimestampGaps(candles);
  assert.equal(gaps.gapCount, 1);
  assert.equal(gaps.largestGapMs, 10 * 60 * 1000);
  assert.equal(candles.length, 2);
});

test("observed dates are sorted chronologically", () => {
  const dates = analyzeObservedMarketDates(
    [
      candle(Date.parse("2026-07-15T13:30:00.000Z")),
      candle(Date.parse("2026-07-14T13:30:00.000Z")),
    ],
    PAST_NOW,
  );
  assert.deepEqual(dates.map((item) => item.marketDate), ["2026-07-14", "2026-07-15"]);
});

console.log(`\n${passed} passed, ${failed} failed (${passed + failed} total)`);
if (failed > 0) process.exit(1);
