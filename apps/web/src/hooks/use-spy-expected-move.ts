"use client";

import type { SpyZeroDteExpectedMoveResponse } from "@spy-copilot/shared";
import { useQuery } from "@tanstack/react-query";
import { apiClient } from "@/lib/api-client";
import { LIVE_QUERY_RESPONSIVENESS_OPTIONS } from "@/lib/live-refresh-policy";
import { SPY_OPTIONS_CHAIN_POLL_INTERVAL_MS } from "@/hooks/use-spy-options-chain";

export const EXPECTED_MOVE_TRANSPORT_WARNING =
  "ATM implied-move service temporarily unavailable — showing the last received result.";

export function useSpyZeroDteExpectedMove() {
  return useQuery({
    queryKey: ["spy-zero-dte-expected-move"],
    queryFn: apiClient.getSpyZeroDteExpectedMove,
    refetchInterval: SPY_OPTIONS_CHAIN_POLL_INTERVAL_MS,
    ...LIVE_QUERY_RESPONSIVENESS_OPTIONS,
    placeholderData: (previous) => previous,
  });
}

export interface DisplaySpyZeroDteExpectedMove {
  response: SpyZeroDteExpectedMoveResponse;
  transportFailed: boolean;
}

export function useDisplaySpyZeroDteExpectedMove(): {
  display: DisplaySpyZeroDteExpectedMove | null;
  isLoading: boolean;
  isError: boolean;
} {
  const { data, isLoading, isError } = useSpyZeroDteExpectedMove();
  if (!data) return { display: null, isLoading, isError };

  return {
    display: { response: data, transportFailed: isError },
    isLoading: false,
    isError: false,
  };
}
