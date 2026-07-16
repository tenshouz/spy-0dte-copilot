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
