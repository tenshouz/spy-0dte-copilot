import { randomUUID } from "node:crypto";
import {
  TradingPositionSchema,
  TradingReadyAlertSchema,
  TradingRestrictedEventSchema,
  type RecordTradingOverrideRequest,
  type TradingPosition,
  type TradingReadyAlert,
  type TradingRestrictedEvent,
  type UpsertTradingRestrictedEventRequest,
} from "@spy-copilot/shared";
import { TRADING_POLICY_V1 } from "./trading-policy.logic";

const DEFAULT_USER_EMAIL = process.env.SCHWAB_DEFAULT_USER_EMAIL ?? "trader@local";

interface PrismaRawClient {
  $queryRaw<T>(query: TemplateStringsArray, ...values: unknown[]): Promise<T>;
  $executeRaw(query: TemplateStringsArray, ...values: unknown[]): Promise<number>;
  $transaction<T>(fn: (tx: PrismaRawClient) => Promise<T>): Promise<T>;
}

async function getRawPrisma(): Promise<PrismaRawClient> {
  const { prisma } = await import("../lib/prisma");
  return prisma as unknown as PrismaRawClient;
}

export async function getDefaultTradingUserId(): Promise<string> {
  const { prisma } = await import("../lib/prisma");
  const user = await prisma.user.upsert({
    where: { email: DEFAULT_USER_EMAIL },
    update: {},
    create: { email: DEFAULT_USER_EMAIL },
    select: { id: true },
  });
  return user.id;
}

export interface TradingFrameworkReadinessStatus {
  persistenceState: "READY" | "MIGRATION_REQUIRED" | "UNAVAILABLE";
  persistenceReasonCode:
    | "TRADING_FRAMEWORK_TABLES_READY"
    | "TRADING_FRAMEWORK_MIGRATION_REQUIRED"
    | "TRADING_FRAMEWORK_PERSISTENCE_UNAVAILABLE";
  missingTables: string[];
  workspaceRuntimeState: "ACTIVE" | "STALE" | "STOPPED" | "UNAVAILABLE";
  lastHeartbeatAt: string | null;
}

interface TradingFrameworkTableProbeRow {
  tradingDayLedger: boolean;
  tradingPosition: boolean;
  tradingAttempt: boolean;
  tradingReadyAlert: boolean;
  tradingRestrictedEvent: boolean;
  tradingWorkspaceRuntime: boolean;
  tradingWorkspaceEvent: boolean;
  tradingPositionMark: boolean;
  tradingManualOverride: boolean;
}

export async function getTradingFrameworkReadinessStatus(
  now: Date = new Date(),
): Promise<TradingFrameworkReadinessStatus> {
  try {
    const raw = await getRawPrisma();
    const tableRows = await raw.$queryRaw<TradingFrameworkTableProbeRow[]>`
      SELECT
        to_regclass('"TradingDayLedger"') IS NOT NULL AS "tradingDayLedger",
        to_regclass('"TradingPosition"') IS NOT NULL AS "tradingPosition",
        to_regclass('"TradingAttempt"') IS NOT NULL AS "tradingAttempt",
        to_regclass('"TradingReadyAlert"') IS NOT NULL AS "tradingReadyAlert",
        to_regclass('"TradingRestrictedEvent"') IS NOT NULL AS "tradingRestrictedEvent",
        to_regclass('"TradingWorkspaceRuntime"') IS NOT NULL AS "tradingWorkspaceRuntime",
        to_regclass('"TradingWorkspaceEvent"') IS NOT NULL AS "tradingWorkspaceEvent",
        to_regclass('"TradingPositionMark"') IS NOT NULL AS "tradingPositionMark",
        to_regclass('"TradingManualOverride"') IS NOT NULL AS "tradingManualOverride"
    `;
    const row = tableRows[0];
    const expected: Array<[keyof TradingFrameworkTableProbeRow, string]> = [
      ["tradingDayLedger", "TradingDayLedger"],
      ["tradingPosition", "TradingPosition"],
      ["tradingAttempt", "TradingAttempt"],
      ["tradingReadyAlert", "TradingReadyAlert"],
      ["tradingRestrictedEvent", "TradingRestrictedEvent"],
      ["tradingWorkspaceRuntime", "TradingWorkspaceRuntime"],
      ["tradingWorkspaceEvent", "TradingWorkspaceEvent"],
      ["tradingPositionMark", "TradingPositionMark"],
      ["tradingManualOverride", "TradingManualOverride"],
    ];
    const missingTables = expected
      .filter(([key]) => row?.[key] !== true)
      .map(([, table]) => table);
    if (missingTables.length > 0) {
      return {
        persistenceState: "MIGRATION_REQUIRED",
        persistenceReasonCode: "TRADING_FRAMEWORK_MIGRATION_REQUIRED",
        missingTables,
        workspaceRuntimeState: "UNAVAILABLE",
        lastHeartbeatAt: null,
      };
    }

    const runtimeRows = await raw.$queryRaw<Array<{ lastHeartbeatAt: Date | null }>>`
      SELECT runtime."lastHeartbeatAt"
      FROM "TradingWorkspaceRuntime" runtime
      INNER JOIN "User" account ON account."id" = runtime."userId"
      WHERE account."email" = ${DEFAULT_USER_EMAIL}
      LIMIT 1
    `;
    const lastHeartbeatAt = runtimeRows[0]?.lastHeartbeatAt ?? null;
    const heartbeatAgeMs = lastHeartbeatAt
      ? now.getTime() - lastHeartbeatAt.getTime()
      : null;
    return {
      persistenceState: "READY",
      persistenceReasonCode: "TRADING_FRAMEWORK_TABLES_READY",
      missingTables: [],
      workspaceRuntimeState: !lastHeartbeatAt
        ? "STOPPED"
        : heartbeatAgeMs !== null && heartbeatAgeMs <= 90_000
          ? "ACTIVE"
          : "STALE",
      lastHeartbeatAt: lastHeartbeatAt?.toISOString() ?? null,
    };
  } catch {
    return {
      persistenceState: "UNAVAILABLE",
      persistenceReasonCode: "TRADING_FRAMEWORK_PERSISTENCE_UNAVAILABLE",
      missingTables: [],
      workspaceRuntimeState: "UNAVAILABLE",
      lastHeartbeatAt: null,
    };
  }
}

interface RawPositionRow {
  id: string;
  marketDate: string;
  policyVersion: "TRADING_POLICY_V1";
  setupId: TradingPosition["setupId"];
  setupEpisodeId: string;
  opportunityId: string;
  readyAlertId: string | null;
  direction: TradingPosition["direction"];
  status: TradingPosition["status"];
  quantity: number;
  contractSymbol: string;
  strikePrice: number;
  expirationDate: string;
  plannedEntryAsk: number;
  modeledEntryPrice: number;
  actualEntryPrice: number;
  entryUnderlyingPrice: number;
  structuralStopLevel: number;
  target1Level: number;
  target2Level: number;
  target3Level: number | null;
  plannedRiskDollars: number;
  openedAt: Date;
  timeStopReviewAt: Date;
  target1TouchedAt: Date | null;
  target2TouchedAt: Date | null;
  target3TouchedAt: Date | null;
  stopTouchedAt: Date | null;
  timeStopAlertedAt: Date | null;
  mandatoryExitAlertedAt: Date | null;
  closedAt: Date | null;
  actualExitPrice: number | null;
  exitReason: TradingPosition["exitReason"];
  realizedPnlDollars: number | null;
  overrideReason: string | null;
  createdAt: Date;
  updatedAt: Date;
}

interface RawReadyAlertRow {
  id: string;
  marketDate: string;
  opportunityId: string;
  setupEpisodeId: string;
  status: TradingReadyAlert["status"];
  issuedAt: Date;
  expiresAt: Date;
  confirmedAt: Date | null;
  revokedAt: Date | null;
  closedReasonCode: string | null;
}

interface RawRestrictedEventRow {
  id: string;
  marketDate: string;
  eventType: TradingRestrictedEvent["eventType"];
  title: string;
  blockMode: TradingRestrictedEvent["blockMode"];
  windowStartAt: Date | null;
  windowEndAt: Date | null;
  enabled: boolean;
  createdAt: Date;
  updatedAt: Date;
}

function iso(value: Date | null): string | null {
  return value ? value.toISOString() : null;
}

function mapPosition(row: RawPositionRow): TradingPosition {
  return TradingPositionSchema.parse({
    id: row.id,
    marketDate: row.marketDate,
    policyVersion: row.policyVersion,
    setupId: row.setupId,
    setupEpisodeId: row.setupEpisodeId,
    opportunityId: row.opportunityId,
    readyAlertId: row.readyAlertId,
    direction: row.direction,
    status: row.status,
    quantity: 1,
    contractSymbol: row.contractSymbol,
    strikePrice: row.strikePrice,
    expirationDate: row.expirationDate,
    plannedEntryAsk: row.plannedEntryAsk,
    modeledEntryPrice: row.modeledEntryPrice,
    actualEntryPrice: row.actualEntryPrice,
    entryUnderlyingPrice: row.entryUnderlyingPrice,
    structuralStopLevel: row.structuralStopLevel,
    target1Level: row.target1Level,
    target2Level: row.target2Level,
    target3Level: row.target3Level,
    plannedRiskDollars: row.plannedRiskDollars,
    openedAt: row.openedAt.toISOString(),
    timeStopReviewAt: row.timeStopReviewAt.toISOString(),
    target1TouchedAt: iso(row.target1TouchedAt),
    target2TouchedAt: iso(row.target2TouchedAt),
    target3TouchedAt: iso(row.target3TouchedAt),
    stopTouchedAt: iso(row.stopTouchedAt),
    timeStopAlertedAt: iso(row.timeStopAlertedAt),
    mandatoryExitAlertedAt: iso(row.mandatoryExitAlertedAt),
    closedAt: iso(row.closedAt),
    actualExitPrice: row.actualExitPrice,
    exitReason: row.exitReason,
    realizedPnlDollars: row.realizedPnlDollars,
    overrideReason: row.overrideReason,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  });
}

function mapReadyAlert(row: RawReadyAlertRow): TradingReadyAlert {
  return TradingReadyAlertSchema.parse({
    ...row,
    issuedAt: row.issuedAt.toISOString(),
    expiresAt: row.expiresAt.toISOString(),
    confirmedAt: iso(row.confirmedAt),
    revokedAt: iso(row.revokedAt),
  });
}

function mapRestrictedEvent(row: RawRestrictedEventRow): TradingRestrictedEvent {
  return TradingRestrictedEventSchema.parse({
    ...row,
    windowStartAt: iso(row.windowStartAt),
    windowEndAt: iso(row.windowEndAt),
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  });
}

export class TradingRepositoryConflictError extends Error {
  constructor(public readonly code: string) {
    super(code);
    this.name = "TradingRepositoryConflictError";
  }
}

export interface TradingWorkspaceRuntimeRow {
  runtimeState: "ACTIVE" | "STANDBY" | "STALE" | "STOPPED" | "UNAVAILABLE";
  lastHeartbeatAt: string | null;
  lastEvaluationAt: string | null;
  lastOutcome: string | null;
}

export interface TradingWorkspaceRepositorySnapshot {
  openPosition: TradingPosition | null;
  recentPositions: TradingPosition[];
  activeReadyAlert: TradingReadyAlert | null;
  restrictionEvents: TradingRestrictedEvent[];
  attemptsByEpisode: Map<string, number>;
  runtime: TradingWorkspaceRuntimeRow;
}

export async function getTradingWorkspaceRepositorySnapshot(input: {
  userId: string;
  marketDate: string;
  now: Date;
}): Promise<TradingWorkspaceRepositorySnapshot> {
  const raw = await getRawPrisma();
  const [positions, activeAlerts, restrictionEvents, attempts, runtimes] =
    await Promise.all([
      raw.$queryRaw<RawPositionRow[]>`
        SELECT * FROM "TradingPosition"
        WHERE "userId" = ${input.userId}
        ORDER BY "openedAt" DESC
        LIMIT 25
      `,
      raw.$queryRaw<RawReadyAlertRow[]>`
        SELECT "id", "marketDate", "opportunityId", "setupEpisodeId", "status",
               "issuedAt", "expiresAt", "confirmedAt", "revokedAt", "closedReasonCode"
        FROM "TradingReadyAlert"
        WHERE "userId" = ${input.userId} AND "status" = 'ACTIVE'
        ORDER BY "issuedAt" DESC
        LIMIT 1
      `,
      raw.$queryRaw<RawRestrictedEventRow[]>`
        SELECT "id", "marketDate", "eventType", "title", "blockMode",
               "windowStartAt", "windowEndAt", "enabled", "createdAt", "updatedAt"
        FROM "TradingRestrictedEvent"
        WHERE "userId" = ${input.userId} AND "marketDate" = ${input.marketDate}
        ORDER BY "eventType", "title", "id"
      `,
      raw.$queryRaw<Array<{ setupEpisodeId: string; attemptCount: bigint }>>`
        SELECT "setupEpisodeId", COUNT(*)::bigint AS "attemptCount"
        FROM "TradingAttempt"
        WHERE "userId" = ${input.userId} AND "marketDate" = ${input.marketDate}
        GROUP BY "setupEpisodeId"
      `,
      raw.$queryRaw<Array<{
        lastHeartbeatAt: Date | null;
        lastEvaluationAt: Date | null;
        lastOutcome: string | null;
      }>>`
        SELECT "lastHeartbeatAt", "lastEvaluationAt", "lastOutcome"
        FROM "TradingWorkspaceRuntime"
        WHERE "userId" = ${input.userId}
        LIMIT 1
      `,
    ]);

  const recentPositions = positions.map(mapPosition);
  const runtime = runtimes[0];
  const heartbeatAge = runtime?.lastHeartbeatAt
    ? input.now.getTime() - runtime.lastHeartbeatAt.getTime()
    : null;
  return {
    openPosition: recentPositions.find((position) => position.status === "OPEN") ?? null,
    recentPositions,
    activeReadyAlert: activeAlerts[0] ? mapReadyAlert(activeAlerts[0]) : null,
    restrictionEvents: restrictionEvents.map(mapRestrictedEvent),
    attemptsByEpisode: new Map(
      attempts.map((row) => [row.setupEpisodeId, Number(row.attemptCount)]),
    ),
    runtime: {
      runtimeState: !runtime
        ? "STOPPED"
        : heartbeatAge !== null && heartbeatAge <= 90_000
          ? "ACTIVE"
          : "STALE",
      lastHeartbeatAt: runtime?.lastHeartbeatAt?.toISOString() ?? null,
      lastEvaluationAt: runtime?.lastEvaluationAt?.toISOString() ?? null,
      lastOutcome: runtime?.lastOutcome ?? null,
    },
  };
}

export async function expireReadyAlerts(userId: string, now: Date): Promise<string[]> {
  const raw = await getRawPrisma();
  const rows = await raw.$queryRaw<Array<{ id: string }>>`
    UPDATE "TradingReadyAlert"
    SET "status" = 'EXPIRED', "closedReasonCode" = 'READY_ALERT_TTL_EXPIRED', "updatedAt" = ${now}
    WHERE "userId" = ${userId}
      AND "status" = 'ACTIVE'
      AND "expiresAt" <= ${now}
    RETURNING "id"
  `;
  return rows.map((row) => row.id);
}

export async function revokeActiveReadyAlert(input: {
  userId: string;
  alertId: string;
  reasonCode: string;
  now: Date;
}): Promise<TradingReadyAlert | null> {
  const raw = await getRawPrisma();
  const rows = await raw.$queryRaw<RawReadyAlertRow[]>`
    UPDATE "TradingReadyAlert"
    SET "status" = 'REVOKED', "revokedAt" = ${input.now},
        "closedReasonCode" = ${input.reasonCode}, "updatedAt" = ${input.now}
    WHERE "id" = ${input.alertId} AND "userId" = ${input.userId} AND "status" = 'ACTIVE'
    RETURNING "id", "marketDate", "opportunityId", "setupEpisodeId", "status",
              "issuedAt", "expiresAt", "confirmedAt", "revokedAt", "closedReasonCode"
  `;
  return rows[0] ? mapReadyAlert(rows[0]) : null;
}

export async function createReadyAlert(input: {
  userId: string;
  marketDate: string;
  opportunityId: string;
  setupEpisodeId: string;
  issuedAt: Date;
  expiresAt: Date;
  snapshot: unknown;
}): Promise<TradingReadyAlert> {
  const raw = await getRawPrisma();
  return raw.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtext(${`ready:${input.userId}`}))`;
    const existing = await tx.$queryRaw<RawReadyAlertRow[]>`
      SELECT "id", "marketDate", "opportunityId", "setupEpisodeId", "status",
             "issuedAt", "expiresAt", "confirmedAt", "revokedAt", "closedReasonCode"
      FROM "TradingReadyAlert"
      WHERE "userId" = ${input.userId} AND "status" = 'ACTIVE'
      ORDER BY "issuedAt" DESC
      LIMIT 1
      FOR UPDATE
    `;
    if (existing[0]) {
      if (
        existing[0].opportunityId === input.opportunityId &&
        existing[0].expiresAt.getTime() > input.issuedAt.getTime()
      ) {
        return mapReadyAlert(existing[0]);
      }
      await tx.$executeRaw`
        UPDATE "TradingReadyAlert"
        SET "status" = 'REVOKED', "revokedAt" = ${input.issuedAt},
            "closedReasonCode" = 'SUPERSEDED_BY_NEW_READY_EPISODE', "updatedAt" = ${input.issuedAt}
        WHERE "id" = ${existing[0].id}
      `;
    }
    const id = randomUUID();
    const rows = await tx.$queryRaw<RawReadyAlertRow[]>`
      INSERT INTO "TradingReadyAlert" (
        "id", "userId", "marketDate", "opportunityId", "setupEpisodeId", "status",
        "issuedAt", "expiresAt", "snapshot", "updatedAt"
      ) VALUES (
        ${id}, ${input.userId}, ${input.marketDate}, ${input.opportunityId},
        ${input.setupEpisodeId}, 'ACTIVE', ${input.issuedAt}, ${input.expiresAt},
        ${JSON.stringify(input.snapshot)}::jsonb, ${input.issuedAt}
      )
      RETURNING "id", "marketDate", "opportunityId", "setupEpisodeId", "status",
                "issuedAt", "expiresAt", "confirmedAt", "revokedAt", "closedReasonCode"
    `;
    if (!rows[0]) throw new Error("READY alert insert did not return a row");
    return mapReadyAlert(rows[0]);
  });
}

export interface NewTradingPositionRecord {
  userId: string;
  marketDate: string;
  setupId: TradingPosition["setupId"];
  setupEpisodeId: string;
  opportunityId: string;
  readyAlertId: string;
  direction: TradingPosition["direction"];
  contractSymbol: string;
  strikePrice: number;
  expirationDate: string;
  plannedEntryAsk: number;
  modeledEntryPrice: number;
  actualEntryPrice: number;
  entryUnderlyingPrice: number;
  structuralStopLevel: number;
  target1Level: number;
  target2Level: number;
  target3Level: number | null;
  plannedRiskDollars: number;
  sourceSnapshot: unknown;
  levelType: string;
  levelBucket: string;
  openedAt: Date;
  entryNote: string | null;
}

export async function confirmTradingEntryTransaction(
  input: NewTradingPositionRecord,
): Promise<TradingPosition> {
  const raw = await getRawPrisma();
  return raw.$transaction(async (tx) => {
    await tx.$queryRaw`
      SELECT pg_advisory_xact_lock(hashtext(${`entry:${input.userId}:${input.marketDate}`}))
    `;
    const alerts = await tx.$queryRaw<RawReadyAlertRow[]>`
      SELECT "id", "marketDate", "opportunityId", "setupEpisodeId", "status",
             "issuedAt", "expiresAt", "confirmedAt", "revokedAt", "closedReasonCode"
      FROM "TradingReadyAlert"
      WHERE "id" = ${input.readyAlertId} AND "userId" = ${input.userId}
      LIMIT 1
      FOR UPDATE
    `;
    const alert = alerts[0];
    if (!alert || alert.status !== "ACTIVE") {
      throw new TradingRepositoryConflictError("READY_ALERT_NOT_ACTIVE");
    }
    if (alert.expiresAt.getTime() <= input.openedAt.getTime()) {
      await tx.$executeRaw`
        UPDATE "TradingReadyAlert" SET "status"='EXPIRED',
          "closedReasonCode"='READY_ALERT_TTL_EXPIRED', "updatedAt"=${input.openedAt}
        WHERE "id"=${alert.id}
      `;
      throw new TradingRepositoryConflictError("READY_ALERT_EXPIRED");
    }
    if (
      alert.opportunityId !== input.opportunityId ||
      alert.setupEpisodeId !== input.setupEpisodeId ||
      alert.marketDate !== input.marketDate
    ) {
      throw new TradingRepositoryConflictError("READY_ALERT_SOURCE_MISMATCH");
    }

    const openRows = await tx.$queryRaw<Array<{ count: bigint; risk: number | null }>>`
      SELECT COUNT(*)::bigint AS "count", COALESCE(SUM("plannedRiskDollars"), 0)::float8 AS "risk"
      FROM "TradingPosition"
      WHERE "userId" = ${input.userId} AND "status" = 'OPEN'
    `;
    if (Number(openRows[0]?.count ?? 0) >= TRADING_POLICY_V1.maximumConcurrentPositions) {
      throw new TradingRepositoryConflictError("CONCURRENT_POSITION_LIMIT_REACHED");
    }

    const dayRows = await tx.$queryRaw<Array<{
      tradeCount: bigint;
      realizedPnl: number | null;
      realizedLoss: number | null;
    }>>`
      SELECT
        COUNT(*)::bigint AS "tradeCount",
        COALESCE(SUM(CASE WHEN "status"='CLOSED' THEN "realizedPnlDollars" ELSE 0 END), 0)::float8 AS "realizedPnl",
        COALESCE(SUM(CASE WHEN "status"='CLOSED' AND "realizedPnlDollars" < 0
          THEN -"realizedPnlDollars" ELSE 0 END), 0)::float8 AS "realizedLoss"
      FROM "TradingPosition"
      WHERE "userId" = ${input.userId} AND "marketDate" = ${input.marketDate}
    `;
    const tradeCount = Number(dayRows[0]?.tradeCount ?? 0);
    const usedRisk =
      Number(dayRows[0]?.realizedLoss ?? 0) +
      Number(openRows[0]?.risk ?? 0) +
      input.plannedRiskDollars;
    if (tradeCount >= TRADING_POLICY_V1.maximumTradesPerDay) {
      throw new TradingRepositoryConflictError("TRADE_COUNT_LIMIT_REACHED");
    }
    if (usedRisk > TRADING_POLICY_V1.maximumDailyLossDollars) {
      throw new TradingRepositoryConflictError("DAILY_LOSS_LIMIT_REACHED");
    }

    const recentClosed = await tx.$queryRaw<Array<{ realizedPnlDollars: number | null }>>`
      SELECT "realizedPnlDollars" FROM "TradingPosition"
      WHERE "userId" = ${input.userId} AND "marketDate" = ${input.marketDate}
        AND "status" = 'CLOSED'
      ORDER BY "closedAt" DESC NULLS LAST
      LIMIT 10
      FOR UPDATE
    `;
    let consecutiveLosses = 0;
    for (const row of recentClosed) {
      if (row.realizedPnlDollars === null) continue;
      if (row.realizedPnlDollars < 0) consecutiveLosses += 1;
      else if (row.realizedPnlDollars > 0) break;
    }
    if (consecutiveLosses >= TRADING_POLICY_V1.stopAfterConsecutiveLosses) {
      throw new TradingRepositoryConflictError("CONSECUTIVE_LOSS_LIMIT_REACHED");
    }

    const attemptRows = await tx.$queryRaw<Array<{ count: bigint }>>`
      SELECT COUNT(*)::bigint AS "count" FROM "TradingAttempt"
      WHERE "userId" = ${input.userId} AND "setupEpisodeId" = ${input.setupEpisodeId}
    `;
    const attemptNumber = Number(attemptRows[0]?.count ?? 0) + 1;
    if (attemptNumber > TRADING_POLICY_V1.maximumAttemptsPerSetupDirectionLevel) {
      throw new TradingRepositoryConflictError("ATTEMPT_LIMIT_REACHED");
    }

    const positionId = randomUUID();
    const timeStopReviewAt = new Date(
      input.openedAt.getTime() + TRADING_POLICY_V1.timeStopReviewMinutes * 60_000,
    );
    const positions = await tx.$queryRaw<RawPositionRow[]>`
      INSERT INTO "TradingPosition" (
        "id", "userId", "marketDate", "policyVersion", "setupId", "setupEpisodeId",
        "opportunityId", "readyAlertId", "direction", "status", "quantity",
        "contractSymbol", "strikePrice", "expirationDate", "plannedEntryAsk",
        "modeledEntryPrice", "actualEntryPrice", "entryUnderlyingPrice",
        "structuralStopLevel", "target1Level", "target2Level", "target3Level",
        "plannedRiskDollars", "sourceSnapshot", "openedAt", "timeStopReviewAt",
        "entryNote", "updatedAt"
      ) VALUES (
        ${positionId}, ${input.userId}, ${input.marketDate}, ${TRADING_POLICY_V1.version},
        ${input.setupId}, ${input.setupEpisodeId}, ${input.opportunityId},
        ${input.readyAlertId}, ${input.direction}, 'OPEN', 1, ${input.contractSymbol},
        ${input.strikePrice}, ${input.expirationDate}, ${input.plannedEntryAsk},
        ${input.modeledEntryPrice}, ${input.actualEntryPrice}, ${input.entryUnderlyingPrice},
        ${input.structuralStopLevel}, ${input.target1Level}, ${input.target2Level},
        ${input.target3Level}, ${input.plannedRiskDollars},
        ${JSON.stringify(input.sourceSnapshot)}::jsonb, ${input.openedAt},
        ${timeStopReviewAt}, ${input.entryNote}, ${input.openedAt}
      )
      RETURNING *
    `;
    await tx.$executeRaw`
      INSERT INTO "TradingAttempt" (
        "id", "userId", "marketDate", "setupId", "setupEpisodeId", "direction",
        "levelType", "levelBucket", "attemptNumber", "positionId", "outcome"
      ) VALUES (
        ${randomUUID()}, ${input.userId}, ${input.marketDate}, ${input.setupId},
        ${input.setupEpisodeId}, ${input.direction}, ${input.levelType}, ${input.levelBucket},
        ${attemptNumber}, ${positionId}, 'OPEN'
      )
    `;
    await tx.$executeRaw`
      UPDATE "TradingReadyAlert"
      SET "status"='CONFIRMED', "confirmedAt"=${input.openedAt},
          "closedReasonCode"='MANUAL_ENTRY_CONFIRMED', "updatedAt"=${input.openedAt}
      WHERE "id"=${input.readyAlertId}
    `;
    await tx.$executeRaw`
      INSERT INTO "TradingDayLedger" (
        "id", "userId", "marketDate", "policyVersion", "realizedPnlDollars",
        "realizedLossDollars", "openPlannedRiskDollars", "tradeCount",
        "consecutiveLosses", "updatedAt"
      ) VALUES (
        ${randomUUID()}, ${input.userId}, ${input.marketDate}, ${TRADING_POLICY_V1.version},
        ${Number(dayRows[0]?.realizedPnl ?? 0)}, ${Number(dayRows[0]?.realizedLoss ?? 0)}, ${Number(openRows[0]?.risk ?? 0) + input.plannedRiskDollars},
        ${tradeCount + 1}, ${consecutiveLosses}, ${input.openedAt}
      )
      ON CONFLICT ("userId", "marketDate") DO UPDATE SET
        "policyVersion"=EXCLUDED."policyVersion",
        "openPlannedRiskDollars"=EXCLUDED."openPlannedRiskDollars",
        "tradeCount"=EXCLUDED."tradeCount",
        "consecutiveLosses"=EXCLUDED."consecutiveLosses",
        "updatedAt"=EXCLUDED."updatedAt"
    `;
    if (!positions[0]) throw new Error("Position insert did not return a row");
    return mapPosition(positions[0]);
  });
}

export async function closeTradingPositionTransaction(input: {
  userId: string;
  positionId: string;
  actualExitPrice: number;
  exitReason: NonNullable<TradingPosition["exitReason"]>;
  exitNote: string | null;
  closedAt: Date;
}): Promise<TradingPosition> {
  const raw = await getRawPrisma();
  return raw.$transaction(async (tx) => {
    await tx.$queryRaw`
      SELECT pg_advisory_xact_lock(hashtext(${`close:${input.userId}:${input.positionId}`}))
    `;
    const current = await tx.$queryRaw<RawPositionRow[]>`
      SELECT * FROM "TradingPosition"
      WHERE "id"=${input.positionId} AND "userId"=${input.userId}
      LIMIT 1 FOR UPDATE
    `;
    const row = current[0];
    if (!row) throw new TradingRepositoryConflictError("POSITION_NOT_FOUND");
    if (row.status !== "OPEN") {
      throw new TradingRepositoryConflictError("POSITION_ALREADY_CLOSED");
    }
    const pnl = (input.actualExitPrice - row.actualEntryPrice) * row.quantity * 100;
    const updated = await tx.$queryRaw<RawPositionRow[]>`
      UPDATE "TradingPosition"
      SET "status"='CLOSED', "closedAt"=${input.closedAt},
          "actualExitPrice"=${input.actualExitPrice}, "exitReason"=${input.exitReason},
          "realizedPnlDollars"=${pnl}, "exitNote"=${input.exitNote}, "updatedAt"=${input.closedAt}
      WHERE "id"=${input.positionId}
      RETURNING *
    `;
    await tx.$executeRaw`
      UPDATE "TradingAttempt"
      SET "outcome"=${pnl < 0 ? "LOSS" : pnl > 0 ? "WIN" : "BREAKEVEN"},
          "closedAt"=${input.closedAt}
      WHERE "positionId"=${input.positionId}
    `;
    const dayStats = await tx.$queryRaw<Array<{
      realizedPnl: number | null;
      realizedLoss: number | null;
      openRisk: number | null;
      tradeCount: bigint;
    }>>`
      SELECT
        COALESCE(SUM(CASE WHEN "status"='CLOSED' THEN "realizedPnlDollars" ELSE 0 END), 0)::float8 AS "realizedPnl",
        COALESCE(SUM(CASE WHEN "status"='CLOSED' AND "realizedPnlDollars" < 0 THEN -"realizedPnlDollars" ELSE 0 END), 0)::float8 AS "realizedLoss",
        COALESCE(SUM(CASE WHEN "status"='OPEN' THEN "plannedRiskDollars" ELSE 0 END), 0)::float8 AS "openRisk",
        COUNT(*)::bigint AS "tradeCount"
      FROM "TradingPosition"
      WHERE "userId"=${input.userId} AND "marketDate"=${row.marketDate}
    `;
    const recentClosed = await tx.$queryRaw<Array<{ realizedPnlDollars: number | null }>>`
      SELECT "realizedPnlDollars" FROM "TradingPosition"
      WHERE "userId"=${input.userId} AND "marketDate"=${row.marketDate} AND "status"='CLOSED'
      ORDER BY "closedAt" DESC NULLS LAST LIMIT 10
    `;
    let streak = 0;
    for (const item of recentClosed) {
      if (item.realizedPnlDollars === null) continue;
      if (item.realizedPnlDollars < 0) streak += 1;
      else if (item.realizedPnlDollars > 0) break;
    }
    const stats = dayStats[0];
    await tx.$executeRaw`
      INSERT INTO "TradingDayLedger" (
        "id", "userId", "marketDate", "policyVersion", "realizedPnlDollars",
        "realizedLossDollars", "openPlannedRiskDollars", "tradeCount", "consecutiveLosses", "updatedAt"
      ) VALUES (
        ${randomUUID()}, ${input.userId}, ${row.marketDate}, ${TRADING_POLICY_V1.version},
        ${Number(stats?.realizedPnl ?? 0)}, ${Number(stats?.realizedLoss ?? 0)},
        ${Number(stats?.openRisk ?? 0)}, ${Number(stats?.tradeCount ?? 0)}, ${streak}, ${input.closedAt}
      )
      ON CONFLICT ("userId", "marketDate") DO UPDATE SET
        "realizedPnlDollars"=EXCLUDED."realizedPnlDollars",
        "realizedLossDollars"=EXCLUDED."realizedLossDollars",
        "openPlannedRiskDollars"=EXCLUDED."openPlannedRiskDollars",
        "tradeCount"=EXCLUDED."tradeCount",
        "consecutiveLosses"=EXCLUDED."consecutiveLosses",
        "updatedAt"=EXCLUDED."updatedAt"
    `;
    if (!updated[0]) throw new Error("Position update did not return a row");
    return mapPosition(updated[0]);
  });
}

export async function recordTradingOverride(input: {
  userId: string;
  marketDate: string;
  request: RecordTradingOverrideRequest;
  sourceEngineState: unknown;
}): Promise<void> {
  const raw = await getRawPrisma();
  await raw.$executeRaw`
    INSERT INTO "TradingManualOverride" (
      "id", "userId", "marketDate", "action", "reason", "relatedOpportunityId",
      "relatedPositionId", "sourceEngineState"
    ) VALUES (
      ${randomUUID()}, ${input.userId}, ${input.marketDate}, ${input.request.action},
      ${input.request.reason.trim()}, ${input.request.relatedOpportunityId ?? null},
      ${input.request.relatedPositionId ?? null}, ${JSON.stringify(input.sourceEngineState)}::jsonb
    )
  `;
}

export async function upsertTradingRestrictedEvent(input: {
  userId: string;
  eventId?: string;
  request: UpsertTradingRestrictedEventRequest;
}): Promise<TradingRestrictedEvent> {
  const raw = await getRawPrisma();
  const id = input.eventId ?? randomUUID();
  const now = new Date();
  const rows = await raw.$queryRaw<RawRestrictedEventRow[]>`
    INSERT INTO "TradingRestrictedEvent" (
      "id", "userId", "marketDate", "eventType", "title", "blockMode",
      "windowStartAt", "windowEndAt", "enabled", "updatedAt"
    ) VALUES (
      ${id}, ${input.userId}, ${input.request.marketDate}, ${input.request.eventType},
      ${input.request.title}, ${input.request.blockMode},
      ${input.request.windowStartAt ? new Date(input.request.windowStartAt) : null},
      ${input.request.windowEndAt ? new Date(input.request.windowEndAt) : null},
      ${input.request.enabled}, ${now}
    )
    ON CONFLICT ("id") DO UPDATE SET
      "marketDate"=EXCLUDED."marketDate", "eventType"=EXCLUDED."eventType",
      "title"=EXCLUDED."title", "blockMode"=EXCLUDED."blockMode",
      "windowStartAt"=EXCLUDED."windowStartAt", "windowEndAt"=EXCLUDED."windowEndAt",
      "enabled"=EXCLUDED."enabled", "updatedAt"=EXCLUDED."updatedAt"
    WHERE "TradingRestrictedEvent"."userId"=${input.userId}
    RETURNING "id", "marketDate", "eventType", "title", "blockMode",
              "windowStartAt", "windowEndAt", "enabled", "createdAt", "updatedAt"
  `;
  if (!rows[0]) throw new TradingRepositoryConflictError("RESTRICTED_EVENT_NOT_FOUND");
  return mapRestrictedEvent(rows[0]);
}

export async function deleteTradingRestrictedEvent(
  userId: string,
  eventId: string,
): Promise<boolean> {
  const raw = await getRawPrisma();
  const count = await raw.$executeRaw`
    DELETE FROM "TradingRestrictedEvent" WHERE "id"=${eventId} AND "userId"=${userId}
  `;
  return count > 0;
}

export async function insertWorkspaceEvent(input: {
  userId: string;
  marketDate: string;
  eventType: string;
  severity: string;
  dedupeKey: string;
  relatedReadyAlertId?: string | null;
  relatedPositionId?: string | null;
  payload: unknown;
}): Promise<boolean> {
  const raw = await getRawPrisma();
  const count = await raw.$executeRaw`
    INSERT INTO "TradingWorkspaceEvent" (
      "id", "userId", "marketDate", "eventType", "severity", "dedupeKey",
      "relatedReadyAlertId", "relatedPositionId", "payload"
    ) VALUES (
      ${randomUUID()}, ${input.userId}, ${input.marketDate}, ${input.eventType},
      ${input.severity}, ${input.dedupeKey}, ${input.relatedReadyAlertId ?? null},
      ${input.relatedPositionId ?? null}, ${JSON.stringify(input.payload)}::jsonb
    ) ON CONFLICT ("userId", "dedupeKey") DO NOTHING
  `;
  return count > 0;
}

export interface PendingWorkspaceEventRow {
  id: string;
  eventType: string;
  severity: string;
  payload: Record<string, unknown>;
}

export async function listPendingWorkspaceEvents(
  userId: string,
  limit = 20,
): Promise<PendingWorkspaceEventRow[]> {
  const raw = await getRawPrisma();
  return raw.$queryRaw<PendingWorkspaceEventRow[]>`
    SELECT "id", "eventType", "severity", "payload"
    FROM "TradingWorkspaceEvent"
    WHERE "userId"=${userId} AND "discordDeliveryState"='PENDING'
    ORDER BY "createdAt" ASC LIMIT ${limit}
  `;
}

export async function markWorkspaceEventDelivery(input: {
  userId: string;
  eventId: string;
  state: "DELIVERED" | "FAILED" | "AMBIGUOUS" | "SUPPRESSED";
  statusCode: number | null;
  now: Date;
}): Promise<void> {
  const raw = await getRawPrisma();
  await raw.$executeRaw`
    UPDATE "TradingWorkspaceEvent"
    SET "discordDeliveryState"=${input.state},
        "discordDeliveredAt"=${input.state === "DELIVERED" ? input.now : null},
        "providerStatusCode"=${input.statusCode}
    WHERE "id"=${input.eventId} AND "userId"=${input.userId}
  `;
}

export async function upsertPositionMark(input: {
  positionId: string;
  markType: string;
  observedAt: Date;
  underlyingPrice: number | null;
  contractBid: number | null;
  contractAsk: number | null;
  sourceState: string;
  sourceSnapshot?: unknown;
}): Promise<boolean> {
  const raw = await getRawPrisma();
  const modeledPnl =
    input.contractBid === null
      ? null
      : await raw.$queryRaw<Array<{ value: number | null }>>`
          SELECT ((${input.contractBid} - "modeledEntryPrice") * "quantity" * 100)::float8 AS "value"
          FROM "TradingPosition" WHERE "id"=${input.positionId} LIMIT 1
        `.then((rows) => rows[0]?.value ?? null);
  const count = await raw.$executeRaw`
    INSERT INTO "TradingPositionMark" (
      "id", "positionId", "markType", "observedAt", "underlyingPrice",
      "contractBid", "contractAsk", "modeledExitPrice", "modeledNetPnlDollars",
      "sourceState", "sourceSnapshot"
    ) VALUES (
      ${randomUUID()}, ${input.positionId}, ${input.markType}, ${input.observedAt},
      ${input.underlyingPrice}, ${input.contractBid}, ${input.contractAsk}, ${input.contractBid},
      ${modeledPnl}, ${input.sourceState},
      ${input.sourceSnapshot === undefined ? null : JSON.stringify(input.sourceSnapshot)}::jsonb
    ) ON CONFLICT ("positionId", "markType") DO NOTHING
  `;
  return count > 0;
}

export async function updatePositionTouch(input: {
  positionId: string;
  field:
    | "target1TouchedAt"
    | "target2TouchedAt"
    | "target3TouchedAt"
    | "stopTouchedAt"
    | "timeStopAlertedAt"
    | "mandatoryExitAlertedAt";
  at: Date;
}): Promise<boolean> {
  const raw = await getRawPrisma();
  const allowed = new Set([
    "target1TouchedAt",
    "target2TouchedAt",
    "target3TouchedAt",
    "stopTouchedAt",
    "timeStopAlertedAt",
    "mandatoryExitAlertedAt",
  ]);
  if (!allowed.has(input.field)) throw new Error("Invalid touch field");
  // Field name is from the fixed allow-list; values remain parameterized.
  const { prisma } = await import("../lib/prisma");
  const result = await prisma.$executeRawUnsafe(
    `UPDATE "TradingPosition" SET "${input.field}"=$1, "updatedAt"=$1 WHERE "id"=$2 AND "${input.field}" IS NULL`,
    input.at,
    input.positionId,
  );
  return result > 0;
}

export async function getExitPolicyMarks(userId: string): Promise<Array<{
  policy: string;
  pnl: number | null;
}>> {
  const raw = await getRawPrisma();
  return raw.$queryRaw<Array<{ policy: string; pnl: number | null }>>`
    SELECT CASE "markType"
      WHEN 'TARGET_1' THEN 'TARGET_1_EARLY'
      WHEN 'TARGET_2' THEN 'TARGET_2_PRIMARY'
      WHEN 'TARGET_3' THEN 'TARGET_3_EXTENSION'
      WHEN 'TIME_STOP' THEN 'TIME_STOP_15M'
      ELSE "markType"
    END AS "policy", "modeledNetPnlDollars"::float8 AS "pnl"
    FROM "TradingPositionMark" m
    JOIN "TradingPosition" p ON p."id"=m."positionId"
    WHERE p."userId"=${userId}
      AND m."modeledNetPnlDollars" IS NOT NULL
      AND m."sourceState"='LIVE'
    UNION ALL
    SELECT 'ACTUAL_USER_EXIT' AS "policy", "realizedPnlDollars"::float8 AS "pnl"
    FROM "TradingPosition"
    WHERE "userId"=${userId} AND "status"='CLOSED' AND "realizedPnlDollars" IS NOT NULL
  `;
}

export async function getOrCreateTradingWorkspaceRuntime(userId: string): Promise<void> {
  const raw = await getRawPrisma();
  await raw.$executeRaw`
    INSERT INTO "TradingWorkspaceRuntime" ("id", "userId", "updatedAt")
    VALUES (${randomUUID()}, ${userId}, ${new Date()})
    ON CONFLICT ("userId") DO NOTHING
  `;
}

export async function acquireTradingWorkspaceLease(input: {
  userId: string;
  owner: string;
  now: Date;
  expiresAt: Date;
}): Promise<boolean> {
  const raw = await getRawPrisma();
  await getOrCreateTradingWorkspaceRuntime(input.userId);
  const rows = await raw.$queryRaw<Array<{ id: string }>>`
    UPDATE "TradingWorkspaceRuntime"
    SET "leaseOwner"=${input.owner}, "leaseExpiresAt"=${input.expiresAt},
        "lastHeartbeatAt"=${input.now}, "updatedAt"=${input.now}
    WHERE "userId"=${input.userId}
      AND ("leaseOwner" IS NULL OR "leaseOwner"=${input.owner} OR "leaseExpiresAt" <= ${input.now})
    RETURNING "id"
  `;
  return rows.length > 0;
}

export async function updateTradingWorkspaceRuntime(input: {
  userId: string;
  owner: string;
  now: Date;
  outcome: string;
  errorCode?: string | null;
}): Promise<void> {
  const raw = await getRawPrisma();
  await raw.$executeRaw`
    UPDATE "TradingWorkspaceRuntime"
    SET "lastHeartbeatAt"=${input.now}, "lastEvaluationAt"=${input.now},
        "lastOutcome"=${input.outcome}, "lastErrorCode"=${input.errorCode ?? null},
        "updatedAt"=${input.now}
    WHERE "userId"=${input.userId} AND "leaseOwner"=${input.owner}
  `;
}
