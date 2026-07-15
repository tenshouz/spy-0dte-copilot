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

let cachedFoundation: CachedFoundationDataset | null = null;
let inFlight: Promise<SpySessionDataFoundationResponse> | null = null;
let backoffUntilMs = 0;

function clearFoundationCache(): void {
  cachedFoundation = null;
}

function logSessionDataIssue(category: string): void {
  // eslint-disable-next-line no-console
  console.warn(`[session-data] ${category}`);
}

function buildUnavailableResponse(warningCode: CandleWarningCode): SpySessionDataFoundationResponse {
  const nowMs = Date.now();
  const window = buildSessionDataRequestWindow(nowMs);
  return toUnavailableSessionDataFoundationResponse(
    window.startDateMs,
    window.endDateMs,
    nowMs,
    warningCode,
  );
}

function getSafeFoundationFallback(warningCode: CandleWarningCode): SpySessionDataFoundationResponse {
  if (cachedFoundation) {
    return toSpySessionDataFoundationResponse(
      cachedFoundation.dataset,
      cachedFoundation.requestedStartAtMs,
      cachedFoundation.requestedEndAtMs,
      Date.now(),
      warningCode,
    );
  }
  return buildUnavailableResponse(warningCode);
}

async function invalidateAndUnavailable(
  successCode: CandleWarningCode,
): Promise<SpySessionDataFoundationResponse> {
  clearFoundationCache();
  const invalidated = await deleteStoredTokens();
  if (invalidated) return buildUnavailableResponse(successCode);
  logSessionDataIssue("token invalidation failed — stored record may remain");
  return buildUnavailableResponse("DATABASE_ERROR");
}

async function handleAuthError(err: SchwabAuthError): Promise<SpySessionDataFoundationResponse> {
  switch (err.category) {
    case "NOT_CONNECTED":
      clearFoundationCache();
      logSessionDataIssue("auth: not connected");
      return buildUnavailableResponse("NOT_CONNECTED");
    case "CONFIG_MISSING_OR_INVALID":
      logSessionDataIssue("auth: configuration missing or invalid");
      return buildUnavailableResponse("NOT_CONNECTED");
    case "DATABASE_ERROR":
      logSessionDataIssue("auth: database error");
      return buildUnavailableResponse("DATABASE_ERROR");
    case "DECRYPTION_ERROR":
      logSessionDataIssue("auth: token decryption failed — invalidating stored tokens");
      return invalidateAndUnavailable("RECONNECT_REQUIRED");
    case "REFRESH_REJECTED":
      logSessionDataIssue("auth: refresh definitively rejected — invalidating stored tokens");
      return invalidateAndUnavailable("RECONNECT_REQUIRED");
    case "REFRESH_TIMEOUT":
      logSessionDataIssue("auth: refresh timeout (temporary)");
      return getSafeFoundationFallback("TIMEOUT");
    case "REFRESH_NETWORK_ERROR":
      logSessionDataIssue("auth: refresh network error (temporary)");
      return getSafeFoundationFallback("NETWORK_ERROR");
    case "REFRESH_UPSTREAM_ERROR":
      logSessionDataIssue("auth: token endpoint upstream error (temporary)");
      return getSafeFoundationFallback("UPSTREAM_ERROR");
    case "AUTH_UNEXPECTED":
    default:
      logSessionDataIssue("auth: unexpected sanitized failure — returning unavailable (auth unproven)");
      return buildUnavailableResponse("UPSTREAM_ERROR");
  }
}

async function runSessionDataFlow(): Promise<SpySessionDataFoundationResponse> {
  let accessToken: string;
  try {
    accessToken = await getValidAccessToken();
  } catch (err) {
    if (err instanceof SchwabAuthError) return handleAuthError(err);
    logSessionDataIssue("auth: unclassified failure — returning unavailable (auth unproven)");
    return buildUnavailableResponse("UPSTREAM_ERROR");
  }

  if (Date.now() < backoffUntilMs) {
    return getSafeFoundationFallback("RATE_LIMITED");
  }

  if (
    cachedFoundation &&
    Date.now() - cachedFoundation.dataset.fetchedAtMs <= SESSION_DATA_SHORT_CACHE_MS
  ) {
    return toSpySessionDataFoundationResponse(
      cachedFoundation.dataset,
      cachedFoundation.requestedStartAtMs,
      cachedFoundation.requestedEndAtMs,
      Date.now(),
      null,
    );
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
    return getSafeFoundationFallback(isTimeout ? "TIMEOUT" : "NETWORK_ERROR");
  }

  if (res.status === 401) {
    try {
      await refreshTokens();
    } catch (err) {
      if (err instanceof SchwabAuthError) return handleAuthError(err);
      logSessionDataIssue("auth: unclassified refresh failure (temporary)");
      return getSafeFoundationFallback("UPSTREAM_ERROR");
    }

    let retryToken: string;
    try {
      retryToken = await getValidAccessToken();
    } catch (err) {
      if (err instanceof SchwabAuthError) return handleAuthError(err);
      return getSafeFoundationFallback("UPSTREAM_ERROR");
    }

    try {
      res = await fetchSpyPriceHistory(retryToken, request);
    } catch (err) {
      const isTimeout = (err as Error).name === "AbortError";
      logSessionDataIssue(isTimeout ? "retry request timeout (temporary)" : "retry network error (temporary)");
      return getSafeFoundationFallback(isTimeout ? "TIMEOUT" : "NETWORK_ERROR");
    }

    if (res.status === 401) {
      logSessionDataIssue("still 401 after refresh — invalidating stored tokens");
      return invalidateAndUnavailable("AUTH_EXPIRED");
    }
  }

  if (res.status === 403) {
    logSessionDataIssue("403 forbidden from bounded price-history endpoint");
    return getSafeFoundationFallback("FORBIDDEN");
  }

  if (res.status === 429) {
    const nowMs = Date.now();
    backoffUntilMs = nowMs + parseRetryAfterMs(res.headers.get("retry-after"), nowMs);
    logSessionDataIssue("429 rate limited — backing off");
    return getSafeFoundationFallback("RATE_LIMITED");
  }

  if (!res.ok) {
    logSessionDataIssue(`upstream error HTTP ${res.status}`);
    return getSafeFoundationFallback("UPSTREAM_ERROR");
  }

  let json: unknown;
  try {
    json = await res.json();
  } catch {
    logSessionDataIssue("non-JSON bounded price-history response");
    return getSafeFoundationFallback("VALIDATION_FAILED");
  }

  try {
    const normalized = normalizeRawSpyCandles(json, Date.now());
    if (normalized === null) {
      logSessionDataIssue("validated but empty bounded price-history response");
      return getSafeFoundationFallback("EMPTY_RESPONSE");
    }

    cachedFoundation = {
      dataset: normalized,
      requestedStartAtMs: requestWindow.startDateMs,
      requestedEndAtMs: requestWindow.endDateMs,
    };

    return toSpySessionDataFoundationResponse(
      normalized,
      requestWindow.startDateMs,
      requestWindow.endDateMs,
      Date.now(),
      null,
    );
  } catch (err) {
    if (err instanceof z.ZodError) logSessionDataIssue("bounded candle validation failed");
    else logSessionDataIssue("bounded candle normalization failed");
    return getSafeFoundationFallback("VALIDATION_FAILED");
  }
}

export function getLastResortSessionDataFoundation(): SpySessionDataFoundationResponse {
  return buildUnavailableResponse("UPSTREAM_ERROR");
}

export async function getSpySessionDataFoundation(): Promise<SpySessionDataFoundationResponse> {
  if (inFlight) return inFlight;
  inFlight = runSessionDataFlow()
    .catch(() => {
      logSessionDataIssue("unexpected service failure — returning unavailable (auth unproven)");
      return buildUnavailableResponse("UPSTREAM_ERROR");
    })
    .finally(() => {
      inFlight = null;
    });
  return inFlight;
}
