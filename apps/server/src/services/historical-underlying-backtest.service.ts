import type { SpyCandle } from "@spy-copilot/shared";
import { z } from "zod";
import { normalizeRawSpyCandles } from "./schwab-candles.logic";
import { fetchSpyPriceHistory } from "./schwab-price-history.client";
import {
  SchwabAuthError,
  getValidAccessToken,
  refreshTokens,
} from "./schwab-auth.service";

export const HISTORICAL_UNDERLYING_MAX_RANGE_DAYS = 31;
const LOOKBACK_CALENDAR_DAYS = 10;
const ONE_DAY_MS = 86_400_000;

export type HistoricalUnderlyingFetchFailureCode =
  | "AUTH_REQUIRED"
  | "RANGE_LIMIT_EXCEEDED"
  | "RATE_LIMITED"
  | "FORBIDDEN"
  | "TIMEOUT"
  | "NETWORK_ERROR"
  | "UPSTREAM_ERROR"
  | "VALIDATION_FAILED"
  | "EMPTY_RESPONSE";

export interface HistoricalUnderlyingFetchResult {
  candles: SpyCandle[] | null;
  requestedStartAtMs: number;
  requestedEndAtMs: number;
  failureCode: HistoricalUnderlyingFetchFailureCode | null;
}

export interface HistoricalUnderlyingFetchDependencies {
  getAccessToken: () => Promise<string>;
  refresh: () => Promise<unknown>;
  fetchHistory: typeof fetchSpyPriceHistory;
  now: () => number;
}

function parseMarketDate(marketDate: string): [number, number, number] {
  const [year, month, day] = marketDate.split("-").map(Number);
  if (!year || !month || !day) throw new Error("invalid market date");
  return [year, month, day];
}

/** Convert a New York local date/time to epoch milliseconds without a DST dependency. */
export function newYorkDateTimeToEpochMs(
  marketDate: string,
  hour: number,
  minute: number,
): number {
  const [year, month, day] = parseMarketDate(marketDate);
  const targetAsUtc = Date.UTC(year, month - 1, day, hour, minute, 0, 0);
  const formatter = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/New_York",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  });
  let guess = targetAsUtc;
  for (let attempt = 0; attempt < 4; attempt += 1) {
    const parts = new Map(
      formatter
        .formatToParts(new Date(guess))
        .map((part) => [part.type, part.value]),
    );
    const observedAsUtc = Date.UTC(
      Number(parts.get("year")),
      Number(parts.get("month")) - 1,
      Number(parts.get("day")),
      Number(parts.get("hour")),
      Number(parts.get("minute")),
      Number(parts.get("second")),
      0,
    );
    const difference = targetAsUtc - observedAsUtc;
    guess += difference;
    if (difference === 0) break;
  }
  return guess;
}

export function historicalUnderlyingRequestWindow(
  startMarketDate: string,
  endMarketDate: string,
): { startDateMs: number; endDateMs: number; rangeDays: number } {
  const startMidnightUtc = Date.parse(`${startMarketDate}T00:00:00.000Z`);
  const endMidnightUtc = Date.parse(`${endMarketDate}T00:00:00.000Z`);
  if (!Number.isFinite(startMidnightUtc) || !Number.isFinite(endMidnightUtc)) {
    throw new Error("invalid historical market-date range");
  }
  const rangeDays = Math.floor((endMidnightUtc - startMidnightUtc) / ONE_DAY_MS) + 1;
  return {
    startDateMs:
      newYorkDateTimeToEpochMs(startMarketDate, 0, 0) -
      LOOKBACK_CALENDAR_DAYS * ONE_DAY_MS,
    endDateMs: newYorkDateTimeToEpochMs(endMarketDate, 20, 5),
    rangeDays,
  };
}

function authFailure(error: unknown): HistoricalUnderlyingFetchFailureCode {
  if (error instanceof SchwabAuthError) return "AUTH_REQUIRED";
  return "UPSTREAM_ERROR";
}

async function fetchWithOneRefresh(
  accessToken: string,
  request: { kind: "bounded"; startDateMs: number; endDateMs: number },
  dependencies: HistoricalUnderlyingFetchDependencies,
): Promise<Response> {
  let response = await dependencies.fetchHistory(accessToken, request);
  if (response.status !== 401) return response;
  await dependencies.refresh();
  const retryToken = await dependencies.getAccessToken();
  response = await dependencies.fetchHistory(retryToken, request);
  return response;
}

export async function fetchHistoricalUnderlyingCandlesWithDependencies(
  startMarketDate: string,
  endMarketDate: string,
  dependencies: HistoricalUnderlyingFetchDependencies,
): Promise<HistoricalUnderlyingFetchResult> {
  const window = historicalUnderlyingRequestWindow(
    startMarketDate,
    endMarketDate,
  );
  if (window.rangeDays > HISTORICAL_UNDERLYING_MAX_RANGE_DAYS) {
    return {
      candles: null,
      requestedStartAtMs: window.startDateMs,
      requestedEndAtMs: window.endDateMs,
      failureCode: "RANGE_LIMIT_EXCEEDED",
    };
  }

  let accessToken: string;
  try {
    accessToken = await dependencies.getAccessToken();
  } catch (error) {
    return {
      candles: null,
      requestedStartAtMs: window.startDateMs,
      requestedEndAtMs: window.endDateMs,
      failureCode: authFailure(error),
    };
  }

  let response: Response;
  try {
    response = await fetchWithOneRefresh(
      accessToken,
      {
        kind: "bounded",
        startDateMs: window.startDateMs,
        endDateMs: window.endDateMs,
      },
      dependencies,
    );
  } catch (error) {
    return {
      candles: null,
      requestedStartAtMs: window.startDateMs,
      requestedEndAtMs: window.endDateMs,
      failureCode:
        (error as Error).name === "AbortError" ? "TIMEOUT" : "NETWORK_ERROR",
    };
  }

  if (response.status === 401) {
    return { candles: null, requestedStartAtMs: window.startDateMs, requestedEndAtMs: window.endDateMs, failureCode: "AUTH_REQUIRED" };
  }
  if (response.status === 403) {
    return { candles: null, requestedStartAtMs: window.startDateMs, requestedEndAtMs: window.endDateMs, failureCode: "FORBIDDEN" };
  }
  if (response.status === 429) {
    return { candles: null, requestedStartAtMs: window.startDateMs, requestedEndAtMs: window.endDateMs, failureCode: "RATE_LIMITED" };
  }
  if (!response.ok) {
    return { candles: null, requestedStartAtMs: window.startDateMs, requestedEndAtMs: window.endDateMs, failureCode: "UPSTREAM_ERROR" };
  }

  let payload: unknown;
  try {
    payload = await response.json();
  } catch {
    return { candles: null, requestedStartAtMs: window.startDateMs, requestedEndAtMs: window.endDateMs, failureCode: "VALIDATION_FAILED" };
  }

  try {
    const normalized = normalizeRawSpyCandles(payload, dependencies.now());
    if (normalized === null || normalized.candles.length === 0) {
      return { candles: null, requestedStartAtMs: window.startDateMs, requestedEndAtMs: window.endDateMs, failureCode: "EMPTY_RESPONSE" };
    }
    return {
      candles: normalized.candles,
      requestedStartAtMs: window.startDateMs,
      requestedEndAtMs: window.endDateMs,
      failureCode: null,
    };
  } catch (error) {
    const failureCode = error instanceof z.ZodError ? "VALIDATION_FAILED" : "VALIDATION_FAILED";
    return { candles: null, requestedStartAtMs: window.startDateMs, requestedEndAtMs: window.endDateMs, failureCode };
  }
}

const defaultDependencies: HistoricalUnderlyingFetchDependencies = {
  getAccessToken: getValidAccessToken,
  refresh: refreshTokens,
  fetchHistory: fetchSpyPriceHistory,
  now: Date.now,
};

export function fetchHistoricalUnderlyingCandles(
  startMarketDate: string,
  endMarketDate: string,
): Promise<HistoricalUnderlyingFetchResult> {
  return fetchHistoricalUnderlyingCandlesWithDependencies(
    startMarketDate,
    endMarketDate,
    defaultDependencies,
  );
}
