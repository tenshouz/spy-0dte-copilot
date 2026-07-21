import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import type { SpyDeterministicSessionStructureResponse } from "@spy-copilot/shared";
import {
  formatPivotSourceRange,
  formatSessionStructureState,
  formatStructurePrice,
  getEasternMarketDate,
  getSessionStructureReferenceLines,
  openingRangeDetail,
} from "./session-structure-view";

function response(): SpyDeterministicSessionStructureResponse {
  const pivotBase = {
    metricState: "LIVE" as const,
    sourceCoverageState: "COMPLETE" as const,
    expectedTradingSessionCount: 1,
    observedTradingSessionCount: 1,
    sourceHigh: 110,
    sourceLow: 100,
    sourceClose: 105,
    pivot: 105,
    resistance1: 110,
    support1: 100,
    resistance2: 115,
    support2: 95,
    warningCode: null,
  };
  const range = (durationMinutes: 5 | 15 | 30, high: number, low: number) => ({
    durationMinutes,
    metricState: "LIVE" as const,
    phase: "COMPLETE" as const,
    coverageState: "COMPLETE" as const,
    isComplete: true,
    openingRangeStartAt: "2026-07-20T13:30:00.000Z",
    openingRangeEndAt: new Date(
      Date.parse("2026-07-20T13:30:00.000Z") + durationMinutes * 60_000,
    ).toISOString(),
    expectedCandleCount: durationMinutes / 5,
    observedCandleCount: durationMinutes / 5,
    high,
    low,
    midpoint: (high + low) / 2,
    pricePosition: "INSIDE" as const,
    interactionState: "INSIDE" as const,
    acceptedBreakoutAt: null,
    acceptedBreakdownAt: null,
    warningCode: null,
  });
  return {
    symbol: "SPY",
    product: "SPY_DETERMINISTIC_SESSION_STRUCTURE",
    methodologyVersion: "SESSION_STRUCTURE_V1",
    currentMarketDate: "2026-07-20",
    calculatedAt: "2026-07-20T14:30:00.000Z",
    engineState: "AVAILABLE",
    candleSourceState: "LIVE",
    quoteSourceState: "LIVE",
    price: 106,
    quoteTimestamp: "2026-07-20T14:30:00.000Z",
    dailyPivots: {
      period: "DAILY",
      ...pivotBase,
      sourceMarketDateStart: "2026-07-17",
      sourceMarketDateEnd: "2026-07-17",
    },
    weeklyPivots: {
      period: "WEEKLY",
      ...pivotBase,
      expectedTradingSessionCount: 5,
      observedTradingSessionCount: 5,
      pivot: 104,
      sourceMarketDateStart: "2026-07-13",
      sourceMarketDateEnd: "2026-07-17",
    },
    openingRanges: {
      fiveMinute: range(5, 107, 104),
      fifteenMinute: range(15, 108, 103),
      thirtyMinute: range(30, 109, 102),
    },
    warnings: [],
    methodology: {
      pivotFamily: "TRADITIONAL",
      pivotLevels: ["P", "R1", "S1", "R2", "S2"],
      dailyPivotSource: "IMMEDIATE_PREVIOUS_COMPLETE_RTH",
      weeklyPivotSource: "PREVIOUS_COMPLETE_NYSE_TRADING_WEEK",
      openingRangeDurationsMinutes: [5, 15, 30],
      openingRangeAcceptanceRule: "TWO_CONSECUTIVE_COMPLETED_5M_CLOSES",
      boundedCandleLookbackCalendarDays: 21,
      exchangeCalendarMethod:
        "NYSE_OFFICIAL_PUBLISHED_FULL_DAY_AND_EARLY_CLOSES_2026_2028",
    },
    disclosures: {
      deterministicOnly: true,
      currentSnapshotOnly: true,
      noFutureCandles: true,
      traditionalPivotsOnly: true,
      supplementalContextOnly: true,
      noStandaloneSignals: true,
      noPrivateAccountData: true,
      noPositionSizing: true,
      noOrderExecution: true,
    },
  };
}

assert.equal(formatSessionStructureState("BREAKOUT_ACCEPTED"), "Breakout Accepted");
assert.equal(formatStructurePrice(null), "—");
assert.equal(formatStructurePrice(105.126), "$105.13");
assert.equal(formatPivotSourceRange(response().dailyPivots), "2026-07-17");
assert.equal(
  formatPivotSourceRange(response().weeklyPivots),
  "2026-07-13 – 2026-07-17",
);
assert.equal(openingRangeDetail(response().openingRanges.fiveMinute), "Complete · Inside");

const lines = getSessionStructureReferenceLines(response());
assert.deepEqual(
  lines.map((line) => line.title),
  ["Daily P", "Weekly P", "OR5 H", "OR5 L", "OR30 H", "OR30 L"],
);
assert.equal(lines.every((line) => Number.isFinite(line.price)), true);
assert.equal(
  getEasternMarketDate("2026-07-20T00:30:00.000Z"),
  "2026-07-19",
);
assert.equal(getEasternMarketDate("not-a-date"), null);

const hookSource = readFileSync(
  "apps/web/src/hooks/use-spy-session-structure.ts",
  "utf8",
);
assert.match(hookSource, /getSpyDeterministicSessionStructure/);
assert.match(hookSource, /refetchInterval/);

const panelSource = readFileSync(
  "apps/web/src/components/dashboard/session-structure-panel.tsx",
  "utf8",
);
assert.match(panelSource, /Daily Traditional Pivots/);
assert.match(panelSource, /Weekly Traditional Pivots/);
assert.match(panelSource, /openingRanges\.fiveMinute/);
assert.match(panelSource, /openingRanges\.fifteenMinute/);
assert.match(panelSource, /openingRanges\.thirtyMinute/);
const r2Index = panelSource.indexOf('label="R2"');
const r1Index = panelSource.indexOf('label="R1"');
const pivotIndex = panelSource.indexOf('label="Pivot"');
const s1Index = panelSource.indexOf('label="S1"');
const s2Index = panelSource.indexOf('label="S2"');
assert.equal(r2Index < r1Index && r1Index < pivotIndex && pivotIndex < s1Index && s1Index < s2Index, true);
assert.match(panelSource, /label="R2"[^>]*tone="bear"/);
assert.match(panelSource, /label="R1"[^>]*tone="bear"/);
assert.match(panelSource, /label="S1"[^>]*tone="bull"/);
assert.match(panelSource, /label="S2"[^>]*tone="bull"/);
assert.doesNotMatch(panelSource, /Buy|Sell|Submit Order|Execute Order/);

const liveChartSource = readFileSync(
  "apps/web/src/components/dashboard/live-chart.tsx",
  "utf8",
);
assert.match(liveChartSource, /additionalPriceLines/);
assert.match(liveChartSource, /chartMarketDate === sessionStructure\.currentMarketDate/);

const dashboardSource = readFileSync("apps/web/src/app/dashboard/page.tsx", "utf8");
assert.match(dashboardSource, /SessionStructurePanel/);

const marketDataSource = readFileSync("apps/web/src/app/market-data/page.tsx", "utf8");
assert.match(marketDataSource, /SessionStructurePanel/);
assert.match(marketDataSource, /getSessionStructureReferenceLines/);

const apiClientSource = readFileSync("apps/web/src/lib/api-client.ts", "utf8");
assert.match(apiClientSource, /\/api\/session-structure\/spy/);
assert.match(apiClientSource, /SpyDeterministicSessionStructureResponseSchema/);

console.log("Session Structure view tests: 25 passed, 0 failed");
