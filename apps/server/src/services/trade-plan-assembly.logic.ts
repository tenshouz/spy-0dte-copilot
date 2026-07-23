import {
  SpyZeroDteTradePlanAssemblyResponseSchema,
  type AssembledTradePlanDirection,
  type ContractSelectionCandidate,
  type DeterministicTradePlanState,
  type InvalidationLevelCandidate,
  type ObjectiveLevelCandidate,
  type SpyZeroDteContractSelectionResponse,
  type SpyZeroDteDeterministicBiasResponse,
  type SpyZeroDteDeterministicMarketStateResponse,
  type SpyZeroDteDeterministicTradePlanResponse,
  type SpyZeroDteObjectiveRiskResponse,
  type SpyZeroDteTradePlanAssemblyResponse,
  type TradePlanAssemblyEngineState,
  type TradePlanAssemblyPrimaryReasonCode,
  type TradePlanAssemblyWarningCode,
} from "@spy-copilot/shared";
import { buildTradePlanExposureConfirmation } from "./trade-plan-exposure.logic";

export const ASSEMBLY_METHODOLOGY_VERSION = "ASSEMBLY_V2" as const;

const EMPTY_ENTRY_CONDITION = {
  state: "NOT_APPLICABLE" as const,
  planningReferenceType: "UNAVAILABLE" as const,
  planningReferencePrice: null,
  currentPrice: null,
  triggerLevel: null,
  comparison: null,
  triggerSatisfied: null,
  signedDistancePoints: null,
  sourceFeatureIds: [],
  sourceValues: { vwap: null, openingRangeBoundary: null },
  setupType: "UNAVAILABLE" as const,
  triggerLifecycleState: null,
  confirmationPassed: null,
  dynamicBufferPoints: null,
  bufferedTriggerLevel: null,
  latestCompletedClose: null,
  recrossCount: null,
  latestVolumeRatio: null,
  chaseDistancePoints: null,
  maximumChaseDistancePoints: null,
  rawCrossSatisfied: null,
  currentRawCrossSatisfied: null,
  confirmationCandleAt: null,
  confirmationCandleClose: null,
  confirmationExtensionPoints: null,
  maximumObservedCloseExtensionPoints: null,
  retestRequired: null,
  retestObserved: null,
  retestHeld: null,
  retestCandleAt: null,
  retestCandleClose: null,
  retestZoneLower: null,
  retestZoneUpper: null,
  barsSinceConfirmation: null,
  maximumRetestBars: null,
  postRetestChaseDistancePoints: null,
  disclosureCode: "PLANNING_REFERENCE_ONLY" as const,
};

const EMPTY_INVALIDATION = {
  candidateId: null,
  levelType: null,
  levelSemantic: null,
  level: null,
  riskDistancePoints: null,
  sourceFeatureId: null,
  sourceComponents: [],
  referenceDate: null,
  referenceDateRelation: null,
  distanceRank: null,
  disclosureCode: "STRUCTURAL_INVALIDATION_REFERENCE_ONLY" as const,
};

const EMPTY_SELECTED_CONTRACT = {
  candidateId: null,
  contractSymbol: null,
  contractDirection: null,
  description: null,
  strikePrice: null,
  expirationDate: null,
  nonStandard: null,
  mini: null,
  multiplier: null,
  moneyness: null,
  bid: null,
  ask: null,
  calculatedMidpoint: null,
  providerMark: null,
  spreadPoints: null,
  spreadRatio: null,
  spreadPercent: null,
  bidSize: null,
  askSize: null,
  openInterest: null,
  volume: null,
  delta: null,
  gamma: null,
  theta: null,
  vega: null,
  rho: null,
  impliedVolatilityPercent: null,
  quoteAt: null,
  tradeAt: null,
  quoteAgeMilliseconds: null,
  quoteFreshnessState: null,
  optionScenarioState: null,
  estimatedInvalidationExitPremium: null,
  estimatedObjectiveExitPremium: null,
  estimatedPremiumRiskPerShare: null,
  estimatedPremiumRewardPerShare: null,
  estimatedPremiumRewardRiskRatio: null,
  scenarioMinutes: null,
  strikeDistancePoints: null,
  selectionRank: null,
} as const;

const EMPTY_PREMIUM_REFERENCE = {
  type: "UNAVAILABLE" as const,
  value: null,
  disclosureCode: "MIDPOINT_REFERENCE_ONLY" as const,
};

const DISCLOSURES = {
  planningReference: "PLANNING_REFERENCE_ONLY" as const,
  structuralInvalidation: "STRUCTURAL_INVALIDATION_REFERENCE_ONLY" as const,
  underlyingObjective: "UNDERLYING_OBJECTIVE_REFERENCE_ONLY" as const,
  premiumReference: "MIDPOINT_REFERENCE_ONLY" as const,
  confidence: "EXECUTION_QUALITY_ALIGNMENT_EXPOSURE_CONTEXT_ONLY" as const,
  noOrderExecution: true as const,
  noPositionSizing: true as const,
  noGuaranteedFill: true as const,
  noPremiumTarget: true as const,
  noPremiumStop: true as const,
  premiumScenarioEstimateOnly: true as const,
};

const METHODOLOGY = {
  sourceProducts: [
    "SPY_ZERO_DTE_DETERMINISTIC_MARKET_STATE",
    "SPY_ZERO_DTE_DETERMINISTIC_BIAS_CONFIDENCE",
    "SPY_ZERO_DTE_DETERMINISTIC_CONDITIONAL_TRADE_PLAN",
    "SPY_ZERO_DTE_DETERMINISTIC_OBJECTIVE_RISK_FRAMEWORK",
    "SPY_ZERO_DTE_DETERMINISTIC_CONTRACT_SELECTION_LIQUIDITY",
  ] as const,
  sourceMethodologies: ["V1", "BIAS_V1", "TRADE_PLAN_V3", "RISK_V2", "CONTRACT_V2"] as const,
  calculationUnit: "SPY_UNDERLYING_PRICE_POINTS" as const,
  assemblyOnly: true as const,
  contractCandidateDetailsRoute: "/api/trade-contract/spy" as const,
};

interface ResolutionFailure {
  reason: TradePlanAssemblyPrimaryReasonCode;
  warning: TradePlanAssemblyWarningCode;
}

interface ResolvedCandidates {
  invalidation: InvalidationLevelCandidate | null;
  objective: ObjectiveLevelCandidate | null;
  contract: ContractSelectionCandidate | null;
  failure: ResolutionFailure | null;
}

function uniqueById<T extends { candidateId: string }>(
  rows: T[],
  candidateId: string,
): { value: T | null; count: number } {
  const matches = rows.filter((row) => row.candidateId === candidateId);
  return { value: matches.length === 1 ? matches[0] ?? null : null, count: matches.length };
}

function resolveSelectedCandidates(
  risk: SpyZeroDteObjectiveRiskResponse,
  contract: SpyZeroDteContractSelectionResponse,
): ResolvedCandidates {
  let invalidation: InvalidationLevelCandidate | null = null;
  let objective: ObjectiveLevelCandidate | null = null;
  let selectedContract: ContractSelectionCandidate | null = null;

  if (risk.selectedInvalidation.candidateId !== null) {
    const match = uniqueById(risk.invalidationCandidates, risk.selectedInvalidation.candidateId);
    if (match.count === 0) {
      return {
        invalidation: null,
        objective: null,
        contract: null,
        failure: {
          reason: "SOURCE_SELECTED_INVALIDATION_MISSING",
          warning: "SOURCE_SELECTED_VALUE_MISSING",
        },
      };
    }
    if (match.count > 1) {
      return {
        invalidation: null,
        objective: null,
        contract: null,
        failure: {
          reason: "SOURCE_SELECTED_INVALIDATION_DUPLICATED",
          warning: "SOURCE_SELECTED_VALUE_DUPLICATED",
        },
      };
    }
    invalidation = match.value;
  }

  if (risk.selectedObjective.candidateId !== null) {
    const match = uniqueById(risk.objectiveCandidates, risk.selectedObjective.candidateId);
    if (match.count === 0) {
      return {
        invalidation,
        objective: null,
        contract: null,
        failure: {
          reason: "SOURCE_SELECTED_OBJECTIVE_MISSING",
          warning: "SOURCE_SELECTED_VALUE_MISSING",
        },
      };
    }
    if (match.count > 1) {
      return {
        invalidation,
        objective: null,
        contract: null,
        failure: {
          reason: "SOURCE_SELECTED_OBJECTIVE_DUPLICATED",
          warning: "SOURCE_SELECTED_VALUE_DUPLICATED",
        },
      };
    }
    objective = match.value;
  }

  if (contract.selectedContract.candidateId !== null) {
    const match = uniqueById(contract.candidates, contract.selectedContract.candidateId);
    if (match.count === 0) {
      return {
        invalidation,
        objective,
        contract: null,
        failure: {
          reason: "SOURCE_SELECTED_CONTRACT_MISSING",
          warning: "SOURCE_SELECTED_VALUE_MISSING",
        },
      };
    }
    if (match.count > 1) {
      return {
        invalidation,
        objective,
        contract: null,
        failure: {
          reason: "SOURCE_SELECTED_CONTRACT_DUPLICATED",
          warning: "SOURCE_SELECTED_VALUE_DUPLICATED",
        },
      };
    }
    selectedContract = match.value;
  }

  return { invalidation, objective, contract: selectedContract, failure: null };
}

export function hasConsistentAssemblySourceComposition(
  marketState: SpyZeroDteDeterministicMarketStateResponse,
  bias: SpyZeroDteDeterministicBiasResponse,
  tradePlan: SpyZeroDteDeterministicTradePlanResponse,
  risk: SpyZeroDteObjectiveRiskResponse,
  contract: SpyZeroDteContractSelectionResponse,
): boolean {
  return (
    marketState.calculatedAt === bias.sourceMarketStateCalculatedAt &&
    marketState.calculatedAt === tradePlan.sourceMarketStateCalculatedAt &&
    marketState.calculatedAt === risk.sourceMarketStateCalculatedAt &&
    marketState.calculatedAt === contract.sourceMarketStateCalculatedAt &&
    bias.calculatedAt === tradePlan.sourceBiasCalculatedAt &&
    bias.calculatedAt === risk.sourceBiasCalculatedAt &&
    bias.calculatedAt === contract.sourceBiasCalculatedAt &&
    tradePlan.calculatedAt === risk.sourceTradePlanCalculatedAt &&
    tradePlan.calculatedAt === contract.sourceTradePlanCalculatedAt &&
    risk.calculatedAt === contract.sourceRiskCalculatedAt &&
    tradePlan.sameSnapshotGuaranteed &&
    risk.sameSnapshotGuaranteed &&
    contract.upstreamSameSnapshotGuaranteed
  );
}

function directionFromRisk(
  risk: SpyZeroDteObjectiveRiskResponse,
): AssembledTradePlanDirection {
  if (risk.direction === "CALLS") return "CALLS";
  if (risk.direction === "PUTS") return "PUTS";
  if (risk.direction === "NONE") return "NONE";
  return "UNAVAILABLE";
}

function directionMatchesContract(
  risk: SpyZeroDteObjectiveRiskResponse,
  contract: SpyZeroDteContractSelectionResponse,
): boolean {
  if (risk.direction === "CALLS") return contract.contractDirection === "CALL";
  if (risk.direction === "PUTS") return contract.contractDirection === "PUT";
  return false;
}

interface StateDecision {
  planState: DeterministicTradePlanState;
  reason: TradePlanAssemblyPrimaryReasonCode;
}

export function determineTradePlanAssemblyState(
  risk: SpyZeroDteObjectiveRiskResponse,
  contract: SpyZeroDteContractSelectionResponse,
): StateDecision {
  if (risk.frameworkState === "UNAVAILABLE" || risk.engineState === "UNAVAILABLE") {
    return { planState: "UNAVAILABLE", reason: "TRADE_PLAN_UNAVAILABLE" };
  }
  if (contract.selectionState === "UNAVAILABLE" || contract.engineState === "UNAVAILABLE") {
    return {
      planState: "UNAVAILABLE",
      reason:
        contract.sourceCompatibilityState === "UNAVAILABLE" ||
        contract.sourceCompatibilityState === "INCOMPATIBLE"
          ? "SOURCE_COMPATIBILITY_UNAVAILABLE"
          : "SOURCE_CONTRACT_SELECTION_INCONSISTENT",
    };
  }
  if (
    risk.frameworkState === "NOT_APPLICABLE" &&
    contract.selectionState === "NOT_APPLICABLE"
  ) {
    return { planState: "NOT_APPLICABLE", reason: "TRADE_PLAN_NOT_APPLICABLE" };
  }
  if (risk.frameworkState === "NO_SETUP" && contract.selectionState === "NOT_APPLICABLE") {
    return { planState: "NO_SETUP", reason: "TRADE_PLAN_NO_SETUP" };
  }
  if (risk.frameworkState === "PREVIEW" && contract.selectionState === "DEFERRED") {
    return { planState: "WAITING_FOR_TRIGGER", reason: "TRADE_PLAN_WAITING_FOR_TRIGGER" };
  }
  if (
    risk.frameworkState === "NOT_QUALIFIED" &&
    contract.selectionState === "NOT_APPLICABLE"
  ) {
    return { planState: "NOT_QUALIFIED", reason: "TRADE_PLAN_NOT_QUALIFIED" };
  }
  if (
    risk.frameworkState === "READY" &&
    risk.riskQualification === "QUALIFIED" &&
    contract.selectionState === "NO_QUALIFIED_CONTRACT"
  ) {
    return {
      planState: "NO_QUALIFIED_CONTRACT",
      reason: "TRADE_PLAN_NO_QUALIFIED_CONTRACT",
    };
  }
  if (
    risk.frameworkState === "READY" &&
    risk.riskQualification === "QUALIFIED" &&
    contract.selectionState === "SELECTED"
  ) {
    return { planState: "READY", reason: "TRADE_PLAN_READY" };
  }
  return {
    planState: "UNAVAILABLE",
    reason: "SOURCE_STATE_COMBINATION_UNRECOGNIZED",
  };
}

function determineEngineState(
  planState: DeterministicTradePlanState,
  risk: SpyZeroDteObjectiveRiskResponse,
  contract: SpyZeroDteContractSelectionResponse,
): TradePlanAssemblyEngineState {
  if (planState === "UNAVAILABLE") return "UNAVAILABLE";
  if (risk.engineState === "PARTIAL") return "PARTIAL";
  if (
    ["READY", "NO_QUALIFIED_CONTRACT"].includes(planState) &&
    contract.engineState === "PARTIAL"
  ) {
    return "PARTIAL";
  }
  return "AVAILABLE";
}

function determineWarning(
  engineState: TradePlanAssemblyEngineState,
  planState: DeterministicTradePlanState,
  risk: SpyZeroDteObjectiveRiskResponse,
  contract: SpyZeroDteContractSelectionResponse,
): TradePlanAssemblyWarningCode | null {
  if (engineState === "AVAILABLE") return null;
  if (engineState === "PARTIAL") {
    if (contract.engineState === "PARTIAL" && planState === "NO_QUALIFIED_CONTRACT") {
      return "CONTRACT_SELECTION_PARTIAL";
    }
    return "RISK_FRAMEWORK_PARTIAL";
  }
  if (risk.engineState === "UNAVAILABLE" || risk.frameworkState === "UNAVAILABLE") {
    return "RISK_FRAMEWORK_UNAVAILABLE";
  }
  return "CONTRACT_SELECTION_UNAVAILABLE";
}

function entryCondition(
  risk: SpyZeroDteObjectiveRiskResponse,
  tradePlan: SpyZeroDteDeterministicTradePlanResponse,
  planState: DeterministicTradePlanState,
) {
  if (planState === "UNAVAILABLE") {
    return { ...EMPTY_ENTRY_CONDITION, state: "UNAVAILABLE" as const };
  }
  if (risk.planningReference.type === "CURRENT_PRICE") {
    return {
      state: "SATISFIED" as const,
      planningReferenceType: "CURRENT_PRICE" as const,
      planningReferencePrice: risk.planningReference.price,
      currentPrice: risk.currentPrice,
      triggerLevel: tradePlan.trigger.level,
      comparison: tradePlan.trigger.comparison,
      triggerSatisfied: tradePlan.trigger.satisfied,
      signedDistancePoints: tradePlan.trigger.signedDistancePoints,
      sourceFeatureIds: tradePlan.trigger.sourceFeatureIds,
      sourceValues: tradePlan.trigger.sourceValues,
      setupType: tradePlan.setupType ?? tradePlan.trigger.setupType ?? "UNAVAILABLE",
      triggerLifecycleState: tradePlan.trigger.confirmation?.lifecycleState ?? null,
      confirmationPassed: tradePlan.trigger.confirmation?.confirmationPassed ?? null,
      dynamicBufferPoints: tradePlan.trigger.confirmation?.dynamicBufferPoints ?? null,
      bufferedTriggerLevel: tradePlan.trigger.confirmation?.bufferedTriggerLevel ?? null,
      latestCompletedClose: tradePlan.trigger.confirmation?.latestCompletedClose ?? null,
      recrossCount: tradePlan.trigger.confirmation?.recrossCount ?? null,
      latestVolumeRatio: tradePlan.trigger.confirmation?.latestVolumeRatio ?? null,
      chaseDistancePoints: tradePlan.trigger.confirmation?.chaseDistancePoints ?? null,
      maximumChaseDistancePoints: tradePlan.trigger.confirmation?.maximumChaseDistancePoints ?? null,
      rawCrossSatisfied: tradePlan.trigger.confirmation?.rawCrossSatisfied ?? null,
      currentRawCrossSatisfied: tradePlan.trigger.confirmation?.currentRawCrossSatisfied ?? null,
      confirmationCandleAt: tradePlan.trigger.confirmation?.confirmationCandleAt ?? null,
      confirmationCandleClose: tradePlan.trigger.confirmation?.confirmationCandleClose ?? null,
      confirmationExtensionPoints: tradePlan.trigger.confirmation?.confirmationExtensionPoints ?? null,
      maximumObservedCloseExtensionPoints: tradePlan.trigger.confirmation?.maximumObservedCloseExtensionPoints ?? null,
      retestRequired: tradePlan.trigger.confirmation?.retestRequired ?? null,
      retestObserved: tradePlan.trigger.confirmation?.retestObserved ?? null,
      retestHeld: tradePlan.trigger.confirmation?.retestHeld ?? null,
      retestCandleAt: tradePlan.trigger.confirmation?.retestCandleAt ?? null,
      retestCandleClose: tradePlan.trigger.confirmation?.retestCandleClose ?? null,
      retestZoneLower: tradePlan.trigger.confirmation?.retestZoneLower ?? null,
      retestZoneUpper: tradePlan.trigger.confirmation?.retestZoneUpper ?? null,
      barsSinceConfirmation: tradePlan.trigger.confirmation?.barsSinceConfirmation ?? null,
      maximumRetestBars: tradePlan.trigger.confirmation?.maximumRetestBars ?? null,
      postRetestChaseDistancePoints: tradePlan.trigger.confirmation?.postRetestChaseDistancePoints ?? null,
      disclosureCode: "PLANNING_REFERENCE_ONLY" as const,
    };
  }
  if (risk.planningReference.type === "TRIGGER_LEVEL") {
    return {
      state: "WAITING" as const,
      planningReferenceType: "TRIGGER_LEVEL" as const,
      planningReferencePrice: risk.planningReference.price,
      currentPrice: risk.currentPrice,
      triggerLevel: tradePlan.trigger.level ?? risk.planningReference.triggerLevel,
      comparison: tradePlan.trigger.comparison,
      triggerSatisfied: tradePlan.trigger.satisfied,
      signedDistancePoints: tradePlan.trigger.signedDistancePoints,
      sourceFeatureIds: tradePlan.trigger.sourceFeatureIds,
      sourceValues: tradePlan.trigger.sourceValues,
      setupType: tradePlan.setupType ?? tradePlan.trigger.setupType ?? "UNAVAILABLE",
      triggerLifecycleState: tradePlan.trigger.confirmation?.lifecycleState ?? null,
      confirmationPassed: tradePlan.trigger.confirmation?.confirmationPassed ?? null,
      dynamicBufferPoints: tradePlan.trigger.confirmation?.dynamicBufferPoints ?? null,
      bufferedTriggerLevel: tradePlan.trigger.confirmation?.bufferedTriggerLevel ?? null,
      latestCompletedClose: tradePlan.trigger.confirmation?.latestCompletedClose ?? null,
      recrossCount: tradePlan.trigger.confirmation?.recrossCount ?? null,
      latestVolumeRatio: tradePlan.trigger.confirmation?.latestVolumeRatio ?? null,
      chaseDistancePoints: tradePlan.trigger.confirmation?.chaseDistancePoints ?? null,
      maximumChaseDistancePoints: tradePlan.trigger.confirmation?.maximumChaseDistancePoints ?? null,
      rawCrossSatisfied: tradePlan.trigger.confirmation?.rawCrossSatisfied ?? null,
      currentRawCrossSatisfied: tradePlan.trigger.confirmation?.currentRawCrossSatisfied ?? null,
      confirmationCandleAt: tradePlan.trigger.confirmation?.confirmationCandleAt ?? null,
      confirmationCandleClose: tradePlan.trigger.confirmation?.confirmationCandleClose ?? null,
      confirmationExtensionPoints: tradePlan.trigger.confirmation?.confirmationExtensionPoints ?? null,
      maximumObservedCloseExtensionPoints: tradePlan.trigger.confirmation?.maximumObservedCloseExtensionPoints ?? null,
      retestRequired: tradePlan.trigger.confirmation?.retestRequired ?? null,
      retestObserved: tradePlan.trigger.confirmation?.retestObserved ?? null,
      retestHeld: tradePlan.trigger.confirmation?.retestHeld ?? null,
      retestCandleAt: tradePlan.trigger.confirmation?.retestCandleAt ?? null,
      retestCandleClose: tradePlan.trigger.confirmation?.retestCandleClose ?? null,
      retestZoneLower: tradePlan.trigger.confirmation?.retestZoneLower ?? null,
      retestZoneUpper: tradePlan.trigger.confirmation?.retestZoneUpper ?? null,
      barsSinceConfirmation: tradePlan.trigger.confirmation?.barsSinceConfirmation ?? null,
      maximumRetestBars: tradePlan.trigger.confirmation?.maximumRetestBars ?? null,
      postRetestChaseDistancePoints: tradePlan.trigger.confirmation?.postRetestChaseDistancePoints ?? null,
      disclosureCode: "PLANNING_REFERENCE_ONLY" as const,
    };
  }
  return { ...EMPTY_ENTRY_CONDITION, currentPrice: risk.currentPrice };
}

function invalidationSummary(candidate: InvalidationLevelCandidate | null) {
  if (!candidate) return EMPTY_INVALIDATION;
  return {
    candidateId: candidate.candidateId,
    levelType: candidate.levelType,
    levelSemantic: candidate.levelSemantic,
    level: candidate.level,
    riskDistancePoints: candidate.riskDistancePoints,
    sourceFeatureId: candidate.sourceFeatureId,
    sourceComponents: candidate.sourceComponents,
    referenceDate: candidate.referenceDate,
    referenceDateRelation: candidate.referenceDateRelation,
    distanceRank: candidate.distanceRank,
    disclosureCode: "STRUCTURAL_INVALIDATION_REFERENCE_ONLY" as const,
  };
}

function objectiveSummary(
  candidate: ObjectiveLevelCandidate | null,
  minimumRewardRiskRatio: number,
) {
  if (!candidate) {
    return {
      candidateId: null,
      levelType: null,
      levelSemantic: null,
      level: null,
      objectiveDistancePoints: null,
      rewardRiskRatio: null,
      minimumRewardRiskRatio,
      qualificationStatus: null,
      sourceFeatureId: null,
      sourceComponents: [],
      referenceDate: null,
      referenceDateRelation: null,
      distanceRank: null,
      disclosureCode: "UNDERLYING_OBJECTIVE_REFERENCE_ONLY" as const,
    };
  }
  return {
    candidateId: candidate.candidateId,
    levelType: candidate.levelType,
    levelSemantic: candidate.levelSemantic,
    level: candidate.level,
    objectiveDistancePoints: candidate.objectiveDistancePoints,
    rewardRiskRatio: candidate.rewardRiskRatio,
    minimumRewardRiskRatio: candidate.minimumRewardRiskRatio,
    qualificationStatus: candidate.qualificationStatus,
    sourceFeatureId: candidate.sourceFeatureId,
    sourceComponents: candidate.sourceComponents,
    referenceDate: candidate.referenceDate,
    referenceDateRelation: candidate.referenceDateRelation,
    distanceRank: candidate.distanceRank,
    disclosureCode: "UNDERLYING_OBJECTIVE_REFERENCE_ONLY" as const,
  };
}

function selectedContractSummary(candidate: ContractSelectionCandidate | null) {
  if (!candidate) return EMPTY_SELECTED_CONTRACT;
  return {
    candidateId: candidate.candidateId,
    contractSymbol: candidate.contractSymbol,
    contractDirection: candidate.contractDirection,
    description: candidate.description,
    strikePrice: candidate.strikePrice,
    expirationDate: candidate.expirationDate,
    nonStandard: candidate.nonStandard,
    mini: candidate.mini,
    multiplier: candidate.multiplier,
    moneyness: candidate.moneyness,
    bid: candidate.bid,
    ask: candidate.ask,
    calculatedMidpoint: candidate.calculatedMidpoint,
    providerMark: candidate.providerMark,
    spreadPoints: candidate.spreadPoints,
    spreadRatio: candidate.spreadRatio,
    spreadPercent: candidate.spreadPercent,
    bidSize: candidate.bidSize,
    askSize: candidate.askSize,
    openInterest: candidate.openInterest,
    volume: candidate.volume,
    delta: candidate.delta,
    gamma: candidate.gamma,
    theta: candidate.theta,
    vega: candidate.vega,
    rho: candidate.rho,
    impliedVolatilityPercent: candidate.impliedVolatilityPercent,
    quoteAt: candidate.quoteAt,
    tradeAt: candidate.tradeAt,
    quoteAgeMilliseconds: candidate.quoteAgeMilliseconds,
    quoteFreshnessState: candidate.quoteFreshnessState,
    optionScenarioState: candidate.optionScenarioState ?? null,
    estimatedInvalidationExitPremium: candidate.estimatedInvalidationExitPremium ?? null,
    estimatedObjectiveExitPremium: candidate.estimatedObjectiveExitPremium ?? null,
    estimatedPremiumRiskPerShare: candidate.estimatedPremiumRiskPerShare ?? null,
    estimatedPremiumRewardPerShare: candidate.estimatedPremiumRewardPerShare ?? null,
    estimatedPremiumRewardRiskRatio: candidate.estimatedPremiumRewardRiskRatio ?? null,
    scenarioMinutes: candidate.scenarioMinutes ?? null,
    strikeDistancePoints: candidate.strikeDistancePoints,
    selectionRank: candidate.selectionRank,
  };
}

function sourceSummary(
  marketState: SpyZeroDteDeterministicMarketStateResponse,
  bias: SpyZeroDteDeterministicBiasResponse,
  tradePlan: SpyZeroDteDeterministicTradePlanResponse,
  risk: SpyZeroDteObjectiveRiskResponse,
  contract: SpyZeroDteContractSelectionResponse,
  upstreamSameSnapshotGuaranteed: boolean,
  selectedContract: ContractSelectionCandidate | null,
) {
  return {
    upstreamSameSnapshotGuaranteed,
    marketState: {
      product: marketState.product,
      version: marketState.engineVersion,
      calculatedAt: marketState.calculatedAt,
      engineState: marketState.engineState,
      warningCode: marketState.warningCode,
      snapshotIntegrityState: marketState.snapshotIntegrity?.state ?? null,
      marketStructureSkewMilliseconds:
        marketState.snapshotIntegrity?.marketStructureSkewMilliseconds ?? null,
    },
    bias: {
      product: bias.product,
      version: bias.methodologyVersion,
      calculatedAt: bias.calculatedAt,
      engineState: bias.engineState,
      biasState: bias.biasState,
      warningCode: bias.warningCode,
    },
    tradePlan: {
      product: tradePlan.product,
      version: tradePlan.methodologyVersion,
      calculatedAt: tradePlan.calculatedAt,
      engineState: tradePlan.engineState,
      setupState: tradePlan.setupState,
      setupDirection: tradePlan.setupDirection,
      primaryReasonCode: tradePlan.primaryReasonCode,
      warningCode: tradePlan.warningCode,
    },
    risk: {
      product: risk.product,
      version: risk.methodologyVersion,
      calculatedAt: risk.calculatedAt,
      engineState: risk.engineState,
      frameworkState: risk.frameworkState,
      riskQualification: risk.riskQualification,
      direction: risk.direction,
      primaryReasonCode: risk.primaryReasonCode,
      warningCode: risk.warningCode,
    },
    contract: {
      product: contract.product,
      version: contract.methodologyVersion,
      calculatedAt: contract.calculatedAt,
      engineState: contract.engineState,
      selectionState: contract.selectionState,
      contractDirection: contract.contractDirection,
      sourceCompatibilityState: contract.sourceCompatibilityState,
      sourceOptionsChainFetchedAt: contract.sourceOptionsChainFetchedAt,
      sourceOptionsChainMetricState: contract.sourceOptionsChainMetricState,
      sourceOptionsChainSourceState: contract.sourceOptionsChainSourceState,
      sourceOptionsChainWarningCode: contract.sourceOptionsChainWarningCode,
      sourceOptionsChainIsDelayed: contract.sourceOptionsChainIsDelayed,
      primaryReasonCode: contract.primaryReasonCode,
      warningCode: contract.warningCode,
    },
    selectedContractQuoteAt: selectedContract?.quoteAt ?? null,
  };
}

function biasSummary(bias: SpyZeroDteDeterministicBiasResponse) {
  return {
    biasState: bias.biasState,
    confidenceScore: bias.confidenceScore,
    confidenceUnit: bias.confidenceUnit,
    confidenceScope: bias.confidenceScope,
    sourceQualityState: bias.sourceQualityState,
    minimumUsableDirectionalEvidenceCount: bias.minimumUsableDirectionalEvidenceCount,
    usableDirectionalEvidenceCount: bias.usableDirectionalEvidenceCount,
    applicableDirectionalEvidenceCount: bias.applicableDirectionalEvidenceCount,
    bullishEvidenceCount: bias.bullishEvidenceCount,
    bearishEvidenceCount: bias.bearishEvidenceCount,
    neutralEvidenceCount: bias.neutralEvidenceCount,
    unavailableDirectionalEvidenceCount: bias.unavailableDirectionalEvidenceCount,
    notApplicableDirectionalEvidenceCount: bias.notApplicableDirectionalEvidenceCount,
  };
}

function riskRewardSummary(
  risk: SpyZeroDteObjectiveRiskResponse,
  invalidation: InvalidationLevelCandidate | null,
  objective: ObjectiveLevelCandidate | null,
) {
  return {
    riskDistancePoints: invalidation?.riskDistancePoints ?? null,
    rewardDistancePoints: objective?.objectiveDistancePoints ?? null,
    rewardRiskRatio: objective?.rewardRiskRatio ?? null,
    minimumRequiredRewardRiskRatio: risk.minimumRewardRiskRatio,
    qualification: risk.riskQualification,
    calculationUnit: "SPY_UNDERLYING_PRICE_POINTS" as const,
  };
}

function optionRiskRewardSummary(
  candidate: ContractSelectionCandidate | null,
) {
  return {
    state: candidate?.optionScenarioState ?? "UNAVAILABLE",
    estimatedInvalidationExitPremium: candidate?.estimatedInvalidationExitPremium ?? null,
    estimatedObjectiveExitPremium: candidate?.estimatedObjectiveExitPremium ?? null,
    estimatedPremiumRiskPerShare: candidate?.estimatedPremiumRiskPerShare ?? null,
    estimatedPremiumRewardPerShare: candidate?.estimatedPremiumRewardPerShare ?? null,
    estimatedPremiumRewardRiskRatio: candidate?.estimatedPremiumRewardRiskRatio ?? null,
    minimumRequiredPremiumRewardRiskRatio:
      contractMinimumPremiumRewardRiskRatio(candidate),
    scenarioMinutes: candidate?.scenarioMinutes ?? null,
    calculationUnit: "OPTION_PREMIUM_PER_SHARE_ESTIMATE" as const,
    disclosureCode: "CONSERVATIVE_SCENARIO_ESTIMATE_NOT_GUARANTEED" as const,
  };
}

function contractMinimumPremiumRewardRiskRatio(
  _candidate: ContractSelectionCandidate | null,
): number {
  return 1.25;
}

function consistencyFailureForReady(
  risk: SpyZeroDteObjectiveRiskResponse,
  contract: SpyZeroDteContractSelectionResponse,
  resolved: ResolvedCandidates,
): ResolutionFailure | null {
  if (!directionMatchesContract(risk, contract)) {
    return { reason: "SOURCE_DIRECTION_MISMATCH", warning: "SOURCE_DIRECTION_MISMATCH" };
  }
  if (contract.sourceCompatibilityState !== "COMPATIBLE") {
    return {
      reason: "SOURCE_COMPATIBILITY_UNAVAILABLE",
      warning:
        contract.sourceCompatibilityState === "PARTIAL"
          ? "SOURCE_COMPATIBILITY_PARTIAL"
          : "CONTRACT_SELECTION_UNAVAILABLE",
    };
  }
  if (!resolved.invalidation?.selectable || resolved.invalidation.riskDistancePoints === null) {
    return {
      reason: "SOURCE_RISK_SELECTION_INCONSISTENT",
      warning: "SOURCE_SELECTED_VALUE_INCONSISTENT",
    };
  }
  if (
    resolved.objective?.qualificationStatus !== "QUALIFIED" ||
    resolved.objective.rewardRiskRatio === null ||
    resolved.objective.rewardRiskRatio < risk.minimumRewardRiskRatio
  ) {
    return {
      reason: "SOURCE_RISK_SELECTION_INCONSISTENT",
      warning: "SOURCE_SELECTED_VALUE_INCONSISTENT",
    };
  }
  if (!resolved.contract?.selectable) {
    return {
      reason: "SOURCE_CONTRACT_SELECTION_INCONSISTENT",
      warning: "SOURCE_SELECTED_VALUE_INCONSISTENT",
    };
  }
  if (resolved.contract.selectionRank !== 1) {
    return {
      reason: "SOURCE_SELECTED_CONTRACT_NOT_RANK_ONE",
      warning: "SOURCE_SELECTED_VALUE_INCONSISTENT",
    };
  }
  if (
    resolved.contract.optionScenarioState !== "QUALIFIED" ||
    resolved.contract.estimatedPremiumRewardRiskRatio == null ||
    resolved.contract.estimatedPremiumRewardRiskRatio < 1.25
  ) {
    return {
      reason: "SOURCE_CONTRACT_SELECTION_INCONSISTENT",
      warning: "SOURCE_SELECTED_VALUE_INCONSISTENT",
    };
  }
  if (resolved.contract.quoteFreshnessState !== "FRESH") {
    return {
      reason: "SOURCE_SELECTED_CONTRACT_NOT_FRESH",
      warning: "SOURCE_SELECTED_VALUE_INCONSISTENT",
    };
  }
  if (
    contract.premiumReference.type !== "CALCULATED_BID_ASK_MIDPOINT" ||
    contract.premiumReference.value === null ||
    contract.premiumReference.value !== resolved.contract.calculatedMidpoint
  ) {
    return {
      reason: "SOURCE_CONTRACT_SELECTION_INCONSISTENT",
      warning: "SOURCE_SELECTED_VALUE_INCONSISTENT",
    };
  }
  return null;
}

export function buildSpyZeroDteTradePlanAssembly(
  marketState: SpyZeroDteDeterministicMarketStateResponse,
  bias: SpyZeroDteDeterministicBiasResponse,
  tradePlan: SpyZeroDteDeterministicTradePlanResponse,
  risk: SpyZeroDteObjectiveRiskResponse,
  contract: SpyZeroDteContractSelectionResponse,
  calculatedAtMs: number,
): SpyZeroDteTradePlanAssemblyResponse {
  const calculatedAt = new Date(calculatedAtMs).toISOString();
  const sourceCompositionValid = hasConsistentAssemblySourceComposition(
    marketState,
    bias,
    tradePlan,
    risk,
    contract,
  );
  const resolved = resolveSelectedCandidates(risk, contract);
  const initialDecision = determineTradePlanAssemblyState(risk, contract);

  let failure: ResolutionFailure | null = null;
  if (!sourceCompositionValid) {
    failure = {
      reason: "UPSTREAM_SAME_SNAPSHOT_UNAVAILABLE",
      warning: "UPSTREAM_SNAPSHOT_MISMATCH",
    };
  } else if (resolved.failure) {
    failure = resolved.failure;
  } else if (initialDecision.planState === "READY") {
    failure = consistencyFailureForReady(risk, contract, resolved);
  } else if (
    ["WAITING_FOR_TRIGGER", "NO_QUALIFIED_CONTRACT"].includes(initialDecision.planState) &&
    (!resolved.invalidation || !resolved.objective)
  ) {
    failure = {
      reason: "SOURCE_RISK_SELECTION_INCONSISTENT",
      warning: "SOURCE_SELECTED_VALUE_MISSING",
    };
  }

  const planState: DeterministicTradePlanState = failure
    ? "UNAVAILABLE"
    : initialDecision.planState;
  const primaryReasonCode = failure?.reason ?? initialDecision.reason;
  const engineState = failure
    ? "UNAVAILABLE"
    : determineEngineState(planState, risk, contract);
  const warningCode =
    failure?.warning ?? determineWarning(engineState, planState, risk, contract);
  const selectedCandidate = planState === "READY" ? resolved.contract : null;
  const upstreamSameSnapshotGuaranteed = sourceCompositionValid;
  const exposureDirection =
    bias.biasState === "BULLISH"
      ? ("CALLS" as const)
      : bias.biasState === "BEARISH"
        ? ("PUTS" as const)
        : ("NONE" as const);
  const exposureConfirmation =
    tradePlan.exposureConfirmation ??
    buildTradePlanExposureConfirmation(
      marketState,
      exposureDirection,
      bias.confidenceScore,
    );

  const result = {
    symbol: "SPY" as const,
    product: "SPY_ZERO_DTE_DETERMINISTIC_TRADE_PLAN_ASSEMBLY" as const,
    methodologyVersion: ASSEMBLY_METHODOLOGY_VERSION,
    currentMarketDate: risk.currentMarketDate,
    mostRecentRthSessionDate: risk.mostRecentRthSessionDate,
    calculatedAt,
    engineState,
    planState,
    direction:
      planState === "UNAVAILABLE" ? ("UNAVAILABLE" as const) : directionFromRisk(risk),
    primaryReasonCode,
    warningCode,
    currentPrice: risk.currentPrice,
    priceSource: risk.priceSource,
    quoteTimestamp: risk.quoteTimestamp,
    sessionPhase: tradePlan.sessionPhase,
    bias: biasSummary(bias),
    planConfidence: {
      methodologyVersion: exposureConfirmation.methodologyVersion,
      structuralConfidenceScore: bias.confidenceScore,
      executionQualityAlignmentScore:
        tradePlan.tradeQuality?.finalAlignmentScore ?? exposureConfirmation.adjustedConfidenceScore,
      exposureAdjustmentPoints: exposureConfirmation.adjustmentPoints,
      adjustedConfidenceScore:
        tradePlan.tradeQuality?.finalAlignmentScore ?? exposureConfirmation.adjustedConfidenceScore,
      scope: tradePlan.tradeQuality
        ? ("EXECUTION_QUALITY_ALIGNMENT_EXPOSURE_CONTEXT_ONLY" as const)
        : ("STRUCTURAL_PLUS_SOFT_EXPOSURE_CONFIRMATION" as const),
    },
    exposureConfirmation,
    gammaResearchContext: marketState.exposureStructure ?? null,
    entryCondition: entryCondition(risk, tradePlan, planState),
    structuralInvalidation:
      planState === "UNAVAILABLE" ? EMPTY_INVALIDATION : invalidationSummary(resolved.invalidation),
    primaryObjective:
      planState === "UNAVAILABLE"
        ? objectiveSummary(null, risk.minimumRewardRiskRatio)
        : objectiveSummary(resolved.objective, risk.minimumRewardRiskRatio),
    underlyingRiskReward:
      planState === "UNAVAILABLE"
        ? riskRewardSummary(risk, null, null)
        : riskRewardSummary(risk, resolved.invalidation, resolved.objective),
    optionRiskReward: optionRiskRewardSummary(selectedCandidate),
    selectedContract: selectedContractSummary(selectedCandidate),
    premiumReference:
      planState === "READY" ? contract.premiumReference : EMPTY_PREMIUM_REFERENCE,
    sourceSummary: sourceSummary(
      marketState,
      bias,
      tradePlan,
      risk,
      contract,
      upstreamSameSnapshotGuaranteed,
      selectedCandidate,
    ),
    disclosures: DISCLOSURES,
    methodology: METHODOLOGY,
  };

  return SpyZeroDteTradePlanAssemblyResponseSchema.parse(result);
}
