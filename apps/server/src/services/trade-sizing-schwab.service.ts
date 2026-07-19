import type {
  SchwabReadOnlyAccountRiskSnapshotResponse,
  SpyZeroDteSchwabAssistedPositionSizingRequest,
  SpyZeroDteSchwabAssistedPositionSizingResponse,
  SpyZeroDteTradePlanAssemblyResponse,
} from "@spy-copilot/shared";
import {
  getLastResortSchwabReadOnlyAccountRiskSnapshot,
  getSchwabReadOnlyAccountRiskSnapshot,
} from "./schwab-account-risk.service";
import {
  getLastResortSpyZeroDteTradePlanAssembly,
  getSpyZeroDteTradePlanAssembly,
} from "./trade-plan-assembly.service";
import {
  buildSpyZeroDteSchwabAssistedPositionSizing,
  getLastResortSpyZeroDteSchwabAssistedPositionSizing,
} from "./trade-sizing-schwab.logic";

export interface SchwabAssistedPositionSizingServiceDependencies {
  getAssembly: () => Promise<SpyZeroDteTradePlanAssemblyResponse>;
  getAccountRiskSnapshot: () => Promise<SchwabReadOnlyAccountRiskSnapshotResponse>;
  now: () => number;
  log: (category: string) => void;
}

const DEFAULT_DEPENDENCIES: SchwabAssistedPositionSizingServiceDependencies = {
  getAssembly: getSpyZeroDteTradePlanAssembly,
  getAccountRiskSnapshot: getSchwabReadOnlyAccountRiskSnapshot,
  now: Date.now,
  log: (category) => {
    // Fixed category only. Never include request values, balances, account
    // identifiers, provider URLs, tokens, or provider response bodies.
    // eslint-disable-next-line no-console
    console.error(`[trade-sizing-schwab] ${category}`);
  },
};

function assemblyRequiresAccountSnapshot(
  assembly: SpyZeroDteTradePlanAssemblyResponse,
): boolean {
  return assembly.engineState === "AVAILABLE" && assembly.planState === "READY";
}

/**
 * Retrieves exactly one Assembly response. The private Schwab account snapshot
 * is requested at most once and only after Assembly is READY and AVAILABLE.
 */
export async function getSpyZeroDteSchwabAssistedPositionSizingWithDependencies(
  request: SpyZeroDteSchwabAssistedPositionSizingRequest,
  deps: SchwabAssistedPositionSizingServiceDependencies,
): Promise<SpyZeroDteSchwabAssistedPositionSizingResponse> {
  let assembly: SpyZeroDteTradePlanAssemblyResponse;
  try {
    assembly = await deps.getAssembly();
  } catch {
    deps.log("assembly unexpected failure");
    assembly = getLastResortSpyZeroDteTradePlanAssembly();
  }

  if (!assemblyRequiresAccountSnapshot(assembly)) {
    return buildSpyZeroDteSchwabAssistedPositionSizing(
      request,
      assembly,
      null,
      deps.now(),
    );
  }

  let snapshot: SchwabReadOnlyAccountRiskSnapshotResponse;
  try {
    snapshot = await deps.getAccountRiskSnapshot();
  } catch {
    deps.log("account snapshot unexpected failure");
    snapshot = getLastResortSchwabReadOnlyAccountRiskSnapshot(deps.now());
  }

  return buildSpyZeroDteSchwabAssistedPositionSizing(
    request,
    assembly,
    snapshot,
    deps.now(),
  );
}

export function getSpyZeroDteSchwabAssistedPositionSizing(
  request: SpyZeroDteSchwabAssistedPositionSizingRequest,
): Promise<SpyZeroDteSchwabAssistedPositionSizingResponse> {
  return getSpyZeroDteSchwabAssistedPositionSizingWithDependencies(
    request,
    DEFAULT_DEPENDENCIES,
  );
}

export function getLastResortSchwabAssistedPositionSizing(
  request: SpyZeroDteSchwabAssistedPositionSizingRequest,
): SpyZeroDteSchwabAssistedPositionSizingResponse {
  return getLastResortSpyZeroDteSchwabAssistedPositionSizing(
    request,
    getLastResortSpyZeroDteTradePlanAssembly(),
    Date.now(),
  );
}
