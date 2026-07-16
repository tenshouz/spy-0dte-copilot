"use client";

import type { SpyZeroDteMarketContextResponse } from "@spy-copilot/shared";
import { useQuery } from "@tanstack/react-query";
import { apiClient } from "@/lib/api-client";

export const SPY_MARKET_CONTEXT_POLL_INTERVAL_MS = 30_000;
export const MARKET_CONTEXT_TRANSPORT_WARNING =
  "Unified Market Context temporarily unavailable — showing the last received result.";

export function useSpyZeroDteMarketContext() {
  return useQuery({
    queryKey: ["spy-zero-dte-market-context"],
    queryFn: apiClient.getSpyZeroDteMarketContext,
    refetchInterval: SPY_MARKET_CONTEXT_POLL_INTERVAL_MS,
    staleTime: SPY_MARKET_CONTEXT_POLL_INTERVAL_MS,
    placeholderData: (previous) => previous,
  });
}

export interface DisplaySpyZeroDteMarketContext {
  response: SpyZeroDteMarketContextResponse;
  transportFailed: boolean;
}

export function useDisplaySpyZeroDteMarketContext(): {
  display: DisplaySpyZeroDteMarketContext | null;
  isLoading: boolean;
  isError: boolean;
} {
  const { data, isLoading, isError } = useSpyZeroDteMarketContext();
  if (!data) return { display: null, isLoading, isError };

  return {
    display: { response: data, transportFailed: isError },
    isLoading: false,
    isError: false,
  };
}
