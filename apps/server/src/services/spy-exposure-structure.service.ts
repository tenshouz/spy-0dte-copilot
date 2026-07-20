import type { SpyZeroDteExposureStructureResponse } from "@spy-copilot/shared";
import { getObservedMarketDate } from "./session-data.logic";
import { getSpyZeroDteOptionsChain } from "./schwab-options-chain.service";
import { deriveSpyZeroDteDexProxy } from "./spy-dex-proxy.logic";
import {
  buildUnavailableSpyZeroDteGexProxyResponse,
  deriveSpyZeroDteGexProxy,
} from "./spy-gex-proxy.logic";
import {
  buildUnavailableSpyZeroDteExposureStructureResponse,
  deriveSpyZeroDteExposureStructure,
} from "./spy-exposure-structure.logic";
import { buildUnavailableSpyZeroDteDexProxyResponse } from "./spy-dex-proxy.logic";

/** Retrieves the normalized chain exactly once, then derives coherent GEX and DEX structure. */
export async function getSpyZeroDteExposureStructure(): Promise<SpyZeroDteExposureStructureResponse> {
  const chain = await getSpyZeroDteOptionsChain();
  const nowMs = Date.now();
  const gex = deriveSpyZeroDteGexProxy(chain, nowMs);
  const dex = deriveSpyZeroDteDexProxy(chain, nowMs);
  return deriveSpyZeroDteExposureStructure(gex, dex, nowMs);
}

export function getLastResortSpyZeroDteExposureStructure(): SpyZeroDteExposureStructureResponse {
  const nowMs = Date.now();
  const currentMarketDate = getObservedMarketDate(nowMs);
  const gex = buildUnavailableSpyZeroDteGexProxyResponse(
    currentMarketDate,
    nowMs,
    "OPTIONS_CHAIN_UNAVAILABLE",
  );
  const dex = buildUnavailableSpyZeroDteDexProxyResponse(
    currentMarketDate,
    nowMs,
    "OPTIONS_CHAIN_UNAVAILABLE",
  );
  return buildUnavailableSpyZeroDteExposureStructureResponse(
    currentMarketDate,
    nowMs,
    gex,
    dex,
  );
}
