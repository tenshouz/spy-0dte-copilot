import type { SpyZeroDteExpectedMoveResponse } from "@spy-copilot/shared";
import { deriveSpyZeroDteExpectedMove, buildUnavailableSpyZeroDteExpectedMoveResponse } from "./spy-expected-move.logic";
import { getSpyZeroDteOptionsChain } from "./schwab-options-chain.service";
import { getObservedMarketDate } from "./session-data.logic";

export async function getSpyZeroDteExpectedMove(): Promise<SpyZeroDteExpectedMoveResponse> {
  const chain = await getSpyZeroDteOptionsChain();
  return deriveSpyZeroDteExpectedMove(chain, Date.now());
}

export function getLastResortSpyZeroDteExpectedMove(): SpyZeroDteExpectedMoveResponse {
  const nowMs = Date.now();
  return buildUnavailableSpyZeroDteExpectedMoveResponse(
    getObservedMarketDate(nowMs),
    nowMs,
    "OPTIONS_CHAIN_UNAVAILABLE",
  );
}
