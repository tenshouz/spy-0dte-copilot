import {
  SpyZeroDteExposureStructureResponseSchema,
  type DexAnchor,
  type DexStrikeRow,
  type ExposureStructureDexRegime,
  type ExposureStructureGammaRegime,
  type ExposureStructureWarningCode,
  type ExposureWall,
  type GammaCliff,
  type GammaFlipProxy,
  type GexStrikeRow,
  type SpyZeroDteDexProxyResponse,
  type SpyZeroDteExposureStructureResponse,
  type SpyZeroDteGexProxyResponse,
} from "@spy-copilot/shared";

const BALANCED_REGIME_THRESHOLD_PERCENT = 5;
const MAX_RANKED_LEVELS = 3;

function normalizeZero(value: number): number {
  return Object.is(value, -0) ? 0 : value;
}

function distanceFromUnderlying(strikePrice: number, underlyingPrice: number) {
  const points = strikePrice - underlyingPrice;
  return {
    distanceFromUnderlyingPoints: normalizeZero(points),
    distanceFromUnderlyingPercent: normalizeZero((points / underlyingPrice) * 100),
  };
}

export function classifyGammaRegime(
  netGamma: number,
  grossGamma: number,
): { regime: ExposureStructureGammaRegime; ratioPercent: number } {
  const ratioPercent = grossGamma <= 0 ? 0 : normalizeZero((netGamma / grossGamma) * 100);
  if (ratioPercent > BALANCED_REGIME_THRESHOLD_PERCENT) {
    return { regime: "CALL_DOMINANT", ratioPercent };
  }
  if (ratioPercent < -BALANCED_REGIME_THRESHOLD_PERCENT) {
    return { regime: "PUT_DOMINANT", ratioPercent };
  }
  return { regime: "BALANCED", ratioPercent };
}

export function classifyDexRegime(
  netDex: number,
  grossDex: number,
): { regime: ExposureStructureDexRegime; ratioPercent: number } {
  const ratioPercent = grossDex <= 0 ? 0 : normalizeZero((netDex / grossDex) * 100);
  if (ratioPercent > BALANCED_REGIME_THRESHOLD_PERCENT) {
    return { regime: "POSITIVE", ratioPercent };
  }
  if (ratioPercent < -BALANCED_REGIME_THRESHOLD_PERCENT) {
    return { regime: "NEGATIVE", ratioPercent };
  }
  return { regime: "BALANCED", ratioPercent };
}

export function rankExposureWalls(
  rows: readonly GexStrikeRow[],
  side: "CALL" | "PUT",
  underlyingPrice: number,
  grossGamma: number,
  sideTotal: number,
): ExposureWall[] {
  const candidates = rows
    .filter((row) =>
      side === "CALL" ? row.callContractCount > 0 : row.putContractCount > 0,
    )
    .map((row) => ({
      strikePrice: row.strikePrice,
      exposureMagnitude:
        side === "CALL" ? row.callGammaExposure : row.putGammaExposureMagnitude,
    }))
    .sort((left, right) => {
      if (right.exposureMagnitude !== left.exposureMagnitude) {
        return right.exposureMagnitude - left.exposureMagnitude;
      }
      const leftDistance = Math.abs(left.strikePrice - underlyingPrice);
      const rightDistance = Math.abs(right.strikePrice - underlyingPrice);
      if (leftDistance !== rightDistance) return leftDistance - rightDistance;
      return left.strikePrice - right.strikePrice;
    })
    .slice(0, MAX_RANKED_LEVELS);

  return candidates.map((candidate, index) => ({
    rank: index + 1,
    strikePrice: candidate.strikePrice,
    exposureMagnitude: candidate.exposureMagnitude,
    shareOfSidePercent:
      sideTotal <= 0 ? 0 : (candidate.exposureMagnitude / sideTotal) * 100,
    shareOfGrossGammaPercent:
      grossGamma <= 0 ? 0 : (candidate.exposureMagnitude / grossGamma) * 100,
    ...distanceFromUnderlying(candidate.strikePrice, underlyingPrice),
  }));
}

interface GammaBalanceCandidate {
  state: "EXACT_STRIKE" | "INTERPOLATED";
  estimatedStrike: number;
  lowerStrike: number;
  upperStrike: number;
  cumulativeNetGammaAtLower: number;
  cumulativeNetGammaAtUpper: number;
}

export function deriveGammaFlipProxy(
  rows: readonly GexStrikeRow[],
  underlyingPrice: number,
): GammaFlipProxy {
  const sorted = [...rows].sort((a, b) => a.strikePrice - b.strikePrice);
  if (sorted.length === 0) {
    return {
      state: "UNAVAILABLE",
      estimatedStrike: null,
      lowerStrike: null,
      upperStrike: null,
      cumulativeNetGammaAtLower: null,
      cumulativeNetGammaAtUpper: null,
      distanceFromUnderlyingPoints: null,
      distanceFromUnderlyingPercent: null,
    };
  }

  const cumulative: Array<{ strikePrice: number; value: number }> = [];
  let running = 0;
  for (const row of sorted) {
    running = normalizeZero(running + row.netGammaExposureProxy);
    cumulative.push({ strikePrice: row.strikePrice, value: running });
  }

  const candidates: GammaBalanceCandidate[] = [];
  for (let index = 0; index < cumulative.length; index += 1) {
    const current = cumulative[index];
    if (!current) continue;
    if (current.value === 0) {
      candidates.push({
        state: "EXACT_STRIKE",
        estimatedStrike: current.strikePrice,
        lowerStrike: current.strikePrice,
        upperStrike: current.strikePrice,
        cumulativeNetGammaAtLower: 0,
        cumulativeNetGammaAtUpper: 0,
      });
    }
    const next = cumulative[index + 1];
    if (!next || current.value === 0 || next.value === 0) continue;
    if ((current.value < 0 && next.value > 0) || (current.value > 0 && next.value < 0)) {
      const fraction = -current.value / (next.value - current.value);
      const estimatedStrike =
        current.strikePrice + fraction * (next.strikePrice - current.strikePrice);
      candidates.push({
        state: "INTERPOLATED",
        estimatedStrike,
        lowerStrike: current.strikePrice,
        upperStrike: next.strikePrice,
        cumulativeNetGammaAtLower: current.value,
        cumulativeNetGammaAtUpper: next.value,
      });
    }
  }

  const selected = candidates.sort((left, right) => {
    const leftDistance = Math.abs(left.estimatedStrike - underlyingPrice);
    const rightDistance = Math.abs(right.estimatedStrike - underlyingPrice);
    if (leftDistance !== rightDistance) return leftDistance - rightDistance;
    if (left.state !== right.state) return left.state === "EXACT_STRIKE" ? -1 : 1;
    return left.estimatedStrike - right.estimatedStrike;
  })[0];

  if (!selected) {
    return {
      state: "NO_CROSS",
      estimatedStrike: null,
      lowerStrike: null,
      upperStrike: null,
      cumulativeNetGammaAtLower: null,
      cumulativeNetGammaAtUpper: null,
      distanceFromUnderlyingPoints: null,
      distanceFromUnderlyingPercent: null,
    };
  }

  return {
    ...selected,
    ...distanceFromUnderlying(selected.estimatedStrike, underlyingPrice),
  };
}

export function rankGammaCliffs(
  rows: readonly GexStrikeRow[],
  underlyingPrice: number,
): GammaCliff[] {
  const sorted = [...rows].sort((a, b) => a.strikePrice - b.strikePrice);
  const cliffs: Omit<GammaCliff, "rank">[] = [];

  for (let index = 0; index < sorted.length - 1; index += 1) {
    const lower = sorted[index];
    const upper = sorted[index + 1];
    if (!lower || !upper) continue;
    const netGammaChange = normalizeZero(
      upper.netGammaExposureProxy - lower.netGammaExposureProxy,
    );
    const midpointStrike = (lower.strikePrice + upper.strikePrice) / 2;
    cliffs.push({
      lowerStrike: lower.strikePrice,
      upperStrike: upper.strikePrice,
      midpointStrike,
      netGammaAtLower: lower.netGammaExposureProxy,
      netGammaAtUpper: upper.netGammaExposureProxy,
      netGammaChange,
      absoluteGammaChange: Math.abs(netGammaChange),
      direction: netGammaChange >= 0 ? "POSITIVE_JUMP" : "NEGATIVE_JUMP",
      ...distanceFromUnderlying(midpointStrike, underlyingPrice),
    });
  }

  return cliffs
    .sort((left, right) => {
      if (right.absoluteGammaChange !== left.absoluteGammaChange) {
        return right.absoluteGammaChange - left.absoluteGammaChange;
      }
      const leftDistance = Math.abs(left.midpointStrike - underlyingPrice);
      const rightDistance = Math.abs(right.midpointStrike - underlyingPrice);
      if (leftDistance !== rightDistance) return leftDistance - rightDistance;
      return left.midpointStrike - right.midpointStrike;
    })
    .slice(0, MAX_RANKED_LEVELS)
    .map((cliff, index) => ({ rank: index + 1, ...cliff }));
}

function largestStrikeBy(
  rows: readonly GexStrikeRow[],
  selector: (row: GexStrikeRow) => number,
  predicate: (value: number) => boolean,
): number | null {
  const selected = rows
    .map((row) => ({ strikePrice: row.strikePrice, value: selector(row) }))
    .filter((item) => predicate(item.value))
    .sort((left, right) => {
      const magnitudeDifference = Math.abs(right.value) - Math.abs(left.value);
      if (magnitudeDifference !== 0) return magnitudeDifference;
      return left.strikePrice - right.strikePrice;
    })[0];
  return selected?.strikePrice ?? null;
}

export function deriveLargestAbsoluteDexAnchor(
  rows: readonly DexStrikeRow[],
  underlyingPrice: number,
): DexAnchor | null {
  const selected = rows
    .map((row) => ({
      strikePrice: row.strikePrice,
      netDeltaExposureProxy: row.netDeltaExposureProxy,
      absoluteMagnitude: Math.abs(row.netDeltaExposureProxy),
    }))
    .sort((left, right) => {
      if (right.absoluteMagnitude !== left.absoluteMagnitude) {
        return right.absoluteMagnitude - left.absoluteMagnitude;
      }
      const leftDistance = Math.abs(left.strikePrice - underlyingPrice);
      const rightDistance = Math.abs(right.strikePrice - underlyingPrice);
      if (leftDistance !== rightDistance) return leftDistance - rightDistance;
      return left.strikePrice - right.strikePrice;
    })[0];

  if (!selected) return null;
  return {
    ...selected,
    ...distanceFromUnderlying(selected.strikePrice, underlyingPrice),
  };
}

function unavailableGammaFlip(): GammaFlipProxy {
  return {
    state: "UNAVAILABLE",
    estimatedStrike: null,
    lowerStrike: null,
    upperStrike: null,
    cumulativeNetGammaAtLower: null,
    cumulativeNetGammaAtUpper: null,
    distanceFromUnderlyingPoints: null,
    distanceFromUnderlyingPercent: null,
  };
}

export function buildUnavailableSpyZeroDteExposureStructureResponse(
  currentMarketDate: string,
  nowMs: number,
  gex: SpyZeroDteGexProxyResponse,
  dex: SpyZeroDteDexProxyResponse,
): SpyZeroDteExposureStructureResponse {
  return SpyZeroDteExposureStructureResponseSchema.parse({
    symbol: "SPY",
    product: "SPY_ZERO_DTE_DETERMINISTIC_EXPOSURE_STRUCTURE",
    methodologyVersion: "EXPOSURE_STRUCTURE_V1",
    currentMarketDate,
    calculatedAt: new Date(nowMs).toISOString(),
    engineState: "UNAVAILABLE",
    metricState: "UNAVAILABLE",
    coverageState: "UNAVAILABLE",
    expirationDate: null,
    underlyingPrice: null,
    minimumReturnedStrike: gex.minimumReturnedStrike,
    maximumReturnedStrike: gex.maximumReturnedStrike,
    eligibleGexStrikeCount: 0,
    eligibleDexStrikeCount: 0,
    grossGammaExposure: null,
    returnedWindowNetGammaExposureProxy: null,
    gammaRegime: "UNAVAILABLE",
    gammaRegimeRatioPercent: null,
    callWalls: [],
    putWalls: [],
    largestPositiveNetGexStrike: null,
    largestNegativeNetGexStrike: null,
    gammaFlipProxy: unavailableGammaFlip(),
    gammaCliffs: [],
    returnedWindowNetDeltaExposureProxy: null,
    dexRegime: "UNAVAILABLE",
    dexRegimeRatioPercent: null,
    largestAbsoluteDexAnchor: null,
    sourceGexMetricState: gex.metricState,
    sourceGexCoverageState: gex.coverageState,
    sourceDexMetricState: dex.metricState,
    sourceDexCoverageState: dex.coverageState,
    latestOptionQuoteAt: gex.latestOptionQuoteAt,
    chainFetchedAt: gex.chainFetchedAt,
    warnings: ["GEX_UNAVAILABLE"],
    disclosures: {
      returnedWindowOnly: true,
      openInterestMayBeStaleIntraday: true,
      analyticalCallPositivePutNegativeConvention: true,
      gammaFlipIsCumulativeBalanceProxy: true,
      notObservedDealerInventory: true,
      noStandaloneSignal: true,
      noPrivateAccountData: true,
      noPositionSizing: true,
      noOrderExecution: true,
    },
  });
}

export function deriveSpyZeroDteExposureStructure(
  gex: SpyZeroDteGexProxyResponse,
  dex: SpyZeroDteDexProxyResponse,
  nowMs = Date.now(),
): SpyZeroDteExposureStructureResponse {
  if (
    gex.metricState === "UNAVAILABLE" ||
    gex.underlyingPrice === null ||
    gex.expirationDate === null ||
    gex.strikes.length === 0 ||
    gex.returnedWindowCallGammaExposure === null ||
    gex.returnedWindowPutGammaExposureMagnitude === null ||
    gex.returnedWindowNetGammaExposureProxy === null
  ) {
    return buildUnavailableSpyZeroDteExposureStructureResponse(
      gex.currentMarketDate,
      nowMs,
      gex,
      dex,
    );
  }

  const underlyingPrice = gex.underlyingPrice;
  const callGamma = gex.returnedWindowCallGammaExposure;
  const putGamma = gex.returnedWindowPutGammaExposureMagnitude;
  const grossGamma = callGamma + putGamma;
  const gammaClassification = classifyGammaRegime(
    gex.returnedWindowNetGammaExposureProxy,
    grossGamma,
  );
  const callWalls = rankExposureWalls(
    gex.strikes,
    "CALL",
    underlyingPrice,
    grossGamma,
    callGamma,
  );
  const putWalls = rankExposureWalls(
    gex.strikes,
    "PUT",
    underlyingPrice,
    grossGamma,
    putGamma,
  );

  if (callWalls.length === 0 || putWalls.length === 0) {
    return buildUnavailableSpyZeroDteExposureStructureResponse(
      gex.currentMarketDate,
      nowMs,
      gex,
      dex,
    );
  }

  const gammaFlipProxy = deriveGammaFlipProxy(gex.strikes, underlyingPrice);
  const gammaCliffs = rankGammaCliffs(gex.strikes, underlyingPrice);
  const warnings = new Set<ExposureStructureWarningCode>();
  if (gex.coverageState === "PARTIAL") warnings.add("PARTIAL_GEX_COVERAGE");
  if (gex.metricState === "STALE") warnings.add("RETAINED_STALE_CHAIN");
  if (gammaFlipProxy.state === "NO_CROSS") {
    warnings.add("GAMMA_BALANCE_CROSS_NOT_FOUND");
  }
  if (gammaCliffs.length === 0) warnings.add("INSUFFICIENT_STRIKES_FOR_CLIFFS");

  let returnedWindowNetDeltaExposureProxy: number | null = null;
  let dexRegime: ExposureStructureDexRegime = "UNAVAILABLE";
  let dexRegimeRatioPercent: number | null = null;
  let largestAbsoluteDexAnchor: DexAnchor | null = null;
  if (
    dex.metricState !== "UNAVAILABLE" &&
    dex.underlyingPrice !== null &&
    dex.returnedWindowCallDeltaExposure !== null &&
    dex.returnedWindowPutDeltaExposureMagnitude !== null &&
    dex.returnedWindowNetDeltaExposureProxy !== null
  ) {
    const grossDex =
      dex.returnedWindowCallDeltaExposure +
      dex.returnedWindowPutDeltaExposureMagnitude;
    const dexClassification = classifyDexRegime(
      dex.returnedWindowNetDeltaExposureProxy,
      grossDex,
    );
    returnedWindowNetDeltaExposureProxy =
      dex.returnedWindowNetDeltaExposureProxy;
    dexRegime = dexClassification.regime;
    dexRegimeRatioPercent = dexClassification.ratioPercent;
    largestAbsoluteDexAnchor = deriveLargestAbsoluteDexAnchor(
      dex.strikes,
      underlyingPrice,
    );
    if (dex.coverageState === "PARTIAL") warnings.add("PARTIAL_DEX_COVERAGE");
    if (dex.metricState === "STALE") warnings.add("RETAINED_STALE_CHAIN");
  } else {
    warnings.add("DEX_UNAVAILABLE");
  }

  const partial =
    gex.metricState === "STALE" ||
    gex.coverageState === "PARTIAL" ||
    dex.metricState === "UNAVAILABLE" ||
    dex.metricState === "STALE" ||
    dex.coverageState !== "COMPLETE";

  return SpyZeroDteExposureStructureResponseSchema.parse({
    symbol: "SPY",
    product: "SPY_ZERO_DTE_DETERMINISTIC_EXPOSURE_STRUCTURE",
    methodologyVersion: "EXPOSURE_STRUCTURE_V1",
    currentMarketDate: gex.currentMarketDate,
    calculatedAt: new Date(nowMs).toISOString(),
    engineState: partial ? "PARTIAL" : "AVAILABLE",
    metricState: gex.metricState,
    coverageState: partial ? "PARTIAL" : "COMPLETE",
    expirationDate: gex.expirationDate,
    underlyingPrice,
    minimumReturnedStrike: gex.minimumReturnedStrike,
    maximumReturnedStrike: gex.maximumReturnedStrike,
    eligibleGexStrikeCount: gex.strikes.length,
    eligibleDexStrikeCount: dex.strikes.length,
    grossGammaExposure: grossGamma,
    returnedWindowNetGammaExposureProxy:
      gex.returnedWindowNetGammaExposureProxy,
    gammaRegime: gammaClassification.regime,
    gammaRegimeRatioPercent: gammaClassification.ratioPercent,
    callWalls,
    putWalls,
    largestPositiveNetGexStrike: largestStrikeBy(
      gex.strikes,
      (row) => row.netGammaExposureProxy,
      (value) => value > 0,
    ),
    largestNegativeNetGexStrike: largestStrikeBy(
      gex.strikes,
      (row) => row.netGammaExposureProxy,
      (value) => value < 0,
    ),
    gammaFlipProxy,
    gammaCliffs,
    returnedWindowNetDeltaExposureProxy,
    dexRegime,
    dexRegimeRatioPercent,
    largestAbsoluteDexAnchor,
    sourceGexMetricState: gex.metricState,
    sourceGexCoverageState: gex.coverageState,
    sourceDexMetricState: dex.metricState,
    sourceDexCoverageState: dex.coverageState,
    latestOptionQuoteAt: gex.latestOptionQuoteAt,
    chainFetchedAt: gex.chainFetchedAt,
    warnings: [...warnings],
    disclosures: {
      returnedWindowOnly: true,
      openInterestMayBeStaleIntraday: true,
      analyticalCallPositivePutNegativeConvention: true,
      gammaFlipIsCumulativeBalanceProxy: true,
      notObservedDealerInventory: true,
      noStandaloneSignal: true,
      noPrivateAccountData: true,
      noPositionSizing: true,
      noOrderExecution: true,
    },
  });
}
