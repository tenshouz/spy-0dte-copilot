import type { SpySessionLevelsResponse } from "@spy-copilot/shared";
import { buildSpySessionLevelsResponse } from "./session-levels.logic";
import { getSpyBoundedCandleAccess } from "./session-data.service";

/**
 * Deterministic core session-level service. Reuses the exact same bounded
 * normalized multi-day SPY candle accessor, cache, and in-flight request as
 * the Session Data Foundation; it creates no additional Schwab data pipeline.
 */
export async function getSpySessionLevels(): Promise<SpySessionLevelsResponse> {
  const access = await getSpyBoundedCandleAccess();
  return buildSpySessionLevelsResponse(access, Date.now());
}

export function getLastResortSpySessionLevels(): SpySessionLevelsResponse {
  const nowMs = Date.now();
  return buildSpySessionLevelsResponse(
    {
      dataset: null,
      requestedStartAtMs: nowMs,
      requestedEndAtMs: nowMs,
      warningCode: "UPSTREAM_ERROR",
    },
    nowMs,
  );
}
