import assert from "node:assert/strict";
import {
  SpyZeroDteDeterministicMarketStateResponseSchema,
  type SpyCandle,
} from "@spy-copilot/shared";
import { buildHistoricalUnderlyingDecisionCycles } from "./historical-underlying-backtest.logic";
import { buildPointInTimeBacktestRun } from "./point-in-time-backtest.logic";
import {
  fetchHistoricalUnderlyingCandlesWithDependencies,
  historicalUnderlyingRequestWindow,
  newYorkDateTimeToEpochMs,
} from "./historical-underlying-backtest.service";

let passed = 0;
async function test(name: string, fn: () => void | Promise<void>) {
  await fn();
  passed += 1;
  console.log(`✓ ${name}`);
}

function candleAt(
  marketDate: string,
  hour: number,
  minute: number,
  close: number,
  volume = 1000,
): SpyCandle {
  const timestamp = newYorkDateTimeToEpochMs(marketDate, hour, minute);
  return {
    timestamp,
    open: close - 0.04,
    high: close + 0.12,
    low: close - 0.12,
    close,
    volume,
  };
}

function sessionCandles(
  marketDate: string,
  startHour: number,
  startMinute: number,
  endHour: number,
  endMinute: number,
  startPrice: number,
): SpyCandle[] {
  const rows: SpyCandle[] = [];
  let minutes = startHour * 60 + startMinute;
  const end = endHour * 60 + endMinute;
  let index = 0;
  while (minutes <= end) {
    rows.push(
      candleAt(
        marketDate,
        Math.floor(minutes / 60),
        minutes % 60,
        startPrice + index * 0.03,
        1000 + index * 5,
      ),
    );
    minutes += 5;
    index += 1;
  }
  return rows;
}

async function main() {
  await test("New York conversion follows summer and winter offsets", () => {
    assert.equal(
      new Date(newYorkDateTimeToEpochMs("2026-07-17", 9, 30)).toISOString(),
      "2026-07-17T13:30:00.000Z",
    );
    assert.equal(
      new Date(newYorkDateTimeToEpochMs("2026-01-16", 9, 30)).toISOString(),
      "2026-01-16T14:30:00.000Z",
    );
  });

  await test("historical request window includes prior-session lookback", () => {
    const window = historicalUnderlyingRequestWindow("2026-07-17", "2026-07-17");
    assert.equal(window.rangeDays, 1);
    assert.ok(window.startDateMs < newYorkDateTimeToEpochMs("2026-07-17", 0, 0));
    assert.ok(window.endDateMs > newYorkDateTimeToEpochMs("2026-07-17", 16, 0));
  });

  await test("historical boundary builder starts at the completed 15-minute range", () => {
    const previousRth = sessionCandles("2026-07-16", 9, 30, 15, 55, 750);
    const premarket = sessionCandles("2026-07-17", 7, 0, 9, 25, 753);
    const rth = sessionCandles("2026-07-17", 9, 30, 15, 55, 754);
    const window = historicalUnderlyingRequestWindow("2026-07-17", "2026-07-17");
    const rows = buildHistoricalUnderlyingDecisionCycles({
      candles: [...previousRth, ...premarket, ...rth],
      marketDates: ["2026-07-17"],
      requestedStartAtMs: window.startDateMs,
      requestedEndAtMs: window.endDateMs,
    });
    assert.ok(rows.length > 0);
    assert.equal(rows[0]?.sourceKind, "HISTORICAL_UNDERLYING");
    assert.equal(
      new Date(rows[0]!.sourceCalculatedAt).toISOString(),
      "2026-07-17T13:45:00.000Z",
    );
    for (const row of rows) {
      const state = SpyZeroDteDeterministicMarketStateResponseSchema.parse(
        row.sourceMarketState,
      );
      const boundary = Date.parse(new Date(row.sourceCalculatedAt).toISOString());
      for (const candle of state.executionContext?.recentCompletedCandles ?? []) {
        assert.ok(candle.timestamp + 5 * 60_000 <= boundary);
      }
    }
    const run = buildPointInTimeBacktestRun({
      id: "historical-run",
      createdAt: "2026-07-21T00:00:00.000Z",
      request: {
        startMarketDate: "2026-07-17",
        endMarketDate: "2026-07-17",
        maximumHoldMinutes: 60,
      },
      sourceRows: rows,
    });
    assert.ok(run.episodes.length > 0);
    assert.equal(run.episodes[0]?.replaySourceMode, "HISTORICAL_UNDERLYING_ONLY");
    assert.equal(run.episodes[0]?.selectedContractSymbol, null);
    assert.equal(run.source.historicalUnderlyingBoundaryCount, rows.length);
  });

  await test("range limit fails before any provider call", async () => {
    let calls = 0;
    const result = await fetchHistoricalUnderlyingCandlesWithDependencies(
      "2026-01-01",
      "2026-03-01",
      {
        getAccessToken: async () => {
          calls += 1;
          return "token";
        },
        refresh: async () => undefined,
        fetchHistory: async () => {
          calls += 1;
          return new Response();
        },
        now: () => Date.parse("2026-03-02T00:00:00.000Z"),
      },
    );
    assert.equal(result.failureCode, "RANGE_LIMIT_EXCEEDED");
    assert.equal(calls, 0);
  });

  await test("historical fetch retries once after token refresh", async () => {
    const tokens: string[] = [];
    let refreshCount = 0;
    let tokenCount = 0;
    const candle = candleAt("2026-07-17", 9, 30, 754);
    const result = await fetchHistoricalUnderlyingCandlesWithDependencies(
      "2026-07-17",
      "2026-07-17",
      {
        getAccessToken: async () => {
          tokenCount += 1;
          return tokenCount === 1 ? "expired" : "fresh";
        },
        refresh: async () => {
          refreshCount += 1;
        },
        fetchHistory: async (token) => {
          tokens.push(token);
          return token === "expired"
            ? new Response(null, { status: 401 })
            : new Response(
                JSON.stringify({
                  symbol: "SPY",
                  candles: [
                    {
                      open: candle.open,
                      high: candle.high,
                      low: candle.low,
                      close: candle.close,
                      volume: candle.volume,
                      datetime: candle.timestamp,
                    },
                  ],
                }),
                { status: 200, headers: { "content-type": "application/json" } },
              );
        },
        now: () => Date.parse("2026-07-21T00:00:00.000Z"),
      },
    );
    assert.equal(result.failureCode, null);
    assert.equal(result.candles?.length, 1);
    assert.deepEqual(tokens, ["expired", "fresh"]);
    assert.equal(refreshCount, 1);
  });

  console.log(`Historical underlying replay: ${passed} tests passed.`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
