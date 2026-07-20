/**
 * Deterministic presentation tests for the provider-aligned premarket policy.
 * Run: npx --no-install tsx apps/web/src/lib/premarket-window-view.spec.ts
 */
import assert from "node:assert/strict";
import type { PremarketWindowPolicy } from "@spy-copilot/shared";
import {
  formatPremarketWindowDisclosure,
  formatPremarketWindowLabel,
} from "./premarket-window-view";

const POLICY: PremarketWindowPolicy = {
  methodologyVersion: "PREMARKET_WINDOW_V2",
  timeZone: "America/New_York",
  startTimeEastern: "07:00",
  endTimeEasternExclusive: "09:30",
  expectedFirstBucketEastern: "07:00",
  expectedLastBucketEastern: "09:25",
  providerAligned: true,
  missingBeforeStartIgnored: true,
};

let passed = 0;
let failed = 0;

function test(name: string, fn: () => void) {
  try {
    fn();
    passed += 1;
    console.log(`PASS ${name}`);
  } catch (error) {
    failed += 1;
    console.error(`FAIL ${name}: ${(error as Error).message}`);
  }
}

test("label exposes the exact provider-aligned ET window", () => {
  assert.equal(formatPremarketWindowLabel(POLICY), "07:00–09:30 ET");
});

test("disclosure states that pre-07:00 candles do not reduce completeness", () => {
  const disclosure = formatPremarketWindowDisclosure(POLICY);
  assert.match(disclosure, /Provider-aligned premarket window: 07:00–09:30 ET/);
  assert.match(disclosure, /before 07:00 ET are outside this methodology/);
  assert.match(disclosure, /do not reduce coverage completeness/);
});

console.log(`\n${passed} passed, ${failed} failed (${passed + failed} total)`);
if (failed > 0) process.exitCode = 1;
