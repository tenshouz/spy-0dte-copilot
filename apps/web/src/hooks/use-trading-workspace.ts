"use client";

import {
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import type {
  CloseTradingPositionRequest,
  ConfirmTradingEntryRequest,
  RecordTradingOverrideRequest,
  UpsertTradingRestrictedEventRequest,
} from "@spy-copilot/shared";
import { apiClient } from "@/lib/api-client";
import { LIVE_QUERY_RESPONSIVENESS_OPTIONS } from "@/lib/live-refresh-policy";

export const TRADING_WORKSPACE_QUERY_KEY = [
  "spy-zero-dte-trading-workspace",
  "TRADING_WORKSPACE_V1",
] as const;

export function useTradingWorkspace() {
  return useQuery({
    queryKey: TRADING_WORKSPACE_QUERY_KEY,
    queryFn: apiClient.getTradingWorkspace,
    refetchInterval: 5_000,
    ...LIVE_QUERY_RESPONSIVENESS_OPTIONS,
  });
}

export function useConfirmTradingEntry() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (request: ConfirmTradingEntryRequest) =>
      apiClient.confirmTradingEntry(request),
    onSuccess: (response) => {
      if (response.workspace) {
        queryClient.setQueryData(TRADING_WORKSPACE_QUERY_KEY, response.workspace);
      }
      void queryClient.invalidateQueries({ queryKey: TRADING_WORKSPACE_QUERY_KEY });
    },
  });
}

export function useCloseTradingPosition() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: {
      positionId: string;
      request: CloseTradingPositionRequest;
    }) => apiClient.closeTradingPosition(input.positionId, input.request),
    onSuccess: (response) => {
      if (response.workspace) {
        queryClient.setQueryData(TRADING_WORKSPACE_QUERY_KEY, response.workspace);
      }
      void queryClient.invalidateQueries({ queryKey: TRADING_WORKSPACE_QUERY_KEY });
    },
  });
}

export function useRecordTradingOverride() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (request: RecordTradingOverrideRequest) =>
      apiClient.recordTradingOverride(request),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: TRADING_WORKSPACE_QUERY_KEY });
    },
  });
}

export function useCreateTradingRestrictedEvent() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (request: UpsertTradingRestrictedEventRequest) =>
      apiClient.createTradingRestrictedEvent(request),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: TRADING_WORKSPACE_QUERY_KEY });
    },
  });
}

export function useDeleteTradingRestrictedEvent() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (eventId: string) => apiClient.deleteTradingRestrictedEvent(eventId),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: TRADING_WORKSPACE_QUERY_KEY });
    },
  });
}
