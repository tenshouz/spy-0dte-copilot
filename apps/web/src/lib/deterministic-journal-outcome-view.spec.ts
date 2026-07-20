/**
 * Deterministic UI tests for JOURNAL_SNAPSHOT_V3 outcome annotation.
 * Run: npx --no-install tsx apps/web/src/lib/deterministic-journal-outcome-view.spec.ts
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import type { DeterministicJournalSnapshotEntry } from "@spy-copilot/shared";
import {
  journalOutcomeDraftFromEntry,
  validateJournalOutcomeDraft,
} from "./deterministic-journal-view";

function entry(
  overrides: Partial<DeterministicJournalSnapshotEntry> = {},
): DeterministicJournalSnapshotEntry {
  return {
    id: "journal-1",
    symbol: "SPY",
    product: "SPY_ZERO_DTE_DETERMINISTIC_JOURNAL_SNAPSHOT",
    methodologyVersion: "JOURNAL_SNAPSHOT_V3",
    currentMarketDate: "2026-07-20",
    sourceCalculatedAt: "2026-07-20T14:34:59.000Z",
    capturedAt: "2026-07-20T14:35:00.000Z",
    captureMode: "EXPLICIT",
    sourceReferenceType: null,
    engineState: "AVAILABLE",
    planState: "READY",
    direction: "CALLS",
    structuralConfidenceScore: 82,
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

const tests: Array<[string, () => void]> = [];
function test(name: string, fn: () => void): void {
  tests.push([name, fn]);
}

test("existing outcome maps into an editable draft", () => {
  assert.deepEqual(
    journalOutcomeDraftFromEntry(
      entry({
        outcomeState: "WIN",
        realizedPnlDollars: 125.5,
        outcomeNotes: "Followed the plan.",
        outcomeUpdatedAt: "2026-07-20T20:00:00.000Z",
      }),
    ),
    {
      outcomeState: "WIN",
      realizedPnlDollars: "125.5",
      notes: "Followed the plan.",
    },
  );
});

test("positive P&L validates for WIN", () => {
  const result = validateJournalOutcomeDraft({
    outcomeState: "WIN",
    realizedPnlDollars: "250.25",
    notes: "  Strong continuation.  ",
  });
  assert.deepEqual(result.request, {
    outcomeState: "WIN",
    realizedPnlDollars: 250.25,
    notes: "Strong continuation.",
  });
});

test("WIN rejects zero or negative P&L", () => {
  assert.equal(
    validateJournalOutcomeDraft({
      outcomeState: "WIN",
      realizedPnlDollars: "0",
      notes: "",
    }).request,
    null,
  );
});

test("LOSS requires negative P&L", () => {
  assert.equal(
    validateJournalOutcomeDraft({
      outcomeState: "LOSS",
      realizedPnlDollars: "-85",
      notes: "",
    }).request?.realizedPnlDollars,
    -85,
  );
  assert.equal(
    validateJournalOutcomeDraft({
      outcomeState: "LOSS",
      realizedPnlDollars: "20",
      notes: "",
    }).request,
    null,
  );
});

test("BREAKEVEN requires exactly zero", () => {
  assert.equal(
    validateJournalOutcomeDraft({
      outcomeState: "BREAKEVEN",
      realizedPnlDollars: "0",
      notes: "",
    }).request?.realizedPnlDollars,
    0,
  );
});


test("UNREVIEWED clears outcome notes and P&L", () => {
  assert.equal(
    validateJournalOutcomeDraft({
      outcomeState: "UNREVIEWED",
      realizedPnlDollars: "",
      notes: "",
    }).request?.outcomeState,
    "UNREVIEWED",
  );
  assert.equal(
    validateJournalOutcomeDraft({
      outcomeState: "UNREVIEWED",
      realizedPnlDollars: "",
      notes: "old note",
    }).request,
    null,
  );
});
test("NO_TRADE rejects P&L and accepts optional notes", () => {
  assert.equal(
    validateJournalOutcomeDraft({
      outcomeState: "NO_TRADE",
      realizedPnlDollars: "12",
      notes: "Skipped.",
    }).request,
    null,
  );
  assert.deepEqual(
    validateJournalOutcomeDraft({
      outcomeState: "NO_TRADE",
      realizedPnlDollars: "",
      notes: "Skipped because confirmation never arrived.",
    }).request,
    {
      outcomeState: "NO_TRADE",
      realizedPnlDollars: null,
      notes: "Skipped because confirmation never arrived.",
    },
  );
});

test("Journal page exposes explicit outcome review without analytics claims", () => {
  const source = readFileSync(
    resolve(process.cwd(), "apps/web/src/app/journal/page.tsx"),
    "utf8",
  );
  assert.equal(source.includes("Outcome Review"), true);
  assert.equal(source.includes("Save outcome"), true);
  assert.equal(source.includes("user-entered"), true);
  assert.equal(source.includes("expectancy ="), false);
  assert.equal(source.includes("placeOrder"), false);
});

test("outcome hook is an explicit mutation with no polling", () => {
  const source = readFileSync(
    resolve(process.cwd(), "apps/web/src/hooks/use-journal.ts"),
    "utf8",
  );
  const outcomeSection = source.split(
    "export function useUpdateDeterministicJournalOutcome",
  )[1]?.split("export const AUTOMATIC_JOURNAL_CAPTURE_CADENCE_OPTIONS")[0] ?? "";
  assert.equal(outcomeSection.includes("mutationFn"), true);
  assert.equal(outcomeSection.includes("refetchInterval"), false);
});

for (const [name, fn] of tests) {
  fn();
  console.log(`✓ ${name}`);
}
console.log(`\nDeterministic journal outcome view tests: ${tests.length} passed, 0 failed`);
