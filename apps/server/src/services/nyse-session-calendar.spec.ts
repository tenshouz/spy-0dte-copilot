import assert from "node:assert/strict";
import {
  NYSE_EARLY_RTH_CLOSE_MINUTE,
  NYSE_REGULAR_RTH_CLOSE_MINUTE,
  NYSE_SESSION_CALENDAR_METHOD,
  evaluateNyseTradingSessionCalendar,
  getNyseOfficialEarlyCloseDates,
} from "./nyse-session-calendar.logic";

const tests: Array<[string, () => void]> = [];
function test(name: string, fn: () => void): void {
  tests.push([name, fn]);
}

test("methodology and close minutes are fixed", () => {
  assert.equal(
    NYSE_SESSION_CALENDAR_METHOD,
    "NYSE_OFFICIAL_PUBLISHED_FULL_DAY_AND_EARLY_CLOSES_2026_2028",
  );
  assert.equal(NYSE_REGULAR_RTH_CLOSE_MINUTE, 960);
  assert.equal(NYSE_EARLY_RTH_CLOSE_MINUTE, 780);
});

test("official early-close table contains five dates", () => {
  assert.deepEqual(getNyseOfficialEarlyCloseDates(), [
    "2026-11-27",
    "2026-12-24",
    "2027-11-26",
    "2028-07-03",
    "2028-11-24",
  ]);
});

test("regular trading day uses 4 PM close", () => {
  assert.deepEqual(evaluateNyseTradingSessionCalendar("2026-07-20"), {
    coverageState: "SUPPORTED",
    tradingDayState: "TRADING_DAY",
    rthCloseMinute: 960,
    earlyClose: false,
  });
});

test("day after Thanksgiving 2026 uses 1 PM close", () => {
  assert.deepEqual(evaluateNyseTradingSessionCalendar("2026-11-27"), {
    coverageState: "SUPPORTED",
    tradingDayState: "TRADING_DAY",
    rthCloseMinute: 780,
    earlyClose: true,
  });
});

test("Christmas Eve 2026 uses 1 PM close", () => {
  assert.equal(
    evaluateNyseTradingSessionCalendar("2026-12-24").rthCloseMinute,
    780,
  );
});

test("full-day holiday has no RTH close", () => {
  const result = evaluateNyseTradingSessionCalendar("2026-12-25");
  assert.equal(result.tradingDayState, "HOLIDAY");
  assert.equal(result.rthCloseMinute, null);
});

test("weekend has no RTH close", () => {
  const result = evaluateNyseTradingSessionCalendar("2026-07-19");
  assert.equal(result.tradingDayState, "WEEKEND");
  assert.equal(result.rthCloseMinute, null);
});

test("unsupported date fails closed", () => {
  assert.deepEqual(evaluateNyseTradingSessionCalendar("2029-01-02"), {
    coverageState: "UNSUPPORTED",
    tradingDayState: "UNKNOWN",
    rthCloseMinute: null,
    earlyClose: null,
  });
});

test("malformed date fails closed", () => {
  assert.equal(
    evaluateNyseTradingSessionCalendar("not-a-date").tradingDayState,
    "UNKNOWN",
  );
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
console.log(`\nNYSE session calendar tests: ${passed} passed, ${failed} failed`);
if (failed > 0) process.exitCode = 1;
