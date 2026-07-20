/**
 * Deterministic presentation tests for persistent backend automation.
 * Run: npx --no-install tsx apps/web/src/lib/backend-automation-view.spec.ts
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  backendAutomationDeliveryTone,
  backendAutomationReasonCopy,
  backendAutomationRuntimeLabel,
  backendAutomationRuntimeTone,
  formatBackendAutomationTime,
} from "./backend-automation-view";

const tests: Array<[string, () => void]> = [];
function test(name: string, fn: () => void): void {
  tests.push([name, fn]);
}

test("runtime labels are deterministic", () => {
  assert.equal(backendAutomationRuntimeLabel("ACTIVE"), "Active");
  assert.equal(backendAutomationRuntimeLabel("STANDBY"), "Standby");
  assert.equal(backendAutomationRuntimeLabel("STOPPED"), "Stopped");
  assert.equal(backendAutomationRuntimeLabel("STALE"), "Stale");
  assert.equal(backendAutomationRuntimeLabel("UNAVAILABLE"), "Unavailable");
});

test("runtime tones distinguish active stale and unavailable", () => {
  assert.equal(backendAutomationRuntimeTone("ACTIVE"), "bull");
  assert.equal(backendAutomationRuntimeTone("STALE"), "wait");
  assert.equal(backendAutomationRuntimeTone("UNAVAILABLE"), "bear");
  assert.equal(backendAutomationRuntimeTone("STOPPED"), "default");
});

test("delivery tones follow confirmed provider state", () => {
  assert.equal(backendAutomationDeliveryTone("DELIVERED"), "bull");
  assert.equal(backendAutomationDeliveryTone("FAILED"), "bear");
  assert.equal(backendAutomationDeliveryTone("AMBIGUOUS"), "wait");
  assert.equal(backendAutomationDeliveryTone("SUPPRESSED"), "default");
});

test("time formatting is null-safe and Eastern", () => {
  assert.equal(formatBackendAutomationTime(null), "—");
  assert.match(
    formatBackendAutomationTime("2026-07-20T14:30:00.000Z"),
    /Jul 20.*10:30:00 AM/,
  );
});

test("important scheduler reasons have fixed copy", () => {
  assert.match(backendAutomationReasonCopy("BACKEND_AUTOMATION_ACTIVE"), /database lease/i);
  assert.match(backendAutomationReasonCopy("PERSISTED_DUPLICATE_SUPPRESSED"), /PostgreSQL/i);
  assert.match(backendAutomationReasonCopy("DATABASE_UNAVAILABLE"), /temporarily unavailable/i);
});

test("automation panel uses dedicated settings status and history hooks", () => {
  const source = readFileSync(
    resolve(
      process.cwd(),
      "apps/web/src/components/settings/backend-automation-panel.tsx",
    ),
    "utf8",
  );
  assert.match(source, /useBackendAutomationSettings/);
  assert.match(source, /useBackendAutomationStatus/);
  assert.match(source, /useBackendAutomationHistory/);
  assert.match(source, /useUpdateBackendAutomationSettings/);
  assert.match(source, /useRunBackendAutomationOnce/);
});

test("automation panel has explicit master and category controls", () => {
  const source = readFileSync(
    resolve(
      process.cwd(),
      "apps/web/src/components/settings/backend-automation-panel.tsx",
    ),
    "utf8",
  );
  assert.match(source, /Enable persistent backend automation/);
  assert.match(source, /Trade Plan alerts/);
  assert.match(source, /Scheduled reports/);
  assert.match(source, /Save automation settings/);
  assert.match(source, /Evaluate now/);
});

test("settings page replaces placeholder alert toggles", () => {
  const source = readFileSync(
    resolve(process.cwd(), "apps/web/src/app/settings/page.tsx"),
    "utf8",
  );
  assert.match(source, /BackendAutomationPanel/);
  assert.doesNotMatch(source, /Toggle — M2/);
});

test("frontend hook does not implement a browser scheduler", () => {
  const source = readFileSync(
    resolve(process.cwd(), "apps/web/src/hooks/use-backend-automation.ts"),
    "utf8",
  );
  assert.doesNotMatch(source, /setInterval/);
  assert.doesNotMatch(source, /FOREGROUND_BROWSER_SESSION/);
  assert.match(source, /getBackendAutomationStatus/);
});

test("Alerts page disables foreground schedulers when persistent automation is enabled", () => {
  const source = readFileSync(
    resolve(
      process.cwd(),
      "apps/web/src/components/alerts/trade-plan-alert-monitor.tsx",
    ),
    "utf8",
  );
  assert.match(source, /useBackendAutomationSettings/);
  assert.match(source, /persistentBackendAutomationEnabled/);
  assert.match(source, /prevent competing\r?\n\s+schedulers and duplicate messages/);
});

test("API client validates all persistent automation endpoints", () => {
  const source = readFileSync(
    resolve(process.cwd(), "apps/web/src/lib/api-client.ts"),
    "utf8",
  );
  assert.match(source, /\/api\/automation\/settings/);
  assert.match(source, /\/api\/automation\/status/);
  assert.match(source, /\/api\/automation\/history/);
  assert.match(source, /\/api\/automation\/run-once/);
  assert.match(source, /BackendAutomationStatusResponseSchema/);
});

let passed = 0;
for (const [name, fn] of tests) {
  try {
    fn();
    passed += 1;
    console.log(`✓ ${name}`);
  } catch (error) {
    console.error(`✗ ${name}`);
    throw error;
  }
}
console.log(`\nBackend automation view tests: ${passed} passed, 0 failed`);
