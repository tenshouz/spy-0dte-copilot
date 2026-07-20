/**
 * Deterministic tests for TRADE_PLAN_ALERT_CANDIDATE_V2 with V1 compatibility retained in shared contracts.
 * Run: npx --no-install tsx apps/server/src/services/trade-plan-alert-candidate.spec.ts
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  SpyZeroDteTradePlanAlertCandidateResponseSchema,
  type DeterministicTradePlanState,
  type SpyZeroDteTradePlanAssemblyResponse,
} from "@spy-copilot/shared";
import { buildSpyZeroDteTradePlanAlertCandidate } from "./trade-plan-alert-candidate.logic";
import { getSpyZeroDteTradePlanAlertCandidateWithDependencies } from "./trade-plan-alert-candidate.service";

const MARKET_DATE = "2026-07-20";
const ASSEMBLED_AT = "2026-07-20T14:30:00.000Z";
const ALERT_AT_MS = Date.parse("2026-07-20T14:30:01.000Z");

function baseAssembly(
  overrides: Partial<SpyZeroDteTradePlanAssemblyResponse> = {},
): SpyZeroDteTradePlanAssemblyResponse {
  const value = {
    symbol: "SPY",
    product: "SPY_ZERO_DTE_DETERMINISTIC_TRADE_PLAN_ASSEMBLY",
    methodologyVersion: "ASSEMBLY_V2",
    currentMarketDate: MARKET_DATE,
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
      components: [],
      warnings: [],
      disclosures: { cannotBlockEligibility: true },
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
      candidateId: "INV_VWAP",
      levelType: "VWAP",
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
      candidateId: "OBJ_PDH",
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
      selectedContract: {
        ...base.selectedContract,
        candidateId: null,
        contractSymbol: null,
        contractDirection: null,
        ask: null,
        quoteAt: null,
      },
      entryCondition: {
        ...base.entryCondition,
        state: "WAITING",
        planningReferenceType: "TRIGGER_LEVEL",
        planningReferencePrice: 641,
        triggerLevel: 641,
        triggerSatisfied: false,
      },
    };
  }

  if (planState === "NO_QUALIFIED_CONTRACT") {
    return {
      ...base,
      planState,
      primaryReasonCode: "TRADE_PLAN_NO_QUALIFIED_CONTRACT",
      selectedContract: {
        ...base.selectedContract,
        candidateId: null,
        contractSymbol: null,
        contractDirection: null,
        ask: null,
        quoteAt: null,
      },
    };
  }

  if (planState === "NOT_QUALIFIED") {
    return {
      ...base,
      planState,
      primaryReasonCode: "TRADE_PLAN_NOT_QUALIFIED",
      selectedContract: {
        ...base.selectedContract,
        candidateId: null,
        contractSymbol: null,
        contractDirection: null,
        ask: null,
        quoteAt: null,
      },
      underlyingRiskReward: {
        ...base.underlyingRiskReward,
        rewardRiskRatio: 1.25,
        qualification: "NOT_QUALIFIED",
      },
    };
  }

  if (planState === "NO_SETUP") {
    return {
      ...base,
      planState,
      direction: "NONE",
      primaryReasonCode: "TRADE_PLAN_NO_SETUP",
      selectedContract: {
        ...base.selectedContract,
        candidateId: null,
        contractSymbol: null,
        contractDirection: null,
        ask: null,
        quoteAt: null,
      },
    };
  }

  if (planState === "NOT_APPLICABLE") {
    return {
      ...base,
      planState,
      direction: "NONE",
      primaryReasonCode: "TRADE_PLAN_NOT_APPLICABLE",
      selectedContract: {
        ...base.selectedContract,
        candidateId: null,
        contractSymbol: null,
        contractDirection: null,
        ask: null,
        quoteAt: null,
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
    selectedContract: {
      ...base.selectedContract,
      candidateId: null,
      contractSymbol: null,
      contractDirection: null,
      ask: null,
      quoteAt: null,
    },
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
await test("READY creates an opportunity candidate with selected contract references", () => {
  const result = buildSpyZeroDteTradePlanAlertCandidate(baseAssembly(), ALERT_AT_MS);
  assert.equal(result.alertState, "CANDIDATE");
  assert.equal(result.primaryReasonCode, "PLAN_READY_CANDIDATE");
  assert.equal(result.candidate?.category, "PLAN_READY");
  assert.equal(result.candidate?.severity, "OPPORTUNITY");
  assert.equal(result.candidate?.direction, "CALLS");
  assert.equal(result.candidate?.selectedContractAsk, 1.25);
  assert.equal(result.candidate?.structuralInvalidationLevel, 639.5);
  assert.equal(result.candidate?.primaryObjectiveLevel, 642);
  assert.match(result.candidate?.message ?? "", /supportive/i);
  assert.match(result.candidate?.message ?? "", /90%/);
  assert.match(result.candidate?.message ?? "", /supportive/i);
  assert.match(result.candidate?.message ?? "", /90%/);
});

await test("READY PUTS uses the same deterministic candidate contract", () => {
  const source = baseAssembly({ direction: "PUTS" });
  const result = buildSpyZeroDteTradePlanAlertCandidate(source, ALERT_AT_MS);
  assert.equal(result.candidate?.direction, "PUTS");
  assert.match(result.candidate?.title ?? "", /PUTS/);
});

await test("WAITING_FOR_TRIGGER creates an informational candidate without a contract", () => {
  const result = buildSpyZeroDteTradePlanAlertCandidate(
    assemblyForState("WAITING_FOR_TRIGGER"),
    ALERT_AT_MS,
  );
  assert.equal(result.alertState, "CANDIDATE");
  assert.equal(result.candidate?.category, "WAITING_FOR_TRIGGER");
  assert.equal(result.candidate?.severity, "INFO");
  assert.equal(result.candidate?.selectedContractSymbol, null);
  assert.equal(result.candidate?.triggerLevel, 641);
});

await test("NO_QUALIFIED_CONTRACT creates a warning candidate", () => {
  const result = buildSpyZeroDteTradePlanAlertCandidate(
    assemblyForState("NO_QUALIFIED_CONTRACT"),
    ALERT_AT_MS,
  );
  assert.equal(result.candidate?.category, "NO_QUALIFIED_CONTRACT");
  assert.equal(result.candidate?.severity, "WARNING");
  assert.equal(result.candidate?.selectedContractSymbol, null);
});

await test("NOT_QUALIFIED creates a warning candidate with risk reference", () => {
  const result = buildSpyZeroDteTradePlanAlertCandidate(
    assemblyForState("NOT_QUALIFIED"),
    ALERT_AT_MS,
  );
  assert.equal(result.candidate?.category, "SETUP_NOT_QUALIFIED");
  assert.equal(result.candidate?.rewardRiskRatio, 1.25);
});

await test("NO_SETUP is intentionally suppressed", () => {
  const result = buildSpyZeroDteTradePlanAlertCandidate(
    assemblyForState("NO_SETUP"),
    ALERT_AT_MS,
  );
  assert.equal(result.alertState, "SUPPRESSED");
  assert.equal(result.primaryReasonCode, "NO_SETUP_SUPPRESSED");
  assert.equal(result.candidate, null);
});

await test("NOT_APPLICABLE is intentionally suppressed", () => {
  const result = buildSpyZeroDteTradePlanAlertCandidate(
    assemblyForState("NOT_APPLICABLE"),
    ALERT_AT_MS,
  );
  assert.equal(result.alertState, "SUPPRESSED");
  assert.equal(result.primaryReasonCode, "NOT_APPLICABLE_SUPPRESSED");
  assert.equal(result.candidate, null);
});

await test("UNAVAILABLE source produces no alert candidate", () => {
  const result = buildSpyZeroDteTradePlanAlertCandidate(
    assemblyForState("UNAVAILABLE"),
    ALERT_AT_MS,
  );
  assert.equal(result.engineState, "UNAVAILABLE");
  assert.equal(result.alertState, "UNAVAILABLE");
  assert.equal(result.primaryReasonCode, "SOURCE_ASSEMBLY_UNAVAILABLE");
  assert.equal(result.candidate, null);
});

await test("inconsistent READY source fails closed", () => {
  const source = baseAssembly({
    selectedContract: {
      ...baseAssembly().selectedContract,
      contractSymbol: null,
    },
  });
  const result = buildSpyZeroDteTradePlanAlertCandidate(source, ALERT_AT_MS);
  assert.equal(result.alertState, "UNAVAILABLE");
  assert.equal(result.primaryReasonCode, "SOURCE_ASSEMBLY_INCONSISTENT");
  assert.equal(result.warningCode, "ASSEMBLY_VALIDATION_FAILED");
});

await test("candidate key is stable across calculation timestamps", () => {
  const first = buildSpyZeroDteTradePlanAlertCandidate(baseAssembly(), ALERT_AT_MS);
  const second = buildSpyZeroDteTradePlanAlertCandidate(
    baseAssembly({ calculatedAt: "2026-07-20T14:31:00.000Z" }),
    ALERT_AT_MS + 60_000,
  );
  assert.equal(first.candidate?.deduplicationKey, second.candidate?.deduplicationKey);
});

await test("candidate key changes when the selected contract changes", () => {
  const first = buildSpyZeroDteTradePlanAlertCandidate(baseAssembly(), ALERT_AT_MS);
  const source = baseAssembly({
    selectedContract: {
      ...baseAssembly().selectedContract,
      contractSymbol: "SPY   260720C00641000",
      strikePrice: 641,
    },
  });
  const second = buildSpyZeroDteTradePlanAlertCandidate(source, ALERT_AT_MS);
  assert.notEqual(first.candidate?.deduplicationKey, second.candidate?.deduplicationKey);
});

await test("candidate key changes when exposure confirmation state materially changes", () => {
  const supportive = buildSpyZeroDteTradePlanAlertCandidate(
    baseAssembly(),
    ALERT_AT_MS,
  );
  const conflictingAssembly = baseAssembly({
    planConfidence: {
      ...baseAssembly().planConfidence!,
      exposureAdjustmentPoints: -8,
      adjustedConfidenceScore: 74,
    },
    exposureConfirmation: {
      ...baseAssembly().exposureConfirmation!,
      state: "CONFLICTING",
      adjustmentPoints: -8,
      adjustedConfidenceScore: 74,
    },
  });
  const conflicting = buildSpyZeroDteTradePlanAlertCandidate(
    conflictingAssembly,
    ALERT_AT_MS + 1_000,
  );
  assert.notEqual(
    supportive.candidate?.deduplicationKey,
    conflicting.candidate?.deduplicationKey,
  );
});

await test("source warning is retained without changing candidate state", () => {
  const source = assemblyForState("NO_QUALIFIED_CONTRACT");
  source.engineState = "PARTIAL";
  source.warningCode = "SOURCE_COMPATIBILITY_PARTIAL";
  const result = buildSpyZeroDteTradePlanAlertCandidate(source, ALERT_AT_MS);
  assert.equal(result.alertState, "CANDIDATE");
  assert.equal(result.engineState, "PARTIAL");
  assert.equal(result.warningCode, "SOURCE_COMPATIBILITY_PARTIAL");
});

await test("every response validates against the shared contract", () => {
  for (const state of [
    "READY",
    "WAITING_FOR_TRIGGER",
    "NO_QUALIFIED_CONTRACT",
    "NOT_QUALIFIED",
    "NO_SETUP",
    "NOT_APPLICABLE",
    "UNAVAILABLE",
  ] as const) {
    const result = buildSpyZeroDteTradePlanAlertCandidate(
      assemblyForState(state),
      ALERT_AT_MS,
    );
    assert.equal(SpyZeroDteTradePlanAlertCandidateResponseSchema.safeParse(result).success, true);
  }
});

await test("methodology explicitly excludes transition state, delivery, and persistence", () => {
  const result = buildSpyZeroDteTradePlanAlertCandidate(baseAssembly(), ALERT_AT_MS);
  assert.equal(result.methodology.transitionDetectionMethod, "NONE");
  assert.equal(result.methodology.deliveryMethod, "NONE");
  assert.equal(result.methodology.deduplicationMethod, "STABLE_CANDIDATE_KEY_ONLY");
  assert.equal(result.disclosures.noTransitionDetection, true);
  assert.equal(result.disclosures.noDeduplicationState, true);
  assert.equal(result.disclosures.noPersistence, true);
  assert.equal(result.disclosures.noNotificationDelivery, true);
  assert.equal(result.disclosures.noPrivateAccountData, true);
  assert.equal(result.disclosures.noOrderExecution, true);
});

await test("candidate text is decision support and contains no buy or sell instruction", () => {
  for (const state of [
    "READY",
    "WAITING_FOR_TRIGGER",
    "NO_QUALIFIED_CONTRACT",
    "NOT_QUALIFIED",
  ] as const) {
    const result = buildSpyZeroDteTradePlanAlertCandidate(
      assemblyForState(state),
      ALERT_AT_MS,
    );
    const text = `${result.candidate?.title} ${result.candidate?.message}`.toLowerCase();
    assert.equal(/\bbuy\b|\bsell\b|submit order|execute trade/.test(text), false);
  }
});

await test("service retrieves Assembly exactly once", async () => {
  let assemblyCalls = 0;
  let fallbackCalls = 0;
  const result = await getSpyZeroDteTradePlanAlertCandidateWithDependencies({
    getAssembly: async () => {
      assemblyCalls += 1;
      return baseAssembly();
    },
    getLastResortAssembly: () => {
      fallbackCalls += 1;
      return assemblyForState("UNAVAILABLE");
    },
    now: () => ALERT_AT_MS,
  });
  assert.equal(result.alertState, "CANDIDATE");
  assert.equal(assemblyCalls, 1);
  assert.equal(fallbackCalls, 0);
});

await test("service failure uses last-resort Assembly without retrying", async () => {
  let assemblyCalls = 0;
  let fallbackCalls = 0;
  const result = await getSpyZeroDteTradePlanAlertCandidateWithDependencies({
    getAssembly: async () => {
      assemblyCalls += 1;
      throw new Error("source unavailable");
    },
    getLastResortAssembly: () => {
      fallbackCalls += 1;
      return assemblyForState("UNAVAILABLE");
    },
    now: () => ALERT_AT_MS,
  });
  assert.equal(result.alertState, "UNAVAILABLE");
  assert.equal(assemblyCalls, 1);
  assert.equal(fallbackCalls, 1);
});

await test("service depends only on Trade Plan Assembly and never private account data", () => {
  const servicePath = `${process.cwd()}/apps/server/src/services/trade-plan-alert-candidate.service.ts`;
  const service = readFileSync(servicePath, "utf8");
  assert.match(service, /getSpyZeroDteTradePlanAssembly/);
  assert.equal(/account-risk|schwab-account|positions|orders|transactions/i.test(service), false);
});

await test("route is GET-only, no-store, and rejects query parameters", () => {
  const routePath = `${process.cwd()}/apps/server/src/routes/trade-plan-alert.routes.ts`;
  const route = readFileSync(routePath, "utf8");
  assert.match(route, /tradePlanAlertRouter\.get\("\/spy"/);
  assert.equal(route.includes("tradePlanAlertRouter.post"), false);
  assert.match(route, /Cache-Control", "no-store"/);
  assert.match(route, /Pragma", "no-cache"/);
  assert.match(route, /Object\.keys\(req\.query\)\.length > 0/);
});

await test("API client validates the dedicated alert-candidate route", () => {
  const clientPath = `${process.cwd()}/apps/web/src/lib/api-client.ts`;
  const client = readFileSync(clientPath, "utf8");
  assert.match(client, /getSpyZeroDteTradePlanAlertCandidate/);
  assert.match(client, /"\/api\/trade-plan-alert\/spy"/);
  assert.match(client, /SpyZeroDteTradePlanAlertCandidateResponseSchema/);
});

  console.log(`\nTrade Plan alert-candidate tests: ${passed} passed, ${failed} failed`);
  if (failed > 0) process.exitCode = 1;
}

void main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
