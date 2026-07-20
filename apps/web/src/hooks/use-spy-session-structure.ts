"use client";

import type { SpyDeterministicSessionStructureResponse } from "@spy-copilot/shared";
import { useQuery } from "@tanstack/react-query";
import { apiClient } from "@/lib/api-client";
import {
  LIVE_QUERY_RESPONSIVENESS_OPTIONS,
  SPY_DERIVED_ACTIVE_POLL_INTERVAL_MS,
  getSpyDerivedPollIntervalMs,
} from "@/lib/live-refresh-policy";

export const SESSION_STRUCTURE_POLL_INTERVAL_MS = SPY_DERIVED_ACTIVE_POLL_INTERVAL_MS;
export const SESSION_STRUCTURE_TRANSPORT_WARNING =
  "Session Structure service temporarily unavailable — showing the last validated response.";

export function useSpyDeterministicSessionStructure() {
  return useQuery({
    queryKey: ["spy-deterministic-session-structure"],
    queryFn: apiClient.getSpyDeterministicSessionStructure,
    refetchInterval: () => getSpyDerivedPollIntervalMs(),
    ...LIVE_QUERY_RESPONSIVENESS_OPTIONS,
    placeholderData: (previous) => previous,
  });
}

export interface DisplaySpyDeterministicSessionStructure {
  response: SpyDeterministicSessionStructureResponse;
  transportFailed: boolean;
}

export function useDisplaySpyDeterministicSessionStructure(): {
  display: DisplaySpyDeterministicSessionStructure | null;
  isLoading: boolean;
  isError: boolean;
} {
  const query = useSpyDeterministicSessionStructure();
  if (!query.data) {
    return {
      display: null,
      isLoading: query.isLoading,
      isError: query.isError,
    };
  }
  return {
    display: {
      response: query.data,
      transportFailed: query.isError,
    },
    isLoading: false,
    isError: false,
  };
}
