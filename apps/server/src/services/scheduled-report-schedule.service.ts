import type { SpyZeroDteScheduledReportScheduleEvaluationResponse } from "@spy-copilot/shared";
import { evaluateSpyZeroDteScheduledReportSchedule } from "./scheduled-report-schedule.logic";

export interface ScheduledReportScheduleServiceDependencies {
  now: () => number;
}

const defaultDependencies: ScheduledReportScheduleServiceDependencies = {
  now: Date.now,
};

export function getSpyZeroDteScheduledReportScheduleWithDependencies(
  dependencies: ScheduledReportScheduleServiceDependencies,
): SpyZeroDteScheduledReportScheduleEvaluationResponse {
  return evaluateSpyZeroDteScheduledReportSchedule(dependencies.now());
}

export function getSpyZeroDteScheduledReportSchedule(): SpyZeroDteScheduledReportScheduleEvaluationResponse {
  return getSpyZeroDteScheduledReportScheduleWithDependencies(defaultDependencies);
}
