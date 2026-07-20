"use client";

import type {
  DiscordAutomaticScheduledReportCadenceMilliseconds,
  DiscordAutomaticTradePlanAlertCadenceMilliseconds,
  DiscordScheduledReportDeliveryRequest,
} from "@spy-copilot/shared";
import { useMutation, useQuery } from "@tanstack/react-query";
import { apiClient } from "@/lib/api-client";


export const DISCORD_AUTOMATIC_SCHEDULED_REPORT_CADENCE_OPTIONS = [
  30_000,
  60_000,
  120_000,
] as const satisfies readonly DiscordAutomaticScheduledReportCadenceMilliseconds[];
export const DISCORD_AUTOMATIC_TRADE_PLAN_ALERT_CADENCE_OPTIONS = [
  15_000,
  30_000,
  60_000,
] as const satisfies readonly DiscordAutomaticTradePlanAlertCadenceMilliseconds[];

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

export function useDiscordScheduledReportDelivery() {
  return useMutation({
    mutationFn: (request: DiscordScheduledReportDeliveryRequest) =>
      apiClient.sendDiscordScheduledReport(request),
  });
}

export function useDiscordTradePlanAlertDelivery() {
  return useMutation({
    mutationFn: apiClient.sendDiscordTradePlanAlert,
  });
}

/**
 * Automatic Discord delivery is opt-in and browser-session scoped. The query
 * uses POST under the typed API client, polls only while enabled, and never
 * evaluates in a background tab.
 */
export function useDiscordAutomaticTradePlanAlertDelivery(
  enabled: boolean,
  cadenceMilliseconds: DiscordAutomaticTradePlanAlertCadenceMilliseconds,
) {
  return useQuery({
    queryKey: [
      "discord-automatic-trade-plan-alert-delivery",
      "DISCORD_AUTOMATIC_TRADE_PLAN_ALERT_DELIVERY_V1",
      cadenceMilliseconds,
    ],
    queryFn: () =>
      apiClient.sendDiscordAutomaticTradePlanAlert({
        clientMode: "FOREGROUND_BROWSER_SESSION",
        cadenceMilliseconds,
      }),
    enabled,
    refetchInterval: enabled ? cadenceMilliseconds : false,
    refetchIntervalInBackground: false,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
    retry: false,
    staleTime: 0,
  });
}


/**
 * Scheduled-report delivery is explicitly opt-in and browser-session scoped.
 * The backend evaluates the official Eastern-time schedule and applies
 * process-memory duplicate suppression before any provider request.
 */
export function useDiscordAutomaticScheduledReportDelivery(
  enabled: boolean,
  cadenceMilliseconds: DiscordAutomaticScheduledReportCadenceMilliseconds,
) {
  return useQuery({
    queryKey: [
      "discord-automatic-scheduled-report-delivery",
      "DISCORD_AUTOMATIC_SCHEDULED_REPORT_DELIVERY_V1",
      cadenceMilliseconds,
    ],
    queryFn: () =>
      apiClient.sendDiscordAutomaticScheduledReport({
        clientMode: "FOREGROUND_BROWSER_SESSION",
        cadenceMilliseconds,
      }),
    enabled,
    refetchInterval: enabled ? cadenceMilliseconds : false,
    refetchIntervalInBackground: false,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
    retry: false,
    staleTime: 0,
  });
}
