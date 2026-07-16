import type { SpyZeroDteDexProxyResponse } from "@spy-copilot/shared";
import { getObservedMarketDate } from "./session-data.logic";
import { getSpyZeroDteOptionsChain } from "./schwab-options-chain.service";
import {
  buildUnavailableSpyZeroDteDexProxyResponse,
  deriveSpyZeroDteDexProxy,
} from "./spy-dex-proxy.logic";

/** Derived service: reuses the existing normalized Options Chain cache. */
export async function getSpyZeroDteDexProxy(): Promise<SpyZeroDteDexProxyResponse> {
  const chain = await getSpyZeroDteOptionsChain();
  return deriveSpyZeroDteDexProxy(chain, Date.now());
}

export function getLastResortSpyZeroDteDexProxy(): SpyZeroDteDexProxyResponse {
  const nowMs = Date.now();
  return buildUnavailableSpyZeroDteDexProxyResponse(
    getObservedMarketDate(nowMs),
    nowMs,
    "OPTIONS_CHAIN_UNAVAILABLE",
  );
}
