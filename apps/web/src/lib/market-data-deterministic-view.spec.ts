/**
 * Pure presentation and static architecture tests for the deterministic Market Data cutover.
 * Run: npx --no-install tsx apps/web/src/lib/market-data-deterministic-view.spec.ts
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import type { SpyZeroDteMarketContextResponse } from "@spy-copilot/shared";
import {
  formatDeterministicState,
  formatFeatureStatus,
  formatOptionalPoints,
  summarizeMarketContextCoverage,
} from "./market-data-deterministic-view";

let passed = 0;
let failed = 0;

function test(name: string, fn: () => void) {
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

test("deterministic states have readable fixed display copy", () => {
  assert.equal(formatDeterministicState("ABOVE_RANGE"), "Above Range");
  assert.equal(formatDeterministicState("NOT_APPLICABLE"), "Not Applicable");
  assert.equal(formatDeterministicState(null), "Unavailable");
  assert.equal(formatFeatureStatus("PARTIAL"), "Partial");
});

test("point formatting is null-safe and signed", () => {
  assert.equal(formatOptionalPoints(null), "—");
  assert.equal(formatOptionalPoints(1.25), "+1.25 pts");
  assert.equal(formatOptionalPoints(-0.5), "-0.50 pts");
  assert.equal(formatOptionalPoints(0), "0.00 pts");
});

test("context coverage counts every component status", () => {
  const statuses = [
    "AVAILABLE",
    "AVAILABLE",
    "STALE",
    "PARTIAL",
    "NOT_APPLICABLE",
    "UNAVAILABLE",
  ] as const;
  const context = {
    components: statuses.map((status, index) => ({ component: `C${index}`, status })),
    componentWarnings: [{ component: "C5", warningCode: "TEST" }],
  } as unknown as SpyZeroDteMarketContextResponse;

  assert.deepEqual(summarizeMarketContextCoverage(context), {
    available: 2,
    stale: 1,
    partial: 1,
    notApplicable: 1,
    unavailable: 1,
    warningCount: 1,
  });
});

test("null context produces an empty coverage summary", () => {
  assert.deepEqual(summarizeMarketContextCoverage(null), {
    available: 0,
    stale: 0,
    partial: 0,
    notApplicable: 0,
    unavailable: 0,
    warningCount: 0,
  });
});

test("Market Data page no longer consumes the legacy snapshot", () => {
  const page = readFileSync(
    resolve(process.cwd(), "apps/web/src/app/market-data/page.tsx"),
    "utf8",
  );
  for (const forbidden of [
    "useMarketSnapshot",
    "getSnapshot",
    "snapshot.",
    "Overnight High · MOCK",
    "Overnight Low · MOCK",
    "IV Rank",
    "Rel. Volume",
    "5m Trend",
    "1m Trend",
    "EMA Trend",
    "remaining advanced analytics are still mock",
  ]) {
    assert.equal(page.includes(forbidden), false, `${forbidden} must not appear`);
  }
});

test("Market Data page consumes deterministic context and state", () => {
  const page = readFileSync(
    resolve(process.cwd(), "apps/web/src/app/market-data/page.tsx"),
    "utf8",
  );
  for (const required of [
    "useDisplaySpyQuote",
    "useDisplaySpyZeroDteMarketContext",
    "useDisplaySpyZeroDteDeterministicMarketState",
    "Deterministic Structure",
    "Unified Context Coverage",
  ]) {
    assert.equal(page.includes(required), true, `${required} must be used`);
  }
});

test("Market Data chart contains no synthetic snapshot level fallback", () => {
  const page = readFileSync(
    resolve(process.cwd(), "apps/web/src/app/market-data/page.tsx"),
    "utf8",
  );
  assert.equal(page.includes("snapshot?.openingRangeHigh"), false);
  assert.equal(page.includes("snapshot.spotPrice"), false);
  assert.equal(page.includes("showDerivedSessionExtremes={isMockCandles}"), false);
  assert.equal(page.includes("showDerivedSessionExtremes={false}"), true);
});

test("Market Data remains decision support with no execution controls", () => {
  const page = readFileSync(
    resolve(process.cwd(), "apps/web/src/app/market-data/page.tsx"),
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

console.log(`\nDeterministic Market Data view tests: ${passed} passed, ${failed} failed`);
if (failed > 0) process.exitCode = 1;
