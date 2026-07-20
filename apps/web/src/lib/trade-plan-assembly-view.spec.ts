/**
 * Pure presentation and static boundary tests for the deterministic Trade Plan UI.
 * Run: npx --no-install tsx apps/web/src/lib/trade-plan-assembly-view.spec.ts
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  formatNullableNumber,
  formatNullablePercent,
  formatNullablePrice,
  formatSignedConfidencePoints,
  getDirectionLabel,
  getExposureConfirmationView,
  getTradePlanStateView,
} from "./trade-plan-assembly-view";

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

test("every Plan State has fixed deterministic copy", () => {
  for (const state of [
    "READY",
    "WAITING_FOR_TRIGGER",
    "NO_QUALIFIED_CONTRACT",
    "NOT_QUALIFIED",
    "NO_SETUP",
    "NOT_APPLICABLE",
    "UNAVAILABLE",
  ] as const) {
    const view = getTradePlanStateView(state);
    assert.ok(view.title.length > 0);
    assert.ok(view.description.length > 0);
  }
});

test("direction labels are non-order-like", () => {
  assert.equal(getDirectionLabel("CALLS"), "Calls Setup");
  assert.equal(getDirectionLabel("PUTS"), "Puts Setup");
  assert.equal(getDirectionLabel("NONE"), "No Direction");
  assert.equal(getDirectionLabel("UNAVAILABLE"), "Unavailable");
});

test("null-safe formatters use em dash", () => {
  assert.equal(formatNullableNumber(null), "—");
  assert.equal(formatNullablePrice(null), "—");
  assert.equal(formatNullablePercent(null), "—");
});

test("price and percent formatting are display-only", () => {
  assert.equal(formatNullablePrice(123.456), "$123.46");
  assert.equal(formatNullablePercent(12.345), "12.35%");
});


test("exposure confirmation states have fixed non-order copy", () => {
  assert.equal(getExposureConfirmationView("SUPPORTIVE").label, "Supportive");
  assert.equal(getExposureConfirmationView("CONFLICTING").tone, "bear");
  assert.equal(getExposureConfirmationView("MIXED").tone, "wait");
  assert.equal(getExposureConfirmationView("UNAVAILABLE").label, "Unavailable");
});

test("confidence adjustments use explicit signed point formatting", () => {
  assert.equal(formatSignedConfidencePoints(8), "+8 pts");
  assert.equal(formatSignedConfidencePoints(-6), "-6 pts");
  assert.equal(formatSignedConfidencePoints(-0), "0 pts");
});

test("Trade Plan page consumes only the Assembly hook", () => {
  const page = readFileSync(
    resolve(process.cwd(), "apps/web/src/app/trade-plan/page.tsx"),
    "utf8",
  );
  assert.equal(page.includes("useSpyZeroDteTradePlanAssembly"), true);
  for (const forbiddenHook of [
    "useLatestReport",
    "useSpyZeroDteDeterministicMarketState",
    "useSpyZeroDteDeterministicBias",
    "useSpyZeroDteDeterministicTradePlan",
    "useSpyZeroDteObjectiveRiskFramework",
    "useSpyZeroDteContractSelection",
    "useSpyZeroDteOptionsChain",
  ]) {
    assert.equal(page.includes(forbiddenHook), false, `${forbiddenHook} must not be used`);
  }
});

test("Trade Plan page explains GEX and DEX as soft confirmation rather than a gate", () => {
  const page = readFileSync(
    resolve(process.cwd(), "apps/web/src/app/trade-plan/page.tsx"),
    "utf8",
  );
  assert.equal(page.includes("GEX / DEX Soft Confirmation"), true);
  assert.equal(page.includes("Never an eligibility gate"), true);
  assert.equal(page.includes("cannot create a direction or block eligibility"), true);
  assert.equal(page.includes("Adjusted Plan Confidence"), true);
});

test("Trade Plan page contains no order controls or mock Report fields", () => {
  const page = readFileSync(
    resolve(process.cwd(), "apps/web/src/app/trade-plan/page.tsx"),
    "utf8",
  );
  for (const forbidden of [
    "Buy Calls",
    "Buy Puts",
    "Enter Now",
    "Execute",
    "Submit Order",
    "Number of Contracts",
    "Recommended Limit",
    "Premium Target",
    "Premium Stop",
    "Probability of Profit",
    "bullishScenario",
    "bearishScenario",
    "factorScores",
  ]) {
    assert.equal(page.includes(forbidden), false, `${forbidden} must not appear`);
  }
});

test("Assembly hook does not preserve previous plan data", () => {
  const hook = readFileSync(
    resolve(process.cwd(), "apps/web/src/hooks/use-spy-trade-plan-assembly.ts"),
    "utf8",
  );
  assert.equal(hook.includes("placeholderData"), false);
  assert.equal(hook.includes("previous"), false);
});

test("page suppresses query data during transport error", () => {
  const page = readFileSync(
    resolve(process.cwd(), "apps/web/src/app/trade-plan/page.tsx"),
    "utf8",
  );
  assert.equal(page.includes("const plan = query.isError ? null : query.data ?? null"), true);
});

console.log(`\nTrade Plan Assembly view tests: ${passed} passed, ${failed} failed`);
if (failed > 0) process.exitCode = 1;
