/**
 * Deterministic presentation tests for Journal Analytics V1.
 * Run: npx --no-install tsx apps/web/src/lib/deterministic-journal-analytics-view.spec.ts
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  analyticsMoneyTone,
  analyticsReasonCopy,
  formatAnalyticsMoney,
  formatAnalyticsPercent,
  formatProfitFactor,
  visibleBreakdownRows,
} from "./deterministic-journal-analytics-view";

const tests: Array<[string, () => void]> = [];
function test(name: string, fn: () => void): void {
  tests.push([name, fn]);
}

test("money formatting is signed and null-safe", () => {
  assert.equal(formatAnalyticsMoney(125.5), "+$125.50");
  assert.equal(formatAnalyticsMoney(-75), "-$75.00");
  assert.equal(formatAnalyticsMoney(0), "$0.00");
  assert.equal(formatAnalyticsMoney(null), "—");
});

test("percent and profit factor formatting are deterministic", () => {
  assert.equal(formatAnalyticsPercent(62.345), "62.3%");
  assert.equal(formatAnalyticsPercent(null), "—");
  assert.equal(formatProfitFactor(1.234), "1.23");
  assert.equal(formatProfitFactor(null), "—");
});

test("money tone follows realized sign only", () => {
  assert.equal(analyticsMoneyTone(1), "bull");
  assert.equal(analyticsMoneyTone(-1), "bear");
  assert.equal(analyticsMoneyTone(0), "default");
  assert.equal(analyticsMoneyTone(null), "default");
});

test("every analytics response state has fixed copy", () => {
  assert.match(analyticsReasonCopy("JOURNAL_ANALYTICS_AVAILABLE"), /persisted/i);
  assert.match(analyticsReasonCopy("JOURNAL_ANALYTICS_EMPTY"), /save and review/i);
  assert.match(analyticsReasonCopy("DATABASE_NOT_CONFIGURED"), /not configured/i);
  assert.match(analyticsReasonCopy("DATABASE_UNAVAILABLE"), /temporarily unavailable/i);
});

test("zero-only breakdown rows are hidden", () => {
  const base = {
    key: "CALLS",
    label: "Calls",
    snapshotCount: 0,
    reviewedCount: 0,
    noTradeCount: 0,
    tradeCount: 0,
    wins: 0,
    losses: 0,
    breakevens: 0,
    winRatePercent: null,
    totalPnlDollars: null,
    averagePnlDollars: null,
  };
  assert.equal(visibleBreakdownRows([base]).length, 0);
  assert.equal(visibleBreakdownRows([{ ...base, snapshotCount: 1 }]).length, 1);
});

test("analytics panel consumes the dedicated analytics hook", () => {
  const source = readFileSync(
    resolve(process.cwd(), "apps/web/src/components/journal/journal-analytics-panel.tsx"),
    "utf8",
  );
  assert.match(source, /useDeterministicJournalAnalytics/);
  assert.doesNotMatch(source, /getDeterministicJournalAnalytics\(/);
});

test("journal page composes analytics without calculating P&L locally", () => {
  const source = readFileSync(
    resolve(process.cwd(), "apps/web/src/app/journal/page.tsx"),
    "utf8",
  );
  assert.match(source, /JournalAnalyticsPanel/);
  assert.doesNotMatch(source, /reduce\([^)]*realizedPnlDollars/);
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
console.log(`\nJournal analytics view tests: ${passed} passed, 0 failed`);
