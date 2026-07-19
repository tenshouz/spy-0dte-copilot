import {
  SpyZeroDteScheduledReportScheduleEvaluationResponseSchema,
  type ScheduledReportScheduleEntry,
  type ScheduledReportSchedulePrimaryReasonCode,
  type ScheduledReportScheduleState,
  type SpyZeroDteScheduledReportScheduleEvaluationResponse,
} from "@spy-copilot/shared";
import {
  NYSE_FULL_DAY_CALENDAR_METHOD,
  NYSE_FULL_DAY_CALENDAR_SUPPORTED_YEAR_END,
  NYSE_FULL_DAY_CALENDAR_SUPPORTED_YEAR_START,
  evaluateNyseFullDayCalendar,
  type NyseFullDayCalendarEvaluation,
} from "./nyse-full-day-calendar.logic";

export const SCHEDULED_REPORT_SCHEDULE_EVALUATION_METHODOLOGY_VERSION =
  "SCHEDULE_EVALUATION_V2" as const;
export const SCHEDULED_REPORT_DUE_WINDOW_MINUTES = 5 as const;
export const SCHEDULED_REPORT_TIME_ZONE = "America/New_York" as const;

const SCHEDULE: readonly ScheduledReportScheduleEntry[] = [
  {
    reportType: "PREMARKET_0925",
    scheduleReferenceEasternTime: "09:25",
    dueWindowStartEasternTime: "09:25",
    dueWindowEndEasternTime: "09:30",
  },
  {
    reportType: "OPENING_0935",
    scheduleReferenceEasternTime: "09:35",
    dueWindowStartEasternTime: "09:35",
    dueWindowEndEasternTime: "09:40",
  },
  {
    reportType: "OPENING_0945",
    scheduleReferenceEasternTime: "09:45",
    dueWindowStartEasternTime: "09:45",
    dueWindowEndEasternTime: "09:50",
  },
  {
    reportType: "UPDATE_1000",
    scheduleReferenceEasternTime: "10:00",
    dueWindowStartEasternTime: "10:00",
    dueWindowEndEasternTime: "10:05",
  },
] as const;

const WEEKDAY_MAP: Record<
  string,
  | "MONDAY"
  | "TUESDAY"
  | "WEDNESDAY"
  | "THURSDAY"
  | "FRIDAY"
  | "SATURDAY"
  | "SUNDAY"
> = {
  Mon: "MONDAY",
  Tue: "TUESDAY",
  Wed: "WEDNESDAY",
  Thu: "THURSDAY",
  Fri: "FRIDAY",
  Sat: "SATURDAY",
  Sun: "SUNDAY",
};

function parseTimeMinutes(value: string): number {
  const [hour, minute] = value.split(":").map(Number);
  if (!Number.isInteger(hour) || !Number.isInteger(minute)) {
    throw new Error(`Invalid schedule time: ${value}`);
  }
  return hour * 60 + minute;
}

function easternClock(epochMilliseconds: number): {
  date: string;
  time: string;
  weekday:
    | "MONDAY"
    | "TUESDAY"
    | "WEDNESDAY"
    | "THURSDAY"
    | "FRIDAY"
    | "SATURDAY"
    | "SUNDAY";
  minuteOfDay: number;
} {
  const formatter = new Intl.DateTimeFormat("en-US", {
    timeZone: SCHEDULED_REPORT_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    weekday: "short",
    hourCycle: "h23",
  });
  const parts = Object.fromEntries(
    formatter
      .formatToParts(new Date(epochMilliseconds))
      .filter((part) => part.type !== "literal")
      .map((part) => [part.type, part.value]),
  );
  const year = parts.year;
  const month = parts.month;
  const day = parts.day;
  const hour = Number(parts.hour);
  const minute = Number(parts.minute);
  const second = parts.second;
  const weekday = parts.weekday ? WEEKDAY_MAP[parts.weekday] : undefined;
  if (
    year === undefined ||
    month === undefined ||
    day === undefined ||
    second === undefined ||
    weekday === undefined ||
    !Number.isInteger(hour) ||
    !Number.isInteger(minute)
  ) {
    throw new Error("Eastern clock conversion failed");
  }
  return {
    date: `${year}-${month}-${day}`,
    time: `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}:${second}`,
    weekday,
    minuteOfDay: hour * 60 + minute,
  };
}

function scheduleState(args: {
  weekday: ReturnType<typeof easternClock>["weekday"];
  minuteOfDay: number;
  calendar: NyseFullDayCalendarEvaluation;
}): {
  state: ScheduledReportScheduleState;
  reason: ScheduledReportSchedulePrimaryReasonCode;
  due: ScheduledReportScheduleEntry | null;
  next: ScheduledReportScheduleEntry | null;
} {
  if (["SATURDAY", "SUNDAY"].includes(args.weekday)) {
    return {
      state: "NON_TRADING_DAY",
      reason: "WEEKEND_SUPPRESSED",
      due: null,
      next: null,
    };
  }

  if (args.calendar.coverageState === "UNSUPPORTED") {
    return {
      state: "UNAVAILABLE",
      reason: "EXCHANGE_CALENDAR_UNSUPPORTED",
      due: null,
      next: null,
    };
  }

  if (args.calendar.holidayState === "HOLIDAY") {
    return {
      state: "NON_TRADING_DAY",
      reason: "EXCHANGE_HOLIDAY_SUPPRESSED",
      due: null,
      next: null,
    };
  }

  const due = SCHEDULE.find((entry) => {
    const start = parseTimeMinutes(entry.dueWindowStartEasternTime);
    const end = parseTimeMinutes(entry.dueWindowEndEasternTime);
    return args.minuteOfDay >= start && args.minuteOfDay < end;
  });
  if (due) {
    return {
      state: "DUE",
      reason: "REPORT_WINDOW_ACTIVE",
      due,
      next: due,
    };
  }

  const next = SCHEDULE.find(
    (entry) => args.minuteOfDay < parseTimeMinutes(entry.dueWindowStartEasternTime),
  );
  if (next) {
    return {
      state: "WAITING",
      reason:
        args.minuteOfDay < parseTimeMinutes(SCHEDULE[0]!.dueWindowStartEasternTime)
          ? "BEFORE_FIRST_REPORT"
          : "BETWEEN_REPORT_WINDOWS",
      due: null,
      next,
    };
  }

  return {
    state: "COMPLETE",
    reason: "AFTER_FINAL_REPORT",
    due: null,
    next: null,
  };
}

export function evaluateSpyZeroDteScheduledReportSchedule(
  evaluatedAtMs: number,
): SpyZeroDteScheduledReportScheduleEvaluationResponse {
  const clock = easternClock(evaluatedAtMs);
  const calendar = evaluateNyseFullDayCalendar(clock.date);
  const result = scheduleState({
    weekday: clock.weekday,
    minuteOfDay: clock.minuteOfDay,
    calendar,
  });

  return SpyZeroDteScheduledReportScheduleEvaluationResponseSchema.parse({
    symbol: "SPY",
    product: "SPY_ZERO_DTE_DETERMINISTIC_SCHEDULE_EVALUATION",
    methodologyVersion:
      SCHEDULED_REPORT_SCHEDULE_EVALUATION_METHODOLOGY_VERSION,
    evaluatedAt: new Date(evaluatedAtMs).toISOString(),
    easternDate: clock.date,
    easternTime: clock.time,
    easternWeekday: clock.weekday,
    exchangeCalendarCoverageState: calendar.coverageState,
    exchangeHolidayState: calendar.holidayState,
    exchangeHolidayName: calendar.holidayName,
    exchangeHolidayObserved: calendar.holidayObserved,
    exchangeCalendarSupportedYearStart:
      NYSE_FULL_DAY_CALENDAR_SUPPORTED_YEAR_START,
    exchangeCalendarSupportedYearEnd: NYSE_FULL_DAY_CALENDAR_SUPPORTED_YEAR_END,
    scheduleState: result.state,
    primaryReasonCode: result.reason,
    dueReportType: result.due?.reportType ?? null,
    dueScheduleReferenceEasternTime:
      result.due?.scheduleReferenceEasternTime ?? null,
    dueWindowStartEasternTime:
      result.due?.dueWindowStartEasternTime ?? null,
    dueWindowEndEasternTime: result.due?.dueWindowEndEasternTime ?? null,
    nextReportType: result.next?.reportType ?? null,
    nextScheduleReferenceEasternTime:
      result.next?.scheduleReferenceEasternTime ?? null,
    schedule: SCHEDULE,
    disclosures: {
      currentClockOnly: true,
      easternTimeZoneOnly: true,
      weekdayFilterApplied: true,
      exchangeHolidayCalendarApplied: true,
      officialPublishedCalendarOnly: true,
      noUnscheduledClosureDetection: true,
      noPersistence: true,
      noNotificationDelivery: true,
      noPrivateAccountData: true,
      noOrderExecution: true,
    },
    methodology: {
      timeZone: SCHEDULED_REPORT_TIME_ZONE,
      dueWindowMinutes: SCHEDULED_REPORT_DUE_WINDOW_MINUTES,
      dueWindowMethod: "START_INCLUSIVE_END_EXCLUSIVE",
      tradingDayMethod: "WEEKDAY_AND_NYSE_FULL_DAY_HOLIDAY_CALENDAR",
      holidayCalendarMethod: NYSE_FULL_DAY_CALENDAR_METHOD,
      unsupportedCalendarBehavior: "FAIL_CLOSED_UNAVAILABLE",
      unscheduledClosureMethod: "NONE",
      scheduleSource: "FIXED_SCHEDULED_REPORT_TYPE_TABLE",
      persistenceMethod: "NONE",
      deliveryMethod: "NONE",
      schedulerMethod: "NONE",
    },
  });
}

export function getScheduledReportScheduleEntries(): readonly ScheduledReportScheduleEntry[] {
  return SCHEDULE;
}
