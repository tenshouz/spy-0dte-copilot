/**
 * Deterministic tests for the published NYSE 2026-2028 full-day closure table.
 * Run: npx --no-install tsx apps/server/src/services/nyse-full-day-calendar.spec.ts
 */
import assert from "node:assert/strict";
import {
  NYSE_FULL_DAY_CALENDAR_METHOD,
  NYSE_FULL_DAY_CALENDAR_SUPPORTED_YEAR_END,
  NYSE_FULL_DAY_CALENDAR_SUPPORTED_YEAR_START,
  evaluateNyseFullDayCalendar,
  getNyseOfficialFullDayClosures,
} from "./nyse-full-day-calendar.logic";

const tests: Array<[string, () => void]> = [];
function test(name: string, fn: () => void): void {
  tests.push([name, fn]);
}

test("calendar methodology and supported years are fixed", () => {
  assert.equal(
    NYSE_FULL_DAY_CALENDAR_METHOD,
    "NYSE_OFFICIAL_PUBLISHED_FULL_DAY_CLOSURES_2026_2028",
  );
  assert.equal(NYSE_FULL_DAY_CALENDAR_SUPPORTED_YEAR_START, 2026);
  assert.equal(NYSE_FULL_DAY_CALENDAR_SUPPORTED_YEAR_END, 2028);
});

test("the official table contains 29 full-day closures", () => {
  assert.equal(getNyseOfficialFullDayClosures().length, 29);
});

test("2026 Independence Day observed is a full-day closure", () => {
  assert.deepEqual(evaluateNyseFullDayCalendar("2026-07-03"), {
    coverageState: "SUPPORTED",
    holidayState: "HOLIDAY",
    holidayName: "INDEPENDENCE_DAY",
    holidayObserved: true,
  });
});

test("2026 regular weekday is not a holiday", () => {
  assert.deepEqual(evaluateNyseFullDayCalendar("2026-07-20"), {
    coverageState: "SUPPORTED",
    holidayState: "NOT_HOLIDAY",
    holidayName: null,
    holidayObserved: null,
  });
});

test("2027 Juneteenth observed is represented exactly", () => {
  const result = evaluateNyseFullDayCalendar("2027-06-18");
  assert.equal(result.holidayName, "JUNETEENTH_NATIONAL_INDEPENDENCE_DAY");
  assert.equal(result.holidayObserved, true);
});

test("2027 Christmas observed is represented exactly", () => {
  const result = evaluateNyseFullDayCalendar("2027-12-24");
  assert.equal(result.holidayName, "CHRISTMAS_DAY");
  assert.equal(result.holidayObserved, true);
});

test("2028 has no New Year's observed closure", () => {
  const result = evaluateNyseFullDayCalendar("2027-12-31");
  assert.equal(result.holidayState, "NOT_HOLIDAY");
});

test("2028 Independence Day is a full-day closure", () => {
  const result = evaluateNyseFullDayCalendar("2028-07-04");
  assert.equal(result.holidayName, "INDEPENDENCE_DAY");
  assert.equal(result.holidayObserved, false);
});

test("unsupported years fail closed as unknown", () => {
  assert.deepEqual(evaluateNyseFullDayCalendar("2029-01-02"), {
    coverageState: "UNSUPPORTED",
    holidayState: "UNKNOWN",
    holidayName: null,
    holidayObserved: null,
  });
});

test("malformed market dates fail closed as unknown", () => {
  assert.equal(evaluateNyseFullDayCalendar("not-a-date").holidayState, "UNKNOWN");
  assert.equal(evaluateNyseFullDayCalendar("2026-02-31").holidayState, "UNKNOWN");
});

test("every closure date is unique and inside the supported range", () => {
  const entries = getNyseOfficialFullDayClosures();
  const dates = entries.map((entry) => entry.marketDate);
  assert.equal(new Set(dates).size, dates.length);
  for (const entry of entries) {
    const year = Number(entry.marketDate.slice(0, 4));
    assert.equal(year >= 2026 && year <= 2028, true);
    assert.equal(evaluateNyseFullDayCalendar(entry.marketDate).holidayState, "HOLIDAY");
  }
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
console.log(`\nNYSE full-day calendar tests: ${passed} passed, ${failed} failed`);
if (failed > 0) process.exitCode = 1;
