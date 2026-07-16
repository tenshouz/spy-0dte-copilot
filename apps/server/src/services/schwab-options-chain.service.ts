import type {
  OptionsChainWarningCode,
  SpyZeroDteOptionsChainResponse,
} from "@spy-copilot/shared";
import { z } from "zod";
import { parseRetryAfterMs } from "./schwab-market-data.logic";
import {
  SchwabAuthError,
  deleteStoredTokens,
  getValidAccessToken,
  refreshTokens,
} from "./schwab-auth.service";
import { fetchSpyZeroDteOptionsChain } from "./schwab-options-chain.client";
import {
  OPTIONS_CHAIN_SHORT_CACHE_MS,
  buildUnavailableSpyZeroDteOptionsChainResponse,
  isRetainedOptionsChainEligible,
  normalizeRawSpyZeroDteOptionsChain,
  toSpyZeroDteOptionsChainResponse,
  type CachedOptionsChain,
} from "./schwab-options-chain.logic";
import { getObservedMarketDate } from "./session-data.logic";

/**
 * I/O layer for the SPY current-date Options Chain Foundation.
 * OAuth remains backend-only; raw validation and normalization remain pure;
 * no provider objects, tokens, headers, or sensitive errors cross the route.
 */

let cachedChain: CachedOptionsChain | null = null;
let cachedNoExpiration: { marketDate: string; fetchedAtMs: number } | null = null;
let inFlight: Promise<SpyZeroDteOptionsChainResponse> | null = null;
let backoffUntilMs = 0;

function clearOptionsCache(): void {
  cachedChain = null;
  cachedNoExpiration = null;
}

function currentMarketDate(nowMs = Date.now()): string {
  return getObservedMarketDate(nowMs);
}

function logOptionsIssue(category: string): void {
  // Fixed categories only — never token/header/raw-body/error-message logging.
  // eslint-disable-next-line no-console
  console.warn(`[options-chain] ${category}`);
}

function unavailable(
  warningCode: OptionsChainWarningCode,
  nowMs = Date.now(),
  sourceState: "LIVE" | "UNAVAILABLE" = "UNAVAILABLE",
): SpyZeroDteOptionsChainResponse {
  return buildUnavailableSpyZeroDteOptionsChainResponse(
    currentMarketDate(nowMs),
    nowMs,
    warningCode,
    sourceState,
  );
}

function safeTemporaryFallback(
  warningCode: OptionsChainWarningCode,
  nowMs = Date.now(),
): SpyZeroDteOptionsChainResponse {
  const marketDate = currentMarketDate(nowMs);
  if (isRetainedOptionsChainEligible(cachedChain, marketDate, nowMs)) {
    return toSpyZeroDteOptionsChainResponse(cachedChain, nowMs, "RETAINED_STALE_CHAIN");
  }
  return buildUnavailableSpyZeroDteOptionsChainResponse(marketDate, nowMs, warningCode);
}

async function invalidateAndUnavailable(): Promise<SpyZeroDteOptionsChainResponse> {
  clearOptionsCache();
  const invalidated = await deleteStoredTokens();
  return unavailable(invalidated ? "AUTH_REQUIRED" : "DATABASE_ERROR");
}

async function handleAuthError(err: SchwabAuthError): Promise<SpyZeroDteOptionsChainResponse> {
  switch (err.category) {
    case "NOT_CONNECTED":
    case "CONFIG_MISSING_OR_INVALID":
      clearOptionsCache();
      return unavailable("AUTH_REQUIRED");
    case "DATABASE_ERROR":
      return unavailable("DATABASE_ERROR");
    case "DECRYPTION_ERROR":
    case "REFRESH_REJECTED":
      return invalidateAndUnavailable();
    case "REFRESH_TIMEOUT":
      return safeTemporaryFallback("UPSTREAM_TIMEOUT");
    case "REFRESH_NETWORK_ERROR":
      return safeTemporaryFallback("UPSTREAM_NETWORK_ERROR");
    case "REFRESH_UPSTREAM_ERROR":
    case "AUTH_UNEXPECTED":
    default:
      return safeTemporaryFallback("UPSTREAM_UNAVAILABLE");
  }
}

async function requestChain(accessToken: string, expirationDate: string): Promise<Response> {
  return fetchSpyZeroDteOptionsChain(accessToken, { expirationDate });
}

async function runOptionsChainFlow(): Promise<SpyZeroDteOptionsChainResponse> {
  let accessToken: string;
  try {
    accessToken = await getValidAccessToken();
  } catch (err) {
    if (err instanceof SchwabAuthError) return handleAuthError(err);
    logOptionsIssue("auth: unclassified failure");
    return unavailable("UPSTREAM_UNAVAILABLE");
  }

  const authSucceededAtMs = Date.now();
  const marketDate = currentMarketDate(authSucceededAtMs);

  // Date rollover invalidates prior-date 0DTE data immediately.
  if (cachedChain && cachedChain.currentMarketDate !== marketDate) cachedChain = null;
  if (cachedNoExpiration && cachedNoExpiration.marketDate !== marketDate) cachedNoExpiration = null;

  if (authSucceededAtMs < backoffUntilMs) {
    return safeTemporaryFallback("UPSTREAM_RATE_LIMITED", authSucceededAtMs);
  }

  if (
    cachedChain &&
    cachedChain.currentMarketDate === marketDate &&
    authSucceededAtMs - cachedChain.fetchedAtMs <= OPTIONS_CHAIN_SHORT_CACHE_MS
  ) {
    return toSpyZeroDteOptionsChainResponse(cachedChain, authSucceededAtMs);
  }

  if (
    cachedNoExpiration &&
    cachedNoExpiration.marketDate === marketDate &&
    authSucceededAtMs - cachedNoExpiration.fetchedAtMs <= OPTIONS_CHAIN_SHORT_CACHE_MS
  ) {
    return buildUnavailableSpyZeroDteOptionsChainResponse(
      marketDate,
      authSucceededAtMs,
      "NO_CURRENT_DATE_EXPIRATION",
      "LIVE",
      cachedNoExpiration.fetchedAtMs,
    );
  }

  let res: Response;
  try {
    res = await requestChain(accessToken, marketDate);
  } catch (err) {
    const timeout = (err as Error).name === "AbortError";
    logOptionsIssue(timeout ? "request timeout" : "request network error");
    return safeTemporaryFallback(timeout ? "UPSTREAM_TIMEOUT" : "UPSTREAM_NETWORK_ERROR");
  }

  if (res.status === 401) {
    try {
      await refreshTokens();
    } catch (err) {
      if (err instanceof SchwabAuthError) return handleAuthError(err);
      return safeTemporaryFallback("UPSTREAM_UNAVAILABLE");
    }

    let retryToken: string;
    try {
      retryToken = await getValidAccessToken();
    } catch (err) {
      if (err instanceof SchwabAuthError) return handleAuthError(err);
      return safeTemporaryFallback("UPSTREAM_UNAVAILABLE");
    }

    try {
      res = await requestChain(retryToken, marketDate);
    } catch (err) {
      const timeout = (err as Error).name === "AbortError";
      return safeTemporaryFallback(timeout ? "UPSTREAM_TIMEOUT" : "UPSTREAM_NETWORK_ERROR");
    }

    if (res.status === 401) {
      logOptionsIssue("still 401 after one refresh");
      return invalidateAndUnavailable();
    }
  }

  if (res.status === 403) {
    logOptionsIssue("options access unavailable");
    clearOptionsCache();
    return unavailable("OPTIONS_ACCESS_UNAVAILABLE");
  }

  if (res.status === 429) {
    backoffUntilMs = Date.now() + parseRetryAfterMs(res.headers.get("retry-after"), Date.now());
    logOptionsIssue("rate limited");
    return safeTemporaryFallback("UPSTREAM_RATE_LIMITED");
  }

  if (!res.ok) {
    logOptionsIssue(`upstream HTTP ${res.status}`);
    return safeTemporaryFallback("UPSTREAM_UNAVAILABLE");
  }

  let json: unknown;
  try {
    json = await res.json();
  } catch {
    logOptionsIssue("non-JSON response");
    return safeTemporaryFallback("UPSTREAM_SCHEMA_INVALID");
  }

  const fetchedAtMs = Date.now();
  try {
    const normalized = normalizeRawSpyZeroDteOptionsChain(json, marketDate, fetchedAtMs);
    if (!normalized.cache) {
      cachedChain = null;
      if (normalized.kind === "NO_CURRENT_DATE_EXPIRATION") {
        cachedNoExpiration = { marketDate, fetchedAtMs };
        return buildUnavailableSpyZeroDteOptionsChainResponse(
          marketDate,
          fetchedAtMs,
          "NO_CURRENT_DATE_EXPIRATION",
          "LIVE",
        );
      }
      cachedNoExpiration = null;
      return buildUnavailableSpyZeroDteOptionsChainResponse(
        marketDate,
        fetchedAtMs,
        "NO_VALID_CONTRACTS",
        "LIVE",
      );
    }

    cachedNoExpiration = null;
    cachedChain = normalized.cache;
    return toSpyZeroDteOptionsChainResponse(normalized.cache, Date.now());
  } catch (err) {
    logOptionsIssue(err instanceof z.ZodError ? "schema validation failed" : "normalization failed");
    return safeTemporaryFallback("UPSTREAM_SCHEMA_INVALID");
  }
}

export function getLastResortSpyZeroDteOptionsChain(): SpyZeroDteOptionsChainResponse {
  return unavailable("UPSTREAM_UNAVAILABLE");
}

/** Concurrent callers share one complete auth/request/normalization flow. */
export async function getSpyZeroDteOptionsChain(): Promise<SpyZeroDteOptionsChainResponse> {
  if (inFlight) return inFlight;
  inFlight = runOptionsChainFlow()
    .catch(() => {
      logOptionsIssue("unexpected service failure");
      return unavailable("UPSTREAM_UNAVAILABLE");
    })
    .finally(() => {
      inFlight = null;
    });
  return inFlight;
}
