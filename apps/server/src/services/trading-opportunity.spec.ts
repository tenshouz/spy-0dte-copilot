import assert from "node:assert/strict";
import type { TradingOpportunityCandidate } from "@spy-copilot/shared";
import { buildTradingRiskLedger, evaluateTradingRestrictions } from "./trading-policy.logic";
import { buildTradingOpportunity, getSelectedOpportunityCandidate } from "./trading-opportunity.logic";

let passed = 0;
function test(name: string, fn: () => void): void {
  fn();
  passed += 1;
  console.log(`✓ ${name}`);
}

function candidate(overrides: Partial<TradingOpportunityCandidate> = {}): TradingOpportunityCandidate {
  return {
    candidateId: "c1",
    setupId: "VWAP_RECLAIM",
    setupEpisodeId: "episode-1",
    promotionStatus: "LIVE",
    direction: "CALLS",
    lifecycleState: "READY",
    source: "LEGACY_ASSEMBLY_BRIDGE",
    triggerLevel: 500,
    levelType: "VWAP",
    invalidationLevel: 499,
    target1Level: 501,
    target2Level: 502,
    target3Level: 503,
    underlyingRewardRiskRatio: 2,
    optionRewardRiskRatio: 2,
    confidenceScore: 80,
    selectedContractSymbol: "SPY   260723C00500000",
    selectedContractAsk: 1.2,
    selectedContractBid: 1.1,
    selectedContractStrike: 500,
    selectedContractExpiration: "2026-07-23",
    selectedContractQuoteAt: "2026-07-23T14:00:00.000Z",
    reasonCodes: ["READY"],
    warningCodes: [],
    liveEligible: true,
    ...overrides,
  };
}

function ledger(overrides: Partial<Parameters<typeof buildTradingRiskLedger>[0]> = {}) {
  return buildTradingRiskLedger({ marketDate: "2026-07-23", closedPositions: [], openPositions: [], tradeCount: 0, attemptsForCurrentEpisode: 0, ...overrides });
}

function restrictions(blocked = false) {
  return evaluateTradingRestrictions(
    blocked
      ? [{ id: "event", marketDate: "2026-07-23", eventType: "FOMC", title: "FOMC", blockMode: "FULL_DAY", windowStartAt: null, windowEndAt: null, enabled: true, createdAt: "2026-07-22T00:00:00.000Z", updatedAt: "2026-07-22T00:00:00.000Z" }]
      : [],
    "2026-07-23",
    Date.parse("2026-07-23T14:00:00Z"),
  );
}

function build(candidates: TradingOpportunityCandidate[], extra: Partial<Parameters<typeof buildTradingOpportunity>[0]> = {}) {
  return buildTradingOpportunity({ marketDate: "2026-07-23", candidates, entryCutoffPassed: false, eventRestriction: restrictions(), riskLedger: ledger(), ...extra });
}

test("duplicate signals in one episode consolidate deterministically", () => {
  const result = build([
    candidate({ candidateId: "lower", confidenceScore: 70 }),
    candidate({ candidateId: "higher", confidenceScore: 90 }),
  ]);
  assert.equal(result.candidates.length, 1);
  assert.equal(result.selectedCandidateId, "higher");
  assert.equal(result.state, "READY");
  assert.equal(result.opportunityId?.length, 24);
});

test("unresolved CALL/PUT live conflict fails closed as NO TRADE", () => {
  const result = build([
    candidate(),
    candidate({ candidateId: "put", setupId: "VWAP_LOSS", setupEpisodeId: "episode-2", direction: "PUTS", selectedContractSymbol: "SPY   260723P00500000" }),
  ]);
  assert.equal(result.state, "NO_TRADE");
  assert.equal(result.direction, null);
  assert.equal(result.directionalConflict, true);
  assert.equal(result.primaryReasonCode, "UNRESOLVED_CALL_PUT_CONFLICT_FAIL_CLOSED");
});

test("shadow-only observations can never create a READY opportunity", () => {
  const result = build([candidate({ promotionStatus: "SHADOW", liveEligible: false, selectedContractSymbol: null, selectedContractAsk: null, selectedContractBid: null, selectedContractStrike: null, selectedContractExpiration: null, selectedContractQuoteAt: null })]);
  assert.equal(result.state, "NONE");
  assert.equal(result.selectedCandidateId, null);
  assert.equal(result.primaryReasonCode, "SHADOW_OBSERVATIONS_ONLY");
});

test("entry cutoff blocks an otherwise READY opportunity", () => {
  const result = build([candidate()], { entryCutoffPassed: true });
  assert.equal(result.state, "BLOCKED");
  assert.equal(result.primaryReasonCode, "LATEST_NEW_ENTRY_TIME_REACHED");
});

test("scheduled event restriction blocks an otherwise READY opportunity", () => {
  const result = build([candidate()], { eventRestriction: restrictions(true) });
  assert.equal(result.state, "BLOCKED");
  assert.equal(result.primaryReasonCode, "FULL_DAY_EVENT_BLOCK");
});

test("risk-ledger block propagates the exact controlling reason", () => {
  const result = build([candidate()], { riskLedger: ledger({ tradeCount: 3 }) });
  assert.equal(result.state, "BLOCKED");
  assert.equal(result.primaryReasonCode, "TRADE_COUNT_LIMIT_REACHED");
});

test("READY setup without a qualified strict-ATM contract remains WAITING", () => {
  const result = build([candidate({ liveEligible: false, selectedContractSymbol: null, selectedContractAsk: null, selectedContractBid: null, selectedContractStrike: null, selectedContractExpiration: null, selectedContractQuoteAt: null })]);
  assert.equal(result.state, "WAITING");
  assert.equal(result.primaryReasonCode, "READY_SETUP_FAILED_LIVE_CONTRACT_OR_QUALITY_GATE");
});

test("stable inputs produce a stable opportunity identity", () => {
  const first = build([candidate()]);
  const second = build([candidate()]);
  assert.equal(first.opportunityId, second.opportunityId);
  assert.equal(getSelectedOpportunityCandidate(first)?.candidateId, "c1");
});

console.log(`\n${passed} trading-opportunity tests passed.`);
