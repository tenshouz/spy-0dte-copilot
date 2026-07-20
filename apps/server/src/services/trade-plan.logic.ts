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

export const TRADE_PLAN_METHODOLOGY_VERSION = "TRADE_PLAN_V2" as const;

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
        observedValues: { candidateDirection: null, opposingEvidenceCount: 0 },
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
  const sameSnapshotGuaranteed =
    bias.sourceMarketStateCalculatedAt === marketState.calculatedAt &&
    bias.currentMarketDate === marketState.currentMarketDate &&
    bias.sourceMarketStateEngineVersion === marketState.engineVersion;

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
    },
    reasonCode: sameSnapshotGuaranteed
      ? "SAME_SNAPSHOT_GUARANTEED"
      : "SAME_SNAPSHOT_GUARANTEE_UNAVAILABLE",
    warningCode: sameSnapshotGuaranteed ? null : "SAME_SNAPSHOT_GUARANTEE_UNAVAILABLE",
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
    outcome = {
      engineState: "UNAVAILABLE",
      setupDirection: "UNAVAILABLE",
      setupState: "UNAVAILABLE",
      primaryReasonCode: "SAME_SNAPSHOT_GUARANTEE_UNAVAILABLE",
      warningCode: "SAME_SNAPSHOT_GUARANTEE_UNAVAILABLE",
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

  if (!outcome && candidateDirection) {
    const opposingEvidence =
      candidateDirection === "CALLS" ? bias.bearishEvidence : bias.bullishEvidence;
    const counterPassed = opposingEvidence.length === 0;
    setGate(gates, {
      gateId: "COUNTEREVIDENCE_POLICY_PASSED",
      category: "COUNTEREVIDENCE",
      status: counterPassed ? "PASSED" : "FAILED",
      requiredForEligibility: true,
      sourceFeatureIds: evidenceIds(opposingEvidence),
      observedValues: {
        candidateDirection,
        opposingEvidenceCount: opposingEvidence.length,
      },
      reasonCode: counterPassed
        ? "COUNTEREVIDENCE_POLICY_PASSED"
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

  if (!outcome && candidateDirection && triggerCalculation) {
    const vwapAligned =
      candidateDirection === "CALLS"
        ? vwapFeature.state === "ABOVE"
        : vwapFeature.state === "BELOW";
    const openingAligned =
      candidateDirection === "CALLS"
        ? opening.state === "ABOVE_RANGE"
        : opening.state === "BELOW_RANGE";

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

    setGate(gates, {
      gateId: "TRIGGER_SATISFIED",
      category: "TRIGGER",
      status: triggerCalculation.satisfied ? "PASSED" : "FAILED",
      requiredForEligibility: true,
      sourceFeatureIds: ["PRICE_VS_VWAP", "PRICE_VS_OPENING_RANGE"],
      observedValues: {
        candidateDirection,
        currentPrice: marketState.price,
        triggerLevel: triggerCalculation.level,
        comparison: triggerCalculation.comparison,
        satisfied: triggerCalculation.satisfied,
      },
      reasonCode: triggerCalculation.satisfied
        ? candidateDirection === "CALLS"
          ? "CALLS_TRIGGER_SATISFIED"
          : "PUTS_TRIGGER_SATISFIED"
        : candidateDirection === "CALLS"
          ? "CALLS_TRIGGER_NOT_SATISFIED"
          : "PUTS_TRIGGER_NOT_SATISFIED",
      warningCode: null,
    });

    const eligible = vwapAligned && openingAligned && triggerCalculation.satisfied;
    outcome = {
      engineState: "AVAILABLE",
      setupDirection: candidateDirection,
      setupState: eligible ? "ELIGIBLE" : "WAITING_FOR_TRIGGER",
      primaryReasonCode: eligible
        ? candidateDirection === "CALLS"
          ? "ELIGIBLE_CALLS_SETUP"
          : "ELIGIBLE_PUTS_SETUP"
        : candidateDirection === "CALLS"
          ? "WAITING_FOR_CALLS_TRIGGER"
          : "WAITING_FOR_PUTS_TRIGGER",
      warningCode: null,
      trigger: {
        level: triggerCalculation.level,
        comparison: triggerCalculation.comparison,
        satisfied: triggerCalculation.satisfied,
        signedDistancePoints: triggerCalculation.signedDistancePoints,
        sourceFeatureIds: ["PRICE_VS_VWAP", "PRICE_VS_OPENING_RANGE"],
        sourceValues: {
          vwap: triggerCalculation.vwap,
          openingRangeBoundary: triggerCalculation.openingRangeBoundary,
        },
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
    trigger: outcome.trigger,
    gates,
    supportingBiasEvidenceIds: evidenceIds(supporting),
    counterBiasEvidenceIds: evidenceIds(counter),
    warningCode: outcome.warningCode,
  });
}
