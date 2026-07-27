/**
 * Deterministic tests for SIZING_V2 planned structural risk.
 * Run: npx --no-install tsx apps/server/src/services/trade-sizing.spec.ts
 */
import assert from "node:assert/strict";
import {
  PositionSizingRequestErrorResponseSchema,
  SpyZeroDtePositionSizingRequestSchema,
  SpyZeroDtePositionSizingResponseSchema,
  type SpyZeroDtePositionSizingRequest,
  type SpyZeroDteTradePlanAssemblyResponse,
} from "@spy-copilot/shared";
import {
  SIZING_METHODOLOGY_VERSION,
  buildSpyZeroDtePositionSizing,
  calculateEffectiveCapitalBudget,
  calculateEffectiveRiskBudget,
  determineBlockingControls,
} from "./trade-sizing.logic";
import { getSpyZeroDtePositionSizingWithDependencies } from "./trade-sizing.service";

const MARKET_DATE = "2026-07-17";
const ASSEMBLY_AT = "2026-07-17T14:00:00.000Z";
const CONTRACT_AT = "2026-07-17T14:00:00.100Z";
const CHAIN_AT = "2026-07-17T14:00:00.050Z";
const QUOTE_AT = "2026-07-17T13:59:55.000Z";
const SIZING_AT = "2026-07-17T14:00:00.200Z";

type RequestOverrides = {
  accountSnapshot?: Partial<SpyZeroDtePositionSizingRequest["accountSnapshot"]>;
  riskPolicy?: Partial<SpyZeroDtePositionSizingRequest["riskPolicy"]>;
};

function request(overrides: RequestOverrides = {}): SpyZeroDtePositionSizingRequest {
  const base: SpyZeroDtePositionSizingRequest = {
    accountSnapshot: {
      accountEquityDollars: 1_000,
      availableCashDollars: 1_000,
      remainingDailyLossBudgetDollars: 150,
      remainingPortfolioRiskBudgetDollars: 150,
    },
    riskPolicy: {
      maximumRiskPerTradeDollars: 50,
      maximumCapitalAllocationDollars: 150,
      maximumContracts: 1,
    },
  };
  return {
    accountSnapshot: { ...base.accountSnapshot, ...(overrides.accountSnapshot ?? {}) },
    riskPolicy: { ...base.riskPolicy, ...(overrides.riskPolicy ?? {}) },
  };
}

function readyAssembly(
  overrides: Record<string, unknown> = {},
): SpyZeroDteTradePlanAssemblyResponse {
  const base = {
    product: "SPY_ZERO_DTE_DETERMINISTIC_TRADE_PLAN_ASSEMBLY",
    methodologyVersion: "ASSEMBLY_V2",
    currentMarketDate: MARKET_DATE,
    calculatedAt: ASSEMBLY_AT,
    engineState: "AVAILABLE",
    planState: "READY",
    direction: "CALLS",
    primaryReasonCode: "TRADE_PLAN_READY",
    warningCode: null,
    sourceSummary: {
      upstreamSameSnapshotGuaranteed: true,
      contract: {
        calculatedAt: CONTRACT_AT,
        sourceCompatibilityState: "COMPATIBLE",
        sourceOptionsChainFetchedAt: CHAIN_AT,
      },
      selectedContractQuoteAt: QUOTE_AT,
    },
    premiumReference: {
      type: "CALCULATED_BID_ASK_MIDPOINT",
      value: 1.35,
      disclosureCode: "MIDPOINT_REFERENCE_ONLY",
    },
    selectedContract: {
      candidateId: "SPY_CALL_758",
      contractSymbol: "SPY   260717C00758000",
      contractDirection: "CALL",
      strikePrice: 758,
      expirationDate: MARKET_DATE,
      multiplier: 100,
      ask: 1.4,
      bid: 1.3,
      calculatedMidpoint: 1.35,
      providerMark: 1.35,
      quoteAt: QUOTE_AT,
      quoteAgeMilliseconds: 5_000,
      quoteFreshnessState: "FRESH",
      selectionRank: 1,
      estimatedPlannedStructuralLossDollars: 45,
      hardLossBackstopDollars: 50,
      hardLossBackstopExitPremium: 0.9,
    },
  };
  return structuredClone({ ...base, ...overrides }) as unknown as SpyZeroDteTradePlanAssemblyResponse;
}

function nonReadyAssembly(
  planState:
    | "WAITING_FOR_TRIGGER"
    | "NO_QUALIFIED_CONTRACT"
    | "NOT_QUALIFIED"
    | "NO_SETUP"
    | "NOT_APPLICABLE",
  engineState: "AVAILABLE" | "PARTIAL" = "AVAILABLE",
): SpyZeroDteTradePlanAssemblyResponse {
  return readyAssembly({
    engineState,
    planState,
    direction: planState === "NO_SETUP" || planState === "NOT_APPLICABLE" ? "NONE" : "CALLS",
    primaryReasonCode:
      planState === "WAITING_FOR_TRIGGER"
        ? "TRADE_PLAN_WAITING_FOR_TRIGGER"
        : planState === "NO_QUALIFIED_CONTRACT"
          ? "TRADE_PLAN_NO_QUALIFIED_CONTRACT"
          : planState === "NOT_QUALIFIED"
            ? "TRADE_PLAN_NOT_QUALIFIED"
            : planState === "NO_SETUP"
              ? "TRADE_PLAN_NO_SETUP"
              : "TRADE_PLAN_NOT_APPLICABLE",
    warningCode: engineState === "PARTIAL" ? "RISK_FRAMEWORK_PARTIAL" : null,
    sourceSummary: {
      upstreamSameSnapshotGuaranteed: true,
      contract: {
        calculatedAt: CONTRACT_AT,
        sourceCompatibilityState: "NOT_EVALUATED",
        sourceOptionsChainFetchedAt: null,
      },
      selectedContractQuoteAt: null,
    },
    selectedContract: {
      candidateId: null,
      contractSymbol: null,
      contractDirection: null,
      strikePrice: null,
      expirationDate: null,
      multiplier: null,
      ask: null,
      quoteAt: null,
      quoteAgeMilliseconds: null,
      quoteFreshnessState: null,
      selectionRank: null,
      estimatedPlannedStructuralLossDollars: null,
      hardLossBackstopDollars: null,
      hardLossBackstopExitPremium: null,
    },
  });
}

function calculate(
  req = request(),
  assembly = readyAssembly(),
) {
  return buildSpyZeroDtePositionSizing(req, assembly, SIZING_AT);
}

let passed = 0;
type TestFunction = () => void | Promise<void>;
const tests: Array<[string, TestFunction]> = [];
function test(name: string, fn: TestFunction): void {
  tests.push([name, fn]);
}

function approximately(actual: number | null, expected: number, tolerance = 1e-10): void {
  assert.notEqual(actual, null);
  assert.ok(Math.abs(actual! - expected) <= tolerance, `${actual} != ${expected}`);
}

test("methodology version is SIZING_V2", () => {
  assert.equal(SIZING_METHODOLOGY_VERSION, "SIZING_V2");
});

test("valid strict request parses and unknown fields fail", () => {
  assert.equal(SpyZeroDtePositionSizingRequestSchema.parse(request()).riskPolicy.maximumContracts, 1);
  assert.equal(
    SpyZeroDtePositionSizingRequestSchema.safeParse({ ...request(), privateNote: "no" }).success,
    false,
  );
  const nested = request() as unknown as Record<string, unknown>;
  nested.accountSnapshot = { ...(nested.accountSnapshot as object), accountNumber: "123" };
  assert.equal(SpyZeroDtePositionSizingRequestSchema.safeParse(nested).success, false);
});

test("request numeric constraints remain fail-closed", () => {
  assert.equal(
    SpyZeroDtePositionSizingRequestSchema.safeParse(
      request({ accountSnapshot: { accountEquityDollars: 0 } }),
    ).success,
    false,
  );
  assert.equal(
    SpyZeroDtePositionSizingRequestSchema.safeParse(
      request({ riskPolicy: { maximumContracts: 1.5 } }),
    ).success,
    false,
  );
  assert.equal(
    SpyZeroDtePositionSizingRequestSchema.safeParse(
      request({ riskPolicy: { maximumRiskPerTradeDollars: -1 } }),
    ).success,
    false,
  );
});

test("sanitized request errors exclude account values", () => {
  const error = PositionSizingRequestErrorResponseSchema.parse({
    error: "INVALID_POSITION_SIZING_REQUEST",
    issues: [{ path: "accountSnapshot.accountEquityDollars", code: "MUST_BE_POSITIVE" }],
  });
  assert.equal(JSON.stringify(error).includes("1000"), false);
});

test("effective risk budget uses the minimum explicit risk control", () => {
  const result = calculateEffectiveRiskBudget(request());
  assert.equal(result.effectiveRiskBudgetDollars, 50);
  assert.deepEqual(result.limitingRiskControls, ["MAXIMUM_RISK_PER_TRADE"]);

  const tie = calculateEffectiveRiskBudget(
    request({
      accountSnapshot: {
        remainingDailyLossBudgetDollars: 50,
        remainingPortfolioRiskBudgetDollars: 50,
      },
    }),
  );
  assert.deepEqual(tie.limitingRiskControls, [
    "MAXIMUM_RISK_PER_TRADE",
    "REMAINING_DAILY_LOSS_BUDGET",
    "REMAINING_PORTFOLIO_RISK_BUDGET",
  ]);
});

test("effective capital budget uses cash and capital allocation independently", () => {
  const result = calculateEffectiveCapitalBudget(request());
  assert.equal(result.effectiveCapitalBudgetDollars, 150);
  assert.deepEqual(result.limitingCapitalControls, ["MAXIMUM_CAPITAL_ALLOCATION"]);

  const tie = calculateEffectiveCapitalBudget(
    request({
      accountSnapshot: { availableCashDollars: 150 },
    }),
  );
  assert.deepEqual(tie.limitingCapitalControls, [
    "AVAILABLE_CASH",
    "MAXIMUM_CAPITAL_ALLOCATION",
  ]);
});

test("blocking controls preserve deterministic precedence", () => {
  const controls = determineBlockingControls(
    request({
      accountSnapshot: {
        availableCashDollars: 0,
        remainingDailyLossBudgetDollars: 0,
        remainingPortfolioRiskBudgetDollars: 0,
      },
      riskPolicy: {
        maximumRiskPerTradeDollars: 0,
        maximumCapitalAllocationDollars: 0,
        maximumContracts: 0,
      },
    }),
  );
  assert.deepEqual(controls, [
    "MAXIMUM_RISK_PER_TRADE",
    "REMAINING_DAILY_LOSS_BUDGET",
    "REMAINING_PORTFOLIO_RISK_BUDGET",
    "AVAILABLE_CASH",
    "MAXIMUM_CAPITAL_ALLOCATION",
    "MAXIMUM_CONTRACTS",
  ]);
});

test("$140 debit with $45 planned structural risk permits one contract", () => {
  const result = calculate();
  assert.deepEqual(SpyZeroDtePositionSizingResponseSchema.parse(result), result);
  assert.equal(result.sizingState, "SIZED");
  assert.equal(result.quantityCalculation.contractsPermittedByRisk, 1);
  assert.equal(result.quantityCalculation.contractsPermittedByCapital, 1);
  assert.equal(result.quantityCalculation.maximumContractsUnderPolicy, 1);
  assert.deepEqual(result.quantityCalculation.limitingQuantityControls, [
    "RISK_BUDGET",
    "CAPITAL_BUDGET",
    "MAXIMUM_CONTRACTS",
  ]);
});

test("planned structural risk—not full premium—drives risk capacity", () => {
  const result = calculate(
    request({
      accountSnapshot: {
        remainingDailyLossBudgetDollars: 90,
        remainingPortfolioRiskBudgetDollars: 90,
      },
      riskPolicy: {
        maximumRiskPerTradeDollars: 90,
        maximumCapitalAllocationDollars: 1_000,
        maximumContracts: 10,
      },
    }),
  );
  assert.equal(result.premiumRiskReference.premiumDebitReferencePerContractDollars, 140);
  assert.equal(result.premiumRiskReference.fullPremiumLossReferencePerContractDollars, 140);
  assert.equal(result.premiumRiskReference.plannedStructuralLossReferencePerContractDollars, 45);
  assert.equal(result.quantityCalculation.contractsPermittedByRisk, 2);
  assert.equal(result.quantityCalculation.contractsPermittedByCapital, 7);
  assert.equal(result.quantityCalculation.maximumContractsUnderPolicy, 2);
  assert.deepEqual(result.quantityCalculation.limitingQuantityControls, ["RISK_BUDGET"]);
});

test("the $50 policy no longer requires an option costing $50 or less", () => {
  const result = calculate();
  assert.equal(result.budgets.effectiveRiskBudgetDollars, 50);
  assert.equal(result.premiumRiskReference.premiumDebitReferencePerContractDollars, 140);
  assert.equal(result.premiumRiskReference.plannedStructuralLossReferencePerContractDollars, 45);
  assert.equal(result.quantityCalculation.maximumContractsUnderPolicy, 1);
});

test("capital exposure and planned risk are both disclosed", () => {
  const result = calculate();
  assert.equal(result.premiumRiskReference.premiumPriceReferenceType, "CURRENT_ASK");
  assert.equal(result.premiumRiskReference.premiumPriceReference, 1.4);
  assert.equal(result.premiumRiskReference.premiumDebitReferencePerContractDollars, 140);
  assert.equal(result.premiumRiskReference.fullPremiumLossReferencePerContractDollars, 140);
  assert.equal(result.premiumRiskReference.plannedStructuralLossReferencePerContractDollars, 45);
  assert.equal(result.premiumRiskReference.hardLossBackstopDollars, 50);
  assert.equal(result.premiumRiskReference.hardLossBackstopExitPremium, 0.9);
  assert.equal(result.disclosures.plannedStructuralLossUsedForSizing, true);
  assert.equal(result.disclosures.fullPremiumLossAcknowledged, true);
  assert.equal(result.disclosures.noAutomatedPremiumStop, true);
});

test("position percentages separate planned risk from capital committed", () => {
  const result = calculate();
  assert.equal(result.positionReferences.totalPremiumDebitReferenceDollars, 140);
  assert.equal(result.positionReferences.totalFullPremiumLossReferenceDollars, 140);
  assert.equal(result.positionReferences.totalPlannedStructuralLossReferenceDollars, 45);
  approximately(result.positionReferences.riskPercentOfAccountEquity, 4.5);
  approximately(result.positionReferences.capitalPercentOfAccountEquity, 14);
});

test("bid, midpoint, and provider mark do not alter sizing", () => {
  const first = calculate();
  const assembly = readyAssembly();
  Object.assign(assembly.selectedContract, {
    bid: 0.01,
    calculatedMidpoint: 99,
    providerMark: 77,
  });
  const second = calculate(request(), assembly);
  assert.equal(
    second.quantityCalculation.maximumContractsUnderPolicy,
    first.quantityCalculation.maximumContractsUnderPolicy,
  );
});

test("capital budget can independently block an otherwise acceptable risk", () => {
  const result = calculate(
    request({
      accountSnapshot: { availableCashDollars: 139 },
      riskPolicy: { maximumCapitalAllocationDollars: 139 },
    }),
  );
  assert.equal(result.sizingState, "NO_CAPACITY");
  assert.equal(result.quantityCalculation.contractsPermittedByRisk, 1);
  assert.equal(result.quantityCalculation.contractsPermittedByCapital, 0);
  assert.equal(result.quantityCalculation.maximumContractsUnderPolicy, 0);
  assert.deepEqual(result.quantityCalculation.limitingQuantityControls, ["CAPITAL_BUDGET"]);
});

test("planned risk above the available risk budget produces no capacity", () => {
  const result = calculate(
    request({
      accountSnapshot: {
        remainingDailyLossBudgetDollars: 44,
        remainingPortfolioRiskBudgetDollars: 44,
      },
      riskPolicy: { maximumRiskPerTradeDollars: 44 },
    }),
  );
  assert.equal(result.sizingState, "NO_CAPACITY");
  assert.equal(result.quantityCalculation.contractsPermittedByRisk, 0);
  assert.deepEqual(result.quantityCalculation.limitingQuantityControls, ["RISK_BUDGET"]);
});

for (const [name, overrides, reason] of [
  ["maximum risk", { riskPolicy: { maximumRiskPerTradeDollars: 0 } }, "BLOCKED_MAXIMUM_RISK_PER_TRADE_ZERO"],
  ["daily budget", { accountSnapshot: { remainingDailyLossBudgetDollars: 0 } }, "BLOCKED_DAILY_LOSS_BUDGET_EXHAUSTED"],
  ["portfolio budget", { accountSnapshot: { remainingPortfolioRiskBudgetDollars: 0 } }, "BLOCKED_PORTFOLIO_RISK_BUDGET_EXHAUSTED"],
  ["available cash", { accountSnapshot: { availableCashDollars: 0 } }, "BLOCKED_AVAILABLE_CASH_EXHAUSTED"],
  ["capital allocation", { riskPolicy: { maximumCapitalAllocationDollars: 0 } }, "BLOCKED_MAXIMUM_CAPITAL_ALLOCATION_ZERO"],
  ["maximum contracts", { riskPolicy: { maximumContracts: 0 } }, "BLOCKED_MAXIMUM_CONTRACTS_ZERO"],
] as const) {
  test(`zero ${name} produces BLOCKED`, () => {
    const result = calculate(request(overrides as RequestOverrides));
    assert.equal(result.sizingState, "BLOCKED");
    assert.equal(result.primaryReasonCode, reason);
    assert.equal(result.quantityCalculation.maximumContractsUnderPolicy, 0);
    assert.equal(result.revalidation.required, false);
  });
}

for (const state of [
  "WAITING_FOR_TRIGGER",
  "NO_QUALIFIED_CONTRACT",
  "NOT_QUALIFIED",
  "NO_SETUP",
  "NOT_APPLICABLE",
] as const) {
  test(`${state} maps to NOT_APPLICABLE without sizing calculations`, () => {
    const result = calculate(request(), nonReadyAssembly(state));
    assert.equal(result.sizingState, "NOT_APPLICABLE");
    assert.equal(result.quantityCalculation.maximumContractsUnderPolicy, null);
    assert.equal(result.budgets.effectiveRiskBudgetDollars, null);
    assert.equal(result.premiumRiskReference.premiumPriceReferenceType, "UNAVAILABLE");
    assert.equal(result.revalidation.required, false);
  });
}

test("PARTIAL non-ready Assembly remains non-applicable and labeled", () => {
  const result = calculate(request(), nonReadyAssembly("NOT_QUALIFIED", "PARTIAL"));
  assert.equal(result.engineState, "PARTIAL");
  assert.equal(result.sizingState, "NOT_APPLICABLE");
  assert.equal(result.warningCode, "ASSEMBLY_PARTIAL");
});

test("UNAVAILABLE Assembly maps to unavailable sizing", () => {
  const assembly = nonReadyAssembly("NOT_APPLICABLE");
  Object.assign(assembly, {
    engineState: "UNAVAILABLE",
    planState: "UNAVAILABLE",
    direction: "UNAVAILABLE",
  });
  const result = calculate(request(), assembly);
  assert.equal(result.engineState, "UNAVAILABLE");
  assert.equal(result.sizingState, "UNAVAILABLE");
  assert.equal(result.primaryReasonCode, "SOURCE_ASSEMBLY_UNAVAILABLE");
});

test("missing planned structural loss fails closed", () => {
  const assembly = readyAssembly();
  assembly.selectedContract.estimatedPlannedStructuralLossDollars = null;
  const result = calculate(request(), assembly);
  assert.equal(result.sizingState, "UNAVAILABLE");
  assert.equal(result.primaryReasonCode, "SOURCE_PLANNED_STRUCTURAL_LOSS_INVALID");
  assert.equal(result.warningCode, "SELECTED_CONTRACT_PLANNED_RISK_UNAVAILABLE");
});

test("missing hard backstop reference fails closed", () => {
  const assembly = readyAssembly();
  assembly.selectedContract.hardLossBackstopExitPremium = null;
  assert.equal(
    calculate(request(), assembly).primaryReasonCode,
    "SOURCE_PLANNED_STRUCTURAL_LOSS_INVALID",
  );
});

test("selected contract integrity checks remain fail-closed", () => {
  const missing = readyAssembly();
  missing.selectedContract.candidateId = null;
  assert.equal(calculate(request(), missing).primaryReasonCode, "SOURCE_SELECTED_CONTRACT_MISSING");

  const wrongDirection = readyAssembly();
  wrongDirection.selectedContract.contractDirection = "PUT";
  assert.equal(calculate(request(), wrongDirection).primaryReasonCode, "SOURCE_DIRECTION_MISMATCH");

  const wrongRank = readyAssembly();
  wrongRank.selectedContract.selectionRank = 2;
  assert.equal(calculate(request(), wrongRank).sizingState, "UNAVAILABLE");

  const wrongMultiplier = readyAssembly();
  wrongMultiplier.selectedContract.multiplier = 10;
  assert.equal(
    calculate(request(), wrongMultiplier).primaryReasonCode,
    "SOURCE_SELECTED_CONTRACT_MULTIPLIER_INVALID",
  );
});

test("stale, missing Ask, expiration mismatch, and snapshot mismatch cannot size", () => {
  const stale = readyAssembly();
  stale.selectedContract.quoteFreshnessState = "STALE";
  assert.equal(calculate(request(), stale).primaryReasonCode, "SOURCE_SELECTED_CONTRACT_NOT_FRESH");

  const noAsk = readyAssembly();
  noAsk.selectedContract.ask = null;
  assert.equal(calculate(request(), noAsk).primaryReasonCode, "SOURCE_SELECTED_CONTRACT_ASK_INVALID");

  const wrongExpiration = readyAssembly();
  wrongExpiration.selectedContract.expirationDate = "2026-07-18";
  assert.equal(
    calculate(request(), wrongExpiration).primaryReasonCode,
    "SOURCE_SELECTED_CONTRACT_EXPIRATION_INVALID",
  );

  const snapshot = readyAssembly();
  snapshot.sourceSummary.upstreamSameSnapshotGuaranteed = false;
  assert.equal(calculate(request(), snapshot).sizingState, "UNAVAILABLE");
});

test("response schema rejects tampered risk and capital references", () => {
  const quantity = structuredClone(calculate());
  quantity.quantityCalculation.maximumContractsUnderPolicy = 2;
  assert.equal(SpyZeroDtePositionSizingResponseSchema.safeParse(quantity).success, false);

  const fullLoss = structuredClone(calculate());
  fullLoss.premiumRiskReference.fullPremiumLossReferencePerContractDollars = 139;
  assert.equal(SpyZeroDtePositionSizingResponseSchema.safeParse(fullLoss).success, false);

  const plannedLoss = structuredClone(calculate());
  plannedLoss.premiumRiskReference.plannedStructuralLossReferencePerContractDollars = 46;
  assert.equal(SpyZeroDtePositionSizingResponseSchema.safeParse(plannedLoss).success, false);
});

test("response contains no order submission or automated premium-stop fields", () => {
  const text = JSON.stringify(calculate());
  for (const term of [
    "orderQuantity",
    "contractsToBuy",
    "recommendedLimit",
    "orderType",
    "premiumTarget",
    "premiumStop",
    "guaranteedFill",
    "schwabAccount",
    "dealer",
  ]) {
    assert.equal(text.includes(term), false, term);
  }
});

test("service retrieves Assembly exactly once", async () => {
  let calls = 0;
  const result = await getSpyZeroDtePositionSizingWithDependencies(request(), {
    getAssembly: async () => {
      calls += 1;
      return readyAssembly();
    },
    now: () => Date.parse(SIZING_AT),
  });
  assert.equal(calls, 1);
  assert.equal(result.sizingState, "SIZED");
});

async function main(): Promise<void> {
  for (const [name, fn] of tests) {
    try {
      await fn();
      passed += 1;
      console.log(`PASS ${name}`);
    } catch (error) {
      console.error(`FAIL ${name}`);
      throw error;
    }
  }
  console.log(`Trade Sizing V2 tests: ${passed} passed, 0 failed`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
