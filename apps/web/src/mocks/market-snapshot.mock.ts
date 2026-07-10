import { MarketSnapshotSchema, type MarketSnapshot, type StrikeExposure } from "@spy-copilot/shared";

export function getMockSnapshot(): MarketSnapshot {
  const snapshot: MarketSnapshot = {
    id: "snap_mock_001",
    timestamp: new Date().toISOString(),
    spotPrice: 617.42,
    vwap: 616.85,
    openingRangeHigh: 617.9,
    openingRangeLow: 615.6,
    premarketHigh: 616.4,
    premarketLow: 614.2,
    overnightHigh: 616.1,
    overnightLow: 613.9,
    trend5m: "UP",
    trend1m: "UP",
    volume: 18_420_000,
    relativeVolume: 1.12,
    emaTrend: "UP",
    netGex: 1_240_000_000,
    netDex: 340_000_000,
    gammaFlip: 617.0,
    callWall: 620.0,
    putWall: 615.0,
    dealerPositioning: "LONG_GAMMA",
    expectedMove: 4.1,
    ivRank: 38,
    expirationUsed: new Date().toISOString(),
    isZeroDte: true,
  };

  // Validate at the mock boundary so any future real API response is guaranteed
  // to satisfy the same contract components rely on.
  return MarketSnapshotSchema.parse(snapshot);
}

export function getMockStrikeExposures(): StrikeExposure[] {
  const strikes = [608, 610, 612, 614, 615, 616, 617, 618, 619, 620, 622, 624, 626];
  return strikes.map((strike) => {
    const distanceFromFlip = strike - 617;
    const gex = -Math.pow(distanceFromFlip, 2) * 8_000_000 + 900_000_000 * (strike === 617 ? 1.4 : 1);
    const dex = distanceFromFlip * 12_000_000;
    return {
      strike,
      callOpenInterest: Math.round(8_000 + Math.random() * 6_000),
      putOpenInterest: Math.round(7_000 + Math.random() * 6_000),
      gex: Math.round(gex),
      dex: Math.round(dex),
    };
  });
}
