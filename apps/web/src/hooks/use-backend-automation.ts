"use client";

import type { BackendAutomationSettingsUpdateRequest } from "@spy-copilot/shared";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiClient } from "@/lib/api-client";

export const BACKEND_AUTOMATION_CADENCE_OPTIONS = [15, 30, 60] as const;

export function useBackendAutomationSettings() {
  return useQuery({
    queryKey: ["backend-automation-settings", "BACKEND_AUTOMATION_V1"],
    queryFn: apiClient.getBackendAutomationSettings,
    retry: false,
    refetchOnWindowFocus: false,
  });
}

export function useBackendAutomationStatus() {
  return useQuery({
    queryKey: ["backend-automation-status", "BACKEND_AUTOMATION_V1"],
    queryFn: apiClient.getBackendAutomationStatus,
    retry: false,
    refetchInterval: 10_000,
    refetchIntervalInBackground: false,
    refetchOnWindowFocus: true,
  });
}

export function useBackendAutomationHistory() {
  return useQuery({
    queryKey: ["backend-automation-history", "BACKEND_AUTOMATION_V1"],
    queryFn: apiClient.getBackendAutomationHistory,
    retry: false,
    refetchInterval: 15_000,
    refetchIntervalInBackground: false,
    refetchOnWindowFocus: true,
  });
}

export function useUpdateBackendAutomationSettings() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (request: BackendAutomationSettingsUpdateRequest) =>
      apiClient.updateBackendAutomationSettings(request),
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["backend-automation-settings"] }),
        queryClient.invalidateQueries({ queryKey: ["backend-automation-status"] }),
      ]);
    },
  });
}

export function useRunBackendAutomationOnce() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: apiClient.runBackendAutomationOnce,
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["backend-automation-status"] }),
        queryClient.invalidateQueries({ queryKey: ["backend-automation-history"] }),
      ]);
    },
  });
}
