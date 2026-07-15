"use client";

import {
  CANDLE_FRESHNESS_THRESHOLD_MS,
  type Candle,
  type SpyCandleResponse,
} from "@spy-copilot/shared";
import { useQuery } from "@tanstack/react-query";
import { apiClient } from "@/lib/api-client";

/** Frontend candle polling interval — named constant, independent of quote polling. */
export const SPY_CANDLE_POLL_INTERVAL_MS = 30_000;

/** Fixed safe warning for frontend transport failures — never a raw fetch error. */
export const CANDLE_TRANSPORT_WARNING =
  "Candle service temporarily unavailable — showing the last received candles.";

/**
 * The single dedicated candle query — its own stable key, so candle polling
 * never triggers quote or whole-dashboard refetches. Background-tab polling
 * stays off (project default); placeholderData prevents chart flicker.
 */
export function useSpyCandles() {
  return useQuery({
    queryKey: ["spy-candles"],
    queryFn: apiClient.getSpyCandles,
    refetchInterval: SPY_CANDLE_POLL_INTERVAL_MS,
    staleTime: SPY_CANDLE_POLL_INTERVAL_MS,
    placeholderData: (prev) => prev,
  });
}

export interface DisplaySpyCandles {
  /** The response to render, sourceState possibly downgraded (never upgraded). */
  response: SpyCandleResponse;
  /** Candles converted for lightweight-charts (unix SECONDS at the chart boundary only). */
  chartCandles: Candle[];
  /** True when the latest frontend→backend request failed and retained data is shown. */
  transportFailed: boolean;
}

/**
 * Shared display-state logic for every candle consumer (same pattern as
 * useDisplaySpyQuote). Successful backend responses are authoritative; this
 * only adds the backend-outage safety fallback: retained candles stay
 * rendered, LIVE downgrades to STALE once fetchedAt age exceeds the shared
 * 90-second threshold, and MOCK/STALE are never upgraded.
 */
export function useDisplaySpyCandles(): {
  display: DisplaySpyCandles | null;
  isLoading: boolean;
  isError: boolean;
} {
  const { data, isLoading, isError } = useSpyCandles();

  if (!data) {
    return { display: null, isLoading, isError };
  }

  let response = data;
  if (isError) {
    const ageMs = Math.max(0, Date.now() - Date.parse(data.fetchedAt));
    const downgraded =
      data.sourceState === "LIVE" && ageMs > CANDLE_FRESHNESS_THRESHOLD_MS
        ? ("STALE" as const)
        : data.sourceState;
    response = { ...data, sourceState: downgraded, dataAgeMs: ageMs };
  }

  const chartCandles: Candle[] = response.candles.map((c) => ({
    time: Math.floor(c.timestamp / 1000),
    open: c.open,
    high: c.high,
    low: c.low,
    close: c.close,
    volume: c.volume,
  }));

  return {
    display: { response, chartCandles, transportFailed: isError },
    isLoading: false,
    isError: false, // retained data renders; the error state is reserved for "never loaded"
  };
}
