import type {
  SpyZeroDteContractSelectionResponse,
  SpyZeroDteDeterministicMarketStateResponse,
  SpyZeroDteOptionsChainResponse,
  SpyZeroDteObjectiveRiskResponse,
} from "@spy-copilot/shared";
import { buildSpyZeroDteDeterministicBias } from "./market-bias.logic";
import {
  getLastResortSpyZeroDteDeterministicMarketState,
  getSpyZeroDteDeterministicMarketState,
} from "./market-state.service";
import {
  getLastResortSpyZeroDteOptionsChain,
  getSpyZeroDteOptionsChain,
} from "./schwab-options-chain.service";
import { buildSpyZeroDteDeterministicTradePlan } from "./trade-plan.logic";
import { buildSpyZeroDteObjectiveRiskFramework } from "./trade-risk.logic";
import {
  buildSpyZeroDteContractSelection,
  resolveSpyZeroDteContractSelectionFromRisk,
} from "./trade-contract.logic";

export interface TradeContractServiceDependencies {
  getMarketState: () => Promise<SpyZeroDteDeterministicMarketStateResponse>;
  getOptionsChain: () => Promise<SpyZeroDteOptionsChainResponse>;
  getLastResortOptionsChain: () => SpyZeroDteOptionsChainResponse;
  now: () => number;
}


const defaultDependencies: TradeContractServiceDependencies = {
  getMarketState: getSpyZeroDteDeterministicMarketState,
  getOptionsChain: getSpyZeroDteOptionsChain,
  getLastResortOptionsChain: getLastResortSpyZeroDteOptionsChain,
  now: Date.now,
};

/**
 * Retrieves one Market-State response and derives BIAS_V1, TRADE_PLAN_V2, and
 * RISK_V1 from that same object. The Options Chain is requested at most once,
 * and only when the Risk result is READY + QUALIFIED and currently eligible.
 */
export async function getSpyZeroDteContractSelectionWithDependencies(
  dependencies: TradeContractServiceDependencies,
): Promise<SpyZeroDteContractSelectionResponse> {
  const marketState = await dependencies.getMarketState();
  const bias = buildSpyZeroDteDeterministicBias(marketState, dependencies.now());
  const tradePlan = buildSpyZeroDteDeterministicTradePlan(
    marketState,
    bias,
    dependencies.now(),
  );
  const risk = buildSpyZeroDteObjectiveRiskFramework(
    marketState,
    bias,
    tradePlan,
    dependencies.now(),
  );

  return resolveSpyZeroDteContractSelectionFromRisk(risk, {
    getOptionsChain: dependencies.getOptionsChain,
    getLastResortOptionsChain: dependencies.getLastResortOptionsChain,
    now: dependencies.now,
  });
}

export function getSpyZeroDteContractSelection(): Promise<SpyZeroDteContractSelectionResponse> {
  return getSpyZeroDteContractSelectionWithDependencies(defaultDependencies);
}

/** Last-resort fallback never calls Schwab or any public/internal HTTP route. */
export function getLastResortSpyZeroDteContractSelection(): SpyZeroDteContractSelectionResponse {
  const marketState = getLastResortSpyZeroDteDeterministicMarketState();
  const now = Date.now();
  const bias = buildSpyZeroDteDeterministicBias(marketState, now);
  const tradePlan = buildSpyZeroDteDeterministicTradePlan(marketState, bias, now);
  const risk = buildSpyZeroDteObjectiveRiskFramework(marketState, bias, tradePlan, now);
  return buildSpyZeroDteContractSelection(risk, null, now);
}
