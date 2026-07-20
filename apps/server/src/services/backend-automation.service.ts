import { randomUUID } from "node:crypto";
import {
  SpyZeroDteScheduledReportScheduleEvaluationResponseSchema,
  SpyZeroDteTradePlanAlertCandidateResponseSchema,
  type BackendAutomationDeliveryCategory,
  type BackendAutomationDeliveryHistoryResponse,
  type BackendAutomationDeliveryState,
  type BackendAutomationRunOnceResponse,
  type BackendAutomationSettingsResponse,
  type BackendAutomationSettingsUpdateRequest,
  type BackendAutomationStatusResponse,
  type BackendAutomationTaskStatus,
  type DeterministicScheduledReportType,
  type DiscordScheduledReportDeliveryResponse,
  type SpyZeroDteTradePlanAlertTransitionResponse,
} from "@spy-copilot/shared";
import { hasDatabaseUrl } from "../config/env";
import { isDatabaseReachable } from "../lib/db-status";
import {
  BACKEND_AUTOMATION_HISTORY_LIMIT,
  BACKEND_AUTOMATION_LEASE_MILLISECONDS,
  BACKEND_AUTOMATION_LOOP_MILLISECONDS,
  BACKEND_AUTOMATION_RUNTIME_ID,
  DEFAULT_BACKEND_AUTOMATION_SETTINGS,
  buildBackendAutomationHistoryResponse,
  buildBackendAutomationHistoryUnavailableResponse,
  buildBackendAutomationRunOnceResponse,
  buildBackendAutomationRunOnceUnavailableResponse,
  buildBackendAutomationSettingsResponse,
  buildBackendAutomationSettingsUnavailableResponse,
  buildBackendAutomationStatusResponse,
  buildBackendAutomationStatusUnavailableResponse,
  isAmbiguousProviderReasonCode,
  isAutomationTickDue,
  parsePersistentTradePlanTransitionState,
  scheduledReportDeliveryKey,
  settingsRowFromUpdate,
  type BackendAutomationDeliveryLogRow,
  type BackendAutomationRuntimeRow,
  type BackendAutomationSettingsRow,
  type BackendAutomationTickResult,
} from "./backend-automation.logic";
import {
  buildDiscordTradePlanAlertPayload,
  mapDiscordTradePlanAlertProviderFailure,
} from "./discord-trade-plan-alert.logic";
import { sendDiscordScheduledReport } from "./discord-scheduled-report.service";
import {
  getDiscordWebhookConfig,
  type DiscordWebhookConfig,
} from "./discord-webhook.logic";
import { getSpyZeroDteScheduledReportSchedule } from "./scheduled-report-schedule.service";
import { getSpyZeroDteTradePlanAlertCandidate } from "./trade-plan-alert-candidate.service";
import {
  TRADE_PLAN_ALERT_REAPPEARANCE_COOLDOWN_MS,
  buildUnavailableSpyZeroDteTradePlanAlertTransition,
  createEmptyTradePlanAlertTransitionMemoryState,
  evaluateSpyZeroDteTradePlanAlertTransition,
  type TradePlanAlertTransitionMemoryState,
} from "./trade-plan-alert-transition.logic";
import { getObservedMarketDate } from "./session-data.logic";

const DEFAULT_USER_EMAIL = process.env.SCHWAB_DEFAULT_USER_EMAIL ?? "trader@local";
const DEFAULT_PROVIDER_TIMEOUT_MS = 10_000;
const localLeaseOwner = `backend-${randomUUID()}`;

interface PrismaRawClient {
  $queryRaw<T>(query: TemplateStringsArray, ...values: unknown[]): Promise<T>;
  $executeRaw(query: TemplateStringsArray, ...values: unknown[]): Promise<number>;
}

async function getRawPrisma(): Promise<PrismaRawClient> {
  const { prisma } = await import("../lib/prisma");
  return prisma as unknown as PrismaRawClient;
}

export interface DeliveryLogInsert {
  category: BackendAutomationDeliveryCategory;
  deliveryKey: string | null;
  deliveryState: BackendAutomationDeliveryState;
  reasonCode: string;
  providerStatusCode: number | null;
  providerRequestAttempted: boolean;
  transitionType: string | null;
  reportType: DeterministicScheduledReportType | null;
  attemptedAt: Date;
  details: Record<string, unknown>;
}

export interface BackendAutomationRepository {
  getOrCreateSettings(userId: string): Promise<BackendAutomationSettingsRow>;
  updateSettings(
    userId: string,
    row: BackendAutomationSettingsRow,
  ): Promise<BackendAutomationSettingsRow>;
  getOrCreateRuntime(userId: string): Promise<BackendAutomationRuntimeRow>;
  acquireLease(args: {
    userId: string;
    owner: string;
    now: Date;
    expiresAt: Date;
  }): Promise<BackendAutomationRuntimeRow | null>;
  renewLease(args: {
    userId: string;
    owner: string;
    now: Date;
    expiresAt: Date;
  }): Promise<void>;
  releaseLease(userId: string, owner: string): Promise<void>;
  updateTick(userId: string, owner: string, tickAt: Date): Promise<void>;
  updateTradePlanStatus(args: {
    userId: string;
    owner: string;
    evaluatedAt: Date;
    outcome: string;
    reasonCode: string;
    transitionState?: TradePlanAlertTransitionMemoryState;
    errorCode?: string | null;
  }): Promise<void>;
  updateScheduledStatus(args: {
    userId: string;
    owner: string;
    evaluatedAt: Date;
    outcome: string;
    reasonCode: string;
    errorCode?: string | null;
  }): Promise<void>;
  hasDeliveryKey(
    userId: string,
    category: BackendAutomationDeliveryCategory,
    deliveryKey: string,
  ): Promise<"DELIVERED" | "AMBIGUOUS" | null>;
  commitDeliveryKey(args: {
    userId: string;
    category: BackendAutomationDeliveryCategory;
    deliveryKey: string;
    commitment: "DELIVERED" | "AMBIGUOUS";
    committedAt: Date;
  }): Promise<void>;
  insertDeliveryLog(userId: string, entry: DeliveryLogInsert): Promise<void>;
  listDeliveryLogs(
    userId: string,
    limit: number,
  ): Promise<BackendAutomationDeliveryLogRow[]>;
}

export interface BackendAutomationDependencies {
  databaseConfigured: () => boolean;
  databaseReachable: () => Promise<boolean>;
  getUserId: () => Promise<string>;
  repository: BackendAutomationRepository;
  getWebhookConfig: () => DiscordWebhookConfig;
  getCandidate: () => Promise<unknown>;
  getSchedule: () => unknown;
  sendScheduledReport: (request: {
    reportType: DeterministicScheduledReportType;
  }) => Promise<DiscordScheduledReportDeliveryResponse>;
  fetch: typeof fetch;
  now: () => Date;
  providerTimeoutMs: number;
  getMarketDate: (nowMs: number) => string;
  log: (category: string) => void;
}

interface RawSettingsRow {
  backendAutomationEnabled: boolean;
  backendTradePlanAlertsEnabled: boolean;
  backendScheduledReportsEnabled: boolean;
  backendAutomationCadenceSeconds: number;
  updatedAt: Date;
}

interface RawRuntimeRow extends BackendAutomationRuntimeRow {}

interface RawDeliveryLogRow {
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

function settingsFromRaw(row: RawSettingsRow): BackendAutomationSettingsRow {
  const cadence = [15, 30, 60].includes(row.backendAutomationCadenceSeconds)
    ? (row.backendAutomationCadenceSeconds as 15 | 30 | 60)
    : 30;
  return {
    enabled: row.backendAutomationEnabled,
    tradePlanAlertsEnabled: row.backendTradePlanAlertsEnabled,
    scheduledReportsEnabled: row.backendScheduledReportsEnabled,
    cadenceSeconds: cadence,
    updatedAt: row.updatedAt,
  };
}

const prismaRepository: BackendAutomationRepository = {
  async getOrCreateSettings(userId) {
    const raw = await getRawPrisma();
    const id = randomUUID();
    await raw.$executeRaw`
      INSERT INTO "Settings" (
        "id", "userId", "alertPreferences", "scoringRulesVersion",
        "backendAutomationEnabled", "backendTradePlanAlertsEnabled",
        "backendScheduledReportsEnabled", "backendAutomationCadenceSeconds",
        "updatedAt"
      ) VALUES (
        ${id}, ${userId}, ${JSON.stringify({})}::jsonb, ${"v1"},
        ${false}, ${true}, ${true}, ${30}, ${new Date()}
      )
      ON CONFLICT ("userId") DO NOTHING
    `;
    const rows = await raw.$queryRaw<RawSettingsRow[]>`
      SELECT
        "backendAutomationEnabled", "backendTradePlanAlertsEnabled",
        "backendScheduledReportsEnabled", "backendAutomationCadenceSeconds",
        "updatedAt"
      FROM "Settings"
      WHERE "userId" = ${userId}
      LIMIT 1
    `;
    if (!rows[0]) throw new Error("backend automation settings row missing");
    return settingsFromRaw(rows[0]);
  },

  async updateSettings(userId, row) {
    const raw = await getRawPrisma();
    const rows = await raw.$queryRaw<RawSettingsRow[]>`
      UPDATE "Settings"
      SET
        "backendAutomationEnabled" = ${row.enabled},
        "backendTradePlanAlertsEnabled" = ${row.tradePlanAlertsEnabled},
        "backendScheduledReportsEnabled" = ${row.scheduledReportsEnabled},
        "backendAutomationCadenceSeconds" = ${row.cadenceSeconds},
        "updatedAt" = ${row.updatedAt ?? new Date()}
      WHERE "userId" = ${userId}
      RETURNING
        "backendAutomationEnabled", "backendTradePlanAlertsEnabled",
        "backendScheduledReportsEnabled", "backendAutomationCadenceSeconds",
        "updatedAt"
    `;
    if (!rows[0]) throw new Error("backend automation settings update missing");
    return settingsFromRaw(rows[0]);
  },

  async getOrCreateRuntime(userId) {
    const raw = await getRawPrisma();
    const id = `${BACKEND_AUTOMATION_RUNTIME_ID}:${userId}`;
    const initialState = JSON.stringify(
      createEmptyTradePlanAlertTransitionMemoryState(),
    );
    await raw.$executeRaw`
      INSERT INTO "BackendAutomationRuntime" (
        "id", "userId", "tradePlanTransitionState", "updatedAt"
      ) VALUES (
        ${id}, ${userId}, ${initialState}::jsonb, ${new Date()}
      )
      ON CONFLICT ("userId") DO NOTHING
    `;
    const rows = await raw.$queryRaw<RawRuntimeRow[]>`
      SELECT
        "leaseOwner", "leaseExpiresAt", "lastHeartbeatAt", "lastTickAt",
        "lastTradePlanEvaluatedAt", "lastTradePlanOutcome",
        "lastTradePlanReasonCode", "lastScheduledEvaluatedAt",
        "lastScheduledOutcome", "lastScheduledReasonCode", "lastErrorCode",
        "tradePlanTransitionState"
      FROM "BackendAutomationRuntime"
      WHERE "userId" = ${userId}
      LIMIT 1
    `;
    if (!rows[0]) throw new Error("backend automation runtime row missing");
    return rows[0];
  },

  async acquireLease({ userId, owner, now, expiresAt }) {
    await this.getOrCreateRuntime(userId);
    const raw = await getRawPrisma();
    const rows = await raw.$queryRaw<RawRuntimeRow[]>`
      UPDATE "BackendAutomationRuntime"
      SET
        "leaseOwner" = ${owner},
        "leaseExpiresAt" = ${expiresAt},
        "lastHeartbeatAt" = ${now},
        "updatedAt" = ${now}
      WHERE "userId" = ${userId}
        AND (
          "leaseOwner" = ${owner}
          OR "leaseExpiresAt" IS NULL
          OR "leaseExpiresAt" < ${now}
        )
      RETURNING
        "leaseOwner", "leaseExpiresAt", "lastHeartbeatAt", "lastTickAt",
        "lastTradePlanEvaluatedAt", "lastTradePlanOutcome",
        "lastTradePlanReasonCode", "lastScheduledEvaluatedAt",
        "lastScheduledOutcome", "lastScheduledReasonCode", "lastErrorCode",
        "tradePlanTransitionState"
    `;
    return rows[0] ?? null;
  },

  async renewLease({ userId, owner, now, expiresAt }) {
    const raw = await getRawPrisma();
    await raw.$executeRaw`
      UPDATE "BackendAutomationRuntime"
      SET
        "leaseExpiresAt" = ${expiresAt},
        "lastHeartbeatAt" = ${now},
        "updatedAt" = ${now}
      WHERE "userId" = ${userId} AND "leaseOwner" = ${owner}
    `;
  },

  async releaseLease(userId, owner) {
    const raw = await getRawPrisma();
    await raw.$executeRaw`
      UPDATE "BackendAutomationRuntime"
      SET "leaseOwner" = NULL, "leaseExpiresAt" = NULL, "updatedAt" = ${new Date()}
      WHERE "userId" = ${userId} AND "leaseOwner" = ${owner}
    `;
  },

  async updateTick(userId, owner, tickAt) {
    const raw = await getRawPrisma();
    await raw.$executeRaw`
      UPDATE "BackendAutomationRuntime"
      SET
        "lastTickAt" = ${tickAt},
        "lastHeartbeatAt" = ${tickAt},
        "lastErrorCode" = NULL,
        "updatedAt" = ${tickAt}
      WHERE "userId" = ${userId} AND "leaseOwner" = ${owner}
    `;
  },

  async updateTradePlanStatus(args) {
    const raw = await getRawPrisma();
    const stateJson = args.transitionState
      ? JSON.stringify(args.transitionState)
      : null;
    if (stateJson === null) {
      await raw.$executeRaw`
        UPDATE "BackendAutomationRuntime"
        SET
          "lastTradePlanEvaluatedAt" = ${args.evaluatedAt},
          "lastTradePlanOutcome" = ${args.outcome},
          "lastTradePlanReasonCode" = ${args.reasonCode},
          "lastErrorCode" = ${args.errorCode ?? null},
          "updatedAt" = ${args.evaluatedAt}
        WHERE "userId" = ${args.userId} AND "leaseOwner" = ${args.owner}
      `;
    } else {
      await raw.$executeRaw`
        UPDATE "BackendAutomationRuntime"
        SET
          "lastTradePlanEvaluatedAt" = ${args.evaluatedAt},
          "lastTradePlanOutcome" = ${args.outcome},
          "lastTradePlanReasonCode" = ${args.reasonCode},
          "tradePlanTransitionState" = ${stateJson}::jsonb,
          "lastErrorCode" = ${args.errorCode ?? null},
          "updatedAt" = ${args.evaluatedAt}
        WHERE "userId" = ${args.userId} AND "leaseOwner" = ${args.owner}
      `;
    }
  },

  async updateScheduledStatus(args) {
    const raw = await getRawPrisma();
    await raw.$executeRaw`
      UPDATE "BackendAutomationRuntime"
      SET
        "lastScheduledEvaluatedAt" = ${args.evaluatedAt},
        "lastScheduledOutcome" = ${args.outcome},
        "lastScheduledReasonCode" = ${args.reasonCode},
        "lastErrorCode" = ${args.errorCode ?? null},
        "updatedAt" = ${args.evaluatedAt}
      WHERE "userId" = ${args.userId} AND "leaseOwner" = ${args.owner}
    `;
  },

  async hasDeliveryKey(userId, category, deliveryKey) {
    const raw = await getRawPrisma();
    const rows = await raw.$queryRaw<Array<{ commitment: string }>>`
      SELECT "commitment"
      FROM "BackendAutomationDeliveryKey"
      WHERE
        "userId" = ${userId}
        AND "category" = ${category}
        AND "deliveryKey" = ${deliveryKey}
      LIMIT 1
    `;
    const value = rows[0]?.commitment;
    return value === "DELIVERED" || value === "AMBIGUOUS" ? value : null;
  },

  async commitDeliveryKey(args) {
    const raw = await getRawPrisma();
    const id = randomUUID();
    await raw.$executeRaw`
      INSERT INTO "BackendAutomationDeliveryKey" (
        "id", "userId", "category", "deliveryKey", "commitment", "committedAt"
      ) VALUES (
        ${id}, ${args.userId}, ${args.category}, ${args.deliveryKey},
        ${args.commitment}, ${args.committedAt}
      )
      ON CONFLICT ("userId", "category", "deliveryKey") DO NOTHING
    `;
  },

  async insertDeliveryLog(userId, entry) {
    const raw = await getRawPrisma();
    const id = randomUUID();
    await raw.$executeRaw`
      INSERT INTO "BackendAutomationDeliveryLog" (
        "id", "userId", "category", "triggerMode", "deliveryKey",
        "deliveryState", "reasonCode", "providerStatusCode",
        "providerRequestAttempted", "transitionType", "reportType",
        "attemptedAt", "details"
      ) VALUES (
        ${id}, ${userId}, ${entry.category}, ${"BACKEND_SCHEDULER"},
        ${entry.deliveryKey}, ${entry.deliveryState}, ${entry.reasonCode},
        ${entry.providerStatusCode}, ${entry.providerRequestAttempted},
        ${entry.transitionType}, ${entry.reportType}, ${entry.attemptedAt},
        ${JSON.stringify(entry.details)}::jsonb
      )
    `;
  },

  async listDeliveryLogs(userId, limit) {
    const raw = await getRawPrisma();
    const rows = await raw.$queryRaw<RawDeliveryLogRow[]>`
      SELECT
        "id", "category", "triggerMode", "deliveryKey", "deliveryState",
        "reasonCode", "providerStatusCode", "providerRequestAttempted",
        "transitionType", "reportType", "attemptedAt"
      FROM "BackendAutomationDeliveryLog"
      WHERE "userId" = ${userId}
      ORDER BY "attemptedAt" DESC
      LIMIT ${limit}
    `;
    return rows;
  },
};

const defaultDependencies: BackendAutomationDependencies = {
  databaseConfigured: () => hasDatabaseUrl,
  databaseReachable: isDatabaseReachable,
  getUserId: async () => {
    const { prisma } = await import("../lib/prisma");
    const user = await prisma.user.upsert({
      where: { email: DEFAULT_USER_EMAIL },
      update: {},
      create: { email: DEFAULT_USER_EMAIL },
      select: { id: true },
    });
    return user.id;
  },
  repository: prismaRepository,
  getWebhookConfig: getDiscordWebhookConfig,
  getCandidate: getSpyZeroDteTradePlanAlertCandidate,
  getSchedule: getSpyZeroDteScheduledReportSchedule,
  sendScheduledReport: sendDiscordScheduledReport,
  fetch: globalThis.fetch,
  now: () => new Date(),
  providerTimeoutMs: DEFAULT_PROVIDER_TIMEOUT_MS,
  getMarketDate: getObservedMarketDate,
  log: (category) => {
    // Fixed categories only. Never log provider bodies, webhook secrets, or
    // deterministic report/alert payloads.
    // eslint-disable-next-line no-console
    console.error(`[backend-automation] ${category}`);
  },
};

function emptyTaskStatus(): BackendAutomationTaskStatus {
  return { evaluatedAt: null, outcome: null, reasonCode: null };
}

function taskStatus(
  at: Date,
  outcome: string,
  reasonCode: string,
): BackendAutomationTaskStatus {
  return { evaluatedAt: at.toISOString(), outcome, reasonCode };
}

interface ProviderResult {
  deliveryState: BackendAutomationDeliveryState;
  reasonCode: string;
  providerStatusCode: number | null;
  providerRequestAttempted: boolean;
  ambiguous: boolean;
}

async function deliverTradePlanTransition(args: {
  transition: SpyZeroDteTradePlanAlertTransitionResponse;
  config: Extract<DiscordWebhookConfig, { status: "valid" }>;
  dependencies: BackendAutomationDependencies;
}): Promise<ProviderResult> {
  const controller = new AbortController();
  const timeout = setTimeout(
    () => controller.abort(),
    args.dependencies.providerTimeoutMs,
  );
  try {
    const response = await args.dependencies.fetch(
      `${args.config.webhookUrl}?wait=true`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(
          buildDiscordTradePlanAlertPayload(args.transition),
        ),
        signal: controller.signal,
      },
    );
    if (response.ok) {
      return {
        deliveryState: "DELIVERED",
        reasonCode: "ALERT_DELIVERED",
        providerStatusCode: response.status,
        providerRequestAttempted: true,
        ambiguous: false,
      };
    }
    const reasonCode = mapDiscordTradePlanAlertProviderFailure(response.status);
    return {
      deliveryState: "FAILED",
      reasonCode,
      providerStatusCode: response.status,
      providerRequestAttempted: true,
      ambiguous: false,
    };
  } catch (error) {
    const reasonCode =
      error instanceof Error && error.name === "AbortError"
        ? "WEBHOOK_REQUEST_TIMEOUT"
        : "WEBHOOK_NETWORK_FAILURE";
    return {
      deliveryState: "AMBIGUOUS",
      reasonCode,
      providerStatusCode: null,
      providerRequestAttempted: true,
      ambiguous: true,
    };
  } finally {
    clearTimeout(timeout);
  }
}

async function evaluateTradePlanTask(args: {
  userId: string;
  runtime: BackendAutomationRuntimeRow;
  evaluatedAt: Date;
  owner: string;
  dependencies: BackendAutomationDependencies;
}): Promise<BackendAutomationTaskStatus> {
  const config = args.dependencies.getWebhookConfig();
  if (config.status === "missing") {
    await args.dependencies.repository.updateTradePlanStatus({
      userId: args.userId,
      owner: args.owner,
      evaluatedAt: args.evaluatedAt,
      outcome: "NO_DELIVERY",
      reasonCode: "WEBHOOK_NOT_CONFIGURED",
    });
    return taskStatus(args.evaluatedAt, "NO_DELIVERY", "WEBHOOK_NOT_CONFIGURED");
  }
  if (config.status === "invalid") {
    await args.dependencies.repository.updateTradePlanStatus({
      userId: args.userId,
      owner: args.owner,
      evaluatedAt: args.evaluatedAt,
      outcome: "NO_DELIVERY",
      reasonCode: "WEBHOOK_CONFIG_INVALID",
    });
    return taskStatus(args.evaluatedAt, "NO_DELIVERY", "WEBHOOK_CONFIG_INVALID");
  }

  const previousState = parsePersistentTradePlanTransitionState(
    args.runtime.tradePlanTransitionState,
  );
  let rawCandidate: unknown;
  try {
    rawCandidate = await args.dependencies.getCandidate();
  } catch {
    const transition = buildUnavailableSpyZeroDteTradePlanAlertTransition(
      args.dependencies.getMarketDate(args.evaluatedAt.getTime()),
      args.evaluatedAt.getTime(),
      previousState,
      "SOURCE_CANDIDATE_SERVICE_FAILURE",
      TRADE_PLAN_ALERT_REAPPEARANCE_COOLDOWN_MS,
    ).response;
    await args.dependencies.repository.updateTradePlanStatus({
      userId: args.userId,
      owner: args.owner,
      evaluatedAt: args.evaluatedAt,
      outcome: "UNAVAILABLE",
      reasonCode: transition.primaryReasonCode,
      errorCode: "SOURCE_CANDIDATE_SERVICE_FAILURE",
    });
    return taskStatus(
      args.evaluatedAt,
      "UNAVAILABLE",
      transition.primaryReasonCode,
    );
  }

  const candidate = SpyZeroDteTradePlanAlertCandidateResponseSchema.safeParse(
    rawCandidate,
  );
  if (!candidate.success) {
    const transition = buildUnavailableSpyZeroDteTradePlanAlertTransition(
      args.dependencies.getMarketDate(args.evaluatedAt.getTime()),
      args.evaluatedAt.getTime(),
      previousState,
      "SOURCE_CANDIDATE_INCONSISTENT",
      TRADE_PLAN_ALERT_REAPPEARANCE_COOLDOWN_MS,
    ).response;
    await args.dependencies.repository.updateTradePlanStatus({
      userId: args.userId,
      owner: args.owner,
      evaluatedAt: args.evaluatedAt,
      outcome: "UNAVAILABLE",
      reasonCode: transition.primaryReasonCode,
      errorCode: "SOURCE_CANDIDATE_INCONSISTENT",
    });
    return taskStatus(
      args.evaluatedAt,
      "UNAVAILABLE",
      transition.primaryReasonCode,
    );
  }

  const evaluation = evaluateSpyZeroDteTradePlanAlertTransition(
    candidate.data,
    previousState,
    args.evaluatedAt.getTime(),
    TRADE_PLAN_ALERT_REAPPEARANCE_COOLDOWN_MS,
  );
  const transition = evaluation.response;

  if (transition.transitionState === "UNAVAILABLE") {
    await args.dependencies.repository.updateTradePlanStatus({
      userId: args.userId,
      owner: args.owner,
      evaluatedAt: args.evaluatedAt,
      outcome: "UNAVAILABLE",
      reasonCode: transition.primaryReasonCode,
    });
    return taskStatus(
      args.evaluatedAt,
      "UNAVAILABLE",
      transition.primaryReasonCode,
    );
  }

  if (transition.transitionState === "SUPPRESSED") {
    await args.dependencies.repository.updateTradePlanStatus({
      userId: args.userId,
      owner: args.owner,
      evaluatedAt: args.evaluatedAt,
      outcome: "NO_DELIVERY",
      reasonCode: transition.primaryReasonCode,
      transitionState: transition.state.mutationApplied
        ? evaluation.nextState
        : undefined,
    });
    return taskStatus(
      args.evaluatedAt,
      "NO_DELIVERY",
      transition.primaryReasonCode,
    );
  }

  const event = transition.event;
  if (event === null) throw new Error("emitted transition missing event");
  const deliveryKey = event.transitionFingerprint;
  const existingCommitment =
    await args.dependencies.repository.hasDeliveryKey(
      args.userId,
      "TRADE_PLAN_ALERT",
      deliveryKey,
    );
  if (existingCommitment !== null) {
    await args.dependencies.repository.updateTradePlanStatus({
      userId: args.userId,
      owner: args.owner,
      evaluatedAt: args.evaluatedAt,
      outcome: "SUPPRESSED",
      reasonCode:
        existingCommitment === "DELIVERED"
          ? "PERSISTED_DUPLICATE_SUPPRESSED"
          : "PERSISTED_AMBIGUOUS_OUTCOME_SUPPRESSED",
      transitionState:
        existingCommitment === "DELIVERED" ? evaluation.nextState : undefined,
    });
    return taskStatus(
      args.evaluatedAt,
      "SUPPRESSED",
      existingCommitment === "DELIVERED"
        ? "PERSISTED_DUPLICATE_SUPPRESSED"
        : "PERSISTED_AMBIGUOUS_OUTCOME_SUPPRESSED",
    );
  }

  const provider = await deliverTradePlanTransition({
    transition,
    config,
    dependencies: args.dependencies,
  });
  if (provider.deliveryState === "DELIVERED") {
    await args.dependencies.repository.commitDeliveryKey({
      userId: args.userId,
      category: "TRADE_PLAN_ALERT",
      deliveryKey,
      commitment: "DELIVERED",
      committedAt: args.evaluatedAt,
    });
  } else if (provider.ambiguous) {
    await args.dependencies.repository.commitDeliveryKey({
      userId: args.userId,
      category: "TRADE_PLAN_ALERT",
      deliveryKey,
      commitment: "AMBIGUOUS",
      committedAt: args.evaluatedAt,
    });
  }
  await args.dependencies.repository.insertDeliveryLog(args.userId, {
    category: "TRADE_PLAN_ALERT",
    deliveryKey,
    deliveryState: provider.deliveryState,
    reasonCode: provider.reasonCode,
    providerStatusCode: provider.providerStatusCode,
    providerRequestAttempted: provider.providerRequestAttempted,
    transitionType: event.transitionType,
    reportType: null,
    attemptedAt: args.evaluatedAt,
    details: {
      severity: event.severity,
      direction:
        event.currentCandidate?.direction ??
        event.previousCandidate?.direction ??
        "NONE",
    },
  });
  await args.dependencies.repository.updateTradePlanStatus({
    userId: args.userId,
    owner: args.owner,
    evaluatedAt: args.evaluatedAt,
    outcome: provider.deliveryState,
    reasonCode: provider.reasonCode,
    transitionState:
      provider.deliveryState === "DELIVERED"
        ? evaluation.nextState
        : undefined,
  });
  return taskStatus(
    args.evaluatedAt,
    provider.deliveryState,
    provider.reasonCode,
  );
}

async function evaluateScheduledReportTask(args: {
  userId: string;
  evaluatedAt: Date;
  owner: string;
  dependencies: BackendAutomationDependencies;
}): Promise<BackendAutomationTaskStatus> {
  const parsed = SpyZeroDteScheduledReportScheduleEvaluationResponseSchema.safeParse(
    args.dependencies.getSchedule(),
  );
  if (!parsed.success || parsed.data.scheduleState === "UNAVAILABLE") {
    const reason = parsed.success
      ? parsed.data.primaryReasonCode
      : "SCHEDULE_INCONSISTENT";
    await args.dependencies.repository.updateScheduledStatus({
      userId: args.userId,
      owner: args.owner,
      evaluatedAt: args.evaluatedAt,
      outcome: "UNAVAILABLE",
      reasonCode: reason,
      errorCode: parsed.success ? null : "SCHEDULE_INCONSISTENT",
    });
    return taskStatus(args.evaluatedAt, "UNAVAILABLE", reason);
  }
  const schedule = parsed.data;
  if (schedule.scheduleState !== "DUE" || schedule.dueReportType === null) {
    await args.dependencies.repository.updateScheduledStatus({
      userId: args.userId,
      owner: args.owner,
      evaluatedAt: args.evaluatedAt,
      outcome: "NO_DELIVERY",
      reasonCode: schedule.primaryReasonCode,
    });
    return taskStatus(
      args.evaluatedAt,
      "NO_DELIVERY",
      schedule.primaryReasonCode,
    );
  }

  const deliveryKey = scheduledReportDeliveryKey(
    schedule.easternDate,
    schedule.dueReportType,
  );
  const existingCommitment =
    await args.dependencies.repository.hasDeliveryKey(
      args.userId,
      "SCHEDULED_REPORT",
      deliveryKey,
    );
  if (existingCommitment !== null) {
    const reason =
      existingCommitment === "DELIVERED"
        ? "PERSISTED_DUPLICATE_SUPPRESSED"
        : "PERSISTED_AMBIGUOUS_OUTCOME_SUPPRESSED";
    await args.dependencies.repository.updateScheduledStatus({
      userId: args.userId,
      owner: args.owner,
      evaluatedAt: args.evaluatedAt,
      outcome: "SUPPRESSED",
      reasonCode: reason,
    });
    return taskStatus(args.evaluatedAt, "SUPPRESSED", reason);
  }

  const delivery = await args.dependencies.sendScheduledReport({
    reportType: schedule.dueReportType,
  });
  const ambiguous = isAmbiguousProviderReasonCode(delivery.primaryReasonCode);
  let state: BackendAutomationDeliveryState;
  if (delivery.deliveryState === "DELIVERED") {
    state = "DELIVERED";
    await args.dependencies.repository.commitDeliveryKey({
      userId: args.userId,
      category: "SCHEDULED_REPORT",
      deliveryKey,
      commitment: "DELIVERED",
      committedAt: args.evaluatedAt,
    });
  } else if (delivery.providerRequestAttempted && ambiguous) {
    state = "AMBIGUOUS";
    await args.dependencies.repository.commitDeliveryKey({
      userId: args.userId,
      category: "SCHEDULED_REPORT",
      deliveryKey,
      commitment: "AMBIGUOUS",
      committedAt: args.evaluatedAt,
    });
  } else if (delivery.providerRequestAttempted) {
    state = "FAILED";
  } else {
    state = "NO_DELIVERY";
  }

  if (delivery.providerRequestAttempted) {
    await args.dependencies.repository.insertDeliveryLog(args.userId, {
      category: "SCHEDULED_REPORT",
      deliveryKey,
      deliveryState: state,
      reasonCode: delivery.primaryReasonCode,
      providerStatusCode: delivery.providerStatusCode,
      providerRequestAttempted: delivery.providerRequestAttempted,
      transitionType: null,
      reportType: schedule.dueReportType,
      attemptedAt: args.evaluatedAt,
      details: {
        easternDate: schedule.easternDate,
        scheduleReferenceEasternTime:
          schedule.dueScheduleReferenceEasternTime,
      },
    });
  }
  await args.dependencies.repository.updateScheduledStatus({
    userId: args.userId,
    owner: args.owner,
    evaluatedAt: args.evaluatedAt,
    outcome: state,
    reasonCode: delivery.primaryReasonCode,
  });
  return taskStatus(args.evaluatedAt, state, delivery.primaryReasonCode);
}

export async function runBackendAutomationTickWithDependencies(args: {
  dependencies: BackendAutomationDependencies;
  owner: string;
  force: boolean;
}): Promise<BackendAutomationTickResult> {
  const calculatedAt = args.dependencies.now();
  const empty = emptyTaskStatus();
  const userId = await args.dependencies.getUserId();
  const settings = await args.dependencies.repository.getOrCreateSettings(userId);
  if (!settings.enabled) {
    await args.dependencies.repository.releaseLease(userId, args.owner);
    return {
      calculatedAt,
      leaseAcquired: false,
      disabled: true,
      tradePlanAlerts: empty,
      scheduledReports: empty,
    };
  }

  const expiresAt = new Date(
    calculatedAt.getTime() + BACKEND_AUTOMATION_LEASE_MILLISECONDS,
  );
  const runtime = await args.dependencies.repository.acquireLease({
    userId,
    owner: args.owner,
    now: calculatedAt,
    expiresAt,
  });
  if (runtime === null) {
    return {
      calculatedAt,
      leaseAcquired: false,
      disabled: false,
      tradePlanAlerts: empty,
      scheduledReports: empty,
    };
  }

  if (
    !args.force &&
    !isAutomationTickDue({
      now: calculatedAt,
      lastTickAt: runtime.lastTickAt,
      cadenceSeconds: settings.cadenceSeconds,
    })
  ) {
    await args.dependencies.repository.renewLease({
      userId,
      owner: args.owner,
      now: calculatedAt,
      expiresAt,
    });
    return {
      calculatedAt,
      leaseAcquired: true,
      disabled: false,
      tradePlanAlerts: empty,
      scheduledReports: empty,
    };
  }

  let tradePlanAlerts = empty;
  let scheduledReports = empty;
  if (settings.tradePlanAlertsEnabled) {
    tradePlanAlerts = await evaluateTradePlanTask({
      userId,
      runtime,
      evaluatedAt: calculatedAt,
      owner: args.owner,
      dependencies: args.dependencies,
    });
  }
  if (settings.scheduledReportsEnabled) {
    scheduledReports = await evaluateScheduledReportTask({
      userId,
      evaluatedAt: calculatedAt,
      owner: args.owner,
      dependencies: args.dependencies,
    });
  }
  await args.dependencies.repository.updateTick(userId, args.owner, calculatedAt);
  await args.dependencies.repository.renewLease({
    userId,
    owner: args.owner,
    now: calculatedAt,
    expiresAt,
  });
  return {
    calculatedAt,
    leaseAcquired: true,
    disabled: false,
    tradePlanAlerts,
    scheduledReports,
  };
}

async function withDatabase<T>(args: {
  dependencies: BackendAutomationDependencies;
  unavailable: (
    reason: "DATABASE_NOT_CONFIGURED" | "DATABASE_UNAVAILABLE",
    now: Date,
  ) => T;
  run: (userId: string, now: Date) => Promise<T>;
}): Promise<T> {
  const now = args.dependencies.now();
  if (!args.dependencies.databaseConfigured()) {
    return args.unavailable("DATABASE_NOT_CONFIGURED", now);
  }
  if (!(await args.dependencies.databaseReachable())) {
    return args.unavailable("DATABASE_UNAVAILABLE", now);
  }
  try {
    const userId = await args.dependencies.getUserId();
    return await args.run(userId, now);
  } catch {
    args.dependencies.log("database operation failure");
    return args.unavailable("DATABASE_UNAVAILABLE", now);
  }
}

export function getBackendAutomationSettingsWithDependencies(
  dependencies: BackendAutomationDependencies,
): Promise<BackendAutomationSettingsResponse> {
  return withDatabase({
    dependencies,
    unavailable: buildBackendAutomationSettingsUnavailableResponse,
    run: async (userId, now) =>
      buildBackendAutomationSettingsResponse(
        await dependencies.repository.getOrCreateSettings(userId),
        now,
      ),
  });
}

export function updateBackendAutomationSettingsWithDependencies(
  request: BackendAutomationSettingsUpdateRequest,
  dependencies: BackendAutomationDependencies,
): Promise<BackendAutomationSettingsResponse> {
  return withDatabase({
    dependencies,
    unavailable: buildBackendAutomationSettingsUnavailableResponse,
    run: async (userId, now) => {
      await dependencies.repository.getOrCreateSettings(userId);
      const updated = await dependencies.repository.updateSettings(
        userId,
        settingsRowFromUpdate(request, now),
      );
      if (!updated.enabled) {
        await dependencies.repository.releaseLease(userId, localLeaseOwner);
      }
      return buildBackendAutomationSettingsResponse(updated, now);
    },
  });
}

export function getBackendAutomationStatusWithDependencies(
  dependencies: BackendAutomationDependencies,
  owner = localLeaseOwner,
): Promise<BackendAutomationStatusResponse> {
  return withDatabase({
    dependencies,
    unavailable: buildBackendAutomationStatusUnavailableResponse,
    run: async (userId, now) => {
      const settings = await dependencies.repository.getOrCreateSettings(userId);
      const runtime = await dependencies.repository.getOrCreateRuntime(userId);
      return buildBackendAutomationStatusResponse({
        settings,
        runtime,
        calculatedAt: now,
        localLeaseOwner: owner,
      });
    },
  });
}

export function listBackendAutomationHistoryWithDependencies(
  dependencies: BackendAutomationDependencies,
): Promise<BackendAutomationDeliveryHistoryResponse> {
  return withDatabase({
    dependencies,
    unavailable: buildBackendAutomationHistoryUnavailableResponse,
    run: async (userId, now) =>
      buildBackendAutomationHistoryResponse(
        await dependencies.repository.listDeliveryLogs(
          userId,
          BACKEND_AUTOMATION_HISTORY_LIMIT,
        ),
        now,
      ),
  });
}

export async function runBackendAutomationOnceWithDependencies(
  dependencies: BackendAutomationDependencies,
  owner = localLeaseOwner,
): Promise<BackendAutomationRunOnceResponse> {
  const now = dependencies.now();
  if (!dependencies.databaseConfigured()) {
    return buildBackendAutomationRunOnceUnavailableResponse(
      "DATABASE_NOT_CONFIGURED",
      now,
    );
  }
  if (!(await dependencies.databaseReachable())) {
    return buildBackendAutomationRunOnceUnavailableResponse(
      "DATABASE_UNAVAILABLE",
      now,
    );
  }
  try {
    const result = await runBackendAutomationTickWithDependencies({
      dependencies,
      owner,
      force: true,
    });
    return buildBackendAutomationRunOnceResponse({ result });
  } catch {
    dependencies.log("explicit run failure");
    return buildBackendAutomationRunOnceUnavailableResponse(
      "DATABASE_UNAVAILABLE",
      now,
    );
  }
}

export const getBackendAutomationSettings = () =>
  getBackendAutomationSettingsWithDependencies(defaultDependencies);
export const updateBackendAutomationSettings = (
  request: BackendAutomationSettingsUpdateRequest,
) => updateBackendAutomationSettingsWithDependencies(request, defaultDependencies);
export const getBackendAutomationStatus = () =>
  getBackendAutomationStatusWithDependencies(defaultDependencies);
export const listBackendAutomationHistory = () =>
  listBackendAutomationHistoryWithDependencies(defaultDependencies);
export const runBackendAutomationOnce = () =>
  runBackendAutomationOnceWithDependencies(defaultDependencies);

export interface BackendAutomationSchedulerHandle {
  stop: () => void;
  trigger: () => Promise<void>;
}

export function startBackendAutomationScheduler(
  dependencies: BackendAutomationDependencies = defaultDependencies,
  owner = localLeaseOwner,
): BackendAutomationSchedulerHandle {
  let stopped = false;
  let running: Promise<void> | null = null;

  const trigger = async (): Promise<void> => {
    if (stopped || running !== null) return;
    running = (async () => {
      if (!dependencies.databaseConfigured()) return;
      if (!(await dependencies.databaseReachable())) return;
      try {
        await runBackendAutomationTickWithDependencies({
          dependencies,
          owner,
          force: false,
        });
      } catch {
        dependencies.log("scheduler tick failure");
      }
    })().finally(() => {
      running = null;
    });
    await running;
  };

  const timer = setInterval(() => {
    void trigger();
  }, BACKEND_AUTOMATION_LOOP_MILLISECONDS);
  timer.unref();
  const initialTimer = setTimeout(() => {
    void trigger();
  }, 1_000);
  initialTimer.unref();

  return {
    stop: () => {
      stopped = true;
      clearInterval(timer);
      clearTimeout(initialTimer);
      if (dependencies.databaseConfigured()) {
        void dependencies.getUserId().then((userId) =>
          dependencies.repository.releaseLease(userId, owner),
        ).catch(() => undefined);
      }
    },
    trigger,
  };
}

export const __backendAutomationTestables = {
  defaultDependencies,
  prismaRepository,
  evaluateTradePlanTask,
  evaluateScheduledReportTask,
  deliverTradePlanTransition,
};
