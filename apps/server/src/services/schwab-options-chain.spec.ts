/**
 * Deterministic tests for the pure SPY current-date Options Chain logic.
 *
 * Run:
 *   npx --no-install tsx apps/server/src/services/schwab-options-chain.spec.ts
 */
import assert from "node:assert/strict";
import { OPTIONS_CHAIN_FRESHNESS_THRESHOLD_MS } from "@spy-copilot/shared";
import { buildSpyZeroDteOptionsChainUrl } from "./schwab-options-chain.client";
import {
  OPTIONS_CHAIN_REQUESTED_STRIKE_COUNT,
  OPTIONS_CHAIN_STALE_RETENTION_MS,
  buildUnavailableSpyZeroDteOptionsChainResponse,
  decideOptionsChainMetricState,
  isRetainedOptionsChainEligible,
  normalizeRawSpyZeroDteOptionsChain,
  toSpyZeroDteOptionsChainResponse,
} from "./schwab-options-chain.logic";

const MARKET_DATE = "2026-07-15";
const NOW = 1_784_157_786_621;
const QUOTE_AT = 1_784_146_499_969;
const TRADE_AT = 1_784_146_498_407;

function contract(
  putCall: "CALL" | "PUT",
  strikePrice: number,
  overrides: Record<string, unknown> = {},
) {
  return {
    putCall,
    symbol: `SPY   260715${putCall === "CALL" ? "C" : "P"}${String(strikePrice * 1000).padStart(8, "0")}`,
    description: `SPY 07/15/2026 ${strikePrice.toFixed(2)} ${putCall === "CALL" ? "C" : "P"}`,
    bid: 0.5,
    ask: 0.56,
    last: 0.53,
    mark: 0.53,
    bidSize: 4,
    askSize: 15,
    lastSize: 1,
    totalVolume: 950_023,
    quoteTimeInLong: QUOTE_AT,
    tradeTimeInLong: TRADE_AT,
    volatility: 9.916,
    delta: putCall === "CALL" ? 0.4 : -0.6,
    gamma: 0.503,
    theta: -0.065,
    vega: 0.016,
    rho: 0,
    openInterest: 10_949,
    strikePrice,
    expirationDate: "2026-07-15T20:00:00.000+00:00",
    multiplier: 100,
    inTheMoney: false,
    nonStandard: false,
    isMini: false,
    ...overrides,
  };
}

function fixture() {
  return {
    symbol: "SPY",
    status: "SUCCESS",
    strategy: "SINGLE",
    isDelayed: false,
    underlyingPrice: 754.81,
    numberOfContracts: 4,
    callExpDateMap: {
      "2026-07-15:0": {
        "754.0": [contract("CALL", 754)],
        "755.0": [contract("CALL", 755)],
      },
    },
    putExpDateMap: {
      "2026-07-15:0": {
        "754.0": [contract("PUT", 754)],
        "755.0": [contract("PUT", 755)],
      },
    },
  };
}

function normalized(raw: unknown = fixture()) {
  const result = normalizeRawSpyZeroDteOptionsChain(raw, MARKET_DATE, NOW);
  assert.equal(result.kind, "CHAIN");
  assert.ok(result.cache);
  return result.cache;
}

let passed = 0;
let failed = 0;
function test(name: string, fn: () => void) {
  try {
    fn();
    passed += 1;
    console.log(`PASS ${name}`);
  } catch (err) {
    failed += 1;
    console.error(`FAIL ${name}: ${(err as Error).message}`);
  }
}

test("request URL is fixed to SPY, ALL, SINGLE, strikeCount 10, and one expiration", () => {
  const url = new URL(buildSpyZeroDteOptionsChainUrl({ expirationDate: MARKET_DATE }));
  assert.equal(url.pathname, "/marketdata/v1/chains");
  assert.equal(url.searchParams.get("symbol"), "SPY");
  assert.equal(url.searchParams.get("contractType"), "ALL");
  assert.equal(url.searchParams.get("strategy"), "SINGLE");
  assert.equal(url.searchParams.get("strikeCount"), String(OPTIONS_CHAIN_REQUESTED_STRIKE_COUNT));
  assert.equal(url.searchParams.get("includeUnderlyingQuote"), "true");
  assert.equal(url.searchParams.get("fromDate"), MARKET_DATE);
  assert.equal(url.searchParams.get("toDate"), MARKET_DATE);
});

test("invalid request expiration is rejected", () => {
  assert.throws(() => buildSpyZeroDteOptionsChainUrl({ expirationDate: "07/15/2026" }));
});

test("real-shaped Call and Put maps normalize", () => {
  const cache = normalized();
  assert.equal(cache.calls.length, 2);
  assert.equal(cache.puts.length, 2);
  assert.equal(cache.returnedExpirationDate, MARKET_DATE);
  assert.equal(cache.underlyingPrice, 754.81);
});

test("expiration key and strike map arrays are interpreted correctly", () => {
  const cache = normalized();
  assert.deepEqual(cache.calls.map((item) => item.strikePrice), [754, 755]);
  assert.deepEqual(cache.puts.map((item) => item.strikePrice), [754, 755]);
});

test("provider contract symbol and explicit option type are preserved", () => {
  const cache = normalized();
  assert.equal(cache.calls[0]!.optionType, "CALL");
  assert.equal(cache.puts[0]!.optionType, "PUT");
  assert.match(cache.calls[0]!.contractSymbol, /260715C/);
});

test("full provider expiration timestamp normalizes to market date", () => {
  assert.equal(normalized().calls[0]!.expirationDate, MARKET_DATE);
});

test("provider quote, liquidity, IV, and Greeks normalize without local calculation", () => {
  const item = normalized().calls[0]!;
  assert.equal(item.bid, 0.5);
  assert.equal(item.ask, 0.56);
  assert.equal(item.mark, 0.53);
  assert.equal(item.volume, 950_023);
  assert.equal(item.openInterest, 10_949);
  assert.equal(item.impliedVolatilityPercent, 9.916);
  assert.equal(item.gamma, 0.503);
  assert.equal(item.theta, -0.065);
});

test("negative Put Delta and negative Theta are preserved", () => {
  const item = normalized().puts[0]!;
  assert.equal(item.delta, -0.6);
  assert.equal(item.theta, -0.065);
});

test("legitimate zero values remain zero", () => {
  const raw = fixture();
  raw.callExpDateMap["2026-07-15:0"]["754.0"] = [
    contract("CALL", 754, { bid: 0, bidSize: 0, totalVolume: 0, openInterest: 0, gamma: 0 }),
  ];
  const item = normalized(raw).calls[0]!;
  assert.equal(item.bid, 0);
  assert.equal(item.bidSize, 0);
  assert.equal(item.volume, 0);
  assert.equal(item.openInterest, 0);
  assert.equal(item.gamma, 0);
});

test("missing optional fields become null rather than zero", () => {
  const raw = fixture();
  raw.callExpDateMap["2026-07-15:0"]["754.0"] = [
    contract("CALL", 754, { bid: undefined, gamma: undefined, quoteTimeInLong: undefined }),
  ];
  const item = normalized(raw).calls[0]!;
  assert.equal(item.bid, null);
  assert.equal(item.gamma, null);
  assert.equal(item.quoteAt, null);
});

test("invalid optional fields become null and produce partial-data warning", () => {
  const raw = fixture();
  raw.callExpDateMap["2026-07-15:0"]["754.0"] = [
    contract("CALL", 754, { bid: "bad", gamma: -1, quoteTimeInLong: "bad" }),
  ];
  const cache = normalized(raw);
  const item = cache.calls[0]!;
  assert.equal(item.bid, null);
  assert.equal(item.gamma, null);
  assert.equal(item.quoteAt, null);
  assert.equal(cache.warningCode, "PARTIAL_CONTRACT_DATA");
});

test("malformed identity contract is rejected while valid contracts remain", () => {
  const raw = fixture();
  raw.callExpDateMap["2026-07-15:0"]["754.0"].push(contract("CALL", 754, { symbol: "" }));
  const cache = normalized(raw);
  assert.equal(cache.calls.length, 2);
  assert.equal(cache.rejectedContractCount, 1);
  assert.equal(cache.warningCode, "PARTIAL_CONTRACT_DATA");
});

test("Call map contract labeled PUT is rejected", () => {
  const raw = fixture();
  raw.callExpDateMap["2026-07-15:0"]["754.0"] = [contract("PUT", 754)];
  const cache = normalized(raw);
  assert.equal(cache.calls.length, 1);
  assert.equal(cache.rejectedContractCount, 1);
});

test("mixed expiration response retains current date only", () => {
  const raw = fixture() as ReturnType<typeof fixture> & { callExpDateMap: Record<string, Record<string, unknown[]>> };
  raw.callExpDateMap["2026-07-16:1"] = { "760.0": [contract("CALL", 760, { expirationDate: "2026-07-16T20:00:00Z" })] };
  const cache = normalized(raw);
  assert.equal(cache.calls.length, 2);
  assert.ok(cache.calls.every((item) => item.expirationDate === MARKET_DATE));
});

test("no current-date maps returns NO_CURRENT_DATE_EXPIRATION without fallback", () => {
  const raw: Record<string, unknown> = fixture();
  raw.callExpDateMap = { "2026-07-16:1": { "760.0": [contract("CALL", 760, { expirationDate: "2026-07-16T20:00:00Z" })] } };
  raw.putExpDateMap = { "2026-07-16:1": { "760.0": [contract("PUT", 760, { expirationDate: "2026-07-16T20:00:00Z" })] } };
  const result = normalizeRawSpyZeroDteOptionsChain(raw, MARKET_DATE, NOW);
  assert.equal(result.kind, "NO_CURRENT_DATE_EXPIRATION");
  assert.equal(result.cache, null);
});



test("current-date candidates that all fail identity validation produce NO_VALID_CONTRACTS", () => {
  const raw: Record<string, unknown> = fixture();
  const callMap = raw.callExpDateMap as Record<string, Record<string, unknown[]>>;
  const putMap = raw.putExpDateMap as Record<string, Record<string, unknown[]>>;
  callMap["2026-07-15:0"] = { "754.0": [contract("CALL", 754, { symbol: "" })] };
  putMap["2026-07-15:0"] = { "754.0": [contract("PUT", 754, { strikePrice: -1 })] };
  const result = normalizeRawSpyZeroDteOptionsChain(raw, MARKET_DATE, NOW);
  assert.equal(result.kind, "NO_VALID_CONTRACTS");
  assert.equal(result.cache, null);
  assert.equal(result.rejectedContractCount, 2);
});

test("invalid expiration-map key rejects the top-level chain", () => {
  const raw: Record<string, unknown> = fixture();
  const callMap = raw.callExpDateMap as Record<string, Record<string, unknown[]>>;
  callMap.bad = { "754.0": [contract("CALL", 754)] };
  assert.throws(() => normalizeRawSpyZeroDteOptionsChain(raw, MARKET_DATE, NOW));
});

test("invalid strike-map key rejects the top-level chain", () => {
  const raw: Record<string, unknown> = fixture();
  const callMap = raw.callExpDateMap as Record<string, Record<string, unknown[]>>;
  callMap["2026-07-15:0"]!.bad = [contract("CALL", 754)];
  assert.throws(() => normalizeRawSpyZeroDteOptionsChain(raw, MARKET_DATE, NOW));
});

test("non-SUCCESS status rejects the chain", () => {
  assert.throws(() => normalizeRawSpyZeroDteOptionsChain({ ...fixture(), status: "FAILED" }, MARKET_DATE, NOW));
});

test("non-SPY top-level symbol rejects the chain", () => {
  assert.throws(() => normalizeRawSpyZeroDteOptionsChain({ ...fixture(), symbol: "QQQ" }, MARKET_DATE, NOW));
});

test("duplicate contract symbol uses deterministic final occurrence", () => {
  const raw = fixture();
  const duplicate = contract("CALL", 754, { bid: 9.99 });
  raw.callExpDateMap["2026-07-15:0"]["755.0"].push({ ...duplicate, strikePrice: 754 });
  const cache = normalized(raw);
  const matching = cache.calls.filter((item) => item.contractSymbol === duplicate.symbol);
  assert.equal(matching.length, 1);
  assert.equal(matching[0]!.bid, 9.99);
});

test("Calls and Puts sort by strike then symbol", () => {
  const raw = fixture();
  raw.callExpDateMap["2026-07-15:0"] = {
    "755.0": [contract("CALL", 755)],
    "754.0": [contract("CALL", 754)],
  };
  assert.deepEqual(normalized(raw).calls.map((item) => item.strikePrice), [754, 755]);
});

test("same strike Call and Put remain distinct", () => {
  const cache = normalized();
  assert.equal(cache.calls.find((item) => item.strikePrice === 754)?.optionType, "CALL");
  assert.equal(cache.puts.find((item) => item.strikePrice === 754)?.optionType, "PUT");
});

test("strike and contract metadata are accurate", () => {
  const cache = normalized();
  assert.equal(cache.returnedUniqueStrikeCount, 2);
  assert.equal(cache.minimumReturnedStrike, 754);
  assert.equal(cache.maximumReturnedStrike, 755);
  assert.equal(cache.providerContractCount, 4);
});

test("provider millisecond timestamps normalize to ISO and latest values", () => {
  const cache = normalized();
  assert.equal(cache.calls[0]!.quoteAt, new Date(QUOTE_AT).toISOString());
  assert.equal(cache.latestOptionQuoteAt, new Date(QUOTE_AT).toISOString());
  assert.equal(cache.latestOptionTradeAt, new Date(TRADE_AT).toISOString());
});

test("LIVE at freshness boundary and STALE immediately after", () => {
  assert.equal(decideOptionsChainMetricState(NOW, NOW + OPTIONS_CHAIN_FRESHNESS_THRESHOLD_MS), "LIVE");
  assert.equal(decideOptionsChainMetricState(NOW, NOW + OPTIONS_CHAIN_FRESHNESS_THRESHOLD_MS + 1), "STALE");
});

test("retained chain eligibility rejects date rollover immediately", () => {
  const cache = normalized();
  assert.equal(isRetainedOptionsChainEligible(cache, MARKET_DATE, NOW + 1_000), true);
  assert.equal(isRetainedOptionsChainEligible(cache, "2026-07-16", NOW + 1_000), false);
});

test("retained chain eligibility expires after five minutes", () => {
  const cache = normalized();
  assert.equal(isRetainedOptionsChainEligible(cache, MARKET_DATE, NOW + OPTIONS_CHAIN_STALE_RETENTION_MS), true);
  assert.equal(isRetainedOptionsChainEligible(cache, MARKET_DATE, NOW + OPTIONS_CHAIN_STALE_RETENTION_MS + 1), false);
});

test("available response validates counts, expiration, source, and raw-provider separation", () => {
  const response = toSpyZeroDteOptionsChainResponse(normalized(), NOW + 1_000);
  assert.equal(response.metricState, "LIVE");
  assert.equal(response.sourceState, "LIVE");
  assert.equal(response.totalContracts, 4);
  assert.equal(response.returnedExpirationDate, MARKET_DATE);
  assert.equal("callExpDateMap" in response, false);
});

test("retained fallback is STALE even when the cached fetch is still fresh", () => {
  const response = toSpyZeroDteOptionsChainResponse(
    normalized(),
    NOW + 1_000,
    "RETAINED_STALE_CHAIN",
  );
  assert.equal(response.metricState, "STALE");
  assert.equal(response.warningCode, "RETAINED_STALE_CHAIN");
});

test("unavailable no-expiration response is empty but source may be LIVE", () => {
  const response = buildUnavailableSpyZeroDteOptionsChainResponse(
    MARKET_DATE,
    NOW,
    "NO_CURRENT_DATE_EXPIRATION",
    "LIVE",
  );
  assert.equal(response.metricState, "UNAVAILABLE");
  assert.equal(response.sourceState, "LIVE");
  assert.equal(response.calls.length, 0);
  assert.equal(response.puts.length, 0);
  assert.equal(response.returnedExpirationDate, null);
});

console.log(`\n${passed} passed, ${failed} failed (${passed + failed} total)`);
if (failed > 0) process.exit(1);
