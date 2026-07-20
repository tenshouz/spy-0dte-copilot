"use client";

import type { SpyZeroDteDexProxyResponse } from "@spy-copilot/shared";
import { useQuery } from "@tanstack/react-query";
import { SPY_OPTIONS_CHAIN_POLL_INTERVAL_MS } from "@/hooks/use-spy-options-chain";
import { apiClient } from "@/lib/api-client";
import { LIVE_QUERY_RESPONSIVENESS_OPTIONS } from "@/lib/live-refresh-policy";

export const DEX_PROXY_TRANSPORT_WARNING =
  "DEX Proxy service temporarily unavailable — showing the last received result.";

export function useSpyZeroDteDexProxy() {
  return useQuery({
    queryKey: ["spy-zero-dte-dex-proxy"],
    queryFn: apiClient.getSpyZeroDteDexProxy,
    refetchInterval: SPY_OPTIONS_CHAIN_POLL_INTERVAL_MS,
    ...LIVE_QUERY_RESPONSIVENESS_OPTIONS,
    placeholderData: (previous) => previous,
  });
}

export interface DisplaySpyZeroDteDexProxy {
  response: SpyZeroDteDexProxyResponse;
  transportFailed: boolean;
}

export function useDisplaySpyZeroDteDexProxy(): {
  display: DisplaySpyZeroDteDexProxy | null;
  isLoading: boolean;
  isError: boolean;
} {
  const { data, isLoading, isError } = useSpyZeroDteDexProxy();
  if (!data) return { display: null, isLoading, isError };

  return {
    display: { response: data, transportFailed: isError },
    isLoading: false,
    isError: false,
  };
}
