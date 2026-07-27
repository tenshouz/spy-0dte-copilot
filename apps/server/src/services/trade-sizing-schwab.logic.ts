import {
  SpyZeroDteSchwabAssistedPositionSizingResponseSchema,
  type AccountRiskSnapshotWarningCode,
  type PositionSizingPrimaryReasonCode,
  type PositionSizingWarningCode,
  type SchwabAssistedPositionSizingPrimaryReasonCode,
  type SchwabAssistedPositionSizingWarningCode,
  type SchwabReadOnlyAccountRiskSnapshotResponse,
  type SpyZeroDtePositionSizingRequest,
  type SpyZeroDteSchwabAssistedPositionSizingRequest,
  type SpyZeroDteSchwabAssistedPositionSizingResponse,
  type SpyZeroDteTradePlanAssemblyResponse,
} from "@spy-copilot/shared";
import { buildSpyZeroDtePositionSizing } from "./trade-sizing.logic";

export const SCHWAB_ASSISTED_SIZING_METHODOLOGY_VERSION =
  "SCHWAB_ASSISTED_SIZING_V2" as const;

const DISCLOSURES = {
  callerSuppliedAccountEquity: true as const,
  callerSuppliedDailyLossBudget: true as const,
  callerSuppliedPortfolioRiskBudget: true as const,
  brokerAvailableCashMayBeUsed: true as const,
  readOnlyBrokerAccess: true as const,
  currentAskIsNotGuaranteed: true as const,
  plannedStructuralLossUsedForSizing: true as const,
  fullPremiumLossAcknowledged: true as const,
  hardLossBackstopReferenceOnly: true as const,
  quantityIsReferenceOnly: true as const,
  noOrderExecution: true as const,
  positionsRequested: false as const,
  ordersRequested: false as const,
  transactionsRequested: false as const,
  noPersistence: true as const,
  noAutomatedPremiumStop: true as const,
  noPremiumTarget: true as const,
};

const METHODOLOGY = {
  sourceSizingMethodology: "SIZING_V2" as const,
  accountEquityMethod: "CALLER_SUPPLIED" as const,
  availableCashMethod:
    "SCHWAB_CURRENT_BALANCES_CASH_AVAILABLE_FOR_TRADING" as const,
  remainingDailyLossBudgetMethod: "CALLER_SUPPLIED" as const,
  remainingPortfolioRiskBudgetMethod: "CALLER_SUPPLIED" as const,
  assemblyFirstShortCircuit: true as const,
  sizingPremiumReference: "CURRENT_ASK" as const,
  maximumLossMethod: "PLANNED_STRUCTURAL_LOSS_REFERENCE" as const,
  catastrophicCapitalExposureMethod: "FULL_PREMIUM_DEBIT_REFERENCE" as const,
  hardLossBackstopMethod: "FIXED_DOLLAR_LOSS_FROM_ACTUAL_ENTRY" as const,
  effectiveRiskBudgetMethod: "MINIMUM_OF_EXPLICIT_RISK_LIMITS" as const,
  effectiveCapitalBudgetMethod:
    "MINIMUM_OF_SCHWAB_AVAILABLE_CASH_AND_ALLOCATION_LIMIT" as const,
  quantityMethod: "FLOOR_THEN_MINIMUM_OF_ALL_CONTROLS" as const,
  multiplierRequirement: 100 as const,
  positionType: "LONG_SINGLE_LEG_OPTION_ONLY" as const,
  calculationCurrency: "USD" as const,
};

const EMPTY_PREMIUM_REFERENCE = {
  premiumPriceReferenceType: "UNAVAILABLE" as const,
  premiumPriceReference: null,
  multiplier: null,
  premiumDebitReferencePerContractDollars: null,
  fullPremiumLossReferencePerContractDollars: null,
  plannedStructuralLossReferencePerContractDollars: null,
  hardLossBackstopDollars: null,
  hardLossBackstopExitPremium: null,
  disclosureCode: "CURRENT_ASK_CAPITAL_AND_STRUCTURAL_RISK_REFERENCE" as const,
};

const EMPTY_BUDGETS = {
  effectiveRiskBudgetDollars: null,
  limitingRiskControls: [],
  effectiveCapitalBudgetDollars: null,
  limitingCapitalControls: [],
};

const EMPTY_POSITION_REFERENCES = {
  totalPremiumDebitReferenceDollars: null,
  totalFullPremiumLossReferenceDollars: null,
  totalPlannedStructuralLossReferenceDollars: null,
  riskPercentOfAccountEquity: null,
  capitalPercentOfAccountEquity: null,
};

function iso(input: number | string): string {
  return typeof input === "number" ? new Date(input).toISOString() : input;
}

function sourceAssemblySummary(assembly: SpyZeroDteTradePlanAssemblyResponse) {
  return {
    product: assembly.product,
    methodologyVersion: assembly.methodologyVersion,
    currentMarketDate: assembly.currentMarketDate,
    calculatedAt: assembly.calculatedAt,
    engineState: assembly.engineState,
    planState: assembly.planState,
    direction: assembly.direction,
    primaryReasonCode: assembly.primaryReasonCode,
    warningCode: assembly.warningCode,
    upstreamSameSnapshotGuaranteed:
      assembly.sourceSummary.upstreamSameSnapshotGuaranteed,
    contractSourceCompatibilityState:
      assembly.sourceSummary.contract.sourceCompatibilityState,
    sourceContractCalculatedAt: assembly.sourceSummary.contract.calculatedAt,
    sourceOptionsChainFetchedAt:
      assembly.sourceSummary.contract.sourceOptionsChainFetchedAt,
    selectedContractQuoteAt: assembly.sourceSummary.selectedContractQuoteAt,
  };
}

function sanitizedSelectedContract(assembly: SpyZeroDteTradePlanAssemblyResponse) {
  const contract = assembly.selectedContract;
  return {
    candidateId: contract.candidateId,
    contractSymbol: contract.contractSymbol,
    contractDirection: contract.contractDirection,
    strikePrice: contract.strikePrice,
    expirationDate: contract.expirationDate,
    multiplier:
      contract.multiplier !== null &&
      Number.isFinite(contract.multiplier) &&
      contract.multiplier > 0
        ? contract.multiplier
        : null,
    ask:
      contract.ask !== null && Number.isFinite(contract.ask) && contract.ask > 0
        ? contract.ask
        : null,
    quoteAt: contract.quoteAt,
    quoteAgeMilliseconds:
      contract.quoteAgeMilliseconds !== null &&
      Number.isFinite(contract.quoteAgeMilliseconds) &&
      contract.quoteAgeMilliseconds >= 0
        ? contract.quoteAgeMilliseconds
        : null,
    quoteFreshnessState: contract.quoteFreshnessState,
    selectionRank: contract.selectionRank,
    estimatedPlannedStructuralLossDollars:
      contract.estimatedPlannedStructuralLossDollars ?? null,
    hardLossBackstopDollars: contract.hardLossBackstopDollars ?? null,
    hardLossBackstopExitPremium: contract.hardLossBackstopExitPremium ?? null,
  };
}

function unrequestedBrokerSnapshot() {
  return {
    requested: false as const,
    usedForSizing: false as const,
    product: null,
    methodologyVersion: null,
    calculatedAt: null,
    engineState: null,
    snapshotState: "NOT_REQUESTED" as const,
    primaryReasonCode: null,
    warningCode: null,
    linkedAccountCount: null,
    accountType: null,
    availableCashSourceField: null,
    accountDiscoveryFetchedAt: null,
    accountBalancesFetchedAt: null,
  };
}

function sanitizedBrokerSnapshot(
  snapshot: SchwabReadOnlyAccountRiskSnapshotResponse,
  usedForSizing: boolean,
) {
  return {
    requested: true as const,
    usedForSizing,
    product: snapshot.product,
    methodologyVersion: snapshot.methodologyVersion,
    calculatedAt: snapshot.calculatedAt,
    engineState: snapshot.engineState,
    snapshotState: snapshot.snapshotState,
    primaryReasonCode: snapshot.primaryReasonCode,
    warningCode: snapshot.warningCode,
    linkedAccountCount: snapshot.accountSelection.linkedAccountCount,
    accountType: snapshot.accountSelection.accountType,
    availableCashSourceField: snapshot.balances.availableCashSourceField,
    accountDiscoveryFetchedAt: snapshot.source.accountDiscoveryFetchedAt,
    accountBalancesFetchedAt: snapshot.source.accountBalancesFetchedAt,
  };
}

function baseResponse(
  request: SpyZeroDteSchwabAssistedPositionSizingRequest,
  assembly: SpyZeroDteTradePlanAssemblyResponse,
  calculatedAt: string,
) {
  return {
    symbol: "SPY" as const,
    product: "SPY_ZERO_DTE_SCHWAB_ASSISTED_POSITION_SIZING" as const,
    methodologyVersion: SCHWAB_ASSISTED_SIZING_METHODOLOGY_VERSION,
    currentMarketDate: assembly.currentMarketDate,
    calculatedAt,
    sourceAssembly: sourceAssemblySummary(assembly),
    riskPolicy: { ...request.riskPolicy },
    disclosures: DISCLOSURES,
    methodology: METHODOLOGY,
  };
}

function accountContext(
  request: SpyZeroDteSchwabAssistedPositionSizingRequest,
  availableCashDollars: number | null,
  availableCashSource:
    | "SCHWAB_CASH_AVAILABLE_FOR_TRADING"
    | "NOT_REQUESTED"
    | "UNAVAILABLE",
  brokerSnapshot: ReturnType<
    typeof unrequestedBrokerSnapshot | typeof sanitizedBrokerSnapshot
  >,
) {
  return {
    accountEquityDollars: request.callerRiskInputs.accountEquityDollars,
    availableCashDollars,
    remainingDailyLossBudgetDollars:
      request.callerRiskInputs.remainingDailyLossBudgetDollars,
    remainingPortfolioRiskBudgetDollars:
      request.callerRiskInputs.remainingPortfolioRiskBudgetDollars,
    accountEquitySource: "CALLER_SUPPLIED" as const,
    availableCashSource,
    remainingDailyLossBudgetSource: "CALLER_SUPPLIED" as const,
    remainingPortfolioRiskBudgetSource: "CALLER_SUPPLIED" as const,
    brokerSnapshot,
    disclosureCode:
      "SCHWAB_AVAILABLE_CASH_WITH_CALLER_RISK_LIMITS" as const,
  };
}

function synthesizeSizingRequest(
  request: SpyZeroDteSchwabAssistedPositionSizingRequest,
  availableCashDollars: number,
): SpyZeroDtePositionSizingRequest {
  return {
    accountSnapshot: {
      accountEquityDollars: request.callerRiskInputs.accountEquityDollars,
      availableCashDollars,
      remainingDailyLossBudgetDollars:
        request.callerRiskInputs.remainingDailyLossBudgetDollars,
      remainingPortfolioRiskBudgetDollars:
        request.callerRiskInputs.remainingPortfolioRiskBudgetDollars,
    },
    riskPolicy: { ...request.riskPolicy },
  };
}

function mapUnderlyingSizing(
  request: SpyZeroDteSchwabAssistedPositionSizingRequest,
  assembly: SpyZeroDteTradePlanAssemblyResponse,
  snapshot: SchwabReadOnlyAccountRiskSnapshotResponse | null,
  availableCashDollars: number,
  calculatedAt: string,
): SpyZeroDteSchwabAssistedPositionSizingResponse {
  const underlying = buildSpyZeroDtePositionSizing(
    synthesizeSizingRequest(request, availableCashDollars),
    assembly,
    calculatedAt,
  );
  const brokerSnapshot = snapshot
    ? sanitizedBrokerSnapshot(snapshot, true)
    : unrequestedBrokerSnapshot();

  return SpyZeroDteSchwabAssistedPositionSizingResponseSchema.parse({
    ...baseResponse(request, assembly, calculatedAt),
    engineState: underlying.engineState,
    sizingState: underlying.sizingState,
    primaryReasonCode: underlying.primaryReasonCode,
    warningCode: underlying.warningCode,
    selectedContract: underlying.selectedContract,
    accountContext: accountContext(
      request,
      snapshot ? availableCashDollars : null,
      snapshot ? "SCHWAB_CASH_AVAILABLE_FOR_TRADING" : "NOT_REQUESTED",
      brokerSnapshot,
    ),
    premiumRiskReference: underlying.premiumRiskReference,
    budgets: underlying.budgets,
    quantityCalculation: underlying.quantityCalculation,
    positionReferences: underlying.positionReferences,
    revalidation: underlying.revalidation,
  });
}

function brokerUnavailableResponse(
  request: SpyZeroDteSchwabAssistedPositionSizingRequest,
  assembly: SpyZeroDteTradePlanAssemblyResponse,
  snapshot: SchwabReadOnlyAccountRiskSnapshotResponse,
  calculatedAt: string,
  primaryReasonCode: SchwabAssistedPositionSizingPrimaryReasonCode,
  warningCode: SchwabAssistedPositionSizingWarningCode,
): SpyZeroDteSchwabAssistedPositionSizingResponse {
  return SpyZeroDteSchwabAssistedPositionSizingResponseSchema.parse({
    ...baseResponse(request, assembly, calculatedAt),
    engineState: "UNAVAILABLE",
    sizingState: "UNAVAILABLE",
    primaryReasonCode,
    warningCode,
    selectedContract: sanitizedSelectedContract(assembly),
    accountContext: accountContext(
      request,
      null,
      "UNAVAILABLE",
      sanitizedBrokerSnapshot(snapshot, false),
    ),
    premiumRiskReference: EMPTY_PREMIUM_REFERENCE,
    budgets: EMPTY_BUDGETS,
    quantityCalculation: {
      contractsPermittedByRisk: null,
      contractsPermittedByCapital: null,
      maximumContractsPolicyLimit: request.riskPolicy.maximumContracts,
      maximumContractsUnderPolicy: null,
      limitingQuantityControls: [],
      blockingControls: [],
      disclosureCode: "POSITION_SIZE_REFERENCE_ONLY",
    },
    positionReferences: EMPTY_POSITION_REFERENCES,
    revalidation: {
      required: false,
      disclosureCode: "REVALIDATE_CURRENT_ASK_BEFORE_ANY_ORDER",
    },
  });
}

function brokerFailureMapping(snapshot: SchwabReadOnlyAccountRiskSnapshotResponse): {
  reason: SchwabAssistedPositionSizingPrimaryReasonCode;
  warning: SchwabAssistedPositionSizingWarningCode;
} {
  switch (snapshot.snapshotState) {
    case "NO_ACCOUNT":
      return {
        reason: "BROKER_NO_LINKED_ACCOUNT",
        warning: "BROKER_ACCOUNT_NOT_FOUND",
      };
    case "ACCOUNT_SELECTION_REQUIRED":
      return {
        reason: "BROKER_ACCOUNT_SELECTION_REQUIRED",
        warning: "BROKER_ACCOUNT_SELECTION_REQUIRED",
      };
    case "UNSUPPORTED_ACCOUNT":
      return {
        reason: "BROKER_ACCOUNT_TYPE_UNSUPPORTED",
        warning: "BROKER_ACCOUNT_UNSUPPORTED",
      };
    case "UNAUTHORIZED":
      return {
        reason: "BROKER_ACCOUNT_ACCESS_UNAUTHORIZED",
        warning: "BROKER_ACCOUNT_UNAUTHORIZED",
      };
    case "UNAVAILABLE":
      return {
        reason: "BROKER_ACCOUNT_SNAPSHOT_UNAVAILABLE",
        warning: "BROKER_ACCOUNT_UNAVAILABLE",
      };
    case "PARTIAL":
      if (snapshot.accountSelection.accountType !== "CASH") {
        return {
          reason: "BROKER_AVAILABLE_CASH_UNAVAILABLE",
          warning: "BROKER_AVAILABLE_CASH_UNAVAILABLE",
        };
      }
      if (
        snapshot.balances.availableCashDollars === null ||
        snapshot.balances.availableCashSourceField !==
          "securitiesAccount.currentBalances.cashAvailableForTrading"
      ) {
        return {
          reason: "BROKER_AVAILABLE_CASH_UNAVAILABLE",
          warning: "BROKER_AVAILABLE_CASH_UNAVAILABLE",
        };
      }
      if (snapshot.balances.availableCashDollars < 0) {
        return {
          reason: "BROKER_AVAILABLE_CASH_NEGATIVE",
          warning: "BROKER_AVAILABLE_CASH_NEGATIVE",
        };
      }
      return {
        reason: "BROKER_ACCOUNT_SNAPSHOT_INVALID",
        warning: "BROKER_ACCOUNT_UNAVAILABLE",
      };
    case "READY":
      return {
        reason: "BROKER_ACCOUNT_SNAPSHOT_INVALID",
        warning: "BROKER_ACCOUNT_UNAVAILABLE",
      };
  }
}

/**
 * Pure broker-assisted sizing composition. The broker snapshot is never used
 * for account equity, daily-loss, or portfolio-risk values. Only the approved
 * CASH available-cash field may enter SIZING_V2.
 */
export function buildSpyZeroDteSchwabAssistedPositionSizing(
  request: SpyZeroDteSchwabAssistedPositionSizingRequest,
  assembly: SpyZeroDteTradePlanAssemblyResponse,
  snapshot: SchwabReadOnlyAccountRiskSnapshotResponse | null,
  calculatedAtInput: number | string,
): SpyZeroDteSchwabAssistedPositionSizingResponse {
  const calculatedAt = iso(calculatedAtInput);

  // Preserve the Assembly-first short circuit. No private account call is
  // required when the public trade plan cannot be sized.
  if (
    assembly.engineState === "UNAVAILABLE" ||
    assembly.planState === "UNAVAILABLE" ||
    assembly.planState !== "READY" ||
    assembly.engineState !== "AVAILABLE"
  ) {
    return mapUnderlyingSizing(request, assembly, null, 0, calculatedAt);
  }

  if (snapshot === null) {
    const unavailableSnapshot: SchwabReadOnlyAccountRiskSnapshotResponse = {
      product: "SCHWAB_READ_ONLY_ACCOUNT_RISK_SNAPSHOT",
      methodologyVersion: "ACCOUNT_RISK_SNAPSHOT_V1",
      calculatedAt,
      engineState: "UNAVAILABLE",
      snapshotState: "UNAVAILABLE",
      primaryReasonCode: "ACCOUNT_NORMALIZATION_UNAVAILABLE",
      warningCode: "ACCOUNT_NORMALIZATION_VALIDATION_FAILED",
      accountSelection: {
        linkedAccountCount: null,
        selectionState: "UNAVAILABLE",
        accountType: "UNAVAILABLE",
      },
      balances: {
        accountEquityDollars: null,
        availableCashDollars: null,
        currency: "USD",
        equitySourceField: null,
        availableCashSourceField: null,
      },
      source: {
        provider: "SCHWAB_TRADER_API",
        accountDiscoveryFetchedAt: null,
        accountBalancesFetchedAt: null,
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
    return brokerUnavailableResponse(
      request,
      assembly,
      unavailableSnapshot,
      calculatedAt,
      "BROKER_ACCOUNT_SNAPSHOT_UNAVAILABLE",
      "BROKER_ACCOUNT_UNAVAILABLE",
    );
  }

  const availableCash = snapshot.balances.availableCashDollars;
  if (
    snapshot.snapshotState === "PARTIAL" &&
    snapshot.accountSelection.accountType === "CASH" &&
    snapshot.accountSelection.linkedAccountCount === 1 &&
    snapshot.accountSelection.selectionState === "SELECTED" &&
    availableCash !== null &&
    Number.isFinite(availableCash) &&
    availableCash >= 0 &&
    snapshot.balances.availableCashSourceField ===
      "securitiesAccount.currentBalances.cashAvailableForTrading"
  ) {
    return mapUnderlyingSizing(
      request,
      assembly,
      snapshot,
      availableCash,
      calculatedAt,
    );
  }

  const failure = brokerFailureMapping(snapshot);
  return brokerUnavailableResponse(
    request,
    assembly,
    snapshot,
    calculatedAt,
    failure.reason,
    failure.warning,
  );
}

export function getLastResortSpyZeroDteSchwabAssistedPositionSizing(
  request: SpyZeroDteSchwabAssistedPositionSizingRequest,
  assembly: SpyZeroDteTradePlanAssemblyResponse,
  calculatedAtInput: number | string,
): SpyZeroDteSchwabAssistedPositionSizingResponse {
  return buildSpyZeroDteSchwabAssistedPositionSizing(
    request,
    assembly,
    null,
    calculatedAtInput,
  );
}

// Compile-time checks that SIZING_V2 reason/warning values remain
// admissible in the broker-assisted wrapper without changing SIZING_V2.
const _reasonCompatibility: SchwabAssistedPositionSizingPrimaryReasonCode =
  "POSITION_SIZE_CALCULATED" satisfies PositionSizingPrimaryReasonCode;
const _warningCompatibility: SchwabAssistedPositionSizingWarningCode =
  "ASSEMBLY_UNAVAILABLE" satisfies PositionSizingWarningCode;
const _accountWarningCompatibility: AccountRiskSnapshotWarningCode =
  "ACCOUNT_EQUITY_UNAVAILABLE";
void _reasonCompatibility;
void _warningCompatibility;
void _accountWarningCompatibility;
