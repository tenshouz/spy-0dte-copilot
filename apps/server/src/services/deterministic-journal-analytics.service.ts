import type { DeterministicJournalAnalyticsResponse } from "@spy-copilot/shared";
import { hasDatabaseUrl } from "../config/env";
import {
  buildDeterministicJournalAnalyticsResponse,
  buildDeterministicJournalAnalyticsUnavailableResponse,
  type DeterministicJournalAnalyticsRow,
} from "./deterministic-journal-analytics.logic";

const DEFAULT_USER_EMAIL = process.env.SCHWAB_DEFAULT_USER_EMAIL ?? "trader@local";

interface PrismaRawClient {
  $queryRaw<T>(query: TemplateStringsArray, ...values: unknown[]): Promise<T>;
}

async function getRawPrisma(): Promise<PrismaRawClient> {
  const { prisma } = await import("../lib/prisma");
  return prisma as unknown as PrismaRawClient;
}

export interface DeterministicJournalAnalyticsRepository {
  listAll(userId: string): Promise<DeterministicJournalAnalyticsRow[]>;
}

export interface DeterministicJournalAnalyticsServiceDependencies {
  databaseConfigured: () => boolean;
  getUserId: () => Promise<string>;
  repository: DeterministicJournalAnalyticsRepository;
  now: () => Date;
  log: (category: string) => void;
}

const prismaRepository: DeterministicJournalAnalyticsRepository = {
  async listAll(userId) {
    const rawPrisma = await getRawPrisma();
    return rawPrisma.$queryRaw<DeterministicJournalAnalyticsRow[]>`
      SELECT
        "currentMarketDate", "captureMode", "planState", "direction",
        "confidenceScore", "outcomeState", "realizedPnlDollars"
      FROM "DeterministicJournalSnapshot"
      WHERE "userId" = ${userId}
      ORDER BY "currentMarketDate" ASC, "capturedAt" ASC
    `;
  },
};

const defaultDependencies: DeterministicJournalAnalyticsServiceDependencies = {
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
  log: (category) => {
    // Fixed category only; never log persisted rows or user-entered P&L.
    // eslint-disable-next-line no-console
    console.error(`[deterministic-journal-analytics] ${category}`);
  },
};

export async function getDeterministicJournalAnalyticsWithDependencies(
  dependencies: DeterministicJournalAnalyticsServiceDependencies,
): Promise<DeterministicJournalAnalyticsResponse> {
  const calculatedAt = dependencies.now();
  if (!dependencies.databaseConfigured()) {
    return buildDeterministicJournalAnalyticsUnavailableResponse(
      "DATABASE_NOT_CONFIGURED",
      calculatedAt,
    );
  }

  try {
    const userId = await dependencies.getUserId();
    const rows = await dependencies.repository.listAll(userId);
    return buildDeterministicJournalAnalyticsResponse(rows, calculatedAt);
  } catch {
    dependencies.log("analytics failed");
    return buildDeterministicJournalAnalyticsUnavailableResponse(
      "DATABASE_UNAVAILABLE",
      calculatedAt,
    );
  }
}

export const getDeterministicJournalAnalytics = () =>
  getDeterministicJournalAnalyticsWithDependencies(defaultDependencies);
