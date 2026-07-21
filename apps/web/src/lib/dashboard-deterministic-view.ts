import type {
  BiasEvidenceItem,
  DeterministicBiasState,
  DeterministicTradePlanState,
  MarketStateSign,
  SpyZeroDteDeterministicBiasResponse,
  SpyZeroDteDeterministicMarketStateResponse,
  SpyZeroDteGexProxyResponse,
} from "@spy-copilot/shared";

export type DashboardTone = "default" | "bull" | "bear" | "wait";

const BIAS_VIEW: Record<
  DeterministicBiasState,
  { label: string; tone: DashboardTone }
> = {
  BULLISH: { label: "BULLISH", tone: "bull" },
  BEARISH: { label: "BEARISH", tone: "bear" },
  NEUTRAL: { label: "NEUTRAL", tone: "wait" },
  UNAVAILABLE: { label: "UNAVAILABLE", tone: "default" },
};

const PLAN_STATE_LABEL: Record<DeterministicTradePlanState, string> = {
  READY: "READY",
  WAITING_FOR_TRIGGER: "WAITING FOR TRIGGER",
  NO_QUALIFIED_CONTRACT: "NO QUALIFIED CONTRACT",
  NOT_QUALIFIED: "NOT QUALIFIED",
  NO_SETUP: "NO SETUP",
  NOT_APPLICABLE: "NOT APPLICABLE",
  UNAVAILABLE: "UNAVAILABLE",
};

export function getDashboardBiasView(state: DeterministicBiasState) {
  return BIAS_VIEW[state];
}

export function getDashboardPlanStateLabel(
  state: DeterministicTradePlanState,
): string {
  return PLAN_STATE_LABEL[state];
}

export function getDashboardSignLabel(sign: MarketStateSign | null): string {
  if (sign === null) return "Unavailable";
  if (sign === "POSITIVE") return "Positive";
  if (sign === "NEGATIVE") return "Negative";
  return "Zero";
}

export function formatDashboardPrice(value: number | null): string {
  if (value === null) return "—";
  return `$${value.toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

export function formatDashboardNumber(
  value: number | null,
  maximumFractionDigits = 2,
): string {
  if (value === null) return "—";
  return value.toLocaleString("en-US", { maximumFractionDigits });
}

export function formatDashboardCompact(value: number | null): string {
  if (value === null) return "—";
  const sign = value < 0 ? "-" : value > 0 ? "+" : "";
  const absolute = Math.abs(value);
  if (absolute >= 1_000_000_000) return `${sign}${(absolute / 1_000_000_000).toFixed(2)}B`;
  if (absolute >= 1_000_000) return `${sign}${(absolute / 1_000_000).toFixed(1)}M`;
  if (absolute >= 1_000) return `${sign}${(absolute / 1_000).toFixed(1)}K`;
  return `${sign}${absolute.toFixed(0)}`;
}

function humanizeCode(value: string): string {
  const lower = value.replace(/_/g, " ").toLowerCase();
  const sentence = lower.charAt(0).toUpperCase() + lower.slice(1);
  return sentence
    .replace(/\bvwap\b/g, "VWAP")
    .replace(/\bgex\b/g, "GEX")
    .replace(/\bdex\b/g, "DEX")
    .replace(/\brth\b/g, "RTH");
}

function strongestEvidence(items: BiasEvidenceItem[]): BiasEvidenceItem | null {
  return (
    [...items].sort((left, right) => {
      const contributionDifference =
        Math.abs(right.weightedContribution) - Math.abs(left.weightedContribution);
      if (contributionDifference !== 0) return contributionDifference;
      return right.appliedWeight - left.appliedWeight;
    })[0] ?? null
  );
}

export interface DashboardBiasEvidenceSummary {
  primaryDriver: string;
  counterweight: string;
}

export function getDashboardBiasEvidenceSummary(
  response: SpyZeroDteDeterministicBiasResponse,
): DashboardBiasEvidenceSummary {
  if (response.biasState === "UNAVAILABLE") {
    return {
      primaryDriver: "Insufficient directional evidence",
      counterweight: "No reliable counterweight available",
    };
  }

  const supporting =
    response.biasState === "BULLISH"
      ? response.bullishEvidence
      : response.biasState === "BEARISH"
        ? response.bearishEvidence
        : response.neutralEvidence;
  const counter =
    response.biasState === "BULLISH"
      ? response.bearishEvidence
      : response.biasState === "BEARISH"
        ? response.bullishEvidence
        : [...response.bullishEvidence, ...response.bearishEvidence];

  const primary = strongestEvidence(supporting);
  const opposing = strongestEvidence(counter);

  return {
    primaryDriver: primary
      ? humanizeCode(primary.rationaleCode)
      : response.biasState === "NEUTRAL"
        ? "Balanced directional evidence"
        : "No dominant supporting factor",
    counterweight: opposing
      ? humanizeCode(opposing.rationaleCode)
      : "No opposing directional factor",
  };
}

export function formatDashboardRatioPercent(value: number | null): string {
  return value === null ? "—" : `${Math.round(value * 100)}%`;
}

export function getDashboardConfidenceExplanation(
  response: SpyZeroDteDeterministicBiasResponse,
): string {
  if (response.confidenceScore === null) {
    return "Confidence is unavailable until enough directional evidence is usable.";
  }

  const contradiction = response.contradictionRatio ?? 0;
  const neutral = response.neutralEvidenceRatio ?? 0;
  const sufficiency = response.sufficiencyRatio ?? 0;

  if (contradiction > 0) {
    return `${Math.round(contradiction * 100)}% of usable directional weight opposes the current bias.`;
  }
  if (neutral > 0) {
    return `${Math.round(neutral * 100)}% of usable directional weight is neutral.`;
  }
  if (sufficiency < 1) {
    return `Only ${Math.round(sufficiency * 100)}% of configured directional evidence is currently usable.`;
  }
  if (response.sourceQualityState !== "COMPLETE") {
    return "Directional evidence aligns, but source coverage is not complete.";
  }
  return "Usable directional evidence is fully aligned.";
}

export interface DashboardMarketReference {
  label: string;
  level: number;
  distancePoints: number;
}

export function getNearestDashboardMarketReference(
  response: SpyZeroDteDeterministicMarketStateResponse,
): DashboardMarketReference | null {
  if (response.price === null) return null;

  const candidates: Array<{ label: string; level: number | null }> = [
    {
      label: "VWAP",
      level:
        response.features.priceVsVwap.status === "UNAVAILABLE"
          ? null
          : response.features.priceVsVwap.inputs.vwap,
    },
    {
      label: "Prior High",
      level:
        response.features.priceVsPriorDayRange.status === "UNAVAILABLE"
          ? null
          : response.features.priceVsPriorDayRange.inputs.previousDayHigh,
    },
    {
      label: "Prior Low",
      level:
        response.features.priceVsPriorDayRange.status === "UNAVAILABLE"
          ? null
          : response.features.priceVsPriorDayRange.inputs.previousDayLow,
    },
    {
      label: "Premarket High",
      level:
        response.features.priceVsPremarketRange.status === "UNAVAILABLE"
          ? null
          : response.features.priceVsPremarketRange.inputs.premarketHigh,
    },
    {
      label: "Premarket Low",
      level:
        response.features.priceVsPremarketRange.status === "UNAVAILABLE"
          ? null
          : response.features.priceVsPremarketRange.inputs.premarketLow,
    },
    {
      label: "OR High",
      level:
        response.features.priceVsOpeningRange.status === "UNAVAILABLE" ||
        response.features.priceVsOpeningRange.inputs.phase !== "COMPLETE"
          ? null
          : response.features.priceVsOpeningRange.inputs.openingRangeHigh,
    },
    {
      label: "OR Low",
      level:
        response.features.priceVsOpeningRange.status === "UNAVAILABLE" ||
        response.features.priceVsOpeningRange.inputs.phase !== "COMPLETE"
          ? null
          : response.features.priceVsOpeningRange.inputs.openingRangeLow,
    },
  ];

  const nearest = candidates
    .filter((candidate): candidate is { label: string; level: number } => candidate.level !== null)
    .map((candidate) => ({
      ...candidate,
      distancePoints: response.price! - candidate.level,
    }))
    .sort((left, right) => Math.abs(left.distancePoints) - Math.abs(right.distancePoints))[0];

  return nearest ?? null;
}

export function formatDashboardReferenceDistance(distancePoints: number): string {
  if (Math.abs(distancePoints) < 0.005) return "At level";
  return `${Math.abs(distancePoints).toFixed(2)} pts ${distancePoints > 0 ? "above" : "below"}`;
}

export interface GexConcentrationSummary {
  largestPositiveStrike: number | null;
  largestPositiveExposure: number | null;
  largestNegativeStrike: number | null;
  largestNegativeExposure: number | null;
}

export function summarizeGexConcentrations(
  response: SpyZeroDteGexProxyResponse,
): GexConcentrationSummary {
  if (response.metricState === "UNAVAILABLE") {
    return {
      largestPositiveStrike: null,
      largestPositiveExposure: null,
      largestNegativeStrike: null,
      largestNegativeExposure: null,
    };
  }

  let positive: SpyZeroDteGexProxyResponse["strikes"][number] | null = null;
  let negative: SpyZeroDteGexProxyResponse["strikes"][number] | null = null;

  for (const row of response.strikes) {
    if (
      row.netGammaExposureProxy > 0 &&
      (positive === null || row.netGammaExposureProxy > positive.netGammaExposureProxy)
    ) {
      positive = row;
    }
    if (
      row.netGammaExposureProxy < 0 &&
      (negative === null || row.netGammaExposureProxy < negative.netGammaExposureProxy)
    ) {
      negative = row;
    }
  }

  return {
    largestPositiveStrike: positive?.strikePrice ?? null,
    largestPositiveExposure: positive?.netGammaExposureProxy ?? null,
    largestNegativeStrike: negative?.strikePrice ?? null,
    largestNegativeExposure: negative?.netGammaExposureProxy ?? null,
  };
}
