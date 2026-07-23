import {
  BackendAutomationDeliveryHistoryResponseSchema,
  BackendAutomationRunOnceResponseSchema,
  BackendAutomationSettingsResponseSchema,
  BackendAutomationStatusResponseSchema,
  type BackendAutomationCadenceSeconds,
  type BackendAutomationDeliveryCategory,
  type BackendAutomationDeliveryHistoryEntry,
  type BackendAutomationDeliveryHistoryResponse,
  type BackendAutomationDeliveryState,
  type BackendAutomationRunOnceResponse,
  type BackendAutomationSettingsResponse,
  type BackendAutomationSettingsUpdateRequest,
  type BackendAutomationStatusResponse,
  type BackendAutomationTaskStatus,
  type DeterministicScheduledReportType,
  type TradePlanAlertTransitionCandidateSummary,
} from "@spy-copilot/shared";
import {
  createEmptyTradePlanAlertTransitionMemoryState,
  type TradePlanAlertTransitionMemoryState,
} from "./trade-plan-alert-transition.logic";

export const BACKEND_AUTOMATION_METHODOLOGY_VERSION =
  "BACKEND_AUTOMATION_V1" as const;
export const BACKEND_AUTOMATION_RUNTIME_ID =
  "SPY_DISCORD_AUTOMATION" as const;
export const BACKEND_AUTOMATION_HISTORY_LIMIT = 50 as const;
export const BACKEND_AUTOMATION_HEARTBEAT_STALE_SECONDS = 45 as const;
export const BACKEND_AUTOMATION_LEASE_MILLISECONDS = 30_000;
export const BACKEND_AUTOMATION_LOOP_MILLISECONDS = 5_000;

export interface BackendAutomationSettingsRow {
  enabled: boolean;
  tradePlanAlertsEnabled: boolean;
  scheduledReportsEnabled: boolean;
  cadenceSeconds: BackendAutomationCadenceSeconds;
  updatedAt: Date | null;
}

export interface BackendAutomationRuntimeRow {
  leaseOwner: string | null;
  leaseExpiresAt: Date | null;
  lastHeartbeatAt: Date | null;
  lastTickAt: Date | null;
  lastTradePlanEvaluatedAt: Date | null;
  lastTradePlanOutcome: string | null;
  lastTradePlanReasonCode: string | null;
  lastScheduledEvaluatedAt: Date | null;
  lastScheduledOutcome: string | null;
  lastScheduledReasonCode: string | null;
  lastErrorCode: string | null;
  tradePlanTransitionState: unknown;
}

export interface BackendAutomationDeliveryLogRow {
  id: string;
  category: BackendAutomationDeliveryCategory;
  triggerMode: "BACKEND_SCHEDULER";
  deliveryKey: string | null;
  deliveryState: BackendAutomationDeliveryState;
  reasonCode: string;
  providerStatusCode: number | null;
  providerRequestAttempted: boolean;
  transitionType: string | null;
  reportType: DeterministicScheduledReportType | null;
  attemptedAt: Date;
}

export interface BackendAutomationTickResult {
  calculatedAt: Date;
  leaseAcquired: boolean;
  disabled: boolean;
  tradePlanAlerts: BackendAutomationTaskStatus;
  scheduledReports: BackendAutomationTaskStatus;
}

export const DEFAULT_BACKEND_AUTOMATION_SETTINGS: BackendAutomationSettingsRow = {
  enabled: false,
  tradePlanAlertsEnabled: true,
  scheduledReportsEnabled: true,
  cadenceSeconds: 30,
  updatedAt: null,
};

const SETTINGS_DISCLOSURES = {
  persistentSettings: true as const,
  backendScheduler: true as const,
  restartSafeConfiguration: true as const,
  databaseLeaseRequired: true as const,
  noWebhookSecretReturned: true as const,
  noProviderBodyReturned: true as const,
  noPrivateAccountData: true as const,
  noPositionSizing: true as const,
  noOrderExecution: true as const,
};

const STATUS_DISCLOSURES = {
  persistentSettings: true as const,
  persistentDuplicateProtection: true as const,
  persistentDeliveryAudit: true as const,
  multiProcessLeaseProtection: true as const,
  resumesAfterBackendRestartWhenEnabled: true as const,
  ambiguousProviderOutcomeSuppressed: true as const,
  noWebhookSecretReturned: true as const,
  noProviderBodyReturned: true as const,
  noPrivateAccountData: true as const,
  noPositionSizing: true as const,
  noOrderExecution: true as const,
};

const RUN_DISCLOSURES = {
  explicitRunOnly: true as const,
  honorsPersistedSettings: true as const,
  databaseLeaseRequired: true as const,
  persistentDuplicateProtection: true as const,
  noWebhookSecretReturned: true as const,
  noProviderBodyReturned: true as const,
  noPrivateAccountData: true as const,
  noPositionSizing: true as const,
  noOrderExecution: true as const,
};

function iso(value: Date | null): string | null {
  return value?.toISOString() ?? null;
}

function publicSettings(row: BackendAutomationSettingsRow) {
  return {
    enabled: row.enabled,
    tradePlanAlertsEnabled: row.tradePlanAlertsEnabled,
    scheduledReportsEnabled: row.scheduledReportsEnabled,
    cadenceSeconds: row.cadenceSeconds,
    updatedAt: iso(row.updatedAt),
  };
}

export function buildBackendAutomationSettingsResponse(
  row: BackendAutomationSettingsRow,
  calculatedAt: Date,
): BackendAutomationSettingsResponse {
  return BackendAutomationSettingsResponseSchema.parse({
    product: "SPY_PERSISTENT_BACKEND_AUTOMATION_SETTINGS",
    methodologyVersion: BACKEND_AUTOMATION_METHODOLOGY_VERSION,
    calculatedAt: calculatedAt.toISOString(),
    engineState: "AVAILABLE",
    primaryReasonCode: "BACKEND_AUTOMATION_SETTINGS_AVAILABLE",
    settings: publicSettings(row),
    disclosures: SETTINGS_DISCLOSURES,
  });
}

export function buildBackendAutomationSettingsUnavailableResponse(
  reason: "DATABASE_NOT_CONFIGURED" | "DATABASE_UNAVAILABLE",
  calculatedAt: Date,
): BackendAutomationSettingsResponse {
  return BackendAutomationSettingsResponseSchema.parse({
    product: "SPY_PERSISTENT_BACKEND_AUTOMATION_SETTINGS",
    methodologyVersion: BACKEND_AUTOMATION_METHODOLOGY_VERSION,
    calculatedAt: calculatedAt.toISOString(),
    engineState: "UNAVAILABLE",
    primaryReasonCode: reason,
    settings: null,
    disclosures: SETTINGS_DISCLOSURES,
  });
}

export function settingsRowFromUpdate(
  request: BackendAutomationSettingsUpdateRequest,
  updatedAt: Date,
): BackendAutomationSettingsRow {
  return {
    enabled: request.enabled,
    tradePlanAlertsEnabled: request.tradePlanAlertsEnabled,
    scheduledReportsEnabled: request.scheduledReportsEnabled,
    cadenceSeconds: request.cadenceSeconds,
    updatedAt,
  };
}

export function isAutomationTickDue(args: {
  now: Date;
  lastTickAt: Date | null;
  cadenceSeconds: BackendAutomationCadenceSeconds;
}): boolean {
  if (args.lastTickAt === null) return true;
  return (
    args.now.getTime() - args.lastTickAt.getTime() >=
    args.cadenceSeconds * 1_000
  );
}

export function isHeartbeatStale(
  lastHeartbeatAt: Date | null,
  now: Date,
): boolean {
  if (lastHeartbeatAt === null) return true;
  return (
    now.getTime() - lastHeartbeatAt.getTime() >
    BACKEND_AUTOMATION_HEARTBEAT_STALE_SECONDS * 1_000
  );
}

function taskStatus(args: {
  evaluatedAt: Date | null;
  outcome: string | null;
  reasonCode: string | null;
}): BackendAutomationTaskStatus {
  return {
    evaluatedAt: iso(args.evaluatedAt),
    outcome: args.outcome,
    reasonCode: args.reasonCode,
  };
}

export function buildBackendAutomationStatusResponse(args: {
  settings: BackendAutomationSettingsRow;
  runtime: BackendAutomationRuntimeRow | null;
  calculatedAt: Date;
  localLeaseOwner: string;
}): BackendAutomationStatusResponse {
  const runtime = args.runtime;
  const heartbeatStale = isHeartbeatStale(
    runtime?.lastHeartbeatAt ?? null,
    args.calculatedAt,
  );
  const leaseHeld =
    runtime?.leaseOwner === args.localLeaseOwner &&
    runtime.leaseExpiresAt !== null &&
    runtime.leaseExpiresAt.getTime() > args.calculatedAt.getTime();

  let runtimeState: BackendAutomationStatusResponse["runtimeState"];
  let primaryReasonCode: BackendAutomationStatusResponse["primaryReasonCode"];
  if (!args.settings.enabled) {
    runtimeState = "STOPPED";
    primaryReasonCode = "BACKEND_AUTOMATION_DISABLED";
  } else if (runtime === null || heartbeatStale) {
    runtimeState = "STALE";
    primaryReasonCode = "BACKEND_AUTOMATION_STALE";
  } else if (leaseHeld) {
    runtimeState = "ACTIVE";
    primaryReasonCode = "BACKEND_AUTOMATION_ACTIVE";
  } else {
    runtimeState = "STANDBY";
    primaryReasonCode = "BACKEND_AUTOMATION_STANDBY";
  }

  return BackendAutomationStatusResponseSchema.parse({
    product: "SPY_PERSISTENT_BACKEND_AUTOMATION_STATUS",
    methodologyVersion: BACKEND_AUTOMATION_METHODOLOGY_VERSION,
    calculatedAt: args.calculatedAt.toISOString(),
    engineState: "AVAILABLE",
    runtimeState,
    primaryReasonCode,
    settings: {
      enabled: args.settings.enabled,
      tradePlanAlertsEnabled: args.settings.tradePlanAlertsEnabled,
      scheduledReportsEnabled: args.settings.scheduledReportsEnabled,
      cadenceSeconds: args.settings.cadenceSeconds,
    },
    scheduler: {
      processSchedulerInstalled: true,
      databaseLeaseHeld: leaseHeld,
      leaseExpiresAt: iso(runtime?.leaseExpiresAt ?? null),
      lastHeartbeatAt: iso(runtime?.lastHeartbeatAt ?? null),
      lastTickAt: iso(runtime?.lastTickAt ?? null),
      heartbeatStaleAfterSeconds:
        BACKEND_AUTOMATION_HEARTBEAT_STALE_SECONDS,
    },
    tradePlanAlerts: taskStatus({
      evaluatedAt: runtime?.lastTradePlanEvaluatedAt ?? null,
      outcome: runtime?.lastTradePlanOutcome ?? null,
      reasonCode: runtime?.lastTradePlanReasonCode ?? null,
    }),
    scheduledReports: taskStatus({
      evaluatedAt: runtime?.lastScheduledEvaluatedAt ?? null,
      outcome: runtime?.lastScheduledOutcome ?? null,
      reasonCode: runtime?.lastScheduledReasonCode ?? null,
    }),
    lastErrorCode: runtime?.lastErrorCode ?? null,
    disclosures: STATUS_DISCLOSURES,
  });
}

export function buildBackendAutomationStatusUnavailableResponse(
  reason: "DATABASE_NOT_CONFIGURED" | "DATABASE_UNAVAILABLE",
  calculatedAt: Date,
): BackendAutomationStatusResponse {
  return BackendAutomationStatusResponseSchema.parse({
    product: "SPY_PERSISTENT_BACKEND_AUTOMATION_STATUS",
    methodologyVersion: BACKEND_AUTOMATION_METHODOLOGY_VERSION,
    calculatedAt: calculatedAt.toISOString(),
    engineState: "UNAVAILABLE",
    runtimeState: "UNAVAILABLE",
    primaryReasonCode: reason,
    settings: null,
    scheduler: {
      processSchedulerInstalled: true,
      databaseLeaseHeld: false,
      leaseExpiresAt: null,
      lastHeartbeatAt: null,
      lastTickAt: null,
      heartbeatStaleAfterSeconds:
        BACKEND_AUTOMATION_HEARTBEAT_STALE_SECONDS,
    },
    tradePlanAlerts: taskStatus({
      evaluatedAt: null,
      outcome: null,
      reasonCode: null,
    }),
    scheduledReports: taskStatus({
      evaluatedAt: null,
      outcome: null,
      reasonCode: null,
    }),
    lastErrorCode: null,
    disclosures: STATUS_DISCLOSURES,
  });
}

export function mapAutomationDeliveryLogRow(
  row: BackendAutomationDeliveryLogRow,
): BackendAutomationDeliveryHistoryEntry {
  return {
    id: row.id,
    category: row.category,
    triggerMode: row.triggerMode,
    deliveryKey: row.deliveryKey,
    deliveryState: row.deliveryState,
    reasonCode: row.reasonCode,
    providerStatusCode: row.providerStatusCode,
    providerRequestAttempted: row.providerRequestAttempted,
    transitionType: row.transitionType,
    reportType: row.reportType,
    attemptedAt: row.attemptedAt.toISOString(),
  };
}

export function buildBackendAutomationHistoryResponse(
  rows: BackendAutomationDeliveryLogRow[],
  calculatedAt: Date,
): BackendAutomationDeliveryHistoryResponse {
  const entries = rows
    .slice(0, BACKEND_AUTOMATION_HISTORY_LIMIT)
    .map(mapAutomationDeliveryLogRow);
  return BackendAutomationDeliveryHistoryResponseSchema.parse({
    product: "SPY_PERSISTENT_BACKEND_AUTOMATION_DELIVERY_HISTORY",
    methodologyVersion: BACKEND_AUTOMATION_METHODOLOGY_VERSION,
    calculatedAt: calculatedAt.toISOString(),
    engineState: "AVAILABLE",
    primaryReasonCode:
      entries.length === 0
        ? "BACKEND_AUTOMATION_HISTORY_EMPTY"
        : "BACKEND_AUTOMATION_HISTORY_AVAILABLE",
    maximumEntries: BACKEND_AUTOMATION_HISTORY_LIMIT,
    entries,
    disclosures: {
      persistentDeliveryAudit: true,
      newestFirst: true,
      payloadBodyExcluded: true,
      webhookSecretExcluded: true,
      providerBodyExcluded: true,
      noPrivateAccountData: true,
      noPositionSizing: true,
      noOrderExecution: true,
    },
  });
}

export function buildBackendAutomationHistoryUnavailableResponse(
  reason: "DATABASE_NOT_CONFIGURED" | "DATABASE_UNAVAILABLE",
  calculatedAt: Date,
): BackendAutomationDeliveryHistoryResponse {
  return BackendAutomationDeliveryHistoryResponseSchema.parse({
    product: "SPY_PERSISTENT_BACKEND_AUTOMATION_DELIVERY_HISTORY",
    methodologyVersion: BACKEND_AUTOMATION_METHODOLOGY_VERSION,
    calculatedAt: calculatedAt.toISOString(),
    engineState: "UNAVAILABLE",
    primaryReasonCode: reason,
    maximumEntries: BACKEND_AUTOMATION_HISTORY_LIMIT,
    entries: [],
    disclosures: {
      persistentDeliveryAudit: true,
      newestFirst: true,
      payloadBodyExcluded: true,
      webhookSecretExcluded: true,
      providerBodyExcluded: true,
      noPrivateAccountData: true,
      noPositionSizing: true,
      noOrderExecution: true,
    },
  });
}

export function buildBackendAutomationRunOnceResponse(args: {
  result: BackendAutomationTickResult;
}): BackendAutomationRunOnceResponse {
  let primaryReasonCode: BackendAutomationRunOnceResponse["primaryReasonCode"];
  if (args.result.disabled) {
    primaryReasonCode = "BACKEND_AUTOMATION_DISABLED";
  } else if (!args.result.leaseAcquired) {
    primaryReasonCode = "BACKEND_AUTOMATION_LEASE_NOT_ACQUIRED";
  } else {
    primaryReasonCode = "BACKEND_AUTOMATION_RUN_COMPLETED";
  }
  return BackendAutomationRunOnceResponseSchema.parse({
    product: "SPY_PERSISTENT_BACKEND_AUTOMATION_RUN",
    methodologyVersion: BACKEND_AUTOMATION_METHODOLOGY_VERSION,
    calculatedAt: args.result.calculatedAt.toISOString(),
    engineState: "AVAILABLE",
    primaryReasonCode,
    tradePlanAlerts: args.result.tradePlanAlerts,
    scheduledReports: args.result.scheduledReports,
    disclosures: RUN_DISCLOSURES,
  });
}

export function buildBackendAutomationRunOnceUnavailableResponse(
  reason: "DATABASE_NOT_CONFIGURED" | "DATABASE_UNAVAILABLE",
  calculatedAt: Date,
): BackendAutomationRunOnceResponse {
  return BackendAutomationRunOnceResponseSchema.parse({
    product: "SPY_PERSISTENT_BACKEND_AUTOMATION_RUN",
    methodologyVersion: BACKEND_AUTOMATION_METHODOLOGY_VERSION,
    calculatedAt: calculatedAt.toISOString(),
    engineState: "UNAVAILABLE",
    primaryReasonCode: reason,
    tradePlanAlerts: taskStatus({
      evaluatedAt: null,
      outcome: null,
      reasonCode: null,
    }),
    scheduledReports: taskStatus({
      evaluatedAt: null,
      outcome: null,
      reasonCode: null,
    }),
    disclosures: RUN_DISCLOSURES,
  });
}

function candidateSummary(value: unknown): TradePlanAlertTransitionCandidateSummary | null {
  if (typeof value !== "object" || value === null) return null;
  const raw = value as Record<string, unknown>;
  if (
    typeof raw.deduplicationKey !== "string" ||
    typeof raw.category !== "string" ||
    typeof raw.severity !== "string" ||
    typeof raw.direction !== "string"
  ) {
    return null;
  }
  if (!["PLAN_READY", "WAITING_FOR_TRIGGER", "NO_QUALIFIED_CONTRACT", "SETUP_NOT_QUALIFIED"].includes(raw.category)) {
    return null;
  }
  if (!["OPPORTUNITY", "INFO", "WARNING"].includes(raw.severity)) {
    return null;
  }
  if (!["CALLS", "PUTS", "NONE"].includes(raw.direction)) return null;
  return {
    deduplicationKey: raw.deduplicationKey,
    category: raw.category as TradePlanAlertTransitionCandidateSummary["category"],
    severity: raw.severity as TradePlanAlertTransitionCandidateSummary["severity"],
    direction: raw.direction as TradePlanAlertTransitionCandidateSummary["direction"],
  };
}

export function parsePersistentTradePlanTransitionState(
  value: unknown,
): TradePlanAlertTransitionMemoryState {
  if (typeof value !== "object" || value === null) {
    return createEmptyTradePlanAlertTransitionMemoryState();
  }
  const raw = value as Record<string, unknown>;
  const marketDate = typeof raw.marketDate === "string" ? raw.marketDate : null;
  const activeCandidate = candidateSummary(raw.activeCandidate);
  const lastClearedCandidate = candidateSummary(raw.lastClearedCandidate);
  const activeSinceMs =
    typeof raw.activeSinceMs === "number" && Number.isFinite(raw.activeSinceMs)
      ? raw.activeSinceMs
      : null;
  const lastClearedAtMs =
    typeof raw.lastClearedAtMs === "number" &&
    Number.isFinite(raw.lastClearedAtMs)
      ? raw.lastClearedAtMs
      : null;
  const consecutiveMissingCandidatePolls =
    typeof raw.consecutiveMissingCandidatePolls === "number" &&
    Number.isInteger(raw.consecutiveMissingCandidatePolls) &&
    raw.consecutiveMissingCandidatePolls >= 0
      ? raw.consecutiveMissingCandidatePolls
      : 0;
  const emittedTransitionFingerprints = Array.isArray(
    raw.emittedTransitionFingerprints,
  )
    ? raw.emittedTransitionFingerprints.filter(
        (item): item is string => typeof item === "string" && item.length > 0,
      ).slice(-100)
    : [];
  const activeEpisodeId =
    typeof raw.activeEpisodeId === "string" && raw.activeEpisodeId.length > 0
      ? raw.activeEpisodeId
      : null;
  const lastClearedEpisodeId =
    typeof raw.lastClearedEpisodeId === "string" &&
    raw.lastClearedEpisodeId.length > 0
      ? raw.lastClearedEpisodeId
      : null;
  const nextEpisodeSequence =
    typeof raw.nextEpisodeSequence === "number" &&
    Number.isInteger(raw.nextEpisodeSequence) &&
    raw.nextEpisodeSequence >= 0
      ? raw.nextEpisodeSequence
      : 0;
  return {
    marketDate,
    activeCandidate,
    activeSinceMs: activeCandidate ? activeSinceMs : null,
    lastClearedCandidate,
    lastClearedAtMs: lastClearedCandidate ? lastClearedAtMs : null,
    consecutiveMissingCandidatePolls,
    emittedTransitionFingerprints,
    activeEpisodeId: activeCandidate ? activeEpisodeId : null,
    lastClearedEpisodeId: lastClearedCandidate ? lastClearedEpisodeId : null,
    nextEpisodeSequence,
  };
}

export function isAmbiguousProviderReasonCode(reasonCode: string): boolean {
  return ["WEBHOOK_REQUEST_TIMEOUT", "WEBHOOK_NETWORK_FAILURE"].includes(
    reasonCode,
  );
}

export function scheduledReportDeliveryKey(
  easternDate: string,
  reportType: DeterministicScheduledReportType,
): string {
  return ["SPY", easternDate, reportType].join("|");
}
