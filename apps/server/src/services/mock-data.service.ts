import type {
  Alert,
  Candle,
  JournalEntry,
  MarketSnapshot,
  Report,
  StrikeExposure,
} from "@spy-copilot/shared";

/**
 * Milestone 1: every function here returns deterministic-ish mock data shaped
 * exactly like the PRD schemas (see packages/shared/src/schemas.ts). This is
 * now the single source of mock data for the app — the frontend fetches it
 * over HTTP instead of importing local mocks (see apps/web/src/lib/api-client.ts).
 *
 * Milestone 2 will replace the body of these functions with real calls into
 * the Metrics Engine / AI engine (fed by the Schwab provider); the route
 * layer and response shape do not need to change.
 */

const now = () => new Date().toISOString();

export function getLatestSnapshot(): MarketSnapshot {
  return {
    id: "snap_mock_001",
    timestamp: now(),
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
    expirationUsed: now(),
    isZeroDte: true,
  };
}

export function getStrikeExposures(): StrikeExposure[] {
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

export function getCandles(count = 48): Candle[] {
  const sessionStart = new Date();
  sessionStart.setHours(9, 30, 0, 0);
  const startUnix = Math.floor(sessionStart.getTime() / 1000);

  let price = 614.8;
  const candles: Candle[] = [];

  for (let i = 0; i < count; i++) {
    const drift = i < 6 ? 0.18 : Math.sin(i / 6) * 0.12;
    const noise = (pseudoRandom(i) - 0.5) * 0.4;
    const open = price;
    const close = open + drift + noise;
    const high = Math.max(open, close) + Math.abs(noise) * 0.6;
    const low = Math.min(open, close) - Math.abs(noise) * 0.6;
    const volume = 40_000 + pseudoRandom(i + 100) * 60_000;

    candles.push({
      time: startUnix + i * 300,
      open: round2(open),
      high: round2(high),
      low: round2(low),
      close: round2(close),
      volume: Math.round(volume),
    });

    price = close;
  }

  return candles;
}

function pseudoRandom(seed: number): number {
  const x = Math.sin(seed * 999) * 10000;
  return x - Math.floor(x);
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

export function getLatestReport(): Report {
  const snapshot = getLatestSnapshot();
  return {
    id: "report_mock_0935",
    type: "0935",
    createdAt: now(),
    snapshot,
    bias: "CALLS",
    confidence: 8,
    bullishScenario:
      "Price holds above VWAP and the opening range high; a push through the gamma flip near 617 " +
      "invites dealer hedging that accelerates the move toward the call wall.",
    bearishScenario:
      "A fast rejection back below VWAP on expanding volume would flip the regime back to range-bound " +
      "and put the put wall in play.",
    tradePlan: {
      entryCondition: "Break and hold above 617.40 with volume confirmation",
      targets: [618.9, 620.1],
      invalidation: 616.2,
      riskNote: "Theta accelerates after 2:00 PM ET — reduce size on late-day entries.",
    },
    warnings: ["Relative volume only 1.12x — confirm expansion before adding size."],
    reasoning:
      "Price is above VWAP with dealers positioned long gamma, which favors an orderly grind rather than " +
      "a violent move. The opening drive has confirmed with volume, and DEX suggests dealers are net " +
      "buyers on dips, reinforcing the bullish case into the call wall at 620.",
    factorScores: [
      { factor: "Above VWAP", points: 2, detail: "Spot 617.42 vs VWAP 616.85" },
      { factor: "Positive Gamma", points: 2, detail: "Net GEX +$1.24B — dampens volatility" },
      { factor: "Opening Drive confirmed", points: 2, detail: "Opening range high broken with volume" },
      { factor: "Volume Expanding", points: 1, detail: "RVOL 1.12x" },
      { factor: "Dealer Position Bullish (DEX)", points: 2, detail: "Net DEX +$340M" },
    ],
    screenshotUrl: null,
  };
}

export function getReportHistory(): Report[] {
  const latest = getLatestReport();
  return [
    { ...latest, id: "report_mock_1000", type: "1000", confidence: 8 },
    { ...latest, id: "report_mock_0945", type: "0945", confidence: 7 },
    { ...latest, id: "report_mock_0935", type: "0935", confidence: 8 },
    {
      ...latest,
      id: "report_mock_premarket",
      type: "premarket",
      bias: "WAIT",
      confidence: 5,
      reasoning: "Premarket range is tight and inside yesterday's value area — no clear edge yet.",
    },
  ];
}

export function getJournalEntries(): JournalEntry[] {
  return [
    {
      id: "journal_mock_003",
      reportId: "report_mock_0935",
      traded: true,
      direction: "CALLS",
      entryPrice: 617.5,
      exitPrice: 619.1,
      pnl: 160,
      notes: "Took profit at target 1 ahead of the lunch-chop warning window.",
      createdAt: new Date(Date.now() - 1 * 24 * 3_600_000).toISOString(),
      updatedAt: new Date(Date.now() - 1 * 24 * 3_600_000).toISOString(),
    },
    {
      id: "journal_mock_002",
      reportId: "report_mock_premarket",
      traded: false,
      direction: null,
      entryPrice: null,
      exitPrice: null,
      pnl: null,
      notes: "Stayed out — premarket range was too tight relative to expected move.",
      createdAt: new Date(Date.now() - 2 * 24 * 3_600_000).toISOString(),
      updatedAt: new Date(Date.now() - 2 * 24 * 3_600_000).toISOString(),
    },
    {
      id: "journal_mock_001",
      reportId: "report_mock_1000",
      traded: true,
      direction: "PUTS",
      entryPrice: 614.2,
      exitPrice: 613.05,
      pnl: 115,
      notes: "Faded the rejection off the call wall — invalidation held clean.",
      createdAt: new Date(Date.now() - 3 * 24 * 3_600_000).toISOString(),
      updatedAt: new Date(Date.now() - 3 * 24 * 3_600_000).toISOString(),
    },
  ];
}

export function getAlerts(): Alert[] {
  return [
    {
      id: "alert_mock_001",
      severity: "bias_change",
      title: "Bias changed: WAIT → CALLS",
      message: "Confidence 8/10 — above VWAP, positive gamma, opening drive confirmed.",
      createdAt: new Date(Date.now() - 6 * 60_000).toISOString(),
      delivered: true,
    },
    {
      id: "alert_mock_002",
      severity: "warning",
      title: "Low relative volume",
      message: "RVOL at 0.9x heading into the 9:45 checkpoint — confirm expansion before adding size.",
      createdAt: new Date(Date.now() - 3 * 60_000).toISOString(),
      delivered: true,
    },
    {
      id: "alert_mock_003",
      severity: "info",
      title: "Premarket report generated",
      message: "9:25 AM premarket report is ready — regime: range-bound, bias: WAIT.",
      createdAt: new Date(Date.now() - 40 * 60_000).toISOString(),
      delivered: true,
    },
    {
      id: "alert_mock_004",
      severity: "invalidation",
      title: "Trade plan invalidation level approached",
      message: "SPY traded down to 616.35, within 0.15 of the 616.20 invalidation level.",
      createdAt: new Date(Date.now() - 1 * 60_000).toISOString(),
      delivered: false,
    },
  ];
}
