/**
 * Deterministic presentation tests for V1.9.1 system readiness.
 * Run: npx --no-install tsx apps/web/src/lib/system-readiness-view.spec.ts
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  dataProbeComponentLabel,
  dataProbeComponentTone,
  dataProbeLabel,
  dataProbeTone,
  formatReadinessTimestamp,
  readinessCheckLabel,
  readinessCheckTone,
  readinessEngineLabel,
  readinessEngineTone,
} from "./system-readiness-view";

const tests: Array<[string, () => void]> = [];
function test(name: string, fn: () => void): void {
  tests.push([name, fn]);
}

test("readiness engine labels and tones are deterministic", () => {
  assert.equal(readinessEngineLabel("READY"), "Ready");
  assert.equal(readinessEngineLabel("DEGRADED"), "Degraded");
  assert.equal(readinessEngineLabel("BLOCKED"), "Blocked");
  assert.equal(readinessEngineTone("READY"), "bull");
  assert.equal(readinessEngineTone("DEGRADED"), "wait");
  assert.equal(readinessEngineTone("BLOCKED"), "bear");
});

test("readiness check labels and tones distinguish pass warning and fail", () => {
  assert.equal(readinessCheckLabel("PASS"), "Pass");
  assert.equal(readinessCheckLabel("WARNING"), "Warning");
  assert.equal(readinessCheckLabel("FAIL"), "Fail");
  assert.equal(readinessCheckTone("PASS"), "bull");
  assert.equal(readinessCheckTone("WARNING"), "wait");
  assert.equal(readinessCheckTone("FAIL"), "bear");
});

test("probe labels and tones are deterministic", () => {
  assert.equal(dataProbeLabel("PASS"), "Passed");
  assert.equal(dataProbeLabel("DEGRADED"), "Degraded");
  assert.equal(dataProbeLabel("FAIL"), "Failed");
  assert.equal(dataProbeTone("PASS"), "bull");
  assert.equal(dataProbeTone("DEGRADED"), "wait");
  assert.equal(dataProbeTone("FAIL"), "bear");
});

test("not-applicable probe components use neutral warning tone", () => {
  assert.equal(dataProbeComponentLabel("NOT_APPLICABLE"), "Not applicable");
  assert.equal(dataProbeComponentTone("NOT_APPLICABLE"), "wait");
});

test("readiness timestamps render in Eastern time", () => {
  assert.match(
    formatReadinessTimestamp("2026-07-20T16:00:00.000Z"),
    /Jul 20, 2026.*12:00:00 PM/,
  );
});

test("system page uses the complete readiness panel", () => {
  const source = readFileSync(
    resolve(process.cwd(), "apps/web/src/app/system/page.tsx"),
    "utf8",
  );
  assert.match(source, /SystemReadinessPanel/);
  assert.match(source, /V1\.9\.1 configuration/);
});

test("readiness panel uses dedicated query and explicit probe mutation", () => {
  const source = readFileSync(
    resolve(
      process.cwd(),
      "apps/web/src/components/system/system-readiness-panel.tsx",
    ),
    "utf8",
  );
  assert.match(source, /useSystemReadiness/);
  assert.match(source, /useRunSystemDataProbe/);
  assert.match(source, /Run complete probe/);
  assert.match(source, /five-component probe/);
  assert.match(source, /Trading Workspace/);
  assert.match(source, /does not send Discord messages/);
  assert.match(source, /no.*orders/i);
});

test("system hook does not automatically run provider probe", () => {
  const source = readFileSync(
    resolve(process.cwd(), "apps/web/src/hooks/use-system-readiness.ts"),
    "utf8",
  );
  assert.match(source, /useMutation/);
  assert.doesNotMatch(source, /runSystemDataProbe.*refetchInterval/s);
  assert.match(source, /apiClient\.runSystemDataProbe/);
});

test("API client validates readiness and probe responses", () => {
  const source = readFileSync(
    resolve(process.cwd(), "apps/web/src/lib/api-client.ts"),
    "utf8",
  );
  assert.match(source, /\/api\/system\/readiness/);
  assert.match(source, /SystemReadinessResponseSchema/);
  assert.match(source, /\/api\/system\/probe/);
  assert.match(source, /SystemDataProbeResponseSchema/);
  assert.match(source, /SystemDataProbeRequestSchema/);
});

test("desktop and mobile navigation expose System Readiness", () => {
  const sidebar = readFileSync(
    resolve(process.cwd(), "apps/web/src/components/layout/sidebar.tsx"),
    "utf8",
  );
  const mobile = readFileSync(
    resolve(process.cwd(), "apps/web/src/components/layout/mobile-nav.tsx"),
    "utf8",
  );
  assert.match(sidebar, /href: "\/system"/);
  assert.match(sidebar, /System Readiness/);
  assert.match(mobile, /href: "\/system"/);
  assert.match(mobile, /label: "System"/);
});

test("system page contains no trade execution controls", () => {
  const source = readFileSync(
    resolve(
      process.cwd(),
      "apps/web/src/components/system/system-readiness-panel.tsx",
    ),
    "utf8",
  );
  assert.doesNotMatch(source, /place order/i);
  assert.doesNotMatch(source, /submit order/i);
  assert.doesNotMatch(source, /buy to open/i);
  assert.doesNotMatch(source, /sell to close/i);
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
console.log(`\nSystem readiness view tests: ${passed} passed, 0 failed`);
