import {
  PointInTimeBacktestRunPayloadSchema,
  SpyZeroDteDeterministicMarketStateResponseSchema,
  SpyZeroDteOptionsChainResponseSchema,
  SpyZeroDteTradePlanAssemblyResponseSchema,
  type PointInTimeBacktestBreakdown,
  type PointInTimeBacktestEpisode,
  type PointInTimeBacktestIssue,
  type PointInTimeBacktestReplaySourceMode,
  type PointInTimeBacktestRunPayload,
  type PointInTimeBacktestRunRequest,
  type SpyCandle,
  type SpyZeroDteDeterministicMarketStateResponse,
  type SpyZeroDteOptionsChainResponse,
  type SpyZeroDteTradePlanAssemblyResponse,
} from "@spy-copilot/shared";
import { buildSpyZeroDteDeterministicBias } from "./market-bias.logic";
import { buildSpyZeroDteContractSelection } from "./trade-contract.logic";
import { buildSpyZeroDteDeterministicTradePlan } from "./trade-plan.logic";
import { buildSpyZeroDteTradePlanAssembly } from "./trade-plan-assembly.logic";
import { buildSpyZeroDteObjectiveRiskFramework } from "./trade-risk.logic";
import { evaluateNyseTradingSessionCalendar } from "./nyse-session-calendar.logic";
import { buildHistoricalUnderlyingOnlyContractSelection } from "./historical-underlying-contract.logic";

export const POINT_IN_TIME_BACKTEST_SOURCE_LIMIT = 5000;
export const POINT_IN_TIME_BACKTEST_ISSUE_LIMIT = 500;
export const POINT_IN_TIME_OBSERVED_EXIT_LAG_MS = 90_000;
export const POINT_IN_TIME_FUTURE_COVERAGE_TOLERANCE_MS = 90_000;
const FIVE_MINUTES_MS = 5 * 60_000;

export interface PointInTimeDecisionCycleSource {
  id: string;
  currentMarketDate: string;
  sourceCalculatedAt: Date | string;
  capturedAt: Date | string;
  sourceAssembly: unknown;
  sourceMarketState: unknown | null;
  optionsChainSnapshotId: string | null;
  optionsChainPayload: unknown | null;
  sourceKind?: "CAPTURED" | "HISTORICAL_UNDERLYING";
}

interface RecomputedCycle {
  source: PointInTimeDecisionCycleSource;
  boundaryMs: number;
  marketState: SpyZeroDteDeterministicMarketStateResponse | null;
  optionsChain: SpyZeroDteOptionsChainResponse | null;
  assembly: SpyZeroDteTradePlanAssemblyResponse;
  replaySourceMode: PointInTimeBacktestReplaySourceMode;
}

interface PriceObservation {
  atMs: number;
  price: number;
  kind: "QUOTE" | "CANDLE";
  high: number;
  low: number;
}

function iso(value: Date | string): string {
  return value instanceof Date ? value.toISOString() : new Date(value).toISOString();
}

function finiteMs(value: string | Date | null | undefined): number | null {
  if (value === null || value === undefined) return null;
  const parsed = value instanceof Date ? value.getTime() : Date.parse(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function sourceSummary(assembly: SpyZeroDteTradePlanAssemblyResponse) {
  return {
    product: assembly.product,
    methodologyVersion: assembly.methodologyVersion,
    currentMarketDate: assembly.currentMarketDate,
    calculatedAt: assembly.calculatedAt,
    engineState: assembly.engineState,
    planState: assembly.planState,
    direction: assembly.direction,
    primaryReasonCode: assembly.primaryReasonCode,
    warningCode: assembly.warningCode,
    currentPrice: assembly.currentPrice,
    sessionPhase: assembly.sessionPhase,
    biasState: assembly.bias.biasState,
    confidenceScore:
      assembly.planConfidence?.adjustedConfidenceScore ??
      assembly.bias.confidenceScore,
    confidenceUnit: assembly.bias.confidenceUnit,
    sourceQualityState: assembly.bias.sourceQualityState,
  };
}

function planSnapshot(assembly: SpyZeroDteTradePlanAssemblyResponse) {
  return {
    entryCondition: assembly.entryCondition,
    structuralInvalidation: assembly.structuralInvalidation,
    primaryObjective: assembly.primaryObjective,
    underlyingRiskReward: assembly.underlyingRiskReward,
    selectedContract: assembly.selectedContract,
    premiumReference: assembly.premiumReference,
    planConfidence: assembly.planConfidence,
    exposureConfirmation: assembly.exposureConfirmation,
  };
}

function addIssue(
  issues: PointInTimeBacktestIssue[],
  source: PointInTimeDecisionCycleSource,
  issueCode: PointInTimeBacktestIssue["issueCode"],
  message: string,
  severity: PointInTimeBacktestIssue["severity"] = "ERROR",
): boolean {
  if (issues.length >= POINT_IN_TIME_BACKTEST_ISSUE_LIMIT) return true;
  issues.push({
    decisionCycleId: source.id,
    marketDate: source.currentMarketDate,
    issueCode,
    severity,
    message: message.slice(0, 320),
  });
  return false;
}

function timestampAudit(
  state: SpyZeroDteDeterministicMarketStateResponse,
  chain: SpyZeroDteOptionsChainResponse | null,
  boundaryMs: number,
): string | null {
  const timestamps: Array<[string, number | null]> = [
    ["market-state calculatedAt", finiteMs(state.calculatedAt)],
    ["market-context assembledAt", finiteMs(state.sourceContextAssembledAt)],
    ["quote timestamp", finiteMs(state.quoteTimestamp)],
    ["snapshot assembledAt", finiteMs(state.snapshotIntegrity?.assembledAt)],
    ["snapshot quoteFetchedAt", finiteMs(state.snapshotIntegrity?.quoteFetchedAt)],
    ["snapshot candlesFetchedAt", finiteMs(state.snapshotIntegrity?.candlesFetchedAt)],
    ["snapshot optionsChainFetchedAt", finiteMs(state.snapshotIntegrity?.optionsChainFetchedAt)],
    ["execution candle fetchedAt", finiteMs(state.executionContext?.sourceCandleFetchedAt)],
  ];
  if (chain !== null) timestamps.push(["options-chain fetchedAt", finiteMs(chain.fetchedAt)]);
  for (const [label, atMs] of timestamps) {
    if (atMs !== null && atMs > boundaryMs) {
      return `${label} occurs after the source decision-cycle boundary`;
    }
  }

  for (const candle of state.executionContext?.recentCompletedCandles ?? []) {
    if (candle.timestamp + FIVE_MINUTES_MS > boundaryMs) {
      return "market-state execution context includes an incomplete or future five-minute candle";
    }
  }
  if (chain !== null) {
    for (const contract of [...chain.calls, ...chain.puts]) {
      const quoteAt = finiteMs(contract.quoteAt);
      const tradeAt = finiteMs(contract.tradeAt);
      if ((quoteAt !== null && quoteAt > boundaryMs) || (tradeAt !== null && tradeAt > boundaryMs)) {
        return "options-chain snapshot contains a quote or trade timestamp after the source boundary";
      }
    }
  }
  return null;
}

function zodIssueSummary(error: { issues: Array<{ path: PropertyKey[]; message: string }> }): string {
  return error.issues
    .slice(0, 3)
    .map((issue) => `${issue.path.join(".") || "root"}: ${issue.message}`)
    .join("; ");
}

function assemblyTimestampAudit(
  assembly: SpyZeroDteTradePlanAssemblyResponse,
  boundaryMs: number,
): string | null {
  const calculatedAt = finiteMs(assembly.calculatedAt);
  const quoteAt = finiteMs(assembly.quoteTimestamp);
  if (calculatedAt !== null && calculatedAt > boundaryMs) {
    return "stored Assembly calculatedAt occurs after the decision-cycle boundary";
  }
  if (quoteAt !== null && quoteAt > boundaryMs) {
    return "stored Assembly quoteTimestamp occurs after the decision-cycle boundary";
  }
  return null;
}

function recomputeCycle(
  source: PointInTimeDecisionCycleSource,
  issues: PointInTimeBacktestIssue[],
): { cycle: RecomputedCycle | null; issuesTruncated: boolean } {
  const boundaryMs = finiteMs(source.sourceCalculatedAt);
  if (boundaryMs === null) {
    return {
      cycle: null,
      issuesTruncated: addIssue(
        issues,
        source,
        "SOURCE_MARKET_STATE_INVALID",
        "Decision-cycle sourceCalculatedAt is invalid.",
      ),
    };
  }

  let chain: SpyZeroDteOptionsChainResponse | null = null;
  if (source.optionsChainPayload !== null) {
    const parsedChain = SpyZeroDteOptionsChainResponseSchema.safeParse(
      source.optionsChainPayload,
    );
    if (!parsedChain.success) {
      return {
        cycle: null,
        issuesTruncated: addIssue(
          issues,
          source,
          "SOURCE_OPTIONS_CHAIN_INVALID",
          `Stored point-in-time Options Chain failed schema validation: ${zodIssueSummary(parsedChain.error)}`,
        ),
      };
    }
    chain = parsedChain.data;
  }

  const parsedState = SpyZeroDteDeterministicMarketStateResponseSchema.safeParse(
    source.sourceMarketState,
  );
  if (!parsedState.success) {
    const parsedAssembly = SpyZeroDteTradePlanAssemblyResponseSchema.safeParse(
      source.sourceAssembly,
    );
    if (!parsedAssembly.success) {
      return {
        cycle: null,
        issuesTruncated: addIssue(
          issues,
          source,
          "SOURCE_MARKET_STATE_INVALID",
          `Market State and frozen Assembly are both invalid. Market State: ${zodIssueSummary(parsedState.error)}. Assembly: ${zodIssueSummary(parsedAssembly.error)}.`,
        ),
      };
    }
    const timestampError = assemblyTimestampAudit(parsedAssembly.data, boundaryMs);
    if (timestampError !== null) {
      return {
        cycle: null,
        issuesTruncated: addIssue(
          issues,
          source,
          "SOURCE_TIMESTAMP_AFTER_CYCLE",
          timestampError,
        ),
      };
    }
    return {
      cycle: {
        source,
        boundaryMs,
        marketState: null,
        optionsChain: chain,
        assembly: parsedAssembly.data,
        replaySourceMode: "LEGACY_FROZEN_ASSEMBLY",
      },
      issuesTruncated: false,
    };
  }

  const timestampError = timestampAudit(parsedState.data, chain, boundaryMs);
  if (timestampError !== null) {
    return {
      cycle: null,
      issuesTruncated: addIssue(
        issues,
        source,
        "SOURCE_TIMESTAMP_AFTER_CYCLE",
        timestampError,
      ),
    };
  }

  try {
    const bias = buildSpyZeroDteDeterministicBias(parsedState.data, boundaryMs);
    const plan = buildSpyZeroDteDeterministicTradePlan(
      parsedState.data,
      bias,
      boundaryMs,
    );
    const risk = buildSpyZeroDteObjectiveRiskFramework(
      parsedState.data,
      bias,
      plan,
      boundaryMs,
    );
    const contract =
      source.sourceKind === "HISTORICAL_UNDERLYING" && chain === null
        ? buildHistoricalUnderlyingOnlyContractSelection(risk, boundaryMs)
        : buildSpyZeroDteContractSelection(risk, chain, boundaryMs);
    const assembly = buildSpyZeroDteTradePlanAssembly(
      parsedState.data,
      bias,
      plan,
      risk,
      contract,
      boundaryMs,
    );
    const parsedAssembly = SpyZeroDteTradePlanAssemblyResponseSchema.safeParse(
      assembly,
    );
    if (!parsedAssembly.success) {
      throw new Error(zodIssueSummary(parsedAssembly.error));
    }
    return {
      cycle: {
        source,
        boundaryMs,
        marketState: parsedState.data,
        optionsChain: chain,
        assembly: parsedAssembly.data,
        replaySourceMode:
          source.sourceKind === "HISTORICAL_UNDERLYING"
            ? "HISTORICAL_UNDERLYING_ONLY"
            : "EXACT_MARKET_STATE_RECOMPUTE",
      },
      issuesTruncated: false,
    };
  } catch (error) {
    return {
      cycle: null,
      issuesTruncated: addIssue(
        issues,
        source,
        "RECOMPUTED_ASSEMBLY_INVALID",
        `Current deterministic rules could not produce a valid Assembly from the stored boundary: ${(error as Error).message}`,
      ),
    };
  }
}

function candleObservations(
  cycle: RecomputedCycle,
  entryMs: number,
  cutoffMs: number,
): PriceObservation[] {
  return (cycle.marketState?.executionContext?.recentCompletedCandles ?? [])
    .map((candle: SpyCandle) => ({
      atMs: candle.timestamp + FIVE_MINUTES_MS,
      price: candle.close,
      high: candle.high,
      low: candle.low,
      kind: "CANDLE" as const,
    }))
    .filter((item) => item.atMs > entryMs && item.atMs <= cutoffMs);
}

function quoteObservation(cycle: RecomputedCycle): PriceObservation | null {
  const price = cycle.marketState?.price ?? cycle.assembly.currentPrice;
  const quoteAt =
    finiteMs(cycle.marketState?.quoteTimestamp) ??
    finiteMs(cycle.assembly.quoteTimestamp) ??
    cycle.boundaryMs;
  if (price === null || quoteAt === null) return null;
  return {
    atMs: quoteAt,
    price,
    high: price,
    low: price,
    kind: "QUOTE",
  };
}

function reconstructedQuoteCandles(
  observations: readonly PriceObservation[],
): PriceObservation[] {
  const groups = new Map<number, PriceObservation[]>();
  for (const observation of observations.filter((item) => item.kind === "QUOTE")) {
    const bucketEnd =
      Math.floor(Math.max(0, observation.atMs - 1) / FIVE_MINUTES_MS) *
        FIVE_MINUTES_MS +
      FIVE_MINUTES_MS;
    groups.set(bucketEnd, [...(groups.get(bucketEnd) ?? []), observation]);
  }
  return [...groups.entries()].map(([atMs, items]) => {
    const sorted = [...items].sort((left, right) => left.atMs - right.atMs);
    return {
      atMs,
      price: sorted.at(-1)!.price,
      high: Math.max(...sorted.map((item) => item.price)),
      low: Math.min(...sorted.map((item) => item.price)),
      kind: "CANDLE" as const,
    };
  });
}

function futureObservations(
  allCycles: RecomputedCycle[],
  sourceIndex: number,
  entryMs: number,
  cutoffMs: number,
): PriceObservation[] {
  const byKey = new Map<string, PriceObservation>();
  for (let index = sourceIndex + 1; index < allCycles.length; index += 1) {
    const cycle = allCycles[index]!;
    if (cycle.source.currentMarketDate !== allCycles[sourceIndex]!.source.currentMarketDate) break;
    if (cycle.boundaryMs > cutoffMs + POINT_IN_TIME_FUTURE_COVERAGE_TOLERANCE_MS) break;

    for (const observation of candleObservations(cycle, entryMs, cutoffMs)) {
      byKey.set(`CANDLE:${observation.atMs}`, observation);
    }
    const quote = quoteObservation(cycle);
    if (quote !== null && quote.atMs > entryMs && quote.atMs <= cutoffMs) {
      byKey.set(`QUOTE:${quote.atMs}`, quote);
    }
  }

  const observed = [...byKey.values()];
  const realCandleTimes = new Set(
    observed.filter((item) => item.kind === "CANDLE").map((item) => item.atMs),
  );
  for (const candle of reconstructedQuoteCandles(observed)) {
    if (
      candle.atMs > entryMs &&
      candle.atMs <= cutoffMs &&
      !realCandleTimes.has(candle.atMs)
    ) {
      byKey.set(`RECONSTRUCTED_CANDLE:${candle.atMs}`, candle);
    }
  }

  return [...byKey.values()].sort((left, right) =>
    left.atMs === right.atMs
      ? left.kind === "CANDLE"
        ? -1
        : 1
      : left.atMs - right.atMs,
  );
}

function easternMinute(isoString: string): number | null {
  const date = new Date(isoString);
  if (!Number.isFinite(date.getTime())) return null;
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/New_York",
    hour12: false,
    hour: "2-digit",
    minute: "2-digit",
  }).formatToParts(date);
  const hour = Number(parts.find((part) => part.type === "hour")?.value);
  const minute = Number(parts.find((part) => part.type === "minute")?.value);
  return Number.isFinite(hour) && Number.isFinite(minute)
    ? hour * 60 + minute
    : null;
}

function officialSessionEndReached(marketDate: string, lastAtMs: number): boolean {
  const session = evaluateNyseTradingSessionCalendar(marketDate);
  if (
    session.coverageState !== "SUPPORTED" ||
    session.tradingDayState !== "TRADING_DAY" ||
    session.rthCloseMinute === null
  ) {
    return false;
  }
  const minute = easternMinute(new Date(lastAtMs).toISOString());
  return minute !== null && minute >= session.rthCloseMinute - 5;
}

function observedExitBid(
  cycles: RecomputedCycle[],
  sourceIndex: number,
  symbol: string,
  resolvedAtMs: number,
): number | null {
  for (let index = sourceIndex + 1; index < cycles.length; index += 1) {
    const cycle = cycles[index]!;
    if (cycle.source.currentMarketDate !== cycles[sourceIndex]!.source.currentMarketDate) break;
    if (cycle.boundaryMs < resolvedAtMs) continue;
    if (cycle.boundaryMs > resolvedAtMs + POINT_IN_TIME_OBSERVED_EXIT_LAG_MS) break;
    const contract = cycle.optionsChain === null
      ? null
      : [...cycle.optionsChain.calls, ...cycle.optionsChain.puts].find(
          (item) => item.contractSymbol === symbol,
        ) ?? null;
    if (contract?.bid !== null && contract?.bid !== undefined && contract.bid >= 0) {
      return contract.bid;
    }
  }
  return null;
}

function episodeSignature(assembly: SpyZeroDteTradePlanAssemblyResponse): string {
  const rounded = (value: number | null | undefined) =>
    value === null || value === undefined ? "NA" : value.toFixed(4);
  return [
    assembly.currentMarketDate,
    assembly.direction,
    assembly.entryCondition.setupType ?? "UNAVAILABLE",
    rounded(
      assembly.entryCondition.bufferedTriggerLevel ??
        assembly.entryCondition.triggerLevel,
    ),
    rounded(assembly.structuralInvalidation.level),
    rounded(assembly.primaryObjective.level),
    assembly.selectedContract.contractSymbol ?? "NO_CONTRACT",
  ].join("|");
}

function cycleIsEpisodeEligible(cycle: RecomputedCycle): boolean {
  const assembly = cycle.assembly;
  if (assembly.planState === "READY") return true;
  return (
    cycle.replaySourceMode === "HISTORICAL_UNDERLYING_ONLY" &&
    assembly.planState === "NO_QUALIFIED_CONTRACT" &&
    assembly.entryCondition.confirmationPassed === true &&
    assembly.structuralInvalidation.level !== null &&
    assembly.primaryObjective.level !== null &&
    assembly.underlyingRiskReward.rewardRiskRatio !== null
  );
}

function outcomeForEpisode(
  cycles: RecomputedCycle[],
  sourceIndex: number,
  request: PointInTimeBacktestRunRequest,
): PointInTimeBacktestEpisode | null {
  const sourceCycle = cycles[sourceIndex]!;
  const assembly = sourceCycle.assembly;
  const entryPrice = assembly.currentPrice;
  const invalidation = assembly.structuralInvalidation.level;
  const objective = assembly.primaryObjective.level;
  const riskDistance = assembly.underlyingRiskReward.riskDistancePoints;
  const rewardDistance = assembly.underlyingRiskReward.rewardDistancePoints;
  const rewardRisk = assembly.underlyingRiskReward.rewardRiskRatio;
  if (
    !cycleIsEpisodeEligible(sourceCycle) ||
    !["CALLS", "PUTS"].includes(assembly.direction) ||
    entryPrice === null ||
    invalidation === null ||
    objective === null ||
    riskDistance === null ||
    rewardDistance === null ||
    rewardRisk === null
  ) {
    return null;
  }

  const direction = assembly.direction as "CALLS" | "PUTS";
  const entryMs = sourceCycle.boundaryMs;
  const cutoffMs = entryMs + request.maximumHoldMinutes * 60_000;
  const observations = futureObservations(cycles, sourceIndex, entryMs, cutoffMs);
  const candles = observations.filter((item) => item.kind === "CANDLE");

  let outcomeState: PointInTimeBacktestEpisode["outcomeState"] =
    "INSUFFICIENT_FUTURE_DATA";
  let resolvedAtMs: number | null = null;
  let exitUnderlyingPrice: number | null = null;
  let targetHitAtMs: number | null = null;
  let stopHitAtMs: number | null = null;

  for (const candle of candles) {
    const targetHit =
      direction === "CALLS"
        ? candle.high >= objective
        : candle.low <= objective;
    const stopHit =
      direction === "CALLS"
        ? candle.low <= invalidation
        : candle.high >= invalidation;
    if (targetHit && stopHit) {
      outcomeState = "AMBIGUOUS_SAME_CANDLE";
      resolvedAtMs = candle.atMs;
      targetHitAtMs = candle.atMs;
      stopHitAtMs = candle.atMs;
      break;
    }
    if (targetHit) {
      outcomeState = "TARGET_FIRST";
      resolvedAtMs = candle.atMs;
      targetHitAtMs = candle.atMs;
      exitUnderlyingPrice = objective;
      break;
    }
    if (stopHit) {
      outcomeState = "STOP_FIRST";
      resolvedAtMs = candle.atMs;
      stopHitAtMs = candle.atMs;
      exitUnderlyingPrice = invalidation;
      break;
    }
  }

  const lastObservation = observations.at(-1) ?? null;
  if (resolvedAtMs === null) {
    if (
      lastObservation !== null &&
      lastObservation.atMs >= cutoffMs - POINT_IN_TIME_FUTURE_COVERAGE_TOLERANCE_MS
    ) {
      outcomeState = "TIMEOUT";
      resolvedAtMs = cutoffMs;
      exitUnderlyingPrice = lastObservation.price;
    } else if (
      lastObservation !== null &&
      officialSessionEndReached(assembly.currentMarketDate, lastObservation.atMs)
    ) {
      outcomeState = "SESSION_END";
      resolvedAtMs = lastObservation.atMs;
      exitUnderlyingPrice = lastObservation.price;
    }
  }

  const excursionEndMs = resolvedAtMs ?? Math.min(cutoffMs, lastObservation?.atMs ?? entryMs);
  const excursionObservations = observations.filter((item) => item.atMs <= excursionEndMs);
  let mfe = 0;
  let mae = 0;
  for (const observation of excursionObservations) {
    if (direction === "CALLS") {
      mfe = Math.max(mfe, observation.high - entryPrice);
      mae = Math.max(mae, entryPrice - observation.low);
    } else {
      mfe = Math.max(mfe, entryPrice - observation.low);
      mae = Math.max(mae, observation.high - entryPrice);
    }
  }

  let realizedUnderlyingPoints: number | null = null;
  let realizedRMultiple: number | null = null;
  if (exitUnderlyingPrice !== null && outcomeState !== "AMBIGUOUS_SAME_CANDLE") {
    realizedUnderlyingPoints =
      direction === "CALLS"
        ? exitUnderlyingPrice - entryPrice
        : entryPrice - exitUnderlyingPrice;
    realizedRMultiple = realizedUnderlyingPoints / riskDistance;
  }

  const contractSymbol = assembly.selectedContract.contractSymbol;
  const entryAsk = assembly.selectedContract.ask;
  const entryMid = assembly.selectedContract.calculatedMidpoint;
  let exitPremiumBid: number | null = null;
  let optionOutcomeState: PointInTimeBacktestEpisode["optionOutcomeState"] =
    "UNAVAILABLE";
  if (contractSymbol !== null && resolvedAtMs !== null) {
    exitPremiumBid = observedExitBid(
      cycles,
      sourceIndex,
      contractSymbol,
      resolvedAtMs,
    );
    if (exitPremiumBid !== null) optionOutcomeState = "OBSERVED_EXIT_QUOTE_ESTIMATE";
  }
  if (exitPremiumBid === null) {
    if (outcomeState === "TARGET_FIRST") {
      exitPremiumBid =
        assembly.selectedContract.estimatedObjectiveExitPremium ?? null;
    } else if (outcomeState === "STOP_FIRST") {
      exitPremiumBid =
        assembly.selectedContract.estimatedInvalidationExitPremium ?? null;
    }
    if (exitPremiumBid !== null) optionOutcomeState = "MODEL_SCENARIO_ESTIMATE";
  }

  const multiplier = assembly.selectedContract.multiplier ?? 100;
  const estimatedOptionPnlPerContract =
    entryAsk !== null && exitPremiumBid !== null
      ? (exitPremiumBid - entryAsk) * multiplier
      : null;

  const exposure =
    sourceCycle.marketState?.exposureStructure ??
    sourceCycle.assembly.gammaResearchContext ??
    null;
  const nearestCliff = exposure?.gammaCliffs.length
    ? [...exposure.gammaCliffs].sort(
        (left, right) =>
          Math.abs(left.distanceFromUnderlyingPoints) -
          Math.abs(right.distanceFromUnderlyingPoints),
      )[0]
    : undefined;

  return {
    episodeId: `${sourceCycle.source.id}:${episodeSignature(assembly)}`,
    sourceDecisionCycleId: sourceCycle.source.id,
    replaySourceMode: sourceCycle.replaySourceMode,
    marketDate: assembly.currentMarketDate,
    setupType: assembly.entryCondition.setupType ?? null,
    direction,
    sourceAssembly: sourceSummary(assembly),
    planSnapshot: planSnapshot(assembly),
    entryAt: new Date(entryMs).toISOString(),
    entryPrice,
    triggerLevel:
      assembly.entryCondition.bufferedTriggerLevel ??
      assembly.entryCondition.triggerLevel,
    invalidationLevel: invalidation,
    objectiveLevel: objective,
    riskDistancePoints: riskDistance,
    rewardDistancePoints: rewardDistance,
    plannedRewardRiskRatio: rewardRisk,
    selectedContractSymbol: contractSymbol,
    entryPremiumAsk: entryAsk,
    entryPremiumMidpoint: entryMid,
    outcomeState,
    resolvedAt: resolvedAtMs === null ? null : new Date(resolvedAtMs).toISOString(),
    durationMinutes:
      resolvedAtMs === null ? null : Math.max(0, (resolvedAtMs - entryMs) / 60_000),
    exitUnderlyingPrice,
    targetHitAt:
      targetHitAtMs === null ? null : new Date(targetHitAtMs).toISOString(),
    stopHitAt: stopHitAtMs === null ? null : new Date(stopHitAtMs).toISOString(),
    maximumFavorableExcursionPoints: Math.max(0, mfe),
    maximumAdverseExcursionPoints: Math.max(0, mae),
    realizedUnderlyingPoints,
    realizedRMultiple,
    exitPremiumBid,
    estimatedOptionPnlPerContract,
    optionOutcomeState,
    gammaRegime: exposure?.gammaRegime ?? null,
    nearestGammaCliffDistancePoints:
      nearestCliff?.distanceFromUnderlyingPoints ?? null,
    executionAlignmentScore:
      assembly.planConfidence?.executionQualityAlignmentScore ?? null,
  };
}

function summarize(episodes: PointInTimeBacktestEpisode[]) {
  const targetFirstCount = episodes.filter((item) => item.outcomeState === "TARGET_FIRST").length;
  const stopFirstCount = episodes.filter((item) => item.outcomeState === "STOP_FIRST").length;
  const ambiguousCount = episodes.filter((item) => item.outcomeState === "AMBIGUOUS_SAME_CANDLE").length;
  const timeoutCount = episodes.filter((item) => item.outcomeState === "TIMEOUT").length;
  const sessionEndCount = episodes.filter((item) => item.outcomeState === "SESSION_END").length;
  const insufficientFutureDataCount = episodes.filter(
    (item) => item.outcomeState === "INSUFFICIENT_FUTURE_DATA",
  ).length;
  const resolvedDirectionalCount = targetFirstCount + stopFirstCount;
  const rValues = episodes
    .map((item) => item.realizedRMultiple)
    .filter((value): value is number => value !== null);
  const optionPnl = episodes
    .map((item) => item.estimatedOptionPnlPerContract)
    .filter((value): value is number => value !== null);
  const average = (values: number[]) =>
    values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : null;
  return {
    episodeCount: episodes.length,
    targetFirstCount,
    stopFirstCount,
    ambiguousCount,
    timeoutCount,
    sessionEndCount,
    insufficientFutureDataCount,
    resolvedDirectionalCount,
    winRatePercent:
      resolvedDirectionalCount === 0
        ? null
        : (targetFirstCount / resolvedDirectionalCount) * 100,
    averageRMultiple: average(rValues),
    totalEstimatedOptionPnlDollars:
      optionPnl.length === 0
        ? null
        : optionPnl.reduce((sum, value) => sum + value, 0),
    averageMaximumFavorableExcursionPoints: average(
      episodes.map((item) => item.maximumFavorableExcursionPoints),
    ),
    averageMaximumAdverseExcursionPoints: average(
      episodes.map((item) => item.maximumAdverseExcursionPoints),
    ),
  };
}

function breakdown(
  episodes: PointInTimeBacktestEpisode[],
  dimension: PointInTimeBacktestBreakdown["dimension"],
  bucketFor: (episode: PointInTimeBacktestEpisode) => string,
): PointInTimeBacktestBreakdown[] {
  const groups = new Map<string, PointInTimeBacktestEpisode[]>();
  for (const episode of episodes) {
    const bucket = bucketFor(episode);
    groups.set(bucket, [...(groups.get(bucket) ?? []), episode]);
  }
  return [...groups.entries()]
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([bucket, items]) => {
      const summary = summarize(items);
      return {
        dimension,
        bucket,
        episodeCount: summary.episodeCount,
        targetFirstCount: summary.targetFirstCount,
        stopFirstCount: summary.stopFirstCount,
        ambiguousCount: summary.ambiguousCount,
        timeoutCount: summary.timeoutCount + summary.sessionEndCount,
        insufficientCount: summary.insufficientFutureDataCount,
        resolvedDirectionalCount: summary.resolvedDirectionalCount,
        winRatePercent: summary.winRatePercent,
        averageRMultiple: summary.averageRMultiple,
      };
    });
}

export function buildPointInTimeBacktestRun(args: {
  id: string;
  createdAt: Date | string;
  request: PointInTimeBacktestRunRequest;
  sourceRows: PointInTimeDecisionCycleSource[];
  externalIssues?: PointInTimeBacktestIssue[];
}): PointInTimeBacktestRunPayload {
  const sourceRows = [...args.sourceRows].sort(
    (left, right) =>
      (finiteMs(left.sourceCalculatedAt) ?? 0) -
      (finiteMs(right.sourceCalculatedAt) ?? 0),
  );
  const issues: PointInTimeBacktestIssue[] = [...(args.externalIssues ?? [])];
  let issuesTruncated = issues.length > POINT_IN_TIME_BACKTEST_ISSUE_LIMIT;
  if (issuesTruncated) issues.splice(POINT_IN_TIME_BACKTEST_ISSUE_LIMIT);
  const recomputed: RecomputedCycle[] = [];
  for (const source of sourceRows) {
    const result = recomputeCycle(source, issues);
    if (result.cycle !== null) recomputed.push(result.cycle);
    issuesTruncated ||= result.issuesTruncated;
  }

  const legacyDates = [
    ...new Set(
      recomputed
        .filter((cycle) => cycle.replaySourceMode === "LEGACY_FROZEN_ASSEMBLY")
        .map((cycle) => cycle.source.currentMarketDate),
    ),
  ];
  for (const marketDate of legacyDates) {
    if (issues.length >= POINT_IN_TIME_BACKTEST_ISSUE_LIMIT) {
      issuesTruncated = true;
      break;
    }
    issues.push({
      decisionCycleId: `LEGACY:${marketDate}`,
      marketDate,
      issueCode: "LEGACY_FROZEN_ASSEMBLY_USED",
      severity: "WARNING",
      message:
        "Pre-V1.5 rows did not store the full Market State. The backtest used the exact frozen trade plan and reconstructed five-minute outcome bars from captured prices instead of discarding the date.",
    });
  }

  const historicalDates = [
    ...new Set(
      recomputed
        .filter((cycle) => cycle.replaySourceMode === "HISTORICAL_UNDERLYING_ONLY")
        .map((cycle) => cycle.source.currentMarketDate),
    ),
  ];
  for (const marketDate of historicalDates) {
    if (issues.length >= POINT_IN_TIME_BACKTEST_ISSUE_LIMIT) {
      issuesTruncated = true;
      break;
    }
    issues.push({
      decisionCycleId: `HISTORICAL:${marketDate}`,
      marketDate,
      issueCode: "HISTORICAL_UNDERLYING_DATA_USED",
      severity: "INFO",
      message:
        "No captured decision cycles existed for this date, so current price-action rules were replayed from Schwab five-minute history. Historical options, GEX, DEX, contract selection, and premium P&L remain unavailable.",
    });
  }

  const episodes: PointInTimeBacktestEpisode[] = [];
  const usedSignatures = new Set<string>();
  for (let index = 0; index < recomputed.length; index += 1) {
    const cycle = recomputed[index]!;
    if (!cycleIsEpisodeEligible(cycle)) continue;
    const signature = episodeSignature(cycle.assembly);
    if (usedSignatures.has(signature)) continue;
    usedSignatures.add(signature);
    const episode = outcomeForEpisode(recomputed, index, args.request);
    if (episode !== null) episodes.push(episode);
  }

  const dates = [...new Set(sourceRows.map((row) => row.currentMarketDate))].sort();
  const exactMarketStateBoundaryCount = recomputed.filter(
    (cycle) => cycle.replaySourceMode === "EXACT_MARKET_STATE_RECOMPUTE",
  ).length;
  const legacyFrozenAssemblyBoundaryCount = recomputed.filter(
    (cycle) => cycle.replaySourceMode === "LEGACY_FROZEN_ASSEMBLY",
  ).length;
  const historicalUnderlyingBoundaryCount = recomputed.filter(
    (cycle) => cycle.replaySourceMode === "HISTORICAL_UNDERLYING_ONLY",
  ).length;
  const historicalUnderlyingDatasetUsed = historicalUnderlyingBoundaryCount > 0;
  const capturedBoundaryCount =
    exactMarketStateBoundaryCount + legacyFrozenAssemblyBoundaryCount;
  const sourceProduct = historicalUnderlyingDatasetUsed
    ? capturedBoundaryCount > 0
      ? "MIXED_CAPTURED_AND_HISTORICAL_UNDERLYING"
      : "HISTORICAL_UNDERLYING_PRICE_HISTORY"
    : "FORWARD_CAPTURED_DETERMINISTIC_DECISION_CYCLES";

  const payload: PointInTimeBacktestRunPayload = {
    id: args.id,
    createdAt: iso(args.createdAt),
    request: args.request,
    source: {
      decisionCycleCount: sourceRows.length,
      validMarketStateCount:
        exactMarketStateBoundaryCount + historicalUnderlyingBoundaryCount,
      exactMarketStateBoundaryCount,
      legacyFrozenAssemblyBoundaryCount,
      historicalUnderlyingBoundaryCount,
      optionsChainSnapshotCount: new Set(
        sourceRows
          .map((row) => row.optionsChainSnapshotId)
          .filter((value): value is string => value !== null),
      ).size,
      marketDateCount: dates.length,
      dataStartMarketDate: dates[0] ?? null,
      dataEndMarketDate: dates.at(-1) ?? null,
      sourceProduct,
      historicalUnderlyingDatasetUsed,
      historicalOptionsDatasetConnected: false,
    },
    summary: summarize(episodes),
    breakdowns: [
      ...breakdown(episodes, "SETUP", (item) => item.setupType ?? "UNAVAILABLE"),
      ...breakdown(episodes, "DIRECTION", (item) => item.direction),
      ...breakdown(episodes, "GAMMA_REGIME", (item) => item.gammaRegime ?? "UNAVAILABLE"),
    ],
    episodes,
    issues,
    issuesTruncated,
    methodology: {
      replayClock: "SOURCE_CALCULATED_AT",
      planRecomputation:
        "HYBRID_CURRENT_ENGINE_LEGACY_FROZEN_AND_HISTORICAL_UNDERLYING",
      entryPolicy:
        "FIRST_QUALIFIED_UNDERLYING_OR_READY_PER_UNIQUE_PLAN_SIGNATURE",
      fillPolicy: "UNDERLYING_AT_BOUNDARY_OPTION_AT_ASK_WHEN_AVAILABLE",
      targetStopPolicy:
        "FUTURE_COMPLETED_OR_RECONSTRUCTED_5M_OHLC_FIRST_TOUCH",
      sameCandlePolicy: "AMBIGUOUS_NO_ASSUMED_ORDER",
      optionExitPolicy: "NEXT_OBSERVED_BID_OR_STORED_MODEL_SCENARIO",
      futureCoveragePolicy: "REQUIRE_HOLD_BOUNDARY_OR_SESSION_END",
      maximumHoldMinutes: args.request.maximumHoldMinutes,
    },
  };
  return PointInTimeBacktestRunPayloadSchema.parse(payload);
}

