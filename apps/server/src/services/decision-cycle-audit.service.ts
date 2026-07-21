import { randomUUID } from "node:crypto";
import type {
  SpyZeroDteDeterministicMarketStateResponse,
  SpyZeroDteOptionsChainResponse,
  SpyZeroDteTradePlanAssemblyResponse,
} from "@spy-copilot/shared";
import { hasDatabaseUrl } from "../config/env";

const DEFAULT_USER_EMAIL = process.env.SCHWAB_DEFAULT_USER_EMAIL ?? "trader@local";

interface PrismaRawClient {
  $queryRaw<T>(query: TemplateStringsArray, ...values: unknown[]): Promise<T>;
  $executeRaw(query: TemplateStringsArray, ...values: unknown[]): Promise<number>;
}

export interface DecisionCycleAuditDependencies {
  databaseConfigured: () => boolean;
  getUserId: () => Promise<string>;
  insert: (
    userId: string,
    id: string,
    sourceReferenceKey: string,
    capturedAt: Date,
    assembly: SpyZeroDteTradePlanAssemblyResponse,
    marketState: SpyZeroDteDeterministicMarketStateResponse | null,
    optionsChain: SpyZeroDteOptionsChainResponse | null,
  ) => Promise<void>;
  now: () => Date;
  createId: () => string;
  log: (category: string) => void;
}

export function deterministicDecisionCycleKey(
  assembly: SpyZeroDteTradePlanAssemblyResponse,
): string {
  return [
    "ASSEMBLY_DECISION_CYCLE_V2",
    assembly.currentMarketDate,
    assembly.calculatedAt,
  ].join("|");
}

export function pointInTimeOptionsChainKey(
  optionsChain: SpyZeroDteOptionsChainResponse,
): string {
  return [
    "POINT_IN_TIME_OPTIONS_CHAIN_V1",
    optionsChain.currentMarketDate,
    optionsChain.fetchedAt,
  ].join("|");
}

async function getRawPrisma(): Promise<PrismaRawClient> {
  const { prisma } = await import("../lib/prisma");
  return prisma as unknown as PrismaRawClient;
}

const defaultDependencies: DecisionCycleAuditDependencies = {
  databaseConfigured: () => hasDatabaseUrl,
  getUserId: async () => {
    const rawPrisma = await getRawPrisma();
    const rows = await rawPrisma.$queryRaw<Array<{ id: string }>>`
      INSERT INTO "User" ("id", "email", "createdAt")
      VALUES (${randomUUID()}, ${DEFAULT_USER_EMAIL}, ${new Date()})
      ON CONFLICT ("email") DO UPDATE SET "email" = EXCLUDED."email"
      RETURNING "id"
    `;
    if (!rows[0]) throw new Error("decision-cycle audit user unavailable");
    return rows[0].id;
  },
  insert: async (
    userId,
    id,
    sourceReferenceKey,
    capturedAt,
    assembly,
    marketState,
    optionsChain,
  ) => {
    const rawPrisma = await getRawPrisma();
    let optionsChainSnapshotId: string | null = null;

    if (optionsChain !== null) {
      const sourceKey = pointInTimeOptionsChainKey(optionsChain);
      const chainRows = await rawPrisma.$queryRaw<Array<{ id: string }>>`
        INSERT INTO "PointInTimeOptionsChainSnapshot" (
          "id", "userId", "sourceKey", "currentMarketDate", "fetchedAt",
          "capturedAt", "metricState", "sourceState", "payload"
        ) VALUES (
          ${randomUUID()}, ${userId}, ${sourceKey}, ${optionsChain.currentMarketDate},
          ${new Date(optionsChain.fetchedAt)}, ${capturedAt}, ${optionsChain.metricState},
          ${optionsChain.sourceState}, ${JSON.stringify(optionsChain)}::jsonb
        )
        ON CONFLICT ("userId", "sourceKey")
        DO UPDATE SET "sourceKey" = EXCLUDED."sourceKey"
        RETURNING "id"
      `;
      optionsChainSnapshotId = chainRows[0]?.id ?? null;
    }

    const sourceAssembly = JSON.stringify(assembly);
    const sourceMarketState = marketState === null ? null : JSON.stringify(marketState);
    await rawPrisma.$executeRaw`
      INSERT INTO "DeterministicDecisionCycle" (
        "id", "userId", "sourceReferenceKey", "currentMarketDate",
        "sourceCalculatedAt", "capturedAt", "engineState", "planState",
        "direction", "setupType", "triggerLifecycleState",
        "confirmationPassed", "executionAlignmentScore",
        "snapshotIntegrityState", "selectedContractSymbol",
        "primaryReasonCode", "warningCode", "sourceAssembly",
        "sourceMarketState", "optionsChainSnapshotId"
      ) VALUES (
        ${id}, ${userId}, ${sourceReferenceKey}, ${assembly.currentMarketDate},
        ${new Date(assembly.calculatedAt)}, ${capturedAt}, ${assembly.engineState},
        ${assembly.planState}, ${assembly.direction},
        ${assembly.entryCondition.setupType ?? null},
        ${assembly.entryCondition.triggerLifecycleState ?? null},
        ${assembly.entryCondition.confirmationPassed ?? null},
        ${assembly.planConfidence?.executionQualityAlignmentScore ?? null},
        ${assembly.sourceSummary.marketState.snapshotIntegrityState ?? null},
        ${assembly.selectedContract.contractSymbol}, ${assembly.primaryReasonCode},
        ${assembly.warningCode}, ${sourceAssembly}::jsonb,
        ${sourceMarketState}::jsonb, ${optionsChainSnapshotId}
      )
      ON CONFLICT ("userId", "sourceReferenceKey") DO UPDATE SET
        "sourceMarketState" = COALESCE(
          "DeterministicDecisionCycle"."sourceMarketState",
          EXCLUDED."sourceMarketState"
        ),
        "optionsChainSnapshotId" = COALESCE(
          "DeterministicDecisionCycle"."optionsChainSnapshotId",
          EXCLUDED."optionsChainSnapshotId"
        )
    `;
  },
  now: () => new Date(),
  createId: randomUUID,
  log: (category) => {
    // Fixed category only; never log market data, account data, or credentials.
    // eslint-disable-next-line no-console
    console.error(`[decision-cycle-audit] ${category}`);
  },
};

export async function captureDeterministicDecisionCycleWithDependencies(
  assembly: SpyZeroDteTradePlanAssemblyResponse,
  dependencies: DecisionCycleAuditDependencies,
  marketState: SpyZeroDteDeterministicMarketStateResponse | null = null,
  optionsChain: SpyZeroDteOptionsChainResponse | null = null,
): Promise<"CAPTURED_OR_DUPLICATE" | "SKIPPED" | "FAILED"> {
  // Last-resort unavailable assemblies are not useful calibration observations.
  if (!dependencies.databaseConfigured() || assembly.engineState === "UNAVAILABLE") {
    return "SKIPPED";
  }
  try {
    const userId = await dependencies.getUserId();
    await dependencies.insert(
      userId,
      dependencies.createId(),
      deterministicDecisionCycleKey(assembly),
      dependencies.now(),
      assembly,
      marketState,
      optionsChain,
    );
    return "CAPTURED_OR_DUPLICATE";
  } catch {
    dependencies.log("capture failed");
    return "FAILED";
  }
}

export function captureDeterministicDecisionCycle(
  assembly: SpyZeroDteTradePlanAssemblyResponse,
  marketState: SpyZeroDteDeterministicMarketStateResponse | null = null,
  optionsChain: SpyZeroDteOptionsChainResponse | null = null,
): Promise<"CAPTURED_OR_DUPLICATE" | "SKIPPED" | "FAILED"> {
  return captureDeterministicDecisionCycleWithDependencies(
    assembly,
    defaultDependencies,
    marketState,
    optionsChain,
  );
}
