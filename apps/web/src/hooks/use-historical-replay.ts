"use client";

import type { HistoricalReplayRunRequest } from "@spy-copilot/shared";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiClient } from "@/lib/api-client";

const HISTORY_QUERY_KEY = ["historical-replay-runs", "spy"] as const;

export function useHistoricalReplayRuns() {
  return useQuery({
    queryKey: HISTORY_QUERY_KEY,
    queryFn: apiClient.getHistoricalReplayRuns,
    refetchOnWindowFocus: false,
  });
}

export function useHistoricalReplayRun(runId: string | null) {
  return useQuery({
    queryKey: ["historical-replay-run", "spy", runId],
    queryFn: () => apiClient.getHistoricalReplayRun(runId!),
    enabled: runId !== null,
    refetchOnWindowFocus: false,
  });
}

export function useCreateHistoricalReplayRun() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (request: HistoricalReplayRunRequest) =>
      apiClient.createHistoricalReplayRun(request),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: HISTORY_QUERY_KEY });
    },
  });
}
