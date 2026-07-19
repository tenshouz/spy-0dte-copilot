import type {
  DeterministicScheduledReportRequest,
  SpyZeroDteDeterministicScheduledReportResponse,
  SpyZeroDteTradePlanAssemblyResponse,
} from "@spy-copilot/shared";
import { buildSpyZeroDteDeterministicScheduledReport } from "./deterministic-scheduled-report.logic";
import {
  getLastResortSpyZeroDteTradePlanAssembly,
  getSpyZeroDteTradePlanAssembly,
} from "./trade-plan-assembly.service";

export interface DeterministicScheduledReportServiceDependencies {
  getAssembly: () => Promise<SpyZeroDteTradePlanAssemblyResponse>;
  getLastResortAssembly: () => SpyZeroDteTradePlanAssemblyResponse;
  now: () => number;
}

const defaultDependencies: DeterministicScheduledReportServiceDependencies = {
  getAssembly: getSpyZeroDteTradePlanAssembly,
  getLastResortAssembly: getLastResortSpyZeroDteTradePlanAssembly,
  now: Date.now,
};

export async function getSpyZeroDteDeterministicScheduledReportWithDependencies(
  request: DeterministicScheduledReportRequest,
  dependencies: DeterministicScheduledReportServiceDependencies,
): Promise<SpyZeroDteDeterministicScheduledReportResponse> {
  try {
    const assembly = await dependencies.getAssembly();
    return buildSpyZeroDteDeterministicScheduledReport(
      request,
      assembly,
      dependencies.now(),
    );
  } catch {
    return buildSpyZeroDteDeterministicScheduledReport(
      request,
      dependencies.getLastResortAssembly(),
      dependencies.now(),
    );
  }
}

export function getSpyZeroDteDeterministicScheduledReport(
  request: DeterministicScheduledReportRequest,
): Promise<SpyZeroDteDeterministicScheduledReportResponse> {
  return getSpyZeroDteDeterministicScheduledReportWithDependencies(
    request,
    defaultDependencies,
  );
}
