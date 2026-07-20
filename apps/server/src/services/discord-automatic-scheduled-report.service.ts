import {
  SpyZeroDteScheduledReportScheduleEvaluationResponseSchema,
  type DiscordAutomaticScheduledReportDeliveryRequest,
  type DiscordAutomaticScheduledReportDeliveryResponse,
  type DiscordScheduledReportDeliveryResponse,
  type SpyZeroDteScheduledReportScheduleEvaluationResponse,
} from "@spy-copilot/shared";
import {
  automaticScheduledReportDeliveryKey,
  buildDiscordAutomaticScheduledReportDeliveryResponse,
  createDiscordAutomaticScheduledReportProcessState,
  isAmbiguousScheduledReportProviderOutcome,
  mapAutomaticScheduledReportReason,
  type DiscordAutomaticScheduledReportProcessState,
} from "./discord-automatic-scheduled-report.logic";
import { sendDiscordScheduledReport } from "./discord-scheduled-report.service";
import { getSpyZeroDteScheduledReportSchedule } from "./scheduled-report-schedule.service";

export interface DiscordAutomaticScheduledReportDeliveryDependencies {
  getSchedule: () => unknown;
  send: (request: {
    reportType: NonNullable<
      SpyZeroDteScheduledReportScheduleEvaluationResponse["dueReportType"]
    >;
  }) => Promise<DiscordScheduledReportDeliveryResponse>;
  now: () => number;
  state: DiscordAutomaticScheduledReportProcessState;
}

const defaultState = createDiscordAutomaticScheduledReportProcessState();
const defaultDependencies: DiscordAutomaticScheduledReportDeliveryDependencies = {
  getSchedule: getSpyZeroDteScheduledReportSchedule,
  send: sendDiscordScheduledReport,
  now: Date.now,
  state: defaultState,
};

function resetForMarketDate(
  state: DiscordAutomaticScheduledReportProcessState,
  marketDate: string,
): { before: string | null; reset: boolean; mutated: boolean } {
  const before = state.marketDate;
  if (before === marketDate) {
    return { before, reset: false, mutated: false };
  }
  const reset = before !== null;
  state.marketDate = marketDate;
  state.deliveredKeys.clear();
  state.ambiguousKeys.clear();
  return { before, reset, mutated: true };
}

export async function runDiscordAutomaticScheduledReportDeliveryWithDependencies(
  request: DiscordAutomaticScheduledReportDeliveryRequest,
  dependencies: DiscordAutomaticScheduledReportDeliveryDependencies,
): Promise<DiscordAutomaticScheduledReportDeliveryResponse> {
  const evaluatedAtMs = dependencies.now();

  const parsedSchedule =
    SpyZeroDteScheduledReportScheduleEvaluationResponseSchema.safeParse(
      dependencies.getSchedule(),
    );
  if (!parsedSchedule.success) {
    return buildDiscordAutomaticScheduledReportDeliveryResponse({
      request,
      evaluatedAtMs,
      reasonCode: "SCHEDULE_UNAVAILABLE",
      scheduleEvaluation: null,
      deliveryKey: null,
      marketDateBefore: dependencies.state.marketDate,
      marketDateAfter: dependencies.state.marketDate,
      marketDateReset: false,
      mutationApplied: false,
      deliveredKeyCommitted: false,
      ambiguousKeyCommitted: false,
    });
  }

  const schedule = parsedSchedule.data;
  const dateState = resetForMarketDate(dependencies.state, schedule.easternDate);
  let mutationApplied = dateState.mutated;

  if (schedule.scheduleState === "UNAVAILABLE") {
    return buildDiscordAutomaticScheduledReportDeliveryResponse({
      request,
      evaluatedAtMs,
      reasonCode: "SCHEDULE_UNAVAILABLE",
      scheduleEvaluation: schedule,
      deliveryKey: null,
      marketDateBefore: dateState.before,
      marketDateAfter: dependencies.state.marketDate,
      marketDateReset: dateState.reset,
      mutationApplied,
      deliveredKeyCommitted: false,
      ambiguousKeyCommitted: false,
    });
  }

  const deliveryKey = automaticScheduledReportDeliveryKey(schedule);
  if (deliveryKey === null || schedule.dueReportType === null) {
    return buildDiscordAutomaticScheduledReportDeliveryResponse({
      request,
      evaluatedAtMs,
      reasonCode: "NO_REPORT_DUE",
      scheduleEvaluation: schedule,
      deliveryKey: null,
      marketDateBefore: dateState.before,
      marketDateAfter: dependencies.state.marketDate,
      marketDateReset: dateState.reset,
      mutationApplied,
      deliveredKeyCommitted: false,
      ambiguousKeyCommitted: false,
    });
  }

  if (dependencies.state.deliveredKeys.has(deliveryKey)) {
    return buildDiscordAutomaticScheduledReportDeliveryResponse({
      request,
      evaluatedAtMs,
      reasonCode: "DUPLICATE_REPORT_SUPPRESSED",
      scheduleEvaluation: schedule,
      deliveryKey,
      marketDateBefore: dateState.before,
      marketDateAfter: dependencies.state.marketDate,
      marketDateReset: dateState.reset,
      mutationApplied,
      deliveredKeyCommitted: false,
      ambiguousKeyCommitted: false,
    });
  }

  if (dependencies.state.ambiguousKeys.has(deliveryKey)) {
    return buildDiscordAutomaticScheduledReportDeliveryResponse({
      request,
      evaluatedAtMs,
      reasonCode: "AMBIGUOUS_PROVIDER_OUTCOME_SUPPRESSED",
      scheduleEvaluation: schedule,
      deliveryKey,
      marketDateBefore: dateState.before,
      marketDateAfter: dependencies.state.marketDate,
      marketDateReset: dateState.reset,
      mutationApplied,
      deliveredKeyCommitted: false,
      ambiguousKeyCommitted: false,
    });
  }

  const delivery = await dependencies.send({
    reportType: schedule.dueReportType,
  });
  let deliveredKeyCommitted = false;
  let ambiguousKeyCommitted = false;

  if (delivery.deliveryState === "DELIVERED") {
    dependencies.state.deliveredKeys.add(deliveryKey);
    mutationApplied = true;
    deliveredKeyCommitted = true;
  } else if (
    delivery.providerRequestAttempted &&
    isAmbiguousScheduledReportProviderOutcome(delivery)
  ) {
    dependencies.state.ambiguousKeys.add(deliveryKey);
    mutationApplied = true;
    ambiguousKeyCommitted = true;
  }

  return buildDiscordAutomaticScheduledReportDeliveryResponse({
    request,
    evaluatedAtMs,
    reasonCode: mapAutomaticScheduledReportReason(delivery),
    scheduleEvaluation: schedule,
    deliveryKey,
    delivery,
    marketDateBefore: dateState.before,
    marketDateAfter: dependencies.state.marketDate,
    marketDateReset: dateState.reset,
    mutationApplied,
    deliveredKeyCommitted,
    ambiguousKeyCommitted,
  });
}

export function createSerializedDiscordAutomaticScheduledReportRunner(
  dependencies: DiscordAutomaticScheduledReportDeliveryDependencies,
): (
  request: DiscordAutomaticScheduledReportDeliveryRequest,
) => Promise<DiscordAutomaticScheduledReportDeliveryResponse> {
  let queue: Promise<void> = Promise.resolve();
  return (request) => {
    const result = queue.then(() =>
      runDiscordAutomaticScheduledReportDeliveryWithDependencies(
        request,
        dependencies,
      ),
    );
    queue = result.then(
      () => undefined,
      () => undefined,
    );
    return result;
  };
}

const defaultRunner = createSerializedDiscordAutomaticScheduledReportRunner(
  defaultDependencies,
);

export function runDiscordAutomaticScheduledReportDelivery(
  request: DiscordAutomaticScheduledReportDeliveryRequest,
): Promise<DiscordAutomaticScheduledReportDeliveryResponse> {
  return defaultRunner(request);
}
