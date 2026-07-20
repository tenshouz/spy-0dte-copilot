/**
 * Deterministic tests for JOURNAL_SNAPSHOT_V3 persistence, automatic candidate capture,
 * database deduplication, and user-entered outcome annotation.
 * Run: npx --no-install tsx apps/server/src/services/deterministic-journal.spec.ts
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  DeterministicJournalAutomaticCaptureRequestSchema,
  DeterministicJournalAutomaticCaptureResponseSchema,
  DeterministicJournalCaptureRequestSchema,
  DeterministicJournalCaptureResponseSchema,
  DeterministicJournalOutcomeUpdateRequestSchema,
  DeterministicJournalOutcomeUpdateResponseSchema,
  DeterministicJournalSnapshotListResponseSchema,
  type DeterministicJournalOutcomeUpdateRequest,
  type SpyZeroDteTradePlanAssemblyResponse,
} from "@spy-copilot/shared";
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
  mapJournalRowToEntry,
  type DeterministicJournalSnapshotRow,
} from "./deterministic-journal.logic";
import {
  automaticallyCaptureDeterministicJournalSnapshotWithDependencies,
  captureDeterministicJournalSnapshotWithDependencies,
  listDeterministicJournalSnapshotsWithDependencies,
  updateDeterministicJournalOutcomeWithDependencies,
  type DeterministicJournalServiceDependencies,
} from "./deterministic-journal.service";
import { buildSpyZeroDteTradePlanAlertCandidate } from "./trade-plan-alert-candidate.logic";

const NOW = new Date("2026-07-20T14:35:00.000Z");
const UPDATED_AT = new Date("2026-07-20T20:00:00.000Z");

function assembly(
  overrides: Partial<SpyZeroDteTradePlanAssemblyResponse> = {},
): SpyZeroDteTradePlanAssemblyResponse {
  const base = {
    symbol: "SPY",
    product: "SPY_ZERO_DTE_DETERMINISTIC_TRADE_PLAN_ASSEMBLY",
    methodologyVersion: "ASSEMBLY_V1",
    currentMarketDate: "2026-07-20",
    calculatedAt: "2026-07-20T14:34:59.000Z",
    engineState: "AVAILABLE",
    planState: "READY",
    direction: "CALLS",
    primaryReasonCode: "TRADE_PLAN_READY",
    warningCode: null,
    bias: { confidenceScore: 82 },
    entryCondition: {
      state: "SATISFIED",
      planningReferenceType: "CURRENT_PRICE",
      planningReferencePrice: 640.25,
      currentPrice: 640.25,
      triggerLevel: 640,
      comparison: "PRICE_GREATER_THAN",
    },
    structuralInvalidation: { level: 639.5 },
    primaryObjective: { level: 642 },
    underlyingRiskReward: { rewardRiskRatio: 2.33 },
    selectedContract: {
      contractSymbol: "SPY   260720C00640000",
      ask: 1.25,
      quoteAt: "2026-07-20T14:34:58.000Z",
    },
  } as unknown as SpyZeroDteTradePlanAssemblyResponse;
  return { ...base, ...overrides };
}

function suppressedAssembly(): SpyZeroDteTradePlanAssemblyResponse {
  return assembly({
    planState: "NOT_APPLICABLE",
    direction: "NONE",
    primaryReasonCode: "TRADE_PLAN_NOT_APPLICABLE",
    selectedContract: {
      ...assembly().selectedContract,
      contractSymbol: null,
      ask: null,
      quoteAt: null,
    },
  });
}

function row(
  overrides: Partial<DeterministicJournalSnapshotRow> = {},
): DeterministicJournalSnapshotRow {
  return {
    id: "journal-1",
    currentMarketDate: "2026-07-20",
    sourceCalculatedAt: new Date("2026-07-20T14:34:59.000Z"),
    capturedAt: NOW,
    captureMode: "EXPLICIT",
    sourceReferenceType: null,
    sourceReferenceKey: null,
    engineState: "AVAILABLE",
    planState: "READY",
    direction: "CALLS",
    confidenceScore: 82,
    primaryReasonCode: "TRADE_PLAN_READY",
    warningCode: null,
    entryConditionState: "SATISFIED",
    selectedContractSymbol: "SPY   260720C00640000",
    outcomeState: "UNREVIEWED",
    realizedPnlDollars: null,
    outcomeNotes: null,
    outcomeUpdatedAt: null,
    ...overrides,
  };
}

function dependencies(
  overrides: Partial<DeterministicJournalServiceDependencies> = {},
): DeterministicJournalServiceDependencies {
  return {
    databaseConfigured: () => true,
    getUserId: async () => "user-1",
    repository: {
      list: async () => [row()],
      insertExplicit: async (_userId, id, capturedAt, source) =>
        row({
          id,
          capturedAt,
          currentMarketDate: source.currentMarketDate,
          sourceCalculatedAt: new Date(source.calculatedAt),
          engineState: source.engineState,
          planState: source.planState,
          direction: source.direction,
          confidenceScore: source.bias.confidenceScore,
          primaryReasonCode: source.primaryReasonCode,
          warningCode: source.warningCode,
          entryConditionState: source.entryCondition.state,
          selectedContractSymbol: source.selectedContract.contractSymbol,
        }),
      insertAutomaticCandidate: async (
        _userId,
        id,
        capturedAt,
        source,
        sourceReferenceKey,
      ) => ({
        inserted: true,
        row: row({
          id,
          capturedAt,
          captureMode: "AUTOMATIC_CANDIDATE",
          sourceReferenceType: "TRADE_PLAN_ALERT_CANDIDATE",
          sourceReferenceKey,
          currentMarketDate: source.currentMarketDate,
          sourceCalculatedAt: new Date(source.calculatedAt),
          planState: source.planState,
          direction: source.direction,
        }),
      }),
      updateOutcome: async (_userId, snapshotId, request, updatedAt) =>
        row({
          id: snapshotId,
          outcomeState: request.outcomeState,
          realizedPnlDollars: request.realizedPnlDollars,
          outcomeNotes: request.notes,
          outcomeUpdatedAt:
            request.outcomeState === "UNREVIEWED" ? null : updatedAt,
        }),
    },
    getAssembly: async () => assembly(),
    now: () => NOW,
    createId: () => "journal-created",
    log: () => undefined,
    ...overrides,
  };
}

const tests: Array<[string, () => void | Promise<void>]> = [];
function test(name: string, fn: () => void | Promise<void>): void {
  tests.push([name, fn]);
}

test("methodology is JOURNAL_SNAPSHOT_V3", () => {
  assert.equal(mapJournalRowToEntry(row()).methodologyVersion, "JOURNAL_SNAPSHOT_V3");
});

test("explicit and automatic capture requests are strict empty objects", () => {
  assert.equal(DeterministicJournalCaptureRequestSchema.safeParse({}).success, true);
  assert.equal(DeterministicJournalAutomaticCaptureRequestSchema.safeParse({}).success, true);
  assert.equal(
    DeterministicJournalAutomaticCaptureRequestSchema.safeParse({ unexpected: true }).success,
    false,
  );
});

test("explicit row maps without automatic source provenance", () => {
  const entry = mapJournalRowToEntry(row());
  assert.equal(entry.captureMode, "EXPLICIT");
  assert.equal(entry.sourceReferenceType, null);
});

test("automatic row maps candidate provenance without exposing the dedupe key", () => {
  const entry = mapJournalRowToEntry(
    row({
      captureMode: "AUTOMATIC_CANDIDATE",
      sourceReferenceType: "TRADE_PLAN_ALERT_CANDIDATE",
      sourceReferenceKey: "SPY|2026-07-20|PLAN_READY",
    }),
  );
  assert.equal(entry.captureMode, "AUTOMATIC_CANDIDATE");
  assert.equal(entry.sourceReferenceType, "TRADE_PLAN_ALERT_CANDIDATE");
  assert.equal("sourceReferenceKey" in entry, false);
});

test("entry schema rejects automatic mode without candidate provenance", () => {
  const entry = mapJournalRowToEntry(row());
  assert.equal(
    DeterministicJournalSnapshotListResponseSchema.safeParse({
      ...buildJournalListResponse([row()], NOW),
      entries: [{ ...entry, captureMode: "AUTOMATIC_CANDIDATE" }],
    }).success,
    false,
  );
});

test("outcome validation remains strict", () => {
  assert.equal(
    DeterministicJournalOutcomeUpdateRequestSchema.safeParse({
      outcomeState: "WIN",
      realizedPnlDollars: 125.5,
      notes: "Followed the trigger.",
    }).success,
    true,
  );
  assert.equal(
    DeterministicJournalOutcomeUpdateRequestSchema.safeParse({
      outcomeState: "LOSS",
      realizedPnlDollars: 50,
      notes: null,
    }).success,
    false,
  );
});

test("populated and empty list responses are schema-valid", () => {
  const populated = buildJournalListResponse([row()], NOW);
  const empty = buildJournalListResponse([], NOW);
  assert.equal(populated.primaryReasonCode, "JOURNAL_ENTRIES_AVAILABLE");
  assert.equal(empty.primaryReasonCode, "JOURNAL_EMPTY");
  assert.equal(DeterministicJournalSnapshotListResponseSchema.safeParse(populated).success, true);
  assert.equal(DeterministicJournalSnapshotListResponseSchema.safeParse(empty).success, true);
});

test("list remains capped at 200 rows", () => {
  const rows = Array.from({ length: 205 }, (_, index) => row({ id: `journal-${index}` }));
  assert.equal(buildJournalListResponse(rows, NOW).entries.length, 200);
});

test("database-not-configured list fails closed", () => {
  const result = buildJournalUnavailableListResponse("DATABASE_NOT_CONFIGURED", NOW);
  assert.equal(result.engineState, "UNAVAILABLE");
  assert.deepEqual(result.entries, []);
});

test("manual capture response initializes explicit unreviewed entry", () => {
  const result = buildCapturedJournalResponse(row(), assembly(), NOW);
  assert.equal(result.entry?.captureMode, "EXPLICIT");
  assert.equal(result.entry?.outcomeState, "UNREVIEWED");
  assert.equal(DeterministicJournalCaptureResponseSchema.safeParse(result).success, true);
});

test("manual capture retains partial-source warning", () => {
  const source = assembly({ engineState: "PARTIAL", planState: "WAITING_FOR_TRIGGER" });
  const result = buildCapturedJournalResponse(
    row({ engineState: "PARTIAL", planState: "WAITING_FOR_TRIGGER" }),
    source,
    NOW,
  );
  assert.equal(result.warningCode, "SOURCE_ASSEMBLY_PARTIAL");
});

test("unavailable manual capture contains no entry", () => {
  const result = buildJournalCaptureUnavailableResponse("SOURCE_ASSEMBLY_UNAVAILABLE", NOW);
  assert.equal(result.entry, null);
  assert.equal(result.engineState, "UNAVAILABLE");
});

test("automatic captured response is schema-valid", () => {
  const source = assembly();
  const candidate = buildSpyZeroDteTradePlanAlertCandidate(source, NOW.getTime());
  const result = buildAutomaticJournalCapturedResponse(
    row({
      captureMode: "AUTOMATIC_CANDIDATE",
      sourceReferenceType: "TRADE_PLAN_ALERT_CANDIDATE",
      sourceReferenceKey: candidate.candidate?.deduplicationKey ?? null,
    }),
    source,
    candidate,
    NOW,
  );
  assert.equal(result.automaticCaptureState, "CAPTURED");
  assert.equal(DeterministicJournalAutomaticCaptureResponseSchema.safeParse(result).success, true);
});

test("automatic duplicate response returns existing entry", () => {
  const source = assembly();
  const candidate = buildSpyZeroDteTradePlanAlertCandidate(source, NOW.getTime());
  const result = buildAutomaticJournalDuplicateResponse(
    row({
      captureMode: "AUTOMATIC_CANDIDATE",
      sourceReferenceType: "TRADE_PLAN_ALERT_CANDIDATE",
      sourceReferenceKey: candidate.candidate?.deduplicationKey ?? null,
    }),
    source,
    candidate,
    NOW,
  );
  assert.equal(result.automaticCaptureState, "DUPLICATE_SUPPRESSED");
  assert.equal(result.entry?.id, "journal-1");
});

test("suppressed candidate produces an available no-capture response", () => {
  const candidate = buildSpyZeroDteTradePlanAlertCandidate(
    suppressedAssembly(),
    NOW.getTime(),
  );
  const result = buildAutomaticJournalNoCaptureResponse(candidate, NOW);
  assert.equal(result.automaticCaptureState, "NO_CAPTURE");
  assert.equal(result.sourceCandidate?.alertState, "SUPPRESSED");
});

test("automatic unavailable response fails closed", () => {
  const result = buildAutomaticJournalUnavailableResponse(
    "DATABASE_UNAVAILABLE",
    NOW,
  );
  assert.equal(result.automaticCaptureState, "UNAVAILABLE");
  assert.equal(result.entry, null);
});

test("list service short-circuits before database access when unconfigured", async () => {
  let accessed = false;
  const result = await listDeterministicJournalSnapshotsWithDependencies(
    dependencies({
      databaseConfigured: () => false,
      getUserId: async () => {
        accessed = true;
        return "user-1";
      },
    }),
  );
  assert.equal(accessed, false);
  assert.equal(result.primaryReasonCode, "DATABASE_NOT_CONFIGURED");
});

test("manual capture persists exactly one explicit snapshot", async () => {
  let inserts = 0;
  const base = dependencies();
  const result = await captureDeterministicJournalSnapshotWithDependencies(
    dependencies({
      repository: {
        ...base.repository,
        insertExplicit: async (userId, id, capturedAt) => {
          inserts += 1;
          assert.equal(userId, "user-1");
          assert.equal(id, "journal-created");
          return row({ id, capturedAt });
        },
      },
    }),
  );
  assert.equal(inserts, 1);
  assert.equal(result.primaryReasonCode, "JOURNAL_SNAPSHOT_CAPTURED");
});

test("automatic capture checks database configuration before Assembly retrieval", async () => {
  let retrieved = false;
  const result = await automaticallyCaptureDeterministicJournalSnapshotWithDependencies(
    dependencies({
      databaseConfigured: () => false,
      getAssembly: async () => {
        retrieved = true;
        return assembly();
      },
    }),
  );
  assert.equal(retrieved, false);
  assert.equal(result.primaryReasonCode, "DATABASE_NOT_CONFIGURED");
});

test("automatic capture retrieves Assembly once and inserts candidate once", async () => {
  let assemblies = 0;
  let inserts = 0;
  const base = dependencies();
  const result = await automaticallyCaptureDeterministicJournalSnapshotWithDependencies(
    dependencies({
      getAssembly: async () => {
        assemblies += 1;
        return assembly();
      },
      repository: {
        ...base.repository,
        insertAutomaticCandidate: async (
          userId,
          id,
          capturedAt,
          source,
          sourceReferenceKey,
        ) => {
          inserts += 1;
          assert.equal(userId, "user-1");
          assert.equal(source.planState, "READY");
          assert.equal(sourceReferenceKey.includes("PLAN_READY"), true);
          return {
            inserted: true,
            row: row({
              id,
              capturedAt,
              captureMode: "AUTOMATIC_CANDIDATE",
              sourceReferenceType: "TRADE_PLAN_ALERT_CANDIDATE",
              sourceReferenceKey,
            }),
          };
        },
      },
    }),
  );
  assert.equal(assemblies, 1);
  assert.equal(inserts, 1);
  assert.equal(result.primaryReasonCode, "JOURNAL_AUTOMATIC_SNAPSHOT_CAPTURED");
});

test("automatic capture suppresses non-candidate states without database write", async () => {
  let inserts = 0;
  const base = dependencies();
  const result = await automaticallyCaptureDeterministicJournalSnapshotWithDependencies(
    dependencies({
      getAssembly: async () => suppressedAssembly(),
      repository: {
        ...base.repository,
        insertAutomaticCandidate: async () => {
          inserts += 1;
          throw new Error("should not insert");
        },
      },
    }),
  );
  assert.equal(inserts, 0);
  assert.equal(result.primaryReasonCode, "JOURNAL_AUTOMATIC_NO_ELIGIBLE_CANDIDATE");
});

test("automatic capture returns database duplicate suppression", async () => {
  const base = dependencies();
  const result = await automaticallyCaptureDeterministicJournalSnapshotWithDependencies(
    dependencies({
      repository: {
        ...base.repository,
        insertAutomaticCandidate: async (
          _userId,
          _id,
          _capturedAt,
          _source,
          sourceReferenceKey,
        ) => ({
          inserted: false,
          row: row({
            captureMode: "AUTOMATIC_CANDIDATE",
            sourceReferenceType: "TRADE_PLAN_ALERT_CANDIDATE",
            sourceReferenceKey,
          }),
        }),
      },
    }),
  );
  assert.equal(result.primaryReasonCode, "JOURNAL_AUTOMATIC_DUPLICATE_SUPPRESSED");
});

test("automatic source failure does not access the repository", async () => {
  let inserted = false;
  const base = dependencies();
  const result = await automaticallyCaptureDeterministicJournalSnapshotWithDependencies(
    dependencies({
      getAssembly: async () => {
        throw new Error("source failed");
      },
      repository: {
        ...base.repository,
        insertAutomaticCandidate: async () => {
          inserted = true;
          throw new Error("should not insert");
        },
      },
    }),
  );
  assert.equal(inserted, false);
  assert.equal(result.primaryReasonCode, "SOURCE_ASSEMBLY_UNAVAILABLE");
});

test("outcome update remains user scoped and writes once", async () => {
  let updates = 0;
  const request: DeterministicJournalOutcomeUpdateRequest = {
    outcomeState: "WIN",
    realizedPnlDollars: 110,
    notes: "Plan followed.",
  };
  const base = dependencies();
  const result = await updateDeterministicJournalOutcomeWithDependencies(
    dependencies({
      now: (() => {
        const values = [NOW, UPDATED_AT];
        return () => values.shift() ?? UPDATED_AT;
      })(),
      repository: {
        ...base.repository,
        updateOutcome: async (userId, snapshotId, value, updatedAt) => {
          updates += 1;
          assert.equal(userId, "user-1");
          assert.equal(snapshotId, "journal-1");
          assert.deepEqual(value, request);
          return row({
            outcomeState: "WIN",
            realizedPnlDollars: 110,
            outcomeNotes: "Plan followed.",
            outcomeUpdatedAt: updatedAt,
          });
        },
      },
    }),
    "journal-1",
    request,
  );
  assert.equal(updates, 1);
  assert.equal(result.primaryReasonCode, "JOURNAL_OUTCOME_UPDATED");
});

test("not-found and database-unavailable outcome states remain sanitized", () => {
  assert.equal(buildJournalOutcomeNotFoundResponse(NOW).entry, null);
  assert.equal(
    buildJournalOutcomeUnavailableResponse("DATABASE_UNAVAILABLE", NOW).engineState,
    "UNAVAILABLE",
  );
});

test("route is no-store, same-origin protected, and exposes automatic POST", () => {
  const source = readFileSync(
    resolve(process.cwd(), "apps/server/src/routes/journal.routes.ts"),
    "utf8",
  );
  assert.equal(source.includes('router.post("/spy/snapshots/automatic"'), true);
  assert.equal(source.includes("DeterministicJournalAutomaticCaptureRequestSchema"), true);
  assert.equal(source.includes('res.setHeader("Cache-Control", "no-store")'), true);
  assert.equal(source.includes("isAllowedAccountRiskOrigin"), true);
  assert.equal(source.includes("QUERY_PARAMETERS_NOT_SUPPORTED"), true);
});

test("automatic capture migration is additive and restart-safe", () => {
  const sql = readFileSync(
    resolve(
      process.cwd(),
      "apps/server/prisma/migrations/20260720033000_add_automatic_journal_capture/migration.sql",
    ),
    "utf8",
  );
  assert.equal(sql.includes('"captureMode" TEXT NOT NULL DEFAULT \'EXPLICIT\''), true);
  assert.equal(sql.includes('"sourceReferenceKey" TEXT'), true);
  assert.equal(
    sql.includes("DeterministicJournalSnapshot_userId_sourceReferenceKey_key"),
    true,
  );
});

test("Journal page exposes opt-in foreground automatic capture", () => {
  const page = readFileSync(
    resolve(process.cwd(), "apps/web/src/app/journal/page.tsx"),
    "utf8",
  );
  assert.equal(page.includes("Automatic Candidate Capture"), true);
  assert.equal(page.includes("Start automatic capture"), true);
  assert.equal(page.includes("Stop automatic capture"), true);
  assert.equal(page.includes("DATABASE UNIQUE"), true);
});

test("frontend API validates the dedicated automatic capture contract", () => {
  const api = readFileSync(
    resolve(process.cwd(), "apps/web/src/lib/api-client.ts"),
    "utf8",
  );
  assert.equal(api.includes("automaticallyCaptureDeterministicJournalSnapshot"), true);
  assert.equal(api.includes('"/api/journal/spy/snapshots/automatic"'), true);
  assert.equal(api.includes("DeterministicJournalAutomaticCaptureResponseSchema"), true);
});

test("automatic journal foundation contains no account, sizing, or order dependency", () => {
  const combined = [
    "apps/server/src/services/deterministic-journal.logic.ts",
    "apps/server/src/services/deterministic-journal.service.ts",
    "apps/web/src/app/journal/page.tsx",
  ]
    .map((file) => readFileSync(resolve(process.cwd(), file), "utf8"))
    .join("\n");
  assert.equal(combined.includes("getSchwabReadOnlyAccountRiskSnapshot"), false);
  assert.equal(combined.includes("positionSizing"), false);
  assert.equal(combined.includes("placeOrder"), false);
});

async function main(): Promise<void> {
  let passed = 0;
  for (const [name, fn] of tests) {
    try {
      await fn();
      passed += 1;
      console.log(`✓ ${name}`);
    } catch (error) {
      console.error(`✗ ${name}`);
      throw error;
    }
  }
  console.log(`\nDeterministic journal tests: ${passed} passed, 0 failed`);
}

void main();
