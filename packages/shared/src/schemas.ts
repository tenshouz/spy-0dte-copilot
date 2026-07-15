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


/** Session Data Foundation coverage is intentionally separate from source freshness. */
export const CoverageStateSchema = z.enum(["COMPLETE", "PARTIAL", "UNAVAILABLE", "UNKNOWN"]);
export type CoverageState = z.infer<typeof CoverageStateSchema>;

export const GapDiagnosticSchema = z.object({
  fromAt: z.string().datetime(),
  toAt: z.string().datetime(),
  gapMs: z.number().int().positive(),
});
export type GapDiagnostic = z.infer<typeof GapDiagnosticSchema>;

export const SessionWindowCoverageSchema = z.object({
  state: CoverageStateSchema,
  firstCandleAt: z.string().datetime().nullable(),
  lastCandleAt: z.string().datetime().nullable(),
  candleCount: z.number().int().nonnegative(),
  gapCount: z.number().int().nonnegative(),
  largestGapMs: z.number().int().nonnegative(),
  gaps: z.array(GapDiagnosticSchema).max(20),
});
export type SessionWindowCoverage = z.infer<typeof SessionWindowCoverageSchema>;

const MarketDateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

export const ObservedMarketDateCoverageSchema = z.object({
  marketDate: MarketDateSchema,
  firstCandleAt: z.string().datetime(),
  lastCandleAt: z.string().datetime(),
  candleCount: z.number().int().positive(),
  gapCount: z.number().int().nonnegative(),
  largestGapMs: z.number().int().nonnegative(),
  premarket: SessionWindowCoverageSchema,
  rth: SessionWindowCoverageSchema,
  afterHours: SessionWindowCoverageSchema,
});
export type ObservedMarketDateCoverage = z.infer<typeof ObservedMarketDateCoverageSchema>;

/**
 * Diagnostic contract for the SPY Session Data Foundation milestone.
 * It reports what was requested and what was observed; it deliberately exposes
 * no VWAP, highs/lows, previous-day levels, gaps-as-prices, or trading signals.
 */
export const SpySessionDataFoundationResponseSchema = z.object({
  symbol: z.literal("SPY"),
  timeframe: z.literal("5m"),
  sourceState: QuoteSourceStateSchema,
  fetchedAt: z.string().datetime(),
  dataAgeMs: z.number().nonnegative(),
  requestStrategy: z.literal("EXPLICIT_BOUNDED_WINDOW"),
  requestedStartAt: z.string().datetime(),
  requestedEndAt: z.string().datetime(),
  firstCandleAt: z.string().datetime().nullable(),
  lastCandleAt: z.string().datetime().nullable(),
  candleCount: z.number().int().nonnegative(),
  extendedHoursRequested: z.literal(true),
  timestampSemantics: z.literal("PROVIDER_TIMESTAMP_UNVERIFIED"),
  currentObservedMarketDate: MarketDateSchema.nullable(),
  previousObservedMarketDate: MarketDateSchema.nullable(),
  observedDates: z.array(ObservedMarketDateCoverageSchema),
  warningCode: CandleWarningCodeSchema.nullable(),
});
export type SpySessionDataFoundationResponse = z.infer<typeof SpySessionDataFoundationResponseSchema>;

/** Metric-level state for the first deterministic live session analytic. */
export const VwapMetricStateSchema = z.enum(["LIVE", "STALE", "MOCK", "UNAVAILABLE"]);
export type VwapMetricState = z.infer<typeof VwapMetricStateSchema>;

export const VwapPointSchema = z.object({
  /** UTC Unix epoch MILLISECONDS; convert to chart seconds only at the chart boundary. */
  timestamp: z.number().int().positive().max(8_640_000_000_000_000),
  value: z.number().finite().positive(),
});
export type VwapPoint = z.infer<typeof VwapPointSchema>;

/**
 * Narrow backend-to-frontend contract for the first deterministic session
 * analytic: cumulative RTH VWAP using HLC3 and normalized SPY 5-minute volume.
 * metricState is deliberately separate from candleSourceState so a healthy
 * live candle feed can truthfully produce UNAVAILABLE before RTH begins.
 */
export const SpyRthVwapResponseSchema = z.object({
  symbol: z.literal("SPY"),
  metric: z.literal("RTH_VWAP"),
  priceSource: z.literal("HLC3"),
  marketDate: MarketDateSchema.nullable(),
  metricState: VwapMetricStateSchema,
  candleSourceState: QuoteSourceStateSchema,
  latestVwap: z.number().finite().positive().nullable(),
  series: z.array(VwapPointSchema),
  fetchedAt: z.string().datetime(),
  dataAgeMs: z.number().nonnegative(),
  /** Newest RTH candle actually included in the calculation, never an after-hours timestamp. */
  latestRthCandleAt: z.string().datetime().nullable(),
  rthCandleCount: z.number().int().nonnegative(),
  warningCode: CandleWarningCodeSchema.nullable(),
});
export type SpyRthVwapResponse = z.infer<typeof SpyRthVwapResponseSchema>;

/** Per-level availability/provenance for deterministic core session levels. */
export const SessionLevelStateSchema = z.enum(["LIVE", "STALE", "MOCK", "UNAVAILABLE"]);
export type SessionLevelState = z.infer<typeof SessionLevelStateSchema>;

export const SessionLevelValueSchema = z
  .object({
    value: z.number().finite().positive().nullable(),
    state: SessionLevelStateSchema,
  })
  .superRefine((level, ctx) => {
    if (level.state === "UNAVAILABLE" && level.value !== null) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "UNAVAILABLE session level must have a null value",
      });
    }
    if (level.state !== "UNAVAILABLE" && level.value === null) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Available session level must have a numeric value",
      });
    }
  });
export type SessionLevelValue = z.infer<typeof SessionLevelValueSchema>;

/**
 * Narrow backend-to-frontend contract for the five deterministic core session
 * levels. currentMarketDate is the current America/New_York calendar date at
 * evaluation time; previousRthMarketDate is the immediately preceding date
 * with RTH evidence, before coverage eligibility is applied.
 */
export const SpySessionLevelsResponseSchema = z.object({
  symbol: z.literal("SPY"),
  currentMarketDate: MarketDateSchema,
  /** True only when the current target date itself has at least one defined-session candle. */
  currentMarketDateHasDefinedSessionData: z.boolean(),
  previousRthMarketDate: MarketDateSchema.nullable(),
  candleSourceState: QuoteSourceStateSchema,
  premarketCoverageState: CoverageStateSchema,
  previousRthCoverageState: CoverageStateSchema,
  premarketHigh: SessionLevelValueSchema,
  premarketLow: SessionLevelValueSchema,
  previousDayHigh: SessionLevelValueSchema,
  previousDayLow: SessionLevelValueSchema,
  previousDayClose: SessionLevelValueSchema,
  fetchedAt: z.string().datetime(),
  dataAgeMs: z.number().nonnegative(),
  latestCandleAt: z.string().datetime().nullable(),
  warningCode: CandleWarningCodeSchema.nullable(),
});
export type SpySessionLevelsResponse = z.infer<typeof SpySessionLevelsResponseSchema>;

/** Package-level availability/provenance for deterministic RTH gap metrics. */
export const GapMetricStateSchema = z.enum(["LIVE", "STALE", "MOCK", "UNAVAILABLE"]);
export type GapMetricState = z.infer<typeof GapMetricStateSchema>;

export const GapDirectionSchema = z.enum(["UP", "DOWN", "FLAT", "UNAVAILABLE"]);
export type GapDirection = z.infer<typeof GapDirectionSchema>;

export const GapFillStateSchema = z.enum([
  "FILLED",
  "UNFILLED",
  "UNKNOWN",
  "NOT_APPLICABLE",
  "UNAVAILABLE",
]);
export type GapFillState = z.infer<typeof GapFillStateSchema>;

/** Gap-specific warning vocabulary while preserving upstream candle warnings. */
export const GapWarningCodeSchema = z.union([
  CandleWarningCodeSchema,
  z.enum([
    "CURRENT_RTH_OPENING_CANDLE_MISSING",
    "PREVIOUS_DAY_CLOSE_UNAVAILABLE",
    "INVALID_GAP_INPUT",
  ]),
]);
export type GapWarningCode = z.infer<typeof GapWarningCodeSchema>;

/**
 * Narrow backend-to-frontend contract for the current New York date's RTH
 * opening gap. Gap validity is separate from fill certainty: a valid LIVE gap
 * may still have fillState UNKNOWN when an intraday interval is missing.
 */
export const SpyRthGapResponseSchema = z
  .object({
    symbol: z.literal("SPY"),
    metric: z.literal("RTH_GAP"),
    currentMarketDate: MarketDateSchema,
    previousRthMarketDate: MarketDateSchema.nullable(),
    metricState: GapMetricStateSchema,
    candleSourceState: QuoteSourceStateSchema,
    currentRthOpen: z.number().finite().positive().nullable(),
    currentRthOpenAt: z.string().datetime().nullable(),
    previousDayClose: z.number().finite().positive().nullable(),
    gapPoints: z.number().finite().nullable(),
    gapPercent: z.number().finite().nullable(),
    direction: GapDirectionSchema,
    fillState: GapFillStateSchema,
    /** Earliest returned RTH candle whose range proves the fill; not a tick-level touch time. */
    firstObservedFillCandleAt: z.string().datetime().nullable(),
    currentRthCoverageState: CoverageStateSchema,
    previousRthCoverageState: CoverageStateSchema,
    fetchedAt: z.string().datetime(),
    dataAgeMs: z.number().nonnegative(),
    latestRthCandleAt: z.string().datetime().nullable(),
    currentRthCandleCount: z.number().int().nonnegative(),
    warningCode: GapWarningCodeSchema.nullable(),
  })
  .superRefine((value, ctx) => {
    const coreAvailable = value.metricState !== "UNAVAILABLE";
    const coreFields = [
      value.currentRthOpen,
      value.currentRthOpenAt,
      value.previousDayClose,
      value.gapPoints,
      value.gapPercent,
    ];

    if (!coreAvailable) {
      if (
        value.currentRthOpen !== null ||
        value.currentRthOpenAt !== null ||
        value.gapPoints !== null ||
        value.gapPercent !== null ||
        value.direction !== "UNAVAILABLE" ||
        value.fillState !== "UNAVAILABLE" ||
        value.firstObservedFillCandleAt !== null
      ) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "UNAVAILABLE gap must not expose calculated gap fields",
        });
      }
    } else if (
      coreFields.some((field) => field === null) ||
      value.direction === "UNAVAILABLE" ||
      value.fillState === "UNAVAILABLE"
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Available gap must expose all core calculation fields",
      });
    }

    if (value.fillState === "FILLED" && value.firstObservedFillCandleAt === null) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "FILLED gap requires firstObservedFillCandleAt",
      });
    }
    if (value.fillState !== "FILLED" && value.firstObservedFillCandleAt !== null) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Only FILLED gap may expose firstObservedFillCandleAt",
      });
    }
    if (value.direction === "FLAT" && value.fillState !== "NOT_APPLICABLE") {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "FLAT gap requires NOT_APPLICABLE fill state",
      });
    }
  });
export type SpyRthGapResponse = z.infer<typeof SpyRthGapResponseSchema>;

