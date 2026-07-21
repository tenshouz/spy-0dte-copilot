import type {
  EmpiricalGammaResearchEvidenceState,
  EmpiricalGammaResearchFeatureType,
  EmpiricalGammaResearchFinding,
  EmpiricalGammaResearchPrimaryReasonCode,
  TradeSetupType,
} from "@spy-copilot/shared";

const FEATURE_LABELS: Record<EmpiricalGammaResearchFeatureType, string> = {
  GAMMA_REGIME: "Gamma regime",
  DIRECTIONAL_WALL_LOCATION: "Directional wall",
  OPPOSING_WALL_LOCATION: "Opposing wall",
  NEAREST_GAMMA_CLIFF: "Nearest cliff",
  NEAREST_GAMMA_SIGN_TRANSITION: "Nearest sign transition",
};

const SETUP_LABELS: Record<TradeSetupType, string> = {
  OPENING_RANGE_BREAKOUT: "Opening-range breakout",
  VWAP_RECLAIM_BREAKOUT: "VWAP reclaim breakout",
  VWAP_LOSS_BREAKDOWN: "VWAP loss breakdown",
  CONFLUENCE_BREAKOUT: "Confluence breakout",
  UNAVAILABLE: "Unavailable setup",
};

export function gammaResearchFeatureLabel(
  featureType: EmpiricalGammaResearchFeatureType,
): string {
  return FEATURE_LABELS[featureType];
}

export function gammaResearchSetupLabel(setupType: TradeSetupType): string {
  return SETUP_LABELS[setupType];
}

export function gammaResearchEvidenceLabel(
  state: EmpiricalGammaResearchEvidenceState,
): string {
  switch (state) {
    case "POSITIVE_CANDIDATE":
      return "Positive candidate";
    case "NEGATIVE_CANDIDATE":
      return "Negative candidate";
    case "NO_CLEAR_SEPARATION":
      return "No clear separation";
    case "INSUFFICIENT_SAMPLE":
      return "Insufficient sample";
  }
}

export function gammaResearchEvidenceTone(
  state: EmpiricalGammaResearchEvidenceState,
): "bull" | "bear" | "wait" | "default" {
  if (state === "POSITIVE_CANDIDATE") return "bull";
  if (state === "NEGATIVE_CANDIDATE") return "bear";
  if (state === "INSUFFICIENT_SAMPLE") return "wait";
  return "default";
}

export function gammaResearchReasonCopy(
  code: EmpiricalGammaResearchPrimaryReasonCode,
): string {
  switch (code) {
    case "GAMMA_RESEARCH_AVAILABLE":
      return "Research observations are available. Findings remain observational and cannot alter trade direction or confidence.";
    case "GAMMA_RESEARCH_EMPTY":
      return "No eligible user-reviewed READY outcomes are available yet. Continue capturing qualified plans and reviewing outcomes.";
    case "DATABASE_NOT_CONFIGURED":
      return "Gamma research requires the local PostgreSQL journal database.";
    case "DATABASE_UNAVAILABLE":
      return "The journal database is currently unavailable, so Gamma research could not be calculated.";
  }
}

export function formatGammaResearchPercent(value: number | null): string {
  return value === null ? "—" : `${value.toFixed(1)}%`;
}

export function formatGammaResearchMoney(value: number | null): string {
  if (value === null) return "—";
  const sign = value > 0 ? "+" : value < 0 ? "-" : "";
  const magnitude = Math.abs(value);
  return `${sign}$${magnitude.toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

export function formatGammaResearchDelta(
  value: number | null,
  suffix = " pp",
): string {
  if (value === null) return "—";
  return `${value > 0 ? "+" : ""}${value.toFixed(1)}${suffix}`;
}

export function visibleGammaResearchFindings(
  findings: readonly EmpiricalGammaResearchFinding[],
  limit = 40,
): EmpiricalGammaResearchFinding[] {
  const rank: Record<EmpiricalGammaResearchEvidenceState, number> = {
    POSITIVE_CANDIDATE: 0,
    NEGATIVE_CANDIDATE: 1,
    NO_CLEAR_SEPARATION: 2,
    INSUFFICIENT_SAMPLE: 3,
  };
  return [...findings]
    .sort((left, right) => {
      const stateDifference = rank[left.evidenceState] - rank[right.evidenceState];
      if (stateDifference !== 0) return stateDifference;
      if (right.bucketMetrics.tradeCount !== left.bucketMetrics.tradeCount) {
        return right.bucketMetrics.tradeCount - left.bucketMetrics.tradeCount;
      }
      return `${left.setupType}|${left.direction}|${left.featureType}|${left.bucketKey}`.localeCompare(
        `${right.setupType}|${right.direction}|${right.featureType}|${right.bucketKey}`,
      );
    })
    .slice(0, limit);
}
