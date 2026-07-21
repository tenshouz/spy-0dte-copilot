import type {
  SpyZeroDteTradePlanAlertCandidateResponse,
  SpyZeroDteTradePlanAssemblyResponse,
} from "@spy-copilot/shared";
import { buildSpyZeroDteTradePlanAlertCandidate } from "./trade-plan-alert-candidate.logic";
export interface TradePlanAlertCandidateServiceDependencies {
  getAssembly: () => Promise<SpyZeroDteTradePlanAssemblyResponse>;
  getLastResortAssembly: () =>
    | SpyZeroDteTradePlanAssemblyResponse
    | Promise<SpyZeroDteTradePlanAssemblyResponse>;
  now: () => number;
  captureDecisionCycle?: (
    assembly: SpyZeroDteTradePlanAssemblyResponse,
  ) => Promise<unknown>;
}

const defaultDependencies: TradePlanAlertCandidateServiceDependencies = {
  getAssembly: async () => {
    const { getSpyZeroDteTradePlanAssembly } = await import(
      "./trade-plan-assembly.service"
    );
    return getSpyZeroDteTradePlanAssembly();
  },
  getLastResortAssembly: async () => {
    const { getLastResortSpyZeroDteTradePlanAssembly } = await import(
      "./trade-plan-assembly.service"
    );
    return getLastResortSpyZeroDteTradePlanAssembly();
  },
  now: Date.now,
  captureDecisionCycle: async (assembly) => {
    const { captureDeterministicDecisionCycle } = await import(
      "./decision-cycle-audit.service"
    );
    await captureDeterministicDecisionCycle(assembly);
  },
};

export async function getSpyZeroDteTradePlanAlertCandidateWithDependencies(
  dependencies: TradePlanAlertCandidateServiceDependencies,
): Promise<SpyZeroDteTradePlanAlertCandidateResponse> {
  try {
    const assembly = await dependencies.getAssembly();
    const candidate = buildSpyZeroDteTradePlanAlertCandidate(
      assembly,
      dependencies.now(),
    );
    if (dependencies.captureDecisionCycle) {
      try {
        await dependencies.captureDecisionCycle(assembly);
      } catch {
        // Audit capture is best-effort and must never block market decisions.
      }
    }
    return candidate;
  } catch {
    return buildSpyZeroDteTradePlanAlertCandidate(
      await dependencies.getLastResortAssembly(),
      dependencies.now(),
    );
  }
}

export function getSpyZeroDteTradePlanAlertCandidate(): Promise<SpyZeroDteTradePlanAlertCandidateResponse> {
  return getSpyZeroDteTradePlanAlertCandidateWithDependencies(defaultDependencies);
}
