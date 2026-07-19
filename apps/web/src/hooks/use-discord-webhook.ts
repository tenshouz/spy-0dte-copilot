"use client";

import { useMutation, useQuery } from "@tanstack/react-query";
import { apiClient } from "@/lib/api-client";

export function useDiscordWebhookStatus() {
  return useQuery({
    queryKey: ["discord-webhook-status"],
    queryFn: apiClient.getDiscordWebhookStatus,
    refetchInterval: 30_000,
    retry: false,
  });
}

export function useDiscordWebhookTest() {
  return useMutation({
    mutationFn: apiClient.sendDiscordWebhookTest,
  });
}
