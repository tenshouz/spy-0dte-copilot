"use client";

import {
  CANDLE_FRESHNESS_THRESHOLD_MS,
  type SpyOpeningRangeResponse,
} from "@spy-copilot/shared";
import { useQuery } from "@tanstack/react-query";
import { apiClient } from "@/lib/api-client";
import {
  LIVE_QUERY_RESPONSIVENESS_OPTIONS,
  getSpyCandlePollIntervalMs,
} from "@/lib/live-refresh-policy";

export const OPENING_RANGE_TRANSPORT_WARNING =
  "Opening Range service temporarily unavailable — showing the last received result.";

export function useSpyOpeningRange() {
  return useQuery({
    queryKey: ["spy-opening-range"],
    queryFn: apiClient.getSpyOpeningRange,
    refetchInterval: () => getSpyCandlePollIntervalMs(),
    ...LIVE_QUERY_RESPONSIVENESS_OPTIONS,
    placeholderData: (prev) => prev,
  });
}

export interface DisplaySpyOpeningRange {
  response: SpyOpeningRangeResponse;
  transportFailed: boolean;
}

/** Retained transport-failure data may only preserve or weaken provenance. */
export function useDisplaySpyOpeningRange(): {
  display: DisplaySpyOpeningRange | null;
  isLoading: boolean;
  isError: boolean;
} {
  const { data, isLoading, isError } = useSpyOpeningRange();

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
