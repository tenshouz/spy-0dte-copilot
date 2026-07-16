import {
  SpyZeroDteExpectedMoveResponseSchema,
  selectAtmStrike,
  type ExpectedMoveWarningCode,
  type NormalizedOptionContract,
  type OptionType,
  type SpyZeroDteExpectedMoveResponse,
  type SpyZeroDteOptionsChainResponse,
} from "@spy-copilot/shared";

function finiteNonnegative(value: number | null): value is number {
  return value !== null && Number.isFinite(value) && value >= 0;
}

function finitePositive(value: number | null): value is number {
  return value !== null && Number.isFinite(value) && value > 0;
}

function latestIso(values: readonly (string | null)[]): string | null {
  const valid = values.filter((value): value is string => value !== null);
  if (valid.length === 0) return null;
  return valid.reduce((latest, value) => (Date.parse(value) > Date.parse(latest) ? value : latest));
}

function selectStandardContract(
  contracts: readonly NormalizedOptionContract[],
  optionType: OptionType,
  expirationDate: string,
  strikePrice: number,
): NormalizedOptionContract | null {
  return (
    contracts
      .filter(
        (contract) =>
          contract.optionType === optionType &&
          contract.expirationDate === expirationDate &&
          contract.strikePrice === strikePrice &&
          contract.nonStandard !== true &&
          (contract.multiplier === null || contract.multiplier === 100),
      )
      .sort((a, b) => a.contractSymbol.localeCompare(b.contractSymbol))[0] ?? null
  );
}

export interface ImpliedMoveCalculation {
  impliedMovePoints: number;
  impliedMovePercent: number;
  upperImpliedMoveLevel: number;
  lowerImpliedMoveLevel: number;
}

export function calculateAtmStraddleMarkImpliedMove(
  underlyingPrice: number,
  callMark: number,
  putMark: number,
): ImpliedMoveCalculation | null {
  if (
    !Number.isFinite(underlyingPrice) ||
    underlyingPrice <= 0 ||
    !Number.isFinite(callMark) ||
    callMark < 0 ||
    !Number.isFinite(putMark) ||
    putMark < 0
  ) {
    return null;
  }

  const impliedMovePoints = callMark + putMark;
  const impliedMovePercent = (impliedMovePoints / underlyingPrice) * 100;
  const upperImpliedMoveLevel = underlyingPrice + impliedMovePoints;
  const lowerImpliedMoveLevel = underlyingPrice - impliedMovePoints;

  if (
    !Number.isFinite(impliedMovePoints) ||
    !Number.isFinite(impliedMovePercent) ||
    !Number.isFinite(upperImpliedMoveLevel) ||
    !Number.isFinite(lowerImpliedMoveLevel)
  ) {
    return null;
  }

  return {
    impliedMovePoints: Object.is(impliedMovePoints, -0) ? 0 : impliedMovePoints,
    impliedMovePercent: Object.is(impliedMovePercent, -0) ? 0 : impliedMovePercent,
    upperImpliedMoveLevel: Object.is(upperImpliedMoveLevel, -0) ? 0 : upperImpliedMoveLevel,
    lowerImpliedMoveLevel: Object.is(lowerImpliedMoveLevel, -0) ? 0 : lowerImpliedMoveLevel,
  };
}

function inheritedWarning(chain: SpyZeroDteOptionsChainResponse): ExpectedMoveWarningCode {
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

export function buildUnavailableSpyZeroDteExpectedMoveResponse(
  currentMarketDate: string,
  nowMs: number,
  warningCode: ExpectedMoveWarningCode,
  sourceState: SpyZeroDteOptionsChainResponse["sourceState"] = "UNAVAILABLE",
  chainFetchedAt: string | null = null,
  dataAgeMs = 0,
  expirationDate: string | null = null,
  underlyingPrice: number | null = null,
): SpyZeroDteExpectedMoveResponse {
  return SpyZeroDteExpectedMoveResponseSchema.parse({
    symbol: "SPY",
    metric: "ZERO_DTE_ATM_IMPLIED_MOVE",
    methodology: "ATM_STRADDLE_MARK",
    currentMarketDate,
    expirationDate,
    metricState: "UNAVAILABLE",
    sourceState,
    underlyingPrice,
    underlyingPriceSource: underlyingPrice === null ? "UNAVAILABLE" : "CHAIN_RESPONSE",
    atmStrike: null,
    callContractSymbol: null,
    putContractSymbol: null,
    callMark: null,
    putMark: null,
    impliedMovePoints: null,
    impliedMovePercent: null,
    upperImpliedMoveLevel: null,
    lowerImpliedMoveLevel: null,
    callQuoteAt: null,
    putQuoteAt: null,
    latestSelectedContractQuoteAt: null,
    chainFetchedAt,
    fetchedAt: new Date(nowMs).toISOString(),
    dataAgeMs,
    warningCode,
  });
}

export function deriveSpyZeroDteExpectedMove(
  chain: SpyZeroDteOptionsChainResponse,
  nowMs = Date.now(),
): SpyZeroDteExpectedMoveResponse {
  if (chain.metricState === "UNAVAILABLE" || chain.sourceState === "UNAVAILABLE") {
    return buildUnavailableSpyZeroDteExpectedMoveResponse(
      chain.currentMarketDate,
      nowMs,
      inheritedWarning(chain),
      chain.sourceState,
      chain.fetchedAt,
      chain.dataAgeMs,
      chain.returnedExpirationDate,
      chain.underlyingPrice,
    );
  }

  if (chain.metricState === "MOCK" || chain.sourceState === "MOCK") {
    return buildUnavailableSpyZeroDteExpectedMoveResponse(
      chain.currentMarketDate,
      nowMs,
      "OPTIONS_CHAIN_UNAVAILABLE",
      "MOCK",
      chain.fetchedAt,
      chain.dataAgeMs,
      chain.returnedExpirationDate,
      chain.underlyingPrice,
    );
  }

  if (chain.returnedExpirationDate !== chain.currentMarketDate) {
    return buildUnavailableSpyZeroDteExpectedMoveResponse(
      chain.currentMarketDate,
      nowMs,
      "NO_CURRENT_DATE_EXPIRATION",
      chain.sourceState,
      chain.fetchedAt,
      chain.dataAgeMs,
    );
  }

  if (!finitePositive(chain.underlyingPrice)) {
    return buildUnavailableSpyZeroDteExpectedMoveResponse(
      chain.currentMarketDate,
      nowMs,
      "UNDERLYING_PRICE_UNAVAILABLE",
      chain.sourceState,
      chain.fetchedAt,
      chain.dataAgeMs,
      chain.returnedExpirationDate,
    );
  }

  const strikes = [...chain.calls, ...chain.puts].map((contract) => contract.strikePrice);
  const atmStrike = selectAtmStrike(strikes, chain.underlyingPrice);
  if (atmStrike === null) {
    return buildUnavailableSpyZeroDteExpectedMoveResponse(
      chain.currentMarketDate,
      nowMs,
      "ATM_STRIKE_UNAVAILABLE",
      chain.sourceState,
      chain.fetchedAt,
      chain.dataAgeMs,
      chain.returnedExpirationDate,
      chain.underlyingPrice,
    );
  }

  const call = selectStandardContract(chain.calls, "CALL", chain.currentMarketDate, atmStrike);
  if (!call) {
    return buildUnavailableSpyZeroDteExpectedMoveResponse(
      chain.currentMarketDate,
      nowMs,
      "ATM_CALL_UNAVAILABLE",
      chain.sourceState,
      chain.fetchedAt,
      chain.dataAgeMs,
      chain.returnedExpirationDate,
      chain.underlyingPrice,
    );
  }

  const put = selectStandardContract(chain.puts, "PUT", chain.currentMarketDate, atmStrike);
  if (!put) {
    return buildUnavailableSpyZeroDteExpectedMoveResponse(
      chain.currentMarketDate,
      nowMs,
      "ATM_PUT_UNAVAILABLE",
      chain.sourceState,
      chain.fetchedAt,
      chain.dataAgeMs,
      chain.returnedExpirationDate,
      chain.underlyingPrice,
    );
  }

  if (!finiteNonnegative(call.mark)) {
    return buildUnavailableSpyZeroDteExpectedMoveResponse(
      chain.currentMarketDate,
      nowMs,
      "ATM_CALL_MARK_UNAVAILABLE",
      chain.sourceState,
      chain.fetchedAt,
      chain.dataAgeMs,
      chain.returnedExpirationDate,
      chain.underlyingPrice,
    );
  }

  if (!finiteNonnegative(put.mark)) {
    return buildUnavailableSpyZeroDteExpectedMoveResponse(
      chain.currentMarketDate,
      nowMs,
      "ATM_PUT_MARK_UNAVAILABLE",
      chain.sourceState,
      chain.fetchedAt,
      chain.dataAgeMs,
      chain.returnedExpirationDate,
      chain.underlyingPrice,
    );
  }

  const calculation = calculateAtmStraddleMarkImpliedMove(chain.underlyingPrice, call.mark, put.mark);
  if (!calculation) {
    return buildUnavailableSpyZeroDteExpectedMoveResponse(
      chain.currentMarketDate,
      nowMs,
      "INVALID_IMPLIED_MOVE_INPUTS",
      chain.sourceState,
      chain.fetchedAt,
      chain.dataAgeMs,
      chain.returnedExpirationDate,
      chain.underlyingPrice,
    );
  }

  const metricState = chain.metricState === "STALE" ? "STALE" : "LIVE";
  return SpyZeroDteExpectedMoveResponseSchema.parse({
    symbol: "SPY",
    metric: "ZERO_DTE_ATM_IMPLIED_MOVE",
    methodology: "ATM_STRADDLE_MARK",
    currentMarketDate: chain.currentMarketDate,
    expirationDate: chain.returnedExpirationDate,
    metricState,
    sourceState: metricState,
    underlyingPrice: chain.underlyingPrice,
    underlyingPriceSource: "CHAIN_RESPONSE",
    atmStrike,
    callContractSymbol: call.contractSymbol,
    putContractSymbol: put.contractSymbol,
    callMark: call.mark,
    putMark: put.mark,
    ...calculation,
    callQuoteAt: call.quoteAt,
    putQuoteAt: put.quoteAt,
    latestSelectedContractQuoteAt: latestIso([call.quoteAt, put.quoteAt]),
    chainFetchedAt: chain.fetchedAt,
    fetchedAt: new Date(nowMs).toISOString(),
    dataAgeMs: chain.dataAgeMs,
    warningCode: metricState === "STALE" ? "RETAINED_STALE_CHAIN" : null,
  });
}
