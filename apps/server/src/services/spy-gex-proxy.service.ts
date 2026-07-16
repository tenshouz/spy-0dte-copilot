import type { SpyZeroDteGexProxyResponse } from "@spy-copilot/shared";
import { getObservedMarketDate } from "./session-data.logic";
import { getSpyZeroDteOptionsChain } from "./schwab-options-chain.service";
import {
  buildUnavailableSpyZeroDteGexProxyResponse,
  deriveSpyZeroDteGexProxy,
} from "./spy-gex-proxy.logic";

/** Derived service: reuses the existing normalized Options Chain cache. */
export async function getSpyZeroDteGexProxy(): Promise<SpyZeroDteGexProxyResponse> {
  const chain = await getSpyZeroDteOptionsChain();
  return deriveSpyZeroDteGexProxy(chain, Date.now());
}

export function getLastResortSpyZeroDteGexProxy(): SpyZeroDteGexProxyResponse {
  const nowMs = Date.now();
  return buildUnavailableSpyZeroDteGexProxyResponse(
    getObservedMarketDate(nowMs),
    nowMs,
    "OPTIONS_CHAIN_UNAVAILABLE",
  );
}
