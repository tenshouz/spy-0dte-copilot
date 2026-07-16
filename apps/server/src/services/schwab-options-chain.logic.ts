import {
  OPTIONS_CHAIN_FRESHNESS_THRESHOLD_MS,
  SpyZeroDteOptionsChainResponseSchema,
  type NormalizedOptionContract,
  type OptionsChainWarningCode,
  type SpyZeroDteOptionsChainResponse,
} from "@spy-copilot/shared";
import { z } from "zod";

/**
 * Pure SPY Options Chain validation and normalization.
 *
 * Verified real provider shape (2026-07-15):
 *   callExpDateMap["YYYY-MM-DD:days"]["strike"] -> contract[]
 *   putExpDateMap["YYYY-MM-DD:days"]["strike"] -> contract[]
 *
 * Unknown provider fields are accepted at the raw boundary and never cross
 * into the normalized application contract. Individual malformed contracts
 * are rejected without discarding an otherwise trustworthy top-level chain.
 */

export const OPTIONS_CHAIN_SHORT_CACHE_MS = 15_000;
export const OPTIONS_CHAIN_STALE_RETENTION_MS = 5 * 60_000;
export const OPTIONS_CHAIN_REQUESTED_STRIKE_COUNT = 10;

const MAX_EPOCH_MS = 8_640_000_000_000_000;
const EXPIRATION_KEY_RE = /^(\d{4}-\d{2}-\d{2}):(\d+)$/;
const MARKET_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

const RawOptionsChainEnvelopeSchema = z
  .object({
    symbol: z.literal("SPY"),
    status: z.string(),
    strategy: z.string().optional(),
    isDelayed: z.boolean().optional(),
    underlyingPrice: z.unknown().optional(),
    numberOfContracts: z.unknown().optional(),
    callExpDateMap: z.record(z.record(z.array(z.unknown()))),
    putExpDateMap: z.record(z.record(z.array(z.unknown()))),
  })
  .passthrough();

const RawOptionContractIdentitySchema = z
  .object({
    putCall: z.unknown(),
    symbol: z.unknown(),
    expirationDate: z.unknown(),
    strikePrice: z.unknown(),
    description: z.unknown().optional(),
    bid: z.unknown().optional(),
    ask: z.unknown().optional(),
    last: z.unknown().optional(),
    mark: z.unknown().optional(),
    bidSize: z.unknown().optional(),
    askSize: z.unknown().optional(),
    lastSize: z.unknown().optional(),
    totalVolume: z.unknown().optional(),
    openInterest: z.unknown().optional(),
    volatility: z.unknown().optional(),
    delta: z.unknown().optional(),
    gamma: z.unknown().optional(),
    theta: z.unknown().optional(),
    vega: z.unknown().optional(),
    rho: z.unknown().optional(),
    inTheMoney: z.unknown().optional(),
    nonStandard: z.unknown().optional(),
    multiplier: z.unknown().optional(),
    quoteTimeInLong: z.unknown().optional(),
    tradeTimeInLong: z.unknown().optional(),
  })
  .passthrough();

export interface CachedOptionsChain {
  currentMarketDate: string;
  requestedExpirationDate: string;
  returnedExpirationDate: string;
  underlyingPrice: number | null;
  calls: NormalizedOptionContract[];
  puts: NormalizedOptionContract[];
  requestedStrikeCount: number;
  returnedUniqueStrikeCount: number;
  minimumReturnedStrike: number | null;
  maximumReturnedStrike: number | null;
  providerContractCount: number | null;
  rejectedContractCount: number;
  contractsWithBidAsk: number;
  contractsWithGreeks: number;
  contractsWithOpenInterest: number;
  contractsWithVolume: number;
  latestOptionQuoteAt: string | null;
  latestOptionTradeAt: string | null;
  isDelayed: boolean;
  fetchedAtMs: number;
  warningCode: OptionsChainWarningCode | null;
}

export interface NormalizedOptionsChainResult {
  kind: "CHAIN" | "NO_CURRENT_DATE_EXPIRATION" | "NO_VALID_CONTRACTS";
  cache: CachedOptionsChain | null;
  rejectedContractCount: number;
}

function finiteNumber(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function nonnegativeNumber(value: unknown): number | null {
  const parsed = finiteNumber(value);
  return parsed !== null && parsed >= 0 ? parsed : null;
}

function positiveNumber(value: unknown): number | null {
  const parsed = finiteNumber(value);
  return parsed !== null && parsed > 0 ? parsed : null;
}

function nonnegativeInteger(value: unknown): number | null {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0 ? value : null;
}

function nullableBoolean(value: unknown): boolean | null {
  return typeof value === "boolean" ? value : null;
}

function epochMsToIso(value: unknown): string | null {
  if (
    typeof value !== "number" ||
    !Number.isSafeInteger(value) ||
    value <= 0 ||
    value > MAX_EPOCH_MS
  ) {
    return null;
  }
  try {
    return new Date(value).toISOString();
  } catch {
    return null;
  }
}

function normalizeExpirationDate(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const marketDate = value.slice(0, 10);
  if (!MARKET_DATE_RE.test(marketDate)) return null;
  const parsed = Date.parse(value);
  if (Number.isNaN(parsed)) return null;
  return marketDate;
}

function validateMapKeys(map: Record<string, Record<string, unknown[]>>): void {
  for (const [expirationKey, strikeMap] of Object.entries(map)) {
    if (!EXPIRATION_KEY_RE.test(expirationKey)) {
      throw new Error("Invalid Schwab options expiration-map key.");
    }
    for (const strikeKey of Object.keys(strikeMap)) {
      const strike = Number(strikeKey);
      if (!Number.isFinite(strike) || strike <= 0) {
        throw new Error("Invalid Schwab options strike-map key.");
      }
    }
  }
}

function normalizeContract(
  rawValue: unknown,
  expectedType: "CALL" | "PUT",
  currentMarketDate: string,
): { contract: NormalizedOptionContract | null; optionalFieldInvalid: boolean } {
  const parsed = RawOptionContractIdentitySchema.safeParse(rawValue);
  if (!parsed.success) return { contract: null, optionalFieldInvalid: false };
  const raw = parsed.data;

  if (raw.putCall !== expectedType) return { contract: null, optionalFieldInvalid: false };
  if (typeof raw.symbol !== "string" || raw.symbol.trim().length === 0) {
    return { contract: null, optionalFieldInvalid: false };
  }

  const expirationDate = normalizeExpirationDate(raw.expirationDate);
  const strikePrice = positiveNumber(raw.strikePrice);
  if (expirationDate !== currentMarketDate || strikePrice === null) {
    return { contract: null, optionalFieldInvalid: false };
  }

  let optionalFieldInvalid = false;
  const optionalNumber = (
    value: unknown,
    parser: (candidate: unknown) => number | null,
  ): number | null => {
    if (value === undefined || value === null) return null;
    const result = parser(value);
    if (result === null) optionalFieldInvalid = true;
    return result;
  };
  const optionalBool = (value: unknown): boolean | null => {
    if (value === undefined || value === null) return null;
    const result = nullableBoolean(value);
    if (result === null) optionalFieldInvalid = true;
    return result;
  };
  const optionalTimestamp = (value: unknown): string | null => {
    if (value === undefined || value === null) return null;
    const result = epochMsToIso(value);
    if (result === null) optionalFieldInvalid = true;
    return result;
  };

  const contract = {
    contractSymbol: raw.symbol,
    underlyingSymbol: "SPY" as const,
    optionType: expectedType,
    expirationDate,
    strikePrice,
    description: typeof raw.description === "string" ? raw.description : null,
    bid: optionalNumber(raw.bid, nonnegativeNumber),
    ask: optionalNumber(raw.ask, nonnegativeNumber),
    last: optionalNumber(raw.last, nonnegativeNumber),
    mark: optionalNumber(raw.mark, nonnegativeNumber),
    bidSize: optionalNumber(raw.bidSize, nonnegativeInteger),
    askSize: optionalNumber(raw.askSize, nonnegativeInteger),
    lastSize: optionalNumber(raw.lastSize, nonnegativeInteger),
    volume: optionalNumber(raw.totalVolume, nonnegativeInteger),
    openInterest: optionalNumber(raw.openInterest, nonnegativeInteger),
    impliedVolatilityPercent: optionalNumber(raw.volatility, nonnegativeNumber),
    delta: optionalNumber(raw.delta, finiteNumber),
    gamma: optionalNumber(raw.gamma, nonnegativeNumber),
    theta: optionalNumber(raw.theta, finiteNumber),
    vega: optionalNumber(raw.vega, finiteNumber),
    rho: optionalNumber(raw.rho, finiteNumber),
    inTheMoney: optionalBool(raw.inTheMoney),
    nonStandard: optionalBool(raw.nonStandard),
    multiplier: optionalNumber(raw.multiplier, positiveNumber),
    quoteAt: optionalTimestamp(raw.quoteTimeInLong),
    tradeAt: optionalTimestamp(raw.tradeTimeInLong),
  } satisfies NormalizedOptionContract;

  return { contract, optionalFieldInvalid };
}

function latestIso(values: readonly (string | null)[]): string | null {
  let latestMs = -1;
  let latest: string | null = null;
  for (const value of values) {
    if (!value) continue;
    const ms = Date.parse(value);
    if (!Number.isNaN(ms) && ms > latestMs) {
      latestMs = ms;
      latest = value;
    }
  }
  return latest;
}

export function normalizeRawSpyZeroDteOptionsChain(
  rawJson: unknown,
  currentMarketDate: string,
  fetchedAtMs: number,
): NormalizedOptionsChainResult {
  if (!MARKET_DATE_RE.test(currentMarketDate)) {
    throw new Error("Invalid current market date.");
  }

  const parsed = RawOptionsChainEnvelopeSchema.parse(rawJson);
  if (parsed.status !== "SUCCESS") {
    throw new Error("Schwab options chain did not report SUCCESS.");
  }

  validateMapKeys(parsed.callExpDateMap);
  validateMapKeys(parsed.putExpDateMap);

  const bySymbol = new Map<string, NormalizedOptionContract>();
  let rejectedContractCount = 0;
  let optionalInvalidCount = 0;
  let currentDateCandidateCount = 0;

  const processMap = (
    map: Record<string, Record<string, unknown[]>>,
    expectedType: "CALL" | "PUT",
  ) => {
    for (const [expirationKey, strikeMap] of Object.entries(map)) {
      const keyDate = expirationKey.match(EXPIRATION_KEY_RE)?.[1];
      if (keyDate !== currentMarketDate) continue;

      for (const rawContracts of Object.values(strikeMap)) {
        for (const rawContract of rawContracts) {
          currentDateCandidateCount += 1;
          const normalized = normalizeContract(rawContract, expectedType, currentMarketDate);
          if (!normalized.contract) {
            rejectedContractCount += 1;
            continue;
          }
          if (normalized.optionalFieldInvalid) optionalInvalidCount += 1;
          bySymbol.set(normalized.contract.contractSymbol, normalized.contract); // deterministic last-wins
        }
      }
    }
  };

  processMap(parsed.callExpDateMap, "CALL");
  processMap(parsed.putExpDateMap, "PUT");

  const contracts = [...bySymbol.values()];
  if (contracts.length === 0) {
    return {
      kind: currentDateCandidateCount > 0 ? "NO_VALID_CONTRACTS" : "NO_CURRENT_DATE_EXPIRATION",
      cache: null,
      rejectedContractCount,
    };
  }

  const sortContracts = (a: NormalizedOptionContract, b: NormalizedOptionContract) =>
    a.strikePrice - b.strikePrice || a.contractSymbol.localeCompare(b.contractSymbol);
  const calls = contracts.filter((contract) => contract.optionType === "CALL").sort(sortContracts);
  const puts = contracts.filter((contract) => contract.optionType === "PUT").sort(sortContracts);

  const strikes = [...new Set(contracts.map((contract) => contract.strikePrice))].sort((a, b) => a - b);
  const warningCode: OptionsChainWarningCode | null =
    rejectedContractCount > 0 || optionalInvalidCount > 0 ? "PARTIAL_CONTRACT_DATA" : null;

  const providerContractCount = nonnegativeInteger(parsed.numberOfContracts);
  const underlyingPrice = positiveNumber(parsed.underlyingPrice);

  return {
    kind: "CHAIN",
    rejectedContractCount,
    cache: {
      currentMarketDate,
      requestedExpirationDate: currentMarketDate,
      returnedExpirationDate: currentMarketDate,
      underlyingPrice,
      calls,
      puts,
      requestedStrikeCount: OPTIONS_CHAIN_REQUESTED_STRIKE_COUNT,
      returnedUniqueStrikeCount: strikes.length,
      minimumReturnedStrike: strikes[0] ?? null,
      maximumReturnedStrike: strikes[strikes.length - 1] ?? null,
      providerContractCount,
      rejectedContractCount,
      contractsWithBidAsk: contracts.filter((contract) => contract.bid !== null && contract.ask !== null).length,
      contractsWithGreeks: contracts.filter(
        (contract) =>
          contract.delta !== null &&
          contract.gamma !== null &&
          contract.theta !== null &&
          contract.vega !== null &&
          contract.rho !== null,
      ).length,
      contractsWithOpenInterest: contracts.filter((contract) => contract.openInterest !== null).length,
      contractsWithVolume: contracts.filter((contract) => contract.volume !== null).length,
      latestOptionQuoteAt: latestIso(contracts.map((contract) => contract.quoteAt)),
      latestOptionTradeAt: latestIso(contracts.map((contract) => contract.tradeAt)),
      isDelayed: parsed.isDelayed ?? false,
      fetchedAtMs,
      warningCode,
    },
  };
}

export function decideOptionsChainMetricState(
  fetchedAtMs: number,
  nowMs: number,
): "LIVE" | "STALE" {
  return nowMs - fetchedAtMs <= OPTIONS_CHAIN_FRESHNESS_THRESHOLD_MS ? "LIVE" : "STALE";
}

export function isRetainedOptionsChainEligible(
  cache: CachedOptionsChain | null,
  currentMarketDate: string,
  nowMs: number,
): cache is CachedOptionsChain {
  return Boolean(
    cache &&
      cache.currentMarketDate === currentMarketDate &&
      nowMs - cache.fetchedAtMs <= OPTIONS_CHAIN_STALE_RETENTION_MS,
  );
}

export function toSpyZeroDteOptionsChainResponse(
  cache: CachedOptionsChain,
  nowMs: number,
  warningCode: OptionsChainWarningCode | null = cache.warningCode,
): SpyZeroDteOptionsChainResponse {
  const metricState =
    warningCode === "RETAINED_STALE_CHAIN"
      ? "STALE"
      : decideOptionsChainMetricState(cache.fetchedAtMs, nowMs);
  return SpyZeroDteOptionsChainResponseSchema.parse({
    symbol: "SPY",
    metric: "ZERO_DTE_OPTIONS_CHAIN",
    currentMarketDate: cache.currentMarketDate,
    requestedExpirationDate: cache.requestedExpirationDate,
    returnedExpirationDate: cache.returnedExpirationDate,
    metricState,
    sourceState: metricState,
    isDelayed: cache.isDelayed,
    underlyingPrice: cache.underlyingPrice,
    underlyingPriceSource: cache.underlyingPrice === null ? "UNAVAILABLE" : "CHAIN_RESPONSE",
    calls: cache.calls,
    puts: cache.puts,
    requestedStrikeCount: cache.requestedStrikeCount,
    returnedUniqueStrikeCount: cache.returnedUniqueStrikeCount,
    callContractCount: cache.calls.length,
    putContractCount: cache.puts.length,
    minimumReturnedStrike: cache.minimumReturnedStrike,
    maximumReturnedStrike: cache.maximumReturnedStrike,
    providerContractCount: cache.providerContractCount,
    totalContracts: cache.calls.length + cache.puts.length,
    contractsWithBidAsk: cache.contractsWithBidAsk,
    contractsWithGreeks: cache.contractsWithGreeks,
    contractsWithOpenInterest: cache.contractsWithOpenInterest,
    contractsWithVolume: cache.contractsWithVolume,
    rejectedContractCount: cache.rejectedContractCount,
    fetchedAt: new Date(cache.fetchedAtMs).toISOString(),
    dataAgeMs: Math.max(0, nowMs - cache.fetchedAtMs),
    latestOptionQuoteAt: cache.latestOptionQuoteAt,
    latestOptionTradeAt: cache.latestOptionTradeAt,
    warningCode,
  });
}

export function buildUnavailableSpyZeroDteOptionsChainResponse(
  currentMarketDate: string,
  nowMs: number,
  warningCode: OptionsChainWarningCode,
  sourceState: "LIVE" | "UNAVAILABLE" = "UNAVAILABLE",
  fetchedAtMs: number = nowMs,
): SpyZeroDteOptionsChainResponse {
  return SpyZeroDteOptionsChainResponseSchema.parse({
    symbol: "SPY",
    metric: "ZERO_DTE_OPTIONS_CHAIN",
    currentMarketDate,
    requestedExpirationDate: currentMarketDate,
    returnedExpirationDate: null,
    metricState: "UNAVAILABLE",
    sourceState,
    isDelayed: null,
    underlyingPrice: null,
    underlyingPriceSource: "UNAVAILABLE",
    calls: [],
    puts: [],
    requestedStrikeCount: OPTIONS_CHAIN_REQUESTED_STRIKE_COUNT,
    returnedUniqueStrikeCount: 0,
    callContractCount: 0,
    putContractCount: 0,
    minimumReturnedStrike: null,
    maximumReturnedStrike: null,
    providerContractCount: null,
    totalContracts: 0,
    contractsWithBidAsk: 0,
    contractsWithGreeks: 0,
    contractsWithOpenInterest: 0,
    contractsWithVolume: 0,
    rejectedContractCount: 0,
    fetchedAt: new Date(fetchedAtMs).toISOString(),
    dataAgeMs: Math.max(0, nowMs - fetchedAtMs),
    latestOptionQuoteAt: null,
    latestOptionTradeAt: null,
    warningCode,
  });
}
