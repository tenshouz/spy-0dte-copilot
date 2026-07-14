import { SpyQuoteSchema, type QuoteWarningCode, type SpyQuote } from "@spy-copilot/shared";
import { z } from "zod";
import { getLatestSnapshot } from "./mock-data.service";
import {
  QUOTE_SHORT_CACHE_MS,
  parseRetryAfterMs,
  normalizeRawSpyQuote,
  toSpyQuote,
  type CachedQuote,
} from "./schwab-market-data.logic";
import {
  SchwabAuthError,
  deleteStoredTokens,
  getValidAccessToken,
  refreshTokens,
} from "./schwab-auth.service";

/**
 * I/O layer for the live SPY quote: token access, fetch, in-memory cache,
 * in-flight deduplication, rate-limit backoff, and typed-error mapping.
 * All pure logic (validation, normalization, source-state, Retry-After
 * parsing) lives in schwab-market-data.logic.ts.
 *
 * ORDERING GUARANTEE: authentication is established BEFORE any cached real
 * quote can be returned. A cached quote is never served while configuration
 * or the stored-token state is unusable — those conditions return validated
 * MOCK, and definitive disconnection also clears the real-quote cache.
 * Unexpected errors on paths that cannot prove authentication succeeded also
 * return validated MOCK, never the cache.
 *
 * FRESHNESS GUARANTEE: LIVE vs STALE for fallback payloads is always computed
 * from the CURRENT time at the moment the payload is created (asynchronous
 * work like a 10s quote timeout or a 15s refresh timeout can age a cached
 * quote past the threshold mid-flow). fetchedAt itself always remains the
 * original successful retrieval time.
 *
 * Endpoint (Schwab Trader API — Market Data):
 *   GET https://api.schwabapi.com/marketdata/v1/quotes?symbols=SPY&fields=quote
 * If the real response shape ever differs from the validated subset, the
 * result is a labeled degraded state — never mislabeled LIVE.
 */

const SCHWAB_QUOTES_URL = "https://api.schwabapi.com/marketdata/v1/quotes";
const QUOTE_REQUEST_TIMEOUT_MS = 10_000;

// ---------------------------------------------------------------------------
// Service state. A backend restart clears this — acceptable for the milestone.
// Quotes are never persisted to PostgreSQL.
// ---------------------------------------------------------------------------

let cachedQuote: CachedQuote | null = null;
let inFlight: Promise<SpyQuote> | null = null;
let backoffUntilMs = 0; // shared across all callers so polls can't storm Schwab

/** Cleared only on DEFINITIVE disconnection — never on temporary failures. */
function clearRealQuoteCache(): void {
  cachedQuote = null;
}

/** MOCK fallback — validated against the shared contract before it can leave the service. */
function buildMockQuote(warningCode: QuoteWarningCode | null): SpyQuote {
  const snapshot = getLatestSnapshot(); // existing mock source — clearly labeled MOCK
  const now = new Date().toISOString();
  return SpyQuoteSchema.parse({
    symbol: "SPY",
    lastPrice: snapshot.spotPrice,
    bidPrice: null,
    askPrice: null,
    volume: Math.round(snapshot.volume),
    quoteTimestamp: now, // acceptable for MOCK only; real quotes never substitute time
    fetchedAt: now,
    marketStatus: "UNKNOWN",
    sourceState: "MOCK",
    dataAgeMs: 0,
    warningCode,
  });
}

/**
 * Last-resort validated MOCK for the route's catastrophic catch. Deliberately
 * does NOT consult the real-quote cache: in that path authentication cannot
 * be confirmed, and a cached real quote must never be returned unauthenticated.
 */
export function getLastResortMockQuote(): SpyQuote {
  return buildMockQuote("UPSTREAM_ERROR");
}

/**
 * Cache-first fallback for TEMPORARY failures occurring AFTER authentication
 * was established in the current flow: prefer the last validated real quote
 * (LIVE/STALE judged from the CURRENT clock at creation time); mock only when
 * no real cache exists.
 */
function getSafeFallbackQuote(warningCode: QuoteWarningCode): SpyQuote {
  if (cachedQuote) return toSpyQuote(cachedQuote, Date.now(), warningCode);
  return buildMockQuote(warningCode);
}

function logQuoteIssue(category: string): void {
  // Fixed sanitized categories only — never tokens, headers, request bodies,
  // raw upstream bodies, or arbitrary Error.message values.
  // eslint-disable-next-line no-console
  console.warn(`[quote] ${category}`);
}

/**
 * Definitive disconnection: clear the cache, ATTEMPT stored-token
 * invalidation, and report honestly — the "reconnect" warning is only used
 * when the deletion actually succeeded; a failed deletion returns
 * DATABASE_ERROR instead, because Settings will still (misleadingly) show
 * Connected until the row is really gone.
 */
async function invalidateAndMock(successCode: QuoteWarningCode): Promise<SpyQuote> {
  clearRealQuoteCache();
  const invalidated = await deleteStoredTokens();
  if (invalidated) {
    return buildMockQuote(successCode);
  }
  logQuoteIssue("token invalidation failed — stored record may remain");
  return buildMockQuote("DATABASE_ERROR");
}

/**
 * Maps a typed auth failure to the correct quote behavior. Temporary failures
 * prefer the cache; disconnection/unusable-state conditions return validated
 * MOCK, with the real cache cleared and stored tokens invalidated where the
 * failure is definitive.
 */
async function handleAuthError(err: SchwabAuthError): Promise<SpyQuote> {
  switch (err.category) {
    case "NOT_CONNECTED":
      // No stored tokens — any cached real quote no longer has a live basis.
      logQuoteIssue("auth: not connected");
      clearRealQuoteCache();
      return buildMockQuote("NOT_CONNECTED");
    case "CONFIG_MISSING_OR_INVALID":
      logQuoteIssue("auth: configuration missing or invalid");
      return buildMockQuote("NOT_CONNECTED");
    case "DATABASE_ERROR":
      logQuoteIssue("auth: database error");
      return buildMockQuote("DATABASE_ERROR");
    case "DECRYPTION_ERROR":
      // Stored tokens are unusable: invalidate so Settings reports
      // not_connected instead of a misleading CONNECTED and every poll
      // doesn't repeat the same failure.
      logQuoteIssue("auth: token decryption failed — invalidating stored tokens");
      return invalidateAndMock("RECONNECT_REQUIRED");
    case "REFRESH_REJECTED":
      // Definitive rejection of the grant.
      logQuoteIssue("auth: refresh definitively rejected — invalidating stored tokens");
      return invalidateAndMock("RECONNECT_REQUIRED");
    case "REFRESH_TIMEOUT":
      logQuoteIssue("auth: refresh timeout (temporary)");
      return getSafeFallbackQuote("TIMEOUT");
    case "REFRESH_NETWORK_ERROR":
      logQuoteIssue("auth: refresh network error (temporary)");
      return getSafeFallbackQuote("NETWORK_ERROR");
    case "REFRESH_UPSTREAM_ERROR":
      logQuoteIssue("auth: token endpoint upstream error (temporary)");
      return getSafeFallbackQuote("UPSTREAM_ERROR");
    case "AUTH_UNEXPECTED":
    default:
      logQuoteIssue("auth: unexpected sanitized failure (temporary)");
      return getSafeFallbackQuote("UPSTREAM_ERROR");
  }
}

async function fetchFromSchwab(accessToken: string): Promise<Response> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), QUOTE_REQUEST_TIMEOUT_MS);
  try {
    return await fetch(`${SCHWAB_QUOTES_URL}?symbols=SPY&fields=quote`, {
      headers: { Authorization: `Bearer ${accessToken}`, Accept: "application/json" },
      signal: controller.signal,
    });
  } finally {
    clearTimeout(timeout);
  }
}

async function runQuoteFlow(): Promise<SpyQuote> {
  // STEP 1 — Authenticate FIRST. Configuration validity and a usable stored
  // connection are confirmed through the existing getValidAccessToken() flow
  // before any cached real quote or backoff short-circuit can be reached.
  // Temporary refresh failures inside this call still fall back cache-first
  // via handleAuthError (auth was previously established for that cache to
  // exist); disconnection states return MOCK. An UNCLASSIFIED error here
  // cannot prove authentication succeeded, so it returns validated MOCK —
  // never the cache.
  let accessToken: string;
  try {
    accessToken = await getValidAccessToken();
  } catch (err) {
    if (err instanceof SchwabAuthError) return handleAuthError(err);
    logQuoteIssue("auth: unclassified failure — returning mock (auth unproven)");
    return buildMockQuote("UPSTREAM_ERROR");
  }
  // Authentication has positively succeeded from here on: cache-first
  // temporary fallbacks are permitted below this line.

  // STEP 2 — Respect an active rate-limit backoff without calling the quote
  // endpoint. Fresh clock: authentication above was asynchronous.
  if (Date.now() < backoffUntilMs) {
    return getSafeFallbackQuote("RATE_LIMITED");
  }

  // STEP 3 — Brief cache reuse to suppress duplicate upstream requests.
  // Fresh clock for the age check, for the same reason.
  if (cachedQuote && Date.now() - cachedQuote.fetchedAtMs <= QUOTE_SHORT_CACHE_MS) {
    return toSpyQuote(cachedQuote, Date.now(), null);
  }

  // STEP 4 — Request Schwab.
  let res: Response;
  try {
    res = await fetchFromSchwab(accessToken);
  } catch (err) {
    // Fallback freshness uses the clock AFTER the (possibly 10s) timeout.
    const isTimeout = (err as Error).name === "AbortError";
    logQuoteIssue(isTimeout ? "quote request timeout" : "quote network error");
    return getSafeFallbackQuote(isTimeout ? "TIMEOUT" : "NETWORK_ERROR");
  }

  // 401: one controlled refresh + one retry, then require reconnection.
  if (res.status === 401) {
    try {
      await refreshTokens();
    } catch (err) {
      if (err instanceof SchwabAuthError) return handleAuthError(err);
      logQuoteIssue("auth: unclassified refresh failure (temporary)");
      return getSafeFallbackQuote("UPSTREAM_ERROR");
    }

    let retryToken: string;
    try {
      retryToken = await getValidAccessToken();
    } catch (err) {
      if (err instanceof SchwabAuthError) return handleAuthError(err);
      return getSafeFallbackQuote("UPSTREAM_ERROR");
    }

    try {
      res = await fetchFromSchwab(retryToken);
    } catch (err) {
      // A transport failure DURING the retry is temporary — it says nothing
      // definitive about authentication.
      const isTimeout = (err as Error).name === "AbortError";
      logQuoteIssue(isTimeout ? "retry request timeout (temporary)" : "retry network error (temporary)");
      return getSafeFallbackQuote(isTimeout ? "TIMEOUT" : "NETWORK_ERROR");
    }

    if (res.status === 401) {
      // Still unauthorized after exactly one refresh + one retry: definitive.
      logQuoteIssue("still 401 after refresh — invalidating stored tokens");
      return invalidateAndMock("AUTH_EXPIRED");
    }
  }

  if (res.status === 403) {
    logQuoteIssue("403 forbidden from quote endpoint");
    return getSafeFallbackQuote("FORBIDDEN");
  }

  if (res.status === 429) {
    backoffUntilMs = Date.now() + parseRetryAfterMs(res.headers.get("retry-after"), Date.now());
    logQuoteIssue("429 rate limited — backing off");
    return getSafeFallbackQuote("RATE_LIMITED");
  }

  if (!res.ok) {
    logQuoteIssue(`upstream error HTTP ${res.status}`);
    return getSafeFallbackQuote("UPSTREAM_ERROR");
  }

  let json: unknown;
  try {
    json = await res.json();
  } catch {
    logQuoteIssue("non-JSON quote response");
    return getSafeFallbackQuote("VALIDATION_FAILED");
  }

  try {
    const normalized = normalizeRawSpyQuote(json, Date.now());
    cachedQuote = normalized;
    return toSpyQuote(normalized, Date.now(), null); // re-validated against SpyQuoteSchema inside
  } catch (err) {
    if (err instanceof z.ZodError) {
      logQuoteIssue("quote validation failed");
    } else {
      logQuoteIssue("quote normalization failed");
    }
    return getSafeFallbackQuote("VALIDATION_FAILED");
  }
}

/**
 * Public entry point. In-flight deduplication: concurrent callers await the
 * same request. Never throws. All EXPECTED failures (including cache-first
 * temporary fallbacks after authentication) are handled inside runQuoteFlow;
 * this outermost catch is catastrophic-only and cannot prove authentication
 * succeeded, so it returns validated MOCK — never a cached real quote.
 */
export async function getSpyQuote(): Promise<SpyQuote> {
  if (inFlight) return inFlight;
  inFlight = runQuoteFlow()
    .catch(() => {
      logQuoteIssue("unexpected service failure — returning mock (auth unproven)");
      return buildMockQuote("UPSTREAM_ERROR");
    })
    .finally(() => {
      inFlight = null;
    });
  return inFlight;
}
