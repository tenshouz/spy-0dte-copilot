"use client";

import { useQuery } from "@tanstack/react-query";
import { apiClient } from "@/lib/api-client";
import {
  LIVE_QUERY_RESPONSIVENESS_OPTIONS,
  SPY_DERIVED_ACTIVE_POLL_INTERVAL_MS,
  getSpyDerivedPollIntervalMs,
} from "@/lib/live-refresh-policy";

export const SPY_TRADE_PLAN_ASSEMBLY_POLL_INTERVAL_MS = SPY_DERIVED_ACTIVE_POLL_INTERVAL_MS;

/**
 * Deliberately does not expose stale placeholder data. A current transport
 * failure must never leave a prior READY plan or selected contract on screen.
 */
export function useSpyZeroDteTradePlanAssembly() {
  return useQuery({
    queryKey: ["spy-zero-dte-trade-plan-assembly", "ASSEMBLY_V2"],
    queryFn: apiClient.getSpyZeroDteTradePlanAssembly,
    refetchInterval: () => getSpyDerivedPollIntervalMs(),
    ...LIVE_QUERY_RESPONSIVENESS_OPTIONS,
  });
}
