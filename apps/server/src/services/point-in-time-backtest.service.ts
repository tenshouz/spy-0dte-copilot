import { randomUUID } from "node:crypto";
import {
  PointInTimeBacktestHistoryResponseSchema,
  PointInTimeBacktestRunPayloadSchema,
  PointInTimeBacktestRunRequestSchema,
  PointInTimeBacktestRunResponseSchema,
  type PointInTimeBacktestHistoryResponse,
  type PointInTimeBacktestRunRequest,
  type PointInTimeBacktestRunResponse,
  type PointInTimeBacktestRunSummary,
} from "@spy-copilot/shared";
import { hasDatabaseUrl } from "../config/env";
import { isDatabaseReachable } from "../lib/db-status";
import {
  POINT_IN_TIME_BACKTEST_SOURCE_LIMIT,
  buildPointInTimeBacktestRun,
  type PointInTimeDecisionCycleSource,
} from "./point-in-time-backtest.logic";

const DEFAULT_USER_EMAIL = process.env.SCHWAB_DEFAULT_USER_EMAIL ?? "trader@local";
const HISTORY_LIMIT = 50;

interface PrismaRawClient {
  $queryRaw<T>(query: TemplateStringsArray, ...values: unknown[]): Promise<T>;
  $executeRaw(query: TemplateStringsArray, ...values: unknown[]): Promise<number>;
}

interface BacktestRunRow {
  id: string;
  createdAt: Date;
  startMarketDate: string | null;
  endMarketDate: string | null;
  maximumHoldMinutes: number;
  decisionCycleCount: number;
  episodeCount: number;
  targetFirstCount: number;
  stopFirstCount: number;
  winRatePercent: number | null;
  averageRMultiple: number | null;
  result: unknown;
}

const DISCLOSURES = {
  forwardCapturedDataOnly: true as const,
  historicalOptionsDatasetConnected: false as const,
  noLookahead: true as const,
  currentRulesRecomputedAtHistoricalBoundary: true as const,
  completedFiveMinuteCandlesOnly: true as const,
  sameCandleOrderNotAssumed: true as const,
  observedOptionExitQuotesMayLagTouch: true as const,
  modelOptionOutcomesAreEstimates: true as const,
  incompleteFutureCoverageIsNotTimeout: true as const,
  noTradingRecommendation: true as const,
  noOrderExecution: true as const,
};

async function rawPrisma(): Promise<PrismaRawClient> {
  const { prisma } = await import("../lib/prisma");
  return prisma as unknown as PrismaRawClient;
}

async function getOrCreateUserId(): Promise<string> {
  const raw = await rawPrisma();
  const rows = await raw.$queryRaw<Array<{ id: string }>>`
    INSERT INTO "User" ("id", "email", "createdAt")
    VALUES (${randomUUID()}, ${DEFAULT_USER_EMAIL}, ${new Date()})
    ON CONFLICT ("email") DO UPDATE SET "email" = EXCLUDED."email"
    RETURNING "id"
  `;
  if (!rows[0]) throw new Error("point-in-time backtest user unavailable");
  return rows[0].id;
}

function responseUnavailable(
  reason: "DATABASE_NOT_CONFIGURED" | "DATABASE_UNAVAILABLE" | "BACKTEST_RUN_NOT_FOUND",
): PointInTimeBacktestRunResponse {
  return PointInTimeBacktestRunResponseSchema.parse({
    product: "SPY_POINT_IN_TIME_BACKTEST",
    methodologyVersion: "POINT_IN_TIME_BACKTEST_V1",
    calculatedAt: new Date().toISOString(),
    engineState: "UNAVAILABLE",
    primaryReasonCode: reason,
    run: null,
    disclosures: DISCLOSURES,
  });
}

function historyUnavailable(
  reason: "DATABASE_NOT_CONFIGURED" | "DATABASE_UNAVAILABLE",
): PointInTimeBacktestHistoryResponse {
  return PointInTimeBacktestHistoryResponseSchema.parse({
    product: "SPY_POINT_IN_TIME_BACKTEST_HISTORY",
    methodologyVersion: "POINT_IN_TIME_BACKTEST_V1",
    calculatedAt: new Date().toISOString(),
    engineState: "UNAVAILABLE",
    primaryReasonCode: reason,
    maximumEntries: 50,
    runs: [],
    disclosures: DISCLOSURES,
  });
}

async function sourceRows(
  userId: string,
  request: PointInTimeBacktestRunRequest,
): Promise<PointInTimeDecisionCycleSource[]> {
  const raw = await rawPrisma();
  const limit = POINT_IN_TIME_BACKTEST_SOURCE_LIMIT + 1;
  const select = async (
    start: string | null,
    end: string | null,
  ): Promise<PointInTimeDecisionCycleSource[]> => {
    if (start !== null && end !== null) {
      return raw.$queryRaw<PointInTimeDecisionCycleSource[]>`
        SELECT dc."id", dc."currentMarketDate", dc."sourceCalculatedAt",
          dc."capturedAt", dc."sourceAssembly", dc."sourceMarketState",
          dc."optionsChainSnapshotId", chain."payload" AS "optionsChainPayload"
        FROM "DeterministicDecisionCycle" dc
        LEFT JOIN "PointInTimeOptionsChainSnapshot" chain
          ON chain."id" = dc."optionsChainSnapshotId"
        WHERE dc."userId" = ${userId}
          AND dc."currentMarketDate" >= ${start}
          AND dc."currentMarketDate" <= ${end}
        ORDER BY dc."sourceCalculatedAt" ASC, dc."id" ASC
        LIMIT ${limit}
      `;
    }
    if (start !== null) {
      return raw.$queryRaw<PointInTimeDecisionCycleSource[]>`
        SELECT dc."id", dc."currentMarketDate", dc."sourceCalculatedAt",
          dc."capturedAt", dc."sourceAssembly", dc."sourceMarketState",
          dc."optionsChainSnapshotId", chain."payload" AS "optionsChainPayload"
        FROM "DeterministicDecisionCycle" dc
        LEFT JOIN "PointInTimeOptionsChainSnapshot" chain
          ON chain."id" = dc."optionsChainSnapshotId"
        WHERE dc."userId" = ${userId}
          AND dc."currentMarketDate" >= ${start}
        ORDER BY dc."sourceCalculatedAt" ASC, dc."id" ASC
        LIMIT ${limit}
      `;
    }
    if (end !== null) {
      return raw.$queryRaw<PointInTimeDecisionCycleSource[]>`
        SELECT dc."id", dc."currentMarketDate", dc."sourceCalculatedAt",
          dc."capturedAt", dc."sourceAssembly", dc."sourceMarketState",
          dc."optionsChainSnapshotId", chain."payload" AS "optionsChainPayload"
        FROM "DeterministicDecisionCycle" dc
        LEFT JOIN "PointInTimeOptionsChainSnapshot" chain
          ON chain."id" = dc."optionsChainSnapshotId"
        WHERE dc."userId" = ${userId}
          AND dc."currentMarketDate" <= ${end}
        ORDER BY dc."sourceCalculatedAt" ASC, dc."id" ASC
        LIMIT ${limit}
      `;
    }
    return raw.$queryRaw<PointInTimeDecisionCycleSource[]>`
      SELECT dc."id", dc."currentMarketDate", dc."sourceCalculatedAt",
        dc."capturedAt", dc."sourceAssembly", dc."sourceMarketState",
        dc."optionsChainSnapshotId", chain."payload" AS "optionsChainPayload"
      FROM "DeterministicDecisionCycle" dc
      LEFT JOIN "PointInTimeOptionsChainSnapshot" chain
        ON chain."id" = dc."optionsChainSnapshotId"
      WHERE dc."userId" = ${userId}
      ORDER BY dc."sourceCalculatedAt" ASC, dc."id" ASC
      LIMIT ${limit}
    `;
  };
  return select(request.startMarketDate, request.endMarketDate);
}

export async function createPointInTimeBacktestRun(
  rawRequest: unknown,
): Promise<PointInTimeBacktestRunResponse> {
  const request = PointInTimeBacktestRunRequestSchema.parse(rawRequest);
  if (!hasDatabaseUrl) return responseUnavailable("DATABASE_NOT_CONFIGURED");
  if (!(await isDatabaseReachable())) return responseUnavailable("DATABASE_UNAVAILABLE");

  try {
    const userId = await getOrCreateUserId();
    const rows = await sourceRows(userId, request);
    if (rows.length > POINT_IN_TIME_BACKTEST_SOURCE_LIMIT) {
      return PointInTimeBacktestRunResponseSchema.parse({
        product: "SPY_POINT_IN_TIME_BACKTEST",
        methodologyVersion: "POINT_IN_TIME_BACKTEST_V1",
        calculatedAt: new Date().toISOString(),
        engineState: "UNAVAILABLE",
        primaryReasonCode: "BACKTEST_SOURCE_LIMIT_EXCEEDED",
        run: null,
        disclosures: DISCLOSURES,
      });
    }

    const id = randomUUID();
    const createdAt = new Date();
    const run = buildPointInTimeBacktestRun({
      id,
      createdAt,
      request,
      sourceRows: rows,
    });
    const raw = await rawPrisma();
    await raw.$executeRaw`
      INSERT INTO "PointInTimeBacktestRun" (
        "id", "userId", "createdAt", "startMarketDate", "endMarketDate",
        "maximumHoldMinutes", "decisionCycleCount", "episodeCount",
        "targetFirstCount", "stopFirstCount", "winRatePercent",
        "averageRMultiple", "result"
      ) VALUES (
        ${id}, ${userId}, ${createdAt}, ${request.startMarketDate},
        ${request.endMarketDate}, ${request.maximumHoldMinutes},
        ${run.source.decisionCycleCount}, ${run.summary.episodeCount},
        ${run.summary.targetFirstCount}, ${run.summary.stopFirstCount},
        ${run.summary.winRatePercent}, ${run.summary.averageRMultiple},
        ${JSON.stringify(run)}::jsonb
      )
    `;

    return PointInTimeBacktestRunResponseSchema.parse({
      product: "SPY_POINT_IN_TIME_BACKTEST",
      methodologyVersion: "POINT_IN_TIME_BACKTEST_V1",
      calculatedAt: new Date().toISOString(),
      engineState: "AVAILABLE",
      primaryReasonCode:
        run.source.decisionCycleCount === 0 ? "BACKTEST_EMPTY" : "BACKTEST_COMPLETE",
      run,
      disclosures: DISCLOSURES,
    });
  } catch {
    return responseUnavailable("DATABASE_UNAVAILABLE");
  }
}

export async function getPointInTimeBacktestRun(
  runId: string,
): Promise<PointInTimeBacktestRunResponse> {
  if (!hasDatabaseUrl) return responseUnavailable("DATABASE_NOT_CONFIGURED");
  if (!(await isDatabaseReachable())) return responseUnavailable("DATABASE_UNAVAILABLE");
  try {
    const userId = await getOrCreateUserId();
    const raw = await rawPrisma();
    const rows = await raw.$queryRaw<BacktestRunRow[]>`
      SELECT * FROM "PointInTimeBacktestRun"
      WHERE "userId" = ${userId} AND "id" = ${runId}
      LIMIT 1
    `;
    const row = rows[0];
    if (!row) return responseUnavailable("BACKTEST_RUN_NOT_FOUND");
    const run = PointInTimeBacktestRunPayloadSchema.parse(row.result);
    return PointInTimeBacktestRunResponseSchema.parse({
      product: "SPY_POINT_IN_TIME_BACKTEST",
      methodologyVersion: "POINT_IN_TIME_BACKTEST_V1",
      calculatedAt: new Date().toISOString(),
      engineState: "AVAILABLE",
      primaryReasonCode:
        run.source.decisionCycleCount === 0 ? "BACKTEST_EMPTY" : "BACKTEST_COMPLETE",
      run,
      disclosures: DISCLOSURES,
    });
  } catch {
    return responseUnavailable("DATABASE_UNAVAILABLE");
  }
}

function runSummary(row: BacktestRunRow): PointInTimeBacktestRunSummary {
  return {
    id: row.id,
    createdAt: row.createdAt.toISOString(),
    startMarketDate: row.startMarketDate,
    endMarketDate: row.endMarketDate,
    maximumHoldMinutes: row.maximumHoldMinutes,
    decisionCycleCount: row.decisionCycleCount,
    episodeCount: row.episodeCount,
    targetFirstCount: row.targetFirstCount,
    stopFirstCount: row.stopFirstCount,
    winRatePercent: row.winRatePercent,
    averageRMultiple: row.averageRMultiple,
  };
}

export async function listPointInTimeBacktestRuns(): Promise<PointInTimeBacktestHistoryResponse> {
  if (!hasDatabaseUrl) return historyUnavailable("DATABASE_NOT_CONFIGURED");
  if (!(await isDatabaseReachable())) return historyUnavailable("DATABASE_UNAVAILABLE");
  try {
    const userId = await getOrCreateUserId();
    const raw = await rawPrisma();
    const rows = await raw.$queryRaw<BacktestRunRow[]>`
      SELECT "id", "createdAt", "startMarketDate", "endMarketDate",
        "maximumHoldMinutes", "decisionCycleCount", "episodeCount",
        "targetFirstCount", "stopFirstCount", "winRatePercent",
        "averageRMultiple", "result"
      FROM "PointInTimeBacktestRun"
      WHERE "userId" = ${userId}
      ORDER BY "createdAt" DESC
      LIMIT ${HISTORY_LIMIT}
    `;
    return PointInTimeBacktestHistoryResponseSchema.parse({
      product: "SPY_POINT_IN_TIME_BACKTEST_HISTORY",
      methodologyVersion: "POINT_IN_TIME_BACKTEST_V1",
      calculatedAt: new Date().toISOString(),
      engineState: "AVAILABLE",
      primaryReasonCode:
        rows.length === 0 ? "BACKTEST_HISTORY_EMPTY" : "BACKTEST_HISTORY_AVAILABLE",
      maximumEntries: 50,
      runs: rows.map(runSummary),
      disclosures: DISCLOSURES,
    });
  } catch {
    return historyUnavailable("DATABASE_UNAVAILABLE");
  }
}
