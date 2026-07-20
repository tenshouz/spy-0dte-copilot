"use client";

import type { DeterministicJournalOutcomeUpdateRequest } from "@spy-copilot/shared";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect } from "react";
import { apiClient } from "@/lib/api-client";

const JOURNAL_QUERY_KEY = ["deterministic-journal", "spy"] as const;
const JOURNAL_ANALYTICS_QUERY_KEY = ["deterministic-journal-analytics", "spy"] as const;

export function useDeterministicJournalAnalytics() {
  return useQuery({
    queryKey: JOURNAL_ANALYTICS_QUERY_KEY,
    queryFn: apiClient.getDeterministicJournalAnalytics,
    refetchOnWindowFocus: false,
  });
}

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
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: JOURNAL_QUERY_KEY }),
        queryClient.invalidateQueries({ queryKey: JOURNAL_ANALYTICS_QUERY_KEY }),
      ]);
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
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: JOURNAL_QUERY_KEY }),
        queryClient.invalidateQueries({ queryKey: JOURNAL_ANALYTICS_QUERY_KEY }),
      ]);
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
  const queryClient = useQueryClient();
  const query = useQuery({
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

  useEffect(() => {
    if (query.data?.automaticCaptureState !== "CAPTURED") return;
    void Promise.all([
      queryClient.invalidateQueries({ queryKey: JOURNAL_QUERY_KEY }),
      queryClient.invalidateQueries({ queryKey: JOURNAL_ANALYTICS_QUERY_KEY }),
    ]);
  }, [
    query.data?.automaticCaptureState,
    query.data?.entry?.id,
    queryClient,
  ]);

  return query;
}
