/**
 * Deterministic tests for the fixed Eastern-time scheduled-report clock.
 * Run: npx --no-install tsx apps/server/src/services/scheduled-report-schedule.spec.ts
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { SpyZeroDteScheduledReportScheduleEvaluationResponseSchema } from "@spy-copilot/shared";
import {
  SCHEDULED_REPORT_DUE_WINDOW_MINUTES,
  SCHEDULED_REPORT_SCHEDULE_EVALUATION_METHODOLOGY_VERSION,
  evaluateSpyZeroDteScheduledReportSchedule,
} from "./scheduled-report-schedule.logic";
import { getSpyZeroDteScheduledReportScheduleWithDependencies } from "./scheduled-report-schedule.service";

const tests: Array<[string, () => void]> = [];
function test(name: string, fn: () => void): void {
  tests.push([name, fn]);
}

function at(iso: string) {
  return evaluateSpyZeroDteScheduledReportSchedule(Date.parse(iso));
}

test("methodology and fixed schedule validate", () => {
  const result = at("2026-07-20T13:25:00.000Z");
  assert.equal(
    result.methodologyVersion,
    SCHEDULED_REPORT_SCHEDULE_EVALUATION_METHODOLOGY_VERSION,
  );
  assert.equal(result.methodology.dueWindowMinutes, SCHEDULED_REPORT_DUE_WINDOW_MINUTES);
  assert.equal(result.schedule.length, 4);
  SpyZeroDteScheduledReportScheduleEvaluationResponseSchema.parse(result);
});

test("9:25 ET activates the premarket window", () => {
  const result = at("2026-07-20T13:25:00.000Z");
  assert.equal(result.scheduleState, "DUE");
  assert.equal(result.dueReportType, "PREMARKET_0925");
  assert.equal(result.easternTime, "09:25:00");
});

test("9:29 ET remains inside the premarket window", () => {
  const result = at("2026-07-20T13:29:59.000Z");
  assert.equal(result.dueReportType, "PREMARKET_0925");
});

test("9:30 ET closes the premarket window", () => {
  const result = at("2026-07-20T13:30:00.000Z");
  assert.equal(result.scheduleState, "WAITING");
  assert.equal(result.primaryReasonCode, "BETWEEN_REPORT_WINDOWS");
  assert.equal(result.nextReportType, "OPENING_0935");
});

test("9:35 ET activates the first opening report", () => {
  assert.equal(at("2026-07-20T13:35:00.000Z").dueReportType, "OPENING_0935");
});

test("9:45 ET activates the opening-structure report", () => {
  assert.equal(at("2026-07-20T13:45:00.000Z").dueReportType, "OPENING_0945");
});

test("10:00 ET activates the market update", () => {
  assert.equal(at("2026-07-20T14:00:00.000Z").dueReportType, "UPDATE_1000");
});

test("before 9:25 ET waits for the first report", () => {
  const result = at("2026-07-20T13:24:59.000Z");
  assert.equal(result.scheduleState, "WAITING");
  assert.equal(result.primaryReasonCode, "BEFORE_FIRST_REPORT");
  assert.equal(result.nextReportType, "PREMARKET_0925");
});

test("after 10:05 ET marks the daily schedule complete", () => {
  const result = at("2026-07-20T14:05:00.000Z");
  assert.equal(result.scheduleState, "COMPLETE");
  assert.equal(result.primaryReasonCode, "AFTER_FINAL_REPORT");
  assert.equal(result.nextReportType, null);
});

test("Saturday is suppressed without a due report", () => {
  const result = at("2026-07-18T13:25:00.000Z");
  assert.equal(result.scheduleState, "NON_TRADING_DAY");
  assert.equal(result.primaryReasonCode, "WEEKEND_SUPPRESSED");
  assert.equal(result.dueReportType, null);
});

test("Sunday is suppressed without a due report", () => {
  const result = at("2026-07-19T13:25:00.000Z");
  assert.equal(result.easternWeekday, "SUNDAY");
  assert.equal(result.scheduleState, "NON_TRADING_DAY");
});

test("winter timestamps use Eastern Standard Time", () => {
  const result = at("2026-01-05T14:25:00.000Z");
  assert.equal(result.easternTime, "09:25:00");
  assert.equal(result.dueReportType, "PREMARKET_0925");
});

test("schedule evaluation exposes the holiday-calendar limitation", () => {
  const result = at("2026-07-20T13:25:00.000Z");
  assert.equal(result.disclosures.noExchangeHolidayCalendar, true);
  assert.equal(result.methodology.holidayCalendarMethod, "NONE");
});

test("response contains no delivery account or execution data", () => {
  const text = JSON.stringify(at("2026-07-20T13:25:00.000Z"));
  for (const forbidden of [
    "webhookUrl",
    "accountNumber",
    "accountHash",
    "orderQuantity",
    "orderExecution",
    "positions",
    "transactions",
  ]) {
    assert.equal(text.includes(forbidden), false);
  }
});

test("service reads the clock exactly once", () => {
  let calls = 0;
  const result = getSpyZeroDteScheduledReportScheduleWithDependencies({
    now: () => {
      calls += 1;
      return Date.parse("2026-07-20T13:25:00.000Z");
    },
  });
  assert.equal(calls, 1);
  assert.equal(result.dueReportType, "PREMARKET_0925");
});

test("route is GET-only no-store and rejects query parameters", () => {
  const route = readFileSync(
    resolve(process.cwd(), "apps/server/src/routes/report.routes.ts"),
    "utf8",
  );
  assert.equal(route.includes('router.get("/spy/schedule-evaluation"'), true);
  assert.equal(route.includes("QUERY_PARAMETERS_NOT_SUPPORTED"), true);
  assert.equal(route.includes('res.setHeader("Cache-Control", "no-store")'), true);
});

test("API client validates the schedule-evaluation route", () => {
  const client = readFileSync(
    resolve(process.cwd(), "apps/web/src/lib/api-client.ts"),
    "utf8",
  );
  assert.equal(client.includes("/api/reports/spy/schedule-evaluation"), true);
  assert.equal(
    client.includes("SpyZeroDteScheduledReportScheduleEvaluationResponseSchema"),
    true,
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
console.log(`\nScheduled Report schedule-evaluation tests: ${passed} passed, ${failed} failed`);
if (failed > 0) process.exitCode = 1;
