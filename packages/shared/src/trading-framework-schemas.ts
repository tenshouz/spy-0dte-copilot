import { z } from "zod";
import { SpyZeroDteTradePlanAssemblyResponseSchema } from "./schemas";

const MarketDateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

export const TradingPolicyVersionSchema = z.literal("TRADING_POLICY_V1");
export type TradingPolicyVersion = z.infer<typeof TradingPolicyVersionSchema>;

export const TradingDirectionSchema = z.enum(["CALLS", "PUTS"]);
export type TradingDirection = z.infer<typeof TradingDirectionSchema>;

export const TradingPolicySchema = z
  .object({
    version: TradingPolicyVersionSchema,
    primaryObjective: z.literal("NET_EXPECTANCY_AFTER_REALISTIC_EXECUTION_COSTS"),
    paperEquivalentAccountDollars: z.literal(1000),
    maximumContractPremiumDollars: z.literal(150),
    maximumPlannedStructuralLossDollars: z.literal(50),
    maximumDailyLossDollars: z.literal(150),
    maximumTradesPerDay: z.literal(3),
    stopAfterConsecutiveLosses: z.literal(2),
    maximumConcurrentPositions: z.literal(1),
    maximumContractsInitially: z.literal(1),
    maximumAttemptsPerSetupDirectionLevel: z.literal(2),
    latestNewEntryEasternTime: z.literal("15:00"),
    normalMandatoryExitEasternTime: z.literal("15:55"),
    absoluteExitDeadlineEasternTime: z.literal("16:00"),
    readyAlertTtlSeconds: z.literal(60),
    timeStopReviewCompletedCandles: z.literal(3),
    timeStopReviewMinutes: z.literal(15),
    preferredContractMoneyness: z.literal("ATM"),
    minimumUnderlyingRewardRiskRatio: z.literal(1.5),
    minimumOptionPremiumRewardRiskRatio: z.literal(1.5),
    preferredRewardRiskRatio: z.literal(2),
    primaryExitTarget: z.literal("TARGET_2"),
    target1Role: z.literal("MANAGEMENT_LEVEL"),
    target3Role: z.literal("RESEARCH_EXTENSION_OBJECTIVE"),
    entryExecutionReference: z.literal("ASK_SIDE"),
    exitExecutionReference: z.literal("BID_SIDE"),
    dailyLossIncludesOpenPlannedRisk: z.literal(true),
    manualEntryConfirmationRequired: z.literal(true),
    manualOverridesRequireReason: z.literal(true),
    unresolvedDirectionalConflictsFailClosed: z.literal(true),
    duplicateSignalsConsolidated: z.literal(true),
    newSetupFamiliesDefaultToShadow: z.literal(true),
    discordActionableOnly: z.literal(true),
    automatedOrderExecution: z.literal(false),
  })
  .strict();
export type TradingPolicy = z.infer<typeof TradingPolicySchema>;

export const SetupFamilyIdSchema = z.enum([
  "OPENING_RANGE_BREAKOUT",
  "VWAP_RECLAIM",
  "VWAP_LOSS",
  "BREAKOUT_RETEST_CONTINUATION",
  "FAILED_BULLISH_BREAK_REVERSAL",
  "FAILED_BEARISH_BREAK_REVERSAL",
  "BULLISH_TREND_PULLBACK",
  "BEARISH_TREND_PULLBACK",
  "BULLISH_CONTINUATION_BASE",
  "BEARISH_CONTINUATION_BASE",
  "RANGE_LOW_MEAN_REVERSION",
  "RANGE_HIGH_MEAN_REVERSION",
  "GAP_AND_GO_CONTINUATION",
  "GAP_FILL_REVERSAL",
]);
export type SetupFamilyId = z.infer<typeof SetupFamilyIdSchema>;

export const SetupPromotionStatusSchema = z.enum([
  "LIVE",
  "SHADOW",
  "DISABLED",
]);
export type SetupPromotionStatus = z.infer<typeof SetupPromotionStatusSchema>;

export const SetupRegistryEntrySchema = z
  .object({
    setupId: SetupFamilyIdSchema,
    displayName: z.string().min(1),
    directionCapability: z.enum(["CALLS", "PUTS", "BOTH"]),
    promotionStatus: SetupPromotionStatusSchema,
    defaultPromotionStatus: SetupPromotionStatusSchema,
    triggerMethod: z.string().min(1),
    stateMachine: z.tuple([
      z.literal("DETECTED"),
      z.literal("ARMED"),
      z.literal("CONFIRMED"),
      z.literal("READY"),
      z.literal("INVALIDATED"),
    ]),
    invalidationMethod: z.string().min(1),
    targetMethod: z.string().min(1),
    analyticsEnabled: z.literal(true),
    canCreateLiveOpportunity: z.boolean(),
    notes: z.array(z.string().min(1)),
  })
  .strict();
export type SetupRegistryEntry = z.infer<typeof SetupRegistryEntrySchema>;

export const SetupRegistryResponseSchema = z
  .object({
    product: z.literal("SPY_ZERO_DTE_MODULAR_SETUP_REGISTRY"),
    methodologyVersion: z.literal("SETUP_REGISTRY_V1"),
    calculatedAt: z.string().datetime(),
    entries: z.array(SetupRegistryEntrySchema).length(14),
    disclosures: z
      .object({
        registryIsVersioned: z.literal(true),
        shadowSetupsCannotCreateAlertsOrPositions: z.literal(true),
        promotionRequiresExplicitCodeChangeAndValidation: z.literal(true),
        noOrderExecution: z.literal(true),
      })
      .strict(),
  })
  .strict();
export type SetupRegistryResponse = z.infer<typeof SetupRegistryResponseSchema>;

export const TradingRestrictionEventTypeSchema = z.enum([
  "CPI",
  "EMPLOYMENT_SITUATION_NFP",
  "FOMC",
  "OTHER_MAJOR",
]);
export type TradingRestrictionEventType = z.infer<
  typeof TradingRestrictionEventTypeSchema
>;

export const TradingRestrictionBlockModeSchema = z.enum([
  "FULL_DAY",
  "WINDOW",
]);
export type TradingRestrictionBlockMode = z.infer<
  typeof TradingRestrictionBlockModeSchema
>;

export const TradingRestrictedEventSchema = z
  .object({
    id: z.string().min(1),
    marketDate: MarketDateSchema,
    eventType: TradingRestrictionEventTypeSchema,
    title: z.string().min(1),
    blockMode: TradingRestrictionBlockModeSchema,
    windowStartAt: z.string().datetime().nullable(),
    windowEndAt: z.string().datetime().nullable(),
    enabled: z.boolean(),
    createdAt: z.string().datetime(),
    updatedAt: z.string().datetime(),
  })
  .strict()
  .superRefine((value, ctx) => {
    if (value.blockMode === "FULL_DAY") {
      if (value.windowStartAt !== null || value.windowEndAt !== null) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "FULL_DAY restriction cannot contain a window",
        });
      }
    } else if (value.windowStartAt === null || value.windowEndAt === null) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "WINDOW restriction requires start and end",
      });
    } else if (
      new Date(value.windowStartAt).getTime() >=
      new Date(value.windowEndAt).getTime()
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Restriction window end must be after start",
      });
    }
  });
export type TradingRestrictedEvent = z.infer<typeof TradingRestrictedEventSchema>;

export const TradingRestrictionEvaluationSchema = z
  .object({
    blocked: z.boolean(),
    primaryReasonCode: z.enum([
      "NO_RESTRICTION",
      "FULL_DAY_EVENT_BLOCK",
      "EVENT_WINDOW_BLOCK",
    ]),
    activeEventIds: z.array(z.string().min(1)),
    activeEventTypes: z.array(TradingRestrictionEventTypeSchema),
  })
  .strict();
export type TradingRestrictionEvaluation = z.infer<
  typeof TradingRestrictionEvaluationSchema
>;

export const TradingRiskLedgerSchema = z
  .object({
    marketDate: MarketDateSchema,
    policyVersion: TradingPolicyVersionSchema,
    realizedPnlDollars: z.number().finite(),
    realizedLossDollars: z.number().finite().nonnegative(),
    openPlannedRiskDollars: z.number().finite().nonnegative(),
    usedDailyLossBudgetDollars: z.number().finite().nonnegative(),
    remainingDailyLossBudgetDollars: z.number().finite().nonnegative(),
    tradeCount: z.number().int().nonnegative(),
    remainingTradeCount: z.number().int().nonnegative(),
    consecutiveLosses: z.number().int().nonnegative(),
    openPositionCount: z.number().int().nonnegative(),
    attemptsForCurrentEpisode: z.number().int().nonnegative(),
    gates: z
      .object({
        dailyLossLimitPassed: z.boolean(),
        tradeCountLimitPassed: z.boolean(),
        consecutiveLossLimitPassed: z.boolean(),
        concurrentPositionLimitPassed: z.boolean(),
        attemptLimitPassed: z.boolean(),
      })
      .strict(),
    entryPermittedByLedger: z.boolean(),
    primaryBlockReasonCode: z
      .enum([
        "DAILY_LOSS_LIMIT_REACHED",
        "TRADE_COUNT_LIMIT_REACHED",
        "CONSECUTIVE_LOSS_LIMIT_REACHED",
        "CONCURRENT_POSITION_LIMIT_REACHED",
        "ATTEMPT_LIMIT_REACHED",
      ])
      .nullable(),
  })
  .strict();
export type TradingRiskLedger = z.infer<typeof TradingRiskLedgerSchema>;

export const SetupLifecycleStateSchema = z.enum([
  "DETECTED",
  "ARMED",
  "CONFIRMED",
  "READY",
  "INVALIDATED",
  "UNAVAILABLE",
]);
export type SetupLifecycleState = z.infer<typeof SetupLifecycleStateSchema>;

export const TradingOpportunityCandidateSchema = z
  .object({
    candidateId: z.string().min(1),
    setupId: SetupFamilyIdSchema,
    setupEpisodeId: z.string().min(1),
    promotionStatus: SetupPromotionStatusSchema,
    direction: TradingDirectionSchema,
    lifecycleState: SetupLifecycleStateSchema,
    source: z.enum(["LEGACY_ASSEMBLY_BRIDGE", "MODULAR_SETUP_ENGINE"]),
    triggerLevel: z.number().finite().positive().nullable(),
    levelType: z.string().min(1),
    invalidationLevel: z.number().finite().positive().nullable(),
    target1Level: z.number().finite().positive().nullable(),
    target2Level: z.number().finite().positive().nullable(),
    target3Level: z.number().finite().positive().nullable(),
    underlyingRewardRiskRatio: z.number().finite().nonnegative().nullable(),
    optionRewardRiskRatio: z.number().finite().nonnegative().nullable(),
    confidenceScore: z.number().finite().min(0).max(100).nullable(),
    selectedContractSymbol: z.string().min(1).nullable(),
    selectedContractAsk: z.number().finite().positive().nullable(),
    selectedContractBid: z.number().finite().nonnegative().nullable(),
    selectedContractStrike: z.number().finite().positive().nullable(),
    selectedContractExpiration: MarketDateSchema.nullable(),
    selectedContractQuoteAt: z.string().datetime().nullable(),
    reasonCodes: z.array(z.string().min(1)),
    warningCodes: z.array(z.string().min(1)),
    liveEligible: z.boolean(),
  })
  .strict();
export type TradingOpportunityCandidate = z.infer<
  typeof TradingOpportunityCandidateSchema
>;

export const TradingOpportunityStateSchema = z.enum([
  "READY",
  "WAITING",
  "BLOCKED",
  "NO_TRADE",
  "NONE",
  "UNAVAILABLE",
]);
export type TradingOpportunityState = z.infer<
  typeof TradingOpportunityStateSchema
>;

export const TradingOpportunitySchema = z
  .object({
    opportunityId: z.string().min(1).nullable(),
    marketDate: MarketDateSchema,
    state: TradingOpportunityStateSchema,
    direction: TradingDirectionSchema.nullable(),
    selectedCandidateId: z.string().min(1).nullable(),
    consolidatedCandidateIds: z.array(z.string().min(1)),
    candidates: z.array(TradingOpportunityCandidateSchema),
    shadowCandidateCount: z.number().int().nonnegative(),
    liveCandidateCount: z.number().int().nonnegative(),
    directionalConflict: z.boolean(),
    primaryReasonCode: z.string().min(1),
    warningCodes: z.array(z.string().min(1)),
    entryCutoffPassed: z.boolean(),
    eventRestriction: TradingRestrictionEvaluationSchema,
    riskLedgerPermitted: z.boolean(),
  })
  .strict();
export type TradingOpportunity = z.infer<typeof TradingOpportunitySchema>;

export const TradingReadyAlertStatusSchema = z.enum([
  "ACTIVE",
  "CONFIRMED",
  "EXPIRED",
  "REVOKED",
]);
export type TradingReadyAlertStatus = z.infer<
  typeof TradingReadyAlertStatusSchema
>;

export const TradingReadyAlertSchema = z
  .object({
    id: z.string().min(1),
    marketDate: MarketDateSchema,
    opportunityId: z.string().min(1),
    setupEpisodeId: z.string().min(1),
    status: TradingReadyAlertStatusSchema,
    issuedAt: z.string().datetime(),
    expiresAt: z.string().datetime(),
    confirmedAt: z.string().datetime().nullable(),
    revokedAt: z.string().datetime().nullable(),
    closedReasonCode: z.string().min(1).nullable(),
  })
  .strict();
export type TradingReadyAlert = z.infer<typeof TradingReadyAlertSchema>;

export const TradingPositionStatusSchema = z.enum([
  "OPEN",
  "CLOSED",
  "CANCELLED",
]);
export type TradingPositionStatus = z.infer<
  typeof TradingPositionStatusSchema
>;

export const TradingPositionExitReasonSchema = z.enum([
  "TARGET_2",
  "STRUCTURAL_STOP",
  "PREMIUM_LOSS_BACKSTOP",
  "TIME_STOP",
  "MANDATORY_1555",
  "ABSOLUTE_1600",
  "MANUAL_DISCRETION",
  "DATA_SAFETY_EXIT",
  "OTHER",
]);
export type TradingPositionExitReason = z.infer<
  typeof TradingPositionExitReasonSchema
>;

export const TradingPositionSchema = z
  .object({
    id: z.string().min(1),
    marketDate: MarketDateSchema,
    policyVersion: TradingPolicyVersionSchema,
    setupId: SetupFamilyIdSchema,
    setupEpisodeId: z.string().min(1),
    opportunityId: z.string().min(1),
    readyAlertId: z.string().min(1).nullable(),
    direction: TradingDirectionSchema,
    status: TradingPositionStatusSchema,
    quantity: z.literal(1),
    contractSymbol: z.string().min(1),
    strikePrice: z.number().finite().positive(),
    expirationDate: MarketDateSchema,
    plannedEntryAsk: z.number().finite().positive(),
    modeledEntryPrice: z.number().finite().positive(),
    actualEntryPrice: z.number().finite().positive(),
    entryUnderlyingPrice: z.number().finite().positive(),
    structuralStopLevel: z.number().finite().positive(),
    target1Level: z.number().finite().positive(),
    target2Level: z.number().finite().positive(),
    target3Level: z.number().finite().positive().nullable(),
    plannedRiskDollars: z.number().finite().positive().max(50),
    openedAt: z.string().datetime(),
    timeStopReviewAt: z.string().datetime(),
    target1TouchedAt: z.string().datetime().nullable(),
    target2TouchedAt: z.string().datetime().nullable(),
    target3TouchedAt: z.string().datetime().nullable(),
    stopTouchedAt: z.string().datetime().nullable(),
    timeStopAlertedAt: z.string().datetime().nullable(),
    mandatoryExitAlertedAt: z.string().datetime().nullable(),
    closedAt: z.string().datetime().nullable(),
    actualExitPrice: z.number().finite().nonnegative().nullable(),
    exitReason: TradingPositionExitReasonSchema.nullable(),
    realizedPnlDollars: z.number().finite().nullable(),
    overrideReason: z.string().min(5).nullable(),
    createdAt: z.string().datetime(),
    updatedAt: z.string().datetime(),
  })
  .strict();
export type TradingPosition = z.infer<typeof TradingPositionSchema>;

export const TradingExecutionModelSchema = z
  .object({
    methodologyVersion: z.literal("EXECUTION_PRICE_MODEL_V1"),
    entryReference: z.literal("ASK"),
    exitReference: z.literal("BID"),
    plannedEntryAsk: z.number().finite().positive().nullable(),
    currentExitBid: z.number().finite().nonnegative().nullable(),
    modeledEntryPrice: z.number().finite().positive().nullable(),
    modeledExitPrice: z.number().finite().nonnegative().nullable(),
    spreadCostDollarsPerContract: z.number().finite().nonnegative().nullable(),
    modeledRoundTripSlippageDollarsPerContract: z
      .number()
      .finite()
      .nonnegative()
      .nullable(),
    commissionAndFeesDollarsPerContract: z.literal(0),
    modeledNetPnlDollarsPerContract: z.number().finite().nullable(),
    disclosures: z
      .object({
        askEntryBidExitIsConservativeBaseline: z.literal(true),
        noGuaranteedFill: z.literal(true),
        noOrderCreated: z.literal(true),
        commissionsNotConfigured: z.literal(true),
      })
      .strict(),
  })
  .strict();
export type TradingExecutionModel = z.infer<
  typeof TradingExecutionModelSchema
>;

export const ExitPolicyComparisonRowSchema = z
  .object({
    policy: z.enum([
      "TARGET_1_EARLY",
      "TARGET_2_PRIMARY",
      "TARGET_3_EXTENSION",
      "TIME_STOP_15M",
      "ACTUAL_USER_EXIT",
    ]),
    sampleSize: z.number().int().nonnegative(),
    winRatePercent: z.number().finite().min(0).max(100).nullable(),
    averageNetPnlDollars: z.number().finite().nullable(),
    netExpectancyDollars: z.number().finite().nullable(),
    totalNetPnlDollars: z.number().finite(),
    insufficientSample: z.boolean(),
  })
  .strict();
export type ExitPolicyComparisonRow = z.infer<
  typeof ExitPolicyComparisonRowSchema
>;

export const ExitPolicyResearchSchema = z
  .object({
    methodologyVersion: z.literal("EXIT_POLICY_RESEARCH_V1"),
    primaryLivePolicy: z.literal("TARGET_2_PRIMARY"),
    rows: z.array(ExitPolicyComparisonRowSchema).length(5),
    disclosures: z
      .object({
        target1IsManagementOnly: z.literal(true),
        target3IsResearchOnly: z.literal(true),
        researchDoesNotChangeLivePolicy: z.literal(true),
        minimumSampleForInterpretation: z.literal(20),
      })
      .strict(),
  })
  .strict();
export type ExitPolicyResearch = z.infer<typeof ExitPolicyResearchSchema>;

export const TradingWorkspaceRuntimeStateSchema = z.enum([
  "ACTIVE",
  "STANDBY",
  "STALE",
  "STOPPED",
  "UNAVAILABLE",
]);
export type TradingWorkspaceRuntimeState = z.infer<
  typeof TradingWorkspaceRuntimeStateSchema
>;

export const TradingWorkspaceResponseSchema = z
  .object({
    symbol: z.literal("SPY"),
    product: z.literal("SPY_ZERO_DTE_TRADING_WORKSPACE"),
    methodologyVersion: z.literal("TRADING_WORKSPACE_V1"),
    calculatedAt: z.string().datetime(),
    currentMarketDate: MarketDateSchema,
    engineState: z.enum(["AVAILABLE", "PARTIAL", "UNAVAILABLE"]),
    primaryReasonCode: z.string().min(1),
    policy: TradingPolicySchema,
    setupRegistry: SetupRegistryResponseSchema,
    restrictionEvents: z.array(TradingRestrictedEventSchema),
    riskLedger: TradingRiskLedgerSchema,
    opportunity: TradingOpportunitySchema,
    activeReadyAlert: TradingReadyAlertSchema.nullable(),
    openPosition: TradingPositionSchema.nullable(),
    recentPositions: z.array(TradingPositionSchema).max(25),
    executionModel: TradingExecutionModelSchema,
    exitPolicyResearch: ExitPolicyResearchSchema,
    automation: z
      .object({
        runtimeState: TradingWorkspaceRuntimeStateSchema,
        lastHeartbeatAt: z.string().datetime().nullable(),
        lastEvaluationAt: z.string().datetime().nullable(),
        lastOutcome: z.string().min(1).nullable(),
        discordOwnership: z.literal("PERSISTENT_BACKEND_ONLY"),
      })
      .strict(),
    sourceAssembly: SpyZeroDteTradePlanAssemblyResponseSchema,
    warnings: z.array(z.string().min(1)),
    disclosures: z
      .object({
        decisionSupportOnly: z.literal(true),
        noAutomatedOrderExecution: z.literal(true),
        manualEntryConfirmationRequired: z.literal(true),
        manualExitConfirmationRequired: z.literal(true),
        shadowSetupsCannotTrade: z.literal(true),
        gammaAndVolatilityRelationshipsResearchOnly: z.literal(true),
        manualOverridesSeparatedFromPureEnginePerformance: z.literal(true),
      })
      .strict(),
  })
  .strict();
export type TradingWorkspaceResponse = z.infer<
  typeof TradingWorkspaceResponseSchema
>;

export const ConfirmTradingEntryRequestSchema = z
  .object({
    readyAlertId: z.string().min(1),
    actualEntryPrice: z.number().finite().positive(),
    note: z.string().max(500).optional(),
  })
  .strict();
export type ConfirmTradingEntryRequest = z.infer<
  typeof ConfirmTradingEntryRequestSchema
>;

export const CloseTradingPositionRequestSchema = z
  .object({
    actualExitPrice: z.number().finite().nonnegative(),
    exitReason: TradingPositionExitReasonSchema,
    note: z.string().max(500).optional(),
  })
  .strict();
export type CloseTradingPositionRequest = z.infer<
  typeof CloseTradingPositionRequestSchema
>;

export const RecordTradingOverrideRequestSchema = z
  .object({
    action: z.enum([
      "ALLOW_ENTRY_DESPITE_BLOCK",
      "CLOSE_POSITION_OUTSIDE_ENGINE",
      "IGNORE_TIME_STOP_REVIEW",
      "OTHER",
    ]),
    reason: z.string().trim().min(5).max(500),
    relatedOpportunityId: z.string().min(1).nullable().optional(),
    relatedPositionId: z.string().min(1).nullable().optional(),
  })
  .strict();
export type RecordTradingOverrideRequest = z.infer<
  typeof RecordTradingOverrideRequestSchema
>;

export const UpsertTradingRestrictedEventRequestSchema = z
  .object({
    marketDate: MarketDateSchema,
    eventType: TradingRestrictionEventTypeSchema,
    title: z.string().trim().min(1).max(120),
    blockMode: TradingRestrictionBlockModeSchema,
    windowStartAt: z.string().datetime().nullable().optional(),
    windowEndAt: z.string().datetime().nullable().optional(),
    enabled: z.boolean().default(true),
  })
  .strict()
  .superRefine((value, ctx) => {
    const start = value.windowStartAt ?? null;
    const end = value.windowEndAt ?? null;
    if (value.blockMode === "FULL_DAY" && (start !== null || end !== null)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "FULL_DAY event cannot contain window timestamps",
      });
    }
    if (value.blockMode === "WINDOW") {
      if (start === null || end === null) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "WINDOW event requires both timestamps",
        });
      } else if (new Date(start).getTime() >= new Date(end).getTime()) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "Event window end must be after start",
        });
      }
    }
    if (
      ["CPI", "EMPLOYMENT_SITUATION_NFP", "FOMC"].includes(value.eventType) &&
      value.blockMode !== "FULL_DAY"
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "CPI, Employment Situation/NFP, and FOMC must be full-day blocks",
      });
    }
  });
export type UpsertTradingRestrictedEventRequest = z.infer<
  typeof UpsertTradingRestrictedEventRequestSchema
>;

export const TradingWorkspaceActionResponseSchema = z
  .object({
    product: z.literal("SPY_ZERO_DTE_TRADING_WORKSPACE_ACTION"),
    methodologyVersion: z.literal("TRADING_WORKSPACE_ACTION_V1"),
    actionState: z.enum(["COMPLETED", "REJECTED", "UNAVAILABLE"]),
    primaryReasonCode: z.string().min(1),
    calculatedAt: z.string().datetime(),
    position: TradingPositionSchema.nullable(),
    readyAlert: TradingReadyAlertSchema.nullable(),
    workspace: TradingWorkspaceResponseSchema.nullable(),
  })
  .strict();
export type TradingWorkspaceActionResponse = z.infer<
  typeof TradingWorkspaceActionResponseSchema
>;
