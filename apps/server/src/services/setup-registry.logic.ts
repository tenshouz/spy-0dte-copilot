import {
  SetupRegistryResponseSchema,
  TradingOpportunityCandidateSchema,
  type SetupFamilyId,
  type SetupRegistryEntry,
  type SetupRegistryResponse,
  type SpyZeroDteDeterministicMarketStateResponse,
  type SpyZeroDteTradePlanAssemblyResponse,
  type TradingDirection,
  type TradingOpportunityCandidate,
} from "@spy-copilot/shared";
import {
  TRADING_POLICY_V1,
  buildSetupEpisodeId,
  calculatePlannedRiskDollars,
  deriveTargetLevels,
} from "./trading-policy.logic";

function buildStateMachine(): SetupRegistryEntry["stateMachine"] {
  return [
    "DETECTED",
    "ARMED",
    "CONFIRMED",
    "READY",
    "INVALIDATED",
  ];
}

function registryEntry(
  input: Omit<SetupRegistryEntry, "stateMachine" | "analyticsEnabled">,
): SetupRegistryEntry {
  return {
    ...input,
    stateMachine: buildStateMachine(),
    analyticsEnabled: true,
  };
}

export const SETUP_REGISTRY_V1_ENTRIES: SetupRegistryEntry[] = [
  registryEntry({
    setupId: "OPENING_RANGE_BREAKOUT",
    displayName: "Opening-range breakout",
    directionCapability: "BOTH",
    promotionStatus: "LIVE",
    defaultPromotionStatus: "LIVE",
    triggerMethod: "Confirmed close through the buffered 15-minute opening-range boundary",
    invalidationMethod: "Buffered trigger failure or return through opening-range structure",
    targetMethod: "Risk-qualified objective hierarchy; Target 2 is the live one-contract exit",
    canCreateLiveOpportunity: true,
    notes: ["Bridged from the validated TRADE_PLAN_V3 opening-range implementation"],
  }),
  registryEntry({
    setupId: "VWAP_RECLAIM",
    displayName: "VWAP reclaim",
    directionCapability: "CALLS",
    promotionStatus: "LIVE",
    defaultPromotionStatus: "LIVE",
    triggerMethod: "Confirmed reclaim and hold above RTH VWAP with execution-quality confirmation",
    invalidationMethod: "Buffered loss of VWAP/reclaim structure",
    targetMethod: "Risk-qualified bullish objective hierarchy",
    canCreateLiveOpportunity: true,
    notes: ["Bridged from the validated TRADE_PLAN_V3 VWAP reclaim implementation"],
  }),
  registryEntry({
    setupId: "VWAP_LOSS",
    displayName: "VWAP loss",
    directionCapability: "PUTS",
    promotionStatus: "LIVE",
    defaultPromotionStatus: "LIVE",
    triggerMethod: "Confirmed loss and hold below RTH VWAP with execution-quality confirmation",
    invalidationMethod: "Buffered reclaim of VWAP/loss structure",
    targetMethod: "Risk-qualified bearish objective hierarchy",
    canCreateLiveOpportunity: true,
    notes: ["Bridged from the validated TRADE_PLAN_V3 VWAP loss implementation"],
  }),
  registryEntry({
    setupId: "BREAKOUT_RETEST_CONTINUATION",
    displayName: "Breakout-retest continuation",
    directionCapability: "BOTH",
    promotionStatus: "LIVE",
    defaultPromotionStatus: "LIVE",
    triggerMethod: "Confirmed structural break followed by a bounded retest and hold",
    invalidationMethod: "Retest failure or buffered loss of the broken level",
    targetMethod: "Risk-qualified continuation objective hierarchy",
    canCreateLiveOpportunity: true,
    notes: ["Bridged from validated retest lifecycle fields when present"],
  }),
  registryEntry({
    setupId: "FAILED_BULLISH_BREAK_REVERSAL",
    displayName: "Failed bullish-break reversal",
    directionCapability: "PUTS",
    promotionStatus: "SHADOW",
    defaultPromotionStatus: "SHADOW",
    triggerMethod: "Research detection of a bullish structural break followed by a close back below the level",
    invalidationMethod: "Recovery above the failed-break extreme",
    targetMethod: "Research-only mean-reversion objectives",
    canCreateLiveOpportunity: false,
    notes: ["Shadow-only until historical sample and false-positive review pass"],
  }),
  registryEntry({
    setupId: "FAILED_BEARISH_BREAK_REVERSAL",
    displayName: "Failed bearish-break reversal",
    directionCapability: "CALLS",
    promotionStatus: "SHADOW",
    defaultPromotionStatus: "SHADOW",
    triggerMethod: "Research detection of a bearish structural break followed by a close back above the level",
    invalidationMethod: "Recovery below the failed-break extreme",
    targetMethod: "Research-only mean-reversion objectives",
    canCreateLiveOpportunity: false,
    notes: ["Shadow-only until historical sample and false-positive review pass"],
  }),
  registryEntry({
    setupId: "BULLISH_TREND_PULLBACK",
    displayName: "Bullish trend pullback",
    directionCapability: "CALLS",
    promotionStatus: "SHADOW",
    defaultPromotionStatus: "SHADOW",
    triggerMethod: "Research detection of an above-VWAP trend, controlled pullback, and renewed higher close",
    invalidationMethod: "Loss of pullback low or trend reference",
    targetMethod: "Research-only continuation objectives",
    canCreateLiveOpportunity: false,
    notes: ["No live alert or trade eligibility"],
  }),
  registryEntry({
    setupId: "BEARISH_TREND_PULLBACK",
    displayName: "Bearish trend pullback",
    directionCapability: "PUTS",
    promotionStatus: "SHADOW",
    defaultPromotionStatus: "SHADOW",
    triggerMethod: "Research detection of a below-VWAP trend, controlled bounce, and renewed lower close",
    invalidationMethod: "Recovery above pullback high or trend reference",
    targetMethod: "Research-only continuation objectives",
    canCreateLiveOpportunity: false,
    notes: ["No live alert or trade eligibility"],
  }),
  registryEntry({
    setupId: "BULLISH_CONTINUATION_BASE",
    displayName: "Bullish continuation base",
    directionCapability: "CALLS",
    promotionStatus: "SHADOW",
    defaultPromotionStatus: "SHADOW",
    triggerMethod: "Research detection of a compact above-VWAP base followed by an upside close",
    invalidationMethod: "Close below base low",
    targetMethod: "Research-only measured continuation objectives",
    canCreateLiveOpportunity: false,
    notes: ["No live alert or trade eligibility"],
  }),
  registryEntry({
    setupId: "BEARISH_CONTINUATION_BASE",
    displayName: "Bearish continuation base",
    directionCapability: "PUTS",
    promotionStatus: "SHADOW",
    defaultPromotionStatus: "SHADOW",
    triggerMethod: "Research detection of a compact below-VWAP base followed by a downside close",
    invalidationMethod: "Close above base high",
    targetMethod: "Research-only measured continuation objectives",
    canCreateLiveOpportunity: false,
    notes: ["No live alert or trade eligibility"],
  }),
  registryEntry({
    setupId: "RANGE_LOW_MEAN_REVERSION",
    displayName: "Range-low mean reversion",
    directionCapability: "CALLS",
    promotionStatus: "SHADOW",
    defaultPromotionStatus: "SHADOW",
    triggerMethod: "Research detection of rejection at an available range low and close back inside range",
    invalidationMethod: "Acceptance below the range-low rejection extreme",
    targetMethod: "Research-only range midpoint/opposite-side objectives",
    canCreateLiveOpportunity: false,
    notes: ["No live alert or trade eligibility"],
  }),
  registryEntry({
    setupId: "RANGE_HIGH_MEAN_REVERSION",
    displayName: "Range-high mean reversion",
    directionCapability: "PUTS",
    promotionStatus: "SHADOW",
    defaultPromotionStatus: "SHADOW",
    triggerMethod: "Research detection of rejection at an available range high and close back inside range",
    invalidationMethod: "Acceptance above the range-high rejection extreme",
    targetMethod: "Research-only range midpoint/opposite-side objectives",
    canCreateLiveOpportunity: false,
    notes: ["No live alert or trade eligibility"],
  }),
  registryEntry({
    setupId: "GAP_AND_GO_CONTINUATION",
    displayName: "Gap-and-go continuation",
    directionCapability: "BOTH",
    promotionStatus: "SHADOW",
    defaultPromotionStatus: "SHADOW",
    triggerMethod: "Research detection of an unfilled RTH gap with price holding in the gap direction",
    invalidationMethod: "Loss of opening structure or meaningful gap retracement",
    targetMethod: "Research-only continuation objectives",
    canCreateLiveOpportunity: false,
    notes: ["Gap relationships remain research-only in this release"],
  }),
  registryEntry({
    setupId: "GAP_FILL_REVERSAL",
    displayName: "Gap-fill reversal",
    directionCapability: "BOTH",
    promotionStatus: "SHADOW",
    defaultPromotionStatus: "SHADOW",
    triggerMethod: "Research detection of a completed/near-completed gap fill followed by reversal confirmation",
    invalidationMethod: "Renewed acceptance through the filled gap boundary",
    targetMethod: "Research-only reversal objectives",
    canCreateLiveOpportunity: false,
    notes: ["Gap relationships remain research-only in this release"],
  }),
];

export function buildSetupRegistry(nowMs: number): SetupRegistryResponse {
  return SetupRegistryResponseSchema.parse({
    product: "SPY_ZERO_DTE_MODULAR_SETUP_REGISTRY",
    methodologyVersion: "SETUP_REGISTRY_V1",
    calculatedAt: new Date(nowMs).toISOString(),
    entries: SETUP_REGISTRY_V1_ENTRIES,
    disclosures: {
      registryIsVersioned: true,
      shadowSetupsCannotCreateAlertsOrPositions: true,
      promotionRequiresExplicitCodeChangeAndValidation: true,
      noOrderExecution: true,
    },
  });
}

function mapLegacySetupType(value: string | undefined): SetupFamilyId | null {
  switch (value) {
    case "OPENING_RANGE_BREAKOUT":
      return "OPENING_RANGE_BREAKOUT";
    case "VWAP_RECLAIM_BREAKOUT":
      return "VWAP_RECLAIM";
    case "VWAP_LOSS_BREAKDOWN":
      return "VWAP_LOSS";
    case "CONFLUENCE_BREAKOUT":
      return "BREAKOUT_RETEST_CONTINUATION";
    default:
      return null;
  }
}

function legacyLifecycleState(
  assembly: SpyZeroDteTradePlanAssemblyResponse,
): TradingOpportunityCandidate["lifecycleState"] {
  if (assembly.planState === "READY") return "READY";
  if (assembly.planState === "NO_QUALIFIED_CONTRACT") return "CONFIRMED";
  if (assembly.planState === "WAITING_FOR_TRIGGER") return "ARMED";
  if (assembly.planState === "NOT_QUALIFIED") return "INVALIDATED";
  if (assembly.planState === "UNAVAILABLE") return "UNAVAILABLE";
  return "DETECTED";
}

function usableDirection(
  direction: SpyZeroDteTradePlanAssemblyResponse["direction"],
): TradingDirection | null {
  return direction === "CALLS" || direction === "PUTS" ? direction : null;
}

function numeric(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function createLegacyCandidate(
  assembly: SpyZeroDteTradePlanAssemblyResponse,
): TradingOpportunityCandidate | null {
  const setupId = mapLegacySetupType(assembly.entryCondition.setupType);
  const direction = usableDirection(assembly.direction);
  if (!setupId || !direction) return null;
  const triggerLevel = numeric(assembly.entryCondition.triggerLevel);
  const currentPrice = numeric(assembly.currentPrice);
  const invalidationLevel = numeric(assembly.structuralInvalidation.level);
  const primaryObjectiveLevel = numeric(assembly.primaryObjective.level);
  const targets = deriveTargetLevels({
    direction,
    entryUnderlyingPrice: currentPrice ?? triggerLevel,
    structuralStopLevel: invalidationLevel,
    primaryObjectiveLevel,
  });
  const levelType =
    assembly.entryCondition.planningReferenceType ?? "TRIGGER_LEVEL";
  const episodeId = buildSetupEpisodeId({
    marketDate: assembly.currentMarketDate,
    setupId,
    direction,
    levelType,
    triggerLevel,
    confirmationCandleAt: assembly.entryCondition.confirmationCandleAt ?? null,
  });
  const selected = assembly.selectedContract;
  const confidence =
    assembly.planConfidence?.adjustedConfidenceScore ?? assembly.bias.confidenceScore;
  const underlyingRewardRiskRatio = numeric(
    assembly.underlyingRiskReward.rewardRiskRatio,
  );
  const optionRewardRiskRatio = numeric(
    assembly.optionRiskReward?.estimatedPremiumRewardRiskRatio,
  );
  const selectedContractAsk = numeric(selected.ask);
  const plannedRiskDollars = calculatePlannedRiskDollars(
    assembly.optionRiskReward?.estimatedPremiumRiskPerShare,
  );
  const livePolicyFailures: string[] = [];
  if (assembly.planState === "READY") {
    if (selected.contractSymbol === null) {
      livePolicyFailures.push("CONTRACT_NOT_SELECTED");
    }
    if (selectedContractAsk === null) {
      livePolicyFailures.push("CONTRACT_ASK_UNAVAILABLE");
    } else if (
      selectedContractAsk * 100 > TRADING_POLICY_V1.maximumContractPremiumDollars
    ) {
      livePolicyFailures.push("MAXIMUM_CONTRACT_PREMIUM_EXCEEDED");
    }
    if (plannedRiskDollars === null) {
      livePolicyFailures.push("PLANNED_RISK_UNAVAILABLE");
    } else if (
      plannedRiskDollars > TRADING_POLICY_V1.maximumPlannedStructuralLossDollars
    ) {
      livePolicyFailures.push("MAXIMUM_PLANNED_LOSS_EXCEEDED");
    }
    if (underlyingRewardRiskRatio === null) {
      livePolicyFailures.push("UNDERLYING_REWARD_RISK_UNAVAILABLE");
    } else if (
      underlyingRewardRiskRatio < TRADING_POLICY_V1.minimumUnderlyingRewardRiskRatio
    ) {
      livePolicyFailures.push("UNDERLYING_REWARD_RISK_BELOW_POLICY_MINIMUM");
    }
    if (optionRewardRiskRatio === null) {
      livePolicyFailures.push("OPTION_REWARD_RISK_UNAVAILABLE");
    } else if (
      optionRewardRiskRatio < TRADING_POLICY_V1.minimumOptionPremiumRewardRiskRatio
    ) {
      livePolicyFailures.push("OPTION_REWARD_RISK_BELOW_POLICY_MINIMUM");
    }
  }
  const liveEligible =
    assembly.planState === "READY" && livePolicyFailures.length === 0;
  return TradingOpportunityCandidateSchema.parse({
    candidateId: `legacy-${episodeId}`,
    setupId,
    setupEpisodeId: episodeId,
    promotionStatus: "LIVE",
    direction,
    lifecycleState: legacyLifecycleState(assembly),
    source: "LEGACY_ASSEMBLY_BRIDGE",
    triggerLevel,
    levelType,
    invalidationLevel,
    target1Level: targets.target1Level,
    target2Level: targets.target2Level,
    target3Level: targets.target3Level,
    underlyingRewardRiskRatio,
    optionRewardRiskRatio,
    confidenceScore: numeric(confidence),
    selectedContractSymbol: selected.contractSymbol,
    selectedContractAsk,
    selectedContractBid: numeric(selected.bid),
    selectedContractStrike: numeric(selected.strikePrice),
    selectedContractExpiration: selected.expirationDate,
    selectedContractQuoteAt: selected.quoteAt,
    reasonCodes: [assembly.primaryReasonCode, ...livePolicyFailures],
    warningCodes: [
      ...(assembly.warningCode ? [assembly.warningCode] : []),
      ...(livePolicyFailures.length > 0 ? ["TRADING_POLICY_V1_ENTRY_ECONOMICS_BLOCKED"] : []),
    ],
    liveEligible,
  });
}

interface CandleLike {
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
  timestamp: number;
}

function completedCandles(
  marketState: SpyZeroDteDeterministicMarketStateResponse,
): CandleLike[] {
  return (marketState.executionContext?.recentCompletedCandles ?? [])
    .filter(
      (row) =>
        [row.open, row.high, row.low, row.close, row.volume].every(
          (value) => typeof value === "number" && Number.isFinite(value),
        ) && typeof row.timestamp === "number" && Number.isFinite(row.timestamp),
    )
    .map((row) => ({
      open: row.open,
      high: row.high,
      low: row.low,
      close: row.close,
      volume: row.volume,
      timestamp: row.timestamp,
    }));
}

function addShadowCandidate(input: {
  rows: TradingOpportunityCandidate[];
  assembly: SpyZeroDteTradePlanAssemblyResponse;
  setupId: SetupFamilyId;
  direction: TradingDirection;
  triggerLevel: number;
  invalidationLevel: number | null;
  lifecycleState: TradingOpportunityCandidate["lifecycleState"];
  reasonCodes: string[];
}): void {
  const objective = numeric(input.assembly.primaryObjective.level);
  const entry = numeric(input.assembly.currentPrice) ?? input.triggerLevel;
  const targets = deriveTargetLevels({
    direction: input.direction,
    entryUnderlyingPrice: entry,
    structuralStopLevel: input.invalidationLevel,
    primaryObjectiveLevel: objective,
  });
  const episodeId = buildSetupEpisodeId({
    marketDate: input.assembly.currentMarketDate,
    setupId: input.setupId,
    direction: input.direction,
    levelType: "SHADOW_DETERMINISTIC_REFERENCE",
    triggerLevel: input.triggerLevel,
  });
  input.rows.push(
    TradingOpportunityCandidateSchema.parse({
      candidateId: `shadow-${episodeId}`,
      setupId: input.setupId,
      setupEpisodeId: episodeId,
      promotionStatus: "SHADOW",
      direction: input.direction,
      lifecycleState: input.lifecycleState,
      source: "MODULAR_SETUP_ENGINE",
      triggerLevel: input.triggerLevel,
      levelType: "SHADOW_DETERMINISTIC_REFERENCE",
      invalidationLevel: input.invalidationLevel,
      target1Level: targets.target1Level,
      target2Level: targets.target2Level,
      target3Level: targets.target3Level,
      underlyingRewardRiskRatio: null,
      optionRewardRiskRatio: null,
      confidenceScore: null,
      selectedContractSymbol: null,
      selectedContractAsk: null,
      selectedContractBid: null,
      selectedContractStrike: null,
      selectedContractExpiration: null,
      selectedContractQuoteAt: null,
      reasonCodes: input.reasonCodes,
      warningCodes: ["SHADOW_MODE_RESEARCH_ONLY"],
      liveEligible: false,
    }),
  );
}

/**
 * Produces conservative, auditable shadow observations. These detectors are
 * deliberately simple and cannot create READY alerts or positions. Promotion
 * requires a separately approved methodology and historical validation.
 */
function buildShadowCandidates(
  marketState: SpyZeroDteDeterministicMarketStateResponse,
  assembly: SpyZeroDteTradePlanAssemblyResponse,
): TradingOpportunityCandidate[] {
  const rows: TradingOpportunityCandidate[] = [];
  const candles = completedCandles(marketState);
  if (candles.length < 3) return rows;
  const a = candles.at(-3)!;
  const b = candles.at(-2)!;
  const c = candles.at(-1)!;
  const price = numeric(marketState.price);
  const vwap = numeric(marketState.features.priceVsVwap.inputs.vwap);
  const orHigh = numeric(
    marketState.features.priceVsOpeningRange.inputs.openingRangeHigh,
  );
  const orLow = numeric(
    marketState.features.priceVsOpeningRange.inputs.openingRangeLow,
  );
  const priorHigh = numeric(
    marketState.features.priceVsPriorDayRange.inputs.previousDayHigh,
  );
  const priorLow = numeric(
    marketState.features.priceVsPriorDayRange.inputs.previousDayLow,
  );
  const gapDirection = marketState.features.gapContext.inputs.direction;
  const gapFillState = marketState.features.gapContext.inputs.fillState;

  if (orHigh && b.high > orHigh && c.close < orHigh) {
    addShadowCandidate({
      rows,
      assembly,
      setupId: "FAILED_BULLISH_BREAK_REVERSAL",
      direction: "PUTS",
      triggerLevel: orHigh,
      invalidationLevel: Math.max(b.high, c.high),
      lifecycleState: "CONFIRMED",
      reasonCodes: ["BROKE_OR_HIGH_THEN_CLOSED_BACK_BELOW"],
    });
  }
  if (orLow && b.low < orLow && c.close > orLow) {
    addShadowCandidate({
      rows,
      assembly,
      setupId: "FAILED_BEARISH_BREAK_REVERSAL",
      direction: "CALLS",
      triggerLevel: orLow,
      invalidationLevel: Math.min(b.low, c.low),
      lifecycleState: "CONFIRMED",
      reasonCodes: ["BROKE_OR_LOW_THEN_CLOSED_BACK_ABOVE"],
    });
  }
  if (vwap && c.close > vwap && b.low <= vwap && c.close > b.high) {
    addShadowCandidate({
      rows,
      assembly,
      setupId: "BULLISH_TREND_PULLBACK",
      direction: "CALLS",
      triggerLevel: b.high,
      invalidationLevel: b.low,
      lifecycleState: "CONFIRMED",
      reasonCodes: ["ABOVE_VWAP_PULLBACK_AND_RENEWED_HIGHER_CLOSE"],
    });
  }
  if (vwap && c.close < vwap && b.high >= vwap && c.close < b.low) {
    addShadowCandidate({
      rows,
      assembly,
      setupId: "BEARISH_TREND_PULLBACK",
      direction: "PUTS",
      triggerLevel: b.low,
      invalidationLevel: b.high,
      lifecycleState: "CONFIRMED",
      reasonCodes: ["BELOW_VWAP_BOUNCE_AND_RENEWED_LOWER_CLOSE"],
    });
  }
  const compactRange = Math.max(a.high, b.high) - Math.min(a.low, b.low);
  const typicalRange = marketState.executionContext?.medianRangePoints ?? null;
  if (typicalRange && compactRange <= typicalRange * 1.25 && vwap) {
    if (a.close > vwap && b.close > vwap && c.close > Math.max(a.high, b.high)) {
      addShadowCandidate({
        rows,
        assembly,
        setupId: "BULLISH_CONTINUATION_BASE",
        direction: "CALLS",
        triggerLevel: Math.max(a.high, b.high),
        invalidationLevel: Math.min(a.low, b.low),
        lifecycleState: "CONFIRMED",
        reasonCodes: ["COMPACT_ABOVE_VWAP_BASE_BROKE_UP"],
      });
    }
    if (a.close < vwap && b.close < vwap && c.close < Math.min(a.low, b.low)) {
      addShadowCandidate({
        rows,
        assembly,
        setupId: "BEARISH_CONTINUATION_BASE",
        direction: "PUTS",
        triggerLevel: Math.min(a.low, b.low),
        invalidationLevel: Math.max(a.high, b.high),
        lifecycleState: "CONFIRMED",
        reasonCodes: ["COMPACT_BELOW_VWAP_BASE_BROKE_DOWN"],
      });
    }
  }
  if (priorLow && c.low <= priorLow && c.close > priorLow) {
    addShadowCandidate({
      rows,
      assembly,
      setupId: "RANGE_LOW_MEAN_REVERSION",
      direction: "CALLS",
      triggerLevel: priorLow,
      invalidationLevel: c.low,
      lifecycleState: "CONFIRMED",
      reasonCodes: ["REJECTED_PRIOR_DAY_LOW_AND_CLOSED_INSIDE"],
    });
  }
  if (priorHigh && c.high >= priorHigh && c.close < priorHigh) {
    addShadowCandidate({
      rows,
      assembly,
      setupId: "RANGE_HIGH_MEAN_REVERSION",
      direction: "PUTS",
      triggerLevel: priorHigh,
      invalidationLevel: c.high,
      lifecycleState: "CONFIRMED",
      reasonCodes: ["REJECTED_PRIOR_DAY_HIGH_AND_CLOSED_INSIDE"],
    });
  }
  if (price && gapDirection === "UP" && gapFillState !== "FILLED") {
    addShadowCandidate({
      rows,
      assembly,
      setupId: "GAP_AND_GO_CONTINUATION",
      direction: "CALLS",
      triggerLevel: c.high,
      invalidationLevel: orLow ?? c.low,
      lifecycleState: c.close > b.high ? "CONFIRMED" : "ARMED",
      reasonCodes: ["UP_GAP_REMAINS_UNFILLED"],
    });
  }
  if (price && gapDirection === "DOWN" && gapFillState !== "FILLED") {
    addShadowCandidate({
      rows,
      assembly,
      setupId: "GAP_AND_GO_CONTINUATION",
      direction: "PUTS",
      triggerLevel: c.low,
      invalidationLevel: orHigh ?? c.high,
      lifecycleState: c.close < b.low ? "CONFIRMED" : "ARMED",
      reasonCodes: ["DOWN_GAP_REMAINS_UNFILLED"],
    });
  }
  if (gapFillState === "FILLED" && vwap) {
    const direction: TradingDirection = c.close >= vwap ? "CALLS" : "PUTS";
    addShadowCandidate({
      rows,
      assembly,
      setupId: "GAP_FILL_REVERSAL",
      direction,
      triggerLevel: c.close,
      invalidationLevel: direction === "CALLS" ? c.low : c.high,
      lifecycleState: "DETECTED",
      reasonCodes: ["GAP_FILL_COMPLETED_REVERSAL_OBSERVATION"],
    });
  }

  return rows;
}

export function buildTradingOpportunityCandidates(
  marketState: SpyZeroDteDeterministicMarketStateResponse,
  assembly: SpyZeroDteTradePlanAssemblyResponse,
): TradingOpportunityCandidate[] {
  const legacy = createLegacyCandidate(assembly);
  const shadow = buildShadowCandidates(marketState, assembly);
  return [legacy, ...shadow].filter(
    (row): row is TradingOpportunityCandidate => row !== null,
  );
}
