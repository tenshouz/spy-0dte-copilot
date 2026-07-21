import type { EmpiricalGammaResearchResponse } from "@spy-copilot/shared";
import { hasDatabaseUrl } from "../config/env";
import {
  buildEmpiricalGammaResearchResponse,
  buildEmpiricalGammaResearchUnavailableResponse,
  type EmpiricalGammaResearchRow,
} from "./empirical-gamma-research.logic";

const DEFAULT_USER_EMAIL = process.env.SCHWAB_DEFAULT_USER_EMAIL ?? "trader@local";

interface PrismaRawClient {
  $queryRaw<T>(query: TemplateStringsArray, ...values: unknown[]): Promise<T>;
}

async function getRawPrisma(): Promise<PrismaRawClient> {
  const { prisma } = await import("../lib/prisma");
  return prisma as unknown as PrismaRawClient;
}

export interface EmpiricalGammaResearchRepositoryResult {
  totalPersistedSnapshots: number;
  rows: EmpiricalGammaResearchRow[];
}

export interface EmpiricalGammaResearchRepository {
  loadReviewedOutcomes(
    userId: string,
  ): Promise<EmpiricalGammaResearchRepositoryResult>;
}

export interface EmpiricalGammaResearchServiceDependencies {
  databaseConfigured: () => boolean;
  getUserId: () => Promise<string>;
  repository: EmpiricalGammaResearchRepository;
  now: () => Date;
  log: (category: string) => void;
}

const prismaRepository: EmpiricalGammaResearchRepository = {
  async loadReviewedOutcomes(userId) {
    const rawPrisma = await getRawPrisma();
    const [countRows, rows] = await Promise.all([
      rawPrisma.$queryRaw<Array<{ count: bigint }>>`
        SELECT COUNT(*)::bigint AS "count"
        FROM "DeterministicJournalSnapshot"
        WHERE "userId" = ${userId}
      `,
      rawPrisma.$queryRaw<EmpiricalGammaResearchRow[]>`
        SELECT
          "currentMarketDate", "planState", "direction", "outcomeState",
          "realizedPnlDollars", "sourceAssembly"
        FROM "DeterministicJournalSnapshot"
        WHERE
          "userId" = ${userId}
          AND "outcomeState" IN ('WIN', 'LOSS', 'BREAKEVEN')
          AND "realizedPnlDollars" IS NOT NULL
        ORDER BY "currentMarketDate" ASC, "capturedAt" ASC
      `,
    ]);
    return {
      totalPersistedSnapshots: Number(countRows[0]?.count ?? 0n),
      rows,
    };
  },
};

const defaultDependencies: EmpiricalGammaResearchServiceDependencies = {
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
    // Fixed category only; never log persisted market context or user-entered P&L.
    // eslint-disable-next-line no-console
    console.error(`[empirical-gamma-research] ${category}`);
  },
};

export async function getEmpiricalGammaResearchWithDependencies(
  dependencies: EmpiricalGammaResearchServiceDependencies,
): Promise<EmpiricalGammaResearchResponse> {
  const calculatedAt = dependencies.now();
  if (!dependencies.databaseConfigured()) {
    return buildEmpiricalGammaResearchUnavailableResponse(
      "DATABASE_NOT_CONFIGURED",
      calculatedAt,
    );
  }

  try {
    const userId = await dependencies.getUserId();
    const result = await dependencies.repository.loadReviewedOutcomes(userId);
    return buildEmpiricalGammaResearchResponse(
      result.rows,
      calculatedAt,
      result.totalPersistedSnapshots,
    );
  } catch {
    dependencies.log("research failed");
    return buildEmpiricalGammaResearchUnavailableResponse(
      "DATABASE_UNAVAILABLE",
      calculatedAt,
    );
  }
}

export const getEmpiricalGammaResearch = () =>
  getEmpiricalGammaResearchWithDependencies(defaultDependencies);
