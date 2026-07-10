"use client";

import { useQuery } from "@tanstack/react-query";
import { apiClient } from "@/lib/api-client";

/** Milestone 2+: backed by real Discord delivery logs (PRD Section 12); this hook doesn't change. */
export function useAlerts() {
  return useQuery({
    queryKey: ["alerts"],
    queryFn: apiClient.getAlerts,
    refetchInterval: 30_000,
  });
}
