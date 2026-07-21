import assert from "node:assert/strict";
import type { SpyZeroDteDeterministicMarketStateResponse } from "@spy-copilot/shared";
import {
  buildPointInTimeBacktestRun,
  type PointInTimeDecisionCycleSource,
} from "./point-in-time-backtest.logic";
import {
  makeV140MarketState,
  makeV140OptionsChain,
} from "./trade-engine-v140.test-fixtures";

let passed = 0;
function test(name: string, fn: () => void) {
  fn();
  passed += 1;
  console.log(`✓ ${name}`);
}

function row(
  id: string,
  sourceCalculatedAt: string,
  state: SpyZeroDteDeterministicMarketStateResponse,
  withChain = false,
): PointInTimeDecisionCycleSource {
  return {
    id,
    currentMarketDate: state.currentMarketDate,
    sourceCalculatedAt,
    capturedAt: sourceCalculatedAt,
    sourceAssembly: {},
    sourceMarketState: state,
    optionsChainSnapshotId: withChain ? "chain-1" : null,
    optionsChainPayload: withChain ? makeV140OptionsChain("CALLS") : null,
  };
}

function futureState(args: {
  calculatedAt: string;
  candleStart: string;
  high: number;
  low: number;
  close: number;
}): SpyZeroDteDeterministicMarketStateResponse {
  const state = structuredClone(makeV140MarketState("CALLS"));
  state.calculatedAt = args.calculatedAt;
  state.quoteTimestamp = new Date(Date.parse(args.calculatedAt) - 2_000).toISOString();
  state.executionContext!.sourceCandleFetchedAt = new Date(
    Date.parse(args.calculatedAt) - 1_000,
  ).toISOString();
  state.executionContext!.recentCompletedCandles.push({
    timestamp: Date.parse(args.candleStart),
    open: args.close,
    high: args.high,
    low: args.low,
    close: args.close,
    volume: 1600,
  });
  state.executionContext!.completedCandleCount =
    state.executionContext!.recentCompletedCandles.length;
  state.executionContext!.latestCompletedCandleAt = args.candleStart;
  return state;
}

function runWithFuture(state: SpyZeroDteDeterministicMarketStateResponse) {
  return buildPointInTimeBacktestRun({
    id: "run-1",
    createdAt: "2026-07-21T04:00:00.000Z",
    request: {
      startMarketDate: null,
      endMarketDate: null,
      maximumHoldMinutes: 60,
    },
    sourceRows: [
      row(
        "entry",
        "2026-07-17T14:00:10.000Z",
        makeV140MarketState("CALLS"),
        true,
      ),
      row("future", state.calculatedAt, state),
    ],
  });
}

test("target-first uses future completed five-minute candle", () => {
  const run = runWithFuture(
    futureState({
      calculatedAt: "2026-07-17T14:05:10.000Z",
      candleStart: "2026-07-17T14:00:00.000Z",
      high: 760.1,
      low: 758.2,
      close: 760,
    }),
  );
  assert.equal(run.episodes[0]?.outcomeState, "TARGET_FIRST");
  assert.ok(Math.abs((run.episodes[0]?.realizedRMultiple ?? 0) - 3) < 1e-9);
});

test("stop-first is resolved separately", () => {
  const run = runWithFuture(
    futureState({
      calculatedAt: "2026-07-17T14:05:10.000Z",
      candleStart: "2026-07-17T14:00:00.000Z",
      high: 759,
      low: 757.7,
      close: 757.9,
    }),
  );
  assert.equal(run.episodes[0]?.outcomeState, "STOP_FIRST");
  assert.equal(run.episodes[0]?.realizedRMultiple, -1);
});

test("same-candle target and stop remains ambiguous", () => {
  const run = runWithFuture(
    futureState({
      calculatedAt: "2026-07-17T14:05:10.000Z",
      candleStart: "2026-07-17T14:00:00.000Z",
      high: 760.1,
      low: 757.7,
      close: 759,
    }),
  );
  assert.equal(run.episodes[0]?.outcomeState, "AMBIGUOUS_SAME_CANDLE");
  assert.equal(run.episodes[0]?.realizedRMultiple, null);
});

test("incomplete future coverage is not mislabeled as timeout", () => {
  const run = buildPointInTimeBacktestRun({
    id: "run-2",
    createdAt: "2026-07-21T04:00:00.000Z",
    request: { startMarketDate: null, endMarketDate: null, maximumHoldMinutes: 60 },
    sourceRows: [
      row("entry", "2026-07-17T14:00:10.000Z", makeV140MarketState("CALLS"), true),
    ],
  });
  assert.equal(run.episodes[0]?.outcomeState, "INSUFFICIENT_FUTURE_DATA");
  assert.equal(run.episodes[0]?.realizedRMultiple, null);
});

test("future source timestamps fail the no-look-ahead audit", () => {
  const state = makeV140MarketState("CALLS");
  state.quoteTimestamp = "2026-07-17T14:00:11.000Z";
  const run = buildPointInTimeBacktestRun({
    id: "run-3",
    createdAt: "2026-07-21T04:00:00.000Z",
    request: { startMarketDate: null, endMarketDate: null, maximumHoldMinutes: 60 },
    sourceRows: [row("entry", "2026-07-17T14:00:10.000Z", state, true)],
  });
  assert.equal(run.episodes.length, 0);
  assert.equal(run.issues[0]?.issueCode, "SOURCE_TIMESTAMP_AFTER_CYCLE");
});

test("duplicate READY captures create one episode", () => {
  const state = makeV140MarketState("CALLS");
  const run = buildPointInTimeBacktestRun({
    id: "run-4",
    createdAt: "2026-07-21T04:00:00.000Z",
    request: { startMarketDate: null, endMarketDate: null, maximumHoldMinutes: 60 },
    sourceRows: [
      row("entry-1", "2026-07-17T14:00:10.000Z", state, true),
      row("entry-2", "2026-07-17T14:00:11.000Z", state, true),
    ],
  });
  assert.equal(run.episodes.length, 1);
});

console.log(`Point-in-time backtest: ${passed} tests passed.`);
