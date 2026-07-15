import {
  CANDLE_FRESHNESS_THRESHOLD_MS,
  SpyCandleResponseSchema,
  SpyCandleSchema,
  type CandleWarningCode,
  type SpyCandle,
  type SpyCandleResponse,
} from "@spy-copilot/shared";
import { z } from "zod";

/**
 * PURE candle logic — no I/O, no Prisma, no auth service. This module is the
 * only import surface for schwab-candles.spec.ts. Stateful concerns (token
 * access, fetch, cache, dedup, backoff) live in schwab-candles.service.ts.
 *
 * Raw subset expected by the current Price History implementation (see the
 * service header for the contract-verification caveat):
 *   { "symbol": "SPY", "empty": false, "candles": [
 *     { "open": n, "high": n, "low": n, "close": n, "volume": n,
 *       "datetime": <provider candle timestamp in epoch MILLISECONDS> } ] }
 * The timestamp is preserved exactly; its candle-boundary semantics are not
 * assumed here. If the provider includes a top-level symbol, it must be SPY.
 * Unknown provider fields are ignored and never leak into the normalized model.
 */

export { CANDLE_FRESHNESS_THRESHOLD_MS };
export const CANDLE_SHORT_CACHE_MS = 15_000;

// ---------------------------------------------------------------------------
// STAGE 1 — raw provider validation (external model, separate from internal).
// ---------------------------------------------------------------------------

const RawSchwabCandleSchema = z
  .object({
    open: z.number(),
    high: z.number(),
    low: z.number(),
    close: z.number(),
    volume: z.number(),
    datetime: z.number(), // epoch ms; domain rules enforced in STAGE 2
  })
  .passthrough();

const RawSchwabPriceHistorySchema = z
  .object({
    // The provider response commonly includes symbol. Keep it optional until
    // the live contract is verified, but reject a positively identified
    // non-SPY payload rather than relabeling it as SPY.
    symbol: z.literal("SPY").optional(),
    candles: z.array(RawSchwabCandleSchema),
  })
  .passthrough();

// ---------------------------------------------------------------------------
// STAGE 2 — normalization + internal domain validation.
// ---------------------------------------------------------------------------

export interface CachedCandleDataset {
  candles: SpyCandle[];
  latestCandleAt: string | null; // ISO of newest candle; NEVER used for freshness
  fetchedAtMs: number; // successful retrieval time; the ONLY freshness input
}

/**
 * Validates + normalizes a raw Schwab price-history payload into the internal
 * dataset. Throws (ZodError) if the envelope is malformed or ANY candle fails
 * domain validation — a partially-trusted dataset is never produced. Returns
 * null for a structurally valid but EMPTY dataset so the caller can apply the
 * conservative empty-response policy instead of mislabeling [] as LIVE.
 *
 * Deterministic duplicate rule: for equal timestamps, the LAST occurrence in
 * the provider array wins (supports same-timestamp forming-candle revisions).
 * Output is strictly ascending with one candle per timestamp.
 */
export function normalizeRawSpyCandles(
  rawJson: unknown,
  fetchedAtMs: number,
): CachedCandleDataset | null {
  const parsed = RawSchwabPriceHistorySchema.parse(rawJson);
  if (parsed.candles.length === 0) return null;

  // Map raw → internal, validating every candle (any failure rejects all).
  const byTimestamp = new Map<number, SpyCandle>();
  for (const raw of parsed.candles) {
    const candle = SpyCandleSchema.parse({
      timestamp: raw.datetime,
      open: raw.open,
      high: raw.high,
      low: raw.low,
      close: raw.close,
      volume: raw.volume,
    });
    byTimestamp.set(candle.timestamp, candle); // insertion/overwrite order ⇒ last wins
  }

  const candles = [...byTimestamp.values()].sort((a, b) => a.timestamp - b.timestamp);
  const newest = candles[candles.length - 1];

  return {
    candles,
    latestCandleAt: newest ? new Date(newest.timestamp).toISOString() : null,
    fetchedAtMs,
  };
}

/** LIVE vs STALE from fetchedAt age only — latestCandleAt is deliberately not consulted (weekends). */
export function decideCandleState(fetchedAtMs: number, nowMs: number): "LIVE" | "STALE" {
  return nowMs - fetchedAtMs <= CANDLE_FRESHNESS_THRESHOLD_MS ? "LIVE" : "STALE";
}

/** Builds and validates the backend-to-frontend envelope from a cached dataset. */
export function toSpyCandleResponse(
  dataset: CachedCandleDataset,
  nowMs: number,
  warningCode: CandleWarningCode | null,
): SpyCandleResponse {
  return SpyCandleResponseSchema.parse({
    symbol: "SPY",
    timeframe: "5m",
    sourceState: decideCandleState(dataset.fetchedAtMs, nowMs),
    candles: dataset.candles,
    fetchedAt: new Date(dataset.fetchedAtMs).toISOString(),
    latestCandleAt: dataset.latestCandleAt,
    dataAgeMs: Math.max(0, nowMs - dataset.fetchedAtMs),
    isExtendedHoursIncluded: true,
    warningCode,
  });
}

/** Builds and validates a MOCK envelope. Existing mock candles do not include an extended-hours dataset. */
export function toMockSpyCandleResponse(
  candles: SpyCandle[],
  nowMs: number,
  warningCode: CandleWarningCode | null,
): SpyCandleResponse {
  const newestTimestamp = candles.reduce<number | null>(
    (latest, candle) => (latest === null || candle.timestamp > latest ? candle.timestamp : latest),
    null,
  );

  return SpyCandleResponseSchema.parse({
    symbol: "SPY",
    timeframe: "5m",
    sourceState: "MOCK",
    candles,
    fetchedAt: new Date(nowMs).toISOString(),
    latestCandleAt: newestTimestamp === null ? null : new Date(newestTimestamp).toISOString(),
    dataAgeMs: 0,
    isExtendedHoursIncluded: false,
    warningCode,
  });
}
