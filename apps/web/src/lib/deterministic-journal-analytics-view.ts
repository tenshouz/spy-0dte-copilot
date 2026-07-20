import type {
  DeterministicJournalAnalyticsBreakdownEntry,
  DeterministicJournalAnalyticsPrimaryReasonCode,
} from "@spy-copilot/shared";

export function formatAnalyticsMoney(value: number | null): string {
  if (value === null) return "—";
  const sign = value > 0 ? "+" : value < 0 ? "-" : "";
  return `${sign}$${Math.abs(value).toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

export function formatAnalyticsPercent(value: number | null): string {
  return value === null ? "—" : `${value.toFixed(1)}%`;
}

export function formatProfitFactor(value: number | null): string {
  return value === null ? "—" : value.toFixed(2);
}

export function analyticsReasonCopy(
  reason: DeterministicJournalAnalyticsPrimaryReasonCode,
): string {
  switch (reason) {
    case "JOURNAL_ANALYTICS_AVAILABLE":
      return "Performance analytics are calculated from persisted user-reviewed journal snapshots.";
    case "JOURNAL_ANALYTICS_EMPTY":
      return "Save and review journal snapshots to populate performance analytics.";
    case "DATABASE_NOT_CONFIGURED":
      return "PostgreSQL is not configured for journal analytics.";
    case "DATABASE_UNAVAILABLE":
      return "The journal analytics database is temporarily unavailable.";
  }
}

export function analyticsMoneyTone(
  value: number | null,
): "bull" | "bear" | "default" {
  if (value === null || value === 0) return "default";
  return value > 0 ? "bull" : "bear";
}

export function visibleBreakdownRows(
  rows: readonly DeterministicJournalAnalyticsBreakdownEntry[],
): DeterministicJournalAnalyticsBreakdownEntry[] {
  return rows.filter(
    (row) => row.snapshotCount > 0 || row.reviewedCount > 0 || row.tradeCount > 0,
  );
}
