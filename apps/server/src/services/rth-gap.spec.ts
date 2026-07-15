/**
 * Deterministic tests for Live RTH Gap Metrics.
 * No Prisma, OAuth, credentials, or live network calls.
 *
 * Run:
 *   npx --no-install tsx apps/server/src/services/rth-gap.spec.ts
 */
import assert from "node:assert/strict";
import type { SpyCandle } from "@spy-copilot/shared";
import { normalizeRawSpyCandles, type CachedCandleDataset } from "./schwab-candles.logic";
import {
  buildSpyRthGapResponse,
  calculateRthGap,
  detectRthGapFill,
} from "./rth-gap.logic";
import {
  selectMarketSessionOpeningCandle,
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

const EDT_AFTER_CLOSE = Date.parse("2026-07-15T21:00:00.000Z"); // 17:00 ET
const EDT_DURING_RTH = Date.parse("2026-07-15T15:02:00.000Z"); // 11:02 ET

function previousRth(finalClose = 100): SpyCandle[] {
  return sequence("2026-07-14T13:30:00.000Z", 78, (index) => ({
    open: 100,
    high: 101,
    low: 99,
    close: index === 77 ? finalClose : 100,
  }));
}

function currentRth(
  count = 78,
  openingPrice = 102,
  overrides?: (index: number) => Partial<Omit<SpyCandle, "timestamp">>,
): SpyCandle[] {
  return sequence("2026-07-15T13:30:00.000Z", count, (index) => ({
    open: index === 0 ? openingPrice : 102,
    high: 103,
    low: 101,
    close: 102,
    ...(overrides?.(index) ?? {}),
  }));
}

// --- PURE GAP CALCULATION ---------------------------------------------------

test("positive raw gap produces UP with unrounded percent", () => {
  const result = calculateRthGap(102.125, 100.25);
  assert.ok(result);
  assert.equal(result.gapPoints, 1.875);
  assert.equal(result.gapPercent, (1.875 / 100.25) * 100);
  assert.equal(result.direction, "UP");
});

test("negative gap produces DOWN", () => {
  const result = calculateRthGap(98, 100);
  assert.deepEqual(result, { gapPoints: -2, gapPercent: -2, direction: "DOWN" });
});

test("equal open and close produces FLAT and normal zero", () => {
  const result = calculateRthGap(100, 100);
  assert.ok(result);
  assert.equal(result.direction, "FLAT");
  assert.equal(result.gapPoints, 0);
  assert.equal(Object.is(result.gapPoints, -0), false);
});

test("invalid or zero PDC safely makes calculation unavailable", () => {
  assert.equal(calculateRthGap(100, 0), null);
  assert.equal(calculateRthGap(Number.NaN, 100), null);
});

// --- OPENING BOUNDARY -------------------------------------------------------

test("canonical EDT RTH opening boundary candle is selected", () => {
  const candles = [
    candle(Date.parse("2026-07-15T13:25:00.000Z")),
    candle(Date.parse("2026-07-15T13:30:00.000Z"), { open: 102 }),
    candle(Date.parse("2026-07-15T13:35:00.000Z")),
  ];
  assert.equal(
    selectMarketSessionOpeningCandle(candles, "2026-07-15", "RTH")?.open,
    102,
  );
});

test("9:35 is never substituted when the 9:30 opening boundary is missing", () => {
  const candles = [candle(Date.parse("2026-07-15T13:35:00.000Z"), { open: 105 })];
  assert.equal(selectMarketSessionOpeningCandle(candles, "2026-07-15", "RTH"), null);
});

test("canonical EST RTH boundary uses New York time rather than fixed UTC", () => {
  const estOpen = candle(Date.parse("2026-01-15T14:30:00.000Z"), { open: 99 });
  assert.equal(
    selectMarketSessionOpeningCandle([estOpen], "2026-01-15", "RTH")?.open,
    99,
  );
});

// --- PURE FILL DETECTION ----------------------------------------------------

test("gap-up fill uses LOW <= PDC and selects earliest proving candle", () => {
  const candles = currentRth(3, 102, (index) => ({
    low: index === 0 ? 101 : index === 1 ? 100 : 99,
  }));
  const result = detectRthGapFill("UP", 100, candles, "COMPLETE");
  assert.equal(result.fillState, "FILLED");
  assert.equal(result.firstObservedFillCandleAtMs, candles[1]!.timestamp);
});

test("gap-down fill uses HIGH >= PDC and opening candle may fill", () => {
  const candles = currentRth(2, 98, (index) => ({
    open: index === 0 ? 98 : 99,
    high: index === 0 ? 100 : 101,
    low: 97,
    close: 98,
  }));
  const result = detectRthGapFill("DOWN", 100, candles, "COMPLETE");
  assert.equal(result.fillState, "FILLED");
  assert.equal(result.firstObservedFillCandleAtMs, candles[0]!.timestamp);
});

test("no crossing with trustworthy coverage is UNFILLED", () => {
  const result = detectRthGapFill("UP", 100, currentRth(4), "COMPLETE");
  assert.deepEqual(result, { fillState: "UNFILLED", firstObservedFillCandleAtMs: null });
});

test("no crossing with ambiguous coverage is UNKNOWN", () => {
  const result = detectRthGapFill("UP", 100, currentRth(4), "UNKNOWN");
  assert.deepEqual(result, { fillState: "UNKNOWN", firstObservedFillCandleAtMs: null });
});

test("flat gap fill is NOT_APPLICABLE", () => {
  const result = detectRthGapFill("FLAT", 100, currentRth(1, 100), "COMPLETE");
  assert.deepEqual(result, {
    fillState: "NOT_APPLICABLE",
    firstObservedFillCandleAtMs: null,
  });
});

// --- RESPONSE COMPOSITION / LIFECYCLE --------------------------------------

test("complete current RTH and trusted PDC produce LIVE unfilled gap", () => {
  const out = buildSpyRthGapResponse(
    access([...previousRth(100), ...currentRth()], EDT_AFTER_CLOSE - 500),
    EDT_AFTER_CLOSE,
  );
  assert.equal(out.metricState, "LIVE");
  assert.equal(out.currentMarketDate, "2026-07-15");
  assert.equal(out.previousRthMarketDate, "2026-07-14");
  assert.equal(out.currentRthOpen, 102);
  assert.equal(out.previousDayClose, 100);
  assert.equal(out.gapPoints, 2);
  assert.equal(out.gapPercent, 2);
  assert.equal(out.direction, "UP");
  assert.equal(out.fillState, "UNFILLED");
  assert.equal(out.currentRthCoverageState, "COMPLETE");
  assert.equal(out.currentRthCandleCount, 78);
});

test("active RTH needs coverage only through observation, not future bars", () => {
  const through1100 = currentRth(19); // 09:30 through 11:00 ET
  const out = buildSpyRthGapResponse(
    access([...previousRth(100), ...through1100], EDT_DURING_RTH - 500),
    EDT_DURING_RTH,
  );
  assert.equal(out.currentRthCoverageState, "COMPLETE");
  assert.equal(out.metricState, "LIVE");
  assert.equal(out.fillState, "UNFILLED");
});

test("opening candle itself can prove a gap-up fill", () => {
  const current = currentRth(78, 102, (index) => ({ low: index === 0 ? 99.5 : 101 }));
  const out = buildSpyRthGapResponse(
    access([...previousRth(100), ...current], EDT_AFTER_CLOSE - 500),
    EDT_AFTER_CLOSE,
  );
  assert.equal(out.fillState, "FILLED");
  assert.equal(out.firstObservedFillCandleAt, "2026-07-15T13:30:00.000Z");
});

test("missing later interval makes no-proven-fill UNKNOWN without invalidating gap", () => {
  const withGap = currentRth().filter((_, index) => index !== 20);
  const out = buildSpyRthGapResponse(
    access([...previousRth(100), ...withGap], EDT_AFTER_CLOSE - 500),
    EDT_AFTER_CLOSE,
  );
  assert.equal(out.metricState, "LIVE");
  assert.equal(out.gapPoints, 2);
  assert.equal(out.currentRthCoverageState, "UNKNOWN");
  assert.equal(out.fillState, "UNKNOWN");
});

test("proven fill remains FILLED despite a later unrelated interval gap", () => {
  const current = currentRth(78, 102, (index) => ({ low: index === 2 ? 99 : 101 }))
    .filter((_, index) => index !== 40);
  const out = buildSpyRthGapResponse(
    access([...previousRth(100), ...current], EDT_AFTER_CLOSE - 500),
    EDT_AFTER_CLOSE,
  );
  assert.equal(out.currentRthCoverageState, "UNKNOWN");
  assert.equal(out.fillState, "FILLED");
  assert.equal(out.firstObservedFillCandleAt, "2026-07-15T13:40:00.000Z");
});

test("premarket and after-hours crossings cannot fill the RTH gap", () => {
  const premarketCross = candle(Date.parse("2026-07-15T13:25:00.000Z"), { low: 1 });
  const afterHoursCross = candle(Date.parse("2026-07-15T20:00:00.000Z"), { low: 1 });
  const out = buildSpyRthGapResponse(
    access(
      [...previousRth(100), premarketCross, ...currentRth(), afterHoursCross],
      EDT_AFTER_CLOSE - 500,
    ),
    EDT_AFTER_CLOSE,
  );
  assert.equal(out.fillState, "UNFILLED");
});

test("before RTH open current gap is unavailable but trusted PDC remains auditable", () => {
  const beforeOpen = Date.parse("2026-07-15T12:00:00.000Z"); // 08:00 ET
  const out = buildSpyRthGapResponse(
    access(previousRth(100), beforeOpen - 500),
    beforeOpen,
  );
  assert.equal(out.metricState, "UNAVAILABLE");
  assert.equal(out.currentRthOpen, null);
  assert.equal(out.previousDayClose, 100);
  assert.equal(out.direction, "UNAVAILABLE");
  assert.equal(out.fillState, "UNAVAILABLE");
  assert.equal(out.warningCode, null);
});

test("missing official opening candle makes package unavailable with warning", () => {
  const starts0935 = sequence("2026-07-15T13:35:00.000Z", 77, () => ({
    open: 102,
    high: 103,
    low: 101,
    close: 102,
  }));
  const out = buildSpyRthGapResponse(
    access([...previousRth(100), ...starts0935], EDT_AFTER_CLOSE - 500),
    EDT_AFTER_CLOSE,
  );
  assert.equal(out.metricState, "UNAVAILABLE");
  assert.equal(out.currentRthOpen, null);
  assert.equal(out.warningCode, "CURRENT_RTH_OPENING_CANDLE_MISSING");
});

test("incomplete immediate prior RTH is not skipped and gap is unavailable", () => {
  const olderComplete = sequence("2026-07-13T13:30:00.000Z", 78, (index) => ({
    close: index === 77 ? 90 : 100,
  }));
  const immediatePartial = sequence("2026-07-14T15:00:00.000Z", 60, (index) => ({
    close: index === 59 ? 100 : 100,
  }));
  const out = buildSpyRthGapResponse(
    access([...olderComplete, ...immediatePartial, ...currentRth()], EDT_AFTER_CLOSE - 500),
    EDT_AFTER_CLOSE,
  );
  assert.equal(out.previousRthMarketDate, "2026-07-14");
  assert.equal(out.previousRthCoverageState, "PARTIAL");
  assert.equal(out.previousDayClose, null);
  assert.equal(out.metricState, "UNAVAILABLE");
  assert.equal(out.warningCode, "PREVIOUS_DAY_CLOSE_UNAVAILABLE");
});

test("Friday is selected as the previous RTH date for Monday", () => {
  const friday = sequence("2026-07-10T13:30:00.000Z", 78);
  const sundayOvernight = [candle(Date.parse("2026-07-13T01:00:00.000Z"))];
  const monday = sequence("2026-07-13T13:30:00.000Z", 78);
  assert.equal(
    selectPreviousRthMarketDate([...friday, ...sundayOvernight, ...monday], "2026-07-13"),
    "2026-07-10",
  );
});

test("new New York date before RTH does not reuse the prior date's gap", () => {
  const nextDayBeforeOpen = Date.parse("2026-07-16T12:00:00.000Z"); // 08:00 ET
  const out = buildSpyRthGapResponse(
    access([...previousRth(100), ...currentRth()], nextDayBeforeOpen - 500),
    nextDayBeforeOpen,
  );
  assert.equal(out.currentMarketDate, "2026-07-16");
  assert.equal(out.metricState, "UNAVAILABLE");
  assert.equal(out.currentRthOpen, null);
});

test("weekend target date remains current and unavailable without fallback", () => {
  const saturday = Date.parse("2026-07-18T15:00:00.000Z");
  const out = buildSpyRthGapResponse(
    access([...previousRth(100), ...currentRth()], saturday - 500),
    saturday,
  );
  assert.equal(out.currentMarketDate, "2026-07-18");
  assert.equal(out.metricState, "UNAVAILABLE");
});

test("STALE bounded source can only produce STALE gap", () => {
  const out = buildSpyRthGapResponse(
    access([...previousRth(100), ...currentRth()], EDT_AFTER_CLOSE - 120_000),
    EDT_AFTER_CLOSE,
  );
  assert.equal(out.candleSourceState, "STALE");
  assert.equal(out.metricState, "STALE");
});

test("missing real bounded dataset does not fabricate a mock gap", () => {
  const out = buildSpyRthGapResponse(
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
  assert.equal(out.gapPoints, null);
  assert.equal(out.fillState, "UNAVAILABLE");
});

test("same-timestamp opening-candle revision is normalized before gap calculation", () => {
  const ts = Date.parse("2026-07-15T13:30:00.000Z");
  const normalized = normalizeRawSpyCandles(
    {
      candles: [
        { open: 101, high: 102, low: 100, close: 101, volume: 100, datetime: ts },
        { open: 102, high: 103, low: 101, close: 102, volume: 200, datetime: ts },
      ],
    },
    EDT_AFTER_CLOSE,
  );
  assert.ok(normalized);
  const out = buildSpyRthGapResponse(
    access([...previousRth(100), ...normalized.candles], EDT_DURING_RTH - 500),
    Date.parse("2026-07-15T13:32:00.000Z"),
  );
  assert.equal(out.currentRthOpen, 102);
  assert.equal(out.gapPoints, 2);
});

console.log(`\n${passed} passed, ${failed} failed (${passed + failed} total)`);
if (failed > 0) process.exitCode = 1;
