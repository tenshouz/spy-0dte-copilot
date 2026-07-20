/**
 * Deterministic tests for Live Core Session Levels.
 * No Prisma, OAuth, credentials, or live network calls.
 *
 * Run:
 *   npx --no-install tsx apps/server/src/services/session-levels.spec.ts
 */
import assert from "node:assert/strict";
import type { SpyCandle } from "@spy-copilot/shared";
import { normalizeRawSpyCandles, type CachedCandleDataset } from "./schwab-candles.logic";
import {
  buildSpySessionLevelsResponse,
  calculateFinalSessionClose,
  calculateSessionHighLow,
} from "./session-levels.logic";
import {
  getObservedMarketDate,
  PREMARKET_WINDOW_POLICY,
  selectMarketSessionCandles,
  selectPreviousRthMarketDate,
} from "./session-data.logic";
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

function sequence(
  startIso: string,
  count: number,
  overrides?: (index: number) => Partial<Omit<SpyCandle, "timestamp">>,
): SpyCandle[] {
  const start = Date.parse(startIso);
  return Array.from({ length: count }, (_, index) =>
    candle(start + index * 5 * 60 * 1000, overrides?.(index) ?? {}),
  );
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

const EDT_NOW_RTH = Date.parse("2026-07-15T19:00:00.000Z"); // 15:00 ET
const EDT_PREMARKET_FULL = sequence("2026-07-15T11:00:00.000Z", 30); // 07:00..09:25 ET
const EDT_PREVIOUS_RTH_FULL = sequence("2026-07-14T13:30:00.000Z", 78); // 09:30..15:55 ET

// --- PURE CALCULATIONS ------------------------------------------------------

test("high/low calculation uses only the supplied selected candles", () => {
  const result = calculateSessionHighLow([
    candle(1, { high: 100, low: 98 }),
    candle(2, { high: 103, low: 99 }),
    candle(3, { high: 102, low: 97 }),
  ]);
  assert.deepEqual(result, { high: 103, low: 97 });
});

test("empty high/low input is unavailable", () => {
  assert.equal(calculateSessionHighLow([]), null);
});

test("final session close uses the last already-selected candle without timestamp assumptions", () => {
  const candles = [
    candle(1, { close: 100 }),
    candle(2, { close: 101 }),
    candle(3, { close: 102 }),
  ];
  assert.equal(calculateFinalSessionClose(candles), 102);
  assert.equal(calculateFinalSessionClose([]), null);
});

// --- CANONICAL DATE / SESSION SELECTION ------------------------------------

test("current market target date is the current New York calendar date, not the latest defined session date", () => {
  const nowMs = Date.parse("2026-07-16T07:30:00.000Z"); // 03:30 ET July 16
  const priorPremarket = sequence("2026-07-15T11:00:00.000Z", 30);
  const out = buildSpySessionLevelsResponse(access(priorPremarket, nowMs - 1_000), nowMs);
  assert.equal(out.currentMarketDate, "2026-07-16");
  assert.equal(out.premarketHigh.state, "UNAVAILABLE");
  assert.equal(out.premarketLow.state, "UNAVAILABLE");
});

test("previous RTH selector ignores overnight-only dates", () => {
  const fridayRth = candle(Date.parse("2026-07-10T13:30:00.000Z"));
  const sundayOvernight = candle(Date.parse("2026-07-13T02:00:00.000Z"));
  assert.equal(
    selectPreviousRthMarketDate([fridayRth, sundayOvernight], "2026-07-13"),
    "2026-07-10",
  );
});

test("Friday is selected as previous RTH for Monday", () => {
  const friday = sequence("2026-07-10T13:30:00.000Z", 78);
  assert.equal(selectPreviousRthMarketDate(friday, "2026-07-13"), "2026-07-10");
});

test("premarket boundaries include 07:00 and 09:25 but exclude 06:55 and 09:30", () => {
  const selected = selectMarketSessionCandles(
    [
      candle(Date.parse("2026-07-15T10:55:00.000Z")), // 06:55 ET
      candle(Date.parse("2026-07-15T11:00:00.000Z")), // 07:00 ET
      candle(Date.parse("2026-07-15T13:25:00.000Z")), // 09:25 ET
      candle(Date.parse("2026-07-15T13:30:00.000Z")), // 09:30 ET
    ],
    "2026-07-15",
    "PREMARKET",
  );
  assert.deepEqual(
    selected.map((item) => item.timestamp),
    [Date.parse("2026-07-15T11:00:00.000Z"), Date.parse("2026-07-15T13:25:00.000Z")],
  );
});

test("RTH boundaries include 09:30 and 15:55 but exclude 09:25 and 16:00", () => {
  const selected = selectMarketSessionCandles(
    [
      candle(Date.parse("2026-07-15T13:25:00.000Z")),
      candle(Date.parse("2026-07-15T13:30:00.000Z")),
      candle(Date.parse("2026-07-15T19:55:00.000Z")),
      candle(Date.parse("2026-07-15T20:00:00.000Z")),
    ],
    "2026-07-15",
    "RTH",
  );
  assert.deepEqual(
    selected.map((item) => item.timestamp),
    [Date.parse("2026-07-15T13:30:00.000Z"), Date.parse("2026-07-15T19:55:00.000Z")],
  );
});

test("EST session selection uses America/New_York rather than a fixed UTC offset", () => {
  const est0700 = Date.parse("2026-01-15T12:00:00.000Z");
  const est0930 = Date.parse("2026-01-15T14:30:00.000Z");
  assert.equal(getObservedMarketDate(est0700), "2026-01-15");
  assert.equal(selectMarketSessionCandles([candle(est0700)], "2026-01-15", "PREMARKET").length, 1);
  assert.equal(selectMarketSessionCandles([candle(est0930)], "2026-01-15", "RTH").length, 1);
});

// --- PREMARKET ELIGIBILITY --------------------------------------------------

test("04:00-06:55 candles are outside the provider-aligned premarket calculation", () => {
  const earlyExtendedHours = sequence("2026-07-15T08:00:00.000Z", 36, () => ({
    high: 999,
    low: 1,
  }));
  const providerAligned = EDT_PREMARKET_FULL.map((item, index) => ({
    ...item,
    high: index === 10 ? 110 : 101,
    low: index === 15 ? 90 : 99,
  }));
  const out = buildSpySessionLevelsResponse(
    access([...earlyExtendedHours, ...providerAligned], EDT_NOW_RTH - 500),
    EDT_NOW_RTH,
  );

  assert.equal(out.premarketCoverageState, "COMPLETE");
  assert.equal(out.premarketHigh.value, 110);
  assert.equal(out.premarketLow.value, 90);
});

test("complete current-date premarket produces LIVE PMH/PML and ignores RTH extremes", () => {
  const pm = EDT_PREMARKET_FULL.map((item, index) => ({
    ...item,
    high: index === 20 ? 110 : 101,
    low: index === 25 ? 90 : 99,
  }));
  const currentRth = [candle(Date.parse("2026-07-15T13:30:00.000Z"), { high: 999, low: 1 })];
  const out = buildSpySessionLevelsResponse(
    access([...pm, ...EDT_PREVIOUS_RTH_FULL, ...currentRth], EDT_NOW_RTH - 1_000),
    EDT_NOW_RTH,
  );
  assert.equal(out.premarketCoverageState, "COMPLETE");
  assert.deepEqual(out.premarketWindow, PREMARKET_WINDOW_POLICY);
  assert.deepEqual(out.premarketHigh, { value: 110, state: "LIVE" });
  assert.deepEqual(out.premarketLow, { value: 90, state: "LIVE" });
});

test("valid active provider-aligned premarket is eligible without requiring future bars", () => {
  const nowMs = Date.parse("2026-07-15T11:02:00.000Z"); // 07:02 ET
  const pmThrough0700 = sequence("2026-07-15T11:00:00.000Z", 1, (index) => ({
    high: 101 + index / 100,
    low: 99 - index / 100,
  }));
  const out = buildSpySessionLevelsResponse(access(pmThrough0700, nowMs - 500), nowMs);
  assert.equal(out.premarketCoverageState, "COMPLETE");
  assert.equal(out.premarketHigh.state, "LIVE");
  assert.equal(out.premarketLow.state, "LIVE");
});

test("a missing 07:00 boundary is PARTIAL and levels are unavailable", () => {
  const nowMs = Date.parse("2026-07-15T11:07:00.000Z"); // 07:07 ET
  const pmStarting0705 = [candle(Date.parse("2026-07-15T11:05:00.000Z"), { high: 150, low: 50 })];
  const out = buildSpySessionLevelsResponse(access(pmStarting0705, nowMs - 500), nowMs);
  assert.equal(out.premarketCoverageState, "PARTIAL");
  assert.deepEqual(out.premarketHigh, { value: null, state: "UNAVAILABLE" });
  assert.deepEqual(out.premarketLow, { value: null, state: "UNAVAILABLE" });
});

test("premarket timestamp gap is conservatively UNKNOWN and levels are unavailable", () => {
  const nowMs = Date.parse("2026-07-15T15:00:00.000Z"); // after premarket
  const pmWithGap = EDT_PREMARKET_FULL.filter((_, index) => index !== 10);
  const out = buildSpySessionLevelsResponse(access(pmWithGap, nowMs - 500), nowMs);
  assert.equal(out.premarketCoverageState, "UNKNOWN");
  assert.equal(out.premarketHigh.state, "UNAVAILABLE");
  assert.equal(out.premarketLow.state, "UNAVAILABLE");
});

test("before first current-date premarket candle PMH/PML are unavailable rather than zero", () => {
  const nowMs = Date.parse("2026-07-15T07:30:00.000Z"); // 03:30 ET
  const out = buildSpySessionLevelsResponse(access(EDT_PREVIOUS_RTH_FULL, nowMs - 500), nowMs);
  assert.equal(out.premarketHigh.value, null);
  assert.equal(out.premarketLow.value, null);
  assert.equal(out.premarketHigh.state, "UNAVAILABLE");
});

// --- PREVIOUS RTH LEVELS ----------------------------------------------------

test("complete immediately previous RTH produces PDH/PDL/PDC", () => {
  const previous = EDT_PREVIOUS_RTH_FULL.map((item, index) => ({
    ...item,
    high: index === 20 ? 120 : 105,
    low: index === 30 ? 80 : 95,
    close: index === 77 ? 111.25 : 100,
  }));
  const out = buildSpySessionLevelsResponse(
    access([...previous, ...EDT_PREMARKET_FULL], EDT_NOW_RTH - 500),
    EDT_NOW_RTH,
  );
  assert.equal(out.previousRthMarketDate, "2026-07-14");
  assert.equal(out.previousRthCoverageState, "COMPLETE");
  assert.deepEqual(out.previousDayHigh, { value: 120, state: "LIVE" });
  assert.deepEqual(out.previousDayLow, { value: 80, state: "LIVE" });
  assert.deepEqual(out.previousDayClose, { value: 111.25, state: "LIVE" });
});

test("after-hours candles do not affect previous-day H/L/C", () => {
  const previous = EDT_PREVIOUS_RTH_FULL.map((item, index) => ({
    ...item,
    high: 105,
    low: 95,
    close: index === 77 ? 101.5 : 100,
  }));
  const afterHours = candle(Date.parse("2026-07-14T20:00:00.000Z"), {
    high: 999,
    low: 1,
    close: 777,
  });
  const out = buildSpySessionLevelsResponse(
    access([...previous, afterHours, ...EDT_PREMARKET_FULL], EDT_NOW_RTH - 500),
    EDT_NOW_RTH,
  );
  assert.equal(out.previousDayHigh.value, 105);
  assert.equal(out.previousDayLow.value, 95);
  assert.equal(out.previousDayClose.value, 101.5);
});

test("current-day RTH candles do not affect previous-day levels", () => {
  const currentRth = candle(Date.parse("2026-07-15T13:30:00.000Z"), {
    high: 999,
    low: 1,
    close: 777,
  });
  const out = buildSpySessionLevelsResponse(
    access([...EDT_PREVIOUS_RTH_FULL, ...EDT_PREMARKET_FULL, currentRth], EDT_NOW_RTH - 500),
    EDT_NOW_RTH,
  );
  assert.notEqual(out.previousDayHigh.value, 999);
  assert.notEqual(out.previousDayLow.value, 1);
  assert.notEqual(out.previousDayClose.value, 777);
});

test("incomplete immediately previous RTH is not skipped in favor of an older complete day", () => {
  const thursdayComplete = sequence("2026-07-09T13:30:00.000Z", 78, () => ({ high: 200, low: 150 }));
  const fridayPartial = sequence("2026-07-10T15:00:00.000Z", 60, () => ({ high: 120, low: 80 })); // starts 11:00 ET
  const mondayNow = Date.parse("2026-07-13T15:00:00.000Z"); // 11:00 ET
  const mondayPm = sequence("2026-07-13T11:00:00.000Z", 30);
  const out = buildSpySessionLevelsResponse(
    access([...thursdayComplete, ...fridayPartial, ...mondayPm], mondayNow - 500),
    mondayNow,
  );
  assert.equal(out.previousRthMarketDate, "2026-07-10");
  assert.equal(out.previousRthCoverageState, "PARTIAL");
  assert.equal(out.previousDayHigh.state, "UNAVAILABLE");
  assert.equal(out.previousDayLow.state, "UNAVAILABLE");
  assert.equal(out.previousDayClose.state, "UNAVAILABLE");
});

test("previous RTH with a timestamp gap is UNKNOWN and levels are unavailable", () => {
  const previousWithGap = EDT_PREVIOUS_RTH_FULL.filter((_, index) => index !== 25);
  const out = buildSpySessionLevelsResponse(
    access([...previousWithGap, ...EDT_PREMARKET_FULL], EDT_NOW_RTH - 500),
    EDT_NOW_RTH,
  );
  assert.equal(out.previousRthCoverageState, "UNKNOWN");
  assert.equal(out.previousDayHigh.state, "UNAVAILABLE");
  assert.equal(out.previousDayClose.state, "UNAVAILABLE");
});

// --- PROVENANCE / DATA INTEGRITY -------------------------------------------

test("STALE bounded source can only produce STALE eligible levels", () => {
  const nowMs = EDT_NOW_RTH;
  const staleFetchedAtMs = nowMs - 120_000;
  const out = buildSpySessionLevelsResponse(
    access([...EDT_PREVIOUS_RTH_FULL, ...EDT_PREMARKET_FULL], staleFetchedAtMs),
    nowMs,
  );
  assert.equal(out.candleSourceState, "STALE");
  assert.equal(out.premarketHigh.state, "STALE");
  assert.equal(out.previousDayHigh.state, "STALE");
});

test("missing real bounded dataset does not fabricate mock multi-day levels", () => {
  const nowMs = EDT_NOW_RTH;
  const out = buildSpySessionLevelsResponse(
    {
      dataset: null,
      requestedStartAtMs: nowMs - 1_000,
      requestedEndAtMs: nowMs,
      warningCode: "NOT_CONNECTED",
    },
    nowMs,
  );
  assert.equal(out.candleSourceState, "MOCK");
  assert.equal(out.premarketHigh.state, "UNAVAILABLE");
  assert.equal(out.previousDayHigh.state, "UNAVAILABLE");
  assert.equal(out.premarketHigh.value, null);
  assert.equal(out.previousDayClose.value, null);
});

test("same-timestamp provider revision remains deduplicated before session-level calculation", () => {
  const ts = Date.parse("2026-07-15T11:00:00.000Z");
  const normalized = normalizeRawSpyCandles(
    {
      candles: [
        { open: 100, high: 101, low: 99, close: 100, volume: 100, datetime: ts },
        { open: 100, high: 105, low: 98, close: 104, volume: 200, datetime: ts },
      ],
    },
    EDT_NOW_RTH,
  );
  assert.ok(normalized);
  assert.equal(normalized.candles.length, 1);
  assert.deepEqual(calculateSessionHighLow(normalized.candles), { high: 105, low: 98 });
});

console.log(`\n${passed} passed, ${failed} failed (${passed + failed} total)`);
if (failed > 0) process.exitCode = 1;
