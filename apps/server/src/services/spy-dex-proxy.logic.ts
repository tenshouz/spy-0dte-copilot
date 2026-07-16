import {
  SpyZeroDteDexProxyResponseSchema,
  type DexStrikeRow,
  type DexWarningCode,
  type NormalizedOptionContract,
  type SpyZeroDteDexProxyResponse,
  type SpyZeroDteOptionsChainResponse,
} from "@spy-copilot/shared";

/**
 * Pure, returned-window SPY 0DTE Delta Exposure proxy logic.
 *
 * Formula per eligible contract:
 *   delta × openInterest × multiplier × underlyingPrice
 *
 * Provider-supplied signed Delta is preserved. This is an Open-Interest-
 * weighted notional proxy, not observed dealer inventory or hedge demand.
 */

export interface DeltaExposureCalculation {
  signedContribution: number;
  magnitude: number;
}

export function calculateSignedDeltaNotional(
  delta: number,
  openInterest: number,
  multiplier: number,
  underlyingPrice: number,
  optionType: "CALL" | "PUT",
): DeltaExposureCalculation | null {
  const sideValid = optionType === "CALL" ? delta >= 0 && delta <= 1 : delta >= -1 && delta <= 0;
  if (
    !Number.isFinite(delta) ||
    !sideValid ||
    !Number.isFinite(openInterest) ||
    openInterest < 0 ||
    !Number.isFinite(multiplier) ||
    multiplier !== 100 ||
    !Number.isFinite(underlyingPrice) ||
    underlyingPrice <= 0
  ) {
    return null;
  }

  const rawSigned = delta * openInterest * multiplier * underlyingPrice;
  if (!Number.isFinite(rawSigned)) return null;

  const signedContribution = Object.is(rawSigned, -0) ? 0 : rawSigned;
  const magnitude = Math.abs(signedContribution);
  return {
    signedContribution,
    magnitude: Object.is(magnitude, -0) ? 0 : magnitude,
  };
}

type PrimaryExclusionReason =
  | "OUT_OF_SCOPE"
  | "INVALID_IDENTITY"
  | "NONSTANDARD"
  | "MINI"
  | "MISSING_MULTIPLIER"
  | "INVALID_MULTIPLIER"
  | "MISSING_DELTA"
  | "INVALID_DELTA"
  | "MISSING_OPEN_INTEREST"
  | "DUPLICATE";

interface EligibleContribution {
  contract: NormalizedOptionContract;
  signedContribution: number;
  magnitude: number;
}

export interface DexContractAnalysis {
  eligible: EligibleContribution[];
  excludedCallContractCount: number;
  excludedPutContractCount: number;
  contractsMissingDelta: number;
  contractsWithInvalidDelta: number;
  contractsMissingOpenInterest: number;
  contractsMissingMultiplier: number;
  nonstandardContractsExcluded: number;
  miniContractsExcluded: number;
  invalidMultiplierContractsExcluded: number;
  duplicateContractsExcluded: number;
  outOfScopeContractsExcluded: number;
  requiredInputFailureCount: number;
}

function emptyAnalysis(): DexContractAnalysis {
  return {
    eligible: [],
    excludedCallContractCount: 0,
    excludedPutContractCount: 0,
    contractsMissingDelta: 0,
    contractsWithInvalidDelta: 0,
    contractsMissingOpenInterest: 0,
    contractsMissingMultiplier: 0,
    nonstandardContractsExcluded: 0,
    miniContractsExcluded: 0,
    invalidMultiplierContractsExcluded: 0,
    duplicateContractsExcluded: 0,
    outOfScopeContractsExcluded: 0,
    requiredInputFailureCount: 0,
  };
}

function primaryExclusionReason(
  contract: NormalizedOptionContract,
  currentMarketDate: string,
  seenSymbols: Set<string>,
): PrimaryExclusionReason | null {
  if (seenSymbols.has(contract.contractSymbol)) return "DUPLICATE";
  seenSymbols.add(contract.contractSymbol);

  if (
    contract.underlyingSymbol !== "SPY" ||
    contract.expirationDate !== currentMarketDate
  ) {
    return "OUT_OF_SCOPE";
  }

  if (
    !contract.contractSymbol.trim() ||
    (contract.optionType !== "CALL" && contract.optionType !== "PUT") ||
    !Number.isFinite(contract.strikePrice) ||
    contract.strikePrice <= 0
  ) {
    return "INVALID_IDENTITY";
  }

  if (contract.nonStandard === true) return "NONSTANDARD";
  if (contract.mini === true) return "MINI";
  if (contract.multiplier === null || contract.multiplier === undefined) return "MISSING_MULTIPLIER";
  if (!Number.isFinite(contract.multiplier) || contract.multiplier !== 100) return "INVALID_MULTIPLIER";
  if (contract.delta === null || contract.delta === undefined) return "MISSING_DELTA";
  if (
    !Number.isFinite(contract.delta) ||
    (contract.optionType === "CALL"
      ? contract.delta < 0 || contract.delta > 1
      : contract.delta < -1 || contract.delta > 0)
  ) {
    return "INVALID_DELTA";
  }
  if (
    contract.openInterest === null ||
    contract.openInterest === undefined ||
    !Number.isFinite(contract.openInterest) ||
    contract.openInterest < 0
  ) {
    return "MISSING_OPEN_INTEREST";
  }
  return null;
}

function recordExclusion(
  analysis: DexContractAnalysis,
  contract: NormalizedOptionContract,
  reason: PrimaryExclusionReason,
): void {
  if (contract.optionType === "CALL") analysis.excludedCallContractCount += 1;
  else if (contract.optionType === "PUT") analysis.excludedPutContractCount += 1;

  switch (reason) {
    case "NONSTANDARD":
      analysis.nonstandardContractsExcluded += 1;
      break;
    case "MINI":
      analysis.miniContractsExcluded += 1;
      break;
    case "MISSING_MULTIPLIER":
      analysis.contractsMissingMultiplier += 1;
      analysis.requiredInputFailureCount += 1;
      break;
    case "INVALID_MULTIPLIER":
      analysis.invalidMultiplierContractsExcluded += 1;
      // Positive non-100 multipliers are deliberately outside this milestone.
      // Non-finite/non-positive values are invalid required inputs.
      if (contract.multiplier === null || !Number.isFinite(contract.multiplier) || contract.multiplier <= 0) {
        analysis.requiredInputFailureCount += 1;
      }
      break;
    case "MISSING_DELTA":
      analysis.contractsMissingDelta += 1;
      analysis.requiredInputFailureCount += 1;
      break;
    case "INVALID_DELTA":
      analysis.contractsWithInvalidDelta += 1;
      analysis.requiredInputFailureCount += 1;
      break;
    case "MISSING_OPEN_INTEREST":
      analysis.contractsMissingOpenInterest += 1;
      analysis.requiredInputFailureCount += 1;
      break;
    case "INVALID_IDENTITY":
      analysis.outOfScopeContractsExcluded += 1;
      analysis.requiredInputFailureCount += 1;
      break;
    case "DUPLICATE":
      analysis.duplicateContractsExcluded += 1;
      break;
    case "OUT_OF_SCOPE":
      analysis.outOfScopeContractsExcluded += 1;
      break;
  }
}

export function analyzeDexContracts(
  contracts: readonly NormalizedOptionContract[],
  currentMarketDate: string,
  underlyingPrice: number,
): DexContractAnalysis {
  const analysis = emptyAnalysis();
  const seenSymbols = new Set<string>();

  for (const contract of contracts) {
    const reason = primaryExclusionReason(contract, currentMarketDate, seenSymbols);
    if (reason) {
      recordExclusion(analysis, contract, reason);
      continue;
    }

    const calculation = calculateSignedDeltaNotional(
      contract.delta as number,
      contract.openInterest as number,
      contract.multiplier as number,
      underlyingPrice,
      contract.optionType,
    );
    if (!calculation) {
      // Defensive branch for data that bypasses the shared schema.
      recordExclusion(analysis, contract, "INVALID_DELTA");
      continue;
    }

    analysis.eligible.push({
      contract,
      signedContribution: calculation.signedContribution,
      magnitude: calculation.magnitude,
    });
  }

  return analysis;
}

export function aggregateDexByStrike(
  eligible: readonly EligibleContribution[],
): DexStrikeRow[] {
  const byStrike = new Map<number, DexStrikeRow>();

  for (const { contract, signedContribution, magnitude } of eligible) {
    const row = byStrike.get(contract.strikePrice) ?? {
      strikePrice: contract.strikePrice,
      callContractCount: 0,
      putContractCount: 0,
      callOpenInterest: 0,
      putOpenInterest: 0,
      callDeltaExposure: 0,
      putDeltaExposureMagnitude: 0,
      netDeltaExposureProxy: 0,
    };

    if (contract.optionType === "CALL") {
      row.callContractCount += 1;
      row.callOpenInterest += contract.openInterest as number;
      row.callDeltaExposure += magnitude;
    } else {
      row.putContractCount += 1;
      row.putOpenInterest += contract.openInterest as number;
      row.putDeltaExposureMagnitude += magnitude;
    }

    // The validated signed contributions guarantee this equals the sum of all
    // signed Call and Put contributions at the strike.
    row.netDeltaExposureProxy += signedContribution;
    if (Object.is(row.netDeltaExposureProxy, -0)) row.netDeltaExposureProxy = 0;
    byStrike.set(contract.strikePrice, row);
  }

  return [...byStrike.values()].sort((a, b) => a.strikePrice - b.strikePrice);
}

function inheritedWarning(chain: SpyZeroDteOptionsChainResponse): DexWarningCode {
  switch (chain.warningCode) {
    case "AUTH_REQUIRED":
      return "AUTH_REQUIRED";
    case "DATABASE_ERROR":
      return "DATABASE_ERROR";
    case "OPTIONS_ACCESS_UNAVAILABLE":
      return "OPTIONS_ACCESS_UNAVAILABLE";
    case "NO_CURRENT_DATE_EXPIRATION":
      return "NO_CURRENT_DATE_EXPIRATION";
    default:
      return "OPTIONS_CHAIN_UNAVAILABLE";
  }
}

interface UnavailableMetadata {
  sourceState?: SpyZeroDteOptionsChainResponse["sourceState"];
  expirationDate?: string | null;
  underlyingPrice?: number | null;
  requestedStrikeCount?: number | null;
  returnedUniqueStrikeCount?: number;
  minimumReturnedStrike?: number | null;
  maximumReturnedStrike?: number | null;
  latestOptionQuoteAt?: string | null;
  chainFetchedAt?: string | null;
  dataAgeMs?: number;
  analysis?: DexContractAnalysis;
  upstreamRejectedContractCount?: number;
}

export function buildUnavailableSpyZeroDteDexProxyResponse(
  currentMarketDate: string,
  nowMs: number,
  warningCode: DexWarningCode,
  metadata: UnavailableMetadata = {},
): SpyZeroDteDexProxyResponse {
  const analysis = metadata.analysis ?? emptyAnalysis();
  const underlyingPrice = metadata.underlyingPrice ?? null;
  return SpyZeroDteDexProxyResponseSchema.parse({
    symbol: "SPY",
    metric: "ZERO_DTE_RETURNED_WINDOW_DEX_PROXY",
    methodology: "OI_WEIGHTED_DELTA_NOTIONAL",
    coverageScope: "RETURNED_CHAIN_WINDOW",
    currentMarketDate,
    expirationDate: metadata.expirationDate ?? null,
    metricState: "UNAVAILABLE",
    sourceState: metadata.sourceState ?? "UNAVAILABLE",
    coverageState: "UNAVAILABLE",
    underlyingPrice,
    underlyingPriceSource: underlyingPrice === null ? "UNAVAILABLE" : "CHAIN_RESPONSE",
    requestedStrikeCount: metadata.requestedStrikeCount ?? null,
    returnedUniqueStrikeCount: metadata.returnedUniqueStrikeCount ?? 0,
    minimumReturnedStrike: metadata.minimumReturnedStrike ?? null,
    maximumReturnedStrike: metadata.maximumReturnedStrike ?? null,
    returnedWindowCallDeltaExposure: null,
    returnedWindowPutDeltaExposureMagnitude: null,
    returnedWindowNetDeltaExposureProxy: null,
    eligibleCallContractCount: analysis.eligible.filter((item) => item.contract.optionType === "CALL").length,
    eligiblePutContractCount: analysis.eligible.filter((item) => item.contract.optionType === "PUT").length,
    excludedCallContractCount: analysis.excludedCallContractCount,
    excludedPutContractCount: analysis.excludedPutContractCount,
    contractsMissingDelta: analysis.contractsMissingDelta,
    contractsWithInvalidDelta: analysis.contractsWithInvalidDelta,
    contractsMissingOpenInterest: analysis.contractsMissingOpenInterest,
    contractsMissingMultiplier: analysis.contractsMissingMultiplier,
    nonstandardContractsExcluded: analysis.nonstandardContractsExcluded,
    miniContractsExcluded: analysis.miniContractsExcluded,
    invalidMultiplierContractsExcluded: analysis.invalidMultiplierContractsExcluded,
    duplicateContractsExcluded: analysis.duplicateContractsExcluded,
    outOfScopeContractsExcluded: analysis.outOfScopeContractsExcluded,
    upstreamRejectedContractCount: metadata.upstreamRejectedContractCount ?? 0,
    eligibleStrikeCount: 0,
    strikes: [],
    latestOptionQuoteAt: metadata.latestOptionQuoteAt ?? null,
    chainFetchedAt: metadata.chainFetchedAt ?? null,
    fetchedAt: new Date(nowMs).toISOString(),
    dataAgeMs: metadata.dataAgeMs ?? 0,
    warningCode,
  });
}

export function deriveSpyZeroDteDexProxy(
  chain: SpyZeroDteOptionsChainResponse,
  nowMs = Date.now(),
): SpyZeroDteDexProxyResponse {
  const commonMetadata: UnavailableMetadata = {
    sourceState: chain.sourceState,
    expirationDate: chain.returnedExpirationDate,
    underlyingPrice: chain.underlyingPrice,
    requestedStrikeCount: chain.requestedStrikeCount,
    returnedUniqueStrikeCount: chain.returnedUniqueStrikeCount,
    minimumReturnedStrike: chain.minimumReturnedStrike,
    maximumReturnedStrike: chain.maximumReturnedStrike,
    latestOptionQuoteAt: chain.latestOptionQuoteAt,
    chainFetchedAt: chain.fetchedAt,
    dataAgeMs: chain.dataAgeMs,
    upstreamRejectedContractCount: chain.rejectedContractCount,
  };

  if (chain.metricState === "UNAVAILABLE" || chain.sourceState === "UNAVAILABLE") {
    return buildUnavailableSpyZeroDteDexProxyResponse(
      chain.currentMarketDate,
      nowMs,
      inheritedWarning(chain),
      commonMetadata,
    );
  }

  if (chain.metricState === "MOCK" || chain.sourceState === "MOCK") {
    return buildUnavailableSpyZeroDteDexProxyResponse(
      chain.currentMarketDate,
      nowMs,
      "OPTIONS_CHAIN_UNAVAILABLE",
      commonMetadata,
    );
  }

  if (chain.returnedExpirationDate !== chain.currentMarketDate) {
    return buildUnavailableSpyZeroDteDexProxyResponse(
      chain.currentMarketDate,
      nowMs,
      "NO_CURRENT_DATE_EXPIRATION",
      { ...commonMetadata, expirationDate: null, underlyingPrice: null },
    );
  }

  if (
    chain.underlyingPrice === null ||
    !Number.isFinite(chain.underlyingPrice) ||
    chain.underlyingPrice <= 0
  ) {
    return buildUnavailableSpyZeroDteDexProxyResponse(
      chain.currentMarketDate,
      nowMs,
      "UNDERLYING_PRICE_UNAVAILABLE",
      { ...commonMetadata, underlyingPrice: null },
    );
  }

  const analysis = analyzeDexContracts(
    [...chain.calls, ...chain.puts],
    chain.currentMarketDate,
    chain.underlyingPrice,
  );
  const strikes = aggregateDexByStrike(analysis.eligible);

  if (analysis.eligible.length === 0 || strikes.length === 0) {
    return buildUnavailableSpyZeroDteDexProxyResponse(
      chain.currentMarketDate,
      nowMs,
      "NO_ELIGIBLE_DEX_CONTRACTS",
      { ...commonMetadata, analysis },
    );
  }

  const returnedWindowCallDeltaExposure = strikes.reduce(
    (sum, row) => sum + row.callDeltaExposure,
    0,
  );
  const returnedWindowPutDeltaExposureMagnitude = strikes.reduce(
    (sum, row) => sum + row.putDeltaExposureMagnitude,
    0,
  );
  const rawNet = returnedWindowCallDeltaExposure - returnedWindowPutDeltaExposureMagnitude;
  const returnedWindowNetDeltaExposureProxy = Object.is(rawNet, -0) ? 0 : rawNet;

  if (
    !Number.isFinite(returnedWindowCallDeltaExposure) ||
    !Number.isFinite(returnedWindowPutDeltaExposureMagnitude) ||
    !Number.isFinite(returnedWindowNetDeltaExposureProxy)
  ) {
    return buildUnavailableSpyZeroDteDexProxyResponse(
      chain.currentMarketDate,
      nowMs,
      "INVALID_DEX_INPUTS",
      { ...commonMetadata, analysis },
    );
  }

  // PARTIAL_CONTRACT_DATA alone is not enough to weaken DEX coverage. Only a
  // DEX-required input failure or an upstream rejected contract does so.
  const coverageState =
    analysis.requiredInputFailureCount > 0 || chain.rejectedContractCount > 0
      ? "PARTIAL"
      : "COMPLETE";
  const metricState = chain.metricState === "STALE" ? "STALE" : "LIVE";
  const warningCode: DexWarningCode | null =
    coverageState === "PARTIAL"
      ? "PARTIAL_DEX_INPUTS"
      : metricState === "STALE"
        ? "RETAINED_STALE_CHAIN"
        : null;

  return SpyZeroDteDexProxyResponseSchema.parse({
    symbol: "SPY",
    metric: "ZERO_DTE_RETURNED_WINDOW_DEX_PROXY",
    methodology: "OI_WEIGHTED_DELTA_NOTIONAL",
    coverageScope: "RETURNED_CHAIN_WINDOW",
    currentMarketDate: chain.currentMarketDate,
    expirationDate: chain.returnedExpirationDate,
    metricState,
    sourceState: chain.sourceState,
    coverageState,
    underlyingPrice: chain.underlyingPrice,
    underlyingPriceSource: "CHAIN_RESPONSE",
    requestedStrikeCount: chain.requestedStrikeCount,
    returnedUniqueStrikeCount: chain.returnedUniqueStrikeCount,
    minimumReturnedStrike: chain.minimumReturnedStrike,
    maximumReturnedStrike: chain.maximumReturnedStrike,
    returnedWindowCallDeltaExposure,
    returnedWindowPutDeltaExposureMagnitude,
    returnedWindowNetDeltaExposureProxy,
    eligibleCallContractCount: analysis.eligible.filter((item) => item.contract.optionType === "CALL").length,
    eligiblePutContractCount: analysis.eligible.filter((item) => item.contract.optionType === "PUT").length,
    excludedCallContractCount: analysis.excludedCallContractCount,
    excludedPutContractCount: analysis.excludedPutContractCount,
    contractsMissingDelta: analysis.contractsMissingDelta,
    contractsWithInvalidDelta: analysis.contractsWithInvalidDelta,
    contractsMissingOpenInterest: analysis.contractsMissingOpenInterest,
    contractsMissingMultiplier: analysis.contractsMissingMultiplier,
    nonstandardContractsExcluded: analysis.nonstandardContractsExcluded,
    miniContractsExcluded: analysis.miniContractsExcluded,
    invalidMultiplierContractsExcluded: analysis.invalidMultiplierContractsExcluded,
    duplicateContractsExcluded: analysis.duplicateContractsExcluded,
    outOfScopeContractsExcluded: analysis.outOfScopeContractsExcluded,
    upstreamRejectedContractCount: chain.rejectedContractCount,
    eligibleStrikeCount: strikes.length,
    strikes,
    latestOptionQuoteAt: chain.latestOptionQuoteAt,
    chainFetchedAt: chain.fetchedAt,
    fetchedAt: new Date(nowMs).toISOString(),
    dataAgeMs: chain.dataAgeMs,
    warningCode,
  });
}
