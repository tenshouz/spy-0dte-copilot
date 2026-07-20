/**
 * Deterministic tests for JOURNAL_SNAPSHOT_V2 persistence and outcome annotation.
 * Run: npx --no-install tsx apps/server/src/services/deterministic-journal.spec.ts
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  DeterministicJournalCaptureRequestSchema,
  DeterministicJournalCaptureResponseSchema,
  DeterministicJournalOutcomeUpdateRequestSchema,
  DeterministicJournalOutcomeUpdateResponseSchema,
  DeterministicJournalSnapshotListResponseSchema,
  type DeterministicJournalOutcomeUpdateRequest,
  type SpyZeroDteTradePlanAssemblyResponse,
} from "@spy-copilot/shared";
import {
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
  captureDeterministicJournalSnapshotWithDependencies,
  listDeterministicJournalSnapshotsWithDependencies,
  updateDeterministicJournalOutcomeWithDependencies,
  type DeterministicJournalServiceDependencies,
} from "./deterministic-journal.service";

const NOW = new Date("2026-07-20T14:35:00.000Z");
const UPDATED_AT = new Date("2026-07-20T20:00:00.000Z");

function assembly(
  overrides: Partial<SpyZeroDteTradePlanAssemblyResponse> = {},
): SpyZeroDteTradePlanAssemblyResponse {
  return {
    currentMarketDate: "2026-07-20",
    calculatedAt: "2026-07-20T14:34:59.000Z",
    engineState: "AVAILABLE",
    planState: "READY",
    direction: "CALLS",
    primaryReasonCode: "TRADE_PLAN_READY",
    warningCode: null,
    bias: { confidenceScore: 82 },
    entryCondition: { state: "SATISFIED" },
    selectedContract: { contractSymbol: "SPY   260720C00640000" },
    ...overrides,
  } as SpyZeroDteTradePlanAssemblyResponse;
}

function row(
  overrides: Partial<DeterministicJournalSnapshotRow> = {},
): DeterministicJournalSnapshotRow {
  return {
    id: "journal-1",
    currentMarketDate: "2026-07-20",
    sourceCalculatedAt: new Date("2026-07-20T14:34:59.000Z"),
    capturedAt: NOW,
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
      insert: async (_userId, id, capturedAt, source) =>
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

test("methodology is JOURNAL_SNAPSHOT_V2", () => {
  assert.equal(mapJournalRowToEntry(row()).methodologyVersion, "JOURNAL_SNAPSHOT_V2");
});

test("strict empty capture request remains valid", () => {
  assert.equal(DeterministicJournalCaptureRequestSchema.safeParse({}).success, true);
  assert.equal(
    DeterministicJournalCaptureRequestSchema.safeParse({ unexpected: true }).success,
    false,
  );
});

test("outcome request accepts valid WIN and trims notes", () => {
  const parsed = DeterministicJournalOutcomeUpdateRequestSchema.parse({
    outcomeState: "WIN",
    realizedPnlDollars: 125.5,
    notes: "  Followed the trigger.  ",
  });
  assert.equal(parsed.notes, "Followed the trigger.");
});

test("WIN requires positive realized P&L", () => {
  assert.equal(
    DeterministicJournalOutcomeUpdateRequestSchema.safeParse({
      outcomeState: "WIN",
      realizedPnlDollars: 0,
      notes: null,
    }).success,
    false,
  );
});

test("LOSS requires negative realized P&L", () => {
  assert.equal(
    DeterministicJournalOutcomeUpdateRequestSchema.safeParse({
      outcomeState: "LOSS",
      realizedPnlDollars: -50,
      notes: null,
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

test("NO_TRADE and UNREVIEWED prohibit P&L", () => {
  for (const outcomeState of ["NO_TRADE", "UNREVIEWED"] as const) {
    assert.equal(
      DeterministicJournalOutcomeUpdateRequestSchema.safeParse({
        outcomeState,
        realizedPnlDollars: 1,
        notes: null,
      }).success,
      false,
    );
  }
});


test("UNREVIEWED clears all outcome metadata", () => {
  const parsed = DeterministicJournalOutcomeUpdateRequestSchema.safeParse({
    outcomeState: "UNREVIEWED",
    realizedPnlDollars: null,
    notes: null,
  });
  assert.equal(parsed.success, true);
  assert.equal(
    DeterministicJournalOutcomeUpdateRequestSchema.safeParse({
      outcomeState: "UNREVIEWED",
      realizedPnlDollars: null,
      notes: "should be cleared",
    }).success,
    false,
  );
});
test("BREAKEVEN requires zero P&L", () => {
  assert.equal(
    DeterministicJournalOutcomeUpdateRequestSchema.safeParse({
      outcomeState: "BREAKEVEN",
      realizedPnlDollars: 0,
      notes: null,
    }).success,
    true,
  );
});

test("database row maps outcome metadata into sanitized entry", () => {
  const entry = mapJournalRowToEntry(
    row({
      outcomeState: "WIN",
      realizedPnlDollars: 125.5,
      outcomeNotes: "Followed plan.",
      outcomeUpdatedAt: UPDATED_AT,
    }),
  );
  assert.equal(entry.outcomeState, "WIN");
  assert.equal(entry.realizedPnlDollars, 125.5);
  assert.equal(entry.outcomeUpdatedAt, UPDATED_AT.toISOString());
});

test("unreviewed entry contains no outcome metadata", () => {
  const entry = mapJournalRowToEntry(row());
  assert.equal(entry.outcomeState, "UNREVIEWED");
  assert.equal(entry.realizedPnlDollars, null);
  assert.equal(entry.outcomeNotes, null);
  assert.equal(entry.outcomeUpdatedAt, null);
});

test("populated and empty list responses are schema-valid", () => {
  const populated = buildJournalListResponse([row()], NOW);
  const empty = buildJournalListResponse([], NOW);
  assert.equal(populated.primaryReasonCode, "JOURNAL_ENTRIES_AVAILABLE");
  assert.equal(empty.primaryReasonCode, "JOURNAL_EMPTY");
  assert.equal(DeterministicJournalSnapshotListResponseSchema.safeParse(populated).success, true);
  assert.equal(DeterministicJournalSnapshotListResponseSchema.safeParse(empty).success, true);
});

test("list is capped at 200 repository rows", () => {
  const rows = Array.from({ length: 205 }, (_, index) => row({ id: `journal-${index}` }));
  assert.equal(buildJournalListResponse(rows, NOW).entries.length, 200);
});

test("database-not-configured list fails closed", () => {
  const result = buildJournalUnavailableListResponse("DATABASE_NOT_CONFIGURED", NOW);
  assert.equal(result.engineState, "UNAVAILABLE");
  assert.deepEqual(result.entries, []);
});

test("captured response initializes outcome as UNREVIEWED", () => {
  const result = buildCapturedJournalResponse(row(), assembly(), NOW);
  assert.equal(result.entry?.outcomeState, "UNREVIEWED");
  assert.equal(DeterministicJournalCaptureResponseSchema.safeParse(result).success, true);
});

test("captured response retains partial-source warning", () => {
  const source = assembly({ engineState: "PARTIAL", planState: "WAITING_FOR_TRIGGER" });
  const result = buildCapturedJournalResponse(
    row({ engineState: "PARTIAL", planState: "WAITING_FOR_TRIGGER" }),
    source,
    NOW,
  );
  assert.equal(result.warningCode, "SOURCE_ASSEMBLY_PARTIAL");
});

test("unavailable capture contains no entry", () => {
  const result = buildJournalCaptureUnavailableResponse("SOURCE_ASSEMBLY_UNAVAILABLE", NOW);
  assert.equal(result.entry, null);
  assert.equal(result.engineState, "UNAVAILABLE");
});

test("updated outcome response is schema-valid", () => {
  const result = buildJournalOutcomeUpdatedResponse(
    row({
      outcomeState: "LOSS",
      realizedPnlDollars: -75,
      outcomeNotes: "Invalidation respected.",
      outcomeUpdatedAt: UPDATED_AT,
    }),
    NOW,
  );
  assert.equal(result.primaryReasonCode, "JOURNAL_OUTCOME_UPDATED");
  assert.equal(DeterministicJournalOutcomeUpdateResponseSchema.safeParse(result).success, true);
});

test("not-found outcome response is an available product state", () => {
  const result = buildJournalOutcomeNotFoundResponse(NOW);
  assert.equal(result.engineState, "AVAILABLE");
  assert.equal(result.entry, null);
});

test("database-unavailable outcome response fails closed", () => {
  const result = buildJournalOutcomeUnavailableResponse("DATABASE_UNAVAILABLE", NOW);
  assert.equal(result.engineState, "UNAVAILABLE");
  assert.equal(result.entry, null);
});

test("list service returns unavailable before database access when unconfigured", async () => {
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

test("capture short-circuits when Assembly is unavailable", async () => {
  let inserted = false;
  const base = dependencies();
  const result = await captureDeterministicJournalSnapshotWithDependencies(
    dependencies({
      getAssembly: async () =>
        assembly({
          engineState: "UNAVAILABLE",
          planState: "UNAVAILABLE",
          direction: "UNAVAILABLE",
          primaryReasonCode: "TRADE_PLAN_UNAVAILABLE",
        }),
      repository: {
        ...base.repository,
        insert: async () => {
          inserted = true;
          return row();
        },
      },
    }),
  );
  assert.equal(inserted, false);
  assert.equal(result.primaryReasonCode, "SOURCE_ASSEMBLY_UNAVAILABLE");
});

test("capture persists exactly one current Assembly snapshot", async () => {
  let inserts = 0;
  const base = dependencies();
  const result = await captureDeterministicJournalSnapshotWithDependencies(
    dependencies({
      repository: {
        ...base.repository,
        insert: async (userId, id, capturedAt, source) => {
          inserts += 1;
          assert.equal(userId, "user-1");
          assert.equal(id, "journal-created");
          assert.equal(source.planState, "READY");
          return row({ id, capturedAt });
        },
      },
    }),
  );
  assert.equal(inserts, 1);
  assert.equal(result.primaryReasonCode, "JOURNAL_SNAPSHOT_CAPTURED");
});

test("outcome update is user-scoped and writes exactly once", async () => {
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
          assert.equal(updatedAt.toISOString(), UPDATED_AT.toISOString());
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

test("outcome update returns not found without leaking another user's row", async () => {
  const base = dependencies();
  const result = await updateDeterministicJournalOutcomeWithDependencies(
    dependencies({
      repository: { ...base.repository, updateOutcome: async () => null },
    }),
    "missing",
    { outcomeState: "NO_TRADE", realizedPnlDollars: null, notes: null },
  );
  assert.equal(result.primaryReasonCode, "JOURNAL_SNAPSHOT_NOT_FOUND");
  assert.equal(result.entry, null);
});

test("outcome update short-circuits before database access when unconfigured", async () => {
  let accessed = false;
  const result = await updateDeterministicJournalOutcomeWithDependencies(
    dependencies({
      databaseConfigured: () => false,
      getUserId: async () => {
        accessed = true;
        return "user-1";
      },
    }),
    "journal-1",
    { outcomeState: "NO_TRADE", realizedPnlDollars: null, notes: null },
  );
  assert.equal(accessed, false);
  assert.equal(result.primaryReasonCode, "DATABASE_NOT_CONFIGURED");
});

test("database failure returns a sanitized outcome product state", async () => {
  let logs = 0;
  const base = dependencies();
  const result = await updateDeterministicJournalOutcomeWithDependencies(
    dependencies({
      repository: {
        ...base.repository,
        updateOutcome: async () => {
          throw new Error("private database detail");
        },
      },
      log: () => {
        logs += 1;
      },
    }),
    "journal-1",
    { outcomeState: "NO_TRADE", realizedPnlDollars: null, notes: null },
  );
  assert.equal(logs, 1);
  assert.equal(result.primaryReasonCode, "DATABASE_UNAVAILABLE");
  assert.equal(JSON.stringify(result).includes("private database detail"), false);
});

test("route is no-store, same-origin protected, strict, and PATCH-only for outcome", () => {
  const source = readFileSync(
    resolve(process.cwd(), "apps/server/src/routes/journal.routes.ts"),
    "utf8",
  );
  assert.equal(source.includes('router.get("/spy/snapshots"'), true);
  assert.equal(source.includes('router.post("/spy/snapshots"'), true);
  assert.equal(source.includes('router.patch("/spy/snapshots/:snapshotId/outcome"'), true);
  assert.equal(source.includes('res.setHeader("Cache-Control", "no-store")'), true);
  assert.equal(source.includes("isAllowedAccountRiskOrigin"), true);
  assert.equal(source.includes("QUERY_PARAMETERS_NOT_SUPPORTED"), true);
  assert.equal(source.includes("DeterministicJournalOutcomeUpdateRequestSchema"), true);
});

test("outcome migration is additive and indexed", () => {
  const sql = readFileSync(
    resolve(
      process.cwd(),
      "apps/server/prisma/migrations/20260720023500_add_journal_outcome_annotations/migration.sql",
    ),
    "utf8",
  );
  assert.equal(sql.includes('"outcomeState" TEXT NOT NULL DEFAULT \'UNREVIEWED\''), true);
  assert.equal(sql.includes('"realizedPnlDollars" DOUBLE PRECISION'), true);
  assert.equal(sql.includes('"outcomeNotes" TEXT'), true);
  assert.equal(sql.includes("DeterministicJournalSnapshot_userId_outcomeState_idx"), true);
});

test("Journal page exposes explicit outcome review", () => {
  const page = readFileSync(
    resolve(process.cwd(), "apps/web/src/app/journal/page.tsx"),
    "utf8",
  );
  assert.equal(page.includes("useDeterministicJournalSnapshots"), true);
  assert.equal(page.includes("Save current snapshot"), true);
  assert.equal(page.includes("Outcome Review"), true);
  assert.equal(page.includes("Save outcome"), true);
});

test("frontend API validates dedicated PATCH outcome contracts", () => {
  const api = readFileSync(
    resolve(process.cwd(), "apps/web/src/lib/api-client.ts"),
    "utf8",
  );
  assert.equal(api.includes("updateDeterministicJournalOutcome"), true);
  assert.equal(api.includes('method: "PATCH"'), true);
  assert.equal(api.includes("DeterministicJournalOutcomeUpdateRequestSchema"), true);
  assert.equal(api.includes("DeterministicJournalOutcomeUpdateResponseSchema"), true);
});

test("journal outcome foundation contains no inference, account, or order dependency", () => {
  const combined = [
    "apps/server/src/services/deterministic-journal.logic.ts",
    "apps/server/src/services/deterministic-journal.service.ts",
    "apps/web/src/app/journal/page.tsx",
  ]
    .map((file) => readFileSync(resolve(process.cwd(), file), "utf8"))
    .join("\n");
  assert.equal(combined.includes("getSchwabReadOnlyAccountRiskSnapshot"), false);
  assert.equal(combined.includes("inferOutcome"), false);
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
