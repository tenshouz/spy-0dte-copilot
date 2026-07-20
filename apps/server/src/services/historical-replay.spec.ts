/**
 * Deterministic tests for CAPTURED_REPLAY_V1.
 * Run: npx --no-install tsx apps/server/src/services/historical-replay.spec.ts
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  HistoricalReplayHistoryResponseSchema,
  HistoricalReplayRunResponseSchema,
  SpyZeroDteTradePlanAssemblyResponseSchema,
  type HistoricalReplayRunRequest,
  type SpyZeroDteTradePlanAssemblyResponse,
} from "@spy-copilot/shared";
import {
  buildHistoricalReplayHistoryResponse,
  buildHistoricalReplayRunPayload,
  buildHistoricalReplayRunResponse,
  summarizeHistoricalReplayRun,
  type HistoricalReplayRunRow,
  type HistoricalReplaySourceRow,
} from "./historical-replay.logic";
import {
  createHistoricalReplayRunWithDependencies,
  getHistoricalReplayRunWithDependencies,
  listHistoricalReplayRunsWithDependencies,
  type HistoricalReplayServiceDependencies,
} from "./historical-replay.service";

const NOW = new Date("2026-07-20T15:00:00.000Z");
const REQUEST: HistoricalReplayRunRequest = {
  startMarketDate: null,
  endMarketDate: null,
};

function validAssembly(
  overrides: Partial<SpyZeroDteTradePlanAssemblyResponse> = {},
): SpyZeroDteTradePlanAssemblyResponse {
  const calculatedAt = "2026-07-20T14:00:00.000Z";
  const base = {
    symbol: "SPY",
    product: "SPY_ZERO_DTE_DETERMINISTIC_TRADE_PLAN_ASSEMBLY",
    methodologyVersion: "ASSEMBLY_V1",
    currentMarketDate: "2026-07-20",
    mostRecentRthSessionDate: "2026-07-17",
    calculatedAt,
    engineState: "AVAILABLE",
    planState: "NOT_APPLICABLE",
    direction: "NONE",
    primaryReasonCode: "TRADE_PLAN_NOT_APPLICABLE",
    warningCode: null,
    currentPrice: 630,
    priceSource: "QUOTE_LAST_PRICE",
    quoteTimestamp: "2026-07-20T13:59:59.000Z",
    sessionPhase: "CLOSED",
    bias: {
      biasState: "NEUTRAL",
      confidenceScore: 50,
      confidenceUnit: "PERCENT",
      confidenceScope: "STRUCTURAL_EVIDENCE_ONLY",
      sourceQualityState: "COMPLETE",
      minimumUsableDirectionalEvidenceCount: 3,
      usableDirectionalEvidenceCount: 5,
      applicableDirectionalEvidenceCount: 5,
      bullishEvidenceCount: 0,
      bearishEvidenceCount: 0,
      neutralEvidenceCount: 5,
      unavailableDirectionalEvidenceCount: 0,
      notApplicableDirectionalEvidenceCount: 4,
    },
    entryCondition: {
      state: "NOT_APPLICABLE",
      planningReferenceType: "UNAVAILABLE",
      planningReferencePrice: null,
      currentPrice: null,
      triggerLevel: null,
      comparison: null,
      triggerSatisfied: null,
      signedDistancePoints: null,
      sourceFeatureIds: [],
      sourceValues: { vwap: null, openingRangeBoundary: null },
      disclosureCode: "PLANNING_REFERENCE_ONLY",
    },
    structuralInvalidation: {
      candidateId: null,
      levelType: null,
      levelSemantic: null,
      level: null,
      riskDistancePoints: null,
      sourceFeatureId: null,
      sourceComponents: [],
      referenceDate: null,
      referenceDateRelation: null,
      distanceRank: null,
      disclosureCode: "STRUCTURAL_INVALIDATION_REFERENCE_ONLY",
    },
    primaryObjective: {
      candidateId: null,
      levelType: null,
      levelSemantic: null,
      level: null,
      objectiveDistancePoints: null,
      rewardRiskRatio: null,
      minimumRewardRiskRatio: 2,
      qualificationStatus: null,
      sourceFeatureId: null,
      sourceComponents: [],
      referenceDate: null,
      referenceDateRelation: null,
      distanceRank: null,
      disclosureCode: "UNDERLYING_OBJECTIVE_REFERENCE_ONLY",
    },
    underlyingRiskReward: {
      riskDistancePoints: null,
      rewardDistancePoints: null,
      rewardRiskRatio: null,
      minimumRequiredRewardRiskRatio: 2,
      qualification: "NOT_APPLICABLE",
      calculationUnit: "SPY_UNDERLYING_PRICE_POINTS",
    },
    selectedContract: {
      candidateId: null,
      contractSymbol: null,
      contractDirection: null,
      description: null,
      strikePrice: null,
      expirationDate: null,
      nonStandard: null,
      mini: null,
      multiplier: null,
      moneyness: null,
      bid: null,
      ask: null,
      calculatedMidpoint: null,
      providerMark: null,
      spreadPoints: null,
      spreadRatio: null,
      spreadPercent: null,
      bidSize: null,
      askSize: null,
      openInterest: null,
      volume: null,
      delta: null,
      gamma: null,
      theta: null,
      vega: null,
      rho: null,
      impliedVolatilityPercent: null,
      quoteAt: null,
      tradeAt: null,
      quoteAgeMilliseconds: null,
      quoteFreshnessState: null,
      strikeDistancePoints: null,
      selectionRank: null,
    },
    premiumReference: {
      type: "UNAVAILABLE",
      value: null,
      disclosureCode: "MIDPOINT_REFERENCE_ONLY",
    },
    sourceSummary: {
      upstreamSameSnapshotGuaranteed: true,
      marketState: {
        product: "SPY_ZERO_DTE_DETERMINISTIC_MARKET_STATE",
        version: "V1",
        calculatedAt: "2026-07-20T13:59:58.000Z",
        engineState: "AVAILABLE",
        warningCode: null,
      },
      bias: {
        product: "SPY_ZERO_DTE_DETERMINISTIC_BIAS_CONFIDENCE",
        version: "BIAS_V1",
        calculatedAt: "2026-07-20T13:59:58.200Z",
        engineState: "AVAILABLE",
        biasState: "NEUTRAL",
        warningCode: null,
      },
      tradePlan: {
        product: "SPY_ZERO_DTE_DETERMINISTIC_CONDITIONAL_TRADE_PLAN",
        version: "TRADE_PLAN_V1",
        calculatedAt: "2026-07-20T13:59:58.400Z",
        engineState: "AVAILABLE",
        setupState: "NOT_APPLICABLE",
        setupDirection: "NONE",
        primaryReasonCode: "SESSION_NOT_RTH",
        warningCode: null,
      },
      risk: {
        product: "SPY_ZERO_DTE_DETERMINISTIC_OBJECTIVE_RISK_FRAMEWORK",
        version: "RISK_V1",
        calculatedAt: "2026-07-20T13:59:58.600Z",
        engineState: "AVAILABLE",
        frameworkState: "NOT_APPLICABLE",
        riskQualification: "NOT_APPLICABLE",
        direction: "NONE",
        primaryReasonCode: "SOURCE_TRADE_PLAN_NOT_APPLICABLE",
        warningCode: null,
      },
      contract: {
        product: "SPY_ZERO_DTE_DETERMINISTIC_CONTRACT_SELECTION_LIQUIDITY",
        version: "CONTRACT_V1",
        calculatedAt: "2026-07-20T13:59:58.800Z",
        engineState: "AVAILABLE",
        selectionState: "NOT_APPLICABLE",
        contractDirection: "NONE",
        sourceCompatibilityState: "NOT_EVALUATED",
        sourceOptionsChainFetchedAt: null,
        sourceOptionsChainMetricState: null,
        sourceOptionsChainSourceState: null,
        sourceOptionsChainWarningCode: null,
        sourceOptionsChainIsDelayed: null,
        primaryReasonCode: "SOURCE_RISK_NOT_APPLICABLE",
        warningCode: null,
      },
      selectedContractQuoteAt: null,
    },
    disclosures: {
      planningReference: "PLANNING_REFERENCE_ONLY",
      structuralInvalidation: "STRUCTURAL_INVALIDATION_REFERENCE_ONLY",
      underlyingObjective: "UNDERLYING_OBJECTIVE_REFERENCE_ONLY",
      premiumReference: "MIDPOINT_REFERENCE_ONLY",
      confidence: "STRUCTURAL_EVIDENCE_ONLY",
      noOrderExecution: true,
      noPositionSizing: true,
      noGuaranteedFill: true,
      noPremiumTarget: true,
      noPremiumStop: true,
    },
    methodology: {
      sourceProducts: [
        "SPY_ZERO_DTE_DETERMINISTIC_MARKET_STATE",
        "SPY_ZERO_DTE_DETERMINISTIC_BIAS_CONFIDENCE",
        "SPY_ZERO_DTE_DETERMINISTIC_CONDITIONAL_TRADE_PLAN",
        "SPY_ZERO_DTE_DETERMINISTIC_OBJECTIVE_RISK_FRAMEWORK",
        "SPY_ZERO_DTE_DETERMINISTIC_CONTRACT_SELECTION_LIQUIDITY",
      ],
      sourceMethodologies: [
        "V1",
        "BIAS_V1",
        "TRADE_PLAN_V1",
        "RISK_V1",
        "CONTRACT_V1",
      ],
      calculationUnit: "SPY_UNDERLYING_PRICE_POINTS",
      assemblyOnly: true,
      contractCandidateDetailsRoute: "/api/trade-contract/spy",
    },
  } as SpyZeroDteTradePlanAssemblyResponse;

  return SpyZeroDteTradePlanAssemblyResponseSchema.parse({
    ...base,
    ...overrides,
  });
}

function noSetupAssembly(): SpyZeroDteTradePlanAssemblyResponse {
  const assembly = validAssembly();
  return SpyZeroDteTradePlanAssemblyResponseSchema.parse({
    ...assembly,
    planState: "NO_SETUP",
    primaryReasonCode: "TRADE_PLAN_NO_SETUP",
    sourceSummary: {
      ...assembly.sourceSummary,
      tradePlan: {
        ...assembly.sourceSummary.tradePlan,
        setupState: "NO_SETUP",
        primaryReasonCode: "BIAS_NEUTRAL",
      },
      risk: {
        ...assembly.sourceSummary.risk,
        frameworkState: "NO_SETUP",
        primaryReasonCode: "SOURCE_TRADE_PLAN_NO_SETUP",
      },
      contract: {
        ...assembly.sourceSummary.contract,
        primaryReasonCode: "SOURCE_RISK_NO_SETUP",
      },
    },
  });
}

function sourceRow(
  overrides: Partial<HistoricalReplaySourceRow> = {},
): HistoricalReplaySourceRow {
  const assembly = validAssembly();
  return {
    id: "snapshot-1",
    currentMarketDate: assembly.currentMarketDate,
    sourceCalculatedAt: new Date(assembly.calculatedAt),
    capturedAt: new Date("2026-07-20T14:00:01.000Z"),
    captureMode: "EXPLICIT",
    engineState: assembly.engineState,
    planState: assembly.planState,
    direction: assembly.direction,
    confidenceScore: assembly.bias.confidenceScore,
    primaryReasonCode: assembly.primaryReasonCode,
    warningCode: assembly.warningCode,
    entryConditionState: assembly.entryCondition.state,
    selectedContractSymbol: assembly.selectedContract.contractSymbol,
    sourceAssembly: assembly,
    outcomeState: "UNREVIEWED",
    realizedPnlDollars: null,
    outcomeUpdatedAt: null,
    ...overrides,
  };
}

function runRow(result = buildHistoricalReplayRunPayload({
  id: "run-1",
  createdAt: NOW,
  request: REQUEST,
  rows: [sourceRow()],
  snapshotLimitReached: false,
})): HistoricalReplayRunRow {
  return {
    id: result.id,
    createdAt: new Date(result.createdAt),
    startMarketDate: result.request.startMarketDate,
    endMarketDate: result.request.endMarketDate,
    snapshotCount: result.source.snapshotCount,
    marketDateCount: result.source.marketDateCount,
    auditState: result.audit.auditState,
    auditFailureCount: result.audit.snapshotFailCount,
    stateChangeCount: result.timeline.stateChangeCount,
    tradeOutcomeCount: result.outcomeSummary.tradeOutcomeCount,
    totalPnlDollars: result.outcomeSummary.totalPnlDollars,
    result,
  };
}

function dependencies(
  overrides: Partial<HistoricalReplayServiceDependencies> = {},
): HistoricalReplayServiceDependencies {
  const persisted: HistoricalReplayRunRow[] = [];
  return {
    databaseConfigured: () => true,
    getUserId: async () => "user-1",
    repository: {
      listSourceSnapshots: async () => [sourceRow()],
      insertRun: async (_userId, run) => {
        persisted.push(runRow(run));
      },
      listRuns: async () => persisted,
      getRun: async (_userId, runId) =>
        persisted.find((row) => row.id === runId) ?? null,
    },
    now: () => NOW,
    createId: () => "run-1",
    log: () => undefined,
    ...overrides,
  };
}

const tests: Array<[string, () => void | Promise<void>]> = [];
function test(name: string, fn: () => void | Promise<void>): void {
  tests.push([name, fn]);
}

test("valid captured Assembly passes the no-look-ahead audit", () => {
  const run = buildHistoricalReplayRunPayload({
    id: "run-1",
    createdAt: NOW,
    request: REQUEST,
    rows: [sourceRow()],
    snapshotLimitReached: false,
  });
  assert.equal(run.audit.auditState, "PASS");
  assert.equal(run.audit.snapshotPassCount, 1);
  assert.equal(run.audit.issueCount, 0);
  assert.equal(run.timeline.events[0]?.eventType, "SESSION_INITIAL");
});

test("empty replay remains available and auditable", () => {
  const run = buildHistoricalReplayRunPayload({
    id: "run-empty",
    createdAt: NOW,
    request: REQUEST,
    rows: [],
    snapshotLimitReached: false,
  });
  assert.equal(run.audit.auditState, "EMPTY");
  assert.equal(run.source.snapshotCount, 0);
  assert.equal(run.timeline.eventCount, 0);
});

test("Assembly schema failure is reported without exposing source payload", () => {
  const run = buildHistoricalReplayRunPayload({
    id: "run-1",
    createdAt: NOW,
    request: REQUEST,
    rows: [sourceRow({ sourceAssembly: { invalid: true } })],
    snapshotLimitReached: false,
  });
  assert.equal(run.audit.auditState, "FAIL");
  assert.equal(run.audit.issues[0]?.checkCode, "ASSEMBLY_SCHEMA_INVALID");
  assert.equal(JSON.stringify(run).includes('"invalid":true'), false);
});

test("source calculated after capture fails closed", () => {
  const run = buildHistoricalReplayRunPayload({
    id: "run-1",
    createdAt: NOW,
    request: REQUEST,
    rows: [
      sourceRow({
        capturedAt: new Date("2026-07-20T13:59:59.000Z"),
      }),
    ],
    snapshotLimitReached: false,
  });
  assert.equal(
    run.audit.issues.some(
      (issue) => issue.checkCode === "SOURCE_CALCULATED_AFTER_CAPTURE",
    ),
    true,
  );
});

test("nested source timestamp after Assembly boundary is detected", () => {
  const assembly = validAssembly();
  const tampered = {
    ...assembly,
    sourceSummary: {
      ...assembly.sourceSummary,
      marketState: {
        ...assembly.sourceSummary.marketState,
        calculatedAt: "2026-07-20T14:00:01.000Z",
      },
    },
  };
  const run = buildHistoricalReplayRunPayload({
    id: "run-1",
    createdAt: NOW,
    request: REQUEST,
    rows: [sourceRow({ sourceAssembly: tampered })],
    snapshotLimitReached: false,
  });
  assert.equal(
    run.audit.issues.some(
      (issue) => issue.checkCode === "SOURCE_TIMESTAMP_AFTER_ASSEMBLY",
    ),
    true,
  );
});

test("stored summary mismatch is detected", () => {
  const run = buildHistoricalReplayRunPayload({
    id: "run-1",
    createdAt: NOW,
    request: REQUEST,
    rows: [sourceRow({ confidenceScore: 99 })],
    snapshotLimitReached: false,
  });
  assert.equal(
    run.audit.issues.some(
      (issue) =>
        issue.checkCode === "STORED_SUMMARY_MISMATCH" &&
        issue.fieldPath === "confidenceScore",
    ),
    true,
  );
});

test("Eastern market-date mismatch is detected", () => {
  const assembly = validAssembly({ currentMarketDate: "2026-07-19" });
  const run = buildHistoricalReplayRunPayload({
    id: "run-1",
    createdAt: NOW,
    request: REQUEST,
    rows: [
      sourceRow({
        currentMarketDate: "2026-07-19",
        sourceAssembly: assembly,
      }),
    ],
    snapshotLimitReached: false,
  });
  assert.equal(
    run.audit.issues.some(
      (issue) => issue.checkCode === "CURRENT_MARKET_DATE_MISMATCH",
    ),
    true,
  );
});

test("outcome timestamps remain post-hoc", () => {
  const run = buildHistoricalReplayRunPayload({
    id: "run-1",
    createdAt: NOW,
    request: REQUEST,
    rows: [
      sourceRow({
        outcomeState: "NO_TRADE",
        outcomeUpdatedAt: new Date("2026-07-20T13:59:00.000Z"),
      }),
    ],
    snapshotLimitReached: false,
  });
  assert.equal(
    run.audit.issues.some(
      (issue) => issue.checkCode === "OUTCOME_UPDATED_BEFORE_CAPTURE",
    ),
    true,
  );
});

test("chronological replay sorts source timestamps", () => {
  const later = sourceRow({
    id: "later",
    sourceCalculatedAt: new Date("2026-07-20T14:05:00.000Z"),
    capturedAt: new Date("2026-07-20T14:05:01.000Z"),
    sourceAssembly: validAssembly({
      calculatedAt: "2026-07-20T14:05:00.000Z",
    }),
  });
  const earlier = sourceRow({ id: "earlier" });
  const run = buildHistoricalReplayRunPayload({
    id: "run-1",
    createdAt: NOW,
    request: REQUEST,
    rows: [later, earlier],
    snapshotLimitReached: false,
  });
  assert.equal(run.timeline.events[0]?.snapshotId, "earlier");
  assert.equal(run.timeline.events[1]?.snapshotId, "later");
});

test("adjacent identical states are marked unchanged", () => {
  const secondAssembly = validAssembly({
    calculatedAt: "2026-07-20T14:01:00.000Z",
  });
  const run = buildHistoricalReplayRunPayload({
    id: "run-1",
    createdAt: NOW,
    request: REQUEST,
    rows: [
      sourceRow(),
      sourceRow({
        id: "snapshot-2",
        sourceCalculatedAt: new Date(secondAssembly.calculatedAt),
        capturedAt: new Date("2026-07-20T14:01:01.000Z"),
        sourceAssembly: secondAssembly,
      }),
    ],
    snapshotLimitReached: false,
  });
  assert.equal(run.timeline.events[1]?.eventType, "STATE_UNCHANGED");
  assert.equal(run.timeline.unchangedStateCount, 1);
});

test("a changed deterministic state creates a state-change event", () => {
  const changed = noSetupAssembly();
  const run = buildHistoricalReplayRunPayload({
    id: "run-1",
    createdAt: NOW,
    request: REQUEST,
    rows: [
      sourceRow(),
      sourceRow({
        id: "snapshot-2",
        sourceCalculatedAt: new Date("2026-07-20T14:01:00.000Z"),
        capturedAt: new Date("2026-07-20T14:01:01.000Z"),
        sourceAssembly: {
          ...changed,
          calculatedAt: "2026-07-20T14:01:00.000Z",
        },
        planState: "NO_SETUP",
        primaryReasonCode: "TRADE_PLAN_NO_SETUP",
      }),
    ],
    snapshotLimitReached: false,
  });
  assert.equal(run.timeline.events[1]?.eventType, "STATE_CHANGED");
  assert.equal(run.timeline.stateChangeCount, 1);
});

test("new market date starts a new replay session", () => {
  const next = validAssembly({
    currentMarketDate: "2026-07-21",
    calculatedAt: "2026-07-21T14:00:00.000Z",
    mostRecentRthSessionDate: "2026-07-20",
  });
  const run = buildHistoricalReplayRunPayload({
    id: "run-1",
    createdAt: NOW,
    request: REQUEST,
    rows: [
      sourceRow(),
      sourceRow({
        id: "snapshot-2",
        currentMarketDate: "2026-07-21",
        sourceCalculatedAt: new Date(next.calculatedAt),
        capturedAt: new Date("2026-07-21T14:00:01.000Z"),
        sourceAssembly: next,
      }),
    ],
    snapshotLimitReached: false,
  });
  assert.equal(run.timeline.sessions.length, 2);
  assert.equal(run.timeline.events[1]?.eventType, "SESSION_INITIAL");
});

test("post-hoc outcome totals are separate and deterministic", () => {
  const run = buildHistoricalReplayRunPayload({
    id: "run-1",
    createdAt: NOW,
    request: REQUEST,
    rows: [
      sourceRow({
        outcomeState: "WIN",
        realizedPnlDollars: 125,
        outcomeUpdatedAt: new Date("2026-07-20T16:00:00.000Z"),
      }),
      sourceRow({
        id: "snapshot-2",
        outcomeState: "LOSS",
        realizedPnlDollars: -50,
        outcomeUpdatedAt: new Date("2026-07-20T16:01:00.000Z"),
      }),
      sourceRow({
        id: "snapshot-3",
        outcomeState: "NO_TRADE",
        outcomeUpdatedAt: new Date("2026-07-20T16:02:00.000Z"),
      }),
    ],
    snapshotLimitReached: false,
  });
  assert.equal(run.outcomeSummary.tradeOutcomeCount, 2);
  assert.equal(run.outcomeSummary.noTradeCount, 1);
  assert.equal(run.outcomeSummary.totalPnlDollars, 75);
});

test("snapshot limit disclosure is retained", () => {
  const run = buildHistoricalReplayRunPayload({
    id: "run-1",
    createdAt: NOW,
    request: REQUEST,
    rows: [sourceRow()],
    snapshotLimitReached: true,
  });
  assert.equal(run.source.snapshotLimit, 1000);
  assert.equal(run.source.snapshotLimitReached, true);
});

test("passing, failing, and empty response reasons are distinct", () => {
  const passing = buildHistoricalReplayRunPayload({
    id: "pass",
    createdAt: NOW,
    request: REQUEST,
    rows: [sourceRow()],
    snapshotLimitReached: false,
  });
  const failing = buildHistoricalReplayRunPayload({
    id: "fail",
    createdAt: NOW,
    request: REQUEST,
    rows: [sourceRow({ sourceAssembly: null })],
    snapshotLimitReached: false,
  });
  const empty = buildHistoricalReplayRunPayload({
    id: "empty",
    createdAt: NOW,
    request: REQUEST,
    rows: [],
    snapshotLimitReached: false,
  });
  assert.equal(
    buildHistoricalReplayRunResponse(passing, NOW).primaryReasonCode,
    "REPLAY_COMPLETE",
  );
  assert.equal(
    buildHistoricalReplayRunResponse(failing, NOW).primaryReasonCode,
    "REPLAY_COMPLETE_WITH_AUDIT_FAILURES",
  );
  assert.equal(
    buildHistoricalReplayRunResponse(empty, NOW).primaryReasonCode,
    "REPLAY_EMPTY",
  );
});

test("full response validates against shared contract", () => {
  const run = buildHistoricalReplayRunPayload({
    id: "run-1",
    createdAt: NOW,
    request: REQUEST,
    rows: [sourceRow()],
    snapshotLimitReached: false,
  });
  assert.equal(
    HistoricalReplayRunResponseSchema.safeParse(
      buildHistoricalReplayRunResponse(run, NOW),
    ).success,
    true,
  );
});

test("history response is newest-first repository data and schema-valid", () => {
  const row = runRow();
  const response = buildHistoricalReplayHistoryResponse([row], NOW);
  assert.equal(response.runs[0]?.id, "run-1");
  assert.equal(
    HistoricalReplayHistoryResponseSchema.safeParse(response).success,
    true,
  );
});

test("run summary contains only compact persisted metrics", () => {
  const run = buildHistoricalReplayRunPayload({
    id: "run-1",
    createdAt: NOW,
    request: REQUEST,
    rows: [sourceRow()],
    snapshotLimitReached: false,
  });
  const summary = summarizeHistoricalReplayRun(run);
  assert.equal(summary.snapshotCount, 1);
  assert.equal("timeline" in summary, false);
  assert.equal("issues" in summary, false);
});

test("service persists a completed run exactly once", async () => {
  let insertCount = 0;
  const deps = dependencies({
    repository: {
      listSourceSnapshots: async () => [sourceRow()],
      insertRun: async () => {
        insertCount += 1;
      },
      listRuns: async () => [],
      getRun: async () => null,
    },
  });
  const response = await createHistoricalReplayRunWithDependencies(
    deps,
    REQUEST,
  );
  assert.equal(response.engineState, "AVAILABLE");
  assert.equal(insertCount, 1);
});

test("service reads at most 1001 rows to detect truncation", async () => {
  let requestedLimit = 0;
  const deps = dependencies({
    repository: {
      listSourceSnapshots: async (_userId, _request, limit) => {
        requestedLimit = limit;
        return [sourceRow()];
      },
      insertRun: async () => undefined,
      listRuns: async () => [],
      getRun: async () => null,
    },
  });
  await createHistoricalReplayRunWithDependencies(deps, REQUEST);
  assert.equal(requestedLimit, 1001);
});

test("database-not-configured create fails closed", async () => {
  const response = await createHistoricalReplayRunWithDependencies(
    dependencies({ databaseConfigured: () => false }),
    REQUEST,
  );
  assert.equal(response.engineState, "UNAVAILABLE");
  assert.equal(response.primaryReasonCode, "DATABASE_NOT_CONFIGURED");
});

test("missing replay run remains available and null", async () => {
  const response = await getHistoricalReplayRunWithDependencies(
    dependencies(),
    "missing",
  );
  assert.equal(response.primaryReasonCode, "REPLAY_RUN_NOT_FOUND");
  assert.equal(response.run, null);
});

test("history service remains available when empty", async () => {
  const response = await listHistoricalReplayRunsWithDependencies(
    dependencies(),
  );
  assert.equal(response.engineState, "AVAILABLE");
  assert.equal(response.primaryReasonCode, "REPLAY_HISTORY_EMPTY");
});

test("repository failure returns sanitized database-unavailable response", async () => {
  const response = await createHistoricalReplayRunWithDependencies(
    dependencies({
      repository: {
        listSourceSnapshots: async () => {
          throw new Error("private database error");
        },
        insertRun: async () => undefined,
        listRuns: async () => [],
        getRun: async () => null,
      },
    }),
    REQUEST,
  );
  assert.equal(response.primaryReasonCode, "DATABASE_UNAVAILABLE");
  assert.equal(JSON.stringify(response).includes("private database error"), false);
});

test("route is no-store, strict, and query rejecting", () => {
  const routeSource = readFileSync(
    resolve("apps/server/src/routes/historical-replay.routes.ts"),
    "utf8",
  );
  assert.match(routeSource, /Cache-Control/);
  assert.match(routeSource, /no-store/);
  assert.match(routeSource, /QUERY_PARAMETERS_NOT_SUPPORTED/);
  assert.match(routeSource, /HistoricalReplayRunRequestSchema\.safeParse/);
  assert.match(routeSource, /router\.post\("\/spy\/runs"/);
  assert.match(routeSource, /router\.get\("\/spy\/runs\/:runId"/);
});

test("replay source has no market provider, account, sizing, or execution dependency", () => {
  const serviceSource = readFileSync(
    resolve("apps/server/src/services/historical-replay.service.ts"),
    "utf8",
  );
  assert.doesNotMatch(serviceSource, /schwab-account/i);
  assert.doesNotMatch(serviceSource, /position-sizing/i);
  assert.doesNotMatch(serviceSource, /order execution/i);
  assert.match(serviceSource, /DeterministicJournalSnapshot/);
  assert.match(serviceSource, /HistoricalReplayRun/);
});

async function run(): Promise<void> {
  let passed = 0;
  for (const [name, fn] of tests) {
    try {
      await fn();
      passed += 1;
      console.log(`✓ ${name}`);
    } catch (error) {
      console.error(`✗ ${name}`);
      throw error;
    }
  }

  console.log(`\nHistorical replay tests: ${passed} passed, 0 failed`);
}

void run();
