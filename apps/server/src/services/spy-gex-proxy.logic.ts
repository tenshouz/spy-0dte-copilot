import {
  SpyZeroDteGexProxyResponseSchema,
  type GexStrikeRow,
  type GexWarningCode,
  type NormalizedOptionContract,
  type SpyZeroDteGexProxyResponse,
  type SpyZeroDteOptionsChainResponse,
} from "@spy-copilot/shared";

/**
 * Pure, returned-window SPY 0DTE Gamma Exposure proxy logic.
 *
 * Formula per eligible contract:
 *   gamma × openInterest × multiplier × underlyingPrice² × 0.01
 *
 * Calls use a positive analytical contribution and Puts a negative analytical
 * contribution. This convention is not observed dealer inventory.
 */

export interface GammaExposureCalculation {
  magnitude: number;
  signedContribution: number;
}

export function calculateGammaExposurePerOnePercentMove(
  gamma: number,
  openInterest: number,
  multiplier: number,
  underlyingPrice: number,
  optionType: "CALL" | "PUT",
): GammaExposureCalculation | null {
  if (
    !Number.isFinite(gamma) ||
    gamma < 0 ||
    !Number.isFinite(openInterest) ||
    openInterest < 0 ||
    !Number.isFinite(multiplier) ||
    multiplier !== 100 ||
    !Number.isFinite(underlyingPrice) ||
    underlyingPrice <= 0
  ) {
    return null;
  }

  const magnitude = gamma * openInterest * multiplier * underlyingPrice * underlyingPrice * 0.01;
  if (!Number.isFinite(magnitude) || magnitude < 0) return null;

  const normalizedMagnitude = Object.is(magnitude, -0) ? 0 : magnitude;
  const signedContribution = optionType === "CALL" ? normalizedMagnitude : -normalizedMagnitude;
  return {
    magnitude: normalizedMagnitude,
    signedContribution: Object.is(signedContribution, -0) ? 0 : signedContribution,
  };
}

type PrimaryExclusionReason =
  | "OUT_OF_SCOPE"
  | "NONSTANDARD"
  | "MINI"
  | "MISSING_MULTIPLIER"
  | "INVALID_MULTIPLIER"
  | "MISSING_GAMMA"
  | "MISSING_OPEN_INTEREST"
  | "DUPLICATE";

interface EligibleContribution {
  contract: NormalizedOptionContract;
  magnitude: number;
}

interface Analysis {
  eligible: EligibleContribution[];
  excludedCallContractCount: number;
  excludedPutContractCount: number;
  contractsMissingGamma: number;
  contractsMissingOpenInterest: number;
  contractsMissingMultiplier: number;
  nonstandardContractsExcluded: number;
  miniContractsExcluded: number;
  invalidMultiplierContractsExcluded: number;
  duplicateContractsExcluded: number;
  outOfScopeContractsExcluded: number;
  requiredInputFailureCount: number;
}

function emptyAnalysis(): Analysis {
  return {
    eligible: [],
    excludedCallContractCount: 0,
    excludedPutContractCount: 0,
    contractsMissingGamma: 0,
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
    contract.expirationDate !== currentMarketDate ||
    (contract.optionType !== "CALL" && contract.optionType !== "PUT") ||
    !Number.isFinite(contract.strikePrice) ||
    contract.strikePrice <= 0
  ) {
    return "OUT_OF_SCOPE";
  }
  if (contract.nonStandard === true) return "NONSTANDARD";
  if (contract.mini === true) return "MINI";
  if (contract.multiplier === null || contract.multiplier === undefined) return "MISSING_MULTIPLIER";
  if (!Number.isFinite(contract.multiplier) || contract.multiplier !== 100) return "INVALID_MULTIPLIER";
  if (contract.gamma === null || !Number.isFinite(contract.gamma) || contract.gamma < 0) {
    return "MISSING_GAMMA";
  }
  if (
    contract.openInterest === null ||
    !Number.isFinite(contract.openInterest) ||
    contract.openInterest < 0
  ) {
    return "MISSING_OPEN_INTEREST";
  }
  return null;
}

function recordExclusion(
  analysis: Analysis,
  contract: NormalizedOptionContract,
  reason: PrimaryExclusionReason,
): void {
  if (contract.optionType === "CALL") analysis.excludedCallContractCount += 1;
  else analysis.excludedPutContractCount += 1;

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
    case "MISSING_GAMMA":
      analysis.contractsMissingGamma += 1;
      analysis.requiredInputFailureCount += 1;
      break;
    case "MISSING_OPEN_INTEREST":
      analysis.contractsMissingOpenInterest += 1;
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

export function analyzeGexContracts(
  contracts: readonly NormalizedOptionContract[],
  currentMarketDate: string,
  underlyingPrice: number,
): Analysis {
  const analysis = emptyAnalysis();
  const seenSymbols = new Set<string>();

  for (const contract of contracts) {
    const reason = primaryExclusionReason(contract, currentMarketDate, seenSymbols);
    if (reason) {
      recordExclusion(analysis, contract, reason);
      continue;
    }

    const calculation = calculateGammaExposurePerOnePercentMove(
      contract.gamma as number,
      contract.openInterest as number,
      contract.multiplier as number,
      underlyingPrice,
      contract.optionType,
    );
    if (!calculation) {
      // This is a defensive branch for data that bypasses the shared schema.
      recordExclusion(analysis, contract, "MISSING_GAMMA");
      continue;
    }

    analysis.eligible.push({ contract, magnitude: calculation.magnitude });
  }

  return analysis;
}

export function aggregateGexByStrike(
  eligible: readonly EligibleContribution[],
): GexStrikeRow[] {
  const byStrike = new Map<number, GexStrikeRow>();

  for (const { contract, magnitude } of eligible) {
    const row = byStrike.get(contract.strikePrice) ?? {
      strikePrice: contract.strikePrice,
      callContractCount: 0,
      putContractCount: 0,
      callOpenInterest: 0,
      putOpenInterest: 0,
      callGammaExposure: 0,
      putGammaExposureMagnitude: 0,
      netGammaExposureProxy: 0,
    };

    if (contract.optionType === "CALL") {
      row.callContractCount += 1;
      row.callOpenInterest += contract.openInterest as number;
      row.callGammaExposure += magnitude;
    } else {
      row.putContractCount += 1;
      row.putOpenInterest += contract.openInterest as number;
      row.putGammaExposureMagnitude += magnitude;
    }
    row.netGammaExposureProxy = row.callGammaExposure - row.putGammaExposureMagnitude;
    if (Object.is(row.netGammaExposureProxy, -0)) row.netGammaExposureProxy = 0;
    byStrike.set(contract.strikePrice, row);
  }

  return [...byStrike.values()].sort((a, b) => a.strikePrice - b.strikePrice);
}

function inheritedWarning(chain: SpyZeroDteOptionsChainResponse): GexWarningCode {
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
  analysis?: Analysis;
  upstreamRejectedContractCount?: number;
}

export function buildUnavailableSpyZeroDteGexProxyResponse(
  currentMarketDate: string,
  nowMs: number,
  warningCode: GexWarningCode,
  metadata: UnavailableMetadata = {},
): SpyZeroDteGexProxyResponse {
  const analysis = metadata.analysis ?? emptyAnalysis();
  const underlyingPrice = metadata.underlyingPrice ?? null;
  return SpyZeroDteGexProxyResponseSchema.parse({
    symbol: "SPY",
    metric: "ZERO_DTE_ATM_WINDOW_GEX_PROXY",
    methodology: "OI_WEIGHTED_GAMMA_PER_1PCT_MOVE",
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
    returnedWindowCallGammaExposure: null,
    returnedWindowPutGammaExposureMagnitude: null,
    returnedWindowNetGammaExposureProxy: null,
    eligibleCallContractCount: analysis.eligible.filter((item) => item.contract.optionType === "CALL").length,
    eligiblePutContractCount: analysis.eligible.filter((item) => item.contract.optionType === "PUT").length,
    excludedCallContractCount: analysis.excludedCallContractCount,
    excludedPutContractCount: analysis.excludedPutContractCount,
    contractsMissingGamma: analysis.contractsMissingGamma,
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

export function deriveSpyZeroDteGexProxy(
  chain: SpyZeroDteOptionsChainResponse,
  nowMs = Date.now(),
): SpyZeroDteGexProxyResponse {
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
    return buildUnavailableSpyZeroDteGexProxyResponse(
      chain.currentMarketDate,
      nowMs,
      inheritedWarning(chain),
      commonMetadata,
    );
  }

  if (chain.metricState === "MOCK" || chain.sourceState === "MOCK") {
    return buildUnavailableSpyZeroDteGexProxyResponse(
      chain.currentMarketDate,
      nowMs,
      "OPTIONS_CHAIN_UNAVAILABLE",
      commonMetadata,
    );
  }

  if (chain.returnedExpirationDate !== chain.currentMarketDate) {
    return buildUnavailableSpyZeroDteGexProxyResponse(
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
    return buildUnavailableSpyZeroDteGexProxyResponse(
      chain.currentMarketDate,
      nowMs,
      "UNDERLYING_PRICE_UNAVAILABLE",
      { ...commonMetadata, underlyingPrice: null },
    );
  }

  const analysis = analyzeGexContracts(
    [...chain.calls, ...chain.puts],
    chain.currentMarketDate,
    chain.underlyingPrice,
  );
  const strikes = aggregateGexByStrike(analysis.eligible);

  if (analysis.eligible.length === 0 || strikes.length === 0) {
    return buildUnavailableSpyZeroDteGexProxyResponse(
      chain.currentMarketDate,
      nowMs,
      "NO_ELIGIBLE_GEX_CONTRACTS",
      { ...commonMetadata, analysis },
    );
  }

  const returnedWindowCallGammaExposure = strikes.reduce(
    (sum, row) => sum + row.callGammaExposure,
    0,
  );
  const returnedWindowPutGammaExposureMagnitude = strikes.reduce(
    (sum, row) => sum + row.putGammaExposureMagnitude,
    0,
  );
  const rawNet = returnedWindowCallGammaExposure - returnedWindowPutGammaExposureMagnitude;
  const returnedWindowNetGammaExposureProxy = Object.is(rawNet, -0) ? 0 : rawNet;

  if (
    !Number.isFinite(returnedWindowCallGammaExposure) ||
    !Number.isFinite(returnedWindowPutGammaExposureMagnitude) ||
    !Number.isFinite(returnedWindowNetGammaExposureProxy)
  ) {
    return buildUnavailableSpyZeroDteGexProxyResponse(
      chain.currentMarketDate,
      nowMs,
      "INVALID_GEX_INPUTS",
      { ...commonMetadata, analysis },
    );
  }

  const coverageState =
    analysis.requiredInputFailureCount > 0 || chain.rejectedContractCount > 0
      ? "PARTIAL"
      : "COMPLETE";
  const metricState = chain.metricState === "STALE" ? "STALE" : "LIVE";
  const warningCode: GexWarningCode | null =
    coverageState === "PARTIAL"
      ? "PARTIAL_GEX_INPUTS"
      : metricState === "STALE"
        ? "RETAINED_STALE_CHAIN"
        : null;

  return SpyZeroDteGexProxyResponseSchema.parse({
    symbol: "SPY",
    metric: "ZERO_DTE_ATM_WINDOW_GEX_PROXY",
    methodology: "OI_WEIGHTED_GAMMA_PER_1PCT_MOVE",
    coverageScope: "RETURNED_CHAIN_WINDOW",
    currentMarketDate: chain.currentMarketDate,
    expirationDate: chain.returnedExpirationDate,
    metricState,
    sourceState: metricState,
    coverageState,
    underlyingPrice: chain.underlyingPrice,
    underlyingPriceSource: "CHAIN_RESPONSE",
    requestedStrikeCount: chain.requestedStrikeCount,
    returnedUniqueStrikeCount: chain.returnedUniqueStrikeCount,
    minimumReturnedStrike: chain.minimumReturnedStrike,
    maximumReturnedStrike: chain.maximumReturnedStrike,
    returnedWindowCallGammaExposure,
    returnedWindowPutGammaExposureMagnitude,
    returnedWindowNetGammaExposureProxy,
    eligibleCallContractCount: analysis.eligible.filter((item) => item.contract.optionType === "CALL").length,
    eligiblePutContractCount: analysis.eligible.filter((item) => item.contract.optionType === "PUT").length,
    excludedCallContractCount: analysis.excludedCallContractCount,
    excludedPutContractCount: analysis.excludedPutContractCount,
    contractsMissingGamma: analysis.contractsMissingGamma,
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
