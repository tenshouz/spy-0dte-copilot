"use client";

import type { SpyZeroDteDeterministicTradePlanResponse } from "@spy-copilot/shared";
import { useQuery } from "@tanstack/react-query";
import { apiClient } from "@/lib/api-client";

export const SPY_TRADE_PLAN_POLL_INTERVAL_MS = 30_000;
export const TRADE_PLAN_TRANSPORT_WARNING =
  "Deterministic Trade-Plan eligibility temporarily unavailable — showing the last received result.";

export function useSpyZeroDteDeterministicTradePlan() {
  return useQuery({
    queryKey: ["spy-zero-dte-deterministic-trade-plan", "TRADE_PLAN_V1"],
    queryFn: apiClient.getSpyZeroDteDeterministicTradePlan,
    refetchInterval: SPY_TRADE_PLAN_POLL_INTERVAL_MS,
    staleTime: SPY_TRADE_PLAN_POLL_INTERVAL_MS,
    placeholderData: (previous) => previous,
  });
}

export interface DisplaySpyZeroDteDeterministicTradePlan {
  response: SpyZeroDteDeterministicTradePlanResponse;
  transportFailed: boolean;
}

export function useDisplaySpyZeroDteDeterministicTradePlan(): {
  display: DisplaySpyZeroDteDeterministicTradePlan | null;
  isLoading: boolean;
  isError: boolean;
} {
  const { data, isLoading, isError } = useSpyZeroDteDeterministicTradePlan();
  if (!data) return { display: null, isLoading, isError };

  return {
    display: { response: data, transportFailed: isError },
    isLoading: false,
    isError: false,
  };
}
