"use client";

import { useQuery } from "@tanstack/react-query";
import { apiClient } from "@/lib/api-client";

export const SPY_TRADE_PLAN_ASSEMBLY_POLL_INTERVAL_MS = 30_000;

/**
 * Deliberately does not expose stale placeholder data. A current transport
 * failure must never leave a prior READY plan or selected contract on screen.
 */
export function useSpyZeroDteTradePlanAssembly() {
  return useQuery({
    queryKey: ["spy-zero-dte-trade-plan-assembly", "ASSEMBLY_V2"],
    queryFn: apiClient.getSpyZeroDteTradePlanAssembly,
    refetchInterval: SPY_TRADE_PLAN_ASSEMBLY_POLL_INTERVAL_MS,
    staleTime: SPY_TRADE_PLAN_ASSEMBLY_POLL_INTERVAL_MS,
  });
}
