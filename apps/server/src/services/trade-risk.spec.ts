/** Focused deterministic tests for RISK_V2 setup-specific objectives and invalidation. */
import assert from "node:assert/strict";
import {
  SpyZeroDteDeterministicMarketStateResponseSchema,
  SpyZeroDteObjectiveRiskResponseSchema,
  type SpyZeroDteDeterministicMarketStateResponse,
} from "@spy-copilot/shared";
import { buildSpyZeroDteDeterministicBias } from "./market-bias.logic";
import { buildSpyZeroDteDeterministicTradePlan } from "./trade-plan.logic";
import { buildSpyZeroDteObjectiveRiskFramework } from "./trade-risk.logic";
import {
  V140_BIAS_AT_MS,
  V140_PLAN_AT_MS,
  V140_RISK_AT_MS,
  makeV140BiasPlanRisk,
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

function pipeline(state: SpyZeroDteDeterministicMarketStateResponse) {
  const marketState = validateState(state);
  const bias = buildSpyZeroDteDeterministicBias(marketState, V140_BIAS_AT_MS);
  const tradePlan = buildSpyZeroDteDeterministicTradePlan(marketState, bias, V140_PLAN_AT_MS);
  return {
    marketState,
    bias,
    tradePlan,
    risk: buildSpyZeroDteObjectiveRiskFramework(
      marketState,
      bias,
      tradePlan,
      V140_RISK_AT_MS,
    ),
  };
}

test("RISK_V2 produces a schema-valid qualified Calls framework", () => {
  const { risk } = makeV140BiasPlanRisk("CALLS");
  assert.equal(risk.methodologyVersion, "RISK_V2");
  assert.equal(risk.frameworkState, "READY");
  assert.equal(risk.riskQualification, "QUALIFIED");
  assert.equal(risk.direction, "CALLS");
  assert.equal(risk.sourceTradeSetupType, "OPENING_RANGE_BREAKOUT");
  assert.deepEqual(SpyZeroDteObjectiveRiskResponseSchema.parse(risk), risk);
});

test("Puts use the symmetric framework", () => {
  const { risk } = makeV140BiasPlanRisk("PUTS");
  assert.equal(risk.frameworkState, "READY");
  assert.equal(risk.direction, "PUTS");
  assert.equal(risk.selectedInvalidation.levelType, "BUFFERED_TRIGGER_FAILURE");
  assert.equal(risk.selectedObjective.levelType, "PREVIOUS_DAY_LOW");
});

test("setup-specific buffered trigger failure is preferred over a raw tick stop", () => {
  const { risk } = makeV140BiasPlanRisk("CALLS");
  assert.equal(risk.selectedInvalidation.levelType, "BUFFERED_TRIGGER_FAILURE");
  assert.equal(risk.selectedInvalidation.rawStructuralLevel, 758);
  assert.equal(risk.selectedInvalidation.noiseBufferPoints, 0.2);
  assert.equal(risk.selectedInvalidation.level, 757.8);
  const candidate = risk.invalidationCandidates.find(
    (item) => item.levelType === "BUFFERED_TRIGGER_FAILURE",
  )!;
  assert.equal(candidate.levelSemantic, "BUFFERED_STRUCTURAL_INVALIDATION");
  assert.ok(candidate.riskDistancePoints! > 0);
});

test("opening-range extension is a ranked target candidate", () => {
  const { risk } = makeV140BiasPlanRisk("CALLS");
  const extension = risk.objectiveCandidates.find(
    (item) => item.levelType === "OPENING_RANGE_EXTENSION",
  )!;
  assert.equal(extension.levelSemantic, "PROJECTED_STRUCTURE_LEVEL");
  assert.equal(extension.qualificationStatus, "QUALIFIED");
  assert.equal(extension.distanceRank, 1);
  assert.equal(risk.selectedObjective.candidateId, extension.candidateId);
});

test("expected move remains context and a candidate, not a guaranteed destination", () => {
  const { risk } = makeV140BiasPlanRisk("CALLS");
  const expectedMove = risk.objectiveCandidates.find(
    (item) => item.levelType === "EXPECTED_MOVE_UPPER",
  )!;
  assert.equal(expectedMove.levelSemantic, "IMPLIED_MOVE_BOUNDARY");
  assert.equal(expectedMove.sourceStatus, "AVAILABLE");
  assert.ok((expectedMove.rewardRiskRatio ?? 0) > risk.minimumRewardRiskRatio);
});

test("the nearest target is selected only when it satisfies 2-to-1 underlying R:R", () => {
  const { risk } = makeV140BiasPlanRisk("CALLS");
  assert.equal(risk.minimumRewardRiskRatio, 2);
  assert.ok((risk.selectedObjective.rewardRiskRatio ?? 0) >= 2);
  const selectable = risk.objectiveCandidates.filter(
    (item) => item.qualificationStatus === "QUALIFIED",
  );
  assert.equal(
    risk.selectedObjective.candidateId,
    selectable.sort((a, b) => a.objectiveDistancePoints! - b.objectiveDistancePoints!)[0]!.candidateId,
  );
});

test("no structural objective with 2-to-1 produces NOT_QUALIFIED", () => {
  const state = structuredClone(makeV140MarketState("CALLS"));
  state.features.priceVsPriorDayRange.inputs.previousDayHigh = 758.7;
  state.features.priceVsPremarketRange.inputs.premarketHigh = 758.6;
  state.features.priceVsExpectedMoveRange.inputs.upperImpliedMoveLevel = 758.8;
  state.features.priceVsOpeningRange.inputs.openingRangeLow = 757.8;
  const { risk } = pipeline(state);
  assert.equal(risk.frameworkState, "NOT_QUALIFIED");
  assert.equal(risk.riskQualification, "NOT_QUALIFIED");
  assert.equal(risk.selectedObjective.candidateId, null);
});

test("unconfirmed trigger produces PREVIEW rather than a ready framework", () => {
  const state = structuredClone(makeV140MarketState("CALLS"));
  const candles = state.executionContext!.recentCompletedCandles;
  candles[candles.length - 1] = {
    ...candles[candles.length - 1]!,
    high: 758.1,
    low: 757.7,
    open: 757.95,
    close: 758.05,
  };
  const { tradePlan, risk } = pipeline(state);
  assert.equal(tradePlan.setupState, "WAITING_FOR_TRIGGER");
  assert.equal(risk.frameworkState, "PREVIEW");
  assert.equal(risk.isCurrentlyTradeEligible, false);
});

test("time-risk policy is explicit and advisory", () => {
  const { risk } = makeV140BiasPlanRisk("CALLS");
  assert.deepEqual(risk.timeRiskPolicy, {
    maximumMinutesWithoutProgress: 15,
    minimumProgressFraction: 0.25,
    advisoryOnly: true,
  });
});

test("risk never flips the upstream trade direction", () => {
  for (const direction of ["CALLS", "PUTS"] as const) {
    const { tradePlan, risk } = makeV140BiasPlanRisk(direction);
    assert.equal(risk.direction, tradePlan.setupDirection);
  }
});

test("underlying R:R remains explicitly separate from option-premium R:R", () => {
  const { risk } = makeV140BiasPlanRisk("CALLS");
  assert.equal(risk.methodology.calculationsUse, "SPY_UNDERLYING_PRICE_POINTS");
  assert.equal(risk.methodology.optionAwareQualificationDelegatedToContractEngine, true);
});

test("same-snapshot mismatch fails closed", () => {
  const { marketState, bias, tradePlan } = makeV140BiasPlanRisk("CALLS");
  const mismatched = structuredClone(tradePlan);
  mismatched.sourceBiasCalculatedAt = "2026-07-17T14:00:09.000Z";
  const result = buildSpyZeroDteObjectiveRiskFramework(
    marketState,
    bias,
    mismatched,
    V140_RISK_AT_MS,
  );
  assert.equal(result.frameworkState, "UNAVAILABLE");
  assert.equal(result.sameSnapshotGuaranteed, false);
});

test("full precision is preserved in risk and objective distances", () => {
  const { risk } = makeV140BiasPlanRisk("CALLS");
  assert.equal(
    risk.selectedInvalidation.riskDistancePoints,
    risk.currentPrice! - risk.selectedInvalidation.level!,
  );
  assert.equal(
    risk.selectedObjective.objectiveDistancePoints,
    risk.selectedObjective.level! - risk.currentPrice!,
  );
});

console.log(`\nRisk V2 tests: ${passed} passed, ${failed} failed`);
if (failed > 0) process.exitCode = 1;
