import type { SpyZeroDteObjectiveRiskResponse } from "@spy-copilot/shared";
import { buildSpyZeroDteDeterministicBias } from "./market-bias.logic";
import {
  getLastResortSpyZeroDteDeterministicMarketState,
  getSpyZeroDteDeterministicMarketState,
} from "./market-state.service";
import { buildSpyZeroDteDeterministicTradePlan } from "./trade-plan.logic";
import { buildSpyZeroDteObjectiveRiskFramework } from "./trade-risk.logic";

/**
 * Retrieves exactly one Market-State response, derives BIAS_V1 and
 * TRADE_PLAN_V1 from that same object, then calculates RISK_V1.
 */
export async function getSpyZeroDteObjectiveRiskFramework(): Promise<SpyZeroDteObjectiveRiskResponse> {
  const marketState = await getSpyZeroDteDeterministicMarketState();
  const bias = buildSpyZeroDteDeterministicBias(marketState, Date.now());
  const tradePlan = buildSpyZeroDteDeterministicTradePlan(marketState, bias, Date.now());
  return buildSpyZeroDteObjectiveRiskFramework(marketState, bias, tradePlan, Date.now());
}

export function getLastResortSpyZeroDteObjectiveRiskFramework(): SpyZeroDteObjectiveRiskResponse {
  const marketState = getLastResortSpyZeroDteDeterministicMarketState();
  const bias = buildSpyZeroDteDeterministicBias(marketState, Date.now());
  const tradePlan = buildSpyZeroDteDeterministicTradePlan(marketState, bias, Date.now());
  return buildSpyZeroDteObjectiveRiskFramework(marketState, bias, tradePlan, Date.now());
}
