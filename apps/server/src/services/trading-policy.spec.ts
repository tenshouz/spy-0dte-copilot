import assert from "node:assert/strict";
import {
  TRADING_POLICY_V1,
  buildExecutionModel,
  buildSetupEpisodeId,
  buildTradingRiskLedger,
  calculateConsecutiveLosses,
  deriveTargetLevels,
  evaluateTradingClock,
  evaluateTradingRestrictions,
  normalizeSetupLevelBucket,
  selectPositionManagementSignal,
  validateEntryEconomics,
} from "./trading-policy.logic";

let passed = 0;
function test(name: string, fn: () => void): void {
  fn();
  passed += 1;
  console.log(`✓ ${name}`);
}

const baseLedger = (overrides: Partial<Parameters<typeof buildTradingRiskLedger>[0]> = {}) =>
  buildTradingRiskLedger({
    marketDate: "2026-07-23",
    closedPositions: [],
    openPositions: [],
    tradeCount: 0,
    attemptsForCurrentEpisode: 0,
    ...overrides,
  });

test("TRADING_POLICY_V1 exactly preserves every locked control", () => {
  assert.deepEqual(
    {
      account: TRADING_POLICY_V1.paperEquivalentAccountDollars,
      premium: TRADING_POLICY_V1.maximumContractPremiumDollars,
      tradeRisk: TRADING_POLICY_V1.maximumPlannedStructuralLossDollars,
      dayRisk: TRADING_POLICY_V1.maximumDailyLossDollars,
      trades: TRADING_POLICY_V1.maximumTradesPerDay,
      losses: TRADING_POLICY_V1.stopAfterConsecutiveLosses,
      positions: TRADING_POLICY_V1.maximumConcurrentPositions,
      contracts: TRADING_POLICY_V1.maximumContractsInitially,
      attempts: TRADING_POLICY_V1.maximumAttemptsPerSetupDirectionLevel,
      entry: TRADING_POLICY_V1.latestNewEntryEasternTime,
      normalExit: TRADING_POLICY_V1.normalMandatoryExitEasternTime,
      absoluteExit: TRADING_POLICY_V1.absoluteExitDeadlineEasternTime,
      ttl: TRADING_POLICY_V1.readyAlertTtlSeconds,
      reviewMinutes: TRADING_POLICY_V1.timeStopReviewMinutes,
      minUnderlyingRr: TRADING_POLICY_V1.minimumUnderlyingRewardRiskRatio,
      minOptionRr: TRADING_POLICY_V1.minimumOptionPremiumRewardRiskRatio,
      preferredRr: TRADING_POLICY_V1.preferredRewardRiskRatio,
    },
    {
      account: 1000,
      premium: 150,
      tradeRisk: 50,
      dayRisk: 150,
      trades: 3,
      losses: 2,
      positions: 1,
      contracts: 1,
      attempts: 2,
      entry: "15:00",
      normalExit: "15:55",
      absoluteExit: "16:00",
      ttl: 60,
      reviewMinutes: 15,
      minUnderlyingRr: 1.5,
      minOptionRr: 1.5,
      preferredRr: 2,
    },
  );
  assert.equal(TRADING_POLICY_V1.preferredContractMoneyness, "ATM");
  assert.equal(TRADING_POLICY_V1.primaryExitTarget, "TARGET_2");
  assert.equal(TRADING_POLICY_V1.entryExecutionReference, "ASK_SIDE");
  assert.equal(TRADING_POLICY_V1.exitExecutionReference, "BID_SIDE");
  assert.equal(TRADING_POLICY_V1.automatedOrderExecution, false);
});

test("Eastern cutoffs are exact in daylight time", () => {
  assert.equal(evaluateTradingClock(Date.parse("2026-07-23T18:59:59Z")).entryCutoffPassed, false);
  assert.equal(evaluateTradingClock(Date.parse("2026-07-23T19:00:00Z")).entryCutoffPassed, true);
  assert.equal(evaluateTradingClock(Date.parse("2026-07-23T19:54:59Z")).mandatoryExitReached, false);
  assert.equal(evaluateTradingClock(Date.parse("2026-07-23T19:55:00Z")).mandatoryExitReached, true);
  assert.equal(evaluateTradingClock(Date.parse("2026-07-23T20:00:00Z")).absoluteExitDeadlineReached, true);
});

test("Eastern cutoffs remain exact across standard time", () => {
  assert.equal(evaluateTradingClock(Date.parse("2026-01-23T19:59:59Z")).entryCutoffPassed, false);
  assert.equal(evaluateTradingClock(Date.parse("2026-01-23T20:00:00Z")).entryCutoffPassed, true);
  assert.equal(evaluateTradingClock(Date.parse("2026-01-23T20:55:00Z")).mandatoryExitReached, true);
  assert.equal(evaluateTradingClock(Date.parse("2026-01-23T21:00:00Z")).absoluteExitDeadlineReached, true);
});

test("realized losses plus open planned risk consume the daily budget", () => {
  const ledger = baseLedger({
    closedPositions: [
      { status: "CLOSED", realizedPnlDollars: -70, closedAt: "2026-07-23T15:00:00Z" },
      { status: "CLOSED", realizedPnlDollars: 500, closedAt: "2026-07-23T14:00:00Z" },
    ],
    openPositions: [{ status: "OPEN", plannedRiskDollars: 50 }],
    tradeCount: 2,
  });
  assert.equal(ledger.realizedPnlDollars, 430);
  assert.equal(ledger.realizedLossDollars, 70);
  assert.equal(ledger.openPlannedRiskDollars, 50);
  assert.equal(ledger.usedDailyLossBudgetDollars, 120);
  assert.equal(ledger.remainingDailyLossBudgetDollars, 30);
  assert.equal(ledger.entryPermittedByLedger, false, "one open position must independently block entry");
  assert.equal(ledger.primaryBlockReasonCode, "CONCURRENT_POSITION_LIMIT_REACHED");
});

test("exactly $150 used risk blocks the next entry", () => {
  const ledger = baseLedger({
    closedPositions: [{ status: "CLOSED", realizedPnlDollars: -100, closedAt: null }],
    openPositions: [{ status: "OPEN", plannedRiskDollars: 50 }],
  });
  assert.equal(ledger.usedDailyLossBudgetDollars, 150);
  assert.equal(ledger.gates.dailyLossLimitPassed, false);
  assert.equal(ledger.primaryBlockReasonCode, "DAILY_LOSS_LIMIT_REACHED");
});

test("breakeven does not reset or increment the consecutive-loss streak", () => {
  assert.equal(
    calculateConsecutiveLosses([
      { status: "CLOSED", realizedPnlDollars: 0, closedAt: null },
      { status: "CLOSED", realizedPnlDollars: -10, closedAt: null },
      { status: "CLOSED", realizedPnlDollars: -20, closedAt: null },
      { status: "CLOSED", realizedPnlDollars: 30, closedAt: null },
    ]),
    2,
  );
});

test("trade, loss, position, and attempt gates fail at their exact limits", () => {
  assert.equal(baseLedger({ tradeCount: 3 }).primaryBlockReasonCode, "TRADE_COUNT_LIMIT_REACHED");
  assert.equal(
    baseLedger({
      closedPositions: [
        { status: "CLOSED", realizedPnlDollars: -1, closedAt: null },
        { status: "CLOSED", realizedPnlDollars: -1, closedAt: null },
      ],
    }).primaryBlockReasonCode,
    "CONSECUTIVE_LOSS_LIMIT_REACHED",
  );
  assert.equal(
    baseLedger({ openPositions: [{ status: "OPEN", plannedRiskDollars: 1 }] }).primaryBlockReasonCode,
    "CONCURRENT_POSITION_LIMIT_REACHED",
  );
  assert.equal(baseLedger({ attemptsForCurrentEpisode: 2 }).primaryBlockReasonCode, "ATTEMPT_LIMIT_REACHED");
});

test("routine one/two-cent level movement cannot invent a new episode", () => {
  assert.equal(normalizeSetupLevelBucket(500.011), normalizeSetupLevelBucket(500.024));
  const common = {
    marketDate: "2026-07-23",
    setupId: "VWAP_RECLAIM",
    direction: "CALLS" as const,
    levelType: "VWAP",
    confirmationCandleAt: "2026-07-23T14:00:00.000Z",
  };
  assert.equal(
    buildSetupEpisodeId({ ...common, triggerLevel: 500.011 }),
    buildSetupEpisodeId({ ...common, triggerLevel: 500.024 }),
  );
  assert.notEqual(
    buildSetupEpisodeId({ ...common, triggerLevel: 500.011 }),
    buildSetupEpisodeId({ ...common, triggerLevel: 500.08 }),
  );
  assert.notEqual(
    buildSetupEpisodeId({ ...common, triggerLevel: 500.011, resetSequence: 0 }),
    buildSetupEpisodeId({ ...common, triggerLevel: 500.011, resetSequence: 1 }),
  );
});

test("CALL and PUT targets are symmetric and T2 cannot fall below 1.5R", () => {
  const calls = deriveTargetLevels({
    direction: "CALLS",
    entryUnderlyingPrice: 500,
    structuralStopLevel: 499,
    primaryObjectiveLevel: 501.2,
  });
  assert.deepEqual(calls, { target1Level: 501, target2Level: 501.5, target3Level: 503, riskPoints: 1 });
  const puts = deriveTargetLevels({
    direction: "PUTS",
    entryUnderlyingPrice: 500,
    structuralStopLevel: 501,
    primaryObjectiveLevel: 498.8,
  });
  assert.deepEqual(puts, { target1Level: 499, target2Level: 498.5, target3Level: 497, riskPoints: 1 });
});

test("entry economics enforce premium, structural risk, and both RR minimums", () => {
  assert.equal(
    validateEntryEconomics({ actualEntryPrice: 1.5, plannedRiskDollars: 50, underlyingRewardRiskRatio: 1.5, optionRewardRiskRatio: 1.5 }).permitted,
    true,
  );
  assert.equal(
    validateEntryEconomics({ actualEntryPrice: 1.5001, plannedRiskDollars: 50, underlyingRewardRiskRatio: 1.5, optionRewardRiskRatio: 1.5 }).reasonCode,
    "MAXIMUM_CONTRACT_PREMIUM_EXCEEDED",
  );
  assert.equal(
    validateEntryEconomics({ actualEntryPrice: 1, plannedRiskDollars: 50.01, underlyingRewardRiskRatio: 1.5, optionRewardRiskRatio: 1.5 }).reasonCode,
    "MAXIMUM_PLANNED_LOSS_EXCEEDED",
  );
  assert.equal(
    validateEntryEconomics({ actualEntryPrice: 1, plannedRiskDollars: 50, underlyingRewardRiskRatio: 1.49, optionRewardRiskRatio: 2 }).reasonCode,
    "UNDERLYING_REWARD_RISK_BELOW_MINIMUM",
  );
  assert.equal(
    validateEntryEconomics({ actualEntryPrice: 1, plannedRiskDollars: 50, underlyingRewardRiskRatio: 2, optionRewardRiskRatio: 1.49 }).reasonCode,
    "OPTION_REWARD_RISK_BELOW_MINIMUM",
  );
});

test("execution model always uses ask entry and bid exit without claiming fills", () => {
  const model = buildExecutionModel({ plannedEntryAsk: 1.4, currentExitBid: 1.2 });
  assert.equal(model.modeledEntryPrice, 1.4);
  assert.equal(model.modeledExitPrice, 1.2);
  assert.ok(Math.abs((model.modeledNetPnlDollarsPerContract ?? 0) + 20) < 1e-9);
  assert.equal(model.disclosures.noGuaranteedFill, true);
  assert.equal(model.disclosures.noOrderCreated, true);
});

test("CPI/NFP/FOMC full-day and configurable windows fail closed at boundaries", () => {
  const fullDay = evaluateTradingRestrictions(
    [{
      id: "e1", marketDate: "2026-07-23", eventType: "CPI", title: "CPI", blockMode: "FULL_DAY",
      windowStartAt: null, windowEndAt: null, enabled: true, createdAt: "2026-07-22T00:00:00.000Z", updatedAt: "2026-07-22T00:00:00.000Z",
    }],
    "2026-07-23",
    Date.parse("2026-07-23T19:00:00Z"),
  );
  assert.equal(fullDay.blocked, true);
  assert.equal(fullDay.primaryReasonCode, "FULL_DAY_EVENT_BLOCK");
  const event = {
    id: "e2", marketDate: "2026-07-23", eventType: "OTHER_MAJOR" as const, title: "Powell",
    blockMode: "WINDOW" as const, windowStartAt: "2026-07-23T14:00:00.000Z", windowEndAt: "2026-07-23T14:30:00.000Z",
    enabled: true, createdAt: "2026-07-22T00:00:00.000Z", updatedAt: "2026-07-22T00:00:00.000Z",
  };
  assert.equal(evaluateTradingRestrictions([event], "2026-07-23", Date.parse(event.windowStartAt)).blocked, true);
  assert.equal(evaluateTradingRestrictions([event], "2026-07-23", Date.parse(event.windowEndAt)).blocked, false);
});

test("$50 bid-side premium-loss backstop is a hard manual exit prompt", () => {
  const base = {
    nowMs: Date.parse("2026-07-23T14:10:00Z"),
    direction: "CALLS" as const,
    underlyingPrice: 500.5,
    structuralStopLevel: 499,
    target1Level: 501,
    target2Level: 502,
    target3Level: 503,
    timeStopReviewAtMs: Date.parse("2026-07-23T14:15:00Z"),
    actualEntryPrice: 1.4,
    maximumPlannedLossDollars: 50,
  };
  assert.equal(
    selectPositionManagementSignal({ ...base, contractBid: 0.9 }),
    "PREMIUM_LOSS_BACKSTOP",
  );
  assert.equal(
    selectPositionManagementSignal({ ...base, contractBid: 0.91 }),
    "NONE",
  );
  assert.equal(
    selectPositionManagementSignal({
      ...base,
      underlyingPrice: 498.9,
      contractBid: 0.8,
    }),
    "STRUCTURAL_STOP",
    "structural invalidation keeps priority over the premium backstop",
  );
});

test("position-management priority is deterministic and T2 remains primary", () => {
  const base = {
    direction: "CALLS" as const,
    underlyingPrice: 503,
    structuralStopLevel: 499,
    target1Level: 501,
    target2Level: 502,
    target3Level: 503,
    timeStopReviewAtMs: Date.parse("2026-07-23T14:15:00Z"),
  };
  assert.equal(selectPositionManagementSignal({ ...base, nowMs: Date.parse("2026-07-23T14:10:00Z") }), "TARGET_2");
  assert.equal(selectPositionManagementSignal({ ...base, underlyingPrice: 498, nowMs: Date.parse("2026-07-23T14:20:00Z") }), "STRUCTURAL_STOP");
  assert.equal(selectPositionManagementSignal({ ...base, nowMs: Date.parse("2026-07-23T19:55:00Z") }), "MANDATORY_1555_EXIT");
  assert.equal(selectPositionManagementSignal({ ...base, nowMs: Date.parse("2026-07-23T20:00:00Z") }), "ABSOLUTE_EXIT_DEADLINE");
});

console.log(`\n${passed} trading-policy tests passed.`);
