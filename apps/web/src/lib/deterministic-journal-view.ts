import {
  DeterministicJournalOutcomeUpdateRequestSchema,
  type DeterministicJournalAutomaticCaptureResponse,
  type DeterministicJournalCaptureMode,
  type DeterministicJournalCaptureResponse,
  type DeterministicJournalOutcomeState,
  type DeterministicJournalOutcomeUpdateRequest,
  type DeterministicJournalOutcomeUpdateResponse,
  type DeterministicJournalPrimaryReasonCode,
  type DeterministicJournalSnapshotEntry,
  type DeterministicTradePlanState,
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

export const JOURNAL_CAPTURE_MODE_LABEL: Record<
  DeterministicJournalCaptureMode,
  string
> = {
  EXPLICIT: "Manual",
  AUTOMATIC_CANDIDATE: "Automatic",
};

export const JOURNAL_OUTCOME_LABEL: Record<DeterministicJournalOutcomeState, string> = {
  UNREVIEWED: "Unreviewed",
  NO_TRADE: "No trade",
  WIN: "Win",
  LOSS: "Loss",
  BREAKEVEN: "Breakeven",
};

export const JOURNAL_OUTCOME_OPTIONS: readonly DeterministicJournalOutcomeState[] = [
  "UNREVIEWED",
  "NO_TRADE",
  "WIN",
  "LOSS",
  "BREAKEVEN",
];

export interface JournalOutcomeDraft {
  outcomeState: DeterministicJournalOutcomeState;
  realizedPnlDollars: string;
  notes: string;
}

export interface JournalOutcomeDraftValidation {
  request: DeterministicJournalOutcomeUpdateRequest | null;
  error: string | null;
}

export function journalOutcomeDraftFromEntry(
  entry: DeterministicJournalSnapshotEntry,
): JournalOutcomeDraft {
  return {
    outcomeState: entry.outcomeState,
    realizedPnlDollars:
      entry.realizedPnlDollars === null ? "" : String(entry.realizedPnlDollars),
    notes: entry.outcomeNotes ?? "",
  };
}

export function validateJournalOutcomeDraft(
  draft: JournalOutcomeDraft,
): JournalOutcomeDraftValidation {
  const trimmedAmount = draft.realizedPnlDollars.trim();
  const amount = trimmedAmount === "" ? null : Number(trimmedAmount);
  if (amount !== null && !Number.isFinite(amount)) {
    return { request: null, error: "Realized P&L must be a finite dollar amount." };
  }

  const parsed = DeterministicJournalOutcomeUpdateRequestSchema.safeParse({
    outcomeState: draft.outcomeState,
    realizedPnlDollars: amount,
    notes: draft.notes.trim() === "" ? null : draft.notes.trim(),
  });
  if (!parsed.success) {
    return {
      request: null,
      error: parsed.error.issues[0]?.message ?? "Outcome values are invalid.",
    };
  }

  return { request: parsed.data, error: null };
}

export function journalReasonCopy(
  reason: DeterministicJournalPrimaryReasonCode,
): string {
  switch (reason) {
    case "JOURNAL_ENTRIES_AVAILABLE":
      return "Persisted deterministic snapshots are available.";
    case "JOURNAL_EMPTY":
      return "No deterministic snapshots have been saved yet.";
    case "JOURNAL_SNAPSHOT_CAPTURED":
      return "The current deterministic Trade Plan snapshot was saved manually.";
    case "JOURNAL_AUTOMATIC_SNAPSHOT_CAPTURED":
      return "A new meaningful deterministic candidate was captured automatically.";
    case "JOURNAL_AUTOMATIC_DUPLICATE_SUPPRESSED":
      return "This deterministic candidate is already persisted, so no duplicate was created.";
    case "JOURNAL_AUTOMATIC_NO_ELIGIBLE_CANDIDATE":
      return "No meaningful deterministic candidate is currently eligible for automatic capture.";
    case "JOURNAL_OUTCOME_UPDATED":
      return "The user-entered outcome annotation was saved.";
    case "JOURNAL_SNAPSHOT_NOT_FOUND":
      return "The selected snapshot no longer exists.";
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

export function automaticCaptureResultCopy(
  response: DeterministicJournalAutomaticCaptureResponse,
): string {
  return journalReasonCopy(response.primaryReasonCode);
}

export function outcomeUpdateResultCopy(
  response: DeterministicJournalOutcomeUpdateResponse,
): string {
  return journalReasonCopy(response.primaryReasonCode);
}
