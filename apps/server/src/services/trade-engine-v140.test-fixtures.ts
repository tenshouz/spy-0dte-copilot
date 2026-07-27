import {
  SpyZeroDteDeterministicMarketStateResponseSchema,
  type NormalizedOptionContract,
  type SpyZeroDteDeterministicBiasResponse,
  type SpyZeroDteDeterministicMarketStateResponse,
  type SpyZeroDteDeterministicTradePlanResponse,
  type SpyZeroDteObjectiveRiskResponse,
  type SpyZeroDteOptionsChainResponse,
} from "@spy-copilot/shared";
import { buildSpyZeroDteDeterministicBias } from "./market-bias.logic";
import { buildSpyZeroDteDeterministicTradePlan } from "./trade-plan.logic";
import { buildSpyZeroDteObjectiveRiskFramework } from "./trade-risk.logic";

export const V140_MARKET_DATE = "2026-07-17";
export const V140_PREVIOUS_DATE = "2026-07-16";
export const V140_STATE_AT = "2026-07-17T14:00:00.000Z";
export const V140_BIAS_AT_MS = Date.parse("2026-07-17T14:00:01.000Z");
export const V140_PLAN_AT_MS = Date.parse("2026-07-17T14:00:02.000Z");
export const V140_RISK_AT_MS = Date.parse("2026-07-17T14:00:03.000Z");
export const V140_CHAIN_AT = "2026-07-17T14:00:04.000Z";
export const V140_QUOTE_AT = "2026-07-17T13:59:58.000Z";
export const V140_CONTRACT_QUOTE_AT = "2026-07-17T14:00:05.000Z";
export const V140_CONTRACT_EVAL_MS = Date.parse("2026-07-17T14:00:10.000Z");

function candle(
  timestampIso: string,
  close: number,
  volume: number,
  range = 1,
  lowOverride?: number,
  highOverride?: number,
) {
  const low = lowOverride ?? close - range / 2;
  const high = highOverride ?? close + range / 2;
  return {
    timestamp: Date.parse(timestampIso),
    open: close - 0.05,
    high,
    low,
    close,
    volume,
  };
}

function executionCandles(direction: "CALLS" | "PUTS") {
  if (direction === "CALLS") {
    return [
      candle("2026-07-17T13:30:00.000Z", 757.55, 1000),
      candle("2026-07-17T13:35:00.000Z", 757.72, 1050),
      candle("2026-07-17T13:40:00.000Z", 757.90, 1100),
      candle("2026-07-17T13:45:00.000Z", 758.05, 1000),
      candle("2026-07-17T13:50:00.000Z", 758.12, 1080),
      candle("2026-07-17T13:55:00.000Z", 758.25, 1400, 1, 757.95, 758.55),
    ];
  }
  return [
    candle("2026-07-17T13:30:00.000Z", 749.45, 1000),
    candle("2026-07-17T13:35:00.000Z", 749.28, 1050),
    candle("2026-07-17T13:40:00.000Z", 749.10, 1100),
    candle("2026-07-17T13:45:00.000Z", 748.95, 1000),
    candle("2026-07-17T13:50:00.000Z", 748.82, 1080),
    candle("2026-07-17T13:55:00.000Z", 748.72, 1400, 1, 748.45, 749.05),
  ];
}

function featureStatuses(state: SpyZeroDteDeterministicMarketStateResponse) {
  const features = Object.values(state.features);
  state.featureStatuses = features.map((feature) => ({
    featureId: feature.featureId,
    status: feature.status,
    warningCode: feature.warningCode,
  }));
  state.featureWarnings = features
    .filter((feature) => feature.warningCode !== null)
    .map((feature) => ({ featureId: feature.featureId, warningCode: feature.warningCode! }));
}

export function makeV140MarketState(
  direction: "CALLS" | "PUTS" = "CALLS",
): SpyZeroDteDeterministicMarketStateResponse {
  const isCalls = direction === "CALLS";
  const price = isCalls ? 758.35 : 748.65;
  const vwap = isCalls ? 757.8 : 749.2;
  const openingRangeHigh = isCalls ? 758 : 751;
  const openingRangeLow = isCalls ? 756 : 749;
  const recentCompletedCandles = executionCandles(direction);
  const state = {
    symbol: "SPY",
    product: "SPY_ZERO_DTE_DETERMINISTIC_MARKET_STATE",
    engineVersion: "V1",
    currentMarketDate: V140_MARKET_DATE,
    mostRecentRthSessionDate: V140_MARKET_DATE,
    sourceContextState: "READY",
    sourceContextAssembledAt: "2026-07-17T13:59:59.500Z",
    calculatedAt: V140_STATE_AT,
    engineState: "AVAILABLE",
    price,
    priceSource: "QUOTE_LAST_PRICE",
    quoteTimestamp: V140_QUOTE_AT,
    quoteSourceState: "LIVE",
    snapshotIntegrity: {
      methodologyVersion: "SNAPSHOT_INTEGRITY_V1",
      snapshotId: `V140-${direction}`,
      assembledAt: "2026-07-17T13:59:59.500Z",
      quoteFetchedAt: "2026-07-17T13:59:58.000Z",
      candlesFetchedAt: "2026-07-17T13:59:57.000Z",
      optionsChainFetchedAt: "2026-07-17T13:59:56.000Z",
      marketStructureSkewMilliseconds: 1000,
      maximumMarketStructureSkewMilliseconds: 30_000,
      executionSkewMilliseconds: 2000,
      maximumExecutionSkewMilliseconds: 45_000,
      optionsIncludedInExecutionSkew: true,
      state: "COHERENT",
      warningCodes: [],
    },
    executionContext: {
      methodologyVersion: "EXECUTION_CONTEXT_V1",
      timeframe: "5m",
      recentCompletedCandles,
      completedCandleCount: recentCompletedCandles.length,
      latestCompletedCandleAt: new Date(recentCompletedCandles.at(-1)!.timestamp).toISOString(),
      medianRangePoints: 1,
      medianVolume: 1075,
      sourceCandleFetchedAt: "2026-07-17T13:59:57.000Z",
      sourceState: "LIVE",
    },
    features: {
      sessionPhase: {
        featureId: "SESSION_PHASE",
        featureVersion: "V1",
        status: "AVAILABLE",
        state: "RTH",
        sourceComponents: ["SESSION_DATA"],
        referenceDate: V140_MARKET_DATE,
        referenceDateRelation: "CURRENT_MARKET_DATE",
        inputs: {
          currentMarketDate: V140_MARKET_DATE,
          currentSessionWindow: "RTH",
          currentObservedMarketDate: V140_MARKET_DATE,
          sourceState: "LIVE",
        },
        derived: {},
        warningCode: null,
      },
      priceVsVwap: {
        featureId: "PRICE_VS_VWAP",
        featureVersion: "V1",
        status: "AVAILABLE",
        state: isCalls ? "ABOVE" : "BELOW",
        sourceComponents: ["QUOTE", "VWAP"],
        referenceDate: V140_MARKET_DATE,
        referenceDateRelation: "CURRENT_MARKET_DATE",
        inputs: {
          price,
          priceSource: "QUOTE_LAST_PRICE",
          vwap,
          vwapMarketDate: V140_MARKET_DATE,
          quoteSourceState: "LIVE",
          vwapMetricState: "LIVE",
          vwapSourceState: "LIVE",
        },
        derived: {
          distancePoints: price - vwap,
          distancePercent: ((price - vwap) / vwap) * 100,
        },
        warningCode: null,
      },
      priceVsPriorDayRange: {
        featureId: "PRICE_VS_PRIOR_DAY_RANGE",
        featureVersion: "V1",
        status: "AVAILABLE",
        state: isCalls ? "INSIDE_RANGE" : "BELOW_RANGE",
        sourceComponents: ["QUOTE", "SESSION_LEVELS"],
        referenceDate: V140_PREVIOUS_DATE,
        referenceDateRelation: "PREVIOUS_RTH_SESSION",
        inputs: {
          price,
          priceSource: "QUOTE_LAST_PRICE",
          previousDayHigh: 760.5,
          previousDayLow: 747,
          previousDayHighState: "LIVE",
          previousDayLowState: "LIVE",
          previousRthMarketDate: V140_PREVIOUS_DATE,
          previousRthCoverageState: "COMPLETE",
        },
        derived: {
          distanceToHighPoints: price - 760.5,
          distanceToLowPoints: price - 747,
        },
        warningCode: null,
      },
      priceVsPremarketRange: {
        featureId: "PRICE_VS_PREMARKET_RANGE",
        featureVersion: "V1",
        status: "AVAILABLE",
        state: isCalls ? "ABOVE_RANGE" : "BELOW_RANGE",
        sourceComponents: ["QUOTE", "SESSION_LEVELS"],
        referenceDate: V140_MARKET_DATE,
        referenceDateRelation: "CURRENT_MARKET_DATE",
        inputs: {
          price,
          priceSource: "QUOTE_LAST_PRICE",
          premarketHigh: 758.1,
          premarketLow: 748.9,
          premarketHighState: "LIVE",
          premarketLowState: "LIVE",
          currentMarketDate: V140_MARKET_DATE,
          currentSessionWindow: "RTH",
          currentMarketDateHasDefinedSessionData: true,
          premarketCoverageState: "COMPLETE",
        },
        derived: {
          distanceToHighPoints: price - 758.1,
          distanceToLowPoints: price - 748.9,
        },
        warningCode: null,
      },
      priceVsOpeningRange: {
        featureId: "PRICE_VS_OPENING_RANGE",
        featureVersion: "V1",
        status: "AVAILABLE",
        state: isCalls ? "ABOVE_RANGE" : "BELOW_RANGE",
        sourceComponents: ["QUOTE", "OPENING_RANGE"],
        referenceDate: V140_MARKET_DATE,
        referenceDateRelation: "CURRENT_MARKET_DATE",
        inputs: {
          price,
          priceSource: "QUOTE_LAST_PRICE",
          openingRangeHigh,
          openingRangeLow,
          phase: "COMPLETE",
          currentMarketDate: V140_MARKET_DATE,
          metricState: "LIVE",
          sourceState: "LIVE",
          coverageState: "COMPLETE",
        },
        derived: {
          distanceToHighPoints: price - openingRangeHigh,
          distanceToLowPoints: price - openingRangeLow,
        },
        warningCode: null,
      },
      gapContext: {
        featureId: "RTH_GAP_CONTEXT",
        featureVersion: "V1",
        status: "AVAILABLE",
        state: isCalls ? "UP" : "DOWN",
        sourceComponents: ["GAP"],
        referenceDate: V140_MARKET_DATE,
        referenceDateRelation: "CURRENT_MARKET_DATE",
        inputs: {
          currentMarketDate: V140_MARKET_DATE,
          previousRthMarketDate: V140_PREVIOUS_DATE,
          currentRthOpen: isCalls ? 756 : 750,
          previousDayClose: 751,
          gapPoints: isCalls ? 5 : -1,
          gapPercent: isCalls ? 0.6658 : -0.1332,
          direction: isCalls ? "UP" : "DOWN",
          fillState: "UNFILLED",
          firstObservedFillCandleAt: null,
          metricState: "LIVE",
          sourceState: "LIVE",
          currentRthCoverageState: "COMPLETE",
          previousRthCoverageState: "COMPLETE",
        },
        derived: {},
        warningCode: null,
      },
      priceVsExpectedMoveRange: {
        featureId: "PRICE_VS_EXPECTED_MOVE_RANGE",
        featureVersion: "V1",
        status: "AVAILABLE",
        state: "INSIDE_RANGE",
        sourceComponents: ["QUOTE", "EXPECTED_MOVE"],
        referenceDate: V140_MARKET_DATE,
        referenceDateRelation: "CURRENT_EXPIRATION",
        inputs: {
          price,
          priceSource: "QUOTE_LAST_PRICE",
          upperImpliedMoveLevel: 762,
          lowerImpliedMoveLevel: 745,
          expirationDate: V140_MARKET_DATE,
          currentMarketDate: V140_MARKET_DATE,
          metricState: "LIVE",
          sourceState: "LIVE",
        },
        derived: {
          distanceToUpperPoints: price - 762,
          distanceToLowerPoints: price - 745,
        },
        warningCode: null,
      },
      netGexProxySign: {
        featureId: "RETURNED_WINDOW_NET_GEX_SIGN",
        featureVersion: "V1",
        status: "AVAILABLE",
        state: "POSITIVE",
        sourceComponents: ["GEX"],
        referenceDate: V140_MARKET_DATE,
        referenceDateRelation: "CURRENT_EXPIRATION",
        inputs: {
          netGammaExposureProxy: 500_000_000,
          methodology: "OI_WEIGHTED_GAMMA_PER_1PCT_MOVE",
          coverageScope: "RETURNED_CHAIN_WINDOW",
          coverageState: "COMPLETE",
          metricState: "LIVE",
          sourceState: "LIVE",
          eligibleStrikeCount: 40,
          expirationDate: V140_MARKET_DATE,
        },
        derived: {},
        warningCode: null,
      },
      netDexProxySign: {
        featureId: "RETURNED_WINDOW_NET_DEX_SIGN",
        featureVersion: "V1",
        status: "AVAILABLE",
        state: "POSITIVE",
        sourceComponents: ["DEX"],
        referenceDate: V140_MARKET_DATE,
        referenceDateRelation: "CURRENT_EXPIRATION",
        inputs: {
          netDeltaExposureProxy: 900_000_000,
          methodology: "OI_WEIGHTED_DELTA_NOTIONAL",
          coverageScope: "RETURNED_CHAIN_WINDOW",
          coverageState: "COMPLETE",
          metricState: "LIVE",
          sourceState: "LIVE",
          eligibleStrikeCount: 40,
          expirationDate: V140_MARKET_DATE,
        },
        derived: {},
        warningCode: null,
      },
    },
    featureStatuses: [],
    featureWarnings: [],
    warningCode: null,
  } as unknown as SpyZeroDteDeterministicMarketStateResponse;
  featureStatuses(state);
  return SpyZeroDteDeterministicMarketStateResponseSchema.parse(state);
}

export function makeV140BiasPlanRisk(direction: "CALLS" | "PUTS" = "CALLS"): {
  marketState: SpyZeroDteDeterministicMarketStateResponse;
  bias: SpyZeroDteDeterministicBiasResponse;
  tradePlan: SpyZeroDteDeterministicTradePlanResponse;
  risk: SpyZeroDteObjectiveRiskResponse;
} {
  const marketState = makeV140MarketState(direction);
  const bias = buildSpyZeroDteDeterministicBias(marketState, V140_BIAS_AT_MS);
  const tradePlan = buildSpyZeroDteDeterministicTradePlan(
    marketState,
    bias,
    V140_PLAN_AT_MS,
  );
  const risk = buildSpyZeroDteObjectiveRiskFramework(
    marketState,
    bias,
    tradePlan,
    V140_RISK_AT_MS,
  );
  return { marketState, bias, tradePlan, risk };
}

export function makeV140Contract(
  symbol: string,
  optionType: "CALL" | "PUT",
  strikePrice: number,
  overrides: Partial<NormalizedOptionContract> = {},
): NormalizedOptionContract {
  return {
    contractSymbol: symbol,
    underlyingSymbol: "SPY",
    optionType,
    expirationDate: V140_MARKET_DATE,
    strikePrice,
    description: `${symbol} V1.4 test contract`,
    bid: 1.3,
    ask: 1.4,
    last: 1.35,
    mark: 1.35,
    bidSize: 10,
    askSize: 12,
    lastSize: 1,
    volume: 500,
    openInterest: 1000,
    impliedVolatilityPercent: 25,
    delta: optionType === "CALL" ? 0.55 : -0.55,
    gamma: 0.08,
    theta: -0.2,
    vega: 0.05,
    rho: 0.01,
    inTheMoney: false,
    nonStandard: false,
    mini: false,
    multiplier: 100,
    quoteAt: V140_CONTRACT_QUOTE_AT,
    tradeAt: "2026-07-17T14:00:04.000Z",
    ...overrides,
  };
}

export function makeV140OptionsChain(
  direction: "CALLS" | "PUTS" = "CALLS",
  overrides: Partial<SpyZeroDteOptionsChainResponse> = {},
): SpyZeroDteOptionsChainResponse {
  const isCalls = direction === "CALLS";
  const underlyingPrice = isCalls ? 758.35 : 748.65;
  const calls = [
    makeV140Contract("SPY_CALL_757", "CALL", 757, { delta: 0.64, openInterest: 900, volume: 650 }),
    makeV140Contract("SPY_CALL_758", "CALL", 758, { delta: 0.55, openInterest: 1200, volume: 900 }),
    makeV140Contract("SPY_CALL_759", "CALL", 759, { delta: 0.48, openInterest: 1500, volume: 1100 }),
    makeV140Contract("SPY_CALL_760", "CALL", 760, { delta: 0.42, openInterest: 800, volume: 400 }),
  ];
  const puts = [
    makeV140Contract("SPY_PUT_748", "PUT", 748, { delta: -0.48, openInterest: 1200, volume: 850 }),
    makeV140Contract("SPY_PUT_749", "PUT", 749, { delta: -0.55, openInterest: 1400, volume: 1000 }),
    makeV140Contract("SPY_PUT_750", "PUT", 750, { delta: -0.68, openInterest: 900, volume: 500 }),
  ];
  const all = [...calls, ...puts];
  return {
    symbol: "SPY",
    metric: "ZERO_DTE_OPTIONS_CHAIN",
    currentMarketDate: V140_MARKET_DATE,
    requestedExpirationDate: V140_MARKET_DATE,
    returnedExpirationDate: V140_MARKET_DATE,
    metricState: "LIVE",
    sourceState: "LIVE",
    isDelayed: false,
    underlyingPrice,
    underlyingPriceSource: "CHAIN_RESPONSE",
    calls,
    puts,
    requestedStrikeCount: 40,
    returnedUniqueStrikeCount: 7,
    callContractCount: calls.length,
    putContractCount: puts.length,
    minimumReturnedStrike: 748,
    maximumReturnedStrike: 760,
    providerContractCount: all.length,
    totalContracts: all.length,
    contractsWithBidAsk: all.length,
    contractsWithGreeks: all.length,
    contractsWithOpenInterest: all.length,
    contractsWithVolume: all.length,
    rejectedContractCount: 0,
    fetchedAt: V140_CHAIN_AT,
    dataAgeMs: 0,
    latestOptionQuoteAt: V140_CONTRACT_QUOTE_AT,
    latestOptionTradeAt: "2026-07-17T14:00:04.000Z",
    warningCode: null,
    ...overrides,
  } as SpyZeroDteOptionsChainResponse;
}
