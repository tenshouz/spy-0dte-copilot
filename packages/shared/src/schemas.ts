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

/** Package-level availability/provenance for the fixed 15-minute RTH Opening Range. */
export const OpeningRangeMetricStateSchema = z.enum(["LIVE", "STALE", "MOCK", "UNAVAILABLE"]);
export type OpeningRangeMetricState = z.infer<typeof OpeningRangeMetricStateSchema>;

/** Lifecycle is deliberately separate from source freshness and coverage eligibility. */
export const OpeningRangePhaseSchema = z.enum([
  "PRE_OPEN",
  "FORMING",
  "COMPLETE",
  "UNAVAILABLE",
]);
export type OpeningRangePhase = z.infer<typeof OpeningRangePhaseSchema>;

export const OpeningRangeWarningCodeSchema = z.union([
  CandleWarningCodeSchema,
  z.enum([
    "OPENING_RANGE_OPENING_CANDLE_MISSING",
    "OPENING_RANGE_INCOMPLETE",
  ]),
]);
export type OpeningRangeWarningCode = z.infer<typeof OpeningRangeWarningCodeSchema>;

/**
 * Current New York date's fixed 15-minute RTH Opening Range. The intended
 * interval is [09:30, 09:45); first/latest candle fields are actual selected
 * provider-candle timestamps, while start/end identify the established range
 * boundaries when the canonical 09:30 opening candle is available.
 */
export const SpyOpeningRangeResponseSchema = z
  .object({
    symbol: z.literal("SPY"),
    metric: z.literal("OPENING_RANGE_15M"),
    currentMarketDate: MarketDateSchema,
    metricState: OpeningRangeMetricStateSchema,
    candleSourceState: QuoteSourceStateSchema,
    phase: OpeningRangePhaseSchema,
    openingRangeHigh: z.number().finite().positive().nullable(),
    openingRangeLow: z.number().finite().positive().nullable(),
    openingRangeStartAt: z.string().datetime().nullable(),
    openingRangeEndAt: z.string().datetime().nullable(),
    openingRangeCandleCount: z.number().int().min(0).max(3),
    coverageState: CoverageStateSchema,
    firstOpeningRangeCandleAt: z.string().datetime().nullable(),
    latestOpeningRangeCandleAt: z.string().datetime().nullable(),
    fetchedAt: z.string().datetime(),
    dataAgeMs: z.number().nonnegative(),
    warningCode: OpeningRangeWarningCodeSchema.nullable(),
  })
  .superRefine((value, ctx) => {
    const available = value.metricState !== "UNAVAILABLE";
    if (!available) {
      if (value.openingRangeHigh !== null || value.openingRangeLow !== null) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "UNAVAILABLE Opening Range must expose null High and Low",
        });
      }
    } else if (
      value.openingRangeHigh === null ||
      value.openingRangeLow === null ||
      value.openingRangeStartAt === null ||
      value.openingRangeEndAt === null ||
      value.openingRangeCandleCount === 0 ||
      value.coverageState !== "COMPLETE" ||
      value.phase === "PRE_OPEN" ||
      value.phase === "UNAVAILABLE"
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Available Opening Range requires eligible candles, boundaries, and COMPLETE coverage",
      });
    }

    const hasObservedCandles = value.openingRangeCandleCount > 0;
    if (
      hasObservedCandles !==
      (value.firstOpeningRangeCandleAt !== null && value.latestOpeningRangeCandleAt !== null)
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Opening Range candle count and observed timestamp fields must agree",
      });
    }

    if (
      (value.openingRangeStartAt === null) !== (value.openingRangeEndAt === null)
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Opening Range start and end boundaries must be present together",
      });
    }

    if (value.phase === "PRE_OPEN" && value.openingRangeCandleCount !== 0) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "PRE_OPEN Opening Range cannot expose selected candles",
      });
    }

    if (value.phase === "COMPLETE" && available && value.openingRangeCandleCount !== 3) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Completed available Opening Range requires all three candles",
      });
    }
  });
export type SpyOpeningRangeResponse = z.infer<typeof SpyOpeningRangeResponseSchema>;


/** Package-level availability and freshness for the SPY current-date Options Chain. */
export const OptionsChainMetricStateSchema = z.enum(["LIVE", "STALE", "MOCK", "UNAVAILABLE"]);
export type OptionsChainMetricState = z.infer<typeof OptionsChainMetricStateSchema>;

/** Source state includes UNAVAILABLE because no provider result may exist at all. */
export const OptionsChainSourceStateSchema = z.enum(["LIVE", "STALE", "MOCK", "UNAVAILABLE"]);
export type OptionsChainSourceState = z.infer<typeof OptionsChainSourceStateSchema>;

export const OptionTypeSchema = z.enum(["CALL", "PUT"]);
export type OptionType = z.infer<typeof OptionTypeSchema>;

export const OptionsUnderlyingPriceSourceSchema = z.enum([
  "CHAIN_RESPONSE",
  "SPY_QUOTE_CACHE",
  "UNAVAILABLE",
]);
export type OptionsUnderlyingPriceSource = z.infer<typeof OptionsUnderlyingPriceSourceSchema>;

export const OptionsChainWarningCodeSchema = z.enum([
  "AUTH_REQUIRED",
  "DATABASE_ERROR",
  "OPTIONS_ACCESS_UNAVAILABLE",
  "NO_CURRENT_DATE_EXPIRATION",
  "NO_VALID_CONTRACTS",
  "UPSTREAM_RATE_LIMITED",
  "UPSTREAM_TIMEOUT",
  "UPSTREAM_NETWORK_ERROR",
  "UPSTREAM_UNAVAILABLE",
  "UPSTREAM_SCHEMA_INVALID",
  "RETAINED_STALE_CHAIN",
  "PARTIAL_CONTRACT_DATA",
]);
export type OptionsChainWarningCode = z.infer<typeof OptionsChainWarningCodeSchema>;

/** LIVE/STALE is based on fetchedAt, never on the latest contract trade. */
export const OPTIONS_CHAIN_FRESHNESS_THRESHOLD_MS = 60_000;

/**
 * Stable application-owned option contract. Provider-specific map keys and
 * raw fields never cross this shared boundary. `impliedVolatilityPercent`
 * preserves Schwab's observed percentage-point scale without local rescaling.
 */
export const NormalizedOptionContractSchema = z.object({
  contractSymbol: z.string().min(1),
  underlyingSymbol: z.literal("SPY"),
  optionType: OptionTypeSchema,
  expirationDate: MarketDateSchema,
  strikePrice: z.number().finite().positive(),
  description: z.string().nullable(),
  bid: z.number().finite().nonnegative().nullable(),
  ask: z.number().finite().nonnegative().nullable(),
  last: z.number().finite().nonnegative().nullable(),
  mark: z.number().finite().nonnegative().nullable(),
  bidSize: z.number().int().nonnegative().nullable(),
  askSize: z.number().int().nonnegative().nullable(),
  lastSize: z.number().int().nonnegative().nullable(),
  volume: z.number().int().nonnegative().nullable(),
  openInterest: z.number().int().nonnegative().nullable(),
  impliedVolatilityPercent: z.number().finite().nonnegative().nullable(),
  delta: z.number().finite().nullable(),
  gamma: z.number().finite().nonnegative().nullable(),
  theta: z.number().finite().nullable(),
  vega: z.number().finite().nullable(),
  rho: z.number().finite().nullable(),
  inTheMoney: z.boolean().nullable(),
  nonStandard: z.boolean().nullable(),
  mini: z.boolean().nullable(),
  multiplier: z.number().finite().positive().nullable(),
  quoteAt: z.string().datetime().nullable(),
  tradeAt: z.string().datetime().nullable(),
});
export type NormalizedOptionContract = z.infer<typeof NormalizedOptionContractSchema>;

/**
 * SPY-only current-New-York-date Options Chain Foundation. No alternate
 * expiration fallback, local Greeks, IV calculation, rankings, or signals.
 */
export const SpyZeroDteOptionsChainResponseSchema = z
  .object({
    symbol: z.literal("SPY"),
    metric: z.literal("ZERO_DTE_OPTIONS_CHAIN"),
    currentMarketDate: MarketDateSchema,
    requestedExpirationDate: MarketDateSchema,
    returnedExpirationDate: MarketDateSchema.nullable(),
    metricState: OptionsChainMetricStateSchema,
    sourceState: OptionsChainSourceStateSchema,
    isDelayed: z.boolean().nullable(),
    underlyingPrice: z.number().finite().positive().nullable(),
    underlyingPriceSource: OptionsUnderlyingPriceSourceSchema,
    calls: z.array(NormalizedOptionContractSchema),
    puts: z.array(NormalizedOptionContractSchema),
    requestedStrikeCount: z.number().int().positive(),
    returnedUniqueStrikeCount: z.number().int().nonnegative(),
    callContractCount: z.number().int().nonnegative(),
    putContractCount: z.number().int().nonnegative(),
    minimumReturnedStrike: z.number().finite().positive().nullable(),
    maximumReturnedStrike: z.number().finite().positive().nullable(),
    providerContractCount: z.number().int().nonnegative().nullable(),
    totalContracts: z.number().int().nonnegative(),
    contractsWithBidAsk: z.number().int().nonnegative(),
    contractsWithGreeks: z.number().int().nonnegative(),
    contractsWithOpenInterest: z.number().int().nonnegative(),
    contractsWithVolume: z.number().int().nonnegative(),
    rejectedContractCount: z.number().int().nonnegative(),
    fetchedAt: z.string().datetime(),
    dataAgeMs: z.number().nonnegative(),
    latestOptionQuoteAt: z.string().datetime().nullable(),
    latestOptionTradeAt: z.string().datetime().nullable(),
    warningCode: OptionsChainWarningCodeSchema.nullable(),
  })
  .superRefine((value, ctx) => {
    if (value.currentMarketDate !== value.requestedExpirationDate) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "0DTE requested expiration must equal current New York date",
      });
    }

    if (value.callContractCount !== value.calls.length || value.putContractCount !== value.puts.length) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: "Options contract counts do not match arrays" });
    }
    if (value.totalContracts !== value.calls.length + value.puts.length) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: "Options totalContracts does not match arrays" });
    }

    const contracts = [...value.calls, ...value.puts];
    const uniqueSymbols = new Set(contracts.map((contract) => contract.contractSymbol));
    if (uniqueSymbols.size !== contracts.length) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: "Options contract symbols must be unique" });
    }

    if (
      value.calls.some(
        (contract) =>
          contract.optionType !== "CALL" || contract.expirationDate !== value.requestedExpirationDate,
      ) ||
      value.puts.some(
        (contract) =>
          contract.optionType !== "PUT" || contract.expirationDate !== value.requestedExpirationDate,
      )
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Options arrays may contain only the requested expiration and matching option type",
      });
    }

    const strikes = [...new Set(contracts.map((contract) => contract.strikePrice))].sort((a, b) => a - b);
    if (value.returnedUniqueStrikeCount !== strikes.length) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: "Unique strike count is inconsistent" });
    }
    if (
      (strikes[0] ?? null) !== value.minimumReturnedStrike ||
      (strikes[strikes.length - 1] ?? null) !== value.maximumReturnedStrike
    ) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: "Returned strike bounds are inconsistent" });
    }

    const unavailable = value.metricState === "UNAVAILABLE";
    if (unavailable) {
      if (contracts.length > 0 || value.returnedExpirationDate !== null) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "UNAVAILABLE Options Chain cannot expose contracts or a returned expiration",
        });
      }
    } else if (
      contracts.length === 0 ||
      value.returnedExpirationDate !== value.requestedExpirationDate ||
      value.sourceState === "UNAVAILABLE"
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Available Options Chain requires current-expiration contracts and a real/mock source",
      });
    }

    if (
      value.underlyingPrice === null &&
      value.underlyingPriceSource !== "UNAVAILABLE"
    ) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: "Missing underlying price needs UNAVAILABLE source" });
    }
    if (
      value.underlyingPrice !== null &&
      value.underlyingPriceSource === "UNAVAILABLE"
    ) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: "Underlying price source is inconsistent" });
    }
  });
export type SpyZeroDteOptionsChainResponse = z.infer<typeof SpyZeroDteOptionsChainResponseSchema>;


/** Deterministic source/availability state for the SPY 0DTE ATM implied move. */
export const ExpectedMoveMetricStateSchema = z.enum(["LIVE", "STALE", "UNAVAILABLE"]);
export type ExpectedMoveMetricState = z.infer<typeof ExpectedMoveMetricStateSchema>;

export const ExpectedMoveMethodologySchema = z.literal("ATM_STRADDLE_MARK");
export type ExpectedMoveMethodology = z.infer<typeof ExpectedMoveMethodologySchema>;

export const ExpectedMoveWarningCodeSchema = z.enum([
  "AUTH_REQUIRED",
  "DATABASE_ERROR",
  "OPTIONS_ACCESS_UNAVAILABLE",
  "NO_CURRENT_DATE_EXPIRATION",
  "OPTIONS_CHAIN_UNAVAILABLE",
  "UNDERLYING_PRICE_UNAVAILABLE",
  "ATM_STRIKE_UNAVAILABLE",
  "ATM_CALL_UNAVAILABLE",
  "ATM_PUT_UNAVAILABLE",
  "ATM_CALL_MARK_UNAVAILABLE",
  "ATM_PUT_MARK_UNAVAILABLE",
  "INVALID_IMPLIED_MOVE_INPUTS",
  "RETAINED_STALE_CHAIN",
]);
export type ExpectedMoveWarningCode = z.infer<typeof ExpectedMoveWarningCodeSchema>;

export const SpyZeroDteExpectedMoveResponseSchema = z
  .object({
    symbol: z.literal("SPY"),
    metric: z.literal("ZERO_DTE_ATM_IMPLIED_MOVE"),
    methodology: ExpectedMoveMethodologySchema,
    currentMarketDate: MarketDateSchema,
    expirationDate: MarketDateSchema.nullable(),
    metricState: ExpectedMoveMetricStateSchema,
    sourceState: OptionsChainSourceStateSchema,
    underlyingPrice: z.number().finite().positive().nullable(),
    underlyingPriceSource: z.enum(["CHAIN_RESPONSE", "UNAVAILABLE"]),
    atmStrike: z.number().finite().positive().nullable(),
    callContractSymbol: z.string().min(1).nullable(),
    putContractSymbol: z.string().min(1).nullable(),
    callMark: z.number().finite().nonnegative().nullable(),
    putMark: z.number().finite().nonnegative().nullable(),
    impliedMovePoints: z.number().finite().nonnegative().nullable(),
    impliedMovePercent: z.number().finite().nonnegative().nullable(),
    upperImpliedMoveLevel: z.number().finite().positive().nullable(),
    lowerImpliedMoveLevel: z.number().finite().nullable(),
    callQuoteAt: z.string().datetime().nullable(),
    putQuoteAt: z.string().datetime().nullable(),
    latestSelectedContractQuoteAt: z.string().datetime().nullable(),
    chainFetchedAt: z.string().datetime().nullable(),
    fetchedAt: z.string().datetime(),
    dataAgeMs: z.number().nonnegative(),
    warningCode: ExpectedMoveWarningCodeSchema.nullable(),
  })
  .superRefine((value, ctx) => {
    const available = value.metricState !== "UNAVAILABLE";
    const requiredValues = [
      value.expirationDate,
      value.underlyingPrice,
      value.atmStrike,
      value.callContractSymbol,
      value.putContractSymbol,
      value.callMark,
      value.putMark,
      value.impliedMovePoints,
      value.impliedMovePercent,
      value.upperImpliedMoveLevel,
      value.lowerImpliedMoveLevel,
      value.chainFetchedAt,
    ];

    if (available && requiredValues.some((item) => item === null)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Available ATM implied move requires complete selected-contract inputs and calculations",
      });
    }

    if (!available) {
      const calculated = [
        value.atmStrike,
        value.callContractSymbol,
        value.putContractSymbol,
        value.callMark,
        value.putMark,
        value.impliedMovePoints,
        value.impliedMovePercent,
        value.upperImpliedMoveLevel,
        value.lowerImpliedMoveLevel,
      ];
      if (calculated.some((item) => item !== null)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "Unavailable ATM implied move cannot expose selected contracts or calculated values",
        });
      }
    }

    if (value.expirationDate !== null && value.expirationDate !== value.currentMarketDate) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: "ATM implied move must use current-date expiration" });
    }

    if ((value.underlyingPrice === null) !== (value.underlyingPriceSource === "UNAVAILABLE")) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: "ATM implied move underlying source is inconsistent" });
    }

    if (available && value.sourceState !== value.metricState) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: "Derived ATM implied move cannot exceed chain provenance" });
    }
  });
export type SpyZeroDteExpectedMoveResponse = z.infer<typeof SpyZeroDteExpectedMoveResponseSchema>;

/** Deterministic availability and coverage for the bounded SPY 0DTE GEX proxy. */
export const GexMetricStateSchema = z.enum(["LIVE", "STALE", "UNAVAILABLE"]);
export type GexMetricState = z.infer<typeof GexMetricStateSchema>;

export const GexCoverageStateSchema = z.enum(["COMPLETE", "PARTIAL", "UNAVAILABLE"]);
export type GexCoverageState = z.infer<typeof GexCoverageStateSchema>;

export const GexCoverageScopeSchema = z.literal("RETURNED_CHAIN_WINDOW");
export type GexCoverageScope = z.infer<typeof GexCoverageScopeSchema>;

export const GexMethodologySchema = z.literal("OI_WEIGHTED_GAMMA_PER_1PCT_MOVE");
export type GexMethodology = z.infer<typeof GexMethodologySchema>;

export const GexWarningCodeSchema = z.enum([
  "AUTH_REQUIRED",
  "DATABASE_ERROR",
  "OPTIONS_ACCESS_UNAVAILABLE",
  "NO_CURRENT_DATE_EXPIRATION",
  "OPTIONS_CHAIN_UNAVAILABLE",
  "UNDERLYING_PRICE_UNAVAILABLE",
  "NO_ELIGIBLE_GEX_CONTRACTS",
  "INVALID_GEX_INPUTS",
  "PARTIAL_GEX_INPUTS",
  "RETAINED_STALE_CHAIN",
]);
export type GexWarningCode = z.infer<typeof GexWarningCodeSchema>;

export const GexStrikeRowSchema = z.object({
  strikePrice: z.number().finite().positive(),
  callContractCount: z.number().int().nonnegative(),
  putContractCount: z.number().int().nonnegative(),
  callOpenInterest: z.number().int().nonnegative(),
  putOpenInterest: z.number().int().nonnegative(),
  callGammaExposure: z.number().finite().nonnegative(),
  putGammaExposureMagnitude: z.number().finite().nonnegative(),
  netGammaExposureProxy: z.number().finite(),
});
export type GexStrikeRow = z.infer<typeof GexStrikeRowSchema>;

function closeEnough(left: number, right: number): boolean {
  const tolerance = Math.max(1e-6, Math.max(Math.abs(left), Math.abs(right)) * 1e-12);
  return Math.abs(left - right) <= tolerance;
}

export const SpyZeroDteGexProxyResponseSchema = z
  .object({
    symbol: z.literal("SPY"),
    metric: z.literal("ZERO_DTE_ATM_WINDOW_GEX_PROXY"),
    methodology: GexMethodologySchema,
    coverageScope: GexCoverageScopeSchema,
    currentMarketDate: MarketDateSchema,
    expirationDate: MarketDateSchema.nullable(),
    metricState: GexMetricStateSchema,
    sourceState: OptionsChainSourceStateSchema,
    coverageState: GexCoverageStateSchema,
    underlyingPrice: z.number().finite().positive().nullable(),
    underlyingPriceSource: z.enum(["CHAIN_RESPONSE", "UNAVAILABLE"]),
    requestedStrikeCount: z.number().int().positive().nullable(),
    returnedUniqueStrikeCount: z.number().int().nonnegative(),
    minimumReturnedStrike: z.number().finite().positive().nullable(),
    maximumReturnedStrike: z.number().finite().positive().nullable(),
    returnedWindowCallGammaExposure: z.number().finite().nonnegative().nullable(),
    returnedWindowPutGammaExposureMagnitude: z.number().finite().nonnegative().nullable(),
    returnedWindowNetGammaExposureProxy: z.number().finite().nullable(),
    eligibleCallContractCount: z.number().int().nonnegative(),
    eligiblePutContractCount: z.number().int().nonnegative(),
    excludedCallContractCount: z.number().int().nonnegative(),
    excludedPutContractCount: z.number().int().nonnegative(),
    contractsMissingGamma: z.number().int().nonnegative(),
    contractsMissingOpenInterest: z.number().int().nonnegative(),
    contractsMissingMultiplier: z.number().int().nonnegative(),
    nonstandardContractsExcluded: z.number().int().nonnegative(),
    miniContractsExcluded: z.number().int().nonnegative(),
    invalidMultiplierContractsExcluded: z.number().int().nonnegative(),
    duplicateContractsExcluded: z.number().int().nonnegative(),
    outOfScopeContractsExcluded: z.number().int().nonnegative(),
    upstreamRejectedContractCount: z.number().int().nonnegative(),
    eligibleStrikeCount: z.number().int().nonnegative(),
    strikes: z.array(GexStrikeRowSchema),
    latestOptionQuoteAt: z.string().datetime().nullable(),
    chainFetchedAt: z.string().datetime().nullable(),
    fetchedAt: z.string().datetime(),
    dataAgeMs: z.number().nonnegative(),
    warningCode: GexWarningCodeSchema.nullable(),
  })
  .superRefine((value, ctx) => {
    const available = value.metricState !== "UNAVAILABLE";
    const totals = [
      value.returnedWindowCallGammaExposure,
      value.returnedWindowPutGammaExposureMagnitude,
      value.returnedWindowNetGammaExposureProxy,
    ];

    if (value.expirationDate !== null && value.expirationDate !== value.currentMarketDate) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: "GEX proxy must use current-date expiration" });
    }

    if ((value.underlyingPrice === null) !== (value.underlyingPriceSource === "UNAVAILABLE")) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: "GEX underlying source is inconsistent" });
    }

    if (available) {
      if (
        value.expirationDate === null ||
        value.underlyingPrice === null ||
        value.chainFetchedAt === null ||
        value.coverageState === "UNAVAILABLE" ||
        value.strikes.length === 0 ||
        totals.some((item) => item === null)
      ) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "Available GEX proxy requires a current chain snapshot, strike rows, and totals",
        });
      }
      if (value.sourceState !== value.metricState) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, message: "GEX proxy cannot exceed chain provenance" });
      }
    } else {
      if (value.coverageState !== "UNAVAILABLE" || value.strikes.length > 0 || totals.some((item) => item !== null)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "Unavailable GEX proxy cannot expose totals or strike rows",
        });
      }
    }

    if (value.eligibleStrikeCount !== value.strikes.length) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: "Eligible GEX strike count is inconsistent" });
    }

    const sorted = [...value.strikes].sort((a, b) => a.strikePrice - b.strikePrice);
    if (value.strikes.some((row, index) => row.strikePrice !== sorted[index]?.strikePrice)) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: "GEX strike rows must be sorted ascending" });
    }

    for (const row of value.strikes) {
      if (!closeEnough(row.netGammaExposureProxy, row.callGammaExposure - row.putGammaExposureMagnitude)) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, message: "Per-strike Net GEX proxy is inconsistent" });
      }
      if (row.callContractCount + row.putContractCount === 0) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, message: "GEX strike row requires an eligible contract" });
      }
    }

    if (available) {
      const callTotal = value.strikes.reduce((sum, row) => sum + row.callGammaExposure, 0);
      const putTotal = value.strikes.reduce((sum, row) => sum + row.putGammaExposureMagnitude, 0);
      const netTotal = callTotal - putTotal;
      if (
        value.returnedWindowCallGammaExposure === null ||
        value.returnedWindowPutGammaExposureMagnitude === null ||
        value.returnedWindowNetGammaExposureProxy === null ||
        !closeEnough(value.returnedWindowCallGammaExposure, callTotal) ||
        !closeEnough(value.returnedWindowPutGammaExposureMagnitude, putTotal) ||
        !closeEnough(value.returnedWindowNetGammaExposureProxy, netTotal)
      ) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, message: "Returned-window GEX totals are inconsistent" });
      }

      const callCount = value.strikes.reduce((sum, row) => sum + row.callContractCount, 0);
      const putCount = value.strikes.reduce((sum, row) => sum + row.putContractCount, 0);
      if (callCount !== value.eligibleCallContractCount || putCount !== value.eligiblePutContractCount) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, message: "Eligible GEX contract counts are inconsistent" });
      }
    }
  });
export type SpyZeroDteGexProxyResponse = z.infer<typeof SpyZeroDteGexProxyResponseSchema>;


/** Deterministic availability and coverage for the returned-window SPY 0DTE DEX proxy. */
export const DexMetricStateSchema = z.enum(["LIVE", "STALE", "UNAVAILABLE"]);
export type DexMetricState = z.infer<typeof DexMetricStateSchema>;

export const DexCoverageStateSchema = z.enum(["COMPLETE", "PARTIAL", "UNAVAILABLE"]);
export type DexCoverageState = z.infer<typeof DexCoverageStateSchema>;

export const DexCoverageScopeSchema = z.literal("RETURNED_CHAIN_WINDOW");
export type DexCoverageScope = z.infer<typeof DexCoverageScopeSchema>;

export const DexMethodologySchema = z.literal("OI_WEIGHTED_DELTA_NOTIONAL");
export type DexMethodology = z.infer<typeof DexMethodologySchema>;

export const DexWarningCodeSchema = z.enum([
  "AUTH_REQUIRED",
  "DATABASE_ERROR",
  "OPTIONS_ACCESS_UNAVAILABLE",
  "NO_CURRENT_DATE_EXPIRATION",
  "OPTIONS_CHAIN_UNAVAILABLE",
  "UNDERLYING_PRICE_UNAVAILABLE",
  "NO_ELIGIBLE_DEX_CONTRACTS",
  "INVALID_DEX_INPUTS",
  "PARTIAL_DEX_INPUTS",
  "RETAINED_STALE_CHAIN",
]);
export type DexWarningCode = z.infer<typeof DexWarningCodeSchema>;

export const DexStrikeRowSchema = z.object({
  strikePrice: z.number().finite().positive(),
  callContractCount: z.number().int().nonnegative(),
  putContractCount: z.number().int().nonnegative(),
  callOpenInterest: z.number().int().nonnegative(),
  putOpenInterest: z.number().int().nonnegative(),
  callDeltaExposure: z.number().finite().nonnegative(),
  putDeltaExposureMagnitude: z.number().finite().nonnegative(),
  netDeltaExposureProxy: z.number().finite(),
});
export type DexStrikeRow = z.infer<typeof DexStrikeRowSchema>;

export const SpyZeroDteDexProxyResponseSchema = z
  .object({
    symbol: z.literal("SPY"),
    metric: z.literal("ZERO_DTE_RETURNED_WINDOW_DEX_PROXY"),
    methodology: DexMethodologySchema,
    coverageScope: DexCoverageScopeSchema,
    currentMarketDate: MarketDateSchema,
    expirationDate: MarketDateSchema.nullable(),
    metricState: DexMetricStateSchema,
    sourceState: OptionsChainSourceStateSchema,
    coverageState: DexCoverageStateSchema,
    underlyingPrice: z.number().finite().positive().nullable(),
    underlyingPriceSource: z.enum(["CHAIN_RESPONSE", "UNAVAILABLE"]),
    requestedStrikeCount: z.number().int().positive().nullable(),
    returnedUniqueStrikeCount: z.number().int().nonnegative(),
    minimumReturnedStrike: z.number().finite().positive().nullable(),
    maximumReturnedStrike: z.number().finite().positive().nullable(),
    returnedWindowCallDeltaExposure: z.number().finite().nonnegative().nullable(),
    returnedWindowPutDeltaExposureMagnitude: z.number().finite().nonnegative().nullable(),
    returnedWindowNetDeltaExposureProxy: z.number().finite().nullable(),
    eligibleCallContractCount: z.number().int().nonnegative(),
    eligiblePutContractCount: z.number().int().nonnegative(),
    excludedCallContractCount: z.number().int().nonnegative(),
    excludedPutContractCount: z.number().int().nonnegative(),
    contractsMissingDelta: z.number().int().nonnegative(),
    contractsWithInvalidDelta: z.number().int().nonnegative(),
    contractsMissingOpenInterest: z.number().int().nonnegative(),
    contractsMissingMultiplier: z.number().int().nonnegative(),
    nonstandardContractsExcluded: z.number().int().nonnegative(),
    miniContractsExcluded: z.number().int().nonnegative(),
    invalidMultiplierContractsExcluded: z.number().int().nonnegative(),
    duplicateContractsExcluded: z.number().int().nonnegative(),
    outOfScopeContractsExcluded: z.number().int().nonnegative(),
    upstreamRejectedContractCount: z.number().int().nonnegative(),
    eligibleStrikeCount: z.number().int().nonnegative(),
    strikes: z.array(DexStrikeRowSchema),
    latestOptionQuoteAt: z.string().datetime().nullable(),
    chainFetchedAt: z.string().datetime().nullable(),
    fetchedAt: z.string().datetime(),
    dataAgeMs: z.number().nonnegative(),
    warningCode: DexWarningCodeSchema.nullable(),
  })
  .superRefine((value, ctx) => {
    const available = value.metricState !== "UNAVAILABLE";
    const totals = [
      value.returnedWindowCallDeltaExposure,
      value.returnedWindowPutDeltaExposureMagnitude,
      value.returnedWindowNetDeltaExposureProxy,
    ];

    if (value.expirationDate !== null && value.expirationDate !== value.currentMarketDate) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: "DEX proxy must use current-date expiration" });
    }

    if ((value.underlyingPrice === null) !== (value.underlyingPriceSource === "UNAVAILABLE")) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: "DEX underlying source is inconsistent" });
    }

    if (available) {
      if (
        value.expirationDate === null ||
        value.underlyingPrice === null ||
        value.chainFetchedAt === null ||
        value.coverageState === "UNAVAILABLE" ||
        value.strikes.length === 0 ||
        totals.some((item) => item === null)
      ) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "Available DEX proxy requires a current chain snapshot, strike rows, and totals",
        });
      }
      if (value.sourceState !== value.metricState) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, message: "DEX proxy cannot exceed chain provenance" });
      }
    } else if (
      value.coverageState !== "UNAVAILABLE" ||
      value.strikes.length > 0 ||
      totals.some((item) => item !== null)
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Unavailable DEX proxy cannot expose totals or strike rows",
      });
    }

    if (value.eligibleStrikeCount !== value.strikes.length) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: "Eligible DEX strike count is inconsistent" });
    }

    const sorted = [...value.strikes].sort((a, b) => a.strikePrice - b.strikePrice);
    if (value.strikes.some((row, index) => row.strikePrice !== sorted[index]?.strikePrice)) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: "DEX strike rows must be sorted ascending" });
    }

    for (const row of value.strikes) {
      if (!closeEnough(row.netDeltaExposureProxy, row.callDeltaExposure - row.putDeltaExposureMagnitude)) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, message: "Per-strike Net DEX proxy is inconsistent" });
      }
      if (row.callContractCount + row.putContractCount === 0) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, message: "DEX strike row requires an eligible contract" });
      }
    }

    if (available) {
      const callTotal = value.strikes.reduce((sum, row) => sum + row.callDeltaExposure, 0);
      const putTotal = value.strikes.reduce((sum, row) => sum + row.putDeltaExposureMagnitude, 0);
      const netTotal = callTotal - putTotal;
      if (
        value.returnedWindowCallDeltaExposure === null ||
        value.returnedWindowPutDeltaExposureMagnitude === null ||
        value.returnedWindowNetDeltaExposureProxy === null ||
        !closeEnough(value.returnedWindowCallDeltaExposure, callTotal) ||
        !closeEnough(value.returnedWindowPutDeltaExposureMagnitude, putTotal) ||
        !closeEnough(value.returnedWindowNetDeltaExposureProxy, netTotal)
      ) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, message: "Returned-window DEX totals are inconsistent" });
      }

      const callCount = value.strikes.reduce((sum, row) => sum + row.callContractCount, 0);
      const putCount = value.strikes.reduce((sum, row) => sum + row.putContractCount, 0);
      if (callCount !== value.eligibleCallContractCount || putCount !== value.eligiblePutContractCount) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, message: "Eligible DEX contract counts are inconsistent" });
      }
    }
  });
export type SpyZeroDteDexProxyResponse = z.infer<typeof SpyZeroDteDexProxyResponseSchema>;

/** Integration-only readiness for the assembled SPY market context. */
export const MarketContextStateSchema = z.enum(["READY", "DEGRADED", "UNAVAILABLE"]);
export type MarketContextState = z.infer<typeof MarketContextStateSchema>;

export const MarketContextComponentStatusValueSchema = z.enum([
  "AVAILABLE",
  "STALE",
  "PARTIAL",
  "NOT_APPLICABLE",
  "UNAVAILABLE",
]);
export type MarketContextComponentStatusValue = z.infer<
  typeof MarketContextComponentStatusValueSchema
>;

export const MarketContextRequirementSchema = z.enum([
  "REQUIRED",
  "SESSION_CONDITIONALLY_REQUIRED",
  "OPTIONAL_ENRICHMENT",
]);
export type MarketContextRequirement = z.infer<typeof MarketContextRequirementSchema>;

export const MarketContextComponentSchema = z.enum([
  "QUOTE",
  "CANDLES",
  "SESSION_DATA",
  "VWAP",
  "SESSION_LEVELS",
  "GAP",
  "OPENING_RANGE",
  "OPTIONS_CHAIN",
  "EXPECTED_MOVE",
  "GEX",
  "DEX",
]);
export type MarketContextComponent = z.infer<typeof MarketContextComponentSchema>;

export const MarketContextWarningCodeSchema = z.enum([
  "AUTH_REQUIRED",
  "CURRENT_PRICE_UNAVAILABLE",
  "CURRENT_SESSION_DATA_UNAVAILABLE",
  "PARTIAL_MARKET_CONTEXT",
  "RETAINED_STALE_COMPONENTS",
]);
export type MarketContextWarningCode = z.infer<typeof MarketContextWarningCodeSchema>;

export const MarketContextSessionWindowSchema = z.enum([
  "PREMARKET",
  "RTH",
  "AFTER_HOURS",
  "CLOSED",
]);
export type MarketContextSessionWindow = z.infer<typeof MarketContextSessionWindowSchema>;

export const MarketContextComponentStatusSchema = z.object({
  component: MarketContextComponentSchema,
  status: MarketContextComponentStatusValueSchema,
  requirement: MarketContextRequirementSchema,
  applicable: z.boolean(),
  dependencyGroup: z.enum(["OPTIONS_CHAIN", "BOUNDED_CANDLES"]).nullable(),
  sourceState: z.string().nullable(),
  metricState: z.string().nullable(),
  coverageState: z.string().nullable(),
  currentMarketDate: MarketDateSchema.nullable(),
  sessionDate: MarketDateSchema.nullable(),
  expirationDate: MarketDateSchema.nullable(),
  latestDataAt: z.string().datetime().nullable(),
  fetchedAt: z.string().datetime().nullable(),
  dataAgeMs: z.number().nonnegative().nullable(),
  warningCode: z.string().nullable(),
});
export type MarketContextComponentStatus = z.infer<typeof MarketContextComponentStatusSchema>;

export const MarketContextComponentWarningSchema = z.object({
  component: MarketContextComponentSchema,
  warningCode: z.string().min(1),
  dependencyGroup: z.enum(["OPTIONS_CHAIN", "BOUNDED_CANDLES"]).nullable(),
});
export type MarketContextComponentWarning = z.infer<typeof MarketContextComponentWarningSchema>;

export const MarketContextQuoteSchema = SpyQuoteSchema.pick({
  symbol: true,
  lastPrice: true,
  bidPrice: true,
  askPrice: true,
  volume: true,
  quoteTimestamp: true,
  fetchedAt: true,
  marketStatus: true,
  sourceState: true,
  dataAgeMs: true,
  warningCode: true,
});
export type MarketContextQuote = z.infer<typeof MarketContextQuoteSchema>;

export const MarketContextCandleSummarySchema = z.object({
  marketDate: MarketDateSchema.nullable(),
  timeframe: z.literal("5m"),
  sourceState: QuoteSourceStateSchema,
  candleCount: z.number().int().nonnegative(),
  sessionOpen: z.number().finite().positive().nullable(),
  sessionHigh: z.number().finite().positive().nullable(),
  sessionLow: z.number().finite().positive().nullable(),
  latestCandle: SpyCandleSchema.nullable(),
  previousCandle: SpyCandleSchema.nullable(),
  latestCandleAt: z.string().datetime().nullable(),
  fetchedAt: z.string().datetime(),
  dataAgeMs: z.number().nonnegative(),
  warningCode: CandleWarningCodeSchema.nullable(),
});
export type MarketContextCandleSummary = z.infer<typeof MarketContextCandleSummarySchema>;

export const MarketContextSessionSummarySchema = z.object({
  currentMarketDate: MarketDateSchema,
  currentSessionWindow: MarketContextSessionWindowSchema,
  currentObservedMarketDate: MarketDateSchema.nullable(),
  previousObservedMarketDate: MarketDateSchema.nullable(),
  mostRecentRthSessionDate: MarketDateSchema.nullable(),
  sourceState: QuoteSourceStateSchema,
  fetchedAt: z.string().datetime(),
  dataAgeMs: z.number().nonnegative(),
  warningCode: CandleWarningCodeSchema.nullable(),
});
export type MarketContextSessionSummary = z.infer<typeof MarketContextSessionSummarySchema>;

export const MarketContextVwapSummarySchema = SpyRthVwapResponseSchema.pick({
  marketDate: true,
  metricState: true,
  candleSourceState: true,
  latestVwap: true,
  latestRthCandleAt: true,
  rthCandleCount: true,
  fetchedAt: true,
  dataAgeMs: true,
  warningCode: true,
});
export type MarketContextVwapSummary = z.infer<typeof MarketContextVwapSummarySchema>;

export const MarketContextSessionLevelsSummarySchema = SpySessionLevelsResponseSchema.pick({
  currentMarketDate: true,
  currentMarketDateHasDefinedSessionData: true,
  previousRthMarketDate: true,
  candleSourceState: true,
  premarketCoverageState: true,
  previousRthCoverageState: true,
  premarketHigh: true,
  premarketLow: true,
  previousDayHigh: true,
  previousDayLow: true,
  previousDayClose: true,
  fetchedAt: true,
  dataAgeMs: true,
  latestCandleAt: true,
  warningCode: true,
});
export type MarketContextSessionLevelsSummary = z.infer<
  typeof MarketContextSessionLevelsSummarySchema
>;

export const MarketContextGapSummarySchema = z.object({
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
  firstObservedFillCandleAt: z.string().datetime().nullable(),
  currentRthCoverageState: CoverageStateSchema,
  previousRthCoverageState: CoverageStateSchema,
  latestRthCandleAt: z.string().datetime().nullable(),
  fetchedAt: z.string().datetime(),
  dataAgeMs: z.number().nonnegative(),
  warningCode: GapWarningCodeSchema.nullable(),
});
export type MarketContextGapSummary = z.infer<typeof MarketContextGapSummarySchema>;

export const MarketContextOpeningRangeSummarySchema = z.object({
  currentMarketDate: MarketDateSchema,
  metricState: OpeningRangeMetricStateSchema,
  candleSourceState: QuoteSourceStateSchema,
  phase: OpeningRangePhaseSchema,
  openingRangeHigh: z.number().finite().positive().nullable(),
  openingRangeLow: z.number().finite().positive().nullable(),
  openingRangeStartAt: z.string().datetime().nullable(),
  openingRangeEndAt: z.string().datetime().nullable(),
  openingRangeCandleCount: z.number().int().min(0).max(3),
  coverageState: CoverageStateSchema,
  firstOpeningRangeCandleAt: z.string().datetime().nullable(),
  latestOpeningRangeCandleAt: z.string().datetime().nullable(),
  fetchedAt: z.string().datetime(),
  dataAgeMs: z.number().nonnegative(),
  warningCode: OpeningRangeWarningCodeSchema.nullable(),
});
export type MarketContextOpeningRangeSummary = z.infer<
  typeof MarketContextOpeningRangeSummarySchema
>;

export const MarketContextOptionsSummarySchema = z.object({
  underlyingPrice: z.number().finite().positive().nullable(),
  underlyingPriceSource: OptionsUnderlyingPriceSourceSchema,
  currentMarketDate: MarketDateSchema,
  requestedExpirationDate: MarketDateSchema,
  returnedExpirationDate: MarketDateSchema.nullable(),
  requestedStrikeCount: z.number().int().positive(),
  returnedUniqueStrikeCount: z.number().int().nonnegative(),
  minimumReturnedStrike: z.number().finite().positive().nullable(),
  maximumReturnedStrike: z.number().finite().positive().nullable(),
  atmStrike: z.number().finite().positive().nullable(),
  callContractCount: z.number().int().nonnegative(),
  putContractCount: z.number().int().nonnegative(),
  rejectedContractCount: z.number().int().nonnegative(),
  sourceState: OptionsChainSourceStateSchema,
  metricState: OptionsChainMetricStateSchema,
  latestOptionQuoteAt: z.string().datetime().nullable(),
  chainFetchedAt: z.string().datetime(),
  dataAgeMs: z.number().nonnegative(),
  warningCode: OptionsChainWarningCodeSchema.nullable(),
});
export type MarketContextOptionsSummary = z.infer<typeof MarketContextOptionsSummarySchema>;

export const MarketContextExpectedMoveSummarySchema = z.object({
  methodology: ExpectedMoveMethodologySchema,
  currentMarketDate: MarketDateSchema,
  expirationDate: MarketDateSchema.nullable(),
  metricState: ExpectedMoveMetricStateSchema,
  sourceState: OptionsChainSourceStateSchema,
  underlyingPrice: z.number().finite().positive().nullable(),
  underlyingPriceSource: z.enum(["CHAIN_RESPONSE", "UNAVAILABLE"]),
  atmStrike: z.number().finite().positive().nullable(),
  callContractSymbol: z.string().min(1).nullable(),
  putContractSymbol: z.string().min(1).nullable(),
  callMark: z.number().finite().nonnegative().nullable(),
  putMark: z.number().finite().nonnegative().nullable(),
  impliedMovePoints: z.number().finite().nonnegative().nullable(),
  impliedMovePercent: z.number().finite().nonnegative().nullable(),
  upperImpliedMoveLevel: z.number().finite().positive().nullable(),
  lowerImpliedMoveLevel: z.number().finite().nullable(),
  callQuoteAt: z.string().datetime().nullable(),
  putQuoteAt: z.string().datetime().nullable(),
  latestSelectedContractQuoteAt: z.string().datetime().nullable(),
  chainFetchedAt: z.string().datetime().nullable(),
  fetchedAt: z.string().datetime(),
  dataAgeMs: z.number().nonnegative(),
  warningCode: ExpectedMoveWarningCodeSchema.nullable(),
});
export type MarketContextExpectedMoveSummary = z.infer<
  typeof MarketContextExpectedMoveSummarySchema
>;

export const MarketContextGexSummarySchema = z.object({
  methodology: GexMethodologySchema,
  coverageScope: GexCoverageScopeSchema,
  currentMarketDate: MarketDateSchema,
  expirationDate: MarketDateSchema.nullable(),
  metricState: GexMetricStateSchema,
  sourceState: OptionsChainSourceStateSchema,
  coverageState: GexCoverageStateSchema,
  underlyingPrice: z.number().finite().positive().nullable(),
  requestedStrikeCount: z.number().int().positive().nullable(),
  returnedUniqueStrikeCount: z.number().int().nonnegative(),
  minimumReturnedStrike: z.number().finite().positive().nullable(),
  maximumReturnedStrike: z.number().finite().positive().nullable(),
  returnedWindowCallGammaExposure: z.number().finite().nonnegative().nullable(),
  returnedWindowPutGammaExposureMagnitude: z.number().finite().nonnegative().nullable(),
  returnedWindowNetGammaExposureProxy: z.number().finite().nullable(),
  eligibleCallContractCount: z.number().int().nonnegative(),
  eligiblePutContractCount: z.number().int().nonnegative(),
  eligibleStrikeCount: z.number().int().nonnegative(),
  latestOptionQuoteAt: z.string().datetime().nullable(),
  chainFetchedAt: z.string().datetime().nullable(),
  fetchedAt: z.string().datetime(),
  dataAgeMs: z.number().nonnegative(),
  warningCode: GexWarningCodeSchema.nullable(),
});
export type MarketContextGexSummary = z.infer<typeof MarketContextGexSummarySchema>;

export const MarketContextDexSummarySchema = z.object({
  methodology: DexMethodologySchema,
  coverageScope: DexCoverageScopeSchema,
  currentMarketDate: MarketDateSchema,
  expirationDate: MarketDateSchema.nullable(),
  metricState: DexMetricStateSchema,
  sourceState: OptionsChainSourceStateSchema,
  coverageState: DexCoverageStateSchema,
  underlyingPrice: z.number().finite().positive().nullable(),
  requestedStrikeCount: z.number().int().positive().nullable(),
  returnedUniqueStrikeCount: z.number().int().nonnegative(),
  minimumReturnedStrike: z.number().finite().positive().nullable(),
  maximumReturnedStrike: z.number().finite().positive().nullable(),
  returnedWindowCallDeltaExposure: z.number().finite().nonnegative().nullable(),
  returnedWindowPutDeltaExposureMagnitude: z.number().finite().nonnegative().nullable(),
  returnedWindowNetDeltaExposureProxy: z.number().finite().nullable(),
  eligibleCallContractCount: z.number().int().nonnegative(),
  eligiblePutContractCount: z.number().int().nonnegative(),
  eligibleStrikeCount: z.number().int().nonnegative(),
  latestOptionQuoteAt: z.string().datetime().nullable(),
  chainFetchedAt: z.string().datetime().nullable(),
  fetchedAt: z.string().datetime(),
  dataAgeMs: z.number().nonnegative(),
  warningCode: DexWarningCodeSchema.nullable(),
});
export type MarketContextDexSummary = z.infer<typeof MarketContextDexSummarySchema>;

export const SpyZeroDteMarketContextResponseSchema = z.object({
  symbol: z.literal("SPY"),
  product: z.literal("SPY_ZERO_DTE_MARKET_CONTEXT"),
  currentMarketDate: MarketDateSchema,
  mostRecentRthSessionDate: MarketDateSchema.nullable(),
  assembledAt: z.string().datetime(),
  contextState: MarketContextStateSchema,
  quote: MarketContextQuoteSchema,
  candles: MarketContextCandleSummarySchema,
  session: MarketContextSessionSummarySchema,
  vwap: MarketContextVwapSummarySchema,
  sessionLevels: MarketContextSessionLevelsSummarySchema,
  gap: MarketContextGapSummarySchema,
  openingRange: MarketContextOpeningRangeSummarySchema,
  options: MarketContextOptionsSummarySchema,
  expectedMove: MarketContextExpectedMoveSummarySchema,
  gex: MarketContextGexSummarySchema,
  dex: MarketContextDexSummarySchema,
  components: z.array(MarketContextComponentStatusSchema).length(11),
  componentWarnings: z.array(MarketContextComponentWarningSchema),
  warningCode: MarketContextWarningCodeSchema.nullable(),
});
export type SpyZeroDteMarketContextResponse = z.infer<
  typeof SpyZeroDteMarketContextResponseSchema
>;

/** Deterministic, recommendation-free feature layer derived only from Unified Market Context. */
export const MarketStateEngineStateSchema = z.enum(["AVAILABLE", "PARTIAL", "UNAVAILABLE"]);
export type MarketStateEngineState = z.infer<typeof MarketStateEngineStateSchema>;

export const MarketStateFeatureStatusSchema = z.enum([
  "AVAILABLE",
  "PARTIAL",
  "NOT_APPLICABLE",
  "UNAVAILABLE",
]);
export type MarketStateFeatureStatus = z.infer<typeof MarketStateFeatureStatusSchema>;

export const MarketStateFeatureIdSchema = z.enum([
  "SESSION_PHASE",
  "PRICE_VS_VWAP",
  "PRICE_VS_PRIOR_DAY_RANGE",
  "PRICE_VS_PREMARKET_RANGE",
  "PRICE_VS_OPENING_RANGE",
  "RTH_GAP_CONTEXT",
  "PRICE_VS_EXPECTED_MOVE_RANGE",
  "RETURNED_WINDOW_NET_GEX_SIGN",
  "RETURNED_WINDOW_NET_DEX_SIGN",
]);
export type MarketStateFeatureId = z.infer<typeof MarketStateFeatureIdSchema>;

export const MarketStateFeatureVersionSchema = z.literal("V1");
export type MarketStateFeatureVersion = z.infer<typeof MarketStateFeatureVersionSchema>;

export const MarketStatePriceSourceSchema = z.literal("QUOTE_LAST_PRICE");
export type MarketStatePriceSource = z.infer<typeof MarketStatePriceSourceSchema>;

export const MarketStateReferenceDateRelationSchema = z.enum([
  "CURRENT_MARKET_DATE",
  "MOST_RECENT_RTH_SESSION",
  "PREVIOUS_RTH_SESSION",
  "CURRENT_EXPIRATION",
  "UNKNOWN",
]);
export type MarketStateReferenceDateRelation = z.infer<
  typeof MarketStateReferenceDateRelationSchema
>;

export const MarketStateRangePositionSchema = z.enum([
  "ABOVE_RANGE",
  "AT_HIGH",
  "AT_BOUNDARY",
  "INSIDE_RANGE",
  "AT_LOW",
  "BELOW_RANGE",
]);
export type MarketStateRangePosition = z.infer<typeof MarketStateRangePositionSchema>;

export const MarketStateExpectedMovePositionSchema = z.enum([
  "ABOVE_UPPER",
  "AT_UPPER",
  "AT_BOUNDARY",
  "INSIDE_RANGE",
  "AT_LOWER",
  "BELOW_LOWER",
]);
export type MarketStateExpectedMovePosition = z.infer<
  typeof MarketStateExpectedMovePositionSchema
>;

export const MarketStateSignSchema = z.enum(["POSITIVE", "NEGATIVE", "ZERO"]);
export type MarketStateSign = z.infer<typeof MarketStateSignSchema>;

export const MarketStateOverallWarningCodeSchema = z.enum([
  "MARKET_CONTEXT_UNAVAILABLE",
  "CURRENT_PRICE_UNAVAILABLE",
  "REQUIRED_FEATURES_UNAVAILABLE",
  "PARTIAL_MARKET_STATE",
]);
export type MarketStateOverallWarningCode = z.infer<
  typeof MarketStateOverallWarningCodeSchema
>;

const MarketStateFeatureAuditBase = {
  featureVersion: MarketStateFeatureVersionSchema,
  status: MarketStateFeatureStatusSchema,
  referenceDate: MarketDateSchema.nullable(),
  referenceDateRelation: MarketStateReferenceDateRelationSchema.nullable(),
  warningCode: z.string().min(1).nullable(),
};

export const SessionPhaseFeatureSchema = z.object({
  featureId: z.literal("SESSION_PHASE"),
  ...MarketStateFeatureAuditBase,
  state: MarketContextSessionWindowSchema.nullable(),
  sourceComponents: z.tuple([z.literal("SESSION_DATA")]),
  inputs: z.object({
    currentMarketDate: MarketDateSchema,
    currentSessionWindow: MarketContextSessionWindowSchema,
    currentObservedMarketDate: MarketDateSchema.nullable(),
    sourceState: QuoteSourceStateSchema,
  }),
  derived: z.object({}),
});
export type SessionPhaseFeature = z.infer<typeof SessionPhaseFeatureSchema>;

export const PriceVsVwapFeatureSchema = z.object({
  featureId: z.literal("PRICE_VS_VWAP"),
  ...MarketStateFeatureAuditBase,
  state: z.enum(["ABOVE", "BELOW", "EQUAL"]).nullable(),
  sourceComponents: z.tuple([z.literal("QUOTE"), z.literal("VWAP")]),
  inputs: z.object({
    price: z.number().finite().positive().nullable(),
    priceSource: MarketStatePriceSourceSchema.nullable(),
    vwap: z.number().finite().positive().nullable(),
    vwapMarketDate: MarketDateSchema.nullable(),
    quoteSourceState: QuoteSourceStateSchema,
    vwapMetricState: VwapMetricStateSchema,
    vwapSourceState: QuoteSourceStateSchema,
  }),
  derived: z.object({
    distancePoints: z.number().finite().nullable(),
    distancePercent: z.number().finite().nullable(),
  }),
});
export type PriceVsVwapFeature = z.infer<typeof PriceVsVwapFeatureSchema>;

export const PriceVsPriorDayRangeFeatureSchema = z.object({
  featureId: z.literal("PRICE_VS_PRIOR_DAY_RANGE"),
  ...MarketStateFeatureAuditBase,
  state: MarketStateRangePositionSchema.nullable(),
  sourceComponents: z.tuple([z.literal("QUOTE"), z.literal("SESSION_LEVELS")]),
  inputs: z.object({
    price: z.number().finite().positive().nullable(),
    priceSource: MarketStatePriceSourceSchema.nullable(),
    previousDayHigh: z.number().finite().positive().nullable(),
    previousDayLow: z.number().finite().positive().nullable(),
    previousDayHighState: SessionLevelStateSchema,
    previousDayLowState: SessionLevelStateSchema,
    previousRthMarketDate: MarketDateSchema.nullable(),
    previousRthCoverageState: CoverageStateSchema,
  }),
  derived: z.object({
    distanceToHighPoints: z.number().finite().nullable(),
    distanceToLowPoints: z.number().finite().nullable(),
  }),
});
export type PriceVsPriorDayRangeFeature = z.infer<
  typeof PriceVsPriorDayRangeFeatureSchema
>;

export const PriceVsPremarketRangeFeatureSchema = z.object({
  featureId: z.literal("PRICE_VS_PREMARKET_RANGE"),
  ...MarketStateFeatureAuditBase,
  state: MarketStateRangePositionSchema.nullable(),
  sourceComponents: z.tuple([z.literal("QUOTE"), z.literal("SESSION_LEVELS")]),
  inputs: z.object({
    price: z.number().finite().positive().nullable(),
    priceSource: MarketStatePriceSourceSchema.nullable(),
    premarketHigh: z.number().finite().positive().nullable(),
    premarketLow: z.number().finite().positive().nullable(),
    premarketHighState: SessionLevelStateSchema,
    premarketLowState: SessionLevelStateSchema,
    currentMarketDate: MarketDateSchema,
    currentSessionWindow: MarketContextSessionWindowSchema,
    currentMarketDateHasDefinedSessionData: z.boolean(),
    premarketCoverageState: CoverageStateSchema,
  }),
  derived: z.object({
    distanceToHighPoints: z.number().finite().nullable(),
    distanceToLowPoints: z.number().finite().nullable(),
  }),
});
export type PriceVsPremarketRangeFeature = z.infer<
  typeof PriceVsPremarketRangeFeatureSchema
>;

export const PriceVsOpeningRangeFeatureSchema = z.object({
  featureId: z.literal("PRICE_VS_OPENING_RANGE"),
  ...MarketStateFeatureAuditBase,
  state: z.union([MarketStateRangePositionSchema, z.enum(["NOT_STARTED", "FORMING"])]).nullable(),
  sourceComponents: z.tuple([z.literal("QUOTE"), z.literal("OPENING_RANGE")]),
  inputs: z.object({
    price: z.number().finite().positive().nullable(),
    priceSource: MarketStatePriceSourceSchema.nullable(),
    openingRangeHigh: z.number().finite().positive().nullable(),
    openingRangeLow: z.number().finite().positive().nullable(),
    phase: OpeningRangePhaseSchema,
    currentMarketDate: MarketDateSchema,
    metricState: OpeningRangeMetricStateSchema,
    sourceState: QuoteSourceStateSchema,
    coverageState: CoverageStateSchema,
  }),
  derived: z.object({
    distanceToHighPoints: z.number().finite().nullable(),
    distanceToLowPoints: z.number().finite().nullable(),
  }),
});
export type PriceVsOpeningRangeFeature = z.infer<
  typeof PriceVsOpeningRangeFeatureSchema
>;

export const RthGapContextFeatureSchema = z.object({
  featureId: z.literal("RTH_GAP_CONTEXT"),
  ...MarketStateFeatureAuditBase,
  state: z.enum(["UP", "DOWN", "FLAT"]).nullable(),
  sourceComponents: z.tuple([z.literal("GAP")]),
  inputs: z.object({
    currentMarketDate: MarketDateSchema,
    previousRthMarketDate: MarketDateSchema.nullable(),
    currentRthOpen: z.number().finite().positive().nullable(),
    previousDayClose: z.number().finite().positive().nullable(),
    gapPoints: z.number().finite().nullable(),
    gapPercent: z.number().finite().nullable(),
    direction: GapDirectionSchema,
    fillState: GapFillStateSchema,
    firstObservedFillCandleAt: z.string().datetime().nullable(),
    metricState: GapMetricStateSchema,
    sourceState: QuoteSourceStateSchema,
    currentRthCoverageState: CoverageStateSchema,
    previousRthCoverageState: CoverageStateSchema,
  }),
  derived: z.object({}),
});
export type RthGapContextFeature = z.infer<typeof RthGapContextFeatureSchema>;

export const PriceVsExpectedMoveRangeFeatureSchema = z.object({
  featureId: z.literal("PRICE_VS_EXPECTED_MOVE_RANGE"),
  ...MarketStateFeatureAuditBase,
  state: MarketStateExpectedMovePositionSchema.nullable(),
  sourceComponents: z.tuple([z.literal("QUOTE"), z.literal("EXPECTED_MOVE")]),
  inputs: z.object({
    price: z.number().finite().positive().nullable(),
    priceSource: MarketStatePriceSourceSchema.nullable(),
    upperImpliedMoveLevel: z.number().finite().positive().nullable(),
    lowerImpliedMoveLevel: z.number().finite().nullable(),
    expirationDate: MarketDateSchema.nullable(),
    currentMarketDate: MarketDateSchema,
    metricState: ExpectedMoveMetricStateSchema,
    sourceState: OptionsChainSourceStateSchema,
  }),
  derived: z.object({
    distanceToUpperPoints: z.number().finite().nullable(),
    distanceToLowerPoints: z.number().finite().nullable(),
  }),
});
export type PriceVsExpectedMoveRangeFeature = z.infer<
  typeof PriceVsExpectedMoveRangeFeatureSchema
>;

export const NetGexProxySignFeatureSchema = z.object({
  featureId: z.literal("RETURNED_WINDOW_NET_GEX_SIGN"),
  ...MarketStateFeatureAuditBase,
  state: MarketStateSignSchema.nullable(),
  sourceComponents: z.tuple([z.literal("GEX")]),
  inputs: z.object({
    netGammaExposureProxy: z.number().finite().nullable(),
    methodology: GexMethodologySchema,
    coverageScope: GexCoverageScopeSchema,
    coverageState: GexCoverageStateSchema,
    metricState: GexMetricStateSchema,
    sourceState: OptionsChainSourceStateSchema,
    eligibleStrikeCount: z.number().int().nonnegative(),
    expirationDate: MarketDateSchema.nullable(),
  }),
  derived: z.object({}),
});
export type NetGexProxySignFeature = z.infer<typeof NetGexProxySignFeatureSchema>;

export const NetDexProxySignFeatureSchema = z.object({
  featureId: z.literal("RETURNED_WINDOW_NET_DEX_SIGN"),
  ...MarketStateFeatureAuditBase,
  state: MarketStateSignSchema.nullable(),
  sourceComponents: z.tuple([z.literal("DEX")]),
  inputs: z.object({
    netDeltaExposureProxy: z.number().finite().nullable(),
    methodology: DexMethodologySchema,
    coverageScope: DexCoverageScopeSchema,
    coverageState: DexCoverageStateSchema,
    metricState: DexMetricStateSchema,
    sourceState: OptionsChainSourceStateSchema,
    eligibleStrikeCount: z.number().int().nonnegative(),
    expirationDate: MarketDateSchema.nullable(),
  }),
  derived: z.object({}),
});
export type NetDexProxySignFeature = z.infer<typeof NetDexProxySignFeatureSchema>;

export const MarketStateFeatureStatusEntrySchema = z.object({
  featureId: MarketStateFeatureIdSchema,
  status: MarketStateFeatureStatusSchema,
  warningCode: z.string().min(1).nullable(),
});
export type MarketStateFeatureStatusEntry = z.infer<
  typeof MarketStateFeatureStatusEntrySchema
>;

export const MarketStateFeatureWarningSchema = z.object({
  featureId: MarketStateFeatureIdSchema,
  warningCode: z.string().min(1),
});
export type MarketStateFeatureWarning = z.infer<typeof MarketStateFeatureWarningSchema>;

export const SpyZeroDteDeterministicMarketStateResponseSchema = z
  .object({
    symbol: z.literal("SPY"),
    product: z.literal("SPY_ZERO_DTE_DETERMINISTIC_MARKET_STATE"),
    engineVersion: MarketStateFeatureVersionSchema,
    currentMarketDate: MarketDateSchema,
    mostRecentRthSessionDate: MarketDateSchema.nullable(),
    sourceContextState: MarketContextStateSchema,
    sourceContextAssembledAt: z.string().datetime(),
    calculatedAt: z.string().datetime(),
    engineState: MarketStateEngineStateSchema,
    price: z.number().finite().positive().nullable(),
    priceSource: MarketStatePriceSourceSchema.nullable(),
    quoteTimestamp: z.string().datetime().nullable(),
    quoteSourceState: QuoteSourceStateSchema,
    features: z.object({
      sessionPhase: SessionPhaseFeatureSchema,
      priceVsVwap: PriceVsVwapFeatureSchema,
      priceVsPriorDayRange: PriceVsPriorDayRangeFeatureSchema,
      priceVsPremarketRange: PriceVsPremarketRangeFeatureSchema,
      priceVsOpeningRange: PriceVsOpeningRangeFeatureSchema,
      gapContext: RthGapContextFeatureSchema,
      priceVsExpectedMoveRange: PriceVsExpectedMoveRangeFeatureSchema,
      netGexProxySign: NetGexProxySignFeatureSchema,
      netDexProxySign: NetDexProxySignFeatureSchema,
    }),
    featureStatuses: z.array(MarketStateFeatureStatusEntrySchema).length(9),
    featureWarnings: z.array(MarketStateFeatureWarningSchema),
    warningCode: MarketStateOverallWarningCodeSchema.nullable(),
  })
  .superRefine((value, ctx) => {
    if ((value.price === null) !== (value.priceSource === null)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Market-State price and priceSource must be jointly available or unavailable",
      });
    }

    const features = Object.values(value.features);
    const ids = new Set(features.map((feature) => feature.featureId));
    if (ids.size !== 9) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: "Market-State feature IDs must be unique" });
    }

    const statusById = new Map(value.featureStatuses.map((item) => [item.featureId, item]));
    for (const feature of features) {
      const entry = statusById.get(feature.featureId);
      if (!entry || entry.status !== feature.status || entry.warningCode !== feature.warningCode) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: `Market-State status entry is inconsistent for ${feature.featureId}`,
        });
      }
    }
  });
export type SpyZeroDteDeterministicMarketStateResponse = z.infer<
  typeof SpyZeroDteDeterministicMarketStateResponseSchema
>;

/** Deterministic, recommendation-free Bias and Confidence layer derived only from Market State. */
export const BiasMethodologyVersionSchema = z.literal("BIAS_V1");
export type BiasMethodologyVersion = z.infer<typeof BiasMethodologyVersionSchema>;

export const BiasEngineStateSchema = z.enum(["AVAILABLE", "PARTIAL", "UNAVAILABLE"]);
export type BiasEngineState = z.infer<typeof BiasEngineStateSchema>;

export const DeterministicBiasStateSchema = z.enum([
  "BULLISH",
  "BEARISH",
  "NEUTRAL",
  "UNAVAILABLE",
]);
export type DeterministicBiasState = z.infer<typeof DeterministicBiasStateSchema>;

export const BiasEvidenceDirectionSchema = z.enum([
  "BULLISH",
  "BEARISH",
  "NEUTRAL",
  "NON_DIRECTIONAL",
  "NOT_APPLICABLE",
  "UNAVAILABLE",
]);
export type BiasEvidenceDirection = z.infer<typeof BiasEvidenceDirectionSchema>;

export const BiasSourceQualityStateSchema = z.enum(["COMPLETE", "PARTIAL", "UNAVAILABLE"]);
export type BiasSourceQualityState = z.infer<typeof BiasSourceQualityStateSchema>;

export const NeutralBiasReasonSchema = z.enum([
  "BALANCED_DIRECTIONAL_EVIDENCE",
  "ALL_NEUTRAL_DIRECTIONAL_STATES",
]);
export type NeutralBiasReason = z.infer<typeof NeutralBiasReasonSchema>;

export const BiasConfidenceUnitSchema = z.literal("PERCENT");
export const BiasConfidenceMethodologySchema = z.literal(
  "DIRECTIONAL_SUPPORT_TIMES_SUFFICIENCY",
);
export const BiasConfidenceScopeSchema = z.literal("STRUCTURAL_EVIDENCE_ONLY");

export const BiasOverallWarningCodeSchema = z.enum([
  "MARKET_STATE_UNAVAILABLE",
  "CURRENT_PRICE_UNAVAILABLE",
  "INSUFFICIENT_DIRECTIONAL_EVIDENCE",
  "PARTIAL_BIAS_INPUTS",
  "STALE_DIRECTIONAL_INPUTS",
]);
export type BiasOverallWarningCode = z.infer<typeof BiasOverallWarningCodeSchema>;

export const BiasRationaleCodeSchema = z.enum([
  "PRICE_ABOVE_VWAP",
  "PRICE_BELOW_VWAP",
  "PRICE_EQUAL_VWAP",
  "PRICE_ABOVE_PRIOR_DAY_RANGE",
  "PRICE_BELOW_PRIOR_DAY_RANGE",
  "PRICE_AT_PRIOR_DAY_HIGH",
  "PRICE_AT_PRIOR_DAY_LOW",
  "PRICE_AT_PRIOR_DAY_BOUNDARY",
  "PRICE_INSIDE_PRIOR_DAY_RANGE",
  "PRICE_ABOVE_PREMARKET_RANGE",
  "PRICE_BELOW_PREMARKET_RANGE",
  "PRICE_AT_PREMARKET_HIGH",
  "PRICE_AT_PREMARKET_LOW",
  "PRICE_AT_PREMARKET_BOUNDARY",
  "PRICE_INSIDE_PREMARKET_RANGE",
  "PRICE_ABOVE_OPENING_RANGE",
  "PRICE_BELOW_OPENING_RANGE",
  "PRICE_AT_OPENING_RANGE_HIGH",
  "PRICE_AT_OPENING_RANGE_LOW",
  "PRICE_AT_OPENING_RANGE_BOUNDARY",
  "PRICE_INSIDE_OPENING_RANGE",
  "OPENING_RANGE_NOT_STARTED",
  "OPENING_RANGE_FORMING",
  "SESSION_PHASE_NON_DIRECTIONAL",
  "GAP_CONTEXT_NON_DIRECTIONAL",
  "EXPECTED_MOVE_CONTEXT_NON_DIRECTIONAL",
  "GEX_SIGN_NON_DIRECTIONAL",
  "DEX_SIGN_NON_DIRECTIONAL",
  "FEATURE_NOT_APPLICABLE",
  "FEATURE_UNAVAILABLE",
]);
export type BiasRationaleCode = z.infer<typeof BiasRationaleCodeSchema>;

const BiasEvidenceFeatureStateSchema = z.union([
  MarketContextSessionWindowSchema,
  z.enum(["ABOVE", "BELOW", "EQUAL"]),
  MarketStateRangePositionSchema,
  z.enum(["NOT_STARTED", "FORMING"]),
  z.enum(["UP", "DOWN", "FLAT"]),
  MarketStateExpectedMovePositionSchema,
  MarketStateSignSchema,
]);

export const BiasEvidenceItemSchema = z.object({
  featureId: MarketStateFeatureIdSchema,
  featureVersion: MarketStateFeatureVersionSchema,
  featureStatus: MarketStateFeatureStatusSchema,
  featureState: BiasEvidenceFeatureStateSchema.nullable(),
  evidenceDirection: BiasEvidenceDirectionSchema,
  configuredWeight: z.number().finite().nonnegative(),
  appliedWeight: z.number().finite().nonnegative(),
  weightedContribution: z.number().finite(),
  referenceDate: MarketDateSchema.nullable(),
  referenceDateRelation: MarketStateReferenceDateRelationSchema.nullable(),
  sourceComponents: z.array(MarketContextComponentSchema).min(1),
  warningCode: z.string().min(1).nullable(),
  rationaleCode: BiasRationaleCodeSchema,
});
export type BiasEvidenceItem = z.infer<typeof BiasEvidenceItemSchema>;

export const BiasEvidenceWarningSchema = z.object({
  featureId: MarketStateFeatureIdSchema,
  warningCode: z.string().min(1),
});
export type BiasEvidenceWarning = z.infer<typeof BiasEvidenceWarningSchema>;

export const BiasFeatureWeightSchema = z.object({
  featureId: MarketStateFeatureIdSchema,
  weight: z.number().finite().positive(),
});
export type BiasFeatureWeight = z.infer<typeof BiasFeatureWeightSchema>;

export const BiasMethodologySchema = z.object({
  directionalFeatureIds: z.array(MarketStateFeatureIdSchema).length(4),
  nonDirectionalFeatureIds: z.array(MarketStateFeatureIdSchema).length(5),
  featureWeights: z.array(BiasFeatureWeightSchema).length(4),
  minimumUsableDirectionalEvidenceCount: z.number().int().positive(),
  confidenceFormula: z.literal(
    "DIRECTIONAL_SUPPORT_RATIO_X_SUFFICIENCY_RATIO_X_100; NEUTRAL_USES_NEUTRAL_BALANCE_RATIO_X_SUFFICIENCY_RATIO_X_100",
  ),
  partialEvidencePolicy: z.literal(
    "FULL_CONFIGURED_WEIGHT_WITH_PARTIAL_PROVENANCE_NO_NUMERIC_MULTIPLIER",
  ),
});
export type BiasMethodology = z.infer<typeof BiasMethodologySchema>;

export const SpyZeroDteDeterministicBiasResponseSchema = z
  .object({
    symbol: z.literal("SPY"),
    product: z.literal("SPY_ZERO_DTE_DETERMINISTIC_BIAS_CONFIDENCE"),
    methodologyVersion: BiasMethodologyVersionSchema,
    currentMarketDate: MarketDateSchema,
    mostRecentRthSessionDate: MarketDateSchema.nullable(),
    sourceMarketStateEngineVersion: MarketStateFeatureVersionSchema,
    sourceMarketStateEngineState: MarketStateEngineStateSchema,
    sourceMarketStateCalculatedAt: z.string().datetime(),
    calculatedAt: z.string().datetime(),
    engineState: BiasEngineStateSchema,
    biasState: DeterministicBiasStateSchema,
    neutralReason: NeutralBiasReasonSchema.nullable(),
    confidenceScore: z.number().finite().min(0).max(100).nullable(),
    confidenceUnit: BiasConfidenceUnitSchema,
    confidenceMethodology: BiasConfidenceMethodologySchema,
    confidenceScope: BiasConfidenceScopeSchema,
    sourceQualityState: BiasSourceQualityStateSchema,
    minimumUsableDirectionalEvidenceCount: z.number().int().positive(),
    bullishScore: z.number().finite().nonnegative(),
    bearishScore: z.number().finite().nonnegative(),
    netDirectionalScore: z.number().finite(),
    neutralEvidenceWeight: z.number().finite().nonnegative(),
    applicableDirectionalWeight: z.number().finite().nonnegative(),
    usableDirectionalWeight: z.number().finite().nonnegative(),
    usableDirectionalEvidenceCount: z.number().int().nonnegative(),
    applicableDirectionalEvidenceCount: z.number().int().nonnegative(),
    bullishEvidenceCount: z.number().int().nonnegative(),
    bearishEvidenceCount: z.number().int().nonnegative(),
    neutralEvidenceCount: z.number().int().nonnegative(),
    unavailableDirectionalEvidenceCount: z.number().int().nonnegative(),
    notApplicableDirectionalEvidenceCount: z.number().int().nonnegative(),
    directionalSupportRatio: z.number().finite().min(0).max(1).nullable(),
    sufficiencyRatio: z.number().finite().min(0).max(1).nullable(),
    contradictionRatio: z.number().finite().min(0).max(1).nullable(),
    neutralEvidenceRatio: z.number().finite().min(0).max(1).nullable(),
    neutralBalanceRatio: z.number().finite().min(0).max(1).nullable(),
    supportingEvidenceDirection: z.enum(["BULLISH", "BEARISH"]).nullable(),
    counterEvidenceDirection: z.enum(["BULLISH", "BEARISH"]).nullable(),
    bullishEvidence: z.array(BiasEvidenceItemSchema),
    bearishEvidence: z.array(BiasEvidenceItemSchema),
    neutralEvidence: z.array(BiasEvidenceItemSchema),
    nonDirectionalContext: z.array(BiasEvidenceItemSchema),
    notApplicableEvidence: z.array(BiasEvidenceItemSchema),
    unavailableEvidence: z.array(BiasEvidenceItemSchema),
    evidenceWarnings: z.array(BiasEvidenceWarningSchema),
    methodology: BiasMethodologySchema,
    warningCode: BiasOverallWarningCodeSchema.nullable(),
  })
  .superRefine((value, ctx) => {
    if (value.biasState === "UNAVAILABLE" && value.confidenceScore !== null) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Unavailable Bias must not expose a numeric confidence score",
      });
    }
    if (value.biasState !== "NEUTRAL" && value.neutralReason !== null) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "neutralReason is only valid for a NEUTRAL Bias",
      });
    }

    const allEvidence = [
      ...value.bullishEvidence,
      ...value.bearishEvidence,
      ...value.neutralEvidence,
      ...value.nonDirectionalContext,
      ...value.notApplicableEvidence,
      ...value.unavailableEvidence,
    ];
    const ids = new Set(allEvidence.map((item) => item.featureId));
    if (allEvidence.length !== 9 || ids.size !== 9) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Every Market-State feature must appear in exactly one Bias evidence category",
      });
    }

    const expectedDirections: Array<[BiasEvidenceItem[], BiasEvidenceDirection]> = [
      [value.bullishEvidence, "BULLISH"],
      [value.bearishEvidence, "BEARISH"],
      [value.neutralEvidence, "NEUTRAL"],
      [value.nonDirectionalContext, "NON_DIRECTIONAL"],
      [value.notApplicableEvidence, "NOT_APPLICABLE"],
      [value.unavailableEvidence, "UNAVAILABLE"],
    ];
    for (const [items, direction] of expectedDirections) {
      if (items.some((item) => item.evidenceDirection !== direction)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: `Evidence category contains an item that is not ${direction}`,
        });
      }
    }

    const directionalIds = new Set(value.methodology.directionalFeatureIds);
    const nonDirectionalIds = new Set(value.methodology.nonDirectionalFeatureIds);
    if (directionalIds.size !== 4 || nonDirectionalIds.size !== 5) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: "Bias feature IDs must be unique" });
    }
    if ([...directionalIds].some((id) => nonDirectionalIds.has(id))) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Directional and non-directional feature sets must not overlap",
      });
    }

    const weightIds = new Set(value.methodology.featureWeights.map((item) => item.featureId));
    if (weightIds.size !== 4 || [...weightIds].some((id) => !directionalIds.has(id))) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Bias weight table must cover exactly the four directional features",
      });
    }
  });
export type SpyZeroDteDeterministicBiasResponse = z.infer<
  typeof SpyZeroDteDeterministicBiasResponseSchema
>;

/** Deterministic, same-snapshot conditional setup-eligibility layer. */
export const TradePlanMethodologyVersionSchema = z.literal("TRADE_PLAN_V1");
export type TradePlanMethodologyVersion = z.infer<typeof TradePlanMethodologyVersionSchema>;

export const TradePlanEngineStateSchema = z.enum(["AVAILABLE", "PARTIAL", "UNAVAILABLE"]);
export type TradePlanEngineState = z.infer<typeof TradePlanEngineStateSchema>;

export const TradeSetupDirectionSchema = z.enum(["CALLS", "PUTS", "NONE", "UNAVAILABLE"]);
export type TradeSetupDirection = z.infer<typeof TradeSetupDirectionSchema>;

export const TradeSetupStateSchema = z.enum([
  "ELIGIBLE",
  "WAITING_FOR_TRIGGER",
  "NO_SETUP",
  "NOT_APPLICABLE",
  "UNAVAILABLE",
]);
export type TradeSetupState = z.infer<typeof TradeSetupStateSchema>;

export const TradeTriggerComparisonSchema = z.enum([
  "PRICE_GREATER_THAN",
  "PRICE_LESS_THAN",
]);
export type TradeTriggerComparison = z.infer<typeof TradeTriggerComparisonSchema>;

export const TradePlanGateStatusSchema = z.enum([
  "PASSED",
  "FAILED",
  "NOT_APPLICABLE",
  "UNAVAILABLE",
]);
export type TradePlanGateStatus = z.infer<typeof TradePlanGateStatusSchema>;

export const TradePlanGateCategorySchema = z.enum([
  "INPUT",
  "APPLICABILITY",
  "QUALITY",
  "DIRECTION",
  "COUNTEREVIDENCE",
  "TRIGGER",
]);
export type TradePlanGateCategory = z.infer<typeof TradePlanGateCategorySchema>;

export const TradePlanGateIdSchema = z.enum([
  "MARKET_STATE_AVAILABLE",
  "SAME_SNAPSHOT_GUARANTEED",
  "SESSION_IS_RTH",
  "OPENING_RANGE_COMPLETE",
  "CURRENT_SESSION_DATES_COMPATIBLE",
  "BIAS_AVAILABLE",
  "DIRECTIONAL_BIAS_PRESENT",
  "SOURCE_QUALITY_COMPLETE",
  "COUNTEREVIDENCE_POLICY_PASSED",
  "TRIGGER_INPUTS_VALID",
  "VWAP_ALIGNED",
  "OPENING_RANGE_ALIGNED",
  "TRIGGER_SATISFIED",
]);
export type TradePlanGateId = z.infer<typeof TradePlanGateIdSchema>;

export const TradePlanPrimaryReasonCodeSchema = z.enum([
  "ELIGIBLE_CALLS_SETUP",
  "ELIGIBLE_PUTS_SETUP",
  "WAITING_FOR_CALLS_TRIGGER",
  "WAITING_FOR_PUTS_TRIGGER",
  "SESSION_NOT_RTH",
  "OPENING_RANGE_NOT_STARTED",
  "OPENING_RANGE_FORMING",
  "OPENING_RANGE_UNAVAILABLE",
  "BIAS_NEUTRAL",
  "BIAS_UNAVAILABLE",
  "CALLS_COUNTEREVIDENCE_PRESENT",
  "PUTS_COUNTEREVIDENCE_PRESENT",
  "REQUIRED_INPUT_PARTIAL",
  "REQUIRED_INPUT_UNAVAILABLE",
  "CURRENT_SESSION_DATE_MISMATCH",
  "TRIGGER_INPUT_INVALID",
  "MARKET_STATE_UNAVAILABLE",
  "SAME_SNAPSHOT_GUARANTEE_UNAVAILABLE",
]);
export type TradePlanPrimaryReasonCode = z.infer<
  typeof TradePlanPrimaryReasonCodeSchema
>;

export const TradePlanGateReasonCodeSchema = z.enum([
  "MARKET_STATE_AVAILABLE",
  "MARKET_STATE_UNAVAILABLE",
  "SAME_SNAPSHOT_GUARANTEED",
  "SAME_SNAPSHOT_GUARANTEE_UNAVAILABLE",
  "SESSION_RTH",
  "SESSION_NOT_RTH",
  "SESSION_UNAVAILABLE",
  "OPENING_RANGE_COMPLETE",
  "OPENING_RANGE_NOT_STARTED",
  "OPENING_RANGE_FORMING",
  "OPENING_RANGE_UNAVAILABLE",
  "CURRENT_SESSION_DATES_COMPATIBLE",
  "CURRENT_SESSION_DATE_MISMATCH",
  "BIAS_AVAILABLE",
  "BIAS_UNAVAILABLE",
  "DIRECTIONAL_BIAS_PRESENT",
  "BIAS_NEUTRAL",
  "SOURCE_QUALITY_COMPLETE",
  "REQUIRED_INPUT_PARTIAL",
  "REQUIRED_INPUT_UNAVAILABLE",
  "COUNTEREVIDENCE_POLICY_PASSED",
  "CALLS_COUNTEREVIDENCE_PRESENT",
  "PUTS_COUNTEREVIDENCE_PRESENT",
  "TRIGGER_INPUTS_VALID",
  "TRIGGER_INPUT_INVALID",
  "VWAP_ALIGNED_FOR_CALLS",
  "VWAP_ALIGNED_FOR_PUTS",
  "VWAP_NOT_ALIGNED_FOR_CALLS",
  "VWAP_NOT_ALIGNED_FOR_PUTS",
  "OPENING_RANGE_ALIGNED_FOR_CALLS",
  "OPENING_RANGE_ALIGNED_FOR_PUTS",
  "OPENING_RANGE_NOT_ALIGNED_FOR_CALLS",
  "OPENING_RANGE_NOT_ALIGNED_FOR_PUTS",
  "CALLS_TRIGGER_SATISFIED",
  "PUTS_TRIGGER_SATISFIED",
  "CALLS_TRIGGER_NOT_SATISFIED",
  "PUTS_TRIGGER_NOT_SATISFIED",
  "GATE_NOT_EVALUATED",
]);
export type TradePlanGateReasonCode = z.infer<typeof TradePlanGateReasonCodeSchema>;

export const TradePlanOverallWarningCodeSchema = z.enum([
  "MARKET_STATE_UNAVAILABLE",
  "SAME_SNAPSHOT_GUARANTEE_UNAVAILABLE",
  "BIAS_UNAVAILABLE",
  "CURRENT_SESSION_DATE_MISMATCH",
  "TRIGGER_INPUT_INVALID",
  "REQUIRED_INPUT_PARTIAL",
  "REQUIRED_INPUT_STALE",
  "INSUFFICIENT_PLAN_DATA",
]);
export type TradePlanOverallWarningCode = z.infer<
  typeof TradePlanOverallWarningCodeSchema
>;

const TradePlanGateBase = {
  status: TradePlanGateStatusSchema,
  requiredForEligibility: z.boolean(),
  category: TradePlanGateCategorySchema,
  sourceFeatureIds: z.array(MarketStateFeatureIdSchema),
  reasonCode: TradePlanGateReasonCodeSchema,
  warningCode: z.string().min(1).nullable(),
};

export const TradePlanMarketStateAvailableGateSchema = z.object({
  gateId: z.literal("MARKET_STATE_AVAILABLE"),
  ...TradePlanGateBase,
  observedValues: z.object({
    marketStateEngineState: MarketStateEngineStateSchema,
    currentPriceAvailable: z.boolean(),
  }),
});
export const TradePlanSameSnapshotGateSchema = z.object({
  gateId: z.literal("SAME_SNAPSHOT_GUARANTEED"),
  ...TradePlanGateBase,
  observedValues: z.object({
    marketStateCalculatedAt: z.string().datetime(),
    biasSourceMarketStateCalculatedAt: z.string().datetime(),
    sameSnapshotGuaranteed: z.boolean(),
  }),
});
export const TradePlanSessionGateSchema = z.object({
  gateId: z.literal("SESSION_IS_RTH"),
  ...TradePlanGateBase,
  observedValues: z.object({
    sessionPhase: MarketContextSessionWindowSchema.nullable(),
    featureStatus: MarketStateFeatureStatusSchema,
  }),
});
export const TradePlanOpeningRangeGateSchema = z.object({
  gateId: z.literal("OPENING_RANGE_COMPLETE"),
  ...TradePlanGateBase,
  observedValues: z.object({
    phase: OpeningRangePhaseSchema,
    featureState: z
      .union([MarketStateRangePositionSchema, z.enum(["NOT_STARTED", "FORMING"])])
      .nullable(),
    featureStatus: MarketStateFeatureStatusSchema,
  }),
});
export const TradePlanDateGateSchema = z.object({
  gateId: z.literal("CURRENT_SESSION_DATES_COMPATIBLE"),
  ...TradePlanGateBase,
  observedValues: z.object({
    currentMarketDate: MarketDateSchema,
    sessionReferenceDate: MarketDateSchema.nullable(),
    vwapReferenceDate: MarketDateSchema.nullable(),
    openingRangeReferenceDate: MarketDateSchema.nullable(),
  }),
});
export const TradePlanBiasAvailableGateSchema = z.object({
  gateId: z.literal("BIAS_AVAILABLE"),
  ...TradePlanGateBase,
  observedValues: z.object({
    biasState: DeterministicBiasStateSchema,
    biasEngineState: BiasEngineStateSchema,
  }),
});
export const TradePlanDirectionalBiasGateSchema = z.object({
  gateId: z.literal("DIRECTIONAL_BIAS_PRESENT"),
  ...TradePlanGateBase,
  observedValues: z.object({
    biasState: DeterministicBiasStateSchema,
  }),
});
export const TradePlanSourceQualityGateSchema = z.object({
  gateId: z.literal("SOURCE_QUALITY_COMPLETE"),
  ...TradePlanGateBase,
  observedValues: z.object({
    biasEngineState: BiasEngineStateSchema,
    biasSourceQuality: BiasSourceQualityStateSchema,
    sessionFeatureStatus: MarketStateFeatureStatusSchema,
    vwapFeatureStatus: MarketStateFeatureStatusSchema,
    openingRangeFeatureStatus: MarketStateFeatureStatusSchema,
  }),
});
export const TradePlanCounterevidenceGateSchema = z.object({
  gateId: z.literal("COUNTEREVIDENCE_POLICY_PASSED"),
  ...TradePlanGateBase,
  observedValues: z.object({
    candidateDirection: z.enum(["CALLS", "PUTS"]).nullable(),
    opposingEvidenceCount: z.number().int().nonnegative(),
  }),
});
export const TradePlanTriggerInputsGateSchema = z.object({
  gateId: z.literal("TRIGGER_INPUTS_VALID"),
  ...TradePlanGateBase,
  observedValues: z.object({
    currentPrice: z.number().finite().positive().nullable(),
    vwap: z.number().finite().positive().nullable(),
    openingRangeHigh: z.number().finite().positive().nullable(),
    openingRangeLow: z.number().finite().positive().nullable(),
  }),
});
export const TradePlanVwapAlignedGateSchema = z.object({
  gateId: z.literal("VWAP_ALIGNED"),
  ...TradePlanGateBase,
  observedValues: z.object({
    candidateDirection: z.enum(["CALLS", "PUTS"]).nullable(),
    priceVsVwapState: z.enum(["ABOVE", "BELOW", "EQUAL"]).nullable(),
  }),
});
export const TradePlanOpeningRangeAlignedGateSchema = z.object({
  gateId: z.literal("OPENING_RANGE_ALIGNED"),
  ...TradePlanGateBase,
  observedValues: z.object({
    candidateDirection: z.enum(["CALLS", "PUTS"]).nullable(),
    priceVsOpeningRangeState: z
      .union([MarketStateRangePositionSchema, z.enum(["NOT_STARTED", "FORMING"])])
      .nullable(),
  }),
});
export const TradePlanTriggerSatisfiedGateSchema = z.object({
  gateId: z.literal("TRIGGER_SATISFIED"),
  ...TradePlanGateBase,
  observedValues: z.object({
    candidateDirection: z.enum(["CALLS", "PUTS"]).nullable(),
    currentPrice: z.number().finite().positive().nullable(),
    triggerLevel: z.number().finite().positive().nullable(),
    comparison: TradeTriggerComparisonSchema.nullable(),
    satisfied: z.boolean().nullable(),
  }),
});

export const TradePlanGateSchema = z.discriminatedUnion("gateId", [
  TradePlanMarketStateAvailableGateSchema,
  TradePlanSameSnapshotGateSchema,
  TradePlanSessionGateSchema,
  TradePlanOpeningRangeGateSchema,
  TradePlanDateGateSchema,
  TradePlanBiasAvailableGateSchema,
  TradePlanDirectionalBiasGateSchema,
  TradePlanSourceQualityGateSchema,
  TradePlanCounterevidenceGateSchema,
  TradePlanTriggerInputsGateSchema,
  TradePlanVwapAlignedGateSchema,
  TradePlanOpeningRangeAlignedGateSchema,
  TradePlanTriggerSatisfiedGateSchema,
]);
export type TradePlanGate = z.infer<typeof TradePlanGateSchema>;

export const TradePlanTriggerSchema = z.object({
  level: z.number().finite().positive().nullable(),
  comparison: TradeTriggerComparisonSchema.nullable(),
  satisfied: z.boolean().nullable(),
  signedDistancePoints: z.number().finite().nullable(),
  sourceFeatureIds: z.array(MarketStateFeatureIdSchema),
  sourceValues: z.object({
    vwap: z.number().finite().positive().nullable(),
    openingRangeBoundary: z.number().finite().positive().nullable(),
  }),
});
export type TradePlanTrigger = z.infer<typeof TradePlanTriggerSchema>;

export const SpyZeroDteDeterministicTradePlanResponseSchema = z
  .object({
    symbol: z.literal("SPY"),
    product: z.literal("SPY_ZERO_DTE_DETERMINISTIC_CONDITIONAL_TRADE_PLAN"),
    methodologyVersion: TradePlanMethodologyVersionSchema,
    currentMarketDate: MarketDateSchema,
    mostRecentRthSessionDate: MarketDateSchema.nullable(),
    sourceMarketStateEngineVersion: MarketStateFeatureVersionSchema,
    sourceMarketStateEngineState: MarketStateEngineStateSchema,
    sourceMarketStateCalculatedAt: z.string().datetime(),
    sourceBiasMethodologyVersion: BiasMethodologyVersionSchema,
    sourceBiasCalculatedAt: z.string().datetime(),
    sourceBiasMarketStateCalculatedAt: z.string().datetime(),
    sameSnapshotGuaranteed: z.boolean(),
    calculatedAt: z.string().datetime(),
    engineState: TradePlanEngineStateSchema,
    setupDirection: TradeSetupDirectionSchema,
    setupState: TradeSetupStateSchema,
    primaryReasonCode: TradePlanPrimaryReasonCodeSchema,
    currentPrice: z.number().finite().positive().nullable(),
    priceSource: MarketStatePriceSourceSchema.nullable(),
    quoteTimestamp: z.string().datetime().nullable(),
    sessionPhase: MarketContextSessionWindowSchema.nullable(),
    biasState: DeterministicBiasStateSchema,
    biasEngineState: BiasEngineStateSchema,
    biasConfidenceScore: z.number().finite().min(0).max(100).nullable(),
    biasConfidenceScope: BiasConfidenceScopeSchema,
    biasSourceQuality: BiasSourceQualityStateSchema,
    trigger: TradePlanTriggerSchema,
    gates: z.array(TradePlanGateSchema).length(13),
    supportingBiasEvidenceIds: z.array(MarketStateFeatureIdSchema),
    counterBiasEvidenceIds: z.array(MarketStateFeatureIdSchema),
    warningCode: TradePlanOverallWarningCodeSchema.nullable(),
  })
  .superRefine((value, ctx) => {
    const expectedGateOrder = [
      "MARKET_STATE_AVAILABLE",
      "SAME_SNAPSHOT_GUARANTEED",
      "SESSION_IS_RTH",
      "OPENING_RANGE_COMPLETE",
      "CURRENT_SESSION_DATES_COMPATIBLE",
      "BIAS_AVAILABLE",
      "DIRECTIONAL_BIAS_PRESENT",
      "SOURCE_QUALITY_COMPLETE",
      "COUNTEREVIDENCE_POLICY_PASSED",
      "TRIGGER_INPUTS_VALID",
      "VWAP_ALIGNED",
      "OPENING_RANGE_ALIGNED",
      "TRIGGER_SATISFIED",
    ];
    if (value.gates.some((gate, index) => gate.gateId !== expectedGateOrder[index])) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: "Trade-Plan gates must use deterministic methodology order" });
    }

    const timestampsMatch =
      value.sourceMarketStateCalculatedAt === value.sourceBiasMarketStateCalculatedAt;
    if (value.sameSnapshotGuaranteed !== timestampsMatch) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: "sameSnapshotGuaranteed must match source timestamps" });
    }

    if (value.setupState === "ELIGIBLE") {
      if (value.engineState !== "AVAILABLE" || !["CALLS", "PUTS"].includes(value.setupDirection)) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, message: "ELIGIBLE requires an AVAILABLE directional setup" });
      }
      if (value.trigger.satisfied !== true) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, message: "ELIGIBLE requires a satisfied trigger" });
      }
    }
    if (value.setupState === "WAITING_FOR_TRIGGER") {
      if (!value.sameSnapshotGuaranteed || !["CALLS", "PUTS"].includes(value.setupDirection)) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, message: "WAITING_FOR_TRIGGER requires a same-snapshot directional candidate" });
      }
      if (value.trigger.satisfied !== false) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, message: "WAITING_FOR_TRIGGER requires an unsatisfied trigger" });
      }
    }
    if (["NO_SETUP", "NOT_APPLICABLE"].includes(value.setupState) && value.setupDirection !== "NONE") {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: "NO_SETUP and NOT_APPLICABLE require setupDirection NONE" });
    }
    if (value.setupState === "UNAVAILABLE" && value.setupDirection !== "UNAVAILABLE") {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: "UNAVAILABLE setup state requires UNAVAILABLE direction" });
    }
    if (["NO_SETUP", "NOT_APPLICABLE", "UNAVAILABLE"].includes(value.setupState)) {
      if (value.trigger.level !== null || value.trigger.comparison !== null || value.trigger.satisfied !== null || value.trigger.signedDistancePoints !== null) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, message: "Non-candidate setup states must not expose an active trigger" });
      }
    }
  });
export type SpyZeroDteDeterministicTradePlanResponse = z.infer<
  typeof SpyZeroDteDeterministicTradePlanResponseSchema
>;

/** Deterministic, same-snapshot SPY underlying objective and risk framework. */
export const RiskMethodologyVersionSchema = z.literal("RISK_V1");
export type RiskMethodologyVersion = z.infer<typeof RiskMethodologyVersionSchema>;

export const RiskFrameworkEngineStateSchema = z.enum(["AVAILABLE", "PARTIAL", "UNAVAILABLE"]);
export type RiskFrameworkEngineState = z.infer<typeof RiskFrameworkEngineStateSchema>;

export const ObjectiveRiskFrameworkStateSchema = z.enum([
  "READY",
  "PREVIEW",
  "NOT_QUALIFIED",
  "NO_SETUP",
  "NOT_APPLICABLE",
  "UNAVAILABLE",
]);
export type ObjectiveRiskFrameworkState = z.infer<typeof ObjectiveRiskFrameworkStateSchema>;

export const ObjectiveRiskDirectionSchema = z.enum(["CALLS", "PUTS", "NONE", "UNAVAILABLE"]);
export type ObjectiveRiskDirection = z.infer<typeof ObjectiveRiskDirectionSchema>;

export const PlanningReferenceTypeSchema = z.enum([
  "CURRENT_PRICE",
  "TRIGGER_LEVEL",
  "UNAVAILABLE",
]);
export type PlanningReferenceType = z.infer<typeof PlanningReferenceTypeSchema>;

export const RiskQualificationStateSchema = z.enum([
  "QUALIFIED",
  "NOT_QUALIFIED",
  "NOT_APPLICABLE",
  "UNAVAILABLE",
]);
export type RiskQualificationState = z.infer<typeof RiskQualificationStateSchema>;

export const RiskCandidateSourceStatusSchema = z.enum(["AVAILABLE", "PARTIAL", "UNAVAILABLE"]);
export type RiskCandidateSourceStatus = z.infer<typeof RiskCandidateSourceStatusSchema>;

export const RiskCandidateEligibilityStatusSchema = z.enum([
  "SELECTABLE",
  "REJECTED",
  "UNAVAILABLE",
]);
export type RiskCandidateEligibilityStatus = z.infer<typeof RiskCandidateEligibilityStatusSchema>;

export const ObjectiveQualificationStatusSchema = z.enum([
  "QUALIFIED",
  "BELOW_MINIMUM_RATIO",
  "NOT_EVALUATED",
  "UNAVAILABLE",
]);
export type ObjectiveQualificationStatus = z.infer<typeof ObjectiveQualificationStatusSchema>;

export const ObjectiveLevelTypeSchema = z.enum([
  "PREVIOUS_DAY_HIGH",
  "PREVIOUS_DAY_LOW",
  "PREMARKET_HIGH",
  "PREMARKET_LOW",
  "EXPECTED_MOVE_UPPER",
  "EXPECTED_MOVE_LOWER",
]);
export type ObjectiveLevelType = z.infer<typeof ObjectiveLevelTypeSchema>;

export const ObjectiveCandidateIdSchema = z.enum([
  "OBJECTIVE_PREVIOUS_DAY_HIGH",
  "OBJECTIVE_PREVIOUS_DAY_LOW",
  "OBJECTIVE_PREMARKET_HIGH",
  "OBJECTIVE_PREMARKET_LOW",
  "OBJECTIVE_EXPECTED_MOVE_UPPER",
  "OBJECTIVE_EXPECTED_MOVE_LOWER",
]);
export type ObjectiveCandidateId = z.infer<typeof ObjectiveCandidateIdSchema>;

export const InvalidationLevelTypeSchema = z.enum([
  "CURRENT_RTH_VWAP",
  "OPENING_RANGE_HIGH",
  "OPENING_RANGE_LOW",
]);
export type InvalidationLevelType = z.infer<typeof InvalidationLevelTypeSchema>;

export const InvalidationCandidateIdSchema = z.enum([
  "INVALIDATION_CURRENT_RTH_VWAP",
  "INVALIDATION_OPENING_RANGE_HIGH",
  "INVALIDATION_OPENING_RANGE_LOW",
]);
export type InvalidationCandidateId = z.infer<typeof InvalidationCandidateIdSchema>;

export const RiskLevelSemanticSchema = z.enum(["STRUCTURAL_LEVEL", "IMPLIED_MOVE_BOUNDARY"]);
export type RiskLevelSemantic = z.infer<typeof RiskLevelSemanticSchema>;

export const RiskPlanningReferenceDisclosureSchema = z.literal("PLANNING_REFERENCE_ONLY");
export type RiskPlanningReferenceDisclosure = z.infer<typeof RiskPlanningReferenceDisclosureSchema>;

export const RiskCandidateRejectionReasonCodeSchema = z.enum([
  "LEVEL_NOT_FINITE",
  "LEVEL_NOT_POSITIVE",
  "LEVEL_NOT_ON_FAVORABLE_SIDE",
  "LEVEL_NOT_ON_ADVERSE_SIDE",
  "LEVEL_EQUALS_PLANNING_REFERENCE",
  "SOURCE_UNAVAILABLE",
  "SOURCE_PARTIAL",
  "REFERENCE_DATE_MISMATCH",
  "EXPIRATION_MISMATCH",
  "NON_POSITIVE_DISTANCE",
]);
export type RiskCandidateRejectionReasonCode = z.infer<
  typeof RiskCandidateRejectionReasonCodeSchema
>;

export const RiskPrimaryReasonCodeSchema = z.enum([
  "RISK_FRAMEWORK_READY",
  "RISK_FRAMEWORK_PREVIEW",
  "SOURCE_TRADE_PLAN_NO_SETUP",
  "SOURCE_TRADE_PLAN_NOT_APPLICABLE",
  "SOURCE_TRADE_PLAN_UNAVAILABLE",
  "PLANNING_REFERENCE_UNAVAILABLE",
  "NO_ADVERSE_INVALIDATION_CANDIDATE",
  "NO_FAVORABLE_OBJECTIVE_CANDIDATE",
  "NO_OBJECTIVE_MEETS_MINIMUM_RATIO",
  "REQUIRED_LEVEL_PARTIAL",
  "CURRENT_SESSION_DATE_MISMATCH",
  "EXPECTED_MOVE_EXPIRATION_MISMATCH",
  "SAME_SNAPSHOT_GUARANTEE_UNAVAILABLE",
]);
export type RiskPrimaryReasonCode = z.infer<typeof RiskPrimaryReasonCodeSchema>;

export const RiskOverallWarningCodeSchema = z.enum([
  "MARKET_STATE_UNAVAILABLE",
  "SAME_SNAPSHOT_GUARANTEE_UNAVAILABLE",
  "TRADE_PLAN_UNAVAILABLE",
  "PLANNING_REFERENCE_UNAVAILABLE",
  "REQUIRED_LEVEL_PARTIAL",
  "REQUIRED_LEVEL_STALE",
  "CURRENT_SESSION_DATE_MISMATCH",
  "EXPECTED_MOVE_EXPIRATION_MISMATCH",
  "INVALID_NUMERIC_LEVEL",
  "INSUFFICIENT_RISK_DATA",
]);
export type RiskOverallWarningCode = z.infer<typeof RiskOverallWarningCodeSchema>;

export const RiskPlanningReferenceSchema = z.object({
  type: PlanningReferenceTypeSchema,
  price: z.number().finite().positive().nullable(),
  priceSource: MarketStatePriceSourceSchema.nullable(),
  sourceFeatureIds: z.array(MarketStateFeatureIdSchema),
  sourceCalculatedAt: z.string().datetime().nullable(),
  quoteTimestamp: z.string().datetime().nullable(),
  triggerLevel: z.number().finite().positive().nullable(),
  disclosureCode: RiskPlanningReferenceDisclosureSchema,
});
export type RiskPlanningReference = z.infer<typeof RiskPlanningReferenceSchema>;

export const ObjectiveLevelCandidateSchema = z.object({
  candidateId: ObjectiveCandidateIdSchema,
  levelType: ObjectiveLevelTypeSchema,
  levelSemantic: RiskLevelSemanticSchema,
  level: z.number().finite().nullable(),
  sourceStatus: RiskCandidateSourceStatusSchema,
  eligibilityStatus: RiskCandidateEligibilityStatusSchema,
  qualificationStatus: ObjectiveQualificationStatusSchema,
  selectable: z.boolean(),
  sourceFeatureId: MarketStateFeatureIdSchema,
  sourceComponents: z.array(MarketContextComponentSchema).min(1),
  referenceDate: MarketDateSchema.nullable(),
  referenceDateRelation: MarketStateReferenceDateRelationSchema.nullable(),
  objectiveDistancePoints: z.number().finite().positive().nullable(),
  distanceRank: z.number().int().positive().nullable(),
  rewardRiskRatio: z.number().finite().nonnegative().nullable(),
  minimumRewardRiskRatio: z.number().finite().positive(),
  rejectionReasonCode: RiskCandidateRejectionReasonCodeSchema.nullable(),
  warningCode: z.string().min(1).nullable(),
});
export type ObjectiveLevelCandidate = z.infer<typeof ObjectiveLevelCandidateSchema>;

export const InvalidationLevelCandidateSchema = z.object({
  candidateId: InvalidationCandidateIdSchema,
  levelType: InvalidationLevelTypeSchema,
  levelSemantic: z.literal("STRUCTURAL_LEVEL"),
  level: z.number().finite().nullable(),
  sourceStatus: RiskCandidateSourceStatusSchema,
  eligibilityStatus: RiskCandidateEligibilityStatusSchema,
  selectable: z.boolean(),
  sourceFeatureId: MarketStateFeatureIdSchema,
  sourceComponents: z.array(MarketContextComponentSchema).min(1),
  referenceDate: MarketDateSchema.nullable(),
  referenceDateRelation: MarketStateReferenceDateRelationSchema.nullable(),
  riskDistancePoints: z.number().finite().positive().nullable(),
  distanceRank: z.number().int().positive().nullable(),
  rejectionReasonCode: RiskCandidateRejectionReasonCodeSchema.nullable(),
  warningCode: z.string().min(1).nullable(),
});
export type InvalidationLevelCandidate = z.infer<typeof InvalidationLevelCandidateSchema>;

export const SelectedInvalidationSchema = z.object({
  candidateId: InvalidationCandidateIdSchema.nullable(),
  levelType: InvalidationLevelTypeSchema.nullable(),
  level: z.number().finite().positive().nullable(),
  riskDistancePoints: z.number().finite().positive().nullable(),
});
export type SelectedInvalidation = z.infer<typeof SelectedInvalidationSchema>;

export const SelectedObjectiveSchema = z.object({
  candidateId: ObjectiveCandidateIdSchema.nullable(),
  levelType: ObjectiveLevelTypeSchema.nullable(),
  level: z.number().finite().positive().nullable(),
  objectiveDistancePoints: z.number().finite().positive().nullable(),
  rewardRiskRatio: z.number().finite().nonnegative().nullable(),
});
export type SelectedObjective = z.infer<typeof SelectedObjectiveSchema>;

export const RiskMethodologySchema = z.object({
  objectiveSourceTypes: z.array(ObjectiveLevelTypeSchema).length(6),
  invalidationSourceTypes: z.array(InvalidationLevelTypeSchema).length(3),
  objectiveTieBreakOrder: z.array(ObjectiveLevelTypeSchema).length(6),
  invalidationTieBreakOrderCalls: z.array(InvalidationLevelTypeSchema).length(3),
  invalidationTieBreakOrderPuts: z.array(InvalidationLevelTypeSchema).length(3),
  invalidationSelection: z.literal("NEAREST_VALID_ADVERSE_STRUCTURAL_LEVEL"),
  objectiveSelection: z.literal("NEAREST_QUALIFIED_FAVORABLE_LEVEL"),
  minimumRewardRiskRatio: z.number().finite().positive(),
  calculationsUse: z.literal("SPY_UNDERLYING_PRICE_POINTS"),
  duplicateLevelPolicy: z.literal("PRESERVE_SEPARATE_CANDIDATES_EXACT_EQUALITY_ONLY"),
  partialSelectionPolicy: z.literal("PARTIAL_CANDIDATES_VISIBLE_BUT_NOT_SELECTABLE"),
});
export type RiskMethodology = z.infer<typeof RiskMethodologySchema>;

export const SpyZeroDteObjectiveRiskResponseSchema = z
  .object({
    symbol: z.literal("SPY"),
    product: z.literal("SPY_ZERO_DTE_DETERMINISTIC_OBJECTIVE_RISK_FRAMEWORK"),
    methodologyVersion: RiskMethodologyVersionSchema,
    currentMarketDate: MarketDateSchema,
    mostRecentRthSessionDate: MarketDateSchema.nullable(),
    sourceMarketStateEngineVersion: MarketStateFeatureVersionSchema,
    sourceMarketStateEngineState: MarketStateEngineStateSchema,
    sourceMarketStateCalculatedAt: z.string().datetime(),
    sourceBiasMethodologyVersion: BiasMethodologyVersionSchema,
    sourceBiasCalculatedAt: z.string().datetime(),
    sourceBiasMarketStateCalculatedAt: z.string().datetime(),
    sourceTradePlanMethodologyVersion: TradePlanMethodologyVersionSchema,
    sourceTradePlanCalculatedAt: z.string().datetime(),
    sourceTradePlanMarketStateCalculatedAt: z.string().datetime(),
    sourceTradePlanBiasCalculatedAt: z.string().datetime(),
    sameSnapshotGuaranteed: z.boolean(),
    calculatedAt: z.string().datetime(),
    engineState: RiskFrameworkEngineStateSchema,
    frameworkState: ObjectiveRiskFrameworkStateSchema,
    direction: ObjectiveRiskDirectionSchema,
    riskQualification: RiskQualificationStateSchema,
    isCurrentlyTradeEligible: z.boolean(),
    sourceTradePlanSetupState: TradeSetupStateSchema,
    sourceTradePlanSetupDirection: TradeSetupDirectionSchema,
    currentPrice: z.number().finite().positive().nullable(),
    priceSource: MarketStatePriceSourceSchema.nullable(),
    quoteTimestamp: z.string().datetime().nullable(),
    planningReference: RiskPlanningReferenceSchema,
    minimumRewardRiskRatio: z.number().finite().positive(),
    invalidationCandidates: z.array(InvalidationLevelCandidateSchema),
    selectedInvalidation: SelectedInvalidationSchema,
    objectiveCandidates: z.array(ObjectiveLevelCandidateSchema),
    selectedObjective: SelectedObjectiveSchema,
    primaryReasonCode: RiskPrimaryReasonCodeSchema,
    warningCode: RiskOverallWarningCodeSchema.nullable(),
    methodology: RiskMethodologySchema,
  })
  .superRefine((value, ctx) => {
    const timestampsMatch =
      value.sourceMarketStateCalculatedAt === value.sourceBiasMarketStateCalculatedAt &&
      value.sourceMarketStateCalculatedAt === value.sourceTradePlanMarketStateCalculatedAt &&
      value.sourceBiasCalculatedAt === value.sourceTradePlanBiasCalculatedAt;
    if (value.sameSnapshotGuaranteed !== timestampsMatch) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Risk sameSnapshotGuaranteed must match all Market-State source timestamps",
      });
    }

    const emptyPlanningReference = value.planningReference.price === null;
    if (["NO_SETUP", "NOT_APPLICABLE"].includes(value.frameworkState)) {
      if (!emptyPlanningReference || value.invalidationCandidates.length > 0 || value.objectiveCandidates.length > 0) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "NO_SETUP and NOT_APPLICABLE Risk states cannot expose planning candidates",
        });
      }
    }

    if (value.frameworkState === "READY") {
      if (
        value.engineState !== "AVAILABLE" ||
        value.sourceTradePlanSetupState !== "ELIGIBLE" ||
        value.planningReference.type !== "CURRENT_PRICE" ||
        !value.isCurrentlyTradeEligible ||
        value.riskQualification !== "QUALIFIED"
      ) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, message: "READY Risk framework is inconsistent" });
      }
    }

    if (value.frameworkState === "PREVIEW") {
      if (
        value.engineState !== "AVAILABLE" ||
        value.sourceTradePlanSetupState !== "WAITING_FOR_TRIGGER" ||
        value.planningReference.type !== "TRIGGER_LEVEL" ||
        value.isCurrentlyTradeEligible ||
        value.riskQualification !== "QUALIFIED"
      ) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, message: "PREVIEW Risk framework is inconsistent" });
      }
    }

    if (value.frameworkState === "NOT_QUALIFIED" && value.riskQualification !== "NOT_QUALIFIED") {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: "NOT_QUALIFIED framework requires matching Risk Qualification" });
    }
    if (["NO_SETUP", "NOT_APPLICABLE"].includes(value.frameworkState) && value.riskQualification !== "NOT_APPLICABLE") {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: "Non-applicable framework requires NOT_APPLICABLE qualification" });
    }
    if (value.frameworkState === "UNAVAILABLE" && value.riskQualification !== "UNAVAILABLE") {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: "UNAVAILABLE framework requires UNAVAILABLE qualification" });
    }

    const selectedInvalidation = value.selectedInvalidation.candidateId === null
      ? null
      : value.invalidationCandidates.find((candidate) => candidate.candidateId === value.selectedInvalidation.candidateId) ?? null;
    if (value.selectedInvalidation.candidateId !== null && (!selectedInvalidation || !selectedInvalidation.selectable)) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: "Selected invalidation must reference a selectable candidate" });
    }

    const selectedObjective = value.selectedObjective.candidateId === null
      ? null
      : value.objectiveCandidates.find((candidate) => candidate.candidateId === value.selectedObjective.candidateId) ?? null;
    if (
      value.selectedObjective.candidateId !== null &&
      (!selectedObjective || selectedObjective.qualificationStatus !== "QUALIFIED")
    ) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: "Selected objective must reference a qualified candidate" });
    }

    if (value.riskQualification === "QUALIFIED") {
      if (value.selectedInvalidation.candidateId === null || value.selectedObjective.candidateId === null) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, message: "QUALIFIED Risk requires selected objective and invalidation" });
      }
    }
  });
export type SpyZeroDteObjectiveRiskResponse = z.infer<
  typeof SpyZeroDteObjectiveRiskResponseSchema
>;

/** Deterministic SPY 0DTE contract-selection and liquidity foundation. */
export const ContractMethodologyVersionSchema = z.literal("CONTRACT_V1");
export type ContractMethodologyVersion = z.infer<typeof ContractMethodologyVersionSchema>;

export const ContractSourceCompatibilityStateSchema = z.enum([
  "NOT_EVALUATED",
  "COMPATIBLE",
  "PARTIAL",
  "INCOMPATIBLE",
  "UNAVAILABLE",
]);
export type ContractSourceCompatibilityState = z.infer<
  typeof ContractSourceCompatibilityStateSchema
>;

export const ContractSelectionEngineStateSchema = z.enum([
  "AVAILABLE",
  "PARTIAL",
  "UNAVAILABLE",
]);
export type ContractSelectionEngineState = z.infer<
  typeof ContractSelectionEngineStateSchema
>;

export const ContractSelectionStateSchema = z.enum([
  "SELECTED",
  "NO_QUALIFIED_CONTRACT",
  "DEFERRED",
  "NOT_APPLICABLE",
  "UNAVAILABLE",
]);
export type ContractSelectionState = z.infer<typeof ContractSelectionStateSchema>;

export const SelectedContractDirectionSchema = z.enum([
  "CALL",
  "PUT",
  "NONE",
  "UNAVAILABLE",
]);
export type SelectedContractDirection = z.infer<typeof SelectedContractDirectionSchema>;

export const ContractQuoteFreshnessStateSchema = z.enum([
  "FRESH",
  "STALE",
  "UNKNOWN",
  "UNAVAILABLE",
]);
export type ContractQuoteFreshnessState = z.infer<
  typeof ContractQuoteFreshnessStateSchema
>;

export const ContractMoneynessSchema = z.enum(["ITM", "ATM", "OTM", "UNAVAILABLE"]);
export type ContractMoneyness = z.infer<typeof ContractMoneynessSchema>;

export const ContractCandidateSourceStatusSchema = z.enum([
  "AVAILABLE",
  "PARTIAL",
  "UNAVAILABLE",
]);
export type ContractCandidateSourceStatus = z.infer<
  typeof ContractCandidateSourceStatusSchema
>;

export const ContractCandidateEligibilityStatusSchema = z.enum([
  "SELECTABLE",
  "REJECTED",
  "UNAVAILABLE",
]);
export type ContractCandidateEligibilityStatus = z.infer<
  typeof ContractCandidateEligibilityStatusSchema
>;

export const ContractCandidateRejectionReasonCodeSchema = z.enum([
  "SOURCE_UNAVAILABLE",
  "SOURCE_PARTIAL",
  "CONTRACT_DIRECTION_MISMATCH",
  "EXPIRATION_MISMATCH",
  "NON_STANDARD_CONTRACT",
  "MINI_CONTRACT",
  "STANDARD_STATUS_UNAVAILABLE",
  "MINI_STATUS_UNAVAILABLE",
  "MULTIPLIER_MISMATCH",
  "STRIKE_NOT_FINITE",
  "STRIKE_NOT_POSITIVE",
  "BID_NOT_FINITE",
  "BID_NOT_POSITIVE",
  "ASK_NOT_FINITE",
  "ASK_NOT_POSITIVE",
  "CROSSED_QUOTE",
  "MIDPOINT_NOT_POSITIVE",
  "SPREAD_NOT_FINITE",
  "SPREAD_RATIO_NOT_FINITE",
  "SPREAD_EXCEEDS_MAXIMUM",
  "CHAIN_UNDERLYING_PRICE_INVALID",
  "CONTRACT_QUOTE_FRESHNESS_UNKNOWN",
  "CONTRACT_QUOTE_STALE",
]);
export type ContractCandidateRejectionReasonCode = z.infer<
  typeof ContractCandidateRejectionReasonCodeSchema
>;

export const ContractCandidateWarningCodeSchema = z.enum([
  "SOURCE_PARTIAL",
  "CONTRACT_QUOTE_TIMESTAMP_UNAVAILABLE",
  "CONTRACT_QUOTE_STALE",
]);
export type ContractCandidateWarningCode = z.infer<
  typeof ContractCandidateWarningCodeSchema
>;

export const ContractSelectionPrimaryReasonCodeSchema = z.enum([
  "CONTRACT_SELECTED",
  "NO_CONTRACT_PASSES_ELIGIBILITY",
  "CONTRACT_SELECTION_DEFERRED_UNTIL_SETUP_READY",
  "SOURCE_RISK_NOT_QUALIFIED",
  "SOURCE_RISK_NO_SETUP",
  "SOURCE_RISK_NOT_APPLICABLE",
  "SOURCE_RISK_UNAVAILABLE",
  "OPTIONS_CHAIN_UNAVAILABLE",
  "OPTIONS_CHAIN_STALE",
  "OPTIONS_CHAIN_DELAYED",
  "OPTIONS_CHAIN_EXPIRATION_MISMATCH",
  "OPTIONS_CHAIN_SYMBOL_MISMATCH",
  "SOURCE_ASSEMBLY_SKEW_EXCEEDED",
  "SOURCE_COMPATIBILITY_PARTIAL",
  "SOURCE_COMPATIBILITY_INCOMPATIBLE",
]);
export type ContractSelectionPrimaryReasonCode = z.infer<
  typeof ContractSelectionPrimaryReasonCodeSchema
>;

export const ContractSelectionOverallWarningCodeSchema = z.enum([
  "RISK_FRAMEWORK_UNAVAILABLE",
  "OPTIONS_CHAIN_UNAVAILABLE",
  "OPTIONS_CHAIN_STALE",
  "OPTIONS_CHAIN_DELAYED",
  "CURRENT_EXPIRATION_MISMATCH",
  "SOURCE_ASSEMBLY_SKEW_EXCEEDED",
  "CONTRACT_QUOTE_TIMESTAMP_UNAVAILABLE",
  "CONTRACT_QUOTE_STALE",
  "SOURCE_COMPATIBILITY_PARTIAL",
  "INVALID_CONTRACT_NUMERIC_DATA",
  "INSUFFICIENT_CONTRACT_DATA",
]);
export type ContractSelectionOverallWarningCode = z.infer<
  typeof ContractSelectionOverallWarningCodeSchema
>;

export const ContractSelectionCandidateSchema = z.object({
  candidateId: z.string().min(1),
  contractSymbol: z.string().min(1),
  contractDirection: z.enum(["CALL", "PUT"]),
  description: z.string().nullable(),
  strikePrice: z.number().finite().positive(),
  expirationDate: MarketDateSchema,
  nonStandard: z.boolean().nullable(),
  mini: z.boolean().nullable(),
  multiplier: z.number().finite().positive().nullable(),
  sourceStatus: ContractCandidateSourceStatusSchema,
  eligibilityStatus: ContractCandidateEligibilityStatusSchema,
  selectable: z.boolean(),
  moneyness: ContractMoneynessSchema,
  providerInTheMoney: z.boolean().nullable(),
  chainUnderlyingPrice: z.number().finite().positive().nullable(),
  strikeDistancePoints: z.number().finite().nonnegative().nullable(),
  bid: z.number().finite().nonnegative().nullable(),
  ask: z.number().finite().nonnegative().nullable(),
  calculatedMidpoint: z.number().finite().positive().nullable(),
  providerMark: z.number().finite().nonnegative().nullable(),
  spreadPoints: z.number().finite().nonnegative().nullable(),
  spreadRatio: z.number().finite().nonnegative().nullable(),
  spreadPercent: z.number().finite().nonnegative().nullable(),
  bidSize: z.number().int().nonnegative().nullable(),
  askSize: z.number().int().nonnegative().nullable(),
  openInterest: z.number().int().nonnegative().nullable(),
  volume: z.number().int().nonnegative().nullable(),
  delta: z.number().finite().nullable(),
  gamma: z.number().finite().nonnegative().nullable(),
  theta: z.number().finite().nullable(),
  vega: z.number().finite().nullable(),
  rho: z.number().finite().nullable(),
  impliedVolatilityPercent: z.number().finite().nonnegative().nullable(),
  quoteAt: z.string().datetime().nullable(),
  tradeAt: z.string().datetime().nullable(),
  quoteAgeMilliseconds: z.number().finite().nonnegative().nullable(),
  quoteFreshnessState: ContractQuoteFreshnessStateSchema,
  selectionRank: z.number().int().positive().nullable(),
  rejectionReasonCodes: z.array(ContractCandidateRejectionReasonCodeSchema),
  warningCode: ContractCandidateWarningCodeSchema.nullable(),
});
export type ContractSelectionCandidate = z.infer<typeof ContractSelectionCandidateSchema>;

export const SelectedContractSchema = z.object({
  candidateId: z.string().min(1).nullable(),
  contractSymbol: z.string().min(1).nullable(),
  contractDirection: z.enum(["CALL", "PUT"]).nullable(),
  strikePrice: z.number().finite().positive().nullable(),
  expirationDate: MarketDateSchema.nullable(),
  moneyness: ContractMoneynessSchema.nullable(),
  bid: z.number().finite().positive().nullable(),
  ask: z.number().finite().positive().nullable(),
  calculatedMidpoint: z.number().finite().positive().nullable(),
  spreadPoints: z.number().finite().nonnegative().nullable(),
  spreadRatio: z.number().finite().nonnegative().nullable(),
  spreadPercent: z.number().finite().nonnegative().nullable(),
  quoteAt: z.string().datetime().nullable(),
  quoteFreshnessState: ContractQuoteFreshnessStateSchema.nullable(),
  strikeDistancePoints: z.number().finite().nonnegative().nullable(),
  selectionRank: z.number().int().positive().nullable(),
});
export type SelectedContract = z.infer<typeof SelectedContractSchema>;

export const ContractPremiumReferenceSchema = z.object({
  type: z.enum(["CALCULATED_BID_ASK_MIDPOINT", "UNAVAILABLE"]),
  value: z.number().finite().positive().nullable(),
  disclosureCode: z.literal("MIDPOINT_REFERENCE_ONLY"),
});
export type ContractPremiumReference = z.infer<typeof ContractPremiumReferenceSchema>;

export const ContractSelectionMethodologySchema = z.object({
  maximumSpreadRatio: z.literal(0.15),
  maximumSpreadPercent: z.literal(15),
  maximumSourceAssemblySkewMilliseconds: z.literal(60_000),
  maximumContractQuoteAgeMilliseconds: z.literal(60_000),
  quoteFreshnessPolicy: z.literal("NORMALIZED_QUOTE_AT_EPOCH_MILLISECONDS"),
  sourceAssemblySkewPolicy: z.literal("RISK_CALCULATED_AT_VS_CHAIN_FETCHED_AT"),
  rankingMethod: z.literal("ATM_PROXIMITY_THEN_LIQUIDITY_TIE_BREAKS"),
  itmExactDistanceTiePreference: z.literal(true),
  openInterestHardMinimum: z.null(),
  volumeHardMinimum: z.null(),
  deltaHardRange: z.null(),
  gammaHardRange: z.null(),
  thetaHardRange: z.null(),
  impliedVolatilityHardRange: z.null(),
  evaluationScope: z.literal("RETURNED_CHAIN_WINDOW_SELECTED_SIDE"),
  calculationsUse: z.literal("OPTIONS_CHAIN_BID_ASK_AND_CHAIN_UNDERLYING"),
  midpointDisclosureCode: z.literal("MIDPOINT_REFERENCE_ONLY"),
  thresholdPolicy: z.literal("EXPLICIT_CONTRACT_V1_PRODUCT_POLICY_NOT_BACKTESTED"),
});
export type ContractSelectionMethodology = z.infer<
  typeof ContractSelectionMethodologySchema
>;

export const SpyZeroDteContractSelectionResponseSchema = z
  .object({
    symbol: z.literal("SPY"),
    product: z.literal("SPY_ZERO_DTE_DETERMINISTIC_CONTRACT_SELECTION_LIQUIDITY"),
    methodologyVersion: ContractMethodologyVersionSchema,
    currentMarketDate: MarketDateSchema,
    mostRecentRthSessionDate: MarketDateSchema.nullable(),
    sourceMarketStateCalculatedAt: z.string().datetime(),
    sourceBiasMarketStateCalculatedAt: z.string().datetime(),
    sourceBiasCalculatedAt: z.string().datetime(),
    sourceTradePlanMarketStateCalculatedAt: z.string().datetime(),
    sourceTradePlanBiasCalculatedAt: z.string().datetime(),
    sourceTradePlanCalculatedAt: z.string().datetime(),
    sourceRiskMarketStateCalculatedAt: z.string().datetime(),
    sourceRiskBiasCalculatedAt: z.string().datetime(),
    sourceRiskTradePlanCalculatedAt: z.string().datetime(),
    sourceRiskCalculatedAt: z.string().datetime(),
    upstreamSameSnapshotGuaranteed: z.boolean(),
    sourceOptionsChainFetchedAt: z.string().datetime().nullable(),
    sourceOptionsChainMetricState: OptionsChainMetricStateSchema.nullable(),
    sourceOptionsChainSourceState: OptionsChainSourceStateSchema.nullable(),
    sourceOptionsChainWarningCode: OptionsChainWarningCodeSchema.nullable(),
    sourceOptionsChainIsDelayed: z.boolean().nullable(),
    sourceOptionsChainLatestQuoteAt: z.string().datetime().nullable(),
    sourceOptionsChainLatestTradeAt: z.string().datetime().nullable(),
    calculatedAt: z.string().datetime(),
    sourceCompatibilityState: ContractSourceCompatibilityStateSchema,
    sourceAssemblySkewMilliseconds: z.number().finite().nonnegative().nullable(),
    engineState: ContractSelectionEngineStateSchema,
    selectionState: ContractSelectionStateSchema,
    contractDirection: SelectedContractDirectionSchema,
    sourceRiskFrameworkState: ObjectiveRiskFrameworkStateSchema,
    sourceRiskQualification: RiskQualificationStateSchema,
    sourceRiskDirection: ObjectiveRiskDirectionSchema,
    sourceRiskIsCurrentlyTradeEligible: z.boolean(),
    riskCurrentPrice: z.number().finite().positive().nullable(),
    chainUnderlyingPrice: z.number().finite().positive().nullable(),
    underlyingPriceDifferencePoints: z.number().finite().nullable(),
    expirationDate: MarketDateSchema.nullable(),
    evaluationScope: z.literal("RETURNED_CHAIN_WINDOW_SELECTED_SIDE"),
    evaluatedCandidateCount: z.number().int().nonnegative(),
    selectableCandidateCount: z.number().int().nonnegative(),
    rejectedCandidateCount: z.number().int().nonnegative(),
    unavailableCandidateCount: z.number().int().nonnegative(),
    candidates: z.array(ContractSelectionCandidateSchema),
    selectedContract: SelectedContractSchema,
    premiumReference: ContractPremiumReferenceSchema,
    primaryReasonCode: ContractSelectionPrimaryReasonCodeSchema,
    warningCode: ContractSelectionOverallWarningCodeSchema.nullable(),
    methodology: ContractSelectionMethodologySchema,
  })
  .superRefine((value, ctx) => {
    const upstreamMatch =
      value.sourceMarketStateCalculatedAt === value.sourceBiasMarketStateCalculatedAt &&
      value.sourceMarketStateCalculatedAt === value.sourceTradePlanMarketStateCalculatedAt &&
      value.sourceMarketStateCalculatedAt === value.sourceRiskMarketStateCalculatedAt &&
      value.sourceBiasCalculatedAt === value.sourceTradePlanBiasCalculatedAt &&
      value.sourceBiasCalculatedAt === value.sourceRiskBiasCalculatedAt &&
      value.sourceTradePlanCalculatedAt === value.sourceRiskTradePlanCalculatedAt;
    if (value.upstreamSameSnapshotGuaranteed !== upstreamMatch) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Contract upstreamSameSnapshotGuaranteed must match all upstream timestamps",
      });
    }

    if (value.evaluatedCandidateCount !== value.candidates.length) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Contract evaluatedCandidateCount must equal candidates length",
      });
    }
    if (
      value.evaluatedCandidateCount !==
      value.selectableCandidateCount + value.rejectedCandidateCount + value.unavailableCandidateCount
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Contract candidate counts must reconcile",
      });
    }

    const selectable = value.candidates.filter((candidate) => candidate.eligibilityStatus === "SELECTABLE");
    const rejected = value.candidates.filter((candidate) => candidate.eligibilityStatus === "REJECTED");
    const unavailable = value.candidates.filter((candidate) => candidate.eligibilityStatus === "UNAVAILABLE");
    if (
      selectable.length !== value.selectableCandidateCount ||
      rejected.length !== value.rejectedCandidateCount ||
      unavailable.length !== value.unavailableCandidateCount
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Contract candidate status counts are inconsistent",
      });
    }

    const symbols = value.candidates.map((candidate) => candidate.contractSymbol);
    if (new Set(symbols).size !== symbols.length) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: "Contract candidates must be unique" });
    }

    if (["DEFERRED", "NOT_APPLICABLE"].includes(value.selectionState)) {
      if (
        value.sourceCompatibilityState !== "NOT_EVALUATED" ||
        value.sourceOptionsChainFetchedAt !== null ||
        value.candidates.length > 0
      ) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "Deferred/non-applicable Contract response cannot expose Chain evaluation",
        });
      }
    }

    if (value.engineState === "PARTIAL" && value.selectionState === "SELECTED") {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: "PARTIAL Contract engine cannot select" });
    }

    const selected = value.selectedContract.candidateId === null
      ? null
      : value.candidates.find((candidate) => candidate.candidateId === value.selectedContract.candidateId) ?? null;

    if (value.selectionState === "SELECTED") {
      if (
        value.engineState !== "AVAILABLE" ||
        value.sourceCompatibilityState !== "COMPATIBLE" ||
        !selected ||
        !selected.selectable ||
        selected.selectionRank !== 1 ||
        selected.quoteFreshnessState !== "FRESH" ||
        value.premiumReference.type !== "CALCULATED_BID_ASK_MIDPOINT" ||
        value.premiumReference.value !== selected.calculatedMidpoint
      ) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, message: "Selected Contract response is inconsistent" });
      }
    } else if (
      value.selectedContract.candidateId !== null ||
      value.premiumReference.type !== "UNAVAILABLE" ||
      value.premiumReference.value !== null
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Non-selected Contract response cannot expose a selected contract or premium reference",
      });
    }

    if (
      value.selectionState === "SELECTED" &&
      !["CALL", "PUT"].includes(value.contractDirection)
    ) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: "Selected Contract requires CALL or PUT direction" });
    }
  });
export type SpyZeroDteContractSelectionResponse = z.infer<
  typeof SpyZeroDteContractSelectionResponseSchema
>;

/** Concise deterministic SPY 0DTE Trade Plan assembly and display contract. */
export const TradePlanAssemblyMethodologyVersionSchema = z.literal("ASSEMBLY_V1");
export type TradePlanAssemblyMethodologyVersion = z.infer<
  typeof TradePlanAssemblyMethodologyVersionSchema
>;

export const TradePlanAssemblyEngineStateSchema = z.enum([
  "AVAILABLE",
  "PARTIAL",
  "UNAVAILABLE",
]);
export type TradePlanAssemblyEngineState = z.infer<
  typeof TradePlanAssemblyEngineStateSchema
>;

export const DeterministicTradePlanStateSchema = z.enum([
  "READY",
  "WAITING_FOR_TRIGGER",
  "NO_QUALIFIED_CONTRACT",
  "NOT_QUALIFIED",
  "NO_SETUP",
  "NOT_APPLICABLE",
  "UNAVAILABLE",
]);
export type DeterministicTradePlanState = z.infer<
  typeof DeterministicTradePlanStateSchema
>;

export const AssembledTradePlanDirectionSchema = z.enum([
  "CALLS",
  "PUTS",
  "NONE",
  "UNAVAILABLE",
]);
export type AssembledTradePlanDirection = z.infer<
  typeof AssembledTradePlanDirectionSchema
>;

export const TradePlanAssemblyEntryConditionStateSchema = z.enum([
  "SATISFIED",
  "WAITING",
  "NOT_APPLICABLE",
  "UNAVAILABLE",
]);
export type TradePlanAssemblyEntryConditionState = z.infer<
  typeof TradePlanAssemblyEntryConditionStateSchema
>;

export const TradePlanAssemblyPrimaryReasonCodeSchema = z.enum([
  "TRADE_PLAN_READY",
  "TRADE_PLAN_WAITING_FOR_TRIGGER",
  "TRADE_PLAN_NO_QUALIFIED_CONTRACT",
  "TRADE_PLAN_NOT_QUALIFIED",
  "TRADE_PLAN_NO_SETUP",
  "TRADE_PLAN_NOT_APPLICABLE",
  "TRADE_PLAN_UNAVAILABLE",
  "SOURCE_DIRECTION_MISMATCH",
  "SOURCE_SELECTED_INVALIDATION_MISSING",
  "SOURCE_SELECTED_INVALIDATION_DUPLICATED",
  "SOURCE_SELECTED_OBJECTIVE_MISSING",
  "SOURCE_SELECTED_OBJECTIVE_DUPLICATED",
  "SOURCE_SELECTED_CONTRACT_MISSING",
  "SOURCE_SELECTED_CONTRACT_DUPLICATED",
  "SOURCE_SELECTED_CONTRACT_NOT_RANK_ONE",
  "SOURCE_SELECTED_CONTRACT_NOT_FRESH",
  "SOURCE_RISK_SELECTION_INCONSISTENT",
  "SOURCE_CONTRACT_SELECTION_INCONSISTENT",
  "SOURCE_COMPATIBILITY_UNAVAILABLE",
  "UPSTREAM_SAME_SNAPSHOT_UNAVAILABLE",
  "SOURCE_STATE_COMBINATION_UNRECOGNIZED",
]);
export type TradePlanAssemblyPrimaryReasonCode = z.infer<
  typeof TradePlanAssemblyPrimaryReasonCodeSchema
>;

export const TradePlanAssemblyWarningCodeSchema = z.enum([
  "MARKET_STATE_UNAVAILABLE",
  "BIAS_UNAVAILABLE",
  "TRADE_PLAN_UNAVAILABLE",
  "RISK_FRAMEWORK_UNAVAILABLE",
  "RISK_FRAMEWORK_PARTIAL",
  "CONTRACT_SELECTION_UNAVAILABLE",
  "CONTRACT_SELECTION_PARTIAL",
  "SOURCE_COMPATIBILITY_PARTIAL",
  "SOURCE_DIRECTION_MISMATCH",
  "UPSTREAM_SNAPSHOT_MISMATCH",
  "SOURCE_SELECTED_VALUE_MISSING",
  "SOURCE_SELECTED_VALUE_DUPLICATED",
  "SOURCE_SELECTED_VALUE_INCONSISTENT",
  "INVALID_ASSEMBLY_NUMERIC_DATA",
  "ASSEMBLY_VALIDATION_FAILED",
]);
export type TradePlanAssemblyWarningCode = z.infer<
  typeof TradePlanAssemblyWarningCodeSchema
>;

export const TradePlanAssemblyBiasSummarySchema = z.object({
  biasState: DeterministicBiasStateSchema,
  confidenceScore: z.number().finite().min(0).max(100).nullable(),
  confidenceUnit: BiasConfidenceUnitSchema,
  confidenceScope: BiasConfidenceScopeSchema,
  sourceQualityState: BiasSourceQualityStateSchema,
  minimumUsableDirectionalEvidenceCount: z.number().int().positive(),
  usableDirectionalEvidenceCount: z.number().int().nonnegative(),
  applicableDirectionalEvidenceCount: z.number().int().nonnegative(),
  bullishEvidenceCount: z.number().int().nonnegative(),
  bearishEvidenceCount: z.number().int().nonnegative(),
  neutralEvidenceCount: z.number().int().nonnegative(),
  unavailableDirectionalEvidenceCount: z.number().int().nonnegative(),
  notApplicableDirectionalEvidenceCount: z.number().int().nonnegative(),
});
export type TradePlanAssemblyBiasSummary = z.infer<
  typeof TradePlanAssemblyBiasSummarySchema
>;

export const TradePlanAssemblyEntryConditionSchema = z.object({
  state: TradePlanAssemblyEntryConditionStateSchema,
  planningReferenceType: PlanningReferenceTypeSchema,
  planningReferencePrice: z.number().finite().positive().nullable(),
  currentPrice: z.number().finite().positive().nullable(),
  triggerLevel: z.number().finite().positive().nullable(),
  comparison: TradeTriggerComparisonSchema.nullable(),
  triggerSatisfied: z.boolean().nullable(),
  signedDistancePoints: z.number().finite().nullable(),
  sourceFeatureIds: z.array(MarketStateFeatureIdSchema),
  sourceValues: z.object({
    vwap: z.number().finite().positive().nullable(),
    openingRangeBoundary: z.number().finite().positive().nullable(),
  }),
  disclosureCode: z.literal("PLANNING_REFERENCE_ONLY"),
});
export type TradePlanAssemblyEntryCondition = z.infer<
  typeof TradePlanAssemblyEntryConditionSchema
>;

export const TradePlanAssemblyInvalidationSummarySchema = z.object({
  candidateId: InvalidationCandidateIdSchema.nullable(),
  levelType: InvalidationLevelTypeSchema.nullable(),
  levelSemantic: z.literal("STRUCTURAL_LEVEL").nullable(),
  level: z.number().finite().positive().nullable(),
  riskDistancePoints: z.number().finite().positive().nullable(),
  sourceFeatureId: MarketStateFeatureIdSchema.nullable(),
  sourceComponents: z.array(MarketContextComponentSchema),
  referenceDate: MarketDateSchema.nullable(),
  referenceDateRelation: MarketStateReferenceDateRelationSchema.nullable(),
  distanceRank: z.number().int().positive().nullable(),
  disclosureCode: z.literal("STRUCTURAL_INVALIDATION_REFERENCE_ONLY"),
});
export type TradePlanAssemblyInvalidationSummary = z.infer<
  typeof TradePlanAssemblyInvalidationSummarySchema
>;

export const TradePlanAssemblyObjectiveSummarySchema = z.object({
  candidateId: ObjectiveCandidateIdSchema.nullable(),
  levelType: ObjectiveLevelTypeSchema.nullable(),
  levelSemantic: RiskLevelSemanticSchema.nullable(),
  level: z.number().finite().positive().nullable(),
  objectiveDistancePoints: z.number().finite().positive().nullable(),
  rewardRiskRatio: z.number().finite().nonnegative().nullable(),
  minimumRewardRiskRatio: z.number().finite().positive(),
  qualificationStatus: ObjectiveQualificationStatusSchema.nullable(),
  sourceFeatureId: MarketStateFeatureIdSchema.nullable(),
  sourceComponents: z.array(MarketContextComponentSchema),
  referenceDate: MarketDateSchema.nullable(),
  referenceDateRelation: MarketStateReferenceDateRelationSchema.nullable(),
  distanceRank: z.number().int().positive().nullable(),
  disclosureCode: z.literal("UNDERLYING_OBJECTIVE_REFERENCE_ONLY"),
});
export type TradePlanAssemblyObjectiveSummary = z.infer<
  typeof TradePlanAssemblyObjectiveSummarySchema
>;

export const TradePlanAssemblyRiskRewardSummarySchema = z.object({
  riskDistancePoints: z.number().finite().positive().nullable(),
  rewardDistancePoints: z.number().finite().positive().nullable(),
  rewardRiskRatio: z.number().finite().nonnegative().nullable(),
  minimumRequiredRewardRiskRatio: z.number().finite().positive(),
  qualification: RiskQualificationStateSchema,
  calculationUnit: z.literal("SPY_UNDERLYING_PRICE_POINTS"),
});
export type TradePlanAssemblyRiskRewardSummary = z.infer<
  typeof TradePlanAssemblyRiskRewardSummarySchema
>;

export const TradePlanAssemblySelectedContractSummarySchema = z.object({
  candidateId: z.string().min(1).nullable(),
  contractSymbol: z.string().min(1).nullable(),
  contractDirection: z.enum(["CALL", "PUT"]).nullable(),
  description: z.string().nullable(),
  strikePrice: z.number().finite().positive().nullable(),
  expirationDate: MarketDateSchema.nullable(),
  nonStandard: z.boolean().nullable(),
  mini: z.boolean().nullable(),
  multiplier: z.number().finite().positive().nullable(),
  moneyness: ContractMoneynessSchema.nullable(),
  bid: z.number().finite().positive().nullable(),
  ask: z.number().finite().positive().nullable(),
  calculatedMidpoint: z.number().finite().positive().nullable(),
  providerMark: z.number().finite().nonnegative().nullable(),
  spreadPoints: z.number().finite().nonnegative().nullable(),
  spreadRatio: z.number().finite().nonnegative().nullable(),
  spreadPercent: z.number().finite().nonnegative().nullable(),
  bidSize: z.number().int().nonnegative().nullable(),
  askSize: z.number().int().nonnegative().nullable(),
  openInterest: z.number().int().nonnegative().nullable(),
  volume: z.number().int().nonnegative().nullable(),
  delta: z.number().finite().nullable(),
  gamma: z.number().finite().nonnegative().nullable(),
  theta: z.number().finite().nullable(),
  vega: z.number().finite().nullable(),
  rho: z.number().finite().nullable(),
  impliedVolatilityPercent: z.number().finite().nonnegative().nullable(),
  quoteAt: z.string().datetime().nullable(),
  tradeAt: z.string().datetime().nullable(),
  quoteAgeMilliseconds: z.number().finite().nonnegative().nullable(),
  quoteFreshnessState: ContractQuoteFreshnessStateSchema.nullable(),
  strikeDistancePoints: z.number().finite().nonnegative().nullable(),
  selectionRank: z.number().int().positive().nullable(),
});
export type TradePlanAssemblySelectedContractSummary = z.infer<
  typeof TradePlanAssemblySelectedContractSummarySchema
>;

export const TradePlanAssemblyPremiumReferenceSchema = z.object({
  type: z.enum(["CALCULATED_BID_ASK_MIDPOINT", "UNAVAILABLE"]),
  value: z.number().finite().positive().nullable(),
  disclosureCode: z.literal("MIDPOINT_REFERENCE_ONLY"),
});
export type TradePlanAssemblyPremiumReference = z.infer<
  typeof TradePlanAssemblyPremiumReferenceSchema
>;

export const TradePlanAssemblySourceSummarySchema = z.object({
  upstreamSameSnapshotGuaranteed: z.boolean(),
  marketState: z.object({
    product: z.literal("SPY_ZERO_DTE_DETERMINISTIC_MARKET_STATE"),
    version: MarketStateFeatureVersionSchema,
    calculatedAt: z.string().datetime(),
    engineState: MarketStateEngineStateSchema,
    warningCode: MarketStateOverallWarningCodeSchema.nullable(),
  }),
  bias: z.object({
    product: z.literal("SPY_ZERO_DTE_DETERMINISTIC_BIAS_CONFIDENCE"),
    version: BiasMethodologyVersionSchema,
    calculatedAt: z.string().datetime(),
    engineState: BiasEngineStateSchema,
    biasState: DeterministicBiasStateSchema,
    warningCode: BiasOverallWarningCodeSchema.nullable(),
  }),
  tradePlan: z.object({
    product: z.literal("SPY_ZERO_DTE_DETERMINISTIC_CONDITIONAL_TRADE_PLAN"),
    version: TradePlanMethodologyVersionSchema,
    calculatedAt: z.string().datetime(),
    engineState: TradePlanEngineStateSchema,
    setupState: TradeSetupStateSchema,
    setupDirection: TradeSetupDirectionSchema,
    primaryReasonCode: TradePlanPrimaryReasonCodeSchema,
    warningCode: TradePlanOverallWarningCodeSchema.nullable(),
  }),
  risk: z.object({
    product: z.literal("SPY_ZERO_DTE_DETERMINISTIC_OBJECTIVE_RISK_FRAMEWORK"),
    version: RiskMethodologyVersionSchema,
    calculatedAt: z.string().datetime(),
    engineState: RiskFrameworkEngineStateSchema,
    frameworkState: ObjectiveRiskFrameworkStateSchema,
    riskQualification: RiskQualificationStateSchema,
    direction: ObjectiveRiskDirectionSchema,
    primaryReasonCode: RiskPrimaryReasonCodeSchema,
    warningCode: RiskOverallWarningCodeSchema.nullable(),
  }),
  contract: z.object({
    product: z.literal("SPY_ZERO_DTE_DETERMINISTIC_CONTRACT_SELECTION_LIQUIDITY"),
    version: ContractMethodologyVersionSchema,
    calculatedAt: z.string().datetime(),
    engineState: ContractSelectionEngineStateSchema,
    selectionState: ContractSelectionStateSchema,
    contractDirection: SelectedContractDirectionSchema,
    sourceCompatibilityState: ContractSourceCompatibilityStateSchema,
    sourceOptionsChainFetchedAt: z.string().datetime().nullable(),
    sourceOptionsChainMetricState: OptionsChainMetricStateSchema.nullable(),
    sourceOptionsChainSourceState: OptionsChainSourceStateSchema.nullable(),
    sourceOptionsChainWarningCode: OptionsChainWarningCodeSchema.nullable(),
    sourceOptionsChainIsDelayed: z.boolean().nullable(),
    primaryReasonCode: ContractSelectionPrimaryReasonCodeSchema,
    warningCode: ContractSelectionOverallWarningCodeSchema.nullable(),
  }),
  selectedContractQuoteAt: z.string().datetime().nullable(),
});
export type TradePlanAssemblySourceSummary = z.infer<
  typeof TradePlanAssemblySourceSummarySchema
>;

export const TradePlanAssemblyDisclosuresSchema = z.object({
  planningReference: z.literal("PLANNING_REFERENCE_ONLY"),
  structuralInvalidation: z.literal("STRUCTURAL_INVALIDATION_REFERENCE_ONLY"),
  underlyingObjective: z.literal("UNDERLYING_OBJECTIVE_REFERENCE_ONLY"),
  premiumReference: z.literal("MIDPOINT_REFERENCE_ONLY"),
  confidence: z.literal("STRUCTURAL_EVIDENCE_ONLY"),
  noOrderExecution: z.literal(true),
  noPositionSizing: z.literal(true),
  noGuaranteedFill: z.literal(true),
  noPremiumTarget: z.literal(true),
  noPremiumStop: z.literal(true),
});
export type TradePlanAssemblyDisclosures = z.infer<
  typeof TradePlanAssemblyDisclosuresSchema
>;

export const TradePlanAssemblyMethodologySchema = z.object({
  sourceProducts: z.tuple([
    z.literal("SPY_ZERO_DTE_DETERMINISTIC_MARKET_STATE"),
    z.literal("SPY_ZERO_DTE_DETERMINISTIC_BIAS_CONFIDENCE"),
    z.literal("SPY_ZERO_DTE_DETERMINISTIC_CONDITIONAL_TRADE_PLAN"),
    z.literal("SPY_ZERO_DTE_DETERMINISTIC_OBJECTIVE_RISK_FRAMEWORK"),
    z.literal("SPY_ZERO_DTE_DETERMINISTIC_CONTRACT_SELECTION_LIQUIDITY"),
  ]),
  sourceMethodologies: z.tuple([
    z.literal("V1"),
    z.literal("BIAS_V1"),
    z.literal("TRADE_PLAN_V1"),
    z.literal("RISK_V1"),
    z.literal("CONTRACT_V1"),
  ]),
  calculationUnit: z.literal("SPY_UNDERLYING_PRICE_POINTS"),
  assemblyOnly: z.literal(true),
  contractCandidateDetailsRoute: z.literal("/api/trade-contract/spy"),
});
export type TradePlanAssemblyMethodology = z.infer<
  typeof TradePlanAssemblyMethodologySchema
>;

export const SpyZeroDteTradePlanAssemblyResponseSchema = z
  .object({
    symbol: z.literal("SPY"),
    product: z.literal("SPY_ZERO_DTE_DETERMINISTIC_TRADE_PLAN_ASSEMBLY"),
    methodologyVersion: TradePlanAssemblyMethodologyVersionSchema,
    currentMarketDate: MarketDateSchema,
    mostRecentRthSessionDate: MarketDateSchema.nullable(),
    calculatedAt: z.string().datetime(),
    engineState: TradePlanAssemblyEngineStateSchema,
    planState: DeterministicTradePlanStateSchema,
    direction: AssembledTradePlanDirectionSchema,
    primaryReasonCode: TradePlanAssemblyPrimaryReasonCodeSchema,
    warningCode: TradePlanAssemblyWarningCodeSchema.nullable(),
    currentPrice: z.number().finite().positive().nullable(),
    priceSource: MarketStatePriceSourceSchema.nullable(),
    quoteTimestamp: z.string().datetime().nullable(),
    sessionPhase: MarketContextSessionWindowSchema.nullable(),
    bias: TradePlanAssemblyBiasSummarySchema,
    entryCondition: TradePlanAssemblyEntryConditionSchema,
    structuralInvalidation: TradePlanAssemblyInvalidationSummarySchema,
    primaryObjective: TradePlanAssemblyObjectiveSummarySchema,
    underlyingRiskReward: TradePlanAssemblyRiskRewardSummarySchema,
    selectedContract: TradePlanAssemblySelectedContractSummarySchema,
    premiumReference: TradePlanAssemblyPremiumReferenceSchema,
    sourceSummary: TradePlanAssemblySourceSummarySchema,
    disclosures: TradePlanAssemblyDisclosuresSchema,
    methodology: TradePlanAssemblyMethodologySchema,
  })
  .superRefine((value, ctx) => {
    if (value.engineState === "PARTIAL" && value.planState === "READY") {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "PARTIAL Assembly engine cannot produce READY",
      });
    }

    if (
      (value.planState === "UNAVAILABLE") !==
      (value.engineState === "UNAVAILABLE")
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "UNAVAILABLE Assembly plan and engine states must match",
      });
    }

    if (
      ["READY", "WAITING_FOR_TRIGGER", "NO_QUALIFIED_CONTRACT"].includes(value.planState) &&
      !["CALLS", "PUTS"].includes(value.direction)
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Directional Assembly states require CALLS or PUTS",
      });
    }
    if (
      ["NO_SETUP", "NOT_APPLICABLE"].includes(value.planState) &&
      value.direction !== "NONE"
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "NO_SETUP and NOT_APPLICABLE Assembly states require NONE direction",
      });
    }
    if (value.planState === "UNAVAILABLE" && value.direction !== "UNAVAILABLE") {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "UNAVAILABLE Assembly state requires UNAVAILABLE direction",
      });
    }

    const hasSelectedContract = value.selectedContract.candidateId !== null;
    const selectedContractHasAnyValue = Object.values(value.selectedContract).some(
      (item) => item !== null,
    );
    if (value.planState === "READY") {
      if (
        value.engineState !== "AVAILABLE" ||
        !["CALLS", "PUTS"].includes(value.direction) ||
        !value.sourceSummary.upstreamSameSnapshotGuaranteed ||
        value.sourceSummary.risk.frameworkState !== "READY" ||
        value.sourceSummary.risk.riskQualification !== "QUALIFIED" ||
        value.sourceSummary.contract.selectionState !== "SELECTED" ||
        value.sourceSummary.contract.sourceCompatibilityState !== "COMPATIBLE" ||
        !hasSelectedContract ||
        value.selectedContract.selectionRank !== 1 ||
        value.selectedContract.quoteFreshnessState !== "FRESH" ||
        (value.direction === "CALLS" && value.selectedContract.contractDirection !== "CALL") ||
        (value.direction === "PUTS" && value.selectedContract.contractDirection !== "PUT") ||
        value.structuralInvalidation.candidateId === null ||
        value.structuralInvalidation.levelSemantic !== "STRUCTURAL_LEVEL" ||
        value.primaryObjective.candidateId === null ||
        value.primaryObjective.qualificationStatus !== "QUALIFIED" ||
        value.underlyingRiskReward.qualification !== "QUALIFIED" ||
        value.underlyingRiskReward.rewardRiskRatio === null ||
        value.underlyingRiskReward.rewardRiskRatio <
          value.underlyingRiskReward.minimumRequiredRewardRiskRatio ||
        value.premiumReference.type !== "CALCULATED_BID_ASK_MIDPOINT" ||
        value.premiumReference.value === null ||
        value.premiumReference.value !== value.selectedContract.calculatedMidpoint ||
        value.entryCondition.state !== "SATISFIED" ||
        value.entryCondition.planningReferenceType !== "CURRENT_PRICE"
      ) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "READY Assembly response is inconsistent",
        });
      }
    } else if (
      selectedContractHasAnyValue ||
      value.premiumReference.type !== "UNAVAILABLE" ||
      value.premiumReference.value !== null
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Non-READY Assembly cannot expose a selected contract or midpoint",
      });
    }

    if (value.planState === "WAITING_FOR_TRIGGER") {
      if (
        value.sourceSummary.risk.frameworkState !== "PREVIEW" ||
        value.sourceSummary.contract.selectionState !== "DEFERRED" ||
        value.entryCondition.state !== "WAITING" ||
        value.entryCondition.planningReferenceType !== "TRIGGER_LEVEL" ||
        value.entryCondition.triggerLevel === null ||
        value.entryCondition.triggerSatisfied !== false
      ) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "WAITING_FOR_TRIGGER Assembly response is inconsistent",
        });
      }
    }

    if (value.planState === "NO_QUALIFIED_CONTRACT") {
      if (
        value.sourceSummary.risk.frameworkState !== "READY" ||
        value.sourceSummary.risk.riskQualification !== "QUALIFIED" ||
        value.sourceSummary.contract.selectionState !== "NO_QUALIFIED_CONTRACT" ||
        value.structuralInvalidation.candidateId === null ||
        value.primaryObjective.candidateId === null
      ) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "NO_QUALIFIED_CONTRACT Assembly response is inconsistent",
        });
      }
    }

    if (value.planState === "NOT_QUALIFIED") {
      if (
        value.sourceSummary.risk.frameworkState !== "NOT_QUALIFIED" ||
        value.sourceSummary.contract.selectionState !== "NOT_APPLICABLE"
      ) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "NOT_QUALIFIED Assembly response is inconsistent",
        });
      }
    }

    if (["NO_SETUP", "NOT_APPLICABLE"].includes(value.planState)) {
      const structuralHasAnyValue = Object.entries(value.structuralInvalidation).some(
        ([key, item]) => key !== "disclosureCode" && key !== "sourceComponents" && item !== null,
      ) || value.structuralInvalidation.sourceComponents.length > 0;
      const objectiveHasAnyValue = Object.entries(value.primaryObjective).some(
        ([key, item]) =>
          !["disclosureCode", "sourceComponents", "minimumRewardRiskRatio"].includes(key) &&
          item !== null,
      ) || value.primaryObjective.sourceComponents.length > 0;
      if (
        value.entryCondition.state !== "NOT_APPLICABLE" ||
        structuralHasAnyValue ||
        objectiveHasAnyValue ||
        value.underlyingRiskReward.riskDistancePoints !== null ||
        value.underlyingRiskReward.rewardDistancePoints !== null ||
        value.underlyingRiskReward.rewardRiskRatio !== null
      ) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "Non-candidate Assembly state cannot expose structural selections",
        });
      }
    }
  });
export type SpyZeroDteTradePlanAssemblyResponse = z.infer<
  typeof SpyZeroDteTradePlanAssemblyResponseSchema
>;

/** Deterministic SPY 0DTE position-sizing and caller-supplied account-risk contract. */
export const PositionSizingMethodologyVersionSchema = z.literal("SIZING_V1");
export type PositionSizingMethodologyVersion = z.infer<
  typeof PositionSizingMethodologyVersionSchema
>;

export const PositionSizingEngineStateSchema = z.enum([
  "AVAILABLE",
  "PARTIAL",
  "UNAVAILABLE",
]);
export type PositionSizingEngineState = z.infer<
  typeof PositionSizingEngineStateSchema
>;

export const PositionSizingStateSchema = z.enum([
  "SIZED",
  "NO_CAPACITY",
  "BLOCKED",
  "NOT_APPLICABLE",
  "UNAVAILABLE",
]);
export type PositionSizingState = z.infer<typeof PositionSizingStateSchema>;

export const PositionSizingPrimaryReasonCodeSchema = z.enum([
  "POSITION_SIZE_CALCULATED",
  "NO_CAPACITY_FOR_ONE_CONTRACT",
  "BLOCKED_MAXIMUM_RISK_PER_TRADE_ZERO",
  "BLOCKED_DAILY_LOSS_BUDGET_EXHAUSTED",
  "BLOCKED_PORTFOLIO_RISK_BUDGET_EXHAUSTED",
  "BLOCKED_AVAILABLE_CASH_EXHAUSTED",
  "BLOCKED_MAXIMUM_CAPITAL_ALLOCATION_ZERO",
  "BLOCKED_MAXIMUM_CONTRACTS_ZERO",
  "SOURCE_ASSEMBLY_NOT_READY",
  "SOURCE_ASSEMBLY_UNAVAILABLE",
  "SOURCE_SELECTED_CONTRACT_MISSING",
  "SOURCE_SELECTED_CONTRACT_NOT_FRESH",
  "SOURCE_SELECTED_CONTRACT_ASK_INVALID",
  "SOURCE_SELECTED_CONTRACT_MULTIPLIER_INVALID",
  "SOURCE_SELECTED_CONTRACT_EXPIRATION_INVALID",
  "SOURCE_DIRECTION_MISMATCH",
  "SIZING_CALCULATION_UNAVAILABLE",
]);
export type PositionSizingPrimaryReasonCode = z.infer<
  typeof PositionSizingPrimaryReasonCodeSchema
>;

export const PositionSizingWarningCodeSchema = z.enum([
  "ASSEMBLY_UNAVAILABLE",
  "ASSEMBLY_PARTIAL",
  "SELECTED_CONTRACT_UNAVAILABLE",
  "SELECTED_CONTRACT_QUOTE_STALE",
  "SELECTED_CONTRACT_ASK_UNAVAILABLE",
  "SELECTED_CONTRACT_MULTIPLIER_INVALID",
  "SELECTED_CONTRACT_EXPIRATION_INVALID",
  "INVALID_SIZING_NUMERIC_DATA",
  "SIZING_VALIDATION_FAILED",
]);
export type PositionSizingWarningCode = z.infer<
  typeof PositionSizingWarningCodeSchema
>;

export const RiskBudgetControlSchema = z.enum([
  "MAXIMUM_RISK_PER_TRADE",
  "REMAINING_DAILY_LOSS_BUDGET",
  "REMAINING_PORTFOLIO_RISK_BUDGET",
]);
export type RiskBudgetControl = z.infer<typeof RiskBudgetControlSchema>;

export const CapitalBudgetControlSchema = z.enum([
  "AVAILABLE_CASH",
  "MAXIMUM_CAPITAL_ALLOCATION",
]);
export type CapitalBudgetControl = z.infer<typeof CapitalBudgetControlSchema>;

export const QuantityLimitingControlSchema = z.enum([
  "RISK_BUDGET",
  "CAPITAL_BUDGET",
  "MAXIMUM_CONTRACTS",
]);
export type QuantityLimitingControl = z.infer<
  typeof QuantityLimitingControlSchema
>;

export const PositionSizingBlockingControlSchema = z.enum([
  "MAXIMUM_RISK_PER_TRADE",
  "REMAINING_DAILY_LOSS_BUDGET",
  "REMAINING_PORTFOLIO_RISK_BUDGET",
  "AVAILABLE_CASH",
  "MAXIMUM_CAPITAL_ALLOCATION",
  "MAXIMUM_CONTRACTS",
]);
export type PositionSizingBlockingControl = z.infer<
  typeof PositionSizingBlockingControlSchema
>;

const NonnegativeSafeIntegerSchema = z
  .number()
  .int()
  .nonnegative()
  .max(Number.MAX_SAFE_INTEGER);

export const PositionSizingAccountSnapshotSchema = z
  .object({
    accountEquityDollars: z.number().finite().positive(),
    availableCashDollars: z.number().finite().nonnegative(),
    remainingDailyLossBudgetDollars: z.number().finite().nonnegative(),
    remainingPortfolioRiskBudgetDollars: z.number().finite().nonnegative(),
  })
  .strict();
export type PositionSizingAccountSnapshot = z.infer<
  typeof PositionSizingAccountSnapshotSchema
>;

export const PositionSizingRiskPolicySchema = z
  .object({
    maximumRiskPerTradeDollars: z.number().finite().nonnegative(),
    maximumCapitalAllocationDollars: z.number().finite().nonnegative(),
    maximumContracts: NonnegativeSafeIntegerSchema,
  })
  .strict();
export type PositionSizingRiskPolicy = z.infer<
  typeof PositionSizingRiskPolicySchema
>;

export const SpyZeroDtePositionSizingRequestSchema = z
  .object({
    accountSnapshot: PositionSizingAccountSnapshotSchema,
    riskPolicy: PositionSizingRiskPolicySchema,
  })
  .strict();
export type SpyZeroDtePositionSizingRequest = z.infer<
  typeof SpyZeroDtePositionSizingRequestSchema
>;

export const PositionSizingRequestIssueCodeSchema = z.enum([
  "REQUIRED",
  "INVALID_TYPE",
  "NOT_FINITE",
  "MUST_BE_POSITIVE",
  "MUST_BE_NONNEGATIVE",
  "MUST_BE_SAFE_INTEGER",
  "UNRECOGNIZED_KEY",
  "INVALID_JSON",
]);
export type PositionSizingRequestIssueCode = z.infer<
  typeof PositionSizingRequestIssueCodeSchema
>;

export const PositionSizingRequestErrorResponseSchema = z
  .object({
    error: z.literal("INVALID_POSITION_SIZING_REQUEST"),
    issues: z
      .array(
        z
          .object({
            path: z.string().min(1),
            code: PositionSizingRequestIssueCodeSchema,
          })
          .strict(),
      )
      .min(1),
  })
  .strict();
export type PositionSizingRequestErrorResponse = z.infer<
  typeof PositionSizingRequestErrorResponseSchema
>;

export const PositionSizingSourceAssemblySchema = z
  .object({
    product: z.literal("SPY_ZERO_DTE_DETERMINISTIC_TRADE_PLAN_ASSEMBLY"),
    methodologyVersion: TradePlanAssemblyMethodologyVersionSchema,
    currentMarketDate: MarketDateSchema,
    calculatedAt: z.string().datetime(),
    engineState: TradePlanAssemblyEngineStateSchema,
    planState: DeterministicTradePlanStateSchema,
    direction: AssembledTradePlanDirectionSchema,
    primaryReasonCode: TradePlanAssemblyPrimaryReasonCodeSchema,
    warningCode: TradePlanAssemblyWarningCodeSchema.nullable(),
    upstreamSameSnapshotGuaranteed: z.boolean(),
    contractSourceCompatibilityState: ContractSourceCompatibilityStateSchema,
    sourceContractCalculatedAt: z.string().datetime(),
    sourceOptionsChainFetchedAt: z.string().datetime().nullable(),
    selectedContractQuoteAt: z.string().datetime().nullable(),
  })
  .strict();
export type PositionSizingSourceAssembly = z.infer<
  typeof PositionSizingSourceAssemblySchema
>;

export const PositionSizingSelectedContractSchema = z
  .object({
    candidateId: z.string().min(1).nullable(),
    contractSymbol: z.string().min(1).nullable(),
    contractDirection: z.enum(["CALL", "PUT"]).nullable(),
    strikePrice: z.number().finite().positive().nullable(),
    expirationDate: MarketDateSchema.nullable(),
    multiplier: z.number().finite().positive().nullable(),
    ask: z.number().finite().positive().nullable(),
    quoteAt: z.string().datetime().nullable(),
    quoteAgeMilliseconds: z.number().finite().nonnegative().nullable(),
    quoteFreshnessState: ContractQuoteFreshnessStateSchema.nullable(),
    selectionRank: z.number().int().positive().nullable(),
  })
  .strict();
export type PositionSizingSelectedContract = z.infer<
  typeof PositionSizingSelectedContractSchema
>;

export const PositionSizingAccountSnapshotAuditSchema = PositionSizingAccountSnapshotSchema.extend({
  disclosureCode: z.literal("CALLER_SUPPLIED_ACCOUNT_SNAPSHOT"),
}).strict();
export type PositionSizingAccountSnapshotAudit = z.infer<
  typeof PositionSizingAccountSnapshotAuditSchema
>;

export const PositionSizingPremiumRiskReferenceSchema = z
  .object({
    premiumPriceReferenceType: z.enum(["CURRENT_ASK", "UNAVAILABLE"]),
    premiumPriceReference: z.number().finite().positive().nullable(),
    multiplier: z.number().finite().positive().nullable(),
    premiumDebitReferencePerContractDollars: z.number().finite().positive().nullable(),
    fullPremiumLossReferencePerContractDollars: z.number().finite().positive().nullable(),
    disclosureCode: z.literal("CURRENT_ASK_FULL_PREMIUM_LOSS_REFERENCE_ONLY"),
  })
  .strict();
export type PositionSizingPremiumRiskReference = z.infer<
  typeof PositionSizingPremiumRiskReferenceSchema
>;

export const PositionSizingBudgetsSchema = z
  .object({
    effectiveRiskBudgetDollars: z.number().finite().nonnegative().nullable(),
    limitingRiskControls: z.array(RiskBudgetControlSchema),
    effectiveCapitalBudgetDollars: z.number().finite().nonnegative().nullable(),
    limitingCapitalControls: z.array(CapitalBudgetControlSchema),
  })
  .strict();
export type PositionSizingBudgets = z.infer<typeof PositionSizingBudgetsSchema>;

export const PositionSizingQuantityCalculationSchema = z
  .object({
    contractsPermittedByRisk: NonnegativeSafeIntegerSchema.nullable(),
    contractsPermittedByCapital: NonnegativeSafeIntegerSchema.nullable(),
    maximumContractsPolicyLimit: NonnegativeSafeIntegerSchema,
    maximumContractsUnderPolicy: NonnegativeSafeIntegerSchema.nullable(),
    limitingQuantityControls: z.array(QuantityLimitingControlSchema),
    blockingControls: z.array(PositionSizingBlockingControlSchema),
    disclosureCode: z.literal("POSITION_SIZE_REFERENCE_ONLY"),
  })
  .strict();
export type PositionSizingQuantityCalculation = z.infer<
  typeof PositionSizingQuantityCalculationSchema
>;

export const PositionSizingPositionReferencesSchema = z
  .object({
    totalPremiumDebitReferenceDollars: z.number().finite().nonnegative().nullable(),
    totalFullPremiumLossReferenceDollars: z.number().finite().nonnegative().nullable(),
    riskPercentOfAccountEquity: z.number().finite().nonnegative().nullable(),
    capitalPercentOfAccountEquity: z.number().finite().nonnegative().nullable(),
  })
  .strict();
export type PositionSizingPositionReferences = z.infer<
  typeof PositionSizingPositionReferencesSchema
>;

export const PositionSizingRevalidationSchema = z
  .object({
    required: z.boolean(),
    disclosureCode: z.literal("REVALIDATE_CURRENT_ASK_BEFORE_ANY_ORDER"),
  })
  .strict();
export type PositionSizingRevalidation = z.infer<
  typeof PositionSizingRevalidationSchema
>;

export const PositionSizingDisclosuresSchema = z
  .object({
    callerSuppliedAccountSnapshot: z.literal(true),
    currentAskIsNotGuaranteed: z.literal(true),
    fullPremiumLossAssumption: z.literal(true),
    quantityIsReferenceOnly: z.literal(true),
    noOrderExecution: z.literal(true),
    noBrokerAccountAccess: z.literal(true),
    noPersistence: z.literal(true),
    noPremiumStop: z.literal(true),
    noPremiumTarget: z.literal(true),
  })
  .strict();
export type PositionSizingDisclosures = z.infer<
  typeof PositionSizingDisclosuresSchema
>;

export const PositionSizingMethodologySchema = z
  .object({
    sizingPremiumReference: z.literal("CURRENT_ASK"),
    maximumLossMethod: z.literal("FULL_PREMIUM_DEBIT_REFERENCE"),
    effectiveRiskBudgetMethod: z.literal("MINIMUM_OF_EXPLICIT_RISK_LIMITS"),
    effectiveCapitalBudgetMethod: z.literal(
      "MINIMUM_OF_AVAILABLE_CASH_AND_ALLOCATION_LIMIT",
    ),
    quantityMethod: z.literal("FLOOR_THEN_MINIMUM_OF_ALL_CONTROLS"),
    multiplierRequirement: z.literal(100),
    positionType: z.literal("LONG_SINGLE_LEG_OPTION_ONLY"),
    calculationCurrency: z.literal("USD"),
  })
  .strict();
export type PositionSizingMethodology = z.infer<
  typeof PositionSizingMethodologySchema
>;

function sameOrderedValues(left: readonly string[], right: readonly string[]): boolean {
  return left.length === right.length && left.every((value, index) => value === right[index]);
}

export const SpyZeroDtePositionSizingResponseSchema = z
  .object({
    symbol: z.literal("SPY"),
    product: z.literal("SPY_ZERO_DTE_DETERMINISTIC_POSITION_SIZING_ACCOUNT_RISK"),
    methodologyVersion: PositionSizingMethodologyVersionSchema,
    currentMarketDate: MarketDateSchema,
    calculatedAt: z.string().datetime(),
    engineState: PositionSizingEngineStateSchema,
    sizingState: PositionSizingStateSchema,
    primaryReasonCode: PositionSizingPrimaryReasonCodeSchema,
    warningCode: PositionSizingWarningCodeSchema.nullable(),
    sourceAssembly: PositionSizingSourceAssemblySchema,
    selectedContract: PositionSizingSelectedContractSchema,
    accountSnapshot: PositionSizingAccountSnapshotAuditSchema,
    riskPolicy: PositionSizingRiskPolicySchema,
    premiumRiskReference: PositionSizingPremiumRiskReferenceSchema,
    budgets: PositionSizingBudgetsSchema,
    quantityCalculation: PositionSizingQuantityCalculationSchema,
    positionReferences: PositionSizingPositionReferencesSchema,
    revalidation: PositionSizingRevalidationSchema,
    disclosures: PositionSizingDisclosuresSchema,
    methodology: PositionSizingMethodologySchema,
  })
  .strict()
  .superRefine((value, ctx) => {
    const add = (message: string): void => {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message });
    };

    if (value.currentMarketDate !== value.sourceAssembly.currentMarketDate) {
      add("Sizing and Assembly market dates must match");
    }
    if (value.engineState === "PARTIAL" && value.sizingState === "SIZED") {
      add("PARTIAL Sizing engine cannot produce a positive size");
    }
    if ((value.engineState === "UNAVAILABLE") !== (value.sizingState === "UNAVAILABLE")) {
      add("UNAVAILABLE Sizing engine and sizing states must match");
    }

    const quantity = value.quantityCalculation.maximumContractsUnderPolicy;
    if (value.sizingState === "SIZED" && (quantity === null || quantity < 1)) {
      add("SIZED requires a positive contract reference");
    }
    if (["NO_CAPACITY", "BLOCKED"].includes(value.sizingState) && quantity !== 0) {
      add("NO_CAPACITY and BLOCKED require zero contracts");
    }
    if (["NOT_APPLICABLE", "UNAVAILABLE"].includes(value.sizingState) && quantity !== null) {
      add("Non-applicable and unavailable sizing require null quantity");
    }

    const applicable = ["SIZED", "NO_CAPACITY", "BLOCKED"].includes(value.sizingState);
    if (applicable) {
      const contract = value.selectedContract;
      const directionMatches =
        (value.sourceAssembly.direction === "CALLS" && contract.contractDirection === "CALL") ||
        (value.sourceAssembly.direction === "PUTS" && contract.contractDirection === "PUT");
      if (
        value.engineState !== "AVAILABLE" ||
        value.sourceAssembly.engineState !== "AVAILABLE" ||
        value.sourceAssembly.planState !== "READY" ||
        !value.sourceAssembly.upstreamSameSnapshotGuaranteed ||
        value.sourceAssembly.contractSourceCompatibilityState !== "COMPATIBLE" ||
        !directionMatches ||
        contract.candidateId === null ||
        contract.contractSymbol === null ||
        contract.strikePrice === null ||
        contract.expirationDate !== value.currentMarketDate ||
        contract.multiplier !== 100 ||
        contract.ask === null ||
        contract.quoteAt === null ||
        contract.quoteFreshnessState !== "FRESH" ||
        contract.selectionRank !== 1
      ) {
        add("Applicable sizing requires a complete READY Assembly contract");
      }

      const premium = value.premiumRiskReference;
      if (
        premium.premiumPriceReferenceType !== "CURRENT_ASK" ||
        premium.premiumPriceReference !== contract.ask ||
        premium.multiplier !== 100 ||
        premium.premiumDebitReferencePerContractDollars === null ||
        premium.fullPremiumLossReferencePerContractDollars === null ||
        premium.premiumDebitReferencePerContractDollars !== contract.ask! * 100 ||
        premium.fullPremiumLossReferencePerContractDollars !==
          premium.premiumDebitReferencePerContractDollars
      ) {
        add("Applicable sizing premium references are inconsistent");
      }

      const expectedRiskBudget = Math.min(
        value.riskPolicy.maximumRiskPerTradeDollars,
        value.accountSnapshot.remainingDailyLossBudgetDollars,
        value.accountSnapshot.remainingPortfolioRiskBudgetDollars,
      );
      const expectedRiskControls: RiskBudgetControl[] = [];
      if (value.riskPolicy.maximumRiskPerTradeDollars === expectedRiskBudget) {
        expectedRiskControls.push("MAXIMUM_RISK_PER_TRADE");
      }
      if (value.accountSnapshot.remainingDailyLossBudgetDollars === expectedRiskBudget) {
        expectedRiskControls.push("REMAINING_DAILY_LOSS_BUDGET");
      }
      if (value.accountSnapshot.remainingPortfolioRiskBudgetDollars === expectedRiskBudget) {
        expectedRiskControls.push("REMAINING_PORTFOLIO_RISK_BUDGET");
      }

      const expectedCapitalBudget = Math.min(
        value.accountSnapshot.availableCashDollars,
        value.riskPolicy.maximumCapitalAllocationDollars,
      );
      const expectedCapitalControls: CapitalBudgetControl[] = [];
      if (value.accountSnapshot.availableCashDollars === expectedCapitalBudget) {
        expectedCapitalControls.push("AVAILABLE_CASH");
      }
      if (value.riskPolicy.maximumCapitalAllocationDollars === expectedCapitalBudget) {
        expectedCapitalControls.push("MAXIMUM_CAPITAL_ALLOCATION");
      }

      if (
        value.budgets.effectiveRiskBudgetDollars !== expectedRiskBudget ||
        !sameOrderedValues(value.budgets.limitingRiskControls, expectedRiskControls) ||
        value.budgets.effectiveCapitalBudgetDollars !== expectedCapitalBudget ||
        !sameOrderedValues(value.budgets.limitingCapitalControls, expectedCapitalControls)
      ) {
        add("Sizing budget calculations are inconsistent");
      }

      const perContract = premium.premiumDebitReferencePerContractDollars!;
      const byRisk = Math.floor(expectedRiskBudget / perContract);
      const byCapital = Math.floor(expectedCapitalBudget / perContract);
      const finalQuantity = Math.min(
        byRisk,
        byCapital,
        value.riskPolicy.maximumContracts,
      );
      const expectedQuantityControls: QuantityLimitingControl[] = [];
      if (byRisk === finalQuantity) expectedQuantityControls.push("RISK_BUDGET");
      if (byCapital === finalQuantity) expectedQuantityControls.push("CAPITAL_BUDGET");
      if (value.riskPolicy.maximumContracts === finalQuantity) {
        expectedQuantityControls.push("MAXIMUM_CONTRACTS");
      }

      const expectedBlockers: PositionSizingBlockingControl[] = [];
      if (value.riskPolicy.maximumRiskPerTradeDollars === 0) {
        expectedBlockers.push("MAXIMUM_RISK_PER_TRADE");
      }
      if (value.accountSnapshot.remainingDailyLossBudgetDollars === 0) {
        expectedBlockers.push("REMAINING_DAILY_LOSS_BUDGET");
      }
      if (value.accountSnapshot.remainingPortfolioRiskBudgetDollars === 0) {
        expectedBlockers.push("REMAINING_PORTFOLIO_RISK_BUDGET");
      }
      if (value.accountSnapshot.availableCashDollars === 0) {
        expectedBlockers.push("AVAILABLE_CASH");
      }
      if (value.riskPolicy.maximumCapitalAllocationDollars === 0) {
        expectedBlockers.push("MAXIMUM_CAPITAL_ALLOCATION");
      }
      if (value.riskPolicy.maximumContracts === 0) {
        expectedBlockers.push("MAXIMUM_CONTRACTS");
      }

      if (
        value.quantityCalculation.contractsPermittedByRisk !== byRisk ||
        value.quantityCalculation.contractsPermittedByCapital !== byCapital ||
        value.quantityCalculation.maximumContractsPolicyLimit !==
          value.riskPolicy.maximumContracts ||
        value.quantityCalculation.maximumContractsUnderPolicy !== finalQuantity ||
        !sameOrderedValues(
          value.quantityCalculation.limitingQuantityControls,
          expectedQuantityControls,
        ) ||
        !sameOrderedValues(value.quantityCalculation.blockingControls, expectedBlockers)
      ) {
        add("Sizing quantity calculations are inconsistent");
      }

      const expectedState =
        expectedBlockers.length > 0
          ? "BLOCKED"
          : finalQuantity > 0
            ? "SIZED"
            : "NO_CAPACITY";
      if (value.sizingState !== expectedState) {
        add("Sizing state does not match the calculated quantity and blockers");
      }

      const expectedTotal = finalQuantity * perContract;
      const expectedPercent =
        (expectedTotal / value.accountSnapshot.accountEquityDollars) * 100;
      if (
        value.positionReferences.totalPremiumDebitReferenceDollars !== expectedTotal ||
        value.positionReferences.totalFullPremiumLossReferenceDollars !== expectedTotal ||
        value.positionReferences.riskPercentOfAccountEquity !== expectedPercent ||
        value.positionReferences.capitalPercentOfAccountEquity !== expectedPercent
      ) {
        add("Sizing position references are inconsistent");
      }

      const expectedRevalidation = ["SIZED", "NO_CAPACITY"].includes(value.sizingState);
      if (value.revalidation.required !== expectedRevalidation) {
        add("Sizing revalidation state is inconsistent");
      }
    } else {
      if (
        value.premiumRiskReference.premiumPriceReferenceType !== "UNAVAILABLE" ||
        value.premiumRiskReference.premiumPriceReference !== null ||
        value.premiumRiskReference.multiplier !== null ||
        value.premiumRiskReference.premiumDebitReferencePerContractDollars !== null ||
        value.premiumRiskReference.fullPremiumLossReferencePerContractDollars !== null ||
        value.budgets.effectiveRiskBudgetDollars !== null ||
        value.budgets.limitingRiskControls.length !== 0 ||
        value.budgets.effectiveCapitalBudgetDollars !== null ||
        value.budgets.limitingCapitalControls.length !== 0 ||
        value.quantityCalculation.contractsPermittedByRisk !== null ||
        value.quantityCalculation.contractsPermittedByCapital !== null ||
        value.quantityCalculation.limitingQuantityControls.length !== 0 ||
        value.quantityCalculation.blockingControls.length !== 0 ||
        Object.values(value.positionReferences).some((entry) => entry !== null) ||
        value.revalidation.required
      ) {
        add("Non-applicable or unavailable sizing must not expose derived calculations");
      }
    }
  });
export type SpyZeroDtePositionSizingResponse = z.infer<
  typeof SpyZeroDtePositionSizingResponseSchema
>;

// ---------------------------------------------------------------------------
// Schwab read-only account-risk snapshot foundation (ACCOUNT_RISK_SNAPSHOT_V1)
// ---------------------------------------------------------------------------

export const AccountRiskSnapshotMethodologyVersionSchema = z.literal(
  "ACCOUNT_RISK_SNAPSHOT_V1",
);
export type AccountRiskSnapshotMethodologyVersion = z.infer<
  typeof AccountRiskSnapshotMethodologyVersionSchema
>;

export const AccountRiskSnapshotEngineStateSchema = z.enum([
  "AVAILABLE",
  "PARTIAL",
  "UNAVAILABLE",
]);
export type AccountRiskSnapshotEngineState = z.infer<
  typeof AccountRiskSnapshotEngineStateSchema
>;

export const AccountRiskSnapshotStateSchema = z.enum([
  "READY",
  "PARTIAL",
  "NO_ACCOUNT",
  "ACCOUNT_SELECTION_REQUIRED",
  "UNSUPPORTED_ACCOUNT",
  "UNAUTHORIZED",
  "UNAVAILABLE",
]);
export type AccountRiskSnapshotState = z.infer<
  typeof AccountRiskSnapshotStateSchema
>;

export const AccountRiskSnapshotPrimaryReasonCodeSchema = z.enum([
  "ACCOUNT_RISK_SNAPSHOT_READY",
  "ACCOUNT_RISK_SNAPSHOT_PARTIAL",
  "NO_LINKED_ACCOUNT",
  "MULTIPLE_LINKED_ACCOUNTS_REQUIRE_SELECTION",
  "SELECTED_ACCOUNT_TYPE_UNSUPPORTED",
  "SCHWAB_ACCOUNT_ACCESS_UNAUTHORIZED",
  "SCHWAB_ACCOUNT_DISCOVERY_TIMEOUT",
  "SCHWAB_ACCOUNT_DISCOVERY_NETWORK_ERROR",
  "SCHWAB_ACCOUNT_DISCOVERY_RATE_LIMITED",
  "SCHWAB_ACCOUNT_DISCOVERY_UNAVAILABLE",
  "SCHWAB_ACCOUNT_BALANCES_TIMEOUT",
  "SCHWAB_ACCOUNT_BALANCES_NETWORK_ERROR",
  "SCHWAB_ACCOUNT_BALANCES_RATE_LIMITED",
  "SCHWAB_ACCOUNT_BALANCES_UNAVAILABLE",
  "ACCOUNT_EQUITY_FIELD_UNAVAILABLE",
  "AVAILABLE_CASH_FIELD_UNAVAILABLE",
  "ACCOUNT_DISCOVERY_RESPONSE_INVALID",
  "ACCOUNT_BALANCE_RESPONSE_INVALID",
  "ACCOUNT_NORMALIZATION_UNAVAILABLE",
]);
export type AccountRiskSnapshotPrimaryReasonCode = z.infer<
  typeof AccountRiskSnapshotPrimaryReasonCodeSchema
>;

export const AccountRiskSnapshotWarningCodeSchema = z.enum([
  "ACCOUNT_EQUITY_UNAVAILABLE",
  "AVAILABLE_CASH_UNAVAILABLE",
  "ACCOUNT_SNAPSHOT_PARTIAL",
  "NEGATIVE_BROKER_BALANCE_REPORTED",
  "ACCOUNT_SOURCE_TIMESTAMP_UNAVAILABLE",
  "ACCOUNT_NORMALIZATION_VALIDATION_FAILED",
]);
export type AccountRiskSnapshotWarningCode = z.infer<
  typeof AccountRiskSnapshotWarningCodeSchema
>;

export const AccountRiskSelectionStateSchema = z.enum([
  "SELECTED",
  "NO_ACCOUNT",
  "ACCOUNT_SELECTION_REQUIRED",
  "UNAVAILABLE",
]);
export type AccountRiskSelectionState = z.infer<
  typeof AccountRiskSelectionStateSchema
>;

export const AccountRiskAccountTypeSchema = z
  .enum(["CASH", "MARGIN", "UNSUPPORTED", "UNAVAILABLE"])
  .nullable();
export type AccountRiskAccountType = z.infer<typeof AccountRiskAccountTypeSchema>;

export const AccountRiskAccountSelectionSchema = z
  .object({
    linkedAccountCount: z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER).nullable(),
    selectionState: AccountRiskSelectionStateSchema,
    accountType: AccountRiskAccountTypeSchema,
  })
  .strict();
export type AccountRiskAccountSelection = z.infer<
  typeof AccountRiskAccountSelectionSchema
>;

export const AccountRiskBalancesSchema = z
  .object({
    accountEquityDollars: z.number().finite().nullable(),
    availableCashDollars: z.number().finite().nullable(),
    currency: z.literal("USD"),
    equitySourceField: z
      .literal("securitiesAccount.currentBalances.equity")
      .nullable(),
    availableCashSourceField: z
      .literal("securitiesAccount.currentBalances.cashAvailableForTrading")
      .nullable(),
  })
  .strict();
export type AccountRiskBalances = z.infer<typeof AccountRiskBalancesSchema>;

export const AccountRiskSourceSchema = z
  .object({
    provider: z.literal("SCHWAB_TRADER_API"),
    accountDiscoveryFetchedAt: z.string().datetime().nullable(),
    accountBalancesFetchedAt: z.string().datetime().nullable(),
    timestampSource: z.literal("APPLICATION_RECEIPT_TIME"),
    retainedStaleDataUsed: z.literal(false),
    positionsRequested: z.literal(false),
    ordersRequested: z.literal(false),
    transactionsRequested: z.literal(false),
  })
  .strict();
export type AccountRiskSource = z.infer<typeof AccountRiskSourceSchema>;

export const AccountRiskDisclosuresSchema = z
  .object({
    readOnlyBrokerSnapshot: z.literal(true),
    brokerReportedValues: z.literal(true),
    accountIdentifiersRedacted: z.literal(true),
    availableCashIsNotBuyingPower: z.literal(true),
    marginCapacityExcluded: z.literal(true),
    snapshotMayBePartial: z.literal(true),
    noPositionRiskCalculation: z.literal(true),
    noDailyLossCalculation: z.literal(true),
    noPortfolioRiskCalculation: z.literal(true),
    noSizingCalculation: z.literal(true),
    noOrderExecution: z.literal(true),
    noPersistence: z.literal(true),
  })
  .strict();
export type AccountRiskDisclosures = z.infer<
  typeof AccountRiskDisclosuresSchema
>;

export const AccountRiskMethodologySchema = z
  .object({
    accountSelectionMethod: z.literal("EXACTLY_ONE_LINKED_ACCOUNT"),
    cashAccountAvailableCashMethod: z.literal(
      "securitiesAccount.currentBalances.cashAvailableForTrading",
    ),
    cashAccountEquityMethod: z.literal("UNAVAILABLE_IN_CURRENT_BALANCES"),
    marginAccountEquityMethod: z.literal(
      "securitiesAccount.currentBalances.equity",
    ),
    marginAccountAvailableCashMethod: z.literal(
      "UNVERIFIED_IN_ACCOUNT_RISK_SNAPSHOT_V1",
    ),
    currency: z.literal("USD"),
    retainedStaleFallback: z.literal(false),
  })
  .strict();
export type AccountRiskMethodology = z.infer<
  typeof AccountRiskMethodologySchema
>;

export const SchwabReadOnlyAccountRiskSnapshotResponseSchema = z
  .object({
    product: z.literal("SCHWAB_READ_ONLY_ACCOUNT_RISK_SNAPSHOT"),
    methodologyVersion: AccountRiskSnapshotMethodologyVersionSchema,
    calculatedAt: z.string().datetime(),
    engineState: AccountRiskSnapshotEngineStateSchema,
    snapshotState: AccountRiskSnapshotStateSchema,
    primaryReasonCode: AccountRiskSnapshotPrimaryReasonCodeSchema,
    warningCode: AccountRiskSnapshotWarningCodeSchema.nullable(),
    accountSelection: AccountRiskAccountSelectionSchema,
    balances: AccountRiskBalancesSchema,
    source: AccountRiskSourceSchema,
    disclosures: AccountRiskDisclosuresSchema,
    methodology: AccountRiskMethodologySchema,
  })
  .strict()
  .superRefine((value, ctx) => {
    const issue = (message: string): void => {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message });
    };
    const noBalances =
      value.balances.accountEquityDollars === null &&
      value.balances.availableCashDollars === null &&
      value.balances.equitySourceField === null &&
      value.balances.availableCashSourceField === null;

    if (value.snapshotState === "READY") {
      issue("ACCOUNT_RISK_SNAPSHOT_V1 must not produce READY");
    }
    if (value.snapshotState === "PARTIAL" && value.engineState !== "PARTIAL") {
      issue("PARTIAL snapshot requires PARTIAL engine state");
    }
    if (
      ["NO_ACCOUNT", "ACCOUNT_SELECTION_REQUIRED", "UNSUPPORTED_ACCOUNT"].includes(
        value.snapshotState,
      ) &&
      value.engineState !== "AVAILABLE"
    ) {
      issue("Deterministic non-balance states require AVAILABLE engine state");
    }
    if (
      ["UNAUTHORIZED", "UNAVAILABLE"].includes(value.snapshotState) &&
      value.engineState !== "UNAVAILABLE"
    ) {
      issue("Unavailable account states require UNAVAILABLE engine state");
    }

    switch (value.snapshotState) {
      case "PARTIAL": {
        if (
          value.accountSelection.linkedAccountCount !== 1 ||
          value.accountSelection.selectionState !== "SELECTED" ||
          !["CASH", "MARGIN"].includes(value.accountSelection.accountType ?? "") ||
          value.primaryReasonCode !== "ACCOUNT_RISK_SNAPSHOT_PARTIAL" ||
          value.source.accountDiscoveryFetchedAt === null ||
          value.source.accountBalancesFetchedAt === null
        ) {
          issue("PARTIAL snapshot requires exactly one selected supported account");
        }
        if (value.accountSelection.accountType === "CASH") {
          const cash = value.balances.availableCashDollars;
          if (
            cash === null ||
            value.balances.accountEquityDollars !== null ||
            value.balances.equitySourceField !== null ||
            value.balances.availableCashSourceField !==
              "securitiesAccount.currentBalances.cashAvailableForTrading"
          ) {
            issue("CASH PARTIAL snapshot has inconsistent approved balance fields");
          }
          const expectedWarning =
            cash !== null && cash < 0
              ? "NEGATIVE_BROKER_BALANCE_REPORTED"
              : "ACCOUNT_EQUITY_UNAVAILABLE";
          if (value.warningCode !== expectedWarning) {
            issue("CASH PARTIAL warning precedence is inconsistent");
          }
        }
        if (value.accountSelection.accountType === "MARGIN") {
          const equity = value.balances.accountEquityDollars;
          if (
            equity === null ||
            value.balances.availableCashDollars !== null ||
            value.balances.equitySourceField !==
              "securitiesAccount.currentBalances.equity" ||
            value.balances.availableCashSourceField !== null
          ) {
            issue("MARGIN PARTIAL snapshot has inconsistent approved balance fields");
          }
          const expectedWarning =
            equity !== null && equity < 0
              ? "NEGATIVE_BROKER_BALANCE_REPORTED"
              : "AVAILABLE_CASH_UNAVAILABLE";
          if (value.warningCode !== expectedWarning) {
            issue("MARGIN PARTIAL warning precedence is inconsistent");
          }
        }
        break;
      }
      case "NO_ACCOUNT":
        if (
          value.accountSelection.linkedAccountCount !== 0 ||
          value.accountSelection.selectionState !== "NO_ACCOUNT" ||
          value.accountSelection.accountType !== null ||
          value.primaryReasonCode !== "NO_LINKED_ACCOUNT" ||
          value.warningCode !== null ||
          !noBalances ||
          value.source.accountDiscoveryFetchedAt === null ||
          value.source.accountBalancesFetchedAt !== null
        ) {
          issue("NO_ACCOUNT snapshot is inconsistent");
        }
        break;
      case "ACCOUNT_SELECTION_REQUIRED":
        if (
          value.accountSelection.linkedAccountCount === null ||
          value.accountSelection.linkedAccountCount <= 1 ||
          value.accountSelection.selectionState !== "ACCOUNT_SELECTION_REQUIRED" ||
          value.accountSelection.accountType !== null ||
          value.primaryReasonCode !== "MULTIPLE_LINKED_ACCOUNTS_REQUIRE_SELECTION" ||
          value.warningCode !== null ||
          !noBalances ||
          value.source.accountDiscoveryFetchedAt === null ||
          value.source.accountBalancesFetchedAt !== null
        ) {
          issue("ACCOUNT_SELECTION_REQUIRED snapshot is inconsistent");
        }
        break;
      case "UNSUPPORTED_ACCOUNT":
        if (
          value.accountSelection.linkedAccountCount !== 1 ||
          value.accountSelection.selectionState !== "SELECTED" ||
          value.accountSelection.accountType !== "UNSUPPORTED" ||
          value.primaryReasonCode !== "SELECTED_ACCOUNT_TYPE_UNSUPPORTED" ||
          value.warningCode !== null ||
          !noBalances ||
          value.source.accountDiscoveryFetchedAt === null ||
          value.source.accountBalancesFetchedAt === null
        ) {
          issue("UNSUPPORTED_ACCOUNT snapshot is inconsistent");
        }
        break;
      case "UNAUTHORIZED":
        if (
          value.primaryReasonCode !== "SCHWAB_ACCOUNT_ACCESS_UNAUTHORIZED" ||
          value.warningCode !== null ||
          !noBalances ||
          value.accountSelection.accountType !== "UNAVAILABLE"
        ) {
          issue("UNAUTHORIZED snapshot is inconsistent");
        }
        break;
      case "UNAVAILABLE":
        if (!noBalances) {
          issue("UNAVAILABLE snapshot must not retain normalized balances");
        }
        if (
          value.accountSelection.selectionState === "SELECTED" &&
          value.accountSelection.linkedAccountCount !== 1
        ) {
          issue("Selected unavailable snapshot requires exactly one linked account");
        }
        if (
          value.accountSelection.selectionState === "UNAVAILABLE" &&
          value.accountSelection.linkedAccountCount !== null
        ) {
          issue("Unavailable selection requires unknown linked-account count");
        }
        if (
          value.accountSelection.accountType === "CASH" &&
          value.primaryReasonCode !== "AVAILABLE_CASH_FIELD_UNAVAILABLE"
        ) {
          issue("CASH field failure requires available-cash reason code");
        }
        if (
          value.accountSelection.accountType === "MARGIN" &&
          value.primaryReasonCode !== "ACCOUNT_EQUITY_FIELD_UNAVAILABLE"
        ) {
          issue("MARGIN field failure requires account-equity reason code");
        }
        break;
      case "READY":
        break;
    }
  });
export type SchwabReadOnlyAccountRiskSnapshotResponse = z.infer<
  typeof SchwabReadOnlyAccountRiskSnapshotResponseSchema
>;

export const AccountRiskSnapshotRequestErrorResponseSchema = z
  .object({
    error: z.literal("INVALID_ACCOUNT_RISK_SNAPSHOT_REQUEST"),
    issues: z
      .tuple([
        z
          .object({
            path: z.literal("query"),
            code: z.literal("QUERY_PARAMETERS_NOT_SUPPORTED"),
          })
          .strict(),
      ]),
  })
  .strict();
export type AccountRiskSnapshotRequestErrorResponse = z.infer<
  typeof AccountRiskSnapshotRequestErrorResponseSchema
>;

export const AccountRiskSnapshotOriginErrorResponseSchema = z
  .object({
    error: z.literal("ACCOUNT_RISK_SNAPSHOT_ORIGIN_FORBIDDEN"),
  })
  .strict();
export type AccountRiskSnapshotOriginErrorResponse = z.infer<
  typeof AccountRiskSnapshotOriginErrorResponseSchema
>;

/**
 * Deterministic SPY 0DTE sizing that sources available cash from the private,
 * read-only Schwab account snapshot while retaining explicit caller risk limits.
 */
export const SchwabAssistedPositionSizingMethodologyVersionSchema = z.literal(
  "SCHWAB_ASSISTED_SIZING_V1",
);
export type SchwabAssistedPositionSizingMethodologyVersion = z.infer<
  typeof SchwabAssistedPositionSizingMethodologyVersionSchema
>;

export const SchwabAssistedPositionSizingCallerRiskInputsSchema = z
  .object({
    accountEquityDollars: z.number().finite().positive(),
    remainingDailyLossBudgetDollars: z.number().finite().nonnegative(),
    remainingPortfolioRiskBudgetDollars: z.number().finite().nonnegative(),
  })
  .strict();
export type SchwabAssistedPositionSizingCallerRiskInputs = z.infer<
  typeof SchwabAssistedPositionSizingCallerRiskInputsSchema
>;

export const SpyZeroDteSchwabAssistedPositionSizingRequestSchema = z
  .object({
    callerRiskInputs: SchwabAssistedPositionSizingCallerRiskInputsSchema,
    riskPolicy: PositionSizingRiskPolicySchema,
  })
  .strict();
export type SpyZeroDteSchwabAssistedPositionSizingRequest = z.infer<
  typeof SpyZeroDteSchwabAssistedPositionSizingRequestSchema
>;

export const SchwabAssistedPositionSizingPrimaryReasonCodeSchema = z.union([
  PositionSizingPrimaryReasonCodeSchema,
  z.enum([
    "BROKER_NO_LINKED_ACCOUNT",
    "BROKER_ACCOUNT_SELECTION_REQUIRED",
    "BROKER_ACCOUNT_TYPE_UNSUPPORTED",
    "BROKER_ACCOUNT_ACCESS_UNAUTHORIZED",
    "BROKER_ACCOUNT_SNAPSHOT_UNAVAILABLE",
    "BROKER_AVAILABLE_CASH_UNAVAILABLE",
    "BROKER_AVAILABLE_CASH_NEGATIVE",
    "BROKER_ACCOUNT_SNAPSHOT_INVALID",
  ]),
]);
export type SchwabAssistedPositionSizingPrimaryReasonCode = z.infer<
  typeof SchwabAssistedPositionSizingPrimaryReasonCodeSchema
>;

export const SchwabAssistedPositionSizingWarningCodeSchema = z.union([
  PositionSizingWarningCodeSchema,
  z.enum([
    "BROKER_ACCOUNT_NOT_FOUND",
    "BROKER_ACCOUNT_SELECTION_REQUIRED",
    "BROKER_ACCOUNT_UNSUPPORTED",
    "BROKER_ACCOUNT_UNAUTHORIZED",
    "BROKER_ACCOUNT_UNAVAILABLE",
    "BROKER_AVAILABLE_CASH_UNAVAILABLE",
    "BROKER_AVAILABLE_CASH_NEGATIVE",
    "SCHWAB_ASSISTED_SIZING_VALIDATION_FAILED",
  ]),
]);
export type SchwabAssistedPositionSizingWarningCode = z.infer<
  typeof SchwabAssistedPositionSizingWarningCodeSchema
>;

export const SchwabAssistedPositionSizingBrokerSnapshotStateSchema = z.union([
  AccountRiskSnapshotStateSchema,
  z.literal("NOT_REQUESTED"),
]);
export type SchwabAssistedPositionSizingBrokerSnapshotState = z.infer<
  typeof SchwabAssistedPositionSizingBrokerSnapshotStateSchema
>;

export const SchwabAssistedPositionSizingBrokerSnapshotSchema = z
  .object({
    requested: z.boolean(),
    usedForSizing: z.boolean(),
    product: z.literal("SCHWAB_READ_ONLY_ACCOUNT_RISK_SNAPSHOT").nullable(),
    methodologyVersion: AccountRiskSnapshotMethodologyVersionSchema.nullable(),
    calculatedAt: z.string().datetime().nullable(),
    engineState: AccountRiskSnapshotEngineStateSchema.nullable(),
    snapshotState: SchwabAssistedPositionSizingBrokerSnapshotStateSchema,
    primaryReasonCode: AccountRiskSnapshotPrimaryReasonCodeSchema.nullable(),
    warningCode: AccountRiskSnapshotWarningCodeSchema.nullable(),
    linkedAccountCount: z
      .number()
      .int()
      .nonnegative()
      .max(Number.MAX_SAFE_INTEGER)
      .nullable(),
    accountType: AccountRiskAccountTypeSchema,
    availableCashSourceField: z
      .literal("securitiesAccount.currentBalances.cashAvailableForTrading")
      .nullable(),
    accountDiscoveryFetchedAt: z.string().datetime().nullable(),
    accountBalancesFetchedAt: z.string().datetime().nullable(),
  })
  .strict();
export type SchwabAssistedPositionSizingBrokerSnapshot = z.infer<
  typeof SchwabAssistedPositionSizingBrokerSnapshotSchema
>;

export const SchwabAssistedPositionSizingAccountContextSchema = z
  .object({
    accountEquityDollars: z.number().finite().positive(),
    availableCashDollars: z.number().finite().nonnegative().nullable(),
    remainingDailyLossBudgetDollars: z.number().finite().nonnegative(),
    remainingPortfolioRiskBudgetDollars: z.number().finite().nonnegative(),
    accountEquitySource: z.literal("CALLER_SUPPLIED"),
    availableCashSource: z.enum([
      "SCHWAB_CASH_AVAILABLE_FOR_TRADING",
      "NOT_REQUESTED",
      "UNAVAILABLE",
    ]),
    remainingDailyLossBudgetSource: z.literal("CALLER_SUPPLIED"),
    remainingPortfolioRiskBudgetSource: z.literal("CALLER_SUPPLIED"),
    brokerSnapshot: SchwabAssistedPositionSizingBrokerSnapshotSchema,
    disclosureCode: z.literal(
      "SCHWAB_AVAILABLE_CASH_WITH_CALLER_RISK_LIMITS",
    ),
  })
  .strict();
export type SchwabAssistedPositionSizingAccountContext = z.infer<
  typeof SchwabAssistedPositionSizingAccountContextSchema
>;

export const SchwabAssistedPositionSizingDisclosuresSchema = z
  .object({
    callerSuppliedAccountEquity: z.literal(true),
    callerSuppliedDailyLossBudget: z.literal(true),
    callerSuppliedPortfolioRiskBudget: z.literal(true),
    brokerAvailableCashMayBeUsed: z.literal(true),
    readOnlyBrokerAccess: z.literal(true),
    currentAskIsNotGuaranteed: z.literal(true),
    fullPremiumLossAssumption: z.literal(true),
    quantityIsReferenceOnly: z.literal(true),
    noOrderExecution: z.literal(true),
    positionsRequested: z.literal(false),
    ordersRequested: z.literal(false),
    transactionsRequested: z.literal(false),
    noPersistence: z.literal(true),
    noPremiumStop: z.literal(true),
    noPremiumTarget: z.literal(true),
  })
  .strict();
export type SchwabAssistedPositionSizingDisclosures = z.infer<
  typeof SchwabAssistedPositionSizingDisclosuresSchema
>;

export const SchwabAssistedPositionSizingMethodologySchema = z
  .object({
    sourceSizingMethodology: z.literal("SIZING_V1"),
    accountEquityMethod: z.literal("CALLER_SUPPLIED"),
    availableCashMethod: z.literal(
      "SCHWAB_CURRENT_BALANCES_CASH_AVAILABLE_FOR_TRADING",
    ),
    remainingDailyLossBudgetMethod: z.literal("CALLER_SUPPLIED"),
    remainingPortfolioRiskBudgetMethod: z.literal("CALLER_SUPPLIED"),
    assemblyFirstShortCircuit: z.literal(true),
    sizingPremiumReference: z.literal("CURRENT_ASK"),
    maximumLossMethod: z.literal("FULL_PREMIUM_DEBIT_REFERENCE"),
    effectiveRiskBudgetMethod: z.literal(
      "MINIMUM_OF_EXPLICIT_RISK_LIMITS",
    ),
    effectiveCapitalBudgetMethod: z.literal(
      "MINIMUM_OF_SCHWAB_AVAILABLE_CASH_AND_ALLOCATION_LIMIT",
    ),
    quantityMethod: z.literal("FLOOR_THEN_MINIMUM_OF_ALL_CONTROLS"),
    multiplierRequirement: z.literal(100),
    positionType: z.literal("LONG_SINGLE_LEG_OPTION_ONLY"),
    calculationCurrency: z.literal("USD"),
  })
  .strict();
export type SchwabAssistedPositionSizingMethodology = z.infer<
  typeof SchwabAssistedPositionSizingMethodologySchema
>;

export const SpyZeroDteSchwabAssistedPositionSizingResponseSchema = z
  .object({
    symbol: z.literal("SPY"),
    product: z.literal("SPY_ZERO_DTE_SCHWAB_ASSISTED_POSITION_SIZING"),
    methodologyVersion: SchwabAssistedPositionSizingMethodologyVersionSchema,
    currentMarketDate: MarketDateSchema,
    calculatedAt: z.string().datetime(),
    engineState: PositionSizingEngineStateSchema,
    sizingState: PositionSizingStateSchema,
    primaryReasonCode: SchwabAssistedPositionSizingPrimaryReasonCodeSchema,
    warningCode: SchwabAssistedPositionSizingWarningCodeSchema.nullable(),
    sourceAssembly: PositionSizingSourceAssemblySchema,
    selectedContract: PositionSizingSelectedContractSchema,
    accountContext: SchwabAssistedPositionSizingAccountContextSchema,
    riskPolicy: PositionSizingRiskPolicySchema,
    premiumRiskReference: PositionSizingPremiumRiskReferenceSchema,
    budgets: PositionSizingBudgetsSchema,
    quantityCalculation: PositionSizingQuantityCalculationSchema,
    positionReferences: PositionSizingPositionReferencesSchema,
    revalidation: PositionSizingRevalidationSchema,
    disclosures: SchwabAssistedPositionSizingDisclosuresSchema,
    methodology: SchwabAssistedPositionSizingMethodologySchema,
  })
  .strict()
  .superRefine((value, ctx) => {
    const issue = (message: string): void => {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message });
    };
    const broker = value.accountContext.brokerSnapshot;
    const hasSizingOutputs = ["SIZED", "NO_CAPACITY", "BLOCKED"].includes(
      value.sizingState,
    );

    if (!broker.requested) {
      if (
        broker.usedForSizing ||
        broker.product !== null ||
        broker.methodologyVersion !== null ||
        broker.calculatedAt !== null ||
        broker.engineState !== null ||
        broker.snapshotState !== "NOT_REQUESTED" ||
        broker.primaryReasonCode !== null ||
        broker.warningCode !== null ||
        broker.linkedAccountCount !== null ||
        broker.accountType !== null ||
        broker.availableCashSourceField !== null ||
        broker.accountDiscoveryFetchedAt !== null ||
        broker.accountBalancesFetchedAt !== null ||
        value.accountContext.availableCashDollars !== null ||
        value.accountContext.availableCashSource !== "NOT_REQUESTED"
      ) {
        issue("Unrequested broker snapshot must not retain broker data");
      }
    } else {
      if (
        broker.product !== "SCHWAB_READ_ONLY_ACCOUNT_RISK_SNAPSHOT" ||
        broker.methodologyVersion !== "ACCOUNT_RISK_SNAPSHOT_V1" ||
        broker.calculatedAt === null ||
        broker.engineState === null ||
        broker.snapshotState === "NOT_REQUESTED" ||
        broker.primaryReasonCode === null
      ) {
        issue("Requested broker snapshot requires complete sanitized provenance");
      }
    }

    if (broker.usedForSizing) {
      if (
        !broker.requested ||
        broker.snapshotState !== "PARTIAL" ||
        broker.accountType !== "CASH" ||
        broker.linkedAccountCount !== 1 ||
        broker.availableCashSourceField !==
          "securitiesAccount.currentBalances.cashAvailableForTrading" ||
        value.accountContext.availableCashDollars === null ||
        value.accountContext.availableCashSource !==
          "SCHWAB_CASH_AVAILABLE_FOR_TRADING"
      ) {
        issue("Broker cash used for sizing must be a valid CASH snapshot");
      }
    } else if (value.accountContext.availableCashDollars !== null) {
      issue("Unused broker cash must not be exposed as a sizing input");
    }

    if (hasSizingOutputs) {
      if (
        value.engineState !== "AVAILABLE" ||
        !broker.usedForSizing ||
        value.accountContext.availableCashDollars === null
      ) {
        issue("Calculated sizing states require usable broker available cash");
      }
    }

    if (value.sizingState === "NOT_APPLICABLE") {
      if (
        value.primaryReasonCode !== "SOURCE_ASSEMBLY_NOT_READY" ||
        broker.requested ||
        value.revalidation.required
      ) {
        issue("NOT_APPLICABLE must short-circuit before broker access");
      }
    }

    const brokerFailureReasons: SchwabAssistedPositionSizingPrimaryReasonCode[] = [
      "BROKER_NO_LINKED_ACCOUNT",
      "BROKER_ACCOUNT_SELECTION_REQUIRED",
      "BROKER_ACCOUNT_TYPE_UNSUPPORTED",
      "BROKER_ACCOUNT_ACCESS_UNAUTHORIZED",
      "BROKER_ACCOUNT_SNAPSHOT_UNAVAILABLE",
      "BROKER_AVAILABLE_CASH_UNAVAILABLE",
      "BROKER_AVAILABLE_CASH_NEGATIVE",
      "BROKER_ACCOUNT_SNAPSHOT_INVALID",
    ];
    if (brokerFailureReasons.includes(value.primaryReasonCode)) {
      if (
        value.engineState !== "UNAVAILABLE" ||
        value.sizingState !== "UNAVAILABLE" ||
        !broker.requested ||
        broker.usedForSizing ||
        value.accountContext.availableCashDollars !== null ||
        value.accountContext.availableCashSource !== "UNAVAILABLE" ||
        value.revalidation.required
      ) {
        issue("Broker failure must produce sanitized unavailable sizing");
      }
    }
  });
export type SpyZeroDteSchwabAssistedPositionSizingResponse = z.infer<
  typeof SpyZeroDteSchwabAssistedPositionSizingResponseSchema
>;

export const SchwabAssistedPositionSizingRequestIssueCodeSchema = z.union([
  PositionSizingRequestIssueCodeSchema,
  z.literal("QUERY_PARAMETERS_NOT_SUPPORTED"),
]);
export type SchwabAssistedPositionSizingRequestIssueCode = z.infer<
  typeof SchwabAssistedPositionSizingRequestIssueCodeSchema
>;

export const SchwabAssistedPositionSizingRequestErrorResponseSchema = z
  .object({
    error: z.literal("INVALID_SCHWAB_ASSISTED_POSITION_SIZING_REQUEST"),
    issues: z
      .array(
        z
          .object({
            path: z.string().min(1),
            code: SchwabAssistedPositionSizingRequestIssueCodeSchema,
          })
          .strict(),
      )
      .min(1),
  })
  .strict();
export type SchwabAssistedPositionSizingRequestErrorResponse = z.infer<
  typeof SchwabAssistedPositionSizingRequestErrorResponseSchema
>;

export const SchwabAssistedPositionSizingOriginErrorResponseSchema = z
  .object({
    error: z.literal("SCHWAB_ASSISTED_POSITION_SIZING_ORIGIN_FORBIDDEN"),
  })
  .strict();
export type SchwabAssistedPositionSizingOriginErrorResponse = z.infer<
  typeof SchwabAssistedPositionSizingOriginErrorResponseSchema
>;

/** Deterministic current-snapshot alert-candidate evaluation derived only from ASSEMBLY_V1. */
export const TradePlanAlertCandidateMethodologyVersionSchema = z.literal(
  "TRADE_PLAN_ALERT_CANDIDATE_V1",
);
export type TradePlanAlertCandidateMethodologyVersion = z.infer<
  typeof TradePlanAlertCandidateMethodologyVersionSchema
>;

export const TradePlanAlertCandidateStateSchema = z.enum([
  "CANDIDATE",
  "SUPPRESSED",
  "UNAVAILABLE",
]);
export type TradePlanAlertCandidateState = z.infer<
  typeof TradePlanAlertCandidateStateSchema
>;

export const TradePlanAlertCategorySchema = z.enum([
  "PLAN_READY",
  "WAITING_FOR_TRIGGER",
  "NO_QUALIFIED_CONTRACT",
  "SETUP_NOT_QUALIFIED",
]);
export type TradePlanAlertCategory = z.infer<typeof TradePlanAlertCategorySchema>;

export const TradePlanAlertSeveritySchema = z.enum([
  "OPPORTUNITY",
  "INFO",
  "WARNING",
]);
export type TradePlanAlertSeverity = z.infer<typeof TradePlanAlertSeveritySchema>;

export const TradePlanAlertCandidatePrimaryReasonCodeSchema = z.enum([
  "PLAN_READY_CANDIDATE",
  "WAITING_FOR_TRIGGER_CANDIDATE",
  "NO_QUALIFIED_CONTRACT_CANDIDATE",
  "NOT_QUALIFIED_CANDIDATE",
  "NO_SETUP_SUPPRESSED",
  "NOT_APPLICABLE_SUPPRESSED",
  "SOURCE_ASSEMBLY_UNAVAILABLE",
  "SOURCE_ASSEMBLY_INCONSISTENT",
]);
export type TradePlanAlertCandidatePrimaryReasonCode = z.infer<
  typeof TradePlanAlertCandidatePrimaryReasonCodeSchema
>;

export const TradePlanAlertCandidateSchema = z
  .object({
    deduplicationKey: z.string().min(1),
    category: TradePlanAlertCategorySchema,
    severity: TradePlanAlertSeveritySchema,
    title: z.string().min(1),
    message: z.string().min(1),
    direction: z.enum(["CALLS", "PUTS"]),
    currentPrice: z.number().finite().positive().nullable(),
    planningReferenceType: PlanningReferenceTypeSchema,
    planningReferencePrice: z.number().finite().positive().nullable(),
    triggerLevel: z.number().finite().positive().nullable(),
    triggerComparison: TradeTriggerComparisonSchema.nullable(),
    selectedContractSymbol: z.string().min(1).nullable(),
    selectedContractAsk: z.number().finite().positive().nullable(),
    selectedContractQuoteAt: z.string().datetime().nullable(),
    structuralInvalidationLevel: z.number().finite().positive().nullable(),
    primaryObjectiveLevel: z.number().finite().positive().nullable(),
    rewardRiskRatio: z.number().finite().nonnegative().nullable(),
  })
  .strict();
export type TradePlanAlertCandidate = z.infer<typeof TradePlanAlertCandidateSchema>;

export const TradePlanAlertSourceAssemblySummarySchema = z
  .object({
    product: z.literal("SPY_ZERO_DTE_DETERMINISTIC_TRADE_PLAN_ASSEMBLY"),
    methodologyVersion: TradePlanAssemblyMethodologyVersionSchema,
    currentMarketDate: MarketDateSchema,
    calculatedAt: z.string().datetime(),
    engineState: TradePlanAssemblyEngineStateSchema,
    planState: DeterministicTradePlanStateSchema,
    direction: AssembledTradePlanDirectionSchema,
    primaryReasonCode: TradePlanAssemblyPrimaryReasonCodeSchema,
    warningCode: TradePlanAssemblyWarningCodeSchema.nullable(),
  })
  .strict();
export type TradePlanAlertSourceAssemblySummary = z.infer<
  typeof TradePlanAlertSourceAssemblySummarySchema
>;

export const SpyZeroDteTradePlanAlertCandidateResponseSchema = z
  .object({
    symbol: z.literal("SPY"),
    product: z.literal("SPY_ZERO_DTE_DETERMINISTIC_TRADE_PLAN_ALERT_CANDIDATE"),
    methodologyVersion: TradePlanAlertCandidateMethodologyVersionSchema,
    currentMarketDate: MarketDateSchema,
    calculatedAt: z.string().datetime(),
    engineState: TradePlanAssemblyEngineStateSchema,
    alertState: TradePlanAlertCandidateStateSchema,
    primaryReasonCode: TradePlanAlertCandidatePrimaryReasonCodeSchema,
    warningCode: TradePlanAssemblyWarningCodeSchema.nullable(),
    sourceAssembly: TradePlanAlertSourceAssemblySummarySchema,
    candidate: TradePlanAlertCandidateSchema.nullable(),
    disclosures: z
      .object({
        currentSnapshotOnly: z.literal(true),
        candidateOnly: z.literal(true),
        noTransitionDetection: z.literal(true),
        noDeduplicationState: z.literal(true),
        noPersistence: z.literal(true),
        noNotificationDelivery: z.literal(true),
        noPrivateAccountData: z.literal(true),
        noOrderExecution: z.literal(true),
      })
      .strict(),
    methodology: z
      .object({
        sourceProduct: z.literal("SPY_ZERO_DTE_DETERMINISTIC_TRADE_PLAN_ASSEMBLY"),
        sourceMethodology: TradePlanAssemblyMethodologyVersionSchema,
        evaluationScope: z.literal("CURRENT_ASSEMBLY_SNAPSHOT"),
        candidateStates: z.tuple([
          z.literal("READY"),
          z.literal("WAITING_FOR_TRIGGER"),
          z.literal("NO_QUALIFIED_CONTRACT"),
          z.literal("NOT_QUALIFIED"),
        ]),
        suppressedStates: z.tuple([
          z.literal("NO_SETUP"),
          z.literal("NOT_APPLICABLE"),
        ]),
        unavailableState: z.literal("UNAVAILABLE"),
        transitionDetectionMethod: z.literal("NONE"),
        deliveryMethod: z.literal("NONE"),
        deduplicationMethod: z.literal("STABLE_CANDIDATE_KEY_ONLY"),
      })
      .strict(),
  })
  .strict()
  .superRefine((value, ctx) => {
    const issue = (message: string) =>
      ctx.addIssue({ code: z.ZodIssueCode.custom, message });

    if (value.currentMarketDate !== value.sourceAssembly.currentMarketDate) {
      issue("Alert candidate market date must match source Assembly");
    }
    if (value.warningCode !== value.sourceAssembly.warningCode) {
      issue("Alert candidate warning must mirror source Assembly warning");
    }

    if (value.alertState === "CANDIDATE") {
      if (value.engineState === "UNAVAILABLE" || value.candidate === null) {
        issue("CANDIDATE requires an available candidate payload");
        return;
      }

      const expectedByPlanState: Partial<
        Record<DeterministicTradePlanState, TradePlanAlertCategory>
      > = {
        READY: "PLAN_READY",
        WAITING_FOR_TRIGGER: "WAITING_FOR_TRIGGER",
        NO_QUALIFIED_CONTRACT: "NO_QUALIFIED_CONTRACT",
        NOT_QUALIFIED: "SETUP_NOT_QUALIFIED",
      };
      if (expectedByPlanState[value.sourceAssembly.planState] !== value.candidate.category) {
        issue("Alert candidate category is inconsistent with source Plan State");
      }
      if (value.candidate.direction !== value.sourceAssembly.direction) {
        issue("Alert candidate direction must match source Assembly");
      }

      if (value.candidate.category === "PLAN_READY") {
        if (
          value.candidate.selectedContractSymbol === null ||
          value.candidate.selectedContractAsk === null ||
          value.candidate.selectedContractQuoteAt === null ||
          value.candidate.structuralInvalidationLevel === null ||
          value.candidate.primaryObjectiveLevel === null ||
          value.candidate.rewardRiskRatio === null
        ) {
          issue("PLAN_READY candidate requires contract and structural risk references");
        }
      } else if (
        value.candidate.selectedContractSymbol !== null ||
        value.candidate.selectedContractAsk !== null ||
        value.candidate.selectedContractQuoteAt !== null
      ) {
        issue("Non-ready alert candidates cannot expose a selected contract");
      }
    } else if (value.candidate !== null) {
      issue("Non-candidate states cannot expose a candidate payload");
    }

    if (value.alertState === "SUPPRESSED") {
      if (
        value.engineState === "UNAVAILABLE" ||
        !["NO_SETUP", "NOT_APPLICABLE"].includes(value.sourceAssembly.planState)
      ) {
        issue("SUPPRESSED is reserved for non-meaningful valid Plan States");
      }
    }

    if (value.alertState === "UNAVAILABLE") {
      if (
        value.engineState !== "UNAVAILABLE" ||
        ![
          "SOURCE_ASSEMBLY_UNAVAILABLE",
          "SOURCE_ASSEMBLY_INCONSISTENT",
        ].includes(value.primaryReasonCode)
      ) {
        issue("UNAVAILABLE requires an unavailable engine and source failure reason");
      }
    }
  });
export type SpyZeroDteTradePlanAlertCandidateResponse = z.infer<
  typeof SpyZeroDteTradePlanAlertCandidateResponseSchema
>;

/** Process-local transition and duplicate-suppression evaluation for TRADE_PLAN_ALERT_CANDIDATE_V1. */
export const TradePlanAlertTransitionMethodologyVersionSchema = z.literal(
  "TRADE_PLAN_ALERT_TRANSITION_V1",
);
export type TradePlanAlertTransitionMethodologyVersion = z.infer<
  typeof TradePlanAlertTransitionMethodologyVersionSchema
>;

export const TradePlanAlertTransitionStateSchema = z.enum([
  "EMIT",
  "SUPPRESSED",
  "UNAVAILABLE",
]);
export type TradePlanAlertTransitionState = z.infer<
  typeof TradePlanAlertTransitionStateSchema
>;

export const TradePlanAlertTransitionTypeSchema = z.enum([
  "INITIAL_CANDIDATE",
  "CANDIDATE_CHANGED",
  "CANDIDATE_CLEARED",
  "CANDIDATE_REAPPEARED",
]);
export type TradePlanAlertTransitionType = z.infer<
  typeof TradePlanAlertTransitionTypeSchema
>;

export const TradePlanAlertTransitionPrimaryReasonCodeSchema = z.enum([
  "INITIAL_CANDIDATE_EMIT",
  "CANDIDATE_CHANGED_EMIT",
  "CANDIDATE_CLEARED_EMIT",
  "CANDIDATE_REAPPEARED_EMIT",
  "ACTIVE_DUPLICATE_SUPPRESSED",
  "REAPPEARANCE_COOLDOWN_SUPPRESSED",
  "NO_CANDIDATE_SUPPRESSED",
  "MARKET_DATE_RESET_SUPPRESSED",
  "SOURCE_CANDIDATE_UNAVAILABLE",
  "SOURCE_CANDIDATE_INCONSISTENT",
  "SOURCE_CANDIDATE_SERVICE_FAILURE",
]);
export type TradePlanAlertTransitionPrimaryReasonCode = z.infer<
  typeof TradePlanAlertTransitionPrimaryReasonCodeSchema
>;

export const TradePlanAlertTransitionCandidateSummarySchema = z
  .object({
    deduplicationKey: z.string().min(1),
    category: TradePlanAlertCategorySchema,
    severity: TradePlanAlertSeveritySchema,
    direction: z.enum(["CALLS", "PUTS"]),
  })
  .strict();
export type TradePlanAlertTransitionCandidateSummary = z.infer<
  typeof TradePlanAlertTransitionCandidateSummarySchema
>;

export const TradePlanAlertTransitionSourceSummarySchema = z
  .object({
    product: z.literal("SPY_ZERO_DTE_DETERMINISTIC_TRADE_PLAN_ALERT_CANDIDATE"),
    methodologyVersion: TradePlanAlertCandidateMethodologyVersionSchema,
    currentMarketDate: MarketDateSchema,
    calculatedAt: z.string().datetime(),
    engineState: TradePlanAssemblyEngineStateSchema,
    alertState: TradePlanAlertCandidateStateSchema,
    primaryReasonCode: TradePlanAlertCandidatePrimaryReasonCodeSchema,
    warningCode: TradePlanAssemblyWarningCodeSchema.nullable(),
    candidate: TradePlanAlertTransitionCandidateSummarySchema.nullable(),
  })
  .strict()
  .superRefine((value, ctx) => {
    const issue = (message: string) =>
      ctx.addIssue({ code: z.ZodIssueCode.custom, message });

    if (value.alertState === "CANDIDATE" && value.candidate === null) {
      issue("Candidate source summary requires candidate details");
    }
    if (value.alertState !== "CANDIDATE" && value.candidate !== null) {
      issue("Non-candidate source summary cannot expose candidate details");
    }
  });
export type TradePlanAlertTransitionSourceSummary = z.infer<
  typeof TradePlanAlertTransitionSourceSummarySchema
>;

export const TradePlanAlertTransitionEventSchema = z
  .object({
    transitionFingerprint: z.string().min(1),
    transitionType: TradePlanAlertTransitionTypeSchema,
    severity: TradePlanAlertSeveritySchema,
    title: z.string().min(1),
    message: z.string().min(1),
    previousCandidate: TradePlanAlertTransitionCandidateSummarySchema.nullable(),
    currentCandidate: TradePlanAlertTransitionCandidateSummarySchema.nullable(),
  })
  .strict()
  .superRefine((value, ctx) => {
    const issue = (message: string) =>
      ctx.addIssue({ code: z.ZodIssueCode.custom, message });

    if (value.transitionType === "INITIAL_CANDIDATE") {
      if (value.previousCandidate !== null || value.currentCandidate === null) {
        issue("INITIAL_CANDIDATE requires only a current candidate");
      }
    }
    if (value.transitionType === "CANDIDATE_CHANGED") {
      if (
        value.previousCandidate === null ||
        value.currentCandidate === null ||
        value.previousCandidate.deduplicationKey ===
          value.currentCandidate.deduplicationKey
      ) {
        issue("CANDIDATE_CHANGED requires two different candidates");
      }
    }
    if (value.transitionType === "CANDIDATE_CLEARED") {
      if (value.previousCandidate === null || value.currentCandidate !== null) {
        issue("CANDIDATE_CLEARED requires only a previous candidate");
      }
    }
    if (value.transitionType === "CANDIDATE_REAPPEARED") {
      if (
        value.previousCandidate === null ||
        value.currentCandidate === null ||
        value.previousCandidate.deduplicationKey !==
          value.currentCandidate.deduplicationKey
      ) {
        issue("CANDIDATE_REAPPEARED requires the same previous and current key");
      }
    }
  });
export type TradePlanAlertTransitionEvent = z.infer<
  typeof TradePlanAlertTransitionEventSchema
>;

export const SpyZeroDteTradePlanAlertTransitionResponseSchema = z
  .object({
    symbol: z.literal("SPY"),
    product: z.literal("SPY_ZERO_DTE_DETERMINISTIC_TRADE_PLAN_ALERT_TRANSITION"),
    methodologyVersion: TradePlanAlertTransitionMethodologyVersionSchema,
    currentMarketDate: MarketDateSchema,
    evaluatedAt: z.string().datetime(),
    engineState: TradePlanAssemblyEngineStateSchema,
    transitionState: TradePlanAlertTransitionStateSchema,
    primaryReasonCode: TradePlanAlertTransitionPrimaryReasonCodeSchema,
    warningCode: TradePlanAssemblyWarningCodeSchema.nullable(),
    sourceCandidate: TradePlanAlertTransitionSourceSummarySchema.nullable(),
    event: TradePlanAlertTransitionEventSchema.nullable(),
    cooldown: z
      .object({
        reappearanceCooldownMilliseconds: z.number().int().nonnegative(),
        remainingMilliseconds: z.number().int().nonnegative(),
      })
      .strict(),
    state: z
      .object({
        storageMethod: z.literal("PROCESS_MEMORY_ONLY"),
        marketDateBefore: MarketDateSchema.nullable(),
        marketDateAfter: MarketDateSchema.nullable(),
        activeCandidateKeyBefore: z.string().min(1).nullable(),
        activeCandidateKeyAfter: z.string().min(1).nullable(),
        lastClearedCandidateKeyAfter: z.string().min(1).nullable(),
        marketDateReset: z.boolean(),
        mutationApplied: z.boolean(),
      })
      .strict(),
    disclosures: z
      .object({
        processMemoryOnly: z.literal(true),
        resetsOnProcessRestart: z.literal(true),
        noDatabasePersistence: z.literal(true),
        noAutomaticScheduler: z.literal(true),
        noNotificationDelivery: z.literal(true),
        noPrivateAccountData: z.literal(true),
        noOrderExecution: z.literal(true),
      })
      .strict(),
    methodology: z
      .object({
        sourceProduct: z.literal(
          "SPY_ZERO_DTE_DETERMINISTIC_TRADE_PLAN_ALERT_CANDIDATE",
        ),
        sourceMethodology: TradePlanAlertCandidateMethodologyVersionSchema,
        evaluationScope: z.literal("CURRENT_CANDIDATE_VS_PROCESS_MEMORY"),
        duplicateSuppressionMethod: z.literal("ACTIVE_CANDIDATE_KEY_EQUALITY"),
        reappearanceMethod: z.literal("SAME_KEY_AFTER_CLEAR_AND_COOLDOWN"),
        candidateChangeMethod: z.literal("DEDUPLICATION_KEY_CHANGE"),
        marketDateBoundaryMethod: z.literal("RESET_WITHOUT_CARRYOVER"),
        reappearanceCooldownMilliseconds: z.number().int().nonnegative(),
        persistenceMethod: z.literal("NONE"),
        schedulerMethod: z.literal("NONE"),
        deliveryMethod: z.literal("NONE"),
      })
      .strict(),
  })
  .strict()
  .superRefine((value, ctx) => {
    const issue = (message: string) =>
      ctx.addIssue({ code: z.ZodIssueCode.custom, message });

    if (
      value.cooldown.reappearanceCooldownMilliseconds !==
      value.methodology.reappearanceCooldownMilliseconds
    ) {
      issue("Cooldown value must match methodology");
    }
    if (
      value.sourceCandidate !== null &&
      value.currentMarketDate !== value.sourceCandidate.currentMarketDate
    ) {
      issue("Transition market date must match source candidate market date");
    }

    const emitReasons = [
      "INITIAL_CANDIDATE_EMIT",
      "CANDIDATE_CHANGED_EMIT",
      "CANDIDATE_CLEARED_EMIT",
      "CANDIDATE_REAPPEARED_EMIT",
    ];
    const suppressedReasons = [
      "ACTIVE_DUPLICATE_SUPPRESSED",
      "REAPPEARANCE_COOLDOWN_SUPPRESSED",
      "NO_CANDIDATE_SUPPRESSED",
      "MARKET_DATE_RESET_SUPPRESSED",
    ];
    const unavailableReasons = [
      "SOURCE_CANDIDATE_UNAVAILABLE",
      "SOURCE_CANDIDATE_INCONSISTENT",
      "SOURCE_CANDIDATE_SERVICE_FAILURE",
    ];

    if (value.transitionState === "EMIT") {
      if (
        value.engineState === "UNAVAILABLE" ||
        value.event === null ||
        !emitReasons.includes(value.primaryReasonCode) ||
        value.cooldown.remainingMilliseconds !== 0
      ) {
        issue("EMIT requires an available event and emit reason");
      }
    }
    if (value.transitionState === "SUPPRESSED") {
      if (
        value.engineState === "UNAVAILABLE" ||
        value.event !== null ||
        !suppressedReasons.includes(value.primaryReasonCode)
      ) {
        issue("SUPPRESSED requires no event and a suppression reason");
      }
    }
    if (value.transitionState === "UNAVAILABLE") {
      if (
        value.engineState !== "UNAVAILABLE" ||
        value.event !== null ||
        !unavailableReasons.includes(value.primaryReasonCode) ||
        value.state.mutationApplied
      ) {
        issue("UNAVAILABLE requires no event, no mutation, and a source failure reason");
      }
    }

    if (
      value.primaryReasonCode === "REAPPEARANCE_COOLDOWN_SUPPRESSED" &&
      value.cooldown.remainingMilliseconds <= 0
    ) {
      issue("Cooldown suppression requires positive remaining time");
    }
    if (
      value.primaryReasonCode !== "REAPPEARANCE_COOLDOWN_SUPPRESSED" &&
      value.cooldown.remainingMilliseconds !== 0
    ) {
      issue("Only cooldown suppression may expose remaining time");
    }
  });
export type SpyZeroDteTradePlanAlertTransitionResponse = z.infer<
  typeof SpyZeroDteTradePlanAlertTransitionResponseSchema
>;

/** Optional backend-only Discord webhook connection and explicit test delivery. */
export const DiscordWebhookConnectionStateSchema = z.enum([
  "NOT_CONFIGURED",
  "CONFIG_INVALID",
  "READY",
]);
export type DiscordWebhookConnectionState = z.infer<
  typeof DiscordWebhookConnectionStateSchema
>;

export const DiscordWebhookStatusPrimaryReasonCodeSchema = z.enum([
  "WEBHOOK_URL_MISSING",
  "WEBHOOK_URL_INVALID",
  "WEBHOOK_READY",
]);
export type DiscordWebhookStatusPrimaryReasonCode = z.infer<
  typeof DiscordWebhookStatusPrimaryReasonCodeSchema
>;

const DiscordWebhookSafetyDisclosuresSchema = z
  .object({
    webhookUrlReturned: z.literal(false),
    webhookTokenReturned: z.literal(false),
    noAutomaticDelivery: z.literal(true),
    noPersistence: z.literal(true),
    noPrivateAccountData: z.literal(true),
    noOrderExecution: z.literal(true),
  })
  .strict();

export const DiscordWebhookStatusResponseSchema = z
  .object({
    product: z.literal("DISCORD_WEBHOOK_CONNECTION_STATUS"),
    methodologyVersion: z.literal("DISCORD_WEBHOOK_CONNECTION_V1"),
    state: DiscordWebhookConnectionStateSchema,
    primaryReasonCode: DiscordWebhookStatusPrimaryReasonCodeSchema,
    configured: z.boolean(),
    canSendTest: z.boolean(),
    detail: z.string().min(1).nullable(),
    disclosures: DiscordWebhookSafetyDisclosuresSchema,
  })
  .strict()
  .superRefine((value, ctx) => {
    const issue = (message: string) =>
      ctx.addIssue({ code: z.ZodIssueCode.custom, message });

    if (value.state === "READY") {
      if (
        value.primaryReasonCode !== "WEBHOOK_READY" ||
        !value.configured ||
        !value.canSendTest
      ) {
        issue("READY requires configured test-capable webhook state");
      }
    } else if (value.configured || value.canSendTest) {
      issue("Non-ready Discord state cannot be configured or test-capable");
    }
  });
export type DiscordWebhookStatusResponse = z.infer<
  typeof DiscordWebhookStatusResponseSchema
>;

export const DiscordWebhookTestRequestSchema = z.object({}).strict();
export type DiscordWebhookTestRequest = z.infer<
  typeof DiscordWebhookTestRequestSchema
>;

export const DiscordWebhookTestDeliveryStateSchema = z.enum([
  "DELIVERED",
  "NOT_DELIVERED",
]);
export type DiscordWebhookTestDeliveryState = z.infer<
  typeof DiscordWebhookTestDeliveryStateSchema
>;

export const DiscordWebhookTestDeliveryPrimaryReasonCodeSchema = z.enum([
  "TEST_MESSAGE_DELIVERED",
  "WEBHOOK_NOT_CONFIGURED",
  "WEBHOOK_CONFIG_INVALID",
  "WEBHOOK_REQUEST_TIMEOUT",
  "WEBHOOK_NETWORK_FAILURE",
  "WEBHOOK_RATE_LIMITED",
  "WEBHOOK_REJECTED",
  "WEBHOOK_PROVIDER_FAILURE",
]);
export type DiscordWebhookTestDeliveryPrimaryReasonCode = z.infer<
  typeof DiscordWebhookTestDeliveryPrimaryReasonCodeSchema
>;

export const DiscordWebhookTestDeliveryResponseSchema = z
  .object({
    product: z.literal("DISCORD_WEBHOOK_TEST_DELIVERY"),
    methodologyVersion: z.literal("DISCORD_WEBHOOK_TEST_V1"),
    deliveryState: DiscordWebhookTestDeliveryStateSchema,
    primaryReasonCode: DiscordWebhookTestDeliveryPrimaryReasonCodeSchema,
    attemptedAt: z.string().datetime(),
    deliveredAt: z.string().datetime().nullable(),
    providerStatusCode: z.number().int().min(100).max(599).nullable(),
    disclosures: DiscordWebhookSafetyDisclosuresSchema,
  })
  .strict()
  .superRefine((value, ctx) => {
    const issue = (message: string) =>
      ctx.addIssue({ code: z.ZodIssueCode.custom, message });

    if (value.deliveryState === "DELIVERED") {
      if (
        value.primaryReasonCode !== "TEST_MESSAGE_DELIVERED" ||
        value.deliveredAt === null ||
        value.providerStatusCode === null ||
        value.providerStatusCode < 200 ||
        value.providerStatusCode >= 300
      ) {
        issue("DELIVERED requires successful provider confirmation");
      }
    } else if (
      value.primaryReasonCode === "TEST_MESSAGE_DELIVERED" ||
      value.deliveredAt !== null
    ) {
      issue("NOT_DELIVERED cannot expose successful delivery fields");
    }
  });
export type DiscordWebhookTestDeliveryResponse = z.infer<
  typeof DiscordWebhookTestDeliveryResponseSchema
>;

/** Explicit, backend-only Discord delivery for one deterministic Trade Plan alert transition. */
export const DiscordTradePlanAlertDeliveryRequestSchema = z.object({}).strict();
export type DiscordTradePlanAlertDeliveryRequest = z.infer<
  typeof DiscordTradePlanAlertDeliveryRequestSchema
>;

export const DiscordTradePlanAlertDeliveryStateSchema = z.enum([
  "DELIVERED",
  "NOT_DELIVERED",
]);
export type DiscordTradePlanAlertDeliveryState = z.infer<
  typeof DiscordTradePlanAlertDeliveryStateSchema
>;

export const DiscordTradePlanAlertDeliveryPrimaryReasonCodeSchema = z.enum([
  "ALERT_DELIVERED",
  "WEBHOOK_NOT_CONFIGURED",
  "WEBHOOK_CONFIG_INVALID",
  "NO_EMITTED_TRANSITION",
  "TRANSITION_UNAVAILABLE",
  "WEBHOOK_REQUEST_TIMEOUT",
  "WEBHOOK_NETWORK_FAILURE",
  "WEBHOOK_RATE_LIMITED",
  "WEBHOOK_REJECTED",
  "WEBHOOK_PROVIDER_FAILURE",
]);
export type DiscordTradePlanAlertDeliveryPrimaryReasonCode = z.infer<
  typeof DiscordTradePlanAlertDeliveryPrimaryReasonCodeSchema
>;

export const DiscordTradePlanAlertTransitionSummarySchema = z
  .object({
    product: z.literal("SPY_ZERO_DTE_DETERMINISTIC_TRADE_PLAN_ALERT_TRANSITION"),
    methodologyVersion: TradePlanAlertTransitionMethodologyVersionSchema,
    currentMarketDate: MarketDateSchema,
    evaluatedAt: z.string().datetime(),
    engineState: TradePlanAssemblyEngineStateSchema,
    transitionState: TradePlanAlertTransitionStateSchema,
    primaryReasonCode: TradePlanAlertTransitionPrimaryReasonCodeSchema,
    warningCode: TradePlanAssemblyWarningCodeSchema.nullable(),
    event: TradePlanAlertTransitionEventSchema.nullable(),
  })
  .strict()
  .superRefine((value, ctx) => {
    const issue = (message: string) =>
      ctx.addIssue({ code: z.ZodIssueCode.custom, message });

    if (value.transitionState === "EMIT" && value.event === null) {
      issue("EMIT transition summary requires an event");
    }
    if (value.transitionState !== "EMIT" && value.event !== null) {
      issue("Only an EMIT transition summary may expose an event");
    }
  });
export type DiscordTradePlanAlertTransitionSummary = z.infer<
  typeof DiscordTradePlanAlertTransitionSummarySchema
>;

export const DiscordTradePlanAlertDeliveryResponseSchema = z
  .object({
    product: z.literal("DISCORD_TRADE_PLAN_ALERT_DELIVERY"),
    methodologyVersion: z.literal("DISCORD_TRADE_PLAN_ALERT_DELIVERY_V1"),
    deliveryState: DiscordTradePlanAlertDeliveryStateSchema,
    primaryReasonCode: DiscordTradePlanAlertDeliveryPrimaryReasonCodeSchema,
    attemptedAt: z.string().datetime(),
    deliveredAt: z.string().datetime().nullable(),
    providerStatusCode: z.number().int().min(100).max(599).nullable(),
    providerRequestAttempted: z.boolean(),
    transition: DiscordTradePlanAlertTransitionSummarySchema.nullable(),
    state: z
      .object({
        storageMethod: z.literal("PROCESS_MEMORY_ONLY"),
        transitionStateCommitted: z.boolean(),
        retryEligible: z.boolean(),
      })
      .strict(),
    disclosures: z
      .object({
        webhookUrlReturned: z.literal(false),
        webhookTokenReturned: z.literal(false),
        providerBodyReturned: z.literal(false),
        explicitDeliveryOnly: z.literal(true),
        noAutomaticDelivery: z.literal(true),
        noDatabasePersistence: z.literal(true),
        noPrivateAccountData: z.literal(true),
        noOrderExecution: z.literal(true),
        mentionsDisabled: z.literal(true),
      })
      .strict(),
    methodology: z
      .object({
        sourceProduct: z.literal(
          "SPY_ZERO_DTE_DETERMINISTIC_TRADE_PLAN_ALERT_CANDIDATE",
        ),
        sourceMethodology: TradePlanAlertCandidateMethodologyVersionSchema,
        transitionMethodology: TradePlanAlertTransitionMethodologyVersionSchema,
        deliveryTrigger: z.literal("EXPLICIT_POST_ONLY"),
        deliveryStateIsolation: z.literal("DEDICATED_PROCESS_MEMORY"),
        successfulDeliveryCommit: z.literal(
          "COMMIT_TRANSITION_STATE_AFTER_PROVIDER_CONFIRMATION",
        ),
        failedDeliveryCommit: z.literal("DO_NOT_COMMIT_EMITTED_TRANSITION"),
        duplicateSuppressionMethod: z.literal("TRADE_PLAN_ALERT_TRANSITION_V1"),
        providerConfirmationMethod: z.literal("DISCORD_WAIT_TRUE_HTTP_SUCCESS"),
        retryMethod: z.literal("EXPLICIT_USER_RETRY_ONLY"),
      })
      .strict(),
  })
  .strict()
  .superRefine((value, ctx) => {
    const issue = (message: string) =>
      ctx.addIssue({ code: z.ZodIssueCode.custom, message });

    if (value.deliveryState === "DELIVERED") {
      if (
        value.primaryReasonCode !== "ALERT_DELIVERED" ||
        value.deliveredAt === null ||
        value.providerStatusCode === null ||
        value.providerStatusCode < 200 ||
        value.providerStatusCode >= 300 ||
        !value.providerRequestAttempted ||
        value.transition?.transitionState !== "EMIT" ||
        value.transition.event === null ||
        !value.state.transitionStateCommitted ||
        value.state.retryEligible
      ) {
        issue("DELIVERED requires confirmed provider delivery and committed transition state");
      }
      return;
    }

    if (value.primaryReasonCode === "ALERT_DELIVERED" || value.deliveredAt !== null) {
      issue("NOT_DELIVERED cannot expose successful delivery fields");
    }

    const providerFailureReasons = [
      "WEBHOOK_REQUEST_TIMEOUT",
      "WEBHOOK_NETWORK_FAILURE",
      "WEBHOOK_RATE_LIMITED",
      "WEBHOOK_REJECTED",
      "WEBHOOK_PROVIDER_FAILURE",
    ];

    if (providerFailureReasons.includes(value.primaryReasonCode)) {
      if (
        !value.providerRequestAttempted ||
        value.transition?.transitionState !== "EMIT" ||
        value.transition.event === null ||
        value.state.transitionStateCommitted ||
        !value.state.retryEligible
      ) {
        issue("Provider failures require an uncommitted retryable emitted transition");
      }
    }

    if (
      ["WEBHOOK_NOT_CONFIGURED", "WEBHOOK_CONFIG_INVALID"].includes(
        value.primaryReasonCode,
      ) &&
      (value.providerRequestAttempted ||
        value.transition !== null ||
        value.state.transitionStateCommitted)
    ) {
      issue("Webhook configuration failures must short-circuit before transition evaluation");
    }

    if (value.primaryReasonCode === "NO_EMITTED_TRANSITION") {
      if (
        value.providerRequestAttempted ||
        value.transition?.transitionState !== "SUPPRESSED" ||
        value.transition.event !== null ||
        value.state.retryEligible
      ) {
        issue("NO_EMITTED_TRANSITION requires a suppressed transition and no provider request");
      }
    }

    if (value.primaryReasonCode === "TRANSITION_UNAVAILABLE") {
      if (
        value.providerRequestAttempted ||
        value.transition?.transitionState !== "UNAVAILABLE" ||
        value.transition.event !== null ||
        value.state.transitionStateCommitted ||
        !value.state.retryEligible
      ) {
        issue("TRANSITION_UNAVAILABLE requires a retryable unavailable transition");
      }
    }
  });
export type DiscordTradePlanAlertDeliveryResponse = z.infer<
  typeof DiscordTradePlanAlertDeliveryResponseSchema
>;

/** Opt-in, foreground-browser automatic evaluation of Discord Trade Plan alert delivery. */
export const DiscordAutomaticTradePlanAlertCadenceMillisecondsSchema = z.union([
  z.literal(15_000),
  z.literal(30_000),
  z.literal(60_000),
]);
export type DiscordAutomaticTradePlanAlertCadenceMilliseconds = z.infer<
  typeof DiscordAutomaticTradePlanAlertCadenceMillisecondsSchema
>;

export const DiscordAutomaticTradePlanAlertDeliveryRequestSchema = z
  .object({
    clientMode: z.literal("FOREGROUND_BROWSER_SESSION"),
    cadenceMilliseconds:
      DiscordAutomaticTradePlanAlertCadenceMillisecondsSchema,
  })
  .strict();
export type DiscordAutomaticTradePlanAlertDeliveryRequest = z.infer<
  typeof DiscordAutomaticTradePlanAlertDeliveryRequestSchema
>;

export const DiscordAutomaticTradePlanAlertDeliveryStateSchema = z.enum([
  "DELIVERED",
  "NO_DELIVERY",
  "FAILED",
]);
export type DiscordAutomaticTradePlanAlertDeliveryState = z.infer<
  typeof DiscordAutomaticTradePlanAlertDeliveryStateSchema
>;

export const DiscordAutomaticTradePlanAlertAttemptSummarySchema = z
  .object({
    attemptNumber: z.number().int().min(1).max(2),
    deliveryState: DiscordTradePlanAlertDeliveryStateSchema,
    primaryReasonCode: DiscordTradePlanAlertDeliveryPrimaryReasonCodeSchema,
    attemptedAt: z.string().datetime(),
    deliveredAt: z.string().datetime().nullable(),
    providerStatusCode: z.number().int().min(100).max(599).nullable(),
    providerRequestAttempted: z.boolean(),
    transitionState: TradePlanAlertTransitionStateSchema.nullable(),
    transitionReasonCode:
      TradePlanAlertTransitionPrimaryReasonCodeSchema.nullable(),
    transitionStateCommitted: z.boolean(),
    retryEligible: z.boolean(),
    automaticRetryEligible: z.boolean(),
  })
  .strict()
  .superRefine((value, ctx) => {
    const issue = (message: string) =>
      ctx.addIssue({ code: z.ZodIssueCode.custom, message });

    if (value.deliveryState === "DELIVERED") {
      if (
        value.primaryReasonCode !== "ALERT_DELIVERED" ||
        value.deliveredAt === null ||
        !value.providerRequestAttempted ||
        value.providerStatusCode === null ||
        value.providerStatusCode < 200 ||
        value.providerStatusCode >= 300 ||
        value.transitionState !== "EMIT" ||
        !value.transitionStateCommitted ||
        value.retryEligible
      ) {
        issue("Delivered automatic attempt requires confirmed committed delivery");
      }
    } else if (
      value.primaryReasonCode === "ALERT_DELIVERED" ||
      value.deliveredAt !== null
    ) {
      issue("Non-delivered automatic attempt cannot expose delivery success");
    }

    const automaticRetryReasons = [
      "TRANSITION_UNAVAILABLE",
      "WEBHOOK_RATE_LIMITED",
      "WEBHOOK_PROVIDER_FAILURE",
    ];
    if (
      value.automaticRetryEligible !==
      automaticRetryReasons.includes(value.primaryReasonCode)
    ) {
      issue("automaticRetryEligible must follow the fixed retry allowlist");
    }
    if (value.automaticRetryEligible && !value.retryEligible) {
      issue("Automatic retry eligibility requires source retry eligibility");
    }
  });
export type DiscordAutomaticTradePlanAlertAttemptSummary = z.infer<
  typeof DiscordAutomaticTradePlanAlertAttemptSummarySchema
>;

export const DiscordAutomaticTradePlanAlertDeliveryResponseSchema = z
  .object({
    product: z.literal("DISCORD_AUTOMATIC_TRADE_PLAN_ALERT_DELIVERY"),
    methodologyVersion: z.literal(
      "DISCORD_AUTOMATIC_TRADE_PLAN_ALERT_DELIVERY_V1",
    ),
    automaticDeliveryState:
      DiscordAutomaticTradePlanAlertDeliveryStateSchema,
    primaryReasonCode: DiscordTradePlanAlertDeliveryPrimaryReasonCodeSchema,
    evaluatedAt: z.string().datetime(),
    clientMode: z.literal("FOREGROUND_BROWSER_SESSION"),
    cadenceMilliseconds:
      DiscordAutomaticTradePlanAlertCadenceMillisecondsSchema,
    attemptCount: z.number().int().min(1).max(2),
    maximumAttempts: z.literal(2),
    retryDelayMilliseconds: z.literal(3_000),
    attempts: z
      .array(DiscordAutomaticTradePlanAlertAttemptSummarySchema)
      .min(1)
      .max(2),
    finalAttempt: DiscordAutomaticTradePlanAlertAttemptSummarySchema,
    disclosures: z
      .object({
        userOptInRequired: z.literal(true),
        foregroundBrowserSessionOnly: z.literal(true),
        noBackgroundScheduler: z.literal(true),
        processMemoryDeduplication: z.literal(true),
        sharedWithExplicitDeliveryState: z.literal(true),
        ambiguousProviderOutcomeNotAutomaticallyRetried: z.literal(true),
        noDatabasePersistence: z.literal(true),
        webhookUrlReturned: z.literal(false),
        webhookTokenReturned: z.literal(false),
        providerBodyReturned: z.literal(false),
        noPrivateAccountData: z.literal(true),
        noOrderExecution: z.literal(true),
        mentionsDisabled: z.literal(true),
      })
      .strict(),
    methodology: z
      .object({
        sourceDeliveryProduct: z.literal(
          "DISCORD_TRADE_PLAN_ALERT_DELIVERY",
        ),
        sourceDeliveryMethodology: z.literal(
          "DISCORD_TRADE_PLAN_ALERT_DELIVERY_V1",
        ),
        deliveryTrigger: z.literal("OPT_IN_FOREGROUND_BROWSER_POLL"),
        cadenceSource: z.literal("CALLER_SELECTED_ALLOWED_VALUE"),
        retryMethod: z.literal(
          "MAX_TWO_ATTEMPTS_FIXED_BACKOFF_FOR_RETRY_ELIGIBLE_RESULTS",
        ),
        retryableResultMethod: z.literal(
          "UNAMBIGUOUS_AUTOMATIC_RETRY_ALLOWLIST",
        ),
        duplicateSuppressionMethod: z.literal(
          "SHARED_DISCORD_PROCESS_MEMORY_STATE",
        ),
        transitionCooldownMethod: z.literal(
          "TRADE_PLAN_ALERT_TRANSITION_V1_REAPPEARANCE_COOLDOWN",
        ),
        persistenceMethod: z.literal("NONE"),
        schedulerMethod: z.literal("FOREGROUND_BROWSER_TIMER_ONLY"),
      })
      .strict(),
  })
  .strict()
  .superRefine((value, ctx) => {
    const issue = (message: string) =>
      ctx.addIssue({ code: z.ZodIssueCode.custom, message });

    if (value.attemptCount !== value.attempts.length) {
      issue("attemptCount must equal the attempts array length");
    }

    const final = value.attempts.at(-1);
    if (
      final === undefined ||
      final.attemptNumber !== value.finalAttempt.attemptNumber ||
      final.primaryReasonCode !== value.finalAttempt.primaryReasonCode ||
      final.attemptedAt !== value.finalAttempt.attemptedAt
    ) {
      issue("finalAttempt must match the final attempts entry");
    }

    value.attempts.forEach((attempt, index) => {
      if (attempt.attemptNumber !== index + 1) {
        issue("Automatic attempt numbers must be sequential");
      }
    });

    if (
      value.attemptCount === 2 &&
      !value.attempts[0]?.automaticRetryEligible
    ) {
      issue(
        "A second automatic attempt requires an automatically retry-eligible first attempt",
      );
    }

    const noDeliveryReasons = [
      "NO_EMITTED_TRANSITION",
      "WEBHOOK_NOT_CONFIGURED",
    ];

    if (value.automaticDeliveryState === "DELIVERED") {
      if (
        value.primaryReasonCode !== "ALERT_DELIVERED" ||
        value.finalAttempt.deliveryState !== "DELIVERED"
      ) {
        issue("DELIVERED automatic response requires a delivered final attempt");
      }
    } else if (value.automaticDeliveryState === "FAILED") {
      if (
        value.finalAttempt.deliveryState === "DELIVERED" ||
        noDeliveryReasons.includes(value.finalAttempt.primaryReasonCode)
      ) {
        issue("FAILED automatic response requires an operational failure");
      }
      if (
        value.finalAttempt.automaticRetryEligible &&
        value.attemptCount !== value.maximumAttempts
      ) {
        issue("Automatically retryable failures must exhaust the bounded policy");
      }
    } else if (
      value.finalAttempt.deliveryState === "DELIVERED" ||
      !noDeliveryReasons.includes(value.finalAttempt.primaryReasonCode) ||
      value.finalAttempt.automaticRetryEligible
    ) {
      issue("NO_DELIVERY requires a non-actionable final result");
    }

    if (value.primaryReasonCode !== value.finalAttempt.primaryReasonCode) {
      issue("Automatic primary reason must match the final attempt");
    }
  });
export type DiscordAutomaticTradePlanAlertDeliveryResponse = z.infer<
  typeof DiscordAutomaticTradePlanAlertDeliveryResponseSchema
>;


/** Deterministic current-snapshot report foundation for scheduled SPY market updates. */
export const DeterministicScheduledReportTypeSchema = z.enum([
  "PREMARKET_0925",
  "OPENING_0935",
  "OPENING_0945",
  "UPDATE_1000",
]);
export type DeterministicScheduledReportType = z.infer<
  typeof DeterministicScheduledReportTypeSchema
>;

export const DeterministicScheduledReportRequestSchema = z
  .object({
    reportType: DeterministicScheduledReportTypeSchema,
  })
  .strict();
export type DeterministicScheduledReportRequest = z.infer<
  typeof DeterministicScheduledReportRequestSchema
>;

export const DeterministicScheduledReportMethodologyVersionSchema = z.literal(
  "SCHEDULED_REPORT_V1",
);
export type DeterministicScheduledReportMethodologyVersion = z.infer<
  typeof DeterministicScheduledReportMethodologyVersionSchema
>;

export const DeterministicScheduledReportStateSchema = z.enum([
  "READY",
  "INFORMATIONAL",
  "UNAVAILABLE",
]);
export type DeterministicScheduledReportState = z.infer<
  typeof DeterministicScheduledReportStateSchema
>;

export const DeterministicScheduledReportPrimaryReasonCodeSchema = z.enum([
  "READY_PLAN_SUMMARY",
  "WAITING_FOR_TRIGGER_SUMMARY",
  "NO_QUALIFIED_CONTRACT_SUMMARY",
  "NOT_QUALIFIED_SUMMARY",
  "NO_SETUP_SUMMARY",
  "NOT_APPLICABLE_SUMMARY",
  "SOURCE_ASSEMBLY_UNAVAILABLE",
  "SOURCE_ASSEMBLY_INCONSISTENT",
]);
export type DeterministicScheduledReportPrimaryReasonCode = z.infer<
  typeof DeterministicScheduledReportPrimaryReasonCodeSchema
>;

export const DeterministicScheduledReportChecklistStatusSchema = z.enum([
  "PASS",
  "WAIT",
  "BLOCKED",
  "INFO",
  "UNAVAILABLE",
]);
export type DeterministicScheduledReportChecklistStatus = z.infer<
  typeof DeterministicScheduledReportChecklistStatusSchema
>;

export const DeterministicScheduledReportChecklistItemSchema = z
  .object({
    code: z.enum([
      "SOURCE_ASSEMBLY",
      "BIAS_EVIDENCE",
      "ENTRY_CONDITION",
      "RISK_FRAMEWORK",
      "CONTRACT_SELECTION",
    ]),
    status: DeterministicScheduledReportChecklistStatusSchema,
    message: z.string().min(1),
  })
  .strict();
export type DeterministicScheduledReportChecklistItem = z.infer<
  typeof DeterministicScheduledReportChecklistItemSchema
>;

export const DeterministicScheduledReportWarningSchema = z
  .object({
    code: z.string().min(1),
    message: z.string().min(1),
  })
  .strict();
export type DeterministicScheduledReportWarning = z.infer<
  typeof DeterministicScheduledReportWarningSchema
>;

export const DeterministicScheduledReportSourceAssemblySummarySchema = z
  .object({
    product: z.literal("SPY_ZERO_DTE_DETERMINISTIC_TRADE_PLAN_ASSEMBLY"),
    methodologyVersion: TradePlanAssemblyMethodologyVersionSchema,
    currentMarketDate: MarketDateSchema,
    calculatedAt: z.string().datetime(),
    engineState: TradePlanAssemblyEngineStateSchema,
    planState: DeterministicTradePlanStateSchema,
    direction: AssembledTradePlanDirectionSchema,
    primaryReasonCode: TradePlanAssemblyPrimaryReasonCodeSchema,
    warningCode: TradePlanAssemblyWarningCodeSchema.nullable(),
    currentPrice: z.number().finite().positive().nullable(),
    sessionPhase: MarketContextSessionWindowSchema.nullable(),
    biasState: DeterministicBiasStateSchema,
    confidenceScore: z.number().finite().min(0).max(100).nullable(),
    confidenceUnit: BiasConfidenceUnitSchema,
    sourceQualityState: BiasSourceQualityStateSchema,
  })
  .strict();
export type DeterministicScheduledReportSourceAssemblySummary = z.infer<
  typeof DeterministicScheduledReportSourceAssemblySummarySchema
>;

export const DeterministicScheduledReportPlanSnapshotSchema = z
  .object({
    entryCondition: TradePlanAssemblyEntryConditionSchema,
    structuralInvalidation: TradePlanAssemblyInvalidationSummarySchema,
    primaryObjective: TradePlanAssemblyObjectiveSummarySchema,
    underlyingRiskReward: TradePlanAssemblyRiskRewardSummarySchema,
    selectedContract: TradePlanAssemblySelectedContractSummarySchema,
    premiumReference: TradePlanAssemblyPremiumReferenceSchema,
  })
  .strict();
export type DeterministicScheduledReportPlanSnapshot = z.infer<
  typeof DeterministicScheduledReportPlanSnapshotSchema
>;

export const SpyZeroDteDeterministicScheduledReportResponseSchema = z
  .object({
    symbol: z.literal("SPY"),
    product: z.literal("SPY_ZERO_DTE_DETERMINISTIC_SCHEDULED_REPORT"),
    methodologyVersion: DeterministicScheduledReportMethodologyVersionSchema,
    reportType: DeterministicScheduledReportTypeSchema,
    scheduleReferenceEasternTime: z.enum(["09:25", "09:35", "09:45", "10:00"]),
    currentMarketDate: MarketDateSchema,
    generatedAt: z.string().datetime(),
    engineState: TradePlanAssemblyEngineStateSchema,
    reportState: DeterministicScheduledReportStateSchema,
    primaryReasonCode: DeterministicScheduledReportPrimaryReasonCodeSchema,
    warningCode: TradePlanAssemblyWarningCodeSchema.nullable(),
    sourceAssembly: DeterministicScheduledReportSourceAssemblySummarySchema,
    title: z.string().min(1),
    headline: z.string().min(1),
    plan: DeterministicScheduledReportPlanSnapshotSchema,
    checklist: z.array(DeterministicScheduledReportChecklistItemSchema).length(5),
    warnings: z.array(DeterministicScheduledReportWarningSchema),
    disclosures: z
      .object({
        deterministicOnly: z.literal(true),
        currentSnapshotOnly: z.literal(true),
        noFutureData: z.literal(true),
        noHistoricalReconstruction: z.literal(true),
        noLlmGeneration: z.literal(true),
        noPersistence: z.literal(true),
        noNotificationDelivery: z.literal(true),
        noPrivateAccountData: z.literal(true),
        noPositionSizing: z.literal(true),
        noOrderExecution: z.literal(true),
      })
      .strict(),
    methodology: z
      .object({
        sourceProduct: z.literal(
          "SPY_ZERO_DTE_DETERMINISTIC_TRADE_PLAN_ASSEMBLY",
        ),
        sourceMethodology: z.literal("ASSEMBLY_V1"),
        reportMethod: z.literal("FIXED_COPY_FROM_CURRENT_ASSEMBLY_SNAPSHOT"),
        scheduleMethod: z.literal("CALLER_SELECTED_REPORT_TYPE_REFERENCE_ONLY"),
        persistenceMethod: z.literal("NONE"),
        deliveryMethod: z.literal("NONE"),
        languageModelMethod: z.literal("NONE"),
      })
      .strict(),
  })
  .strict()
  .superRefine((value, ctx) => {
    const issue = (message: string) =>
      ctx.addIssue({ code: z.ZodIssueCode.custom, message });

    const scheduleByType: Record<DeterministicScheduledReportType, string> = {
      PREMARKET_0925: "09:25",
      OPENING_0935: "09:35",
      OPENING_0945: "09:45",
      UPDATE_1000: "10:00",
    };
    if (value.scheduleReferenceEasternTime !== scheduleByType[value.reportType]) {
      issue("Scheduled report time must match the requested report type");
    }
    if (value.currentMarketDate !== value.sourceAssembly.currentMarketDate) {
      issue("Scheduled report market date must match Assembly");
    }
    if (value.engineState !== value.sourceAssembly.engineState) {
      issue("Scheduled report engine state must match Assembly");
    }
    if (value.reportState === "READY") {
      if (
        value.sourceAssembly.planState !== "READY" ||
        value.primaryReasonCode !== "READY_PLAN_SUMMARY"
      ) {
        issue("READY report requires a READY Assembly plan");
      }
    } else if (value.reportState === "UNAVAILABLE") {
      if (
        value.engineState !== "UNAVAILABLE" ||
        value.sourceAssembly.planState !== "UNAVAILABLE" ||
        ![
          "SOURCE_ASSEMBLY_UNAVAILABLE",
          "SOURCE_ASSEMBLY_INCONSISTENT",
        ].includes(value.primaryReasonCode)
      ) {
        issue("UNAVAILABLE report requires unavailable Assembly provenance");
      }
    } else if (
      value.engineState === "UNAVAILABLE" ||
      value.sourceAssembly.planState === "READY" ||
      value.sourceAssembly.planState === "UNAVAILABLE"
    ) {
      issue("INFORMATIONAL report requires an available non-READY Assembly state");
    }
  });
export type SpyZeroDteDeterministicScheduledReportResponse = z.infer<
  typeof SpyZeroDteDeterministicScheduledReportResponseSchema
>;

/** Explicit Discord delivery for one deterministic scheduled report snapshot. */
export const DiscordScheduledReportDeliveryRequestSchema = z
  .object({
    reportType: DeterministicScheduledReportTypeSchema,
  })
  .strict();
export type DiscordScheduledReportDeliveryRequest = z.infer<
  typeof DiscordScheduledReportDeliveryRequestSchema
>;

export const DiscordScheduledReportDeliveryStateSchema = z.enum([
  "DELIVERED",
  "NOT_DELIVERED",
]);
export type DiscordScheduledReportDeliveryState = z.infer<
  typeof DiscordScheduledReportDeliveryStateSchema
>;

export const DiscordScheduledReportDeliveryPrimaryReasonCodeSchema = z.enum([
  "REPORT_DELIVERED",
  "WEBHOOK_NOT_CONFIGURED",
  "WEBHOOK_CONFIG_INVALID",
  "REPORT_UNAVAILABLE",
  "REPORT_GENERATION_FAILURE",
  "WEBHOOK_REQUEST_TIMEOUT",
  "WEBHOOK_NETWORK_FAILURE",
  "WEBHOOK_RATE_LIMITED",
  "WEBHOOK_REJECTED",
  "WEBHOOK_PROVIDER_FAILURE",
]);
export type DiscordScheduledReportDeliveryPrimaryReasonCode = z.infer<
  typeof DiscordScheduledReportDeliveryPrimaryReasonCodeSchema
>;

export const DiscordScheduledReportSummarySchema = z
  .object({
    product: z.literal("SPY_ZERO_DTE_DETERMINISTIC_SCHEDULED_REPORT"),
    methodologyVersion: DeterministicScheduledReportMethodologyVersionSchema,
    reportType: DeterministicScheduledReportTypeSchema,
    scheduleReferenceEasternTime: z.enum(["09:25", "09:35", "09:45", "10:00"]),
    currentMarketDate: MarketDateSchema,
    generatedAt: z.string().datetime(),
    engineState: TradePlanAssemblyEngineStateSchema,
    reportState: DeterministicScheduledReportStateSchema,
    primaryReasonCode: DeterministicScheduledReportPrimaryReasonCodeSchema,
    title: z.string().min(1),
    headline: z.string().min(1),
    direction: AssembledTradePlanDirectionSchema,
    checklistItemCount: z.number().int().nonnegative(),
    warningCount: z.number().int().nonnegative(),
  })
  .strict();
export type DiscordScheduledReportSummary = z.infer<
  typeof DiscordScheduledReportSummarySchema
>;

export const DiscordScheduledReportDeliveryResponseSchema = z
  .object({
    product: z.literal("DISCORD_DETERMINISTIC_SCHEDULED_REPORT_DELIVERY"),
    methodologyVersion: z.literal("DISCORD_SCHEDULED_REPORT_DELIVERY_V1"),
    deliveryState: DiscordScheduledReportDeliveryStateSchema,
    primaryReasonCode: DiscordScheduledReportDeliveryPrimaryReasonCodeSchema,
    reportType: DeterministicScheduledReportTypeSchema,
    attemptedAt: z.string().datetime(),
    deliveredAt: z.string().datetime().nullable(),
    providerStatusCode: z.number().int().min(100).max(599).nullable(),
    providerRequestAttempted: z.boolean(),
    report: DiscordScheduledReportSummarySchema.nullable(),
    disclosures: z
      .object({
        webhookUrlReturned: z.literal(false),
        webhookTokenReturned: z.literal(false),
        providerBodyReturned: z.literal(false),
        explicitDeliveryOnly: z.literal(true),
        noAutomaticSchedule: z.literal(true),
        noDatabasePersistence: z.literal(true),
        deterministicSourceOnly: z.literal(true),
        noLlmGeneration: z.literal(true),
        noPrivateAccountData: z.literal(true),
        noOrderExecution: z.literal(true),
        mentionsDisabled: z.literal(true),
      })
      .strict(),
    methodology: z
      .object({
        sourceProduct: z.literal("SPY_ZERO_DTE_DETERMINISTIC_SCHEDULED_REPORT"),
        sourceMethodology: z.literal("SCHEDULED_REPORT_V1"),
        deliveryTrigger: z.literal("EXPLICIT_POST_ONLY"),
        providerConfirmationMethod: z.literal("DISCORD_WAIT_TRUE_HTTP_SUCCESS"),
        persistenceMethod: z.literal("NONE"),
        schedulerMethod: z.literal("NONE"),
        languageModelMethod: z.literal("NONE"),
      })
      .strict(),
  })
  .strict()
  .superRefine((value, ctx) => {
    const issue = (message: string) =>
      ctx.addIssue({ code: z.ZodIssueCode.custom, message });

    if (value.deliveryState === "DELIVERED") {
      if (
        value.primaryReasonCode !== "REPORT_DELIVERED" ||
        value.deliveredAt === null ||
        value.providerStatusCode === null ||
        value.providerStatusCode < 200 ||
        value.providerStatusCode >= 300 ||
        !value.providerRequestAttempted ||
        value.report === null
      ) {
        issue("DELIVERED scheduled report requires provider confirmation and report provenance");
      }
    } else if (
      value.primaryReasonCode === "REPORT_DELIVERED" ||
      value.deliveredAt !== null
    ) {
      issue("NOT_DELIVERED cannot expose successful scheduled-report delivery fields");
    }

    if (value.report !== null && value.report.reportType !== value.reportType) {
      issue("Scheduled-report delivery type must match report provenance");
    }

    if (
      ["WEBHOOK_NOT_CONFIGURED", "WEBHOOK_CONFIG_INVALID", "REPORT_GENERATION_FAILURE"].includes(
        value.primaryReasonCode,
      ) &&
      value.report !== null
    ) {
      issue("Pre-report failures cannot expose report provenance");
    }
  });
export type DiscordScheduledReportDeliveryResponse = z.infer<
  typeof DiscordScheduledReportDeliveryResponseSchema
>;

/** Deterministic Eastern-time evaluation of the fixed scheduled-report windows. */
export const ScheduledReportScheduleStateSchema = z.enum([
  "DUE",
  "WAITING",
  "COMPLETE",
  "NON_TRADING_DAY",
  "UNAVAILABLE",
]);
export type ScheduledReportScheduleState = z.infer<
  typeof ScheduledReportScheduleStateSchema
>;

export const ScheduledReportSchedulePrimaryReasonCodeSchema = z.enum([
  "REPORT_WINDOW_ACTIVE",
  "BEFORE_FIRST_REPORT",
  "BETWEEN_REPORT_WINDOWS",
  "AFTER_FINAL_REPORT",
  "WEEKEND_SUPPRESSED",
  "EXCHANGE_HOLIDAY_SUPPRESSED",
  "EXCHANGE_CALENDAR_UNSUPPORTED",
]);
export type ScheduledReportSchedulePrimaryReasonCode = z.infer<
  typeof ScheduledReportSchedulePrimaryReasonCodeSchema
>;

export const ScheduledReportEasternWeekdaySchema = z.enum([
  "MONDAY",
  "TUESDAY",
  "WEDNESDAY",
  "THURSDAY",
  "FRIDAY",
  "SATURDAY",
  "SUNDAY",
]);
export type ScheduledReportEasternWeekday = z.infer<
  typeof ScheduledReportEasternWeekdaySchema
>;

export const ScheduledReportExchangeCalendarCoverageStateSchema = z.enum([
  "SUPPORTED",
  "UNSUPPORTED",
]);
export type ScheduledReportExchangeCalendarCoverageState = z.infer<
  typeof ScheduledReportExchangeCalendarCoverageStateSchema
>;

export const ScheduledReportExchangeHolidayStateSchema = z.enum([
  "HOLIDAY",
  "NOT_HOLIDAY",
  "UNKNOWN",
]);
export type ScheduledReportExchangeHolidayState = z.infer<
  typeof ScheduledReportExchangeHolidayStateSchema
>;

export const ScheduledReportExchangeHolidayNameSchema = z.enum([
  "NEW_YEARS_DAY",
  "MARTIN_LUTHER_KING_JR_DAY",
  "WASHINGTONS_BIRTHDAY",
  "GOOD_FRIDAY",
  "MEMORIAL_DAY",
  "JUNETEENTH_NATIONAL_INDEPENDENCE_DAY",
  "INDEPENDENCE_DAY",
  "LABOR_DAY",
  "THANKSGIVING_DAY",
  "CHRISTMAS_DAY",
]);
export type ScheduledReportExchangeHolidayName = z.infer<
  typeof ScheduledReportExchangeHolidayNameSchema
>;

export const ScheduledReportScheduleEntrySchema = z
  .object({
    reportType: DeterministicScheduledReportTypeSchema,
    scheduleReferenceEasternTime: z.enum(["09:25", "09:35", "09:45", "10:00"]),
    dueWindowStartEasternTime: z.enum(["09:25", "09:35", "09:45", "10:00"]),
    dueWindowEndEasternTime: z.enum(["09:30", "09:40", "09:50", "10:05"]),
  })
  .strict();
export type ScheduledReportScheduleEntry = z.infer<
  typeof ScheduledReportScheduleEntrySchema
>;

export const SpyZeroDteScheduledReportScheduleEvaluationResponseSchema = z
  .object({
    symbol: z.literal("SPY"),
    product: z.literal("SPY_ZERO_DTE_DETERMINISTIC_SCHEDULE_EVALUATION"),
    methodologyVersion: z.literal("SCHEDULE_EVALUATION_V2"),
    evaluatedAt: z.string().datetime(),
    easternDate: MarketDateSchema,
    easternTime: z.string().regex(/^\d{2}:\d{2}:\d{2}$/),
    easternWeekday: ScheduledReportEasternWeekdaySchema,
    exchangeCalendarCoverageState:
      ScheduledReportExchangeCalendarCoverageStateSchema,
    exchangeHolidayState: ScheduledReportExchangeHolidayStateSchema,
    exchangeHolidayName: ScheduledReportExchangeHolidayNameSchema.nullable(),
    exchangeHolidayObserved: z.boolean().nullable(),
    exchangeCalendarSupportedYearStart: z.literal(2026),
    exchangeCalendarSupportedYearEnd: z.literal(2028),
    scheduleState: ScheduledReportScheduleStateSchema,
    primaryReasonCode: ScheduledReportSchedulePrimaryReasonCodeSchema,
    dueReportType: DeterministicScheduledReportTypeSchema.nullable(),
    dueScheduleReferenceEasternTime: z
      .enum(["09:25", "09:35", "09:45", "10:00"])
      .nullable(),
    dueWindowStartEasternTime: z
      .enum(["09:25", "09:35", "09:45", "10:00"])
      .nullable(),
    dueWindowEndEasternTime: z
      .enum(["09:30", "09:40", "09:50", "10:05"])
      .nullable(),
    nextReportType: DeterministicScheduledReportTypeSchema.nullable(),
    nextScheduleReferenceEasternTime: z
      .enum(["09:25", "09:35", "09:45", "10:00"])
      .nullable(),
    schedule: z.array(ScheduledReportScheduleEntrySchema).length(4),
    disclosures: z
      .object({
        currentClockOnly: z.literal(true),
        easternTimeZoneOnly: z.literal(true),
        weekdayFilterApplied: z.literal(true),
        exchangeHolidayCalendarApplied: z.literal(true),
        officialPublishedCalendarOnly: z.literal(true),
        noUnscheduledClosureDetection: z.literal(true),
        noPersistence: z.literal(true),
        noNotificationDelivery: z.literal(true),
        noPrivateAccountData: z.literal(true),
        noOrderExecution: z.literal(true),
      })
      .strict(),
    methodology: z
      .object({
        timeZone: z.literal("America/New_York"),
        dueWindowMinutes: z.literal(5),
        dueWindowMethod: z.literal("START_INCLUSIVE_END_EXCLUSIVE"),
        tradingDayMethod: z.literal(
          "WEEKDAY_AND_NYSE_FULL_DAY_HOLIDAY_CALENDAR",
        ),
        holidayCalendarMethod: z.literal(
          "NYSE_OFFICIAL_PUBLISHED_FULL_DAY_CLOSURES_2026_2028",
        ),
        unsupportedCalendarBehavior: z.literal("FAIL_CLOSED_UNAVAILABLE"),
        unscheduledClosureMethod: z.literal("NONE"),
        scheduleSource: z.literal("FIXED_SCHEDULED_REPORT_TYPE_TABLE"),
        persistenceMethod: z.literal("NONE"),
        deliveryMethod: z.literal("NONE"),
        schedulerMethod: z.literal("NONE"),
      })
      .strict(),
  })
  .strict()
  .superRefine((value, ctx) => {
    const issue = (message: string) =>
      ctx.addIssue({ code: z.ZodIssueCode.custom, message });

    const dueFields = [
      value.dueReportType,
      value.dueScheduleReferenceEasternTime,
      value.dueWindowStartEasternTime,
      value.dueWindowEndEasternTime,
    ];
    if (value.scheduleState === "DUE") {
      if (
        value.primaryReasonCode !== "REPORT_WINDOW_ACTIVE" ||
        dueFields.some((field) => field === null) ||
        value.nextReportType !== value.dueReportType ||
        value.nextScheduleReferenceEasternTime !==
          value.dueScheduleReferenceEasternTime
      ) {
        issue("DUE schedule evaluation requires one complete active report window");
      }
    } else if (dueFields.some((field) => field !== null)) {
      issue("Non-DUE schedule evaluation cannot expose active due-window fields");
    }

    if (value.exchangeCalendarCoverageState === "SUPPORTED") {
      if (value.exchangeHolidayState === "UNKNOWN") {
        issue("Supported exchange calendar coverage cannot have unknown holiday state");
      }
    } else if (
      value.exchangeHolidayState !== "UNKNOWN" ||
      value.exchangeHolidayName !== null ||
      value.exchangeHolidayObserved !== null
    ) {
      issue("Unsupported exchange calendar coverage must fail closed without holiday details");
    }

    if (value.exchangeHolidayState === "HOLIDAY") {
      if (
        value.exchangeHolidayName === null ||
        value.exchangeHolidayObserved === null
      ) {
        issue("Exchange holiday state requires holiday name and observed flag");
      }
    } else if (
      value.exchangeHolidayName !== null ||
      value.exchangeHolidayObserved !== null
    ) {
      issue("Non-holiday exchange states cannot expose holiday details");
    }

    if (value.scheduleState === "NON_TRADING_DAY") {
      const weekend = value.primaryReasonCode === "WEEKEND_SUPPRESSED";
      const holiday =
        value.primaryReasonCode === "EXCHANGE_HOLIDAY_SUPPRESSED";
      if (
        (!weekend && !holiday) ||
        (weekend && !["SATURDAY", "SUNDAY"].includes(value.easternWeekday)) ||
        (holiday && value.exchangeHolidayState !== "HOLIDAY") ||
        value.nextReportType !== null ||
        value.nextScheduleReferenceEasternTime !== null
      ) {
        issue("NON_TRADING_DAY must be a weekend or supported exchange holiday");
      }
    }

    if (value.scheduleState === "UNAVAILABLE") {
      if (
        value.primaryReasonCode !== "EXCHANGE_CALENDAR_UNSUPPORTED" ||
        value.exchangeCalendarCoverageState !== "UNSUPPORTED" ||
        value.nextReportType !== null ||
        value.nextScheduleReferenceEasternTime !== null
      ) {
        issue("UNAVAILABLE schedule evaluation requires unsupported calendar coverage");
      }
    }

    if (value.scheduleState === "COMPLETE") {
      if (
        value.primaryReasonCode !== "AFTER_FINAL_REPORT" ||
        value.nextReportType !== null ||
        value.nextScheduleReferenceEasternTime !== null
      ) {
        issue("COMPLETE schedule evaluation cannot expose a next report");
      }
    }

    if (value.scheduleState === "WAITING") {
      if (
        !["BEFORE_FIRST_REPORT", "BETWEEN_REPORT_WINDOWS"].includes(
          value.primaryReasonCode,
        ) ||
        value.nextReportType === null ||
        value.nextScheduleReferenceEasternTime === null
      ) {
        issue("WAITING schedule evaluation requires one future report");
      }
    }

    if (["DUE", "WAITING", "COMPLETE"].includes(value.scheduleState)) {
      if (
        value.exchangeCalendarCoverageState !== "SUPPORTED" ||
        value.exchangeHolidayState !== "NOT_HOLIDAY" ||
        ["SATURDAY", "SUNDAY"].includes(value.easternWeekday)
      ) {
        issue("Active schedule states require a supported non-holiday weekday");
      }
    }
  });
export type SpyZeroDteScheduledReportScheduleEvaluationResponse = z.infer<
  typeof SpyZeroDteScheduledReportScheduleEvaluationResponseSchema
>;


/** Opt-in foreground-browser automatic delivery of due deterministic scheduled reports. */
export const DiscordAutomaticScheduledReportCadenceMillisecondsSchema = z.union([
  z.literal(30_000),
  z.literal(60_000),
  z.literal(120_000),
]);
export type DiscordAutomaticScheduledReportCadenceMilliseconds = z.infer<
  typeof DiscordAutomaticScheduledReportCadenceMillisecondsSchema
>;

export const DiscordAutomaticScheduledReportDeliveryRequestSchema = z
  .object({
    clientMode: z.literal("FOREGROUND_BROWSER_SESSION"),
    cadenceMilliseconds:
      DiscordAutomaticScheduledReportCadenceMillisecondsSchema,
  })
  .strict();
export type DiscordAutomaticScheduledReportDeliveryRequest = z.infer<
  typeof DiscordAutomaticScheduledReportDeliveryRequestSchema
>;

export const DiscordAutomaticScheduledReportDeliveryStateSchema = z.enum([
  "DELIVERED",
  "NO_DELIVERY",
  "FAILED",
  "UNAVAILABLE",
]);
export type DiscordAutomaticScheduledReportDeliveryState = z.infer<
  typeof DiscordAutomaticScheduledReportDeliveryStateSchema
>;

export const DiscordAutomaticScheduledReportPrimaryReasonCodeSchema = z.enum([
  "REPORT_DELIVERED",
  "NO_REPORT_DUE",
  "DUPLICATE_REPORT_SUPPRESSED",
  "AMBIGUOUS_PROVIDER_OUTCOME_SUPPRESSED",
  "SCHEDULE_UNAVAILABLE",
  "WEBHOOK_NOT_CONFIGURED",
  "WEBHOOK_CONFIG_INVALID",
  "REPORT_UNAVAILABLE",
  "REPORT_GENERATION_FAILURE",
  "WEBHOOK_REQUEST_TIMEOUT",
  "WEBHOOK_NETWORK_FAILURE",
  "WEBHOOK_RATE_LIMITED",
  "WEBHOOK_REJECTED",
  "WEBHOOK_PROVIDER_FAILURE",
]);
export type DiscordAutomaticScheduledReportPrimaryReasonCode = z.infer<
  typeof DiscordAutomaticScheduledReportPrimaryReasonCodeSchema
>;

export const DiscordAutomaticScheduledReportDeliveryResponseSchema = z
  .object({
    product: z.literal("DISCORD_AUTOMATIC_SCHEDULED_REPORT_DELIVERY"),
    methodologyVersion: z.literal(
      "DISCORD_AUTOMATIC_SCHEDULED_REPORT_DELIVERY_V1",
    ),
    automaticDeliveryState:
      DiscordAutomaticScheduledReportDeliveryStateSchema,
    primaryReasonCode:
      DiscordAutomaticScheduledReportPrimaryReasonCodeSchema,
    evaluatedAt: z.string().datetime(),
    clientMode: z.literal("FOREGROUND_BROWSER_SESSION"),
    cadenceMilliseconds:
      DiscordAutomaticScheduledReportCadenceMillisecondsSchema,
    deliveryKey: z.string().min(1).nullable(),
    scheduleEvaluation:
      SpyZeroDteScheduledReportScheduleEvaluationResponseSchema.nullable(),
    delivery: DiscordScheduledReportDeliveryResponseSchema.nullable(),
    state: z
      .object({
        storageMethod: z.literal("PROCESS_MEMORY_ONLY"),
        marketDateBefore: MarketDateSchema.nullable(),
        marketDateAfter: MarketDateSchema.nullable(),
        marketDateReset: z.boolean(),
        mutationApplied: z.boolean(),
        deliveredKeyCommitted: z.boolean(),
        ambiguousKeyCommitted: z.boolean(),
      })
      .strict(),
    disclosures: z
      .object({
        userOptInRequired: z.literal(true),
        foregroundBrowserSessionOnly: z.literal(true),
        noBackgroundScheduler: z.literal(true),
        processMemoryDeduplication: z.literal(true),
        resetsOnProcessRestart: z.literal(true),
        ambiguousProviderOutcomeSuppressed: z.literal(true),
        noDatabasePersistence: z.literal(true),
        webhookUrlReturned: z.literal(false),
        webhookTokenReturned: z.literal(false),
        providerBodyReturned: z.literal(false),
        deterministicSourceOnly: z.literal(true),
        noLlmGeneration: z.literal(true),
        noPrivateAccountData: z.literal(true),
        noOrderExecution: z.literal(true),
        mentionsDisabled: z.literal(true),
      })
      .strict(),
    methodology: z
      .object({
        scheduleProduct: z.literal(
          "SPY_ZERO_DTE_DETERMINISTIC_SCHEDULE_EVALUATION",
        ),
        scheduleMethodology: z.literal("SCHEDULE_EVALUATION_V2"),
        deliveryProduct: z.literal(
          "DISCORD_DETERMINISTIC_SCHEDULED_REPORT_DELIVERY",
        ),
        deliveryMethodology: z.literal(
          "DISCORD_SCHEDULED_REPORT_DELIVERY_V1",
        ),
        deliveryTrigger: z.literal(
          "OPT_IN_FOREGROUND_BROWSER_POLL_DURING_DUE_WINDOW",
        ),
        cadenceSource: z.literal("CALLER_SELECTED_ALLOWED_VALUE"),
        deduplicationKeyMethod: z.literal("EASTERN_DATE_AND_REPORT_TYPE"),
        stateCommitMethod: z.literal(
          "COMMIT_ONLY_AFTER_CONFIRMED_DELIVERY_OR_AMBIGUOUS_PROVIDER_OUTCOME",
        ),
        ambiguousOutcomeMethod: z.literal(
          "SUPPRESS_REMAINDER_OF_PROCESS_SESSION_FOR_DELIVERY_KEY",
        ),
        persistenceMethod: z.literal("NONE"),
        schedulerMethod: z.literal("FOREGROUND_BROWSER_TIMER_ONLY"),
      })
      .strict(),
  })
  .strict()
  .superRefine((value, ctx) => {
    const issue = (message: string) =>
      ctx.addIssue({ code: z.ZodIssueCode.custom, message });

    if (value.automaticDeliveryState === "DELIVERED") {
      if (
        value.primaryReasonCode !== "REPORT_DELIVERED" ||
        value.delivery === null ||
        value.delivery.deliveryState !== "DELIVERED" ||
        value.deliveryKey === null ||
        !value.state.deliveredKeyCommitted ||
        value.state.ambiguousKeyCommitted
      ) {
        issue("Delivered automatic scheduled report requires confirmed delivery and committed key");
      }
    }

    if (value.primaryReasonCode === "NO_REPORT_DUE") {
      if (
        value.scheduleEvaluation === null ||
        value.scheduleEvaluation.scheduleState === "DUE" ||
        value.delivery !== null ||
        value.deliveryKey !== null
      ) {
        issue("NO_REPORT_DUE requires a non-due schedule and no delivery");
      }
    }

    if (
      ["DUPLICATE_REPORT_SUPPRESSED", "AMBIGUOUS_PROVIDER_OUTCOME_SUPPRESSED"].includes(
        value.primaryReasonCode,
      ) &&
      (value.deliveryKey === null || value.delivery !== null)
    ) {
      issue("Suppressed automatic report requires a key and no provider delivery");
    }

    if (value.primaryReasonCode === "SCHEDULE_UNAVAILABLE") {
      if (
        value.automaticDeliveryState !== "UNAVAILABLE" ||
        value.delivery !== null ||
        value.deliveryKey !== null
      ) {
        issue("Unavailable schedule cannot attempt delivery");
      }
    }

    if (value.delivery !== null && value.scheduleEvaluation?.dueReportType !== value.delivery.reportType) {
      issue("Automatic scheduled-report delivery must match the due report type");
    }

    if (value.state.deliveredKeyCommitted && value.state.ambiguousKeyCommitted) {
      issue("A delivery key cannot be both delivered and ambiguous");
    }
  });
export type DiscordAutomaticScheduledReportDeliveryResponse = z.infer<
  typeof DiscordAutomaticScheduledReportDeliveryResponseSchema
>;

/** Explicit and opt-in automatic persistent capture plus user-entered outcome annotation for deterministic Trade Plan Assembly snapshots. */
export const DeterministicJournalMethodologyVersionSchema = z.literal(
  "JOURNAL_SNAPSHOT_V3",
);
export type DeterministicJournalMethodologyVersion = z.infer<
  typeof DeterministicJournalMethodologyVersionSchema
>;

export const DeterministicJournalEngineStateSchema = z.enum([
  "AVAILABLE",
  "UNAVAILABLE",
]);
export type DeterministicJournalEngineState = z.infer<
  typeof DeterministicJournalEngineStateSchema
>;

export const DeterministicJournalCaptureModeSchema = z.enum([
  "EXPLICIT",
  "AUTOMATIC_CANDIDATE",
]);
export type DeterministicJournalCaptureMode = z.infer<
  typeof DeterministicJournalCaptureModeSchema
>;

export const DeterministicJournalSourceReferenceTypeSchema = z.literal(
  "TRADE_PLAN_ALERT_CANDIDATE",
);
export type DeterministicJournalSourceReferenceType = z.infer<
  typeof DeterministicJournalSourceReferenceTypeSchema
>;

export const DeterministicJournalOutcomeStateSchema = z.enum([
  "UNREVIEWED",
  "NO_TRADE",
  "WIN",
  "LOSS",
  "BREAKEVEN",
]);
export type DeterministicJournalOutcomeState = z.infer<
  typeof DeterministicJournalOutcomeStateSchema
>;

export const DeterministicJournalPrimaryReasonCodeSchema = z.enum([
  "JOURNAL_ENTRIES_AVAILABLE",
  "JOURNAL_EMPTY",
  "JOURNAL_SNAPSHOT_CAPTURED",
  "JOURNAL_AUTOMATIC_SNAPSHOT_CAPTURED",
  "JOURNAL_AUTOMATIC_DUPLICATE_SUPPRESSED",
  "JOURNAL_AUTOMATIC_NO_ELIGIBLE_CANDIDATE",
  "JOURNAL_OUTCOME_UPDATED",
  "JOURNAL_SNAPSHOT_NOT_FOUND",
  "SOURCE_ASSEMBLY_UNAVAILABLE",
  "DATABASE_NOT_CONFIGURED",
  "DATABASE_UNAVAILABLE",
]);
export type DeterministicJournalPrimaryReasonCode = z.infer<
  typeof DeterministicJournalPrimaryReasonCodeSchema
>;

export const DeterministicJournalWarningCodeSchema = z.enum([
  "SOURCE_ASSEMBLY_PARTIAL",
  "SOURCE_ASSEMBLY_WARNING",
]);
export type DeterministicJournalWarningCode = z.infer<
  typeof DeterministicJournalWarningCodeSchema
>;

function validateJournalOutcome(
  value: {
    outcomeState: DeterministicJournalOutcomeState;
    realizedPnlDollars: number | null;
  },
  issue: (message: string, path: Array<string | number>) => void,
): void {
  if (["UNREVIEWED", "NO_TRADE"].includes(value.outcomeState)) {
    if (value.realizedPnlDollars !== null) {
      issue(`${value.outcomeState} must not include realized P&L`, [
        "realizedPnlDollars",
      ]);
    }
    return;
  }

  if (value.outcomeState === "WIN") {
    if (value.realizedPnlDollars === null || value.realizedPnlDollars <= 0) {
      issue("WIN requires positive realized P&L", ["realizedPnlDollars"]);
    }
    return;
  }

  if (value.outcomeState === "LOSS") {
    if (value.realizedPnlDollars === null || value.realizedPnlDollars >= 0) {
      issue("LOSS requires negative realized P&L", ["realizedPnlDollars"]);
    }
    return;
  }

  if (value.realizedPnlDollars !== 0) {
    issue("BREAKEVEN requires realized P&L of zero", ["realizedPnlDollars"]);
  }
}

export const DeterministicJournalSnapshotIdSchema = z.string().min(1).max(128);
export type DeterministicJournalSnapshotId = z.infer<
  typeof DeterministicJournalSnapshotIdSchema
>;

export const DeterministicJournalSnapshotEntrySchema = z
  .object({
    id: DeterministicJournalSnapshotIdSchema,
    symbol: z.literal("SPY"),
    product: z.literal("SPY_ZERO_DTE_DETERMINISTIC_JOURNAL_SNAPSHOT"),
    methodologyVersion: DeterministicJournalMethodologyVersionSchema,
    currentMarketDate: MarketDateSchema,
    sourceCalculatedAt: z.string().datetime(),
    capturedAt: z.string().datetime(),
    captureMode: DeterministicJournalCaptureModeSchema,
    sourceReferenceType:
      DeterministicJournalSourceReferenceTypeSchema.nullable(),
    engineState: TradePlanAssemblyEngineStateSchema,
    planState: DeterministicTradePlanStateSchema,
    direction: AssembledTradePlanDirectionSchema,
    structuralConfidenceScore: z.number().finite().min(0).max(100).nullable(),
    primaryReasonCode: TradePlanAssemblyPrimaryReasonCodeSchema,
    warningCode: TradePlanAssemblyWarningCodeSchema.nullable(),
    entryConditionState: TradePlanAssemblyEntryConditionStateSchema,
    selectedContractSymbol: z.string().min(1).nullable(),
    outcomeState: DeterministicJournalOutcomeStateSchema,
    realizedPnlDollars: z.number().finite().min(-10_000_000).max(10_000_000).nullable(),
    outcomeNotes: z.string().min(1).max(2000).nullable(),
    outcomeUpdatedAt: z.string().datetime().nullable(),
  })
  .strict()
  .superRefine((value, ctx) => {
    validateJournalOutcome(value, (message, path) =>
      ctx.addIssue({ code: z.ZodIssueCode.custom, message, path }),
    );
    if (value.outcomeState === "UNREVIEWED") {
      if (value.outcomeNotes !== null || value.outcomeUpdatedAt !== null) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "Unreviewed snapshot cannot contain outcome metadata",
        });
      }
    } else if (value.outcomeUpdatedAt === null) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Reviewed snapshot requires outcomeUpdatedAt",
        path: ["outcomeUpdatedAt"],
      });
    }

    if (value.captureMode === "EXPLICIT") {
      if (value.sourceReferenceType !== null) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "Explicit journal capture cannot expose an automatic source reference",
          path: ["sourceReferenceType"],
        });
      }
    } else if (value.sourceReferenceType !== "TRADE_PLAN_ALERT_CANDIDATE") {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Automatic candidate capture requires candidate source provenance",
        path: ["sourceReferenceType"],
      });
    }
  });
export type DeterministicJournalSnapshotEntry = z.infer<
  typeof DeterministicJournalSnapshotEntrySchema
>;

export const DeterministicJournalDisclosuresSchema = z
  .object({
    explicitCaptureAvailable: z.literal(true),
    automaticCandidateCaptureAvailable: z.literal(true),
    automaticCaptureForegroundOnly: z.literal(true),
    currentSnapshotOnly: z.literal(true),
    deterministicSourceOnly: z.literal(true),
    databasePersistence: z.literal(true),
    databaseDuplicateSuppression: z.literal(true),
    noBackgroundScheduler: z.literal(true),
    userEnteredOutcomeOnly: z.literal(true),
    noAutomaticOutcomeInference: z.literal(true),
    performanceAnalyticsAvailable: z.literal(true),
    noPrivateAccountData: z.literal(true),
    noPositionSizing: z.literal(true),
    noOrderExecution: z.literal(true),
  })
  .strict();
export type DeterministicJournalDisclosures = z.infer<
  typeof DeterministicJournalDisclosuresSchema
>;

export const DeterministicJournalSnapshotListResponseSchema = z
  .object({
    product: z.literal("SPY_ZERO_DTE_DETERMINISTIC_JOURNAL"),
    methodologyVersion: DeterministicJournalMethodologyVersionSchema,
    calculatedAt: z.string().datetime(),
    engineState: DeterministicJournalEngineStateSchema,
    primaryReasonCode: DeterministicJournalPrimaryReasonCodeSchema,
    entries: z.array(DeterministicJournalSnapshotEntrySchema).max(200),
    disclosures: DeterministicJournalDisclosuresSchema,
  })
  .strict()
  .superRefine((value, ctx) => {
    const issue = (message: string) =>
      ctx.addIssue({ code: z.ZodIssueCode.custom, message });

    if (value.engineState === "AVAILABLE") {
      if (
        value.primaryReasonCode === "JOURNAL_ENTRIES_AVAILABLE" &&
        value.entries.length === 0
      ) {
        issue("Available populated journal requires at least one entry");
      }
      if (
        value.primaryReasonCode === "JOURNAL_EMPTY" &&
        value.entries.length !== 0
      ) {
        issue("Empty journal must not contain entries");
      }
      if (
        !["JOURNAL_ENTRIES_AVAILABLE", "JOURNAL_EMPTY"].includes(
          value.primaryReasonCode,
        )
      ) {
        issue("Available journal has an invalid reason code");
      }
    } else if (
      value.entries.length !== 0 ||
      !["DATABASE_NOT_CONFIGURED", "DATABASE_UNAVAILABLE"].includes(
        value.primaryReasonCode,
      )
    ) {
      issue("Unavailable journal must be empty and database-related");
    }
  });
export type DeterministicJournalSnapshotListResponse = z.infer<
  typeof DeterministicJournalSnapshotListResponseSchema
>;

export const DeterministicJournalCaptureRequestSchema = z.object({}).strict();
export type DeterministicJournalCaptureRequest = z.infer<
  typeof DeterministicJournalCaptureRequestSchema
>;

export const DeterministicJournalCaptureResponseSchema = z
  .object({
    product: z.literal("SPY_ZERO_DTE_DETERMINISTIC_JOURNAL_CAPTURE"),
    methodologyVersion: DeterministicJournalMethodologyVersionSchema,
    calculatedAt: z.string().datetime(),
    engineState: DeterministicJournalEngineStateSchema,
    primaryReasonCode: DeterministicJournalPrimaryReasonCodeSchema,
    warningCode: DeterministicJournalWarningCodeSchema.nullable(),
    entry: DeterministicJournalSnapshotEntrySchema.nullable(),
    disclosures: DeterministicJournalDisclosuresSchema,
  })
  .strict()
  .superRefine((value, ctx) => {
    const issue = (message: string) =>
      ctx.addIssue({ code: z.ZodIssueCode.custom, message });

    if (value.primaryReasonCode === "JOURNAL_SNAPSHOT_CAPTURED") {
      if (
        value.engineState !== "AVAILABLE" ||
        value.entry === null ||
        value.entry.captureMode !== "EXPLICIT"
      ) {
        issue("Captured journal response requires an explicit available entry");
      }
    } else if (value.entry !== null || value.engineState !== "UNAVAILABLE") {
      issue("Uncaptured journal response must be unavailable and entry-free");
    }
  });
export type DeterministicJournalCaptureResponse = z.infer<
  typeof DeterministicJournalCaptureResponseSchema
>;

export const DeterministicJournalAutomaticCaptureRequestSchema = z
  .object({})
  .strict();
export type DeterministicJournalAutomaticCaptureRequest = z.infer<
  typeof DeterministicJournalAutomaticCaptureRequestSchema
>;

export const DeterministicJournalAutomaticCaptureStateSchema = z.enum([
  "CAPTURED",
  "DUPLICATE_SUPPRESSED",
  "NO_CAPTURE",
  "UNAVAILABLE",
]);
export type DeterministicJournalAutomaticCaptureState = z.infer<
  typeof DeterministicJournalAutomaticCaptureStateSchema
>;

export const DeterministicJournalAutomaticCandidateSummarySchema = z
  .object({
    alertState: TradePlanAlertCandidateStateSchema,
    primaryReasonCode: TradePlanAlertCandidatePrimaryReasonCodeSchema,
    category: TradePlanAlertCategorySchema.nullable(),
    severity: TradePlanAlertSeveritySchema.nullable(),
    direction: AssembledTradePlanDirectionSchema.nullable(),
    deduplicationKey: z.string().min(1).nullable(),
  })
  .strict()
  .superRefine((value, ctx) => {
    const hasCandidate = value.alertState === "CANDIDATE";
    const candidateFields = [
      value.category,
      value.severity,
      value.direction,
      value.deduplicationKey,
    ];
    if (hasCandidate && candidateFields.some((field) => field === null)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Candidate summary requires complete candidate provenance",
      });
    }
    if (!hasCandidate && candidateFields.some((field) => field !== null)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Non-candidate summary cannot expose candidate provenance",
      });
    }
  });
export type DeterministicJournalAutomaticCandidateSummary = z.infer<
  typeof DeterministicJournalAutomaticCandidateSummarySchema
>;

export const DeterministicJournalAutomaticCaptureResponseSchema = z
  .object({
    product: z.literal(
      "SPY_ZERO_DTE_DETERMINISTIC_JOURNAL_AUTOMATIC_CAPTURE",
    ),
    methodologyVersion: DeterministicJournalMethodologyVersionSchema,
    calculatedAt: z.string().datetime(),
    engineState: DeterministicJournalEngineStateSchema,
    automaticCaptureState: DeterministicJournalAutomaticCaptureStateSchema,
    primaryReasonCode: DeterministicJournalPrimaryReasonCodeSchema,
    warningCode: DeterministicJournalWarningCodeSchema.nullable(),
    entry: DeterministicJournalSnapshotEntrySchema.nullable(),
    sourceCandidate: DeterministicJournalAutomaticCandidateSummarySchema.nullable(),
    disclosures: DeterministicJournalDisclosuresSchema,
    methodology: z
      .object({
        sourceProduct: z.literal(
          "SPY_ZERO_DTE_DETERMINISTIC_TRADE_PLAN_ASSEMBLY",
        ),
        sourceMethodology: z.literal("ASSEMBLY_V1"),
        candidateProduct: z.literal(
          "SPY_ZERO_DTE_DETERMINISTIC_TRADE_PLAN_ALERT_CANDIDATE",
        ),
        candidateMethodology: z.literal("TRADE_PLAN_ALERT_CANDIDATE_V1"),
        eligibleCandidateStates: z.tuple([
          z.literal("READY"),
          z.literal("WAITING_FOR_TRIGGER"),
          z.literal("NO_QUALIFIED_CONTRACT"),
          z.literal("NOT_QUALIFIED"),
        ]),
        triggerMethod: z.literal("EXPLICIT_FOREGROUND_POST_POLL"),
        deduplicationMethod: z.literal(
          "POSTGRESQL_UNIQUE_USER_SOURCE_REFERENCE_KEY",
        ),
        persistenceMethod: z.literal("POSTGRESQL"),
        schedulerMethod: z.literal("NONE"),
      })
      .strict(),
  })
  .strict()
  .superRefine((value, ctx) => {
    const issue = (message: string) =>
      ctx.addIssue({ code: z.ZodIssueCode.custom, message });

    if (value.automaticCaptureState === "CAPTURED") {
      if (
        value.primaryReasonCode !== "JOURNAL_AUTOMATIC_SNAPSHOT_CAPTURED" ||
        value.engineState !== "AVAILABLE" ||
        value.entry === null ||
        value.entry.captureMode !== "AUTOMATIC_CANDIDATE" ||
        value.sourceCandidate?.alertState !== "CANDIDATE"
      ) {
        issue("Captured automatic response requires one new automatic entry");
      }
      return;
    }

    if (value.automaticCaptureState === "DUPLICATE_SUPPRESSED") {
      if (
        value.primaryReasonCode !== "JOURNAL_AUTOMATIC_DUPLICATE_SUPPRESSED" ||
        value.engineState !== "AVAILABLE" ||
        value.entry === null ||
        value.entry.captureMode !== "AUTOMATIC_CANDIDATE" ||
        value.sourceCandidate?.alertState !== "CANDIDATE"
      ) {
        issue("Duplicate automatic response requires the existing automatic entry");
      }
      return;
    }

    if (value.automaticCaptureState === "NO_CAPTURE") {
      if (
        value.primaryReasonCode !== "JOURNAL_AUTOMATIC_NO_ELIGIBLE_CANDIDATE" ||
        value.engineState !== "AVAILABLE" ||
        value.entry !== null ||
        value.sourceCandidate === null ||
        value.sourceCandidate.alertState === "CANDIDATE"
      ) {
        issue("No-capture response requires one non-candidate source summary");
      }
      return;
    }

    if (
      value.engineState !== "UNAVAILABLE" ||
      value.entry !== null ||
      ![
        "SOURCE_ASSEMBLY_UNAVAILABLE",
        "DATABASE_NOT_CONFIGURED",
        "DATABASE_UNAVAILABLE",
      ].includes(value.primaryReasonCode)
    ) {
      issue("Unavailable automatic response must be source or database related");
    }
  });
export type DeterministicJournalAutomaticCaptureResponse = z.infer<
  typeof DeterministicJournalAutomaticCaptureResponseSchema
>;

export const DeterministicJournalOutcomeUpdateRequestSchema = z
  .object({
    outcomeState: DeterministicJournalOutcomeStateSchema,
    realizedPnlDollars: z
      .number()
      .finite()
      .min(-10_000_000)
      .max(10_000_000)
      .nullable(),
    notes: z.string().trim().min(1).max(2000).nullable(),
  })
  .strict()
  .superRefine((value, ctx) => {
    validateJournalOutcome(value, (message, path) =>
      ctx.addIssue({ code: z.ZodIssueCode.custom, message, path }),
    );
    if (value.outcomeState === "UNREVIEWED" && value.notes !== null) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "UNREVIEWED must not include outcome notes",
        path: ["notes"],
      });
    }
  });
export type DeterministicJournalOutcomeUpdateRequest = z.infer<
  typeof DeterministicJournalOutcomeUpdateRequestSchema
>;

export const DeterministicJournalOutcomeUpdateResponseSchema = z
  .object({
    product: z.literal("SPY_ZERO_DTE_DETERMINISTIC_JOURNAL_OUTCOME"),
    methodologyVersion: DeterministicJournalMethodologyVersionSchema,
    calculatedAt: z.string().datetime(),
    engineState: DeterministicJournalEngineStateSchema,
    primaryReasonCode: DeterministicJournalPrimaryReasonCodeSchema,
    entry: DeterministicJournalSnapshotEntrySchema.nullable(),
    disclosures: DeterministicJournalDisclosuresSchema,
  })
  .strict()
  .superRefine((value, ctx) => {
    const issue = (message: string) =>
      ctx.addIssue({ code: z.ZodIssueCode.custom, message });

    if (value.primaryReasonCode === "JOURNAL_OUTCOME_UPDATED") {
      if (value.engineState !== "AVAILABLE" || value.entry === null) {
        issue("Updated outcome response requires an available entry");
      }
      return;
    }

    if (value.primaryReasonCode === "JOURNAL_SNAPSHOT_NOT_FOUND") {
      if (value.engineState !== "AVAILABLE" || value.entry !== null) {
        issue("Not-found outcome response must be available and entry-free");
      }
      return;
    }

    if (
      value.engineState !== "UNAVAILABLE" ||
      value.entry !== null ||
      !["DATABASE_NOT_CONFIGURED", "DATABASE_UNAVAILABLE"].includes(
        value.primaryReasonCode,
      )
    ) {
      issue("Unavailable outcome response must be database-related and entry-free");
    }
  });
export type DeterministicJournalOutcomeUpdateResponse = z.infer<
  typeof DeterministicJournalOutcomeUpdateResponseSchema
>;


// ---------------------------------------------------------------------------
// Deterministic Journal Analytics — JOURNAL_ANALYTICS_V1
// ---------------------------------------------------------------------------

export const DeterministicJournalAnalyticsMethodologyVersionSchema = z.literal(
  "JOURNAL_ANALYTICS_V1",
);
export type DeterministicJournalAnalyticsMethodologyVersion = z.infer<
  typeof DeterministicJournalAnalyticsMethodologyVersionSchema
>;

export const DeterministicJournalAnalyticsPrimaryReasonCodeSchema = z.enum([
  "JOURNAL_ANALYTICS_AVAILABLE",
  "JOURNAL_ANALYTICS_EMPTY",
  "DATABASE_NOT_CONFIGURED",
  "DATABASE_UNAVAILABLE",
]);
export type DeterministicJournalAnalyticsPrimaryReasonCode = z.infer<
  typeof DeterministicJournalAnalyticsPrimaryReasonCodeSchema
>;

export const DeterministicJournalConfidenceBandSchema = z.enum([
  "UNAVAILABLE",
  "LOW_0_49",
  "MODERATE_50_69",
  "HIGH_70_84",
  "VERY_HIGH_85_100",
]);
export type DeterministicJournalConfidenceBand = z.infer<
  typeof DeterministicJournalConfidenceBandSchema
>;

export const DeterministicJournalAnalyticsCountsSchema = z
  .object({
    totalSnapshots: z.number().int().nonnegative(),
    manualSnapshots: z.number().int().nonnegative(),
    automaticSnapshots: z.number().int().nonnegative(),
    reviewedSnapshots: z.number().int().nonnegative(),
    unreviewedSnapshots: z.number().int().nonnegative(),
    noTradeSnapshots: z.number().int().nonnegative(),
    tradeOutcomes: z.number().int().nonnegative(),
    wins: z.number().int().nonnegative(),
    losses: z.number().int().nonnegative(),
    breakevens: z.number().int().nonnegative(),
  })
  .strict()
  .superRefine((value, ctx) => {
    if (value.manualSnapshots + value.automaticSnapshots !== value.totalSnapshots) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: "Capture-mode counts must equal total snapshots" });
    }
    if (value.reviewedSnapshots + value.unreviewedSnapshots !== value.totalSnapshots) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: "Review-state counts must equal total snapshots" });
    }
    if (value.noTradeSnapshots + value.tradeOutcomes !== value.reviewedSnapshots) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: "Reviewed snapshots must equal no-trade plus trade outcomes" });
    }
    if (value.wins + value.losses + value.breakevens !== value.tradeOutcomes) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: "Trade outcomes must equal wins, losses, and breakevens" });
    }
  });
export type DeterministicJournalAnalyticsCounts = z.infer<
  typeof DeterministicJournalAnalyticsCountsSchema
>;

const NullableAnalyticsMoneySchema = z.number().finite().min(-1_000_000_000).max(1_000_000_000).nullable();

export const DeterministicJournalAnalyticsPerformanceSchema = z
  .object({
    reviewCoveragePercent: z.number().finite().min(0).max(100),
    tradeParticipationPercent: z.number().finite().min(0).max(100),
    winRatePercent: z.number().finite().min(0).max(100).nullable(),
    totalPnlDollars: NullableAnalyticsMoneySchema,
    averagePnlDollars: NullableAnalyticsMoneySchema,
    expectancyDollars: NullableAnalyticsMoneySchema,
    averageWinDollars: NullableAnalyticsMoneySchema,
    averageLossDollars: NullableAnalyticsMoneySchema,
    grossProfitDollars: NullableAnalyticsMoneySchema,
    grossLossMagnitudeDollars: z.number().finite().min(0).max(1_000_000_000).nullable(),
    profitFactor: z.number().finite().min(0).max(1_000_000).nullable(),
    largestWinDollars: NullableAnalyticsMoneySchema,
    largestLossDollars: NullableAnalyticsMoneySchema,
  })
  .strict();
export type DeterministicJournalAnalyticsPerformance = z.infer<
  typeof DeterministicJournalAnalyticsPerformanceSchema
>;

export const DeterministicJournalAnalyticsBreakdownEntrySchema = z
  .object({
    key: z.string().min(1).max(64),
    label: z.string().min(1).max(96),
    snapshotCount: z.number().int().nonnegative(),
    reviewedCount: z.number().int().nonnegative(),
    noTradeCount: z.number().int().nonnegative(),
    tradeCount: z.number().int().nonnegative(),
    wins: z.number().int().nonnegative(),
    losses: z.number().int().nonnegative(),
    breakevens: z.number().int().nonnegative(),
    winRatePercent: z.number().finite().min(0).max(100).nullable(),
    totalPnlDollars: NullableAnalyticsMoneySchema,
    averagePnlDollars: NullableAnalyticsMoneySchema,
  })
  .strict()
  .superRefine((value, ctx) => {
    if (value.noTradeCount + value.tradeCount !== value.reviewedCount) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: "Breakdown reviewed count is inconsistent" });
    }
    if (value.wins + value.losses + value.breakevens !== value.tradeCount) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: "Breakdown trade count is inconsistent" });
    }
    if (value.reviewedCount > value.snapshotCount) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: "Breakdown reviewed count cannot exceed snapshot count" });
    }
  });
export type DeterministicJournalAnalyticsBreakdownEntry = z.infer<
  typeof DeterministicJournalAnalyticsBreakdownEntrySchema
>;

export const DeterministicJournalAnalyticsDailyEntrySchema = z
  .object({
    marketDate: MarketDateSchema,
    snapshotCount: z.number().int().nonnegative(),
    reviewedCount: z.number().int().nonnegative(),
    noTradeCount: z.number().int().nonnegative(),
    tradeCount: z.number().int().nonnegative(),
    wins: z.number().int().nonnegative(),
    losses: z.number().int().nonnegative(),
    breakevens: z.number().int().nonnegative(),
    totalPnlDollars: NullableAnalyticsMoneySchema,
  })
  .strict()
  .superRefine((value, ctx) => {
    if (value.noTradeCount + value.tradeCount !== value.reviewedCount) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: "Daily reviewed count is inconsistent" });
    }
    if (value.wins + value.losses + value.breakevens !== value.tradeCount) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: "Daily trade count is inconsistent" });
    }
  });
export type DeterministicJournalAnalyticsDailyEntry = z.infer<
  typeof DeterministicJournalAnalyticsDailyEntrySchema
>;

export const DeterministicJournalAnalyticsPayloadSchema = z
  .object({
    dataStartMarketDate: MarketDateSchema.nullable(),
    dataEndMarketDate: MarketDateSchema.nullable(),
    counts: DeterministicJournalAnalyticsCountsSchema,
    performance: DeterministicJournalAnalyticsPerformanceSchema,
    byDirection: z.array(DeterministicJournalAnalyticsBreakdownEntrySchema).length(3),
    byPlanState: z.array(DeterministicJournalAnalyticsBreakdownEntrySchema).length(7),
    byCaptureMode: z.array(DeterministicJournalAnalyticsBreakdownEntrySchema).length(2),
    byConfidenceBand: z.array(DeterministicJournalAnalyticsBreakdownEntrySchema).length(5),
    dailyPerformance: z.array(DeterministicJournalAnalyticsDailyEntrySchema).max(30),
    sample: z.object({
      aggregationScope: z.literal("ALL_PERSISTED_USER_SNAPSHOTS"),
      dailyMarketDateLimit: z.literal(30),
    }).strict(),
  })
  .strict()
  .superRefine((value, ctx) => {
    const total = value.counts.totalSnapshots;
    if (total === 0) {
      if (value.dataStartMarketDate !== null || value.dataEndMarketDate !== null) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, message: "Empty analytics cannot expose a date range" });
      }
    } else if (value.dataStartMarketDate === null || value.dataEndMarketDate === null) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: "Populated analytics requires a date range" });
    }
  });
export type DeterministicJournalAnalyticsPayload = z.infer<
  typeof DeterministicJournalAnalyticsPayloadSchema
>;

export const DeterministicJournalAnalyticsDisclosuresSchema = z.object({
  allPersistedUserSnapshots: z.literal(true),
  databaseAggregateOnly: z.literal(true),
  userEnteredOutcomeOnly: z.literal(true),
  unreviewedExcludedFromPerformance: z.literal(true),
  noTradeExcludedFromPnl: z.literal(true),
  breakevenIncludedInExpectancy: z.literal(true),
  winRateExcludesBreakeven: z.literal(true),
  noAutomaticOutcomeInference: z.literal(true),
  noPrivateAccountData: z.literal(true),
  noPositionSizing: z.literal(true),
  noOrderExecution: z.literal(true),
}).strict();
export type DeterministicJournalAnalyticsDisclosures = z.infer<
  typeof DeterministicJournalAnalyticsDisclosuresSchema
>;

export const DeterministicJournalAnalyticsResponseSchema = z
  .object({
    product: z.literal("SPY_ZERO_DTE_DETERMINISTIC_JOURNAL_ANALYTICS"),
    methodologyVersion: DeterministicJournalAnalyticsMethodologyVersionSchema,
    calculatedAt: z.string().datetime(),
    engineState: DeterministicJournalEngineStateSchema,
    primaryReasonCode: DeterministicJournalAnalyticsPrimaryReasonCodeSchema,
    analytics: DeterministicJournalAnalyticsPayloadSchema.nullable(),
    disclosures: DeterministicJournalAnalyticsDisclosuresSchema,
  })
  .strict()
  .superRefine((value, ctx) => {
    if (value.engineState === "AVAILABLE") {
      if (value.analytics === null) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, message: "Available analytics requires a payload", path: ["analytics"] });
        return;
      }
      const empty = value.analytics.counts.totalSnapshots === 0;
      if ((empty && value.primaryReasonCode !== "JOURNAL_ANALYTICS_EMPTY") ||
          (!empty && value.primaryReasonCode !== "JOURNAL_ANALYTICS_AVAILABLE")) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, message: "Analytics reason code does not match payload population" });
      }
      return;
    }
    if (value.analytics !== null ||
        !["DATABASE_NOT_CONFIGURED", "DATABASE_UNAVAILABLE"].includes(value.primaryReasonCode)) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: "Unavailable analytics must be database-related and payload-free" });
    }
  });
export type DeterministicJournalAnalyticsResponse = z.infer<
  typeof DeterministicJournalAnalyticsResponseSchema
>;

/**
 * Complete deterministic session-structure product: Traditional daily/weekly
 * pivots plus fixed 5m/15m/30m opening ranges. This product is supplemental
 * decision support and never creates signals or orders.
 */
export const SessionStructureMethodologySchema = z.literal("SESSION_STRUCTURE_V1");
export type SessionStructureMethodology = z.infer<typeof SessionStructureMethodologySchema>;

export const SessionStructureEngineStateSchema = z.enum([
  "AVAILABLE",
  "PARTIAL",
  "UNAVAILABLE",
]);
export type SessionStructureEngineState = z.infer<typeof SessionStructureEngineStateSchema>;

export const SessionStructureMetricStateSchema = z.enum([
  "LIVE",
  "STALE",
  "UNAVAILABLE",
]);
export type SessionStructureMetricState = z.infer<typeof SessionStructureMetricStateSchema>;

export const TraditionalPivotPeriodSchema = z.enum(["DAILY", "WEEKLY"]);
export type TraditionalPivotPeriod = z.infer<typeof TraditionalPivotPeriodSchema>;

export const TraditionalPivotWarningCodeSchema = z.enum([
  "SOURCE_DATA_UNAVAILABLE",
  "SOURCE_SESSION_INCOMPLETE",
  "SOURCE_WEEK_INCOMPLETE",
  "CALENDAR_UNSUPPORTED",
  "INVALID_PIVOT_INPUTS",
]);
export type TraditionalPivotWarningCode = z.infer<typeof TraditionalPivotWarningCodeSchema>;

export const TraditionalPivotSetSchema = z
  .object({
    period: TraditionalPivotPeriodSchema,
    metricState: SessionStructureMetricStateSchema,
    sourceCoverageState: CoverageStateSchema,
    sourceMarketDateStart: MarketDateSchema.nullable(),
    sourceMarketDateEnd: MarketDateSchema.nullable(),
    expectedTradingSessionCount: z.number().int().nonnegative(),
    observedTradingSessionCount: z.number().int().nonnegative(),
    sourceHigh: z.number().finite().positive().nullable(),
    sourceLow: z.number().finite().positive().nullable(),
    sourceClose: z.number().finite().positive().nullable(),
    pivot: z.number().finite().positive().nullable(),
    resistance1: z.number().finite().positive().nullable(),
    support1: z.number().finite().positive().nullable(),
    resistance2: z.number().finite().positive().nullable(),
    support2: z.number().finite().positive().nullable(),
    warningCode: TraditionalPivotWarningCodeSchema.nullable(),
  })
  .superRefine((value, ctx) => {
    const fields = [
      value.sourceHigh,
      value.sourceLow,
      value.sourceClose,
      value.pivot,
      value.resistance1,
      value.support1,
      value.resistance2,
      value.support2,
    ];
    const available = value.metricState !== "UNAVAILABLE";
    if (available && fields.some((item) => item === null)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Available Traditional pivots require complete source and calculated values",
      });
    }
    if (!available && fields.some((item) => item !== null)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Unavailable Traditional pivots cannot expose calculated values",
      });
    }
    if (available && value.sourceCoverageState !== "COMPLETE") {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Available Traditional pivots require COMPLETE source coverage",
      });
    }
    if (
      value.sourceMarketDateStart === null !==
      (value.sourceMarketDateEnd === null)
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Pivot source date boundaries must be jointly available or unavailable",
      });
    }
  });
export type TraditionalPivotSet = z.infer<typeof TraditionalPivotSetSchema>;

export const SessionOpeningRangeDurationSchema = z.union([
  z.literal(5),
  z.literal(15),
  z.literal(30),
]);
export type SessionOpeningRangeDuration = z.infer<
  typeof SessionOpeningRangeDurationSchema
>;

export const SessionOpeningRangePricePositionSchema = z.enum([
  "NOT_STARTED",
  "FORMING",
  "ABOVE",
  "BELOW",
  "INSIDE",
  "AT_HIGH",
  "AT_LOW",
  "UNAVAILABLE",
]);
export type SessionOpeningRangePricePosition = z.infer<
  typeof SessionOpeningRangePricePositionSchema
>;

export const SessionOpeningRangeInteractionStateSchema = z.enum([
  "NOT_STARTED",
  "FORMING",
  "INSIDE",
  "BREAKOUT_PENDING",
  "BREAKDOWN_PENDING",
  "BREAKOUT_ACCEPTED",
  "BREAKDOWN_ACCEPTED",
  "FALSE_BREAK_HIGH",
  "FALSE_BREAK_LOW",
  "TWO_SIDED_FALSE_BREAK",
  "UNAVAILABLE",
]);
export type SessionOpeningRangeInteractionState = z.infer<
  typeof SessionOpeningRangeInteractionStateSchema
>;

export const SessionOpeningRangeWarningCodeSchema = z.enum([
  "SOURCE_DATA_UNAVAILABLE",
  "OPENING_CANDLE_MISSING",
  "OPENING_RANGE_INCOMPLETE",
  "QUOTE_UNAVAILABLE",
]);
export type SessionOpeningRangeWarningCode = z.infer<
  typeof SessionOpeningRangeWarningCodeSchema
>;

export const SessionOpeningRangeWindowSchema = z
  .object({
    durationMinutes: SessionOpeningRangeDurationSchema,
    metricState: SessionStructureMetricStateSchema,
    phase: OpeningRangePhaseSchema,
    coverageState: CoverageStateSchema,
    isComplete: z.boolean(),
    openingRangeStartAt: z.string().datetime().nullable(),
    openingRangeEndAt: z.string().datetime().nullable(),
    expectedCandleCount: z.number().int().positive().max(6),
    observedCandleCount: z.number().int().nonnegative().max(6),
    high: z.number().finite().positive().nullable(),
    low: z.number().finite().positive().nullable(),
    midpoint: z.number().finite().positive().nullable(),
    pricePosition: SessionOpeningRangePricePositionSchema,
    interactionState: SessionOpeningRangeInteractionStateSchema,
    acceptedBreakoutAt: z.string().datetime().nullable(),
    acceptedBreakdownAt: z.string().datetime().nullable(),
    warningCode: SessionOpeningRangeWarningCodeSchema.nullable(),
  })
  .superRefine((value, ctx) => {
    const hasRange = value.high !== null || value.low !== null || value.midpoint !== null;
    if (hasRange && (value.high === null || value.low === null || value.midpoint === null)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Opening-range High, Low, and Midpoint must be exposed together",
      });
    }
    if (value.metricState !== "UNAVAILABLE" && !hasRange) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Available opening range requires calculated values",
      });
    }
    if (value.metricState === "UNAVAILABLE" && hasRange) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Unavailable opening range cannot expose calculated values",
      });
    }
    if (value.isComplete && value.observedCandleCount !== value.expectedCandleCount) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Complete opening range requires every expected candle",
      });
    }
    if (value.isComplete && value.phase !== "COMPLETE") {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Complete opening range requires COMPLETE phase",
      });
    }
    if (
      (value.openingRangeStartAt === null) !==
      (value.openingRangeEndAt === null)
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Opening-range boundaries must be jointly available or unavailable",
      });
    }
    if (
      value.interactionState === "BREAKOUT_ACCEPTED" &&
      value.acceptedBreakoutAt === null
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Accepted breakout requires its acceptance timestamp",
      });
    }
    if (
      value.interactionState === "BREAKDOWN_ACCEPTED" &&
      value.acceptedBreakdownAt === null
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Accepted breakdown requires its acceptance timestamp",
      });
    }
  });
export type SessionOpeningRangeWindow = z.infer<
  typeof SessionOpeningRangeWindowSchema
>;

export const SpyDeterministicSessionStructureResponseSchema = z.object({
  symbol: z.literal("SPY"),
  product: z.literal("SPY_DETERMINISTIC_SESSION_STRUCTURE"),
  methodologyVersion: SessionStructureMethodologySchema,
  currentMarketDate: MarketDateSchema,
  calculatedAt: z.string().datetime(),
  engineState: SessionStructureEngineStateSchema,
  candleSourceState: QuoteSourceStateSchema,
  quoteSourceState: QuoteSourceStateSchema,
  price: z.number().finite().positive().nullable(),
  quoteTimestamp: z.string().datetime().nullable(),
  dailyPivots: TraditionalPivotSetSchema,
  weeklyPivots: TraditionalPivotSetSchema,
  openingRanges: z.object({
    fiveMinute: SessionOpeningRangeWindowSchema,
    fifteenMinute: SessionOpeningRangeWindowSchema,
    thirtyMinute: SessionOpeningRangeWindowSchema,
  }),
  warnings: z.array(z.string().min(1)),
  methodology: z.object({
    pivotFamily: z.literal("TRADITIONAL"),
    pivotLevels: z.tuple([
      z.literal("P"),
      z.literal("R1"),
      z.literal("S1"),
      z.literal("R2"),
      z.literal("S2"),
    ]),
    dailyPivotSource: z.literal("IMMEDIATE_PREVIOUS_COMPLETE_RTH"),
    weeklyPivotSource: z.literal("PREVIOUS_COMPLETE_NYSE_TRADING_WEEK"),
    openingRangeDurationsMinutes: z.tuple([
      z.literal(5),
      z.literal(15),
      z.literal(30),
    ]),
    openingRangeAcceptanceRule: z.literal("TWO_CONSECUTIVE_COMPLETED_5M_CLOSES"),
    boundedCandleLookbackCalendarDays: z.literal(21),
    exchangeCalendarMethod: z.literal(
      "NYSE_OFFICIAL_PUBLISHED_FULL_DAY_AND_EARLY_CLOSES_2026_2028",
    ),
  }),
  disclosures: z.object({
    deterministicOnly: z.literal(true),
    currentSnapshotOnly: z.literal(true),
    noFutureCandles: z.literal(true),
    traditionalPivotsOnly: z.literal(true),
    supplementalContextOnly: z.literal(true),
    noStandaloneSignals: z.literal(true),
    noPrivateAccountData: z.literal(true),
    noPositionSizing: z.literal(true),
    noOrderExecution: z.literal(true),
  }),
});
export type SpyDeterministicSessionStructureResponse = z.infer<
  typeof SpyDeterministicSessionStructureResponseSchema
>;
