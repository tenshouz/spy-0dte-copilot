/**
 * Deterministic tests for JOURNAL_ANALYTICS_V1 aggregation and delivery.
 * Run: npx --no-install tsx apps/server/src/services/deterministic-journal-analytics.spec.ts
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { DeterministicJournalAnalyticsResponseSchema } from "@spy-copilot/shared";
import {
  buildDeterministicJournalAnalyticsPayload,
  buildDeterministicJournalAnalyticsResponse,
  buildDeterministicJournalAnalyticsUnavailableResponse,
  journalConfidenceBand,
  type DeterministicJournalAnalyticsRow,
} from "./deterministic-journal-analytics.logic";
import {
  getDeterministicJournalAnalyticsWithDependencies,
  type DeterministicJournalAnalyticsServiceDependencies,
} from "./deterministic-journal-analytics.service";

const NOW = new Date("2026-07-20T15:00:00.000Z");

function row(
  overrides: Partial<DeterministicJournalAnalyticsRow> = {},
): DeterministicJournalAnalyticsRow {
  return {
    currentMarketDate: "2026-07-20",
    captureMode: "EXPLICIT",
    planState: "READY",
    direction: "CALLS",
    confidenceScore: 82,
    outcomeState: "UNREVIEWED",
    realizedPnlDollars: null,
    ...overrides,
  };
}

function dependencies(
  rows: DeterministicJournalAnalyticsRow[],
  overrides: Partial<DeterministicJournalAnalyticsServiceDependencies> = {},
): DeterministicJournalAnalyticsServiceDependencies {
  return {
    databaseConfigured: () => true,
    getUserId: async () => "user-1",
    repository: { listAll: async () => rows },
    now: () => NOW,
    log: () => undefined,
    ...overrides,
  };
}

const tests: Array<[string, () => void | Promise<void>]> = [];
function test(name: string, fn: () => void | Promise<void>): void {
  tests.push([name, fn]);
}

test("methodology is JOURNAL_ANALYTICS_V1", () => {
  assert.equal(
    buildDeterministicJournalAnalyticsResponse([], NOW).methodologyVersion,
    "JOURNAL_ANALYTICS_V1",
  );
});

test("empty analytics remain available with zero counts", () => {
  const response = buildDeterministicJournalAnalyticsResponse([], NOW);
  assert.equal(response.engineState, "AVAILABLE");
  assert.equal(response.primaryReasonCode, "JOURNAL_ANALYTICS_EMPTY");
  assert.equal(response.analytics?.counts.totalSnapshots, 0);
  assert.equal(response.analytics?.dataStartMarketDate, null);
  assert.equal(response.analytics?.performance.totalPnlDollars, null);
});

test("review and capture counts reconcile exactly", () => {
  const analytics = buildDeterministicJournalAnalyticsPayload([
    row({ outcomeState: "UNREVIEWED" }),
    row({ outcomeState: "NO_TRADE", captureMode: "AUTOMATIC_CANDIDATE" }),
    row({ outcomeState: "WIN", realizedPnlDollars: 100 }),
  ]);
  assert.deepEqual(analytics.counts, {
    totalSnapshots: 3,
    manualSnapshots: 2,
    automaticSnapshots: 1,
    reviewedSnapshots: 2,
    unreviewedSnapshots: 1,
    noTradeSnapshots: 1,
    tradeOutcomes: 1,
    wins: 1,
    losses: 0,
    breakevens: 0,
  });
});

test("performance math uses only reviewed trade outcomes", () => {
  const analytics = buildDeterministicJournalAnalyticsPayload([
    row({ outcomeState: "WIN", realizedPnlDollars: 200 }),
    row({ outcomeState: "LOSS", realizedPnlDollars: -100 }),
    row({ outcomeState: "BREAKEVEN", realizedPnlDollars: 0 }),
    row({ outcomeState: "NO_TRADE" }),
    row({ outcomeState: "UNREVIEWED" }),
  ]);
  assert.equal(analytics.performance.reviewCoveragePercent, 80);
  assert.equal(analytics.performance.tradeParticipationPercent, 75);
  assert.equal(analytics.performance.winRatePercent, 50);
  assert.equal(analytics.performance.totalPnlDollars, 100);
  assert.equal(analytics.performance.averagePnlDollars, 33.33);
  assert.equal(analytics.performance.expectancyDollars, 33.33);
  assert.equal(analytics.performance.averageWinDollars, 200);
  assert.equal(analytics.performance.averageLossDollars, -100);
  assert.equal(analytics.performance.profitFactor, 2);
});

test("win rate excludes breakeven while expectancy includes it", () => {
  const analytics = buildDeterministicJournalAnalyticsPayload([
    row({ outcomeState: "WIN", realizedPnlDollars: 90 }),
    row({ outcomeState: "BREAKEVEN", realizedPnlDollars: 0 }),
  ]);
  assert.equal(analytics.performance.winRatePercent, 100);
  assert.equal(analytics.performance.expectancyDollars, 45);
});

test("profit factor is null without losses", () => {
  const analytics = buildDeterministicJournalAnalyticsPayload([
    row({ outcomeState: "WIN", realizedPnlDollars: 50 }),
  ]);
  assert.equal(analytics.performance.profitFactor, null);
});

test("zero gross profit with losses produces zero profit factor", () => {
  const analytics = buildDeterministicJournalAnalyticsPayload([
    row({ outcomeState: "LOSS", realizedPnlDollars: -50 }),
  ]);
  assert.equal(analytics.performance.profitFactor, 0);
});

test("largest wins and losses are retained", () => {
  const analytics = buildDeterministicJournalAnalyticsPayload([
    row({ outcomeState: "WIN", realizedPnlDollars: 50 }),
    row({ outcomeState: "WIN", realizedPnlDollars: 125 }),
    row({ outcomeState: "LOSS", realizedPnlDollars: -25 }),
    row({ outcomeState: "LOSS", realizedPnlDollars: -80 }),
  ]);
  assert.equal(analytics.performance.largestWinDollars, 125);
  assert.equal(analytics.performance.largestLossDollars, -80);
});

test("direction breakdown always has calls puts and none", () => {
  const analytics = buildDeterministicJournalAnalyticsPayload([
    row({ direction: "PUTS", outcomeState: "WIN", realizedPnlDollars: 50 }),
  ]);
  assert.deepEqual(
    analytics.byDirection.map((entry) => entry.key),
    ["CALLS", "PUTS", "NONE"],
  );
  assert.equal(analytics.byDirection[1]?.wins, 1);
});

test("all seven plan states are represented", () => {
  const analytics = buildDeterministicJournalAnalyticsPayload([]);
  assert.equal(analytics.byPlanState.length, 7);
  assert.deepEqual(
    analytics.byPlanState.map((entry) => entry.key),
    [
      "READY",
      "WAITING_FOR_TRIGGER",
      "NO_QUALIFIED_CONTRACT",
      "NOT_QUALIFIED",
      "NO_SETUP",
      "NOT_APPLICABLE",
      "UNAVAILABLE",
    ],
  );
});

test("capture mode breakdown distinguishes manual and automatic", () => {
  const analytics = buildDeterministicJournalAnalyticsPayload([
    row(),
    row({ captureMode: "AUTOMATIC_CANDIDATE" }),
  ]);
  assert.equal(analytics.byCaptureMode[0]?.snapshotCount, 1);
  assert.equal(analytics.byCaptureMode[1]?.snapshotCount, 1);
});

test("confidence bands use fixed inclusive boundaries", () => {
  assert.equal(journalConfidenceBand(null), "UNAVAILABLE");
  assert.equal(journalConfidenceBand(0), "LOW_0_49");
  assert.equal(journalConfidenceBand(49.99), "LOW_0_49");
  assert.equal(journalConfidenceBand(50), "MODERATE_50_69");
  assert.equal(journalConfidenceBand(70), "HIGH_70_84");
  assert.equal(journalConfidenceBand(85), "VERY_HIGH_85_100");
  assert.equal(journalConfidenceBand(100), "VERY_HIGH_85_100");
});

test("confidence breakdown aggregates trade results", () => {
  const analytics = buildDeterministicJournalAnalyticsPayload([
    row({ confidenceScore: 88, outcomeState: "WIN", realizedPnlDollars: 80 }),
    row({ confidenceScore: 88, outcomeState: "LOSS", realizedPnlDollars: -20 }),
  ]);
  const high = analytics.byConfidenceBand.find(
    (entry) => entry.key === "VERY_HIGH_85_100",
  );
  assert.equal(high?.tradeCount, 2);
  assert.equal(high?.winRatePercent, 50);
  assert.equal(high?.totalPnlDollars, 60);
});

test("daily performance is chronological and limited to 30 dates", () => {
  const rows = Array.from({ length: 35 }, (_, index) => {
    const date = new Date(Date.UTC(2026, 5, 1 + index));
    return row({
      currentMarketDate: date.toISOString().slice(0, 10),
      outcomeState: "NO_TRADE",
    });
  });
  const analytics = buildDeterministicJournalAnalyticsPayload(rows);
  assert.equal(analytics.dailyPerformance.length, 30);
  assert.equal(analytics.dailyPerformance[0]?.marketDate, "2026-06-06");
  assert.equal(analytics.dailyPerformance.at(-1)?.marketDate, "2026-07-05");
});

test("analytics date range spans all persisted snapshots", () => {
  const analytics = buildDeterministicJournalAnalyticsPayload([
    row({ currentMarketDate: "2026-07-18" }),
    row({ currentMarketDate: "2026-07-20" }),
    row({ currentMarketDate: "2026-07-19" }),
  ]);
  assert.equal(analytics.dataStartMarketDate, "2026-07-18");
  assert.equal(analytics.dataEndMarketDate, "2026-07-20");
});

test("invalid reviewed trade row fails closed", () => {
  assert.throws(() =>
    buildDeterministicJournalAnalyticsPayload([
      row({ outcomeState: "WIN", realizedPnlDollars: null }),
    ]),
  );
});

test("available response validates against shared contract", () => {
  const response = buildDeterministicJournalAnalyticsResponse(
    [row({ outcomeState: "NO_TRADE" })],
    NOW,
  );
  assert.equal(DeterministicJournalAnalyticsResponseSchema.safeParse(response).success, true);
});

test("database unavailable response validates and exposes no analytics", () => {
  const response = buildDeterministicJournalAnalyticsUnavailableResponse(
    "DATABASE_UNAVAILABLE",
    NOW,
  );
  assert.equal(response.engineState, "UNAVAILABLE");
  assert.equal(response.analytics, null);
  assert.equal(DeterministicJournalAnalyticsResponseSchema.safeParse(response).success, true);
});

test("disclosures define performance population rules", () => {
  const disclosures = buildDeterministicJournalAnalyticsResponse([], NOW).disclosures;
  assert.equal(disclosures.userEnteredOutcomeOnly, true);
  assert.equal(disclosures.unreviewedExcludedFromPerformance, true);
  assert.equal(disclosures.noTradeExcludedFromPnl, true);
  assert.equal(disclosures.winRateExcludesBreakeven, true);
  assert.equal(disclosures.breakevenIncludedInExpectancy, true);
});

test("service retrieves all rows for the resolved user exactly once", async () => {
  let userCalls = 0;
  let listCalls = 0;
  const response = await getDeterministicJournalAnalyticsWithDependencies(
    dependencies([row()], {
      getUserId: async () => {
        userCalls += 1;
        return "user-analytics";
      },
      repository: {
        listAll: async (userId) => {
          listCalls += 1;
          assert.equal(userId, "user-analytics");
          return [row()];
        },
      },
    }),
  );
  assert.equal(response.engineState, "AVAILABLE");
  assert.equal(userCalls, 1);
  assert.equal(listCalls, 1);
});

test("service avoids database work when DATABASE_URL is missing", async () => {
  let calls = 0;
  const response = await getDeterministicJournalAnalyticsWithDependencies(
    dependencies([], {
      databaseConfigured: () => false,
      getUserId: async () => {
        calls += 1;
        return "never";
      },
    }),
  );
  assert.equal(response.primaryReasonCode, "DATABASE_NOT_CONFIGURED");
  assert.equal(calls, 0);
});

test("service database failure returns sanitized unavailable response", async () => {
  let logged = "";
  const response = await getDeterministicJournalAnalyticsWithDependencies(
    dependencies([], {
      repository: { listAll: async () => { throw new Error("private details"); } },
      log: (category) => { logged = category; },
    }),
  );
  assert.equal(response.primaryReasonCode, "DATABASE_UNAVAILABLE");
  assert.equal(logged, "analytics failed");
  assert.equal(JSON.stringify(response).includes("private details"), false);
});

test("route is GET-only no-store and rejects query parameters", () => {
  const source = readFileSync(
    resolve(process.cwd(), "apps/server/src/routes/journal.routes.ts"),
    "utf8",
  );
  assert.match(source, /router\.get\("\/spy\/analytics"/);
  assert.match(source, /setDeterministicJournalHeaders\(res\)/);
  assert.match(source, /rejectUnsupportedQuery\(req\.query, res\)/);
  assert.doesNotMatch(source, /router\.post\("\/spy\/analytics"/);
});

test("API client validates the dedicated analytics response", () => {
  const source = readFileSync(
    resolve(process.cwd(), "apps/web/src/lib/api-client.ts"),
    "utf8",
  );
  assert.match(source, /getDeterministicJournalAnalytics/);
  assert.match(source, /\/api\/journal\/spy\/analytics/);
  assert.match(source, /DeterministicJournalAnalyticsResponseSchema/);
});

test("analytics service reads only aggregate-safe journal columns", () => {
  const source = readFileSync(
    resolve(
      process.cwd(),
      "apps/server/src/services/deterministic-journal-analytics.service.ts",
    ),
    "utf8",
  );
  assert.doesNotMatch(source, /sourceAssembly|outcomeNotes|accountRisk|selectedContract|availableCash/i);
  assert.match(source, /"realizedPnlDollars"/);
});

async function run(): Promise<void> {
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
  console.log(`\nDeterministic journal analytics tests: ${passed} passed, 0 failed`);
}

void run();
