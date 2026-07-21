"use client";

import { useQuery } from "@tanstack/react-query";
import { apiClient } from "@/lib/api-client";

export const EMPIRICAL_GAMMA_RESEARCH_QUERY_KEY = [
  "empirical-gamma-research",
  "spy",
] as const;

export function useEmpiricalGammaResearch() {
  return useQuery({
    queryKey: EMPIRICAL_GAMMA_RESEARCH_QUERY_KEY,
    queryFn: apiClient.getEmpiricalGammaResearch,
    refetchOnWindowFocus: false,
  });
}
