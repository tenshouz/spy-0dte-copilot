"use client";

import type { SpyZeroDteObjectiveRiskResponse } from "@spy-copilot/shared";
import { useQuery } from "@tanstack/react-query";
import { apiClient } from "@/lib/api-client";
import {
  LIVE_QUERY_RESPONSIVENESS_OPTIONS,
  SPY_DERIVED_ACTIVE_POLL_INTERVAL_MS,
  getSpyDerivedPollIntervalMs,
} from "@/lib/live-refresh-policy";

export const SPY_TRADE_RISK_POLL_INTERVAL_MS = SPY_DERIVED_ACTIVE_POLL_INTERVAL_MS;
export const TRADE_RISK_TRANSPORT_WARNING =
  "Deterministic objective/risk framework temporarily unavailable — showing the last received result.";

export function useSpyZeroDteObjectiveRiskFramework() {
  return useQuery({
    queryKey: ["spy-zero-dte-objective-risk-framework", "RISK_V1"],
    queryFn: apiClient.getSpyZeroDteObjectiveRiskFramework,
    refetchInterval: () => getSpyDerivedPollIntervalMs(),
    ...LIVE_QUERY_RESPONSIVENESS_OPTIONS,
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
