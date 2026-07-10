"use client";

import { useQuery } from "@tanstack/react-query";
import { apiClient } from "@/lib/api-client";

/** Milestone 3 will back the server route with the scoring + LLM pipeline; this hook doesn't change. */
export function useLatestReport() {
  return useQuery({
    queryKey: ["report", "latest"],
    queryFn: apiClient.getLatestReport,
    refetchInterval: 30_000,
  });
}

export function useReportHistory() {
  return useQuery({
    queryKey: ["report", "history"],
    queryFn: apiClient.getReportHistory,
  });
}
