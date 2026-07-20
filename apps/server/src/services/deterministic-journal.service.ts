import { randomUUID } from "node:crypto";
import type {
  DeterministicJournalAutomaticCaptureResponse,
  DeterministicJournalCaptureResponse,
  DeterministicJournalOutcomeUpdateRequest,
  DeterministicJournalOutcomeUpdateResponse,
  DeterministicJournalSnapshotListResponse,
  SpyZeroDteTradePlanAssemblyResponse,
} from "@spy-copilot/shared";
import { hasDatabaseUrl } from "../config/env";
import {
  buildAutomaticJournalCapturedResponse,
  buildAutomaticJournalDuplicateResponse,
  buildAutomaticJournalNoCaptureResponse,
  buildAutomaticJournalUnavailableResponse,
  buildCapturedJournalResponse,
  buildJournalCaptureUnavailableResponse,
  buildJournalListResponse,
  buildJournalOutcomeNotFoundResponse,
  buildJournalOutcomeUnavailableResponse,
  buildJournalOutcomeUpdatedResponse,
  buildJournalUnavailableListResponse,
  type DeterministicJournalSnapshotRow,
} from "./deterministic-journal.logic";
import { buildSpyZeroDteTradePlanAlertCandidate } from "./trade-plan-alert-candidate.logic";

const DEFAULT_USER_EMAIL = process.env.SCHWAB_DEFAULT_USER_EMAIL ?? "trader@local";
const JOURNAL_LIST_LIMIT = 200;

export interface AutomaticJournalInsertResult {
  row: DeterministicJournalSnapshotRow;
  inserted: boolean;
}

export interface DeterministicJournalRepository {
  list(userId: string, limit: number): Promise<DeterministicJournalSnapshotRow[]>;
  insertExplicit(
    userId: string,
    id: string,
    capturedAt: Date,
    assembly: SpyZeroDteTradePlanAssemblyResponse,
  ): Promise<DeterministicJournalSnapshotRow>;
  insertAutomaticCandidate(
    userId: string,
    id: string,
    capturedAt: Date,
    assembly: SpyZeroDteTradePlanAssemblyResponse,
    sourceReferenceKey: string,
  ): Promise<AutomaticJournalInsertResult>;
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

async function getRawPrisma(): Promise<PrismaRawClient> {
  const { prisma } = await import("../lib/prisma");
  return prisma as unknown as PrismaRawClient;
}

function rowFromAssembly(args: {
  id: string;
  capturedAt: Date;
  assembly: SpyZeroDteTradePlanAssemblyResponse;
  captureMode: "EXPLICIT" | "AUTOMATIC_CANDIDATE";
  sourceReferenceKey: string | null;
}): DeterministicJournalSnapshotRow {
  return {
    id: args.id,
    currentMarketDate: args.assembly.currentMarketDate,
    sourceCalculatedAt: new Date(args.assembly.calculatedAt),
    capturedAt: args.capturedAt,
    captureMode: args.captureMode,
    sourceReferenceType:
      args.captureMode === "AUTOMATIC_CANDIDATE"
        ? "TRADE_PLAN_ALERT_CANDIDATE"
        : null,
    sourceReferenceKey: args.sourceReferenceKey,
    engineState: args.assembly.engineState,
    planState: args.assembly.planState,
    direction: args.assembly.direction,
    confidenceScore: args.assembly.bias.confidenceScore,
    primaryReasonCode: args.assembly.primaryReasonCode,
    warningCode: args.assembly.warningCode,
    entryConditionState: args.assembly.entryCondition.state,
    selectedContractSymbol: args.assembly.selectedContract.contractSymbol,
    outcomeState: "UNREVIEWED",
    realizedPnlDollars: null,
    outcomeNotes: null,
    outcomeUpdatedAt: null,
  };
}

const prismaRepository: DeterministicJournalRepository = {
  async list(userId, limit) {
    const rawPrisma = await getRawPrisma();
    return rawPrisma.$queryRaw<DeterministicJournalSnapshotRow[]>`
      SELECT
        "id", "currentMarketDate", "sourceCalculatedAt", "capturedAt",
        "captureMode", "sourceReferenceType", "sourceReferenceKey",
        "engineState", "planState", "direction", "confidenceScore",
        "primaryReasonCode", "warningCode", "entryConditionState",
        "selectedContractSymbol", "outcomeState", "realizedPnlDollars",
        "outcomeNotes", "outcomeUpdatedAt"
      FROM "DeterministicJournalSnapshot"
      WHERE "userId" = ${userId}
      ORDER BY "capturedAt" DESC
      LIMIT ${limit}
    `;
  },

  async insertExplicit(userId, id, capturedAt, assembly) {
    const rawPrisma = await getRawPrisma();
    const sourceAssemblyJson = JSON.stringify(assembly);
    await rawPrisma.$executeRaw`
      INSERT INTO "DeterministicJournalSnapshot" (
        "id", "userId", "currentMarketDate", "sourceCalculatedAt", "capturedAt",
        "captureMode", "sourceReferenceType", "sourceReferenceKey",
        "engineState", "planState", "direction", "confidenceScore",
        "primaryReasonCode", "warningCode", "entryConditionState",
        "selectedContractSymbol", "sourceAssembly"
      ) VALUES (
        ${id}, ${userId}, ${assembly.currentMarketDate},
        ${new Date(assembly.calculatedAt)}, ${capturedAt},
        ${"EXPLICIT"}, ${null}, ${null},
        ${assembly.engineState}, ${assembly.planState}, ${assembly.direction},
        ${assembly.bias.confidenceScore}, ${assembly.primaryReasonCode},
        ${assembly.warningCode}, ${assembly.entryCondition.state},
        ${assembly.selectedContract.contractSymbol}, ${sourceAssemblyJson}::jsonb
      )
    `;
    return rowFromAssembly({
      id,
      capturedAt,
      assembly,
      captureMode: "EXPLICIT",
      sourceReferenceKey: null,
    });
  },

  async insertAutomaticCandidate(
    userId,
    id,
    capturedAt,
    assembly,
    sourceReferenceKey,
  ) {
    const rawPrisma = await getRawPrisma();
    const sourceAssemblyJson = JSON.stringify(assembly);
    const inserted = await rawPrisma.$queryRaw<DeterministicJournalSnapshotRow[]>`
      INSERT INTO "DeterministicJournalSnapshot" (
        "id", "userId", "currentMarketDate", "sourceCalculatedAt", "capturedAt",
        "captureMode", "sourceReferenceType", "sourceReferenceKey",
        "engineState", "planState", "direction", "confidenceScore",
        "primaryReasonCode", "warningCode", "entryConditionState",
        "selectedContractSymbol", "sourceAssembly"
      ) VALUES (
        ${id}, ${userId}, ${assembly.currentMarketDate},
        ${new Date(assembly.calculatedAt)}, ${capturedAt},
        ${"AUTOMATIC_CANDIDATE"}, ${"TRADE_PLAN_ALERT_CANDIDATE"},
        ${sourceReferenceKey}, ${assembly.engineState}, ${assembly.planState},
        ${assembly.direction}, ${assembly.bias.confidenceScore},
        ${assembly.primaryReasonCode}, ${assembly.warningCode},
        ${assembly.entryCondition.state}, ${assembly.selectedContract.contractSymbol},
        ${sourceAssemblyJson}::jsonb
      )
      ON CONFLICT ("userId", "sourceReferenceKey") DO NOTHING
      RETURNING
        "id", "currentMarketDate", "sourceCalculatedAt", "capturedAt",
        "captureMode", "sourceReferenceType", "sourceReferenceKey",
        "engineState", "planState", "direction", "confidenceScore",
        "primaryReasonCode", "warningCode", "entryConditionState",
        "selectedContractSymbol", "outcomeState", "realizedPnlDollars",
        "outcomeNotes", "outcomeUpdatedAt"
    `;

    if (inserted[0]) return { row: inserted[0], inserted: true };

    const existing = await rawPrisma.$queryRaw<DeterministicJournalSnapshotRow[]>`
      SELECT
        "id", "currentMarketDate", "sourceCalculatedAt", "capturedAt",
        "captureMode", "sourceReferenceType", "sourceReferenceKey",
        "engineState", "planState", "direction", "confidenceScore",
        "primaryReasonCode", "warningCode", "entryConditionState",
        "selectedContractSymbol", "outcomeState", "realizedPnlDollars",
        "outcomeNotes", "outcomeUpdatedAt"
      FROM "DeterministicJournalSnapshot"
      WHERE "userId" = ${userId} AND "sourceReferenceKey" = ${sourceReferenceKey}
      LIMIT 1
    `;
    if (!existing[0]) throw new Error("automatic journal deduplication row missing");
    return { row: existing[0], inserted: false };
  },

  async updateOutcome(userId, snapshotId, request, updatedAt) {
    const rawPrisma = await getRawPrisma();
    const persistedUpdatedAt = request.outcomeState === "UNREVIEWED" ? null : updatedAt;
    const rows = await rawPrisma.$queryRaw<DeterministicJournalSnapshotRow[]>`
      UPDATE "DeterministicJournalSnapshot"
      SET
        "outcomeState" = ${request.outcomeState},
        "realizedPnlDollars" = ${request.realizedPnlDollars},
        "outcomeNotes" = ${request.notes},
        "outcomeUpdatedAt" = ${persistedUpdatedAt}
      WHERE "id" = ${snapshotId} AND "userId" = ${userId}
      RETURNING
        "id", "currentMarketDate", "sourceCalculatedAt", "capturedAt",
        "captureMode", "sourceReferenceType", "sourceReferenceKey",
        "engineState", "planState", "direction", "confidenceScore",
        "primaryReasonCode", "warningCode", "entryConditionState",
        "selectedContractSymbol", "outcomeState", "realizedPnlDollars",
        "outcomeNotes", "outcomeUpdatedAt"
    `;
    return rows[0] ?? null;
  },
};

const defaultDependencies: DeterministicJournalServiceDependencies = {
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
  getAssembly: async () => {
    const { getSpyZeroDteTradePlanAssembly } = await import(
      "./trade-plan-assembly.service"
    );
    return getSpyZeroDteTradePlanAssembly();
  },
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
    return buildJournalUnavailableListResponse("DATABASE_NOT_CONFIGURED", calculatedAt);
  }
  try {
    const userId = await dependencies.getUserId();
    return buildJournalListResponse(
      await dependencies.repository.list(userId, JOURNAL_LIST_LIMIT),
      calculatedAt,
    );
  } catch {
    dependencies.log("list failed");
    return buildJournalUnavailableListResponse("DATABASE_UNAVAILABLE", calculatedAt);
  }
}

export async function captureDeterministicJournalSnapshotWithDependencies(
  dependencies: DeterministicJournalServiceDependencies,
): Promise<DeterministicJournalCaptureResponse> {
  const calculatedAt = dependencies.now();
  let assembly: SpyZeroDteTradePlanAssemblyResponse;
  try {
    assembly = await dependencies.getAssembly();
  } catch {
    return buildJournalCaptureUnavailableResponse("SOURCE_ASSEMBLY_UNAVAILABLE", calculatedAt);
  }
  if (assembly.engineState === "UNAVAILABLE") {
    return buildJournalCaptureUnavailableResponse("SOURCE_ASSEMBLY_UNAVAILABLE", calculatedAt);
  }
  if (!dependencies.databaseConfigured()) {
    return buildJournalCaptureUnavailableResponse("DATABASE_NOT_CONFIGURED", calculatedAt);
  }
  try {
    const userId = await dependencies.getUserId();
    const row = await dependencies.repository.insertExplicit(
      userId,
      dependencies.createId(),
      dependencies.now(),
      assembly,
    );
    return buildCapturedJournalResponse(row, assembly, calculatedAt);
  } catch {
    dependencies.log("capture failed");
    return buildJournalCaptureUnavailableResponse("DATABASE_UNAVAILABLE", calculatedAt);
  }
}

export async function automaticallyCaptureDeterministicJournalSnapshotWithDependencies(
  dependencies: DeterministicJournalServiceDependencies,
): Promise<DeterministicJournalAutomaticCaptureResponse> {
  const calculatedAt = dependencies.now();
  if (!dependencies.databaseConfigured()) {
    return buildAutomaticJournalUnavailableResponse(
      "DATABASE_NOT_CONFIGURED",
      calculatedAt,
    );
  }

  let assembly: SpyZeroDteTradePlanAssemblyResponse;
  try {
    assembly = await dependencies.getAssembly();
  } catch {
    return buildAutomaticJournalUnavailableResponse(
      "SOURCE_ASSEMBLY_UNAVAILABLE",
      calculatedAt,
    );
  }

  const candidate = buildSpyZeroDteTradePlanAlertCandidate(
    assembly,
    calculatedAt.getTime(),
  );
  if (assembly.engineState === "UNAVAILABLE" || candidate.engineState === "UNAVAILABLE") {
    return buildAutomaticJournalUnavailableResponse(
      "SOURCE_ASSEMBLY_UNAVAILABLE",
      calculatedAt,
      candidate,
    );
  }
  if (candidate.alertState !== "CANDIDATE" || candidate.candidate === null) {
    return buildAutomaticJournalNoCaptureResponse(candidate, calculatedAt);
  }

  try {
    const userId = await dependencies.getUserId();
    const result = await dependencies.repository.insertAutomaticCandidate(
      userId,
      dependencies.createId(),
      dependencies.now(),
      assembly,
      candidate.candidate.deduplicationKey,
    );
    return result.inserted
      ? buildAutomaticJournalCapturedResponse(
          result.row,
          assembly,
          candidate,
          calculatedAt,
        )
      : buildAutomaticJournalDuplicateResponse(
          result.row,
          assembly,
          candidate,
          calculatedAt,
        );
  } catch {
    dependencies.log("automatic capture failed");
    return buildAutomaticJournalUnavailableResponse(
      "DATABASE_UNAVAILABLE",
      calculatedAt,
      candidate,
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
    return buildJournalOutcomeUnavailableResponse("DATABASE_NOT_CONFIGURED", calculatedAt);
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
    return buildJournalOutcomeUnavailableResponse("DATABASE_UNAVAILABLE", calculatedAt);
  }
}

export const listDeterministicJournalSnapshots = () =>
  listDeterministicJournalSnapshotsWithDependencies(defaultDependencies);
export const captureDeterministicJournalSnapshot = () =>
  captureDeterministicJournalSnapshotWithDependencies(defaultDependencies);
export const automaticallyCaptureDeterministicJournalSnapshot = () =>
  automaticallyCaptureDeterministicJournalSnapshotWithDependencies(defaultDependencies);
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
