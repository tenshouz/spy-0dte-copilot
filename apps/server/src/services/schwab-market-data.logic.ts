import {
  QUOTE_FRESHNESS_THRESHOLD_MS,
  SpyQuoteSchema,
  type MarketStatus,
  type QuoteWarningCode,
  type SpyQuote,
} from "@spy-copilot/shared";
import { z } from "zod";

/**
 * PURE quote logic — no I/O, no Prisma, no auth service. This module is the
 * only import surface for schwab-market-data.spec.ts, so tests never
 * initialize infrastructure. Stateful concerns (token access, fetch, cache,
 * dedup, backoff bookkeeping) live in schwab-market-data.service.ts.
 */

// Named constants (config candidates — deliberately not env vars yet):
export { QUOTE_FRESHNESS_THRESHOLD_MS };
export const QUOTE_SHORT_CACHE_MS = 2_000;
export const RATE_LIMIT_DEFAULT_BACKOFF_MS = 60_000;
export const RATE_LIMIT_MAX_BACKOFF_MS = 5 * 60_000;

/** Maximum epoch-ms magnitude representable by a JavaScript Date (ECMA-262). */
const MAX_VALID_EPOCH_MS = 8_640_000_000_000_000;

// ---------------------------------------------------------------------------
// Raw Schwab response validation (external types — kept separate from the
// normalized internal contract in @spy-copilot/shared). Unrelated upstream
// fields pass through unvalidated and unused.
// ---------------------------------------------------------------------------

const RawSchwabQuoteSchema = z
  .object({
    lastPrice: z.number().finite().positive(),
    bidPrice: z.number().finite().nonnegative().optional(),
    askPrice: z.number().finite().nonnegative().optional(),
    totalVolume: z.number().int().nonnegative().optional(),
    // Required epoch milliseconds within the valid JS Date range — validated
    // BEFORE toISOString, and never substituted with the current time.
    quoteTime: z.number().int().positive().max(MAX_VALID_EPOCH_MS),
    securityStatus: z.string().optional(),
  })
  .passthrough();

const RawSchwabQuotesResponseSchema = z
  .object({
    SPY: z.object({ quote: RawSchwabQuoteSchema }).passthrough(),
  })
  .passthrough();

// ---------------------------------------------------------------------------
// Pure helpers
// ---------------------------------------------------------------------------

export function mapSecurityStatus(raw: string | undefined): MarketStatus {
  switch (raw?.toLowerCase()) {
    case "normal":
      return "NORMAL";
    case "halted":
      return "HALTED";
    case "closed":
      return "CLOSED";
    default:
      return "UNKNOWN"; // ambiguous/missing → UNKNOWN, never inferred from the local clock
  }
}

export interface CachedQuote {
  lastPrice: number;
  bidPrice: number | null;
  askPrice: number | null;
  volume: number | null;
  quoteTimestamp: string; // ISO-8601
  marketStatus: MarketStatus;
  fetchedAtMs: number;
}

/**
 * Validates + normalizes a raw Schwab quotes payload. Throws (ZodError) on
 * malformed required data. Optional absent fields become null — never
 * fabricated; a genuine zero is preserved as zero.
 */
export function normalizeRawSpyQuote(rawJson: unknown, fetchedAtMs: number): CachedQuote {
  const parsed = RawSchwabQuotesResponseSchema.parse(rawJson);
  const q = parsed.SPY.quote;
  return {
    lastPrice: q.lastPrice,
    bidPrice: q.bidPrice ?? null,
    askPrice: q.askPrice ?? null,
    volume: q.totalVolume ?? null,
    quoteTimestamp: new Date(q.quoteTime).toISOString(),
    marketStatus: mapSecurityStatus(q.securityStatus),
    fetchedAtMs,
  };
}

/** LIVE vs STALE from fetchedAt age only — quoteTimestamp is deliberately not used here. */
export function decideCachedState(fetchedAtMs: number, nowMs: number): "LIVE" | "STALE" {
  return nowMs - fetchedAtMs <= QUOTE_FRESHNESS_THRESHOLD_MS ? "LIVE" : "STALE";
}

/**
 * Builds the backend-to-frontend payload from a cached validated quote and
 * re-validates it against the shared contract before it can be returned.
 */
export function toSpyQuote(
  cache: CachedQuote,
  nowMs: number,
  warningCode: QuoteWarningCode | null,
): SpyQuote {
  return SpyQuoteSchema.parse({
    symbol: "SPY",
    lastPrice: cache.lastPrice,
    bidPrice: cache.bidPrice,
    askPrice: cache.askPrice,
    volume: cache.volume,
    quoteTimestamp: cache.quoteTimestamp,
    fetchedAt: new Date(cache.fetchedAtMs).toISOString(),
    marketStatus: cache.marketStatus,
    sourceState: decideCachedState(cache.fetchedAtMs, nowMs),
    dataAgeMs: Math.max(0, nowMs - cache.fetchedAtMs),
    warningCode,
  });
}

/**
 * Parses a Retry-After header per RFC 9110: delta-seconds or an HTTP-date.
 * Delta-seconds are STRICT digits-only (no decimals, signs, or scientific
 * notation). Invalid, zero, or past values fall back to the conservative
 * default; the result is always positive and capped at RATE_LIMIT_MAX_BACKOFF_MS.
 */
export function parseRetryAfterMs(header: string | null, nowMs: number): number {
  if (!header) return RATE_LIMIT_DEFAULT_BACKOFF_MS;

  const trimmed = header.trim();

  // Delta-seconds: digits only. "1.5", "1e2", "+5", "-5", "" all fall through.
  if (/^\d+$/.test(trimmed)) {
    const seconds = Number(trimmed);
    if (seconds <= 0) return RATE_LIMIT_DEFAULT_BACKOFF_MS;
    return Math.min(seconds * 1000, RATE_LIMIT_MAX_BACKOFF_MS);
  }

  const asDateMs = Date.parse(trimmed);
  if (Number.isNaN(asDateMs)) return RATE_LIMIT_DEFAULT_BACKOFF_MS;
  const deltaMs = asDateMs - nowMs;
  if (deltaMs <= 0) return RATE_LIMIT_DEFAULT_BACKOFF_MS;
  return Math.min(deltaMs, RATE_LIMIT_MAX_BACKOFF_MS);
}
