"use client";

import type { SpyZeroDteContractSelectionResponse } from "@spy-copilot/shared";
import { useQuery } from "@tanstack/react-query";
import { apiClient } from "@/lib/api-client";
import {
  LIVE_QUERY_RESPONSIVENESS_OPTIONS,
  SPY_DERIVED_ACTIVE_POLL_INTERVAL_MS,
  getSpyDerivedPollIntervalMs,
} from "@/lib/live-refresh-policy";

export const SPY_TRADE_CONTRACT_POLL_INTERVAL_MS = SPY_DERIVED_ACTIVE_POLL_INTERVAL_MS;
export const TRADE_CONTRACT_TRANSPORT_WARNING =
  "Deterministic contract selection temporarily unavailable — showing the last received result.";

export function useSpyZeroDteContractSelection() {
  return useQuery({
    queryKey: ["spy-zero-dte-contract-selection", "CONTRACT_V2"],
    queryFn: apiClient.getSpyZeroDteContractSelection,
    refetchInterval: () => getSpyDerivedPollIntervalMs(),
    ...LIVE_QUERY_RESPONSIVENESS_OPTIONS,
    placeholderData: (previous) => previous,
  });
}

export interface DisplaySpyZeroDteContractSelection {
  response: SpyZeroDteContractSelectionResponse;
  transportFailed: boolean;
}

export function useDisplaySpyZeroDteContractSelection(): {
  display: DisplaySpyZeroDteContractSelection | null;
  isLoading: boolean;
  isError: boolean;
} {
  const { data, isLoading, isError } = useSpyZeroDteContractSelection();
  if (!data) return { display: null, isLoading, isError };

  return {
    display: { response: data, transportFailed: isError },
    isLoading: false,
    isError: false,
  };
}
