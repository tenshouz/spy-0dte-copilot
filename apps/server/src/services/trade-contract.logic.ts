import {
  SpyZeroDteContractSelectionResponseSchema,
  type ContractCandidateRejectionReasonCode,
  type ContractCandidateSourceStatus,
  type ContractCandidateWarningCode,
  type ContractMoneyness,
  type ContractQuoteFreshnessState,
  type ContractSelectionCandidate,
  type ContractSelectionOverallWarningCode,
  type ContractSelectionPrimaryReasonCode,
  type ContractSourceCompatibilityState,
  type NormalizedOptionContract,
  type SelectedContractDirection,
  type SpyZeroDteContractSelectionResponse,
  type SpyZeroDteObjectiveRiskResponse,
  type SpyZeroDteOptionsChainResponse,
} from "@spy-copilot/shared";

export const CONTRACT_METHODOLOGY_VERSION = "CONTRACT_V1" as const;
export const MAXIMUM_SPREAD_RATIO = 0.15;
export const MAXIMUM_SOURCE_ASSEMBLY_SKEW_MS = 60_000;
export const MAXIMUM_CONTRACT_QUOTE_AGE_MS = 60_000;

const EMPTY_SELECTED_CONTRACT = {
  candidateId: null,
  contractSymbol: null,
  contractDirection: null,
  strikePrice: null,
  expirationDate: null,
  moneyness: null,
  bid: null,
  ask: null,
  calculatedMidpoint: null,
  spreadPoints: null,
  spreadRatio: null,
  spreadPercent: null,
  quoteAt: null,
  quoteFreshnessState: null,
  strikeDistancePoints: null,
  selectionRank: null,
} as const;

const EMPTY_PREMIUM_REFERENCE = {
  type: "UNAVAILABLE" as const,
  value: null,
  disclosureCode: "MIDPOINT_REFERENCE_ONLY" as const,
};

const METHODOLOGY = {
  maximumSpreadRatio: 0.15 as const,
  maximumSpreadPercent: 15 as const,
  maximumSourceAssemblySkewMilliseconds: 60_000 as const,
  maximumContractQuoteAgeMilliseconds: 60_000 as const,
  quoteFreshnessPolicy: "NORMALIZED_QUOTE_AT_EPOCH_MILLISECONDS" as const,
  sourceAssemblySkewPolicy: "RISK_CALCULATED_AT_VS_CHAIN_FETCHED_AT" as const,
  rankingMethod: "ATM_PROXIMITY_THEN_LIQUIDITY_TIE_BREAKS" as const,
  itmExactDistanceTiePreference: true as const,
  openInterestHardMinimum: null,
  volumeHardMinimum: null,
  deltaHardRange: null,
  gammaHardRange: null,
  thetaHardRange: null,
  impliedVolatilityHardRange: null,
  evaluationScope: "RETURNED_CHAIN_WINDOW_SELECTED_SIDE" as const,
  calculationsUse: "OPTIONS_CHAIN_BID_ASK_AND_CHAIN_UNDERLYING" as const,
  midpointDisclosureCode: "MIDPOINT_REFERENCE_ONLY" as const,
  thresholdPolicy: "EXPLICIT_CONTRACT_V1_PRODUCT_POLICY_NOT_BACKTESTED" as const,
};

function finite(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function finitePositive(value: unknown): value is number {
  return finite(value) && value > 0;
}

function selectedDirection(risk: SpyZeroDteObjectiveRiskResponse): SelectedContractDirection {
  if (risk.direction === "CALLS") return "CALL";
  if (risk.direction === "PUTS") return "PUT";
  if (risk.direction === "UNAVAILABLE") return "UNAVAILABLE";
  return "NONE";
}

export function contractSelectionRequiresOptionsChain(
  risk: SpyZeroDteObjectiveRiskResponse,
): boolean {
  return (
    risk.frameworkState === "READY" &&
    risk.riskQualification === "QUALIFIED" &&
    risk.isCurrentlyTradeEligible &&
    risk.sameSnapshotGuaranteed &&
    (risk.direction === "CALLS" || risk.direction === "PUTS")
  );
}

export interface QuoteFreshnessResult {
  state: ContractQuoteFreshnessState;
  ageMilliseconds: number | null;
}

export function classifyContractQuoteFreshness(
  quoteAt: string | null,
  evaluationTimeMs: number,
): QuoteFreshnessResult {
  if (quoteAt === null) return { state: "UNKNOWN", ageMilliseconds: null };
  const quoteMs = Date.parse(quoteAt);
  if (!Number.isFinite(evaluationTimeMs) || Number.isNaN(quoteMs)) {
    return { state: "UNAVAILABLE", ageMilliseconds: null };
  }
  const ageMilliseconds = evaluationTimeMs - quoteMs;
  if (!Number.isFinite(ageMilliseconds)) {
    return { state: "UNAVAILABLE", ageMilliseconds: null };
  }
  if (ageMilliseconds < 0) return { state: "UNKNOWN", ageMilliseconds: null };
  if (ageMilliseconds <= MAXIMUM_CONTRACT_QUOTE_AGE_MS) {
    return { state: "FRESH", ageMilliseconds };
  }
  return { state: "STALE", ageMilliseconds };
}

export function calculateContractMoneyness(
  direction: "CALL" | "PUT",
  strikePrice: number,
  chainUnderlyingPrice: number,
): ContractMoneyness {
  if (!finitePositive(strikePrice) || !finitePositive(chainUnderlyingPrice)) return "UNAVAILABLE";
  if (strikePrice === chainUnderlyingPrice) return "ATM";
  if (direction === "CALL") return strikePrice < chainUnderlyingPrice ? "ITM" : "OTM";
  return strikePrice > chainUnderlyingPrice ? "ITM" : "OTM";
}

export interface ContractLiquidityCalculation {
  midpoint: number | null;
  spreadPoints: number | null;
  spreadRatio: number | null;
  spreadPercent: number | null;
}

export function calculateContractLiquidity(
  bid: number | null,
  ask: number | null,
): ContractLiquidityCalculation {
  if (!finite(bid) || !finite(ask) || ask < bid) {
    return { midpoint: null, spreadPoints: null, spreadRatio: null, spreadPercent: null };
  }
  const midpoint = (bid + ask) / 2;
  const spreadPoints = ask - bid;
  if (!finitePositive(midpoint) || !finite(spreadPoints) || spreadPoints < 0) {
    return { midpoint: null, spreadPoints: null, spreadRatio: null, spreadPercent: null };
  }
  const spreadRatio = spreadPoints / midpoint;
  const spreadPercent = spreadRatio * 100;
  if (!finite(spreadRatio) || spreadRatio < 0 || !finite(spreadPercent) || spreadPercent < 0) {
    return { midpoint, spreadPoints, spreadRatio: null, spreadPercent: null };
  }
  return { midpoint, spreadPoints, spreadRatio, spreadPercent };
}

interface CompatibilityResult {
  state: ContractSourceCompatibilityState;
  skewMilliseconds: number | null;
  primaryReasonCode: ContractSelectionPrimaryReasonCode | null;
  warningCode: ContractSelectionOverallWarningCode | null;
}

export function evaluateContractSourceCompatibility(
  risk: SpyZeroDteObjectiveRiskResponse,
  chain: SpyZeroDteOptionsChainResponse,
): CompatibilityResult {
  const riskMs = Date.parse(risk.calculatedAt);
  const chainMs = Date.parse(chain.fetchedAt);
  const skewMilliseconds =
    Number.isNaN(riskMs) || Number.isNaN(chainMs) ? null : Math.abs(riskMs - chainMs);

  if (chain.metricState === "UNAVAILABLE" || chain.sourceState === "UNAVAILABLE") {
    return {
      state: "UNAVAILABLE",
      skewMilliseconds,
      primaryReasonCode: "OPTIONS_CHAIN_UNAVAILABLE",
      warningCode: "OPTIONS_CHAIN_UNAVAILABLE",
    };
  }

  if (chain.currentMarketDate !== risk.currentMarketDate) {
    return {
      state: "INCOMPATIBLE",
      skewMilliseconds,
      primaryReasonCode: "OPTIONS_CHAIN_EXPIRATION_MISMATCH",
      warningCode: "CURRENT_EXPIRATION_MISMATCH",
    };
  }

  if (
    chain.returnedExpirationDate !== risk.currentMarketDate ||
    chain.requestedExpirationDate !== risk.currentMarketDate
  ) {
    return {
      state: "INCOMPATIBLE",
      skewMilliseconds,
      primaryReasonCode: "OPTIONS_CHAIN_EXPIRATION_MISMATCH",
      warningCode: "CURRENT_EXPIRATION_MISMATCH",
    };
  }

  if (chain.isDelayed !== false) {
    return {
      state: "INCOMPATIBLE",
      skewMilliseconds,
      primaryReasonCode: "OPTIONS_CHAIN_DELAYED",
      warningCode: "OPTIONS_CHAIN_DELAYED",
    };
  }

  if (skewMilliseconds === null) {
    return {
      state: "UNAVAILABLE",
      skewMilliseconds,
      primaryReasonCode: "OPTIONS_CHAIN_UNAVAILABLE",
      warningCode: "INSUFFICIENT_CONTRACT_DATA",
    };
  }

  if (skewMilliseconds > MAXIMUM_SOURCE_ASSEMBLY_SKEW_MS) {
    return {
      state: "INCOMPATIBLE",
      skewMilliseconds,
      primaryReasonCode: "SOURCE_ASSEMBLY_SKEW_EXCEEDED",
      warningCode: "SOURCE_ASSEMBLY_SKEW_EXCEEDED",
    };
  }

  if (
    chain.metricState !== "LIVE" ||
    chain.sourceState !== "LIVE" ||
    chain.warningCode === "RETAINED_STALE_CHAIN"
  ) {
    return {
      state: "PARTIAL",
      skewMilliseconds,
      primaryReasonCode: "OPTIONS_CHAIN_STALE",
      warningCode: "OPTIONS_CHAIN_STALE",
    };
  }

  if (!finitePositive(chain.underlyingPrice)) {
    return {
      state: "UNAVAILABLE",
      skewMilliseconds,
      primaryReasonCode: "OPTIONS_CHAIN_UNAVAILABLE",
      warningCode: "INSUFFICIENT_CONTRACT_DATA",
    };
  }

  return {
    state: "COMPATIBLE",
    skewMilliseconds,
    primaryReasonCode: null,
    warningCode: null,
  };
}

function pushReason(
  reasons: ContractCandidateRejectionReasonCode[],
  reason: ContractCandidateRejectionReasonCode,
): void {
  if (!reasons.includes(reason)) reasons.push(reason);
}

function buildCandidate(
  contract: NormalizedOptionContract,
  direction: "CALL" | "PUT",
  currentMarketDate: string,
  chainUnderlyingPrice: number | null,
  compatibilityState: ContractSourceCompatibilityState,
  evaluationTimeMs: number,
): ContractSelectionCandidate {
  const reasons: ContractCandidateRejectionReasonCode[] = [];

  const requiredMissing =
    contract.nonStandard === null ||
    contract.mini === null ||
    contract.multiplier === null ||
    contract.bid === null ||
    contract.ask === null ||
    contract.quoteAt === null;

  let sourceStatus: ContractCandidateSourceStatus = requiredMissing ? "PARTIAL" : "AVAILABLE";
  if (compatibilityState === "PARTIAL") sourceStatus = "PARTIAL";
  if (sourceStatus === "PARTIAL") pushReason(reasons, "SOURCE_PARTIAL");

  if (contract.optionType !== direction) pushReason(reasons, "CONTRACT_DIRECTION_MISMATCH");
  if (contract.expirationDate !== currentMarketDate) pushReason(reasons, "EXPIRATION_MISMATCH");

  if (contract.nonStandard === null) pushReason(reasons, "STANDARD_STATUS_UNAVAILABLE");
  else if (contract.nonStandard) pushReason(reasons, "NON_STANDARD_CONTRACT");

  if (contract.mini === null) pushReason(reasons, "MINI_STATUS_UNAVAILABLE");
  else if (contract.mini) pushReason(reasons, "MINI_CONTRACT");

  if (contract.multiplier !== 100) pushReason(reasons, "MULTIPLIER_MISMATCH");

  if (!finite(contract.strikePrice)) pushReason(reasons, "STRIKE_NOT_FINITE");
  else if (contract.strikePrice <= 0) pushReason(reasons, "STRIKE_NOT_POSITIVE");

  if (!finite(contract.bid)) pushReason(reasons, "BID_NOT_FINITE");
  else if (contract.bid <= 0) pushReason(reasons, "BID_NOT_POSITIVE");

  if (!finite(contract.ask)) pushReason(reasons, "ASK_NOT_FINITE");
  else if (contract.ask <= 0) pushReason(reasons, "ASK_NOT_POSITIVE");

  if (finite(contract.bid) && finite(contract.ask) && contract.ask < contract.bid) {
    pushReason(reasons, "CROSSED_QUOTE");
  }

  const liquidity = calculateContractLiquidity(contract.bid, contract.ask);
  if (
    finite(contract.bid) &&
    finite(contract.ask) &&
    contract.ask >= contract.bid &&
    liquidity.midpoint === null
  ) {
    pushReason(reasons, "MIDPOINT_NOT_POSITIVE");
  }
  if (liquidity.midpoint !== null && liquidity.spreadPoints === null) {
    pushReason(reasons, "SPREAD_NOT_FINITE");
  }
  if (liquidity.spreadPoints !== null && liquidity.spreadRatio === null) {
    pushReason(reasons, "SPREAD_RATIO_NOT_FINITE");
  }
  if (liquidity.spreadRatio !== null && liquidity.spreadRatio > MAXIMUM_SPREAD_RATIO) {
    pushReason(reasons, "SPREAD_EXCEEDS_MAXIMUM");
  }

  const underlyingValid = finitePositive(chainUnderlyingPrice);
  if (!underlyingValid) pushReason(reasons, "CHAIN_UNDERLYING_PRICE_INVALID");

  const strikeDistancePoints = underlyingValid
    ? Math.abs(contract.strikePrice - chainUnderlyingPrice)
    : null;
  const moneyness = underlyingValid
    ? calculateContractMoneyness(direction, contract.strikePrice, chainUnderlyingPrice)
    : "UNAVAILABLE";

  const freshness = classifyContractQuoteFreshness(contract.quoteAt, evaluationTimeMs);
  if (freshness.state === "UNKNOWN" || freshness.state === "UNAVAILABLE") {
    pushReason(reasons, "CONTRACT_QUOTE_FRESHNESS_UNKNOWN");
  } else if (freshness.state === "STALE") {
    pushReason(reasons, "CONTRACT_QUOTE_STALE");
  }

  let warningCode: ContractCandidateWarningCode | null = null;
  if (freshness.state === "STALE") warningCode = "CONTRACT_QUOTE_STALE";
  else if (freshness.state === "UNKNOWN" || freshness.state === "UNAVAILABLE") {
    warningCode = "CONTRACT_QUOTE_TIMESTAMP_UNAVAILABLE";
  } else if (sourceStatus === "PARTIAL") warningCode = "SOURCE_PARTIAL";

  const selectable = reasons.length === 0 && compatibilityState === "COMPATIBLE";

  return {
    candidateId: contract.contractSymbol,
    contractSymbol: contract.contractSymbol,
    contractDirection: direction,
    description: contract.description,
    strikePrice: contract.strikePrice,
    expirationDate: contract.expirationDate,
    nonStandard: contract.nonStandard,
    mini: contract.mini,
    multiplier: contract.multiplier,
    sourceStatus,
    eligibilityStatus: selectable ? "SELECTABLE" : "REJECTED",
    selectable,
    moneyness,
    providerInTheMoney: contract.inTheMoney,
    chainUnderlyingPrice: underlyingValid ? chainUnderlyingPrice : null,
    strikeDistancePoints:
      strikeDistancePoints !== null && Number.isFinite(strikeDistancePoints)
        ? strikeDistancePoints
        : null,
    bid: contract.bid,
    ask: contract.ask,
    calculatedMidpoint: liquidity.midpoint,
    providerMark: contract.mark,
    spreadPoints: liquidity.spreadPoints,
    spreadRatio: liquidity.spreadRatio,
    spreadPercent: liquidity.spreadPercent,
    bidSize: contract.bidSize,
    askSize: contract.askSize,
    openInterest: contract.openInterest,
    volume: contract.volume,
    delta: contract.delta,
    gamma: contract.gamma,
    theta: contract.theta,
    vega: contract.vega,
    rho: contract.rho,
    impliedVolatilityPercent: contract.impliedVolatilityPercent,
    quoteAt: contract.quoteAt,
    tradeAt: contract.tradeAt,
    quoteAgeMilliseconds: freshness.ageMilliseconds,
    quoteFreshnessState: freshness.state,
    selectionRank: null,
    rejectionReasonCodes: reasons,
    warningCode,
  };
}

function moneynessPriority(value: ContractMoneyness): number {
  if (value === "ITM") return 0;
  if (value === "ATM") return 1;
  if (value === "OTM") return 2;
  return 3;
}

function descendingNullable(a: number | null, b: number | null): number {
  const av = a === null ? Number.NEGATIVE_INFINITY : a;
  const bv = b === null ? Number.NEGATIVE_INFINITY : b;
  return bv - av;
}

export function rankContractCandidates(
  candidates: ContractSelectionCandidate[],
  direction: "CALL" | "PUT",
): ContractSelectionCandidate[] {
  const ranked = candidates
    .filter((candidate) => candidate.selectable)
    .slice()
    .sort((a, b) => {
      const distance = (a.strikeDistancePoints ?? Number.POSITIVE_INFINITY) -
        (b.strikeDistancePoints ?? Number.POSITIVE_INFINITY);
      if (distance !== 0) return distance;

      const moneyness = moneynessPriority(a.moneyness) - moneynessPriority(b.moneyness);
      if (moneyness !== 0) return moneyness;

      const spread = (a.spreadRatio ?? Number.POSITIVE_INFINITY) -
        (b.spreadRatio ?? Number.POSITIVE_INFINITY);
      if (spread !== 0) return spread;

      const oi = descendingNullable(a.openInterest, b.openInterest);
      if (oi !== 0) return oi;

      const volume = descendingNullable(a.volume, b.volume);
      if (volume !== 0) return volume;

      const strike = direction === "CALL"
        ? a.strikePrice - b.strikePrice
        : b.strikePrice - a.strikePrice;
      if (strike !== 0) return strike;

      return a.contractSymbol.localeCompare(b.contractSymbol);
    });

  const rankById = new Map(ranked.map((candidate, index) => [candidate.candidateId, index + 1]));
  return candidates.map((candidate) => ({
    ...candidate,
    selectionRank: rankById.get(candidate.candidateId) ?? null,
  }));
}

export interface ContractSelectionChainDependencies {
  getOptionsChain: () => Promise<SpyZeroDteOptionsChainResponse>;
  getLastResortOptionsChain: () => SpyZeroDteOptionsChainResponse;
  now: () => number;
}

export async function resolveSpyZeroDteContractSelectionFromRisk(
  risk: SpyZeroDteObjectiveRiskResponse,
  dependencies: ContractSelectionChainDependencies,
): Promise<SpyZeroDteContractSelectionResponse> {
  if (!contractSelectionRequiresOptionsChain(risk)) {
    return buildSpyZeroDteContractSelection(risk, null, dependencies.now());
  }

  let chain: SpyZeroDteOptionsChainResponse;
  try {
    chain = await dependencies.getOptionsChain();
  } catch {
    chain = dependencies.getLastResortOptionsChain();
  }
  return buildSpyZeroDteContractSelection(risk, chain, dependencies.now());
}

function baseResponse(
  risk: SpyZeroDteObjectiveRiskResponse,
  calculatedAtMs: number,
): Omit<
  SpyZeroDteContractSelectionResponse,
  | "sourceOptionsChainFetchedAt"
  | "sourceOptionsChainMetricState"
  | "sourceOptionsChainSourceState"
  | "sourceOptionsChainWarningCode"
  | "sourceOptionsChainIsDelayed"
  | "sourceOptionsChainLatestQuoteAt"
  | "sourceOptionsChainLatestTradeAt"
  | "sourceCompatibilityState"
  | "sourceAssemblySkewMilliseconds"
  | "engineState"
  | "selectionState"
  | "contractDirection"
  | "chainUnderlyingPrice"
  | "underlyingPriceDifferencePoints"
  | "expirationDate"
  | "evaluatedCandidateCount"
  | "selectableCandidateCount"
  | "rejectedCandidateCount"
  | "unavailableCandidateCount"
  | "candidates"
  | "selectedContract"
  | "premiumReference"
  | "primaryReasonCode"
  | "warningCode"
> {
  return {
    symbol: "SPY",
    product: "SPY_ZERO_DTE_DETERMINISTIC_CONTRACT_SELECTION_LIQUIDITY",
    methodologyVersion: CONTRACT_METHODOLOGY_VERSION,
    currentMarketDate: risk.currentMarketDate,
    mostRecentRthSessionDate: risk.mostRecentRthSessionDate,
    sourceMarketStateCalculatedAt: risk.sourceMarketStateCalculatedAt,
    sourceBiasMarketStateCalculatedAt: risk.sourceBiasMarketStateCalculatedAt,
    sourceBiasCalculatedAt: risk.sourceBiasCalculatedAt,
    sourceTradePlanMarketStateCalculatedAt: risk.sourceTradePlanMarketStateCalculatedAt,
    sourceTradePlanBiasCalculatedAt: risk.sourceTradePlanBiasCalculatedAt,
    sourceTradePlanCalculatedAt: risk.sourceTradePlanCalculatedAt,
    sourceRiskMarketStateCalculatedAt: risk.sourceMarketStateCalculatedAt,
    sourceRiskBiasCalculatedAt: risk.sourceBiasCalculatedAt,
    sourceRiskTradePlanCalculatedAt: risk.sourceTradePlanCalculatedAt,
    sourceRiskCalculatedAt: risk.calculatedAt,
    upstreamSameSnapshotGuaranteed: risk.sameSnapshotGuaranteed,
    calculatedAt: new Date(calculatedAtMs).toISOString(),
    sourceRiskFrameworkState: risk.frameworkState,
    sourceRiskQualification: risk.riskQualification,
    sourceRiskDirection: risk.direction,
    sourceRiskIsCurrentlyTradeEligible: risk.isCurrentlyTradeEligible,
    riskCurrentPrice: risk.currentPrice,
    evaluationScope: "RETURNED_CHAIN_WINDOW_SELECTED_SIDE",
    methodology: METHODOLOGY,
  };
}

function noChainResponse(
  risk: SpyZeroDteObjectiveRiskResponse,
  calculatedAtMs: number,
): SpyZeroDteContractSelectionResponse {
  const base = baseResponse(risk, calculatedAtMs);
  let engineState: "AVAILABLE" | "UNAVAILABLE" = "AVAILABLE";
  let selectionState: SpyZeroDteContractSelectionResponse["selectionState"];
  let contractDirection = selectedDirection(risk);
  let primaryReasonCode: ContractSelectionPrimaryReasonCode;
  let warningCode: ContractSelectionOverallWarningCode | null = null;
  let sourceCompatibilityState: ContractSourceCompatibilityState = "NOT_EVALUATED";

  switch (risk.frameworkState) {
    case "PREVIEW":
      selectionState = "DEFERRED";
      primaryReasonCode = "CONTRACT_SELECTION_DEFERRED_UNTIL_SETUP_READY";
      break;
    case "NOT_QUALIFIED":
      selectionState = "NOT_APPLICABLE";
      contractDirection = "NONE";
      primaryReasonCode = "SOURCE_RISK_NOT_QUALIFIED";
      break;
    case "NO_SETUP":
      selectionState = "NOT_APPLICABLE";
      contractDirection = "NONE";
      primaryReasonCode = "SOURCE_RISK_NO_SETUP";
      break;
    case "NOT_APPLICABLE":
      selectionState = "NOT_APPLICABLE";
      contractDirection = "NONE";
      primaryReasonCode = "SOURCE_RISK_NOT_APPLICABLE";
      break;
    case "UNAVAILABLE":
      engineState = "UNAVAILABLE";
      selectionState = "UNAVAILABLE";
      contractDirection = "UNAVAILABLE";
      primaryReasonCode = "SOURCE_RISK_UNAVAILABLE";
      warningCode = "RISK_FRAMEWORK_UNAVAILABLE";
      sourceCompatibilityState = "UNAVAILABLE";
      break;
    case "READY":
    default:
      engineState = "UNAVAILABLE";
      selectionState = "UNAVAILABLE";
      contractDirection = "UNAVAILABLE";
      primaryReasonCode = "OPTIONS_CHAIN_UNAVAILABLE";
      warningCode = "OPTIONS_CHAIN_UNAVAILABLE";
      sourceCompatibilityState = "UNAVAILABLE";
      break;
  }

  return SpyZeroDteContractSelectionResponseSchema.parse({
    ...base,
    sourceOptionsChainFetchedAt: null,
    sourceOptionsChainMetricState: null,
    sourceOptionsChainSourceState: null,
    sourceOptionsChainWarningCode: null,
    sourceOptionsChainIsDelayed: null,
    sourceOptionsChainLatestQuoteAt: null,
    sourceOptionsChainLatestTradeAt: null,
    sourceCompatibilityState,
    sourceAssemblySkewMilliseconds: null,
    engineState,
    selectionState,
    contractDirection,
    chainUnderlyingPrice: null,
    underlyingPriceDifferencePoints: null,
    expirationDate: null,
    evaluatedCandidateCount: 0,
    selectableCandidateCount: 0,
    rejectedCandidateCount: 0,
    unavailableCandidateCount: 0,
    candidates: [],
    selectedContract: EMPTY_SELECTED_CONTRACT,
    premiumReference: EMPTY_PREMIUM_REFERENCE,
    primaryReasonCode,
    warningCode,
  });
}

export function buildSpyZeroDteContractSelection(
  risk: SpyZeroDteObjectiveRiskResponse,
  chain: SpyZeroDteOptionsChainResponse | null,
  calculatedAtMs: number,
): SpyZeroDteContractSelectionResponse {
  if (!contractSelectionRequiresOptionsChain(risk)) {
    return noChainResponse(risk, calculatedAtMs);
  }

  if (chain === null) return noChainResponse(risk, calculatedAtMs);

  const base = baseResponse(risk, calculatedAtMs);
  const direction = selectedDirection(risk);
  const compatibility = evaluateContractSourceCompatibility(risk, chain);
  const underlyingDifference =
    finite(chain.underlyingPrice) && finite(risk.currentPrice)
      ? chain.underlyingPrice - risk.currentPrice
      : null;

  if (compatibility.state === "UNAVAILABLE" || compatibility.state === "INCOMPATIBLE") {
    return SpyZeroDteContractSelectionResponseSchema.parse({
      ...base,
      sourceOptionsChainFetchedAt: chain.fetchedAt,
      sourceOptionsChainMetricState: chain.metricState,
      sourceOptionsChainSourceState: chain.sourceState,
      sourceOptionsChainWarningCode: chain.warningCode,
      sourceOptionsChainIsDelayed: chain.isDelayed,
      sourceOptionsChainLatestQuoteAt: chain.latestOptionQuoteAt,
      sourceOptionsChainLatestTradeAt: chain.latestOptionTradeAt,
      sourceCompatibilityState: compatibility.state,
      sourceAssemblySkewMilliseconds: compatibility.skewMilliseconds,
      engineState: "UNAVAILABLE",
      selectionState: "UNAVAILABLE",
      contractDirection: "UNAVAILABLE",
      chainUnderlyingPrice: chain.underlyingPrice,
      underlyingPriceDifferencePoints: underlyingDifference,
      expirationDate: chain.returnedExpirationDate,
      evaluatedCandidateCount: 0,
      selectableCandidateCount: 0,
      rejectedCandidateCount: 0,
      unavailableCandidateCount: 0,
      candidates: [],
      selectedContract: EMPTY_SELECTED_CONTRACT,
      premiumReference: EMPTY_PREMIUM_REFERENCE,
      primaryReasonCode: compatibility.primaryReasonCode ?? "SOURCE_COMPATIBILITY_INCOMPATIBLE",
      warningCode: compatibility.warningCode,
    });
  }

  const selectedSide = direction === "CALL" ? chain.calls : chain.puts;
  const rawCandidates = selectedSide.map((contract) =>
    buildCandidate(
      contract,
      direction as "CALL" | "PUT",
      risk.currentMarketDate,
      chain.underlyingPrice,
      compatibility.state,
      calculatedAtMs,
    ),
  );
  const candidates = rankContractCandidates(rawCandidates, direction as "CALL" | "PUT");
  const selected = candidates.find((candidate) => candidate.selectionRank === 1) ?? null;

  const selectableCandidateCount = candidates.filter(
    (candidate) => candidate.eligibilityStatus === "SELECTABLE",
  ).length;
  const rejectedCandidateCount = candidates.filter(
    (candidate) => candidate.eligibilityStatus === "REJECTED",
  ).length;
  const unavailableCandidateCount = candidates.filter(
    (candidate) => candidate.eligibilityStatus === "UNAVAILABLE",
  ).length;

  if (compatibility.state === "PARTIAL") {
    return SpyZeroDteContractSelectionResponseSchema.parse({
      ...base,
      sourceOptionsChainFetchedAt: chain.fetchedAt,
      sourceOptionsChainMetricState: chain.metricState,
      sourceOptionsChainSourceState: chain.sourceState,
      sourceOptionsChainWarningCode: chain.warningCode,
      sourceOptionsChainIsDelayed: chain.isDelayed,
      sourceOptionsChainLatestQuoteAt: chain.latestOptionQuoteAt,
      sourceOptionsChainLatestTradeAt: chain.latestOptionTradeAt,
      sourceCompatibilityState: compatibility.state,
      sourceAssemblySkewMilliseconds: compatibility.skewMilliseconds,
      engineState: "PARTIAL",
      selectionState: "UNAVAILABLE",
      contractDirection: direction,
      chainUnderlyingPrice: chain.underlyingPrice,
      underlyingPriceDifferencePoints: underlyingDifference,
      expirationDate: chain.returnedExpirationDate,
      evaluatedCandidateCount: candidates.length,
      selectableCandidateCount,
      rejectedCandidateCount,
      unavailableCandidateCount,
      candidates,
      selectedContract: EMPTY_SELECTED_CONTRACT,
      premiumReference: EMPTY_PREMIUM_REFERENCE,
      primaryReasonCode: compatibility.primaryReasonCode ?? "SOURCE_COMPATIBILITY_PARTIAL",
      warningCode: compatibility.warningCode ?? "SOURCE_COMPATIBILITY_PARTIAL",
    });
  }

  if (selected) {
    return SpyZeroDteContractSelectionResponseSchema.parse({
      ...base,
      sourceOptionsChainFetchedAt: chain.fetchedAt,
      sourceOptionsChainMetricState: chain.metricState,
      sourceOptionsChainSourceState: chain.sourceState,
      sourceOptionsChainWarningCode: chain.warningCode,
      sourceOptionsChainIsDelayed: chain.isDelayed,
      sourceOptionsChainLatestQuoteAt: chain.latestOptionQuoteAt,
      sourceOptionsChainLatestTradeAt: chain.latestOptionTradeAt,
      sourceCompatibilityState: "COMPATIBLE",
      sourceAssemblySkewMilliseconds: compatibility.skewMilliseconds,
      engineState: "AVAILABLE",
      selectionState: "SELECTED",
      contractDirection: direction,
      chainUnderlyingPrice: chain.underlyingPrice,
      underlyingPriceDifferencePoints: underlyingDifference,
      expirationDate: chain.returnedExpirationDate,
      evaluatedCandidateCount: candidates.length,
      selectableCandidateCount,
      rejectedCandidateCount,
      unavailableCandidateCount,
      candidates,
      selectedContract: {
        candidateId: selected.candidateId,
        contractSymbol: selected.contractSymbol,
        contractDirection: selected.contractDirection,
        strikePrice: selected.strikePrice,
        expirationDate: selected.expirationDate,
        moneyness: selected.moneyness,
        bid: selected.bid,
        ask: selected.ask,
        calculatedMidpoint: selected.calculatedMidpoint,
        spreadPoints: selected.spreadPoints,
        spreadRatio: selected.spreadRatio,
        spreadPercent: selected.spreadPercent,
        quoteAt: selected.quoteAt,
        quoteFreshnessState: selected.quoteFreshnessState,
        strikeDistancePoints: selected.strikeDistancePoints,
        selectionRank: selected.selectionRank,
      },
      premiumReference: {
        type: "CALCULATED_BID_ASK_MIDPOINT",
        value: selected.calculatedMidpoint,
        disclosureCode: "MIDPOINT_REFERENCE_ONLY",
      },
      primaryReasonCode: "CONTRACT_SELECTED",
      warningCode: null,
    });
  }

  const anyUnknownFreshness = candidates.some(
    (candidate) =>
      candidate.quoteFreshnessState === "UNKNOWN" ||
      candidate.quoteFreshnessState === "UNAVAILABLE",
  );
  const anyStaleFreshness = candidates.some(
    (candidate) => candidate.quoteFreshnessState === "STALE",
  );
  const anyPartial = candidates.some((candidate) => candidate.sourceStatus === "PARTIAL");
  const engineState = anyUnknownFreshness || anyStaleFreshness || anyPartial ? "PARTIAL" : "AVAILABLE";
  const warningCode: ContractSelectionOverallWarningCode | null = anyUnknownFreshness
    ? "CONTRACT_QUOTE_TIMESTAMP_UNAVAILABLE"
    : anyStaleFreshness
      ? "CONTRACT_QUOTE_STALE"
      : anyPartial
        ? "INSUFFICIENT_CONTRACT_DATA"
        : null;

  return SpyZeroDteContractSelectionResponseSchema.parse({
    ...base,
    sourceOptionsChainFetchedAt: chain.fetchedAt,
    sourceOptionsChainMetricState: chain.metricState,
    sourceOptionsChainSourceState: chain.sourceState,
    sourceOptionsChainWarningCode: chain.warningCode,
    sourceOptionsChainIsDelayed: chain.isDelayed,
    sourceOptionsChainLatestQuoteAt: chain.latestOptionQuoteAt,
    sourceOptionsChainLatestTradeAt: chain.latestOptionTradeAt,
    sourceCompatibilityState: "COMPATIBLE",
    sourceAssemblySkewMilliseconds: compatibility.skewMilliseconds,
    engineState,
    selectionState: "NO_QUALIFIED_CONTRACT",
    contractDirection: direction,
    chainUnderlyingPrice: chain.underlyingPrice,
    underlyingPriceDifferencePoints: underlyingDifference,
    expirationDate: chain.returnedExpirationDate,
    evaluatedCandidateCount: candidates.length,
    selectableCandidateCount,
    rejectedCandidateCount,
    unavailableCandidateCount,
    candidates,
    selectedContract: EMPTY_SELECTED_CONTRACT,
    premiumReference: EMPTY_PREMIUM_REFERENCE,
    primaryReasonCode: "NO_CONTRACT_PASSES_ELIGIBILITY",
    warningCode,
  });
}
