"use client";

import type { PointInTimeBacktestRunRequest } from "@spy-copilot/shared";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiClient } from "@/lib/api-client";

const HISTORY_QUERY_KEY = ["point-in-time-backtest-runs", "spy"] as const;

export function usePointInTimeBacktestRuns() {
  return useQuery({
    queryKey: HISTORY_QUERY_KEY,
    queryFn: apiClient.getPointInTimeBacktestRuns,
    refetchOnWindowFocus: false,
  });
}

export function usePointInTimeBacktestRun(runId: string | null) {
  return useQuery({
    queryKey: ["point-in-time-backtest-run", "spy", runId],
    queryFn: () => apiClient.getPointInTimeBacktestRun(runId!),
    enabled: runId !== null,
    refetchOnWindowFocus: false,
  });
}

export function useCreatePointInTimeBacktestRun() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (request: PointInTimeBacktestRunRequest) =>
      apiClient.createPointInTimeBacktestRun(request),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: HISTORY_QUERY_KEY });
    },
  });
}
