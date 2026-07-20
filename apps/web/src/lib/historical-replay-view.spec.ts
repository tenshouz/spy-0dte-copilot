/**
 * Deterministic view tests for the captured historical replay page.
 * Run: npx --no-install tsx apps/web/src/lib/historical-replay-view.spec.ts
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import type { HistoricalReplayRunSummary } from "@spy-copilot/shared";
import {
  REPLAY_AUDIT_LABEL,
  REPLAY_EVENT_LABEL,
  REPLAY_LOOKAHEAD_LABEL,
  buildHistoricalReplayRequest,
  formatReplayMoney,
  historicalReplayReasonCopy,
  normalizeReplayDateInput,
  replayDateRangeLabel,
  replayHistorySummaryCopy,
} from "./historical-replay-view";

const tests: Array<[string, () => void]> = [];
function test(name: string, fn: () => void): void {
  tests.push([name, fn]);
}

function runSummary(
  overrides: Partial<HistoricalReplayRunSummary> = {},
): HistoricalReplayRunSummary {
  return {
    id: "run-1",
    createdAt: "2026-07-20T15:00:00.000Z",
    startMarketDate: "2026-07-01",
    endMarketDate: "2026-07-20",
    snapshotCount: 12,
    marketDateCount: 4,
    auditState: "PASS",
    auditFailureCount: 0,
    stateChangeCount: 3,
    tradeOutcomeCount: 2,
    totalPnlDollars: 75,
    ...overrides,
  };
}

test("every audit state has deterministic copy", () => {
  assert.deepEqual(Object.keys(REPLAY_AUDIT_LABEL), ["PASS", "FAIL", "EMPTY"]);
});

test("every event type has deterministic copy", () => {
  assert.deepEqual(Object.keys(REPLAY_EVENT_LABEL), [
    "SESSION_INITIAL",
    "STATE_CHANGED",
    "STATE_UNCHANGED",
  ]);
});

test("no-look-ahead labels are fixed", () => {
  assert.deepEqual(REPLAY_LOOKAHEAD_LABEL, { PASS: "Pass", FAIL: "Fail" });
});

test("blank date inputs normalize to null", () => {
  assert.equal(normalizeReplayDateInput(""), null);
  assert.equal(normalizeReplayDateInput("   "), null);
  assert.equal(normalizeReplayDateInput("2026-07-20"), "2026-07-20");
});

test("request builder preserves explicit inclusive dates", () => {
  assert.deepEqual(
    buildHistoricalReplayRequest("2026-07-01", "2026-07-20"),
    {
      startMarketDate: "2026-07-01",
      endMarketDate: "2026-07-20",
    },
  );
});

test("date range labels cover bounded and unbounded requests", () => {
  assert.equal(replayDateRangeLabel(null, null), "All captured dates");
  assert.equal(replayDateRangeLabel("2026-07-01", null), "From 2026-07-01");
  assert.equal(replayDateRangeLabel(null, "2026-07-20"), "Through 2026-07-20");
  assert.equal(
    replayDateRangeLabel("2026-07-01", "2026-07-20"),
    "2026-07-01 through 2026-07-20",
  );
});

test("history summary is compact and deterministic", () => {
  assert.equal(
    replayHistorySummaryCopy(runSummary()),
    "12 snapshots · 4 sessions · 0 audit failures",
  );
});

test("money formatting is null safe", () => {
  assert.equal(formatReplayMoney(null), "—");
  assert.match(formatReplayMoney(75), /\$75\.00/);
});

test("reason copy distinguishes pass failure empty and database states", () => {
  assert.match(historicalReplayReasonCopy("REPLAY_COMPLETE"), /successfully/);
  assert.match(
    historicalReplayReasonCopy("REPLAY_COMPLETE_WITH_AUDIT_FAILURES"),
    /failed/,
  );
  assert.match(historicalReplayReasonCopy("REPLAY_EMPTY"), /No persisted/);
  assert.match(historicalReplayReasonCopy("DATABASE_UNAVAILABLE"), /could not/);
});

test("replay page exposes explicit run controls and date filters", () => {
  const page = readFileSync(resolve("apps/web/src/app/replay/page.tsx"), "utf8");
  assert.match(page, /Run historical replay/);
  assert.match(page, /type="date"/);
  assert.match(page, /Start market date/);
  assert.match(page, /End market date/);
});

test("replay page explicitly separates captured replay from raw reconstruction", () => {
  const page = readFileSync(resolve("apps/web/src/app/replay/page.tsx"), "utf8");
  assert.match(page, /does not invent uncaptured market states/);
  assert.match(page, /post-hoc results/);
  assert.doesNotMatch(page, /backtest profit/i);
});

test("replay page renders scorecard sessions timeline issues and history", () => {
  const page = readFileSync(resolve("apps/web/src/app/replay/page.tsx"), "utf8");
  assert.match(page, /Replay Scorecard/);
  assert.match(page, /Market-Date Replay Summary/);
  assert.match(page, /Chronological Captured-State Timeline/);
  assert.match(page, /No-Look-Ahead Audit Issues/);
  assert.match(page, /Persisted Replay Runs/);
});

test("replay hook is explicit and does not poll", () => {
  const hook = readFileSync(
    resolve("apps/web/src/hooks/use-historical-replay.ts"),
    "utf8",
  );
  assert.match(hook, /useMutation/);
  assert.doesNotMatch(hook, /refetchInterval/);
  assert.doesNotMatch(hook, /setInterval/);
});

test("API client validates all replay endpoints", () => {
  const client = readFileSync(resolve("apps/web/src/lib/api-client.ts"), "utf8");
  assert.match(client, /HistoricalReplayHistoryResponseSchema/);
  assert.match(client, /HistoricalReplayRunRequestSchema/);
  assert.match(client, /HistoricalReplayRunResponseSchema/);
  assert.match(client, /\/api\/replay\/spy\/runs/);
});

test("desktop and mobile navigation expose Historical Replay", () => {
  const sidebar = readFileSync(
    resolve("apps/web/src/components/layout/sidebar.tsx"),
    "utf8",
  );
  const mobile = readFileSync(
    resolve("apps/web/src/components/layout/mobile-nav.tsx"),
    "utf8",
  );
  assert.match(sidebar, /Historical Replay/);
  assert.match(sidebar, /\/replay/);
  assert.match(mobile, /Replay/);
  assert.match(mobile, /\/replay/);
});

let passed = 0;
for (const [name, fn] of tests) {
  try {
    fn();
    passed += 1;
    console.log(`✓ ${name}`);
  } catch (error) {
    console.error(`✗ ${name}`);
    throw error;
  }
}

console.log(`\nHistorical replay view tests: ${passed} passed, 0 failed`);
