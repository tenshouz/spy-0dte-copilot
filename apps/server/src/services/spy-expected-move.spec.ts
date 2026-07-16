/**
 * Deterministic tests for the SPY current-date ATM straddle-Mark implied move.
 * Run: npx --no-install tsx apps/server/src/services/spy-expected-move.spec.ts
 */
import assert from "node:assert/strict";
import type { NormalizedOptionContract, SpyZeroDteOptionsChainResponse } from "@spy-copilot/shared";
import {
  calculateAtmStraddleMarkImpliedMove,
  deriveSpyZeroDteExpectedMove,
} from "./spy-expected-move.logic";

const MARKET_DATE = "2026-07-15";
const NOW = Date.parse("2026-07-15T23:30:00.000Z");

function contract(
  optionType: "CALL" | "PUT",
  strikePrice: number,
  overrides: Partial<NormalizedOptionContract> = {},
): NormalizedOptionContract {
  return {
    contractSymbol: `SPY-${optionType}-${strikePrice}`,
    underlyingSymbol: "SPY",
    optionType,
    expirationDate: MARKET_DATE,
    strikePrice,
    description: null,
    bid: 0.5,
    ask: 0.6,
    last: 0.55,
    mark: optionType === "CALL" ? 0.03 : 0.56,
    bidSize: 1,
    askSize: 1,
    lastSize: 1,
    volume: 100,
    openInterest: 200,
    impliedVolatilityPercent: 20,
    delta: optionType === "CALL" ? 0.15 : -0.9,
    gamma: 0.4,
    theta: -0.02,
    vega: 0.01,
    rho: 0,
    inTheMoney: false,
    nonStandard: false,
    multiplier: 100,
    quoteAt: optionType === "CALL" ? "2026-07-15T20:14:59.000Z" : "2026-07-15T20:14:58.000Z",
    tradeAt: null,
    ...overrides,
  };
}

function chain(overrides: Partial<SpyZeroDteOptionsChainResponse> = {}): SpyZeroDteOptionsChainResponse {
  const calls = [contract("CALL", 754), contract("CALL", 755), contract("CALL", 756)];
  const puts = [contract("PUT", 754), contract("PUT", 755), contract("PUT", 756)];
  return {
    symbol: "SPY",
    metric: "ZERO_DTE_OPTIONS_CHAIN",
    currentMarketDate: MARKET_DATE,
    requestedExpirationDate: MARKET_DATE,
    returnedExpirationDate: MARKET_DATE,
    metricState: "LIVE",
    sourceState: "LIVE",
    isDelayed: false,
    underlyingPrice: 754.81,
    underlyingPriceSource: "CHAIN_RESPONSE",
    calls,
    puts,
    requestedStrikeCount: 10,
    returnedUniqueStrikeCount: 3,
    callContractCount: calls.length,
    putContractCount: puts.length,
    minimumReturnedStrike: 754,
    maximumReturnedStrike: 756,
    providerContractCount: 6,
    totalContracts: 6,
    contractsWithBidAsk: 6,
    contractsWithGreeks: 6,
    contractsWithOpenInterest: 6,
    contractsWithVolume: 6,
    rejectedContractCount: 0,
    fetchedAt: "2026-07-15T23:29:45.000Z",
    dataAgeMs: 15_000,
    latestOptionQuoteAt: "2026-07-15T20:14:59.000Z",
    latestOptionTradeAt: null,
    warningCode: null,
    ...overrides,
  };
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

test("calculates points, percent, upper, and lower without rounding", () => {
  assert.deepEqual(calculateAtmStraddleMarkImpliedMove(100, 1.25, 1.75), {
    impliedMovePoints: 3,
    impliedMovePercent: 3,
    upperImpliedMoveLevel: 103,
    lowerImpliedMoveLevel: 97,
  });
});

test("rejects invalid underlying and negative marks", () => {
  assert.equal(calculateAtmStraddleMarkImpliedMove(0, 1, 1), null);
  assert.equal(calculateAtmStraddleMarkImpliedMove(100, -1, 1), null);
  assert.equal(calculateAtmStraddleMarkImpliedMove(100, 1, Number.POSITIVE_INFINITY), null);
});

test("preserves legitimate zero marks", () => {
  assert.equal(calculateAtmStraddleMarkImpliedMove(100, 0, 0)?.impliedMovePoints, 0);
});

test("selects nearest ATM strike and provider Marks", () => {
  const result = deriveSpyZeroDteExpectedMove(chain(), NOW);
  assert.equal(result.atmStrike, 755);
  assert.equal(result.callMark, 0.03);
  assert.equal(result.putMark, 0.56);
  assert.equal(result.impliedMovePoints, 0.5900000000000001);
});

test("equal-distance ATM tie selects lower strike", () => {
  const result = deriveSpyZeroDteExpectedMove(chain({ underlyingPrice: 754.5 }), NOW);
  assert.equal(result.atmStrike, 754);
});

test("uses chain underlying price and never a separate quote", () => {
  const result = deriveSpyZeroDteExpectedMove(chain({ underlyingPrice: 755.2 }), NOW);
  assert.equal(result.underlyingPrice, 755.2);
  assert.equal(result.underlyingPriceSource, "CHAIN_RESPONSE");
});

test("selects standard multiplier-100 contract deterministically", () => {
  const base = chain();
  base.calls = [
    contract("CALL", 755, { contractSymbol: "Z-ADJUSTED", nonStandard: true }),
    contract("CALL", 755, { contractSymbol: "B-STANDARD" }),
    contract("CALL", 755, { contractSymbol: "A-STANDARD" }),
  ];
  base.callContractCount = 3;
  base.totalContracts = 6;
  const result = deriveSpyZeroDteExpectedMove(base, NOW);
  assert.equal(result.callContractSymbol, "A-STANDARD");
});

test("excludes nonstandard-only ATM Call", () => {
  const base = chain();
  base.calls = base.calls.map((item) =>
    item.strikePrice === 755 ? { ...item, nonStandard: true } : item,
  );
  const result = deriveSpyZeroDteExpectedMove(base, NOW);
  assert.equal(result.metricState, "UNAVAILABLE");
  assert.equal(result.warningCode, "ATM_CALL_UNAVAILABLE");
});

test("excludes wrong multiplier", () => {
  const base = chain();
  base.puts = base.puts.map((item) =>
    item.strikePrice === 755 ? { ...item, multiplier: 10 } : item,
  );
  assert.equal(deriveSpyZeroDteExpectedMove(base, NOW).warningCode, "ATM_PUT_UNAVAILABLE");
});

test("missing Call Mark is unavailable", () => {
  const base = chain();
  base.calls = base.calls.map((item) => (item.strikePrice === 755 ? { ...item, mark: null } : item));
  assert.equal(deriveSpyZeroDteExpectedMove(base, NOW).warningCode, "ATM_CALL_MARK_UNAVAILABLE");
});

test("missing Put Mark is unavailable", () => {
  const base = chain();
  base.puts = base.puts.map((item) => (item.strikePrice === 755 ? { ...item, mark: null } : item));
  assert.equal(deriveSpyZeroDteExpectedMove(base, NOW).warningCode, "ATM_PUT_MARK_UNAVAILABLE");
});

test("current-date expiration is mandatory", () => {
  const result = deriveSpyZeroDteExpectedMove(chain({ returnedExpirationDate: null }), NOW);
  assert.equal(result.warningCode, "NO_CURRENT_DATE_EXPIRATION");
});

test("invalid underlying is unavailable", () => {
  const result = deriveSpyZeroDteExpectedMove(chain({ underlyingPrice: null, underlyingPriceSource: "UNAVAILABLE" }), NOW);
  assert.equal(result.warningCode, "UNDERLYING_PRICE_UNAVAILABLE");
});

test("LIVE chain produces LIVE metric", () => {
  assert.equal(deriveSpyZeroDteExpectedMove(chain(), NOW).metricState, "LIVE");
});

test("STALE chain produces STALE metric and warning", () => {
  const result = deriveSpyZeroDteExpectedMove(
    chain({ metricState: "STALE", sourceState: "STALE", warningCode: "RETAINED_STALE_CHAIN" }),
    NOW,
  );
  assert.equal(result.metricState, "STALE");
  assert.equal(result.warningCode, "RETAINED_STALE_CHAIN");
});

test("UNAVAILABLE chain stays unavailable and inherits auth failure", () => {
  const result = deriveSpyZeroDteExpectedMove(
    chain({
      metricState: "UNAVAILABLE",
      sourceState: "UNAVAILABLE",
      returnedExpirationDate: null,
      calls: [],
      puts: [],
      warningCode: "AUTH_REQUIRED",
    }),
    NOW,
  );
  assert.equal(result.metricState, "UNAVAILABLE");
  assert.equal(result.warningCode, "AUTH_REQUIRED");
});

test("MOCK chain does not become a live derived metric", () => {
  const result = deriveSpyZeroDteExpectedMove(chain({ metricState: "MOCK", sourceState: "MOCK" }), NOW);
  assert.equal(result.metricState, "UNAVAILABLE");
  assert.equal(result.sourceState, "MOCK");
});

test("selected contract symbols and quote timestamps are auditable", () => {
  const result = deriveSpyZeroDteExpectedMove(chain(), NOW);
  assert.equal(result.callContractSymbol, "SPY-CALL-755");
  assert.equal(result.putContractSymbol, "SPY-PUT-755");
  assert.equal(result.callQuoteAt, "2026-07-15T20:14:59.000Z");
  assert.equal(result.putQuoteAt, "2026-07-15T20:14:58.000Z");
  assert.equal(result.latestSelectedContractQuoteAt, "2026-07-15T20:14:59.000Z");
});

test("chain fetchedAt remains separate from derived-route fetchedAt", () => {
  const result = deriveSpyZeroDteExpectedMove(chain(), NOW);
  assert.equal(result.chainFetchedAt, "2026-07-15T23:29:45.000Z");
  assert.equal(result.fetchedAt, new Date(NOW).toISOString());
});

console.log(`\n${passed} passed, ${failed} failed (${passed + failed} total)`);
if (failed > 0) process.exitCode = 1;
