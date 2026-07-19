"use client";

import { useQuery } from "@tanstack/react-query";
import { apiClient } from "@/lib/api-client";

export const SPY_TRADE_PLAN_ALERT_MONITOR_POLL_INTERVAL_MS = 15_000;

/**
 * The transition route mutates process-local deduplication state, so monitoring
 * is opt-in. No request is made until the user explicitly starts the monitor.
 */
export function useSpyTradePlanAlertTransition(enabled: boolean) {
  return useQuery({
    queryKey: ["spy-zero-dte-trade-plan-alert-transition", "TRADE_PLAN_ALERT_TRANSITION_V1"],
    queryFn: apiClient.getSpyZeroDteTradePlanAlertTransition,
    enabled,
    refetchInterval: enabled
      ? SPY_TRADE_PLAN_ALERT_MONITOR_POLL_INTERVAL_MS
      : false,
    refetchIntervalInBackground: false,
    retry: false,
    staleTime: 0,
  });
}
