/**
 * Deterministic tests for the returned-window SPY 0DTE DEX proxy.
 * Run: npx --no-install tsx apps/server/src/services/spy-dex-proxy.spec.ts
 */
import assert from "node:assert/strict";
import type {
  NormalizedOptionContract,
  SpyZeroDteOptionsChainResponse,
} from "@spy-copilot/shared";
import {
  aggregateDexByStrike,
  analyzeDexContracts,
  calculateSignedDeltaNotional,
  deriveSpyZeroDteDexProxy,
} from "./spy-dex-proxy.logic";

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
    bid: 1,
    ask: 1.1,
    last: 1.05,
    mark: 1.05,
    bidSize: 1,
    askSize: 1,
    lastSize: 1,
    volume: 10,
    openInterest: 1_000,
    impliedVolatilityPercent: 20,
    delta: optionType === "CALL" ? 0.5 : -0.5,
    gamma: 0.01,
    theta: -0.02,
    vega: 0.01,
    rho: 0,
    inTheMoney: false,
    nonStandard: false,
    mini: false,
    multiplier: 100,
    quoteAt: "2026-07-15T20:14:59.000Z",
    tradeAt: null,
    ...overrides,
  };
}

let symbolCounter = 0;
function uniqueContract(
  optionType: "CALL" | "PUT",
  strikePrice: number,
  overrides: Partial<NormalizedOptionContract> = {},
): NormalizedOptionContract {
  symbolCounter += 1;
  return contract(optionType, strikePrice, {
    contractSymbol: `SPY-${optionType}-${strikePrice}-${symbolCounter}`,
    ...overrides,
  });
}

function chain(overrides: Partial<SpyZeroDteOptionsChainResponse> = {}): SpyZeroDteOptionsChainResponse {
  const calls = [uniqueContract("CALL", 99), uniqueContract("CALL", 100), uniqueContract("CALL", 101)];
  const puts = [uniqueContract("PUT", 99), uniqueContract("PUT", 100), uniqueContract("PUT", 101)];
  return {
    symbol: "SPY",
    metric: "ZERO_DTE_OPTIONS_CHAIN",
    currentMarketDate: MARKET_DATE,
    requestedExpirationDate: MARKET_DATE,
    returnedExpirationDate: MARKET_DATE,
    metricState: "LIVE",
    sourceState: "LIVE",
    isDelayed: false,
    underlyingPrice: 100,
    underlyingPriceSource: "CHAIN_RESPONSE",
    calls,
    puts,
    requestedStrikeCount: 40,
    returnedUniqueStrikeCount: 3,
    callContractCount: 3,
    putContractCount: 3,
    minimumReturnedStrike: 99,
    maximumReturnedStrike: 101,
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

test("per-contract Call formula calculates signed dollar Delta notional", () => {
  assert.deepEqual(calculateSignedDeltaNotional(0.5, 1_000, 100, 100, "CALL"), {
    signedContribution: 5_000_000,
    magnitude: 5_000_000,
  });
});

test("per-contract Put formula preserves negative signed Delta and positive magnitude", () => {
  assert.deepEqual(calculateSignedDeltaNotional(-0.4, 1_000, 100, 100, "PUT"), {
    signedContribution: -4_000_000,
    magnitude: 4_000_000,
  });
});

test("zero Delta and zero Open Interest are valid zero contributions", () => {
  assert.deepEqual(calculateSignedDeltaNotional(0, 1_000, 100, 100, "CALL"), {
    signedContribution: 0,
    magnitude: 0,
  });
  assert.equal(calculateSignedDeltaNotional(-0.5, 0, 100, 100, "PUT")?.magnitude, 0);
});

test("Call Delta endpoints zero and one are accepted", () => {
  assert.notEqual(calculateSignedDeltaNotional(0, 1, 100, 100, "CALL"), null);
  assert.notEqual(calculateSignedDeltaNotional(1, 1, 100, 100, "CALL"), null);
});

test("Put Delta endpoints zero and negative one are accepted", () => {
  assert.notEqual(calculateSignedDeltaNotional(0, 1, 100, 100, "PUT"), null);
  assert.notEqual(calculateSignedDeltaNotional(-1, 1, 100, 100, "PUT"), null);
});

test("invalid side and sign combinations are rejected", () => {
  assert.equal(calculateSignedDeltaNotional(-0.1, 1, 100, 100, "CALL"), null);
  assert.equal(calculateSignedDeltaNotional(1.1, 1, 100, 100, "CALL"), null);
  assert.equal(calculateSignedDeltaNotional(0.1, 1, 100, 100, "PUT"), null);
  assert.equal(calculateSignedDeltaNotional(-1.1, 1, 100, 100, "PUT"), null);
});

test("invalid numeric inputs and non-100 multiplier are rejected", () => {
  assert.equal(calculateSignedDeltaNotional(Number.NaN, 1, 100, 100, "CALL"), null);
  assert.equal(calculateSignedDeltaNotional(0.5, -1, 100, 100, "CALL"), null);
  assert.equal(calculateSignedDeltaNotional(0.5, 1, 10, 100, "CALL"), null);
  assert.equal(calculateSignedDeltaNotional(0.5, 1, 100, 0, "CALL"), null);
});

test("current-date standard multiplier-100 contracts are eligible", () => {
  const analysis = analyzeDexContracts(
    [uniqueContract("CALL", 100), uniqueContract("PUT", 100)],
    MARKET_DATE,
    100,
  );
  assert.equal(analysis.eligible.length, 2);
});

test("nonstandard and mini contracts are excluded without causing input partiality", () => {
  const analysis = analyzeDexContracts(
    [
      uniqueContract("CALL", 100, { nonStandard: true }),
      uniqueContract("PUT", 100, { mini: true }),
    ],
    MARKET_DATE,
    100,
  );
  assert.equal(analysis.nonstandardContractsExcluded, 1);
  assert.equal(analysis.miniContractsExcluded, 1);
  assert.equal(analysis.requiredInputFailureCount, 0);
});

test("positive multiplier other than 100 is deliberately outside scope", () => {
  const analysis = analyzeDexContracts(
    [uniqueContract("CALL", 100, { multiplier: 10 })],
    MARKET_DATE,
    100,
  );
  assert.equal(analysis.invalidMultiplierContractsExcluded, 1);
  assert.equal(analysis.requiredInputFailureCount, 0);
});

test("missing Delta, Open Interest, and multiplier are required input failures", () => {
  const analysis = analyzeDexContracts(
    [
      uniqueContract("CALL", 100, { delta: null }),
      uniqueContract("PUT", 100, { openInterest: null }),
      uniqueContract("CALL", 101, { multiplier: null }),
    ],
    MARKET_DATE,
    100,
  );
  assert.equal(analysis.contractsMissingDelta, 1);
  assert.equal(analysis.contractsMissingOpenInterest, 1);
  assert.equal(analysis.contractsMissingMultiplier, 1);
  assert.equal(analysis.requiredInputFailureCount, 3);
});

test("invalid provider Delta is counted and excluded", () => {
  const analysis = analyzeDexContracts(
    [
      uniqueContract("CALL", 100, { delta: -0.1 }),
      uniqueContract("PUT", 100, { delta: 0.1 }),
    ],
    MARKET_DATE,
    100,
  );
  assert.equal(analysis.contractsWithInvalidDelta, 2);
  assert.equal(analysis.requiredInputFailureCount, 2);
});

test("duplicate contract symbol is not double-counted", () => {
  const first = uniqueContract("CALL", 100, { contractSymbol: "DUPLICATE" });
  const second = uniqueContract("CALL", 100, { contractSymbol: "DUPLICATE" });
  const analysis = analyzeDexContracts([first, second], MARKET_DATE, 100);
  assert.equal(analysis.eligible.length, 1);
  assert.equal(analysis.duplicateContractsExcluded, 1);
});

test("wrong expiration is excluded as out of scope", () => {
  const analysis = analyzeDexContracts(
    [uniqueContract("CALL", 100, { expirationDate: "2026-07-16" })],
    MARKET_DATE,
    100,
  );
  assert.equal(analysis.outOfScopeContractsExcluded, 1);
  assert.equal(analysis.requiredInputFailureCount, 0);
});

test("aggregates one Call and Put at the same strike", () => {
  const analysis = analyzeDexContracts(
    [
      uniqueContract("CALL", 100, { delta: 0.5, openInterest: 1_000 }),
      uniqueContract("PUT", 100, { delta: -0.4, openInterest: 1_000 }),
    ],
    MARKET_DATE,
    100,
  );
  const rows = aggregateDexByStrike(analysis.eligible);
  assert.equal(rows.length, 1);
  assert.equal(rows[0]!.callDeltaExposure, 5_000_000);
  assert.equal(rows[0]!.putDeltaExposureMagnitude, 4_000_000);
  assert.equal(rows[0]!.netDeltaExposureProxy, 1_000_000);
});

test("aggregates multiple contracts at one strike and preserves counts and OI", () => {
  const analysis = analyzeDexContracts(
    [
      uniqueContract("CALL", 100, { delta: 0.2, openInterest: 100 }),
      uniqueContract("CALL", 100, { delta: 0.4, openInterest: 200 }),
      uniqueContract("PUT", 100, { delta: -0.3, openInterest: 300 }),
    ],
    MARKET_DATE,
    100,
  );
  const row = aggregateDexByStrike(analysis.eligible)[0]!;
  assert.equal(row.callContractCount, 2);
  assert.equal(row.putContractCount, 1);
  assert.equal(row.callOpenInterest, 300);
  assert.equal(row.putOpenInterest, 300);
  assert.equal(row.callDeltaExposure, 1_000_000);
  assert.equal(row.putDeltaExposureMagnitude, 900_000);
  assert.equal(row.netDeltaExposureProxy, 100_000);
});

test("strike rows are sorted ascending", () => {
  const analysis = analyzeDexContracts(
    [uniqueContract("CALL", 101), uniqueContract("PUT", 99), uniqueContract("CALL", 100)],
    MARKET_DATE,
    100,
  );
  assert.deepEqual(aggregateDexByStrike(analysis.eligible).map((row) => row.strikePrice), [99, 100, 101]);
});

test("eligible zero-contribution strike remains present", () => {
  const analysis = analyzeDexContracts(
    [uniqueContract("CALL", 100, { delta: 0, openInterest: 1_000 })],
    MARKET_DATE,
    100,
  );
  const rows = aggregateDexByStrike(analysis.eligible);
  assert.equal(rows.length, 1);
  assert.equal(rows[0]!.callContractCount, 1);
  assert.equal(rows[0]!.callDeltaExposure, 0);
});

test("LIVE complete chain produces LIVE complete returned-window DEX proxy", () => {
  const result = deriveSpyZeroDteDexProxy(chain(), NOW);
  assert.equal(result.metricState, "LIVE");
  assert.equal(result.coverageState, "COMPLETE");
  assert.equal(result.coverageScope, "RETURNED_CHAIN_WINDOW");
  assert.equal(result.warningCode, null);
});

test("returned-window totals equal strike sums and signed contribution sum", () => {
  const result = deriveSpyZeroDteDexProxy(chain(), NOW);
  const callTotal = result.strikes.reduce((sum, row) => sum + row.callDeltaExposure, 0);
  const putTotal = result.strikes.reduce((sum, row) => sum + row.putDeltaExposureMagnitude, 0);
  assert.equal(result.returnedWindowCallDeltaExposure, callTotal);
  assert.equal(result.returnedWindowPutDeltaExposureMagnitude, putTotal);
  assert.equal(result.returnedWindowNetDeltaExposureProxy, callTotal - putTotal);
});

test("expanded 40-strike chain contributes every eligible returned strike", () => {
  const calls = Array.from({ length: 40 }, (_, index) =>
    uniqueContract("CALL", 735 + index, { delta: 0.2 + index / 100, openInterest: 100 + index }),
  );
  const puts = Array.from({ length: 40 }, (_, index) =>
    uniqueContract("PUT", 735 + index, { delta: -0.2 - index / 100, openInterest: 50 + index }),
  );
  const expanded = chain({
    calls,
    puts,
    requestedStrikeCount: 40,
    returnedUniqueStrikeCount: 40,
    callContractCount: 40,
    putContractCount: 40,
    minimumReturnedStrike: 735,
    maximumReturnedStrike: 774,
    providerContractCount: 80,
    totalContracts: 80,
    contractsWithBidAsk: 80,
    contractsWithGreeks: 80,
    contractsWithOpenInterest: 80,
    contractsWithVolume: 80,
  });

  const result = deriveSpyZeroDteDexProxy(expanded, NOW);
  assert.equal(result.requestedStrikeCount, 40);
  assert.equal(result.returnedUniqueStrikeCount, 40);
  assert.equal(result.eligibleStrikeCount, 40);
  assert.equal(result.eligibleCallContractCount, 40);
  assert.equal(result.eligiblePutContractCount, 40);
  assert.equal(result.minimumReturnedStrike, 735);
  assert.equal(result.maximumReturnedStrike, 774);
  assert.equal(result.strikes.length, 40);
});

test("missing required input with valid contributions produces PARTIAL numeric result", () => {
  const base = chain();
  base.calls = base.calls.map((item, index) => (index === 0 ? { ...item, delta: null } : item));
  const result = deriveSpyZeroDteDexProxy(base, NOW);
  assert.equal(result.metricState, "LIVE");
  assert.equal(result.coverageState, "PARTIAL");
  assert.equal(result.contractsMissingDelta, 1);
  assert.equal(result.warningCode, "PARTIAL_DEX_INPUTS");
  assert.notEqual(result.returnedWindowNetDeltaExposureProxy, null);
});

test("invalid side Delta with valid contributions produces PARTIAL coverage", () => {
  const base = chain();
  base.puts[0] = { ...base.puts[0]!, delta: 0.2 };
  const result = deriveSpyZeroDteDexProxy(base, NOW);
  assert.equal(result.coverageState, "PARTIAL");
  assert.equal(result.contractsWithInvalidDelta, 1);
});

test("PARTIAL_CONTRACT_DATA alone does not weaken DEX coverage", () => {
  const result = deriveSpyZeroDteDexProxy(chain({ warningCode: "PARTIAL_CONTRACT_DATA" }), NOW);
  assert.equal(result.coverageState, "COMPLETE");
  assert.equal(result.warningCode, null);
});

test("upstream rejected contract count conservatively produces PARTIAL coverage", () => {
  const result = deriveSpyZeroDteDexProxy(chain({ rejectedContractCount: 1 }), NOW);
  assert.equal(result.coverageState, "PARTIAL");
  assert.equal(result.upstreamRejectedContractCount, 1);
});

test("nonstandard exclusions alone can remain COMPLETE for the in-scope denominator", () => {
  const base = chain();
  base.calls = [...base.calls, uniqueContract("CALL", 100, { nonStandard: true })];
  base.callContractCount += 1;
  base.totalContracts += 1;
  const result = deriveSpyZeroDteDexProxy(base, NOW);
  assert.equal(result.coverageState, "COMPLETE");
  assert.equal(result.nonstandardContractsExcluded, 1);
});

test("no eligible contracts produces UNAVAILABLE rather than zero totals", () => {
  const base = chain();
  base.calls = base.calls.map((item) => ({ ...item, delta: null }));
  base.puts = base.puts.map((item) => ({ ...item, openInterest: null }));
  const result = deriveSpyZeroDteDexProxy(base, NOW);
  assert.equal(result.metricState, "UNAVAILABLE");
  assert.equal(result.coverageState, "UNAVAILABLE");
  assert.equal(result.returnedWindowNetDeltaExposureProxy, null);
  assert.deepEqual(result.strikes, []);
  assert.equal(result.warningCode, "NO_ELIGIBLE_DEX_CONTRACTS");
});

test("STALE chain produces STALE DEX proxy", () => {
  const result = deriveSpyZeroDteDexProxy(
    chain({ metricState: "STALE", sourceState: "STALE", warningCode: "RETAINED_STALE_CHAIN" }),
    NOW,
  );
  assert.equal(result.metricState, "STALE");
  assert.equal(result.sourceState, "STALE");
  assert.equal(result.warningCode, "RETAINED_STALE_CHAIN");
});

test("partial coverage warning outranks retained stale warning", () => {
  const base = chain({ metricState: "STALE", sourceState: "STALE", warningCode: "RETAINED_STALE_CHAIN" });
  base.puts[0] = { ...base.puts[0]!, openInterest: null };
  const result = deriveSpyZeroDteDexProxy(base, NOW);
  assert.equal(result.metricState, "STALE");
  assert.equal(result.coverageState, "PARTIAL");
  assert.equal(result.warningCode, "PARTIAL_DEX_INPUTS");
});

test("UNAVAILABLE chain inherits authentication warning", () => {
  const result = deriveSpyZeroDteDexProxy(
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

test("MOCK chain does not become a live DEX proxy", () => {
  const result = deriveSpyZeroDteDexProxy(chain({ metricState: "MOCK", sourceState: "MOCK" }), NOW);
  assert.equal(result.metricState, "UNAVAILABLE");
  assert.equal(result.sourceState, "MOCK");
});

test("current-date expiration is mandatory", () => {
  const result = deriveSpyZeroDteDexProxy(chain({ returnedExpirationDate: null }), NOW);
  assert.equal(result.warningCode, "NO_CURRENT_DATE_EXPIRATION");
});

test("valid chain underlying price is mandatory", () => {
  const result = deriveSpyZeroDteDexProxy(
    chain({ underlyingPrice: null, underlyingPriceSource: "UNAVAILABLE" }),
    NOW,
  );
  assert.equal(result.warningCode, "UNDERLYING_PRICE_UNAVAILABLE");
});

test("source snapshot timestamps remain distinct from route fetchedAt", () => {
  const result = deriveSpyZeroDteDexProxy(chain(), NOW);
  assert.equal(result.chainFetchedAt, "2026-07-15T23:29:45.000Z");
  assert.equal(result.latestOptionQuoteAt, "2026-07-15T20:14:59.000Z");
  assert.equal(result.fetchedAt, new Date(NOW).toISOString());
  assert.equal(result.dataAgeMs, 15_000);
});

test("schema response contains no raw provider maps or contracts", () => {
  const result = deriveSpyZeroDteDexProxy(chain(), NOW) as unknown as Record<string, unknown>;
  assert.equal("callExpDateMap" in result, false);
  assert.equal("calls" in result, false);
  assert.equal("puts" in result, false);
});

console.log(`\n${passed} passed, ${failed} failed (${passed + failed} total)`);
if (failed > 0) process.exit(1);
