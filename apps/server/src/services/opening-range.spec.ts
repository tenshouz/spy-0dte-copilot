/**
 * Deterministic tests for the fixed Live 15-Minute Opening Range.
 * No Prisma, OAuth, credentials, or live network calls.
 *
 * Run:
 *   npx --no-install tsx apps/server/src/services/opening-range.spec.ts
 */
import assert from "node:assert/strict";
import type { SpyCandle } from "@spy-copilot/shared";
import { normalizeRawSpyCandles, type CachedCandleDataset } from "./schwab-candles.logic";
import {
  buildSpyOpeningRangeResponse,
  selectOpeningRange,
} from "./opening-range.logic";
import type { SpyBoundedCandleAccessResult } from "./session-data.service";

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

function candle(
  timestamp: number,
  overrides: Partial<Omit<SpyCandle, "timestamp">> = {},
): SpyCandle {
  return {
    timestamp,
    open: 100,
    high: 101,
    low: 99,
    close: 100,
    volume: 100,
    ...overrides,
  };
}

function access(
  candles: SpyCandle[],
  fetchedAtMs: number,
  warningCode: SpyBoundedCandleAccessResult["warningCode"] = null,
): SpyBoundedCandleAccessResult {
  const sorted = [...candles].sort((a, b) => a.timestamp - b.timestamp);
  const latest = sorted.at(-1) ?? null;
  const dataset: CachedCandleDataset = {
    candles: sorted,
    fetchedAtMs,
    latestCandleAt: latest ? new Date(latest.timestamp).toISOString() : null,
  };
  return {
    dataset,
    requestedStartAtMs: fetchedAtMs - 7 * 24 * 60 * 60 * 1000,
    requestedEndAtMs: fetchedAtMs,
    warningCode,
  };
}

const EDT_0925 = Date.parse("2026-07-15T13:25:00.000Z");
const EDT_0930 = Date.parse("2026-07-15T13:30:00.000Z");
const EDT_0935 = Date.parse("2026-07-15T13:35:00.000Z");
const EDT_0940 = Date.parse("2026-07-15T13:40:00.000Z");
const EDT_0945 = Date.parse("2026-07-15T13:45:00.000Z");
const EDT_AFTER_CLOSE = Date.parse("2026-07-15T21:00:00.000Z");

function openingRangeCandles(): SpyCandle[] {
  return [
    candle(EDT_0930, { open: 100, high: 102, low: 99, close: 101 }),
    candle(EDT_0935, { open: 101, high: 103, low: 100, close: 102 }),
    candle(EDT_0940, { open: 102, high: 102.5, low: 98, close: 99 }),
  ];
}

// --- EXACT BOUNDARIES / DATE TARGETING -------------------------------------

test("fixed EDT range includes 09:30, 09:35, 09:40 and excludes boundaries outside", () => {
  const candles = [
    candle(EDT_0925, { high: 999 }),
    ...openingRangeCandles(),
    candle(EDT_0945, { low: 1 }),
  ];
  const selected = selectOpeningRange(
    candles,
    "2026-07-15",
    Date.parse("2026-07-15T13:46:00.000Z"),
  );
  assert.equal(selected.eligible, true);
  assert.deepEqual(
    selected.selectedCandles.map((item) => item.timestamp),
    [EDT_0930, EDT_0935, EDT_0940],
  );
});

test("EST opening boundary follows New York time rather than fixed UTC", () => {
  const candles = [
    candle(Date.parse("2026-01-15T14:30:00.000Z")),
    candle(Date.parse("2026-01-15T14:35:00.000Z")),
    candle(Date.parse("2026-01-15T14:40:00.000Z")),
  ];
  const selected = selectOpeningRange(
    candles,
    "2026-01-15",
    Date.parse("2026-01-15T14:46:00.000Z"),
  );
  assert.equal(selected.eligible, true);
  assert.equal(selected.openingRangeStartAtMs, Date.parse("2026-01-15T14:30:00.000Z"));
});

test("previous-date candles never contribute to current Opening Range", () => {
  const prior = openingRangeCandles().map((item) => ({
    ...item,
    timestamp: item.timestamp - 24 * 60 * 60 * 1000,
    high: 999,
    low: 1,
  }));
  const out = buildSpyOpeningRangeResponse(
    access([...prior, ...openingRangeCandles()], EDT_AFTER_CLOSE - 500),
    EDT_AFTER_CLOSE,
  );
  assert.equal(out.openingRangeHigh, 103);
  assert.equal(out.openingRangeLow, 98);
});

test("new New York date before open does not reuse prior Opening Range", () => {
  const nextDayBeforeOpen = Date.parse("2026-07-16T12:00:00.000Z");
  const out = buildSpyOpeningRangeResponse(
    access(openingRangeCandles(), nextDayBeforeOpen - 500),
    nextDayBeforeOpen,
  );
  assert.equal(out.currentMarketDate, "2026-07-16");
  assert.equal(out.phase, "PRE_OPEN");
  assert.equal(out.metricState, "UNAVAILABLE");
  assert.equal(out.openingRangeHigh, null);
});

test("weekend after RTH start remains unavailable without historical fallback", () => {
  const saturday = Date.parse("2026-07-18T15:00:00.000Z");
  const out = buildSpyOpeningRangeResponse(
    access(openingRangeCandles(), saturday - 500),
    saturday,
  );
  assert.equal(out.currentMarketDate, "2026-07-18");
  assert.equal(out.phase, "UNAVAILABLE");
  assert.equal(out.metricState, "UNAVAILABLE");
});

// --- PRE-OPEN / FORMING ----------------------------------------------------

test("before 09:30 is PRE_OPEN with null values", () => {
  const out = buildSpyOpeningRangeResponse(
    access([], EDT_0925 - 500),
    EDT_0925,
  );
  assert.equal(out.phase, "PRE_OPEN");
  assert.equal(out.coverageState, "UNAVAILABLE");
  assert.equal(out.openingRangeCandleCount, 0);
  assert.equal(out.openingRangeHigh, null);
  assert.equal(out.openingRangeLow, null);
});

test("one opening candle forms an eligible provisional range", () => {
  const now = Date.parse("2026-07-15T13:33:00.000Z");
  const out = buildSpyOpeningRangeResponse(
    access([openingRangeCandles()[0]!], now - 500),
    now,
  );
  assert.equal(out.phase, "FORMING");
  assert.equal(out.coverageState, "COMPLETE");
  assert.equal(out.metricState, "LIVE");
  assert.equal(out.openingRangeCandleCount, 1);
  assert.equal(out.openingRangeHigh, 102);
  assert.equal(out.openingRangeLow, 99);
});

test("two contiguous candles form an eligible provisional range", () => {
  const now = Date.parse("2026-07-15T13:38:00.000Z");
  const out = buildSpyOpeningRangeResponse(
    access(openingRangeCandles().slice(0, 2), now - 500),
    now,
  );
  assert.equal(out.phase, "FORMING");
  assert.equal(out.coverageState, "COMPLETE");
  assert.equal(out.openingRangeCandleCount, 2);
  assert.equal(out.openingRangeHigh, 103);
  assert.equal(out.openingRangeLow, 99);
});

test("three candles can remain FORMING before the 09:45 boundary", () => {
  const now = Date.parse("2026-07-15T13:43:00.000Z");
  const out = buildSpyOpeningRangeResponse(
    access(openingRangeCandles(), now - 500),
    now,
  );
  assert.equal(out.phase, "FORMING");
  assert.equal(out.metricState, "LIVE");
  assert.equal(out.openingRangeCandleCount, 3);
  assert.equal(out.openingRangeLow, 98);
});

test("a future current candle is not treated as missing during formation", () => {
  const now = Date.parse("2026-07-15T13:43:00.000Z");
  const out = buildSpyOpeningRangeResponse(
    access(openingRangeCandles().slice(0, 2), now - 500),
    now,
  );
  assert.equal(out.coverageState, "COMPLETE");
  assert.equal(out.metricState, "LIVE");
  assert.equal(out.openingRangeCandleCount, 2);
});

test("an old prefix becomes unavailable once coverage through observation is missing", () => {
  const now = Date.parse("2026-07-15T13:44:00.000Z");
  const out = buildSpyOpeningRangeResponse(
    access([openingRangeCandles()[0]!], now - 500),
    now,
  );
  assert.equal(out.phase, "FORMING");
  assert.equal(out.metricState, "UNAVAILABLE");
  assert.equal(out.coverageState, "UNKNOWN");
  assert.equal(out.warningCode, "OPENING_RANGE_INCOMPLETE");
});

test("internal missing 09:35 candle invalidates forming extrema", () => {
  const now = Date.parse("2026-07-15T13:43:00.000Z");
  const out = buildSpyOpeningRangeResponse(
    access([openingRangeCandles()[0]!, openingRangeCandles()[2]!], now - 500),
    now,
  );
  assert.equal(out.phase, "FORMING");
  assert.equal(out.metricState, "UNAVAILABLE");
  assert.equal(out.coverageState, "UNKNOWN");
  assert.equal(out.openingRangeHigh, null);
});

test("missing 09:30 candle cannot be replaced by 09:35", () => {
  const now = Date.parse("2026-07-15T13:38:00.000Z");
  const out = buildSpyOpeningRangeResponse(
    access([openingRangeCandles()[1]!], now - 500),
    now,
  );
  assert.equal(out.phase, "FORMING");
  assert.equal(out.metricState, "UNAVAILABLE");
  assert.equal(out.coverageState, "PARTIAL");
  assert.equal(out.warningCode, "OPENING_RANGE_OPENING_CANDLE_MISSING");
});

// --- COMPLETE / FREEZE -----------------------------------------------------

test("at 09:45 all three exact candles produce COMPLETE final extrema", () => {
  const out = buildSpyOpeningRangeResponse(
    access(openingRangeCandles(), EDT_0945 - 500),
    EDT_0945,
  );
  assert.equal(out.phase, "COMPLETE");
  assert.equal(out.coverageState, "COMPLETE");
  assert.equal(out.metricState, "LIVE");
  assert.equal(out.openingRangeHigh, 103);
  assert.equal(out.openingRangeLow, 98);
  assert.equal(out.openingRangeCandleCount, 3);
});

test("09:45 and later RTH candles do not alter the completed range", () => {
  const later = [
    candle(EDT_0945, { high: 999, low: 1 }),
    candle(Date.parse("2026-07-15T15:00:00.000Z"), { high: 888, low: 2 }),
  ];
  const out = buildSpyOpeningRangeResponse(
    access([...openingRangeCandles(), ...later], EDT_AFTER_CLOSE - 500),
    EDT_AFTER_CLOSE,
  );
  assert.equal(out.openingRangeHigh, 103);
  assert.equal(out.openingRangeLow, 98);
  assert.equal(out.latestOpeningRangeCandleAt, "2026-07-15T13:40:00.000Z");
});

test("after-hours candles do not alter completed extrema", () => {
  const afterHours = candle(Date.parse("2026-07-15T20:00:00.000Z"), {
    high: 999,
    low: 1,
  });
  const out = buildSpyOpeningRangeResponse(
    access([...openingRangeCandles(), afterHours], EDT_AFTER_CLOSE - 500),
    EDT_AFTER_CLOSE,
  );
  assert.equal(out.openingRangeHigh, 103);
  assert.equal(out.openingRangeLow, 98);
});

test("completed range missing 09:35 is unavailable", () => {
  const out = buildSpyOpeningRangeResponse(
    access([openingRangeCandles()[0]!, openingRangeCandles()[2]!], EDT_AFTER_CLOSE - 500),
    EDT_AFTER_CLOSE,
  );
  assert.equal(out.phase, "COMPLETE");
  assert.equal(out.metricState, "UNAVAILABLE");
  assert.equal(out.coverageState, "PARTIAL");
  assert.equal(out.openingRangeHigh, null);
});

test("completed range missing 09:40 is unavailable", () => {
  const out = buildSpyOpeningRangeResponse(
    access(openingRangeCandles().slice(0, 2), EDT_AFTER_CLOSE - 500),
    EDT_AFTER_CLOSE,
  );
  assert.equal(out.phase, "COMPLETE");
  assert.equal(out.metricState, "UNAVAILABLE");
  assert.equal(out.coverageState, "PARTIAL");
});

// --- PROVENANCE / CONTRACT -------------------------------------------------

test("boundary and observed timestamps are exposed separately", () => {
  const out = buildSpyOpeningRangeResponse(
    access(openingRangeCandles(), EDT_AFTER_CLOSE - 500),
    EDT_AFTER_CLOSE,
  );
  assert.equal(out.openingRangeStartAt, "2026-07-15T13:30:00.000Z");
  assert.equal(out.openingRangeEndAt, "2026-07-15T13:45:00.000Z");
  assert.equal(out.firstOpeningRangeCandleAt, "2026-07-15T13:30:00.000Z");
  assert.equal(out.latestOpeningRangeCandleAt, "2026-07-15T13:40:00.000Z");
});

test("STALE source can only produce STALE Opening Range", () => {
  const out = buildSpyOpeningRangeResponse(
    access(openingRangeCandles(), EDT_AFTER_CLOSE - 120_000),
    EDT_AFTER_CLOSE,
  );
  assert.equal(out.candleSourceState, "STALE");
  assert.equal(out.metricState, "STALE");
});

test("missing bounded dataset does not fabricate a mock Opening Range", () => {
  const out = buildSpyOpeningRangeResponse(
    {
      dataset: null,
      requestedStartAtMs: EDT_AFTER_CLOSE - 1_000,
      requestedEndAtMs: EDT_AFTER_CLOSE,
      warningCode: "NOT_CONNECTED",
    },
    EDT_AFTER_CLOSE,
  );
  assert.equal(out.candleSourceState, "MOCK");
  assert.equal(out.metricState, "UNAVAILABLE");
  assert.equal(out.openingRangeHigh, null);
  assert.equal(out.warningCode, "NOT_CONNECTED");
});

test("same-timestamp opening revision is normalized before extrema calculation", () => {
  const normalized = normalizeRawSpyCandles(
    {
      candles: [
        { open: 100, high: 101, low: 99, close: 100, volume: 100, datetime: EDT_0930 },
        { open: 100, high: 104, low: 98, close: 103, volume: 200, datetime: EDT_0930 },
        { open: 103, high: 105, low: 102, close: 104, volume: 100, datetime: EDT_0935 },
        { open: 104, high: 104, low: 97, close: 98, volume: 100, datetime: EDT_0940 },
      ],
    },
    EDT_AFTER_CLOSE,
  );
  assert.ok(normalized);
  const out = buildSpyOpeningRangeResponse(
    access(normalized.candles, EDT_AFTER_CLOSE - 500),
    EDT_AFTER_CLOSE,
  );
  assert.equal(out.openingRangeHigh, 105);
  assert.equal(out.openingRangeLow, 97);
  assert.equal(out.openingRangeCandleCount, 3);
});

test("upstream warning is retained with an otherwise eligible stale/live result", () => {
  const out = buildSpyOpeningRangeResponse(
    access(openingRangeCandles(), EDT_AFTER_CLOSE - 500, "RATE_LIMITED"),
    EDT_AFTER_CLOSE,
  );
  assert.equal(out.metricState, "LIVE");
  assert.equal(out.warningCode, "RATE_LIMITED");
});

console.log(`\n${passed} passed, ${failed} failed (${passed + failed} total)`);
if (failed > 0) process.exitCode = 1;
