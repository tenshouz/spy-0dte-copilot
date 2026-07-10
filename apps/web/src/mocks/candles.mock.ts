import type { Candle } from "@spy-copilot/shared";

/**
 * Deterministic-ish mock 5-minute candles for a single session, seeded so the
 * chart looks like a plausible SPY 0DTE morning (opening drive up through
 * VWAP). Milestone 2 replaces this with real intraday candles from Schwab.
 */
export function generateMockCandles(count = 48): Candle[] {
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
