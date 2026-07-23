import {
  SpyZeroDteDeterministicTradePlanResponseSchema,
  type BiasEvidenceItem,
  type SpyZeroDteDeterministicBiasResponse,
  type SpyZeroDteDeterministicMarketStateResponse,
  type SpyZeroDteDeterministicTradePlanResponse,
  type TradePlanGate,
  type TradePlanGateReasonCode,
  type TradePlanGateStatus,
  type TradePlanOverallWarningCode,
  type TradePlanPrimaryReasonCode,
  type TradeSetupDirection,
  type TradeSetupState,
  type TradeTriggerComparison,
} from "@spy-copilot/shared";
import { buildTradePlanExposureConfirmation } from "./trade-plan-exposure.logic";
import {
  FIVE_MINUTES_MS,
  getObservedMarketDate,
  getObservedMarketMinute,
} from "./session-data.logic";

export const TRADE_PLAN_METHODOLOGY_VERSION = "TRADE_PLAN_V3" as const;

const GATE_ORDER = [
  "MARKET_STATE_AVAILABLE",
  "SAME_SNAPSHOT_GUARANTEED",
  "SESSION_IS_RTH",
  "OPENING_RANGE_COMPLETE",
  "CURRENT_SESSION_DATES_COMPATIBLE",
  "BIAS_AVAILABLE",
  "DIRECTIONAL_BIAS_PRESENT",
  "SOURCE_QUALITY_COMPLETE",
  "COUNTEREVIDENCE_POLICY_PASSED",
  "TRIGGER_INPUTS_VALID",
  "VWAP_ALIGNED",
  "OPENING_RANGE_ALIGNED",
  "TRIGGER_SATISFIED",
] as const;

function finitePositive(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value) && value > 0;
}

function staleWarning(warningCode: string | null): boolean {
  return warningCode?.includes("STALE") ?? false;
}

export interface TriggerCalculation {
  level: number;
  comparison: TradeTriggerComparison;
  satisfied: boolean;
  signedDistancePoints: number;
  vwap: number;
  openingRangeBoundary: number;
  setupType: "OPENING_RANGE_BREAKOUT" | "VWAP_RECLAIM_BREAKOUT" | "VWAP_LOSS_BREAKDOWN" | "CONFLUENCE_BREAKOUT";
}

export function calculateCallsTrigger(
  currentPrice: number,
  vwap: number,
  openingRangeHigh: number,
): TriggerCalculation | null {
  if (![currentPrice, vwap, openingRangeHigh].every(finitePositive)) return null;
  const level = Math.max(vwap, openingRangeHigh);
  const signedDistancePoints = currentPrice - level;
  if (!Number.isFinite(level) || !Number.isFinite(signedDistancePoints)) return null;
  return {
    level,
    comparison: "PRICE_GREATER_THAN",
    satisfied: currentPrice > level,
    signedDistancePoints,
    vwap,
    openingRangeBoundary: openingRangeHigh,
    setupType:
      vwap === openingRangeHigh
        ? "CONFLUENCE_BREAKOUT"
        : level === openingRangeHigh
          ? "OPENING_RANGE_BREAKOUT"
          : "VWAP_RECLAIM_BREAKOUT",
  };
}

export function calculatePutsTrigger(
  currentPrice: number,
  vwap: number,
  openingRangeLow: number,
): TriggerCalculation | null {
  if (![currentPrice, vwap, openingRangeLow].every(finitePositive)) return null;
  const level = Math.min(vwap, openingRangeLow);
  const signedDistancePoints = level - currentPrice;
  if (!Number.isFinite(level) || !Number.isFinite(signedDistancePoints)) return null;
  return {
    level,
    comparison: "PRICE_LESS_THAN",
    satisfied: currentPrice < level,
    signedDistancePoints,
    vwap,
    openingRangeBoundary: openingRangeLow,
    setupType:
      vwap === openingRangeLow
        ? "CONFLUENCE_BREAKOUT"
        : level === openingRangeLow
          ? "OPENING_RANGE_BREAKOUT"
          : "VWAP_LOSS_BREAKDOWN",
  };
}

const MAXIMUM_ALLOWED_RECROSSES = 2 as const;
const MINIMUM_VOLUME_RATIO = 0.8 as const;
const MAXIMUM_RETEST_BARS = 6 as const;
const OPENING_RANGE_COMPLETION_MINUTE = 9 * 60 + 45;

type TriggerConfirmation = NonNullable<
  SpyZeroDteDeterministicTradePlanResponse["trigger"]["confirmation"]
>;
type TriggerWarningCode = TriggerConfirmation["warningCodes"][number];
type CompletedExecutionCandle = NonNullable<
  SpyZeroDteDeterministicMarketStateResponse["executionContext"]
>["recentCompletedCandles"][number];

function emptyConfirmation(
  lifecycleState: TriggerConfirmation["lifecycleState"] = "NOT_APPLICABLE",
): TriggerConfirmation {
  return {
    methodologyVersion: "TRIGGER_CONFIRMATION_V2",
    mode: lifecycleState === "UNAVAILABLE" ? "UNAVAILABLE" : "LEGACY_FALLBACK",
    lifecycleState,
    rawCrossSatisfied: null,
    currentRawCrossSatisfied: null,
    dynamicBufferPoints: null,
    bufferedTriggerLevel: null,
    latestCompletedClose: null,
    previousCompletedClose: null,
    completedCloseConfirmed: null,
    confirmationCandleAt: null,
    confirmationCandleClose: null,
    confirmationExtensionPoints: null,
    maximumObservedCloseExtensionPoints: null,
    currentPriceMaintained: null,
    retestRequired: null,
    retestObserved: null,
    retestHeld: null,
    retestCandleAt: null,
    retestCandleClose: null,
    retestZoneLower: null,
    retestZoneUpper: null,
    retestTolerancePoints: null,
    barsSinceConfirmation: null,
    maximumRetestBars: null,
    postRetestChaseDistancePoints: null,
    recrossCount: null,
    maximumAllowedRecrosses: MAXIMUM_ALLOWED_RECROSSES,
    medianRangePoints: null,
    latestVolumeRatio: null,
    minimumVolumeRatio: MINIMUM_VOLUME_RATIO,
    volumeConfirmed: null,
    chaseDistancePoints: null,
    maximumChaseDistancePoints: null,
    chasePassed: null,
    confirmationPassed: null,
    warningCodes: lifecycleState === "UNAVAILABLE" ? ["EXECUTION_CONTEXT_UNAVAILABLE"] : [],
  };
}

function median(values: readonly number[]): number | null {
  const sorted = values.filter((value) => Number.isFinite(value)).sort((a, b) => a - b);
  if (sorted.length === 0) return null;
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 1
    ? sorted[middle]!
    : (sorted[middle - 1]! + sorted[middle]!) / 2;
}

function sideOfLevel(value: number, level: number): -1 | 0 | 1 {
  return value > level ? 1 : value < level ? -1 : 0;
}

function countRecrosses(closes: readonly number[], level: number): number {
  let previous: -1 | 0 | 1 | null = null;
  let crosses = 0;
  for (const close of closes) {
    const current = sideOfLevel(close, level);
    if (current === 0) continue;
    if (previous !== null && current !== previous) crosses += 1;
    previous = current;
  }
  return crosses;
}

function directionDistance(
  direction: "CALLS" | "PUTS",
  value: number,
  reference: number,
): number {
  return direction === "CALLS" ? value - reference : reference - value;
}

function closeBeyond(
  direction: "CALLS" | "PUTS",
  close: number,
  level: number,
): boolean {
  return direction === "CALLS" ? close > level : close < level;
}

function candleCrossedRaw(
  direction: "CALLS" | "PUTS",
  candle: CompletedExecutionCandle,
  level: number,
): boolean {
  return direction === "CALLS" ? candle.high > level : candle.low < level;
}

function candleInvalidatedRaw(
  direction: "CALLS" | "PUTS",
  candle: CompletedExecutionCandle,
  level: number,
): boolean {
  return direction === "CALLS" ? candle.close < level : candle.close > level;
}

function candleCompletionIso(candle: CompletedExecutionCandle): string {
  return new Date(candle.timestamp + FIVE_MINUTES_MS).toISOString();
}

function volumeRatioAt(
  candles: readonly CompletedExecutionCandle[],
  index: number,
): number | null {
  const prior = candles.slice(Math.max(0, index - 5), index).map((item) => item.volume);
  const priorMedian = median(prior);
  if (priorMedian === null || priorMedian <= 0) return null;
  return candles[index]!.volume / priorMedian;
}

function currentMarketConfirmationCandles(
  marketState: SpyZeroDteDeterministicMarketStateResponse,
): CompletedExecutionCandle[] {
  const currentDate = marketState.currentMarketDate;
  return [...(marketState.executionContext?.recentCompletedCandles ?? [])]
    .filter((candle) => {
      const completedAt = candle.timestamp + FIVE_MINUTES_MS;
      return (
        getObservedMarketDate(completedAt) === currentDate &&
        getObservedMarketMinute(completedAt) >= OPENING_RANGE_COMPLETION_MINUTE
      );
    })
    .sort((left, right) => left.timestamp - right.timestamp);
}

function findLatestConfirmationEpisode(
  candles: readonly CompletedExecutionCandle[],
  direction: "CALLS" | "PUTS",
  rawTriggerLevel: number,
  bufferedTriggerLevel: number,
): number | null {
  let latestStart: number | null = null;
  let confirmationExistsInRawSideEpisode = false;

  for (let index = 0; index < candles.length; index += 1) {
    const candle = candles[index]!;

    // A close through the raw trigger ends the prior episode. A pullback that
    // remains on the valid side of the raw trigger is still the same episode
    // and may become the qualifying retest; it must not be mistaken for a new
    // breakout confirmation merely because it dipped under the buffer.
    if (candleInvalidatedRaw(direction, candle, rawTriggerLevel)) {
      confirmationExistsInRawSideEpisode = false;
      continue;
    }

    if (
      !confirmationExistsInRawSideEpisode &&
      closeBeyond(direction, candle.close, bufferedTriggerLevel)
    ) {
      latestStart = index;
      confirmationExistsInRawSideEpisode = true;
    }
  }

  return latestStart;
}

function retestZone(
  direction: "CALLS" | "PUTS",
  rawTriggerLevel: number,
  bufferedTriggerLevel: number,
  tolerancePoints: number,
): { lower: number; upper: number } {
  return direction === "CALLS"
    ? {
        lower: rawTriggerLevel,
        upper: bufferedTriggerLevel + tolerancePoints,
      }
    : {
        lower: bufferedTriggerLevel - tolerancePoints,
        upper: rawTriggerLevel,
      };
}

function candleOverlapsZone(
  candle: CompletedExecutionCandle,
  lower: number,
  upper: number,
): boolean {
  return candle.low <= upper && candle.high >= lower;
}

/**
 * TRIGGER_CONFIRMATION_V2 is intentionally derived from completed five-minute
 * candles so live analysis and historical replay execute the same state
 * machine. An extended confirmation is not invalidated merely because it ran;
 * it enters WAITING_FOR_RETEST until a bounded retest holds or the setup loses
 * the raw level / expires.
 */
export function buildTradeTriggerConfirmation(
  marketState: SpyZeroDteDeterministicMarketStateResponse,
  direction: "CALLS" | "PUTS",
  trigger: TriggerCalculation,
): TriggerConfirmation {
  const currentPrice = marketState.price;
  if (!finitePositive(currentPrice)) return emptyConfirmation("UNAVAILABLE");

  const execution = marketState.executionContext;
  const currentRawCrossSatisfied = trigger.satisfied;
  if (!execution) {
    return {
      ...emptyConfirmation("UNAVAILABLE"),
      mode: "UNAVAILABLE",
      rawCrossSatisfied: currentRawCrossSatisfied,
      currentRawCrossSatisfied,
      bufferedTriggerLevel: trigger.level,
      currentPriceMaintained: currentRawCrossSatisfied,
      chaseDistancePoints: Math.abs(currentPrice - trigger.level),
      confirmationPassed: false,
      warningCodes: ["EXECUTION_CONTEXT_UNAVAILABLE"],
    };
  }

  const candles = currentMarketConfirmationCandles(marketState);
  const medianRangePoints = execution.medianRangePoints;
  const dynamicBufferPoints = Math.max(
    0.03,
    Math.min(0.25, (medianRangePoints ?? 0.2) * 0.15),
  );
  const bufferedTriggerLevel =
    direction === "CALLS"
      ? trigger.level + dynamicBufferPoints
      : trigger.level - dynamicBufferPoints;
  const maximumChaseDistancePoints = Math.max(
    0.15,
    Math.min(0.75, (medianRangePoints ?? 0.4) * 0.75),
  );
  const retestTolerancePoints = Math.max(
    0.03,
    Math.min(0.2, (medianRangePoints ?? 0.4) * 0.25),
  );
  const zone = retestZone(
    direction,
    trigger.level,
    bufferedTriggerLevel,
    retestTolerancePoints,
  );
  const latest = candles[candles.length - 1] ?? null;
  const previous = candles[candles.length - 2] ?? null;
  const latestCompletedClose = latest?.close ?? null;
  const previousCompletedClose = previous?.close ?? null;
  const currentPriceMaintained = closeBeyond(
    direction,
    currentPrice,
    bufferedTriggerLevel,
  );
  const episodeStartIndex = findLatestConfirmationEpisode(
    candles,
    direction,
    trigger.level,
    bufferedTriggerLevel,
  );
  const confirmationCandle =
    episodeStartIndex === null ? null : candles[episodeStartIndex] ?? null;
  const completedCloseConfirmed = confirmationCandle !== null;
  const historicalRawCrossObserved = candles.some((candle) =>
    candleCrossedRaw(direction, candle, trigger.level),
  );
  const rawCrossSatisfied =
    currentRawCrossSatisfied || historicalRawCrossObserved || completedCloseConfirmed;
  const confirmationExtensionPoints = confirmationCandle
    ? Math.max(
        0,
        directionDistance(direction, confirmationCandle.close, trigger.level),
      )
    : null;
  const episodeCandles =
    episodeStartIndex === null ? [] : candles.slice(episodeStartIndex);
  const maximumObservedCloseExtensionPoints =
    episodeCandles.length === 0
      ? null
      : Math.max(
          ...episodeCandles.map((candle) =>
            Math.max(0, directionDistance(direction, candle.close, trigger.level)),
          ),
        );
  const confirmationChasePassed =
    confirmationExtensionPoints !== null &&
    confirmationExtensionPoints <= maximumChaseDistancePoints;
  const episodeCloseChasePassed =
    maximumObservedCloseExtensionPoints !== null &&
    maximumObservedCloseExtensionPoints <= maximumChaseDistancePoints;
  const confirmationVolumeRatio =
    episodeStartIndex === null ? null : volumeRatioAt(candles, episodeStartIndex);
  const confirmationVolumePassed =
    confirmationVolumeRatio === null ||
    confirmationVolumeRatio >= MINIMUM_VOLUME_RATIO;
  const barsSinceConfirmation =
    episodeStartIndex === null ? null : candles.length - 1 - episodeStartIndex;
  const postConfirmationCandles =
    episodeStartIndex === null ? [] : candles.slice(episodeStartIndex + 1);
  const boundedRetestCandles = postConfirmationCandles.slice(0, MAXIMUM_RETEST_BARS);
  const retestObserved = boundedRetestCandles.some((candle) =>
    candleOverlapsZone(candle, zone.lower, zone.upper),
  );
  const heldRetestCandles = boundedRetestCandles.filter((candle) => {
    const retestCloseDistancePoints = directionDistance(
      direction,
      candle.close,
      trigger.level,
    );
    return (
      candleOverlapsZone(candle, zone.lower, zone.upper) &&
      closeBeyond(direction, candle.close, bufferedTriggerLevel) &&
      retestCloseDistancePoints <= maximumChaseDistancePoints
    );
  });
  const retestCandle = heldRetestCandles.at(-1) ?? null;
  const latestVolumeRatio = confirmationVolumeRatio;
  const volumeConfirmed = confirmationVolumePassed;
  const retestRequired =
    completedCloseConfirmed &&
    (!confirmationChasePassed ||
      !episodeCloseChasePassed ||
      Math.abs(currentPrice - trigger.level) > maximumChaseDistancePoints);
  const postRetestChaseDistancePoints = retestCandle
    ? Math.abs(currentPrice - retestCandle.close)
    : null;
  const postRetestChasePassed =
    postRetestChaseDistancePoints !== null &&
    postRetestChaseDistancePoints <= maximumChaseDistancePoints;
  const retestHeld =
    retestRequired &&
    retestCandle !== null &&
    currentPriceMaintained &&
    postRetestChasePassed;
  const invalidatingCandle = postConfirmationCandles.find((candle) =>
    candleInvalidatedRaw(direction, candle, trigger.level),
  ) ?? null;
  const retestWindowExpired =
    completedCloseConfirmed &&
    retestRequired &&
    !retestHeld &&
    (barsSinceConfirmation ?? 0) >= MAXIMUM_RETEST_BARS;
  // Recross policy is scoped to the active confirmation episode and the
  // buffered trigger. A prior failed breakout must not permanently poison a
  // later clean reclaim, while repeated post-confirmation buffer crossings
  // still identify chop inside the active setup.
  const recrossCount = countRecrosses(
    episodeCandles.map((item) => item.close),
    bufferedTriggerLevel,
  );
  const recrossPassed = recrossCount <= MAXIMUM_ALLOWED_RECROSSES;
  const chaseDistancePoints = Math.abs(currentPrice - trigger.level);
  const currentChasePassed = chaseDistancePoints <= maximumChaseDistancePoints;
  const immediateEntryPassed =
    completedCloseConfirmed &&
    confirmationChasePassed &&
    currentChasePassed &&
    currentPriceMaintained;
  const chasePassed = immediateEntryPassed || retestHeld;
  const confirmationPassed =
    completedCloseConfirmed &&
    currentPriceMaintained &&
    recrossPassed &&
    volumeConfirmed &&
    invalidatingCandle === null &&
    (immediateEntryPassed || retestHeld);

  const warningCodes: TriggerWarningCode[] = [];
  if (!rawCrossSatisfied) warningCodes.push("TRIGGER_CROSS_NOT_DETECTED");
  if (rawCrossSatisfied && !completedCloseConfirmed) {
    warningCodes.push("COMPLETED_CLOSE_NOT_CONFIRMED");
  }
  if (completedCloseConfirmed && !currentPriceMaintained) {
    warningCodes.push("CURRENT_PRICE_NOT_MAINTAINED");
  }
  if (!recrossPassed) warningCodes.push("EXCESSIVE_LEVEL_RECROSSES");
  if (!volumeConfirmed) warningCodes.push("BREAKOUT_VOLUME_INSUFFICIENT");
  if (
    completedCloseConfirmed &&
    (!confirmationChasePassed ||
      !episodeCloseChasePassed ||
      !currentChasePassed)
  ) {
    warningCodes.push("MAXIMUM_CHASE_DISTANCE_EXCEEDED");
  }
  if (retestRequired && !retestHeld && invalidatingCandle === null && !retestWindowExpired) {
    warningCodes.push("RETEST_REQUIRED");
    warningCodes.push(retestObserved ? "RETEST_NOT_HELD" : "RETEST_NOT_YET_OBSERVED");
  }
  if (retestCandle !== null && !postRetestChasePassed) {
    warningCodes.push("POST_RETEST_CHASE_DISTANCE_EXCEEDED");
  }
  if (invalidatingCandle !== null) warningCodes.push("RETEST_LEVEL_LOST");
  if (retestWindowExpired) warningCodes.push("RETEST_WINDOW_EXPIRED");

  const lifecycleState: TriggerConfirmation["lifecycleState"] =
    invalidatingCandle !== null || !recrossPassed || retestWindowExpired
      ? "INVALIDATED"
      : confirmationPassed
        ? retestHeld
          ? "RETESTED"
          : "READY"
        : completedCloseConfirmed && retestRequired
          ? "WAITING_FOR_RETEST"
          : completedCloseConfirmed
            ? "CONFIRMED"
            : rawCrossSatisfied
              ? "DETECTED"
              : "ARMED";

  return {
    methodologyVersion: "TRIGGER_CONFIRMATION_V2",
    mode: "COMPLETED_5M_CANDLE",
    lifecycleState,
    rawCrossSatisfied,
    currentRawCrossSatisfied,
    dynamicBufferPoints,
    bufferedTriggerLevel,
    latestCompletedClose,
    previousCompletedClose,
    completedCloseConfirmed,
    confirmationCandleAt: confirmationCandle
      ? candleCompletionIso(confirmationCandle)
      : null,
    confirmationCandleClose: confirmationCandle?.close ?? null,
    confirmationExtensionPoints,
    maximumObservedCloseExtensionPoints,
    currentPriceMaintained,
    retestRequired,
    retestObserved,
    retestHeld,
    retestCandleAt: retestCandle ? candleCompletionIso(retestCandle) : null,
    retestCandleClose: retestCandle?.close ?? null,
    retestZoneLower: zone.lower,
    retestZoneUpper: zone.upper,
    retestTolerancePoints,
    barsSinceConfirmation,
    maximumRetestBars: MAXIMUM_RETEST_BARS,
    postRetestChaseDistancePoints,
    recrossCount,
    maximumAllowedRecrosses: MAXIMUM_ALLOWED_RECROSSES,
    medianRangePoints,
    latestVolumeRatio,
    minimumVolumeRatio: MINIMUM_VOLUME_RATIO,
    volumeConfirmed,
    chaseDistancePoints,
    maximumChaseDistancePoints,
    chasePassed,
    confirmationPassed,
    warningCodes,
  };
}

function buildTradeQuality(
  marketState: SpyZeroDteDeterministicMarketStateResponse,
  bias: SpyZeroDteDeterministicBiasResponse,
  candidateDirection: "CALLS" | "PUTS" | null,
  minorCounterevidenceCount: number,
  materialCounterevidenceCount: number,
  snapshotState: "COHERENT" | "SKEWED" | "UNAVAILABLE" | null,
  confirmation: NonNullable<SpyZeroDteDeterministicTradePlanResponse["trigger"]["confirmation"]>,
) {
  const base = bias.confidenceScore;
  const direction = candidateDirection;
  const aligned = (bullishState: string, bearishState: string, state: string | null) =>
    direction === "CALLS" ? state === bullishState : direction === "PUTS" ? state === bearishState : false;

  const vwapBehavior = aligned("ABOVE", "BELOW", marketState.features.priceVsVwap.state)
    ? 20
    : 0;

  const structuralStates = [
    marketState.features.priceVsPriorDayRange.state,
    marketState.features.priceVsPremarketRange.state,
    marketState.features.priceVsOpeningRange.state,
  ];
  const supportiveStructureCount = structuralStates.filter((state) =>
    aligned("ABOVE_RANGE", "BELOW_RANGE", state),
  ).length;
  // Session-location observations are correlated; the entire family is capped at 20.
  const sessionStructure = Math.min(20, supportiveStructureCount * (20 / 3));

  let triggerConfirmation = 0;
  if (confirmation.rawCrossSatisfied) triggerConfirmation += 6;
  if (confirmation.completedCloseConfirmed) triggerConfirmation += 10;
  if (confirmation.currentPriceMaintained) triggerConfirmation += 5;
  if ((confirmation.recrossCount ?? 99) <= confirmation.maximumAllowedRecrosses) triggerConfirmation += 3;
  if (confirmation.volumeConfirmed) triggerConfirmation += 3;
  if (confirmation.chasePassed) triggerConfirmation += 3;
  triggerConfirmation = Math.min(30, triggerConfirmation);

  const ratio = confirmation.latestVolumeRatio;
  const participation = ratio === null
    ? 7.5
    : ratio >= 1.2
      ? 15
      : ratio >= 1
        ? 12
        : ratio >= 0.8
          ? 8
          : 0;

  const dataIntegrity = snapshotState === "COHERENT" || snapshotState === null
    ? 15
    : snapshotState === "UNAVAILABLE"
      ? 5
      : 0;

  const familyScores = {
    vwapBehavior,
    sessionStructure,
    triggerConfirmation,
    participation,
    dataIntegrity,
  };
  const familyScoreTotal = Object.values(familyScores).reduce((sum, value) => sum + value, 0);
  const minorPenalty = Math.min(30, minorCounterevidenceCount * 5);
  const materialPenalty = Math.min(60, materialCounterevidenceCount * 20);
  const snapshotPenalty = snapshotState === "SKEWED" ? 20 : snapshotState === "UNAVAILABLE" ? 10 : 0;
  const confirmationAdjustment = confirmation.confirmationPassed
    ? confirmation.retestObserved
      ? 5
      : 2
    : confirmation.rawCrossSatisfied
      ? -10
      : -5;
  const finalAlignmentScore = direction === null
    ? null
    : Math.min(
        100,
        Math.max(
          0,
          familyScoreTotal - minorPenalty - materialPenalty - snapshotPenalty + confirmationAdjustment,
        ),
      );
  return {
    methodologyVersion: "TRADE_QUALITY_V1" as const,
    scope: "UNCALIBRATED_ALIGNMENT_SCORE_NOT_WIN_PROBABILITY" as const,
    baseStructuralScore: base,
    familyScores,
    familyScoreTotal,
    minorCounterevidencePenaltyPoints: minorPenalty,
    materialCounterevidencePenaltyPoints: materialPenalty,
    snapshotPenaltyPoints: snapshotPenalty,
    confirmationAdjustmentPoints: confirmationAdjustment,
    finalAlignmentScore,
  };
}

function notEvaluatedGate(gateId: (typeof GATE_ORDER)[number]): TradePlanGate {
  const common = {
    status: "NOT_APPLICABLE" as const,
    requiredForEligibility: true,
    reasonCode: "GATE_NOT_EVALUATED" as const,
    warningCode: null,
  };
  switch (gateId) {
    case "MARKET_STATE_AVAILABLE":
      return {
        gateId,
        ...common,
        category: "INPUT",
        sourceFeatureIds: [],
        observedValues: { marketStateEngineState: "UNAVAILABLE", currentPriceAvailable: false },
      };
    case "SAME_SNAPSHOT_GUARANTEED":
      return {
        gateId,
        ...common,
        category: "INPUT",
        sourceFeatureIds: [],
        observedValues: {
          marketStateCalculatedAt: new Date(0).toISOString(),
          biasSourceMarketStateCalculatedAt: new Date(0).toISOString(),
          sameSnapshotGuaranteed: false,
          rawSnapshotIntegrityState: null,
          marketStructureSkewMilliseconds: null,
          maximumMarketStructureSkewMilliseconds: null,
        },
      };
    case "SESSION_IS_RTH":
      return {
        gateId,
        ...common,
        category: "APPLICABILITY",
        sourceFeatureIds: ["SESSION_PHASE"],
        observedValues: { sessionPhase: null, featureStatus: "UNAVAILABLE" },
      };
    case "OPENING_RANGE_COMPLETE":
      return {
        gateId,
        ...common,
        category: "APPLICABILITY",
        sourceFeatureIds: ["PRICE_VS_OPENING_RANGE"],
        observedValues: { phase: "UNAVAILABLE", featureState: null, featureStatus: "UNAVAILABLE" },
      };
    case "CURRENT_SESSION_DATES_COMPATIBLE":
      return {
        gateId,
        ...common,
        category: "INPUT",
        sourceFeatureIds: ["SESSION_PHASE", "PRICE_VS_VWAP", "PRICE_VS_OPENING_RANGE"],
        observedValues: {
          currentMarketDate: "1970-01-01",
          sessionReferenceDate: null,
          vwapReferenceDate: null,
          openingRangeReferenceDate: null,
        },
      };
    case "BIAS_AVAILABLE":
      return {
        gateId,
        ...common,
        category: "DIRECTION",
        sourceFeatureIds: [],
        observedValues: { biasState: "UNAVAILABLE", biasEngineState: "UNAVAILABLE" },
      };
    case "DIRECTIONAL_BIAS_PRESENT":
      return {
        gateId,
        ...common,
        category: "DIRECTION",
        sourceFeatureIds: [],
        observedValues: { biasState: "UNAVAILABLE" },
      };
    case "SOURCE_QUALITY_COMPLETE":
      return {
        gateId,
        ...common,
        category: "QUALITY",
        sourceFeatureIds: ["SESSION_PHASE", "PRICE_VS_VWAP", "PRICE_VS_OPENING_RANGE"],
        observedValues: {
          biasEngineState: "UNAVAILABLE",
          biasSourceQuality: "UNAVAILABLE",
          sessionFeatureStatus: "UNAVAILABLE",
          vwapFeatureStatus: "UNAVAILABLE",
          openingRangeFeatureStatus: "UNAVAILABLE",
        },
      };
    case "COUNTEREVIDENCE_POLICY_PASSED":
      return {
        gateId,
        ...common,
        category: "COUNTEREVIDENCE",
        sourceFeatureIds: [],
        observedValues: { candidateDirection: null, opposingEvidenceCount: 0, minorOpposingEvidenceCount: 0, materialOpposingEvidenceCount: 0, maximumMinorOpposingEvidenceAllowed: 1 },
      };
    case "TRIGGER_INPUTS_VALID":
      return {
        gateId,
        ...common,
        category: "INPUT",
        sourceFeatureIds: ["PRICE_VS_VWAP", "PRICE_VS_OPENING_RANGE"],
        observedValues: {
          currentPrice: null,
          vwap: null,
          openingRangeHigh: null,
          openingRangeLow: null,
        },
      };
    case "VWAP_ALIGNED":
      return {
        gateId,
        ...common,
        category: "DIRECTION",
        sourceFeatureIds: ["PRICE_VS_VWAP"],
        observedValues: { candidateDirection: null, priceVsVwapState: null },
      };
    case "OPENING_RANGE_ALIGNED":
      return {
        gateId,
        ...common,
        category: "DIRECTION",
        sourceFeatureIds: ["PRICE_VS_OPENING_RANGE"],
        observedValues: { candidateDirection: null, priceVsOpeningRangeState: null },
      };
    case "TRIGGER_SATISFIED":
      return {
        gateId,
        ...common,
        category: "TRIGGER",
        sourceFeatureIds: ["PRICE_VS_VWAP", "PRICE_VS_OPENING_RANGE"],
        observedValues: {
          candidateDirection: null,
          currentPrice: null,
          triggerLevel: null,
          comparison: null,
          satisfied: null,
          rawCrossSatisfied: null,
          lifecycleState: null,
          confirmationPassed: null,
        },
      };
  }
}

function setGate(gates: TradePlanGate[], gate: TradePlanGate): void {
  const index = GATE_ORDER.indexOf(gate.gateId);
  gates[index] = gate;
}

function evidenceIds(items: readonly BiasEvidenceItem[]): SpyZeroDteDeterministicTradePlanResponse["supportingBiasEvidenceIds"] {
  return items.map((item) => item.featureId);
}

function isRequiredPartial(
  marketState: SpyZeroDteDeterministicMarketStateResponse,
  bias: SpyZeroDteDeterministicBiasResponse,
): boolean {
  return (
    bias.engineState === "PARTIAL" ||
    bias.sourceQualityState === "PARTIAL" ||
    marketState.features.sessionPhase.status === "PARTIAL" ||
    marketState.features.priceVsVwap.status === "PARTIAL" ||
    marketState.features.priceVsOpeningRange.status === "PARTIAL"
  );
}

function requiredStale(
  marketState: SpyZeroDteDeterministicMarketStateResponse,
  bias: SpyZeroDteDeterministicBiasResponse,
): boolean {
  return (
    staleWarning(bias.warningCode) ||
    staleWarning(marketState.features.sessionPhase.warningCode) ||
    staleWarning(marketState.features.priceVsVwap.warningCode) ||
    staleWarning(marketState.features.priceVsOpeningRange.warningCode)
  );
}

function emptyTrigger(): SpyZeroDteDeterministicTradePlanResponse["trigger"] {
  return {
    level: null,
    comparison: null,
    satisfied: null,
    signedDistancePoints: null,
    sourceFeatureIds: [],
    sourceValues: { vwap: null, openingRangeBoundary: null },
    setupType: "UNAVAILABLE",
    confirmation: emptyConfirmation(),
  };
}

interface Outcome {
  engineState: SpyZeroDteDeterministicTradePlanResponse["engineState"];
  setupDirection: TradeSetupDirection;
  setupState: TradeSetupState;
  primaryReasonCode: TradePlanPrimaryReasonCode;
  warningCode: TradePlanOverallWarningCode | null;
  trigger: SpyZeroDteDeterministicTradePlanResponse["trigger"];
}

export function buildSpyZeroDteDeterministicTradePlan(
  marketState: SpyZeroDteDeterministicMarketStateResponse,
  bias: SpyZeroDteDeterministicBiasResponse,
  nowMs = Date.now(),
): SpyZeroDteDeterministicTradePlanResponse {
  const session = marketState.features.sessionPhase;
  const vwapFeature = marketState.features.priceVsVwap;
  const opening = marketState.features.priceVsOpeningRange;
  const sessionPhase = session.state;
  const timestampSnapshotGuaranteed =
    bias.sourceMarketStateCalculatedAt === marketState.calculatedAt &&
    bias.currentMarketDate === marketState.currentMarketDate &&
    bias.sourceMarketStateEngineVersion === marketState.engineVersion;
  const rawSnapshotState = marketState.snapshotIntegrity?.state ?? null;
  const rawSnapshotCoherent = rawSnapshotState === null || rawSnapshotState === "COHERENT";
  const sameSnapshotGuaranteed = timestampSnapshotGuaranteed && rawSnapshotCoherent;

  const gates = GATE_ORDER.map((gateId) => notEvaluatedGate(gateId));

  const marketStateUsable = marketState.engineState !== "UNAVAILABLE" && marketState.price !== null;
  setGate(gates, {
    gateId: "MARKET_STATE_AVAILABLE",
    category: "INPUT",
    status: marketStateUsable ? "PASSED" : "UNAVAILABLE",
    requiredForEligibility: true,
    sourceFeatureIds: [],
    observedValues: {
      marketStateEngineState: marketState.engineState,
      currentPriceAvailable: marketState.price !== null,
    },
    reasonCode: marketStateUsable ? "MARKET_STATE_AVAILABLE" : "MARKET_STATE_UNAVAILABLE",
    warningCode: marketStateUsable ? null : "MARKET_STATE_UNAVAILABLE",
  });

  setGate(gates, {
    gateId: "SAME_SNAPSHOT_GUARANTEED",
    category: "INPUT",
    status: sameSnapshotGuaranteed ? "PASSED" : "UNAVAILABLE",
    requiredForEligibility: true,
    sourceFeatureIds: [],
    observedValues: {
      marketStateCalculatedAt: marketState.calculatedAt,
      biasSourceMarketStateCalculatedAt: bias.sourceMarketStateCalculatedAt,
      sameSnapshotGuaranteed,
      rawSnapshotIntegrityState: rawSnapshotState,
      marketStructureSkewMilliseconds:
        marketState.snapshotIntegrity?.marketStructureSkewMilliseconds ?? null,
      maximumMarketStructureSkewMilliseconds:
        marketState.snapshotIntegrity?.maximumMarketStructureSkewMilliseconds ?? null,
    },
    reasonCode: sameSnapshotGuaranteed
      ? rawSnapshotState === "COHERENT"
        ? "RAW_SOURCE_COHERENCE_CONFIRMED"
        : "SAME_SNAPSHOT_GUARANTEED"
      : rawSnapshotState === "SKEWED"
        ? "RAW_SOURCE_SKEW_EXCEEDED"
        : "SAME_SNAPSHOT_GUARANTEE_UNAVAILABLE",
    warningCode: sameSnapshotGuaranteed
      ? null
      : rawSnapshotState === "SKEWED"
        ? "RAW_SOURCE_SKEW_EXCEEDED"
        : "SAME_SNAPSHOT_GUARANTEE_UNAVAILABLE",
  });

  let outcome: Outcome | null = null;

  if (!marketStateUsable) {
    outcome = {
      engineState: "UNAVAILABLE",
      setupDirection: "UNAVAILABLE",
      setupState: "UNAVAILABLE",
      primaryReasonCode: "MARKET_STATE_UNAVAILABLE",
      warningCode: "MARKET_STATE_UNAVAILABLE",
      trigger: emptyTrigger(),
    };
  } else if (!sameSnapshotGuaranteed) {
    const skewed = rawSnapshotState === "SKEWED";
    outcome = {
      engineState: "UNAVAILABLE",
      setupDirection: "UNAVAILABLE",
      setupState: "UNAVAILABLE",
      primaryReasonCode: skewed ? "RAW_SOURCE_SKEW_EXCEEDED" : "SAME_SNAPSHOT_GUARANTEE_UNAVAILABLE",
      warningCode: skewed ? "RAW_SOURCE_SKEW_EXCEEDED" : "SAME_SNAPSHOT_GUARANTEE_UNAVAILABLE",
      trigger: emptyTrigger(),
    };
  }

  if (!outcome) {
    const sessionUnavailable = session.status === "UNAVAILABLE" || sessionPhase === null;
    const sessionIsRth = sessionPhase === "RTH";
    setGate(gates, {
      gateId: "SESSION_IS_RTH",
      category: "APPLICABILITY",
      status: sessionUnavailable ? "UNAVAILABLE" : sessionIsRth ? "PASSED" : "NOT_APPLICABLE",
      requiredForEligibility: true,
      sourceFeatureIds: ["SESSION_PHASE"],
      observedValues: { sessionPhase, featureStatus: session.status },
      reasonCode: sessionUnavailable
        ? "SESSION_UNAVAILABLE"
        : sessionIsRth
          ? "SESSION_RTH"
          : "SESSION_NOT_RTH",
      warningCode: sessionUnavailable ? session.warningCode ?? "INSUFFICIENT_PLAN_DATA" : null,
    });

    if (sessionUnavailable) {
      outcome = {
        engineState: "UNAVAILABLE",
        setupDirection: "UNAVAILABLE",
        setupState: "UNAVAILABLE",
        primaryReasonCode: "REQUIRED_INPUT_UNAVAILABLE",
        warningCode: "INSUFFICIENT_PLAN_DATA",
        trigger: emptyTrigger(),
      };
    } else if (!sessionIsRth) {
      outcome = {
        engineState: session.status === "PARTIAL" ? "PARTIAL" : "AVAILABLE",
        setupDirection: "NONE",
        setupState: "NOT_APPLICABLE",
        primaryReasonCode: "SESSION_NOT_RTH",
        warningCode: null,
        trigger: emptyTrigger(),
      };
    }
  }

  if (!outcome) {
    const openingNotStarted = opening.state === "NOT_STARTED" || opening.inputs.phase === "PRE_OPEN";
    const openingForming = opening.state === "FORMING" || opening.inputs.phase === "FORMING";
    const openingUnavailable =
      opening.status === "UNAVAILABLE" || opening.state === null || opening.inputs.phase === "UNAVAILABLE";
    const openingComplete =
      opening.inputs.phase === "COMPLETE" &&
      !openingNotStarted &&
      !openingForming &&
      !openingUnavailable;

    let status: TradePlanGateStatus;
    let reasonCode: TradePlanGateReasonCode;
    if (openingNotStarted) {
      status = "NOT_APPLICABLE";
      reasonCode = "OPENING_RANGE_NOT_STARTED";
    } else if (openingForming) {
      status = "NOT_APPLICABLE";
      reasonCode = "OPENING_RANGE_FORMING";
    } else if (openingUnavailable || !openingComplete) {
      status = "UNAVAILABLE";
      reasonCode = "OPENING_RANGE_UNAVAILABLE";
    } else {
      status = "PASSED";
      reasonCode = "OPENING_RANGE_COMPLETE";
    }

    setGate(gates, {
      gateId: "OPENING_RANGE_COMPLETE",
      category: "APPLICABILITY",
      status,
      requiredForEligibility: true,
      sourceFeatureIds: ["PRICE_VS_OPENING_RANGE"],
      observedValues: {
        phase: opening.inputs.phase,
        featureState: opening.state,
        featureStatus: opening.status,
      },
      reasonCode,
      warningCode: status === "UNAVAILABLE" ? opening.warningCode ?? "INSUFFICIENT_PLAN_DATA" : null,
    });

    if (openingNotStarted) {
      outcome = {
        engineState: "AVAILABLE",
        setupDirection: "NONE",
        setupState: "NOT_APPLICABLE",
        primaryReasonCode: "OPENING_RANGE_NOT_STARTED",
        warningCode: null,
        trigger: emptyTrigger(),
      };
    } else if (openingForming) {
      outcome = {
        engineState: "AVAILABLE",
        setupDirection: "NONE",
        setupState: "NOT_APPLICABLE",
        primaryReasonCode: "OPENING_RANGE_FORMING",
        warningCode: null,
        trigger: emptyTrigger(),
      };
    } else if (openingUnavailable || !openingComplete) {
      outcome = {
        engineState: "UNAVAILABLE",
        setupDirection: "UNAVAILABLE",
        setupState: "UNAVAILABLE",
        primaryReasonCode: "OPENING_RANGE_UNAVAILABLE",
        warningCode: "INSUFFICIENT_PLAN_DATA",
        trigger: emptyTrigger(),
      };
    }
  }

  if (!outcome) {
    const datesCompatible =
      session.referenceDate === marketState.currentMarketDate &&
      vwapFeature.referenceDate === marketState.currentMarketDate &&
      vwapFeature.inputs.vwapMarketDate === marketState.currentMarketDate &&
      opening.referenceDate === marketState.currentMarketDate &&
      opening.inputs.currentMarketDate === marketState.currentMarketDate;

    setGate(gates, {
      gateId: "CURRENT_SESSION_DATES_COMPATIBLE",
      category: "INPUT",
      status: datesCompatible ? "PASSED" : "UNAVAILABLE",
      requiredForEligibility: true,
      sourceFeatureIds: ["SESSION_PHASE", "PRICE_VS_VWAP", "PRICE_VS_OPENING_RANGE"],
      observedValues: {
        currentMarketDate: marketState.currentMarketDate,
        sessionReferenceDate: session.referenceDate,
        vwapReferenceDate: vwapFeature.referenceDate,
        openingRangeReferenceDate: opening.referenceDate,
      },
      reasonCode: datesCompatible
        ? "CURRENT_SESSION_DATES_COMPATIBLE"
        : "CURRENT_SESSION_DATE_MISMATCH",
      warningCode: datesCompatible ? null : "CURRENT_SESSION_DATE_MISMATCH",
    });

    if (!datesCompatible) {
      outcome = {
        engineState: "UNAVAILABLE",
        setupDirection: "UNAVAILABLE",
        setupState: "UNAVAILABLE",
        primaryReasonCode: "CURRENT_SESSION_DATE_MISMATCH",
        warningCode: "CURRENT_SESSION_DATE_MISMATCH",
        trigger: emptyTrigger(),
      };
    }
  }

  if (!outcome) {
    const biasAvailable = bias.engineState !== "UNAVAILABLE" && bias.biasState !== "UNAVAILABLE";
    setGate(gates, {
      gateId: "BIAS_AVAILABLE",
      category: "DIRECTION",
      status: biasAvailable ? "PASSED" : "UNAVAILABLE",
      requiredForEligibility: true,
      sourceFeatureIds: [],
      observedValues: { biasState: bias.biasState, biasEngineState: bias.engineState },
      reasonCode: biasAvailable ? "BIAS_AVAILABLE" : "BIAS_UNAVAILABLE",
      warningCode: biasAvailable ? null : bias.warningCode ?? "BIAS_UNAVAILABLE",
    });
    if (!biasAvailable) {
      outcome = {
        engineState: "UNAVAILABLE",
        setupDirection: "UNAVAILABLE",
        setupState: "UNAVAILABLE",
        primaryReasonCode: "BIAS_UNAVAILABLE",
        warningCode: "BIAS_UNAVAILABLE",
        trigger: emptyTrigger(),
      };
    }
  }

  let candidateDirection: "CALLS" | "PUTS" | null = null;
  if (!outcome) {
    candidateDirection =
      bias.biasState === "BULLISH" ? "CALLS" : bias.biasState === "BEARISH" ? "PUTS" : null;
    setGate(gates, {
      gateId: "DIRECTIONAL_BIAS_PRESENT",
      category: "DIRECTION",
      status: candidateDirection ? "PASSED" : "FAILED",
      requiredForEligibility: true,
      sourceFeatureIds: [],
      observedValues: { biasState: bias.biasState },
      reasonCode: candidateDirection ? "DIRECTIONAL_BIAS_PRESENT" : "BIAS_NEUTRAL",
      warningCode: null,
    });
    if (!candidateDirection) {
      outcome = {
        engineState: "AVAILABLE",
        setupDirection: "NONE",
        setupState: "NO_SETUP",
        primaryReasonCode: "BIAS_NEUTRAL",
        warningCode: null,
        trigger: emptyTrigger(),
      };
    }
  }

  if (!outcome && candidateDirection) {
    const partial = isRequiredPartial(marketState, bias);
    const unavailable =
      session.status === "UNAVAILABLE" ||
      vwapFeature.status === "UNAVAILABLE" ||
      opening.status === "UNAVAILABLE" ||
      bias.sourceQualityState === "UNAVAILABLE";
    const complete = !partial && !unavailable && bias.engineState === "AVAILABLE" && bias.sourceQualityState === "COMPLETE";
    setGate(gates, {
      gateId: "SOURCE_QUALITY_COMPLETE",
      category: "QUALITY",
      status: unavailable ? "UNAVAILABLE" : complete ? "PASSED" : "FAILED",
      requiredForEligibility: true,
      sourceFeatureIds: ["SESSION_PHASE", "PRICE_VS_VWAP", "PRICE_VS_OPENING_RANGE"],
      observedValues: {
        biasEngineState: bias.engineState,
        biasSourceQuality: bias.sourceQualityState,
        sessionFeatureStatus: session.status,
        vwapFeatureStatus: vwapFeature.status,
        openingRangeFeatureStatus: opening.status,
      },
      reasonCode: unavailable
        ? "REQUIRED_INPUT_UNAVAILABLE"
        : complete
          ? "SOURCE_QUALITY_COMPLETE"
          : "REQUIRED_INPUT_PARTIAL",
      warningCode: unavailable
        ? "INSUFFICIENT_PLAN_DATA"
        : complete
          ? null
          : requiredStale(marketState, bias)
            ? "REQUIRED_INPUT_STALE"
            : "REQUIRED_INPUT_PARTIAL",
    });
    if (unavailable) {
      outcome = {
        engineState: "UNAVAILABLE",
        setupDirection: "UNAVAILABLE",
        setupState: "UNAVAILABLE",
        primaryReasonCode: "REQUIRED_INPUT_UNAVAILABLE",
        warningCode: "INSUFFICIENT_PLAN_DATA",
        trigger: emptyTrigger(),
      };
    } else if (!complete) {
      outcome = {
        engineState: "PARTIAL",
        setupDirection: "NONE",
        setupState: "NO_SETUP",
        primaryReasonCode: "REQUIRED_INPUT_PARTIAL",
        warningCode: requiredStale(marketState, bias)
          ? "REQUIRED_INPUT_STALE"
          : "REQUIRED_INPUT_PARTIAL",
        trigger: emptyTrigger(),
      };
    }
  }

  let minorCounterevidenceCount = 0;
  let materialCounterevidenceCount = 0;
  if (!outcome && candidateDirection) {
    const opposingEvidence =
      candidateDirection === "CALLS" ? bias.bearishEvidence : bias.bullishEvidence;
    const materialIds = new Set(["PRICE_VS_VWAP", "PRICE_VS_OPENING_RANGE"]);
    materialCounterevidenceCount = opposingEvidence.filter((item) => materialIds.has(item.featureId)).length;
    minorCounterevidenceCount = opposingEvidence.length - materialCounterevidenceCount;
    const counterPassed = materialCounterevidenceCount === 0 && minorCounterevidenceCount <= 1;
    setGate(gates, {
      gateId: "COUNTEREVIDENCE_POLICY_PASSED",
      category: "COUNTEREVIDENCE",
      status: counterPassed ? "PASSED" : "FAILED",
      requiredForEligibility: true,
      sourceFeatureIds: evidenceIds(opposingEvidence),
      observedValues: {
        candidateDirection,
        opposingEvidenceCount: opposingEvidence.length,
        minorOpposingEvidenceCount: minorCounterevidenceCount,
        materialOpposingEvidenceCount: materialCounterevidenceCount,
        maximumMinorOpposingEvidenceAllowed: 1,
      },
      reasonCode: counterPassed
        ? opposingEvidence.length === 0
          ? "COUNTEREVIDENCE_POLICY_PASSED"
          : "MINOR_COUNTEREVIDENCE_TOLERATED"
        : candidateDirection === "CALLS"
          ? "CALLS_COUNTEREVIDENCE_PRESENT"
          : "PUTS_COUNTEREVIDENCE_PRESENT",
      warningCode: null,
    });
    if (!counterPassed) {
      outcome = {
        engineState: "AVAILABLE",
        setupDirection: "NONE",
        setupState: "NO_SETUP",
        primaryReasonCode:
          candidateDirection === "CALLS"
            ? "CALLS_COUNTEREVIDENCE_PRESENT"
            : "PUTS_COUNTEREVIDENCE_PRESENT",
        warningCode: null,
        trigger: emptyTrigger(),
      };
    }
  }

  let triggerCalculation: TriggerCalculation | null = null;
  if (!outcome && candidateDirection) {
    const currentPrice = marketState.price;
    const vwap = vwapFeature.inputs.vwap;
    const openingRangeHigh = opening.inputs.openingRangeHigh;
    const openingRangeLow = opening.inputs.openingRangeLow;
    triggerCalculation =
      candidateDirection === "CALLS"
        ? calculateCallsTrigger(currentPrice!, vwap!, openingRangeHigh!)
        : calculatePutsTrigger(currentPrice!, vwap!, openingRangeLow!);
    const valid = triggerCalculation !== null;
    setGate(gates, {
      gateId: "TRIGGER_INPUTS_VALID",
      category: "INPUT",
      status: valid ? "PASSED" : "UNAVAILABLE",
      requiredForEligibility: true,
      sourceFeatureIds: ["PRICE_VS_VWAP", "PRICE_VS_OPENING_RANGE"],
      observedValues: { currentPrice, vwap, openingRangeHigh, openingRangeLow },
      reasonCode: valid ? "TRIGGER_INPUTS_VALID" : "TRIGGER_INPUT_INVALID",
      warningCode: valid ? null : "TRIGGER_INPUT_INVALID",
    });
    if (!valid) {
      outcome = {
        engineState: "UNAVAILABLE",
        setupDirection: "UNAVAILABLE",
        setupState: "UNAVAILABLE",
        primaryReasonCode: "TRIGGER_INPUT_INVALID",
        warningCode: "TRIGGER_INPUT_INVALID",
        trigger: emptyTrigger(),
      };
    }
  }

  let activeConfirmation = emptyConfirmation();
  if (!outcome && candidateDirection && triggerCalculation) {
    const vwapAligned =
      candidateDirection === "CALLS"
        ? vwapFeature.state === "ABOVE"
        : vwapFeature.state === "BELOW";
    const openingAligned =
      candidateDirection === "CALLS"
        ? opening.state === "ABOVE_RANGE"
        : opening.state === "BELOW_RANGE";
    activeConfirmation = buildTradeTriggerConfirmation(
      marketState,
      candidateDirection,
      triggerCalculation,
    );

    setGate(gates, {
      gateId: "VWAP_ALIGNED",
      category: "DIRECTION",
      status: vwapAligned ? "PASSED" : "FAILED",
      requiredForEligibility: true,
      sourceFeatureIds: ["PRICE_VS_VWAP"],
      observedValues: { candidateDirection, priceVsVwapState: vwapFeature.state },
      reasonCode: vwapAligned
        ? candidateDirection === "CALLS"
          ? "VWAP_ALIGNED_FOR_CALLS"
          : "VWAP_ALIGNED_FOR_PUTS"
        : candidateDirection === "CALLS"
          ? "VWAP_NOT_ALIGNED_FOR_CALLS"
          : "VWAP_NOT_ALIGNED_FOR_PUTS",
      warningCode: null,
    });

    setGate(gates, {
      gateId: "OPENING_RANGE_ALIGNED",
      category: "DIRECTION",
      status: openingAligned ? "PASSED" : "FAILED",
      requiredForEligibility: true,
      sourceFeatureIds: ["PRICE_VS_OPENING_RANGE"],
      observedValues: { candidateDirection, priceVsOpeningRangeState: opening.state },
      reasonCode: openingAligned
        ? candidateDirection === "CALLS"
          ? "OPENING_RANGE_ALIGNED_FOR_CALLS"
          : "OPENING_RANGE_ALIGNED_FOR_PUTS"
        : candidateDirection === "CALLS"
          ? "OPENING_RANGE_NOT_ALIGNED_FOR_CALLS"
          : "OPENING_RANGE_NOT_ALIGNED_FOR_PUTS",
      warningCode: null,
    });

    const confirmationPassed = activeConfirmation.confirmationPassed === true;
    const waitingForRetest = activeConfirmation.lifecycleState === "WAITING_FOR_RETEST";
    const retestFailed = activeConfirmation.warningCodes.includes("RETEST_LEVEL_LOST");
    const retestExpired = activeConfirmation.warningCodes.includes("RETEST_WINDOW_EXPIRED");
    const confirmationWarning = confirmationPassed
      ? null
      : retestFailed
        ? "TRIGGER_RETEST_FAILED"
        : retestExpired
          ? "TRIGGER_RETEST_EXPIRED"
          : waitingForRetest
            ? "TRIGGER_RETEST_REQUIRED"
            : activeConfirmation.warningCodes.includes("EXCESSIVE_LEVEL_RECROSSES")
              ? "TRIGGER_CHOP_DETECTED"
              : activeConfirmation.warningCodes.includes("BREAKOUT_VOLUME_INSUFFICIENT")
                ? "TRIGGER_VOLUME_INSUFFICIENT"
                : activeConfirmation.rawCrossSatisfied
                  ? "TRIGGER_CONFIRMATION_PENDING"
                  : null;
    const confirmationReason = confirmationPassed
      ? candidateDirection === "CALLS"
        ? "CALLS_TRIGGER_SATISFIED"
        : "PUTS_TRIGGER_SATISFIED"
      : retestFailed
        ? "TRIGGER_RETEST_FAILED"
        : retestExpired
          ? "TRIGGER_RETEST_EXPIRED"
          : waitingForRetest
            ? candidateDirection === "CALLS"
              ? "CALLS_TRIGGER_RETEST_PENDING"
              : "PUTS_TRIGGER_RETEST_PENDING"
            : activeConfirmation.warningCodes.includes("EXCESSIVE_LEVEL_RECROSSES")
              ? "TRIGGER_CHOP_DETECTED"
              : activeConfirmation.warningCodes.includes("BREAKOUT_VOLUME_INSUFFICIENT")
                ? "TRIGGER_VOLUME_INSUFFICIENT"
                : activeConfirmation.rawCrossSatisfied
                  ? candidateDirection === "CALLS"
                    ? "CALLS_TRIGGER_CONFIRMATION_PENDING"
                    : "PUTS_TRIGGER_CONFIRMATION_PENDING"
                  : candidateDirection === "CALLS"
                    ? "CALLS_TRIGGER_NOT_SATISFIED"
                    : "PUTS_TRIGGER_NOT_SATISFIED";

    setGate(gates, {
      gateId: "TRIGGER_SATISFIED",
      category: "TRIGGER",
      status: confirmationPassed ? "PASSED" : "FAILED",
      requiredForEligibility: true,
      sourceFeatureIds: ["PRICE_VS_VWAP", "PRICE_VS_OPENING_RANGE"],
      observedValues: {
        candidateDirection,
        currentPrice: marketState.price,
        triggerLevel: triggerCalculation.level,
        comparison: triggerCalculation.comparison,
        satisfied: confirmationPassed,
        rawCrossSatisfied: activeConfirmation.rawCrossSatisfied,
        lifecycleState: activeConfirmation.lifecycleState,
        confirmationPassed: activeConfirmation.confirmationPassed,
      },
      reasonCode: confirmationReason,
      warningCode: confirmationWarning,
    });

    const eligible = vwapAligned && openingAligned && confirmationPassed;
    const rawCross = activeConfirmation.rawCrossSatisfied === true;
    outcome = {
      engineState: "AVAILABLE",
      setupDirection: candidateDirection,
      setupState: eligible ? "ELIGIBLE" : "WAITING_FOR_TRIGGER",
      primaryReasonCode: eligible
        ? candidateDirection === "CALLS"
          ? "ELIGIBLE_CALLS_SETUP"
          : "ELIGIBLE_PUTS_SETUP"
        : waitingForRetest
          ? candidateDirection === "CALLS"
            ? "WAITING_FOR_CALLS_RETEST"
            : "WAITING_FOR_PUTS_RETEST"
          : rawCross
            ? candidateDirection === "CALLS"
              ? "WAITING_FOR_CALLS_CONFIRMATION"
              : "WAITING_FOR_PUTS_CONFIRMATION"
            : candidateDirection === "CALLS"
              ? "WAITING_FOR_CALLS_TRIGGER"
              : "WAITING_FOR_PUTS_TRIGGER",
      warningCode: confirmationWarning,
      trigger: {
        level: triggerCalculation.level,
        comparison: triggerCalculation.comparison,
        satisfied: confirmationPassed,
        signedDistancePoints: triggerCalculation.signedDistancePoints,
        sourceFeatureIds: ["PRICE_VS_VWAP", "PRICE_VS_OPENING_RANGE"],
        sourceValues: {
          vwap: triggerCalculation.vwap,
          openingRangeBoundary: triggerCalculation.openingRangeBoundary,
        },
        setupType: triggerCalculation.setupType,
        confirmation: activeConfirmation,
      },
    };
  }

  if (!outcome) {
    outcome = {
      engineState: "UNAVAILABLE",
      setupDirection: "UNAVAILABLE",
      setupState: "UNAVAILABLE",
      primaryReasonCode: "TRIGGER_INPUT_INVALID",
      warningCode: "INSUFFICIENT_PLAN_DATA",
      trigger: emptyTrigger(),
    };
  }

  const supporting =
    bias.biasState === "BULLISH"
      ? bias.bullishEvidence
      : bias.biasState === "BEARISH"
        ? bias.bearishEvidence
        : [];
  const counter =
    bias.biasState === "BULLISH"
      ? bias.bearishEvidence
      : bias.biasState === "BEARISH"
        ? bias.bullishEvidence
        : [];
  const exposureDirection =
    bias.biasState === "BULLISH"
      ? ("CALLS" as const)
      : bias.biasState === "BEARISH"
        ? ("PUTS" as const)
        : ("NONE" as const);
  const exposureConfirmation = buildTradePlanExposureConfirmation(
    marketState,
    exposureDirection,
    bias.confidenceScore,
  );
  const tradeQuality = buildTradeQuality(
    marketState,
    bias,
    candidateDirection,
    minorCounterevidenceCount,
    materialCounterevidenceCount,
    rawSnapshotState,
    outcome.trigger.confirmation ?? activeConfirmation,
  );

  return SpyZeroDteDeterministicTradePlanResponseSchema.parse({
    symbol: "SPY",
    product: "SPY_ZERO_DTE_DETERMINISTIC_CONDITIONAL_TRADE_PLAN",
    methodologyVersion: TRADE_PLAN_METHODOLOGY_VERSION,
    currentMarketDate: marketState.currentMarketDate,
    mostRecentRthSessionDate: marketState.mostRecentRthSessionDate,
    sourceMarketStateEngineVersion: marketState.engineVersion,
    sourceMarketStateEngineState: marketState.engineState,
    sourceMarketStateCalculatedAt: marketState.calculatedAt,
    sourceBiasMethodologyVersion: bias.methodologyVersion,
    sourceBiasCalculatedAt: bias.calculatedAt,
    sourceBiasMarketStateCalculatedAt: bias.sourceMarketStateCalculatedAt,
    sameSnapshotGuaranteed,
    calculatedAt: new Date(nowMs).toISOString(),
    engineState: outcome.engineState,
    setupDirection: outcome.setupDirection,
    setupState: outcome.setupState,
    primaryReasonCode: outcome.primaryReasonCode,
    currentPrice: marketState.price,
    priceSource: marketState.priceSource,
    quoteTimestamp: marketState.quoteTimestamp,
    sessionPhase,
    biasState: bias.biasState,
    biasEngineState: bias.engineState,
    biasConfidenceScore: bias.confidenceScore,
    biasConfidenceScope: bias.confidenceScope,
    biasSourceQuality: bias.sourceQualityState,
    structuralConfidenceScore: bias.confidenceScore,
    exposureConfidenceAdjustmentPoints: exposureConfirmation.adjustmentPoints,
    planConfidenceScore: exposureConfirmation.adjustedConfidenceScore,
    exposureConfirmation,
    sourceSnapshotIntegrityState: rawSnapshotState,
    sourceMarketStructureSkewMilliseconds:
      marketState.snapshotIntegrity?.marketStructureSkewMilliseconds ?? null,
    setupType: outcome.trigger.setupType ?? "UNAVAILABLE",
    tradeQuality,
    trigger: outcome.trigger,
    gates,
    supportingBiasEvidenceIds: evidenceIds(supporting),
    counterBiasEvidenceIds: evidenceIds(counter),
    warningCode: outcome.warningCode,
  });
}
