/**
 * Deterministic tests for JOURNAL_SNAPSHOT_V1 persistence foundation.
 * Run: npx --no-install tsx apps/server/src/services/deterministic-journal.spec.ts
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  DeterministicJournalCaptureRequestSchema,
  DeterministicJournalCaptureResponseSchema,
  DeterministicJournalSnapshotListResponseSchema,
  type SpyZeroDteTradePlanAssemblyResponse,
} from "@spy-copilot/shared";
import {
  buildCapturedJournalResponse,
  buildJournalCaptureUnavailableResponse,
  buildJournalListResponse,
  buildJournalUnavailableListResponse,
  mapJournalRowToEntry,
  type DeterministicJournalSnapshotRow,
} from "./deterministic-journal.logic";
import {
  captureDeterministicJournalSnapshotWithDependencies,
  listDeterministicJournalSnapshotsWithDependencies,
  type DeterministicJournalServiceDependencies,
} from "./deterministic-journal.service";

const NOW = new Date("2026-07-20T14:35:00.000Z");

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
    },
    getAssembly: async () => assembly(),
    now: () => NOW,
    createId: () => "journal-created",
    log: () => undefined,
    ...overrides,
  };
}

const tests: Array<[string, () => void | Promise<void>]> = [];
function test(name: string, fn: () => void | Promise<void>) {
  tests.push([name, fn]);
}

test("strict empty capture request is valid", () => {
  assert.equal(DeterministicJournalCaptureRequestSchema.safeParse({}).success, true);
  assert.equal(
    DeterministicJournalCaptureRequestSchema.safeParse({ unexpected: true }).success,
    false,
  );
});

test("database row maps to sanitized journal entry", () => {
  const entry = mapJournalRowToEntry(row());
  assert.equal(entry.product, "SPY_ZERO_DTE_DETERMINISTIC_JOURNAL_SNAPSHOT");
  assert.equal(entry.methodologyVersion, "JOURNAL_SNAPSHOT_V1");
  assert.equal(entry.selectedContractSymbol, "SPY   260720C00640000");
});

test("populated list response is schema-valid", () => {
  const result = buildJournalListResponse([row()], NOW);
  assert.equal(result.primaryReasonCode, "JOURNAL_ENTRIES_AVAILABLE");
  assert.equal(DeterministicJournalSnapshotListResponseSchema.safeParse(result).success, true);
});

test("empty list response is a normal available product state", () => {
  const result = buildJournalListResponse([], NOW);
  assert.equal(result.engineState, "AVAILABLE");
  assert.equal(result.primaryReasonCode, "JOURNAL_EMPTY");
});

test("list is capped at 200 newest repository rows", () => {
  const rows = Array.from({ length: 205 }, (_, index) =>
    row({ id: `journal-${index}` }),
  );
  assert.equal(buildJournalListResponse(rows, NOW).entries.length, 200);
});

test("database-not-configured list fails closed", () => {
  const result = buildJournalUnavailableListResponse("DATABASE_NOT_CONFIGURED", NOW);
  assert.equal(result.engineState, "UNAVAILABLE");
  assert.deepEqual(result.entries, []);
});

test("captured response retains partial-source warning", () => {
  const source = assembly({ engineState: "PARTIAL", planState: "WAITING_FOR_TRIGGER" });
  const result = buildCapturedJournalResponse(
    row({ engineState: "PARTIAL", planState: "WAITING_FOR_TRIGGER" }),
    source,
    NOW,
  );
  assert.equal(result.warningCode, "SOURCE_ASSEMBLY_PARTIAL");
  assert.equal(DeterministicJournalCaptureResponseSchema.safeParse(result).success, true);
});

test("unavailable capture contains no entry", () => {
  const result = buildJournalCaptureUnavailableResponse(
    "SOURCE_ASSEMBLY_UNAVAILABLE",
    NOW,
  );
  assert.equal(result.entry, null);
  assert.equal(result.engineState, "UNAVAILABLE");
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

test("list service reads one user-scoped repository page", async () => {
  let requestedLimit = 0;
  const result = await listDeterministicJournalSnapshotsWithDependencies(
    dependencies({
      repository: {
        list: async (userId, limit) => {
          assert.equal(userId, "user-1");
          requestedLimit = limit;
          return [row()];
        },
        insert: async () => row(),
      },
    }),
  );
  assert.equal(requestedLimit, 200);
  assert.equal(result.entries.length, 1);
});

test("capture short-circuits when Assembly is unavailable", async () => {
  let inserted = false;
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
        list: async () => [],
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
  const result = await captureDeterministicJournalSnapshotWithDependencies(
    dependencies({
      repository: {
        list: async () => [],
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

test("database failure returns sanitized product state", async () => {
  let logs = 0;
  const result = await listDeterministicJournalSnapshotsWithDependencies(
    dependencies({
      repository: {
        list: async () => {
          throw new Error("private database detail");
        },
        insert: async () => row(),
      },
      log: () => {
        logs += 1;
      },
    }),
  );
  assert.equal(logs, 1);
  assert.equal(result.primaryReasonCode, "DATABASE_UNAVAILABLE");
  assert.equal(JSON.stringify(result).includes("private database detail"), false);
});

test("route is no-store, same-origin protected, and rejects query parameters", () => {
  const source = readFileSync(
    resolve(process.cwd(), "apps/server/src/routes/journal.routes.ts"),
    "utf8",
  );
  assert.equal(source.includes('router.get("/spy/snapshots"'), true);
  assert.equal(source.includes('router.post("/spy/snapshots"'), true);
  assert.equal(source.includes('res.setHeader("Cache-Control", "no-store")'), true);
  assert.equal(source.includes("isAllowedAccountRiskOrigin"), true);
  assert.equal(source.includes("QUERY_PARAMETERS_NOT_SUPPORTED"), true);
});

test("migration stores the complete source Assembly as JSONB", () => {
  const sql = readFileSync(
    resolve(
      process.cwd(),
      "apps/server/prisma/migrations/20260720015500_add_deterministic_journal_snapshots/migration.sql",
    ),
    "utf8",
  );
  assert.equal(sql.includes('"sourceAssembly" JSONB NOT NULL'), true);
  assert.equal(sql.includes("DeterministicJournalSnapshot_userId_capturedAt_idx"), true);
});

test("Journal page no longer uses the legacy mock journal hook", () => {
  const page = readFileSync(
    resolve(process.cwd(), "apps/web/src/app/journal/page.tsx"),
    "utf8",
  );
  assert.equal(page.includes("useJournalEntries"), false);
  assert.equal(page.includes("useDeterministicJournalSnapshots"), true);
  assert.equal(page.includes("Save current snapshot"), true);
});

test("frontend API validates dedicated journal contracts", () => {
  const api = readFileSync(
    resolve(process.cwd(), "apps/web/src/lib/api-client.ts"),
    "utf8",
  );
  assert.equal(api.includes('"/api/journal/spy/snapshots"'), true);
  assert.equal(api.includes("DeterministicJournalSnapshotListResponseSchema"), true);
  assert.equal(api.includes("DeterministicJournalCaptureResponseSchema"), true);
});

test("journal foundation contains no order or private account dependency", () => {
  const combined = [
    "apps/server/src/services/deterministic-journal.logic.ts",
    "apps/server/src/services/deterministic-journal.service.ts",
    "apps/web/src/app/journal/page.tsx",
  ]
    .map((file) => readFileSync(resolve(process.cwd(), file), "utf8"))
    .join("\n");
  assert.equal(combined.includes("getSchwabReadOnlyAccountRiskSnapshot"), false);
  assert.equal(combined.includes("orderQuantity"), false);
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
