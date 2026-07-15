import { z } from "zod";

/**
 * These schemas are the single source of truth for data shapes shared between
 * the Next.js frontend and the Express backend. They mirror the PRD:
 *  - Section 5.2 (derived metrics)
 *  - Section 6.3 (AI engine output schema)
 *  - Section 15 (Prisma models)
 *
 * In Milestone 1 these are populated by mock generators only. In Milestone 2+
 * the same schemas will validate real Schwab-derived data and real AI output,
 * so nothing downstream (components, hooks) should need to change shape later.
 */

export const BiasSchema = z.enum(["CALLS", "PUTS", "WAIT"]);
export type Bias = z.infer<typeof BiasSchema>;

export const TrendSchema = z.enum(["UP", "DOWN", "FLAT"]);
export type Trend = z.infer<typeof TrendSchema>;

export const DealerPositioningSchema = z.enum([
  "STRONGLY_LONG_GAMMA",
  "LONG_GAMMA",
  "NEUTRAL",
  "SHORT_GAMMA",
  "STRONGLY_SHORT_GAMMA",
]);
export type DealerPositioning = z.infer<typeof DealerPositioningSchema>;

/** Section 5: candle used by TradingView Lightweight Charts */
export const CandleSchema = z.object({
  time: z.number(), // unix seconds, per lightweight-charts convention
  open: z.number(),
  high: z.number(),
  low: z.number(),
  close: z.number(),
  volume: z.number().nonnegative(),
});
export type Candle = z.infer<typeof CandleSchema>;

/** Section 15: MarketSnapshot model */
export const MarketSnapshotSchema = z.object({
  id: z.string(),
  timestamp: z.string().datetime(),
  spotPrice: z.number(),
  vwap: z.number(),
  openingRangeHigh: z.number().nullable(),
  openingRangeLow: z.number().nullable(),
  premarketHigh: z.number().nullable(),
  premarketLow: z.number().nullable(),
  overnightHigh: z.number().nullable(),
  overnightLow: z.number().nullable(),
  trend5m: TrendSchema,
  trend1m: TrendSchema,
  volume: z.number().nonnegative(),
  relativeVolume: z.number().nonnegative(),
  emaTrend: TrendSchema,
  netGex: z.number(),
  netDex: z.number(),
  gammaFlip: z.number().nullable(),
  callWall: z.number().nullable(),
  putWall: z.number().nullable(),
  dealerPositioning: DealerPositioningSchema,
  expectedMove: z.number().nonnegative(),
  ivRank: z.number().min(0).max(100).nullable(),
  expirationUsed: z.string().datetime(),
  isZeroDte: z.boolean(),
});
export type MarketSnapshot = z.infer<typeof MarketSnapshotSchema>;

/** Section 5: per-strike GEX/DEX row, used by the Gamma/DEX panel and heatmap */
export const StrikeExposureSchema = z.object({
  strike: z.number(),
  callOpenInterest: z.number().nonnegative(),
  putOpenInterest: z.number().nonnegative(),
  gex: z.number(),
  dex: z.number(),
});
export type StrikeExposure = z.infer<typeof StrikeExposureSchema>;

/** Section 9: individual scored factor in the transparent reasoning engine */
export const FactorScoreSchema = z.object({
  factor: z.string(),
  points: z.number(),
  detail: z.string(),
});
export type FactorScore = z.infer<typeof FactorScoreSchema>;

/** Section 6.3: trade plan sub-object */
export const TradePlanSchema = z.object({
  entryCondition: z.string(),
  targets: z.tuple([z.number(), z.number()]),
  invalidation: z.number(),
  riskNote: z.string(),
});
export type TradePlan = z.infer<typeof TradePlanSchema>;

export const ReportTypeSchema = z.enum([
  "premarket",
  "0935",
  "0945",
  "1000",
  "continuous",
  "manual",
]);
export type ReportType = z.infer<typeof ReportTypeSchema>;

/** Section 6.3 + 15: full AI Report */
export const ReportSchema = z.object({
  id: z.string(),
  type: ReportTypeSchema,
  createdAt: z.string().datetime(),
  snapshot: MarketSnapshotSchema,
  bias: BiasSchema,
  confidence: z.number().int().min(0).max(10),
  bullishScenario: z.string(),
  bearishScenario: z.string(),
  tradePlan: TradePlanSchema,
  warnings: z.array(z.string()),
  reasoning: z.string(),
  factorScores: z.array(FactorScoreSchema),
  screenshotUrl: z.string().nullable(),
});
export type Report = z.infer<typeof ReportSchema>;

/** Section 11: Trade Journal entry (user-entered outcome overlay on a Report) */
export const JournalEntrySchema = z.object({
  id: z.string(),
  reportId: z.string(),
  traded: z.boolean(),
  direction: BiasSchema.exclude(["WAIT"]).nullable(),
  entryPrice: z.number().nullable(),
  exitPrice: z.number().nullable(),
  pnl: z.number().nullable(),
  notes: z.string().nullable(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});
export type JournalEntry = z.infer<typeof JournalEntrySchema>;

/** Schwab OAuth connection status (auth only — no market data yet, PRD Section 5.1/13.3). */
export const SchwabConnectionStateSchema = z.enum([
  "database_not_configured",
  "credentials_not_configured",
  "config_invalid",
  "not_connected",
  "connected",
  "token_expired",
]);
export type SchwabConnectionState = z.infer<typeof SchwabConnectionStateSchema>;

export const SchwabConnectionStatusSchema = z.object({
  state: SchwabConnectionStateSchema,
  expiresAt: z.string().datetime().nullable(),
  /** Safe, human-readable elaboration (e.g. which vars are missing or why the redirect URI is invalid). Never contains secrets. */
  detail: z.string().nullable(),
});
export type SchwabConnectionStatus = z.infer<typeof SchwabConnectionStatusSchema>;

/** Section 12: Discord alert log */
export const AlertSeveritySchema = z.enum(["info", "bias_change", "invalidation", "warning"]);
export type AlertSeverity = z.infer<typeof AlertSeveritySchema>;

export const AlertSchema = z.object({
  id: z.string(),
  severity: AlertSeveritySchema,
  title: z.string(),
  message: z.string(),
  createdAt: z.string().datetime(),
  delivered: z.boolean(),
});
export type Alert = z.infer<typeof AlertSchema>;

/**
 * Normalized SPY quote — the backend-to-frontend contract for the live quote
 * milestone. The backend is authoritative for sourceState:
 *  LIVE  — validated real Schwab quote, fetchedAt within the freshness threshold
 *  STALE — validated real quote exists but the last successful fetch is older
 *          than the threshold (connection still established)
 *  MOCK  — no usable real quote (disconnected / auth failure / no cache)
 * Freshness is judged from fetchedAt (server retrieval time), NOT from
 * quoteTimestamp, which is legitimately old while markets are closed.
 */
export const QuoteSourceStateSchema = z.enum(["LIVE", "STALE", "MOCK"]);
export type QuoteSourceState = z.infer<typeof QuoteSourceStateSchema>;

/** Mapped from Schwab's documented quote.securityStatus; UNKNOWN when absent or unrecognized. */
export const MarketStatusSchema = z.enum(["NORMAL", "HALTED", "CLOSED", "UNKNOWN"]);
export type MarketStatus = z.infer<typeof MarketStatusSchema>;

export const QuoteWarningCodeSchema = z.enum([
  "NOT_CONNECTED",
  "AUTH_EXPIRED",
  "RECONNECT_REQUIRED",
  "FORBIDDEN",
  "RATE_LIMITED",
  "UPSTREAM_ERROR",
  "NETWORK_ERROR",
  "TIMEOUT",
  "VALIDATION_FAILED",
  "DATABASE_ERROR",
]);
export type QuoteWarningCode = z.infer<typeof QuoteWarningCodeSchema>;

/**
 * LIVE→STALE boundary, measured from fetchedAt (server retrieval time).
 * Shared so the backend's authoritative decision and the frontend's
 * transport-failure safety downgrade use the identical threshold.
 */
export const QUOTE_FRESHNESS_THRESHOLD_MS = 45_000;

export const SpyQuoteSchema = z.object({
  symbol: z.literal("SPY"),
  lastPrice: z.number().finite().positive(),
  bidPrice: z.number().finite().nonnegative().nullable(),
  askPrice: z.number().finite().nonnegative().nullable(),
  volume: z.number().int().nonnegative().nullable(),
  quoteTimestamp: z.string().datetime(),
  fetchedAt: z.string().datetime(),
  marketStatus: MarketStatusSchema,
  sourceState: QuoteSourceStateSchema,
  dataAgeMs: z.number().nonnegative(),
  warningCode: QuoteWarningCodeSchema.nullable(),
});
export type SpyQuote = z.infer<typeof SpyQuoteSchema>;

/**
 * Normalized SPY 5-minute candle — the backend-to-frontend candle contract.
 * timestamp is UTC Unix epoch MILLISECONDS (the chart boundary converts to
 * lightweight-charts seconds; the shared contract stays provider-neutral).
 * OHLC relationship rules are enforced at the schema level so no malformed
 * candle can cross the boundary in either direction.
 */
export const SpyCandleSchema = z
  .object({
    timestamp: z.number().int().positive().max(8_640_000_000_000_000),
    open: z.number().finite().positive(),
    high: z.number().finite().positive(),
    low: z.number().finite().positive(),
    close: z.number().finite().positive(),
    volume: z.number().int().nonnegative(),
  })
  .superRefine((c, ctx) => {
    if (c.high < c.low) ctx.addIssue({ code: z.ZodIssueCode.custom, message: "high < low" });
    if (c.high < c.open) ctx.addIssue({ code: z.ZodIssueCode.custom, message: "high < open" });
    if (c.high < c.close) ctx.addIssue({ code: z.ZodIssueCode.custom, message: "high < close" });
    if (c.low > c.open) ctx.addIssue({ code: z.ZodIssueCode.custom, message: "low > open" });
    if (c.low > c.close) ctx.addIssue({ code: z.ZodIssueCode.custom, message: "low > close" });
  });
export type SpyCandle = z.infer<typeof SpyCandleSchema>;

/** LIVE→STALE boundary for the candle dataset, measured from fetchedAt (not latestCandleAt). */
export const CANDLE_FRESHNESS_THRESHOLD_MS = 90_000;

/** Candle-specific warning codes — same vocabulary as quotes plus EMPTY_RESPONSE (kept as a separate enum so the quote UI's exhaustive maps are unaffected). */
export const CandleWarningCodeSchema = z.enum([
  "NOT_CONNECTED",
  "AUTH_EXPIRED",
  "RECONNECT_REQUIRED",
  "FORBIDDEN",
  "RATE_LIMITED",
  "UPSTREAM_ERROR",
  "NETWORK_ERROR",
  "TIMEOUT",
  "VALIDATION_FAILED",
  "DATABASE_ERROR",
  "EMPTY_RESPONSE",
]);
export type CandleWarningCode = z.infer<typeof CandleWarningCodeSchema>;

export const SpyCandleResponseSchema = z.object({
  symbol: z.literal("SPY"),
  timeframe: z.literal("5m"),
  sourceState: QuoteSourceStateSchema, // same LIVE/STALE/MOCK vocabulary
  candles: z.array(SpyCandleSchema),
  fetchedAt: z.string().datetime(),
  /** Timestamp of the newest candle in the dataset — legitimately old on weekends; never used for freshness. */
  latestCandleAt: z.string().datetime().nullable(),
  dataAgeMs: z.number().nonnegative(),
  isExtendedHoursIncluded: z.boolean(),
  warningCode: CandleWarningCodeSchema.nullable(),
});
export type SpyCandleResponse = z.infer<typeof SpyCandleResponseSchema>;
