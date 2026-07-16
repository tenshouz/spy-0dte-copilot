import type { SpyZeroDteMarketContextResponse } from "@spy-copilot/shared";
import { getLastResortSpyOpeningRange, getSpyOpeningRange } from "./opening-range.service";
import { getLastResortSpyRthGap, getSpyRthGap } from "./rth-gap.service";
import { getLastResortSpyRthVwap, getSpyRthVwap } from "./rth-vwap.service";
import { getLastResortMockCandles, getSpyCandles } from "./schwab-candles.service";
import { getLastResortMockQuote, getSpyQuote } from "./schwab-market-data.service";
import {
  getLastResortSpyZeroDteOptionsChain,
  getSpyZeroDteOptionsChain,
} from "./schwab-options-chain.service";
import {
  getLastResortSessionDataFoundation,
  getSpySessionDataFoundation,
} from "./session-data.service";
import {
  getLastResortSpySessionLevels,
  getSpySessionLevels,
} from "./session-levels.service";
import {
  getLastResortSpyZeroDteDexProxy,
  getSpyZeroDteDexProxy,
} from "./spy-dex-proxy.service";
import {
  getLastResortSpyZeroDteExpectedMove,
  getSpyZeroDteExpectedMove,
} from "./spy-expected-move.service";
import {
  getLastResortSpyZeroDteGexProxy,
  getSpyZeroDteGexProxy,
} from "./spy-gex-proxy.service";
import { buildSpyZeroDteMarketContext, type SpyMarketContextInputs } from "./market-context.logic";

async function settledOrFallback<T>(promise: Promise<T>, fallback: () => T): Promise<T> {
  const result = await Promise.allSettled([promise]);
  return result[0]?.status === "fulfilled" ? result[0].value : fallback();
}

/**
 * Assembles focused summaries from existing internal services. It intentionally
 * has no provider client and no derived cache: each completed service remains
 * authoritative for its own request, cache, freshness, and warning behavior.
 */
export async function getSpyZeroDteMarketContext(): Promise<SpyZeroDteMarketContextResponse> {
  const [
    quote,
    candles,
    sessionData,
    vwap,
    sessionLevels,
    gap,
    openingRange,
    options,
    expectedMove,
    gex,
    dex,
  ] = await Promise.all([
    settledOrFallback(getSpyQuote(), getLastResortMockQuote),
    settledOrFallback(getSpyCandles(), getLastResortMockCandles),
    settledOrFallback(getSpySessionDataFoundation(), getLastResortSessionDataFoundation),
    settledOrFallback(getSpyRthVwap(), getLastResortSpyRthVwap),
    settledOrFallback(getSpySessionLevels(), getLastResortSpySessionLevels),
    settledOrFallback(getSpyRthGap(), getLastResortSpyRthGap),
    settledOrFallback(getSpyOpeningRange(), getLastResortSpyOpeningRange),
    settledOrFallback(getSpyZeroDteOptionsChain(), getLastResortSpyZeroDteOptionsChain),
    settledOrFallback(getSpyZeroDteExpectedMove(), getLastResortSpyZeroDteExpectedMove),
    settledOrFallback(getSpyZeroDteGexProxy(), getLastResortSpyZeroDteGexProxy),
    settledOrFallback(getSpyZeroDteDexProxy(), getLastResortSpyZeroDteDexProxy),
  ]);

  const inputs: SpyMarketContextInputs = {
    quote,
    candles,
    sessionData,
    vwap,
    sessionLevels,
    gap,
    openingRange,
    options,
    expectedMove,
    gex,
    dex,
  };
  return buildSpyZeroDteMarketContext(inputs, Date.now());
}

export function getLastResortSpyZeroDteMarketContext(): SpyZeroDteMarketContextResponse {
  return buildSpyZeroDteMarketContext(
    {
      quote: getLastResortMockQuote(),
      candles: getLastResortMockCandles(),
      sessionData: getLastResortSessionDataFoundation(),
      vwap: getLastResortSpyRthVwap(),
      sessionLevels: getLastResortSpySessionLevels(),
      gap: getLastResortSpyRthGap(),
      openingRange: getLastResortSpyOpeningRange(),
      options: getLastResortSpyZeroDteOptionsChain(),
      expectedMove: getLastResortSpyZeroDteExpectedMove(),
      gex: getLastResortSpyZeroDteGexProxy(),
      dex: getLastResortSpyZeroDteDexProxy(),
    },
    Date.now(),
  );
}
