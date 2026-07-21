import assert from "node:assert/strict";
import {
  BACKTEST_OUTCOME_LABEL,
  buildPointInTimeBacktestRequest,
  formatBacktestMoney,
  formatBacktestNumber,
  formatBacktestPercent,
  outcomeIsResolvedDirectional,
} from "./point-in-time-backtest-view";

assert.deepEqual(
  buildPointInTimeBacktestRequest({
    startMarketDate: "",
    endMarketDate: "2026-07-17",
    maximumHoldMinutes: 60,
  }),
  { startMarketDate: null, endMarketDate: "2026-07-17", maximumHoldMinutes: 60 },
);
assert.equal(formatBacktestPercent(62.345), "62.3%");
assert.equal(formatBacktestNumber(null), "—");
assert.equal(formatBacktestMoney(null), "—");
assert.equal(BACKTEST_OUTCOME_LABEL.AMBIGUOUS_SAME_CANDLE, "Ambiguous same candle");
assert.equal(outcomeIsResolvedDirectional("TARGET_FIRST"), true);
assert.equal(outcomeIsResolvedDirectional("TIMEOUT"), false);
console.log("Point-in-time backtest view: 7 tests passed.");
