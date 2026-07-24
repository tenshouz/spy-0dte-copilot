import { createHash } from "node:crypto";
import {
  TradingOpportunitySchema,
  type TradingOpportunity,
  type TradingOpportunityCandidate,
  type TradingRestrictionEvaluation,
  type TradingRiskLedger,
} from "@spy-copilot/shared";

const LIFECYCLE_PRIORITY: Record<TradingOpportunityCandidate["lifecycleState"], number> = {
  READY: 6,
  CONFIRMED: 5,
  ARMED: 4,
  DETECTED: 3,
  INVALIDATED: 2,
  UNAVAILABLE: 1,
};

function consolidateCandidates(
  candidates: TradingOpportunityCandidate[],
): TradingOpportunityCandidate[] {
  const groups = new Map<string, TradingOpportunityCandidate[]>();
  for (const candidate of candidates) {
    const key = [
      candidate.setupEpisodeId,
      candidate.direction,
      candidate.promotionStatus,
    ].join("|");
    const group = groups.get(key) ?? [];
    group.push(candidate);
    groups.set(key, group);
  }
  return [...groups.values()].map((group) =>
    [...group].sort((a, b) => {
      const lifecycle = LIFECYCLE_PRIORITY[b.lifecycleState] - LIFECYCLE_PRIORITY[a.lifecycleState];
      if (lifecycle !== 0) return lifecycle;
      const confidence = (b.confidenceScore ?? -1) - (a.confidenceScore ?? -1);
      if (confidence !== 0) return confidence;
      const source = a.source === "LEGACY_ASSEMBLY_BRIDGE" ? -1 : 1;
      if (a.source !== b.source) return source;
      return a.candidateId.localeCompare(b.candidateId);
    })[0]!,
  );
}

function stableOpportunityId(candidate: TradingOpportunityCandidate): string {
  return createHash("sha256")
    .update(
      [
        candidate.setupEpisodeId,
        candidate.direction,
        candidate.setupId,
        candidate.selectedContractSymbol ?? "no-contract",
      ].join("|"),
    )
    .digest("hex")
    .slice(0, 24);
}

function rankLiveCandidates(
  candidates: TradingOpportunityCandidate[],
): TradingOpportunityCandidate[] {
  return [...candidates].sort((a, b) => {
    const lifecycle = LIFECYCLE_PRIORITY[b.lifecycleState] - LIFECYCLE_PRIORITY[a.lifecycleState];
    if (lifecycle !== 0) return lifecycle;
    const confidence = (b.confidenceScore ?? -1) - (a.confidenceScore ?? -1);
    if (confidence !== 0) return confidence;
    return a.candidateId.localeCompare(b.candidateId);
  });
}

export interface BuildTradingOpportunityInput {
  marketDate: string;
  candidates: TradingOpportunityCandidate[];
  entryCutoffPassed: boolean;
  eventRestriction: TradingRestrictionEvaluation;
  riskLedger: TradingRiskLedger;
}

export function buildTradingOpportunity(
  input: BuildTradingOpportunityInput,
): TradingOpportunity {
  const candidates = consolidateCandidates(input.candidates);
  const shadowCandidateCount = candidates.filter(
    (candidate) => candidate.promotionStatus === "SHADOW",
  ).length;
  const liveCandidates = candidates.filter(
    (candidate) =>
      candidate.promotionStatus === "LIVE" &&
      candidate.lifecycleState !== "INVALIDATED" &&
      candidate.lifecycleState !== "UNAVAILABLE",
  );
  const liveCandidateCount = liveCandidates.length;
  const directions = new Set(liveCandidates.map((candidate) => candidate.direction));
  const directionalConflict = directions.size > 1;

  if (directionalConflict) {
    return TradingOpportunitySchema.parse({
      opportunityId: null,
      marketDate: input.marketDate,
      state: "NO_TRADE",
      direction: null,
      selectedCandidateId: null,
      consolidatedCandidateIds: liveCandidates.map((row) => row.candidateId).sort(),
      candidates,
      shadowCandidateCount,
      liveCandidateCount,
      directionalConflict: true,
      primaryReasonCode: "UNRESOLVED_CALL_PUT_CONFLICT_FAIL_CLOSED",
      warningCodes: ["DIRECTIONAL_CONFLICT"],
      entryCutoffPassed: input.entryCutoffPassed,
      eventRestriction: input.eventRestriction,
      riskLedgerPermitted: input.riskLedger.entryPermittedByLedger,
    });
  }

  const selected = rankLiveCandidates(liveCandidates)[0] ?? null;
  if (!selected) {
    return TradingOpportunitySchema.parse({
      opportunityId: null,
      marketDate: input.marketDate,
      state: shadowCandidateCount > 0 ? "NONE" : "NONE",
      direction: null,
      selectedCandidateId: null,
      consolidatedCandidateIds: [],
      candidates,
      shadowCandidateCount,
      liveCandidateCount,
      directionalConflict: false,
      primaryReasonCode:
        shadowCandidateCount > 0
          ? "SHADOW_OBSERVATIONS_ONLY"
          : "NO_ACTIVE_SETUP_CANDIDATE",
      warningCodes:
        shadowCandidateCount > 0 ? ["SHADOW_MODE_RESEARCH_ONLY"] : [],
      entryCutoffPassed: input.entryCutoffPassed,
      eventRestriction: input.eventRestriction,
      riskLedgerPermitted: input.riskLedger.entryPermittedByLedger,
    });
  }

  const opportunityId = stableOpportunityId(selected);
  const consolidatedCandidateIds = liveCandidates
    .filter(
      (candidate) =>
        candidate.direction === selected.direction &&
        candidate.setupEpisodeId === selected.setupEpisodeId,
    )
    .map((candidate) => candidate.candidateId)
    .sort();

  let state: TradingOpportunity["state"];
  let primaryReasonCode: string;
  const warningCodes = [...selected.warningCodes];

  if (input.entryCutoffPassed) {
    state = "BLOCKED";
    primaryReasonCode = "LATEST_NEW_ENTRY_TIME_REACHED";
    warningCodes.push("ENTRY_TIME_BLOCK");
  } else if (input.eventRestriction.blocked) {
    state = "BLOCKED";
    primaryReasonCode = input.eventRestriction.primaryReasonCode;
    warningCodes.push("SCHEDULED_EVENT_RESTRICTION");
  } else if (!input.riskLedger.entryPermittedByLedger) {
    state = "BLOCKED";
    primaryReasonCode =
      input.riskLedger.primaryBlockReasonCode ?? "RISK_LEDGER_BLOCKED";
    warningCodes.push("TRADING_POLICY_RISK_BLOCK");
  } else if (selected.lifecycleState === "READY" && selected.liveEligible) {
    state = "READY";
    primaryReasonCode = "LIVE_OPPORTUNITY_READY_FOR_MANUAL_CONFIRMATION";
  } else if (selected.lifecycleState === "UNAVAILABLE") {
    state = "UNAVAILABLE";
    primaryReasonCode = "SETUP_SOURCE_UNAVAILABLE";
  } else {
    state = "WAITING";
    primaryReasonCode =
      selected.lifecycleState === "READY"
        ? "READY_SETUP_FAILED_LIVE_CONTRACT_OR_QUALITY_GATE"
        : `SETUP_${selected.lifecycleState}`;
  }

  return TradingOpportunitySchema.parse({
    opportunityId,
    marketDate: input.marketDate,
    state,
    direction: selected.direction,
    selectedCandidateId: selected.candidateId,
    consolidatedCandidateIds,
    candidates,
    shadowCandidateCount,
    liveCandidateCount,
    directionalConflict: false,
    primaryReasonCode,
    warningCodes: [...new Set(warningCodes)].sort(),
    entryCutoffPassed: input.entryCutoffPassed,
    eventRestriction: input.eventRestriction,
    riskLedgerPermitted: input.riskLedger.entryPermittedByLedger,
  });
}

export function getSelectedOpportunityCandidate(
  opportunity: TradingOpportunity,
): TradingOpportunityCandidate | null {
  if (!opportunity.selectedCandidateId) return null;
  return (
    opportunity.candidates.find(
      (candidate) => candidate.candidateId === opportunity.selectedCandidateId,
    ) ?? null
  );
}
