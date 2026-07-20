import {
  DeterministicJournalAutomaticCaptureResponseSchema,
  DeterministicJournalCaptureResponseSchema,
  DeterministicJournalOutcomeUpdateResponseSchema,
  DeterministicJournalSnapshotEntrySchema,
  DeterministicJournalSnapshotListResponseSchema,
  type DeterministicJournalAutomaticCaptureResponse,
  type DeterministicJournalCaptureMode,
  type DeterministicJournalCaptureResponse,
  type DeterministicJournalOutcomeState,
  type DeterministicJournalOutcomeUpdateResponse,
  type DeterministicJournalSnapshotEntry,
  type DeterministicJournalSnapshotListResponse,
  type DeterministicJournalSourceReferenceType,
  type SpyZeroDteTradePlanAlertCandidateResponse,
  type SpyZeroDteTradePlanAssemblyResponse,
} from "@spy-copilot/shared";

export interface DeterministicJournalSnapshotRow {
  id: string;
  currentMarketDate: string;
  sourceCalculatedAt: Date;
  capturedAt: Date;
  captureMode: DeterministicJournalCaptureMode;
  sourceReferenceType: DeterministicJournalSourceReferenceType | null;
  sourceReferenceKey: string | null;
  engineState: SpyZeroDteTradePlanAssemblyResponse["engineState"];
  planState: SpyZeroDteTradePlanAssemblyResponse["planState"];
  direction: SpyZeroDteTradePlanAssemblyResponse["direction"];
  confidenceScore: number | null;
  primaryReasonCode: SpyZeroDteTradePlanAssemblyResponse["primaryReasonCode"];
  warningCode: SpyZeroDteTradePlanAssemblyResponse["warningCode"];
  entryConditionState: SpyZeroDteTradePlanAssemblyResponse["entryCondition"]["state"];
  selectedContractSymbol: string | null;
  outcomeState: DeterministicJournalOutcomeState;
  realizedPnlDollars: number | null;
  outcomeNotes: string | null;
  outcomeUpdatedAt: Date | null;
}

const DISCLOSURES = {
  explicitCaptureAvailable: true,
  automaticCandidateCaptureAvailable: true,
  automaticCaptureForegroundOnly: true,
  currentSnapshotOnly: true,
  deterministicSourceOnly: true,
  databasePersistence: true,
  databaseDuplicateSuppression: true,
  noBackgroundScheduler: true,
  userEnteredOutcomeOnly: true,
  noAutomaticOutcomeInference: true,
  performanceAnalyticsAvailable: true,
  noPrivateAccountData: true,
  noPositionSizing: true,
  noOrderExecution: true,
} as const;

const AUTOMATIC_METHODOLOGY = {
  sourceProduct: "SPY_ZERO_DTE_DETERMINISTIC_TRADE_PLAN_ASSEMBLY",
  sourceMethodology: "ASSEMBLY_V2",
  candidateProduct:
    "SPY_ZERO_DTE_DETERMINISTIC_TRADE_PLAN_ALERT_CANDIDATE",
  candidateMethodology: "TRADE_PLAN_ALERT_CANDIDATE_V2",
  eligibleCandidateStates: [
    "READY",
    "WAITING_FOR_TRIGGER",
    "NO_QUALIFIED_CONTRACT",
    "NOT_QUALIFIED",
  ],
  triggerMethod: "EXPLICIT_FOREGROUND_POST_POLL",
  deduplicationMethod: "POSTGRESQL_UNIQUE_USER_SOURCE_REFERENCE_KEY",
  persistenceMethod: "POSTGRESQL",
  schedulerMethod: "NONE",
} as const;

function journalWarning(
  assembly: SpyZeroDteTradePlanAssemblyResponse,
): "SOURCE_ASSEMBLY_PARTIAL" | "SOURCE_ASSEMBLY_WARNING" | null {
  if (assembly.engineState === "PARTIAL") return "SOURCE_ASSEMBLY_PARTIAL";
  return assembly.warningCode === null ? null : "SOURCE_ASSEMBLY_WARNING";
}

function candidateSummary(source: SpyZeroDteTradePlanAlertCandidateResponse) {
  return {
    alertState: source.alertState,
    primaryReasonCode: source.primaryReasonCode,
    category: source.candidate?.category ?? null,
    severity: source.candidate?.severity ?? null,
    direction: source.candidate?.direction ?? null,
    deduplicationKey: source.candidate?.deduplicationKey ?? null,
  };
}

export function mapJournalRowToEntry(
  row: DeterministicJournalSnapshotRow,
): DeterministicJournalSnapshotEntry {
  return DeterministicJournalSnapshotEntrySchema.parse({
    id: row.id,
    symbol: "SPY",
    product: "SPY_ZERO_DTE_DETERMINISTIC_JOURNAL_SNAPSHOT",
    methodologyVersion: "JOURNAL_SNAPSHOT_V3",
    currentMarketDate: row.currentMarketDate,
    sourceCalculatedAt: row.sourceCalculatedAt.toISOString(),
    capturedAt: row.capturedAt.toISOString(),
    captureMode: row.captureMode,
    sourceReferenceType: row.sourceReferenceType,
    engineState: row.engineState,
    planState: row.planState,
    direction: row.direction,
    structuralConfidenceScore: row.confidenceScore,
    primaryReasonCode: row.primaryReasonCode,
    warningCode: row.warningCode,
    entryConditionState: row.entryConditionState,
    selectedContractSymbol: row.selectedContractSymbol,
    outcomeState: row.outcomeState,
    realizedPnlDollars: row.realizedPnlDollars,
    outcomeNotes: row.outcomeNotes,
    outcomeUpdatedAt: row.outcomeUpdatedAt?.toISOString() ?? null,
  });
}

export function buildJournalListResponse(
  rows: readonly DeterministicJournalSnapshotRow[],
  calculatedAt: Date,
): DeterministicJournalSnapshotListResponse {
  const entries = rows.slice(0, 200).map(mapJournalRowToEntry);
  return DeterministicJournalSnapshotListResponseSchema.parse({
    product: "SPY_ZERO_DTE_DETERMINISTIC_JOURNAL",
    methodologyVersion: "JOURNAL_SNAPSHOT_V3",
    calculatedAt: calculatedAt.toISOString(),
    engineState: "AVAILABLE",
    primaryReasonCode:
      entries.length > 0 ? "JOURNAL_ENTRIES_AVAILABLE" : "JOURNAL_EMPTY",
    entries,
    disclosures: DISCLOSURES,
  });
}

export function buildJournalUnavailableListResponse(
  reason: "DATABASE_NOT_CONFIGURED" | "DATABASE_UNAVAILABLE",
  calculatedAt: Date,
): DeterministicJournalSnapshotListResponse {
  return DeterministicJournalSnapshotListResponseSchema.parse({
    product: "SPY_ZERO_DTE_DETERMINISTIC_JOURNAL",
    methodologyVersion: "JOURNAL_SNAPSHOT_V3",
    calculatedAt: calculatedAt.toISOString(),
    engineState: "UNAVAILABLE",
    primaryReasonCode: reason,
    entries: [],
    disclosures: DISCLOSURES,
  });
}

export function buildCapturedJournalResponse(
  row: DeterministicJournalSnapshotRow,
  assembly: SpyZeroDteTradePlanAssemblyResponse,
  calculatedAt: Date,
): DeterministicJournalCaptureResponse {
  return DeterministicJournalCaptureResponseSchema.parse({
    product: "SPY_ZERO_DTE_DETERMINISTIC_JOURNAL_CAPTURE",
    methodologyVersion: "JOURNAL_SNAPSHOT_V3",
    calculatedAt: calculatedAt.toISOString(),
    engineState: "AVAILABLE",
    primaryReasonCode: "JOURNAL_SNAPSHOT_CAPTURED",
    warningCode: journalWarning(assembly),
    entry: mapJournalRowToEntry(row),
    disclosures: DISCLOSURES,
  });
}

export function buildJournalCaptureUnavailableResponse(
  reason:
    | "SOURCE_ASSEMBLY_UNAVAILABLE"
    | "DATABASE_NOT_CONFIGURED"
    | "DATABASE_UNAVAILABLE",
  calculatedAt: Date,
): DeterministicJournalCaptureResponse {
  return DeterministicJournalCaptureResponseSchema.parse({
    product: "SPY_ZERO_DTE_DETERMINISTIC_JOURNAL_CAPTURE",
    methodologyVersion: "JOURNAL_SNAPSHOT_V3",
    calculatedAt: calculatedAt.toISOString(),
    engineState: "UNAVAILABLE",
    primaryReasonCode: reason,
    warningCode: null,
    entry: null,
    disclosures: DISCLOSURES,
  });
}

export function buildAutomaticJournalCapturedResponse(
  row: DeterministicJournalSnapshotRow,
  assembly: SpyZeroDteTradePlanAssemblyResponse,
  candidate: SpyZeroDteTradePlanAlertCandidateResponse,
  calculatedAt: Date,
): DeterministicJournalAutomaticCaptureResponse {
  return DeterministicJournalAutomaticCaptureResponseSchema.parse({
    product: "SPY_ZERO_DTE_DETERMINISTIC_JOURNAL_AUTOMATIC_CAPTURE",
    methodologyVersion: "JOURNAL_SNAPSHOT_V3",
    calculatedAt: calculatedAt.toISOString(),
    engineState: "AVAILABLE",
    automaticCaptureState: "CAPTURED",
    primaryReasonCode: "JOURNAL_AUTOMATIC_SNAPSHOT_CAPTURED",
    warningCode: journalWarning(assembly),
    entry: mapJournalRowToEntry(row),
    sourceCandidate: candidateSummary(candidate),
    disclosures: DISCLOSURES,
    methodology: AUTOMATIC_METHODOLOGY,
  });
}

export function buildAutomaticJournalDuplicateResponse(
  row: DeterministicJournalSnapshotRow,
  assembly: SpyZeroDteTradePlanAssemblyResponse,
  candidate: SpyZeroDteTradePlanAlertCandidateResponse,
  calculatedAt: Date,
): DeterministicJournalAutomaticCaptureResponse {
  return DeterministicJournalAutomaticCaptureResponseSchema.parse({
    product: "SPY_ZERO_DTE_DETERMINISTIC_JOURNAL_AUTOMATIC_CAPTURE",
    methodologyVersion: "JOURNAL_SNAPSHOT_V3",
    calculatedAt: calculatedAt.toISOString(),
    engineState: "AVAILABLE",
    automaticCaptureState: "DUPLICATE_SUPPRESSED",
    primaryReasonCode: "JOURNAL_AUTOMATIC_DUPLICATE_SUPPRESSED",
    warningCode: journalWarning(assembly),
    entry: mapJournalRowToEntry(row),
    sourceCandidate: candidateSummary(candidate),
    disclosures: DISCLOSURES,
    methodology: AUTOMATIC_METHODOLOGY,
  });
}

export function buildAutomaticJournalNoCaptureResponse(
  candidate: SpyZeroDteTradePlanAlertCandidateResponse,
  calculatedAt: Date,
): DeterministicJournalAutomaticCaptureResponse {
  return DeterministicJournalAutomaticCaptureResponseSchema.parse({
    product: "SPY_ZERO_DTE_DETERMINISTIC_JOURNAL_AUTOMATIC_CAPTURE",
    methodologyVersion: "JOURNAL_SNAPSHOT_V3",
    calculatedAt: calculatedAt.toISOString(),
    engineState: "AVAILABLE",
    automaticCaptureState: "NO_CAPTURE",
    primaryReasonCode: "JOURNAL_AUTOMATIC_NO_ELIGIBLE_CANDIDATE",
    warningCode: null,
    entry: null,
    sourceCandidate: candidateSummary(candidate),
    disclosures: DISCLOSURES,
    methodology: AUTOMATIC_METHODOLOGY,
  });
}

export function buildAutomaticJournalUnavailableResponse(
  reason:
    | "SOURCE_ASSEMBLY_UNAVAILABLE"
    | "DATABASE_NOT_CONFIGURED"
    | "DATABASE_UNAVAILABLE",
  calculatedAt: Date,
  candidate: SpyZeroDteTradePlanAlertCandidateResponse | null = null,
): DeterministicJournalAutomaticCaptureResponse {
  return DeterministicJournalAutomaticCaptureResponseSchema.parse({
    product: "SPY_ZERO_DTE_DETERMINISTIC_JOURNAL_AUTOMATIC_CAPTURE",
    methodologyVersion: "JOURNAL_SNAPSHOT_V3",
    calculatedAt: calculatedAt.toISOString(),
    engineState: "UNAVAILABLE",
    automaticCaptureState: "UNAVAILABLE",
    primaryReasonCode: reason,
    warningCode: null,
    entry: null,
    sourceCandidate: candidate ? candidateSummary(candidate) : null,
    disclosures: DISCLOSURES,
    methodology: AUTOMATIC_METHODOLOGY,
  });
}

export function buildJournalOutcomeUpdatedResponse(
  row: DeterministicJournalSnapshotRow,
  calculatedAt: Date,
): DeterministicJournalOutcomeUpdateResponse {
  return DeterministicJournalOutcomeUpdateResponseSchema.parse({
    product: "SPY_ZERO_DTE_DETERMINISTIC_JOURNAL_OUTCOME",
    methodologyVersion: "JOURNAL_SNAPSHOT_V3",
    calculatedAt: calculatedAt.toISOString(),
    engineState: "AVAILABLE",
    primaryReasonCode: "JOURNAL_OUTCOME_UPDATED",
    entry: mapJournalRowToEntry(row),
    disclosures: DISCLOSURES,
  });
}

export function buildJournalOutcomeNotFoundResponse(
  calculatedAt: Date,
): DeterministicJournalOutcomeUpdateResponse {
  return DeterministicJournalOutcomeUpdateResponseSchema.parse({
    product: "SPY_ZERO_DTE_DETERMINISTIC_JOURNAL_OUTCOME",
    methodologyVersion: "JOURNAL_SNAPSHOT_V3",
    calculatedAt: calculatedAt.toISOString(),
    engineState: "AVAILABLE",
    primaryReasonCode: "JOURNAL_SNAPSHOT_NOT_FOUND",
    entry: null,
    disclosures: DISCLOSURES,
  });
}

export function buildJournalOutcomeUnavailableResponse(
  reason: "DATABASE_NOT_CONFIGURED" | "DATABASE_UNAVAILABLE",
  calculatedAt: Date,
): DeterministicJournalOutcomeUpdateResponse {
  return DeterministicJournalOutcomeUpdateResponseSchema.parse({
    product: "SPY_ZERO_DTE_DETERMINISTIC_JOURNAL_OUTCOME",
    methodologyVersion: "JOURNAL_SNAPSHOT_V3",
    calculatedAt: calculatedAt.toISOString(),
    engineState: "UNAVAILABLE",
    primaryReasonCode: reason,
    entry: null,
    disclosures: DISCLOSURES,
  });
}
