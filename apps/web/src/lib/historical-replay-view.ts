import type {
  HistoricalReplayAuditState,
  HistoricalReplayEventType,
  HistoricalReplayPrimaryReasonCode,
  HistoricalReplayRunRequest,
  HistoricalReplayRunSummary,
  HistoricalReplayNoLookaheadState,
} from "@spy-copilot/shared";

export const REPLAY_AUDIT_LABEL: Record<HistoricalReplayAuditState, string> = {
  PASS: "Audit passed",
  FAIL: "Audit failed",
  EMPTY: "No snapshots",
};

export const REPLAY_EVENT_LABEL: Record<HistoricalReplayEventType, string> = {
  SESSION_INITIAL: "Session initial",
  STATE_CHANGED: "State changed",
  STATE_UNCHANGED: "State unchanged",
};

export const REPLAY_LOOKAHEAD_LABEL: Record<
  HistoricalReplayNoLookaheadState,
  string
> = {
  PASS: "Pass",
  FAIL: "Fail",
};

export function historicalReplayReasonCopy(
  reason: HistoricalReplayPrimaryReasonCode,
): string {
  switch (reason) {
    case "REPLAY_COMPLETE":
      return "Captured snapshots replayed successfully and every source-time audit passed.";
    case "REPLAY_COMPLETE_WITH_AUDIT_FAILURES":
      return "Replay completed, but one or more persisted snapshots failed source-time or integrity checks.";
    case "REPLAY_EMPTY":
      return "No persisted journal snapshots matched the selected market-date range.";
    case "REPLAY_RUN_NOT_FOUND":
      return "The selected persisted replay run was not found.";
    case "DATABASE_NOT_CONFIGURED":
      return "Historical replay requires the configured PostgreSQL database.";
    case "DATABASE_UNAVAILABLE":
      return "Historical replay could not read or persist replay data.";
  }
}

export function normalizeReplayDateInput(value: string): string | null {
  const trimmed = value.trim();
  return trimmed.length === 0 ? null : trimmed;
}

export function buildHistoricalReplayRequest(
  startMarketDate: string,
  endMarketDate: string,
): HistoricalReplayRunRequest {
  return {
    startMarketDate: normalizeReplayDateInput(startMarketDate),
    endMarketDate: normalizeReplayDateInput(endMarketDate),
  };
}

export function replayDateRangeLabel(
  startMarketDate: string | null,
  endMarketDate: string | null,
): string {
  if (startMarketDate === null && endMarketDate === null) return "All captured dates";
  if (startMarketDate !== null && endMarketDate !== null) {
    return `${startMarketDate} through ${endMarketDate}`;
  }
  if (startMarketDate !== null) return `From ${startMarketDate}`;
  return `Through ${endMarketDate}`;
}

export function replayHistorySummaryCopy(
  run: HistoricalReplayRunSummary,
): string {
  return `${run.snapshotCount} snapshots · ${run.marketDateCount} sessions · ${run.auditFailureCount} audit failures`;
}

export function formatReplayEasternTime(value: string): string {
  return new Intl.DateTimeFormat("en-US", {
    timeZone: "America/New_York",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    second: "2-digit",
  }).format(new Date(value));
}

export function formatReplayMoney(value: number | null): string {
  if (value === null) return "—";
  return value.toLocaleString("en-US", {
    style: "currency",
    currency: "USD",
  });
}
