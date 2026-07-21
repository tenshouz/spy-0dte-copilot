import {
  SpyCandleResponseSchema,
  SpyQuoteSchema,
  SpyZeroDteDeterministicMarketStateResponseSchema,
  type SpyCandle,
  type SpyZeroDteDeterministicMarketStateResponse,
} from "@spy-copilot/shared";
import { buildSpyZeroDteDeterministicBias } from "./market-bias.logic";
import { buildSpyZeroDteMarketContext } from "./market-context.logic";
import {
  buildSpyZeroDteDeterministicMarketState,
  deriveMarketStateEngineState,
} from "./market-state.logic";
import { buildSpyOpeningRangeResponse } from "./opening-range.logic";
import { buildSpyRthGapResponse } from "./rth-gap.logic";
import { buildSpyRthVwapResponse } from "./rth-vwap.logic";
import {
  getObservedMarketDate,
  selectMarketSessionCandles,
  toSpySessionDataFoundationResponse,
} from "./session-data.logic";
import { buildSpySessionLevelsResponse } from "./session-levels.logic";
import { buildUnavailableSpyZeroDteOptionsChainResponse } from "./schwab-options-chain.logic";
import type { CachedCandleDataset } from "./schwab-candles.logic";
import { buildUnavailableSpyZeroDteDexProxyResponse } from "./spy-dex-proxy.logic";
import { buildUnavailableSpyZeroDteExpectedMoveResponse } from "./spy-expected-move.logic";
import { buildUnavailableSpyZeroDteGexProxyResponse } from "./spy-gex-proxy.logic";
import { buildHistoricalUnderlyingOnlyContractSelection } from "./historical-underlying-contract.logic";
import { buildSpyZeroDteTradePlanAssembly } from "./trade-plan-assembly.logic";
import { buildSpyZeroDteDeterministicTradePlan } from "./trade-plan.logic";
import { buildSpyZeroDteObjectiveRiskFramework } from "./trade-risk.logic";
import type { PointInTimeDecisionCycleSource } from "./point-in-time-backtest.logic";

const FIVE_MINUTES_MS = 5 * 60_000;
const HISTORICAL_SOURCE_PREFIX = "HISTORICAL_UNDERLYING";

function latestCompletedCandle(
  candles: readonly SpyCandle[],
  boundaryMs: number,
): SpyCandle | null {
  return (
    [...candles]
      .filter((candle) => candle.timestamp + FIVE_MINUTES_MS <= boundaryMs)
      .sort((left, right) => left.timestamp - right.timestamp)
      .at(-1) ?? null
  );
}

function historicalCandleResponse(
  candles: readonly SpyCandle[],
  boundaryMs: number,
) {
  const completed = [...candles]
    .filter((candle) => candle.timestamp + FIVE_MINUTES_MS <= boundaryMs)
    .sort((left, right) => left.timestamp - right.timestamp);
  const latest = completed.at(-1) ?? null;
  return SpyCandleResponseSchema.parse({
    symbol: "SPY",
    timeframe: "5m",
    sourceState: "LIVE",
    candles: completed,
    fetchedAt: new Date(boundaryMs).toISOString(),
    latestCandleAt: latest === null ? null : new Date(latest.timestamp).toISOString(),
    dataAgeMs: 0,
    isExtendedHoursIncluded: true,
    warningCode: null,
  });
}

function historicalUnderlyingMarketState(
  raw: SpyZeroDteDeterministicMarketStateResponse,
): SpyZeroDteDeterministicMarketStateResponse {
  const state = structuredClone(raw);
  const featureKeys = [
    "priceVsExpectedMoveRange",
    "netGexProxySign",
    "netDexProxySign",
  ] as const;
  const featureIds = new Set([
    "PRICE_VS_EXPECTED_MOVE_RANGE",
    "RETURNED_WINDOW_NET_GEX_SIGN",
    "RETURNED_WINDOW_NET_DEX_SIGN",
  ]);

  for (const key of featureKeys) {
    state.features[key].status = "NOT_APPLICABLE";
    state.features[key].state = null;
    state.features[key].warningCode = null;
  }
  state.featureStatuses = state.featureStatuses.map((entry) =>
    featureIds.has(entry.featureId)
      ? { ...entry, status: "NOT_APPLICABLE", warningCode: null }
      : entry,
  );
  state.featureWarnings = state.featureWarnings.filter(
    (warning) => !featureIds.has(warning.featureId),
  );

  const derived = deriveMarketStateEngineState(
    state.sourceContextState,
    state.price,
    Object.values(state.features).map((feature) => feature.status),
  );
  state.engineState = derived.engineState;
  state.warningCode = derived.warningCode;
  return SpyZeroDteDeterministicMarketStateResponseSchema.parse(state);
}

function buildHistoricalBoundary(
  allCandles: readonly SpyCandle[],
  marketDate: string,
  boundaryMs: number,
  requestedStartAtMs: number,
  requestedEndAtMs: number,
): PointInTimeDecisionCycleSource | null {
  const latest = latestCompletedCandle(allCandles, boundaryMs);
  if (latest === null || getObservedMarketDate(latest.timestamp) !== marketDate) {
    return null;
  }

  const candleResponse = historicalCandleResponse(allCandles, boundaryMs);
  const dataset: CachedCandleDataset = {
    candles: candleResponse.candles,
    latestCandleAt: candleResponse.latestCandleAt,
    fetchedAtMs: boundaryMs,
  };
  const access = {
    dataset,
    requestedStartAtMs,
    requestedEndAtMs,
    warningCode: null,
  };
  const sessionData = toSpySessionDataFoundationResponse(
    dataset,
    requestedStartAtMs,
    requestedEndAtMs,
    boundaryMs,
    null,
  );
  const quote = SpyQuoteSchema.parse({
    symbol: "SPY",
    lastPrice: latest.close,
    bidPrice: null,
    askPrice: null,
    volume: latest.volume,
    quoteTimestamp: new Date(boundaryMs).toISOString(),
    fetchedAt: new Date(boundaryMs).toISOString(),
    marketStatus: "NORMAL",
    sourceState: "LIVE",
    dataAgeMs: 0,
    warningCode: null,
  });
  const vwap = buildSpyRthVwapResponse(candleResponse, latest.close);
  const sessionLevels = buildSpySessionLevelsResponse(access, boundaryMs);
  const gap = buildSpyRthGapResponse(access, boundaryMs);
  const openingRange = buildSpyOpeningRangeResponse(access, boundaryMs);
  const options = buildUnavailableSpyZeroDteOptionsChainResponse(
    marketDate,
    boundaryMs,
    "OPTIONS_ACCESS_UNAVAILABLE",
  );
  const expectedMove = buildUnavailableSpyZeroDteExpectedMoveResponse(
    marketDate,
    boundaryMs,
    "OPTIONS_ACCESS_UNAVAILABLE",
    "UNAVAILABLE",
    options.fetchedAt,
    0,
    null,
    null,
  );
  const gex = buildUnavailableSpyZeroDteGexProxyResponse(
    marketDate,
    boundaryMs,
    "OPTIONS_ACCESS_UNAVAILABLE",
    { underlyingPrice: latest.close, chainFetchedAt: options.fetchedAt },
  );
  const dex = buildUnavailableSpyZeroDteDexProxyResponse(
    marketDate,
    boundaryMs,
    "OPTIONS_ACCESS_UNAVAILABLE",
    { underlyingPrice: latest.close, chainFetchedAt: options.fetchedAt },
  );
  const context = buildSpyZeroDteMarketContext(
    {
      quote,
      candles: candleResponse,
      sessionData,
      vwap,
      sessionLevels,
      gap,
      openingRange,
      options,
      expectedMove,
      gex,
      dex,
    },
    boundaryMs,
  );
  const marketState = historicalUnderlyingMarketState(
    buildSpyZeroDteDeterministicMarketState(context, boundaryMs),
  );
  const bias = buildSpyZeroDteDeterministicBias(marketState, boundaryMs);
  const plan = buildSpyZeroDteDeterministicTradePlan(
    marketState,
    bias,
    boundaryMs,
  );
  const risk = buildSpyZeroDteObjectiveRiskFramework(
    marketState,
    bias,
    plan,
    boundaryMs,
  );
  const contract = buildHistoricalUnderlyingOnlyContractSelection(
    risk,
    boundaryMs,
  );
  const assembly = buildSpyZeroDteTradePlanAssembly(
    marketState,
    bias,
    plan,
    risk,
    contract,
    boundaryMs,
  );
  const boundaryAt = new Date(boundaryMs).toISOString();
  return {
    id: `${HISTORICAL_SOURCE_PREFIX}:${marketDate}:${boundaryAt}`,
    currentMarketDate: marketDate,
    sourceCalculatedAt: boundaryAt,
    capturedAt: boundaryAt,
    sourceAssembly: assembly,
    sourceMarketState: marketState,
    optionsChainSnapshotId: null,
    optionsChainPayload: null,
    sourceKind: "HISTORICAL_UNDERLYING",
  };
}

export function buildHistoricalUnderlyingDecisionCycles(args: {
  candles: readonly SpyCandle[];
  marketDates: readonly string[];
  requestedStartAtMs: number;
  requestedEndAtMs: number;
}): PointInTimeDecisionCycleSource[] {
  const sortedCandles = [...args.candles].sort(
    (left, right) => left.timestamp - right.timestamp,
  );
  const rows: PointInTimeDecisionCycleSource[] = [];

  for (const marketDate of args.marketDates) {
    const rthCandles = selectMarketSessionCandles(
      sortedCandles,
      marketDate,
      "RTH",
    );
    for (const candle of rthCandles) {
      const boundaryMs = candle.timestamp + FIVE_MINUTES_MS;
      const minute = new Intl.DateTimeFormat("en-US", {
        timeZone: "America/New_York",
        hour12: false,
        hour: "2-digit",
        minute: "2-digit",
      })
        .formatToParts(new Date(boundaryMs))
        .reduce(
          (acc, part) => {
            if (part.type === "hour") acc.hour = Number(part.value);
            if (part.type === "minute") acc.minute = Number(part.value);
            return acc;
          },
          { hour: 0, minute: 0 },
        );
      const minuteOfDay = minute.hour * 60 + minute.minute;
      if (minuteOfDay < 9 * 60 + 45 || minuteOfDay > 16 * 60) continue;
      const row = buildHistoricalBoundary(
        sortedCandles,
        marketDate,
        boundaryMs,
        args.requestedStartAtMs,
        args.requestedEndAtMs,
      );
      if (row !== null) rows.push(row);
    }
  }

  return rows;
}
