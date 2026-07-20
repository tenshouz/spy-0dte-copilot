"use client";

import type { SpyZeroDteExposureStructureResponse } from "@spy-copilot/shared";
import { useQuery } from "@tanstack/react-query";
import { SPY_OPTIONS_CHAIN_POLL_INTERVAL_MS } from "@/hooks/use-spy-options-chain";
import { apiClient } from "@/lib/api-client";

export const EXPOSURE_STRUCTURE_TRANSPORT_WARNING =
  "Exposure Structure service temporarily unavailable — showing the last validated result.";

export function useSpyZeroDteExposureStructure() {
  return useQuery({
    queryKey: ["spy-zero-dte-exposure-structure"],
    queryFn: apiClient.getSpyZeroDteExposureStructure,
    refetchInterval: SPY_OPTIONS_CHAIN_POLL_INTERVAL_MS,
    staleTime: SPY_OPTIONS_CHAIN_POLL_INTERVAL_MS,
    placeholderData: (previous) => previous,
  });
}

export function useDisplaySpyZeroDteExposureStructure(): {
  display: { response: SpyZeroDteExposureStructureResponse; transportFailed: boolean } | null;
  isLoading: boolean;
  isError: boolean;
} {
  const query = useSpyZeroDteExposureStructure();
  if (!query.data) {
    return { display: null, isLoading: query.isLoading, isError: query.isError };
  }
  return {
    display: { response: query.data, transportFailed: query.isError },
    isLoading: false,
    isError: false,
  };
}
