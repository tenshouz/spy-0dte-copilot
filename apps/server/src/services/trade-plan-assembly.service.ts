import type {
  SpyZeroDteDeterministicMarketStateResponse,
  SpyZeroDteOptionsChainResponse,
  SpyZeroDteTradePlanAssemblyResponse,
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
import {
  buildSpyZeroDteContractSelection,
  resolveSpyZeroDteContractSelectionFromRisk,
} from "./trade-contract.logic";
import { buildSpyZeroDteDeterministicTradePlan } from "./trade-plan.logic";
import { buildSpyZeroDteTradePlanAssembly } from "./trade-plan-assembly.logic";
import { buildSpyZeroDteObjectiveRiskFramework } from "./trade-risk.logic";

export interface TradePlanAssemblyServiceDependencies {
  getMarketState: () => Promise<SpyZeroDteDeterministicMarketStateResponse>;
  getOptionsChain: () => Promise<SpyZeroDteOptionsChainResponse>;
  getLastResortOptionsChain: () => SpyZeroDteOptionsChainResponse;
  now: () => number;
}

const defaultDependencies: TradePlanAssemblyServiceDependencies = {
  getMarketState: getSpyZeroDteDeterministicMarketState,
  getOptionsChain: getSpyZeroDteOptionsChain,
  getLastResortOptionsChain: getLastResortSpyZeroDteOptionsChain,
  now: Date.now,
};

/**
 * Retrieves Market State once, derives every same-snapshot deterministic
 * upstream product from that exact object, and requests the Options Chain at
 * most once through CONTRACT_V1 only when the Risk result is applicable.
 */
export async function getSpyZeroDteTradePlanAssemblyWithDependencies(
  dependencies: TradePlanAssemblyServiceDependencies,
): Promise<SpyZeroDteTradePlanAssemblyResponse> {
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
  const contract = await resolveSpyZeroDteContractSelectionFromRisk(risk, {
    getOptionsChain: dependencies.getOptionsChain,
    getLastResortOptionsChain: dependencies.getLastResortOptionsChain,
    now: dependencies.now,
  });

  return buildSpyZeroDteTradePlanAssembly(
    marketState,
    bias,
    tradePlan,
    risk,
    contract,
    dependencies.now(),
  );
}

export function getSpyZeroDteTradePlanAssembly(): Promise<SpyZeroDteTradePlanAssemblyResponse> {
  return getSpyZeroDteTradePlanAssemblyWithDependencies(defaultDependencies);
}

/** Last-resort fallback never calls Schwab or an internal/public HTTP route. */
export function getLastResortSpyZeroDteTradePlanAssembly(): SpyZeroDteTradePlanAssemblyResponse {
  const marketState = getLastResortSpyZeroDteDeterministicMarketState();
  const now = Date.now();
  const bias = buildSpyZeroDteDeterministicBias(marketState, now);
  const tradePlan = buildSpyZeroDteDeterministicTradePlan(marketState, bias, now);
  const risk = buildSpyZeroDteObjectiveRiskFramework(marketState, bias, tradePlan, now);
  const contract = buildSpyZeroDteContractSelection(risk, null, now);
  return buildSpyZeroDteTradePlanAssembly(
    marketState,
    bias,
    tradePlan,
    risk,
    contract,
    now,
  );
}

