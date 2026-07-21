import { z } from "zod";
import {
  DeterministicScheduledReportPlanSnapshotSchema,
  DeterministicScheduledReportSourceAssemblySummarySchema,
  ExposureStructureGammaRegimeSchema,
  TradeSetupTypeSchema,
} from "./schemas";

const MarketDateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

export const PointInTimeBacktestMethodologyVersionSchema = z.literal(
  "POINT_IN_TIME_BACKTEST_V1",
);
export type PointInTimeBacktestMethodologyVersion = z.infer<
  typeof PointInTimeBacktestMethodologyVersionSchema
>;

export const PointInTimeBacktestEngineStateSchema = z.enum([
  "AVAILABLE",
  "UNAVAILABLE",
]);
export type PointInTimeBacktestEngineState = z.infer<
  typeof PointInTimeBacktestEngineStateSchema
>;

export const PointInTimeBacktestPrimaryReasonCodeSchema = z.enum([
  "BACKTEST_COMPLETE",
  "BACKTEST_EMPTY",
  "BACKTEST_RUN_NOT_FOUND",
  "BACKTEST_SOURCE_LIMIT_EXCEEDED",
  "DATABASE_NOT_CONFIGURED",
  "DATABASE_UNAVAILABLE",
]);
export type PointInTimeBacktestPrimaryReasonCode = z.infer<
  typeof PointInTimeBacktestPrimaryReasonCodeSchema
>;

export const PointInTimeBacktestRunIdSchema = z.string().min(1).max(128);
export type PointInTimeBacktestRunId = z.infer<
  typeof PointInTimeBacktestRunIdSchema
>;

export const PointInTimeBacktestRunRequestSchema = z
  .object({
    startMarketDate: MarketDateSchema.nullable(),
    endMarketDate: MarketDateSchema.nullable(),
    maximumHoldMinutes: z.number().int().min(5).max(390),
  })
  .strict()
  .superRefine((value, ctx) => {
    if (
      value.startMarketDate !== null &&
      value.endMarketDate !== null &&
      value.startMarketDate > value.endMarketDate
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Backtest start date cannot be after end date",
        path: ["startMarketDate"],
      });
    }

    if (value.startMarketDate !== null && value.endMarketDate !== null) {
      const start = Date.parse(`${value.startMarketDate}T00:00:00.000Z`);
      const end = Date.parse(`${value.endMarketDate}T00:00:00.000Z`);
      if (Math.floor((end - start) / 86_400_000) > 366) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "Backtest date range cannot exceed 366 calendar days",
          path: ["endMarketDate"],
        });
      }
    }
  });
export type PointInTimeBacktestRunRequest = z.infer<
  typeof PointInTimeBacktestRunRequestSchema
>;

export const PointInTimeBacktestOutcomeStateSchema = z.enum([
  "TARGET_FIRST",
  "STOP_FIRST",
  "AMBIGUOUS_SAME_CANDLE",
  "TIMEOUT",
  "SESSION_END",
  "INSUFFICIENT_FUTURE_DATA",
]);
export type PointInTimeBacktestOutcomeState = z.infer<
  typeof PointInTimeBacktestOutcomeStateSchema
>;

export const PointInTimeBacktestOptionOutcomeStateSchema = z.enum([
  "OBSERVED_EXIT_QUOTE_ESTIMATE",
  "MODEL_SCENARIO_ESTIMATE",
  "UNAVAILABLE",
]);
export type PointInTimeBacktestOptionOutcomeState = z.infer<
  typeof PointInTimeBacktestOptionOutcomeStateSchema
>;

export const PointInTimeBacktestIssueCodeSchema = z.enum([
  "SOURCE_MARKET_STATE_INVALID",
  "SOURCE_OPTIONS_CHAIN_INVALID",
  "SOURCE_TIMESTAMP_AFTER_CYCLE",
  "RECOMPUTED_ASSEMBLY_INVALID",
  "NO_USABLE_PRICE_OBSERVATIONS",
]);
export type PointInTimeBacktestIssueCode = z.infer<
  typeof PointInTimeBacktestIssueCodeSchema
>;

export const PointInTimeBacktestIssueSchema = z
  .object({
    decisionCycleId: z.string().min(1),
    marketDate: MarketDateSchema,
    issueCode: PointInTimeBacktestIssueCodeSchema,
    message: z.string().min(1).max(320),
  })
  .strict();
export type PointInTimeBacktestIssue = z.infer<
  typeof PointInTimeBacktestIssueSchema
>;

export const PointInTimeBacktestEpisodeSchema = z
  .object({
    episodeId: z.string().min(1),
    sourceDecisionCycleId: z.string().min(1),
    marketDate: MarketDateSchema,
    setupType: TradeSetupTypeSchema.nullable(),
    direction: z.enum(["CALLS", "PUTS"]),
    sourceAssembly: DeterministicScheduledReportSourceAssemblySummarySchema,
    planSnapshot: DeterministicScheduledReportPlanSnapshotSchema,
    entryAt: z.string().datetime(),
    entryPrice: z.number().finite().positive(),
    triggerLevel: z.number().finite().positive().nullable(),
    invalidationLevel: z.number().finite().positive(),
    objectiveLevel: z.number().finite().positive(),
    riskDistancePoints: z.number().finite().positive(),
    rewardDistancePoints: z.number().finite().positive(),
    plannedRewardRiskRatio: z.number().finite().nonnegative(),
    selectedContractSymbol: z.string().min(1).nullable(),
    entryPremiumAsk: z.number().finite().positive().nullable(),
    entryPremiumMidpoint: z.number().finite().positive().nullable(),
    outcomeState: PointInTimeBacktestOutcomeStateSchema,
    resolvedAt: z.string().datetime().nullable(),
    durationMinutes: z.number().finite().nonnegative().nullable(),
    exitUnderlyingPrice: z.number().finite().positive().nullable(),
    targetHitAt: z.string().datetime().nullable(),
    stopHitAt: z.string().datetime().nullable(),
    maximumFavorableExcursionPoints: z.number().finite().nonnegative(),
    maximumAdverseExcursionPoints: z.number().finite().nonnegative(),
    realizedUnderlyingPoints: z.number().finite().nullable(),
    realizedRMultiple: z.number().finite().nullable(),
    exitPremiumBid: z.number().finite().nonnegative().nullable(),
    estimatedOptionPnlPerContract: z.number().finite().nullable(),
    optionOutcomeState: PointInTimeBacktestOptionOutcomeStateSchema,
    gammaRegime: ExposureStructureGammaRegimeSchema.nullable(),
    nearestGammaCliffDistancePoints: z.number().finite().nullable(),
    executionAlignmentScore: z.number().finite().min(0).max(100).nullable(),
  })
  .strict();
export type PointInTimeBacktestEpisode = z.infer<
  typeof PointInTimeBacktestEpisodeSchema
>;

export const PointInTimeBacktestBreakdownSchema = z
  .object({
    dimension: z.enum(["SETUP", "DIRECTION", "GAMMA_REGIME"]),
    bucket: z.string().min(1).max(120),
    episodeCount: z.number().int().nonnegative(),
    targetFirstCount: z.number().int().nonnegative(),
    stopFirstCount: z.number().int().nonnegative(),
    ambiguousCount: z.number().int().nonnegative(),
    timeoutCount: z.number().int().nonnegative(),
    insufficientCount: z.number().int().nonnegative(),
    resolvedDirectionalCount: z.number().int().nonnegative(),
    winRatePercent: z.number().finite().min(0).max(100).nullable(),
    averageRMultiple: z.number().finite().nullable(),
  })
  .strict();
export type PointInTimeBacktestBreakdown = z.infer<
  typeof PointInTimeBacktestBreakdownSchema
>;

export const PointInTimeBacktestSummarySchema = z
  .object({
    episodeCount: z.number().int().nonnegative(),
    targetFirstCount: z.number().int().nonnegative(),
    stopFirstCount: z.number().int().nonnegative(),
    ambiguousCount: z.number().int().nonnegative(),
    timeoutCount: z.number().int().nonnegative(),
    sessionEndCount: z.number().int().nonnegative(),
    insufficientFutureDataCount: z.number().int().nonnegative(),
    resolvedDirectionalCount: z.number().int().nonnegative(),
    winRatePercent: z.number().finite().min(0).max(100).nullable(),
    averageRMultiple: z.number().finite().nullable(),
    totalEstimatedOptionPnlDollars: z.number().finite().nullable(),
    averageMaximumFavorableExcursionPoints: z
      .number()
      .finite()
      .nonnegative()
      .nullable(),
    averageMaximumAdverseExcursionPoints: z
      .number()
      .finite()
      .nonnegative()
      .nullable(),
  })
  .strict();
export type PointInTimeBacktestSummary = z.infer<
  typeof PointInTimeBacktestSummarySchema
>;

export const PointInTimeBacktestSourceSummarySchema = z
  .object({
    decisionCycleCount: z.number().int().nonnegative().max(5000),
    validMarketStateCount: z.number().int().nonnegative().max(5000),
    optionsChainSnapshotCount: z.number().int().nonnegative().max(5000),
    marketDateCount: z.number().int().nonnegative().max(367),
    dataStartMarketDate: MarketDateSchema.nullable(),
    dataEndMarketDate: MarketDateSchema.nullable(),
    sourceProduct: z.literal(
      "FORWARD_CAPTURED_DETERMINISTIC_DECISION_CYCLES",
    ),
    historicalOptionsDatasetConnected: z.literal(false),
  })
  .strict();
export type PointInTimeBacktestSourceSummary = z.infer<
  typeof PointInTimeBacktestSourceSummarySchema
>;

export const PointInTimeBacktestMethodologySchema = z
  .object({
    replayClock: z.literal("SOURCE_CALCULATED_AT"),
    planRecomputation: z.literal(
      "CURRENT_DETERMINISTIC_ENGINE_FROM_STORED_MARKET_STATE",
    ),
    entryPolicy: z.literal("FIRST_READY_PER_UNIQUE_PLAN_SIGNATURE"),
    fillPolicy: z.literal("UNDERLYING_AT_CAPTURE_AND_OPTION_AT_ASK"),
    targetStopPolicy: z.literal("FUTURE_COMPLETED_5M_OHLC_FIRST_TOUCH"),
    sameCandlePolicy: z.literal("AMBIGUOUS_NO_ASSUMED_ORDER"),
    optionExitPolicy: z.literal(
      "NEXT_OBSERVED_BID_OR_STORED_MODEL_SCENARIO",
    ),
    futureCoveragePolicy: z.literal(
      "REQUIRE_HOLD_BOUNDARY_OR_SESSION_END",
    ),
    maximumHoldMinutes: z.number().int().min(5).max(390),
  })
  .strict();
export type PointInTimeBacktestMethodology = z.infer<
  typeof PointInTimeBacktestMethodologySchema
>;

export const PointInTimeBacktestRunPayloadSchema = z
  .object({
    id: PointInTimeBacktestRunIdSchema,
    createdAt: z.string().datetime(),
    request: PointInTimeBacktestRunRequestSchema,
    source: PointInTimeBacktestSourceSummarySchema,
    summary: PointInTimeBacktestSummarySchema,
    breakdowns: z.array(PointInTimeBacktestBreakdownSchema).max(200),
    episodes: z.array(PointInTimeBacktestEpisodeSchema).max(1000),
    issues: z.array(PointInTimeBacktestIssueSchema).max(500),
    issuesTruncated: z.boolean(),
    methodology: PointInTimeBacktestMethodologySchema,
  })
  .strict();
export type PointInTimeBacktestRunPayload = z.infer<
  typeof PointInTimeBacktestRunPayloadSchema
>;

export const PointInTimeBacktestDisclosuresSchema = z
  .object({
    forwardCapturedDataOnly: z.literal(true),
    historicalOptionsDatasetConnected: z.literal(false),
    noLookahead: z.literal(true),
    currentRulesRecomputedAtHistoricalBoundary: z.literal(true),
    completedFiveMinuteCandlesOnly: z.literal(true),
    sameCandleOrderNotAssumed: z.literal(true),
    observedOptionExitQuotesMayLagTouch: z.literal(true),
    modelOptionOutcomesAreEstimates: z.literal(true),
    incompleteFutureCoverageIsNotTimeout: z.literal(true),
    noTradingRecommendation: z.literal(true),
    noOrderExecution: z.literal(true),
  })
  .strict();
export type PointInTimeBacktestDisclosures = z.infer<
  typeof PointInTimeBacktestDisclosuresSchema
>;

export const PointInTimeBacktestRunResponseSchema = z
  .object({
    product: z.literal("SPY_POINT_IN_TIME_BACKTEST"),
    methodologyVersion: PointInTimeBacktestMethodologyVersionSchema,
    calculatedAt: z.string().datetime(),
    engineState: PointInTimeBacktestEngineStateSchema,
    primaryReasonCode: PointInTimeBacktestPrimaryReasonCodeSchema,
    run: PointInTimeBacktestRunPayloadSchema.nullable(),
    disclosures: PointInTimeBacktestDisclosuresSchema,
  })
  .strict();
export type PointInTimeBacktestRunResponse = z.infer<
  typeof PointInTimeBacktestRunResponseSchema
>;

export const PointInTimeBacktestRunSummarySchema = z
  .object({
    id: PointInTimeBacktestRunIdSchema,
    createdAt: z.string().datetime(),
    startMarketDate: MarketDateSchema.nullable(),
    endMarketDate: MarketDateSchema.nullable(),
    maximumHoldMinutes: z.number().int().min(5).max(390),
    decisionCycleCount: z.number().int().nonnegative(),
    episodeCount: z.number().int().nonnegative(),
    targetFirstCount: z.number().int().nonnegative(),
    stopFirstCount: z.number().int().nonnegative(),
    winRatePercent: z.number().finite().min(0).max(100).nullable(),
    averageRMultiple: z.number().finite().nullable(),
  })
  .strict();
export type PointInTimeBacktestRunSummary = z.infer<
  typeof PointInTimeBacktestRunSummarySchema
>;

export const PointInTimeBacktestHistoryResponseSchema = z
  .object({
    product: z.literal("SPY_POINT_IN_TIME_BACKTEST_HISTORY"),
    methodologyVersion: PointInTimeBacktestMethodologyVersionSchema,
    calculatedAt: z.string().datetime(),
    engineState: PointInTimeBacktestEngineStateSchema,
    primaryReasonCode: z.enum([
      "BACKTEST_HISTORY_AVAILABLE",
      "BACKTEST_HISTORY_EMPTY",
      "DATABASE_NOT_CONFIGURED",
      "DATABASE_UNAVAILABLE",
    ]),
    maximumEntries: z.literal(50),
    runs: z.array(PointInTimeBacktestRunSummarySchema).max(50),
    disclosures: PointInTimeBacktestDisclosuresSchema,
  })
  .strict();
export type PointInTimeBacktestHistoryResponse = z.infer<
  typeof PointInTimeBacktestHistoryResponseSchema
>;
