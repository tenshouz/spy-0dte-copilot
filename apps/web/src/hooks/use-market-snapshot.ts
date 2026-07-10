"use client";

import { useQuery } from "@tanstack/react-query";
import { apiClient } from "@/lib/api-client";

/**
 * Milestone 1: fetches from the Express backend's mock-data routes via
 * apiClient. Milestone 2: the backend swaps its mock service for the real
 * Metrics Engine — nothing here changes.
 */
export function useMarketSnapshot() {
  return useQuery({
    queryKey: ["market-snapshot"],
    queryFn: apiClient.getSnapshot,
    refetchInterval: 30_000, // matches PRD Sec. 6.4 continuous refresh cadence
  });
}

export function useStrikeExposures() {
  return useQuery({
    queryKey: ["strike-exposures"],
    queryFn: apiClient.getStrikeExposures,
    refetchInterval: 30_000,
  });
}

export function useCandles() {
  return useQuery({
    queryKey: ["candles"],
    queryFn: apiClient.getCandles,
    refetchInterval: 60_000,
  });
}
