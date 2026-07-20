import type { SpyZeroDteDeterministicTradePlanResponse } from "@spy-copilot/shared";
import { buildSpyZeroDteDeterministicBias } from "./market-bias.logic";
import {
  getLastResortSpyZeroDteDeterministicMarketState,
  getSpyZeroDteDeterministicMarketState,
} from "./market-state.service";
import { buildSpyZeroDteDeterministicTradePlan } from "./trade-plan.logic";

/**
 * Retrieves exactly one Market-State response, derives BIAS_V1 from that same
 * object, and calculates TRADE_PLAN_V2 without any provider or public-route call.
 */
export async function getSpyZeroDteDeterministicTradePlan(): Promise<SpyZeroDteDeterministicTradePlanResponse> {
  const marketState = await getSpyZeroDteDeterministicMarketState();
  const bias = buildSpyZeroDteDeterministicBias(marketState, Date.now());
  return buildSpyZeroDteDeterministicTradePlan(marketState, bias, Date.now());
}

export function getLastResortSpyZeroDteDeterministicTradePlan(): SpyZeroDteDeterministicTradePlanResponse {
  const marketState = getLastResortSpyZeroDteDeterministicMarketState();
  const bias = buildSpyZeroDteDeterministicBias(marketState, Date.now());
  return buildSpyZeroDteDeterministicTradePlan(marketState, bias, Date.now());
}
