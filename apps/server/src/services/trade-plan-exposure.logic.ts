import {
  TradePlanExposureConfirmationSchema,
  type ExposureWall,
  type SpyZeroDteDeterministicMarketStateResponse,
  type TradePlanExposureComponent,
  type TradePlanExposureComponentReasonCode,
  type TradePlanExposureComponentStatus,
  type TradePlanExposureConfirmation,
  type TradePlanExposureSourceQuality,
} from "@spy-copilot/shared";

export const EXPOSURE_CONFIRMATION_METHODOLOGY_VERSION =
  "EXPOSURE_CONFIRMATION_V1" as const;

export const GEX_REGIME_MAX_ADJUSTMENT_POINTS = 8;
export const DEX_REGIME_MAX_ADJUSTMENT_POINTS = 6;
export const DIRECTIONAL_WALL_MAX_ADJUSTMENT_POINTS = 4;
export const NEARBY_DIRECTIONAL_WALL_THRESHOLD_PERCENT = 1 as const;

export type ExposureEvaluatedDirection = "CALLS" | "PUTS" | "NONE";

function normalizeZero(value: number): number {
  return Object.is(value, -0) ? 0 : value;
}

function sourceQuality(
  metricState: "LIVE" | "STALE" | "UNAVAILABLE",
  coverageState: "COMPLETE" | "PARTIAL" | "UNAVAILABLE",
): TradePlanExposureSourceQuality {
  if (metricState === "UNAVAILABLE" || coverageState === "UNAVAILABLE") {
    return "UNAVAILABLE";
  }
  if (metricState === "STALE" || coverageState === "PARTIAL") {
    return "PARTIAL";
  }
  return "COMPLETE";
}

function qualityMultiplier(quality: TradePlanExposureSourceQuality): number {
  if (quality === "COMPLETE") return 1;
  if (quality === "PARTIAL") return 0.5;
  return 0;
}

function contribution(
  status: TradePlanExposureComponentStatus,
  maximum: number,
  quality: TradePlanExposureSourceQuality,
): number {
  const sign = status === "SUPPORTIVE" ? 1 : status === "CONFLICTING" ? -1 : 0;
  return normalizeZero(sign * maximum * qualityMultiplier(quality));
}

function notApplicableComponent(
  componentId: TradePlanExposureComponent["componentId"],
  maximumAbsoluteContributionPoints: number,
  quality: TradePlanExposureSourceQuality,
): TradePlanExposureComponent {
  return {
    componentId,
    status: "NOT_APPLICABLE",
    rawState: null,
    contributionPoints: 0,
    maximumAbsoluteContributionPoints,
    sourceQuality: quality,
    reasonCode: "NO_DIRECTIONAL_THESIS",
  };
}

function unavailableComponent(
  componentId: TradePlanExposureComponent["componentId"],
  maximumAbsoluteContributionPoints: number,
  quality: TradePlanExposureSourceQuality,
  reasonCode: TradePlanExposureComponentReasonCode,
): TradePlanExposureComponent {
  return {
    componentId,
    status: "UNAVAILABLE",
    rawState: null,
    contributionPoints: 0,
    maximumAbsoluteContributionPoints,
    sourceQuality: quality,
    reasonCode,
  };
}

function gexComponent(
  marketState: SpyZeroDteDeterministicMarketStateResponse,
  direction: Exclude<ExposureEvaluatedDirection, "NONE">,
): TradePlanExposureComponent {
  const exposure = marketState.exposureStructure;
  if (!exposure) {
    return unavailableComponent(
      "GEX_REGIME",
      GEX_REGIME_MAX_ADJUSTMENT_POINTS,
      "UNAVAILABLE",
      "GEX_UNAVAILABLE",
    );
  }
  const quality = sourceQuality(
    exposure.sourceGexMetricState,
    exposure.sourceGexCoverageState,
  );
  if (quality === "UNAVAILABLE" || exposure.gammaRegime === "UNAVAILABLE") {
    return unavailableComponent(
      "GEX_REGIME",
      GEX_REGIME_MAX_ADJUSTMENT_POINTS,
      quality,
      "GEX_UNAVAILABLE",
    );
  }

  let status: TradePlanExposureComponentStatus = "NEUTRAL";
  let reasonCode: TradePlanExposureComponentReasonCode = "GEX_BALANCED";
  if (direction === "CALLS" && exposure.gammaRegime === "CALL_DOMINANT") {
    status = "SUPPORTIVE";
    reasonCode = "CALL_GEX_SUPPORTS_CALLS";
  } else if (direction === "PUTS" && exposure.gammaRegime === "PUT_DOMINANT") {
    status = "SUPPORTIVE";
    reasonCode = "PUT_GEX_SUPPORTS_PUTS";
  } else if (direction === "CALLS" && exposure.gammaRegime === "PUT_DOMINANT") {
    status = "CONFLICTING";
    reasonCode = "PUT_GEX_CONFLICTS_WITH_CALLS";
  } else if (direction === "PUTS" && exposure.gammaRegime === "CALL_DOMINANT") {
    status = "CONFLICTING";
    reasonCode = "CALL_GEX_CONFLICTS_WITH_PUTS";
  }

  return {
    componentId: "GEX_REGIME",
    status,
    rawState: exposure.gammaRegime,
    contributionPoints: contribution(
      status,
      GEX_REGIME_MAX_ADJUSTMENT_POINTS,
      quality,
    ),
    maximumAbsoluteContributionPoints: GEX_REGIME_MAX_ADJUSTMENT_POINTS,
    sourceQuality: quality,
    reasonCode,
  };
}

function dexComponent(
  marketState: SpyZeroDteDeterministicMarketStateResponse,
  direction: Exclude<ExposureEvaluatedDirection, "NONE">,
): TradePlanExposureComponent {
  const exposure = marketState.exposureStructure;
  if (!exposure) {
    return unavailableComponent(
      "DEX_REGIME",
      DEX_REGIME_MAX_ADJUSTMENT_POINTS,
      "UNAVAILABLE",
      "DEX_UNAVAILABLE",
    );
  }
  const quality = sourceQuality(
    exposure.sourceDexMetricState,
    exposure.sourceDexCoverageState,
  );
  if (quality === "UNAVAILABLE" || exposure.dexRegime === "UNAVAILABLE") {
    return unavailableComponent(
      "DEX_REGIME",
      DEX_REGIME_MAX_ADJUSTMENT_POINTS,
      quality,
      "DEX_UNAVAILABLE",
    );
  }

  let status: TradePlanExposureComponentStatus = "NEUTRAL";
  let reasonCode: TradePlanExposureComponentReasonCode = "DEX_BALANCED";
  if (direction === "CALLS" && exposure.dexRegime === "POSITIVE") {
    status = "SUPPORTIVE";
    reasonCode = "POSITIVE_DEX_SUPPORTS_CALLS";
  } else if (direction === "PUTS" && exposure.dexRegime === "NEGATIVE") {
    status = "SUPPORTIVE";
    reasonCode = "NEGATIVE_DEX_SUPPORTS_PUTS";
  } else if (direction === "CALLS" && exposure.dexRegime === "NEGATIVE") {
    status = "CONFLICTING";
    reasonCode = "NEGATIVE_DEX_CONFLICTS_WITH_CALLS";
  } else if (direction === "PUTS" && exposure.dexRegime === "POSITIVE") {
    status = "CONFLICTING";
    reasonCode = "POSITIVE_DEX_CONFLICTS_WITH_PUTS";
  }

  return {
    componentId: "DEX_REGIME",
    status,
    rawState: exposure.dexRegime,
    contributionPoints: contribution(
      status,
      DEX_REGIME_MAX_ADJUSTMENT_POINTS,
      quality,
    ),
    maximumAbsoluteContributionPoints: DEX_REGIME_MAX_ADJUSTMENT_POINTS,
    sourceQuality: quality,
    reasonCode,
  };
}

function directionalWall(
  marketState: SpyZeroDteDeterministicMarketStateResponse,
  direction: Exclude<ExposureEvaluatedDirection, "NONE">,
): ExposureWall | null {
  const exposure = marketState.exposureStructure;
  if (!exposure) return null;
  return direction === "CALLS"
    ? exposure.callWalls[0] ?? null
    : exposure.putWalls[0] ?? null;
}

function wallComponent(
  marketState: SpyZeroDteDeterministicMarketStateResponse,
  direction: Exclude<ExposureEvaluatedDirection, "NONE">,
): { component: TradePlanExposureComponent; wall: ExposureWall | null } {
  const exposure = marketState.exposureStructure;
  const quality = exposure
    ? sourceQuality(
        exposure.sourceGexMetricState,
        exposure.sourceGexCoverageState,
      )
    : "UNAVAILABLE";
  const wall = directionalWall(marketState, direction);
  if (quality === "UNAVAILABLE" || wall === null) {
    return {
      component: unavailableComponent(
        "DIRECTIONAL_WALL",
        DIRECTIONAL_WALL_MAX_ADJUSTMENT_POINTS,
        quality,
        "DIRECTIONAL_WALL_UNAVAILABLE",
      ),
      wall,
    };
  }

  const nearby =
    Math.abs(wall.distanceFromUnderlyingPercent) <=
    NEARBY_DIRECTIONAL_WALL_THRESHOLD_PERCENT;
  const directionalSide =
    direction === "CALLS"
      ? wall.distanceFromUnderlyingPoints > 0
      : wall.distanceFromUnderlyingPoints < 0;
  const opposingSide =
    direction === "CALLS"
      ? wall.distanceFromUnderlyingPoints < 0
      : wall.distanceFromUnderlyingPoints > 0;

  let status: TradePlanExposureComponentStatus = "NEUTRAL";
  let reasonCode: TradePlanExposureComponentReasonCode =
    "DIRECTIONAL_WALL_NOT_NEARBY";
  if (nearby && directionalSide) {
    status = "SUPPORTIVE";
    reasonCode = "DIRECTIONAL_WALL_NEARBY";
  } else if (nearby && opposingSide) {
    status = "CONFLICTING";
    reasonCode = "DIRECTIONAL_WALL_OPPOSING_SIDE";
  }

  return {
    component: {
      componentId: "DIRECTIONAL_WALL",
      status,
      rawState: `${wall.strikePrice}`,
      contributionPoints: contribution(
        status,
        DIRECTIONAL_WALL_MAX_ADJUSTMENT_POINTS,
        quality,
      ),
      maximumAbsoluteContributionPoints:
        DIRECTIONAL_WALL_MAX_ADJUSTMENT_POINTS,
      sourceQuality: quality,
      reasonCode,
    },
    wall,
  };
}

function overallSourceQuality(
  components: readonly TradePlanExposureComponent[],
): TradePlanExposureSourceQuality {
  if (components.every((item) => item.sourceQuality === "UNAVAILABLE")) {
    return "UNAVAILABLE";
  }
  if (components.some((item) => item.sourceQuality !== "COMPLETE")) {
    return "PARTIAL";
  }
  return "COMPLETE";
}

export function buildTradePlanExposureConfirmation(
  marketState: SpyZeroDteDeterministicMarketStateResponse,
  direction: ExposureEvaluatedDirection,
  baseStructuralConfidenceScore: number | null,
): TradePlanExposureConfirmation {
  const exposure = marketState.exposureStructure;
  const gexQuality = exposure
    ? sourceQuality(
        exposure.sourceGexMetricState,
        exposure.sourceGexCoverageState,
      )
    : "UNAVAILABLE";
  const dexQuality = exposure
    ? sourceQuality(
        exposure.sourceDexMetricState,
        exposure.sourceDexCoverageState,
      )
    : "UNAVAILABLE";

  let components: TradePlanExposureComponent[];
  let primaryDirectionalWall: ExposureWall | null = null;
  if (direction === "NONE") {
    components = [
      notApplicableComponent(
        "GEX_REGIME",
        GEX_REGIME_MAX_ADJUSTMENT_POINTS,
        gexQuality,
      ),
      notApplicableComponent(
        "DEX_REGIME",
        DEX_REGIME_MAX_ADJUSTMENT_POINTS,
        dexQuality,
      ),
      notApplicableComponent(
        "DIRECTIONAL_WALL",
        DIRECTIONAL_WALL_MAX_ADJUSTMENT_POINTS,
        gexQuality,
      ),
    ];
  } else {
    const wall = wallComponent(marketState, direction);
    primaryDirectionalWall = wall.wall;
    components = [
      gexComponent(marketState, direction),
      dexComponent(marketState, direction),
      wall.component,
    ];
  }

  const supportiveComponentCount = components.filter(
    (item) => item.status === "SUPPORTIVE",
  ).length;
  const conflictingComponentCount = components.filter(
    (item) => item.status === "CONFLICTING",
  ).length;
  const neutralComponentCount = components.filter(
    (item) => item.status === "NEUTRAL",
  ).length;
  const unavailableComponentCount = components.filter(
    (item) => item.status === "UNAVAILABLE",
  ).length;
  const quality = overallSourceQuality(components);
  const adjustmentPoints =
    direction === "NONE"
      ? 0
      : normalizeZero(
          components.reduce((sum, item) => sum + item.contributionPoints, 0),
        );
  const adjustedConfidenceScore =
    baseStructuralConfidenceScore === null
      ? null
      : Math.min(
          100,
          Math.max(0, baseStructuralConfidenceScore + adjustmentPoints),
        );

  let state: TradePlanExposureConfirmation["state"];
  if (direction === "NONE") state = "NOT_APPLICABLE";
  else if (components.every((item) => item.status === "UNAVAILABLE")) {
    state = "UNAVAILABLE";
  } else if (supportiveComponentCount > 0 && conflictingComponentCount > 0) {
    state = "MIXED";
  } else if (supportiveComponentCount > 0) state = "SUPPORTIVE";
  else if (conflictingComponentCount > 0) state = "CONFLICTING";
  else state = "NEUTRAL";

  const warnings = new Set<TradePlanExposureConfirmation["warnings"][number]>();
  if (conflictingComponentCount > 0) warnings.add("EXPOSURE_CONFLICT");
  if (quality === "PARTIAL") warnings.add("PARTIAL_EXPOSURE_INPUTS");
  if (
    exposure &&
    (exposure.metricState === "STALE" ||
      exposure.sourceGexMetricState === "STALE" ||
      exposure.sourceDexMetricState === "STALE")
  ) {
    warnings.add("STALE_EXPOSURE_INPUTS");
  }
  if (quality === "UNAVAILABLE") warnings.add("EXPOSURE_UNAVAILABLE");

  return TradePlanExposureConfirmationSchema.parse({
    methodologyVersion: EXPOSURE_CONFIRMATION_METHODOLOGY_VERSION,
    evaluatedDirection: direction,
    state,
    sourceQuality: quality,
    baseStructuralConfidenceScore,
    adjustmentPoints,
    adjustedConfidenceScore,
    supportiveComponentCount,
    conflictingComponentCount,
    neutralComponentCount,
    unavailableComponentCount,
    nearbyWallThresholdPercent: NEARBY_DIRECTIONAL_WALL_THRESHOLD_PERCENT,
    primaryDirectionalWall,
    components,
    warnings: [...warnings],
    disclosures: {
      softConfirmationOnly: true,
      cannotCreateDirection: true,
      cannotBlockEligibility: true,
      returnedWindowOnly: true,
      openInterestMayBeStaleIntraday: true,
      notObservedDealerInventory: true,
      directionalWallIsContextNotTarget: true,
      noPrivateAccountData: true,
      noPositionSizing: true,
      noOrderExecution: true,
    },
  });
}
