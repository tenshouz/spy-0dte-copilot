/**
 * Deterministic tests for SIZING_V1.
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

function request(
  overrides: RequestOverrides = {},
): SpyZeroDtePositionSizingRequest {
  const base: SpyZeroDtePositionSizingRequest = {
    accountSnapshot: {
      accountEquityDollars: 25_000,
      availableCashDollars: 5_000,
      remainingDailyLossBudgetDollars: 1_000,
      remainingPortfolioRiskBudgetDollars: 1_500,
    },
    riskPolicy: {
      maximumRiskPerTradeDollars: 800,
      maximumCapitalAllocationDollars: 3_000,
      maximumContracts: 10,
    },
  };
  return {
    accountSnapshot: {
      ...base.accountSnapshot,
      ...(overrides.accountSnapshot ?? {}),
    },
    riskPolicy: {
      ...base.riskPolicy,
      ...(overrides.riskPolicy ?? {}),
    },
  };
}

function readyAssembly(
  overrides: Record<string, unknown> = {},
): SpyZeroDteTradePlanAssemblyResponse {
  const base = {
    product: "SPY_ZERO_DTE_DETERMINISTIC_TRADE_PLAN_ASSEMBLY",
    methodologyVersion: "ASSEMBLY_V1",
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
      value: 2.45,
      disclosureCode: "MIDPOINT_REFERENCE_ONLY",
    },
    selectedContract: {
      candidateId: "SPY_CALL_750",
      contractSymbol: "SPY   260717C00750000",
      contractDirection: "CALL",
      strikePrice: 750,
      expirationDate: MARKET_DATE,
      multiplier: 100,
      ask: 2.5,
      bid: 2.4,
      calculatedMidpoint: 2.45,
      providerMark: 2.46,
      quoteAt: QUOTE_AT,
      quoteAgeMilliseconds: 5_000,
      quoteFreshnessState: "FRESH",
      selectionRank: 1,
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

const syncTests: Array<[string, () => void]> = [];
function syncTest(name: string, fn: () => void): void {
  syncTests.push([name, fn]);
}

syncTest("methodology version is SIZING_V1", () => {
  assert.equal(SIZING_METHODOLOGY_VERSION, "SIZING_V1");
});

syncTest("valid strict request parses", () => {
  assert.equal(SpyZeroDtePositionSizingRequestSchema.parse(request()).riskPolicy.maximumContracts, 10);
});

syncTest("unknown top-level request key is rejected", () => {
  assert.equal(
    SpyZeroDtePositionSizingRequestSchema.safeParse({ ...request(), privateNote: "no" }).success,
    false,
  );
});

syncTest("unknown nested account key is rejected", () => {
  const value = request() as unknown as Record<string, unknown>;
  value.accountSnapshot = { ...(value.accountSnapshot as object), accountNumber: "123" };
  assert.equal(SpyZeroDtePositionSizingRequestSchema.safeParse(value).success, false);
});

syncTest("account equity must be positive", () => {
  assert.equal(
    SpyZeroDtePositionSizingRequestSchema.safeParse(
      request({ accountSnapshot: { accountEquityDollars: 0 } } as never),
    ).success,
    false,
  );
});

for (const [name, field] of [
  ["available cash", "availableCashDollars"],
  ["daily budget", "remainingDailyLossBudgetDollars"],
  ["portfolio budget", "remainingPortfolioRiskBudgetDollars"],
] as const) {
  syncTest(`${name} rejects negative values`, () => {
    assert.equal(
      SpyZeroDtePositionSizingRequestSchema.safeParse(
        request({ accountSnapshot: { [field]: -1 } } as never),
      ).success,
      false,
    );
  });
}

for (const [name, field] of [
  ["trade risk", "maximumRiskPerTradeDollars"],
  ["capital allocation", "maximumCapitalAllocationDollars"],
] as const) {
  syncTest(`${name} rejects negative values`, () => {
    assert.equal(
      SpyZeroDtePositionSizingRequestSchema.safeParse(
        request({ riskPolicy: { [field]: -1 } } as never),
      ).success,
      false,
    );
  });
}

syncTest("maximum contracts rejects fractions", () => {
  assert.equal(
    SpyZeroDtePositionSizingRequestSchema.safeParse(
      request({ riskPolicy: { maximumContracts: 1.5 } } as never),
    ).success,
    false,
  );
});

syncTest("maximum contracts rejects unsafe integers", () => {
  assert.equal(
    SpyZeroDtePositionSizingRequestSchema.safeParse(
      request({ riskPolicy: { maximumContracts: Number.MAX_SAFE_INTEGER + 1 } } as never),
    ).success,
    false,
  );
});

syncTest("sanitized request error schema excludes values", () => {
  const error = PositionSizingRequestErrorResponseSchema.parse({
    error: "INVALID_POSITION_SIZING_REQUEST",
    issues: [{ path: "accountSnapshot.accountEquityDollars", code: "MUST_BE_POSITIVE" }],
  });
  assert.equal(JSON.stringify(error).includes("25000"), false);
});

syncTest("maximum trade risk can limit risk budget", () => {
  const result = calculateEffectiveRiskBudget(request());
  assert.equal(result.effectiveRiskBudgetDollars, 800);
  assert.deepEqual(result.limitingRiskControls, ["MAXIMUM_RISK_PER_TRADE"]);
});

syncTest("daily budget can limit risk budget", () => {
  const result = calculateEffectiveRiskBudget(
    request({ accountSnapshot: { remainingDailyLossBudgetDollars: 300 } } as never),
  );
  assert.equal(result.effectiveRiskBudgetDollars, 300);
  assert.deepEqual(result.limitingRiskControls, ["REMAINING_DAILY_LOSS_BUDGET"]);
});

syncTest("portfolio budget can limit risk budget", () => {
  const result = calculateEffectiveRiskBudget(
    request({ accountSnapshot: { remainingPortfolioRiskBudgetDollars: 250 } } as never),
  );
  assert.equal(result.effectiveRiskBudgetDollars, 250);
  assert.deepEqual(result.limitingRiskControls, ["REMAINING_PORTFOLIO_RISK_BUDGET"]);
});

syncTest("all exact risk ties are preserved in methodology order", () => {
  const result = calculateEffectiveRiskBudget(
    request({
      accountSnapshot: {
        remainingDailyLossBudgetDollars: 500,
        remainingPortfolioRiskBudgetDollars: 500,
      },
      riskPolicy: { maximumRiskPerTradeDollars: 500 },
    } as never),
  );
  assert.deepEqual(result.limitingRiskControls, [
    "MAXIMUM_RISK_PER_TRADE",
    "REMAINING_DAILY_LOSS_BUDGET",
    "REMAINING_PORTFOLIO_RISK_BUDGET",
  ]);
});

syncTest("available cash can limit capital budget", () => {
  const result = calculateEffectiveCapitalBudget(request());
  assert.equal(result.effectiveCapitalBudgetDollars, 3_000);
  assert.deepEqual(result.limitingCapitalControls, ["MAXIMUM_CAPITAL_ALLOCATION"]);
});

syncTest("capital allocation tie is preserved", () => {
  const result = calculateEffectiveCapitalBudget(
    request({
      accountSnapshot: { availableCashDollars: 2_000 },
      riskPolicy: { maximumCapitalAllocationDollars: 2_000 },
    } as never),
  );
  assert.deepEqual(result.limitingCapitalControls, [
    "AVAILABLE_CASH",
    "MAXIMUM_CAPITAL_ALLOCATION",
  ]);
});

syncTest("blocking controls preserve deterministic order", () => {
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

syncTest("base READY result is SIZED and schema-valid", () => {
  const result = calculate();
  SpyZeroDtePositionSizingResponseSchema.parse(result);
  assert.equal(result.sizingState, "SIZED");
  assert.equal(result.quantityCalculation.maximumContractsUnderPolicy, 3);
});

syncTest("current Ask multiplied by 100 is the only premium debit", () => {
  const result = calculate();
  assert.equal(result.premiumRiskReference.premiumPriceReference, 2.5);
  assert.equal(result.premiumRiskReference.premiumDebitReferencePerContractDollars, 250);
  assert.equal(result.premiumRiskReference.fullPremiumLossReferencePerContractDollars, 250);
});

syncTest("midpoint bid and provider mark do not affect sizing", () => {
  const first = calculate();
  const assembly = readyAssembly();
  Object.assign(assembly.selectedContract, {
    bid: 0.01,
    calculatedMidpoint: 99,
    providerMark: 77,
  });
  const second = calculate(request(), assembly);
  assert.equal(second.quantityCalculation.maximumContractsUnderPolicy, first.quantityCalculation.maximumContractsUnderPolicy);
});

syncTest("risk capacity uses floor", () => {
  const result = calculate();
  assert.equal(result.quantityCalculation.contractsPermittedByRisk, 3);
});

syncTest("capital capacity uses floor", () => {
  const result = calculate();
  assert.equal(result.quantityCalculation.contractsPermittedByCapital, 12);
});

syncTest("risk budget is the limiting quantity control", () => {
  assert.deepEqual(calculate().quantityCalculation.limitingQuantityControls, ["RISK_BUDGET"]);
});

syncTest("capital budget can be the limiting quantity control", () => {
  const result = calculate(
    request({
      accountSnapshot: { availableCashDollars: 500 },
      riskPolicy: { maximumRiskPerTradeDollars: 5_000, maximumCapitalAllocationDollars: 500 },
    } as never),
  );
  assert.equal(result.quantityCalculation.maximumContractsUnderPolicy, 2);
  assert.deepEqual(result.quantityCalculation.limitingQuantityControls, ["CAPITAL_BUDGET"]);
});

syncTest("maximum contracts can be the limiting quantity control", () => {
  const result = calculate(
    request({ riskPolicy: { maximumRiskPerTradeDollars: 5_000, maximumContracts: 1 } } as never),
  );
  assert.equal(result.quantityCalculation.maximumContractsUnderPolicy, 1);
  assert.deepEqual(result.quantityCalculation.limitingQuantityControls, ["MAXIMUM_CONTRACTS"]);
});

syncTest("all exact quantity ties are preserved", () => {
  const result = calculate(
    request({
      accountSnapshot: {
        availableCashDollars: 500,
        remainingDailyLossBudgetDollars: 500,
        remainingPortfolioRiskBudgetDollars: 500,
      },
      riskPolicy: {
        maximumRiskPerTradeDollars: 500,
        maximumCapitalAllocationDollars: 500,
        maximumContracts: 2,
      },
    }),
  );
  assert.deepEqual(result.quantityCalculation.limitingQuantityControls, [
    "RISK_BUDGET",
    "CAPITAL_BUDGET",
    "MAXIMUM_CONTRACTS",
  ]);
});

syncTest("exact risk equality permits one contract", () => {
  const result = calculate(
    request({
      accountSnapshot: {
        remainingDailyLossBudgetDollars: 250,
        remainingPortfolioRiskBudgetDollars: 250,
      },
      riskPolicy: { maximumRiskPerTradeDollars: 250 },
    } as never),
  );
  assert.equal(result.quantityCalculation.contractsPermittedByRisk, 1);
});

syncTest("exact capital equality permits one contract", () => {
  const result = calculate(
    request({
      accountSnapshot: { availableCashDollars: 250 },
      riskPolicy: { maximumCapitalAllocationDollars: 250 },
    } as never),
  );
  assert.equal(result.quantityCalculation.contractsPermittedByCapital, 1);
});

syncTest("one contract too expensive produces NO_CAPACITY", () => {
  const result = calculate(
    request({
      accountSnapshot: {
        availableCashDollars: 200,
        remainingDailyLossBudgetDollars: 200,
        remainingPortfolioRiskBudgetDollars: 200,
      },
      riskPolicy: {
        maximumRiskPerTradeDollars: 200,
        maximumCapitalAllocationDollars: 200,
      },
    }),
  );
  assert.equal(result.sizingState, "NO_CAPACITY");
  assert.equal(result.quantityCalculation.maximumContractsUnderPolicy, 0);
  assert.equal(result.positionReferences.totalPremiumDebitReferenceDollars, 0);
  assert.equal(result.revalidation.required, true);
  assert.equal(result.warningCode, null);
});

for (const [name, overrides, reason] of [
  ["maximum risk", { riskPolicy: { maximumRiskPerTradeDollars: 0 } }, "BLOCKED_MAXIMUM_RISK_PER_TRADE_ZERO"],
  ["daily budget", { accountSnapshot: { remainingDailyLossBudgetDollars: 0 } }, "BLOCKED_DAILY_LOSS_BUDGET_EXHAUSTED"],
  ["portfolio budget", { accountSnapshot: { remainingPortfolioRiskBudgetDollars: 0 } }, "BLOCKED_PORTFOLIO_RISK_BUDGET_EXHAUSTED"],
  ["available cash", { accountSnapshot: { availableCashDollars: 0 } }, "BLOCKED_AVAILABLE_CASH_EXHAUSTED"],
  ["capital allocation", { riskPolicy: { maximumCapitalAllocationDollars: 0 } }, "BLOCKED_MAXIMUM_CAPITAL_ALLOCATION_ZERO"],
  ["maximum contracts", { riskPolicy: { maximumContracts: 0 } }, "BLOCKED_MAXIMUM_CONTRACTS_ZERO"],
] as const) {
  syncTest(`zero ${name} produces BLOCKED`, () => {
    const result = calculate(request(overrides as never));
    assert.equal(result.sizingState, "BLOCKED");
    assert.equal(result.primaryReasonCode, reason);
    assert.equal(result.quantityCalculation.maximumContractsUnderPolicy, 0);
    assert.equal(result.revalidation.required, false);
    assert.equal(result.warningCode, null);
  });
}

syncTest("multiple blockers are all preserved while reason follows precedence", () => {
  const result = calculate(
    request({
      accountSnapshot: { availableCashDollars: 0, remainingDailyLossBudgetDollars: 0 },
      riskPolicy: { maximumRiskPerTradeDollars: 0, maximumContracts: 0 },
    } as never),
  );
  assert.deepEqual(result.quantityCalculation.blockingControls, [
    "MAXIMUM_RISK_PER_TRADE",
    "REMAINING_DAILY_LOSS_BUDGET",
    "AVAILABLE_CASH",
    "MAXIMUM_CONTRACTS",
  ]);
  assert.equal(result.primaryReasonCode, "BLOCKED_MAXIMUM_RISK_PER_TRADE_ZERO");
});

syncTest("SIZED totals and percentages are deterministic", () => {
  const result = calculate();
  assert.equal(result.positionReferences.totalPremiumDebitReferenceDollars, 750);
  assert.equal(result.positionReferences.totalFullPremiumLossReferenceDollars, 750);
  assert.equal(result.positionReferences.riskPercentOfAccountEquity, 3);
  assert.equal(result.positionReferences.capitalPercentOfAccountEquity, 3);
  assert.equal(result.revalidation.required, true);
});

for (const state of [
  "WAITING_FOR_TRIGGER",
  "NO_QUALIFIED_CONTRACT",
  "NOT_QUALIFIED",
  "NO_SETUP",
  "NOT_APPLICABLE",
] as const) {
  syncTest(`${state} maps to NOT_APPLICABLE with null calculations`, () => {
    const result = calculate(request(), nonReadyAssembly(state));
    assert.equal(result.sizingState, "NOT_APPLICABLE");
    assert.equal(result.quantityCalculation.maximumContractsUnderPolicy, null);
    assert.equal(result.budgets.effectiveRiskBudgetDollars, null);
    assert.equal(result.premiumRiskReference.premiumPriceReferenceType, "UNAVAILABLE");
    assert.equal(result.revalidation.required, false);
  });
}

syncTest("PARTIAL non-ready Assembly maps to PARTIAL NOT_APPLICABLE", () => {
  const result = calculate(request(), nonReadyAssembly("NOT_QUALIFIED", "PARTIAL"));
  assert.equal(result.engineState, "PARTIAL");
  assert.equal(result.sizingState, "NOT_APPLICABLE");
  assert.equal(result.warningCode, "ASSEMBLY_PARTIAL");
});

syncTest("UNAVAILABLE Assembly maps to UNAVAILABLE", () => {
  const assembly = nonReadyAssembly("NOT_APPLICABLE");
  Object.assign(assembly, { engineState: "UNAVAILABLE", planState: "UNAVAILABLE", direction: "UNAVAILABLE" });
  const result = calculate(request(), assembly);
  assert.equal(result.engineState, "UNAVAILABLE");
  assert.equal(result.sizingState, "UNAVAILABLE");
  assert.equal(result.primaryReasonCode, "SOURCE_ASSEMBLY_UNAVAILABLE");
});

syncTest("missing selected contract fails unavailable", () => {
  const assembly = readyAssembly();
  assembly.selectedContract.candidateId = null;
  assert.equal(calculate(request(), assembly).primaryReasonCode, "SOURCE_SELECTED_CONTRACT_MISSING");
});

syncTest("direction mismatch fails unavailable", () => {
  const assembly = readyAssembly();
  assembly.selectedContract.contractDirection = "PUT";
  assert.equal(calculate(request(), assembly).primaryReasonCode, "SOURCE_DIRECTION_MISMATCH");
});

syncTest("rank other than one fails unavailable", () => {
  const assembly = readyAssembly();
  assembly.selectedContract.selectionRank = 2;
  assert.equal(calculate(request(), assembly).sizingState, "UNAVAILABLE");
});

for (const freshness of ["STALE", "UNKNOWN", "UNAVAILABLE"] as const) {
  syncTest(`${freshness} selected quote cannot size`, () => {
    const assembly = readyAssembly();
    assembly.selectedContract.quoteFreshnessState = freshness;
    assert.equal(calculate(request(), assembly).primaryReasonCode, "SOURCE_SELECTED_CONTRACT_NOT_FRESH");
  });
}

syncTest("missing Ask fails unavailable", () => {
  const assembly = readyAssembly();
  assembly.selectedContract.ask = null;
  assert.equal(calculate(request(), assembly).primaryReasonCode, "SOURCE_SELECTED_CONTRACT_ASK_INVALID");
});

syncTest("wrong multiplier fails unavailable", () => {
  const assembly = readyAssembly();
  assembly.selectedContract.multiplier = 10;
  assert.equal(calculate(request(), assembly).primaryReasonCode, "SOURCE_SELECTED_CONTRACT_MULTIPLIER_INVALID");
});

syncTest("expiration mismatch fails unavailable", () => {
  const assembly = readyAssembly();
  assembly.selectedContract.expirationDate = "2026-07-18";
  assert.equal(calculate(request(), assembly).primaryReasonCode, "SOURCE_SELECTED_CONTRACT_EXPIRATION_INVALID");
});

syncTest("snapshot incompatibility cannot size", () => {
  const assembly = readyAssembly();
  assembly.sourceSummary.upstreamSameSnapshotGuaranteed = false;
  assert.equal(calculate(request(), assembly).sizingState, "UNAVAILABLE");
});

syncTest("contract source incompatibility cannot size", () => {
  const assembly = readyAssembly();
  assembly.sourceSummary.contract.sourceCompatibilityState = "PARTIAL";
  assert.equal(calculate(request(), assembly).sizingState, "UNAVAILABLE");
});

syncTest("response schema rejects tampered final quantity", () => {
  const result = calculate();
  const tampered = structuredClone(result);
  tampered.quantityCalculation.maximumContractsUnderPolicy = 4;
  assert.equal(SpyZeroDtePositionSizingResponseSchema.safeParse(tampered).success, false);
});

syncTest("response schema rejects tampered full-loss reference", () => {
  const result = calculate();
  const tampered = structuredClone(result);
  tampered.premiumRiskReference.fullPremiumLossReferencePerContractDollars = 249;
  assert.equal(SpyZeroDtePositionSizingResponseSchema.safeParse(tampered).success, false);
});

syncTest("response schema rejects positive quantity with PARTIAL engine", () => {
  const result = calculate();
  const tampered = structuredClone(result);
  tampered.engineState = "PARTIAL";
  assert.equal(SpyZeroDtePositionSizingResponseSchema.safeParse(tampered).success, false);
});

syncTest("response contains no order or execution fields", () => {
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

for (const [name, fn] of syncTests) {
  test(name, fn);
}

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
  console.log(`Trade Sizing tests: ${passed} passed, 0 failed`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
