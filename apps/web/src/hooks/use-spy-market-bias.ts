"use client";

import type { SpyZeroDteDeterministicBiasResponse } from "@spy-copilot/shared";
import { useQuery } from "@tanstack/react-query";
import { apiClient } from "@/lib/api-client";
import {
  LIVE_QUERY_RESPONSIVENESS_OPTIONS,
  SPY_DERIVED_ACTIVE_POLL_INTERVAL_MS,
  getSpyDerivedPollIntervalMs,
} from "@/lib/live-refresh-policy";

export const SPY_MARKET_BIAS_POLL_INTERVAL_MS = SPY_DERIVED_ACTIVE_POLL_INTERVAL_MS;
export const MARKET_BIAS_TRANSPORT_WARNING =
  "Deterministic Bias and Confidence temporarily unavailable — showing the last received result.";

export function useSpyZeroDteDeterministicBias() {
  return useQuery({
    queryKey: ["spy-zero-dte-deterministic-bias", "BIAS_V1"],
    queryFn: apiClient.getSpyZeroDteDeterministicBias,
    refetchInterval: () => getSpyDerivedPollIntervalMs(),
    ...LIVE_QUERY_RESPONSIVENESS_OPTIONS,
    placeholderData: (previous) => previous,
  });
}

export interface DisplaySpyZeroDteDeterministicBias {
  response: SpyZeroDteDeterministicBiasResponse;
  transportFailed: boolean;
}

export function useDisplaySpyZeroDteDeterministicBias(): {
  display: DisplaySpyZeroDteDeterministicBias | null;
  isLoading: boolean;
  isError: boolean;
} {
  const { data, isLoading, isError } = useSpyZeroDteDeterministicBias();
  if (!data) return { display: null, isLoading, isError };

  return {
    display: { response: data, transportFailed: isError },
    isLoading: false,
    isError: false,
  };
}
