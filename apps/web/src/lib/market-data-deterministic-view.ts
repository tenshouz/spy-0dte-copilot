import type {
  MarketContextComponentStatusValue,
  MarketStateFeatureStatus,
  SpyZeroDteMarketContextResponse,
} from "@spy-copilot/shared";

export interface MarketContextCoverageSummary {
  available: number;
  stale: number;
  partial: number;
  notApplicable: number;
  unavailable: number;
  warningCount: number;
}

const COMPONENT_STATUS_KEYS: Record<
  MarketContextComponentStatusValue,
  keyof Omit<MarketContextCoverageSummary, "warningCount">
> = {
  AVAILABLE: "available",
  STALE: "stale",
  PARTIAL: "partial",
  NOT_APPLICABLE: "notApplicable",
  UNAVAILABLE: "unavailable",
};

export function summarizeMarketContextCoverage(
  context: SpyZeroDteMarketContextResponse | null,
): MarketContextCoverageSummary {
  const summary: MarketContextCoverageSummary = {
    available: 0,
    stale: 0,
    partial: 0,
    notApplicable: 0,
    unavailable: 0,
    warningCount: context?.componentWarnings.length ?? 0,
  };

  for (const component of context?.components ?? []) {
    summary[COMPONENT_STATUS_KEYS[component.status]] += 1;
  }

  return summary;
}

export function formatDeterministicState(value: string | null): string {
  if (value === null) return "Unavailable";
  return value
    .toLowerCase()
    .split("_")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

export function formatFeatureStatus(status: MarketStateFeatureStatus): string {
  return formatDeterministicState(status);
}

export function formatOptionalPoints(value: number | null): string {
  if (value === null) return "—";
  const sign = value > 0 ? "+" : "";
  return `${sign}${value.toFixed(2)} pts`;
}
