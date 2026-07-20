"use client";

import type { DeterministicJournalOutcomeUpdateRequest } from "@spy-copilot/shared";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiClient } from "@/lib/api-client";

const JOURNAL_QUERY_KEY = ["deterministic-journal", "spy"] as const;

export function useDeterministicJournalSnapshots() {
  return useQuery({
    queryKey: JOURNAL_QUERY_KEY,
    queryFn: apiClient.getDeterministicJournalSnapshots,
    refetchOnWindowFocus: false,
  });
}

export function useCaptureDeterministicJournalSnapshot() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: apiClient.captureDeterministicJournalSnapshot,
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: JOURNAL_QUERY_KEY });
    },
  });
}

export function useUpdateDeterministicJournalOutcome() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({
      snapshotId,
      request,
    }: {
      snapshotId: string;
      request: DeterministicJournalOutcomeUpdateRequest;
    }) => apiClient.updateDeterministicJournalOutcome(snapshotId, request),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: JOURNAL_QUERY_KEY });
    },
  });
}

export const AUTOMATIC_JOURNAL_CAPTURE_CADENCE_OPTIONS = [15_000, 30_000, 60_000] as const;
export type AutomaticJournalCaptureCadence =
  (typeof AUTOMATIC_JOURNAL_CAPTURE_CADENCE_OPTIONS)[number];

export function useAutomaticDeterministicJournalCapture(
  enabled: boolean,
  cadenceMilliseconds: AutomaticJournalCaptureCadence,
) {
  return useQuery({
    queryKey: [
      "deterministic-journal-automatic-capture",
      "JOURNAL_SNAPSHOT_V3",
      cadenceMilliseconds,
    ],
    queryFn: apiClient.automaticallyCaptureDeterministicJournalSnapshot,
    enabled,
    refetchInterval: enabled ? cadenceMilliseconds : false,
    refetchIntervalInBackground: false,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
    retry: false,
    staleTime: 0,
  });
}
