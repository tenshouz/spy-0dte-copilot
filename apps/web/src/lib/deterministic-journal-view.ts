import type {
  DeterministicJournalCaptureResponse,
  DeterministicJournalPrimaryReasonCode,
  DeterministicTradePlanState,
} from "@spy-copilot/shared";

export const JOURNAL_PLAN_STATE_LABEL: Record<DeterministicTradePlanState, string> = {
  READY: "Ready",
  WAITING_FOR_TRIGGER: "Waiting",
  NO_QUALIFIED_CONTRACT: "No contract",
  NOT_QUALIFIED: "Not qualified",
  NO_SETUP: "No setup",
  NOT_APPLICABLE: "Not applicable",
  UNAVAILABLE: "Unavailable",
};

export function journalReasonCopy(
  reason: DeterministicJournalPrimaryReasonCode,
): string {
  switch (reason) {
    case "JOURNAL_ENTRIES_AVAILABLE":
      return "Persisted deterministic snapshots are available.";
    case "JOURNAL_EMPTY":
      return "No deterministic snapshots have been saved yet.";
    case "JOURNAL_SNAPSHOT_CAPTURED":
      return "The current deterministic Trade Plan snapshot was saved.";
    case "SOURCE_ASSEMBLY_UNAVAILABLE":
      return "The current Trade Plan Assembly is unavailable, so nothing was saved.";
    case "DATABASE_NOT_CONFIGURED":
      return "PostgreSQL is not configured for journal persistence.";
    case "DATABASE_UNAVAILABLE":
      return "The journal database is temporarily unavailable.";
  }
}

export function captureResultCopy(
  response: DeterministicJournalCaptureResponse,
): string {
  return journalReasonCopy(response.primaryReasonCode);
}
