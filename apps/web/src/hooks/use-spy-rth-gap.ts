"use client";

import {
  CANDLE_FRESHNESS_THRESHOLD_MS,
  type SpyRthGapResponse,
} from "@spy-copilot/shared";
import { useQuery } from "@tanstack/react-query";
import { SPY_CANDLE_POLL_INTERVAL_MS } from "@/hooks/use-spy-candles";
import { apiClient } from "@/lib/api-client";

export const RTH_GAP_TRANSPORT_WARNING =
  "RTH gap service temporarily unavailable — showing the last received result.";

export function useSpyRthGap() {
  return useQuery({
    queryKey: ["spy-rth-gap"],
    queryFn: apiClient.getSpyRthGap,
    refetchInterval: SPY_CANDLE_POLL_INTERVAL_MS,
    staleTime: SPY_CANDLE_POLL_INTERVAL_MS,
    placeholderData: (prev) => prev,
  });
}

export interface DisplaySpyRthGap {
  response: SpyRthGapResponse;
  transportFailed: boolean;
}

/**
 * Retained transport-failure data may only preserve or weaken provenance.
 * Fill evidence remains factual, while the package source downgrades to STALE
 * after the shared candle freshness threshold.
 */
export function useDisplaySpyRthGap(): {
  display: DisplaySpyRthGap | null;
  isLoading: boolean;
  isError: boolean;
} {
  const { data, isLoading, isError } = useSpyRthGap();

  if (!data) return { display: null, isLoading, isError };

  let response = data;
  if (isError) {
    const ageMs = Math.max(0, Date.now() - Date.parse(data.fetchedAt));
    if (ageMs > CANDLE_FRESHNESS_THRESHOLD_MS) {
      response = {
        ...data,
        metricState: data.metricState === "LIVE" ? "STALE" : data.metricState,
        candleSourceState:
          data.candleSourceState === "LIVE" ? "STALE" : data.candleSourceState,
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
