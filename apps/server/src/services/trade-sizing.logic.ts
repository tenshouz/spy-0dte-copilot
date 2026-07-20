import {
  SpyZeroDtePositionSizingResponseSchema,
  type CapitalBudgetControl,
  type PositionSizingBlockingControl,
  type PositionSizingPrimaryReasonCode,
  type PositionSizingWarningCode,
  type QuantityLimitingControl,
  type RiskBudgetControl,
  type SpyZeroDtePositionSizingRequest,
  type SpyZeroDtePositionSizingResponse,
  type SpyZeroDteTradePlanAssemblyResponse,
} from "@spy-copilot/shared";

export const SIZING_METHODOLOGY_VERSION = "SIZING_V1" as const;

const DISCLOSURES = {
  callerSuppliedAccountSnapshot: true as const,
  currentAskIsNotGuaranteed: true as const,
  fullPremiumLossAssumption: true as const,
  quantityIsReferenceOnly: true as const,
  noOrderExecution: true as const,
  noBrokerAccountAccess: true as const,
  noPersistence: true as const,
  noPremiumStop: true as const,
  noPremiumTarget: true as const,
};

const METHODOLOGY = {
  sizingPremiumReference: "CURRENT_ASK" as const,
  maximumLossMethod: "FULL_PREMIUM_DEBIT_REFERENCE" as const,
  effectiveRiskBudgetMethod: "MINIMUM_OF_EXPLICIT_RISK_LIMITS" as const,
  effectiveCapitalBudgetMethod:
    "MINIMUM_OF_AVAILABLE_CASH_AND_ALLOCATION_LIMIT" as const,
  quantityMethod: "FLOOR_THEN_MINIMUM_OF_ALL_CONTROLS" as const,
  multiplierRequirement: 100 as const,
  positionType: "LONG_SINGLE_LEG_OPTION_ONLY" as const,
  calculationCurrency: "USD" as const,
};

const EMPTY_SELECTED_CONTRACT = {
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
} as const;

const EMPTY_PREMIUM_REFERENCE = {
  premiumPriceReferenceType: "UNAVAILABLE" as const,
  premiumPriceReference: null,
  multiplier: null,
  premiumDebitReferencePerContractDollars: null,
  fullPremiumLossReferencePerContractDollars: null,
  disclosureCode: "CURRENT_ASK_FULL_PREMIUM_LOSS_REFERENCE_ONLY" as const,
};

const EMPTY_BUDGETS = {
  effectiveRiskBudgetDollars: null,
  limitingRiskControls: [] as RiskBudgetControl[],
  effectiveCapitalBudgetDollars: null,
  limitingCapitalControls: [] as CapitalBudgetControl[],
};

const EMPTY_POSITION_REFERENCES = {
  totalPremiumDebitReferenceDollars: null,
  totalFullPremiumLossReferenceDollars: null,
  riskPercentOfAccountEquity: null,
  capitalPercentOfAccountEquity: null,
};

export interface EffectiveRiskBudgetResult {
  effectiveRiskBudgetDollars: number;
  limitingRiskControls: RiskBudgetControl[];
}

export interface EffectiveCapitalBudgetResult {
  effectiveCapitalBudgetDollars: number;
  limitingCapitalControls: CapitalBudgetControl[];
}

export function calculateEffectiveRiskBudget(
  request: SpyZeroDtePositionSizingRequest,
): EffectiveRiskBudgetResult {
  const effectiveRiskBudgetDollars = Math.min(
    request.riskPolicy.maximumRiskPerTradeDollars,
    request.accountSnapshot.remainingDailyLossBudgetDollars,
    request.accountSnapshot.remainingPortfolioRiskBudgetDollars,
  );
  const limitingRiskControls: RiskBudgetControl[] = [];
  if (request.riskPolicy.maximumRiskPerTradeDollars === effectiveRiskBudgetDollars) {
    limitingRiskControls.push("MAXIMUM_RISK_PER_TRADE");
  }
  if (
    request.accountSnapshot.remainingDailyLossBudgetDollars ===
    effectiveRiskBudgetDollars
  ) {
    limitingRiskControls.push("REMAINING_DAILY_LOSS_BUDGET");
  }
  if (
    request.accountSnapshot.remainingPortfolioRiskBudgetDollars ===
    effectiveRiskBudgetDollars
  ) {
    limitingRiskControls.push("REMAINING_PORTFOLIO_RISK_BUDGET");
  }
  return { effectiveRiskBudgetDollars, limitingRiskControls };
}

export function calculateEffectiveCapitalBudget(
  request: SpyZeroDtePositionSizingRequest,
): EffectiveCapitalBudgetResult {
  const effectiveCapitalBudgetDollars = Math.min(
    request.accountSnapshot.availableCashDollars,
    request.riskPolicy.maximumCapitalAllocationDollars,
  );
  const limitingCapitalControls: CapitalBudgetControl[] = [];
  if (
    request.accountSnapshot.availableCashDollars === effectiveCapitalBudgetDollars
  ) {
    limitingCapitalControls.push("AVAILABLE_CASH");
  }
  if (
    request.riskPolicy.maximumCapitalAllocationDollars ===
    effectiveCapitalBudgetDollars
  ) {
    limitingCapitalControls.push("MAXIMUM_CAPITAL_ALLOCATION");
  }
  return { effectiveCapitalBudgetDollars, limitingCapitalControls };
}

export function determineBlockingControls(
  request: SpyZeroDtePositionSizingRequest,
): PositionSizingBlockingControl[] {
  const controls: PositionSizingBlockingControl[] = [];
  if (request.riskPolicy.maximumRiskPerTradeDollars === 0) {
    controls.push("MAXIMUM_RISK_PER_TRADE");
  }
  if (request.accountSnapshot.remainingDailyLossBudgetDollars === 0) {
    controls.push("REMAINING_DAILY_LOSS_BUDGET");
  }
  if (request.accountSnapshot.remainingPortfolioRiskBudgetDollars === 0) {
    controls.push("REMAINING_PORTFOLIO_RISK_BUDGET");
  }
  if (request.accountSnapshot.availableCashDollars === 0) {
    controls.push("AVAILABLE_CASH");
  }
  if (request.riskPolicy.maximumCapitalAllocationDollars === 0) {
    controls.push("MAXIMUM_CAPITAL_ALLOCATION");
  }
  if (request.riskPolicy.maximumContracts === 0) {
    controls.push("MAXIMUM_CONTRACTS");
  }
  return controls;
}

function blockedReason(
  control: PositionSizingBlockingControl,
): PositionSizingPrimaryReasonCode {
  switch (control) {
    case "MAXIMUM_RISK_PER_TRADE":
      return "BLOCKED_MAXIMUM_RISK_PER_TRADE_ZERO";
    case "REMAINING_DAILY_LOSS_BUDGET":
      return "BLOCKED_DAILY_LOSS_BUDGET_EXHAUSTED";
    case "REMAINING_PORTFOLIO_RISK_BUDGET":
      return "BLOCKED_PORTFOLIO_RISK_BUDGET_EXHAUSTED";
    case "AVAILABLE_CASH":
      return "BLOCKED_AVAILABLE_CASH_EXHAUSTED";
    case "MAXIMUM_CAPITAL_ALLOCATION":
      return "BLOCKED_MAXIMUM_CAPITAL_ALLOCATION_ZERO";
    case "MAXIMUM_CONTRACTS":
      return "BLOCKED_MAXIMUM_CONTRACTS_ZERO";
  }
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
      contract.multiplier !== null && Number.isFinite(contract.multiplier) && contract.multiplier > 0
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
  };
}

function baseResponse(
  request: SpyZeroDtePositionSizingRequest,
  assembly: SpyZeroDteTradePlanAssemblyResponse,
  calculatedAt: string,
) {
  return {
    symbol: "SPY" as const,
    product:
      "SPY_ZERO_DTE_DETERMINISTIC_POSITION_SIZING_ACCOUNT_RISK" as const,
    methodologyVersion: SIZING_METHODOLOGY_VERSION,
    currentMarketDate: assembly.currentMarketDate,
    calculatedAt,
    sourceAssembly: sourceAssemblySummary(assembly),
    accountSnapshot: {
      ...request.accountSnapshot,
      disclosureCode: "CALLER_SUPPLIED_ACCOUNT_SNAPSHOT" as const,
    },
    riskPolicy: { ...request.riskPolicy },
    disclosures: DISCLOSURES,
    methodology: METHODOLOGY,
  };
}

function unavailableResponse(
  request: SpyZeroDtePositionSizingRequest,
  assembly: SpyZeroDteTradePlanAssemblyResponse,
  calculatedAt: string,
  reason: PositionSizingPrimaryReasonCode,
  warning: PositionSizingWarningCode,
): SpyZeroDtePositionSizingResponse {
  return SpyZeroDtePositionSizingResponseSchema.parse({
    ...baseResponse(request, assembly, calculatedAt),
    engineState: "UNAVAILABLE",
    sizingState: "UNAVAILABLE",
    primaryReasonCode: reason,
    warningCode: warning,
    selectedContract: sanitizedSelectedContract(assembly),
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

function nonApplicableResponse(
  request: SpyZeroDtePositionSizingRequest,
  assembly: SpyZeroDteTradePlanAssemblyResponse,
  calculatedAt: string,
): SpyZeroDtePositionSizingResponse {
  const engineState = assembly.engineState === "PARTIAL" ? "PARTIAL" : "AVAILABLE";
  return SpyZeroDtePositionSizingResponseSchema.parse({
    ...baseResponse(request, assembly, calculatedAt),
    engineState,
    sizingState: "NOT_APPLICABLE",
    primaryReasonCode: "SOURCE_ASSEMBLY_NOT_READY",
    warningCode: engineState === "PARTIAL" ? "ASSEMBLY_PARTIAL" : null,
    selectedContract: EMPTY_SELECTED_CONTRACT,
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

/**
 * Pure SIZING_V1 calculator. It uses only one validated supported Assembly response
 * and the explicit caller-supplied policy snapshot. No provider, route,
 * database, persistence, midpoint, bid, mark, or option-pricing model is used.
 */
export function buildSpyZeroDtePositionSizing(
  request: SpyZeroDtePositionSizingRequest,
  assembly: SpyZeroDteTradePlanAssemblyResponse,
  calculatedAtInput: number | string,
): SpyZeroDtePositionSizingResponse {
  const calculatedAt =
    typeof calculatedAtInput === "number"
      ? new Date(calculatedAtInput).toISOString()
      : calculatedAtInput;

  if (assembly.engineState === "UNAVAILABLE" || assembly.planState === "UNAVAILABLE") {
    return unavailableResponse(
      request,
      assembly,
      calculatedAt,
      "SOURCE_ASSEMBLY_UNAVAILABLE",
      "ASSEMBLY_UNAVAILABLE",
    );
  }

  if (assembly.planState !== "READY") {
    return nonApplicableResponse(request, assembly, calculatedAt);
  }

  if (assembly.engineState !== "AVAILABLE") {
    return unavailableResponse(
      request,
      assembly,
      calculatedAt,
      "SIZING_CALCULATION_UNAVAILABLE",
      "ASSEMBLY_PARTIAL",
    );
  }

  if (
    !assembly.sourceSummary.upstreamSameSnapshotGuaranteed ||
    assembly.sourceSummary.contract.sourceCompatibilityState !== "COMPATIBLE"
  ) {
    return unavailableResponse(
      request,
      assembly,
      calculatedAt,
      "SIZING_CALCULATION_UNAVAILABLE",
      "ASSEMBLY_UNAVAILABLE",
    );
  }

  const contract = assembly.selectedContract;
  if (
    contract.candidateId === null ||
    contract.contractSymbol === null ||
    contract.contractDirection === null ||
    contract.strikePrice === null ||
    contract.expirationDate === null ||
    contract.quoteAt === null ||
    contract.selectionRank === null
  ) {
    return unavailableResponse(
      request,
      assembly,
      calculatedAt,
      "SOURCE_SELECTED_CONTRACT_MISSING",
      "SELECTED_CONTRACT_UNAVAILABLE",
    );
  }

  const directionMatches =
    (assembly.direction === "CALLS" && contract.contractDirection === "CALL") ||
    (assembly.direction === "PUTS" && contract.contractDirection === "PUT");
  if (!directionMatches) {
    return unavailableResponse(
      request,
      assembly,
      calculatedAt,
      "SOURCE_DIRECTION_MISMATCH",
      "SELECTED_CONTRACT_UNAVAILABLE",
    );
  }

  if (contract.selectionRank !== 1) {
    return unavailableResponse(
      request,
      assembly,
      calculatedAt,
      "SIZING_CALCULATION_UNAVAILABLE",
      "SELECTED_CONTRACT_UNAVAILABLE",
    );
  }

  if (
    assembly.sourceSummary.selectedContractQuoteAt !== contract.quoteAt ||
    assembly.premiumReference.disclosureCode !== "MIDPOINT_REFERENCE_ONLY"
  ) {
    return unavailableResponse(
      request,
      assembly,
      calculatedAt,
      "SIZING_CALCULATION_UNAVAILABLE",
      "SELECTED_CONTRACT_UNAVAILABLE",
    );
  }

  if (contract.quoteFreshnessState !== "FRESH") {
    return unavailableResponse(
      request,
      assembly,
      calculatedAt,
      "SOURCE_SELECTED_CONTRACT_NOT_FRESH",
      contract.quoteFreshnessState === "STALE"
        ? "SELECTED_CONTRACT_QUOTE_STALE"
        : "SELECTED_CONTRACT_UNAVAILABLE",
    );
  }

  if (contract.ask === null || !Number.isFinite(contract.ask) || contract.ask <= 0) {
    return unavailableResponse(
      request,
      assembly,
      calculatedAt,
      "SOURCE_SELECTED_CONTRACT_ASK_INVALID",
      "SELECTED_CONTRACT_ASK_UNAVAILABLE",
    );
  }

  if (contract.multiplier !== 100) {
    return unavailableResponse(
      request,
      assembly,
      calculatedAt,
      "SOURCE_SELECTED_CONTRACT_MULTIPLIER_INVALID",
      "SELECTED_CONTRACT_MULTIPLIER_INVALID",
    );
  }

  if (contract.expirationDate !== assembly.currentMarketDate) {
    return unavailableResponse(
      request,
      assembly,
      calculatedAt,
      "SOURCE_SELECTED_CONTRACT_EXPIRATION_INVALID",
      "SELECTED_CONTRACT_EXPIRATION_INVALID",
    );
  }

  const premiumDebitReferencePerContractDollars = contract.ask * contract.multiplier;
  if (
    !Number.isFinite(premiumDebitReferencePerContractDollars) ||
    premiumDebitReferencePerContractDollars <= 0
  ) {
    return unavailableResponse(
      request,
      assembly,
      calculatedAt,
      "SIZING_CALCULATION_UNAVAILABLE",
      "INVALID_SIZING_NUMERIC_DATA",
    );
  }

  const riskBudget = calculateEffectiveRiskBudget(request);
  const capitalBudget = calculateEffectiveCapitalBudget(request);
  const contractsPermittedByRisk = Math.floor(
    riskBudget.effectiveRiskBudgetDollars /
      premiumDebitReferencePerContractDollars,
  );
  const contractsPermittedByCapital = Math.floor(
    capitalBudget.effectiveCapitalBudgetDollars /
      premiumDebitReferencePerContractDollars,
  );

  if (
    !Number.isSafeInteger(contractsPermittedByRisk) ||
    contractsPermittedByRisk < 0 ||
    !Number.isSafeInteger(contractsPermittedByCapital) ||
    contractsPermittedByCapital < 0
  ) {
    return unavailableResponse(
      request,
      assembly,
      calculatedAt,
      "SIZING_CALCULATION_UNAVAILABLE",
      "INVALID_SIZING_NUMERIC_DATA",
    );
  }

  const maximumContractsUnderPolicy = Math.min(
    contractsPermittedByRisk,
    contractsPermittedByCapital,
    request.riskPolicy.maximumContracts,
  );
  const limitingQuantityControls: QuantityLimitingControl[] = [];
  if (contractsPermittedByRisk === maximumContractsUnderPolicy) {
    limitingQuantityControls.push("RISK_BUDGET");
  }
  if (contractsPermittedByCapital === maximumContractsUnderPolicy) {
    limitingQuantityControls.push("CAPITAL_BUDGET");
  }
  if (request.riskPolicy.maximumContracts === maximumContractsUnderPolicy) {
    limitingQuantityControls.push("MAXIMUM_CONTRACTS");
  }

  const blockingControls = determineBlockingControls(request);
  const sizingState =
    blockingControls.length > 0
      ? "BLOCKED"
      : maximumContractsUnderPolicy > 0
        ? "SIZED"
        : "NO_CAPACITY";
  const primaryReasonCode: PositionSizingPrimaryReasonCode =
    sizingState === "BLOCKED"
      ? blockedReason(blockingControls[0]!)
      : sizingState === "SIZED"
        ? "POSITION_SIZE_CALCULATED"
        : "NO_CAPACITY_FOR_ONE_CONTRACT";

  const totalPremiumDebitReferenceDollars =
    maximumContractsUnderPolicy * premiumDebitReferencePerContractDollars;
  const riskPercentOfAccountEquity =
    (totalPremiumDebitReferenceDollars /
      request.accountSnapshot.accountEquityDollars) *
    100;
  if (
    !Number.isFinite(totalPremiumDebitReferenceDollars) ||
    !Number.isFinite(riskPercentOfAccountEquity)
  ) {
    return unavailableResponse(
      request,
      assembly,
      calculatedAt,
      "SIZING_CALCULATION_UNAVAILABLE",
      "INVALID_SIZING_NUMERIC_DATA",
    );
  }

  return SpyZeroDtePositionSizingResponseSchema.parse({
    ...baseResponse(request, assembly, calculatedAt),
    engineState: "AVAILABLE",
    sizingState,
    primaryReasonCode,
    warningCode: null,
    selectedContract: {
      candidateId: contract.candidateId,
      contractSymbol: contract.contractSymbol,
      contractDirection: contract.contractDirection,
      strikePrice: contract.strikePrice,
      expirationDate: contract.expirationDate,
      multiplier: contract.multiplier,
      ask: contract.ask,
      quoteAt: contract.quoteAt,
      quoteAgeMilliseconds: contract.quoteAgeMilliseconds,
      quoteFreshnessState: contract.quoteFreshnessState,
      selectionRank: contract.selectionRank,
    },
    premiumRiskReference: {
      premiumPriceReferenceType: "CURRENT_ASK",
      premiumPriceReference: contract.ask,
      multiplier: contract.multiplier,
      premiumDebitReferencePerContractDollars,
      fullPremiumLossReferencePerContractDollars:
        premiumDebitReferencePerContractDollars,
      disclosureCode: "CURRENT_ASK_FULL_PREMIUM_LOSS_REFERENCE_ONLY",
    },
    budgets: {
      effectiveRiskBudgetDollars: riskBudget.effectiveRiskBudgetDollars,
      limitingRiskControls: riskBudget.limitingRiskControls,
      effectiveCapitalBudgetDollars:
        capitalBudget.effectiveCapitalBudgetDollars,
      limitingCapitalControls: capitalBudget.limitingCapitalControls,
    },
    quantityCalculation: {
      contractsPermittedByRisk,
      contractsPermittedByCapital,
      maximumContractsPolicyLimit: request.riskPolicy.maximumContracts,
      maximumContractsUnderPolicy,
      limitingQuantityControls,
      blockingControls,
      disclosureCode: "POSITION_SIZE_REFERENCE_ONLY",
    },
    positionReferences: {
      totalPremiumDebitReferenceDollars,
      totalFullPremiumLossReferenceDollars:
        totalPremiumDebitReferenceDollars,
      riskPercentOfAccountEquity,
      capitalPercentOfAccountEquity: riskPercentOfAccountEquity,
    },
    revalidation: {
      required: sizingState === "SIZED" || sizingState === "NO_CAPACITY",
      disclosureCode: "REVALIDATE_CURRENT_ASK_BEFORE_ANY_ORDER",
    },
  });
}
