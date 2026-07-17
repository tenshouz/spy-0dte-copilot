import {
  SpyZeroDteDeterministicBiasResponseSchema,
  type BiasEvidenceDirection,
  type BiasEvidenceItem,
  type BiasOverallWarningCode,
  type BiasRationaleCode,
  type DeterministicBiasState,
  type MarketStateFeatureId,
  type NeutralBiasReason,
  type SpyZeroDteDeterministicBiasResponse,
  type SpyZeroDteDeterministicMarketStateResponse,
} from "@spy-copilot/shared";

export const BIAS_METHODOLOGY_VERSION = "BIAS_V1" as const;
export const MINIMUM_USABLE_DIRECTIONAL_EVIDENCE_COUNT = 2;

export const DIRECTIONAL_FEATURE_IDS = [
  "PRICE_VS_VWAP",
  "PRICE_VS_PRIOR_DAY_RANGE",
  "PRICE_VS_PREMARKET_RANGE",
  "PRICE_VS_OPENING_RANGE",
] as const satisfies readonly MarketStateFeatureId[];

export const NON_DIRECTIONAL_FEATURE_IDS = [
  "SESSION_PHASE",
  "RTH_GAP_CONTEXT",
  "PRICE_VS_EXPECTED_MOVE_RANGE",
  "RETURNED_WINDOW_NET_GEX_SIGN",
  "RETURNED_WINDOW_NET_DEX_SIGN",
] as const satisfies readonly MarketStateFeatureId[];

export const DIRECTIONAL_FEATURE_WEIGHTS = DIRECTIONAL_FEATURE_IDS.map((featureId) => ({
  featureId,
  weight: 1,
}));

const directionalIds = new Set<MarketStateFeatureId>(DIRECTIONAL_FEATURE_IDS);

type MarketStateFeature = SpyZeroDteDeterministicMarketStateResponse["features"][keyof SpyZeroDteDeterministicMarketStateResponse["features"]];

type BiasEvidenceDraft = Omit<BiasEvidenceItem, "evidenceDirection" | "configuredWeight" | "appliedWeight" | "weightedContribution" | "rationaleCode">;

function featureDraft(feature: MarketStateFeature): BiasEvidenceDraft {
  return {
    featureId: feature.featureId,
    featureVersion: feature.featureVersion,
    featureStatus: feature.status,
    featureState: feature.state,
    referenceDate: feature.referenceDate,
    referenceDateRelation: feature.referenceDateRelation,
    sourceComponents: [...feature.sourceComponents],
    warningCode: feature.warningCode,
  };
}

function evidence(
  feature: MarketStateFeature,
  evidenceDirection: BiasEvidenceDirection,
  rationaleCode: BiasRationaleCode,
  configuredWeight: number,
): BiasEvidenceItem {
  const appliedWeight = ["BULLISH", "BEARISH", "NEUTRAL"].includes(evidenceDirection)
    ? configuredWeight
    : 0;
  const weightedContribution =
    evidenceDirection === "BULLISH"
      ? appliedWeight
      : evidenceDirection === "BEARISH"
        ? -appliedWeight
        : 0;
  return {
    ...featureDraft(feature),
    evidenceDirection,
    configuredWeight,
    appliedWeight,
    weightedContribution,
    rationaleCode,
  };
}

function directionalUnavailableOrNotApplicable(
  feature: MarketStateFeature,
  configuredWeight: number,
): BiasEvidenceItem | null {
  if (feature.status === "NOT_APPLICABLE") {
    return evidence(feature, "NOT_APPLICABLE", "FEATURE_NOT_APPLICABLE", configuredWeight);
  }
  if (feature.status === "UNAVAILABLE" || feature.state === null) {
    return evidence(feature, "UNAVAILABLE", "FEATURE_UNAVAILABLE", configuredWeight);
  }
  return null;
}

function mapVwap(feature: SpyZeroDteDeterministicMarketStateResponse["features"]["priceVsVwap"]): BiasEvidenceItem {
  const unavailable = directionalUnavailableOrNotApplicable(feature, 1);
  if (unavailable) return unavailable;
  if (feature.state === "ABOVE") return evidence(feature, "BULLISH", "PRICE_ABOVE_VWAP", 1);
  if (feature.state === "BELOW") return evidence(feature, "BEARISH", "PRICE_BELOW_VWAP", 1);
  return evidence(feature, "NEUTRAL", "PRICE_EQUAL_VWAP", 1);
}

function mapRange(
  feature:
    | SpyZeroDteDeterministicMarketStateResponse["features"]["priceVsPriorDayRange"]
    | SpyZeroDteDeterministicMarketStateResponse["features"]["priceVsPremarketRange"],
  rationale: {
    above: BiasRationaleCode;
    below: BiasRationaleCode;
    high: BiasRationaleCode;
    low: BiasRationaleCode;
    boundary: BiasRationaleCode;
    inside: BiasRationaleCode;
  },
): BiasEvidenceItem {
  const unavailable = directionalUnavailableOrNotApplicable(feature, 1);
  if (unavailable) return unavailable;
  switch (feature.state) {
    case "ABOVE_RANGE":
      return evidence(feature, "BULLISH", rationale.above, 1);
    case "BELOW_RANGE":
      return evidence(feature, "BEARISH", rationale.below, 1);
    case "AT_HIGH":
      return evidence(feature, "NEUTRAL", rationale.high, 1);
    case "AT_LOW":
      return evidence(feature, "NEUTRAL", rationale.low, 1);
    case "AT_BOUNDARY":
      return evidence(feature, "NEUTRAL", rationale.boundary, 1);
    case "INSIDE_RANGE":
      return evidence(feature, "NEUTRAL", rationale.inside, 1);
    default:
      return evidence(feature, "UNAVAILABLE", "FEATURE_UNAVAILABLE", 1);
  }
}

function mapOpeningRange(
  feature: SpyZeroDteDeterministicMarketStateResponse["features"]["priceVsOpeningRange"],
): BiasEvidenceItem {
  if (feature.state === "NOT_STARTED") {
    return evidence(feature, "NOT_APPLICABLE", "OPENING_RANGE_NOT_STARTED", 1);
  }
  if (feature.state === "FORMING") {
    return evidence(feature, "NOT_APPLICABLE", "OPENING_RANGE_FORMING", 1);
  }
  const unavailable = directionalUnavailableOrNotApplicable(feature, 1);
  if (unavailable) return unavailable;
  switch (feature.state) {
    case "ABOVE_RANGE":
      return evidence(feature, "BULLISH", "PRICE_ABOVE_OPENING_RANGE", 1);
    case "BELOW_RANGE":
      return evidence(feature, "BEARISH", "PRICE_BELOW_OPENING_RANGE", 1);
    case "AT_HIGH":
      return evidence(feature, "NEUTRAL", "PRICE_AT_OPENING_RANGE_HIGH", 1);
    case "AT_LOW":
      return evidence(feature, "NEUTRAL", "PRICE_AT_OPENING_RANGE_LOW", 1);
    case "AT_BOUNDARY":
      return evidence(feature, "NEUTRAL", "PRICE_AT_OPENING_RANGE_BOUNDARY", 1);
    case "INSIDE_RANGE":
      return evidence(feature, "NEUTRAL", "PRICE_INSIDE_OPENING_RANGE", 1);
    default:
      return evidence(feature, "UNAVAILABLE", "FEATURE_UNAVAILABLE", 1);
  }
}

function mapNonDirectional(
  feature: MarketStateFeature,
  rationaleCode: BiasRationaleCode,
): BiasEvidenceItem {
  if (feature.status === "NOT_APPLICABLE") {
    return evidence(feature, "NOT_APPLICABLE", "FEATURE_NOT_APPLICABLE", 0);
  }
  if (feature.status === "UNAVAILABLE" || feature.state === null) {
    return evidence(feature, "UNAVAILABLE", "FEATURE_UNAVAILABLE", 0);
  }
  return evidence(feature, "NON_DIRECTIONAL", rationaleCode, 0);
}

export function mapMarketStateToBiasEvidence(
  marketState: SpyZeroDteDeterministicMarketStateResponse,
): BiasEvidenceItem[] {
  return [
    mapNonDirectional(marketState.features.sessionPhase, "SESSION_PHASE_NON_DIRECTIONAL"),
    mapVwap(marketState.features.priceVsVwap),
    mapRange(marketState.features.priceVsPriorDayRange, {
      above: "PRICE_ABOVE_PRIOR_DAY_RANGE",
      below: "PRICE_BELOW_PRIOR_DAY_RANGE",
      high: "PRICE_AT_PRIOR_DAY_HIGH",
      low: "PRICE_AT_PRIOR_DAY_LOW",
      boundary: "PRICE_AT_PRIOR_DAY_BOUNDARY",
      inside: "PRICE_INSIDE_PRIOR_DAY_RANGE",
    }),
    mapRange(marketState.features.priceVsPremarketRange, {
      above: "PRICE_ABOVE_PREMARKET_RANGE",
      below: "PRICE_BELOW_PREMARKET_RANGE",
      high: "PRICE_AT_PREMARKET_HIGH",
      low: "PRICE_AT_PREMARKET_LOW",
      boundary: "PRICE_AT_PREMARKET_BOUNDARY",
      inside: "PRICE_INSIDE_PREMARKET_RANGE",
    }),
    mapOpeningRange(marketState.features.priceVsOpeningRange),
    mapNonDirectional(marketState.features.gapContext, "GAP_CONTEXT_NON_DIRECTIONAL"),
    mapNonDirectional(
      marketState.features.priceVsExpectedMoveRange,
      "EXPECTED_MOVE_CONTEXT_NON_DIRECTIONAL",
    ),
    mapNonDirectional(marketState.features.netGexProxySign, "GEX_SIGN_NON_DIRECTIONAL"),
    mapNonDirectional(marketState.features.netDexProxySign, "DEX_SIGN_NON_DIRECTIONAL"),
  ];
}

export interface BiasCalculation {
  engineState: SpyZeroDteDeterministicBiasResponse["engineState"];
  biasState: DeterministicBiasState;
  neutralReason: NeutralBiasReason | null;
  sourceQualityState: SpyZeroDteDeterministicBiasResponse["sourceQualityState"];
  warningCode: BiasOverallWarningCode | null;
  bullishScore: number;
  bearishScore: number;
  netDirectionalScore: number;
  neutralEvidenceWeight: number;
  applicableDirectionalWeight: number;
  usableDirectionalWeight: number;
  usableDirectionalEvidenceCount: number;
  applicableDirectionalEvidenceCount: number;
  bullishEvidenceCount: number;
  bearishEvidenceCount: number;
  neutralEvidenceCount: number;
  unavailableDirectionalEvidenceCount: number;
  notApplicableDirectionalEvidenceCount: number;
  directionalSupportRatio: number | null;
  sufficiencyRatio: number | null;
  contradictionRatio: number | null;
  neutralEvidenceRatio: number | null;
  neutralBalanceRatio: number | null;
  confidenceScore: number | null;
  supportingEvidenceDirection: "BULLISH" | "BEARISH" | null;
  counterEvidenceDirection: "BULLISH" | "BEARISH" | null;
}

function containsStaleWarning(item: BiasEvidenceItem): boolean {
  return item.warningCode?.includes("STALE") ?? false;
}

export function calculateDeterministicBias(
  marketState: SpyZeroDteDeterministicMarketStateResponse,
  items: readonly BiasEvidenceItem[],
): BiasCalculation {
  const directional = items.filter((item) => directionalIds.has(item.featureId));
  const applicable = directional.filter((item) => item.evidenceDirection !== "NOT_APPLICABLE");
  const usable = directional.filter((item) =>
    ["BULLISH", "BEARISH", "NEUTRAL"].includes(item.evidenceDirection),
  );
  const unavailable = directional.filter((item) => item.evidenceDirection === "UNAVAILABLE");
  const notApplicable = directional.filter((item) => item.evidenceDirection === "NOT_APPLICABLE");
  const bullish = usable.filter((item) => item.evidenceDirection === "BULLISH");
  const bearish = usable.filter((item) => item.evidenceDirection === "BEARISH");
  const neutral = usable.filter((item) => item.evidenceDirection === "NEUTRAL");

  const bullishScore = bullish.reduce((sum, item) => sum + item.appliedWeight, 0);
  const bearishScore = bearish.reduce((sum, item) => sum + item.appliedWeight, 0);
  const netDirectionalScore = bullishScore - bearishScore;
  const neutralEvidenceWeight = neutral.reduce((sum, item) => sum + item.appliedWeight, 0);
  const applicableDirectionalWeight = applicable.reduce(
    (sum, item) => sum + item.configuredWeight,
    0,
  );
  const usableDirectionalWeight = usable.reduce((sum, item) => sum + item.appliedWeight, 0);
  const usableDirectionalEvidenceCount = usable.length;
  const applicableDirectionalEvidenceCount = applicable.length;
  const contributingPartial = usable.some((item) => item.featureStatus === "PARTIAL");
  const applicableUnavailable = unavailable.length > 0;

  let engineState: BiasCalculation["engineState"];
  let biasState: DeterministicBiasState;
  let warningCode: BiasOverallWarningCode | null;

  if (marketState.engineState === "UNAVAILABLE") {
    engineState = "UNAVAILABLE";
    biasState = "UNAVAILABLE";
    warningCode = "MARKET_STATE_UNAVAILABLE";
  } else if (marketState.price === null) {
    engineState = "UNAVAILABLE";
    biasState = "UNAVAILABLE";
    warningCode = "CURRENT_PRICE_UNAVAILABLE";
  } else if (usableDirectionalEvidenceCount < MINIMUM_USABLE_DIRECTIONAL_EVIDENCE_COUNT) {
    engineState = "UNAVAILABLE";
    biasState = "UNAVAILABLE";
    warningCode = "INSUFFICIENT_DIRECTIONAL_EVIDENCE";
  } else {
    engineState = contributingPartial || applicableUnavailable ? "PARTIAL" : "AVAILABLE";
    biasState =
      netDirectionalScore > 0
        ? "BULLISH"
        : netDirectionalScore < 0
          ? "BEARISH"
          : "NEUTRAL";
    if (engineState === "PARTIAL") {
      warningCode = usable.some(containsStaleWarning)
        ? "STALE_DIRECTIONAL_INPUTS"
        : "PARTIAL_BIAS_INPUTS";
    } else {
      warningCode = null;
    }
  }

  const sufficiencyRatio =
    applicableDirectionalWeight > 0
      ? usableDirectionalWeight / applicableDirectionalWeight
      : null;
  const neutralEvidenceRatio =
    usableDirectionalWeight > 0 ? neutralEvidenceWeight / usableDirectionalWeight : null;

  let directionalSupportRatio: number | null = null;
  let contradictionRatio: number | null = null;
  let neutralBalanceRatio: number | null = null;
  let confidenceScore: number | null = null;
  let neutralReason: NeutralBiasReason | null = null;
  let supportingEvidenceDirection: "BULLISH" | "BEARISH" | null = null;
  let counterEvidenceDirection: "BULLISH" | "BEARISH" | null = null;

  if (biasState === "BULLISH" || biasState === "BEARISH") {
    const supportingWeight = biasState === "BULLISH" ? bullishScore : bearishScore;
    const counterWeight = biasState === "BULLISH" ? bearishScore : bullishScore;
    directionalSupportRatio = supportingWeight / usableDirectionalWeight;
    contradictionRatio = counterWeight / usableDirectionalWeight;
    confidenceScore = directionalSupportRatio * (sufficiencyRatio ?? 0) * 100;
    supportingEvidenceDirection = biasState;
    counterEvidenceDirection = biasState === "BULLISH" ? "BEARISH" : "BULLISH";
  } else if (biasState === "NEUTRAL") {
    neutralBalanceRatio =
      usableDirectionalWeight > 0
        ? 1 - Math.abs(netDirectionalScore) / usableDirectionalWeight
        : null;
    confidenceScore = (neutralBalanceRatio ?? 0) * (sufficiencyRatio ?? 0) * 100;
    neutralReason =
      bullishScore === bearishScore && bullishScore > 0
        ? "BALANCED_DIRECTIONAL_EVIDENCE"
        : "ALL_NEUTRAL_DIRECTIONAL_STATES";
  }

  return {
    engineState,
    biasState,
    neutralReason,
    sourceQualityState:
      engineState === "UNAVAILABLE" ? "UNAVAILABLE" : engineState === "PARTIAL" ? "PARTIAL" : "COMPLETE",
    warningCode,
    bullishScore,
    bearishScore,
    netDirectionalScore,
    neutralEvidenceWeight,
    applicableDirectionalWeight,
    usableDirectionalWeight,
    usableDirectionalEvidenceCount,
    applicableDirectionalEvidenceCount,
    bullishEvidenceCount: bullish.length,
    bearishEvidenceCount: bearish.length,
    neutralEvidenceCount: neutral.length,
    unavailableDirectionalEvidenceCount: unavailable.length,
    notApplicableDirectionalEvidenceCount: notApplicable.length,
    directionalSupportRatio,
    sufficiencyRatio,
    contradictionRatio,
    neutralEvidenceRatio,
    neutralBalanceRatio,
    confidenceScore,
    supportingEvidenceDirection,
    counterEvidenceDirection,
  };
}

export function buildSpyZeroDteDeterministicBias(
  marketState: SpyZeroDteDeterministicMarketStateResponse,
  nowMs = Date.now(),
): SpyZeroDteDeterministicBiasResponse {
  const items = mapMarketStateToBiasEvidence(marketState);
  const calculation = calculateDeterministicBias(marketState, items);

  const category = (direction: BiasEvidenceDirection) =>
    items.filter((item) => item.evidenceDirection === direction);

  const evidenceWarnings = items
    .filter((item) => item.warningCode !== null)
    .map((item) => ({ featureId: item.featureId, warningCode: item.warningCode! }));

  return SpyZeroDteDeterministicBiasResponseSchema.parse({
    symbol: "SPY",
    product: "SPY_ZERO_DTE_DETERMINISTIC_BIAS_CONFIDENCE",
    methodologyVersion: BIAS_METHODOLOGY_VERSION,
    currentMarketDate: marketState.currentMarketDate,
    mostRecentRthSessionDate: marketState.mostRecentRthSessionDate,
    sourceMarketStateEngineVersion: marketState.engineVersion,
    sourceMarketStateEngineState: marketState.engineState,
    sourceMarketStateCalculatedAt: marketState.calculatedAt,
    calculatedAt: new Date(nowMs).toISOString(),
    ...calculation,
    minimumUsableDirectionalEvidenceCount: MINIMUM_USABLE_DIRECTIONAL_EVIDENCE_COUNT,
    confidenceUnit: "PERCENT",
    confidenceMethodology: "DIRECTIONAL_SUPPORT_TIMES_SUFFICIENCY",
    confidenceScope: "STRUCTURAL_EVIDENCE_ONLY",
    bullishEvidence: category("BULLISH"),
    bearishEvidence: category("BEARISH"),
    neutralEvidence: category("NEUTRAL"),
    nonDirectionalContext: category("NON_DIRECTIONAL"),
    notApplicableEvidence: category("NOT_APPLICABLE"),
    unavailableEvidence: category("UNAVAILABLE"),
    evidenceWarnings,
    methodology: {
      directionalFeatureIds: [...DIRECTIONAL_FEATURE_IDS],
      nonDirectionalFeatureIds: [...NON_DIRECTIONAL_FEATURE_IDS],
      featureWeights: DIRECTIONAL_FEATURE_WEIGHTS,
      minimumUsableDirectionalEvidenceCount: MINIMUM_USABLE_DIRECTIONAL_EVIDENCE_COUNT,
      confidenceFormula:
        "DIRECTIONAL_SUPPORT_RATIO_X_SUFFICIENCY_RATIO_X_100; NEUTRAL_USES_NEUTRAL_BALANCE_RATIO_X_SUFFICIENCY_RATIO_X_100",
      partialEvidencePolicy:
        "FULL_CONFIGURED_WEIGHT_WITH_PARTIAL_PROVENANCE_NO_NUMERIC_MULTIPLIER",
    },
  });
}
