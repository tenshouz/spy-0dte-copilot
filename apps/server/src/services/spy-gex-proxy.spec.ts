/**
 * Deterministic tests for the returned-window SPY 0DTE GEX proxy.
 * Run: npx --no-install tsx apps/server/src/services/spy-gex-proxy.spec.ts
 */
import assert from "node:assert/strict";
import type {
  NormalizedOptionContract,
  SpyZeroDteOptionsChainResponse,
} from "@spy-copilot/shared";
import {
  aggregateGexByStrike,
  analyzeGexContracts,
  calculateGammaExposurePerOnePercentMove,
  deriveSpyZeroDteGexProxy,
} from "./spy-gex-proxy.logic";

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
    requestedStrikeCount: 10,
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

test("per-contract formula uses dollars per 1% move", () => {
  assert.deepEqual(calculateGammaExposurePerOnePercentMove(0.01, 1_000, 100, 100, "CALL"), {
    magnitude: 100_000,
    signedContribution: 100_000,
  });
});

test("Put contribution is negative by analytical convention", () => {
  assert.deepEqual(calculateGammaExposurePerOnePercentMove(0.01, 1_000, 100, 100, "PUT"), {
    magnitude: 100_000,
    signedContribution: -100_000,
  });
});

test("zero Gamma and zero Open Interest are valid zero contributions", () => {
  assert.equal(calculateGammaExposurePerOnePercentMove(0, 1_000, 100, 100, "CALL")?.magnitude, 0);
  assert.equal(calculateGammaExposurePerOnePercentMove(0.01, 0, 100, 100, "PUT")?.magnitude, 0);
});

test("invalid numeric inputs and non-100 multiplier are rejected", () => {
  assert.equal(calculateGammaExposurePerOnePercentMove(-1, 1, 100, 100, "CALL"), null);
  assert.equal(calculateGammaExposurePerOnePercentMove(0.1, -1, 100, 100, "CALL"), null);
  assert.equal(calculateGammaExposurePerOnePercentMove(0.1, 1, 10, 100, "CALL"), null);
  assert.equal(calculateGammaExposurePerOnePercentMove(0.1, 1, 100, 0, "CALL"), null);
  assert.equal(calculateGammaExposurePerOnePercentMove(Number.NaN, 1, 100, 100, "CALL"), null);
});

test("current-date standard multiplier-100 contracts are eligible", () => {
  const analysis = analyzeGexContracts(
    [uniqueContract("CALL", 100), uniqueContract("PUT", 100)],
    MARKET_DATE,
    100,
  );
  assert.equal(analysis.eligible.length, 2);
});

test("nonstandard and mini contracts are excluded without causing input partiality", () => {
  const analysis = analyzeGexContracts(
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
  const analysis = analyzeGexContracts(
    [uniqueContract("CALL", 100, { multiplier: 10 })],
    MARKET_DATE,
    100,
  );
  assert.equal(analysis.invalidMultiplierContractsExcluded, 1);
  assert.equal(analysis.requiredInputFailureCount, 0);
});

test("missing Gamma, Open Interest, and multiplier are counted as required input failures", () => {
  const analysis = analyzeGexContracts(
    [
      uniqueContract("CALL", 100, { gamma: null }),
      uniqueContract("PUT", 100, { openInterest: null }),
      uniqueContract("CALL", 101, { multiplier: null }),
    ],
    MARKET_DATE,
    100,
  );
  assert.equal(analysis.contractsMissingGamma, 1);
  assert.equal(analysis.contractsMissingOpenInterest, 1);
  assert.equal(analysis.contractsMissingMultiplier, 1);
  assert.equal(analysis.requiredInputFailureCount, 3);
});

test("duplicate contract symbol is not double-counted", () => {
  const first = uniqueContract("CALL", 100, { contractSymbol: "DUPLICATE" });
  const second = uniqueContract("CALL", 100, { contractSymbol: "DUPLICATE" });
  const analysis = analyzeGexContracts([first, second], MARKET_DATE, 100);
  assert.equal(analysis.eligible.length, 1);
  assert.equal(analysis.duplicateContractsExcluded, 1);
});

test("wrong expiration is excluded as out of scope", () => {
  const analysis = analyzeGexContracts(
    [uniqueContract("CALL", 100, { expirationDate: "2026-07-16" })],
    MARKET_DATE,
    100,
  );
  assert.equal(analysis.outOfScopeContractsExcluded, 1);
  assert.equal(analysis.requiredInputFailureCount, 0);
});

test("aggregates one Call and Put at the same strike", () => {
  const analysis = analyzeGexContracts(
    [
      uniqueContract("CALL", 100, { gamma: 0.01, openInterest: 1_000 }),
      uniqueContract("PUT", 100, { gamma: 0.02, openInterest: 500 }),
    ],
    MARKET_DATE,
    100,
  );
  const rows = aggregateGexByStrike(analysis.eligible);
  assert.equal(rows.length, 1);
  assert.equal(rows[0]!.callGammaExposure, 100_000);
  assert.equal(rows[0]!.putGammaExposureMagnitude, 100_000);
  assert.equal(rows[0]!.netGammaExposureProxy, 0);
});

test("aggregates multiple contracts at one strike and preserves counts and OI", () => {
  const analysis = analyzeGexContracts(
    [
      uniqueContract("CALL", 100, { gamma: 0.01, openInterest: 100 }),
      uniqueContract("CALL", 100, { gamma: 0.02, openInterest: 200 }),
      uniqueContract("PUT", 100, { gamma: 0.01, openInterest: 300 }),
    ],
    MARKET_DATE,
    100,
  );
  const row = aggregateGexByStrike(analysis.eligible)[0]!;
  assert.equal(row.callContractCount, 2);
  assert.equal(row.putContractCount, 1);
  assert.equal(row.callOpenInterest, 300);
  assert.equal(row.putOpenInterest, 300);
  assert.equal(row.callGammaExposure, 50_000);
  assert.equal(row.putGammaExposureMagnitude, 30_000);
  assert.equal(row.netGammaExposureProxy, 20_000);
});

test("strike rows are sorted ascending", () => {
  const analysis = analyzeGexContracts(
    [uniqueContract("CALL", 101), uniqueContract("PUT", 99), uniqueContract("CALL", 100)],
    MARKET_DATE,
    100,
  );
  assert.deepEqual(aggregateGexByStrike(analysis.eligible).map((row) => row.strikePrice), [99, 100, 101]);
});

test("eligible zero-contribution strike remains present", () => {
  const analysis = analyzeGexContracts(
    [uniqueContract("CALL", 100, { gamma: 0, openInterest: 1_000 })],
    MARKET_DATE,
    100,
  );
  const rows = aggregateGexByStrike(analysis.eligible);
  assert.equal(rows.length, 1);
  assert.equal(rows[0]!.callContractCount, 1);
  assert.equal(rows[0]!.callGammaExposure, 0);
});

test("LIVE complete chain produces LIVE complete returned-window proxy", () => {
  const result = deriveSpyZeroDteGexProxy(chain(), NOW);
  assert.equal(result.metricState, "LIVE");
  assert.equal(result.coverageState, "COMPLETE");
  assert.equal(result.coverageScope, "RETURNED_CHAIN_WINDOW");
  assert.equal(result.warningCode, null);
});

test("returned-window totals equal strike sums", () => {
  const result = deriveSpyZeroDteGexProxy(chain(), NOW);
  const callTotal = result.strikes.reduce((sum, row) => sum + row.callGammaExposure, 0);
  const putTotal = result.strikes.reduce((sum, row) => sum + row.putGammaExposureMagnitude, 0);
  assert.equal(result.returnedWindowCallGammaExposure, callTotal);
  assert.equal(result.returnedWindowPutGammaExposureMagnitude, putTotal);
  assert.equal(result.returnedWindowNetGammaExposureProxy, callTotal - putTotal);
});

test("bounded strike metadata is preserved from the Options Chain", () => {
  const result = deriveSpyZeroDteGexProxy(chain(), NOW);
  assert.equal(result.requestedStrikeCount, 10);
  assert.equal(result.returnedUniqueStrikeCount, 3);
  assert.equal(result.minimumReturnedStrike, 99);
  assert.equal(result.maximumReturnedStrike, 101);
});

test("expanded 40-strike chain contributes every eligible returned strike to GEX totals", () => {
  const calls = Array.from({ length: 40 }, (_, index) =>
    uniqueContract("CALL", 735 + index, { gamma: 0.01, openInterest: 100 + index }),
  );
  const puts = Array.from({ length: 40 }, (_, index) =>
    uniqueContract("PUT", 735 + index, { gamma: 0.02, openInterest: 50 + index }),
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

  const result = deriveSpyZeroDteGexProxy(expanded, NOW);
  assert.equal(result.requestedStrikeCount, 40);
  assert.equal(result.returnedUniqueStrikeCount, 40);
  assert.equal(result.eligibleStrikeCount, 40);
  assert.equal(result.eligibleCallContractCount, 40);
  assert.equal(result.eligiblePutContractCount, 40);
  assert.equal(result.minimumReturnedStrike, 735);
  assert.equal(result.maximumReturnedStrike, 774);
  assert.equal(result.strikes.length, 40);
  assert.equal(
    result.returnedWindowCallGammaExposure,
    result.strikes.reduce((sum, row) => sum + row.callGammaExposure, 0),
  );
  assert.equal(
    result.returnedWindowPutGammaExposureMagnitude,
    result.strikes.reduce((sum, row) => sum + row.putGammaExposureMagnitude, 0),
  );
});

test("missing required input with valid contributions produces PARTIAL numeric result", () => {
  const base = chain();
  base.calls = base.calls.map((item, index) => (index === 0 ? { ...item, gamma: null } : item));
  const result = deriveSpyZeroDteGexProxy(base, NOW);
  assert.equal(result.metricState, "LIVE");
  assert.equal(result.coverageState, "PARTIAL");
  assert.equal(result.contractsMissingGamma, 1);
  assert.equal(result.warningCode, "PARTIAL_GEX_INPUTS");
  assert.notEqual(result.returnedWindowNetGammaExposureProxy, null);
});

test("upstream rejected contract count conservatively produces PARTIAL coverage", () => {
  const result = deriveSpyZeroDteGexProxy(chain({ rejectedContractCount: 1 }), NOW);
  assert.equal(result.coverageState, "PARTIAL");
  assert.equal(result.upstreamRejectedContractCount, 1);
});

test("nonstandard exclusions alone can remain COMPLETE for the in-scope denominator", () => {
  const base = chain();
  base.calls = [...base.calls, uniqueContract("CALL", 100, { nonStandard: true })];
  base.callContractCount += 1;
  base.totalContracts += 1;
  const result = deriveSpyZeroDteGexProxy(base, NOW);
  assert.equal(result.coverageState, "COMPLETE");
  assert.equal(result.nonstandardContractsExcluded, 1);
});

test("no eligible contracts produces UNAVAILABLE rather than zero totals", () => {
  const base = chain();
  base.calls = base.calls.map((item) => ({ ...item, gamma: null }));
  base.puts = base.puts.map((item) => ({ ...item, openInterest: null }));
  const result = deriveSpyZeroDteGexProxy(base, NOW);
  assert.equal(result.metricState, "UNAVAILABLE");
  assert.equal(result.coverageState, "UNAVAILABLE");
  assert.equal(result.returnedWindowNetGammaExposureProxy, null);
  assert.deepEqual(result.strikes, []);
  assert.equal(result.warningCode, "NO_ELIGIBLE_GEX_CONTRACTS");
});

test("STALE chain produces STALE GEX proxy", () => {
  const result = deriveSpyZeroDteGexProxy(
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
  const result = deriveSpyZeroDteGexProxy(base, NOW);
  assert.equal(result.metricState, "STALE");
  assert.equal(result.coverageState, "PARTIAL");
  assert.equal(result.warningCode, "PARTIAL_GEX_INPUTS");
});

test("UNAVAILABLE chain inherits authentication warning", () => {
  const result = deriveSpyZeroDteGexProxy(
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

test("MOCK chain does not become a live GEX proxy", () => {
  const result = deriveSpyZeroDteGexProxy(chain({ metricState: "MOCK", sourceState: "MOCK" }), NOW);
  assert.equal(result.metricState, "UNAVAILABLE");
  assert.equal(result.sourceState, "MOCK");
});

test("current-date expiration is mandatory", () => {
  const result = deriveSpyZeroDteGexProxy(chain({ returnedExpirationDate: null }), NOW);
  assert.equal(result.warningCode, "NO_CURRENT_DATE_EXPIRATION");
});

test("valid chain underlying price is mandatory", () => {
  const result = deriveSpyZeroDteGexProxy(
    chain({ underlyingPrice: null, underlyingPriceSource: "UNAVAILABLE" }),
    NOW,
  );
  assert.equal(result.warningCode, "UNDERLYING_PRICE_UNAVAILABLE");
});

test("source snapshot timestamps remain distinct from route fetchedAt", () => {
  const result = deriveSpyZeroDteGexProxy(chain(), NOW);
  assert.equal(result.chainFetchedAt, "2026-07-15T23:29:45.000Z");
  assert.equal(result.latestOptionQuoteAt, "2026-07-15T20:14:59.000Z");
  assert.equal(result.fetchedAt, new Date(NOW).toISOString());
  assert.equal(result.dataAgeMs, 15_000);
});

test("schema response contains no raw provider maps or contracts", () => {
  const result = deriveSpyZeroDteGexProxy(chain(), NOW) as unknown as Record<string, unknown>;
  assert.equal("callExpDateMap" in result, false);
  assert.equal("calls" in result, false);
  assert.equal("puts" in result, false);
});

console.log(`\n${passed} passed, ${failed} failed (${passed + failed} total)`);
if (failed > 0) process.exit(1);
