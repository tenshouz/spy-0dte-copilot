/**
 * Deterministic tests for the PURE candle logic — sanitized fixtures only.
 * Imports ONLY schwab-candles.logic.ts: no Prisma, no OAuth service, no
 * network, no infrastructure initialization.
 *
 * Run locally (tsx is already a dev dependency; no test framework added):
 *
 *   npx --no-install tsx apps/server/src/services/schwab-candles.spec.ts
 *
 * Exits non-zero on any assertion failure.
 */
import assert from "node:assert/strict";
import {
  CANDLE_FRESHNESS_THRESHOLD_MS,
  decideCandleState,
  normalizeRawSpyCandles,
  toMockSpyCandleResponse,
  toSpyCandleResponse,
} from "./schwab-candles.logic";

const NOW = 1_750_000_000_000;
const T0 = 1_749_990_000_000; // fixture candle start times (5-minute spacing)
const T1 = T0 + 300_000;
const T2 = T0 + 600_000;

function candle(datetime: number, overrides: Record<string, unknown> = {}) {
  return { open: 610.0, high: 611.5, low: 609.5, close: 611.0, volume: 120_000, datetime, ...overrides };
}

const validFixture = {
  symbol: "SPY",
  empty: false,
  candles: [candle(T0), candle(T1), candle(T2)],
  unrelatedProviderField: "ignored",
};

let passed = 0;
let failed = 0;
function test(name: string, fn: () => void) {
  try {
    fn();
    passed++;
    console.log(`PASS ${name}`);
  } catch (err) {
    failed++;
    console.error(`FAIL ${name}: ${(err as Error).message}`);
  }
}

// --- RAW / DOMAIN VALIDATION -------------------------------------------------

test("valid response accepted and fields map correctly", () => {
  const d = normalizeRawSpyCandles(validFixture, NOW);
  assert.ok(d);
  assert.equal(d.candles.length, 3);
  assert.deepEqual(d.candles[0], { timestamp: T0, open: 610, high: 611.5, low: 609.5, close: 611, volume: 120_000 });
  assert.equal(d.fetchedAtMs, NOW);
});

test("missing candle collection rejected", () => {
  assert.throws(() => normalizeRawSpyCandles({ symbol: "SPY" }, NOW));
});

test("positively identified non-SPY provider payload is rejected", () => {
  assert.throws(() => normalizeRawSpyCandles({ symbol: "QQQ", candles: [candle(T0)] }, NOW));
});

test("missing open/high/low/close/volume each rejected", () => {
  for (const field of ["open", "high", "low", "close", "volume"]) {
    const bad = { ...candle(T0) } as Record<string, unknown>;
    delete bad[field];
    assert.throws(() => normalizeRawSpyCandles({ candles: [bad] }, NOW), `missing ${field}`);
  }
});

test("invalid numeric type rejected (string price)", () => {
  assert.throws(() => normalizeRawSpyCandles({ candles: [candle(T0, { close: "611.0" })] }, NOW));
});

test("zero/negative prices rejected", () => {
  assert.throws(() => normalizeRawSpyCandles({ candles: [candle(T0, { open: 0 })] }, NOW));
  assert.throws(() => normalizeRawSpyCandles({ candles: [candle(T0, { low: -1, close: -1, open: -1, high: -1 })] }, NOW));
});

test("negative volume rejected", () => {
  assert.throws(() => normalizeRawSpyCandles({ candles: [candle(T0, { volume: -5 })] }, NOW));
});

test("fractional volume rejected", () => {
  assert.throws(() => normalizeRawSpyCandles({ candles: [candle(T0, { volume: 100.5 })] }, NOW));
});

test("invalid timestamp type rejected", () => {
  assert.throws(() => normalizeRawSpyCandles({ candles: [candle(T0, { datetime: "monday" })] }, NOW));
  assert.throws(() => normalizeRawSpyCandles({ candles: [candle(T0, { datetime: T0 + 0.5 })] }, NOW));
});

test("out-of-range timestamp rejected", () => {
  assert.throws(() => normalizeRawSpyCandles({ candles: [candle(T0, { datetime: 8_640_000_000_000_001 })] }, NOW));
  assert.throws(() => normalizeRawSpyCandles({ candles: [candle(T0, { datetime: -1 })] }, NOW));
});

test("invalid OHLC relationships rejected", () => {
  assert.throws(() => normalizeRawSpyCandles({ candles: [candle(T0, { high: 609.0 })] }, NOW)); // high < low
  assert.throws(() => normalizeRawSpyCandles({ candles: [candle(T0, { open: 612.0 })] }, NOW)); // open > high
  assert.throws(() => normalizeRawSpyCandles({ candles: [candle(T0, { close: 608.0 })] }, NOW)); // close < low
});

test("one malformed candle rejects the ENTIRE dataset", () => {
  assert.throws(() =>
    normalizeRawSpyCandles({ candles: [candle(T0), candle(T1, { volume: -1 }), candle(T2)] }, NOW),
  );
});

test("empty provider dataset returns null (never [] as LIVE)", () => {
  assert.equal(normalizeRawSpyCandles({ symbol: "SPY", empty: true, candles: [] }, NOW), null);
});

// --- NORMALIZATION -------------------------------------------------------------

test("chronological ascending sort", () => {
  const d = normalizeRawSpyCandles({ candles: [candle(T2), candle(T0), candle(T1)] }, NOW);
  assert.ok(d);
  assert.deepEqual(d.candles.map((c) => c.timestamp), [T0, T1, T2]);
});

test("duplicate timestamps removed — one candle per timestamp", () => {
  const d = normalizeRawSpyCandles({ candles: [candle(T0), candle(T1), candle(T1)] }, NOW);
  assert.ok(d);
  assert.equal(d.candles.length, 2);
  const stamps = new Set(d.candles.map((c) => c.timestamp));
  assert.equal(stamps.size, d.candles.length);
});

test("last duplicate occurrence wins (forming-candle revision)", () => {
  const d = normalizeRawSpyCandles(
    { candles: [candle(T1, { close: 610.2 }), candle(T1, { close: 611.4 })] },
    NOW,
  );
  assert.ok(d);
  assert.equal(d.candles.length, 1);
  assert.equal(d.candles[0]!.close, 611.4);
});

test("latestCandleAt reflects the newest candle after sort/dedup", () => {
  const d = normalizeRawSpyCandles({ candles: [candle(T2), candle(T0)] }, NOW);
  assert.ok(d);
  assert.equal(d.latestCandleAt, new Date(T2).toISOString());
});

test("unknown provider fields do not leak into the normalized model", () => {
  const d = normalizeRawSpyCandles({ candles: [candle(T0, { weirdVendorField: 42 })] }, NOW);
  assert.ok(d);
  assert.deepEqual(Object.keys(d.candles[0]!).sort(), ["close", "high", "low", "open", "timestamp", "volume"]);
});

// --- SOURCE STATE ---------------------------------------------------------------

test("successful fetch within threshold → LIVE", () => {
  assert.equal(decideCandleState(NOW - CANDLE_FRESHNESS_THRESHOLD_MS, NOW), "LIVE");
});

test("beyond threshold → STALE", () => {
  assert.equal(decideCandleState(NOW - CANDLE_FRESHNESS_THRESHOLD_MS - 1, NOW), "STALE");
});

test("old latestCandleAt does NOT force STALE when fetchedAt is fresh (weekend rule)", () => {
  const fridayCandles = { candles: [candle(NOW - 3 * 24 * 3_600_000)] }; // 3-day-old market data
  const d = normalizeRawSpyCandles(fridayCandles, NOW);
  assert.ok(d);
  const out = toSpyCandleResponse(d, NOW + 1_000, null);
  assert.equal(out.sourceState, "LIVE"); // freshness from fetchedAt only
});

test("temporary failure within threshold → retained LIVE with warning", () => {
  const d = normalizeRawSpyCandles(validFixture, NOW - 40_000);
  assert.ok(d);
  const out = toSpyCandleResponse(d, NOW, "NETWORK_ERROR");
  assert.equal(out.sourceState, "LIVE");
  assert.equal(out.warningCode, "NETWORK_ERROR");
});

test("temporary failure beyond threshold → STALE, fetchedAt preserved, response-time age", () => {
  const d = normalizeRawSpyCandles(validFixture, NOW - 80_000);
  assert.ok(d);
  // 80s old at request start (LIVE); slow 15s operation later → 95s → STALE.
  const out = toSpyCandleResponse(d, NOW + 15_000, "TIMEOUT");
  assert.equal(out.sourceState, "STALE");
  assert.equal(out.dataAgeMs, 95_000);
  assert.equal(out.fetchedAt, new Date(NOW - 80_000).toISOString());
});

test("real envelope reports extended-hours ingestion and passes the shared contract", () => {
  const d = normalizeRawSpyCandles(validFixture, NOW);
  assert.ok(d);
  const out = toSpyCandleResponse(d, NOW, null);
  assert.equal(out.symbol, "SPY");
  assert.equal(out.timeframe, "5m");
  assert.equal(out.isExtendedHoursIncluded, true);
  assert.equal(out.latestCandleAt, new Date(T2).toISOString());
});

test("mock envelope honestly reports no extended-hours dataset", () => {
  const d = normalizeRawSpyCandles(validFixture, NOW);
  assert.ok(d);
  const out = toMockSpyCandleResponse(d.candles, NOW, "NOT_CONNECTED");
  assert.equal(out.sourceState, "MOCK");
  assert.equal(out.isExtendedHoursIncluded, false);
  assert.equal(out.warningCode, "NOT_CONNECTED");
});

console.log(`\n${passed} passed, ${failed} failed (${passed + failed} total)`);
if (failed > 0) process.exit(1);
