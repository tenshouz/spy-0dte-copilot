import {
  SpyZeroDteObjectiveRiskResponseSchema,
  type InvalidationLevelCandidate,
  type ObjectiveLevelCandidate,
  type ObjectiveLevelType,
  type ObjectiveRiskDirection,
  type RiskCandidateRejectionReasonCode,
  type RiskCandidateSourceStatus,
  type RiskOverallWarningCode,
  type RiskPrimaryReasonCode,
  type SpyZeroDteDeterministicBiasResponse,
  type SpyZeroDteDeterministicMarketStateResponse,
  type SpyZeroDteDeterministicTradePlanResponse,
  type SpyZeroDteObjectiveRiskResponse,
} from "@spy-copilot/shared";

export const RISK_METHODOLOGY_VERSION = "RISK_V1" as const;
export const MINIMUM_REWARD_RISK_RATIO = 2;

export const OBJECTIVE_SOURCE_TYPES = [
  "PREVIOUS_DAY_HIGH",
  "PREVIOUS_DAY_LOW",
  "PREMARKET_HIGH",
  "PREMARKET_LOW",
  "EXPECTED_MOVE_UPPER",
  "EXPECTED_MOVE_LOWER",
] as const;

export const INVALIDATION_SOURCE_TYPES = [
  "CURRENT_RTH_VWAP",
  "OPENING_RANGE_HIGH",
  "OPENING_RANGE_LOW",
] as const;

export const OBJECTIVE_TIE_BREAK_ORDER = [
  "PREMARKET_HIGH",
  "PREMARKET_LOW",
  "PREVIOUS_DAY_HIGH",
  "PREVIOUS_DAY_LOW",
  "EXPECTED_MOVE_UPPER",
  "EXPECTED_MOVE_LOWER",
] as const;

export const INVALIDATION_TIE_BREAK_ORDER_CALLS = [
  "CURRENT_RTH_VWAP",
  "OPENING_RANGE_HIGH",
  "OPENING_RANGE_LOW",
] as const;

export const INVALIDATION_TIE_BREAK_ORDER_PUTS = [
  "CURRENT_RTH_VWAP",
  "OPENING_RANGE_LOW",
  "OPENING_RANGE_HIGH",
] as const;

function finite(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function finitePositive(value: unknown): value is number {
  return finite(value) && value > 0;
}

function sourceStatusFromFeature(
  featureStatus: "AVAILABLE" | "PARTIAL" | "NOT_APPLICABLE" | "UNAVAILABLE",
  nativeStates: readonly string[] = [],
): RiskCandidateSourceStatus {
  if (
    featureStatus === "UNAVAILABLE" ||
    featureStatus === "NOT_APPLICABLE" ||
    nativeStates.some((state) => state === "UNAVAILABLE" || state === "MOCK")
  ) {
    return "UNAVAILABLE";
  }
  if (
    featureStatus === "PARTIAL" ||
    nativeStates.some((state) => state === "STALE" || state === "PARTIAL" || state === "UNKNOWN")
  ) {
    return "PARTIAL";
  }
  return "AVAILABLE";
}

function emptyPlanningReference(): SpyZeroDteObjectiveRiskResponse["planningReference"] {
  return {
    type: "UNAVAILABLE",
    price: null,
    priceSource: null,
    sourceFeatureIds: [],
    sourceCalculatedAt: null,
    quoteTimestamp: null,
    triggerLevel: null,
    disclosureCode: "PLANNING_REFERENCE_ONLY",
  };
}

function emptySelectedInvalidation(): SpyZeroDteObjectiveRiskResponse["selectedInvalidation"] {
  return { candidateId: null, levelType: null, level: null, riskDistancePoints: null };
}

function emptySelectedObjective(): SpyZeroDteObjectiveRiskResponse["selectedObjective"] {
  return {
    candidateId: null,
    levelType: null,
    level: null,
    objectiveDistancePoints: null,
    rewardRiskRatio: null,
  };
}

function objectiveDistance(
  direction: "CALLS" | "PUTS",
  planningReferencePrice: number,
  level: number,
): number {
  return direction === "CALLS"
    ? level - planningReferencePrice
    : planningReferencePrice - level;
}

function riskDistance(
  direction: "CALLS" | "PUTS",
  planningReferencePrice: number,
  level: number,
): number {
  return direction === "CALLS"
    ? planningReferencePrice - level
    : level - planningReferencePrice;
}

function candidateSideRejection(
  kind: "OBJECTIVE" | "INVALIDATION",
  direction: "CALLS" | "PUTS",
  planningReferencePrice: number,
  level: number,
): RiskCandidateRejectionReasonCode | null {
  if (level === planningReferencePrice) return "LEVEL_EQUALS_PLANNING_REFERENCE";
  if (kind === "OBJECTIVE") {
    const favorable = direction === "CALLS" ? level > planningReferencePrice : level < planningReferencePrice;
    return favorable ? null : "LEVEL_NOT_ON_FAVORABLE_SIDE";
  }
  const adverse = direction === "CALLS" ? level < planningReferencePrice : level > planningReferencePrice;
  return adverse ? null : "LEVEL_NOT_ON_ADVERSE_SIDE";
}

interface ObjectiveSource {
  candidateId: ObjectiveLevelCandidate["candidateId"];
  levelType: ObjectiveLevelCandidate["levelType"];
  levelSemantic: ObjectiveLevelCandidate["levelSemantic"];
  level: number | null;
  sourceStatus: RiskCandidateSourceStatus;
  sourceFeatureId: ObjectiveLevelCandidate["sourceFeatureId"];
  sourceComponents: ObjectiveLevelCandidate["sourceComponents"];
  referenceDate: string | null;
  referenceDateRelation: ObjectiveLevelCandidate["referenceDateRelation"];
  dateCompatible: boolean;
  dateRejection: Extract<RiskCandidateRejectionReasonCode, "REFERENCE_DATE_MISMATCH" | "EXPIRATION_MISMATCH"> | null;
  warningCode: string | null;
}

interface InvalidationSource {
  candidateId: InvalidationLevelCandidate["candidateId"];
  levelType: InvalidationLevelCandidate["levelType"];
  level: number | null;
  sourceStatus: RiskCandidateSourceStatus;
  sourceFeatureId: InvalidationLevelCandidate["sourceFeatureId"];
  sourceComponents: InvalidationLevelCandidate["sourceComponents"];
  referenceDate: string | null;
  referenceDateRelation: InvalidationLevelCandidate["referenceDateRelation"];
  dateCompatible: boolean;
  warningCode: string | null;
}

function objectiveSources(
  marketState: SpyZeroDteDeterministicMarketStateResponse,
  direction: "CALLS" | "PUTS",
): ObjectiveSource[] {
  const prior = marketState.features.priceVsPriorDayRange;
  const premarket = marketState.features.priceVsPremarketRange;
  const expected = marketState.features.priceVsExpectedMoveRange;

  const priorLevel = direction === "CALLS" ? prior.inputs.previousDayHigh : prior.inputs.previousDayLow;
  const priorNativeState = direction === "CALLS"
    ? prior.inputs.previousDayHighState
    : prior.inputs.previousDayLowState;
  const priorDateCompatible =
    prior.referenceDate !== null &&
    prior.inputs.previousRthMarketDate !== null &&
    prior.referenceDate === prior.inputs.previousRthMarketDate &&
    prior.referenceDateRelation === "PREVIOUS_RTH_SESSION";

  const premarketLevel = direction === "CALLS"
    ? premarket.inputs.premarketHigh
    : premarket.inputs.premarketLow;
  const premarketNativeState = direction === "CALLS"
    ? premarket.inputs.premarketHighState
    : premarket.inputs.premarketLowState;
  const premarketDateCompatible =
    premarket.referenceDate === marketState.currentMarketDate &&
    premarket.inputs.currentMarketDate === marketState.currentMarketDate &&
    premarket.referenceDateRelation === "CURRENT_MARKET_DATE";

  const expectedLevel = direction === "CALLS"
    ? expected.inputs.upperImpliedMoveLevel
    : expected.inputs.lowerImpliedMoveLevel;
  const expectedDateCompatible =
    expected.referenceDate === marketState.currentMarketDate &&
    expected.inputs.expirationDate === marketState.currentMarketDate &&
    expected.inputs.currentMarketDate === marketState.currentMarketDate &&
    expected.referenceDateRelation === "CURRENT_EXPIRATION";

  return [
    {
      candidateId: direction === "CALLS" ? "OBJECTIVE_PREVIOUS_DAY_HIGH" : "OBJECTIVE_PREVIOUS_DAY_LOW",
      levelType: direction === "CALLS" ? "PREVIOUS_DAY_HIGH" : "PREVIOUS_DAY_LOW",
      levelSemantic: "STRUCTURAL_LEVEL",
      level: priorLevel,
      sourceStatus: sourceStatusFromFeature(prior.status, [priorNativeState, prior.inputs.previousRthCoverageState]),
      sourceFeatureId: "PRICE_VS_PRIOR_DAY_RANGE",
      sourceComponents: [...prior.sourceComponents],
      referenceDate: prior.referenceDate,
      referenceDateRelation: prior.referenceDateRelation,
      dateCompatible: priorDateCompatible,
      dateRejection: priorDateCompatible ? null : "REFERENCE_DATE_MISMATCH",
      warningCode: prior.warningCode,
    },
    {
      candidateId: direction === "CALLS" ? "OBJECTIVE_PREMARKET_HIGH" : "OBJECTIVE_PREMARKET_LOW",
      levelType: direction === "CALLS" ? "PREMARKET_HIGH" : "PREMARKET_LOW",
      levelSemantic: "STRUCTURAL_LEVEL",
      level: premarketLevel,
      sourceStatus: sourceStatusFromFeature(premarket.status, [
        premarketNativeState,
        premarket.inputs.premarketCoverageState,
      ]),
      sourceFeatureId: "PRICE_VS_PREMARKET_RANGE",
      sourceComponents: [...premarket.sourceComponents],
      referenceDate: premarket.referenceDate,
      referenceDateRelation: premarket.referenceDateRelation,
      dateCompatible: premarketDateCompatible,
      dateRejection: premarketDateCompatible ? null : "REFERENCE_DATE_MISMATCH",
      warningCode: premarket.warningCode,
    },
    {
      candidateId: direction === "CALLS" ? "OBJECTIVE_EXPECTED_MOVE_UPPER" : "OBJECTIVE_EXPECTED_MOVE_LOWER",
      levelType: direction === "CALLS" ? "EXPECTED_MOVE_UPPER" : "EXPECTED_MOVE_LOWER",
      levelSemantic: "IMPLIED_MOVE_BOUNDARY",
      level: expectedLevel,
      sourceStatus: sourceStatusFromFeature(expected.status, [
        expected.inputs.metricState,
        expected.inputs.sourceState,
      ]),
      sourceFeatureId: "PRICE_VS_EXPECTED_MOVE_RANGE",
      sourceComponents: [...expected.sourceComponents],
      referenceDate: expected.referenceDate,
      referenceDateRelation: expected.referenceDateRelation,
      dateCompatible: expectedDateCompatible,
      dateRejection: expectedDateCompatible ? null : "EXPIRATION_MISMATCH",
      warningCode: expected.warningCode,
    },
  ];
}

function invalidationSources(
  marketState: SpyZeroDteDeterministicMarketStateResponse,
): InvalidationSource[] {
  const vwap = marketState.features.priceVsVwap;
  const opening = marketState.features.priceVsOpeningRange;
  const vwapDateCompatible =
    vwap.referenceDate === marketState.currentMarketDate &&
    vwap.inputs.vwapMarketDate === marketState.currentMarketDate &&
    vwap.referenceDateRelation === "CURRENT_MARKET_DATE";
  const openingDateCompatible =
    opening.referenceDate === marketState.currentMarketDate &&
    opening.inputs.currentMarketDate === marketState.currentMarketDate &&
    opening.referenceDateRelation === "CURRENT_MARKET_DATE";

  const openingStatus = sourceStatusFromFeature(opening.status, [
    opening.inputs.metricState,
    opening.inputs.sourceState,
    opening.inputs.coverageState,
  ]);

  return [
    {
      candidateId: "INVALIDATION_CURRENT_RTH_VWAP",
      levelType: "CURRENT_RTH_VWAP",
      level: vwap.inputs.vwap,
      sourceStatus: sourceStatusFromFeature(vwap.status, [
        vwap.inputs.vwapMetricState,
        vwap.inputs.vwapSourceState,
      ]),
      sourceFeatureId: "PRICE_VS_VWAP",
      sourceComponents: [...vwap.sourceComponents],
      referenceDate: vwap.referenceDate,
      referenceDateRelation: vwap.referenceDateRelation,
      dateCompatible: vwapDateCompatible,
      warningCode: vwap.warningCode,
    },
    {
      candidateId: "INVALIDATION_OPENING_RANGE_HIGH",
      levelType: "OPENING_RANGE_HIGH",
      level: opening.inputs.openingRangeHigh,
      sourceStatus: openingStatus,
      sourceFeatureId: "PRICE_VS_OPENING_RANGE",
      sourceComponents: [...opening.sourceComponents],
      referenceDate: opening.referenceDate,
      referenceDateRelation: opening.referenceDateRelation,
      dateCompatible: openingDateCompatible,
      warningCode: opening.warningCode,
    },
    {
      candidateId: "INVALIDATION_OPENING_RANGE_LOW",
      levelType: "OPENING_RANGE_LOW",
      level: opening.inputs.openingRangeLow,
      sourceStatus: openingStatus,
      sourceFeatureId: "PRICE_VS_OPENING_RANGE",
      sourceComponents: [...opening.sourceComponents],
      referenceDate: opening.referenceDate,
      referenceDateRelation: opening.referenceDateRelation,
      dateCompatible: openingDateCompatible,
      warningCode: opening.warningCode,
    },
  ];
}

function buildObjectiveCandidate(
  source: ObjectiveSource,
  direction: "CALLS" | "PUTS",
  planningReferencePrice: number,
): ObjectiveLevelCandidate {
  let rejectionReasonCode: RiskCandidateRejectionReasonCode | null = null;
  let eligibilityStatus: ObjectiveLevelCandidate["eligibilityStatus"] = "SELECTABLE";
  let distance: number | null = null;

  if (source.sourceStatus === "UNAVAILABLE") {
    eligibilityStatus = "UNAVAILABLE";
    rejectionReasonCode = "SOURCE_UNAVAILABLE";
  } else if (source.sourceStatus === "PARTIAL") {
    eligibilityStatus = "REJECTED";
    rejectionReasonCode = "SOURCE_PARTIAL";
  } else if (!source.dateCompatible) {
    eligibilityStatus = "REJECTED";
    rejectionReasonCode = source.dateRejection;
  } else if (!finite(source.level)) {
    eligibilityStatus = "UNAVAILABLE";
    rejectionReasonCode = "LEVEL_NOT_FINITE";
  } else if (source.level <= 0) {
    eligibilityStatus = "REJECTED";
    rejectionReasonCode = "LEVEL_NOT_POSITIVE";
  } else {
    rejectionReasonCode = candidateSideRejection(
      "OBJECTIVE",
      direction,
      planningReferencePrice,
      source.level,
    );
    if (rejectionReasonCode !== null) {
      eligibilityStatus = "REJECTED";
    } else {
      distance = objectiveDistance(direction, planningReferencePrice, source.level);
      if (!finitePositive(distance)) {
        eligibilityStatus = "REJECTED";
        rejectionReasonCode = "NON_POSITIVE_DISTANCE";
        distance = null;
      }
    }
  }

  const selectable = eligibilityStatus === "SELECTABLE";
  return {
    candidateId: source.candidateId,
    levelType: source.levelType,
    levelSemantic: source.levelSemantic,
    level: finite(source.level) ? source.level : null,
    sourceStatus: source.sourceStatus,
    eligibilityStatus,
    qualificationStatus: eligibilityStatus === "UNAVAILABLE" ? "UNAVAILABLE" : "NOT_EVALUATED",
    selectable,
    sourceFeatureId: source.sourceFeatureId,
    sourceComponents: source.sourceComponents,
    referenceDate: source.referenceDate,
    referenceDateRelation: source.referenceDateRelation,
    objectiveDistancePoints: selectable ? distance : null,
    distanceRank: null,
    rewardRiskRatio: null,
    minimumRewardRiskRatio: MINIMUM_REWARD_RISK_RATIO,
    rejectionReasonCode,
    warningCode:
      source.warningCode ??
      (source.sourceStatus === "PARTIAL"
        ? "PARTIAL_SOURCE_COMPONENT"
        : source.sourceStatus === "UNAVAILABLE"
          ? "SOURCE_COMPONENT_UNAVAILABLE"
          : null),
  };
}

function buildInvalidationCandidate(
  source: InvalidationSource,
  direction: "CALLS" | "PUTS",
  planningReferencePrice: number,
): InvalidationLevelCandidate {
  let rejectionReasonCode: RiskCandidateRejectionReasonCode | null = null;
  let eligibilityStatus: InvalidationLevelCandidate["eligibilityStatus"] = "SELECTABLE";
  let distance: number | null = null;

  if (source.sourceStatus === "UNAVAILABLE") {
    eligibilityStatus = "UNAVAILABLE";
    rejectionReasonCode = "SOURCE_UNAVAILABLE";
  } else if (source.sourceStatus === "PARTIAL") {
    eligibilityStatus = "REJECTED";
    rejectionReasonCode = "SOURCE_PARTIAL";
  } else if (!source.dateCompatible) {
    eligibilityStatus = "REJECTED";
    rejectionReasonCode = "REFERENCE_DATE_MISMATCH";
  } else if (!finite(source.level)) {
    eligibilityStatus = "UNAVAILABLE";
    rejectionReasonCode = "LEVEL_NOT_FINITE";
  } else if (source.level <= 0) {
    eligibilityStatus = "REJECTED";
    rejectionReasonCode = "LEVEL_NOT_POSITIVE";
  } else {
    rejectionReasonCode = candidateSideRejection(
      "INVALIDATION",
      direction,
      planningReferencePrice,
      source.level,
    );
    if (rejectionReasonCode !== null) {
      eligibilityStatus = "REJECTED";
    } else {
      distance = riskDistance(direction, planningReferencePrice, source.level);
      if (!finitePositive(distance)) {
        eligibilityStatus = "REJECTED";
        rejectionReasonCode = "NON_POSITIVE_DISTANCE";
        distance = null;
      }
    }
  }

  const selectable = eligibilityStatus === "SELECTABLE";
  return {
    candidateId: source.candidateId,
    levelType: source.levelType,
    levelSemantic: "STRUCTURAL_LEVEL",
    level: finite(source.level) ? source.level : null,
    sourceStatus: source.sourceStatus,
    eligibilityStatus,
    selectable,
    sourceFeatureId: source.sourceFeatureId,
    sourceComponents: source.sourceComponents,
    referenceDate: source.referenceDate,
    referenceDateRelation: source.referenceDateRelation,
    riskDistancePoints: selectable ? distance : null,
    distanceRank: null,
    rejectionReasonCode,
    warningCode:
      source.warningCode ??
      (source.sourceStatus === "PARTIAL"
        ? "PARTIAL_SOURCE_COMPONENT"
        : source.sourceStatus === "UNAVAILABLE"
          ? "SOURCE_COMPONENT_UNAVAILABLE"
          : null),
  };
}

function objectivePriority(levelType: ObjectiveLevelType): number {
  if (levelType === "PREMARKET_HIGH" || levelType === "PREMARKET_LOW") return 0;
  if (levelType === "PREVIOUS_DAY_HIGH" || levelType === "PREVIOUS_DAY_LOW") return 1;
  return 2;
}

function rankObjectiveCandidates(candidates: ObjectiveLevelCandidate[]): ObjectiveLevelCandidate[] {
  const ranked = candidates
    .filter((candidate) => candidate.selectable && candidate.objectiveDistancePoints !== null)
    .sort((a, b) =>
      (a.objectiveDistancePoints! - b.objectiveDistancePoints!) ||
      (objectivePriority(a.levelType) - objectivePriority(b.levelType)),
    );
  const rankById = new Map(ranked.map((candidate, index) => [candidate.candidateId, index + 1]));
  return candidates.map((candidate) => ({
    ...candidate,
    distanceRank: rankById.get(candidate.candidateId) ?? null,
  }));
}

function invalidationPriority(
  direction: "CALLS" | "PUTS",
  levelType: InvalidationLevelCandidate["levelType"],
): number {
  const order = direction === "CALLS"
    ? INVALIDATION_TIE_BREAK_ORDER_CALLS
    : INVALIDATION_TIE_BREAK_ORDER_PUTS;
  return order.indexOf(levelType);
}

function rankInvalidationCandidates(
  candidates: InvalidationLevelCandidate[],
  direction: "CALLS" | "PUTS",
): InvalidationLevelCandidate[] {
  const ranked = candidates
    .filter((candidate) => candidate.selectable && candidate.riskDistancePoints !== null)
    .sort((a, b) =>
      (a.riskDistancePoints! - b.riskDistancePoints!) ||
      (invalidationPriority(direction, a.levelType) - invalidationPriority(direction, b.levelType)),
    );
  const rankById = new Map(ranked.map((candidate, index) => [candidate.candidateId, index + 1]));
  return candidates.map((candidate) => ({
    ...candidate,
    distanceRank: rankById.get(candidate.candidateId) ?? null,
  }));
}

function selectedInvalidationFrom(
  candidates: readonly InvalidationLevelCandidate[],
): SpyZeroDteObjectiveRiskResponse["selectedInvalidation"] {
  const selected = candidates
    .filter((candidate) => candidate.selectable && candidate.distanceRank !== null)
    .sort((a, b) => a.distanceRank! - b.distanceRank!)[0];
  if (!selected || selected.level === null || selected.riskDistancePoints === null) {
    return emptySelectedInvalidation();
  }
  return {
    candidateId: selected.candidateId,
    levelType: selected.levelType,
    level: selected.level,
    riskDistancePoints: selected.riskDistancePoints,
  };
}

function qualifyObjectiveCandidates(
  candidates: ObjectiveLevelCandidate[],
  selectedInvalidation: SpyZeroDteObjectiveRiskResponse["selectedInvalidation"],
): ObjectiveLevelCandidate[] {
  const risk = selectedInvalidation.riskDistancePoints;
  if (!finitePositive(risk)) return candidates;
  return candidates.map((candidate) => {
    if (!candidate.selectable || !finitePositive(candidate.objectiveDistancePoints)) return candidate;
    const ratio = candidate.objectiveDistancePoints / risk;
    if (!finite(ratio) || ratio < 0) return candidate;
    return {
      ...candidate,
      rewardRiskRatio: ratio,
      qualificationStatus:
        ratio >= MINIMUM_REWARD_RISK_RATIO ? "QUALIFIED" : "BELOW_MINIMUM_RATIO",
    };
  });
}

function selectedObjectiveFrom(
  candidates: readonly ObjectiveLevelCandidate[],
): SpyZeroDteObjectiveRiskResponse["selectedObjective"] {
  const selected = candidates
    .filter((candidate) => candidate.qualificationStatus === "QUALIFIED" && candidate.distanceRank !== null)
    .sort((a, b) => a.distanceRank! - b.distanceRank!)[0];
  if (
    !selected ||
    selected.level === null ||
    selected.objectiveDistancePoints === null ||
    selected.rewardRiskRatio === null
  ) {
    return emptySelectedObjective();
  }
  return {
    candidateId: selected.candidateId,
    levelType: selected.levelType,
    level: selected.level,
    objectiveDistancePoints: selected.objectiveDistancePoints,
    rewardRiskRatio: selected.rewardRiskRatio,
  };
}

function hasPartialCandidates(
  objectives: readonly ObjectiveLevelCandidate[],
  invalidations: readonly InvalidationLevelCandidate[],
): boolean {
  return [...objectives, ...invalidations].some((candidate) => candidate.sourceStatus === "PARTIAL");
}

function hasEvaluableCompleteCandidate(
  candidates: readonly (ObjectiveLevelCandidate | InvalidationLevelCandidate)[],
): boolean {
  return candidates.some(
    (candidate) =>
      candidate.sourceStatus === "AVAILABLE" &&
      candidate.level !== null &&
      finite(candidate.level) &&
      !["SOURCE_UNAVAILABLE", "SOURCE_PARTIAL", "REFERENCE_DATE_MISMATCH", "EXPIRATION_MISMATCH", "LEVEL_NOT_FINITE", "LEVEL_NOT_POSITIVE"].includes(
        candidate.rejectionReasonCode ?? "",
      ),
  );
}

function allNumericInvalid(
  candidates: readonly (ObjectiveLevelCandidate | InvalidationLevelCandidate)[],
): boolean {
  return candidates.length > 0 && candidates.every((candidate) =>
    ["LEVEL_NOT_FINITE", "LEVEL_NOT_POSITIVE", "SOURCE_UNAVAILABLE"].includes(
      candidate.rejectionReasonCode ?? "",
    ),
  );
}

interface FinalState {
  engineState: SpyZeroDteObjectiveRiskResponse["engineState"];
  frameworkState: SpyZeroDteObjectiveRiskResponse["frameworkState"];
  riskQualification: SpyZeroDteObjectiveRiskResponse["riskQualification"];
  primaryReasonCode: RiskPrimaryReasonCode;
  warningCode: RiskOverallWarningCode | null;
}

function baseResponse(
  marketState: SpyZeroDteDeterministicMarketStateResponse,
  bias: SpyZeroDteDeterministicBiasResponse,
  tradePlan: SpyZeroDteDeterministicTradePlanResponse,
  nowMs: number,
  sameSnapshotGuaranteed: boolean,
  direction: ObjectiveRiskDirection,
  state: FinalState,
  planningReference: SpyZeroDteObjectiveRiskResponse["planningReference"],
  invalidationCandidates: InvalidationLevelCandidate[],
  selectedInvalidation: SpyZeroDteObjectiveRiskResponse["selectedInvalidation"],
  objectiveCandidates: ObjectiveLevelCandidate[],
  selectedObjective: SpyZeroDteObjectiveRiskResponse["selectedObjective"],
): SpyZeroDteObjectiveRiskResponse {
  return SpyZeroDteObjectiveRiskResponseSchema.parse({
    symbol: "SPY",
    product: "SPY_ZERO_DTE_DETERMINISTIC_OBJECTIVE_RISK_FRAMEWORK",
    methodologyVersion: RISK_METHODOLOGY_VERSION,
    currentMarketDate: marketState.currentMarketDate,
    mostRecentRthSessionDate: marketState.mostRecentRthSessionDate,
    sourceMarketStateEngineVersion: marketState.engineVersion,
    sourceMarketStateEngineState: marketState.engineState,
    sourceMarketStateCalculatedAt: marketState.calculatedAt,
    sourceBiasMethodologyVersion: bias.methodologyVersion,
    sourceBiasCalculatedAt: bias.calculatedAt,
    sourceBiasMarketStateCalculatedAt: bias.sourceMarketStateCalculatedAt,
    sourceTradePlanMethodologyVersion: tradePlan.methodologyVersion,
    sourceTradePlanCalculatedAt: tradePlan.calculatedAt,
    sourceTradePlanMarketStateCalculatedAt: tradePlan.sourceMarketStateCalculatedAt,
    sourceTradePlanBiasCalculatedAt: tradePlan.sourceBiasCalculatedAt,
    sameSnapshotGuaranteed,
    calculatedAt: new Date(nowMs).toISOString(),
    engineState: state.engineState,
    frameworkState: state.frameworkState,
    direction,
    riskQualification: state.riskQualification,
    isCurrentlyTradeEligible: tradePlan.setupState === "ELIGIBLE",
    sourceTradePlanSetupState: tradePlan.setupState,
    sourceTradePlanSetupDirection: tradePlan.setupDirection,
    currentPrice: marketState.price,
    priceSource: marketState.priceSource,
    quoteTimestamp: marketState.quoteTimestamp,
    planningReference,
    minimumRewardRiskRatio: MINIMUM_REWARD_RISK_RATIO,
    invalidationCandidates,
    selectedInvalidation,
    objectiveCandidates,
    selectedObjective,
    primaryReasonCode: state.primaryReasonCode,
    warningCode: state.warningCode,
    methodology: {
      objectiveSourceTypes: [...OBJECTIVE_SOURCE_TYPES],
      invalidationSourceTypes: [...INVALIDATION_SOURCE_TYPES],
      objectiveTieBreakOrder: [...OBJECTIVE_TIE_BREAK_ORDER],
      invalidationTieBreakOrderCalls: [...INVALIDATION_TIE_BREAK_ORDER_CALLS],
      invalidationTieBreakOrderPuts: [...INVALIDATION_TIE_BREAK_ORDER_PUTS],
      invalidationSelection: "NEAREST_VALID_ADVERSE_STRUCTURAL_LEVEL",
      objectiveSelection: "NEAREST_QUALIFIED_FAVORABLE_LEVEL",
      minimumRewardRiskRatio: MINIMUM_REWARD_RISK_RATIO,
      calculationsUse: "SPY_UNDERLYING_PRICE_POINTS",
      duplicateLevelPolicy: "PRESERVE_SEPARATE_CANDIDATES_EXACT_EQUALITY_ONLY",
      partialSelectionPolicy: "PARTIAL_CANDIDATES_VISIBLE_BUT_NOT_SELECTABLE",
    },
  });
}

export function buildSpyZeroDteObjectiveRiskFramework(
  marketState: SpyZeroDteDeterministicMarketStateResponse,
  bias: SpyZeroDteDeterministicBiasResponse,
  tradePlan: SpyZeroDteDeterministicTradePlanResponse,
  nowMs = Date.now(),
): SpyZeroDteObjectiveRiskResponse {
  const sameSnapshotGuaranteed =
    tradePlan.sameSnapshotGuaranteed &&
    bias.sourceMarketStateCalculatedAt === marketState.calculatedAt &&
    tradePlan.sourceMarketStateCalculatedAt === marketState.calculatedAt &&
    tradePlan.sourceBiasMarketStateCalculatedAt === marketState.calculatedAt &&
    tradePlan.sourceBiasCalculatedAt === bias.calculatedAt &&
    tradePlan.currentMarketDate === marketState.currentMarketDate &&
    bias.currentMarketDate === marketState.currentMarketDate;

  const propagatedDirection: ObjectiveRiskDirection =
    tradePlan.setupDirection === "CALLS"
      ? "CALLS"
      : tradePlan.setupDirection === "PUTS"
        ? "PUTS"
        : tradePlan.setupDirection === "NONE"
          ? "NONE"
          : "UNAVAILABLE";

  if (!sameSnapshotGuaranteed) {
    return baseResponse(
      marketState,
      bias,
      tradePlan,
      nowMs,
      false,
      propagatedDirection,
      {
        engineState: "UNAVAILABLE",
        frameworkState: "UNAVAILABLE",
        riskQualification: "UNAVAILABLE",
        primaryReasonCode: "SAME_SNAPSHOT_GUARANTEE_UNAVAILABLE",
        warningCode: "SAME_SNAPSHOT_GUARANTEE_UNAVAILABLE",
      },
      emptyPlanningReference(),
      [],
      emptySelectedInvalidation(),
      [],
      emptySelectedObjective(),
    );
  }

  if (tradePlan.setupState === "NOT_APPLICABLE") {
    return baseResponse(
      marketState,
      bias,
      tradePlan,
      nowMs,
      true,
      "NONE",
      {
        engineState: tradePlan.engineState === "PARTIAL" ? "PARTIAL" : "AVAILABLE",
        frameworkState: "NOT_APPLICABLE",
        riskQualification: "NOT_APPLICABLE",
        primaryReasonCode: "SOURCE_TRADE_PLAN_NOT_APPLICABLE",
        warningCode: null,
      },
      emptyPlanningReference(),
      [],
      emptySelectedInvalidation(),
      [],
      emptySelectedObjective(),
    );
  }

  if (tradePlan.setupState === "NO_SETUP") {
    return baseResponse(
      marketState,
      bias,
      tradePlan,
      nowMs,
      true,
      "NONE",
      {
        engineState: tradePlan.engineState === "PARTIAL" ? "PARTIAL" : "AVAILABLE",
        frameworkState: "NO_SETUP",
        riskQualification: "NOT_APPLICABLE",
        primaryReasonCode: "SOURCE_TRADE_PLAN_NO_SETUP",
        warningCode: null,
      },
      emptyPlanningReference(),
      [],
      emptySelectedInvalidation(),
      [],
      emptySelectedObjective(),
    );
  }

  if (
    tradePlan.setupState === "UNAVAILABLE" ||
    marketState.engineState === "UNAVAILABLE" ||
    propagatedDirection === "UNAVAILABLE"
  ) {
    return baseResponse(
      marketState,
      bias,
      tradePlan,
      nowMs,
      true,
      "UNAVAILABLE",
      {
        engineState: "UNAVAILABLE",
        frameworkState: "UNAVAILABLE",
        riskQualification: "UNAVAILABLE",
        primaryReasonCode: "SOURCE_TRADE_PLAN_UNAVAILABLE",
        warningCode: tradePlan.setupState === "UNAVAILABLE" ? "TRADE_PLAN_UNAVAILABLE" : "MARKET_STATE_UNAVAILABLE",
      },
      emptyPlanningReference(),
      [],
      emptySelectedInvalidation(),
      [],
      emptySelectedObjective(),
    );
  }

  if (
    !["ELIGIBLE", "WAITING_FOR_TRIGGER"].includes(tradePlan.setupState) ||
    !["CALLS", "PUTS"].includes(propagatedDirection)
  ) {
    return baseResponse(
      marketState,
      bias,
      tradePlan,
      nowMs,
      true,
      propagatedDirection,
      {
        engineState: "UNAVAILABLE",
        frameworkState: "UNAVAILABLE",
        riskQualification: "UNAVAILABLE",
        primaryReasonCode: "SOURCE_TRADE_PLAN_UNAVAILABLE",
        warningCode: "TRADE_PLAN_UNAVAILABLE",
      },
      emptyPlanningReference(),
      [],
      emptySelectedInvalidation(),
      [],
      emptySelectedObjective(),
    );
  }

  const direction = propagatedDirection as "CALLS" | "PUTS";
  const planningReference = tradePlan.setupState === "ELIGIBLE"
    ? {
        type: "CURRENT_PRICE" as const,
        price: tradePlan.currentPrice,
        priceSource: tradePlan.priceSource,
        sourceFeatureIds: [] as SpyZeroDteObjectiveRiskResponse["planningReference"]["sourceFeatureIds"],
        sourceCalculatedAt: marketState.calculatedAt,
        quoteTimestamp: tradePlan.quoteTimestamp,
        triggerLevel: tradePlan.trigger.level,
        disclosureCode: "PLANNING_REFERENCE_ONLY" as const,
      }
    : {
        type: "TRIGGER_LEVEL" as const,
        price: tradePlan.trigger.level,
        priceSource: tradePlan.priceSource,
        sourceFeatureIds: ["PRICE_VS_VWAP", "PRICE_VS_OPENING_RANGE"] as SpyZeroDteObjectiveRiskResponse["planningReference"]["sourceFeatureIds"],
        sourceCalculatedAt: tradePlan.calculatedAt,
        quoteTimestamp: null,
        triggerLevel: tradePlan.trigger.level,
        disclosureCode: "PLANNING_REFERENCE_ONLY" as const,
      };

  if (!finitePositive(planningReference.price)) {
    return baseResponse(
      marketState,
      bias,
      tradePlan,
      nowMs,
      true,
      direction,
      {
        engineState: "UNAVAILABLE",
        frameworkState: "UNAVAILABLE",
        riskQualification: "UNAVAILABLE",
        primaryReasonCode: "PLANNING_REFERENCE_UNAVAILABLE",
        warningCode: "PLANNING_REFERENCE_UNAVAILABLE",
      },
      emptyPlanningReference(),
      [],
      emptySelectedInvalidation(),
      [],
      emptySelectedObjective(),
    );
  }

  let objectiveCandidates = rankObjectiveCandidates(
    objectiveSources(marketState, direction).map((source) =>
      buildObjectiveCandidate(source, direction, planningReference.price!),
    ),
  );
  const invalidationCandidates = rankInvalidationCandidates(
    invalidationSources(marketState).map((source) =>
      buildInvalidationCandidate(source, direction, planningReference.price!),
    ),
    direction,
  );
  const selectedInvalidation = selectedInvalidationFrom(invalidationCandidates);

  if (selectedInvalidation.candidateId === null) {
    const partial = hasPartialCandidates(objectiveCandidates, invalidationCandidates);
    const structurallyEvaluable = hasEvaluableCompleteCandidate(invalidationCandidates);
    const invalidNumeric = allNumericInvalid(invalidationCandidates);
    return baseResponse(
      marketState,
      bias,
      tradePlan,
      nowMs,
      true,
      direction,
      {
        engineState: partial ? "PARTIAL" : structurallyEvaluable ? "AVAILABLE" : "UNAVAILABLE",
        frameworkState: structurallyEvaluable || partial ? "NOT_QUALIFIED" : "UNAVAILABLE",
        riskQualification: structurallyEvaluable || partial ? "NOT_QUALIFIED" : "UNAVAILABLE",
        primaryReasonCode: partial ? "REQUIRED_LEVEL_PARTIAL" : "NO_ADVERSE_INVALIDATION_CANDIDATE",
        warningCode: partial
          ? "REQUIRED_LEVEL_PARTIAL"
          : structurallyEvaluable
            ? null
            : invalidNumeric
              ? "INVALID_NUMERIC_LEVEL"
              : "INSUFFICIENT_RISK_DATA",
      },
      planningReference,
      invalidationCandidates,
      emptySelectedInvalidation(),
      objectiveCandidates,
      emptySelectedObjective(),
    );
  }

  objectiveCandidates = qualifyObjectiveCandidates(objectiveCandidates, selectedInvalidation);
  const selectedObjective = selectedObjectiveFrom(objectiveCandidates);

  if (selectedObjective.candidateId === null) {
    const hasSelectable = objectiveCandidates.some((candidate) => candidate.selectable);
    const partial = hasPartialCandidates(objectiveCandidates, invalidationCandidates);
    const structurallyEvaluable = hasEvaluableCompleteCandidate(objectiveCandidates);
    const expectedMismatchOnly = objectiveCandidates.every((candidate) =>
      candidate.rejectionReasonCode === "EXPIRATION_MISMATCH" || candidate.sourceStatus === "UNAVAILABLE",
    );
    const invalidNumeric = allNumericInvalid(objectiveCandidates);
    const primaryReasonCode: RiskPrimaryReasonCode = partial
      ? "REQUIRED_LEVEL_PARTIAL"
      : hasSelectable
        ? "NO_OBJECTIVE_MEETS_MINIMUM_RATIO"
        : "NO_FAVORABLE_OBJECTIVE_CANDIDATE";
    const unavailable = !partial && !structurallyEvaluable && !hasSelectable;
    return baseResponse(
      marketState,
      bias,
      tradePlan,
      nowMs,
      true,
      direction,
      {
        engineState: partial ? "PARTIAL" : unavailable ? "UNAVAILABLE" : "AVAILABLE",
        frameworkState: unavailable ? "UNAVAILABLE" : "NOT_QUALIFIED",
        riskQualification: unavailable ? "UNAVAILABLE" : "NOT_QUALIFIED",
        primaryReasonCode: unavailable && expectedMismatchOnly
          ? "EXPECTED_MOVE_EXPIRATION_MISMATCH"
          : primaryReasonCode,
        warningCode: partial
          ? "REQUIRED_LEVEL_PARTIAL"
          : unavailable
            ? expectedMismatchOnly
              ? "EXPECTED_MOVE_EXPIRATION_MISMATCH"
              : invalidNumeric
                ? "INVALID_NUMERIC_LEVEL"
                : "INSUFFICIENT_RISK_DATA"
            : null,
      },
      planningReference,
      invalidationCandidates,
      selectedInvalidation,
      objectiveCandidates,
      emptySelectedObjective(),
    );
  }

  const state: FinalState = tradePlan.setupState === "ELIGIBLE"
    ? {
        engineState: "AVAILABLE",
        frameworkState: "READY",
        riskQualification: "QUALIFIED",
        primaryReasonCode: "RISK_FRAMEWORK_READY",
        warningCode: null,
      }
    : {
        engineState: "AVAILABLE",
        frameworkState: "PREVIEW",
        riskQualification: "QUALIFIED",
        primaryReasonCode: "RISK_FRAMEWORK_PREVIEW",
        warningCode: null,
      };

  return baseResponse(
    marketState,
    bias,
    tradePlan,
    nowMs,
    true,
    direction,
    state,
    planningReference,
    invalidationCandidates,
    selectedInvalidation,
    objectiveCandidates,
    selectedObjective,
  );
}
