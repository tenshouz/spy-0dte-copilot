import {
  type CandleWarningCode,
  type SpyCandleResponse,
} from "@spy-copilot/shared";
import { z } from "zod";
import { getCandles as getMockCandles } from "./mock-data.service";
import {
  CANDLE_SHORT_CACHE_MS,
  normalizeRawSpyCandles,
  toMockSpyCandleResponse,
  toSpyCandleResponse,
  type CachedCandleDataset,
} from "./schwab-candles.logic";
import { parseRetryAfterMs } from "./schwab-market-data.logic";
import { fetchSpyPriceHistory } from "./schwab-price-history.client";
import {
  buildSessionDataRequestWindow,
  selectLatestDefinedSessionDataset,
} from "./session-data.logic";
import {
  SchwabAuthError,
  deleteStoredTokens,
  getValidAccessToken,
  refreshTokens,
} from "./schwab-auth.service";

/**
 * I/O layer for live SPY 5-minute candles. Mirrors the hardened quote service
 * exactly (auth-first ordering, cache-first temporaries, honest definitive
 * invalidation, response-time freshness) while keeping candle state fully
 * separate from quote state. Reuses the existing typed auth errors, token
 * flow, invalidation, and Retry-After parser — no second auth system.
 *
 * Chart retrieval uses the same explicit bounded Schwab Price History request
 * shape that was proven by the Session Data Foundation milestone. The returned
 * multi-day dataset is normalized once, then narrowed to the latest observed
 * America/New_York date that contains a defined Premarket, RTH, or After-Hours
 * candle. This avoids Schwab's period=1 behavior returning only the prior
 * completed trading day during a new live session, while preserving the existing
 * one-session chart response contract and weekend/holiday fallback behavior.
 */

// ---------------------------------------------------------------------------
// Candle-specific service state — deliberately separate from quote state.
// Never persisted to PostgreSQL; a backend restart clears it.
// ---------------------------------------------------------------------------

let cachedDataset: CachedCandleDataset | null = null;
let inFlight: Promise<SpyCandleResponse> | null = null;
let backoffUntilMs = 0; // candle-specific shared backoff

function clearRealCandleCache(): void {
  cachedDataset = null;
}

/** MOCK fallback from the EXISTING mock candle source — validated before leaving the service. */
function buildMockCandleResponse(warningCode: CandleWarningCode | null): SpyCandleResponse {
  // Existing mock candles use lightweight-charts seconds; the shared contract
  // uses epoch milliseconds — convert at this single point.
  const mockCandles = getMockCandles().map((c) => ({
    timestamp: c.time * 1000,
    open: c.open,
    high: c.high,
    low: c.low,
    close: c.close,
    volume: Math.round(c.volume),
  }));
  return toMockSpyCandleResponse(mockCandles, Date.now(), warningCode);
}

/** Last-resort validated MOCK for the route's catastrophic catch — never the real cache (auth unproven there). */
export function getLastResortMockCandles(): SpyCandleResponse {
  return buildMockCandleResponse("UPSTREAM_ERROR");
}

/** Cache-first fallback for TEMPORARY failures AFTER authentication succeeded — fresh clock at creation time. */
function getSafeCandleFallback(warningCode: CandleWarningCode): SpyCandleResponse {
  if (cachedDataset) return toSpyCandleResponse(cachedDataset, Date.now(), warningCode);
  return buildMockCandleResponse(warningCode);
}

function logCandleIssue(category: string): void {
  // Fixed sanitized categories only — same convention as the quote service.
  // eslint-disable-next-line no-console
  console.warn(`[candles] ${category}`);
}

/** Definitive disconnection: clear cache, attempt invalidation, report honestly. */
async function invalidateAndMock(successCode: CandleWarningCode): Promise<SpyCandleResponse> {
  clearRealCandleCache();
  const invalidated = await deleteStoredTokens();
  if (invalidated) {
    return buildMockCandleResponse(successCode);
  }
  logCandleIssue("token invalidation failed — stored record may remain");
  return buildMockCandleResponse("DATABASE_ERROR");
}

async function handleAuthError(err: SchwabAuthError): Promise<SpyCandleResponse> {
  switch (err.category) {
    case "NOT_CONNECTED":
      logCandleIssue("auth: not connected");
      clearRealCandleCache();
      return buildMockCandleResponse("NOT_CONNECTED");
    case "CONFIG_MISSING_OR_INVALID":
      logCandleIssue("auth: configuration missing or invalid");
      return buildMockCandleResponse("NOT_CONNECTED");
    case "DATABASE_ERROR":
      logCandleIssue("auth: database error");
      return buildMockCandleResponse("DATABASE_ERROR");
    case "DECRYPTION_ERROR":
      logCandleIssue("auth: token decryption failed — invalidating stored tokens");
      return invalidateAndMock("RECONNECT_REQUIRED");
    case "REFRESH_REJECTED":
      logCandleIssue("auth: refresh definitively rejected — invalidating stored tokens");
      return invalidateAndMock("RECONNECT_REQUIRED");
    case "REFRESH_TIMEOUT":
      logCandleIssue("auth: refresh timeout (temporary)");
      return getSafeCandleFallback("TIMEOUT");
    case "REFRESH_NETWORK_ERROR":
      logCandleIssue("auth: refresh network error (temporary)");
      return getSafeCandleFallback("NETWORK_ERROR");
    case "REFRESH_UPSTREAM_ERROR":
      logCandleIssue("auth: token endpoint upstream error (temporary)");
      return getSafeCandleFallback("UPSTREAM_ERROR");
    case "AUTH_UNEXPECTED":
    default:
      logCandleIssue("auth: unexpected sanitized failure (temporary)");
      return getSafeCandleFallback("UPSTREAM_ERROR");
  }
}

function buildChartRequest(nowMs: number) {
  const window = buildSessionDataRequestWindow(nowMs);
  return {
    kind: "chart" as const,
    startDateMs: window.startDateMs,
    endDateMs: window.endDateMs,
  };
}

async function runCandleFlow(): Promise<SpyCandleResponse> {
  // STEP 1 — Authenticate FIRST (identical ordering guarantee to the quote
  // service). Unclassified errors here cannot prove authentication succeeded
  // → validated MOCK, never the real cache.
  let accessToken: string;
  try {
    accessToken = await getValidAccessToken();
  } catch (err) {
    if (err instanceof SchwabAuthError) return handleAuthError(err);
    logCandleIssue("auth: unclassified failure — returning mock (auth unproven)");
    return buildMockCandleResponse("UPSTREAM_ERROR");
  }
  // Authentication positively succeeded from here on.

  // STEP 2 — Respect active candle backoff (fresh clock after async auth).
  if (Date.now() < backoffUntilMs) {
    return getSafeCandleFallback("RATE_LIMITED");
  }

  // STEP 3 — Candle-specific short cache (fresh clock).
  if (cachedDataset && Date.now() - cachedDataset.fetchedAtMs <= CANDLE_SHORT_CACHE_MS) {
    return toSpyCandleResponse(cachedDataset, Date.now(), null);
  }

  // STEP 4 — Request a bounded recent window, then keep only the latest
  // observed defined market-session date for the existing chart contract.
  const request = buildChartRequest(Date.now());
  let res: Response;
  try {
    res = await fetchSpyPriceHistory(accessToken, request);
  } catch (err) {
    const isTimeout = (err as Error).name === "AbortError";
    logCandleIssue(isTimeout ? "candle request timeout" : "candle network error");
    return getSafeCandleFallback(isTimeout ? "TIMEOUT" : "NETWORK_ERROR");
  }

  // 401: one controlled refresh + one retry, then definitive.
  if (res.status === 401) {
    try {
      await refreshTokens();
    } catch (err) {
      if (err instanceof SchwabAuthError) return handleAuthError(err);
      logCandleIssue("auth: unclassified refresh failure (temporary)");
      return getSafeCandleFallback("UPSTREAM_ERROR");
    }

    let retryToken: string;
    try {
      retryToken = await getValidAccessToken();
    } catch (err) {
      if (err instanceof SchwabAuthError) return handleAuthError(err);
      return getSafeCandleFallback("UPSTREAM_ERROR");
    }

    try {
      res = await fetchSpyPriceHistory(retryToken, request);
    } catch (err) {
      // Transport failure DURING the retry is temporary, not definitive.
      const isTimeout = (err as Error).name === "AbortError";
      logCandleIssue(isTimeout ? "retry request timeout (temporary)" : "retry network error (temporary)");
      return getSafeCandleFallback(isTimeout ? "TIMEOUT" : "NETWORK_ERROR");
    }

    if (res.status === 401) {
      logCandleIssue("still 401 after refresh — invalidating stored tokens");
      return invalidateAndMock("AUTH_EXPIRED");
    }
  }

  if (res.status === 403) {
    logCandleIssue("403 forbidden from price-history endpoint");
    return getSafeCandleFallback("FORBIDDEN");
  }

  if (res.status === 429) {
    backoffUntilMs = Date.now() + parseRetryAfterMs(res.headers.get("retry-after"), Date.now());
    logCandleIssue("429 rate limited — backing off");
    return getSafeCandleFallback("RATE_LIMITED");
  }

  if (!res.ok) {
    logCandleIssue(`upstream error HTTP ${res.status}`);
    return getSafeCandleFallback("UPSTREAM_ERROR");
  }

  let json: unknown;
  try {
    json = await res.json();
  } catch {
    logCandleIssue("non-JSON price-history response");
    return getSafeCandleFallback("VALIDATION_FAILED");
  }

  try {
    const normalized = normalizeRawSpyCandles(json, Date.now());
    if (normalized === null) {
      // Structurally valid but EMPTY — conservative policy: retain the prior
      // real dataset under normal freshness rules; MOCK only with no cache.
      logCandleIssue("validated but empty price-history response");
      return getSafeCandleFallback("EMPTY_RESPONSE");
    }
    const selected = selectLatestDefinedSessionDataset(normalized);
    if (selected === null) {
      logCandleIssue("validated price-history response contained no defined-session candles");
      return getSafeCandleFallback("EMPTY_RESPONSE");
    }

    // Replace the retained dataset only after the ENTIRE upstream dataset
    // validated and a latest defined-session date was selected successfully.
    cachedDataset = selected;
    return toSpyCandleResponse(selected, Date.now(), null);
  } catch (err) {
    if (err instanceof z.ZodError) {
      logCandleIssue("candle validation failed");
    } else {
      logCandleIssue("candle normalization failed");
    }
    return getSafeCandleFallback("VALIDATION_FAILED");
  }
}

/**
 * Public entry point with candle-specific in-flight deduplication. Never
 * throws; expected failures are handled inside runCandleFlow. The outermost
 * catch cannot prove authentication succeeded → validated MOCK only.
 */
export async function getSpyCandles(): Promise<SpyCandleResponse> {
  if (inFlight) return inFlight;
  inFlight = runCandleFlow()
    .catch(() => {
      logCandleIssue("unexpected service failure — returning mock (auth unproven)");
      return buildMockCandleResponse("UPSTREAM_ERROR");
    })
    .finally(() => {
      inFlight = null;
    });
  return inFlight;
}
