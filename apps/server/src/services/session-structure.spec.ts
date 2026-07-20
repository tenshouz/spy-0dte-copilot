import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  SpyDeterministicSessionStructureResponseSchema,
  type SpyCandle,
  type SpyQuote,
} from "@spy-copilot/shared";
import { SESSION_DATA_LOOKBACK_MS } from "./session-data.logic";
import {
  buildSpyDeterministicSessionStructureResponse,
  calculateTraditionalPivots,
  deriveDailyTraditionalPivots,
  deriveOpeningRangeWindow,
  deriveWeeklyTraditionalPivots,
} from "./session-structure.logic";

const tests: Array<[string, () => void]> = [];
function test(name: string, fn: () => void): void {
  tests.push([name, fn]);
}

function et(marketDate: string, time: string): number {
  return Date.parse(`${marketDate}T${time}:00-04:00`);
}

function candle(
  marketDate: string,
  time: string,
  values: Partial<Omit<SpyCandle, "timestamp">> = {},
): SpyCandle {
  return {
    timestamp: et(marketDate, time),
    open: values.open ?? 100,
    high: values.high ?? 101,
    low: values.low ?? 99,
    close: values.close ?? 100,
    volume: values.volume ?? 1_000,
  };
}

function timeFromMinutes(minutes: number): string {
  const hour = Math.floor(minutes / 60);
  const minute = minutes % 60;
  return `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
}

function completeRth(
  marketDate: string,
  base: number,
  closeMinute = 16 * 60,
): SpyCandle[] {
  const result: SpyCandle[] = [];
  for (let minute = 9 * 60 + 30; minute < closeMinute; minute += 5) {
    const index = (minute - (9 * 60 + 30)) / 5;
    const price = base + index * 0.01;
    result.push(
      candle(marketDate, timeFromMinutes(minute), {
        open: price,
        high: price + 1,
        low: price - 1,
        close: price + 0.25,
      }),
    );
  }
  return result;
}

function quote(lastPrice = 106): SpyQuote {
  return {
    symbol: "SPY",
    lastPrice,
    bidPrice: lastPrice - 0.01,
    askPrice: lastPrice + 0.01,
    volume: 1_000_000,
    quoteTimestamp: "2026-07-20T14:10:00.000Z",
    fetchedAt: "2026-07-20T14:10:00.000Z",
    marketStatus: "NORMAL",
    sourceState: "LIVE",
    dataAgeMs: 0,
    warningCode: null,
  };
}

function datasetCandles(): SpyCandle[] {
  return [
    ...completeRth("2026-07-13", 100),
    ...completeRth("2026-07-14", 101),
    ...completeRth("2026-07-15", 102),
    ...completeRth("2026-07-16", 103),
    ...completeRth("2026-07-17", 104),
    candle("2026-07-20", "09:30", { open: 105, high: 106, low: 104, close: 105 }),
    candle("2026-07-20", "09:35", { open: 105, high: 107, low: 105, close: 106 }),
    candle("2026-07-20", "09:40", { open: 106, high: 108, low: 105.5, close: 107 }),
    candle("2026-07-20", "09:45", { open: 107, high: 109, low: 106.5, close: 108.5 }),
    candle("2026-07-20", "09:50", { open: 108.5, high: 110, low: 108, close: 109.5 }),
    candle("2026-07-20", "09:55", { open: 109.5, high: 111, low: 109, close: 110.5 }),
    candle("2026-07-20", "10:00", { open: 110.5, high: 112, low: 110, close: 111 }),
    candle("2026-07-20", "10:05", { open: 111, high: 113, low: 110.5, close: 112 }),
    candle("2026-07-20", "10:10", { open: 112, high: 114, low: 111.5, close: 113 }),
  ];
}

test("bounded session data lookback is twenty-one calendar days", () => {
  assert.equal(SESSION_DATA_LOOKBACK_MS, 21 * 24 * 60 * 60 * 1000);
});

test("Traditional pivot formulas are deterministic", () => {
  assert.deepEqual(calculateTraditionalPivots({ high: 110, low: 90, close: 100 }), {
    pivot: 100,
    resistance1: 110,
    support1: 90,
    resistance2: 120,
    support2: 80,
  });
});

test("invalid Traditional pivot inputs fail closed", () => {
  assert.equal(calculateTraditionalPivots({ high: 90, low: 100, close: 95 }), null);
});

test("daily pivots use the immediate previous complete RTH session", () => {
  const result = deriveDailyTraditionalPivots(datasetCandles(), "2026-07-20", "LIVE");
  assert.equal(result.metricState, "LIVE");
  assert.equal(result.sourceMarketDateStart, "2026-07-17");
  assert.equal(result.sourceMarketDateEnd, "2026-07-17");
  assert.equal(result.observedTradingSessionCount, 1);
  assert.ok(result.pivot !== null);
});

test("daily pivots do not skip an incomplete immediate previous RTH session", () => {
  const candles = datasetCandles().filter(
    (item) => !(item.timestamp >= et("2026-07-17", "15:55") && item.timestamp < et("2026-07-18", "00:00")),
  );
  const result = deriveDailyTraditionalPivots(candles, "2026-07-20", "LIVE");
  assert.equal(result.metricState, "UNAVAILABLE");
  assert.equal(result.warningCode, "SOURCE_SESSION_INCOMPLETE");
  assert.equal(result.sourceMarketDateStart, "2026-07-17");
});

test("weekly pivots use every complete session in the prior NYSE week", () => {
  const result = deriveWeeklyTraditionalPivots(datasetCandles(), "2026-07-20", "LIVE");
  assert.equal(result.metricState, "LIVE");
  assert.equal(result.sourceMarketDateStart, "2026-07-13");
  assert.equal(result.sourceMarketDateEnd, "2026-07-17");
  assert.equal(result.expectedTradingSessionCount, 5);
  assert.equal(result.observedTradingSessionCount, 5);
  assert.ok(result.sourceHigh !== null && result.sourceLow !== null);
});

test("weekend evaluation prepares pivots from the just-completed trading week", () => {
  const result = deriveWeeklyTraditionalPivots(datasetCandles(), "2026-07-19", "LIVE");
  assert.equal(result.metricState, "LIVE");
  assert.equal(result.sourceMarketDateStart, "2026-07-13");
  assert.equal(result.sourceMarketDateEnd, "2026-07-17");
});

test("daily pivots accept an official complete NYSE early-close session", () => {
  const earlyCloseCandles: SpyCandle[] = [];
  for (let minute = 9 * 60 + 30; minute < 13 * 60; minute += 5) {
    const time = timeFromMinutes(minute);
    const timestamp = Date.parse(`2026-11-27T${time}:00-05:00`);
    earlyCloseCandles.push({
      timestamp,
      open: 100,
      high: 101,
      low: 99,
      close: 100.5,
      volume: 1_000,
    });
  }
  const result = deriveDailyTraditionalPivots(
    earlyCloseCandles,
    "2026-11-30",
    "LIVE",
  );
  assert.equal(result.metricState, "LIVE");
  assert.equal(result.sourceMarketDateStart, "2026-11-27");
  assert.equal(result.observedTradingSessionCount, 1);
});

test("weekly pivots fail closed when one expected session is missing", () => {
  const result = deriveWeeklyTraditionalPivots(
    datasetCandles().filter(
      (item) => item.timestamp < et("2026-07-15", "00:00") || item.timestamp >= et("2026-07-16", "00:00"),
    ),
    "2026-07-20",
    "LIVE",
  );
  assert.equal(result.metricState, "UNAVAILABLE");
  assert.equal(result.warningCode, "SOURCE_WEEK_INCOMPLETE");
  assert.equal(result.observedTradingSessionCount, 4);
});

test("5-minute opening range completes after the first bucket", () => {
  const result = deriveOpeningRangeWindow(
    datasetCandles(),
    "2026-07-20",
    et("2026-07-20", "09:36"),
    5,
    "LIVE",
    106,
  );
  assert.equal(result.phase, "COMPLETE");
  assert.equal(result.isComplete, true);
  assert.equal(result.observedCandleCount, 1);
  assert.equal(result.high, 106);
  assert.equal(result.low, 104);
  assert.equal(result.midpoint, 105);
});

test("15-minute opening range forms without using future candles", () => {
  const result = deriveOpeningRangeWindow(
    datasetCandles(),
    "2026-07-20",
    et("2026-07-20", "09:37"),
    15,
    "LIVE",
    106,
  );
  assert.equal(result.phase, "FORMING");
  assert.equal(result.observedCandleCount, 1);
  assert.equal(result.high, 106);
  assert.equal(result.low, 104);
  assert.equal(result.pricePosition, "FORMING");
});

test("30-minute opening range requires all six completed candles", () => {
  const result = deriveOpeningRangeWindow(
    datasetCandles(),
    "2026-07-20",
    et("2026-07-20", "10:01"),
    30,
    "LIVE",
    111,
  );
  assert.equal(result.phase, "COMPLETE");
  assert.equal(result.isComplete, true);
  assert.equal(result.observedCandleCount, 6);
  assert.equal(result.high, 111);
  assert.equal(result.low, 104);
});

test("opening range accepts a breakout only after two completed closes", () => {
  const result = deriveOpeningRangeWindow(
    datasetCandles(),
    "2026-07-20",
    et("2026-07-20", "10:16"),
    30,
    "LIVE",
    113,
  );
  assert.equal(result.interactionState, "BREAKOUT_ACCEPTED");
  assert.equal(result.acceptedBreakoutAt, "2026-07-20T14:10:00.000Z");
});

test("single close beyond a completed range remains pending", () => {
  const candles = datasetCandles().filter((item) => item.timestamp <= et("2026-07-20", "10:00"));
  const result = deriveOpeningRangeWindow(
    candles,
    "2026-07-20",
    et("2026-07-20", "10:06"),
    30,
    "LIVE",
    111.5,
  );
  assert.equal(result.interactionState, "BREAKOUT_PENDING");
});

test("missing canonical 9:30 candle never substitutes a later candle", () => {
  const result = deriveOpeningRangeWindow(
    datasetCandles().filter((item) => item.timestamp !== et("2026-07-20", "09:30")),
    "2026-07-20",
    et("2026-07-20", "10:01"),
    15,
    "LIVE",
    106,
  );
  assert.equal(result.metricState, "UNAVAILABLE");
  assert.equal(result.warningCode, "OPENING_CANDLE_MISSING");
});

test("pre-open ranges expose no candles or calculated levels", () => {
  const result = deriveOpeningRangeWindow(
    datasetCandles(),
    "2026-07-20",
    et("2026-07-20", "09:20"),
    30,
    "LIVE",
    105,
  );
  assert.equal(result.phase, "PRE_OPEN");
  assert.equal(result.metricState, "UNAVAILABLE");
  assert.equal(result.high, null);
  assert.equal(result.interactionState, "NOT_STARTED");
});

test("complete response validates and exposes all five structure packages", () => {
  const nowMs = et("2026-07-20", "10:11");
  const response = buildSpyDeterministicSessionStructureResponse(
    {
      dataset: {
        candles: datasetCandles(),
        latestCandleAt: "2026-07-20T14:05:00.000Z",
        fetchedAtMs: nowMs,
      },
      requestedStartAtMs: nowMs - SESSION_DATA_LOOKBACK_MS,
      requestedEndAtMs: nowMs,
      warningCode: null,
    },
    quote(112),
    nowMs,
  );
  assert.equal(response.product, "SPY_DETERMINISTIC_SESSION_STRUCTURE");
  assert.equal(response.methodologyVersion, "SESSION_STRUCTURE_V1");
  assert.equal(response.engineState, "AVAILABLE");
  assert.equal(response.dailyPivots.metricState, "LIVE");
  assert.equal(response.weeklyPivots.metricState, "LIVE");
  assert.equal(response.openingRanges.fiveMinute.isComplete, true);
  assert.equal(response.openingRanges.fifteenMinute.isComplete, true);
  assert.equal(response.openingRanges.thirtyMinute.isComplete, true);
  assert.doesNotThrow(() => SpyDeterministicSessionStructureResponseSchema.parse(response));
});

test("mock quote never becomes the current-price input", () => {
  const nowMs = et("2026-07-20", "10:11");
  const response = buildSpyDeterministicSessionStructureResponse(
    {
      dataset: {
        candles: datasetCandles(),
        latestCandleAt: "2026-07-20T14:05:00.000Z",
        fetchedAtMs: nowMs,
      },
      requestedStartAtMs: nowMs - SESSION_DATA_LOOKBACK_MS,
      requestedEndAtMs: nowMs,
      warningCode: null,
    },
    { ...quote(112), sourceState: "MOCK", warningCode: "NOT_CONNECTED" },
    nowMs,
  );
  assert.equal(response.price, null);
  assert.equal(response.openingRanges.thirtyMinute.pricePosition, "UNAVAILABLE");
  assert.equal(response.dailyPivots.metricState, "LIVE");
});

test("missing candle source returns a schema-valid unavailable response", () => {
  const nowMs = et("2026-07-20", "10:11");
  const response = buildSpyDeterministicSessionStructureResponse(
    {
      dataset: null,
      requestedStartAtMs: nowMs,
      requestedEndAtMs: nowMs,
      warningCode: "UPSTREAM_ERROR",
    },
    quote(112),
    nowMs,
  );
  assert.equal(response.engineState, "UNAVAILABLE");
  assert.equal(response.dailyPivots.metricState, "UNAVAILABLE");
  assert.equal(response.openingRanges.fiveMinute.metricState, "UNAVAILABLE");
  assert.doesNotThrow(() => SpyDeterministicSessionStructureResponseSchema.parse(response));
});

test("route, service, index, and API client expose the dedicated product", () => {
  const routeSource = readFileSync(
    "apps/server/src/routes/session-structure.routes.ts",
    "utf8",
  );
  const serviceSource = readFileSync(
    "apps/server/src/services/session-structure.service.ts",
    "utf8",
  );
  const indexSource = readFileSync("apps/server/src/index.ts", "utf8");
  const apiClientSource = readFileSync("apps/web/src/lib/api-client.ts", "utf8");

  assert.match(routeSource, /sessionStructureRouter\.get\("\/spy"/);
  assert.match(routeSource, /QUERY_PARAMETERS_NOT_ALLOWED/);
  assert.match(routeSource, /Cache-Control/);
  assert.match(serviceSource, /getSpyBoundedCandleAccess/);
  assert.match(serviceSource, /getSpyQuote/);
  assert.match(indexSource, /app\.use\("\/api\/session-structure"/);
  assert.match(apiClientSource, /\/api\/session-structure\/spy/);
  assert.match(apiClientSource, /SpyDeterministicSessionStructureResponseSchema/);
});

test("methodology and safety disclosures are explicit", () => {
  const nowMs = et("2026-07-20", "10:11");
  const response = buildSpyDeterministicSessionStructureResponse(
    {
      dataset: {
        candles: datasetCandles(),
        latestCandleAt: "2026-07-20T14:05:00.000Z",
        fetchedAtMs: nowMs,
      },
      requestedStartAtMs: nowMs - SESSION_DATA_LOOKBACK_MS,
      requestedEndAtMs: nowMs,
      warningCode: null,
    },
    quote(112),
    nowMs,
  );
  assert.deepEqual(response.methodology.pivotLevels, ["P", "R1", "S1", "R2", "S2"]);
  assert.deepEqual(response.methodology.openingRangeDurationsMinutes, [5, 15, 30]);
  assert.equal(response.methodology.boundedCandleLookbackCalendarDays, 21);
  assert.equal(response.disclosures.noFutureCandles, true);
  assert.equal(response.disclosures.noStandaloneSignals, true);
  assert.equal(response.disclosures.noOrderExecution, true);
});

let passed = 0;
let failed = 0;
for (const [name, fn] of tests) {
  try {
    fn();
    passed += 1;
    console.log(`✓ ${name}`);
  } catch (error) {
    failed += 1;
    console.error(`✗ ${name}`);
    console.error(error);
  }
}
console.log(`\nSession Structure tests: ${passed} passed, ${failed} failed`);
if (failed > 0) process.exitCode = 1;
