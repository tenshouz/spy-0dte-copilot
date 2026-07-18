import type {
  SpyZeroDtePositionSizingRequest,
  SpyZeroDtePositionSizingResponse,
  SpyZeroDteTradePlanAssemblyResponse,
} from "@spy-copilot/shared";
import {
  getLastResortSpyZeroDteTradePlanAssembly,
  getSpyZeroDteTradePlanAssembly,
} from "./trade-plan-assembly.service";
import { buildSpyZeroDtePositionSizing } from "./trade-sizing.logic";

export interface PositionSizingServiceDependencies {
  getAssembly: () => Promise<SpyZeroDteTradePlanAssemblyResponse>;
  now: () => number;
}

const defaultDependencies: PositionSizingServiceDependencies = {
  getAssembly: getSpyZeroDteTradePlanAssembly,
  now: Date.now,
};

/** Retrieves exactly one validated Assembly response for each validated request. */
export async function getSpyZeroDtePositionSizingWithDependencies(
  request: SpyZeroDtePositionSizingRequest,
  dependencies: PositionSizingServiceDependencies,
): Promise<SpyZeroDtePositionSizingResponse> {
  const assembly = await dependencies.getAssembly();
  return buildSpyZeroDtePositionSizing(request, assembly, dependencies.now());
}

export function getSpyZeroDtePositionSizing(
  request: SpyZeroDtePositionSizingRequest,
): Promise<SpyZeroDtePositionSizingResponse> {
  return getSpyZeroDtePositionSizingWithDependencies(request, defaultDependencies);
}

/** Last-resort fallback never calls Schwab, a public route, or persistence. */
export function getLastResortSpyZeroDtePositionSizing(
  request: SpyZeroDtePositionSizingRequest,
): SpyZeroDtePositionSizingResponse {
  return buildSpyZeroDtePositionSizing(
    request,
    getLastResortSpyZeroDteTradePlanAssembly(),
    Date.now(),
  );
}
