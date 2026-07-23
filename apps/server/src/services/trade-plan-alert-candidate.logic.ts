import {
  SpyZeroDteTradePlanAlertCandidateResponseSchema,
  type SpyZeroDteTradePlanAlertCandidateResponse,
  type AssembledTradePlanDirection,
  type SpyZeroDteTradePlanAssemblyResponse,
  type TradePlanAlertCandidate,
  type TradePlanAlertCandidatePrimaryReasonCode,
} from "@spy-copilot/shared";

export const TRADE_PLAN_ALERT_CANDIDATE_METHODOLOGY_VERSION =
  "TRADE_PLAN_ALERT_CANDIDATE_V2" as const;

const DISCLOSURES = {
  currentSnapshotOnly: true as const,
  candidateOnly: true as const,
  noTransitionDetection: true as const,
  noDeduplicationState: true as const,
  noPersistence: true as const,
  noNotificationDelivery: true as const,
  noPrivateAccountData: true as const,
  noOrderExecution: true as const,
};

const METHODOLOGY = {
  sourceProduct: "SPY_ZERO_DTE_DETERMINISTIC_TRADE_PLAN_ASSEMBLY" as const,
  sourceMethodology: "ASSEMBLY_V2" as const,
  evaluationScope: "CURRENT_ASSEMBLY_SNAPSHOT" as const,
  candidateStates: [
    "READY",
    "WAITING_FOR_TRIGGER",
    "NO_QUALIFIED_CONTRACT",
    "NOT_QUALIFIED",
  ] as const,
  suppressedStates: ["NO_SETUP", "NOT_APPLICABLE"] as const,
  unavailableState: "UNAVAILABLE" as const,
  transitionDetectionMethod: "NONE" as const,
  deliveryMethod: "NONE" as const,
  deduplicationMethod: "STABLE_CANDIDATE_KEY_ONLY" as const,
};

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
  };
}

function semanticLifecycleKey(
  assembly: SpyZeroDteTradePlanAssemblyResponse,
  category: TradePlanAlertCandidate["category"],
): string {
  if (category === "PLAN_READY") return "READY";
  if (category === "NO_QUALIFIED_CONTRACT") return "NO_CONTRACT";
  if (category === "SETUP_NOT_QUALIFIED") return "RISK_NOT_QUALIFIED";

  const lifecycle = assembly.entryCondition.triggerLifecycleState ?? "ARMED";
  return lifecycle === "NOT_APPLICABLE" || lifecycle === "UNAVAILABLE"
    ? "ARMED"
    : lifecycle;
}

/**
 * This key intentionally excludes live floating values such as VWAP, trigger
 * price, confidence, exposure state, contract quote, invalidation, and target.
 * Those values refresh the dashboard payload but do not create a new Discord
 * alert identity. Only a meaningful setup/lifecycle transition changes the key.
 */
function stableCandidateKey(
  assembly: SpyZeroDteTradePlanAssemblyResponse,
  category: TradePlanAlertCandidate["category"],
): string {
  const setupType = assembly.entryCondition.setupType ?? "UNAVAILABLE";
  return [
    "SPY",
    assembly.currentMarketDate,
    assembly.direction,
    setupType,
    category,
    semanticLifecycleKey(assembly, category),
  ].join("|");
}


function isDirectionalDirection(
  direction: AssembledTradePlanDirection,
): direction is "CALLS" | "PUTS" {
  return direction === "CALLS" || direction === "PUTS";
}

function formatPrice(value: number | null): string {
  return value === null ? "unavailable" : `$${value.toFixed(2)}`;
}


function confidenceContext(
  assembly: SpyZeroDteTradePlanAssemblyResponse,
): string {
  const exposure = assembly.exposureConfirmation;
  const planConfidence = assembly.planConfidence?.adjustedConfidenceScore ?? null;
  if (exposure === undefined || planConfidence === null) {
    return "Exposure confirmation is unavailable; structural confidence remains unchanged.";
  }
  return `Exposure confirmation: ${exposure.state.toLowerCase()}; adjusted plan confidence: ${planConfidence.toFixed(0)}%.`;
}

function buildReadyCandidate(
  assembly: SpyZeroDteTradePlanAssemblyResponse,
): TradePlanAlertCandidate | null {
  const contractSymbol = assembly.selectedContract.contractSymbol;
  const contractAsk = assembly.selectedContract.ask;
  const contractQuoteAt = assembly.selectedContract.quoteAt;
  const invalidation = assembly.structuralInvalidation.level;
  const objective = assembly.primaryObjective.level;
  const rewardRiskRatio = assembly.underlyingRiskReward.rewardRiskRatio;

  if (
    !isDirectionalDirection(assembly.direction) ||
    contractSymbol === null ||
    contractAsk === null ||
    contractQuoteAt === null ||
    invalidation === null ||
    objective === null ||
    rewardRiskRatio === null
  ) {
    return null;
  }

  return {
    deduplicationKey: stableCandidateKey(assembly, "PLAN_READY"),
    category: "PLAN_READY",
    severity: "OPPORTUNITY",
    title: `Qualified ${assembly.direction} plan ready for review`,
    message: `The deterministic ${assembly.direction} structure completed its trigger-confirmation policy and is qualified with ${contractSymbol} selected. Current ask reference: ${formatPrice(contractAsk)}. Estimated option reward/risk: ${assembly.optionRiskReward?.estimatedPremiumRewardRiskRatio?.toFixed(2) ?? "unavailable"}. ${confidenceContext(assembly)} Revalidate all live values before any independently entered order.`,
    direction: assembly.direction,
    currentPrice: assembly.entryCondition.currentPrice,
    planningReferenceType: assembly.entryCondition.planningReferenceType,
    planningReferencePrice: assembly.entryCondition.planningReferencePrice,
    triggerLevel: assembly.entryCondition.triggerLevel,
    triggerComparison: assembly.entryCondition.comparison,
    selectedContractSymbol: contractSymbol,
    selectedContractAsk: contractAsk,
    selectedContractQuoteAt: contractQuoteAt,
    structuralInvalidationLevel: invalidation,
    primaryObjectiveLevel: objective,
    rewardRiskRatio,
  };
}

function buildWaitingCandidate(
  assembly: SpyZeroDteTradePlanAssemblyResponse,
): TradePlanAlertCandidate | null {
  if (
    !isDirectionalDirection(assembly.direction) ||
    assembly.entryCondition.planningReferencePrice === null ||
    assembly.entryCondition.triggerLevel === null ||
    assembly.entryCondition.comparison === null
  ) {
    return null;
  }

  return {
    deduplicationKey: stableCandidateKey(assembly, "WAITING_FOR_TRIGGER"),
    category: "WAITING_FOR_TRIGGER",
    severity: "INFO",
    title: `${assembly.direction} setup waiting for its trigger`,
    message: `The deterministic ${assembly.direction} setup remains conditional at the ${formatPrice(assembly.entryCondition.triggerLevel)} SPY trigger reference. Lifecycle: ${(assembly.entryCondition.triggerLifecycleState ?? "ARMED").toLowerCase()}. The contract engine may preflight liquidity, but no contract is selected until trigger confirmation passes. ${confidenceContext(assembly)}`,
    direction: assembly.direction,
    currentPrice: assembly.entryCondition.currentPrice,
    planningReferenceType: assembly.entryCondition.planningReferenceType,
    planningReferencePrice: assembly.entryCondition.planningReferencePrice,
    triggerLevel: assembly.entryCondition.triggerLevel,
    triggerComparison: assembly.entryCondition.comparison,
    selectedContractSymbol: null,
    selectedContractAsk: null,
    selectedContractQuoteAt: null,
    structuralInvalidationLevel: assembly.structuralInvalidation.level,
    primaryObjectiveLevel: assembly.primaryObjective.level,
    rewardRiskRatio: assembly.underlyingRiskReward.rewardRiskRatio,
  };
}

function buildNoContractCandidate(
  assembly: SpyZeroDteTradePlanAssemblyResponse,
): TradePlanAlertCandidate | null {
  if (!isDirectionalDirection(assembly.direction)) return null;

  return {
    deduplicationKey: stableCandidateKey(assembly, "NO_QUALIFIED_CONTRACT"),
    category: "NO_QUALIFIED_CONTRACT",
    severity: "WARNING",
    title: `Qualified ${assembly.direction} structure has no eligible contract`,
    message: `The underlying ${assembly.direction} structure passed deterministic risk qualification, but CONTRACT_V2 did not select a fresh, liquid, delta-qualified contract with acceptable estimated option reward/risk. ${confidenceContext(assembly)} No sizing or order action applies.`,
    direction: assembly.direction,
    currentPrice: assembly.entryCondition.currentPrice,
    planningReferenceType: assembly.entryCondition.planningReferenceType,
    planningReferencePrice: assembly.entryCondition.planningReferencePrice,
    triggerLevel: assembly.entryCondition.triggerLevel,
    triggerComparison: assembly.entryCondition.comparison,
    selectedContractSymbol: null,
    selectedContractAsk: null,
    selectedContractQuoteAt: null,
    structuralInvalidationLevel: assembly.structuralInvalidation.level,
    primaryObjectiveLevel: assembly.primaryObjective.level,
    rewardRiskRatio: assembly.underlyingRiskReward.rewardRiskRatio,
  };
}

function buildNotQualifiedCandidate(
  assembly: SpyZeroDteTradePlanAssemblyResponse,
): TradePlanAlertCandidate | null {
  if (!isDirectionalDirection(assembly.direction)) return null;

  const ratio = assembly.underlyingRiskReward.rewardRiskRatio;
  const ratioText = ratio === null ? "unavailable" : ratio.toFixed(2);
  return {
    deduplicationKey: stableCandidateKey(assembly, "SETUP_NOT_QUALIFIED"),
    category: "SETUP_NOT_QUALIFIED",
    severity: "WARNING",
    title: `${assembly.direction} setup did not pass risk qualification`,
    message: `The deterministic ${assembly.direction} setup did not meet the objective/risk requirement. Underlying reward-to-risk reference: ${ratioText}. ${confidenceContext(assembly)} No contract or sizing action applies.`,
    direction: assembly.direction,
    currentPrice: assembly.entryCondition.currentPrice,
    planningReferenceType: assembly.entryCondition.planningReferenceType,
    planningReferencePrice: assembly.entryCondition.planningReferencePrice,
    triggerLevel: assembly.entryCondition.triggerLevel,
    triggerComparison: assembly.entryCondition.comparison,
    selectedContractSymbol: null,
    selectedContractAsk: null,
    selectedContractQuoteAt: null,
    structuralInvalidationLevel: assembly.structuralInvalidation.level,
    primaryObjectiveLevel: assembly.primaryObjective.level,
    rewardRiskRatio: ratio,
  };
}

function unavailableResponse(
  assembly: SpyZeroDteTradePlanAssemblyResponse,
  calculatedAt: string,
  reason: Extract<
    TradePlanAlertCandidatePrimaryReasonCode,
    "SOURCE_ASSEMBLY_UNAVAILABLE" | "SOURCE_ASSEMBLY_INCONSISTENT"
  >,
): SpyZeroDteTradePlanAlertCandidateResponse {
  return SpyZeroDteTradePlanAlertCandidateResponseSchema.parse({
    symbol: "SPY",
    product: "SPY_ZERO_DTE_DETERMINISTIC_TRADE_PLAN_ALERT_CANDIDATE",
    methodologyVersion: TRADE_PLAN_ALERT_CANDIDATE_METHODOLOGY_VERSION,
    currentMarketDate: assembly.currentMarketDate,
    calculatedAt,
    engineState: "UNAVAILABLE",
    alertState: "UNAVAILABLE",
    primaryReasonCode: reason,
    warningCode:
      reason === "SOURCE_ASSEMBLY_INCONSISTENT"
        ? "ASSEMBLY_VALIDATION_FAILED"
        : assembly.warningCode,
    sourceAssembly: {
      ...sourceAssemblySummary(assembly),
      warningCode:
        reason === "SOURCE_ASSEMBLY_INCONSISTENT"
          ? "ASSEMBLY_VALIDATION_FAILED"
          : assembly.warningCode,
    },
    candidate: null,
    disclosures: DISCLOSURES,
    methodology: METHODOLOGY,
  });
}

export function buildSpyZeroDteTradePlanAlertCandidate(
  assembly: SpyZeroDteTradePlanAssemblyResponse,
  calculatedAtMs: number,
): SpyZeroDteTradePlanAlertCandidateResponse {
  const calculatedAt = new Date(calculatedAtMs).toISOString();

  if (assembly.engineState === "UNAVAILABLE" || assembly.planState === "UNAVAILABLE") {
    return unavailableResponse(assembly, calculatedAt, "SOURCE_ASSEMBLY_UNAVAILABLE");
  }

  let candidate: TradePlanAlertCandidate | null = null;
  let primaryReasonCode: TradePlanAlertCandidatePrimaryReasonCode;

  switch (assembly.planState) {
    case "READY":
      candidate = buildReadyCandidate(assembly);
      primaryReasonCode = "PLAN_READY_CANDIDATE";
      break;
    case "WAITING_FOR_TRIGGER":
      candidate = buildWaitingCandidate(assembly);
      primaryReasonCode = "WAITING_FOR_TRIGGER_CANDIDATE";
      break;
    case "NO_QUALIFIED_CONTRACT":
      candidate = buildNoContractCandidate(assembly);
      primaryReasonCode = "NO_QUALIFIED_CONTRACT_CANDIDATE";
      break;
    case "NOT_QUALIFIED":
      candidate = buildNotQualifiedCandidate(assembly);
      primaryReasonCode = "NOT_QUALIFIED_CANDIDATE";
      break;
    case "NO_SETUP":
      primaryReasonCode = "NO_SETUP_SUPPRESSED";
      break;
    case "NOT_APPLICABLE":
      primaryReasonCode = "NOT_APPLICABLE_SUPPRESSED";
      break;
    default:
      return unavailableResponse(assembly, calculatedAt, "SOURCE_ASSEMBLY_INCONSISTENT");
  }

  if (
    [
      "READY",
      "WAITING_FOR_TRIGGER",
      "NO_QUALIFIED_CONTRACT",
      "NOT_QUALIFIED",
    ].includes(assembly.planState) &&
    candidate === null
  ) {
    return unavailableResponse(assembly, calculatedAt, "SOURCE_ASSEMBLY_INCONSISTENT");
  }

  return SpyZeroDteTradePlanAlertCandidateResponseSchema.parse({
    symbol: "SPY",
    product: "SPY_ZERO_DTE_DETERMINISTIC_TRADE_PLAN_ALERT_CANDIDATE",
    methodologyVersion: TRADE_PLAN_ALERT_CANDIDATE_METHODOLOGY_VERSION,
    currentMarketDate: assembly.currentMarketDate,
    calculatedAt,
    engineState: assembly.engineState,
    alertState: candidate ? "CANDIDATE" : "SUPPRESSED",
    primaryReasonCode,
    warningCode: assembly.warningCode,
    sourceAssembly: sourceAssemblySummary(assembly),
    candidate,
    disclosures: DISCLOSURES,
    methodology: METHODOLOGY,
  });
}
