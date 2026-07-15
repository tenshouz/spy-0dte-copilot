import type { SpyRthGapResponse } from "@spy-copilot/shared";
import { buildSpyRthGapResponse } from "./rth-gap.logic";
import { getSpyBoundedCandleAccess } from "./session-data.service";

/**
 * Deterministic current-date RTH gap service. It reuses the shared bounded
 * multi-day SPY candle accessor, cache, and in-flight request already used by
 * Session Data Foundation and Core Session Levels.
 */
export async function getSpyRthGap(): Promise<SpyRthGapResponse> {
  const access = await getSpyBoundedCandleAccess();
  return buildSpyRthGapResponse(access, Date.now());
}

export function getLastResortSpyRthGap(): SpyRthGapResponse {
  const nowMs = Date.now();
  return buildSpyRthGapResponse(
    {
      dataset: null,
      requestedStartAtMs: nowMs,
      requestedEndAtMs: nowMs,
      warningCode: "UPSTREAM_ERROR",
    },
    nowMs,
  );
}
