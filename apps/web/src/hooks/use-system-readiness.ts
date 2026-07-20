"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiClient } from "@/lib/api-client";

export function useSystemReadiness() {
  return useQuery({
    queryKey: ["system-readiness", "SYSTEM_READINESS_V1"],
    queryFn: apiClient.getSystemReadiness,
    retry: false,
    refetchInterval: 30_000,
    refetchIntervalInBackground: false,
    refetchOnWindowFocus: true,
  });
}

export function useRunSystemDataProbe() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: apiClient.runSystemDataProbe,
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["system-readiness"] });
    },
  });
}
