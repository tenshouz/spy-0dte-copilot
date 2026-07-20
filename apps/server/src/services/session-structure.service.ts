import type { SpyDeterministicSessionStructureResponse } from "@spy-copilot/shared";
import { getSpyQuote, getLastResortMockQuote } from "./schwab-market-data.service";
import { getSpyBoundedCandleAccess } from "./session-data.service";
import { buildSpyDeterministicSessionStructureResponse } from "./session-structure.logic";

export async function getSpyDeterministicSessionStructure(): Promise<SpyDeterministicSessionStructureResponse> {
  const [access, quote] = await Promise.all([
    getSpyBoundedCandleAccess(),
    getSpyQuote(),
  ]);
  return buildSpyDeterministicSessionStructureResponse(access, quote, Date.now());
}

export function getLastResortSpyDeterministicSessionStructure(): SpyDeterministicSessionStructureResponse {
  const nowMs = Date.now();
  return buildSpyDeterministicSessionStructureResponse(
    {
      dataset: null,
      requestedStartAtMs: nowMs,
      requestedEndAtMs: nowMs,
      warningCode: "UPSTREAM_ERROR",
    },
    getLastResortMockQuote(),
    nowMs,
  );
}
