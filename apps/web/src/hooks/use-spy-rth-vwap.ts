"use client";

import {
  CANDLE_FRESHNESS_THRESHOLD_MS,
  type SpyRthVwapResponse,
  type VwapPoint,
} from "@spy-copilot/shared";
import { useQuery } from "@tanstack/react-query";
import { useMemo } from "react";
import { apiClient } from "@/lib/api-client";
import {
  LIVE_QUERY_RESPONSIVENESS_OPTIONS,
  getSpyCandlePollIntervalMs,
} from "@/lib/live-refresh-policy";

export const RTH_VWAP_TRANSPORT_WARNING =
  "VWAP service temporarily unavailable — showing the last received value.";

export function useSpyRthVwap() {
  return useQuery({
    queryKey: ["spy-rth-vwap"],
    queryFn: apiClient.getSpyRthVwap,
    refetchInterval: () => getSpyCandlePollIntervalMs(),
    ...LIVE_QUERY_RESPONSIVENESS_OPTIONS,
    placeholderData: (prev) => prev,
  });
}

export interface ChartVwapPoint {
  time: number;
  value: number;
}

export interface DisplaySpyRthVwap {
  response: SpyRthVwapResponse;
  chartSeries: ChartVwapPoint[];
  transportFailed: boolean;
}

function toChartSeries(series: VwapPoint[]): ChartVwapPoint[] {
  return series.map((point) => ({
    time: Math.floor(point.timestamp / 1000),
    value: point.value,
  }));
}

/**
 * Shared display-state logic for all VWAP consumers. The backend is
 * authoritative; this only applies the same transport-outage safety downgrade
 * used by candles so retained LIVE VWAP cannot stay labeled LIVE indefinitely.
 */
export function useDisplaySpyRthVwap(): {
  display: DisplaySpyRthVwap | null;
  isLoading: boolean;
  isError: boolean;
} {
  const { data, isLoading, isError } = useSpyRthVwap();
  const chartSeries = useMemo(
    () => toChartSeries(data?.series ?? []),
    [data?.series],
  );

  if (!data) {
    return { display: null, isLoading, isError };
  }

  let response = data;
  if (isError) {
    const ageMs = Math.max(0, Date.now() - Date.parse(data.fetchedAt));
    const metricState =
      data.metricState === "LIVE" && ageMs > CANDLE_FRESHNESS_THRESHOLD_MS
        ? ("STALE" as const)
        : data.metricState;
    const candleSourceState =
      data.candleSourceState === "LIVE" && ageMs > CANDLE_FRESHNESS_THRESHOLD_MS
        ? ("STALE" as const)
        : data.candleSourceState;
    response = { ...data, metricState, candleSourceState, dataAgeMs: ageMs };
  }

  return {
    display: {
      response,
      chartSeries,
      transportFailed: isError,
    },
    isLoading: false,
    isError: false,
  };
}
