/**
 * Deterministic tests for canonical session selection + pure RTH VWAP logic.
 * No Prisma, OAuth, credentials, or live network calls.
 *
 * Run:
 *   npx --no-install tsx apps/server/src/services/rth-vwap.spec.ts
 */
import assert from "node:assert/strict";
import type { SpyCandle, SpyCandleResponse } from "@spy-copilot/shared";
import { normalizeRawSpyCandles } from "./schwab-candles.logic";
import {
  calculateCumulativeHlc3Vwap,
  buildSpyRthVwapResponse,
} from "./rth-vwap.logic";
import {
  selectLatestDefinedMarketDate,
  selectMarketSessionCandles,
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

function candle(
  timestamp: number,
  overrides: Partial<Omit<SpyCandle, "timestamp">> = {},
): SpyCandle {
  return {
    timestamp,
    open: 100,
    high: 102,
    low: 100,
    close: 101,
    volume: 100,
    ...overrides,
  };
}

function response(
  candles: SpyCandle[],
  sourceState: "LIVE" | "STALE" | "MOCK" = "LIVE",
): SpyCandleResponse {
  const fetchedAt = "2026-07-15T15:00:00.000Z";
  return {
    symbol: "SPY",
    timeframe: "5m",
    sourceState,
    candles,
    fetchedAt,
    latestCandleAt: candles.at(-1)
      ? new Date(candles.at(-1)!.timestamp).toISOString()
      : null,
    dataAgeMs: sourceState === "STALE" ? 120_000 : 0,
    isExtendedHoursIncluded: sourceState !== "MOCK",
    warningCode: null,
  };
}

const EDT_PREMARKET = Date.parse("2026-07-15T13:25:00.000Z"); // 09:25 ET
const EDT_RTH_OPEN = Date.parse("2026-07-15T13:30:00.000Z"); // 09:30 ET
const EDT_RTH_1000 = Date.parse("2026-07-15T14:00:00.000Z"); // 10:00 ET
const EDT_RTH_LAST = Date.parse("2026-07-15T19:55:00.000Z"); // 15:55 ET
const EDT_AFTER_HOURS = Date.parse("2026-07-15T20:00:00.000Z"); // 16:00 ET

// --- CANONICAL SESSION SELECTION --------------------------------------------

test("latest defined market date ignores a later overnight-only date", () => {
  const fridayRth = candle(Date.parse("2026-07-10T13:30:00.000Z"));
  const sundayOvernight = candle(Date.parse("2026-07-13T02:00:00.000Z"));
  assert.equal(selectLatestDefinedMarketDate([fridayRth, sundayOvernight]), "2026-07-10");
});

test("RTH selection excludes premarket and 16:00 after-hours boundary", () => {
  const selected = selectMarketSessionCandles(
    [
      candle(EDT_PREMARKET),
      candle(EDT_RTH_OPEN),
      candle(EDT_RTH_LAST),
      candle(EDT_AFTER_HOURS),
    ],
    "2026-07-15",
    "RTH",
  );
  assert.deepEqual(selected.map((item) => item.timestamp), [EDT_RTH_OPEN, EDT_RTH_LAST]);
});

test("RTH selection excludes previous market dates", () => {
  const previous = candle(Date.parse("2026-07-14T13:30:00.000Z"));
  const current = candle(EDT_RTH_OPEN);
  const selected = selectMarketSessionCandles([previous, current], "2026-07-15", "RTH");
  assert.deepEqual(selected.map((item) => item.timestamp), [EDT_RTH_OPEN]);
});

test("EST RTH boundary uses America/New_York rather than a fixed UTC offset", () => {
  const premarket = candle(Date.parse("2026-01-15T14:25:00.000Z")); // 09:25 ET
  const open = candle(Date.parse("2026-01-15T14:30:00.000Z")); // 09:30 ET
  const selected = selectMarketSessionCandles([premarket, open], "2026-01-15", "RTH");
  assert.deepEqual(selected.map((item) => item.timestamp), [open.timestamp]);
});

// --- FORMULA ----------------------------------------------------------------

test("HLC3 cumulative VWAP matches a manually calculable fixture", () => {
  const result = calculateCumulativeHlc3Vwap([
    candle(EDT_RTH_OPEN, { high: 102, low: 100, close: 101, volume: 100 }),
    candle(EDT_RTH_1000, { high: 104, low: 102, close: 103, volume: 300 }),
  ]);
  assert.equal(result.series.length, 2);
  assert.equal(result.series[0]!.value, 101);
  assert.equal(result.series[1]!.value, 102.5);
  assert.equal(result.latestVwap, 102.5);
  assert.equal(result.totalVolume, 400);
});

test("empty RTH input produces no VWAP", () => {
  const result = calculateCumulativeHlc3Vwap([]);
  assert.deepEqual(result.series, []);
  assert.equal(result.latestVwap, null);
  assert.equal(result.totalVolume, 0);
});

test("all-zero volume produces UNDEFINED calculation rather than zero or NaN", () => {
  const result = calculateCumulativeHlc3Vwap([
    candle(EDT_RTH_OPEN, { volume: 0 }),
    candle(EDT_RTH_1000, { volume: 0 }),
  ]);
  assert.deepEqual(result.series, []);
  assert.equal(result.latestVwap, null);
  assert.equal(result.totalVolume, 0);
});

test("zero-volume candle after positive volume carries the mathematically unchanged VWAP", () => {
  const result = calculateCumulativeHlc3Vwap([
    candle(EDT_RTH_OPEN, { high: 102, low: 100, close: 101, volume: 100 }),
    candle(EDT_RTH_1000, { high: 999, low: 998, close: 998.5, volume: 0 }),
  ]);
  assert.equal(result.series.length, 2);
  assert.equal(result.series[0]!.value, 101);
  assert.equal(result.series[1]!.value, 101);
});

test("forming-candle revision is not double-counted after existing normalization", () => {
  const normalized = normalizeRawSpyCandles(
    {
      candles: [
        { open: 100, high: 102, low: 100, close: 101, volume: 100, datetime: EDT_RTH_OPEN },
        { open: 101, high: 103, low: 101, close: 102, volume: 100, datetime: EDT_RTH_1000 },
        { open: 101, high: 104, low: 101, close: 103, volume: 200, datetime: EDT_RTH_1000 },
      ],
    },
    Date.parse("2026-07-15T14:01:00.000Z"),
  );
  assert.ok(normalized);
  assert.equal(normalized.candles.length, 2);
  const result = calculateCumulativeHlc3Vwap(normalized.candles);
  const expected = (101 * 100 + ((104 + 101 + 103) / 3) * 200) / 300;
  assert.ok(Math.abs(result.latestVwap! - expected) < 1e-12);
});

// --- RESPONSE / PROVENANCE --------------------------------------------------

test("LIVE candles with eligible RTH volume produce LIVE VWAP", () => {
  const out = buildSpyRthVwapResponse(response([candle(EDT_RTH_OPEN)], "LIVE"), 616.85);
  assert.equal(out.metricState, "LIVE");
  assert.equal(out.candleSourceState, "LIVE");
  assert.equal(out.marketDate, "2026-07-15");
  assert.equal(out.latestVwap, 101);
  assert.equal(out.latestRthCandleAt, new Date(EDT_RTH_OPEN).toISOString());
});

test("STALE candles can only produce STALE VWAP", () => {
  const out = buildSpyRthVwapResponse(response([candle(EDT_RTH_OPEN)], "STALE"), 616.85);
  assert.equal(out.metricState, "STALE");
  assert.equal(out.candleSourceState, "STALE");
});

test("live premarket with no RTH candles is UNAVAILABLE rather than MOCK or zero", () => {
  const out = buildSpyRthVwapResponse(response([candle(EDT_PREMARKET)], "LIVE"), 616.85);
  assert.equal(out.metricState, "UNAVAILABLE");
  assert.equal(out.candleSourceState, "LIVE");
  assert.equal(out.latestVwap, null);
  assert.deepEqual(out.series, []);
  assert.equal(out.rthCandleCount, 0);
});

test("zero-total-volume RTH input is UNAVAILABLE", () => {
  const out = buildSpyRthVwapResponse(
    response([candle(EDT_RTH_OPEN, { volume: 0 })], "LIVE"),
    616.85,
  );
  assert.equal(out.metricState, "UNAVAILABLE");
  assert.equal(out.latestVwap, null);
});

test("MOCK fallback preserves the existing mock VWAP and stays explicitly MOCK", () => {
  const out = buildSpyRthVwapResponse(response([candle(EDT_RTH_OPEN)], "MOCK"), 616.85);
  assert.equal(out.metricState, "MOCK");
  assert.equal(out.candleSourceState, "MOCK");
  assert.equal(out.latestVwap, 616.85);
  assert.deepEqual(out.series, [{ timestamp: EDT_RTH_OPEN, value: 616.85 }]);
});

test("after-hours candles do not alter the final RTH VWAP or latestRthCandleAt", () => {
  const rth = candle(EDT_RTH_LAST, { high: 104, low: 102, close: 103, volume: 300 });
  const after = candle(EDT_AFTER_HOURS, { high: 800, low: 700, close: 750, volume: 999_999 });
  const out = buildSpyRthVwapResponse(response([rth, after], "LIVE"), 616.85);
  assert.equal(out.latestVwap, 103);
  assert.equal(out.rthCandleCount, 1);
  assert.equal(out.latestRthCandleAt, new Date(EDT_RTH_LAST).toISOString());
  assert.equal(out.series.at(-1)!.timestamp, EDT_RTH_LAST);
});

test("current partial-in-time RTH uses only actual returned candles and requires no future bars", () => {
  const out = buildSpyRthVwapResponse(
    response([candle(EDT_RTH_OPEN), candle(EDT_RTH_1000)], "LIVE"),
    616.85,
  );
  assert.equal(out.metricState, "LIVE");
  assert.equal(out.rthCandleCount, 2);
  assert.equal(out.series.length, 2);
});

test("timestamp gaps do not synthesize candles inside the VWAP layer", () => {
  const open = candle(EDT_RTH_OPEN);
  const tenMinutesLater = candle(EDT_RTH_OPEN + 10 * 60 * 1000);
  const out = buildSpyRthVwapResponse(response([open, tenMinutesLater], "LIVE"), 616.85);
  assert.equal(out.rthCandleCount, 2);
  assert.equal(out.series.length, 2);
});

test("Friday to Monday reset selects Monday RTH only", () => {
  const friday = candle(Date.parse("2026-07-10T13:30:00.000Z"), { high: 10, low: 9, close: 9.5, open: 9.5, volume: 100 });
  const monday = candle(Date.parse("2026-07-13T13:30:00.000Z"), { high: 102, low: 100, close: 101, volume: 100 });
  const out = buildSpyRthVwapResponse(response([friday, monday], "LIVE"), 616.85);
  assert.equal(out.marketDate, "2026-07-13");
  assert.equal(out.rthCandleCount, 1);
  assert.equal(out.latestVwap, 101);
});

console.log(`\n${passed} passed, ${failed} failed (${passed + failed} total)`);
if (failed > 0) process.exit(1);
