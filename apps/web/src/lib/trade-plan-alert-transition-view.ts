import type {
  TradePlanAlertSeverity,
  TradePlanAlertTransitionPrimaryReasonCode,
  TradePlanAlertTransitionState,
  TradePlanAlertTransitionType,
} from "@spy-copilot/shared";

export type AlertMonitorTone = "default" | "accent" | "bull" | "bear" | "wait";

interface AlertMonitorStateView {
  title: string;
  description: string;
  tone: AlertMonitorTone;
}

const TRANSITION_STATE_VIEWS: Record<
  TradePlanAlertTransitionState,
  AlertMonitorStateView
> = {
  EMIT: {
    title: "New session alert event",
    description:
      "A meaningful deterministic alert transition was emitted and added to this browser session.",
    tone: "accent",
  },
  SUPPRESSED: {
    title: "No new alert event",
    description:
      "The current snapshot is absent, unchanged, or inside the duplicate-suppression cooldown.",
    tone: "default",
  },
  UNAVAILABLE: {
    title: "Alert evaluation unavailable",
    description:
      "The current alert candidate could not be evaluated safely. No event was added.",
    tone: "bear",
  },
};

const REASON_DESCRIPTIONS: Record<
  TradePlanAlertTransitionPrimaryReasonCode,
  string
> = {
  INITIAL_CANDIDATE_EMIT: "A meaningful candidate appeared for the first time.",
  CANDIDATE_CHANGED_EMIT: "The active deterministic candidate changed.",
  CANDIDATE_CLEARED_EMIT: "The previously active candidate is no longer present.",
  CANDIDATE_REAPPEARED_EMIT:
    "A previously cleared candidate remained present beyond the cooldown.",
  ACTIVE_DUPLICATE_SUPPRESSED:
    "The active candidate is unchanged, so a duplicate event was suppressed.",
  REAPPEARANCE_COOLDOWN_SUPPRESSED:
    "The candidate reappeared inside the cooldown, so no event was emitted.",
  NO_CANDIDATE_SUPPRESSED:
    "The current deterministic snapshot has no alert candidate.",
  MARKET_DATE_RESET_SUPPRESSED:
    "Process-local alert state reset at the market-date boundary.",
  SOURCE_CANDIDATE_UNAVAILABLE:
    "The source alert candidate is currently unavailable.",
  SOURCE_CANDIDATE_INCONSISTENT:
    "The source alert candidate failed contract validation.",
  SOURCE_CANDIDATE_SERVICE_FAILURE:
    "The source alert-candidate service failed safely.",
};

const TRANSITION_TYPE_LABELS: Record<TradePlanAlertTransitionType, string> = {
  INITIAL_CANDIDATE: "Initial candidate",
  CANDIDATE_CHANGED: "Candidate changed",
  CANDIDATE_CLEARED: "Candidate cleared",
  CANDIDATE_REAPPEARED: "Candidate reappeared",
};

const SEVERITY_VIEWS: Record<
  TradePlanAlertSeverity,
  { label: string; tone: AlertMonitorTone }
> = {
  OPPORTUNITY: { label: "Opportunity", tone: "bull" },
  INFO: { label: "Information", tone: "accent" },
  WARNING: { label: "Warning", tone: "wait" },
};

export function getAlertMonitorStateView(
  state: TradePlanAlertTransitionState,
): AlertMonitorStateView {
  return TRANSITION_STATE_VIEWS[state];
}

export function getAlertMonitorReasonDescription(
  reason: TradePlanAlertTransitionPrimaryReasonCode,
): string {
  return REASON_DESCRIPTIONS[reason];
}

export function getAlertTransitionTypeLabel(
  type: TradePlanAlertTransitionType,
): string {
  return TRANSITION_TYPE_LABELS[type];
}

export function getAlertSeverityView(severity: TradePlanAlertSeverity): {
  label: string;
  tone: AlertMonitorTone;
} {
  return SEVERITY_VIEWS[severity];
}

export function formatAlertMonitorTimestamp(iso: string | null): string {
  if (!iso) return "—";
  const parsed = new Date(iso);
  if (Number.isNaN(parsed.getTime())) return "—";
  return `${parsed.toLocaleTimeString("en-US", {
    timeZone: "America/New_York",
    hour: "numeric",
    minute: "2-digit",
    second: "2-digit",
    hour12: true,
  })} ET`;
}

export function formatAlertMonitorDuration(milliseconds: number): string {
  if (!Number.isFinite(milliseconds) || milliseconds < 0) return "—";
  if (milliseconds < 1_000) return `${Math.round(milliseconds)} ms`;
  return `${Math.round(milliseconds / 1_000)} sec`;
}
