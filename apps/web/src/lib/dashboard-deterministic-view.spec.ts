/**
 * Pure presentation and static architecture tests for the deterministic Dashboard cutover.
 * Run: npx --no-install tsx apps/web/src/lib/dashboard-deterministic-view.spec.ts
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import type { SpyZeroDteGexProxyResponse } from "@spy-copilot/shared";
import {
  formatDashboardCompact,
  formatDashboardPrice,
  getDashboardBiasView,
  getDashboardPlanStateLabel,
  getDashboardSignLabel,
  summarizeGexConcentrations,
} from "./dashboard-deterministic-view";

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

const baseGex = {
  metricState: "LIVE",
  strikes: [
    { strikePrice: 590, netGammaExposureProxy: 10 },
    { strikePrice: 591, netGammaExposureProxy: 35 },
    { strikePrice: 592, netGammaExposureProxy: -12 },
    { strikePrice: 593, netGammaExposureProxy: -40 },
  ],
} as unknown as SpyZeroDteGexProxyResponse;

test("bias copy remains structural and recommendation-free", () => {
  assert.deepEqual(getDashboardBiasView("BULLISH"), { label: "BULLISH", tone: "bull" });
  assert.deepEqual(getDashboardBiasView("BEARISH"), { label: "BEARISH", tone: "bear" });
  assert.equal(getDashboardBiasView("NEUTRAL").label, "NEUTRAL");
  assert.equal(getDashboardBiasView("UNAVAILABLE").label, "UNAVAILABLE");
});

test("all Assembly plan states have fixed labels", () => {
  for (const state of [
    "READY",
    "WAITING_FOR_TRIGGER",
    "NO_QUALIFIED_CONTRACT",
    "NOT_QUALIFIED",
    "NO_SETUP",
    "NOT_APPLICABLE",
    "UNAVAILABLE",
  ] as const) {
    assert.ok(getDashboardPlanStateLabel(state).length > 0);
  }
});

test("sign and null-safe formatters are deterministic", () => {
  assert.equal(getDashboardSignLabel("POSITIVE"), "Positive");
  assert.equal(getDashboardSignLabel("NEGATIVE"), "Negative");
  assert.equal(getDashboardSignLabel("ZERO"), "Zero");
  assert.equal(getDashboardSignLabel(null), "Unavailable");
  assert.equal(formatDashboardPrice(null), "—");
  assert.equal(formatDashboardPrice(123.456), "$123.46");
  assert.equal(formatDashboardCompact(1_500_000), "+1.5M");
  assert.equal(formatDashboardCompact(-2_000), "-2.0K");
});

test("GEX concentration summary finds largest positive and negative rows", () => {
  assert.deepEqual(summarizeGexConcentrations(baseGex), {
    largestPositiveStrike: 591,
    largestPositiveExposure: 35,
    largestNegativeStrike: 593,
    largestNegativeExposure: -40,
  });
});

test("unavailable GEX exposes no concentrations", () => {
  const unavailable = {
    ...baseGex,
    metricState: "UNAVAILABLE",
    strikes: [],
  } as unknown as SpyZeroDteGexProxyResponse;
  assert.deepEqual(summarizeGexConcentrations(unavailable), {
    largestPositiveStrike: null,
    largestPositiveExposure: null,
    largestNegativeStrike: null,
    largestNegativeExposure: null,
  });
});

test("Dashboard page no longer consumes legacy snapshot or Report hooks", () => {
  const page = readFileSync(
    resolve(process.cwd(), "apps/web/src/app/dashboard/page.tsx"),
    "utf8",
  );
  for (const forbidden of [
    "useMarketSnapshot",
    "useLatestReport",
    "getSnapshot",
    "getLatestReport",
    "report.tradePlan",
    "factorScores",
    "callWall",
    "putWall",
    "gammaFlip",
    "dealerPositioning",
  ]) {
    assert.equal(page.includes(forbidden), false, `${forbidden} must not appear`);
  }
  for (const required of [
    "useDisplaySpyZeroDteExpectedMove",
    "useDisplaySpyZeroDteGexProxy",
    "useDisplaySpyZeroDteDexProxy",
    "useSpyZeroDteTradePlanAssembly",
  ]) {
    assert.equal(page.includes(required), true, `${required} must be used`);
  }
});

test("Dashboard child cards no longer consume legacy snapshot or report history", () => {
  const files = [
    "apps/web/src/components/dashboard/bias-card.tsx",
    "apps/web/src/components/dashboard/confidence-card.tsx",
    "apps/web/src/components/dashboard/market-regime-card.tsx",
    "apps/web/src/components/dashboard/todays-levels-card.tsx",
    "apps/web/src/components/dashboard/live-chart.tsx",
    "apps/web/src/components/dashboard/session-timeline.tsx",
  ];
  const source = files
    .map((file) => readFileSync(resolve(process.cwd(), file), "utf8"))
    .join("\n");
  for (const forbidden of [
    "useMarketSnapshot",
    "useLatestReport",
    "useReportHistory",
    "Overnight High · MOCK",
    "Overnight Low · MOCK",
    "snapshot.spotPrice",
  ]) {
    assert.equal(source.includes(forbidden), false, `${forbidden} must not appear`);
  }
});

test("Dashboard remains decision support with no execution controls", () => {
  const page = readFileSync(
    resolve(process.cwd(), "apps/web/src/app/dashboard/page.tsx"),
    "utf8",
  );
  for (const forbidden of [
    "Buy Calls",
    "Buy Puts",
    "Submit Order",
    "Execute Order",
    "Place Order",
    "orderQuantity",
  ]) {
    assert.equal(page.includes(forbidden), false, `${forbidden} must not appear`);
  }
});

console.log(`\nDeterministic Dashboard view tests: ${passed} passed, ${failed} failed`);
if (failed > 0) process.exitCode = 1;
