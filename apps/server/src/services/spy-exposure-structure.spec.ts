/**
 * Deterministic tests for advanced returned-window SPY 0DTE exposure structure.
 * Run: npx --no-install tsx apps/server/src/services/spy-exposure-structure.spec.ts
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  SpyZeroDteExposureStructureResponseSchema,
  type DexStrikeRow,
  type GexStrikeRow,
  type SpyZeroDteDexProxyResponse,
  type SpyZeroDteGexProxyResponse,
} from "@spy-copilot/shared";
import {
  classifyDexRegime,
  classifyGammaRegime,
  deriveGammaFlipProxy,
  deriveLargestAbsoluteDexAnchor,
  deriveSpyZeroDteExposureStructure,
  rankExposureWalls,
  rankGammaCliffs,
  rankGammaSignTransitions,
} from "./spy-exposure-structure.logic";

const MARKET_DATE = "2026-07-20";
const NOW = Date.parse("2026-07-20T14:45:00.000Z");

const gexRows: GexStrikeRow[] = [
  {
    strikePrice: 98,
    callContractCount: 1,
    putContractCount: 1,
    callOpenInterest: 100,
    putOpenInterest: 600,
    callGammaExposure: 10_000,
    putGammaExposureMagnitude: 70_000,
    netGammaExposureProxy: -60_000,
  },
  {
    strikePrice: 99,
    callContractCount: 1,
    putContractCount: 1,
    callOpenInterest: 300,
    putOpenInterest: 500,
    callGammaExposure: 40_000,
    putGammaExposureMagnitude: 60_000,
    netGammaExposureProxy: -20_000,
  },
  {
    strikePrice: 100,
    callContractCount: 1,
    putContractCount: 1,
    callOpenInterest: 800,
    putOpenInterest: 400,
    callGammaExposure: 100_000,
    putGammaExposureMagnitude: 50_000,
    netGammaExposureProxy: 50_000,
  },
  {
    strikePrice: 101,
    callContractCount: 1,
    putContractCount: 1,
    callOpenInterest: 1_000,
    putOpenInterest: 200,
    callGammaExposure: 130_000,
    putGammaExposureMagnitude: 20_000,
    netGammaExposureProxy: 110_000,
  },
];

const dexRows: DexStrikeRow[] = [
  {
    strikePrice: 98,
    callContractCount: 1,
    putContractCount: 1,
    callOpenInterest: 100,
    putOpenInterest: 600,
    callDeltaExposure: 50_000,
    putDeltaExposureMagnitude: 240_000,
    netDeltaExposureProxy: -190_000,
  },
  {
    strikePrice: 99,
    callContractCount: 1,
    putContractCount: 1,
    callOpenInterest: 300,
    putOpenInterest: 500,
    callDeltaExposure: 120_000,
    putDeltaExposureMagnitude: 180_000,
    netDeltaExposureProxy: -60_000,
  },
  {
    strikePrice: 100,
    callContractCount: 1,
    putContractCount: 1,
    callOpenInterest: 800,
    putOpenInterest: 400,
    callDeltaExposure: 300_000,
    putDeltaExposureMagnitude: 140_000,
    netDeltaExposureProxy: 160_000,
  },
  {
    strikePrice: 101,
    callContractCount: 1,
    putContractCount: 1,
    callOpenInterest: 1_000,
    putOpenInterest: 200,
    callDeltaExposure: 400_000,
    putDeltaExposureMagnitude: 70_000,
    netDeltaExposureProxy: 330_000,
  },
];

function gex(
  overrides: Partial<SpyZeroDteGexProxyResponse> = {},
): SpyZeroDteGexProxyResponse {
  return {
    symbol: "SPY",
    metric: "ZERO_DTE_ATM_WINDOW_GEX_PROXY",
    methodology: "OI_WEIGHTED_GAMMA_PER_1PCT_MOVE",
    coverageScope: "RETURNED_CHAIN_WINDOW",
    currentMarketDate: MARKET_DATE,
    expirationDate: MARKET_DATE,
    metricState: "LIVE",
    sourceState: "LIVE",
    coverageState: "COMPLETE",
    underlyingPrice: 100,
    underlyingPriceSource: "CHAIN_RESPONSE",
    requestedStrikeCount: 10,
    returnedUniqueStrikeCount: 4,
    minimumReturnedStrike: 98,
    maximumReturnedStrike: 101,
    returnedWindowCallGammaExposure: 280_000,
    returnedWindowPutGammaExposureMagnitude: 200_000,
    returnedWindowNetGammaExposureProxy: 80_000,
    eligibleCallContractCount: 4,
    eligiblePutContractCount: 4,
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
    upstreamRejectedContractCount: 0,
    eligibleStrikeCount: 4,
    strikes: gexRows,
    latestOptionQuoteAt: "2026-07-20T14:44:59.000Z",
    chainFetchedAt: "2026-07-20T14:45:00.000Z",
    fetchedAt: "2026-07-20T14:45:00.000Z",
    dataAgeMs: 1_000,
    warningCode: null,
    ...overrides,
  };
}

function dex(
  overrides: Partial<SpyZeroDteDexProxyResponse> = {},
): SpyZeroDteDexProxyResponse {
  return {
    symbol: "SPY",
    metric: "ZERO_DTE_RETURNED_WINDOW_DEX_PROXY",
    methodology: "OI_WEIGHTED_DELTA_NOTIONAL",
    coverageScope: "RETURNED_CHAIN_WINDOW",
    currentMarketDate: MARKET_DATE,
    expirationDate: MARKET_DATE,
    metricState: "LIVE",
    sourceState: "LIVE",
    coverageState: "COMPLETE",
    underlyingPrice: 100,
    underlyingPriceSource: "CHAIN_RESPONSE",
    requestedStrikeCount: 10,
    returnedUniqueStrikeCount: 4,
    minimumReturnedStrike: 98,
    maximumReturnedStrike: 101,
    returnedWindowCallDeltaExposure: 870_000,
    returnedWindowPutDeltaExposureMagnitude: 630_000,
    returnedWindowNetDeltaExposureProxy: 240_000,
    eligibleCallContractCount: 4,
    eligiblePutContractCount: 4,
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
    upstreamRejectedContractCount: 0,
    eligibleStrikeCount: 4,
    strikes: dexRows,
    latestOptionQuoteAt: "2026-07-20T14:44:59.000Z",
    chainFetchedAt: "2026-07-20T14:45:00.000Z",
    fetchedAt: "2026-07-20T14:45:00.000Z",
    dataAgeMs: 1_000,
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
    console.log(`✓ ${name}`);
  } catch (error) {
    failed += 1;
    console.error(`✗ ${name}: ${(error as Error).message}`);
  }
}

test("available response validates and exposes the fixed methodology", () => {
  const response = deriveSpyZeroDteExposureStructure(gex(), dex(), NOW);
  assert.equal(response.product, "SPY_ZERO_DTE_DETERMINISTIC_EXPOSURE_STRUCTURE");
  assert.equal(response.methodologyVersion, "EXPOSURE_STRUCTURE_V1");
  assert.equal(SpyZeroDteExposureStructureResponseSchema.safeParse(response).success, true);
});

test("Gamma regime uses net exposure divided by gross exposure", () => {
  assert.deepEqual(classifyGammaRegime(10, 100), {
    regime: "CALL_DOMINANT",
    ratioPercent: 10,
  });
  assert.deepEqual(classifyGammaRegime(-10, 100), {
    regime: "PUT_DOMINANT",
    ratioPercent: -10,
  });
  assert.deepEqual(classifyGammaRegime(5, 100), {
    regime: "BALANCED",
    ratioPercent: 5,
  });
});

test("DEX regime uses the same explicit five-percent balance threshold", () => {
  assert.equal(classifyDexRegime(6, 100).regime, "POSITIVE");
  assert.equal(classifyDexRegime(-6, 100).regime, "NEGATIVE");
  assert.equal(classifyDexRegime(0, 0).regime, "BALANCED");
});

test("Call walls rank by Call GEX magnitude", () => {
  const walls = rankExposureWalls(gexRows, "CALL", 100, 480_000, 280_000);
  assert.deepEqual(walls.map((wall) => wall.strikePrice), [101, 100, 99]);
  assert.deepEqual(walls.map((wall) => wall.rank), [1, 2, 3]);
});

test("Put walls rank by Put GEX magnitude", () => {
  const walls = rankExposureWalls(gexRows, "PUT", 100, 480_000, 200_000);
  assert.deepEqual(walls.map((wall) => wall.strikePrice), [98, 99, 100]);
});

test("Wall ties prefer the strike nearest the underlying", () => {
  const tied = gexRows.map((row) => ({ ...row, callGammaExposure: 10_000 }));
  const walls = rankExposureWalls(tied, "CALL", 100.2, 100_000, 40_000);
  assert.equal(walls[0]?.strikePrice, 100);
});

test("Cumulative Gamma balance proxy interpolates the nearest zero crossing", () => {
  const proxy = deriveGammaFlipProxy(gexRows, 100);
  assert.equal(proxy.state, "INTERPOLATED");
  assert.equal(proxy.lowerStrike, 100);
  assert.equal(proxy.upperStrike, 101);
  assert.ok((proxy.estimatedStrike ?? 0) > 100);
  assert.ok((proxy.estimatedStrike ?? 0) < 101);
});

test("Exact cumulative zero uses the exact strike", () => {
  const rows = [
    { ...gexRows[0]!, strikePrice: 99, netGammaExposureProxy: -10 },
    { ...gexRows[1]!, strikePrice: 100, netGammaExposureProxy: 10 },
  ];
  const proxy = deriveGammaFlipProxy(rows, 100);
  assert.equal(proxy.state, "EXACT_STRIKE");
  assert.equal(proxy.estimatedStrike, 100);
});

test("No cumulative crossing is reported honestly", () => {
  const rows = gexRows.map((row) => ({ ...row, netGammaExposureProxy: 10 }));
  const proxy = deriveGammaFlipProxy(rows, 100);
  assert.equal(proxy.state, "NO_CROSS");
  assert.equal(proxy.estimatedStrike, null);
});

test("Gamma cliffs rank the largest adjacent net-GEX changes", () => {
  const cliffs = rankGammaCliffs(gexRows, 100);
  assert.equal(cliffs.length, 3);
  assert.equal(cliffs[0]?.lowerStrike, 99);
  assert.equal(cliffs[0]?.upperStrike, 100);
  assert.equal(cliffs[0]?.absoluteGammaChange, 70_000);
});

test("Gamma sign transitions capture strict adjacent sign crossings", () => {
  const transitions = rankGammaSignTransitions(gexRows, 100, 480_000);
  assert.equal(transitions.length, 1);
  const transition = transitions[0]!;
  assert.equal(transition.direction, "NEGATIVE_TO_POSITIVE");
  assert.equal(transition.lowerStrike, 99);
  assert.equal(transition.upperStrike, 100);
  assert.ok(transition.estimatedStrike > 99);
  assert.ok(transition.estimatedStrike < 100);
  assert.equal(transition.absoluteGammaChange, 70_000);
  assert.ok(Math.abs(transition.shareOfGrossGammaPercent - 14.5833) < 0.0001);
});

test("Gamma sign transitions exclude zero touches and same-sign neighbors", () => {
  const rows = [
    { ...gexRows[0]!, strikePrice: 99, netGammaExposureProxy: -10 },
    { ...gexRows[1]!, strikePrice: 100, netGammaExposureProxy: 0 },
    { ...gexRows[2]!, strikePrice: 101, netGammaExposureProxy: 10 },
  ];
  assert.deepEqual(rankGammaSignTransitions(rows, 100, 20), []);
});

test("Largest absolute DEX anchor is deterministic", () => {
  const anchor = deriveLargestAbsoluteDexAnchor(dexRows, 100);
  assert.equal(anchor?.strikePrice, 101);
  assert.equal(anchor?.netDeltaExposureProxy, 330_000);
});

test("Available structure includes walls, cliffs, DEX anchor, and disclosures", () => {
  const response = deriveSpyZeroDteExposureStructure(gex(), dex(), NOW);
  assert.equal(response.engineState, "AVAILABLE");
  assert.equal(response.gammaRegime, "CALL_DOMINANT");
  assert.equal(response.callWalls[0]?.strikePrice, 101);
  assert.equal(response.putWalls[0]?.strikePrice, 98);
  assert.equal(response.gammaCliffs.length, 3);
  assert.equal(response.gammaSignTransitions.length, 1);
  assert.equal(response.gammaSignTransitions[0]?.direction, "NEGATIVE_TO_POSITIVE");
  assert.equal(response.largestAbsoluteDexAnchor?.strikePrice, 101);
  assert.equal(response.disclosures.gammaFlipIsCumulativeBalanceProxy, true);
  assert.equal(response.disclosures.gammaSignTransitionsAreAdjacentStrictCrossings, true);
  assert.equal(response.disclosures.notObservedDealerInventory, true);
});

test("Partial GEX coverage weakens the structure without hiding calculations", () => {
  const response = deriveSpyZeroDteExposureStructure(
    gex({ coverageState: "PARTIAL", warningCode: "PARTIAL_GEX_INPUTS" }),
    dex(),
    NOW,
  );
  assert.equal(response.engineState, "PARTIAL");
  assert.ok(response.warnings.includes("PARTIAL_GEX_COVERAGE"));
  assert.equal(response.callWalls.length, 3);
});

test("Unavailable DEX keeps Gamma structure but removes DEX calculations", () => {
  const unavailableDex = dex({
    metricState: "UNAVAILABLE",
    sourceState: "UNAVAILABLE",
    coverageState: "UNAVAILABLE",
    expirationDate: null,
    underlyingPrice: null,
    underlyingPriceSource: "UNAVAILABLE",
    returnedWindowCallDeltaExposure: null,
    returnedWindowPutDeltaExposureMagnitude: null,
    returnedWindowNetDeltaExposureProxy: null,
    eligibleStrikeCount: 0,
    strikes: [],
    chainFetchedAt: null,
    warningCode: "OPTIONS_CHAIN_UNAVAILABLE",
  });
  const response = deriveSpyZeroDteExposureStructure(gex(), unavailableDex, NOW);
  assert.equal(response.engineState, "PARTIAL");
  assert.equal(response.dexRegime, "UNAVAILABLE");
  assert.equal(response.largestAbsoluteDexAnchor, null);
  assert.ok(response.warnings.includes("DEX_UNAVAILABLE"));
});

test("Unavailable GEX fails the entire structure closed", () => {
  const unavailableGex = gex({
    metricState: "UNAVAILABLE",
    sourceState: "UNAVAILABLE",
    coverageState: "UNAVAILABLE",
    expirationDate: null,
    underlyingPrice: null,
    underlyingPriceSource: "UNAVAILABLE",
    returnedWindowCallGammaExposure: null,
    returnedWindowPutGammaExposureMagnitude: null,
    returnedWindowNetGammaExposureProxy: null,
    eligibleStrikeCount: 0,
    strikes: [],
    chainFetchedAt: null,
    warningCode: "OPTIONS_CHAIN_UNAVAILABLE",
  });
  const response = deriveSpyZeroDteExposureStructure(unavailableGex, dex(), NOW);
  assert.equal(response.engineState, "UNAVAILABLE");
  assert.equal(response.callWalls.length, 0);
  assert.equal(response.gammaFlipProxy.state, "UNAVAILABLE");
});

test("Schema rejects an unavailable response that leaks a wall", () => {
  const response = deriveSpyZeroDteExposureStructure(
    gex({
      metricState: "UNAVAILABLE",
      sourceState: "UNAVAILABLE",
      coverageState: "UNAVAILABLE",
      expirationDate: null,
      underlyingPrice: null,
      underlyingPriceSource: "UNAVAILABLE",
      returnedWindowCallGammaExposure: null,
      returnedWindowPutGammaExposureMagnitude: null,
      returnedWindowNetGammaExposureProxy: null,
      eligibleStrikeCount: 0,
      strikes: [],
      chainFetchedAt: null,
      warningCode: "OPTIONS_CHAIN_UNAVAILABLE",
    }),
    dex(),
    NOW,
  );
  const invalid = { ...response, callWalls: [{
    rank: 1,
    strikePrice: 100,
    exposureMagnitude: 1,
    shareOfSidePercent: 1,
    shareOfGrossGammaPercent: 1,
    distanceFromUnderlyingPoints: 0,
    distanceFromUnderlyingPercent: 0,
  }] };
  assert.equal(SpyZeroDteExposureStructureResponseSchema.safeParse(invalid).success, false);
});

test("Service retrieves the normalized Options Chain exactly once", () => {
  const source = readFileSync(
    resolve(process.cwd(), "apps/server/src/services/spy-exposure-structure.service.ts"),
    "utf8",
  );
  assert.equal((source.match(/getSpyZeroDteOptionsChain\(\)/g) ?? []).length, 1);
  assert.ok(source.includes("deriveSpyZeroDteGexProxy(chain, nowMs)"));
  assert.ok(source.includes("deriveSpyZeroDteDexProxy(chain, nowMs)"));
});

test("Route is GET-only, no-store, and rejects query parameters", () => {
  const source = readFileSync(
    resolve(process.cwd(), "apps/server/src/routes/exposure-structure.routes.ts"),
    "utf8",
  );
  assert.ok(source.includes('exposureStructureRouter.get("/spy"'));
  assert.equal(source.includes(".post("), false);
  assert.ok(source.includes('res.setHeader("Cache-Control", "no-store")'));
  assert.ok(source.includes("Object.keys(req.query).length > 0"));
});

test("Product contains no private-account sizing or execution fields", () => {
  const response = deriveSpyZeroDteExposureStructure(gex(), dex(), NOW);
  const serialized = JSON.stringify(response).toLowerCase();
  for (const forbidden of ["accountnumber", "availablecash", "quantity", "orderid", "limitprice", "stopprice"]) {
    assert.equal(serialized.includes(forbidden), false, forbidden);
  }
});

test("Gamma balance language never claims a true dealer Gamma flip", () => {
  const logic = readFileSync(
    resolve(process.cwd(), "apps/server/src/services/spy-exposure-structure.logic.ts"),
    "utf8",
  );
  assert.equal(logic.includes("observed dealer inventory"), false);
  assert.ok(logic.includes("gammaFlipIsCumulativeBalanceProxy"));
});

console.log(`\nExposure Structure tests: ${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
