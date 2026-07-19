/**
 * Pure display-contract and static safety tests for the in-app alert monitor.
 * Run: npx --no-install tsx apps/web/src/lib/trade-plan-alert-transition-view.spec.ts
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  formatAlertMonitorDuration,
  formatAlertMonitorTimestamp,
  getAlertMonitorReasonDescription,
  getAlertMonitorStateView,
  getAlertSeverityView,
  getAlertTransitionTypeLabel,
} from "./trade-plan-alert-transition-view";

let passed = 0;
let failed = 0;
function test(name: string, fn: () => void): void {
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

test("every transition state has fixed display copy", () => {
  for (const state of ["EMIT", "SUPPRESSED", "UNAVAILABLE"] as const) {
    const view = getAlertMonitorStateView(state);
    assert.ok(view.title.length > 0);
    assert.ok(view.description.length > 0);
  }
});

test("every transition reason has fixed explanatory copy", () => {
  for (const reason of [
    "INITIAL_CANDIDATE_EMIT",
    "CANDIDATE_CHANGED_EMIT",
    "CANDIDATE_CLEARED_EMIT",
    "CANDIDATE_REAPPEARED_EMIT",
    "ACTIVE_DUPLICATE_SUPPRESSED",
    "REAPPEARANCE_COOLDOWN_SUPPRESSED",
    "NO_CANDIDATE_SUPPRESSED",
    "MARKET_DATE_RESET_SUPPRESSED",
    "SOURCE_CANDIDATE_UNAVAILABLE",
    "SOURCE_CANDIDATE_INCONSISTENT",
    "SOURCE_CANDIDATE_SERVICE_FAILURE",
  ] as const) {
    assert.ok(getAlertMonitorReasonDescription(reason).length > 0);
  }
});

test("every emitted transition type has a deterministic label", () => {
  for (const type of [
    "INITIAL_CANDIDATE",
    "CANDIDATE_CHANGED",
    "CANDIDATE_CLEARED",
    "CANDIDATE_REAPPEARED",
  ] as const) {
    assert.ok(getAlertTransitionTypeLabel(type).length > 0);
  }
});

test("every alert severity has a label and supported tone", () => {
  for (const severity of ["OPPORTUNITY", "INFO", "WARNING"] as const) {
    const view = getAlertSeverityView(severity);
    assert.ok(view.label.length > 0);
    assert.ok(["default", "accent", "bull", "bear", "wait"].includes(view.tone));
  }
});

test("timestamp formatting is null-safe and explicitly Eastern", () => {
  assert.equal(formatAlertMonitorTimestamp(null), "—");
  assert.equal(formatAlertMonitorTimestamp("not-a-date"), "—");
  assert.match(formatAlertMonitorTimestamp("2026-07-19T15:00:00.000Z"), /ET$/);
});

test("duration formatting handles milliseconds seconds and invalid values", () => {
  assert.equal(formatAlertMonitorDuration(500), "500 ms");
  assert.equal(formatAlertMonitorDuration(15_000), "15 sec");
  assert.equal(formatAlertMonitorDuration(-1), "—");
});

test("monitor hook is disabled until explicitly enabled", () => {
  const hook = readFileSync(
    resolve(
      process.cwd(),
      "apps/web/src/hooks/use-spy-trade-plan-alert-transition.ts",
    ),
    "utf8",
  );
  assert.equal(hook.includes("enabled,"), true);
  assert.equal(
    hook.includes("refetchInterval: enabled"),
    true,
  );
  assert.equal(hook.includes("refetchIntervalInBackground: false"), true);
  assert.equal(hook.includes("retry: false"), true);
  assert.equal(hook.includes("15_000"), true);
});

test("monitor requires explicit Start and Stop controls", () => {
  const monitor = readFileSync(
    resolve(
      process.cwd(),
      "apps/web/src/components/alerts/trade-plan-alert-monitor.tsx",
    ),
    "utf8",
  );
  assert.equal(monitor.includes("Start monitor"), true);
  assert.equal(monitor.includes("Stop monitor"), true);
  assert.equal(monitor.includes("useState(false)"), true);
  assert.equal(monitor.includes("useSpyTradePlanAlertTransition(monitoring)"), true);
});

test("session event collection deduplicates and remains bounded", () => {
  const monitor = readFileSync(
    resolve(
      process.cwd(),
      "apps/web/src/components/alerts/trade-plan-alert-monitor.tsx",
    ),
    "utf8",
  );
  assert.equal(monitor.includes("transitionFingerprint"), true);
  assert.equal(monitor.includes("MAX_SESSION_EVENTS = 50"), true);
  assert.equal(monitor.includes(".slice(0, MAX_SESSION_EVENTS)"), true);
  assert.equal(monitor.includes("Clear session"), true);
});

test("monitor has no persistence or notification-delivery integration", () => {
  const monitor = readFileSync(
    resolve(
      process.cwd(),
      "apps/web/src/components/alerts/trade-plan-alert-monitor.tsx",
    ),
    "utf8",
  );
  for (const forbidden of [
    "localStorage",
    "sessionStorage",
    "indexedDB",
    "Discord webhook",
    "sendNotification",
    "Notification.requestPermission",
  ]) {
    assert.equal(monitor.includes(forbidden), false, `${forbidden} must not appear`);
  }
});

test("monitor contains no order creation or execution control", () => {
  const monitor = readFileSync(
    resolve(
      process.cwd(),
      "apps/web/src/components/alerts/trade-plan-alert-monitor.tsx",
    ),
    "utf8",
  );
  for (const forbidden of [
    "Submit Order",
    "Preview Order",
    "Place Order",
    "Buy Calls",
    "Buy Puts",
    "Execute Trade",
  ]) {
    assert.equal(monitor.includes(forbidden), false, `${forbidden} must not appear`);
  }
});

test("Alerts page replaces the mock-alert hook with the transition monitor", () => {
  const page = readFileSync(
    resolve(process.cwd(), "apps/web/src/app/alerts/page.tsx"),
    "utf8",
  );
  assert.equal(page.includes("<TradePlanAlertMonitor />"), true);
  assert.equal(page.includes("useAlerts"), false);
  assert.equal(page.includes("AlertCard"), false);
  assert.equal(page.includes("Mirrors what's sent to Discord"), false);
});

console.log(`\nTrade Plan alert-monitor view tests: ${passed} passed, ${failed} failed`);
if (failed > 0) process.exitCode = 1;
