/** Focused pure-logic tests for ASSEMBLY_V2 with V1.4 execution-quality inputs. */
import assert from "node:assert/strict";
import {
  SpyZeroDteTradePlanAssemblyResponseSchema,
  type SpyZeroDteContractSelectionResponse,
} from "@spy-copilot/shared";
import { buildSpyZeroDteContractSelection } from "./trade-contract.logic";
import { buildSpyZeroDteTradePlanAssembly } from "./trade-plan-assembly.logic";
import {
  V140_CONTRACT_EVAL_MS,
  makeV140BiasPlanRisk,
  makeV140OptionsChain,
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

function assembled(direction: "CALLS" | "PUTS" = "CALLS") {
  const sources = makeV140BiasPlanRisk(direction);
  const contract = buildSpyZeroDteContractSelection(
    sources.risk,
    makeV140OptionsChain(direction),
    V140_CONTRACT_EVAL_MS,
  );
  const assembly = buildSpyZeroDteTradePlanAssembly(
    sources.marketState,
    sources.bias,
    sources.tradePlan,
    sources.risk,
    contract,
    V140_CONTRACT_EVAL_MS + 1000,
  );
  return { ...sources, contract, assembly };
}

test("confirmed Calls assemble into READY", () => {
  const { assembly } = assembled("CALLS");
  assert.equal(assembly.methodologyVersion, "ASSEMBLY_V2");
  assert.equal(assembly.planState, "READY");
  assert.equal(assembly.direction, "CALLS");
  assert.equal(assembly.entryCondition.confirmationPassed, true);
  assert.equal(assembly.selectedContract.contractDirection, "CALL");
  assert.deepEqual(SpyZeroDteTradePlanAssemblyResponseSchema.parse(assembly), assembly);
});

test("confirmed Puts assemble symmetrically", () => {
  const { assembly } = assembled("PUTS");
  assert.equal(assembly.planState, "READY");
  assert.equal(assembly.direction, "PUTS");
  assert.equal(assembly.selectedContract.contractDirection, "PUT");
});

test("entry condition exposes all execution-confirmation diagnostics", () => {
  const { assembly } = assembled("CALLS");
  assert.equal(assembly.entryCondition.setupType, "OPENING_RANGE_BREAKOUT");
  assert.equal(assembly.entryCondition.triggerLifecycleState, "READY");
  assert.equal(assembly.entryCondition.dynamicBufferPoints, 0.15);
  assert.equal(assembly.entryCondition.bufferedTriggerLevel, 758.15);
  assert.equal(assembly.entryCondition.latestCompletedClose, 758.25);
  assert.equal(assembly.entryCondition.rawCrossSatisfied, true);
  assert.equal(assembly.entryCondition.currentRawCrossSatisfied, true);
  assert.equal(assembly.entryCondition.confirmationCandleClose, 758.25);
  assert.equal(assembly.entryCondition.maximumObservedCloseExtensionPoints, 0.25);
  assert.equal(assembly.entryCondition.maximumChaseDistancePoints, 0.75);
  assert.equal(assembly.entryCondition.retestRequired, false);
  assert.equal(assembly.entryCondition.recrossCount, 0);
  assert.ok((assembly.entryCondition.latestVolumeRatio ?? 0) > 1);
});

test("option-premium R:R is separate from underlying R:R", () => {
  const { assembly } = assembled("CALLS");
  assert.equal(assembly.underlyingRiskReward.calculationUnit, "SPY_UNDERLYING_PRICE_POINTS");
  assert.equal(assembly.optionRiskReward?.calculationUnit, "OPTION_PREMIUM_PER_SHARE_ESTIMATE");
  assert.equal(assembly.optionRiskReward?.state, "QUALIFIED");
  assert.ok((assembly.optionRiskReward?.estimatedPremiumRewardRiskRatio ?? 0) >= 1.25);
  assert.notEqual(
    assembly.optionRiskReward?.estimatedPremiumRewardRiskRatio,
    assembly.underlyingRiskReward.rewardRiskRatio,
  );
});

test("plan confidence uses execution-quality alignment and keeps exposure context-only", () => {
  const { assembly, tradePlan } = assembled("CALLS");
  assert.equal(
    assembly.planConfidence?.scope,
    "EXECUTION_QUALITY_ALIGNMENT_EXPOSURE_CONTEXT_ONLY",
  );
  assert.equal(
    assembly.planConfidence?.adjustedConfidenceScore,
    tradePlan.tradeQuality?.finalAlignmentScore,
  );
  assert.equal(assembly.planConfidence?.exposureAdjustmentPoints, 0);
});

test("contract selection failure prevents READY", () => {
  const sources = makeV140BiasPlanRisk("CALLS");
  const badChain = makeV140OptionsChain("CALLS");
  badChain.calls = badChain.calls.map((item) => ({ ...item, bid: 1.5, ask: 2.2 }));
  const contract = buildSpyZeroDteContractSelection(
    sources.risk,
    badChain,
    V140_CONTRACT_EVAL_MS,
  );
  const assembly = buildSpyZeroDteTradePlanAssembly(
    sources.marketState,
    sources.bias,
    sources.tradePlan,
    sources.risk,
    contract,
    V140_CONTRACT_EVAL_MS + 1000,
  );
  assert.equal(contract.selectionState, "NO_QUALIFIED_CONTRACT");
  assert.equal(assembly.planState, "NO_QUALIFIED_CONTRACT");
  assert.equal(assembly.selectedContract.contractSymbol, null);
});

test("tampered low premium R:R cannot remain READY", () => {
  const { marketState, bias, tradePlan, risk, contract } = assembled("CALLS");
  const tampered = structuredClone(contract) as SpyZeroDteContractSelectionResponse;
  tampered.selectedContract.estimatedPremiumRewardRiskRatio = 0.5;
  tampered.selectedContract.optionScenarioState = "NOT_QUALIFIED";
  const selectedCandidate = tampered.candidates.find(
    (candidate) => candidate.candidateId === tampered.selectedContract.candidateId,
  )!;
  selectedCandidate.estimatedPremiumRewardRiskRatio = 0.5;
  selectedCandidate.optionScenarioState = "NOT_QUALIFIED";
  const result = buildSpyZeroDteTradePlanAssembly(
    marketState,
    bias,
    tradePlan,
    risk,
    tampered,
    V140_CONTRACT_EVAL_MS + 1000,
  );
  assert.equal(result.planState, "UNAVAILABLE");
  assert.equal(result.engineState, "UNAVAILABLE");
});

test("methodology records V3/V2 source versions", () => {
  const { assembly } = assembled("CALLS");
  assert.equal(assembly.sourceSummary.tradePlan.version, "TRADE_PLAN_V3");
  assert.equal(assembly.sourceSummary.risk.version, "RISK_V2");
  assert.equal(assembly.sourceSummary.contract.version, "CONTRACT_V2");
  assert.equal(assembly.sourceSummary.marketState.snapshotIntegrityState, "COHERENT");
  assert.equal(assembly.sourceSummary.marketState.marketStructureSkewMilliseconds, 1000);
});

console.log(`\nAssembly V2/V1.4 tests: ${passed} passed, ${failed} failed`);
if (failed > 0) process.exitCode = 1;
