import {
  SpyZeroDteDeterministicMarketStateResponseSchema,
  type MarketContextComponent,
  type MarketContextComponentStatus,
  type MarketStateEngineState,
  type MarketStateExpectedMovePosition,
  type MarketStateFeatureStatus,
  type MarketStateRangePosition,
  type MarketStateReferenceDateRelation,
  type MarketStateSign,
  type NetDexProxySignFeature,
  type NetGexProxySignFeature,
  type PriceVsExpectedMoveRangeFeature,
  type PriceVsOpeningRangeFeature,
  type PriceVsPremarketRangeFeature,
  type PriceVsPriorDayRangeFeature,
  type PriceVsVwapFeature,
  type RthGapContextFeature,
  type SessionPhaseFeature,
  type SpyZeroDteDeterministicMarketStateResponse,
  type SpyZeroDteMarketContextResponse,
} from "@spy-copilot/shared";

const FEATURE_VERSION = "V1" as const;
const PRICE_SOURCE = "QUOTE_LAST_PRICE" as const;

type ComparableComponentStatus = MarketContextComponentStatus["status"];

function finite(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function finitePositive(value: unknown): value is number {
  return finite(value) && value > 0;
}

function findComponent(
  context: SpyZeroDteMarketContextResponse,
  component: MarketContextComponent,
): MarketContextComponentStatus | null {
  return context.components.find((item) => item.component === component) ?? null;
}

function usableComponent(status: ComparableComponentStatus | null): boolean {
  return status === "AVAILABLE" || status === "STALE" || status === "PARTIAL";
}

function partialComponent(status: ComparableComponentStatus | null): boolean {
  return status === "STALE" || status === "PARTIAL";
}

function sourceWarning(
  status: MarketStateFeatureStatus,
  nativeWarnings: readonly (string | null | undefined)[],
  fallback: string,
): string | null {
  if (status === "AVAILABLE" || status === "NOT_APPLICABLE") return null;
  const native = nativeWarnings.find((item): item is string => Boolean(item));
  if (native) return native;
  if (status === "PARTIAL") return fallback;
  return fallback;
}

function relationForDate(
  date: string | null,
  context: SpyZeroDteMarketContextResponse,
  preferred?: "PREVIOUS_RTH_SESSION" | "CURRENT_EXPIRATION",
): MarketStateReferenceDateRelation | null {
  if (!date) return null;
  if (preferred === "PREVIOUS_RTH_SESSION") return "PREVIOUS_RTH_SESSION";
  if (preferred === "CURRENT_EXPIRATION" && date === context.currentMarketDate) {
    return "CURRENT_EXPIRATION";
  }
  if (date === context.currentMarketDate) return "CURRENT_MARKET_DATE";
  if (date === context.mostRecentRthSessionDate) return "MOST_RECENT_RTH_SESSION";
  return "UNKNOWN";
}

export function compareExact(left: number, right: number): "ABOVE" | "BELOW" | "EQUAL" | null {
  if (!finite(left) || !finite(right)) return null;
  if (left > right) return "ABOVE";
  if (left < right) return "BELOW";
  return "EQUAL";
}

export function calculatePointAndPercentDistance(
  value: number,
  reference: number,
): { distancePoints: number; distancePercent: number } | null {
  if (!finite(value) || !finite(reference) || reference <= 0) return null;
  const distancePoints = value - reference;
  const distancePercent = (distancePoints / reference) * 100;
  if (!finite(distancePoints) || !finite(distancePercent)) return null;
  return { distancePoints, distancePercent };
}

export function classifyRangePosition(
  price: number,
  high: number,
  low: number,
): MarketStateRangePosition | null {
  if (!finite(price) || !finite(high) || !finite(low) || high < low) return null;
  if (price > high) return "ABOVE_RANGE";
  if (price < low) return "BELOW_RANGE";
  if (high === low && price === high) return "AT_BOUNDARY";
  if (price === high) return "AT_HIGH";
  if (price === low) return "AT_LOW";
  return "INSIDE_RANGE";
}

export function classifyExpectedMovePosition(
  price: number,
  upper: number,
  lower: number,
): MarketStateExpectedMovePosition | null {
  if (!finite(price) || !finite(upper) || !finite(lower) || upper < lower) return null;
  if (price > upper) return "ABOVE_UPPER";
  if (price < lower) return "BELOW_LOWER";
  if (upper === lower && price === upper) return "AT_BOUNDARY";
  if (price === upper) return "AT_UPPER";
  if (price === lower) return "AT_LOWER";
  return "INSIDE_RANGE";
}

export function classifyExactSign(value: number): MarketStateSign | null {
  if (!finite(value)) return null;
  if (value > 0) return "POSITIVE";
  if (value < 0) return "NEGATIVE";
  return "ZERO";
}

function canonicalPrice(context: SpyZeroDteMarketContextResponse): {
  price: number | null;
  priceStatus: ComparableComponentStatus | null;
} {
  const quote = findComponent(context, "QUOTE");
  const usable = usableComponent(quote?.status ?? null) && context.quote.sourceState !== "MOCK";
  return {
    price: usable && finitePositive(context.quote.lastPrice) ? context.quote.lastPrice : null,
    priceStatus: quote?.status ?? null,
  };
}

function deriveSessionPhaseFeature(context: SpyZeroDteMarketContextResponse): SessionPhaseFeature {
  const sourceState = context.session.sourceState;
  let status: MarketStateFeatureStatus;
  if (sourceState === "MOCK") status = "UNAVAILABLE";
  else if (sourceState === "STALE" || context.session.warningCode !== null) status = "PARTIAL";
  else status = "AVAILABLE";

  return {
    featureId: "SESSION_PHASE",
    featureVersion: FEATURE_VERSION,
    status,
    state: status === "UNAVAILABLE" ? null : context.session.currentSessionWindow,
    sourceComponents: ["SESSION_DATA"],
    referenceDate: context.currentMarketDate,
    referenceDateRelation: "CURRENT_MARKET_DATE",
    inputs: {
      currentMarketDate: context.currentMarketDate,
      currentSessionWindow: context.session.currentSessionWindow,
      currentObservedMarketDate: context.session.currentObservedMarketDate,
      sourceState,
    },
    derived: {},
    warningCode: sourceWarning(
      status,
      [context.session.warningCode],
      status === "PARTIAL" ? "STALE_SOURCE_COMPONENT" : "SOURCE_COMPONENT_UNAVAILABLE",
    ),
  };
}

function derivePriceVsVwapFeature(
  context: SpyZeroDteMarketContextResponse,
  price: number | null,
  priceStatus: ComparableComponentStatus | null,
): PriceVsVwapFeature {
  const vwapComponent = findComponent(context, "VWAP");
  const vwap = context.vwap.latestVwap;
  const applicable = vwapComponent?.status !== "NOT_APPLICABLE";
  const inputs = {
    price,
    priceSource: price === null ? null : PRICE_SOURCE,
    vwap,
    vwapMarketDate: context.vwap.marketDate,
    quoteSourceState: context.quote.sourceState,
    vwapMetricState: context.vwap.metricState,
    vwapSourceState: context.vwap.candleSourceState,
  };

  if (!applicable) {
    return {
      featureId: "PRICE_VS_VWAP",
      featureVersion: FEATURE_VERSION,
      status: "NOT_APPLICABLE",
      state: null,
      sourceComponents: ["QUOTE", "VWAP"],
      referenceDate: context.vwap.marketDate,
      referenceDateRelation: relationForDate(context.vwap.marketDate, context),
      inputs,
      derived: { distancePoints: null, distancePercent: null },
      warningCode: null,
    };
  }

  const comparison = price !== null && finitePositive(vwap) ? compareExact(price, vwap) : null;
  const distance = price !== null && finitePositive(vwap)
    ? calculatePointAndPercentDistance(price, vwap)
    : null;
  const valid = comparison !== null && distance !== null;
  let status: MarketStateFeatureStatus;
  if (!valid || !usableComponent(priceStatus) || !usableComponent(vwapComponent?.status ?? null)) {
    status = "UNAVAILABLE";
  } else if (
    partialComponent(priceStatus) ||
    partialComponent(vwapComponent?.status ?? null) ||
    context.vwap.warningCode !== null
  ) {
    status = "PARTIAL";
  } else status = "AVAILABLE";

  return {
    featureId: "PRICE_VS_VWAP",
    featureVersion: FEATURE_VERSION,
    status,
    state: valid ? comparison : null,
    sourceComponents: ["QUOTE", "VWAP"],
    referenceDate: context.vwap.marketDate,
    referenceDateRelation: relationForDate(context.vwap.marketDate, context),
    inputs,
    derived: {
      distancePoints: distance?.distancePoints ?? null,
      distancePercent: distance?.distancePercent ?? null,
    },
    warningCode: sourceWarning(
      status,
      [price === null ? context.quote.warningCode : null, context.vwap.warningCode],
      status === "PARTIAL" ? "PARTIAL_SOURCE_COMPONENT" : "MISSING_REQUIRED_INPUT",
    ),
  };
}

function rangeStatusFromLevels(
  price: number | null,
  priceStatus: ComparableComponentStatus | null,
  high: number | null,
  low: number | null,
  highState: string,
  lowState: string,
  coverageState: string,
): { status: MarketStateFeatureStatus; state: MarketStateRangePosition | null; invalidRange: boolean } {
  const valuesValid = price !== null && finitePositive(high) && finitePositive(low);
  const statesUsable = ![highState, lowState].some((state) => state === "MOCK" || state === "UNAVAILABLE");
  const coverageUsable = coverageState !== "UNAVAILABLE";
  if (!valuesValid || !statesUsable || !coverageUsable || !usableComponent(priceStatus)) {
    return { status: "UNAVAILABLE", state: null, invalidRange: false };
  }
  const state = classifyRangePosition(price, high, low);
  if (state === null) return { status: "UNAVAILABLE", state: null, invalidRange: true };
  const partial =
    partialComponent(priceStatus) ||
    highState === "STALE" ||
    lowState === "STALE" ||
    coverageState === "PARTIAL" ||
    coverageState === "UNKNOWN";
  return { status: partial ? "PARTIAL" : "AVAILABLE", state, invalidRange: false };
}

function derivePriorDayRangeFeature(
  context: SpyZeroDteMarketContextResponse,
  price: number | null,
  priceStatus: ComparableComponentStatus | null,
): PriceVsPriorDayRangeFeature {
  const levels = context.sessionLevels;
  const high = levels.previousDayHigh.value;
  const low = levels.previousDayLow.value;
  const result = rangeStatusFromLevels(
    price,
    priceStatus,
    high,
    low,
    levels.previousDayHigh.state,
    levels.previousDayLow.state,
    levels.previousRthCoverageState,
  );
  const missingDate = levels.previousRthMarketDate === null;
  const status = missingDate ? "UNAVAILABLE" : result.status;
  const state = status === "UNAVAILABLE" ? null : result.state;

  return {
    featureId: "PRICE_VS_PRIOR_DAY_RANGE",
    featureVersion: FEATURE_VERSION,
    status,
    state,
    sourceComponents: ["QUOTE", "SESSION_LEVELS"],
    referenceDate: levels.previousRthMarketDate,
    referenceDateRelation: relationForDate(
      levels.previousRthMarketDate,
      context,
      "PREVIOUS_RTH_SESSION",
    ),
    inputs: {
      price,
      priceSource: price === null ? null : PRICE_SOURCE,
      previousDayHigh: high,
      previousDayLow: low,
      previousDayHighState: levels.previousDayHigh.state,
      previousDayLowState: levels.previousDayLow.state,
      previousRthMarketDate: levels.previousRthMarketDate,
      previousRthCoverageState: levels.previousRthCoverageState,
    },
    derived: {
      distanceToHighPoints: price !== null && high !== null ? price - high : null,
      distanceToLowPoints: price !== null && low !== null ? price - low : null,
    },
    warningCode: sourceWarning(
      status,
      [price === null ? context.quote.warningCode : null],
      result.invalidRange
        ? "INVALID_RANGE"
        : status === "PARTIAL"
          ? "PARTIAL_SOURCE_COMPONENT"
          : "MISSING_REQUIRED_INPUT",
    ),
  };
}

function premarketApplicable(context: SpyZeroDteMarketContextResponse): boolean {
  const window = context.session.currentSessionWindow;
  return (
    window === "PREMARKET" ||
    window === "RTH" ||
    window === "AFTER_HOURS" ||
    context.sessionLevels.currentMarketDateHasDefinedSessionData
  );
}

function derivePremarketRangeFeature(
  context: SpyZeroDteMarketContextResponse,
  price: number | null,
  priceStatus: ComparableComponentStatus | null,
): PriceVsPremarketRangeFeature {
  const levels = context.sessionLevels;
  const applicable = premarketApplicable(context);
  const high = levels.premarketHigh.value;
  const low = levels.premarketLow.value;
  const inputs = {
    price,
    priceSource: price === null ? null : PRICE_SOURCE,
    premarketHigh: high,
    premarketLow: low,
    premarketHighState: levels.premarketHigh.state,
    premarketLowState: levels.premarketLow.state,
    currentMarketDate: context.currentMarketDate,
    currentSessionWindow: context.session.currentSessionWindow,
    currentMarketDateHasDefinedSessionData: levels.currentMarketDateHasDefinedSessionData,
    premarketCoverageState: levels.premarketCoverageState,
  };
  if (!applicable) {
    return {
      featureId: "PRICE_VS_PREMARKET_RANGE",
      featureVersion: FEATURE_VERSION,
      status: "NOT_APPLICABLE",
      state: null,
      sourceComponents: ["QUOTE", "SESSION_LEVELS"],
      referenceDate: context.currentMarketDate,
      referenceDateRelation: "CURRENT_MARKET_DATE",
      inputs,
      derived: { distanceToHighPoints: null, distanceToLowPoints: null },
      warningCode: null,
    };
  }

  const result = rangeStatusFromLevels(
    price,
    priceStatus,
    high,
    low,
    levels.premarketHigh.state,
    levels.premarketLow.state,
    levels.premarketCoverageState,
  );
  return {
    featureId: "PRICE_VS_PREMARKET_RANGE",
    featureVersion: FEATURE_VERSION,
    status: result.status,
    state: result.state,
    sourceComponents: ["QUOTE", "SESSION_LEVELS"],
    referenceDate: context.currentMarketDate,
    referenceDateRelation: "CURRENT_MARKET_DATE",
    inputs,
    derived: {
      distanceToHighPoints: price !== null && high !== null ? price - high : null,
      distanceToLowPoints: price !== null && low !== null ? price - low : null,
    },
    warningCode: sourceWarning(
      result.status,
      [price === null ? context.quote.warningCode : null],
      result.invalidRange
        ? "INVALID_RANGE"
        : result.status === "PARTIAL"
          ? "PARTIAL_SOURCE_COMPONENT"
          : "MISSING_REQUIRED_INPUT",
    ),
  };
}

function deriveOpeningRangeFeature(
  context: SpyZeroDteMarketContextResponse,
  price: number | null,
  priceStatus: ComparableComponentStatus | null,
): PriceVsOpeningRangeFeature {
  const source = context.openingRange;
  const component = findComponent(context, "OPENING_RANGE");
  const inputs = {
    price,
    priceSource: price === null ? null : PRICE_SOURCE,
    openingRangeHigh: source.openingRangeHigh,
    openingRangeLow: source.openingRangeLow,
    phase: source.phase,
    currentMarketDate: source.currentMarketDate,
    metricState: source.metricState,
    sourceState: source.candleSourceState,
    coverageState: source.coverageState,
  };

  if (component?.status === "NOT_APPLICABLE") {
    return {
      featureId: "PRICE_VS_OPENING_RANGE",
      featureVersion: FEATURE_VERSION,
      status: "NOT_APPLICABLE",
      state: source.phase === "PRE_OPEN" ? "NOT_STARTED" : null,
      sourceComponents: ["QUOTE", "OPENING_RANGE"],
      referenceDate: source.currentMarketDate,
      referenceDateRelation: relationForDate(source.currentMarketDate, context),
      inputs,
      derived: { distanceToHighPoints: null, distanceToLowPoints: null },
      warningCode: null,
    };
  }

  if (source.phase === "FORMING") {
    return {
      featureId: "PRICE_VS_OPENING_RANGE",
      featureVersion: FEATURE_VERSION,
      status: "PARTIAL",
      state: "FORMING",
      sourceComponents: ["QUOTE", "OPENING_RANGE"],
      referenceDate: source.currentMarketDate,
      referenceDateRelation: relationForDate(source.currentMarketDate, context),
      inputs,
      derived: { distanceToHighPoints: null, distanceToLowPoints: null },
      warningCode: source.warningCode ?? "OPENING_RANGE_FORMING",
    };
  }

  const high = source.openingRangeHigh;
  const low = source.openingRangeLow;
  const valid =
    source.phase === "COMPLETE" &&
    price !== null &&
    finitePositive(high) &&
    finitePositive(low) &&
    usableComponent(priceStatus) &&
    usableComponent(component?.status ?? null);
  const state = valid ? classifyRangePosition(price, high, low) : null;
  let status: MarketStateFeatureStatus;
  if (!valid || state === null) status = "UNAVAILABLE";
  else if (
    partialComponent(priceStatus) ||
    partialComponent(component?.status ?? null) ||
    source.warningCode !== null
  ) status = "PARTIAL";
  else status = "AVAILABLE";

  return {
    featureId: "PRICE_VS_OPENING_RANGE",
    featureVersion: FEATURE_VERSION,
    status,
    state,
    sourceComponents: ["QUOTE", "OPENING_RANGE"],
    referenceDate: source.currentMarketDate,
    referenceDateRelation: relationForDate(source.currentMarketDate, context),
    inputs,
    derived: {
      distanceToHighPoints: price !== null && high !== null ? price - high : null,
      distanceToLowPoints: price !== null && low !== null ? price - low : null,
    },
    warningCode: sourceWarning(
      status,
      [price === null ? context.quote.warningCode : null, source.warningCode],
      state === null && valid ? "INVALID_RANGE" : status === "PARTIAL" ? "PARTIAL_SOURCE_COMPONENT" : "MISSING_REQUIRED_INPUT",
    ),
  };
}

function deriveGapFeature(context: SpyZeroDteMarketContextResponse): RthGapContextFeature {
  const gap = context.gap;
  const component = findComponent(context, "GAP");
  const inputs = {
    currentMarketDate: gap.currentMarketDate,
    previousRthMarketDate: gap.previousRthMarketDate,
    currentRthOpen: gap.currentRthOpen,
    previousDayClose: gap.previousDayClose,
    gapPoints: gap.gapPoints,
    gapPercent: gap.gapPercent,
    direction: gap.direction,
    fillState: gap.fillState,
    firstObservedFillCandleAt: gap.firstObservedFillCandleAt,
    metricState: gap.metricState,
    sourceState: gap.candleSourceState,
    currentRthCoverageState: gap.currentRthCoverageState,
    previousRthCoverageState: gap.previousRthCoverageState,
  };

  if (component?.status === "NOT_APPLICABLE") {
    return {
      featureId: "RTH_GAP_CONTEXT",
      featureVersion: FEATURE_VERSION,
      status: "NOT_APPLICABLE",
      state: null,
      sourceComponents: ["GAP"],
      referenceDate: gap.currentMarketDate,
      referenceDateRelation: relationForDate(gap.currentMarketDate, context),
      inputs,
      derived: {},
      warningCode: null,
    };
  }

  const valid =
    gap.metricState !== "UNAVAILABLE" &&
    gap.direction !== "UNAVAILABLE" &&
    gap.currentRthOpen !== null &&
    gap.previousDayClose !== null &&
    gap.gapPoints !== null &&
    gap.gapPercent !== null &&
    usableComponent(component?.status ?? null) &&
    gap.currentRthCoverageState !== "UNAVAILABLE" &&
    gap.previousRthCoverageState !== "UNAVAILABLE";
  let status: MarketStateFeatureStatus;
  if (!valid) status = "UNAVAILABLE";
  else if (
    partialComponent(component?.status ?? null) ||
    gap.currentRthCoverageState === "PARTIAL" ||
    gap.currentRthCoverageState === "UNKNOWN" ||
    gap.previousRthCoverageState === "PARTIAL" ||
    gap.previousRthCoverageState === "UNKNOWN" ||
    gap.warningCode !== null
  ) status = "PARTIAL";
  else status = "AVAILABLE";

  return {
    featureId: "RTH_GAP_CONTEXT",
    featureVersion: FEATURE_VERSION,
    status,
    state: valid && gap.direction !== "UNAVAILABLE" ? gap.direction : null,
    sourceComponents: ["GAP"],
    referenceDate: gap.currentMarketDate,
    referenceDateRelation: relationForDate(gap.currentMarketDate, context),
    inputs,
    derived: {},
    warningCode: sourceWarning(
      status,
      [gap.warningCode],
      status === "PARTIAL" ? "PARTIAL_SOURCE_COMPONENT" : "MISSING_REQUIRED_INPUT",
    ),
  };
}

function deriveExpectedMoveFeature(
  context: SpyZeroDteMarketContextResponse,
  price: number | null,
  priceStatus: ComparableComponentStatus | null,
): PriceVsExpectedMoveRangeFeature {
  const source = context.expectedMove;
  const component = findComponent(context, "EXPECTED_MOVE");
  const inputs = {
    price,
    priceSource: price === null ? null : PRICE_SOURCE,
    upperImpliedMoveLevel: source.upperImpliedMoveLevel,
    lowerImpliedMoveLevel: source.lowerImpliedMoveLevel,
    expirationDate: source.expirationDate,
    currentMarketDate: context.currentMarketDate,
    metricState: source.metricState,
    sourceState: source.sourceState,
  };
  if (component?.status === "NOT_APPLICABLE") {
    return {
      featureId: "PRICE_VS_EXPECTED_MOVE_RANGE",
      featureVersion: FEATURE_VERSION,
      status: "NOT_APPLICABLE",
      state: null,
      sourceComponents: ["QUOTE", "EXPECTED_MOVE"],
      referenceDate: source.expirationDate,
      referenceDateRelation: relationForDate(source.expirationDate, context, "CURRENT_EXPIRATION"),
      inputs,
      derived: { distanceToUpperPoints: null, distanceToLowerPoints: null },
      warningCode: null,
    };
  }

  const expirationMatches = source.expirationDate === context.currentMarketDate;
  const upper = source.upperImpliedMoveLevel;
  const lower = source.lowerImpliedMoveLevel;
  const valid =
    expirationMatches &&
    price !== null &&
    finitePositive(upper) &&
    finite(lower) &&
    usableComponent(priceStatus) &&
    usableComponent(component?.status ?? null);
  const state = valid ? classifyExpectedMovePosition(price, upper, lower) : null;
  let status: MarketStateFeatureStatus;
  if (!valid || state === null) status = "UNAVAILABLE";
  else if (
    partialComponent(priceStatus) ||
    partialComponent(component?.status ?? null) ||
    source.warningCode !== null
  ) status = "PARTIAL";
  else status = "AVAILABLE";

  return {
    featureId: "PRICE_VS_EXPECTED_MOVE_RANGE",
    featureVersion: FEATURE_VERSION,
    status,
    state,
    sourceComponents: ["QUOTE", "EXPECTED_MOVE"],
    referenceDate: source.expirationDate,
    referenceDateRelation: relationForDate(source.expirationDate, context, "CURRENT_EXPIRATION"),
    inputs,
    derived: {
      distanceToUpperPoints: price !== null && upper !== null ? price - upper : null,
      distanceToLowerPoints: price !== null && lower !== null ? price - lower : null,
    },
    warningCode: sourceWarning(
      status,
      [price === null ? context.quote.warningCode : null, source.warningCode],
      !expirationMatches
        ? "EXPIRATION_MISMATCH"
        : state === null && valid
          ? "INVALID_RANGE"
          : status === "PARTIAL"
            ? "PARTIAL_SOURCE_COMPONENT"
            : "MISSING_REQUIRED_INPUT",
    ),
  };
}

function deriveGexSignFeature(context: SpyZeroDteMarketContextResponse): NetGexProxySignFeature {
  const source = context.gex;
  const component = findComponent(context, "GEX");
  const inputs = {
    netGammaExposureProxy: source.returnedWindowNetGammaExposureProxy,
    methodology: source.methodology,
    coverageScope: source.coverageScope,
    coverageState: source.coverageState,
    metricState: source.metricState,
    sourceState: source.sourceState,
    eligibleStrikeCount: source.eligibleStrikeCount,
    expirationDate: source.expirationDate,
  };
  if (component?.status === "NOT_APPLICABLE") {
    return {
      featureId: "RETURNED_WINDOW_NET_GEX_SIGN",
      featureVersion: FEATURE_VERSION,
      status: "NOT_APPLICABLE",
      state: null,
      sourceComponents: ["GEX"],
      referenceDate: source.expirationDate,
      referenceDateRelation: relationForDate(source.expirationDate, context, "CURRENT_EXPIRATION"),
      inputs,
      derived: {},
      warningCode: null,
    };
  }
  const expirationMatches = source.expirationDate === context.currentMarketDate;
  const state = expirationMatches && source.returnedWindowNetGammaExposureProxy !== null
    ? classifyExactSign(source.returnedWindowNetGammaExposureProxy)
    : null;
  let status: MarketStateFeatureStatus;
  if (state === null || !usableComponent(component?.status ?? null)) status = "UNAVAILABLE";
  else if (
    partialComponent(component?.status ?? null) ||
    source.coverageState === "PARTIAL" ||
    source.warningCode !== null
  ) status = "PARTIAL";
  else status = "AVAILABLE";
  return {
    featureId: "RETURNED_WINDOW_NET_GEX_SIGN",
    featureVersion: FEATURE_VERSION,
    status,
    state,
    sourceComponents: ["GEX"],
    referenceDate: source.expirationDate,
    referenceDateRelation: relationForDate(source.expirationDate, context, "CURRENT_EXPIRATION"),
    inputs,
    derived: {},
    warningCode: sourceWarning(
      status,
      [source.warningCode],
      !expirationMatches
        ? "EXPIRATION_MISMATCH"
        : status === "PARTIAL"
          ? "PARTIAL_SOURCE_COMPONENT"
          : "MISSING_REQUIRED_INPUT",
    ),
  };
}

function deriveDexSignFeature(context: SpyZeroDteMarketContextResponse): NetDexProxySignFeature {
  const source = context.dex;
  const component = findComponent(context, "DEX");
  const inputs = {
    netDeltaExposureProxy: source.returnedWindowNetDeltaExposureProxy,
    methodology: source.methodology,
    coverageScope: source.coverageScope,
    coverageState: source.coverageState,
    metricState: source.metricState,
    sourceState: source.sourceState,
    eligibleStrikeCount: source.eligibleStrikeCount,
    expirationDate: source.expirationDate,
  };
  if (component?.status === "NOT_APPLICABLE") {
    return {
      featureId: "RETURNED_WINDOW_NET_DEX_SIGN",
      featureVersion: FEATURE_VERSION,
      status: "NOT_APPLICABLE",
      state: null,
      sourceComponents: ["DEX"],
      referenceDate: source.expirationDate,
      referenceDateRelation: relationForDate(source.expirationDate, context, "CURRENT_EXPIRATION"),
      inputs,
      derived: {},
      warningCode: null,
    };
  }
  const expirationMatches = source.expirationDate === context.currentMarketDate;
  const state = expirationMatches && source.returnedWindowNetDeltaExposureProxy !== null
    ? classifyExactSign(source.returnedWindowNetDeltaExposureProxy)
    : null;
  let status: MarketStateFeatureStatus;
  if (state === null || !usableComponent(component?.status ?? null)) status = "UNAVAILABLE";
  else if (
    partialComponent(component?.status ?? null) ||
    source.coverageState === "PARTIAL" ||
    source.warningCode !== null
  ) status = "PARTIAL";
  else status = "AVAILABLE";
  return {
    featureId: "RETURNED_WINDOW_NET_DEX_SIGN",
    featureVersion: FEATURE_VERSION,
    status,
    state,
    sourceComponents: ["DEX"],
    referenceDate: source.expirationDate,
    referenceDateRelation: relationForDate(source.expirationDate, context, "CURRENT_EXPIRATION"),
    inputs,
    derived: {},
    warningCode: sourceWarning(
      status,
      [source.warningCode],
      !expirationMatches
        ? "EXPIRATION_MISMATCH"
        : status === "PARTIAL"
          ? "PARTIAL_SOURCE_COMPONENT"
          : "MISSING_REQUIRED_INPUT",
    ),
  };
}

export function deriveMarketStateEngineState(
  sourceContextState: SpyZeroDteMarketContextResponse["contextState"],
  price: number | null,
  statuses: readonly MarketStateFeatureStatus[],
): { engineState: MarketStateEngineState; warningCode: SpyZeroDteDeterministicMarketStateResponse["warningCode"] } {
  if (sourceContextState === "UNAVAILABLE") {
    return { engineState: "UNAVAILABLE", warningCode: "MARKET_CONTEXT_UNAVAILABLE" };
  }
  if (price === null) {
    return { engineState: "UNAVAILABLE", warningCode: "CURRENT_PRICE_UNAVAILABLE" };
  }
  const applicable = statuses.filter((status) => status !== "NOT_APPLICABLE");
  const usableCount = applicable.filter((status) => status === "AVAILABLE" || status === "PARTIAL").length;
  if (usableCount === 0) {
    return { engineState: "UNAVAILABLE", warningCode: "REQUIRED_FEATURES_UNAVAILABLE" };
  }
  if (applicable.some((status) => status === "PARTIAL" || status === "UNAVAILABLE")) {
    return { engineState: "PARTIAL", warningCode: "PARTIAL_MARKET_STATE" };
  }
  return { engineState: "AVAILABLE", warningCode: null };
}

export function buildSpyZeroDteDeterministicMarketState(
  context: SpyZeroDteMarketContextResponse,
  nowMs = Date.now(),
): SpyZeroDteDeterministicMarketStateResponse {
  const { price, priceStatus } = canonicalPrice(context);
  const sessionPhase = deriveSessionPhaseFeature(context);
  const priceVsVwap = derivePriceVsVwapFeature(context, price, priceStatus);
  const priceVsPriorDayRange = derivePriorDayRangeFeature(context, price, priceStatus);
  const priceVsPremarketRange = derivePremarketRangeFeature(context, price, priceStatus);
  const priceVsOpeningRange = deriveOpeningRangeFeature(context, price, priceStatus);
  const gapContext = deriveGapFeature(context);
  const priceVsExpectedMoveRange = deriveExpectedMoveFeature(context, price, priceStatus);
  const netGexProxySign = deriveGexSignFeature(context);
  const netDexProxySign = deriveDexSignFeature(context);

  const features = {
    sessionPhase,
    priceVsVwap,
    priceVsPriorDayRange,
    priceVsPremarketRange,
    priceVsOpeningRange,
    gapContext,
    priceVsExpectedMoveRange,
    netGexProxySign,
    netDexProxySign,
  };
  const featureValues = Object.values(features);
  const featureStatuses = featureValues.map((feature) => ({
    featureId: feature.featureId,
    status: feature.status,
    warningCode: feature.warningCode,
  }));
  const featureWarnings = featureValues
    .filter((feature) => feature.warningCode !== null)
    .map((feature) => ({ featureId: feature.featureId, warningCode: feature.warningCode! }));
  const { engineState, warningCode } = deriveMarketStateEngineState(
    context.contextState,
    price,
    featureValues.map((feature) => feature.status),
  );

  return SpyZeroDteDeterministicMarketStateResponseSchema.parse({
    symbol: "SPY",
    product: "SPY_ZERO_DTE_DETERMINISTIC_MARKET_STATE",
    engineVersion: FEATURE_VERSION,
    currentMarketDate: context.currentMarketDate,
    mostRecentRthSessionDate: context.mostRecentRthSessionDate,
    sourceContextState: context.contextState,
    sourceContextAssembledAt: context.assembledAt,
    calculatedAt: new Date(nowMs).toISOString(),
    engineState,
    price,
    priceSource: price === null ? null : PRICE_SOURCE,
    quoteTimestamp: price === null ? null : context.quote.quoteTimestamp,
    quoteSourceState: context.quote.sourceState,
    exposureStructure: context.exposureStructure,
    features,
    featureStatuses,
    featureWarnings,
    warningCode,
  });
}
