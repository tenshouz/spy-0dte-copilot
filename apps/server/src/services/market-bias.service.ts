import type { SpyZeroDteDeterministicBiasResponse } from "@spy-copilot/shared";
import {
  getLastResortSpyZeroDteDeterministicMarketState,
  getSpyZeroDteDeterministicMarketState,
} from "./market-state.service";
import { buildSpyZeroDteDeterministicBias } from "./market-bias.logic";

/**
 * Calculates BIAS_V1 from exactly one validated Market-State response.
 * It owns no provider client, provider cache, persistence, trade-plan, or AI logic.
 */
export async function getSpyZeroDteDeterministicBias(): Promise<SpyZeroDteDeterministicBiasResponse> {
  const marketState = await getSpyZeroDteDeterministicMarketState();
  return buildSpyZeroDteDeterministicBias(marketState, Date.now());
}

export function getLastResortSpyZeroDteDeterministicBias(): SpyZeroDteDeterministicBiasResponse {
  return buildSpyZeroDteDeterministicBias(
    getLastResortSpyZeroDteDeterministicMarketState(),
    Date.now(),
  );
}
