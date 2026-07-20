import {
  DeterministicJournalAnalyticsResponseSchema,
  type DeterministicJournalAnalyticsBreakdownEntry,
  type DeterministicJournalAnalyticsDailyEntry,
  type DeterministicJournalAnalyticsPayload,
  type DeterministicJournalAnalyticsResponse,
  type DeterministicJournalCaptureMode,
  type DeterministicJournalConfidenceBand,
  type DeterministicJournalOutcomeState,
  type DeterministicTradePlanState,
  type AssembledTradePlanDirection,
} from "@spy-copilot/shared";

export interface DeterministicJournalAnalyticsRow {
  currentMarketDate: string;
  captureMode: DeterministicJournalCaptureMode;
  planState: DeterministicTradePlanState;
  direction: AssembledTradePlanDirection;
  confidenceScore: number | null;
  outcomeState: DeterministicJournalOutcomeState;
  realizedPnlDollars: number | null;
}

interface BreakdownDefinition {
  key: string;
  label: string;
  matches: (row: DeterministicJournalAnalyticsRow) => boolean;
}

const DISCLOSURES = {
  allPersistedUserSnapshots: true,
  databaseAggregateOnly: true,
  userEnteredOutcomeOnly: true,
  unreviewedExcludedFromPerformance: true,
  noTradeExcludedFromPnl: true,
  breakevenIncludedInExpectancy: true,
  winRateExcludesBreakeven: true,
  noAutomaticOutcomeInference: true,
  noPrivateAccountData: true,
  noPositionSizing: true,
  noOrderExecution: true,
} as const;

const DIRECTION_DEFINITIONS: readonly BreakdownDefinition[] = [
  { key: "CALLS", label: "Calls", matches: (row) => row.direction === "CALLS" },
  { key: "PUTS", label: "Puts", matches: (row) => row.direction === "PUTS" },
  { key: "NONE", label: "No direction", matches: (row) => row.direction === "NONE" },
];

const PLAN_STATE_LABELS: Record<DeterministicTradePlanState, string> = {
  READY: "Ready",
  WAITING_FOR_TRIGGER: "Waiting for trigger",
  NO_QUALIFIED_CONTRACT: "No qualified contract",
  NOT_QUALIFIED: "Not qualified",
  NO_SETUP: "No setup",
  NOT_APPLICABLE: "Not applicable",
  UNAVAILABLE: "Unavailable",
};

const PLAN_STATE_DEFINITIONS = (
  Object.keys(PLAN_STATE_LABELS) as DeterministicTradePlanState[]
).map<BreakdownDefinition>((key) => ({
  key,
  label: PLAN_STATE_LABELS[key],
  matches: (row) => row.planState === key,
}));

const CAPTURE_MODE_DEFINITIONS: readonly BreakdownDefinition[] = [
  {
    key: "EXPLICIT",
    label: "Manual capture",
    matches: (row) => row.captureMode === "EXPLICIT",
  },
  {
    key: "AUTOMATIC_CANDIDATE",
    label: "Automatic candidate",
    matches: (row) => row.captureMode === "AUTOMATIC_CANDIDATE",
  },
];

export function journalConfidenceBand(
  confidenceScore: number | null,
): DeterministicJournalConfidenceBand {
  if (confidenceScore === null) return "UNAVAILABLE";
  if (confidenceScore < 50) return "LOW_0_49";
  if (confidenceScore < 70) return "MODERATE_50_69";
  if (confidenceScore < 85) return "HIGH_70_84";
  return "VERY_HIGH_85_100";
}

const CONFIDENCE_BAND_DEFINITIONS: readonly BreakdownDefinition[] = [
  {
    key: "UNAVAILABLE",
    label: "Confidence unavailable",
    matches: (row) => journalConfidenceBand(row.confidenceScore) === "UNAVAILABLE",
  },
  {
    key: "LOW_0_49",
    label: "Low · 0–49",
    matches: (row) => journalConfidenceBand(row.confidenceScore) === "LOW_0_49",
  },
  {
    key: "MODERATE_50_69",
    label: "Moderate · 50–69",
    matches: (row) => journalConfidenceBand(row.confidenceScore) === "MODERATE_50_69",
  },
  {
    key: "HIGH_70_84",
    label: "High · 70–84",
    matches: (row) => journalConfidenceBand(row.confidenceScore) === "HIGH_70_84",
  },
  {
    key: "VERY_HIGH_85_100",
    label: "Very high · 85–100",
    matches: (row) => journalConfidenceBand(row.confidenceScore) === "VERY_HIGH_85_100",
  },
];

function round(value: number, precision = 2): number {
  const factor = 10 ** precision;
  return Math.round((value + Number.EPSILON) * factor) / factor;
}

function percent(numerator: number, denominator: number): number {
  return denominator === 0 ? 0 : round((numerator / denominator) * 100);
}

function tradePnlValues(rows: readonly DeterministicJournalAnalyticsRow[]): number[] {
  return rows
    .filter((row) => ["WIN", "LOSS", "BREAKEVEN"].includes(row.outcomeState))
    .map((row) => {
      if (row.realizedPnlDollars === null || !Number.isFinite(row.realizedPnlDollars)) {
        throw new Error("reviewed trade outcome is missing finite realized P&L");
      }
      return row.realizedPnlDollars;
    });
}

function aggregateBreakdown(
  rows: readonly DeterministicJournalAnalyticsRow[],
  definition: BreakdownDefinition,
): DeterministicJournalAnalyticsBreakdownEntry {
  const selected = rows.filter(definition.matches);
  const reviewed = selected.filter((row) => row.outcomeState !== "UNREVIEWED");
  const noTrade = reviewed.filter((row) => row.outcomeState === "NO_TRADE");
  const tradeRows = reviewed.filter((row) =>
    ["WIN", "LOSS", "BREAKEVEN"].includes(row.outcomeState),
  );
  const pnlValues = tradePnlValues(tradeRows);
  const wins = tradeRows.filter((row) => row.outcomeState === "WIN").length;
  const losses = tradeRows.filter((row) => row.outcomeState === "LOSS").length;
  const breakevens = tradeRows.filter((row) => row.outcomeState === "BREAKEVEN").length;
  const totalPnl = pnlValues.reduce((total, value) => total + value, 0);

  return {
    key: definition.key,
    label: definition.label,
    snapshotCount: selected.length,
    reviewedCount: reviewed.length,
    noTradeCount: noTrade.length,
    tradeCount: tradeRows.length,
    wins,
    losses,
    breakevens,
    winRatePercent: wins + losses === 0 ? null : percent(wins, wins + losses),
    totalPnlDollars: tradeRows.length === 0 ? null : round(totalPnl),
    averagePnlDollars:
      tradeRows.length === 0 ? null : round(totalPnl / tradeRows.length),
  };
}

function dailyPerformance(
  rows: readonly DeterministicJournalAnalyticsRow[],
): DeterministicJournalAnalyticsDailyEntry[] {
  const marketDates = [...new Set(rows.map((row) => row.currentMarketDate))]
    .sort()
    .slice(-30);

  return marketDates.map((marketDate) => {
    const selected = rows.filter((row) => row.currentMarketDate === marketDate);
    const reviewed = selected.filter((row) => row.outcomeState !== "UNREVIEWED");
    const noTrade = reviewed.filter((row) => row.outcomeState === "NO_TRADE");
    const tradeRows = reviewed.filter((row) =>
      ["WIN", "LOSS", "BREAKEVEN"].includes(row.outcomeState),
    );
    const pnl = tradePnlValues(tradeRows);
    return {
      marketDate,
      snapshotCount: selected.length,
      reviewedCount: reviewed.length,
      noTradeCount: noTrade.length,
      tradeCount: tradeRows.length,
      wins: tradeRows.filter((row) => row.outcomeState === "WIN").length,
      losses: tradeRows.filter((row) => row.outcomeState === "LOSS").length,
      breakevens: tradeRows.filter((row) => row.outcomeState === "BREAKEVEN").length,
      totalPnlDollars:
        tradeRows.length === 0 ? null : round(pnl.reduce((total, value) => total + value, 0)),
    };
  });
}

export function buildDeterministicJournalAnalyticsPayload(
  rows: readonly DeterministicJournalAnalyticsRow[],
): DeterministicJournalAnalyticsPayload {
  const reviewedRows = rows.filter((row) => row.outcomeState !== "UNREVIEWED");
  const noTradeRows = reviewedRows.filter((row) => row.outcomeState === "NO_TRADE");
  const tradeRows = reviewedRows.filter((row) =>
    ["WIN", "LOSS", "BREAKEVEN"].includes(row.outcomeState),
  );
  const pnlValues = tradePnlValues(tradeRows);
  const wins = tradeRows.filter((row) => row.outcomeState === "WIN");
  const losses = tradeRows.filter((row) => row.outcomeState === "LOSS");
  const breakevens = tradeRows.filter((row) => row.outcomeState === "BREAKEVEN");
  const winPnl = tradePnlValues(wins);
  const lossPnl = tradePnlValues(losses);
  const totalPnl = pnlValues.reduce((total, value) => total + value, 0);
  const grossProfit = winPnl.reduce((total, value) => total + value, 0);
  const grossLossMagnitude = Math.abs(lossPnl.reduce((total, value) => total + value, 0));
  const marketDates = rows.map((row) => row.currentMarketDate).sort();

  return {
    dataStartMarketDate: marketDates[0] ?? null,
    dataEndMarketDate: marketDates.at(-1) ?? null,
    counts: {
      totalSnapshots: rows.length,
      manualSnapshots: rows.filter((row) => row.captureMode === "EXPLICIT").length,
      automaticSnapshots: rows.filter(
        (row) => row.captureMode === "AUTOMATIC_CANDIDATE",
      ).length,
      reviewedSnapshots: reviewedRows.length,
      unreviewedSnapshots: rows.length - reviewedRows.length,
      noTradeSnapshots: noTradeRows.length,
      tradeOutcomes: tradeRows.length,
      wins: wins.length,
      losses: losses.length,
      breakevens: breakevens.length,
    },
    performance: {
      reviewCoveragePercent: percent(reviewedRows.length, rows.length),
      tradeParticipationPercent: percent(tradeRows.length, reviewedRows.length),
      winRatePercent:
        wins.length + losses.length === 0
          ? null
          : percent(wins.length, wins.length + losses.length),
      totalPnlDollars: tradeRows.length === 0 ? null : round(totalPnl),
      averagePnlDollars:
        tradeRows.length === 0 ? null : round(totalPnl / tradeRows.length),
      expectancyDollars:
        tradeRows.length === 0 ? null : round(totalPnl / tradeRows.length),
      averageWinDollars:
        wins.length === 0 ? null : round(grossProfit / wins.length),
      averageLossDollars:
        losses.length === 0
          ? null
          : round(lossPnl.reduce((total, value) => total + value, 0) / losses.length),
      grossProfitDollars: wins.length === 0 ? null : round(grossProfit),
      grossLossMagnitudeDollars:
        losses.length === 0 ? null : round(grossLossMagnitude),
      profitFactor:
        losses.length === 0 ? null : round(grossProfit / grossLossMagnitude),
      largestWinDollars: wins.length === 0 ? null : round(Math.max(...winPnl)),
      largestLossDollars: losses.length === 0 ? null : round(Math.min(...lossPnl)),
    },
    byDirection: DIRECTION_DEFINITIONS.map((definition) =>
      aggregateBreakdown(rows, definition),
    ),
    byPlanState: PLAN_STATE_DEFINITIONS.map((definition) =>
      aggregateBreakdown(rows, definition),
    ),
    byCaptureMode: CAPTURE_MODE_DEFINITIONS.map((definition) =>
      aggregateBreakdown(rows, definition),
    ),
    byConfidenceBand: CONFIDENCE_BAND_DEFINITIONS.map((definition) =>
      aggregateBreakdown(rows, definition),
    ),
    dailyPerformance: dailyPerformance(rows),
    sample: {
      aggregationScope: "ALL_PERSISTED_USER_SNAPSHOTS",
      dailyMarketDateLimit: 30,
    },
  };
}

export function buildDeterministicJournalAnalyticsResponse(
  rows: readonly DeterministicJournalAnalyticsRow[],
  calculatedAt: Date,
): DeterministicJournalAnalyticsResponse {
  const analytics = buildDeterministicJournalAnalyticsPayload(rows);
  return DeterministicJournalAnalyticsResponseSchema.parse({
    product: "SPY_ZERO_DTE_DETERMINISTIC_JOURNAL_ANALYTICS",
    methodologyVersion: "JOURNAL_ANALYTICS_V1",
    calculatedAt: calculatedAt.toISOString(),
    engineState: "AVAILABLE",
    primaryReasonCode:
      rows.length === 0 ? "JOURNAL_ANALYTICS_EMPTY" : "JOURNAL_ANALYTICS_AVAILABLE",
    analytics,
    disclosures: DISCLOSURES,
  });
}

export function buildDeterministicJournalAnalyticsUnavailableResponse(
  reason: "DATABASE_NOT_CONFIGURED" | "DATABASE_UNAVAILABLE",
  calculatedAt: Date,
): DeterministicJournalAnalyticsResponse {
  return DeterministicJournalAnalyticsResponseSchema.parse({
    product: "SPY_ZERO_DTE_DETERMINISTIC_JOURNAL_ANALYTICS",
    methodologyVersion: "JOURNAL_ANALYTICS_V1",
    calculatedAt: calculatedAt.toISOString(),
    engineState: "UNAVAILABLE",
    primaryReasonCode: reason,
    analytics: null,
    disclosures: DISCLOSURES,
  });
}
