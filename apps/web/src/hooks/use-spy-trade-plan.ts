"use client";

import type { SpyZeroDteDeterministicTradePlanResponse } from "@spy-copilot/shared";
import { useQuery } from "@tanstack/react-query";
import { apiClient } from "@/lib/api-client";
import {
  LIVE_QUERY_RESPONSIVENESS_OPTIONS,
  SPY_DERIVED_ACTIVE_POLL_INTERVAL_MS,
  getSpyDerivedPollIntervalMs,
} from "@/lib/live-refresh-policy";

export const SPY_TRADE_PLAN_POLL_INTERVAL_MS = SPY_DERIVED_ACTIVE_POLL_INTERVAL_MS;
export const TRADE_PLAN_TRANSPORT_WARNING =
  "Deterministic Trade-Plan eligibility temporarily unavailable — showing the last received result.";

export function useSpyZeroDteDeterministicTradePlan() {
  return useQuery({
    queryKey: ["spy-zero-dte-deterministic-trade-plan", "TRADE_PLAN_V2"],
    queryFn: apiClient.getSpyZeroDteDeterministicTradePlan,
    refetchInterval: () => getSpyDerivedPollIntervalMs(),
    ...LIVE_QUERY_RESPONSIVENESS_OPTIONS,
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
