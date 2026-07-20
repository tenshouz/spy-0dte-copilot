"use client";

import type { SpyZeroDteMarketContextResponse } from "@spy-copilot/shared";
import { useQuery } from "@tanstack/react-query";
import { apiClient } from "@/lib/api-client";
import {
  LIVE_QUERY_RESPONSIVENESS_OPTIONS,
  SPY_DERIVED_ACTIVE_POLL_INTERVAL_MS,
  getSpyDerivedPollIntervalMs,
} from "@/lib/live-refresh-policy";

export const SPY_MARKET_CONTEXT_POLL_INTERVAL_MS = SPY_DERIVED_ACTIVE_POLL_INTERVAL_MS;
export const MARKET_CONTEXT_TRANSPORT_WARNING =
  "Unified Market Context temporarily unavailable — showing the last received result.";

export function useSpyZeroDteMarketContext() {
  return useQuery({
    queryKey: ["spy-zero-dte-market-context"],
    queryFn: apiClient.getSpyZeroDteMarketContext,
    refetchInterval: () => getSpyDerivedPollIntervalMs(),
    ...LIVE_QUERY_RESPONSIVENESS_OPTIONS,
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
