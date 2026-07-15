import {
  type CandleWarningCode,
  type SpySessionDataFoundationResponse,
} from "@spy-copilot/shared";
import { z } from "zod";
import { normalizeRawSpyCandles, type CachedCandleDataset } from "./schwab-candles.logic";
import { parseRetryAfterMs } from "./schwab-market-data.logic";
import { fetchSpyPriceHistory } from "./schwab-price-history.client";
import {
  SchwabAuthError,
  deleteStoredTokens,
  getValidAccessToken,
  refreshTokens,
} from "./schwab-auth.service";
import {
  SESSION_DATA_SHORT_CACHE_MS,
  buildSessionDataRequestWindow,
  toSpySessionDataFoundationResponse,
  toUnavailableSessionDataFoundationResponse,
} from "./session-data.logic";

interface CachedFoundationDataset {
  dataset: CachedCandleDataset;
  requestedStartAtMs: number;
  requestedEndAtMs: number;
}

/**
 * Shared internal result for consumers that need the actual bounded normalized
 * SPY candle dataset. Session Data Foundation and Session Levels both use this
 * accessor, so one cache and one in-flight request own the identical upstream
 * Schwab request.
 */
export interface SpyBoundedCandleAccessResult {
  dataset: CachedCandleDataset | null;
  requestedStartAtMs: number;
  requestedEndAtMs: number;
  warningCode: CandleWarningCode | null;
}

let cachedFoundation: CachedFoundationDataset | null = null;
let boundedInFlight: Promise<SpyBoundedCandleAccessResult> | null = null;
let backoffUntilMs = 0;

function clearFoundationCache(): void {
  cachedFoundation = null;
}

function logSessionDataIssue(category: string): void {
  // eslint-disable-next-line no-console
  console.warn(`[session-data] ${category}`);
}

function buildUnavailableAccess(warningCode: CandleWarningCode): SpyBoundedCandleAccessResult {
  const nowMs = Date.now();
  const window = buildSessionDataRequestWindow(nowMs);
  return {
    dataset: null,
    requestedStartAtMs: window.startDateMs,
    requestedEndAtMs: window.endDateMs,
    warningCode,
  };
}

function getSafeFoundationAccessFallback(
  warningCode: CandleWarningCode,
): SpyBoundedCandleAccessResult {
  if (cachedFoundation) {
    return {
      dataset: cachedFoundation.dataset,
      requestedStartAtMs: cachedFoundation.requestedStartAtMs,
      requestedEndAtMs: cachedFoundation.requestedEndAtMs,
      warningCode,
    };
  }
  return buildUnavailableAccess(warningCode);
}

async function invalidateAndUnavailableAccess(
  successCode: CandleWarningCode,
): Promise<SpyBoundedCandleAccessResult> {
  clearFoundationCache();
  const invalidated = await deleteStoredTokens();
  if (invalidated) return buildUnavailableAccess(successCode);
  logSessionDataIssue("token invalidation failed — stored record may remain");
  return buildUnavailableAccess("DATABASE_ERROR");
}

async function handleAuthError(err: SchwabAuthError): Promise<SpyBoundedCandleAccessResult> {
  switch (err.category) {
    case "NOT_CONNECTED":
      clearFoundationCache();
      logSessionDataIssue("auth: not connected");
      return buildUnavailableAccess("NOT_CONNECTED");
    case "CONFIG_MISSING_OR_INVALID":
      logSessionDataIssue("auth: configuration missing or invalid");
      return buildUnavailableAccess("NOT_CONNECTED");
    case "DATABASE_ERROR":
      logSessionDataIssue("auth: database error");
      return buildUnavailableAccess("DATABASE_ERROR");
    case "DECRYPTION_ERROR":
      logSessionDataIssue("auth: token decryption failed — invalidating stored tokens");
      return invalidateAndUnavailableAccess("RECONNECT_REQUIRED");
    case "REFRESH_REJECTED":
      logSessionDataIssue("auth: refresh definitively rejected — invalidating stored tokens");
      return invalidateAndUnavailableAccess("RECONNECT_REQUIRED");
    case "REFRESH_TIMEOUT":
      logSessionDataIssue("auth: refresh timeout (temporary)");
      return getSafeFoundationAccessFallback("TIMEOUT");
    case "REFRESH_NETWORK_ERROR":
      logSessionDataIssue("auth: refresh network error (temporary)");
      return getSafeFoundationAccessFallback("NETWORK_ERROR");
    case "REFRESH_UPSTREAM_ERROR":
      logSessionDataIssue("auth: token endpoint upstream error (temporary)");
      return getSafeFoundationAccessFallback("UPSTREAM_ERROR");
    case "AUTH_UNEXPECTED":
    default:
      logSessionDataIssue("auth: unexpected sanitized failure — returning unavailable (auth unproven)");
      return buildUnavailableAccess("UPSTREAM_ERROR");
  }
}

async function runBoundedCandleFlow(): Promise<SpyBoundedCandleAccessResult> {
  let accessToken: string;
  try {
    accessToken = await getValidAccessToken();
  } catch (err) {
    if (err instanceof SchwabAuthError) return handleAuthError(err);
    logSessionDataIssue("auth: unclassified failure — returning unavailable (auth unproven)");
    return buildUnavailableAccess("UPSTREAM_ERROR");
  }

  if (Date.now() < backoffUntilMs) {
    return getSafeFoundationAccessFallback("RATE_LIMITED");
  }

  if (
    cachedFoundation &&
    Date.now() - cachedFoundation.dataset.fetchedAtMs <= SESSION_DATA_SHORT_CACHE_MS
  ) {
    return {
      dataset: cachedFoundation.dataset,
      requestedStartAtMs: cachedFoundation.requestedStartAtMs,
      requestedEndAtMs: cachedFoundation.requestedEndAtMs,
      warningCode: null,
    };
  }

  const requestedAtMs = Date.now();
  const requestWindow = buildSessionDataRequestWindow(requestedAtMs);
  const request = {
    kind: "bounded" as const,
    startDateMs: requestWindow.startDateMs,
    endDateMs: requestWindow.endDateMs,
  };

  let res: Response;
  try {
    res = await fetchSpyPriceHistory(accessToken, request);
  } catch (err) {
    const isTimeout = (err as Error).name === "AbortError";
    logSessionDataIssue(isTimeout ? "bounded request timeout" : "bounded request network error");
    return getSafeFoundationAccessFallback(isTimeout ? "TIMEOUT" : "NETWORK_ERROR");
  }

  if (res.status === 401) {
    try {
      await refreshTokens();
    } catch (err) {
      if (err instanceof SchwabAuthError) return handleAuthError(err);
      logSessionDataIssue("auth: unclassified refresh failure (temporary)");
      return getSafeFoundationAccessFallback("UPSTREAM_ERROR");
    }

    let retryToken: string;
    try {
      retryToken = await getValidAccessToken();
    } catch (err) {
      if (err instanceof SchwabAuthError) return handleAuthError(err);
      return getSafeFoundationAccessFallback("UPSTREAM_ERROR");
    }

    try {
      res = await fetchSpyPriceHistory(retryToken, request);
    } catch (err) {
      const isTimeout = (err as Error).name === "AbortError";
      logSessionDataIssue(isTimeout ? "retry request timeout (temporary)" : "retry network error (temporary)");
      return getSafeFoundationAccessFallback(isTimeout ? "TIMEOUT" : "NETWORK_ERROR");
    }

    if (res.status === 401) {
      logSessionDataIssue("still 401 after refresh — invalidating stored tokens");
      return invalidateAndUnavailableAccess("AUTH_EXPIRED");
    }
  }

  if (res.status === 403) {
    logSessionDataIssue("403 forbidden from bounded price-history endpoint");
    return getSafeFoundationAccessFallback("FORBIDDEN");
  }

  if (res.status === 429) {
    const nowMs = Date.now();
    backoffUntilMs = nowMs + parseRetryAfterMs(res.headers.get("retry-after"), nowMs);
    logSessionDataIssue("429 rate limited — backing off");
    return getSafeFoundationAccessFallback("RATE_LIMITED");
  }

  if (!res.ok) {
    logSessionDataIssue(`upstream error HTTP ${res.status}`);
    return getSafeFoundationAccessFallback("UPSTREAM_ERROR");
  }

  let json: unknown;
  try {
    json = await res.json();
  } catch {
    logSessionDataIssue("non-JSON bounded price-history response");
    return getSafeFoundationAccessFallback("VALIDATION_FAILED");
  }

  try {
    const normalized = normalizeRawSpyCandles(json, Date.now());
    if (normalized === null) {
      logSessionDataIssue("validated but empty bounded price-history response");
      return getSafeFoundationAccessFallback("EMPTY_RESPONSE");
    }

    cachedFoundation = {
      dataset: normalized,
      requestedStartAtMs: requestWindow.startDateMs,
      requestedEndAtMs: requestWindow.endDateMs,
    };

    return {
      dataset: normalized,
      requestedStartAtMs: requestWindow.startDateMs,
      requestedEndAtMs: requestWindow.endDateMs,
      warningCode: null,
    };
  } catch (err) {
    if (err instanceof z.ZodError) logSessionDataIssue("bounded candle validation failed");
    else logSessionDataIssue("bounded candle normalization failed");
    return getSafeFoundationAccessFallback("VALIDATION_FAILED");
  }
}

/**
 * Shared bounded normalized SPY candle accessor. This is intentionally backend-
 * internal domain data, not an HTTP response contract.
 */
export async function getSpyBoundedCandleAccess(): Promise<SpyBoundedCandleAccessResult> {
  if (boundedInFlight) return boundedInFlight;
  boundedInFlight = runBoundedCandleFlow()
    .catch(() => {
      logSessionDataIssue("unexpected service failure — returning unavailable (auth unproven)");
      return buildUnavailableAccess("UPSTREAM_ERROR");
    })
    .finally(() => {
      boundedInFlight = null;
    });
  return boundedInFlight;
}

export function getLastResortSessionDataFoundation(): SpySessionDataFoundationResponse {
  const nowMs = Date.now();
  const window = buildSessionDataRequestWindow(nowMs);
  return toUnavailableSessionDataFoundationResponse(
    window.startDateMs,
    window.endDateMs,
    nowMs,
    "UPSTREAM_ERROR",
  );
}

export async function getSpySessionDataFoundation(): Promise<SpySessionDataFoundationResponse> {
  const access = await getSpyBoundedCandleAccess();
  const nowMs = Date.now();
  if (access.dataset) {
    return toSpySessionDataFoundationResponse(
      access.dataset,
      access.requestedStartAtMs,
      access.requestedEndAtMs,
      nowMs,
      access.warningCode,
    );
  }
  return toUnavailableSessionDataFoundationResponse(
    access.requestedStartAtMs,
    access.requestedEndAtMs,
    nowMs,
    access.warningCode ?? "UPSTREAM_ERROR",
  );
}
