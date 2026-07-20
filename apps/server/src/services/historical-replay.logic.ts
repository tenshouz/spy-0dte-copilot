import {
  HistoricalReplayHistoryResponseSchema,
  HistoricalReplayRunPayloadSchema,
  HistoricalReplayRunResponseSchema,
  SpyZeroDteTradePlanAssemblyResponseSchema,
  type AssembledTradePlanDirection,
  type DeterministicJournalCaptureMode,
  type DeterministicJournalOutcomeState,
  type DeterministicTradePlanState,
  type HistoricalReplayAuditIssue,
  type HistoricalReplayEvent,
  type HistoricalReplayHistoryResponse,
  type HistoricalReplayOutcomeSummary,
  type HistoricalReplayRunPayload,
  type HistoricalReplayRunRequest,
  type HistoricalReplayRunResponse,
  type HistoricalReplayRunSummary,
  type HistoricalReplaySessionSummary,
  type SpyZeroDteTradePlanAssemblyResponse,
  type TradePlanAssemblyEntryConditionState,
  type TradePlanAssemblyPrimaryReasonCode,
} from "@spy-copilot/shared";

export const HISTORICAL_REPLAY_SNAPSHOT_LIMIT = 1000;
const HISTORICAL_REPLAY_ISSUE_LIMIT = 500;

export interface HistoricalReplaySourceRow {
  id: string;
  currentMarketDate: string;
  sourceCalculatedAt: Date;
  capturedAt: Date;
  captureMode: DeterministicJournalCaptureMode;
  engineState: "AVAILABLE" | "PARTIAL" | "UNAVAILABLE";
  planState: DeterministicTradePlanState;
  direction: AssembledTradePlanDirection;
  confidenceScore: number | null;
  primaryReasonCode: TradePlanAssemblyPrimaryReasonCode;
  warningCode: string | null;
  entryConditionState: TradePlanAssemblyEntryConditionState;
  selectedContractSymbol: string | null;
  sourceAssembly: unknown;
  outcomeState: DeterministicJournalOutcomeState;
  realizedPnlDollars: number | null;
  outcomeUpdatedAt: Date | null;
}

export interface HistoricalReplayRunRow {
  id: string;
  createdAt: Date;
  startMarketDate: string | null;
  endMarketDate: string | null;
  snapshotCount: number;
  marketDateCount: number;
  auditState: "PASS" | "FAIL" | "EMPTY";
  auditFailureCount: number;
  stateChangeCount: number;
  tradeOutcomeCount: number;
  totalPnlDollars: number | null;
  result: unknown;
}

const DISCLOSURES = {
  capturedSnapshotsOnly: true,
  noRawMarketReconstruction: true,
  noFutureDataUsed: true,
  sourceTimeAuditApplied: true,
  postHocOutcomesSeparated: true,
  persistedReplayRuns: true,
  snapshotLimitApplied: true,
  noTradingRecommendation: true,
  noPrivateAccountData: true,
  noPositionSizing: true,
  noOrderExecution: true,
} as const;

const METHODOLOGY = {
  replayScope: "PERSISTED_CAPTURED_ASSEMBLY_SNAPSHOTS",
  chronologicalBoundary: "SOURCE_CALCULATED_AT",
  noLookaheadBoundary: "ASSEMBLY_CALCULATED_AT",
  stateTransitionMethod: "ADJACENT_CAPTURED_STATE_FINGERPRINT",
  rawMarketRecomputationMethod: "NONE",
  outcomeUsage: "POST_HOC_SUMMARY_ONLY",
  persistenceMethod: "POSTGRESQL_REPLAY_RUN",
} as const;

const CANDIDATE_PLAN_STATES = new Set<DeterministicTradePlanState>([
  "READY",
  "WAITING_FOR_TRIGGER",
  "NO_QUALIFIED_CONTRACT",
  "NOT_QUALIFIED",
]);

const easternDateFormatter = new Intl.DateTimeFormat("en-US", {
  timeZone: "America/New_York",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

function easternMarketDate(isoTimestamp: string): string {
  const parts = easternDateFormatter.formatToParts(new Date(isoTimestamp));
  const year = parts.find((part) => part.type === "year")?.value;
  const month = parts.find((part) => part.type === "month")?.value;
  const day = parts.find((part) => part.type === "day")?.value;
  if (!year || !month || !day) throw new Error("Eastern market date unavailable");
  return `${year}-${month}-${day}`;
}

function roundMoney(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

function buildOutcomeSummary(
  rows: readonly HistoricalReplaySourceRow[],
): HistoricalReplayOutcomeSummary {
  const reviewed = rows.filter((row) => row.outcomeState !== "UNREVIEWED");
  const noTrade = reviewed.filter((row) => row.outcomeState === "NO_TRADE");
  const trades = reviewed.filter((row) =>
    ["WIN", "LOSS", "BREAKEVEN"].includes(row.outcomeState),
  );
  const values = trades
    .map((row) => row.realizedPnlDollars)
    .filter((value): value is number => value !== null && Number.isFinite(value));

  return {
    reviewedSnapshotCount: reviewed.length,
    unreviewedSnapshotCount: rows.length - reviewed.length,
    noTradeCount: noTrade.length,
    tradeOutcomeCount: trades.length,
    wins: trades.filter((row) => row.outcomeState === "WIN").length,
    losses: trades.filter((row) => row.outcomeState === "LOSS").length,
    breakevens: trades.filter((row) => row.outcomeState === "BREAKEVEN").length,
    totalPnlDollars:
      trades.length === 0 || values.length !== trades.length
        ? null
        : roundMoney(values.reduce((sum, value) => sum + value, 0)),
  };
}

function eventFingerprint(row: HistoricalReplaySourceRow): string {
  return [
    row.planState,
    row.direction,
    row.entryConditionState,
    row.selectedContractSymbol ?? "NONE",
    row.primaryReasonCode,
    row.confidenceScore === null ? "NONE" : row.confidenceScore.toFixed(6),
  ].join("|");
}

function addIssue(
  issues: HistoricalReplayAuditIssue[],
  row: HistoricalReplaySourceRow,
  input: Omit<HistoricalReplayAuditIssue, "snapshotId" | "marketDate">,
): void {
  issues.push({
    snapshotId: row.id,
    marketDate: row.currentMarketDate,
    ...input,
  });
}

function timestampAfterBoundary(
  issues: HistoricalReplayAuditIssue[],
  row: HistoricalReplaySourceRow,
  fieldPath: string,
  observed: string | null,
  boundary: string,
): number {
  if (observed === null) return 0;
  if (Date.parse(observed) > Date.parse(boundary)) {
    addIssue(issues, row, {
      checkCode: "SOURCE_TIMESTAMP_AFTER_ASSEMBLY",
      fieldPath,
      observedValue: observed,
      boundaryValue: boundary,
      message: "Source timestamp occurs after the Assembly calculation boundary.",
    });
  }
  return 1;
}

function summaryChecks(
  issues: HistoricalReplayAuditIssue[],
  row: HistoricalReplaySourceRow,
  assembly: SpyZeroDteTradePlanAssemblyResponse,
): number {
  const comparisons: Array<[string, unknown, unknown]> = [
    ["currentMarketDate", row.currentMarketDate, assembly.currentMarketDate],
    ["engineState", row.engineState, assembly.engineState],
    ["planState", row.planState, assembly.planState],
    ["direction", row.direction, assembly.direction],
    ["confidenceScore", row.confidenceScore, assembly.bias.confidenceScore],
    ["primaryReasonCode", row.primaryReasonCode, assembly.primaryReasonCode],
    ["warningCode", row.warningCode, assembly.warningCode],
    [
      "entryConditionState",
      row.entryConditionState,
      assembly.entryCondition.state,
    ],
    [
      "selectedContractSymbol",
      row.selectedContractSymbol,
      assembly.selectedContract.contractSymbol,
    ],
  ];

  for (const [fieldPath, stored, source] of comparisons) {
    if (stored !== source) {
      addIssue(issues, row, {
        checkCode: "STORED_SUMMARY_MISMATCH",
        fieldPath,
        observedValue: stored === null ? null : String(stored),
        boundaryValue: source === null ? null : String(source),
        message: "Persisted summary does not match the stored Assembly payload.",
      });
    }
  }
  return comparisons.length;
}

function auditSourceRow(row: HistoricalReplaySourceRow): {
  issues: HistoricalReplayAuditIssue[];
  checksPerformed: number;
} {
  const issues: HistoricalReplayAuditIssue[] = [];
  let checksPerformed = 1;
  const parsed = SpyZeroDteTradePlanAssemblyResponseSchema.safeParse(
    row.sourceAssembly,
  );

  if (!parsed.success) {
    addIssue(issues, row, {
      checkCode: "ASSEMBLY_SCHEMA_INVALID",
      fieldPath: "sourceAssembly",
      observedValue: null,
      boundaryValue: "ASSEMBLY_V1_OR_V2",
      message: "Stored source Assembly no longer validates against a supported Assembly methodology.",
    });
    return { issues, checksPerformed };
  }

  const assembly = parsed.data;
  checksPerformed += summaryChecks(issues, row, assembly);

  checksPerformed += 1;
  const sourceCalculatedAt = row.sourceCalculatedAt.toISOString();
  if (sourceCalculatedAt !== assembly.calculatedAt) {
    addIssue(issues, row, {
      checkCode: "SOURCE_CALCULATED_AT_MISMATCH",
      fieldPath: "sourceCalculatedAt",
      observedValue: sourceCalculatedAt,
      boundaryValue: assembly.calculatedAt,
      message: "Persisted sourceCalculatedAt differs from Assembly calculatedAt.",
    });
  }

  checksPerformed += 1;
  if (row.sourceCalculatedAt.getTime() > row.capturedAt.getTime()) {
    addIssue(issues, row, {
      checkCode: "SOURCE_CALCULATED_AFTER_CAPTURE",
      fieldPath: "sourceCalculatedAt",
      observedValue: sourceCalculatedAt,
      boundaryValue: row.capturedAt.toISOString(),
      message: "Assembly was calculated after the journal capture timestamp.",
    });
  }

  const sourceTimes: Array<[string, string | null]> = [
    ["quoteTimestamp", assembly.quoteTimestamp],
    [
      "sourceSummary.marketState.calculatedAt",
      assembly.sourceSummary.marketState.calculatedAt,
    ],
    [
      "sourceSummary.bias.calculatedAt",
      assembly.sourceSummary.bias.calculatedAt,
    ],
    [
      "sourceSummary.tradePlan.calculatedAt",
      assembly.sourceSummary.tradePlan.calculatedAt,
    ],
    [
      "sourceSummary.risk.calculatedAt",
      assembly.sourceSummary.risk.calculatedAt,
    ],
    [
      "sourceSummary.contract.calculatedAt",
      assembly.sourceSummary.contract.calculatedAt,
    ],
    [
      "sourceSummary.contract.sourceOptionsChainFetchedAt",
      assembly.sourceSummary.contract.sourceOptionsChainFetchedAt,
    ],
    [
      "sourceSummary.selectedContractQuoteAt",
      assembly.sourceSummary.selectedContractQuoteAt,
    ],
    ["selectedContract.quoteAt", assembly.selectedContract.quoteAt],
    ["selectedContract.tradeAt", assembly.selectedContract.tradeAt],
  ];

  for (const [fieldPath, observed] of sourceTimes) {
    checksPerformed += timestampAfterBoundary(
      issues,
      row,
      fieldPath,
      observed,
      assembly.calculatedAt,
    );
  }

  checksPerformed += 1;
  const expectedMarketDate = easternMarketDate(assembly.calculatedAt);
  if (assembly.currentMarketDate !== expectedMarketDate) {
    addIssue(issues, row, {
      checkCode: "CURRENT_MARKET_DATE_MISMATCH",
      fieldPath: "currentMarketDate",
      observedValue: assembly.currentMarketDate,
      boundaryValue: expectedMarketDate,
      message: "Assembly market date does not match its Eastern calculation date.",
    });
  }

  checksPerformed += 1;
  if (
    assembly.mostRecentRthSessionDate !== null &&
    assembly.mostRecentRthSessionDate > assembly.currentMarketDate
  ) {
    addIssue(issues, row, {
      checkCode: "MOST_RECENT_RTH_DATE_AFTER_MARKET_DATE",
      fieldPath: "mostRecentRthSessionDate",
      observedValue: assembly.mostRecentRthSessionDate,
      boundaryValue: assembly.currentMarketDate,
      message: "Most recent RTH date is after the Assembly market date.",
    });
  }

  checksPerformed += 1;
  if (
    assembly.selectedContract.contractSymbol !== null &&
    assembly.selectedContract.expirationDate !== assembly.currentMarketDate
  ) {
    addIssue(issues, row, {
      checkCode: "SELECTED_CONTRACT_EXPIRATION_MISMATCH",
      fieldPath: "selectedContract.expirationDate",
      observedValue: assembly.selectedContract.expirationDate,
      boundaryValue: assembly.currentMarketDate,
      message: "Selected contract expiration is not the Assembly market date.",
    });
  }

  checksPerformed += 1;
  if (
    row.outcomeUpdatedAt !== null &&
    row.outcomeUpdatedAt.getTime() < row.capturedAt.getTime()
  ) {
    addIssue(issues, row, {
      checkCode: "OUTCOME_UPDATED_BEFORE_CAPTURE",
      fieldPath: "outcomeUpdatedAt",
      observedValue: row.outcomeUpdatedAt.toISOString(),
      boundaryValue: row.capturedAt.toISOString(),
      message: "Post-hoc outcome metadata predates the source snapshot capture.",
    });
  }

  checksPerformed += 1;
  const pnl = row.realizedPnlDollars;
  const outcomeValid =
    (["UNREVIEWED", "NO_TRADE"].includes(row.outcomeState) && pnl === null) ||
    (row.outcomeState === "WIN" && pnl !== null && pnl > 0) ||
    (row.outcomeState === "LOSS" && pnl !== null && pnl < 0) ||
    (row.outcomeState === "BREAKEVEN" && pnl === 0);
  if (!outcomeValid) {
    addIssue(issues, row, {
      checkCode: "STORED_SUMMARY_MISMATCH",
      fieldPath: "outcomeState",
      observedValue: `${row.outcomeState}:${pnl ?? "null"}`,
      boundaryValue: "VALID_USER_ENTERED_OUTCOME",
      message: "Persisted outcome state and realized P&L are inconsistent.",
    });
  }

  return { issues, checksPerformed };
}

export function buildHistoricalReplayRunPayload(args: {
  id: string;
  createdAt: Date;
  request: HistoricalReplayRunRequest;
  rows: readonly HistoricalReplaySourceRow[];
  snapshotLimitReached: boolean;
}): HistoricalReplayRunPayload {
  const rows = [...args.rows]
    .sort((left, right) => {
      const calculated =
        left.sourceCalculatedAt.getTime() - right.sourceCalculatedAt.getTime();
      if (calculated !== 0) return calculated;
      const captured = left.capturedAt.getTime() - right.capturedAt.getTime();
      return captured !== 0 ? captured : left.id.localeCompare(right.id);
    })
    .slice(0, HISTORICAL_REPLAY_SNAPSHOT_LIMIT);

  const allIssues: HistoricalReplayAuditIssue[] = [];
  const passBySnapshot = new Map<string, boolean>();
  let checksPerformed = 0;

  for (const row of rows) {
    const audit = auditSourceRow(row);
    checksPerformed += audit.checksPerformed;
    allIssues.push(...audit.issues);
    passBySnapshot.set(row.id, audit.issues.length === 0);
  }

  const events: HistoricalReplayEvent[] = [];
  const sessions: HistoricalReplaySessionSummary[] = [];
  let stateChangeCount = 0;
  let unchangedStateCount = 0;
  let candidateSnapshotCount = 0;

  const marketDates = [...new Set(rows.map((row) => row.currentMarketDate))];

  for (const marketDate of marketDates) {
    const sessionRows = rows.filter((row) => row.currentMarketDate === marketDate);
    let previousFingerprint: string | null = null;
    let sessionStateChangeCount = 0;
    let sessionCandidateCount = 0;

    for (const row of sessionRows) {
      const fingerprint = eventFingerprint(row);
      const eventType =
        previousFingerprint === null
          ? "SESSION_INITIAL"
          : previousFingerprint === fingerprint
            ? "STATE_UNCHANGED"
            : "STATE_CHANGED";

      if (eventType === "STATE_CHANGED") {
        stateChangeCount += 1;
        sessionStateChangeCount += 1;
      } else if (eventType === "STATE_UNCHANGED") {
        unchangedStateCount += 1;
      }

      if (CANDIDATE_PLAN_STATES.has(row.planState)) {
        candidateSnapshotCount += 1;
        sessionCandidateCount += 1;
      }

      events.push({
        sequence: events.length + 1,
        snapshotId: row.id,
        marketDate: row.currentMarketDate,
        sourceCalculatedAt: row.sourceCalculatedAt.toISOString(),
        capturedAt: row.capturedAt.toISOString(),
        captureMode: row.captureMode,
        eventType,
        noLookaheadState: passBySnapshot.get(row.id) ? "PASS" : "FAIL",
        planState: row.planState,
        direction: row.direction,
        entryConditionState: row.entryConditionState,
        selectedContractSymbol: row.selectedContractSymbol,
        structuralConfidenceScore: row.confidenceScore,
        primaryReasonCode: row.primaryReasonCode,
        outcomeState: row.outcomeState,
        realizedPnlDollars: row.realizedPnlDollars,
      });

      previousFingerprint = fingerprint;
    }

    const terminal = sessionRows.at(-1);
    if (!terminal) continue;
    const auditPassCount = sessionRows.filter(
      (row) => passBySnapshot.get(row.id) === true,
    ).length;

    sessions.push({
      marketDate,
      snapshotCount: sessionRows.length,
      firstSourceCalculatedAt: sessionRows[0]!.sourceCalculatedAt.toISOString(),
      lastSourceCalculatedAt: terminal.sourceCalculatedAt.toISOString(),
      auditPassCount,
      auditFailCount: sessionRows.length - auditPassCount,
      stateChangeCount: sessionStateChangeCount,
      candidateSnapshotCount: sessionCandidateCount,
      terminalPlanState: terminal.planState,
      terminalDirection: terminal.direction,
      outcomeSummary: buildOutcomeSummary(sessionRows),
    });
  }

  const snapshotPassCount = [...passBySnapshot.values()].filter(Boolean).length;
  const snapshotFailCount = rows.length - snapshotPassCount;
  const issues = allIssues.slice(0, HISTORICAL_REPLAY_ISSUE_LIMIT);
  const auditState =
    rows.length === 0 ? "EMPTY" : snapshotFailCount > 0 ? "FAIL" : "PASS";
  const sortedDates = marketDates.sort();

  return HistoricalReplayRunPayloadSchema.parse({
    id: args.id,
    createdAt: args.createdAt.toISOString(),
    request: args.request,
    source: {
      snapshotLimit: HISTORICAL_REPLAY_SNAPSHOT_LIMIT,
      snapshotLimitReached: args.snapshotLimitReached,
      snapshotCount: rows.length,
      marketDateCount: sortedDates.length,
      dataStartMarketDate: sortedDates[0] ?? null,
      dataEndMarketDate: sortedDates.at(-1) ?? null,
      chronologicalOrdering: "SOURCE_CALCULATED_AT_ASCENDING",
      sourceProduct: "SPY_ZERO_DTE_DETERMINISTIC_JOURNAL_SNAPSHOT",
      sourceMethodology: "JOURNAL_SNAPSHOT_V3",
    },
    audit: {
      auditState,
      checksPerformed,
      snapshotPassCount,
      snapshotFailCount,
      issueCount: allIssues.length,
      returnedIssueCount: issues.length,
      issuesTruncated: allIssues.length > issues.length,
      issues,
    },
    timeline: {
      eventCount: events.length,
      stateChangeCount,
      unchangedStateCount,
      candidateSnapshotCount,
      sessions,
      events,
    },
    outcomeSummary: buildOutcomeSummary(rows),
    methodology: METHODOLOGY,
  });
}

export function summarizeHistoricalReplayRun(
  run: HistoricalReplayRunPayload,
): HistoricalReplayRunSummary {
  return {
    id: run.id,
    createdAt: run.createdAt,
    startMarketDate: run.request.startMarketDate,
    endMarketDate: run.request.endMarketDate,
    snapshotCount: run.source.snapshotCount,
    marketDateCount: run.source.marketDateCount,
    auditState: run.audit.auditState,
    auditFailureCount: run.audit.snapshotFailCount,
    stateChangeCount: run.timeline.stateChangeCount,
    tradeOutcomeCount: run.outcomeSummary.tradeOutcomeCount,
    totalPnlDollars: run.outcomeSummary.totalPnlDollars,
  };
}

export function mapHistoricalReplayRunRow(
  row: HistoricalReplayRunRow,
): HistoricalReplayRunPayload {
  return HistoricalReplayRunPayloadSchema.parse(row.result);
}

export function mapHistoricalReplayRunSummaryRow(
  row: HistoricalReplayRunRow,
): HistoricalReplayRunSummary {
  return {
    id: row.id,
    createdAt: row.createdAt.toISOString(),
    startMarketDate: row.startMarketDate,
    endMarketDate: row.endMarketDate,
    snapshotCount: row.snapshotCount,
    marketDateCount: row.marketDateCount,
    auditState: row.auditState,
    auditFailureCount: row.auditFailureCount,
    stateChangeCount: row.stateChangeCount,
    tradeOutcomeCount: row.tradeOutcomeCount,
    totalPnlDollars: row.totalPnlDollars,
  };
}

export function buildHistoricalReplayRunResponse(
  run: HistoricalReplayRunPayload,
  calculatedAt: Date,
): HistoricalReplayRunResponse {
  const primaryReasonCode =
    run.source.snapshotCount === 0
      ? "REPLAY_EMPTY"
      : run.audit.auditState === "FAIL"
        ? "REPLAY_COMPLETE_WITH_AUDIT_FAILURES"
        : "REPLAY_COMPLETE";

  return HistoricalReplayRunResponseSchema.parse({
    product: "SPY_DETERMINISTIC_CAPTURED_HISTORY_REPLAY",
    methodologyVersion: "CAPTURED_REPLAY_V1",
    calculatedAt: calculatedAt.toISOString(),
    engineState: "AVAILABLE",
    primaryReasonCode,
    run,
    disclosures: DISCLOSURES,
  });
}

export function buildHistoricalReplayNotFoundResponse(
  calculatedAt: Date,
): HistoricalReplayRunResponse {
  return HistoricalReplayRunResponseSchema.parse({
    product: "SPY_DETERMINISTIC_CAPTURED_HISTORY_REPLAY",
    methodologyVersion: "CAPTURED_REPLAY_V1",
    calculatedAt: calculatedAt.toISOString(),
    engineState: "AVAILABLE",
    primaryReasonCode: "REPLAY_RUN_NOT_FOUND",
    run: null,
    disclosures: DISCLOSURES,
  });
}

export function buildHistoricalReplayUnavailableResponse(
  reason: "DATABASE_NOT_CONFIGURED" | "DATABASE_UNAVAILABLE",
  calculatedAt: Date,
): HistoricalReplayRunResponse {
  return HistoricalReplayRunResponseSchema.parse({
    product: "SPY_DETERMINISTIC_CAPTURED_HISTORY_REPLAY",
    methodologyVersion: "CAPTURED_REPLAY_V1",
    calculatedAt: calculatedAt.toISOString(),
    engineState: "UNAVAILABLE",
    primaryReasonCode: reason,
    run: null,
    disclosures: DISCLOSURES,
  });
}

export function buildHistoricalReplayHistoryResponse(
  rows: readonly HistoricalReplayRunRow[],
  calculatedAt: Date,
): HistoricalReplayHistoryResponse {
  const runs = rows.slice(0, 50).map(mapHistoricalReplayRunSummaryRow);
  return HistoricalReplayHistoryResponseSchema.parse({
    product: "SPY_DETERMINISTIC_CAPTURED_HISTORY_REPLAY_HISTORY",
    methodologyVersion: "CAPTURED_REPLAY_V1",
    calculatedAt: calculatedAt.toISOString(),
    engineState: "AVAILABLE",
    primaryReasonCode:
      runs.length === 0 ? "REPLAY_HISTORY_EMPTY" : "REPLAY_HISTORY_AVAILABLE",
    maximumEntries: 50,
    runs,
    disclosures: DISCLOSURES,
  });
}

export function buildHistoricalReplayHistoryUnavailableResponse(
  reason: "DATABASE_NOT_CONFIGURED" | "DATABASE_UNAVAILABLE",
  calculatedAt: Date,
): HistoricalReplayHistoryResponse {
  return HistoricalReplayHistoryResponseSchema.parse({
    product: "SPY_DETERMINISTIC_CAPTURED_HISTORY_REPLAY_HISTORY",
    methodologyVersion: "CAPTURED_REPLAY_V1",
    calculatedAt: calculatedAt.toISOString(),
    engineState: "UNAVAILABLE",
    primaryReasonCode: reason,
    maximumEntries: 50,
    runs: [],
    disclosures: DISCLOSURES,
  });
}
