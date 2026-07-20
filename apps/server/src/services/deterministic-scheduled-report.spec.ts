/**
 * Deterministic tests for SCHEDULED_REPORT_V2 with V1 compatibility retained in shared contracts.
 * Run: npx --no-install tsx apps/server/src/services/deterministic-scheduled-report.spec.ts
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  DeterministicScheduledReportRequestSchema,
  SpyZeroDteDeterministicScheduledReportResponseSchema,
  type DeterministicScheduledReportType,
  type DeterministicTradePlanState,
  type SpyZeroDteTradePlanAssemblyResponse,
} from "@spy-copilot/shared";
import { buildSpyZeroDteDeterministicScheduledReport } from "./deterministic-scheduled-report.logic";
import { getSpyZeroDteDeterministicScheduledReportWithDependencies } from "./deterministic-scheduled-report.service";

const MARKET_DATE = "2026-07-20";
const ASSEMBLED_AT = "2026-07-20T14:30:00.000Z";
const GENERATED_AT_MS = Date.parse("2026-07-20T14:30:01.000Z");

function baseAssembly(
  overrides: Partial<SpyZeroDteTradePlanAssemblyResponse> = {},
): SpyZeroDteTradePlanAssemblyResponse {
  const value = {
    symbol: "SPY",
    product: "SPY_ZERO_DTE_DETERMINISTIC_TRADE_PLAN_ASSEMBLY",
    methodologyVersion: "ASSEMBLY_V2",
    currentMarketDate: MARKET_DATE,
    mostRecentRthSessionDate: "2026-07-17",
    calculatedAt: ASSEMBLED_AT,
    engineState: "AVAILABLE",
    planState: "READY",
    direction: "CALLS",
    primaryReasonCode: "TRADE_PLAN_READY",
    warningCode: null,
    planConfidence: {
      methodologyVersion: "EXPOSURE_CONFIRMATION_V1",
      structuralConfidenceScore: 82,
      exposureAdjustmentPoints: 8,
      adjustedConfidenceScore: 90,
      scope: "STRUCTURAL_PLUS_SOFT_EXPOSURE_CONFIRMATION",
    },
    exposureConfirmation: {
      methodologyVersion: "EXPOSURE_CONFIRMATION_V1",
      evaluatedDirection: "CALLS",
      state: "SUPPORTIVE",
      sourceQuality: "COMPLETE",
      baseStructuralConfidenceScore: 82,
      adjustmentPoints: 8,
      adjustedConfidenceScore: 90,
      supportiveComponentCount: 1,
      conflictingComponentCount: 0,
      neutralComponentCount: 2,
      unavailableComponentCount: 0,
      nearbyWallThresholdPercent: 1,
      primaryDirectionalWall: null,
      components: [
        {
          componentId: "GEX_REGIME",
          status: "SUPPORTIVE",
          rawState: "CALL_DOMINANT",
          contributionPoints: 8,
          maximumAbsoluteContributionPoints: 8,
          sourceQuality: "COMPLETE",
          reasonCode: "CALL_GEX_SUPPORTS_CALLS",
        },
        {
          componentId: "DEX_REGIME",
          status: "NEUTRAL",
          rawState: "BALANCED",
          contributionPoints: 0,
          maximumAbsoluteContributionPoints: 6,
          sourceQuality: "COMPLETE",
          reasonCode: "DEX_BALANCED",
        },
        {
          componentId: "DIRECTIONAL_WALL",
          status: "NEUTRAL",
          rawState: "650",
          contributionPoints: 0,
          maximumAbsoluteContributionPoints: 4,
          sourceQuality: "COMPLETE",
          reasonCode: "DIRECTIONAL_WALL_NOT_NEARBY",
        },
      ],
      warnings: [],
      disclosures: {
        softConfirmationOnly: true,
        cannotCreateDirection: true,
        cannotBlockEligibility: true,
        returnedWindowOnly: true,
        openInterestMayBeStaleIntraday: true,
        notObservedDealerInventory: true,
        directionalWallIsContextNotTarget: true,
        noPrivateAccountData: true,
        noPositionSizing: true,
        noOrderExecution: true,
      },
    },
    currentPrice: 640.25,
    priceSource: "QUOTE_LAST_PRICE",
    quoteTimestamp: "2026-07-20T14:29:59.000Z",
    sessionPhase: "RTH",
    bias: {
      biasState: "BULLISH",
      confidenceScore: 82,
      confidenceUnit: "PERCENT",
      confidenceScope: "STRUCTURAL_EVIDENCE_ONLY",
      sourceQualityState: "COMPLETE",
      minimumUsableDirectionalEvidenceCount: 2,
      usableDirectionalEvidenceCount: 5,
      applicableDirectionalEvidenceCount: 5,
      bullishEvidenceCount: 4,
      bearishEvidenceCount: 0,
      neutralEvidenceCount: 1,
      unavailableDirectionalEvidenceCount: 0,
      notApplicableDirectionalEvidenceCount: 0,
    },
    entryCondition: {
      state: "SATISFIED",
      planningReferenceType: "CURRENT_PRICE",
      planningReferencePrice: 640.25,
      currentPrice: 640.25,
      triggerLevel: 640,
      comparison: "PRICE_GREATER_THAN",
      triggerSatisfied: true,
      signedDistancePoints: 0.25,
      sourceFeatureIds: ["PRICE_VS_VWAP", "PRICE_VS_OPENING_RANGE"],
      sourceValues: { vwap: 639.5, openingRangeBoundary: 640 },
      disclosureCode: "PLANNING_REFERENCE_ONLY",
    },
    structuralInvalidation: {
      candidateId: "INVALIDATION_CURRENT_RTH_VWAP",
      levelType: "CURRENT_RTH_VWAP",
      levelSemantic: "STRUCTURAL_LEVEL",
      level: 639.5,
      riskDistancePoints: 0.75,
      sourceFeatureId: "PRICE_VS_VWAP",
      sourceComponents: ["VWAP"],
      referenceDate: MARKET_DATE,
      referenceDateRelation: "CURRENT_MARKET_DATE",
      distanceRank: 1,
      disclosureCode: "STRUCTURAL_INVALIDATION_REFERENCE_ONLY",
    },
    primaryObjective: {
      candidateId: "OBJECTIVE_PREVIOUS_DAY_HIGH",
      levelType: "PREVIOUS_DAY_HIGH",
      levelSemantic: "STRUCTURAL_LEVEL",
      level: 642,
      objectiveDistancePoints: 1.75,
      rewardRiskRatio: 2.3333333333,
      minimumRewardRiskRatio: 2,
      qualificationStatus: "QUALIFIED",
      sourceFeatureId: "PRICE_VS_PRIOR_DAY_RANGE",
      sourceComponents: ["SESSION_LEVELS"],
      referenceDate: "2026-07-17",
      referenceDateRelation: "PREVIOUS_RTH_SESSION",
      distanceRank: 1,
      disclosureCode: "UNDERLYING_OBJECTIVE_REFERENCE_ONLY",
    },
    underlyingRiskReward: {
      riskDistancePoints: 0.75,
      rewardDistancePoints: 1.75,
      rewardRiskRatio: 2.3333333333,
      minimumRequiredRewardRiskRatio: 2,
      qualification: "QUALIFIED",
      calculationUnit: "SPY_UNDERLYING_PRICE_POINTS",
    },
    selectedContract: {
      candidateId: "SPY_CALL_640",
      contractSymbol: "SPY   260720C00640000",
      contractDirection: "CALL",
      description: "SPY 07/20/2026 640 Call",
      strikePrice: 640,
      expirationDate: MARKET_DATE,
      nonStandard: false,
      mini: false,
      multiplier: 100,
      moneyness: "ATM",
      bid: 1.2,
      ask: 1.25,
      calculatedMidpoint: 1.225,
      providerMark: 1.23,
      spreadPoints: 0.05,
      spreadRatio: 0.04,
      spreadPercent: 4,
      bidSize: 120,
      askSize: 110,
      openInterest: 4500,
      volume: 8200,
      delta: 0.51,
      gamma: 0.08,
      theta: -0.12,
      vega: 0.03,
      rho: 0,
      impliedVolatilityPercent: 22,
      quoteAt: "2026-07-20T14:29:59.000Z",
      tradeAt: "2026-07-20T14:29:58.000Z",
      quoteAgeMilliseconds: 1000,
      quoteFreshnessState: "FRESH",
      strikeDistancePoints: 0.25,
      selectionRank: 1,
    },
    premiumReference: {
      type: "CALCULATED_BID_ASK_MIDPOINT",
      value: 1.225,
      disclosureCode: "MIDPOINT_REFERENCE_ONLY",
    },
    sourceSummary: {
      risk: {
        riskQualification: "QUALIFIED",
      },
      contract: {
        selectionState: "SELECTED",
      },
    },
  } as unknown as SpyZeroDteTradePlanAssemblyResponse;

  return { ...value, ...overrides };
}

function assemblyForState(
  planState: DeterministicTradePlanState,
): SpyZeroDteTradePlanAssemblyResponse {
  const base = baseAssembly();
  if (planState === "READY") return base;
  if (planState === "WAITING_FOR_TRIGGER") {
    return {
      ...base,
      planState,
      primaryReasonCode: "TRADE_PLAN_WAITING_FOR_TRIGGER",
      entryCondition: {
        ...base.entryCondition,
        state: "WAITING",
        planningReferenceType: "TRIGGER_LEVEL",
        planningReferencePrice: 641,
        triggerLevel: 641,
        triggerSatisfied: false,
      },
      selectedContract: emptySelectedContract(base),
      premiumReference: unavailablePremium(),
      sourceSummary: {
        ...base.sourceSummary,
        risk: { ...base.sourceSummary.risk, riskQualification: "QUALIFIED" },
        contract: { ...base.sourceSummary.contract, selectionState: "DEFERRED" },
      },
    };
  }
  if (planState === "NO_QUALIFIED_CONTRACT") {
    return {
      ...base,
      planState,
      primaryReasonCode: "TRADE_PLAN_NO_QUALIFIED_CONTRACT",
      selectedContract: emptySelectedContract(base),
      premiumReference: unavailablePremium(),
      sourceSummary: {
        ...base.sourceSummary,
        contract: {
          ...base.sourceSummary.contract,
          selectionState: "NO_QUALIFIED_CONTRACT",
        },
      },
    };
  }
  if (planState === "NOT_QUALIFIED") {
    return {
      ...base,
      planState,
      primaryReasonCode: "TRADE_PLAN_NOT_QUALIFIED",
      underlyingRiskReward: {
        ...base.underlyingRiskReward,
        rewardRiskRatio: 1.25,
        qualification: "NOT_QUALIFIED",
      },
      selectedContract: emptySelectedContract(base),
      premiumReference: unavailablePremium(),
      sourceSummary: {
        ...base.sourceSummary,
        risk: {
          ...base.sourceSummary.risk,
          riskQualification: "NOT_QUALIFIED",
        },
        contract: {
          ...base.sourceSummary.contract,
          selectionState: "NOT_APPLICABLE",
        },
      },
    };
  }
  if (planState === "NO_SETUP" || planState === "NOT_APPLICABLE") {
    return {
      ...base,
      planState,
      direction: "NONE",
      primaryReasonCode:
        planState === "NO_SETUP"
          ? "TRADE_PLAN_NO_SETUP"
          : "TRADE_PLAN_NOT_APPLICABLE",
      entryCondition: {
        ...base.entryCondition,
        state: "NOT_APPLICABLE",
        planningReferenceType: "UNAVAILABLE",
        planningReferencePrice: null,
        triggerLevel: null,
        comparison: null,
        triggerSatisfied: null,
      },
      selectedContract: emptySelectedContract(base),
      premiumReference: unavailablePremium(),
      sourceSummary: {
        ...base.sourceSummary,
        risk: {
          ...base.sourceSummary.risk,
          riskQualification: "NOT_APPLICABLE",
        },
        contract: {
          ...base.sourceSummary.contract,
          selectionState: "NOT_APPLICABLE",
        },
      },
    };
  }
  return {
    ...base,
    engineState: "UNAVAILABLE",
    planState: "UNAVAILABLE",
    direction: "UNAVAILABLE",
    primaryReasonCode: "TRADE_PLAN_UNAVAILABLE",
    warningCode: "ASSEMBLY_VALIDATION_FAILED",
    bias: {
      ...base.bias,
      biasState: "UNAVAILABLE",
      confidenceScore: null,
      sourceQualityState: "UNAVAILABLE",
    },
    entryCondition: {
      ...base.entryCondition,
      state: "UNAVAILABLE",
      planningReferenceType: "UNAVAILABLE",
      planningReferencePrice: null,
      triggerLevel: null,
      comparison: null,
      triggerSatisfied: null,
    },
    selectedContract: emptySelectedContract(base),
    premiumReference: unavailablePremium(),
    sourceSummary: {
      ...base.sourceSummary,
      risk: { ...base.sourceSummary.risk, riskQualification: "UNAVAILABLE" },
      contract: { ...base.sourceSummary.contract, selectionState: "UNAVAILABLE" },
    },
  };
}

function emptySelectedContract(base: SpyZeroDteTradePlanAssemblyResponse) {
  return Object.fromEntries(
    Object.keys(base.selectedContract).map((key) => [key, null]),
  ) as SpyZeroDteTradePlanAssemblyResponse["selectedContract"];
}

function unavailablePremium() {
  return {
    type: "UNAVAILABLE" as const,
    value: null,
    disclosureCode: "MIDPOINT_REFERENCE_ONLY" as const,
  };
}

let passed = 0;
let failed = 0;
async function test(name: string, fn: () => void | Promise<void>) {
  try {
    await fn();
    passed += 1;
    console.log(`✓ ${name}`);
  } catch (error) {
    failed += 1;
    console.error(`✗ ${name}`);
    console.error(error);
  }
}

async function main() {
  await test("strict request accepts all four scheduled report types", () => {
    const types: DeterministicScheduledReportType[] = [
      "PREMARKET_0925",
      "OPENING_0935",
      "OPENING_0945",
      "UPDATE_1000",
    ];
    for (const reportType of types) {
      assert.equal(
        DeterministicScheduledReportRequestSchema.parse({ reportType }).reportType,
        reportType,
      );
    }
  });

  await test("strict request rejects unknown keys", () => {
    assert.equal(
      DeterministicScheduledReportRequestSchema.safeParse({
        reportType: "PREMARKET_0925",
        persist: true,
      }).success,
      false,
    );
  });

  await test("each report type has its fixed Eastern schedule reference", () => {
    const expected = new Map<DeterministicScheduledReportType, string>([
      ["PREMARKET_0925", "09:25"],
      ["OPENING_0935", "09:35"],
      ["OPENING_0945", "09:45"],
      ["UPDATE_1000", "10:00"],
    ]);
    for (const [reportType, time] of expected) {
      const result = buildSpyZeroDteDeterministicScheduledReport(
        { reportType },
        baseAssembly(),
        GENERATED_AT_MS,
      );
      assert.equal(result.scheduleReferenceEasternTime, time);
    }
  });

  await test("READY Assembly produces a READY report", () => {
    const result = buildSpyZeroDteDeterministicScheduledReport(
      { reportType: "OPENING_0935" },
      baseAssembly(),
      GENERATED_AT_MS,
    );
    assert.equal(result.reportState, "READY");
  assert.equal(result.sourceAssembly.confidenceScore, 90);
  assert.match(result.checklist[1]?.message ?? "", /soft GEX\/DEX confirmation is supportive/);
    assert.equal(result.primaryReasonCode, "READY_PLAN_SUMMARY");
    assert.equal(result.plan.selectedContract.contractSymbol, "SPY   260720C00640000");
  });

  const informationalStates: Array<[
    DeterministicTradePlanState,
    string,
  ]> = [
    ["WAITING_FOR_TRIGGER", "WAITING_FOR_TRIGGER_SUMMARY"],
    ["NO_QUALIFIED_CONTRACT", "NO_QUALIFIED_CONTRACT_SUMMARY"],
    ["NOT_QUALIFIED", "NOT_QUALIFIED_SUMMARY"],
    ["NO_SETUP", "NO_SETUP_SUMMARY"],
    ["NOT_APPLICABLE", "NOT_APPLICABLE_SUMMARY"],
  ];
  for (const [planState, reason] of informationalStates) {
    await test(`${planState} produces an informational report`, () => {
      const result = buildSpyZeroDteDeterministicScheduledReport(
        { reportType: "UPDATE_1000" },
        assemblyForState(planState),
        GENERATED_AT_MS,
      );
      assert.equal(result.reportState, "INFORMATIONAL");
      assert.equal(result.primaryReasonCode, reason);
    });
  }

  await test("UNAVAILABLE Assembly produces an unavailable report", () => {
    const result = buildSpyZeroDteDeterministicScheduledReport(
      { reportType: "PREMARKET_0925" },
      assemblyForState("UNAVAILABLE"),
      GENERATED_AT_MS,
    );
    assert.equal(result.reportState, "UNAVAILABLE");
    assert.equal(result.primaryReasonCode, "SOURCE_ASSEMBLY_UNAVAILABLE");
  });

  await test("report copies deterministic planning references exactly", () => {
    const assembly = baseAssembly();
    const result = buildSpyZeroDteDeterministicScheduledReport(
      { reportType: "OPENING_0945" },
      assembly,
      GENERATED_AT_MS,
    );
    assert.deepEqual(result.plan.entryCondition, assembly.entryCondition);
    assert.deepEqual(result.plan.structuralInvalidation, assembly.structuralInvalidation);
    assert.deepEqual(result.plan.primaryObjective, assembly.primaryObjective);
    assert.deepEqual(result.plan.underlyingRiskReward, assembly.underlyingRiskReward);
  });

  await test("report checklist is fixed and complete", () => {
    const result = buildSpyZeroDteDeterministicScheduledReport(
      { reportType: "OPENING_0935" },
      baseAssembly(),
      GENERATED_AT_MS,
    );
    assert.deepEqual(
      result.checklist.map((item) => item.code),
      [
        "SOURCE_ASSEMBLY",
        "BIAS_EVIDENCE",
        "ENTRY_CONDITION",
        "RISK_FRAMEWORK",
        "CONTRACT_SELECTION",
      ],
    );
  });

  await test("Assembly warning is retained as sanitized report metadata", () => {
    const result = buildSpyZeroDteDeterministicScheduledReport(
      { reportType: "UPDATE_1000" },
      baseAssembly({ warningCode: "RISK_FRAMEWORK_PARTIAL" }),
      GENERATED_AT_MS,
    );
    assert.equal(result.warningCode, "RISK_FRAMEWORK_PARTIAL");
    assert.equal(result.warnings[0]?.code, "RISK_FRAMEWORK_PARTIAL");
  });

  await test("every output validates against the shared contract", () => {
    for (const planState of [
      "READY",
      "WAITING_FOR_TRIGGER",
      "NO_QUALIFIED_CONTRACT",
      "NOT_QUALIFIED",
      "NO_SETUP",
      "NOT_APPLICABLE",
      "UNAVAILABLE",
    ] as DeterministicTradePlanState[]) {
      const result = buildSpyZeroDteDeterministicScheduledReport(
        { reportType: "PREMARKET_0925" },
        assemblyForState(planState),
        GENERATED_AT_MS,
      );
      SpyZeroDteDeterministicScheduledReportResponseSchema.parse(result);
    }
  });

  await test("report copy contains no direct buy or sell instruction", () => {
    const result = buildSpyZeroDteDeterministicScheduledReport(
      { reportType: "OPENING_0935" },
      baseAssembly(),
      GENERATED_AT_MS,
    );
    const copy = [
      result.title,
      result.headline,
      ...result.checklist.map((item) => item.message),
    ].join(" ").toLowerCase();
    assert.equal(/\b(buy|sell)\b/.test(copy), false);
  });

  await test("methodology excludes LLM generation persistence and delivery", () => {
    const result = buildSpyZeroDteDeterministicScheduledReport(
      { reportType: "OPENING_0935" },
      baseAssembly(),
      GENERATED_AT_MS,
    );
    assert.equal(result.disclosures.noLlmGeneration, true);
    assert.equal(result.disclosures.noPersistence, true);
    assert.equal(result.disclosures.noNotificationDelivery, true);
    assert.equal(result.disclosures.noPrivateAccountData, true);
    assert.equal(result.disclosures.noOrderExecution, true);
  });

  await test("service retrieves Assembly exactly once", async () => {
    let calls = 0;
    const result = await getSpyZeroDteDeterministicScheduledReportWithDependencies(
      { reportType: "UPDATE_1000" },
      {
        getAssembly: async () => {
          calls += 1;
          return baseAssembly();
        },
        getLastResortAssembly: () => assemblyForState("UNAVAILABLE"),
        now: () => GENERATED_AT_MS,
      },
    );
    assert.equal(calls, 1);
    assert.equal(result.reportState, "READY");
  });

  await test("service failure uses last-resort Assembly without retrying", async () => {
    let calls = 0;
    const result = await getSpyZeroDteDeterministicScheduledReportWithDependencies(
      { reportType: "UPDATE_1000" },
      {
        getAssembly: async () => {
          calls += 1;
          throw new Error("failed");
        },
        getLastResortAssembly: () => assemblyForState("UNAVAILABLE"),
        now: () => GENERATED_AT_MS,
      },
    );
    assert.equal(calls, 1);
    assert.equal(result.reportState, "UNAVAILABLE");
  });

  await test("route is explicit POST no-store origin checked and query rejecting", () => {
    const source = readFileSync(
      resolve(process.cwd(), "apps/server/src/routes/report.routes.ts"),
      "utf8",
    );
    assert.match(source, /router\.post\("\/spy\/deterministic"/);
    assert.match(source, /setDeterministicReportHeaders/);
    assert.match(source, /isAllowedAccountRiskOrigin/);
    assert.match(source, /QUERY_PARAMETERS_NOT_SUPPORTED/);
    assert.match(source, /DeterministicScheduledReportRequestSchema\.safeParse/);
  });

  await test("API client validates the dedicated deterministic report route", () => {
    const source = readFileSync(
      resolve(process.cwd(), "apps/web/src/lib/api-client.ts"),
      "utf8",
    );
    assert.match(source, /generateSpyDeterministicScheduledReport/);
    assert.match(source, /\/api\/reports\/spy\/deterministic/);
    assert.match(source, /DeterministicScheduledReportRequestSchema/);
    assert.match(source, /SpyZeroDteDeterministicScheduledReportResponseSchema/);
  });

  console.log(`\nDeterministic scheduled report tests: ${passed} passed, ${failed} failed`);
  if (failed > 0) process.exitCode = 1;
}

void main();
