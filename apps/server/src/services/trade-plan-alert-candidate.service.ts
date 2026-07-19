import type {
  SpyZeroDteTradePlanAlertCandidateResponse,
  SpyZeroDteTradePlanAssemblyResponse,
} from "@spy-copilot/shared";
import { buildSpyZeroDteTradePlanAlertCandidate } from "./trade-plan-alert-candidate.logic";
import {
  getLastResortSpyZeroDteTradePlanAssembly,
  getSpyZeroDteTradePlanAssembly,
} from "./trade-plan-assembly.service";

export interface TradePlanAlertCandidateServiceDependencies {
  getAssembly: () => Promise<SpyZeroDteTradePlanAssemblyResponse>;
  getLastResortAssembly: () => SpyZeroDteTradePlanAssemblyResponse;
  now: () => number;
}

const defaultDependencies: TradePlanAlertCandidateServiceDependencies = {
  getAssembly: getSpyZeroDteTradePlanAssembly,
  getLastResortAssembly: getLastResortSpyZeroDteTradePlanAssembly,
  now: Date.now,
};

export async function getSpyZeroDteTradePlanAlertCandidateWithDependencies(
  dependencies: TradePlanAlertCandidateServiceDependencies,
): Promise<SpyZeroDteTradePlanAlertCandidateResponse> {
  try {
    const assembly = await dependencies.getAssembly();
    return buildSpyZeroDteTradePlanAlertCandidate(assembly, dependencies.now());
  } catch {
    return buildSpyZeroDteTradePlanAlertCandidate(
      dependencies.getLastResortAssembly(),
      dependencies.now(),
    );
  }
}

export function getSpyZeroDteTradePlanAlertCandidate(): Promise<SpyZeroDteTradePlanAlertCandidateResponse> {
  return getSpyZeroDteTradePlanAlertCandidateWithDependencies(defaultDependencies);
}
