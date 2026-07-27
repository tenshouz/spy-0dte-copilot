"use client";

import { useMutation } from "@tanstack/react-query";
import type { SpyZeroDteSchwabAssistedPositionSizingRequest } from "@spy-copilot/shared";
import { apiClient } from "@/lib/api-client";

/**
 * Explicit user action only. This mutation never polls, caches broker values,
 * or requests the private Schwab snapshot on page load.
 */
export function useSpyZeroDteSchwabAssistedPositionSizing() {
  return useMutation({
    mutationKey: ["spy-zero-dte-schwab-assisted-position-sizing", "SCHWAB_ASSISTED_SIZING_V2"],
    mutationFn: (request: SpyZeroDteSchwabAssistedPositionSizingRequest) =>
      apiClient.calculateSpyZeroDteSchwabAssistedPositionSizing(request),
    retry: false,
  });
}
