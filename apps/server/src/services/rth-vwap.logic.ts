import {
  SpyRthVwapResponseSchema,
  type SpyCandle,
  type SpyCandleResponse,
  type SpyRthVwapResponse,
  type VwapPoint,
} from "@spy-copilot/shared";
import {
  selectLatestDefinedMarketDate,
  selectMarketSessionCandles,
} from "./session-data.logic";

export interface CumulativeVwapResult {
  series: VwapPoint[];
  latestVwap: number | null;
  totalVolume: number;
}

/**
 * Pure cumulative HLC3 VWAP calculation. The input MUST already be the desired
 * session candle set; this function deliberately owns no timezone, market-date,
 * provider, freshness, or HTTP rules.
 */
export function calculateCumulativeHlc3Vwap(
  candles: readonly SpyCandle[],
): CumulativeVwapResult {
  let cumulativePriceVolume = 0;
  let cumulativeVolume = 0;
  const series: VwapPoint[] = [];

  for (const candle of candles) {
    const typicalPrice = (candle.high + candle.low + candle.close) / 3;
    cumulativePriceVolume += typicalPrice * candle.volume;
    cumulativeVolume += candle.volume;

    // Until cumulative volume becomes positive there is no mathematically
    // defined VWAP. Once positive, a zero-volume candle legitimately leaves
    // the cumulative VWAP unchanged and still gets a series point.
    if (cumulativeVolume > 0) {
      series.push({
        timestamp: candle.timestamp,
        value: cumulativePriceVolume / cumulativeVolume,
      });
    }
  }

  return {
    series,
    latestVwap: series.at(-1)?.value ?? null,
    totalVolume: cumulativeVolume,
  };
}

/**
 * Pure response composition from the already-normalized current chart candle
 * response. The live/stale/mock provenance comes from the candle service; the
 * VWAP layer can only preserve or weaken it, never upgrade it.
 */
export function buildSpyRthVwapResponse(
  candleResponse: SpyCandleResponse,
  mockVwap: number,
): SpyRthVwapResponse {
  const marketDate = selectLatestDefinedMarketDate(candleResponse.candles);
  const rthCandles = marketDate
    ? selectMarketSessionCandles(candleResponse.candles, marketDate, "RTH")
    : [];
  const latestRthCandle = rthCandles.at(-1) ?? null;

  if (candleResponse.sourceState === "MOCK") {
    // Preserve the existing intentionally mocked VWAP fallback instead of
    // silently redefining it. Its state remains explicitly MOCK.
    const series = rthCandles.map((candle) => ({
      timestamp: candle.timestamp,
      value: mockVwap,
    }));
    return SpyRthVwapResponseSchema.parse({
      symbol: "SPY",
      metric: "RTH_VWAP",
      priceSource: "HLC3",
      marketDate,
      metricState: "MOCK",
      candleSourceState: "MOCK",
      latestVwap: mockVwap,
      series,
      fetchedAt: candleResponse.fetchedAt,
      dataAgeMs: candleResponse.dataAgeMs,
      latestRthCandleAt: latestRthCandle
        ? new Date(latestRthCandle.timestamp).toISOString()
        : null,
      rthCandleCount: rthCandles.length,
      warningCode: candleResponse.warningCode,
    });
  }

  const calculation = calculateCumulativeHlc3Vwap(rthCandles);
  const metricState =
    calculation.latestVwap === null
      ? "UNAVAILABLE"
      : candleResponse.sourceState; // LIVE or STALE only on this branch

  return SpyRthVwapResponseSchema.parse({
    symbol: "SPY",
    metric: "RTH_VWAP",
    priceSource: "HLC3",
    marketDate,
    metricState,
    candleSourceState: candleResponse.sourceState,
    latestVwap: calculation.latestVwap,
    series: calculation.series,
    fetchedAt: candleResponse.fetchedAt,
    dataAgeMs: candleResponse.dataAgeMs,
    latestRthCandleAt: latestRthCandle
      ? new Date(latestRthCandle.timestamp).toISOString()
      : null,
    rthCandleCount: rthCandles.length,
    warningCode: candleResponse.warningCode,
  });
}
