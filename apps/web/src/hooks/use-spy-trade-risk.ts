"use client";

import type { SpyZeroDteObjectiveRiskResponse } from "@spy-copilot/shared";
import { useQuery } from "@tanstack/react-query";
import { apiClient } from "@/lib/api-client";

export const SPY_TRADE_RISK_POLL_INTERVAL_MS = 30_000;
export const TRADE_RISK_TRANSPORT_WARNING =
  "Deterministic objective/risk framework temporarily unavailable — showing the last received result.";

export function useSpyZeroDteObjectiveRiskFramework() {
  return useQuery({
    queryKey: ["spy-zero-dte-objective-risk-framework", "RISK_V1"],
    queryFn: apiClient.getSpyZeroDteObjectiveRiskFramework,
    refetchInterval: SPY_TRADE_RISK_POLL_INTERVAL_MS,
    staleTime: SPY_TRADE_RISK_POLL_INTERVAL_MS,
    placeholderData: (previous) => previous,
  });
}

export interface DisplaySpyZeroDteObjectiveRiskFramework {
  response: SpyZeroDteObjectiveRiskResponse;
  transportFailed: boolean;
}

export function useDisplaySpyZeroDteObjectiveRiskFramework(): {
  display: DisplaySpyZeroDteObjectiveRiskFramework | null;
  isLoading: boolean;
  isError: boolean;
} {
  const { data, isLoading, isError } = useSpyZeroDteObjectiveRiskFramework();
  if (!data) return { display: null, isLoading, isError };

  return {
    display: { response: data, transportFailed: isError },
    isLoading: false,
    isError: false,
  };
}
