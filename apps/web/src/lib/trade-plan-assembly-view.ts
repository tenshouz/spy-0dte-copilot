import type {
  AssembledTradePlanDirection,
  DeterministicTradePlanState,
  TradePlanExposureConfirmationState,
} from "@spy-copilot/shared";

export type TradePlanViewTone = "default" | "bull" | "bear" | "wait";

const STATE_COPY: Record<
  DeterministicTradePlanState,
  { title: string; description: string; tone: TradePlanViewTone }
> = {
  READY: {
    title: "Deterministic plan ready",
    description: "The structural setup and current contract-liquidity rules passed.",
    tone: "bull",
  },
  WAITING_FOR_TRIGGER: {
    title: "Waiting for the underlying trigger",
    description: "The projected structural plan is available, but no contract is locked before the trigger.",
    tone: "wait",
  },
  NO_QUALIFIED_CONTRACT: {
    title: "No qualified contract",
    description: "The underlying setup qualified, but no contract passed the current CONTRACT_V1 liquidity rules.",
    tone: "wait",
  },
  NOT_QUALIFIED: {
    title: "Underlying setup not qualified",
    description: "The setup did not meet the deterministic RISK_V1 framework.",
    tone: "wait",
  },
  NO_SETUP: {
    title: "No deterministic setup",
    description: "No qualifying directional SPY 0DTE setup is currently present.",
    tone: "default",
  },
  NOT_APPLICABLE: {
    title: "Methodology not applicable",
    description: "The SPY 0DTE methodology is not active for the current session state.",
    tone: "default",
  },
  UNAVAILABLE: {
    title: "Trade Plan unavailable",
    description: "Required source integrity or data is currently unavailable.",
    tone: "bear",
  },
};

export function getTradePlanStateView(state: DeterministicTradePlanState) {
  return STATE_COPY[state];
}

export function getDirectionLabel(direction: AssembledTradePlanDirection): string {
  if (direction === "CALLS") return "Calls Setup";
  if (direction === "PUTS") return "Puts Setup";
  if (direction === "NONE") return "No Direction";
  return "Unavailable";
}

export function formatNullableNumber(
  value: number | null,
  maximumFractionDigits = 2,
): string {
  if (value === null) return "—";
  return value.toLocaleString("en-US", { maximumFractionDigits });
}

export function formatNullablePrice(value: number | null): string {
  if (value === null) return "—";
  return `$${value.toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

export function formatNullablePercent(value: number | null): string {
  if (value === null) return "—";
  return `${value.toLocaleString("en-US", { maximumFractionDigits: 2 })}%`;
}

export function formatNullableTimestamp(value: string | null): string {
  if (value === null) return "—";
  return new Date(value).toLocaleString("en-US", {
    timeZone: "America/New_York",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    second: "2-digit",
    hour12: true,
  });
}


const EXPOSURE_COPY: Record<
  TradePlanExposureConfirmationState,
  { label: string; tone: TradePlanViewTone }
> = {
  SUPPORTIVE: { label: "Supportive", tone: "bull" },
  CONFLICTING: { label: "Conflicting", tone: "bear" },
  MIXED: { label: "Mixed", tone: "wait" },
  NEUTRAL: { label: "Neutral", tone: "default" },
  NOT_APPLICABLE: { label: "Not applicable", tone: "default" },
  UNAVAILABLE: { label: "Unavailable", tone: "default" },
};

export function getExposureConfirmationView(
  state: TradePlanExposureConfirmationState,
) {
  return EXPOSURE_COPY[state];
}

export function formatSignedConfidencePoints(value: number): string {
  const normalized = Object.is(value, -0) ? 0 : value;
  const sign = normalized > 0 ? "+" : "";
  return `${sign}${normalized.toLocaleString("en-US", {
    maximumFractionDigits: 2,
  })} pts`;
}
