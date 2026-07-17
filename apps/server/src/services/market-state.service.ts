import type { SpyZeroDteDeterministicMarketStateResponse } from "@spy-copilot/shared";
import {
  getLastResortSpyZeroDteMarketContext,
  getSpyZeroDteMarketContext,
} from "./market-context.service";
import { buildSpyZeroDteDeterministicMarketState } from "./market-state.logic";

/**
 * Calculates deterministic V1 features from exactly one Unified Market Context.
 * It owns no provider client, provider cache, persistence, scoring, or AI logic.
 */
export async function getSpyZeroDteDeterministicMarketState(): Promise<SpyZeroDteDeterministicMarketStateResponse> {
  const context = await getSpyZeroDteMarketContext();
  return buildSpyZeroDteDeterministicMarketState(context, Date.now());
}

export function getLastResortSpyZeroDteDeterministicMarketState(): SpyZeroDteDeterministicMarketStateResponse {
  return buildSpyZeroDteDeterministicMarketState(
    getLastResortSpyZeroDteMarketContext(),
    Date.now(),
  );
}
