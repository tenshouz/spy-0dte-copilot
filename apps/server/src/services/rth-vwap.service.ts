import type { SpyRthVwapResponse } from "@spy-copilot/shared";
import { getLatestSnapshot } from "./mock-data.service";
import { buildSpyRthVwapResponse } from "./rth-vwap.logic";
import { getLastResortMockCandles, getSpyCandles } from "./schwab-candles.service";

/**
 * First deterministic session analytic. This service deliberately reuses the
 * existing current-day candle service, including its bounded Schwab request,
 * cache, in-flight deduplication, validation, normalization, auth handling,
 * and current-market-date selection. It creates no new upstream polling path.
 */
export async function getSpyRthVwap(): Promise<SpyRthVwapResponse> {
  const candles = await getSpyCandles();
  return buildSpyRthVwapResponse(candles, getLatestSnapshot().vwap);
}

export function getLastResortSpyRthVwap(): SpyRthVwapResponse {
  return buildSpyRthVwapResponse(getLastResortMockCandles(), getLatestSnapshot().vwap);
}
