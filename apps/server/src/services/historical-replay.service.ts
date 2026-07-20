import { randomUUID } from "node:crypto";
import type {
  HistoricalReplayHistoryResponse,
  HistoricalReplayRunPayload,
  HistoricalReplayRunRequest,
  HistoricalReplayRunResponse,
} from "@spy-copilot/shared";
import { hasDatabaseUrl } from "../config/env";
import {
  HISTORICAL_REPLAY_SNAPSHOT_LIMIT,
  buildHistoricalReplayHistoryResponse,
  buildHistoricalReplayHistoryUnavailableResponse,
  buildHistoricalReplayNotFoundResponse,
  buildHistoricalReplayRunPayload,
  buildHistoricalReplayRunResponse,
  buildHistoricalReplayUnavailableResponse,
  mapHistoricalReplayRunRow,
  type HistoricalReplayRunRow,
  type HistoricalReplaySourceRow,
} from "./historical-replay.logic";

const DEFAULT_USER_EMAIL = process.env.SCHWAB_DEFAULT_USER_EMAIL ?? "trader@local";
const REPLAY_HISTORY_LIMIT = 50;

export interface HistoricalReplayRepository {
  listSourceSnapshots(
    userId: string,
    request: HistoricalReplayRunRequest,
    limit: number,
  ): Promise<HistoricalReplaySourceRow[]>;
  insertRun(userId: string, run: HistoricalReplayRunPayload): Promise<void>;
  listRuns(userId: string, limit: number): Promise<HistoricalReplayRunRow[]>;
  getRun(userId: string, runId: string): Promise<HistoricalReplayRunRow | null>;
}

export interface HistoricalReplayServiceDependencies {
  databaseConfigured: () => boolean;
  getUserId: () => Promise<string>;
  repository: HistoricalReplayRepository;
  now: () => Date;
  createId: () => string;
  log: (category: string) => void;
}

interface PrismaRawClient {
  $queryRaw<T>(query: TemplateStringsArray, ...values: unknown[]): Promise<T>;
  $executeRaw(query: TemplateStringsArray, ...values: unknown[]): Promise<number>;
}

async function getRawPrisma(): Promise<PrismaRawClient> {
  const { prisma } = await import("../lib/prisma");
  return prisma as unknown as PrismaRawClient;
}

const prismaRepository: HistoricalReplayRepository = {
  async listSourceSnapshots(userId, request, limit) {
    const rawPrisma = await getRawPrisma();
    return rawPrisma.$queryRaw<HistoricalReplaySourceRow[]>`
      SELECT
        "id", "currentMarketDate", "sourceCalculatedAt", "capturedAt",
        "captureMode", "engineState", "planState", "direction",
        "confidenceScore", "primaryReasonCode", "warningCode",
        "entryConditionState", "selectedContractSymbol", "sourceAssembly",
        "outcomeState", "realizedPnlDollars", "outcomeUpdatedAt"
      FROM "DeterministicJournalSnapshot"
      WHERE "userId" = ${userId}
        AND (
          ${request.startMarketDate}::text IS NULL OR
          "currentMarketDate" >= ${request.startMarketDate}
        )
        AND (
          ${request.endMarketDate}::text IS NULL OR
          "currentMarketDate" <= ${request.endMarketDate}
        )
      ORDER BY "sourceCalculatedAt" ASC, "capturedAt" ASC, "id" ASC
      LIMIT ${limit}
    `;
  },

  async insertRun(userId, run) {
    const rawPrisma = await getRawPrisma();
    const resultJson = JSON.stringify(run);
    await rawPrisma.$executeRaw`
      INSERT INTO "HistoricalReplayRun" (
        "id", "userId", "createdAt", "startMarketDate", "endMarketDate",
        "snapshotCount", "marketDateCount", "auditState",
        "auditFailureCount", "stateChangeCount", "tradeOutcomeCount",
        "totalPnlDollars", "result"
      ) VALUES (
        ${run.id}, ${userId}, ${new Date(run.createdAt)},
        ${run.request.startMarketDate}, ${run.request.endMarketDate},
        ${run.source.snapshotCount}, ${run.source.marketDateCount},
        ${run.audit.auditState}, ${run.audit.snapshotFailCount},
        ${run.timeline.stateChangeCount}, ${run.outcomeSummary.tradeOutcomeCount},
        ${run.outcomeSummary.totalPnlDollars}, ${resultJson}::jsonb
      )
    `;
  },

  async listRuns(userId, limit) {
    const rawPrisma = await getRawPrisma();
    return rawPrisma.$queryRaw<HistoricalReplayRunRow[]>`
      SELECT
        "id", "createdAt", "startMarketDate", "endMarketDate",
        "snapshotCount", "marketDateCount", "auditState",
        "auditFailureCount", "stateChangeCount", "tradeOutcomeCount",
        "totalPnlDollars", '{}'::jsonb AS "result"
      FROM "HistoricalReplayRun"
      WHERE "userId" = ${userId}
      ORDER BY "createdAt" DESC
      LIMIT ${limit}
    `;
  },

  async getRun(userId, runId) {
    const rawPrisma = await getRawPrisma();
    const rows = await rawPrisma.$queryRaw<HistoricalReplayRunRow[]>`
      SELECT
        "id", "createdAt", "startMarketDate", "endMarketDate",
        "snapshotCount", "marketDateCount", "auditState",
        "auditFailureCount", "stateChangeCount", "tradeOutcomeCount",
        "totalPnlDollars", "result"
      FROM "HistoricalReplayRun"
      WHERE "userId" = ${userId} AND "id" = ${runId}
      LIMIT 1
    `;
    return rows[0] ?? null;
  },
};

const defaultDependencies: HistoricalReplayServiceDependencies = {
  databaseConfigured: () => hasDatabaseUrl,
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
  now: () => new Date(),
  createId: randomUUID,
  log: (category) => {
    // Fixed category only. Never log persisted snapshots or replay payloads.
    // eslint-disable-next-line no-console
    console.error(`[historical-replay] ${category}`);
  },
};

export async function createHistoricalReplayRunWithDependencies(
  dependencies: HistoricalReplayServiceDependencies,
  request: HistoricalReplayRunRequest,
): Promise<HistoricalReplayRunResponse> {
  const calculatedAt = dependencies.now();
  if (!dependencies.databaseConfigured()) {
    return buildHistoricalReplayUnavailableResponse(
      "DATABASE_NOT_CONFIGURED",
      calculatedAt,
    );
  }

  try {
    const userId = await dependencies.getUserId();
    const rows = await dependencies.repository.listSourceSnapshots(
      userId,
      request,
      HISTORICAL_REPLAY_SNAPSHOT_LIMIT + 1,
    );
    const snapshotLimitReached =
      rows.length > HISTORICAL_REPLAY_SNAPSHOT_LIMIT;
    const run = buildHistoricalReplayRunPayload({
      id: dependencies.createId(),
      createdAt: calculatedAt,
      request,
      rows: rows.slice(0, HISTORICAL_REPLAY_SNAPSHOT_LIMIT),
      snapshotLimitReached,
    });
    await dependencies.repository.insertRun(userId, run);
    return buildHistoricalReplayRunResponse(run, calculatedAt);
  } catch {
    dependencies.log("create replay run failed");
    return buildHistoricalReplayUnavailableResponse(
      "DATABASE_UNAVAILABLE",
      calculatedAt,
    );
  }
}

export async function listHistoricalReplayRunsWithDependencies(
  dependencies: HistoricalReplayServiceDependencies,
): Promise<HistoricalReplayHistoryResponse> {
  const calculatedAt = dependencies.now();
  if (!dependencies.databaseConfigured()) {
    return buildHistoricalReplayHistoryUnavailableResponse(
      "DATABASE_NOT_CONFIGURED",
      calculatedAt,
    );
  }

  try {
    const userId = await dependencies.getUserId();
    const rows = await dependencies.repository.listRuns(
      userId,
      REPLAY_HISTORY_LIMIT,
    );
    return buildHistoricalReplayHistoryResponse(rows, calculatedAt);
  } catch {
    dependencies.log("list replay runs failed");
    return buildHistoricalReplayHistoryUnavailableResponse(
      "DATABASE_UNAVAILABLE",
      calculatedAt,
    );
  }
}

export async function getHistoricalReplayRunWithDependencies(
  dependencies: HistoricalReplayServiceDependencies,
  runId: string,
): Promise<HistoricalReplayRunResponse> {
  const calculatedAt = dependencies.now();
  if (!dependencies.databaseConfigured()) {
    return buildHistoricalReplayUnavailableResponse(
      "DATABASE_NOT_CONFIGURED",
      calculatedAt,
    );
  }

  try {
    const userId = await dependencies.getUserId();
    const row = await dependencies.repository.getRun(userId, runId);
    if (row === null) return buildHistoricalReplayNotFoundResponse(calculatedAt);
    return buildHistoricalReplayRunResponse(
      mapHistoricalReplayRunRow(row),
      calculatedAt,
    );
  } catch {
    dependencies.log("get replay run failed");
    return buildHistoricalReplayUnavailableResponse(
      "DATABASE_UNAVAILABLE",
      calculatedAt,
    );
  }
}

export const createHistoricalReplayRun = (
  request: HistoricalReplayRunRequest,
) => createHistoricalReplayRunWithDependencies(defaultDependencies, request);

export const listHistoricalReplayRuns = () =>
  listHistoricalReplayRunsWithDependencies(defaultDependencies);

export const getHistoricalReplayRun = (runId: string) =>
  getHistoricalReplayRunWithDependencies(defaultDependencies, runId);
