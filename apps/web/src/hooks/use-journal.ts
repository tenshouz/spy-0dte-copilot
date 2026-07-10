"use client";

import { useQuery } from "@tanstack/react-query";
import { apiClient } from "@/lib/api-client";

/** Milestone 2+: reads/writes real JournalEntry rows via the server + Prisma (PRD Section 11). */
export function useJournalEntries() {
  return useQuery({
    queryKey: ["journal"],
    queryFn: apiClient.getJournalEntries,
  });
}
