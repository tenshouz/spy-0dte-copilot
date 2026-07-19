import type { ScheduledReportExchangeHolidayName } from "@spy-copilot/shared";

export const NYSE_FULL_DAY_CALENDAR_SUPPORTED_YEAR_START = 2026 as const;
export const NYSE_FULL_DAY_CALENDAR_SUPPORTED_YEAR_END = 2028 as const;
export const NYSE_FULL_DAY_CALENDAR_METHOD =
  "NYSE_OFFICIAL_PUBLISHED_FULL_DAY_CLOSURES_2026_2028" as const;

export interface NyseFullDayHolidayEntry {
  marketDate: string;
  holidayName: ScheduledReportExchangeHolidayName;
  observed: boolean;
}

export interface NyseFullDayCalendarEvaluation {
  coverageState: "SUPPORTED" | "UNSUPPORTED";
  holidayState: "HOLIDAY" | "NOT_HOLIDAY" | "UNKNOWN";
  holidayName: ScheduledReportExchangeHolidayName | null;
  holidayObserved: boolean | null;
}

// Source of truth: NYSE Holidays & Trading Hours, published full-day closures for 2026-2028.
// https://www.nyse.com/trade/hours-calendars
const OFFICIAL_FULL_DAY_CLOSURES: readonly NyseFullDayHolidayEntry[] = [
  // 2026
  { marketDate: "2026-01-01", holidayName: "NEW_YEARS_DAY", observed: false },
  {
    marketDate: "2026-01-19",
    holidayName: "MARTIN_LUTHER_KING_JR_DAY",
    observed: false,
  },
  {
    marketDate: "2026-02-16",
    holidayName: "WASHINGTONS_BIRTHDAY",
    observed: false,
  },
  { marketDate: "2026-04-03", holidayName: "GOOD_FRIDAY", observed: false },
  { marketDate: "2026-05-25", holidayName: "MEMORIAL_DAY", observed: false },
  {
    marketDate: "2026-06-19",
    holidayName: "JUNETEENTH_NATIONAL_INDEPENDENCE_DAY",
    observed: false,
  },
  { marketDate: "2026-07-03", holidayName: "INDEPENDENCE_DAY", observed: true },
  { marketDate: "2026-09-07", holidayName: "LABOR_DAY", observed: false },
  { marketDate: "2026-11-26", holidayName: "THANKSGIVING_DAY", observed: false },
  { marketDate: "2026-12-25", holidayName: "CHRISTMAS_DAY", observed: false },

  // 2027
  { marketDate: "2027-01-01", holidayName: "NEW_YEARS_DAY", observed: false },
  {
    marketDate: "2027-01-18",
    holidayName: "MARTIN_LUTHER_KING_JR_DAY",
    observed: false,
  },
  {
    marketDate: "2027-02-15",
    holidayName: "WASHINGTONS_BIRTHDAY",
    observed: false,
  },
  { marketDate: "2027-03-26", holidayName: "GOOD_FRIDAY", observed: false },
  { marketDate: "2027-05-31", holidayName: "MEMORIAL_DAY", observed: false },
  {
    marketDate: "2027-06-18",
    holidayName: "JUNETEENTH_NATIONAL_INDEPENDENCE_DAY",
    observed: true,
  },
  { marketDate: "2027-07-05", holidayName: "INDEPENDENCE_DAY", observed: true },
  { marketDate: "2027-09-06", holidayName: "LABOR_DAY", observed: false },
  { marketDate: "2027-11-25", holidayName: "THANKSGIVING_DAY", observed: false },
  { marketDate: "2027-12-24", holidayName: "CHRISTMAS_DAY", observed: true },

  // 2028. NYSE publishes no New Year's Day closure for 2028 because January 1
  // falls on Saturday and no observed closure is scheduled.
  {
    marketDate: "2028-01-17",
    holidayName: "MARTIN_LUTHER_KING_JR_DAY",
    observed: false,
  },
  {
    marketDate: "2028-02-21",
    holidayName: "WASHINGTONS_BIRTHDAY",
    observed: false,
  },
  { marketDate: "2028-04-14", holidayName: "GOOD_FRIDAY", observed: false },
  { marketDate: "2028-05-29", holidayName: "MEMORIAL_DAY", observed: false },
  {
    marketDate: "2028-06-19",
    holidayName: "JUNETEENTH_NATIONAL_INDEPENDENCE_DAY",
    observed: false,
  },
  { marketDate: "2028-07-04", holidayName: "INDEPENDENCE_DAY", observed: false },
  { marketDate: "2028-09-04", holidayName: "LABOR_DAY", observed: false },
  { marketDate: "2028-11-23", holidayName: "THANKSGIVING_DAY", observed: false },
  { marketDate: "2028-12-25", holidayName: "CHRISTMAS_DAY", observed: false },
] as const;

const HOLIDAY_BY_DATE = new Map(
  OFFICIAL_FULL_DAY_CLOSURES.map((entry) => [entry.marketDate, entry] as const),
);

function calendarYear(marketDate: string): number | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(marketDate);
  if (!match) return null;

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const parsed = new Date(Date.UTC(year, month - 1, day));
  if (
    parsed.getUTCFullYear() !== year ||
    parsed.getUTCMonth() !== month - 1 ||
    parsed.getUTCDate() !== day
  ) {
    return null;
  }
  return year;
}

export function evaluateNyseFullDayCalendar(
  marketDate: string,
): NyseFullDayCalendarEvaluation {
  const year = calendarYear(marketDate);
  if (
    year === null ||
    year < NYSE_FULL_DAY_CALENDAR_SUPPORTED_YEAR_START ||
    year > NYSE_FULL_DAY_CALENDAR_SUPPORTED_YEAR_END
  ) {
    return {
      coverageState: "UNSUPPORTED",
      holidayState: "UNKNOWN",
      holidayName: null,
      holidayObserved: null,
    };
  }

  const holiday = HOLIDAY_BY_DATE.get(marketDate);
  if (!holiday) {
    return {
      coverageState: "SUPPORTED",
      holidayState: "NOT_HOLIDAY",
      holidayName: null,
      holidayObserved: null,
    };
  }

  return {
    coverageState: "SUPPORTED",
    holidayState: "HOLIDAY",
    holidayName: holiday.holidayName,
    holidayObserved: holiday.observed,
  };
}

export function getNyseOfficialFullDayClosures(): readonly NyseFullDayHolidayEntry[] {
  return OFFICIAL_FULL_DAY_CLOSURES;
}
