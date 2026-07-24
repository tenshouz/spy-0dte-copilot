import assert from "node:assert/strict";
import {
  makeV140BiasPlanRisk,
  makeV140OptionsChain,
  V140_CONTRACT_EVAL_MS,
} from "./trade-engine-v140.test-fixtures";
import { buildSpyZeroDteContractSelection } from "./trade-contract.logic";
import { buildSpyZeroDteTradePlanAssembly } from "./trade-plan-assembly.logic";
import {
  SETUP_REGISTRY_V1_ENTRIES,
  buildSetupRegistry,
  buildTradingOpportunityCandidates,
} from "./setup-registry.logic";

let passed = 0;
function test(name: string, fn: () => void): void {
  fn();
  passed += 1;
  console.log(`✓ ${name}`);
}

function readyBundle(policyCompliant = true) {
  const { marketState, bias, tradePlan, risk } = makeV140BiasPlanRisk("CALLS");
  const chain = makeV140OptionsChain("CALLS");
  if (policyCompliant) {
    chain.calls = chain.calls.map((contract) =>
      contract.strikePrice === 758
        ? {
            ...contract,
            bid: 1.35,
            ask: 1.45,
            last: 1.4,
            mark: 1.4,
            delta: 0.55,
            gamma: 0.08,
            theta: -0.1,
          }
        : contract,
    );
  }
  const contract = buildSpyZeroDteContractSelection(
    risk,
    chain,
    V140_CONTRACT_EVAL_MS,
  );
  return {
    marketState,
    assembly: buildSpyZeroDteTradePlanAssembly(
      marketState,
      bias,
      tradePlan,
      risk,
      contract,
      V140_CONTRACT_EVAL_MS,
    ),
  };
}

test("registry has exactly the approved 14 unique setup families", () => {
  assert.equal(SETUP_REGISTRY_V1_ENTRIES.length, 14);
  assert.equal(new Set(SETUP_REGISTRY_V1_ENTRIES.map((row) => row.setupId)).size, 14);
  assert.deepEqual(
    SETUP_REGISTRY_V1_ENTRIES.map((row) => row.setupId).sort(),
    [
      "BEARISH_CONTINUATION_BASE", "BEARISH_TREND_PULLBACK", "BREAKOUT_RETEST_CONTINUATION",
      "BULLISH_CONTINUATION_BASE", "BULLISH_TREND_PULLBACK", "FAILED_BEARISH_BREAK_REVERSAL",
      "FAILED_BULLISH_BREAK_REVERSAL", "GAP_AND_GO_CONTINUATION", "GAP_FILL_REVERSAL",
      "OPENING_RANGE_BREAKOUT", "RANGE_HIGH_MEAN_REVERSION", "RANGE_LOW_MEAN_REVERSION",
      "VWAP_LOSS", "VWAP_RECLAIM",
    ],
  );
});

test("only four proven legacy families are live and all new families default to shadow", () => {
  const live = SETUP_REGISTRY_V1_ENTRIES.filter((row) => row.promotionStatus === "LIVE");
  const shadow = SETUP_REGISTRY_V1_ENTRIES.filter((row) => row.promotionStatus === "SHADOW");
  assert.deepEqual(live.map((row) => row.setupId).sort(), ["BREAKOUT_RETEST_CONTINUATION", "OPENING_RANGE_BREAKOUT", "VWAP_LOSS", "VWAP_RECLAIM"]);
  assert.equal(shadow.length, 10);
  assert.ok(shadow.every((row) => row.defaultPromotionStatus === "SHADOW" && !row.canCreateLiveOpportunity));
});

test("registry response explicitly prevents shadow alerts, positions, and orders", () => {
  const response = buildSetupRegistry(V140_CONTRACT_EVAL_MS);
  assert.equal(response.entries.length, 14);
  assert.equal(response.disclosures.shadowSetupsCannotCreateAlertsOrPositions, true);
  assert.equal(response.disclosures.promotionRequiresExplicitCodeChangeAndValidation, true);
  assert.equal(response.disclosures.noOrderExecution, true);
});

test("READY legacy assembly creates one live strict-effective-ATM candidate and shadow candidates remain non-live", () => {
  const { marketState, assembly } = readyBundle();
  const candidates = buildTradingOpportunityCandidates(marketState, assembly);
  const legacy = candidates.find((row) => row.source === "LEGACY_ASSEMBLY_BRIDGE");
  assert.ok(legacy);
  assert.equal(legacy.promotionStatus, "LIVE");
  assert.equal(legacy.lifecycleState, "READY");
  assert.equal(legacy.liveEligible, true);
  assert.ok(legacy.selectedContractSymbol);
  assert.ok(candidates.filter((row) => row.promotionStatus === "SHADOW").every((row) => !row.liveEligible && row.selectedContractSymbol === null));
});

test("READY legacy assembly that exceeds locked premium or planned-risk limits cannot create a live opportunity", () => {
  const { marketState, assembly } = readyBundle(false);
  assert.equal(assembly.planState, "READY");
  const legacy = buildTradingOpportunityCandidates(marketState, assembly).find(
    (row) => row.source === "LEGACY_ASSEMBLY_BRIDGE",
  );
  assert.ok(legacy);
  assert.equal(legacy.liveEligible, false);
  assert.ok(legacy.reasonCodes.includes("MAXIMUM_CONTRACT_PREMIUM_EXCEEDED"));
  assert.ok(legacy.reasonCodes.includes("MAXIMUM_PLANNED_LOSS_EXCEEDED"));
});

test("non-READY lifecycle does not emit misleading entry-economics warnings", () => {
  const { marketState, assembly } = readyBundle();
  assembly.planState = "WAITING_FOR_TRIGGER";
  assembly.selectedContract.contractSymbol = null;
  assembly.selectedContract.ask = null;
  assembly.optionRiskReward = undefined;
  const legacy = buildTradingOpportunityCandidates(marketState, assembly).find(
    (row) => row.source === "LEGACY_ASSEMBLY_BRIDGE",
  );
  assert.ok(legacy);
  assert.equal(legacy.liveEligible, false);
  assert.ok(!legacy.warningCodes.includes("TRADING_POLICY_V1_ENTRY_ECONOMICS_BLOCKED"));
  assert.ok(!legacy.reasonCodes.includes("CONTRACT_ASK_UNAVAILABLE"));
});

test("insufficient completed-candle history cannot fabricate shadow detections", () => {
  const { marketState, assembly } = readyBundle();
  marketState.executionContext!.recentCompletedCandles = marketState.executionContext!.recentCompletedCandles.slice(-2);
  marketState.executionContext!.completedCandleCount = 2;
  const candidates = buildTradingOpportunityCandidates(marketState, assembly);
  assert.equal(candidates.filter((row) => row.promotionStatus === "SHADOW").length, 0);
});

console.log(`\n${passed} setup-registry tests passed.`);
