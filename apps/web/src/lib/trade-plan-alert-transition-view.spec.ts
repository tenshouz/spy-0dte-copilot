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

test("explicit Discord delivery remains a separate user action", () => {
  const monitor = readFileSync(
    resolve(
      process.cwd(),
      "apps/web/src/components/alerts/trade-plan-alert-monitor.tsx",
    ),
    "utf8",
  );
  const hook = readFileSync(
    resolve(process.cwd(), "apps/web/src/hooks/use-discord-webhook.ts"),
    "utf8",
  );

  assert.equal(monitor.includes("Evaluate & send to Discord"), true);
  assert.equal(monitor.includes("onClick={requestDiscordDelivery}"), true);
  assert.equal(monitor.includes("discordDelivery.mutate(undefined"), true);
  assert.equal(monitor.includes('discordStatus.data?.state !== "READY"'), true);
  assert.equal(hook.includes("useDiscordTradePlanAlertDelivery"), true);
  assert.equal(hook.includes("mutationFn: apiClient.sendDiscordTradePlanAlert"), true);
});



test("automatic Discord delivery is opt-in foreground-only with approved cadences", () => {
  const monitor = readFileSync(
    resolve(
      process.cwd(),
      "apps/web/src/components/alerts/trade-plan-alert-monitor.tsx",
    ),
    "utf8",
  );
  const hook = readFileSync(
    resolve(process.cwd(), "apps/web/src/hooks/use-discord-webhook.ts"),
    "utf8",
  );

  assert.equal(monitor.includes("Start automatic delivery"), true);
  assert.equal(monitor.includes("Stop automatic delivery"), true);
  assert.equal(monitor.includes("useState(false)"), true);
  assert.equal(
    monitor.includes("useDiscordAutomaticTradePlanAlertDelivery"),
    true,
  );
  assert.equal(monitor.includes("automaticDiscordCadence"), true);
  assert.equal(hook.includes("15_000"), true);
  assert.equal(hook.includes("30_000"), true);
  assert.equal(hook.includes("60_000"), true);
  assert.equal(hook.includes("refetchIntervalInBackground: false"), true);
  assert.equal(hook.includes("refetchOnWindowFocus: false"), true);
  assert.equal(hook.includes("refetchOnReconnect: false"), true);
  assert.equal(hook.includes("retry: false"), true);
});

test("automatic delivery exposes bounded backend retry and shared deduplication copy", () => {
  const monitor = readFileSync(
    resolve(
      process.cwd(),
      "apps/web/src/components/alerts/trade-plan-alert-monitor.tsx",
    ),
    "utf8",
  );
  const client = readFileSync(
    resolve(process.cwd(), "apps/web/src/lib/api-client.ts"),
    "utf8",
  );

  assert.equal(monitor.includes("at most two attempts"), true);
  assert.equal(monitor.includes("three-second backoff"), true);
  assert.equal(monitor.includes("shared Discord"), true);
  assert.equal(monitor.includes("process-memory duplicate state"), true);
  assert.equal(
    client.includes("/api/discord/trade-plan-alert/automatic"),
    true,
  );
});

test("automatic delivery is session-only and has no background scheduler", () => {
  const monitor = readFileSync(
    resolve(
      process.cwd(),
      "apps/web/src/components/alerts/trade-plan-alert-monitor.tsx",
    ),
    "utf8",
  );
  const hook = readFileSync(
    resolve(process.cwd(), "apps/web/src/hooks/use-discord-webhook.ts"),
    "utf8",
  );
  for (const forbidden of [
    "localStorage",
    "sessionStorage",
    "indexedDB",
    "setInterval",
    "Notification.requestPermission",
  ]) {
    assert.equal(monitor.includes(forbidden), false, `${forbidden} must not appear`);
    assert.equal(hook.includes(forbidden), false, `${forbidden} must not appear`);
  }
  assert.equal(monitor.includes("not a background"), true);
  assert.equal(monitor.includes("does not persist"), true);
});

test("Settings and Alerts copy accurately describe automatic foreground delivery", () => {
  const settings = readFileSync(
    resolve(process.cwd(), "apps/web/src/app/settings/page.tsx"),
    "utf8",
  );
  const page = readFileSync(
    resolve(process.cwd(), "apps/web/src/app/alerts/page.tsx"),
    "utf8",
  );
  assert.equal(settings.includes("can be started from the Alerts page"), true);
  assert.equal(settings.includes("browser session remains open"), true);
  assert.equal(page.includes("No Discord delivery"), false);
  assert.equal(page.includes("Foreground browser sessions only"), true);
});

test("Discord delivery attempts are session-only bounded and clearable", () => {
  const monitor = readFileSync(
    resolve(
      process.cwd(),
      "apps/web/src/components/alerts/trade-plan-alert-monitor.tsx",
    ),
    "utf8",
  );

  assert.equal(monitor.includes("MAX_DISCORD_DELIVERY_ATTEMPTS = 25"), true);
  assert.equal(monitor.includes("Discord Delivery Attempts"), true);
  assert.equal(monitor.includes("Clear delivery history"), true);
  assert.equal(
    monitor.includes(".slice(0, MAX_DISCORD_DELIVERY_ATTEMPTS)"),
    true,
  );
  assert.equal(monitor.includes("setDiscordDeliveryAttempts"), true);
});

test("retry control is shown only for retry-eligible delivery results", () => {
  const monitor = readFileSync(
    resolve(
      process.cwd(),
      "apps/web/src/components/alerts/trade-plan-alert-monitor.tsx",
    ),
    "utf8",
  );

  assert.equal(monitor.includes("Retry delivery"), true);
  assert.equal(monitor.includes("result.state.retryEligible ?"), true);
  assert.equal(monitor.includes("onRetry={requestDiscordDelivery}"), true);
  assert.equal(monitor.includes("transitionStateCommitted"), true);
  assert.equal(monitor.includes("providerStatusCode"), true);
});

test("alert monitor and Discord delivery use no browser persistence or browser notifications", () => {
  const monitor = readFileSync(
    resolve(
      process.cwd(),
      "apps/web/src/components/alerts/trade-plan-alert-monitor.tsx",
    ),
    "utf8",
  );
  const hook = readFileSync(
    resolve(process.cwd(), "apps/web/src/hooks/use-discord-webhook.ts"),
    "utf8",
  );
  for (const forbidden of [
    "localStorage",
    "sessionStorage",
    "indexedDB",
    "sendNotification",
    "Notification.requestPermission",
  ]) {
    assert.equal(monitor.includes(forbidden), false, `${forbidden} must not appear`);
    assert.equal(hook.includes(forbidden), false, `${forbidden} must not appear`);
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


test("explicit scheduled-report delivery is caller-selected and never automatic", () => {
  const monitor = readFileSync(
    resolve(
      process.cwd(),
      "apps/web/src/components/alerts/trade-plan-alert-monitor.tsx",
    ),
    "utf8",
  );
  const hook = readFileSync(
    resolve(process.cwd(), "apps/web/src/hooks/use-discord-webhook.ts"),
    "utf8",
  );

  assert.equal(monitor.includes("Scheduled Report Delivery"), true);
  assert.equal(monitor.includes("Generate & send report"), true);
  assert.equal(monitor.includes("PREMARKET_0925"), true);
  assert.equal(monitor.includes("OPENING_0935"), true);
  assert.equal(monitor.includes("OPENING_0945"), true);
  assert.equal(monitor.includes("UPDATE_1000"), true);
  assert.equal(monitor.includes("not a scheduler"), true);
  assert.equal(hook.includes("useDiscordScheduledReportDelivery"), true);
  assert.equal(hook.includes("apiClient.sendDiscordScheduledReport"), true);
});

test("scheduled-report UI has no browser persistence automatic timer or order control", () => {
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
    "node-cron",
    "Schedule report automatically",
    "Place Order",
    "Submit Order",
  ]) {
    assert.equal(monitor.includes(forbidden), false, `${forbidden} must not appear`);
  }
});

console.log(`\nTrade Plan alert-monitor view tests: ${passed} passed, ${failed} failed`);
if (failed > 0) process.exitCode = 1;
