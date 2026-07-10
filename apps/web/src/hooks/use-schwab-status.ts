"use client";

import { useQuery } from "@tanstack/react-query";
import { apiClient } from "@/lib/api-client";

/** Auth-only status (PRD Section 5.1/13.3) — no market data is fetched yet. */
export function useSchwabStatus() {
  return useQuery({
    queryKey: ["schwab-status"],
    queryFn: apiClient.getSchwabStatus,
    refetchInterval: 30_000,
  });
}
