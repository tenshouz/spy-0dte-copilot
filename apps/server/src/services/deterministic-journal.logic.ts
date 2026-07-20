import {
  DeterministicJournalCaptureResponseSchema,
  DeterministicJournalSnapshotEntrySchema,
  DeterministicJournalSnapshotListResponseSchema,
  type DeterministicJournalCaptureResponse,
  type DeterministicJournalSnapshotEntry,
  type DeterministicJournalSnapshotListResponse,
  type SpyZeroDteTradePlanAssemblyResponse,
} from "@spy-copilot/shared";

export interface DeterministicJournalSnapshotRow {
  id: string;
  currentMarketDate: string;
  sourceCalculatedAt: Date;
  capturedAt: Date;
  engineState: SpyZeroDteTradePlanAssemblyResponse["engineState"];
  planState: SpyZeroDteTradePlanAssemblyResponse["planState"];
  direction: SpyZeroDteTradePlanAssemblyResponse["direction"];
  confidenceScore: number | null;
  primaryReasonCode: SpyZeroDteTradePlanAssemblyResponse["primaryReasonCode"];
  warningCode: SpyZeroDteTradePlanAssemblyResponse["warningCode"];
  entryConditionState: SpyZeroDteTradePlanAssemblyResponse["entryCondition"]["state"];
  selectedContractSymbol: string | null;
}

const DISCLOSURES = {
  explicitCaptureOnly: true,
  currentSnapshotOnly: true,
  deterministicSourceOnly: true,
  databasePersistence: true,
  noAutomaticCapture: true,
  noPrivateAccountData: true,
  noPositionSizing: true,
  noOrderExecution: true,
} as const;

export function mapJournalRowToEntry(
  row: DeterministicJournalSnapshotRow,
): DeterministicJournalSnapshotEntry {
  return DeterministicJournalSnapshotEntrySchema.parse({
    id: row.id,
    symbol: "SPY",
    product: "SPY_ZERO_DTE_DETERMINISTIC_JOURNAL_SNAPSHOT",
    methodologyVersion: "JOURNAL_SNAPSHOT_V1",
    currentMarketDate: row.currentMarketDate,
    sourceCalculatedAt: row.sourceCalculatedAt.toISOString(),
    capturedAt: row.capturedAt.toISOString(),
    engineState: row.engineState,
    planState: row.planState,
    direction: row.direction,
    structuralConfidenceScore: row.confidenceScore,
    primaryReasonCode: row.primaryReasonCode,
    warningCode: row.warningCode,
    entryConditionState: row.entryConditionState,
    selectedContractSymbol: row.selectedContractSymbol,
  });
}

export function buildJournalListResponse(
  rows: readonly DeterministicJournalSnapshotRow[],
  calculatedAt: Date,
): DeterministicJournalSnapshotListResponse {
  const entries = rows.slice(0, 200).map(mapJournalRowToEntry);
  return DeterministicJournalSnapshotListResponseSchema.parse({
    product: "SPY_ZERO_DTE_DETERMINISTIC_JOURNAL",
    methodologyVersion: "JOURNAL_SNAPSHOT_V1",
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
    methodologyVersion: "JOURNAL_SNAPSHOT_V1",
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
  const warningCode =
    assembly.engineState === "PARTIAL"
      ? "SOURCE_ASSEMBLY_PARTIAL"
      : assembly.warningCode !== null
        ? "SOURCE_ASSEMBLY_WARNING"
        : null;

  return DeterministicJournalCaptureResponseSchema.parse({
    product: "SPY_ZERO_DTE_DETERMINISTIC_JOURNAL_CAPTURE",
    methodologyVersion: "JOURNAL_SNAPSHOT_V1",
    calculatedAt: calculatedAt.toISOString(),
    engineState: "AVAILABLE",
    primaryReasonCode: "JOURNAL_SNAPSHOT_CAPTURED",
    warningCode,
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
    methodologyVersion: "JOURNAL_SNAPSHOT_V1",
    calculatedAt: calculatedAt.toISOString(),
    engineState: "UNAVAILABLE",
    primaryReasonCode: reason,
    warningCode: null,
    entry: null,
    disclosures: DISCLOSURES,
  });
}
