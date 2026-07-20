"use client";

import {
  OPTIONS_CHAIN_FRESHNESS_THRESHOLD_MS,
  type SpyZeroDteOptionsChainResponse,
} from "@spy-copilot/shared";
import { useQuery } from "@tanstack/react-query";
import { apiClient } from "@/lib/api-client";
import { LIVE_QUERY_RESPONSIVENESS_OPTIONS } from "@/lib/live-refresh-policy";

export const SPY_OPTIONS_CHAIN_POLL_INTERVAL_MS = 30_000;
export const OPTIONS_CHAIN_TRANSPORT_WARNING =
  "Options Chain service temporarily unavailable — showing the last received result.";

export function useSpyZeroDteOptionsChain() {
  return useQuery({
    queryKey: ["spy-zero-dte-options-chain"],
    queryFn: apiClient.getSpyZeroDteOptionsChain,
    refetchInterval: SPY_OPTIONS_CHAIN_POLL_INTERVAL_MS,
    ...LIVE_QUERY_RESPONSIVENESS_OPTIONS,
    placeholderData: (previous) => previous,
  });
}

export interface DisplaySpyZeroDteOptionsChain {
  response: SpyZeroDteOptionsChainResponse;
  transportFailed: boolean;
}

export function useDisplaySpyZeroDteOptionsChain(): {
  display: DisplaySpyZeroDteOptionsChain | null;
  isLoading: boolean;
  isError: boolean;
} {
  const { data, isLoading, isError } = useSpyZeroDteOptionsChain();
  if (!data) return { display: null, isLoading, isError };

  let response = data;
  if (isError) {
    const ageMs = Math.max(0, Date.now() - Date.parse(data.fetchedAt));
    if (ageMs > OPTIONS_CHAIN_FRESHNESS_THRESHOLD_MS) {
      response = {
        ...data,
        metricState: data.metricState === "LIVE" ? "STALE" : data.metricState,
        sourceState: data.sourceState === "LIVE" ? "STALE" : data.sourceState,
        dataAgeMs: ageMs,
      };
    } else {
      response = { ...data, dataAgeMs: ageMs };
    }
  }

  return {
    display: { response, transportFailed: isError },
    isLoading: false,
    isError: false,
  };
}
