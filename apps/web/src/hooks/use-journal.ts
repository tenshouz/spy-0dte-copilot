"use client";

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
