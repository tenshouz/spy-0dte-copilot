import type { SpyOpeningRangeResponse } from "@spy-copilot/shared";
import { buildSpyOpeningRangeResponse } from "./opening-range.logic";
import { getSpyBoundedCandleAccess } from "./session-data.service";

/** Fixed 15-minute current-date RTH Opening Range from the shared bounded cache. */
export async function getSpyOpeningRange(): Promise<SpyOpeningRangeResponse> {
  const access = await getSpyBoundedCandleAccess();
  return buildSpyOpeningRangeResponse(access, Date.now());
}

export function getLastResortSpyOpeningRange(): SpyOpeningRangeResponse {
  const nowMs = Date.now();
  return buildSpyOpeningRangeResponse(
    {
      dataset: null,
      requestedStartAtMs: nowMs,
      requestedEndAtMs: nowMs,
      warningCode: "UPSTREAM_ERROR",
    },
    nowMs,
  );
}
