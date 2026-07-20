"use client";

import type { SpyZeroDteDeterministicMarketStateResponse } from "@spy-copilot/shared";
import { useQuery } from "@tanstack/react-query";
import { apiClient } from "@/lib/api-client";
import {
  LIVE_QUERY_RESPONSIVENESS_OPTIONS,
  SPY_DERIVED_ACTIVE_POLL_INTERVAL_MS,
  getSpyDerivedPollIntervalMs,
} from "@/lib/live-refresh-policy";

export const SPY_MARKET_STATE_POLL_INTERVAL_MS = SPY_DERIVED_ACTIVE_POLL_INTERVAL_MS;
export const MARKET_STATE_TRANSPORT_WARNING =
  "Deterministic Market State temporarily unavailable — showing the last received result.";

export function useSpyZeroDteDeterministicMarketState() {
  return useQuery({
    queryKey: ["spy-zero-dte-deterministic-market-state", "V1"],
    queryFn: apiClient.getSpyZeroDteDeterministicMarketState,
    refetchInterval: () => getSpyDerivedPollIntervalMs(),
    ...LIVE_QUERY_RESPONSIVENESS_OPTIONS,
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
