import {
  EmpiricalGammaResearchResponseSchema,
  SpyZeroDteTradePlanAssemblyResponseSchema,
  type AssembledTradePlanDirection,
  type DeterministicJournalOutcomeState,
  type DeterministicTradePlanState,
  type EmpiricalGammaResearchContextCompleteness,
  type EmpiricalGammaResearchEvidenceState,
  type EmpiricalGammaResearchFeatureType,
  type EmpiricalGammaResearchFinding,
  type EmpiricalGammaResearchMetrics,
  type EmpiricalGammaResearchPayload,
  type EmpiricalGammaResearchResponse,
  type ExposureWall,
  type GammaCliff,
  type GammaSignTransition,
  type SpyZeroDteTradePlanAssemblyResponse,
  type TradeSetupType,
} from "@spy-copilot/shared";

export const EMPIRICAL_GAMMA_RESEARCH_MINIMUM_BUCKET_TRADES = 30 as const;
export const EMPIRICAL_GAMMA_RESEARCH_MINIMUM_COMPARATOR_TRADES = 30 as const;
export const EMPIRICAL_GAMMA_RESEARCH_NEAR_LEVEL_PERCENT = 1 as const;
const WILSON_Z_95 = 1.959963984540054;

const DISCLOSURES = {
  researchOnly: true,
  observationalNotCausal: true,
  userEnteredOutcomesOnly: true,
  readyPlanSnapshotsOnly: true,
  winRateIncludesBreakevensInDenominator: true,
  liveCompleteGammaInputsOnly: true,
  multipleComparisonsUnadjusted: true,
  matchedWithinSetupAndDirection: true,
  comparatorExcludesCurrentBucket: true,
  snapshotLevelObservationsNotTradeIdentity: true,
  legacyRowsMayLackCliffsOrTransitions: true,
  returnedWindowGammaOnly: true,
  openInterestMayBeStaleIntraday: true,
  noAutomaticDirectionalWeighting: true,
  outOfSampleValidationRequired: true,
  noPrivateAccountData: true,
  noPositionSizing: true,
  noOrderExecution: true,
} as const;

export interface EmpiricalGammaResearchRow {
  currentMarketDate: string;
  planState: DeterministicTradePlanState;
  direction: AssembledTradePlanDirection;
  outcomeState: DeterministicJournalOutcomeState;
  realizedPnlDollars: number | null;
  sourceAssembly: unknown;
}

type ResearchDirection = "CALLS" | "PUTS";
type TradeOutcome = "WIN" | "LOSS" | "BREAKEVEN";

interface GammaFeatureObservation {
  featureType: EmpiricalGammaResearchFeatureType;
  bucketKey: string;
  bucketLabel: string;
}

interface GammaResearchObservation {
  marketDate: string;
  setupType: TradeSetupType;
  direction: ResearchDirection;
  outcomeState: TradeOutcome;
  realizedPnlDollars: number;
  contextCompleteness: EmpiricalGammaResearchContextCompleteness;
  features: GammaFeatureObservation[];
}

interface ExtractionResult {
  observation: GammaResearchObservation | null;
  invalidAssembly: boolean;
}

function round(value: number, precision = 2): number {
  const factor = 10 ** precision;
  return Math.round((value + Number.EPSILON) * factor) / factor;
}

function parseAssembly(value: unknown): SpyZeroDteTradePlanAssemblyResponse | null {
  let candidate = value;
  if (typeof candidate === "string") {
    try {
      candidate = JSON.parse(candidate) as unknown;
    } catch {
      return null;
    }
  }
  const parsed = SpyZeroDteTradePlanAssemblyResponseSchema.safeParse(candidate);
  return parsed.success ? parsed.data : null;
}

function isTradeOutcome(
  value: DeterministicJournalOutcomeState,
): value is TradeOutcome {
  return value === "WIN" || value === "LOSS" || value === "BREAKEVEN";
}

function isResearchDirection(
  value: AssembledTradePlanDirection,
): value is ResearchDirection {
  return value === "CALLS" || value === "PUTS";
}

function directionRelativePosition(
  level: number,
  price: number,
  direction: ResearchDirection,
): "AHEAD" | "BEHIND" | "AT_PRICE" {
  if (Math.abs(level - price) <= 0.01) return "AT_PRICE";
  const signedDirectionalDistance =
    direction === "CALLS" ? level - price : price - level;
  return signedDirectionalDistance > 0 ? "AHEAD" : "BEHIND";
}

function proximity(level: number, price: number): "NEAR" | "FAR" {
  const distancePercent = (Math.abs(level - price) / price) * 100;
  return distancePercent <= EMPIRICAL_GAMMA_RESEARCH_NEAR_LEVEL_PERCENT
    ? "NEAR"
    : "FAR";
}

function wallFeature(
  featureType:
    | "DIRECTIONAL_WALL_LOCATION"
    | "OPPOSING_WALL_LOCATION",
  wall: ExposureWall | null,
  price: number,
  direction: ResearchDirection,
): GammaFeatureObservation | null {
  if (!wall) return null;
  const relation = directionRelativePosition(wall.strikePrice, price, direction);
  const distanceBucket = proximity(wall.strikePrice, price);
  return {
    featureType,
    bucketKey: `${relation}_${distanceBucket}`,
    bucketLabel: `${relation.replace(/_/g, " ")} · ${distanceBucket.toLowerCase()}`,
  };
}

function intervalRelation(
  lowerStrike: number,
  upperStrike: number,
  referenceStrike: number,
  price: number,
  direction: ResearchDirection,
): "AHEAD" | "BEHIND" | "STRADDLING_PRICE" {
  if (price >= lowerStrike && price <= upperStrike) return "STRADDLING_PRICE";
  return directionRelativePosition(referenceStrike, price, direction) === "AHEAD"
    ? "AHEAD"
    : "BEHIND";
}

function nearestCliffFeature(
  cliffs: readonly GammaCliff[],
  price: number,
  direction: ResearchDirection,
): GammaFeatureObservation | null {
  const cliff = [...cliffs].sort((left, right) => {
    const leftDistance = Math.abs(left.midpointStrike - price);
    const rightDistance = Math.abs(right.midpointStrike - price);
    if (leftDistance !== rightDistance) return leftDistance - rightDistance;
    return right.absoluteGammaChange - left.absoluteGammaChange;
  })[0];
  if (!cliff) return null;
  const relation = intervalRelation(
    cliff.lowerStrike,
    cliff.upperStrike,
    cliff.midpointStrike,
    price,
    direction,
  );
  const distanceBucket = proximity(cliff.midpointStrike, price);
  return {
    featureType: "NEAREST_GAMMA_CLIFF",
    bucketKey: `${cliff.direction}_${relation}_${distanceBucket}`,
    bucketLabel: `${cliff.direction.replace(/_/g, " ")} · ${relation.replace(/_/g, " ")} · ${distanceBucket.toLowerCase()}`,
  };
}

function nearestSignTransitionFeature(
  transitions: readonly GammaSignTransition[],
  price: number,
  direction: ResearchDirection,
): GammaFeatureObservation | null {
  const transition = [...transitions].sort((left, right) => {
    const leftDistance = Math.abs(left.estimatedStrike - price);
    const rightDistance = Math.abs(right.estimatedStrike - price);
    if (leftDistance !== rightDistance) return leftDistance - rightDistance;
    return right.absoluteGammaChange - left.absoluteGammaChange;
  })[0];
  if (!transition) return null;
  const relation = intervalRelation(
    transition.lowerStrike,
    transition.upperStrike,
    transition.estimatedStrike,
    price,
    direction,
  );
  const distanceBucket = proximity(transition.estimatedStrike, price);
  return {
    featureType: "NEAREST_GAMMA_SIGN_TRANSITION",
    bucketKey: `${transition.direction}_${relation}_${distanceBucket}`,
    bucketLabel: `${transition.direction.replace(/_/g, " ")} · ${relation.replace(/_/g, " ")} · ${distanceBucket.toLowerCase()}`,
  };
}

function legacyGammaRegime(
  assembly: SpyZeroDteTradePlanAssemblyResponse,
): string | null {
  const component = assembly.exposureConfirmation?.components.find(
    (item) => item.componentId === "GEX_REGIME",
  );
  if (component?.sourceQuality !== "COMPLETE") return null;
  const rawState = component.rawState;
  return ["CALL_DOMINANT", "PUT_DOMINANT", "BALANCED"].includes(
    rawState ?? "",
  )
    ? rawState ?? null
    : null;
}

function legacyDirectionalWall(
  assembly: SpyZeroDteTradePlanAssemblyResponse,
): ExposureWall | null {
  const component = assembly.exposureConfirmation?.components.find(
    (item) => item.componentId === "DIRECTIONAL_WALL",
  );
  return component?.sourceQuality === "COMPLETE"
    ? assembly.exposureConfirmation?.primaryDirectionalWall ?? null
    : null;
}

function extractFeatures(
  assembly: SpyZeroDteTradePlanAssemblyResponse,
  price: number,
  direction: ResearchDirection,
): {
  completeness: EmpiricalGammaResearchContextCompleteness;
  features: GammaFeatureObservation[];
} {
  const context = assembly.gammaResearchContext;
  const features: GammaFeatureObservation[] = [];

  if (
    context &&
    context.engineState !== "UNAVAILABLE" &&
    context.sourceGexMetricState === "LIVE" &&
    context.sourceGexCoverageState === "COMPLETE"
  ) {
    if (context.gammaRegime !== "UNAVAILABLE") {
      features.push({
        featureType: "GAMMA_REGIME",
        bucketKey: context.gammaRegime,
        bucketLabel: context.gammaRegime.replace(/_/g, " "),
      });
    }

    const directionalWall =
      direction === "CALLS"
        ? context.callWalls[0] ?? null
        : context.putWalls[0] ?? null;
    const opposingWall =
      direction === "CALLS"
        ? context.putWalls[0] ?? null
        : context.callWalls[0] ?? null;
    const directionalWallFeature = wallFeature(
      "DIRECTIONAL_WALL_LOCATION",
      directionalWall,
      price,
      direction,
    );
    const opposingWallFeature = wallFeature(
      "OPPOSING_WALL_LOCATION",
      opposingWall,
      price,
      direction,
    );
    const cliffFeature = nearestCliffFeature(
      context.gammaCliffs,
      price,
      direction,
    );
    const transitionFeature = nearestSignTransitionFeature(
      context.gammaSignTransitions,
      price,
      direction,
    );
    for (const feature of [
      directionalWallFeature,
      opposingWallFeature,
      cliffFeature,
      transitionFeature,
    ]) {
      if (feature) features.push(feature);
    }
    return { completeness: "FULL_CONTEXT", features };
  }

  const regime = legacyGammaRegime(assembly);
  if (regime) {
    features.push({
      featureType: "GAMMA_REGIME",
      bucketKey: regime,
      bucketLabel: regime.replace(/_/g, " "),
    });
  }
  const legacyWallFeature = wallFeature(
    "DIRECTIONAL_WALL_LOCATION",
    legacyDirectionalWall(assembly),
    price,
    direction,
  );
  if (legacyWallFeature) features.push(legacyWallFeature);

  return {
    completeness:
      features.length > 0 ? "LEGACY_PARTIAL_CONTEXT" : "NO_GAMMA_CONTEXT",
    features,
  };
}

export function extractEmpiricalGammaResearchObservation(
  row: EmpiricalGammaResearchRow,
): ExtractionResult {
  if (
    row.planState !== "READY" ||
    !isResearchDirection(row.direction) ||
    !isTradeOutcome(row.outcomeState) ||
    row.realizedPnlDollars === null ||
    !Number.isFinite(row.realizedPnlDollars)
  ) {
    return { observation: null, invalidAssembly: false };
  }

  const assembly = parseAssembly(row.sourceAssembly);
  if (
    !assembly ||
    assembly.planState !== "READY" ||
    assembly.direction !== row.direction ||
    assembly.currentMarketDate !== row.currentMarketDate
  ) {
    return { observation: null, invalidAssembly: true };
  }
  const setupType = assembly.entryCondition.setupType ?? "UNAVAILABLE";
  const price = assembly.currentPrice;
  if (setupType === "UNAVAILABLE" || price === null || price <= 0) {
    return { observation: null, invalidAssembly: true };
  }

  const extracted = extractFeatures(assembly, price, row.direction);
  return {
    observation: {
      marketDate: assembly.currentMarketDate,
      setupType,
      direction: row.direction,
      outcomeState: row.outcomeState,
      realizedPnlDollars: row.realizedPnlDollars,
      contextCompleteness: extracted.completeness,
      features: extracted.features,
    },
    invalidAssembly: false,
  };
}

function wilsonInterval(
  wins: number,
  tradeCount: number,
): { lower: number; upper: number } | null {
  const n = tradeCount;
  if (n === 0) return null;
  const p = wins / n;
  const z2 = WILSON_Z_95 ** 2;
  const denominator = 1 + z2 / n;
  const center = (p + z2 / (2 * n)) / denominator;
  const margin =
    (WILSON_Z_95 / denominator) *
    Math.sqrt((p * (1 - p) + z2 / (4 * n)) / n);
  return {
    lower: Math.max(0, center - margin) * 100,
    upper: Math.min(1, center + margin) * 100,
  };
}

function metrics(
  observations: readonly GammaResearchObservation[],
): EmpiricalGammaResearchMetrics {
  const wins = observations.filter((item) => item.outcomeState === "WIN").length;
  const losses = observations.filter((item) => item.outcomeState === "LOSS").length;
  const breakevens = observations.filter(
    (item) => item.outcomeState === "BREAKEVEN",
  ).length;
  const tradeCount = observations.length;
  const totalPnl = observations.reduce(
    (total, item) => total + item.realizedPnlDollars,
    0,
  );
  const interval = wilsonInterval(wins, tradeCount);
  return {
    tradeCount,
    wins,
    losses,
    breakevens,
    winRatePercent:
      tradeCount === 0 ? null : round((wins / tradeCount) * 100),
    winRateWilsonLowerPercent: interval ? round(interval.lower) : null,
    winRateWilsonUpperPercent: interval ? round(interval.upper) : null,
    totalPnlDollars: tradeCount === 0 ? null : round(totalPnl),
    averagePnlDollars: tradeCount === 0 ? null : round(totalPnl / tradeCount),
    expectancyDollars: tradeCount === 0 ? null : round(totalPnl / tradeCount),
  };
}

function groupKey(
  setupType: TradeSetupType,
  direction: ResearchDirection,
): string {
  return `${setupType}|${direction}`;
}

interface FeatureIndexedObservation {
  observation: GammaResearchObservation;
  feature: GammaFeatureObservation;
}

function evidenceState(
  bucket: EmpiricalGammaResearchMetrics,
  comparator: EmpiricalGammaResearchMetrics,
  expectancyDelta: number | null,
): EmpiricalGammaResearchEvidenceState {
  if (
    bucket.tradeCount < EMPIRICAL_GAMMA_RESEARCH_MINIMUM_BUCKET_TRADES ||
    comparator.tradeCount < EMPIRICAL_GAMMA_RESEARCH_MINIMUM_COMPARATOR_TRADES
  ) {
    return "INSUFFICIENT_SAMPLE";
  }
  if (
    bucket.winRateWilsonLowerPercent === null ||
    bucket.winRateWilsonUpperPercent === null ||
    comparator.winRateWilsonLowerPercent === null ||
    comparator.winRateWilsonUpperPercent === null ||
    expectancyDelta === null
  ) {
    return "NO_CLEAR_SEPARATION";
  }
  if (
    bucket.winRateWilsonLowerPercent > comparator.winRateWilsonUpperPercent &&
    expectancyDelta > 0
  ) {
    return "POSITIVE_CANDIDATE";
  }
  if (
    bucket.winRateWilsonUpperPercent < comparator.winRateWilsonLowerPercent &&
    expectancyDelta < 0
  ) {
    return "NEGATIVE_CANDIDATE";
  }
  return "NO_CLEAR_SEPARATION";
}

function findings(
  observations: readonly GammaResearchObservation[],
): EmpiricalGammaResearchFinding[] {
  const indexed: FeatureIndexedObservation[] = observations.flatMap(
    (observation) =>
      observation.features.map((feature) => ({ observation, feature })),
  );
  const researchGroups = new Map<string, FeatureIndexedObservation[]>();
  for (const item of indexed) {
    const key = [
      item.observation.setupType,
      item.observation.direction,
      item.feature.featureType,
    ].join("|");
    const group = researchGroups.get(key) ?? [];
    group.push(item);
    researchGroups.set(key, group);
  }

  const result: EmpiricalGammaResearchFinding[] = [];
  for (const group of researchGroups.values()) {
    const bucketKeys = [...new Set(group.map((item) => item.feature.bucketKey))].sort();
    for (const bucketKey of bucketKeys) {
      const selected = group.filter((item) => item.feature.bucketKey === bucketKey);
      const comparator = group.filter((item) => item.feature.bucketKey !== bucketKey);
      const first = selected[0];
      if (!first) continue;
      const bucketMetrics = metrics(selected.map((item) => item.observation));
      const comparatorMetrics = metrics(
        comparator.map((item) => item.observation),
      );
      const winRateDeltaPercentagePoints =
        bucketMetrics.winRatePercent === null ||
        comparatorMetrics.winRatePercent === null
          ? null
          : round(
              bucketMetrics.winRatePercent - comparatorMetrics.winRatePercent,
            );
      const expectancyDeltaDollars =
        bucketMetrics.expectancyDollars === null ||
        comparatorMetrics.expectancyDollars === null
          ? null
          : round(
              bucketMetrics.expectancyDollars -
                comparatorMetrics.expectancyDollars,
            );
      const state = evidenceState(
        bucketMetrics,
        comparatorMetrics,
        expectancyDeltaDollars,
      );
      const weightingBlockers: EmpiricalGammaResearchFinding["weightingBlockers"] = [];
      if (
        bucketMetrics.tradeCount <
        EMPIRICAL_GAMMA_RESEARCH_MINIMUM_BUCKET_TRADES
      ) {
        weightingBlockers.push("MINIMUM_BUCKET_SAMPLE_NOT_MET");
      }
      if (
        comparatorMetrics.tradeCount <
        EMPIRICAL_GAMMA_RESEARCH_MINIMUM_COMPARATOR_TRADES
      ) {
        weightingBlockers.push("MINIMUM_COMPARATOR_SAMPLE_NOT_MET");
      }
      weightingBlockers.push(
        "HOLDOUT_VALIDATION_MISSING",
        "OBSERVATIONAL_USER_ENTERED_OUTCOMES_ONLY",
      );
      result.push({
        setupType: first.observation.setupType,
        direction: first.observation.direction,
        featureType: first.feature.featureType,
        bucketKey,
        bucketLabel: first.feature.bucketLabel,
        bucketMetrics,
        comparatorMetrics,
        winRateDeltaPercentagePoints,
        expectancyDeltaDollars,
        evidenceState: state,
        fullContextObservationCount: selected.filter(
          (item) => item.observation.contextCompleteness === "FULL_CONTEXT",
        ).length,
        legacyContextObservationCount: selected.filter(
          (item) =>
            item.observation.contextCompleteness === "LEGACY_PARTIAL_CONTEXT",
        ).length,
        eligibleForDirectionalWeight: false,
        weightingBlockers,
      });
    }
  }

  const evidenceRank: Record<EmpiricalGammaResearchEvidenceState, number> = {
    POSITIVE_CANDIDATE: 0,
    NEGATIVE_CANDIDATE: 1,
    NO_CLEAR_SEPARATION: 2,
    INSUFFICIENT_SAMPLE: 3,
  };
  return result.sort((left, right) => {
    const evidenceDifference =
      evidenceRank[left.evidenceState] - evidenceRank[right.evidenceState];
    if (evidenceDifference !== 0) return evidenceDifference;
    if (right.bucketMetrics.tradeCount !== left.bucketMetrics.tradeCount) {
      return right.bucketMetrics.tradeCount - left.bucketMetrics.tradeCount;
    }
    return [left.setupType, left.direction, left.featureType, left.bucketKey]
      .join("|")
      .localeCompare(
        [right.setupType, right.direction, right.featureType, right.bucketKey].join(
          "|",
        ),
      );
  });
}

export function buildEmpiricalGammaResearchPayload(
  rows: readonly EmpiricalGammaResearchRow[],
  totalPersistedSnapshots = rows.length,
): EmpiricalGammaResearchPayload {
  const reviewedTradeRows = rows.filter((row) => isTradeOutcome(row.outcomeState));
  const readyReviewedTradeRows = reviewedTradeRows.filter(
    (row) => row.planState === "READY",
  );
  const observations: GammaResearchObservation[] = [];
  let skippedInvalidAssemblies = 0;
  for (const row of readyReviewedTradeRows) {
    const extracted = extractEmpiricalGammaResearchObservation(row);
    if (extracted.observation) observations.push(extracted.observation);
    if (extracted.invalidAssembly) skippedInvalidAssemblies += 1;
  }

  const baselineGroups = new Map<string, GammaResearchObservation[]>();
  for (const observation of observations) {
    const key = groupKey(observation.setupType, observation.direction);
    const group = baselineGroups.get(key) ?? [];
    group.push(observation);
    baselineGroups.set(key, group);
  }
  const baselines = [...baselineGroups.values()]
    .map((group) => ({
      setupType: group[0]!.setupType,
      direction: group[0]!.direction,
      metrics: metrics(group),
    }))
    .sort((left, right) =>
      groupKey(left.setupType, left.direction).localeCompare(
        groupKey(right.setupType, right.direction),
      ),
    );
  const marketDates = observations.map((item) => item.marketDate).sort();

  return {
    dataStartMarketDate: marketDates[0] ?? null,
    dataEndMarketDate: marketDates.at(-1) ?? null,
    counts: {
      totalPersistedSnapshots,
      reviewedTradeOutcomeSnapshots: reviewedTradeRows.length,
      readyReviewedTradeSnapshots: readyReviewedTradeRows.length,
      eligibleResearchObservations: observations.length,
      skippedNonReadyReviewedTrades:
        reviewedTradeRows.length - readyReviewedTradeRows.length,
      skippedInvalidAssemblies,
      fullContextObservations: observations.filter(
        (item) => item.contextCompleteness === "FULL_CONTEXT",
      ).length,
      legacyPartialContextObservations: observations.filter(
        (item) => item.contextCompleteness === "LEGACY_PARTIAL_CONTEXT",
      ).length,
      noGammaContextObservations: observations.filter(
        (item) => item.contextCompleteness === "NO_GAMMA_CONTEXT",
      ).length,
    },
    baselines,
    findings: findings(observations),
    thresholds: {
      nearLevelPercent: EMPIRICAL_GAMMA_RESEARCH_NEAR_LEVEL_PERCENT,
      minimumBucketTradeCount:
        EMPIRICAL_GAMMA_RESEARCH_MINIMUM_BUCKET_TRADES,
      minimumComparatorTradeCount:
        EMPIRICAL_GAMMA_RESEARCH_MINIMUM_COMPARATOR_TRADES,
      confidenceInterval: "WILSON_95_PERCENT",
      positiveCandidateRule:
        "NONOVERLAPPING_WIN_RATE_INTERVAL_AND_POSITIVE_EXPECTANCY_DELTA",
      negativeCandidateRule:
        "NONOVERLAPPING_WIN_RATE_INTERVAL_AND_NEGATIVE_EXPECTANCY_DELTA",
    },
    weightingPolicy: {
      automaticDirectionalWeightingEnabled: false,
      holdoutValidationPresent: false,
      minimumOutOfSampleTradeCountBeforeWeightingReview: 50,
    },
  };
}

export function buildEmpiricalGammaResearchResponse(
  rows: readonly EmpiricalGammaResearchRow[],
  calculatedAt: Date,
  totalPersistedSnapshots = rows.length,
): EmpiricalGammaResearchResponse {
  const research = buildEmpiricalGammaResearchPayload(
    rows,
    totalPersistedSnapshots,
  );
  return EmpiricalGammaResearchResponseSchema.parse({
    symbol: "SPY",
    product: "SPY_ZERO_DTE_EMPIRICAL_GAMMA_RESEARCH",
    methodologyVersion: "EMPIRICAL_GAMMA_RESEARCH_V1",
    calculatedAt: calculatedAt.toISOString(),
    engineState: "AVAILABLE",
    primaryReasonCode:
      research.counts.eligibleResearchObservations > 0
        ? "GAMMA_RESEARCH_AVAILABLE"
        : "GAMMA_RESEARCH_EMPTY",
    research,
    disclosures: DISCLOSURES,
  });
}

export function buildEmpiricalGammaResearchUnavailableResponse(
  reason: "DATABASE_NOT_CONFIGURED" | "DATABASE_UNAVAILABLE",
  calculatedAt: Date,
): EmpiricalGammaResearchResponse {
  return EmpiricalGammaResearchResponseSchema.parse({
    symbol: "SPY",
    product: "SPY_ZERO_DTE_EMPIRICAL_GAMMA_RESEARCH",
    methodologyVersion: "EMPIRICAL_GAMMA_RESEARCH_V1",
    calculatedAt: calculatedAt.toISOString(),
    engineState: "UNAVAILABLE",
    primaryReasonCode: reason,
    research: null,
    disclosures: DISCLOSURES,
  });
}
