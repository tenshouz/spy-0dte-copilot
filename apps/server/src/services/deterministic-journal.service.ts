import { randomUUID } from "node:crypto";
import type {
  DeterministicJournalCaptureResponse,
  DeterministicJournalOutcomeUpdateRequest,
  DeterministicJournalOutcomeUpdateResponse,
  DeterministicJournalSnapshotListResponse,
  SpyZeroDteTradePlanAssemblyResponse,
} from "@spy-copilot/shared";
import { hasDatabaseUrl } from "../config/env";
import { prisma } from "../lib/prisma";
import {
  buildCapturedJournalResponse,
  buildJournalCaptureUnavailableResponse,
  buildJournalListResponse,
  buildJournalOutcomeNotFoundResponse,
  buildJournalOutcomeUnavailableResponse,
  buildJournalOutcomeUpdatedResponse,
  buildJournalUnavailableListResponse,
  type DeterministicJournalSnapshotRow,
} from "./deterministic-journal.logic";
import { getSpyZeroDteTradePlanAssembly } from "./trade-plan-assembly.service";

const DEFAULT_USER_EMAIL =
  process.env.SCHWAB_DEFAULT_USER_EMAIL ?? "trader@local";
const JOURNAL_LIST_LIMIT = 200;

export interface DeterministicJournalRepository {
  list(userId: string, limit: number): Promise<DeterministicJournalSnapshotRow[]>;
  insert(
    userId: string,
    id: string,
    capturedAt: Date,
    assembly: SpyZeroDteTradePlanAssemblyResponse,
  ): Promise<DeterministicJournalSnapshotRow>;
  updateOutcome(
    userId: string,
    snapshotId: string,
    request: DeterministicJournalOutcomeUpdateRequest,
    updatedAt: Date,
  ): Promise<DeterministicJournalSnapshotRow | null>;
}

export interface DeterministicJournalServiceDependencies {
  databaseConfigured: () => boolean;
  getUserId: () => Promise<string>;
  repository: DeterministicJournalRepository;
  getAssembly: () => Promise<SpyZeroDteTradePlanAssemblyResponse>;
  now: () => Date;
  createId: () => string;
  log: (category: string) => void;
}

interface PrismaRawClient {
  $queryRaw<T>(query: TemplateStringsArray, ...values: unknown[]): Promise<T>;
  $executeRaw(query: TemplateStringsArray, ...values: unknown[]): Promise<number>;
}

const rawPrisma = prisma as unknown as PrismaRawClient;

const prismaRepository: DeterministicJournalRepository = {
  async list(userId, limit) {
    return rawPrisma.$queryRaw<DeterministicJournalSnapshotRow[]>`
      SELECT
        "id",
        "currentMarketDate",
        "sourceCalculatedAt",
        "capturedAt",
        "engineState",
        "planState",
        "direction",
        "confidenceScore",
        "primaryReasonCode",
        "warningCode",
        "entryConditionState",
        "selectedContractSymbol",
        "outcomeState",
        "realizedPnlDollars",
        "outcomeNotes",
        "outcomeUpdatedAt"
      FROM "DeterministicJournalSnapshot"
      WHERE "userId" = ${userId}
      ORDER BY "capturedAt" DESC
      LIMIT ${limit}
    `;
  },

  async insert(userId, id, capturedAt, assembly) {
    const sourceAssemblyJson = JSON.stringify(assembly);
    await rawPrisma.$executeRaw`
      INSERT INTO "DeterministicJournalSnapshot" (
        "id",
        "userId",
        "currentMarketDate",
        "sourceCalculatedAt",
        "capturedAt",
        "engineState",
        "planState",
        "direction",
        "confidenceScore",
        "primaryReasonCode",
        "warningCode",
        "entryConditionState",
        "selectedContractSymbol",
        "sourceAssembly"
      ) VALUES (
        ${id},
        ${userId},
        ${assembly.currentMarketDate},
        ${new Date(assembly.calculatedAt)},
        ${capturedAt},
        ${assembly.engineState},
        ${assembly.planState},
        ${assembly.direction},
        ${assembly.bias.confidenceScore},
        ${assembly.primaryReasonCode},
        ${assembly.warningCode},
        ${assembly.entryCondition.state},
        ${assembly.selectedContract.contractSymbol},
        ${sourceAssemblyJson}::jsonb
      )
    `;

    return {
      id,
      currentMarketDate: assembly.currentMarketDate,
      sourceCalculatedAt: new Date(assembly.calculatedAt),
      capturedAt,
      engineState: assembly.engineState,
      planState: assembly.planState,
      direction: assembly.direction,
      confidenceScore: assembly.bias.confidenceScore,
      primaryReasonCode: assembly.primaryReasonCode,
      warningCode: assembly.warningCode,
      entryConditionState: assembly.entryCondition.state,
      selectedContractSymbol: assembly.selectedContract.contractSymbol,
      outcomeState: "UNREVIEWED",
      realizedPnlDollars: null,
      outcomeNotes: null,
      outcomeUpdatedAt: null,
    };
  },

  async updateOutcome(userId, snapshotId, request, updatedAt) {
    const persistedUpdatedAt =
      request.outcomeState === "UNREVIEWED" ? null : updatedAt;
    const rows = await rawPrisma.$queryRaw<DeterministicJournalSnapshotRow[]>`
      UPDATE "DeterministicJournalSnapshot"
      SET
        "outcomeState" = ${request.outcomeState},
        "realizedPnlDollars" = ${request.realizedPnlDollars},
        "outcomeNotes" = ${request.notes},
        "outcomeUpdatedAt" = ${persistedUpdatedAt}
      WHERE "id" = ${snapshotId} AND "userId" = ${userId}
      RETURNING
        "id",
        "currentMarketDate",
        "sourceCalculatedAt",
        "capturedAt",
        "engineState",
        "planState",
        "direction",
        "confidenceScore",
        "primaryReasonCode",
        "warningCode",
        "entryConditionState",
        "selectedContractSymbol",
        "outcomeState",
        "realizedPnlDollars",
        "outcomeNotes",
        "outcomeUpdatedAt"
    `;

    return rows[0] ?? null;
  },
};


const defaultDependencies: DeterministicJournalServiceDependencies = {
  databaseConfigured: () => hasDatabaseUrl,
  getUserId: async () => {
    const user = await prisma.user.upsert({
      where: { email: DEFAULT_USER_EMAIL },
      update: {},
      create: { email: DEFAULT_USER_EMAIL },
      select: { id: true },
    });
    return user.id;
  },
  repository: prismaRepository,
  getAssembly: getSpyZeroDteTradePlanAssembly,
  now: () => new Date(),
  createId: randomUUID,
  log: (category) => {
    // Fixed category only; never log snapshot data or user-entered values.
    // eslint-disable-next-line no-console
    console.error(`[deterministic-journal] ${category}`);
  },
};

export async function listDeterministicJournalSnapshotsWithDependencies(
  dependencies: DeterministicJournalServiceDependencies,
): Promise<DeterministicJournalSnapshotListResponse> {
  const calculatedAt = dependencies.now();
  if (!dependencies.databaseConfigured()) {
    return buildJournalUnavailableListResponse(
      "DATABASE_NOT_CONFIGURED",
      calculatedAt,
    );
  }

  try {
    const userId = await dependencies.getUserId();
    const rows = await dependencies.repository.list(userId, JOURNAL_LIST_LIMIT);
    return buildJournalListResponse(rows, calculatedAt);
  } catch {
    dependencies.log("list failed");
    return buildJournalUnavailableListResponse(
      "DATABASE_UNAVAILABLE",
      calculatedAt,
    );
  }
}

export async function captureDeterministicJournalSnapshotWithDependencies(
  dependencies: DeterministicJournalServiceDependencies,
): Promise<DeterministicJournalCaptureResponse> {
  const calculatedAt = dependencies.now();
  const assembly = await dependencies.getAssembly();

  if (assembly.engineState === "UNAVAILABLE") {
    return buildJournalCaptureUnavailableResponse(
      "SOURCE_ASSEMBLY_UNAVAILABLE",
      calculatedAt,
    );
  }

  if (!dependencies.databaseConfigured()) {
    return buildJournalCaptureUnavailableResponse(
      "DATABASE_NOT_CONFIGURED",
      calculatedAt,
    );
  }

  try {
    const userId = await dependencies.getUserId();
    const capturedAt = dependencies.now();
    const row = await dependencies.repository.insert(
      userId,
      dependencies.createId(),
      capturedAt,
      assembly,
    );
    return buildCapturedJournalResponse(row, assembly, calculatedAt);
  } catch {
    dependencies.log("capture failed");
    return buildJournalCaptureUnavailableResponse(
      "DATABASE_UNAVAILABLE",
      calculatedAt,
    );
  }
}

export async function updateDeterministicJournalOutcomeWithDependencies(
  dependencies: DeterministicJournalServiceDependencies,
  snapshotId: string,
  request: DeterministicJournalOutcomeUpdateRequest,
): Promise<DeterministicJournalOutcomeUpdateResponse> {
  const calculatedAt = dependencies.now();
  if (!dependencies.databaseConfigured()) {
    return buildJournalOutcomeUnavailableResponse(
      "DATABASE_NOT_CONFIGURED",
      calculatedAt,
    );
  }

  try {
    const userId = await dependencies.getUserId();
    const row = await dependencies.repository.updateOutcome(
      userId,
      snapshotId,
      request,
      dependencies.now(),
    );
    return row === null
      ? buildJournalOutcomeNotFoundResponse(calculatedAt)
      : buildJournalOutcomeUpdatedResponse(row, calculatedAt);
  } catch {
    dependencies.log("outcome update failed");
    return buildJournalOutcomeUnavailableResponse(
      "DATABASE_UNAVAILABLE",
      calculatedAt,
    );
  }
}

export function listDeterministicJournalSnapshots(): Promise<DeterministicJournalSnapshotListResponse> {
  return listDeterministicJournalSnapshotsWithDependencies(defaultDependencies);
}

export function captureDeterministicJournalSnapshot(): Promise<DeterministicJournalCaptureResponse> {
  return captureDeterministicJournalSnapshotWithDependencies(defaultDependencies);
}

export function updateDeterministicJournalOutcome(
  snapshotId: string,
  request: DeterministicJournalOutcomeUpdateRequest,
): Promise<DeterministicJournalOutcomeUpdateResponse> {
  return updateDeterministicJournalOutcomeWithDependencies(
    defaultDependencies,
    snapshotId,
    request,
  );
}
