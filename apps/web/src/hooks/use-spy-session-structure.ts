"use client";

import type { SpyDeterministicSessionStructureResponse } from "@spy-copilot/shared";
import { useQuery } from "@tanstack/react-query";
import { apiClient } from "@/lib/api-client";

export const SESSION_STRUCTURE_POLL_INTERVAL_MS = 15_000;
export const SESSION_STRUCTURE_TRANSPORT_WARNING =
  "Session Structure service temporarily unavailable — showing the last validated response.";

export function useSpyDeterministicSessionStructure() {
  return useQuery({
    queryKey: ["spy-deterministic-session-structure"],
    queryFn: apiClient.getSpyDeterministicSessionStructure,
    refetchInterval: SESSION_STRUCTURE_POLL_INTERVAL_MS,
    staleTime: SESSION_STRUCTURE_POLL_INTERVAL_MS,
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
