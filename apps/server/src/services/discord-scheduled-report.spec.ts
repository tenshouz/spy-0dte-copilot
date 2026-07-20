/**
 * Deterministic tests for explicit Discord SCHEDULED_REPORT_V2 delivery.
 * Run: npx --no-install tsx apps/server/src/services/discord-scheduled-report.spec.ts
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  DiscordScheduledReportDeliveryRequestSchema,
  DiscordScheduledReportDeliveryResponseSchema,
  type SpyZeroDteTradePlanAssemblyResponse,
} from "@spy-copilot/shared";
import {
  buildDiscordScheduledReportDeliveryResponse,
  buildDiscordScheduledReportPayload,
  mapDiscordScheduledReportProviderFailure,
} from "./discord-scheduled-report.logic";
import { sendDiscordScheduledReportWithDependencies } from "./discord-scheduled-report.service";
import { buildSpyZeroDteDeterministicScheduledReport } from "./deterministic-scheduled-report.logic";

const MARKET_DATE = "2026-07-20";
const ASSEMBLED_AT = "2026-07-20T14:30:00.000Z";
const GENERATED_AT_MS = Date.parse("2026-07-20T14:30:01.000Z");
const ATTEMPTED_AT_MS = Date.parse("2026-07-20T14:30:02.000Z");

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
        { componentId: "GEX_REGIME", status: "SUPPORTIVE", rawState: "CALL_DOMINANT", contributionPoints: 8, maximumAbsoluteContributionPoints: 8, sourceQuality: "COMPLETE", reasonCode: "CALL_GEX_SUPPORTS_CALLS" },
        { componentId: "DEX_REGIME", status: "NEUTRAL", rawState: "BALANCED", contributionPoints: 0, maximumAbsoluteContributionPoints: 6, sourceQuality: "COMPLETE", reasonCode: "DEX_BALANCED" },
        { componentId: "DIRECTIONAL_WALL", status: "NEUTRAL", rawState: "650", contributionPoints: 0, maximumAbsoluteContributionPoints: 4, sourceQuality: "COMPLETE", reasonCode: "DIRECTIONAL_WALL_NOT_NEARBY" },
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


function reportFixture(overrides: Record<string, unknown> = {}) {
  return {
    ...buildSpyZeroDteDeterministicScheduledReport(
      { reportType: "PREMARKET_0925" },
      baseAssembly(),
      GENERATED_AT_MS,
    ),
    ...overrides,
  };
}

function dependencies(overrides: Record<string, unknown> = {}) {
  return {
    getConfig: () => ({
      status: "valid" as const,
      webhookUrl: "https://discord.com/api/webhooks/123456789012345678/abcdefghijklmnopqrstuvwxyz123456",
    }),
    getReport: async () => reportFixture(),
    fetch: async () => new Response("{}", { status: 200 }),
    now: () => ATTEMPTED_AT_MS,
    timeoutMs: 50,
    ...overrides,
  } as Parameters<typeof sendDiscordScheduledReportWithDependencies>[1];
}

let passed = 0;
let failed = 0;
const tests: Array<[string, () => void | Promise<void>]> = [];
function register(name: string, fn: () => void | Promise<void>): void {
  tests.push([name, fn]);
}

register("strict scheduled-report request accepts the four report types", () => {
  for (const reportType of [
    "PREMARKET_0925",
    "OPENING_0935",
    "OPENING_0945",
    "UPDATE_1000",
  ] as const) {
    assert.equal(
      DiscordScheduledReportDeliveryRequestSchema.parse({ reportType }).reportType,
      reportType,
    );
  }
  assert.equal(
    DiscordScheduledReportDeliveryRequestSchema.safeParse({
      reportType: "PREMARKET_0925",
      extra: true,
    }).success,
    false,
  );
});

register("payload is deterministic, disables mentions, and carries no order instruction", () => {
  const payload = buildDiscordScheduledReportPayload(reportFixture());
  const text = JSON.stringify(payload);
  assert.deepEqual(payload.allowed_mentions, { parse: [] });
  assert.equal(text.includes("9:25 AM premarket report"), true);
  assert.equal(text.includes("Opening checklist"), true);
  assert.equal(text.includes("No order was created or executed"), true);
  for (const forbidden of ["Buy Calls", "Buy Puts", "Place Order", "webhookUrl"]) {
    assert.equal(text.includes(forbidden), false);
  }
});

register("missing webhook fails before report generation", async () => {
  let reports = 0;
  let provider = 0;
  const result = await sendDiscordScheduledReportWithDependencies(
    { reportType: "PREMARKET_0925" },
    dependencies({
      getConfig: () => ({ status: "missing" as const }),
      getReport: async () => {
        reports += 1;
        return reportFixture();
      },
      fetch: async () => {
        provider += 1;
        return new Response(null, { status: 200 });
      },
    }),
  );
  assert.equal(result.primaryReasonCode, "WEBHOOK_NOT_CONFIGURED");
  assert.equal(reports, 0);
  assert.equal(provider, 0);
});

register("invalid webhook fails before report generation", async () => {
  const result = await sendDiscordScheduledReportWithDependencies(
    { reportType: "OPENING_0935" },
    dependencies({
      getConfig: () => ({ status: "invalid" as const, reason: "invalid" }),
    }),
  );
  assert.equal(result.primaryReasonCode, "WEBHOOK_CONFIG_INVALID");
  assert.equal(result.reportType, "OPENING_0935");
});

register("informational deterministic reports remain eligible for explicit delivery", async () => {
  const base = baseAssembly();
  const informational = buildSpyZeroDteDeterministicScheduledReport(
    { reportType: "UPDATE_1000" },
    baseAssembly({
      planState: "NOT_APPLICABLE",
      direction: "NONE",
      primaryReasonCode: "TRADE_PLAN_NOT_APPLICABLE",
      entryCondition: {
        ...base.entryCondition,
        state: "NOT_APPLICABLE",
        planningReferenceType: "UNAVAILABLE",
        planningReferencePrice: null,
        triggerLevel: null,
        comparison: null,
        triggerSatisfied: null,
      },
      sourceSummary: {
        ...base.sourceSummary,
        risk: { ...base.sourceSummary.risk, riskQualification: "NOT_APPLICABLE" },
        contract: { ...base.sourceSummary.contract, selectionState: "NOT_APPLICABLE" },
      },
      selectedContract: Object.fromEntries(
        Object.keys(base.selectedContract).map((key) => [key, null]),
      ) as SpyZeroDteTradePlanAssemblyResponse["selectedContract"],
      premiumReference: {
        type: "UNAVAILABLE",
        value: null,
        disclosureCode: "MIDPOINT_REFERENCE_ONLY",
      },
    }),
    GENERATED_AT_MS,
  );
  const result = await sendDiscordScheduledReportWithDependencies(
    { reportType: "UPDATE_1000" },
    dependencies({ getReport: async () => informational }),
  );
  assert.equal(result.deliveryState, "DELIVERED");
  assert.equal(result.report?.reportState, "INFORMATIONAL");
});

register("unavailable report is not sent", async () => {
  let provider = 0;
  const base = baseAssembly();
  const unavailableAssembly = baseAssembly({
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
    selectedContract: Object.fromEntries(
      Object.keys(base.selectedContract).map((key) => [key, null]),
    ) as SpyZeroDteTradePlanAssemblyResponse["selectedContract"],
    premiumReference: {
      type: "UNAVAILABLE",
      value: null,
      disclosureCode: "MIDPOINT_REFERENCE_ONLY",
    },
    sourceSummary: {
      ...base.sourceSummary,
      risk: { ...base.sourceSummary.risk, riskQualification: "UNAVAILABLE" },
      contract: { ...base.sourceSummary.contract, selectionState: "UNAVAILABLE" },
    },
  });
  const unavailable = buildSpyZeroDteDeterministicScheduledReport(
    { reportType: "PREMARKET_0925" },
    unavailableAssembly,
    GENERATED_AT_MS,
  );
  const result = await sendDiscordScheduledReportWithDependencies(
    { reportType: "PREMARKET_0925" },
    dependencies({
      getReport: async () => unavailable,
      fetch: async () => {
        provider += 1;
        return new Response(null, { status: 200 });
      },
    }),
  );
  assert.equal(result.primaryReasonCode, "REPORT_UNAVAILABLE");
  assert.equal(provider, 0);
});

register("report generation failure is sanitized", async () => {
  const result = await sendDiscordScheduledReportWithDependencies(
    { reportType: "OPENING_0945" },
    dependencies({ getReport: async () => { throw new Error("private failure"); } }),
  );
  assert.equal(result.primaryReasonCode, "REPORT_GENERATION_FAILURE");
  assert.equal(JSON.stringify(result).includes("private failure"), false);
});

register("inconsistent report fails closed", async () => {
  const result = await sendDiscordScheduledReportWithDependencies(
    { reportType: "PREMARKET_0925" },
    dependencies({ getReport: async () => ({ product: "wrong" }) }),
  );
  assert.equal(result.primaryReasonCode, "REPORT_GENERATION_FAILURE");
});

register("successful provider confirmation delivers the report", async () => {
  let requestUrl = "";
  let requestBody = "";
  const result = await sendDiscordScheduledReportWithDependencies(
    { reportType: "PREMARKET_0925" },
    dependencies({
      fetch: async (input: Parameters<typeof fetch>[0], init?: Parameters<typeof fetch>[1]) => {
        requestUrl = String(input);
        requestBody = String(init?.body ?? "");
        return new Response("{}", { status: 200 });
      },
    }),
  );
  assert.equal(result.primaryReasonCode, "REPORT_DELIVERED");
  assert.equal(result.deliveryState, "DELIVERED");
  assert.equal(result.providerRequestAttempted, true);
  assert.equal(requestUrl.endsWith("?wait=true"), true);
  assert.equal(requestBody.includes("allowed_mentions"), true);
});

register("provider rate limit rejection and failure mappings are fixed", () => {
  assert.equal(mapDiscordScheduledReportProviderFailure(429), "WEBHOOK_RATE_LIMITED");
  assert.equal(mapDiscordScheduledReportProviderFailure(403), "WEBHOOK_REJECTED");
  assert.equal(mapDiscordScheduledReportProviderFailure(500), "WEBHOOK_PROVIDER_FAILURE");
});

for (const [status, reason] of [
  [429, "WEBHOOK_RATE_LIMITED"],
  [403, "WEBHOOK_REJECTED"],
  [500, "WEBHOOK_PROVIDER_FAILURE"],
] as const) {
  register(`provider HTTP ${status} maps to ${reason}`, async () => {
    const result = await sendDiscordScheduledReportWithDependencies(
      { reportType: "PREMARKET_0925" },
      dependencies({ fetch: async () => new Response(null, { status }) }),
    );
    assert.equal(result.primaryReasonCode, reason);
    assert.equal(result.providerStatusCode, status);
    assert.equal(result.providerRequestAttempted, true);
  });
}

register("network failure is sanitized", async () => {
  const result = await sendDiscordScheduledReportWithDependencies(
    { reportType: "PREMARKET_0925" },
    dependencies({ fetch: async () => { throw new TypeError("network detail"); } }),
  );
  assert.equal(result.primaryReasonCode, "WEBHOOK_NETWORK_FAILURE");
  assert.equal(result.providerStatusCode, null);
});

register("timeout is classified without provider details", async () => {
  const result = await sendDiscordScheduledReportWithDependencies(
    { reportType: "PREMARKET_0925" },
    dependencies({
      fetch: async (_input: Parameters<typeof fetch>[0], init?: Parameters<typeof fetch>[1]) =>
        new Promise((_resolve, reject) => {
          init?.signal?.addEventListener("abort", () => {
            const error = new Error("aborted");
            error.name = "AbortError";
            reject(error);
          });
        }),
      timeoutMs: 1,
    }),
  );
  assert.equal(result.primaryReasonCode, "WEBHOOK_REQUEST_TIMEOUT");
});

register("every constructed response validates against the shared contract", () => {
  for (const reasonCode of [
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
  ] as const) {
    const delivered = reasonCode === "REPORT_DELIVERED";
    const response = buildDiscordScheduledReportDeliveryResponse({
      reasonCode,
      reportType: "PREMARKET_0925",
      attemptedAtMs: ATTEMPTED_AT_MS,
      report: ["WEBHOOK_NOT_CONFIGURED", "WEBHOOK_CONFIG_INVALID", "REPORT_GENERATION_FAILURE"].includes(reasonCode)
        ? null
        : reportFixture(),
      providerStatusCode: delivered ? 200 : null,
      providerRequestAttempted: delivered,
    });
    assert.equal(DiscordScheduledReportDeliveryResponseSchema.safeParse(response).success, true);
  }
});

register("methodology excludes scheduler persistence LLM and private account data", () => {
  const response = buildDiscordScheduledReportDeliveryResponse({
    reasonCode: "REPORT_DELIVERED",
    reportType: "PREMARKET_0925",
    attemptedAtMs: ATTEMPTED_AT_MS,
    report: reportFixture(),
    providerStatusCode: 200,
    providerRequestAttempted: true,
  });
  assert.equal(response.disclosures.explicitDeliveryOnly, true);
  assert.equal(response.disclosures.noAutomaticSchedule, true);
  assert.equal(response.disclosures.noDatabasePersistence, true);
  assert.equal(response.disclosures.noLlmGeneration, true);
  assert.equal(response.disclosures.noPrivateAccountData, true);
  assert.equal(response.disclosures.noOrderExecution, true);
  assert.equal(response.methodology.schedulerMethod, "NONE");
});

register("route is POST-only no-store and rejects origin query and body violations", () => {
  const route = readFileSync(
    resolve(process.cwd(), "apps/server/src/routes/discord-webhook.routes.ts"),
    "utf8",
  );
  assert.equal(route.includes('router.post("/scheduled-report"'), true);
  assert.equal(route.includes("DiscordScheduledReportDeliveryRequestSchema.safeParse"), true);
  assert.equal(route.includes("DISCORD_SCHEDULED_REPORT_ORIGIN_FORBIDDEN"), true);
  assert.equal(route.includes("QUERY_PARAMETERS_NOT_SUPPORTED"), true);
  assert.equal(route.includes('res.setHeader("Cache-Control", "no-store")'), true);
});

register("API client validates the explicit scheduled-report route", () => {
  const client = readFileSync(
    resolve(process.cwd(), "apps/web/src/lib/api-client.ts"),
    "utf8",
  );
  assert.equal(client.includes("sendDiscordScheduledReport"), true);
  assert.equal(client.includes("/api/discord/scheduled-report"), true);
  assert.equal(client.includes("DiscordScheduledReportDeliveryResponseSchema"), true);
});

register("service contains no database scheduler private-account or order dependency", () => {
  const service = readFileSync(
    resolve(process.cwd(), "apps/server/src/services/discord-scheduled-report.service.ts"),
    "utf8",
  );
  for (const forbidden of [
    "prisma",
    "setInterval",
    "node-cron",
    "account-risk",
    "positions",
    "orders",
    "transactions",
    "orderQuantity",
  ]) {
    assert.equal(service.includes(forbidden), false, `${forbidden} must not appear`);
  }
});

(async () => {
  for (const [name, fn] of tests) {
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
  console.log(`\nDiscord scheduled-report delivery tests: ${passed} passed, ${failed} failed`);
  if (failed > 0) process.exitCode = 1;
})();
