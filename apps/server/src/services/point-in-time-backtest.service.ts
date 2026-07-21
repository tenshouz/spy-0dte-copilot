import { randomUUID } from "node:crypto";
import {
  PointInTimeBacktestHistoryResponseSchema,
  PointInTimeBacktestRunPayloadSchema,
  PointInTimeBacktestRunRequestSchema,
  PointInTimeBacktestRunResponseSchema,
  type PointInTimeBacktestHistoryResponse,
  type PointInTimeBacktestIssue,
  type PointInTimeBacktestRunRequest,
  type PointInTimeBacktestRunResponse,
  type PointInTimeBacktestRunSummary,
} from "@spy-copilot/shared";
import { hasDatabaseUrl } from "../config/env";
import { isDatabaseReachable } from "../lib/db-status";
import { buildHistoricalUnderlyingDecisionCycles } from "./historical-underlying-backtest.logic";
import {
  HISTORICAL_UNDERLYING_MAX_RANGE_DAYS,
  fetchHistoricalUnderlyingCandles,
} from "./historical-underlying-backtest.service";
import { evaluateNyseTradingSessionCalendar } from "./nyse-session-calendar.logic";
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
  forwardCapturedDataOnly: false,
  historicalUnderlyingPriceHistorySupported: true,
  legacyFrozenAssemblyFallbackSupported: true,
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

function inclusiveMarketDates(start: string, end: string): string[] {
  const dates: string[] = [];
  let cursor = Date.parse(`${start}T00:00:00.000Z`);
  const final = Date.parse(`${end}T00:00:00.000Z`);
  while (cursor <= final) {
    const marketDate = new Date(cursor).toISOString().slice(0, 10);
    const session = evaluateNyseTradingSessionCalendar(marketDate);
    if (
      session.coverageState === "SUPPORTED" &&
      session.tradingDayState === "TRADING_DAY"
    ) {
      dates.push(marketDate);
    }
    cursor += 86_400_000;
  }
  return dates;
}

function fallbackIssue(
  marketDate: string,
  issueCode: PointInTimeBacktestIssue["issueCode"],
  message: string,
  severity: PointInTimeBacktestIssue["severity"] = "ERROR",
): PointInTimeBacktestIssue {
  return {
    decisionCycleId: `HISTORICAL_FALLBACK:${marketDate}`,
    marketDate,
    issueCode,
    severity,
    message,
  };
}

async function historicalFallback(args: {
  request: PointInTimeBacktestRunRequest;
  capturedRows: PointInTimeDecisionCycleSource[];
}): Promise<{
  rows: PointInTimeDecisionCycleSource[];
  issues: PointInTimeBacktestIssue[];
}> {
  const { startMarketDate, endMarketDate } = args.request;
  if (startMarketDate === null || endMarketDate === null) {
    return { rows: [], issues: [] };
  }

  const requestedDates = inclusiveMarketDates(startMarketDate, endMarketDate);
  const capturedDates = new Set(
    args.capturedRows.map((row) => row.currentMarketDate),
  );
  const missingDates = requestedDates.filter((date) => !capturedDates.has(date));
  if (missingDates.length === 0) return { rows: [], issues: [] };

  const calendarRangeDays =
    Math.floor(
      (Date.parse(`${endMarketDate}T00:00:00.000Z`) -
        Date.parse(`${startMarketDate}T00:00:00.000Z`)) /
        86_400_000,
    ) + 1;
  if (calendarRangeDays > HISTORICAL_UNDERLYING_MAX_RANGE_DAYS) {
    return {
      rows: [],
      issues: missingDates.map((marketDate) =>
        fallbackIssue(
          marketDate,
          "HISTORICAL_FALLBACK_RANGE_LIMIT_EXCEEDED",
          `On-demand Schwab underlying replay is limited to ${HISTORICAL_UNDERLYING_MAX_RANGE_DAYS} calendar days per run. Use a smaller date range.`,
        ),
      ),
    };
  }

  const fetched = await fetchHistoricalUnderlyingCandles(
    startMarketDate,
    endMarketDate,
  );
  if (fetched.candles === null) {
    const code =
      fetched.failureCode === "RANGE_LIMIT_EXCEEDED"
        ? "HISTORICAL_FALLBACK_RANGE_LIMIT_EXCEEDED"
        : "HISTORICAL_CANDLE_FETCH_FAILED";
    return {
      rows: [],
      issues: missingDates.map((marketDate) =>
        fallbackIssue(
          marketDate,
          code,
          `No captured cycles existed and Schwab historical five-minute candles could not be loaded (${fetched.failureCode ?? "UNKNOWN"}). Confirm Schwab is connected and retry.`,
        ),
      ),
    };
  }

  const rows = buildHistoricalUnderlyingDecisionCycles({
    candles: fetched.candles,
    marketDates: missingDates,
    requestedStartAtMs: fetched.requestedStartAtMs,
    requestedEndAtMs: fetched.requestedEndAtMs,
  });
  const builtDates = new Set(rows.map((row) => row.currentMarketDate));
  const issues = missingDates
    .filter((marketDate) => !builtDates.has(marketDate))
    .map((marketDate) =>
      fallbackIssue(
        marketDate,
        "HISTORICAL_CANDLE_DATE_UNAVAILABLE",
        "Schwab returned no complete RTH five-minute history for this market date, so no underlying-only replay boundaries could be built.",
      ),
    );
  return { rows, issues };
}

export async function createPointInTimeBacktestRun(
  rawRequest: unknown,
): Promise<PointInTimeBacktestRunResponse> {
  const request = PointInTimeBacktestRunRequestSchema.parse(rawRequest);
  if (!hasDatabaseUrl) return responseUnavailable("DATABASE_NOT_CONFIGURED");
  if (!(await isDatabaseReachable())) return responseUnavailable("DATABASE_UNAVAILABLE");

  try {
    const userId = await getOrCreateUserId();
    const capturedRows = await sourceRows(userId, request);
    if (capturedRows.length > POINT_IN_TIME_BACKTEST_SOURCE_LIMIT) {
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

    const fallback = await historicalFallback({ request, capturedRows });
    const rows = [...capturedRows, ...fallback.rows];
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
      externalIssues: fallback.issues,
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
