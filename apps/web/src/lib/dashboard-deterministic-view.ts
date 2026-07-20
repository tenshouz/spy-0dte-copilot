import type {
  DeterministicBiasState,
  DeterministicTradePlanState,
  MarketStateSign,
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
