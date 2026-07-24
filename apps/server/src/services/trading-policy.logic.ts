import { createHash } from "node:crypto";
import {
  TradingExecutionModelSchema,
  TradingPolicySchema,
  TradingRestrictionEvaluationSchema,
  TradingRiskLedgerSchema,
  type TradingDirection,
  type TradingExecutionModel,
  type TradingPolicy,
  type TradingRestrictedEvent,
  type TradingRestrictionEvaluation,
  type TradingRiskLedger,
} from "@spy-copilot/shared";

export const TRADING_POLICY_V1: TradingPolicy = TradingPolicySchema.parse({
  version: "TRADING_POLICY_V1",
  primaryObjective: "NET_EXPECTANCY_AFTER_REALISTIC_EXECUTION_COSTS",
  paperEquivalentAccountDollars: 1000,
  maximumContractPremiumDollars: 150,
  maximumPlannedStructuralLossDollars: 50,
  maximumDailyLossDollars: 150,
  maximumTradesPerDay: 3,
  stopAfterConsecutiveLosses: 2,
  maximumConcurrentPositions: 1,
  maximumContractsInitially: 1,
  maximumAttemptsPerSetupDirectionLevel: 2,
  latestNewEntryEasternTime: "15:00",
  normalMandatoryExitEasternTime: "15:55",
  absoluteExitDeadlineEasternTime: "16:00",
  readyAlertTtlSeconds: 60,
  timeStopReviewCompletedCandles: 3,
  timeStopReviewMinutes: 15,
  preferredContractMoneyness: "ATM",
  minimumUnderlyingRewardRiskRatio: 1.5,
  minimumOptionPremiumRewardRiskRatio: 1.5,
  preferredRewardRiskRatio: 2,
  primaryExitTarget: "TARGET_2",
  target1Role: "MANAGEMENT_LEVEL",
  target3Role: "RESEARCH_EXTENSION_OBJECTIVE",
  entryExecutionReference: "ASK_SIDE",
  exitExecutionReference: "BID_SIDE",
  dailyLossIncludesOpenPlannedRisk: true,
  manualEntryConfirmationRequired: true,
  manualOverridesRequireReason: true,
  unresolvedDirectionalConflictsFailClosed: true,
  duplicateSignalsConsolidated: true,
  newSetupFamiliesDefaultToShadow: true,
  discordActionableOnly: true,
  automatedOrderExecution: false,
});

const EASTERN_TIME_ZONE = "America/New_York";
const easternPartsFormatter = new Intl.DateTimeFormat("en-US", {
  timeZone: EASTERN_TIME_ZONE,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
  hourCycle: "h23",
});

export interface EasternClockParts {
  marketDate: string;
  hour: number;
  minute: number;
  second: number;
  minuteOfDay: number;
}

export function getEasternClockParts(nowMs: number): EasternClockParts {
  const parts = easternPartsFormatter.formatToParts(new Date(nowMs));
  const values = new Map(parts.map((part) => [part.type, part.value]));
  const year = values.get("year");
  const month = values.get("month");
  const day = values.get("day");
  const hour = Number(values.get("hour"));
  const minute = Number(values.get("minute"));
  const second = Number(values.get("second"));
  if (!year || !month || !day || !Number.isInteger(hour) || !Number.isInteger(minute)) {
    throw new Error("Unable to resolve America/New_York clock");
  }
  return {
    marketDate: `${year}-${month}-${day}`,
    hour,
    minute,
    second: Number.isInteger(second) ? second : 0,
    minuteOfDay: hour * 60 + minute,
  };
}

function parsePolicyMinute(value: string): number {
  const [hour, minute] = value.split(":").map(Number);
  if (!Number.isInteger(hour) || !Number.isInteger(minute)) {
    throw new Error(`Invalid policy clock value: ${value}`);
  }
  return hour * 60 + minute;
}

export interface TradingClockEvaluation {
  marketDate: string;
  entryCutoffPassed: boolean;
  mandatoryExitReached: boolean;
  absoluteExitDeadlineReached: boolean;
  primaryReasonCode:
    | "ENTRY_WINDOW_OPEN"
    | "LATEST_ENTRY_TIME_REACHED"
    | "MANDATORY_EXIT_TIME_REACHED"
    | "ABSOLUTE_EXIT_DEADLINE_REACHED";
}

export function evaluateTradingClock(nowMs: number): TradingClockEvaluation {
  const eastern = getEasternClockParts(nowMs);
  const latestEntry = parsePolicyMinute(TRADING_POLICY_V1.latestNewEntryEasternTime);
  const mandatoryExit = parsePolicyMinute(TRADING_POLICY_V1.normalMandatoryExitEasternTime);
  const absoluteExit = parsePolicyMinute(TRADING_POLICY_V1.absoluteExitDeadlineEasternTime);
  const absoluteExitDeadlineReached = eastern.minuteOfDay >= absoluteExit;
  const mandatoryExitReached = eastern.minuteOfDay >= mandatoryExit;
  const entryCutoffPassed = eastern.minuteOfDay >= latestEntry;
  return {
    marketDate: eastern.marketDate,
    entryCutoffPassed,
    mandatoryExitReached,
    absoluteExitDeadlineReached,
    primaryReasonCode: absoluteExitDeadlineReached
      ? "ABSOLUTE_EXIT_DEADLINE_REACHED"
      : mandatoryExitReached
        ? "MANDATORY_EXIT_TIME_REACHED"
        : entryCutoffPassed
          ? "LATEST_ENTRY_TIME_REACHED"
          : "ENTRY_WINDOW_OPEN",
  };
}

export function evaluateTradingRestrictions(
  events: TradingRestrictedEvent[],
  marketDate: string,
  nowMs: number,
): TradingRestrictionEvaluation {
  const active = events.filter((event) => {
    if (!event.enabled || event.marketDate !== marketDate) return false;
    if (event.blockMode === "FULL_DAY") return true;
    if (!event.windowStartAt || !event.windowEndAt) return false;
    const start = Date.parse(event.windowStartAt);
    const end = Date.parse(event.windowEndAt);
    return Number.isFinite(start) && Number.isFinite(end) && nowMs >= start && nowMs < end;
  });
  const fullDay = active.filter((event) => event.blockMode === "FULL_DAY");
  return TradingRestrictionEvaluationSchema.parse({
    blocked: active.length > 0,
    primaryReasonCode:
      fullDay.length > 0
        ? "FULL_DAY_EVENT_BLOCK"
        : active.length > 0
          ? "EVENT_WINDOW_BLOCK"
          : "NO_RESTRICTION",
    activeEventIds: active.map((event) => event.id).sort(),
    activeEventTypes: [...new Set(active.map((event) => event.eventType))].sort(),
  });
}

export interface LedgerClosedPositionInput {
  realizedPnlDollars: number | null;
  closedAt: string | null;
  status: "OPEN" | "CLOSED" | "CANCELLED";
}

export interface LedgerOpenPositionInput {
  plannedRiskDollars: number;
  status: "OPEN" | "CLOSED" | "CANCELLED";
}

export interface BuildTradingRiskLedgerInput {
  marketDate: string;
  closedPositions: LedgerClosedPositionInput[];
  openPositions: LedgerOpenPositionInput[];
  tradeCount: number;
  attemptsForCurrentEpisode: number;
}

export function calculateConsecutiveLosses(
  closedPositionsNewestFirst: LedgerClosedPositionInput[],
): number {
  let consecutiveLosses = 0;
  for (const position of closedPositionsNewestFirst) {
    if (position.status !== "CLOSED" || position.realizedPnlDollars === null) continue;
    if (position.realizedPnlDollars < 0) {
      consecutiveLosses += 1;
      continue;
    }
    if (position.realizedPnlDollars > 0) break;
    // A true breakeven neither increments nor resets the streak.
  }
  return consecutiveLosses;
}

export function buildTradingRiskLedger(
  input: BuildTradingRiskLedgerInput,
): TradingRiskLedger {
  const closed = input.closedPositions.filter((row) => row.status === "CLOSED");
  const realizedPnlDollars = closed.reduce(
    (sum, row) => sum + (row.realizedPnlDollars ?? 0),
    0,
  );
  const realizedLossDollars = closed.reduce(
    (sum, row) => sum + Math.max(0, -(row.realizedPnlDollars ?? 0)),
    0,
  );
  const open = input.openPositions.filter((row) => row.status === "OPEN");
  const openPlannedRiskDollars = open.reduce(
    (sum, row) => sum + Math.max(0, row.plannedRiskDollars),
    0,
  );
  const usedDailyLossBudgetDollars = realizedLossDollars + openPlannedRiskDollars;
  const remainingDailyLossBudgetDollars = Math.max(
    0,
    TRADING_POLICY_V1.maximumDailyLossDollars - usedDailyLossBudgetDollars,
  );
  const consecutiveLosses = calculateConsecutiveLosses(input.closedPositions);
  const gates = {
    dailyLossLimitPassed:
      usedDailyLossBudgetDollars < TRADING_POLICY_V1.maximumDailyLossDollars,
    tradeCountLimitPassed: input.tradeCount < TRADING_POLICY_V1.maximumTradesPerDay,
    consecutiveLossLimitPassed:
      consecutiveLosses < TRADING_POLICY_V1.stopAfterConsecutiveLosses,
    concurrentPositionLimitPassed:
      open.length < TRADING_POLICY_V1.maximumConcurrentPositions,
    attemptLimitPassed:
      input.attemptsForCurrentEpisode <
      TRADING_POLICY_V1.maximumAttemptsPerSetupDirectionLevel,
  };
  const primaryBlockReasonCode = !gates.dailyLossLimitPassed
    ? "DAILY_LOSS_LIMIT_REACHED"
    : !gates.tradeCountLimitPassed
      ? "TRADE_COUNT_LIMIT_REACHED"
      : !gates.consecutiveLossLimitPassed
        ? "CONSECUTIVE_LOSS_LIMIT_REACHED"
        : !gates.concurrentPositionLimitPassed
          ? "CONCURRENT_POSITION_LIMIT_REACHED"
          : !gates.attemptLimitPassed
            ? "ATTEMPT_LIMIT_REACHED"
            : null;

  return TradingRiskLedgerSchema.parse({
    marketDate: input.marketDate,
    policyVersion: TRADING_POLICY_V1.version,
    realizedPnlDollars,
    realizedLossDollars,
    openPlannedRiskDollars,
    usedDailyLossBudgetDollars,
    remainingDailyLossBudgetDollars,
    tradeCount: input.tradeCount,
    remainingTradeCount: Math.max(
      0,
      TRADING_POLICY_V1.maximumTradesPerDay - input.tradeCount,
    ),
    consecutiveLosses,
    openPositionCount: open.length,
    attemptsForCurrentEpisode: input.attemptsForCurrentEpisode,
    gates,
    entryPermittedByLedger: primaryBlockReasonCode === null,
    primaryBlockReasonCode,
  });
}

export function normalizeSetupLevelBucket(level: number | null): string {
  if (level === null || !Number.isFinite(level) || level <= 0) return "unavailable";
  // Five-cent buckets prevent ordinary one/two-cent recalculations from inventing a new attempt identity.
  return (Math.round(level * 20) / 20).toFixed(2);
}

export function buildSetupEpisodeId(input: {
  marketDate: string;
  setupId: string;
  direction: TradingDirection;
  levelType: string;
  triggerLevel: number | null;
  confirmationCandleAt?: string | null;
  resetSequence?: number;
}): string {
  const source = [
    input.marketDate,
    input.setupId,
    input.direction,
    input.levelType,
    normalizeSetupLevelBucket(input.triggerLevel),
    input.confirmationCandleAt ?? "no-confirmation-candle",
    String(input.resetSequence ?? 0),
  ].join("|");
  return createHash("sha256").update(source).digest("hex").slice(0, 24);
}

export interface DerivedTargetLevels {
  target1Level: number | null;
  target2Level: number | null;
  target3Level: number | null;
  riskPoints: number | null;
}

export function deriveTargetLevels(input: {
  direction: TradingDirection;
  entryUnderlyingPrice: number | null;
  structuralStopLevel: number | null;
  primaryObjectiveLevel: number | null;
}): DerivedTargetLevels {
  const { direction, entryUnderlyingPrice: entry, structuralStopLevel: stop } = input;
  if (
    entry === null ||
    stop === null ||
    !Number.isFinite(entry) ||
    !Number.isFinite(stop) ||
    entry <= 0 ||
    stop <= 0
  ) {
    return { target1Level: null, target2Level: null, target3Level: null, riskPoints: null };
  }
  const validStop = direction === "CALLS" ? stop < entry : stop > entry;
  if (!validStop) {
    return { target1Level: null, target2Level: null, target3Level: null, riskPoints: null };
  }
  const sign = direction === "CALLS" ? 1 : -1;
  const riskPoints = Math.abs(entry - stop);
  const minimumTarget2 = entry + sign * riskPoints * TRADING_POLICY_V1.minimumUnderlyingRewardRiskRatio;
  const suppliedObjective = input.primaryObjectiveLevel;
  const objectiveIsDirectional =
    suppliedObjective !== null &&
    Number.isFinite(suppliedObjective) &&
    (direction === "CALLS" ? suppliedObjective > entry : suppliedObjective < entry);
  const target2Level = objectiveIsDirectional
    ? direction === "CALLS"
      ? Math.max(suppliedObjective, minimumTarget2)
      : Math.min(suppliedObjective, minimumTarget2)
    : minimumTarget2;
  return {
    target1Level: entry + sign * riskPoints,
    target2Level,
    target3Level: entry + sign * riskPoints * 3,
    riskPoints,
  };
}

export function buildExecutionModel(input: {
  plannedEntryAsk: number | null;
  currentExitBid: number | null;
  actualEntryPrice?: number | null;
}): TradingExecutionModel {
  const ask = input.plannedEntryAsk;
  const bid = input.currentExitBid;
  const entry = input.actualEntryPrice ?? ask;
  const usableAsk = ask !== null && Number.isFinite(ask) && ask > 0 ? ask : null;
  const usableBid = bid !== null && Number.isFinite(bid) && bid >= 0 ? bid : null;
  const usableEntry = entry !== null && Number.isFinite(entry) && entry > 0 ? entry : null;
  return TradingExecutionModelSchema.parse({
    methodologyVersion: "EXECUTION_PRICE_MODEL_V1",
    entryReference: "ASK",
    exitReference: "BID",
    plannedEntryAsk: usableAsk,
    currentExitBid: usableBid,
    modeledEntryPrice: usableEntry,
    modeledExitPrice: usableBid,
    spreadCostDollarsPerContract:
      usableAsk !== null && usableBid !== null
        ? Math.max(0, usableAsk - usableBid) * 100
        : null,
    modeledRoundTripSlippageDollarsPerContract: 0,
    commissionAndFeesDollarsPerContract: 0,
    modeledNetPnlDollarsPerContract:
      usableEntry !== null && usableBid !== null ? (usableBid - usableEntry) * 100 : null,
    disclosures: {
      askEntryBidExitIsConservativeBaseline: true,
      noGuaranteedFill: true,
      noOrderCreated: true,
      commissionsNotConfigured: true,
    },
  });
}

export function calculatePlannedRiskDollars(
  estimatedPremiumRiskPerShare: number | null | undefined,
): number | null {
  if (
    estimatedPremiumRiskPerShare === null ||
    estimatedPremiumRiskPerShare === undefined ||
    !Number.isFinite(estimatedPremiumRiskPerShare) ||
    estimatedPremiumRiskPerShare <= 0
  ) {
    return null;
  }
  return estimatedPremiumRiskPerShare * 100;
}

export function validateEntryEconomics(input: {
  actualEntryPrice: number;
  plannedRiskDollars: number | null;
  underlyingRewardRiskRatio: number | null;
  optionRewardRiskRatio: number | null;
}): { permitted: boolean; reasonCode: string } {
  if (!Number.isFinite(input.actualEntryPrice) || input.actualEntryPrice <= 0) {
    return { permitted: false, reasonCode: "INVALID_ENTRY_PRICE" };
  }
  if (input.actualEntryPrice * 100 > TRADING_POLICY_V1.maximumContractPremiumDollars) {
    return { permitted: false, reasonCode: "MAXIMUM_CONTRACT_PREMIUM_EXCEEDED" };
  }
  if (input.plannedRiskDollars === null || input.plannedRiskDollars <= 0) {
    return { permitted: false, reasonCode: "PLANNED_RISK_UNAVAILABLE" };
  }
  if (input.plannedRiskDollars > TRADING_POLICY_V1.maximumPlannedStructuralLossDollars) {
    return { permitted: false, reasonCode: "MAXIMUM_PLANNED_LOSS_EXCEEDED" };
  }
  if (
    input.underlyingRewardRiskRatio === null ||
    input.underlyingRewardRiskRatio < TRADING_POLICY_V1.minimumUnderlyingRewardRiskRatio
  ) {
    return { permitted: false, reasonCode: "UNDERLYING_REWARD_RISK_BELOW_MINIMUM" };
  }
  if (
    input.optionRewardRiskRatio === null ||
    input.optionRewardRiskRatio < TRADING_POLICY_V1.minimumOptionPremiumRewardRiskRatio
  ) {
    return { permitted: false, reasonCode: "OPTION_REWARD_RISK_BELOW_MINIMUM" };
  }
  return { permitted: true, reasonCode: "ENTRY_ECONOMICS_PASSED" };
}

export type PositionManagementSignal =
  | "ABSOLUTE_EXIT_DEADLINE"
  | "MANDATORY_1555_EXIT"
  | "STRUCTURAL_STOP"
  | "TARGET_2"
  | "TARGET_1_MANAGEMENT"
  | "TARGET_3_RESEARCH"
  | "TIME_STOP_REVIEW"
  | "NONE";

export function selectPositionManagementSignal(input: {
  nowMs: number;
  direction: TradingDirection;
  underlyingPrice: number;
  structuralStopLevel: number;
  target1Level: number;
  target2Level: number;
  target3Level: number | null;
  timeStopReviewAtMs: number;
}): PositionManagementSignal {
  const clock = evaluateTradingClock(input.nowMs);
  if (clock.absoluteExitDeadlineReached) return "ABSOLUTE_EXIT_DEADLINE";
  if (clock.mandatoryExitReached) return "MANDATORY_1555_EXIT";
  const stopHit =
    input.direction === "CALLS"
      ? input.underlyingPrice <= input.structuralStopLevel
      : input.underlyingPrice >= input.structuralStopLevel;
  if (stopHit) return "STRUCTURAL_STOP";
  const target2Hit =
    input.direction === "CALLS"
      ? input.underlyingPrice >= input.target2Level
      : input.underlyingPrice <= input.target2Level;
  if (target2Hit) return "TARGET_2";
  const target1Hit =
    input.direction === "CALLS"
      ? input.underlyingPrice >= input.target1Level
      : input.underlyingPrice <= input.target1Level;
  if (target1Hit) return "TARGET_1_MANAGEMENT";
  if (input.target3Level !== null) {
    const target3Hit =
      input.direction === "CALLS"
        ? input.underlyingPrice >= input.target3Level
        : input.underlyingPrice <= input.target3Level;
    if (target3Hit) return "TARGET_3_RESEARCH";
  }
  if (input.nowMs >= input.timeStopReviewAtMs) return "TIME_STOP_REVIEW";
  return "NONE";
}
