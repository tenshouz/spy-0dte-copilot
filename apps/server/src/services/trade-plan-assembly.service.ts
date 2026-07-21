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
  contractSelectionRequiresOptionsChain,
} from "./trade-contract.logic";
import { buildSpyZeroDteDeterministicTradePlan } from "./trade-plan.logic";
import { buildSpyZeroDteTradePlanAssembly } from "./trade-plan-assembly.logic";
import { buildSpyZeroDteObjectiveRiskFramework } from "./trade-risk.logic";

export interface TradePlanAssemblyBundle {
  marketState: SpyZeroDteDeterministicMarketStateResponse;
  optionsChain: SpyZeroDteOptionsChainResponse | null;
  assembly: SpyZeroDteTradePlanAssemblyResponse;
}

export interface TradePlanAssemblyServiceDependencies {
  getMarketState: () => Promise<SpyZeroDteDeterministicMarketStateResponse>;
  getOptionsChain: () => Promise<SpyZeroDteOptionsChainResponse>;
  getLastResortOptionsChain: () => SpyZeroDteOptionsChainResponse;
  captureDecisionCycle?: (bundle: TradePlanAssemblyBundle) => Promise<unknown>;
  now: () => number;
}

async function captureBundleBestEffort(bundle: TradePlanAssemblyBundle): Promise<void> {
  try {
    const { captureDeterministicDecisionCycle } = await import(
      "./decision-cycle-audit.service"
    );
    await captureDeterministicDecisionCycle(
      bundle.assembly,
      bundle.marketState,
      bundle.optionsChain,
    );
  } catch {
    // Audit persistence is non-critical and must never break current analysis.
  }
}

const defaultDependencies: TradePlanAssemblyServiceDependencies = {
  getMarketState: getSpyZeroDteDeterministicMarketState,
  getOptionsChain: getSpyZeroDteOptionsChain,
  getLastResortOptionsChain: getLastResortSpyZeroDteOptionsChain,
  captureDecisionCycle: captureBundleBestEffort,
  now: Date.now,
};

/**
 * Retrieves Market State once, derives every same-snapshot deterministic
 * upstream product from that exact object, and requests the Options Chain at
 * most once when CONTRACT_V2 needs a current-chain preflight or selection.
 * The exact source bundle is then persisted best-effort for forward replay.
 */
export async function getSpyZeroDteTradePlanAssemblyBundleWithDependencies(
  dependencies: TradePlanAssemblyServiceDependencies,
): Promise<TradePlanAssemblyBundle> {
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

  let optionsChain: SpyZeroDteOptionsChainResponse | null = null;
  if (contractSelectionRequiresOptionsChain(risk)) {
    try {
      optionsChain = await dependencies.getOptionsChain();
    } catch {
      optionsChain = dependencies.getLastResortOptionsChain();
    }
  }

  const contract = buildSpyZeroDteContractSelection(
    risk,
    optionsChain,
    dependencies.now(),
  );
  const assembly = buildSpyZeroDteTradePlanAssembly(
    marketState,
    bias,
    tradePlan,
    risk,
    contract,
    dependencies.now(),
  );
  const bundle = { marketState, optionsChain, assembly };
  if (dependencies.captureDecisionCycle) {
    try {
      await dependencies.captureDecisionCycle(bundle);
    } catch {
      // Capture remains best-effort and cannot alter the trading product.
    }
  }
  return bundle;
}

export async function getSpyZeroDteTradePlanAssemblyWithDependencies(
  dependencies: TradePlanAssemblyServiceDependencies,
): Promise<SpyZeroDteTradePlanAssemblyResponse> {
  return (
    await getSpyZeroDteTradePlanAssemblyBundleWithDependencies(dependencies)
  ).assembly;
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
