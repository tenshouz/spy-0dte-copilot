"use client";

import { QUOTE_FRESHNESS_THRESHOLD_MS, type SpyQuote } from "@spy-copilot/shared";
import { useQuery } from "@tanstack/react-query";
import { apiClient } from "@/lib/api-client";

/** Frontend polling interval — named constant, not a magic number. */
export const SPY_QUOTE_POLL_INTERVAL_MS = 15_000;

/**
 * The single quote query shared by the dashboard header and the Current
 * Price card — one stable key, so both always render the exact same
 * normalized quote and never poll Schwab independently. React Query
 * deduplicates concurrent component subscriptions, and background-tab
 * polling stays off (refetchIntervalInBackground defaults to false).
 */
export function useSpyQuote() {
  return useQuery({
    queryKey: ["spy-quote"],
    queryFn: apiClient.getSpyQuote,
    refetchInterval: SPY_QUOTE_POLL_INTERVAL_MS,
    staleTime: SPY_QUOTE_POLL_INTERVAL_MS,
    // Keep showing the previous quote while a refetch is in flight — no flicker.
    placeholderData: (prev) => prev,
  });
}

export interface DisplaySpyQuote {
  /** The quote to render, with sourceState possibly downgraded (never upgraded). */
  quote: SpyQuote;
  /** True when the latest frontend→backend request failed and retained data is shown. */
  transportFailed: boolean;
}

/** Fixed safe warning for frontend transport failures — never a raw fetch error. */
export const QUOTE_TRANSPORT_WARNING =
  "Quote service temporarily unavailable — showing the last received quote.";

/**
 * Shared display-state logic for BOTH the header and the Current Price card,
 * so they always show the same price and the same effective source state.
 *
 * Successful backend responses are authoritative. This helper only adds a
 * safety fallback for when the backend itself is unreachable: the retained
 * quote stays visible, and a LIVE label is downgraded to STALE once its
 * fetchedAt age exceeds the shared freshness threshold. MOCK and STALE are
 * never upgraded, and nothing is ever promoted to LIVE here.
 */
export function useDisplaySpyQuote(): {
  display: DisplaySpyQuote | null;
  isLoading: boolean;
  isError: boolean;
} {
  const { data, isLoading, isError } = useSpyQuote();

  if (!data) {
    // No quote has ever loaded: normal loading/error behavior applies.
    return { display: null, isLoading, isError };
  }

  let quote = data;
  if (isError) {
    const ageMs = Math.max(0, Date.now() - Date.parse(data.fetchedAt));
    const downgraded =
      data.sourceState === "LIVE" && ageMs > QUOTE_FRESHNESS_THRESHOLD_MS
        ? ("STALE" as const)
        : data.sourceState;
    quote = { ...data, sourceState: downgraded, dataAgeMs: ageMs };
  }

  return {
    display: { quote, transportFailed: isError },
    isLoading: false,
    isError: false, // retained data renders; the error state is reserved for "never loaded"
  };
}
