import {
  NYSE_FULL_DAY_CALENDAR_METHOD,
  NYSE_FULL_DAY_CALENDAR_SUPPORTED_YEAR_END,
  NYSE_FULL_DAY_CALENDAR_SUPPORTED_YEAR_START,
  evaluateNyseFullDayCalendar,
} from "./nyse-full-day-calendar.logic";

export const NYSE_SESSION_CALENDAR_METHOD =
  "NYSE_OFFICIAL_PUBLISHED_FULL_DAY_AND_EARLY_CLOSES_2026_2028" as const;
export const NYSE_REGULAR_RTH_CLOSE_MINUTE = 16 * 60;
export const NYSE_EARLY_RTH_CLOSE_MINUTE = 13 * 60;

const OFFICIAL_EARLY_CLOSES = new Set([
  "2026-11-27",
  "2026-12-24",
  "2027-11-26",
  "2028-07-03",
  "2028-11-24",
]);

export type NyseTradingDayState =
  | "TRADING_DAY"
  | "WEEKEND"
  | "HOLIDAY"
  | "UNKNOWN";

export interface NyseTradingSessionEvaluation {
  coverageState: "SUPPORTED" | "UNSUPPORTED";
  tradingDayState: NyseTradingDayState;
  rthCloseMinute: number | null;
  earlyClose: boolean | null;
}

function parseMarketDate(marketDate: string): Date | null {
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
  return parsed;
}

export function evaluateNyseTradingSessionCalendar(
  marketDate: string,
): NyseTradingSessionEvaluation {
  const parsed = parseMarketDate(marketDate);
  const year = parsed?.getUTCFullYear() ?? null;
  if (
    parsed === null ||
    year === null ||
    year < NYSE_FULL_DAY_CALENDAR_SUPPORTED_YEAR_START ||
    year > NYSE_FULL_DAY_CALENDAR_SUPPORTED_YEAR_END
  ) {
    return {
      coverageState: "UNSUPPORTED",
      tradingDayState: "UNKNOWN",
      rthCloseMinute: null,
      earlyClose: null,
    };
  }

  const weekday = parsed.getUTCDay();
  if (weekday === 0 || weekday === 6) {
    return {
      coverageState: "SUPPORTED",
      tradingDayState: "WEEKEND",
      rthCloseMinute: null,
      earlyClose: false,
    };
  }

  const holiday = evaluateNyseFullDayCalendar(marketDate);
  if (holiday.coverageState !== "SUPPORTED") {
    return {
      coverageState: "UNSUPPORTED",
      tradingDayState: "UNKNOWN",
      rthCloseMinute: null,
      earlyClose: null,
    };
  }
  if (holiday.holidayState === "HOLIDAY") {
    return {
      coverageState: "SUPPORTED",
      tradingDayState: "HOLIDAY",
      rthCloseMinute: null,
      earlyClose: false,
    };
  }

  const earlyClose = OFFICIAL_EARLY_CLOSES.has(marketDate);
  return {
    coverageState: "SUPPORTED",
    tradingDayState: "TRADING_DAY",
    rthCloseMinute: earlyClose
      ? NYSE_EARLY_RTH_CLOSE_MINUTE
      : NYSE_REGULAR_RTH_CLOSE_MINUTE,
    earlyClose,
  };
}

export function getNyseOfficialEarlyCloseDates(): readonly string[] {
  return [...OFFICIAL_EARLY_CLOSES].sort();
}

export const NYSE_SESSION_CALENDAR_SOURCE_METHODS = {
  fullDayClosures: NYSE_FULL_DAY_CALENDAR_METHOD,
  sessionCalendar: NYSE_SESSION_CALENDAR_METHOD,
} as const;
