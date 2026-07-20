"use client";

import {
  CANDLE_FRESHNESS_THRESHOLD_MS,
  type SessionLevelState,
  type SpySessionLevelsResponse,
} from "@spy-copilot/shared";
import { useQuery } from "@tanstack/react-query";
import { apiClient } from "@/lib/api-client";
import {
  LIVE_QUERY_RESPONSIVENESS_OPTIONS,
  getSpyCandlePollIntervalMs,
} from "@/lib/live-refresh-policy";

export const SESSION_LEVELS_TRANSPORT_WARNING =
  "Session levels service temporarily unavailable — showing the last received levels.";

export function useSpySessionLevels() {
  return useQuery({
    queryKey: ["spy-session-levels"],
    queryFn: apiClient.getSpySessionLevels,
    refetchInterval: () => getSpyCandlePollIntervalMs(),
    ...LIVE_QUERY_RESPONSIVENESS_OPTIONS,
    placeholderData: (prev) => prev,
  });
}

export interface DisplaySpySessionLevels {
  response: SpySessionLevelsResponse;
  transportFailed: boolean;
}

function downgradeLevelState(state: SessionLevelState): SessionLevelState {
  return state === "LIVE" ? "STALE" : state;
}

/**
 * Shared display-state logic for every session-level consumer. The backend is
 * authoritative; on frontend transport failure, retained LIVE source/levels
 * can only downgrade to STALE after the shared candle freshness threshold.
 */
export function useDisplaySpySessionLevels(): {
  display: DisplaySpySessionLevels | null;
  isLoading: boolean;
  isError: boolean;
} {
  const { data, isLoading, isError } = useSpySessionLevels();

  if (!data) {
    return { display: null, isLoading, isError };
  }

  let response = data;
  if (isError) {
    const ageMs = Math.max(0, Date.now() - Date.parse(data.fetchedAt));
    if (ageMs > CANDLE_FRESHNESS_THRESHOLD_MS) {
      response = {
        ...data,
        candleSourceState: data.candleSourceState === "LIVE" ? "STALE" : data.candleSourceState,
        premarketHigh: {
          ...data.premarketHigh,
          state: downgradeLevelState(data.premarketHigh.state),
        },
        premarketLow: {
          ...data.premarketLow,
          state: downgradeLevelState(data.premarketLow.state),
        },
        previousDayHigh: {
          ...data.previousDayHigh,
          state: downgradeLevelState(data.previousDayHigh.state),
        },
        previousDayLow: {
          ...data.previousDayLow,
          state: downgradeLevelState(data.previousDayLow.state),
        },
        previousDayClose: {
          ...data.previousDayClose,
          state: downgradeLevelState(data.previousDayClose.state),
        },
        dataAgeMs: ageMs,
      };
    } else {
      response = { ...data, dataAgeMs: ageMs };
    }
  }

  return {
    display: { response, transportFailed: isError },
    isLoading: false,
    isError: false,
  };
}
