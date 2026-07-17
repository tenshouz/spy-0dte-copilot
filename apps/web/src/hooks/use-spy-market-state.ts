"use client";

import type { SpyZeroDteDeterministicMarketStateResponse } from "@spy-copilot/shared";
import { useQuery } from "@tanstack/react-query";
import { apiClient } from "@/lib/api-client";

export const SPY_MARKET_STATE_POLL_INTERVAL_MS = 30_000;
export const MARKET_STATE_TRANSPORT_WARNING =
  "Deterministic Market State temporarily unavailable — showing the last received result.";

export function useSpyZeroDteDeterministicMarketState() {
  return useQuery({
    queryKey: ["spy-zero-dte-deterministic-market-state", "V1"],
    queryFn: apiClient.getSpyZeroDteDeterministicMarketState,
    refetchInterval: SPY_MARKET_STATE_POLL_INTERVAL_MS,
    staleTime: SPY_MARKET_STATE_POLL_INTERVAL_MS,
    placeholderData: (previous) => previous,
  });
}

export interface DisplaySpyZeroDteDeterministicMarketState {
  response: SpyZeroDteDeterministicMarketStateResponse;
  transportFailed: boolean;
}

export function useDisplaySpyZeroDteDeterministicMarketState(): {
  display: DisplaySpyZeroDteDeterministicMarketState | null;
  isLoading: boolean;
  isError: boolean;
} {
  const { data, isLoading, isError } = useSpyZeroDteDeterministicMarketState();
  if (!data) return { display: null, isLoading, isError };

  return {
    display: { response: data, transportFailed: isError },
    isLoading: false,
    isError: false,
  };
}
