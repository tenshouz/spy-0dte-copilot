/**
 * Deterministic UI tests for opt-in automatic JOURNAL_SNAPSHOT_V3 capture.
 * Run: npx --no-install tsx apps/web/src/lib/deterministic-journal-automatic-view.spec.ts
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import type { DeterministicJournalAutomaticCaptureResponse } from "@spy-copilot/shared";
import {
  automaticCaptureResultCopy,
  JOURNAL_CAPTURE_MODE_LABEL,
} from "./deterministic-journal-view";

function response(
  overrides: Partial<DeterministicJournalAutomaticCaptureResponse> = {},
): DeterministicJournalAutomaticCaptureResponse {
  return {
    product: "SPY_ZERO_DTE_DETERMINISTIC_JOURNAL_AUTOMATIC_CAPTURE",
    methodologyVersion: "JOURNAL_SNAPSHOT_V3",
    calculatedAt: "2026-07-20T14:35:00.000Z",
    engineState: "AVAILABLE",
    automaticCaptureState: "NO_CAPTURE",
    primaryReasonCode: "JOURNAL_AUTOMATIC_NO_ELIGIBLE_CANDIDATE",
    warningCode: null,
    entry: null,
    sourceCandidate: {
      alertState: "SUPPRESSED",
      primaryReasonCode: "NOT_APPLICABLE_SUPPRESSED",
      category: null,
      severity: null,
      direction: null,
      deduplicationKey: null,
    },
    disclosures: {
      explicitCaptureAvailable: true,
      automaticCandidateCaptureAvailable: true,
      automaticCaptureForegroundOnly: true,
      currentSnapshotOnly: true,
      deterministicSourceOnly: true,
      databasePersistence: true,
      databaseDuplicateSuppression: true,
      noBackgroundScheduler: true,
      userEnteredOutcomeOnly: true,
      noAutomaticOutcomeInference: true,
      noPerformanceAnalytics: true,
      noPrivateAccountData: true,
      noPositionSizing: true,
      noOrderExecution: true,
    },
    methodology: {
      sourceProduct: "SPY_ZERO_DTE_DETERMINISTIC_TRADE_PLAN_ASSEMBLY",
      sourceMethodology: "ASSEMBLY_V1",
      candidateProduct:
        "SPY_ZERO_DTE_DETERMINISTIC_TRADE_PLAN_ALERT_CANDIDATE",
      candidateMethodology: "TRADE_PLAN_ALERT_CANDIDATE_V1",
      eligibleCandidateStates: [
        "READY",
        "WAITING_FOR_TRIGGER",
        "NO_QUALIFIED_CONTRACT",
        "NOT_QUALIFIED",
      ],
      triggerMethod: "EXPLICIT_FOREGROUND_POST_POLL",
      deduplicationMethod: "POSTGRESQL_UNIQUE_USER_SOURCE_REFERENCE_KEY",
      persistenceMethod: "POSTGRESQL",
      schedulerMethod: "NONE",
    },
    ...overrides,
  };
}

const tests: Array<[string, () => void]> = [];
function test(name: string, fn: () => void): void {
  tests.push([name, fn]);
}

test("capture mode labels distinguish manual and automatic rows", () => {
  assert.equal(JOURNAL_CAPTURE_MODE_LABEL.EXPLICIT, "Manual");
  assert.equal(JOURNAL_CAPTURE_MODE_LABEL.AUTOMATIC_CANDIDATE, "Automatic");
});

test("no-candidate result copy is operational and non-order-like", () => {
  const copy = automaticCaptureResultCopy(response());
  assert.equal(copy.includes("No meaningful deterministic candidate"), true);
  assert.equal(/buy|sell|order/i.test(copy), false);
});

test("duplicate result copy explains database suppression", () => {
  const copy = automaticCaptureResultCopy(
    response({
      automaticCaptureState: "DUPLICATE_SUPPRESSED",
      primaryReasonCode: "JOURNAL_AUTOMATIC_DUPLICATE_SUPPRESSED",
    }),
  );
  assert.equal(copy.includes("already persisted"), true);
});

test("Journal page provides explicit start stop and evaluate controls", () => {
  const source = readFileSync(
    resolve(process.cwd(), "apps/web/src/app/journal/page.tsx"),
    "utf8",
  );
  assert.equal(source.includes("Automatic Candidate Capture"), true);
  assert.equal(source.includes("Start automatic capture"), true);
  assert.equal(source.includes("Stop automatic capture"), true);
  assert.equal(source.includes("Evaluate now"), true);
});

test("automatic capture cadence is foreground-only", () => {
  const source = readFileSync(
    resolve(process.cwd(), "apps/web/src/hooks/use-journal.ts"),
    "utf8",
  );
  assert.equal(source.includes("refetchIntervalInBackground: false"), true);
  assert.equal(source.includes("refetchOnWindowFocus: false"), true);
  assert.equal(source.includes("retry: false"), true);
});

test("automatic capture does not persist browser enablement", () => {
  const source = readFileSync(
    resolve(process.cwd(), "apps/web/src/app/journal/page.tsx"),
    "utf8",
  );
  assert.equal(source.includes("localStorage"), false);
  assert.equal(source.includes("sessionStorage"), false);
});

test("automatic capture API remains a no-store POST", () => {
  const source = readFileSync(
    resolve(process.cwd(), "apps/web/src/lib/api-client.ts"),
    "utf8",
  );
  assert.equal(source.includes('"/api/journal/spy/snapshots/automatic"'), true);
  assert.equal(source.includes("DeterministicJournalAutomaticCaptureResponseSchema"), true);
  assert.equal(source.includes('cache: "no-store"'), true);
});

test("Journal page exposes no order action", () => {
  const source = readFileSync(
    resolve(process.cwd(), "apps/web/src/app/journal/page.tsx"),
    "utf8",
  );
  assert.equal(source.includes("Submit order"), false);
  assert.equal(source.includes("placeOrder"), false);
});

for (const [name, fn] of tests) {
  fn();
  console.log(`✓ ${name}`);
}
console.log(`\nAutomatic journal capture view tests: ${tests.length} passed, 0 failed`);
