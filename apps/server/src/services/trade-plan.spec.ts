/**
 * Focused deterministic tests for TRADE_PLAN_V3 execution confirmation.
 * Run: npx --no-install tsx apps/server/src/services/trade-plan.spec.ts
 */
import assert from "node:assert/strict";
import {
  SpyZeroDteDeterministicMarketStateResponseSchema,
  SpyZeroDteDeterministicTradePlanResponseSchema,
  type SpyZeroDteDeterministicMarketStateResponse,
} from "@spy-copilot/shared";
import { buildSpyZeroDteDeterministicBias } from "./market-bias.logic";
import {
  buildSpyZeroDteDeterministicTradePlan,
  buildTradeTriggerConfirmation,
  calculateCallsTrigger,
  calculatePutsTrigger,
} from "./trade-plan.logic";
import {
  V140_BIAS_AT_MS,
  V140_PLAN_AT_MS,
  makeV140MarketState,
} from "./trade-engine-v140.test-fixtures";

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

function validateState(state: SpyZeroDteDeterministicMarketStateResponse) {
  const features = Object.values(state.features);
  state.featureStatuses = features.map((feature) => ({
    featureId: feature.featureId,
    status: feature.status,
    warningCode: feature.warningCode,
  }));
  state.featureWarnings = features
    .filter((feature) => feature.warningCode !== null)
    .map((feature) => ({ featureId: feature.featureId, warningCode: feature.warningCode! }));
  return SpyZeroDteDeterministicMarketStateResponseSchema.parse(state);
}

function build(state: SpyZeroDteDeterministicMarketStateResponse) {
  const validated = validateState(state);
  const bias = buildSpyZeroDteDeterministicBias(validated, V140_BIAS_AT_MS);
  return buildSpyZeroDteDeterministicTradePlan(validated, bias, V140_PLAN_AT_MS);
}

function state(direction: "CALLS" | "PUTS" = "CALLS") {
  return structuredClone(makeV140MarketState(direction));
}

function gate(result: ReturnType<typeof build>, gateId: string) {
  return result.gates.find((item) => item.gateId === gateId)!;
}

test("TRADE_PLAN_V3 produces a schema-valid confirmed Calls setup", () => {
  const result = build(state("CALLS"));
  assert.equal(result.methodologyVersion, "TRADE_PLAN_V3");
  assert.equal(result.setupState, "ELIGIBLE");
  assert.equal(result.setupDirection, "CALLS");
  assert.equal(result.trigger.confirmation?.confirmationPassed, true);
  assert.equal(result.trigger.confirmation?.lifecycleState, "RETESTED");
  assert.equal(result.exposureConfidenceAdjustmentPoints, 0);
  assert.equal(result.planConfidenceScore, result.structuralConfidenceScore);
  assert.deepEqual(SpyZeroDteDeterministicTradePlanResponseSchema.parse(result), result);
});

test("Puts use the symmetric completed-candle confirmation policy", () => {
  const result = build(state("PUTS"));
  assert.equal(result.setupState, "ELIGIBLE");
  assert.equal(result.setupDirection, "PUTS");
  assert.equal(result.trigger.comparison, "PRICE_LESS_THAN");
  assert.equal(result.trigger.confirmation?.confirmationPassed, true);
});

test("a raw quote cross cannot activate without a completed close", () => {
  const candidate = state("CALLS");
  const candles = candidate.executionContext!.recentCompletedCandles;
  candles[candles.length - 1] = {
    ...candles[candles.length - 1]!,
    high: 758.2,
    low: 757.7,
    open: 757.95,
    close: 758.05,
  };
  const result = build(candidate);
  assert.equal(result.trigger.confirmation?.rawCrossSatisfied, true);
  assert.equal(result.trigger.confirmation?.completedCloseConfirmed, false);
  assert.equal(result.trigger.satisfied, false);
  assert.equal(result.setupState, "WAITING_FOR_TRIGGER");
  assert.ok(result.trigger.confirmation?.warningCodes.includes("COMPLETED_CLOSE_NOT_CONFIRMED"));
});

test("missing execution context fails closed", () => {
  const candidate = state("CALLS");
  delete candidate.executionContext;
  const result = build(candidate);
  assert.equal(result.setupState, "WAITING_FOR_TRIGGER");
  assert.equal(result.trigger.confirmation?.mode, "UNAVAILABLE");
  assert.equal(result.trigger.confirmation?.confirmationPassed, false);
  assert.ok(result.trigger.confirmation?.warningCodes.includes("EXECUTION_CONTEXT_UNAVAILABLE"));
});

test("more than two recent recrosses invalidates the trigger", () => {
  const candidate = state("CALLS");
  const closes = [757.8, 758.2, 757.9, 758.25, 757.95, 758.25];
  candidate.executionContext!.recentCompletedCandles = candidate.executionContext!.recentCompletedCandles.map(
    (item, index) => ({
      ...item,
      open: closes[index]! - 0.05,
      high: closes[index]! + 0.3,
      low: closes[index]! - 0.3,
      close: closes[index]!,
    }),
  );
  const result = build(candidate);
  assert.equal(result.trigger.confirmation?.lifecycleState, "INVALIDATED");
  assert.ok((result.trigger.confirmation?.recrossCount ?? 0) > 2);
  assert.equal(result.setupState, "WAITING_FOR_TRIGGER");
  assert.equal(result.trigger.satisfied, false);
});

test("insufficient breakout volume keeps the plan waiting", () => {
  const candidate = state("CALLS");
  const candles = candidate.executionContext!.recentCompletedCandles;
  candles[candles.length - 1] = { ...candles[candles.length - 1]!, volume: 500 };
  const result = build(candidate);
  assert.equal(result.trigger.confirmation?.volumeConfirmed, false);
  assert.ok(result.trigger.confirmation?.warningCodes.includes("BREAKOUT_VOLUME_INSUFFICIENT"));
  assert.equal(result.setupState, "WAITING_FOR_TRIGGER");
});

test("maximum chase distance prevents late activation", () => {
  const candidate = state("CALLS");
  candidate.price = 759;
  for (const feature of [
    candidate.features.priceVsVwap,
    candidate.features.priceVsPriorDayRange,
    candidate.features.priceVsPremarketRange,
    candidate.features.priceVsOpeningRange,
    candidate.features.priceVsExpectedMoveRange,
  ]) {
    feature.inputs.price = 759;
  }
  const result = build(candidate);
  assert.equal(result.trigger.confirmation?.chasePassed, false);
  assert.ok(result.trigger.confirmation?.warningCodes.includes("MAXIMUM_CHASE_DISTANCE_EXCEEDED"));
  assert.equal(result.setupState, "WAITING_FOR_TRIGGER");
});

test("raw-source timestamp skew blocks the trade", () => {
  const candidate = state("CALLS");
  candidate.snapshotIntegrity!.state = "SKEWED";
  candidate.snapshotIntegrity!.marketStructureSkewMilliseconds = 31_000;
  candidate.snapshotIntegrity!.warningCodes = ["MARKET_STRUCTURE_SKEW_EXCEEDED"];
  const result = build(candidate);
  assert.equal(result.engineState, "UNAVAILABLE");
  assert.equal(result.setupState, "UNAVAILABLE");
  assert.equal(result.primaryReasonCode, "RAW_SOURCE_SKEW_EXCEEDED");
  assert.equal(gate(result, "SAME_SNAPSHOT_GUARANTEED").status, "UNAVAILABLE");
});

test("one minor counterevidence item is tolerated", () => {
  const candidate = state("CALLS");
  candidate.features.priceVsPriorDayRange.state = "BELOW_RANGE";
  const result = build(candidate);
  assert.equal(result.setupState, "ELIGIBLE");
  const counterGate = gate(result, "COUNTEREVIDENCE_POLICY_PASSED");
  assert.equal(counterGate.status, "PASSED");
  const observedValues = counterGate.observedValues as {
    minorOpposingEvidenceCount: number;
  };
  assert.equal(observedValues.minorOpposingEvidenceCount, 1);
});

test("material VWAP counterevidence remains a hard veto", () => {
  const candidate = state("CALLS");
  candidate.features.priceVsVwap.state = "BELOW";
  const result = build(candidate);
  assert.equal(result.setupState, "NO_SETUP");
  assert.equal(result.primaryReasonCode, "CALLS_COUNTEREVIDENCE_PRESENT");
  assert.equal(gate(result, "COUNTEREVIDENCE_POLICY_PASSED").status, "FAILED");
});

test("trade quality uses capped families and is not presented as a probability", () => {
  const result = build(state("CALLS"));
  assert.equal(result.tradeQuality?.methodologyVersion, "TRADE_QUALITY_V1");
  assert.ok((result.tradeQuality?.familyScores.vwapBehavior ?? 0) <= 20);
  assert.ok((result.tradeQuality?.familyScores.sessionStructure ?? 0) <= 20);
  assert.ok((result.tradeQuality?.familyScores.triggerConfirmation ?? 0) <= 30);
  assert.ok((result.tradeQuality?.familyScores.participation ?? 0) <= 15);
  assert.ok((result.tradeQuality?.familyScores.dataIntegrity ?? 0) <= 15);
  assert.ok((result.tradeQuality?.finalAlignmentScore ?? 0) <= 100);
  assert.equal(
    result.tradeQuality?.scope,
    "UNCALIBRATED_ALIGNMENT_SCORE_NOT_WIN_PROBABILITY",
  );
});

test("all thirteen eligibility gates remain deterministic and ordered", () => {
  const result = build(state("CALLS"));
  assert.deepEqual(
    result.gates.map((item) => item.gateId),
    [
      "MARKET_STATE_AVAILABLE",
      "SAME_SNAPSHOT_GUARANTEED",
      "SESSION_IS_RTH",
      "OPENING_RANGE_COMPLETE",
      "CURRENT_SESSION_DATES_COMPATIBLE",
      "BIAS_AVAILABLE",
      "DIRECTIONAL_BIAS_PRESENT",
      "SOURCE_QUALITY_COMPLETE",
      "COUNTEREVIDENCE_POLICY_PASSED",
      "TRIGGER_INPUTS_VALID",
      "VWAP_ALIGNED",
      "OPENING_RANGE_ALIGNED",
      "TRIGGER_SATISFIED",
    ],
  );
  assert.ok(result.gates.every((item) => item.status === "PASSED"));
});

test("schema rejects ELIGIBLE when trigger confirmation is removed", () => {
  const result = build(state("CALLS"));
  const tampered = structuredClone(result);
  tampered.trigger.confirmation!.confirmationPassed = false;
  assert.equal(SpyZeroDteDeterministicTradePlanResponseSchema.safeParse(tampered).success, false);
});

test("trigger helpers retain strict direction and full precision", () => {
  const calls = calculateCallsTrigger(758.2000001, 757.8, 758.2)!;
  const puts = calculatePutsTrigger(748.9999999, 749.2, 749)!;
  assert.equal(calls.satisfied, true);
  assert.equal(calls.level, 758.2);
  assert.equal(puts.satisfied, true);
  assert.equal(puts.level, 749);
});

test("confirmation helper is deterministic for the same snapshot", () => {
  const marketState = state("CALLS");
  const trigger = calculateCallsTrigger(
    marketState.price!,
    marketState.features.priceVsVwap.inputs.vwap!,
    marketState.features.priceVsOpeningRange.inputs.openingRangeHigh!,
  )!;
  assert.deepEqual(
    buildTradeTriggerConfirmation(marketState, "CALLS", trigger),
    buildTradeTriggerConfirmation(marketState, "CALLS", trigger),
  );
});

console.log(`\nTrade Plan V3 tests: ${passed} passed, ${failed} failed`);
if (failed > 0) process.exitCode = 1;
