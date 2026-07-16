"use client";

import type { SpyZeroDteGexProxyResponse } from "@spy-copilot/shared";
import { useQuery } from "@tanstack/react-query";
import { SPY_OPTIONS_CHAIN_POLL_INTERVAL_MS } from "@/hooks/use-spy-options-chain";
import { apiClient } from "@/lib/api-client";

export const GEX_PROXY_TRANSPORT_WARNING =
  "GEX Proxy service temporarily unavailable — showing the last received result.";

export function useSpyZeroDteGexProxy() {
  return useQuery({
    queryKey: ["spy-zero-dte-gex-proxy"],
    queryFn: apiClient.getSpyZeroDteGexProxy,
    refetchInterval: SPY_OPTIONS_CHAIN_POLL_INTERVAL_MS,
    staleTime: SPY_OPTIONS_CHAIN_POLL_INTERVAL_MS,
    placeholderData: (previous) => previous,
  });
}

export interface DisplaySpyZeroDteGexProxy {
  response: SpyZeroDteGexProxyResponse;
  transportFailed: boolean;
}

export function useDisplaySpyZeroDteGexProxy(): {
  display: DisplaySpyZeroDteGexProxy | null;
  isLoading: boolean;
  isError: boolean;
} {
  const { data, isLoading, isError } = useSpyZeroDteGexProxy();
  if (!data) return { display: null, isLoading, isError };

  return {
    display: { response: data, transportFailed: isError },
    isLoading: false,
    isError: false,
  };
}
