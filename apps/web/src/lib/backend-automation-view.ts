import type {
  BackendAutomationDeliveryState,
  BackendAutomationRuntimeState,
} from "@spy-copilot/shared";

export function formatBackendAutomationTime(value: string | null): string {
  if (value === null) return "—";
  return new Intl.DateTimeFormat("en-US", {
    timeZone: "America/New_York",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    second: "2-digit",
  }).format(new Date(value));
}

export function backendAutomationRuntimeLabel(
  state: BackendAutomationRuntimeState,
): string {
  return {
    STOPPED: "Stopped",
    ACTIVE: "Active",
    STANDBY: "Standby",
    STALE: "Stale",
    UNAVAILABLE: "Unavailable",
  }[state];
}

export function backendAutomationRuntimeTone(
  state: BackendAutomationRuntimeState,
): "bull" | "wait" | "bear" | "default" {
  if (state === "ACTIVE") return "bull";
  if (state === "STANDBY" || state === "STOPPED") return "default";
  if (state === "STALE") return "wait";
  return "bear";
}

export function backendAutomationDeliveryTone(
  state: BackendAutomationDeliveryState,
): "bull" | "wait" | "bear" | "default" {
  if (state === "DELIVERED") return "bull";
  if (state === "FAILED") return "bear";
  if (state === "AMBIGUOUS") return "wait";
  return "default";
}

export function backendAutomationReasonCopy(reason: string | null): string {
  if (reason === null) return "No evaluation has been recorded yet.";
  const fixed: Record<string, string> = {
    BACKEND_AUTOMATION_ACTIVE:
      "The persistent backend scheduler holds the database lease and is evaluating enabled tasks.",
    BACKEND_AUTOMATION_DISABLED:
      "Persistent backend automation is disabled in saved settings.",
    BACKEND_AUTOMATION_STANDBY:
      "Another backend process currently holds the scheduler lease.",
    BACKEND_AUTOMATION_STALE:
      "Automation is enabled, but no recent scheduler heartbeat is available.",
    DATABASE_NOT_CONFIGURED: "PostgreSQL is not configured.",
    DATABASE_UNAVAILABLE: "PostgreSQL is temporarily unavailable.",
    PERSISTED_DUPLICATE_SUPPRESSED:
      "A confirmed delivery key already exists in PostgreSQL.",
    PERSISTED_AMBIGUOUS_OUTCOME_SUPPRESSED:
      "A previous ambiguous provider outcome is persistently suppressed to avoid a duplicate message.",
  };
  return fixed[reason] ?? reason.replaceAll("_", " ").toLowerCase();
}
