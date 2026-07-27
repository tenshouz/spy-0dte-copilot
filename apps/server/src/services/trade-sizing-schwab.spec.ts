/**
 * Deterministic tests for SCHWAB_ASSISTED_SIZING_V2 planned structural risk.
 * Run: npx --no-install tsx apps/server/src/services/trade-sizing-schwab.spec.ts
 */
import assert from "node:assert/strict";
import http from "node:http";
import {
  SchwabAssistedPositionSizingRequestErrorResponseSchema,
  SpyZeroDteSchwabAssistedPositionSizingRequestSchema,
  SpyZeroDteSchwabAssistedPositionSizingResponseSchema,
  type SchwabReadOnlyAccountRiskSnapshotResponse,
  type SpyZeroDteSchwabAssistedPositionSizingRequest,
  type SpyZeroDteTradePlanAssemblyResponse,
} from "@spy-copilot/shared";
import cors from "cors";
import express from "express";
import {
  createSchwabAssistedTradeSizingRouter,
  schwabAssistedPositionSizingRequestError,
} from "../routes/trade-sizing-schwab.routes";
import {
  SCHWAB_ASSISTED_SIZING_METHODOLOGY_VERSION,
  buildSpyZeroDteSchwabAssistedPositionSizing,
} from "./trade-sizing-schwab.logic";
import {
  getSpyZeroDteSchwabAssistedPositionSizingWithDependencies,
  type SchwabAssistedPositionSizingServiceDependencies,
} from "./trade-sizing-schwab.service";

const MARKET_DATE = "2026-07-17";
const ASSEMBLY_AT = "2026-07-17T14:00:00.000Z";
const CONTRACT_AT = "2026-07-17T14:00:00.100Z";
const CHAIN_AT = "2026-07-17T14:00:00.050Z";
const QUOTE_AT = "2026-07-17T13:59:55.000Z";
const ACCOUNT_AT = "2026-07-17T14:00:00.150Z";
const DISCOVERY_AT = "2026-07-17T14:00:00.120Z";
const BALANCES_AT = "2026-07-17T14:00:00.140Z";
const SIZING_AT_MS = Date.parse("2026-07-17T14:00:00.200Z");

function request(
  overrides: Partial<SpyZeroDteSchwabAssistedPositionSizingRequest> = {},
): SpyZeroDteSchwabAssistedPositionSizingRequest {
  const base: SpyZeroDteSchwabAssistedPositionSizingRequest = {
    callerRiskInputs: {
      accountEquityDollars: 1_000,
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
    callerRiskInputs: {
      ...base.callerRiskInputs,
      ...(overrides.callerRiskInputs ?? {}),
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
  planState: "WAITING_FOR_TRIGGER" | "NO_SETUP" = "WAITING_FOR_TRIGGER",
  engineState: "AVAILABLE" | "PARTIAL" = "AVAILABLE",
): SpyZeroDteTradePlanAssemblyResponse {
  return readyAssembly({
    engineState,
    planState,
    direction: planState === "NO_SETUP" ? "NONE" : "CALLS",
    primaryReasonCode:
      planState === "WAITING_FOR_TRIGGER"
        ? "TRADE_PLAN_WAITING_FOR_TRIGGER"
        : "TRADE_PLAN_NO_SETUP",
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

function accountSnapshot(
  overrides: Partial<SchwabReadOnlyAccountRiskSnapshotResponse> = {},
): SchwabReadOnlyAccountRiskSnapshotResponse {
  const base: SchwabReadOnlyAccountRiskSnapshotResponse = {
    product: "SCHWAB_READ_ONLY_ACCOUNT_RISK_SNAPSHOT",
    methodologyVersion: "ACCOUNT_RISK_SNAPSHOT_V1",
    calculatedAt: ACCOUNT_AT,
    engineState: "PARTIAL",
    snapshotState: "PARTIAL",
    primaryReasonCode: "ACCOUNT_RISK_SNAPSHOT_PARTIAL",
    warningCode: "ACCOUNT_EQUITY_UNAVAILABLE",
    accountSelection: {
      linkedAccountCount: 1,
      selectionState: "SELECTED",
      accountType: "CASH",
    },
    balances: {
      accountEquityDollars: null,
      availableCashDollars: 1_000,
      currency: "USD",
      equitySourceField: null,
      availableCashSourceField:
        "securitiesAccount.currentBalances.cashAvailableForTrading",
    },
    source: {
      provider: "SCHWAB_TRADER_API",
      accountDiscoveryFetchedAt: DISCOVERY_AT,
      accountBalancesFetchedAt: BALANCES_AT,
      timestampSource: "APPLICATION_RECEIPT_TIME",
      retainedStaleDataUsed: false,
      positionsRequested: false,
      ordersRequested: false,
      transactionsRequested: false,
    },
    disclosures: {
      readOnlyBrokerSnapshot: true,
      brokerReportedValues: true,
      accountIdentifiersRedacted: true,
      availableCashIsNotBuyingPower: true,
      marginCapacityExcluded: true,
      snapshotMayBePartial: true,
      noPositionRiskCalculation: true,
      noDailyLossCalculation: true,
      noPortfolioRiskCalculation: true,
      noSizingCalculation: true,
      noOrderExecution: true,
      noPersistence: true,
    },
    methodology: {
      accountSelectionMethod: "EXACTLY_ONE_LINKED_ACCOUNT",
      cashAccountAvailableCashMethod:
        "securitiesAccount.currentBalances.cashAvailableForTrading",
      cashAccountEquityMethod: "UNAVAILABLE_IN_CURRENT_BALANCES",
      marginAccountEquityMethod:
        "securitiesAccount.currentBalances.equity",
      marginAccountAvailableCashMethod:
        "UNVERIFIED_IN_ACCOUNT_RISK_SNAPSHOT_V1",
      currency: "USD",
      retainedStaleFallback: false,
    },
  };
  return structuredClone({ ...base, ...overrides }) as SchwabReadOnlyAccountRiskSnapshotResponse;
}

function snapshotState(
  snapshotStateValue:
    | "NO_ACCOUNT"
    | "ACCOUNT_SELECTION_REQUIRED"
    | "UNSUPPORTED_ACCOUNT"
    | "UNAUTHORIZED"
    | "UNAVAILABLE",
): SchwabReadOnlyAccountRiskSnapshotResponse {
  const common = accountSnapshot();
  const noBalances = {
    accountEquityDollars: null,
    availableCashDollars: null,
    currency: "USD" as const,
    equitySourceField: null,
    availableCashSourceField: null,
  };
  if (snapshotStateValue === "NO_ACCOUNT") {
    return {
      ...common,
      engineState: "AVAILABLE",
      snapshotState: "NO_ACCOUNT",
      primaryReasonCode: "NO_LINKED_ACCOUNT",
      warningCode: null,
      accountSelection: {
        linkedAccountCount: 0,
        selectionState: "NO_ACCOUNT",
        accountType: null,
      },
      balances: noBalances,
      source: { ...common.source, accountBalancesFetchedAt: null },
    };
  }
  if (snapshotStateValue === "ACCOUNT_SELECTION_REQUIRED") {
    return {
      ...common,
      engineState: "AVAILABLE",
      snapshotState: "ACCOUNT_SELECTION_REQUIRED",
      primaryReasonCode: "MULTIPLE_LINKED_ACCOUNTS_REQUIRE_SELECTION",
      warningCode: null,
      accountSelection: {
        linkedAccountCount: 2,
        selectionState: "ACCOUNT_SELECTION_REQUIRED",
        accountType: null,
      },
      balances: noBalances,
      source: { ...common.source, accountBalancesFetchedAt: null },
    };
  }
  if (snapshotStateValue === "UNSUPPORTED_ACCOUNT") {
    return {
      ...common,
      engineState: "AVAILABLE",
      snapshotState: "UNSUPPORTED_ACCOUNT",
      primaryReasonCode: "SELECTED_ACCOUNT_TYPE_UNSUPPORTED",
      warningCode: null,
      accountSelection: {
        linkedAccountCount: 1,
        selectionState: "SELECTED",
        accountType: "UNSUPPORTED",
      },
      balances: noBalances,
    };
  }
  if (snapshotStateValue === "UNAUTHORIZED") {
    return {
      ...common,
      engineState: "UNAVAILABLE",
      snapshotState: "UNAUTHORIZED",
      primaryReasonCode: "SCHWAB_ACCOUNT_ACCESS_UNAUTHORIZED",
      warningCode: null,
      accountSelection: {
        linkedAccountCount: null,
        selectionState: "UNAVAILABLE",
        accountType: "UNAVAILABLE",
      },
      balances: noBalances,
      source: {
        ...common.source,
        accountDiscoveryFetchedAt: null,
        accountBalancesFetchedAt: null,
      },
    };
  }
  return {
    ...common,
    engineState: "UNAVAILABLE",
    snapshotState: "UNAVAILABLE",
    primaryReasonCode: "SCHWAB_ACCOUNT_BALANCES_UNAVAILABLE",
    warningCode: null,
    accountSelection: {
      linkedAccountCount: 1,
      selectionState: "SELECTED",
      accountType: "UNAVAILABLE",
    },
    balances: noBalances,
  };
}

function marginSnapshot(): SchwabReadOnlyAccountRiskSnapshotResponse {
  const base = accountSnapshot();
  return {
    ...base,
    warningCode: "AVAILABLE_CASH_UNAVAILABLE",
    accountSelection: {
      linkedAccountCount: 1,
      selectionState: "SELECTED",
      accountType: "MARGIN",
    },
    balances: {
      accountEquityDollars: 1_000,
      availableCashDollars: null,
      currency: "USD",
      equitySourceField: "securitiesAccount.currentBalances.equity",
      availableCashSourceField: null,
    },
  };
}

function calculate(
  req = request(),
  assembly = readyAssembly(),
  snapshot: SchwabReadOnlyAccountRiskSnapshotResponse | null = accountSnapshot(),
) {
  return buildSpyZeroDteSchwabAssistedPositionSizing(
    req,
    assembly,
    snapshot,
    SIZING_AT_MS,
  );
}

let passed = 0;
type TestFunction = () => void | Promise<void>;
const tests: Array<[string, TestFunction]> = [];
function test(name: string, fn: TestFunction): void {
  tests.push([name, fn]);
}

function privacyText(value: unknown): string {
  return JSON.stringify(value).toLowerCase();
}

function assertNoPrivateFields(value: unknown): void {
  const text = privacyText(value);
  for (const prohibited of [
    "accountnumber",
    "hashvalue",
    "accounthash",
    "access_token",
    "refresh_token",
    '"positions":',
    '"orders":',
    '"transactions":',
  ]) {
    assert.equal(text.includes(prohibited), false, prohibited);
  }
}

test("methodology version is locked", () => {
  assert.equal(
    SCHWAB_ASSISTED_SIZING_METHODOLOGY_VERSION,
    "SCHWAB_ASSISTED_SIZING_V2",
  );
});

test("strict request parses", () => {
  assert.equal(
    SpyZeroDteSchwabAssistedPositionSizingRequestSchema.parse(request())
      .riskPolicy.maximumContracts,
    1,
  );
});

test("request rejects caller available cash", () => {
  assert.equal(
    SpyZeroDteSchwabAssistedPositionSizingRequestSchema.safeParse({
      ...request(),
      callerRiskInputs: {
        ...request().callerRiskInputs,
        availableCashDollars: 999,
      },
    }).success,
    false,
  );
});

test("request rejects account identifiers", () => {
  assert.equal(
    SpyZeroDteSchwabAssistedPositionSizingRequestSchema.safeParse({
      ...request(),
      accountHash: "private",
    }).success,
    false,
  );
});

for (const [field, value] of [
  ["accountEquityDollars", 0],
  ["accountEquityDollars", -1],
  ["remainingDailyLossBudgetDollars", -1],
  ["remainingPortfolioRiskBudgetDollars", -1],
] as const) {
  test(`request rejects invalid ${field}`, () => {
    assert.equal(
      SpyZeroDteSchwabAssistedPositionSizingRequestSchema.safeParse(
        request({ callerRiskInputs: { [field]: value } as never }),
      ).success,
      false,
    );
  });
}

test("request rejects fractional maximumContracts", () => {
  assert.equal(
    SpyZeroDteSchwabAssistedPositionSizingRequestSchema.safeParse(
      request({ riskPolicy: { maximumContracts: 1.5 } as never }),
    ).success,
    false,
  );
});

test("ready CASH snapshot produces SIZED using broker cash", () => {
  const result = calculate();
  assert.equal(result.engineState, "AVAILABLE");
  assert.equal(result.sizingState, "SIZED");
  assert.equal(result.primaryReasonCode, "POSITION_SIZE_CALCULATED");
  assert.equal(result.quantityCalculation.maximumContractsUnderPolicy, 1);
  assert.equal(result.accountContext.availableCashDollars, 1_000);
  assert.equal(
    result.accountContext.availableCashSource,
    "SCHWAB_CASH_AVAILABLE_FOR_TRADING",
  );
  assert.equal(result.accountContext.brokerSnapshot.usedForSizing, true);
  assert.equal(result.premiumRiskReference.premiumDebitReferencePerContractDollars, 140);
  assert.equal(result.premiumRiskReference.plannedStructuralLossReferencePerContractDollars, 45);
  assert.equal(result.premiumRiskReference.hardLossBackstopDollars, 50);
  assert.equal(result.premiumRiskReference.hardLossBackstopExitPremium, 0.9);
  assert.equal(result.positionReferences.totalPlannedStructuralLossReferenceDollars, 45);
});

test("broker cash is the capital budget input", () => {
  const result = calculate(
    request({
      callerRiskInputs: {
        remainingDailyLossBudgetDollars: 500,
        remainingPortfolioRiskBudgetDollars: 500,
      } as never,
      riskPolicy: {
        maximumRiskPerTradeDollars: 500,
        maximumCapitalAllocationDollars: 1_000,
        maximumContracts: 10,
      } as never,
    }),
    readyAssembly(),
    accountSnapshot({
      balances: {
        ...accountSnapshot().balances,
        availableCashDollars: 600,
      },
    }),
  );
  assert.equal(result.budgets.effectiveCapitalBudgetDollars, 600);
  assert.deepEqual(result.budgets.limitingCapitalControls, ["AVAILABLE_CASH"]);
  assert.equal(result.quantityCalculation.contractsPermittedByCapital, 4);
});

test("zero broker cash is preserved and blocks sizing", () => {
  const result = calculate(request(), readyAssembly(), accountSnapshot({
    balances: {
      ...accountSnapshot().balances,
      availableCashDollars: 0,
    },
  }));
  assert.equal(result.sizingState, "BLOCKED");
  assert.equal(result.primaryReasonCode, "BLOCKED_AVAILABLE_CASH_EXHAUSTED");
  assert.equal(result.accountContext.availableCashDollars, 0);
});

test("cash below one contract produces NO_CAPACITY", () => {
  const result = calculate(request(), readyAssembly(), accountSnapshot({
    balances: {
      ...accountSnapshot().balances,
      availableCashDollars: 139,
    },
  }));
  assert.equal(result.sizingState, "NO_CAPACITY");
  assert.equal(result.quantityCalculation.contractsPermittedByCapital, 0);
});

test("caller equity is retained only as caller-supplied context", () => {
  const result = calculate();
  assert.equal(result.accountContext.accountEquityDollars, 1_000);
  assert.equal(result.accountContext.accountEquitySource, "CALLER_SUPPLIED");
  assert.equal(result.positionReferences.riskPercentOfAccountEquity, 4.5);
});

test("caller daily and portfolio budgets remain explicit", () => {
  const result = calculate(
    request({
      callerRiskInputs: {
        remainingDailyLossBudgetDollars: 300,
        remainingPortfolioRiskBudgetDollars: 400,
      } as never,
      riskPolicy: { maximumRiskPerTradeDollars: 500 } as never,
    }),
  );
  assert.equal(result.budgets.effectiveRiskBudgetDollars, 300);
  assert.deepEqual(result.budgets.limitingRiskControls, [
    "REMAINING_DAILY_LOSS_BUDGET",
  ]);
});

test("maximumContracts policy still limits quantity", () => {
  const result = calculate(
    request({
      callerRiskInputs: {
        remainingDailyLossBudgetDollars: 500,
        remainingPortfolioRiskBudgetDollars: 500,
      } as never,
      riskPolicy: {
        maximumRiskPerTradeDollars: 500,
        maximumCapitalAllocationDollars: 1_000,
        maximumContracts: 1,
      } as never,
    }),
  );
  assert.equal(result.quantityCalculation.maximumContractsUnderPolicy, 1);
  assert.deepEqual(result.quantityCalculation.limitingQuantityControls, [
    "MAXIMUM_CONTRACTS",
  ]);
});

test("non-ready Assembly short-circuits without broker data", () => {
  const result = calculate(request(), nonReadyAssembly(), null);
  assert.equal(result.sizingState, "NOT_APPLICABLE");
  assert.equal(result.primaryReasonCode, "SOURCE_ASSEMBLY_NOT_READY");
  assert.equal(result.accountContext.brokerSnapshot.requested, false);
  assert.equal(result.accountContext.availableCashDollars, null);
  assert.equal(result.accountContext.availableCashSource, "NOT_REQUESTED");
});

test("partial non-ready Assembly preserves PARTIAL engine", () => {
  const result = calculate(request(), nonReadyAssembly("WAITING_FOR_TRIGGER", "PARTIAL"), null);
  assert.equal(result.engineState, "PARTIAL");
  assert.equal(result.warningCode, "ASSEMBLY_PARTIAL");
});

test("unavailable Assembly short-circuits before broker", () => {
  const assembly = readyAssembly({ engineState: "UNAVAILABLE", planState: "UNAVAILABLE" });
  const result = calculate(request(), assembly, null);
  assert.equal(result.sizingState, "UNAVAILABLE");
  assert.equal(result.primaryReasonCode, "SOURCE_ASSEMBLY_UNAVAILABLE");
  assert.equal(result.accountContext.brokerSnapshot.requested, false);
});

test("MARGIN account is unavailable because cash is unverified", () => {
  const result = calculate(request(), readyAssembly(), marginSnapshot());
  assert.equal(result.engineState, "UNAVAILABLE");
  assert.equal(result.primaryReasonCode, "BROKER_AVAILABLE_CASH_UNAVAILABLE");
  assert.equal(result.warningCode, "BROKER_AVAILABLE_CASH_UNAVAILABLE");
});

test("negative broker cash is not clamped or used", () => {
  const snapshot = accountSnapshot({
    warningCode: "NEGATIVE_BROKER_BALANCE_REPORTED",
    balances: {
      ...accountSnapshot().balances,
      availableCashDollars: -1,
    },
  });
  const result = calculate(request(), readyAssembly(), snapshot);
  assert.equal(result.primaryReasonCode, "BROKER_AVAILABLE_CASH_NEGATIVE");
  assert.equal(result.accountContext.availableCashDollars, null);
  assert.equal(result.accountContext.brokerSnapshot.usedForSizing, false);
});

for (const [state, reason, warning] of [
  ["NO_ACCOUNT", "BROKER_NO_LINKED_ACCOUNT", "BROKER_ACCOUNT_NOT_FOUND"],
  [
    "ACCOUNT_SELECTION_REQUIRED",
    "BROKER_ACCOUNT_SELECTION_REQUIRED",
    "BROKER_ACCOUNT_SELECTION_REQUIRED",
  ],
  [
    "UNSUPPORTED_ACCOUNT",
    "BROKER_ACCOUNT_TYPE_UNSUPPORTED",
    "BROKER_ACCOUNT_UNSUPPORTED",
  ],
  [
    "UNAUTHORIZED",
    "BROKER_ACCOUNT_ACCESS_UNAUTHORIZED",
    "BROKER_ACCOUNT_UNAUTHORIZED",
  ],
  [
    "UNAVAILABLE",
    "BROKER_ACCOUNT_SNAPSHOT_UNAVAILABLE",
    "BROKER_ACCOUNT_UNAVAILABLE",
  ],
] as const) {
  test(`${state} maps to deterministic broker failure`, () => {
    const result = calculate(request(), readyAssembly(), snapshotState(state));
    assert.equal(result.engineState, "UNAVAILABLE");
    assert.equal(result.sizingState, "UNAVAILABLE");
    assert.equal(result.primaryReasonCode, reason);
    assert.equal(result.warningCode, warning);
    assert.equal(result.accountContext.availableCashDollars, null);
  });
}

test("missing approved CASH field maps to unavailable", () => {
  const malformed = accountSnapshot({
    engineState: "UNAVAILABLE",
    snapshotState: "UNAVAILABLE",
    primaryReasonCode: "AVAILABLE_CASH_FIELD_UNAVAILABLE",
    warningCode: "ACCOUNT_NORMALIZATION_VALIDATION_FAILED",
    balances: {
      ...accountSnapshot().balances,
      availableCashDollars: null,
      availableCashSourceField: null,
    },
  });
  const result = calculate(request(), readyAssembly(), malformed);
  assert.equal(result.primaryReasonCode, "BROKER_ACCOUNT_SNAPSHOT_UNAVAILABLE");
});

test("response contains no account identifier or order data", () => {
  assertNoPrivateFields(calculate());
});

test("response disclosures lock read-only behavior", () => {
  const result = calculate();
  assert.equal(result.disclosures.readOnlyBrokerAccess, true);
  assert.equal(result.disclosures.noOrderExecution, true);
  assert.equal(result.disclosures.positionsRequested, false);
  assert.equal(result.disclosures.ordersRequested, false);
  assert.equal(result.disclosures.transactionsRequested, false);
  assert.equal(result.disclosures.noPersistence, true);
  assert.equal(result.disclosures.plannedStructuralLossUsedForSizing, true);
  assert.equal(result.disclosures.fullPremiumLossAcknowledged, true);
  assert.equal(result.disclosures.hardLossBackstopReferenceOnly, true);
  assert.equal(result.disclosures.noAutomatedPremiumStop, true);
});

test("response methodology explicitly identifies mixed sources", () => {
  const result = calculate();
  assert.equal(result.methodology.sourceSizingMethodology, "SIZING_V2");
  assert.equal(result.methodology.accountEquityMethod, "CALLER_SUPPLIED");
  assert.equal(
    result.methodology.availableCashMethod,
    "SCHWAB_CURRENT_BALANCES_CASH_AVAILABLE_FOR_TRADING",
  );
  assert.equal(result.methodology.assemblyFirstShortCircuit, true);
});

test("strict response rejects unknown public fields", () => {
  assert.equal(
    SpyZeroDteSchwabAssistedPositionSizingResponseSchema.safeParse({
      ...calculate(),
      accountHash: "private",
    }).success,
    false,
  );
});

test("response schema rejects sized output without broker usage", () => {
  const value = structuredClone(calculate());
  value.accountContext.brokerSnapshot.usedForSizing = false;
  assert.equal(
    SpyZeroDteSchwabAssistedPositionSizingResponseSchema.safeParse(value).success,
    false,
  );
});

test("response schema rejects unrequested broker data", () => {
  const value = structuredClone(calculate(request(), nonReadyAssembly(), null));
  value.accountContext.brokerSnapshot.product =
    "SCHWAB_READ_ONLY_ACCOUNT_RISK_SNAPSHOT";
  assert.equal(
    SpyZeroDteSchwabAssistedPositionSizingResponseSchema.safeParse(value).success,
    false,
  );
});

test("request error sanitizer never echoes values", () => {
  const parsed = SpyZeroDteSchwabAssistedPositionSizingRequestSchema.safeParse({
    ...request(),
    accountHash: "private-hash",
  });
  assert.equal(parsed.success, false);
  if (parsed.success) throw new Error("expected invalid request");
  const error = schwabAssistedPositionSizingRequestError(parsed.error.issues);
  assert.equal(
    SchwabAssistedPositionSizingRequestErrorResponseSchema.parse(error).error,
    "INVALID_SCHWAB_ASSISTED_POSITION_SIZING_REQUEST",
  );
  assert.equal(privacyText(error).includes("private-hash"), false);
});

test("service calls Assembly exactly once and account exactly once when ready", async () => {
  let assemblyCalls = 0;
  let accountCalls = 0;
  const deps: SchwabAssistedPositionSizingServiceDependencies = {
    getAssembly: async () => {
      assemblyCalls += 1;
      return readyAssembly();
    },
    getAccountRiskSnapshot: async () => {
      accountCalls += 1;
      return accountSnapshot();
    },
    now: () => SIZING_AT_MS,
    log: () => undefined,
  };
  const result = await getSpyZeroDteSchwabAssistedPositionSizingWithDependencies(
    request(),
    deps,
  );
  assert.equal(result.sizingState, "SIZED");
  assert.equal(assemblyCalls, 1);
  assert.equal(accountCalls, 1);
});

test("service makes zero account calls when Assembly is not ready", async () => {
  let accountCalls = 0;
  const result = await getSpyZeroDteSchwabAssistedPositionSizingWithDependencies(
    request(),
    {
      getAssembly: async () => nonReadyAssembly(),
      getAccountRiskSnapshot: async () => {
        accountCalls += 1;
        return accountSnapshot();
      },
      now: () => SIZING_AT_MS,
      log: () => undefined,
    },
  );
  assert.equal(result.sizingState, "NOT_APPLICABLE");
  assert.equal(accountCalls, 0);
});

test("service sanitizes account snapshot throw", async () => {
  const logs: string[] = [];
  const result = await getSpyZeroDteSchwabAssistedPositionSizingWithDependencies(
    request(),
    {
      getAssembly: async () => readyAssembly(),
      getAccountRiskSnapshot: async () => {
        throw new Error("private-token-and-hash");
      },
      now: () => SIZING_AT_MS,
      log: (value) => logs.push(value),
    },
  );
  assert.equal(result.primaryReasonCode, "BROKER_ACCOUNT_SNAPSHOT_UNAVAILABLE");
  assert.deepEqual(logs, ["account snapshot unexpected failure"]);
  assert.equal(privacyText(result).includes("private-token-and-hash"), false);
});

test("service sanitizes Assembly throw and skips broker", async () => {
  let accountCalls = 0;
  const result = await getSpyZeroDteSchwabAssistedPositionSizingWithDependencies(
    request(),
    {
      getAssembly: async () => {
        throw new Error("private-assembly-error");
      },
      getAccountRiskSnapshot: async () => {
        accountCalls += 1;
        return accountSnapshot();
      },
      now: () => SIZING_AT_MS,
      log: () => undefined,
    },
  );
  assert.equal(result.sizingState, "UNAVAILABLE");
  assert.equal(result.accountContext.brokerSnapshot.requested, false);
  assert.equal(accountCalls, 0);
});

async function withServer(
  getSizing: () => Promise<ReturnType<typeof calculate>>,
  fn: (baseUrl: string, calls: () => number) => Promise<void>,
): Promise<void> {
  let count = 0;
  const app = express();
  app.use(cors());
  app.use(express.json());
  app.use(
    "/api/trade-sizing",
    createSchwabAssistedTradeSizingRouter({
      getSizing: async () => {
        count += 1;
        return getSizing();
      },
      frontendUrl: () => "http://localhost:3000",
      log: () => undefined,
    }),
  );
  const server = http.createServer(app);
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("no address");
  try {
    await fn(`http://127.0.0.1:${address.port}`, () => count);
  } finally {
    await new Promise<void>((resolve, reject) =>
      server.close((error) => (error ? reject(error) : resolve())),
    );
  }
}

test("route allows no-Origin request and applies private headers", async () => {
  await withServer(async () => calculate(), async (baseUrl, calls) => {
    const response = await fetch(`${baseUrl}/api/trade-sizing/spy/schwab`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(request()),
    });
    assert.equal(response.status, 200);
    assert.equal(response.headers.get("cache-control"), "no-store");
    assert.equal(response.headers.get("pragma"), "no-cache");
    assert.equal(response.headers.get("cross-origin-resource-policy"), "same-site");
    assert.equal(response.headers.get("x-content-type-options"), "nosniff");
    assert.equal(response.headers.get("access-control-allow-origin"), null);
    assert.equal(calls(), 1);
  });
});

test("route allows configured frontend Origin", async () => {
  await withServer(async () => calculate(), async (baseUrl, calls) => {
    const response = await fetch(`${baseUrl}/api/trade-sizing/spy/schwab`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Origin: "http://localhost:3000",
      },
      body: JSON.stringify(request()),
    });
    assert.equal(response.status, 200);
    assert.equal(
      response.headers.get("access-control-allow-origin"),
      "http://localhost:3000",
    );
    assert.equal(calls(), 1);
  });
});

test("route rejects disallowed Origin before sizing", async () => {
  await withServer(async () => calculate(), async (baseUrl, calls) => {
    const response = await fetch(`${baseUrl}/api/trade-sizing/spy/schwab`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Origin: "https://evil.example",
      },
      body: JSON.stringify(request()),
    });
    assert.equal(response.status, 403);
    assert.equal(response.headers.get("access-control-allow-origin"), null);
    assert.equal(response.headers.get("cache-control"), "no-store");
    assert.equal(calls(), 0);
    assert.deepEqual(await response.json(), {
      error: "SCHWAB_ASSISTED_POSITION_SIZING_ORIGIN_FORBIDDEN",
    });
  });
});

test("route rejects query parameters before sizing", async () => {
  await withServer(async () => calculate(), async (baseUrl, calls) => {
    const response = await fetch(`${baseUrl}/api/trade-sizing/spy/schwab?hash=x`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(request()),
    });
    assert.equal(response.status, 400);
    assert.equal(calls(), 0);
    assert.deepEqual(await response.json(), {
      error: "INVALID_SCHWAB_ASSISTED_POSITION_SIZING_REQUEST",
      issues: [{ path: "query", code: "QUERY_PARAMETERS_NOT_SUPPORTED" }],
    });
  });
});

test("route rejects invalid body before sizing", async () => {
  await withServer(async () => calculate(), async (baseUrl, calls) => {
    const response = await fetch(`${baseUrl}/api/trade-sizing/spy/schwab`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...request(), accountHash: "private" }),
    });
    assert.equal(response.status, 400);
    assert.equal(calls(), 0);
    const body = await response.json();
    assert.equal(privacyText(body).includes("private"), false);
  });
});

test("route response remains identifier-free", async () => {
  await withServer(async () => calculate(), async (baseUrl) => {
    const response = await fetch(`${baseUrl}/api/trade-sizing/spy/schwab`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(request()),
    });
    assertNoPrivateFields(await response.json());
  });
});

async function main(): Promise<void> {
  for (const [name, fn] of tests) {
    try {
      await fn();
      passed += 1;
    } catch (error) {
      console.error(`FAILED: ${name}`);
      throw error;
    }
  }

  console.log(
    `Schwab-assisted position sizing tests: ${passed}/${tests.length} passed`,
  );
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
