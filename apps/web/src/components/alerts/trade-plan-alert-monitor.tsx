"use client";

import { useEffect, useState } from "react";
import type {
  DeterministicScheduledReportType,
  DiscordAutomaticScheduledReportCadenceMilliseconds,
  DiscordAutomaticScheduledReportDeliveryResponse,
  DiscordAutomaticTradePlanAlertCadenceMilliseconds,
  DiscordScheduledReportDeliveryResponse,
  DiscordAutomaticTradePlanAlertDeliveryResponse,
  SpyZeroDteTradePlanAlertTransitionResponse,
  DiscordTradePlanAlertDeliveryPrimaryReasonCode,
  DiscordTradePlanAlertDeliveryResponse,
  TradePlanAlertTransitionEvent,
} from "@spy-copilot/shared";
import {
  AlertTriangle,
  BellRing,
  FileText,
  CirclePause,
  CirclePlay,
  Info,
  RefreshCw,
  Send,
  Trash2,
} from "lucide-react";
import { MetricCard } from "@/components/panels/metric-card";
import { Panel } from "@/components/panels/panel";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useBackendAutomationSettings } from "@/hooks/use-backend-automation";
import {
  DISCORD_AUTOMATIC_SCHEDULED_REPORT_CADENCE_OPTIONS,
  DISCORD_AUTOMATIC_TRADE_PLAN_ALERT_CADENCE_OPTIONS,
  useDiscordAutomaticScheduledReportDelivery,
  useDiscordAutomaticTradePlanAlertDelivery,
  useDiscordScheduledReportDelivery,
  useDiscordTradePlanAlertDelivery,
  useDiscordWebhookStatus,
} from "@/hooks/use-discord-webhook";
import {
  SPY_TRADE_PLAN_ALERT_MONITOR_POLL_INTERVAL_MS,
  useSpyTradePlanAlertTransition,
} from "@/hooks/use-spy-trade-plan-alert-transition";
import {
  formatAlertMonitorDuration,
  formatAlertMonitorTimestamp,
  getAlertMonitorReasonDescription,
  getAlertMonitorStateView,
  getAlertSeverityView,
  getAlertTransitionTypeLabel,
  type AlertMonitorTone,
} from "@/lib/trade-plan-alert-transition-view";
import { cn } from "@/lib/utils";

const MAX_SESSION_EVENTS = 50;
const MAX_DISCORD_DELIVERY_ATTEMPTS = 25;

const SCHEDULED_REPORT_OPTIONS: readonly {
  value: DeterministicScheduledReportType;
  label: string;
}[] = [
  { value: "PREMARKET_0925", label: "9:25 AM Premarket" },
  { value: "OPENING_0935", label: "9:35 AM Opening" },
  { value: "OPENING_0945", label: "9:45 AM Opening Structure" },
  { value: "UPDATE_1000", label: "10:00 AM Update" },
];

interface SessionAlertEvent {
  event: TradePlanAlertTransitionEvent;
  evaluatedAt: string;
  currentMarketDate: string;
}

function badgeVariant(
  tone: AlertMonitorTone,
): "default" | "accent" | "bull" | "bear" | "wait" {
  return tone;
}

export function TradePlanAlertMonitor() {
  const [monitoring, setMonitoring] = useState(false);
  const [automaticDiscordEnabled, setAutomaticDiscordEnabled] = useState(false);
  const [automaticScheduledReportsEnabled, setAutomaticScheduledReportsEnabled] =
    useState(false);
  const [automaticDiscordCadence, setAutomaticDiscordCadence] =
    useState<DiscordAutomaticTradePlanAlertCadenceMilliseconds>(30_000);
  const [automaticScheduledReportCadence, setAutomaticScheduledReportCadence] =
    useState<DiscordAutomaticScheduledReportCadenceMilliseconds>(60_000);
  const [sessionEvents, setSessionEvents] = useState<SessionAlertEvent[]>([]);
  const [scheduledReportType, setScheduledReportType] =
    useState<DeterministicScheduledReportType>("PREMARKET_0925");
  const [discordDeliveryAttempts, setDiscordDeliveryAttempts] = useState<
    DiscordTradePlanAlertDeliveryResponse[]
  >([]);
  const query = useSpyTradePlanAlertTransition(monitoring);
  const backendAutomationSettings = useBackendAutomationSettings();
  const persistentBackendAutomationEnabled =
    backendAutomationSettings.data?.settings?.enabled === true;
  const discordStatus = useDiscordWebhookStatus();
  const discordDelivery = useDiscordTradePlanAlertDelivery();
  const scheduledReportDelivery = useDiscordScheduledReportDelivery();
  const automaticDiscordDelivery = useDiscordAutomaticTradePlanAlertDelivery(
    automaticDiscordEnabled &&
      !persistentBackendAutomationEnabled &&
      discordStatus.data?.state === "READY",
    automaticDiscordCadence,
  );
  const automaticScheduledReportDelivery =
    useDiscordAutomaticScheduledReportDelivery(
      automaticScheduledReportsEnabled &&
        !persistentBackendAutomationEnabled &&
        discordStatus.data?.state === "READY",
      automaticScheduledReportCadence,
    );
  const result = query.data ?? null;
  const automaticDiscordResult = automaticDiscordDelivery.data ?? null;
  const automaticScheduledReportResult =
    automaticScheduledReportDelivery.data ?? null;

  useEffect(() => {
    if (
      !monitoring ||
      !result ||
      result.transitionState !== "EMIT" ||
      !result.event
    ) {
      return;
    }

    const nextEvent: SessionAlertEvent = {
      event: result.event,
      evaluatedAt: result.evaluatedAt,
      currentMarketDate: result.currentMarketDate,
    };

    setSessionEvents((current) => {
      if (
        current.some(
          (entry) =>
            entry.event.transitionFingerprint ===
            nextEvent.event.transitionFingerprint,
        )
      ) {
        return current;
      }

      return [nextEvent, ...current].slice(0, MAX_SESSION_EVENTS);
    });
  }, [monitoring, result]);

  useEffect(() => {
    if (
      automaticDiscordEnabled &&
      discordStatus.data !== undefined &&
      discordStatus.data.state !== "READY"
    ) {
      setAutomaticDiscordEnabled(false);
    }
  }, [automaticDiscordEnabled, discordStatus.data]);

  useEffect(() => {
    if (
      automaticScheduledReportsEnabled &&
      discordStatus.data !== undefined &&
      discordStatus.data.state !== "READY"
    ) {
      setAutomaticScheduledReportsEnabled(false);
    }
  }, [automaticScheduledReportsEnabled, discordStatus.data]);

  useEffect(() => {
    if (!persistentBackendAutomationEnabled) return;
    setAutomaticDiscordEnabled(false);
    setAutomaticScheduledReportsEnabled(false);
  }, [persistentBackendAutomationEnabled]);

  const requestScheduledReportDelivery = () => {
    scheduledReportDelivery.mutate({ reportType: scheduledReportType });
  };

  const requestDiscordDelivery = () => {
    discordDelivery.mutate(undefined, {
      onSuccess: (deliveryResult) => {
        setDiscordDeliveryAttempts((current) =>
          [deliveryResult, ...current].slice(0, MAX_DISCORD_DELIVERY_ATTEMPTS),
        );
      },
    });
  };

  const stateView = result
    ? getAlertMonitorStateView(result.transitionState)
    : null;

  return (
    <div className="grid min-w-0 grid-cols-1 gap-3 lg:grid-cols-3">
      <Panel
        title="Trade Plan Alert Monitor"
        className="min-w-0 lg:col-span-3"
        action={
          <Badge variant={monitoring ? "accent" : "default"}>
            {monitoring ? "Monitoring" : "Stopped"}
          </Badge>
        }
      >
        <div className="space-y-4">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
            <div className="max-w-3xl space-y-1">
              <p className="text-sm leading-relaxed text-foreground">
                Evaluate deterministic Trade Plan alert transitions in this
                browser session.
              </p>
              <p className="text-xs leading-relaxed text-muted-foreground">
                Monitoring is opt-in. Events are session-only and are not
                persisted. Routine WAITING_FOR_TRIGGER and
                SETUP_NOT_QUALIFIED recalculations remain dashboard-only.
                Discord is reserved for READY plans, qualified structures with
                no eligible contract, and withdrawal of a previously READY
                plan. All delivery paths share semantic fingerprint
                suppression inside the backend process.
              </p>
            </div>

            <div className="flex flex-wrap gap-2">
              {monitoring ? (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => setMonitoring(false)}
                >
                  <CirclePause className="h-4 w-4" />
                  Stop monitor
                </Button>
              ) : (
                <Button
                  type="button"
                  size="sm"
                  onClick={() => setMonitoring(true)}
                >
                  <CirclePlay className="h-4 w-4" />
                  Start monitor
                </Button>
              )}

              <Button
                type="button"
                variant="subtle"
                size="sm"
                disabled={!monitoring || query.isFetching}
                onClick={() => void query.refetch()}
              >
                <RefreshCw
                  className={cn("h-4 w-4", query.isFetching && "animate-spin")}
                />
                Evaluate now
              </Button>

              <Button
                type="button"
                variant="subtle"
                size="sm"
                disabled={
                  discordStatus.data?.state !== "READY" ||
                  discordDelivery.isPending
                }
                onClick={requestDiscordDelivery}
              >
                <Send
                  className={cn(
                    "h-4 w-4",
                    discordDelivery.isPending && "animate-pulse",
                  )}
                />
                {discordDelivery.isPending
                  ? "Sending…"
                  : "Evaluate & send to Discord"}
              </Button>
            </div>
          </div>

          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-4">
            <MetricCard
              label="Monitor"
              value={monitoring ? "Running" : "Stopped"}
              tone={monitoring ? "bull" : "default"}
              sublabel="Explicit browser-session control"
            />
            <MetricCard
              label="Poll Cadence"
              value={formatAlertMonitorDuration(
                SPY_TRADE_PLAN_ALERT_MONITOR_POLL_INTERVAL_MS,
              )}
              sublabel="Foreground tab only"
            />
            <MetricCard
              label="Latest Evaluation"
              value={formatAlertMonitorTimestamp(result?.evaluatedAt ?? null)}
              sublabel={result?.currentMarketDate ?? "No evaluation yet"}
            />
            <MetricCard
              label="Session Events"
              value={sessionEvents.length}
              sublabel={`Maximum ${MAX_SESSION_EVENTS}; cleared on refresh`}
            />
          </div>

          {query.isError ? (
            <div className="flex items-start gap-2 rounded-md border border-bear/30 bg-bear/5 p-3 text-xs text-bear">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
              The transition route could not be evaluated. No event was added,
              and monitoring will not retry automatically until the next
              scheduled evaluation or manual refresh.
            </div>
          ) : null}

          {discordDelivery.data ? (
            <DiscordDeliveryNotice
              result={discordDelivery.data}
              retrying={discordDelivery.isPending}
              onRetry={requestDiscordDelivery}
            />
          ) : discordDelivery.isError ? (
            <div className="flex items-start gap-2 rounded-md border border-bear/30 bg-bear/5 p-3 text-xs text-bear">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
              The explicit Discord delivery request failed before a validated
              result was returned. No automatic retry was attempted.
            </div>
          ) : discordStatus.data?.state !== "READY" ? (
            <div className="flex items-start gap-2 rounded-md border border-dashed border-panel-border p-3 text-xs text-muted-foreground">
              <Info className="mt-0.5 h-4 w-4 shrink-0" />
              Configure and test the backend Discord webhook in Settings to
              enable explicit Trade Plan alert delivery.
            </div>
          ) : null}

          {!monitoring && !result ? (
            <div className="flex items-start gap-2 rounded-md border border-dashed border-panel-border p-3 text-xs text-muted-foreground">
              <Info className="mt-0.5 h-4 w-4 shrink-0" />
              No transition request has been made. Select Start monitor to begin
              explicit session monitoring.
            </div>
          ) : null}

          {result && stateView ? (
            <CurrentEvaluation result={result} />
          ) : monitoring && query.isLoading ? (
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <RefreshCw className="h-4 w-4 animate-spin" />
              Evaluating the current deterministic alert candidate…
            </div>
          ) : null}
        </div>
      </Panel>

      <Panel
        title="Automatic Discord Delivery"
        className="min-w-0 lg:col-span-3"
        action={
          <Badge variant={automaticDiscordEnabled ? "bull" : "default"}>
            {automaticDiscordEnabled ? "Running" : "Stopped"}
          </Badge>
        }
      >
        <div className="space-y-4">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
            <div className="max-w-3xl space-y-1">
              <p className="text-sm leading-relaxed text-foreground">
                Automatically evaluate and deliver new deterministic Trade Plan
                alert transitions while this Alerts page remains open.
              </p>
              <p className="text-xs leading-relaxed text-muted-foreground">
                This is an explicit opt-in browser session, not a background
                scheduler. Persistent backend automation remains the preferred
                delivery path. When persistent Trade Plan delivery is active,
                the server also rejects foreground delivery requests. Semantic
                event fingerprints prevent any remaining sender path in the same
                process from posting the same event. Routine waiting-state
                updates are never sent. Timeout or network ambiguity is retained
                as claimed to avoid a
                duplicate message.
              </p>
            </div>

            <div className="flex flex-wrap items-end gap-2">
              <label className="space-y-1 text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
                Cadence
                <select
                  aria-label="Automatic Discord delivery cadence"
                  value={automaticDiscordCadence}
                  disabled={automaticDiscordEnabled}
                  onChange={(event) =>
                    setAutomaticDiscordCadence(
                      Number(
                        event.target.value,
                      ) as DiscordAutomaticTradePlanAlertCadenceMilliseconds,
                    )
                  }
                  className="block h-9 rounded-md border border-panel-border bg-background px-3 font-mono text-xs text-foreground disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {DISCORD_AUTOMATIC_TRADE_PLAN_ALERT_CADENCE_OPTIONS.map(
                    (cadence) => (
                      <option key={cadence} value={cadence}>
                        {formatAlertMonitorDuration(cadence)}
                      </option>
                    ),
                  )}
                </select>
              </label>

              {automaticDiscordEnabled ? (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => setAutomaticDiscordEnabled(false)}
                >
                  <CirclePause className="h-4 w-4" />
                  Stop automatic delivery
                </Button>
              ) : (
                <Button
                  type="button"
                  size="sm"
                  disabled={
                    discordStatus.data?.state !== "READY" ||
                    persistentBackendAutomationEnabled
                  }
                  onClick={() => setAutomaticDiscordEnabled(true)}
                >
                  <CirclePlay className="h-4 w-4" />
                  Start automatic delivery
                </Button>
              )}
            </div>
          </div>

          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-4">
            <MetricCard
              label="Automatic Delivery"
              value={automaticDiscordEnabled ? "Running" : "Stopped"}
              tone={automaticDiscordEnabled ? "bull" : "default"}
              sublabel="Explicit foreground browser session"
            />
            <MetricCard
              label="Evaluation Cadence"
              value={formatAlertMonitorDuration(automaticDiscordCadence)}
              sublabel="No background-tab polling"
            />
            <MetricCard
              label="Latest Outcome"
              value={automaticDiscordResult?.automaticDeliveryState ?? "—"}
              sublabel={
                automaticDiscordResult
                  ? formatAlertMonitorTimestamp(
                      automaticDiscordResult.evaluatedAt,
                    )
                  : "No automatic evaluation yet"
              }
            />
            <MetricCard
              label="Retry Policy"
              value="2 attempts"
              sublabel="3 sec fixed backoff"
            />
          </div>

          {persistentBackendAutomationEnabled ? (
            <div className="flex items-start gap-2 rounded-md border border-accent/30 bg-accent/10 p-3 text-xs text-accent">
              <Info className="mt-0.5 h-4 w-4 shrink-0" />
              Persistent backend automation is enabled in Settings. Foreground
              automatic Discord delivery is disabled here to prevent competing
              schedulers and duplicate messages.
            </div>
          ) : null}

          {discordStatus.data?.state !== "READY" ? (
            <div className="flex items-start gap-2 rounded-md border border-dashed border-panel-border p-3 text-xs text-muted-foreground">
              <Info className="mt-0.5 h-4 w-4 shrink-0" />
              Configure and test the backend Discord webhook in Settings before
              starting automatic delivery.
            </div>
          ) : automaticDiscordDelivery.isError ? (
            <div className="flex items-start gap-2 rounded-md border border-bear/30 bg-bear/5 p-3 text-xs text-bear">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
              The automatic delivery endpoint failed before returning a
              validated result. The next foreground evaluation will occur at the
              selected cadence while this session remains enabled.
            </div>
          ) : automaticDiscordResult ? (
            <AutomaticDiscordDeliveryNotice result={automaticDiscordResult} />
          ) : automaticDiscordEnabled && automaticDiscordDelivery.isLoading ? (
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <RefreshCw className="h-4 w-4 animate-spin" />
              Running the first automatic Discord evaluation…
            </div>
          ) : (
            <div className="flex items-start gap-2 rounded-md border border-dashed border-panel-border p-3 text-xs text-muted-foreground">
              <Info className="mt-0.5 h-4 w-4 shrink-0" />
              Automatic Discord delivery is off. Starting it does not persist
              across refreshes and stops when this page session ends.
            </div>
          )}
        </div>
      </Panel>

      <Panel
        title="Scheduled Report Delivery"
        className="min-w-0 lg:col-span-3"
        action={<Badge variant="default">Explicit only</Badge>}
      >
        <div className="space-y-4">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
            <div className="max-w-3xl space-y-1">
              <p className="text-sm leading-relaxed text-foreground">
                Generate the current deterministic report snapshot and send it
                to Discord only when you explicitly request it.
              </p>
              <p className="text-xs leading-relaxed text-muted-foreground">
                The selected time is a report-type reference, not a scheduler.
                This action uses only the current Assembly snapshot, stores
                nothing, generates no LLM narrative, and creates no order.
              </p>
            </div>

            <div className="flex flex-wrap items-end gap-2">
              <label className="space-y-1 text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
                Report type
                <select
                  aria-label="Scheduled report type"
                  value={scheduledReportType}
                  disabled={scheduledReportDelivery.isPending}
                  onChange={(event) =>
                    setScheduledReportType(
                      event.target.value as DeterministicScheduledReportType,
                    )
                  }
                  className="block h-9 rounded-md border border-panel-border bg-background px-3 font-mono text-xs text-foreground disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {SCHEDULED_REPORT_OPTIONS.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </label>

              <Button
                type="button"
                size="sm"
                disabled={
                  discordStatus.data?.state !== "READY" ||
                  scheduledReportDelivery.isPending
                }
                onClick={requestScheduledReportDelivery}
              >
                <FileText
                  className={cn(
                    "h-4 w-4",
                    scheduledReportDelivery.isPending && "animate-pulse",
                  )}
                />
                {scheduledReportDelivery.isPending
                  ? "Generating & sending…"
                  : "Generate & send report"}
              </Button>
            </div>
          </div>

          {discordStatus.data?.state !== "READY" ? (
            <div className="flex items-start gap-2 rounded-md border border-dashed border-panel-border p-3 text-xs text-muted-foreground">
              <Info className="mt-0.5 h-4 w-4 shrink-0" />
              Configure and test the backend Discord webhook in Settings before
              sending a deterministic scheduled report.
            </div>
          ) : scheduledReportDelivery.isError ? (
            <div className="flex items-start gap-2 rounded-md border border-bear/30 bg-bear/5 p-3 text-xs text-bear">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
              The scheduled-report delivery request failed before a validated
              result was returned. No automatic retry was attempted.
            </div>
          ) : scheduledReportDelivery.data ? (
            <ScheduledReportDeliveryNotice
              result={scheduledReportDelivery.data}
            />
          ) : (
            <div className="flex items-start gap-2 rounded-md border border-dashed border-panel-border p-3 text-xs text-muted-foreground">
              <Info className="mt-0.5 h-4 w-4 shrink-0" />
              No scheduled report has been generated or delivered in this
              browser session.
            </div>
          )}
        </div>
      </Panel>

      <Panel
        title="Automatic Scheduled Report Delivery"
        className="min-w-0 lg:col-span-3"
        action={
          <Badge variant={automaticScheduledReportsEnabled ? "bull" : "default"}>
            {automaticScheduledReportsEnabled ? "Running" : "Stopped"}
          </Badge>
        }
      >
        <div className="space-y-4">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
            <div className="max-w-3xl space-y-1">
              <p className="text-sm leading-relaxed text-foreground">
                Deliver each due deterministic report once while this Alerts
                page remains open.
              </p>
              <p className="text-xs leading-relaxed text-muted-foreground">
                This is an explicit opt-in foreground browser session, not a
                permanent scheduler. The backend applies the NYSE holiday
                calendar, fixed five-minute report windows, and process-memory
                duplicate suppression. Confirmed delivery is committed once per
                Eastern date and report type. Timeout or network ambiguity is
                suppressed for the remainder of the backend process session to
                avoid duplicate Discord messages.
              </p>
            </div>

            <div className="flex flex-wrap items-end gap-2">
              <label className="space-y-1 text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
                Cadence
                <select
                  aria-label="Automatic scheduled report cadence"
                  value={automaticScheduledReportCadence}
                  disabled={automaticScheduledReportsEnabled}
                  onChange={(event) =>
                    setAutomaticScheduledReportCadence(
                      Number(
                        event.target.value,
                      ) as DiscordAutomaticScheduledReportCadenceMilliseconds,
                    )
                  }
                  className="block h-9 rounded-md border border-panel-border bg-background px-3 font-mono text-xs text-foreground disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {DISCORD_AUTOMATIC_SCHEDULED_REPORT_CADENCE_OPTIONS.map(
                    (cadence) => (
                      <option key={cadence} value={cadence}>
                        {formatAlertMonitorDuration(cadence)}
                      </option>
                    ),
                  )}
                </select>
              </label>

              {automaticScheduledReportsEnabled ? (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => setAutomaticScheduledReportsEnabled(false)}
                >
                  <CirclePause className="h-4 w-4" />
                  Stop scheduled reports
                </Button>
              ) : (
                <Button
                  type="button"
                  size="sm"
                  disabled={
                    discordStatus.data?.state !== "READY" ||
                    persistentBackendAutomationEnabled
                  }
                  onClick={() => setAutomaticScheduledReportsEnabled(true)}
                >
                  <CirclePlay className="h-4 w-4" />
                  Start scheduled reports
                </Button>
              )}
            </div>
          </div>

          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-4">
            <MetricCard
              label="Scheduled Reports"
              value={automaticScheduledReportsEnabled ? "Running" : "Stopped"}
              tone={automaticScheduledReportsEnabled ? "bull" : "default"}
              sublabel="Foreground page session only"
            />
            <MetricCard
              label="Evaluation Cadence"
              value={formatAlertMonitorDuration(automaticScheduledReportCadence)}
              sublabel="No background-tab polling"
            />
            <MetricCard
              label="Latest Outcome"
              value={
                automaticScheduledReportResult?.automaticDeliveryState ?? "—"
              }
              sublabel={
                automaticScheduledReportResult
                  ? formatAlertMonitorTimestamp(
                      automaticScheduledReportResult.evaluatedAt,
                    )
                  : "No schedule evaluation yet"
              }
            />
            <MetricCard
              label="Due / Next Report"
              value={
                automaticScheduledReportResult?.scheduleEvaluation
                  ?.dueReportType ??
                automaticScheduledReportResult?.scheduleEvaluation
                  ?.nextReportType ??
                "—"
              }
              sublabel={
                automaticScheduledReportResult?.scheduleEvaluation
                  ?.scheduleState ?? "Schedule not evaluated"
              }
            />
          </div>

          {persistentBackendAutomationEnabled ? (
            <div className="flex items-start gap-2 rounded-md border border-accent/30 bg-accent/10 p-3 text-xs text-accent">
              <Info className="mt-0.5 h-4 w-4 shrink-0" />
              Persistent backend automation is enabled in Settings. Foreground
              scheduled-report delivery is disabled here to preserve one
              restart-safe scheduler and one database-backed delivery key.
            </div>
          ) : null}

          {discordStatus.data?.state !== "READY" ? (
            <div className="flex items-start gap-2 rounded-md border border-dashed border-panel-border p-3 text-xs text-muted-foreground">
              <Info className="mt-0.5 h-4 w-4 shrink-0" />
              Configure and test the backend Discord webhook in Settings before
              starting scheduled report delivery.
            </div>
          ) : automaticScheduledReportDelivery.isError ? (
            <div className="flex items-start gap-2 rounded-md border border-bear/30 bg-bear/5 p-3 text-xs text-bear">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
              The automatic scheduled-report endpoint failed before returning a
              validated result. The next foreground evaluation will occur at the
              selected cadence while this page session remains enabled.
            </div>
          ) : automaticScheduledReportResult ? (
            <AutomaticScheduledReportDeliveryNotice
              result={automaticScheduledReportResult}
            />
          ) : automaticScheduledReportsEnabled &&
            automaticScheduledReportDelivery.isLoading ? (
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <RefreshCw className="h-4 w-4 animate-spin" />
              Evaluating the deterministic scheduled-report window…
            </div>
          ) : (
            <div className="flex items-start gap-2 rounded-md border border-dashed border-panel-border p-3 text-xs text-muted-foreground">
              <Info className="mt-0.5 h-4 w-4 shrink-0" />
              Automatic scheduled reports are off. Starting them does not
              persist across refreshes and stops when this page session ends.
            </div>
          )}
        </div>
      </Panel>

      <Panel
        title={`Session Alert Events (${sessionEvents.length})`}
        className="min-w-0 lg:col-span-3"
        action={
          <Button
            type="button"
            variant="ghost"
            size="sm"
            disabled={sessionEvents.length === 0}
            onClick={() => setSessionEvents([])}
          >
            <Trash2 className="h-4 w-4" />
            Clear session
          </Button>
        }
        isEmpty={sessionEvents.length === 0}
        emptyMessage="No alert transitions have been emitted in this browser session."
      >
        <div className="space-y-2">
          {sessionEvents.map((entry) => (
            <SessionEventCard
              key={entry.event.transitionFingerprint}
              entry={entry}
            />
          ))}
        </div>
      </Panel>

      <Panel
        title={`Discord Delivery Attempts (${discordDeliveryAttempts.length})`}
        className="min-w-0 lg:col-span-3"
        action={
          <Button
            type="button"
            variant="ghost"
            size="sm"
            disabled={discordDeliveryAttempts.length === 0}
            onClick={() => setDiscordDeliveryAttempts([])}
          >
            <Trash2 className="h-4 w-4" />
            Clear delivery history
          </Button>
        }
        isEmpty={discordDeliveryAttempts.length === 0}
        emptyMessage="No explicit Discord delivery attempts have been made in this browser session."
      >
        <div className="space-y-2">
          {discordDeliveryAttempts.map((attempt, index) => (
            <DiscordDeliveryAttemptCard
              key={`${attempt.attemptedAt}-${index}`}
              result={attempt}
            />
          ))}
        </div>
      </Panel>
    </div>
  );
}

const DISCORD_DELIVERY_COPY: Record<
  DiscordTradePlanAlertDeliveryPrimaryReasonCode,
  string
> = {
  ALERT_DELIVERED:
    "Discord confirmed delivery of the emitted Trade Plan alert transition.",
  WEBHOOK_NOT_CONFIGURED: "No Discord webhook is configured on the backend.",
  WEBHOOK_CONFIG_INVALID: "The configured Discord webhook is invalid.",
  NO_EMITTED_TRANSITION:
    "No new Trade Plan alert transition was eligible for Discord delivery.",
  TRANSITION_UNAVAILABLE:
    "The Trade Plan alert transition was unavailable. You may retry explicitly.",
  WEBHOOK_REQUEST_TIMEOUT:
    "The Discord request timed out. The emitted transition was not committed and may be retried.",
  WEBHOOK_NETWORK_FAILURE:
    "The backend could not reach Discord. The emitted transition was not committed and may be retried.",
  WEBHOOK_RATE_LIMITED:
    "Discord rate-limited the request. The emitted transition was not committed and may be retried later.",
  WEBHOOK_REJECTED:
    "Discord rejected the webhook request. Verify the webhook configuration before retrying.",
  WEBHOOK_PROVIDER_FAILURE:
    "Discord returned an unexpected error. The emitted transition was not committed and may be retried.",
};

function ScheduledReportDeliveryNotice({
  result,
}: {
  result: DiscordScheduledReportDeliveryResponse;
}) {
  const delivered = result.deliveryState === "DELIVERED";
  const messageByReason: Record<
    DiscordScheduledReportDeliveryResponse["primaryReasonCode"],
    string
  > = {
    REPORT_DELIVERED:
      "Discord confirmed delivery of the deterministic scheduled report.",
    WEBHOOK_NOT_CONFIGURED: "No Discord webhook is configured on the backend.",
    WEBHOOK_CONFIG_INVALID: "The configured Discord webhook is invalid.",
    REPORT_UNAVAILABLE:
      "The deterministic report source is currently unavailable, so nothing was sent.",
    REPORT_GENERATION_FAILURE:
      "The deterministic report could not be generated.",
    WEBHOOK_REQUEST_TIMEOUT:
      "The Discord report request timed out. No automatic retry was attempted.",
    WEBHOOK_NETWORK_FAILURE:
      "The backend could not reach Discord. No automatic retry was attempted.",
    WEBHOOK_RATE_LIMITED: "Discord rate-limited the report request.",
    WEBHOOK_REJECTED: "Discord rejected the scheduled-report webhook request.",
    WEBHOOK_PROVIDER_FAILURE:
      "Discord returned an unexpected scheduled-report delivery error.",
  };

  return (
    <div
      role="status"
      className={cn(
        "rounded-md border p-3 text-xs",
        delivered
          ? "border-bull/30 bg-bull/5 text-bull"
          : "border-panel-border bg-background/40 text-muted-foreground",
      )}
    >
      <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex min-w-0 items-start gap-2">
          {delivered ? (
            <BellRing className="mt-0.5 h-4 w-4 shrink-0" />
          ) : (
            <Info className="mt-0.5 h-4 w-4 shrink-0" />
          )}
          <div className="min-w-0 space-y-1">
            <p>{messageByReason[result.primaryReasonCode]}</p>
            <p className="font-mono text-[11px] opacity-80">
              {result.report?.title ?? result.reportType} ·{" "}
              {formatAlertMonitorTimestamp(result.attemptedAt)}
            </p>
            {result.report ? (
              <p className="text-[11px] opacity-80">{result.report.headline}</p>
            ) : null}
          </div>
        </div>
        <div className="flex shrink-0 flex-wrap gap-2">
          <Badge variant={delivered ? "bull" : "default"}>
            {result.deliveryState.replaceAll("_", " ")}
          </Badge>
          {result.providerStatusCode !== null ? (
            <Badge variant="default">HTTP {result.providerStatusCode}</Badge>
          ) : null}
        </div>
      </div>
    </div>
  );
}

const AUTOMATIC_SCHEDULED_REPORT_COPY: Record<
  DiscordAutomaticScheduledReportDeliveryResponse["primaryReasonCode"],
  string
> = {
  REPORT_DELIVERED:
    "Discord confirmed delivery of the due deterministic scheduled report.",
  NO_REPORT_DUE:
    "No deterministic report window is currently due, so nothing was sent.",
  DUPLICATE_REPORT_SUPPRESSED:
    "This report was already delivered for the current Eastern date and was suppressed.",
  AMBIGUOUS_PROVIDER_OUTCOME_SUPPRESSED:
    "A prior provider outcome was ambiguous, so automatic delivery is suppressed to avoid a duplicate message.",
  SCHEDULE_UNAVAILABLE:
    "The deterministic schedule evaluation is unavailable, so nothing was sent.",
  WEBHOOK_NOT_CONFIGURED: "No Discord webhook is configured on the backend.",
  WEBHOOK_CONFIG_INVALID: "The configured Discord webhook is invalid.",
  REPORT_UNAVAILABLE:
    "The deterministic report source is currently unavailable, so nothing was sent.",
  REPORT_GENERATION_FAILURE:
    "The deterministic report could not be generated for this evaluation.",
  WEBHOOK_REQUEST_TIMEOUT:
    "The Discord request timed out. Automatic delivery is blocked for this report key to avoid a duplicate.",
  WEBHOOK_NETWORK_FAILURE:
    "The Discord network outcome was ambiguous. Automatic delivery is blocked for this report key.",
  WEBHOOK_RATE_LIMITED:
    "Discord rate-limited the report request. A later foreground evaluation may retry.",
  WEBHOOK_REJECTED:
    "Discord rejected the report request. Verify the webhook configuration.",
  WEBHOOK_PROVIDER_FAILURE:
    "Discord returned an unexpected confirmed failure. A later foreground evaluation may retry.",
};

function AutomaticScheduledReportDeliveryNotice({
  result,
}: {
  result: DiscordAutomaticScheduledReportDeliveryResponse;
}) {
  const delivered = result.automaticDeliveryState === "DELIVERED";
  const failed = result.automaticDeliveryState === "FAILED";
  const unavailable = result.automaticDeliveryState === "UNAVAILABLE";

  return (
    <div
      role="status"
      className={cn(
        "rounded-md border p-3 text-xs",
        delivered
          ? "border-bull/30 bg-bull/5 text-bull"
          : failed || unavailable
            ? "border-bear/30 bg-bear/5 text-bear"
            : "border-panel-border bg-background/40 text-muted-foreground",
      )}
    >
      <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex min-w-0 items-start gap-2">
          {delivered ? (
            <BellRing className="mt-0.5 h-4 w-4 shrink-0" />
          ) : failed || unavailable ? (
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
          ) : (
            <Info className="mt-0.5 h-4 w-4 shrink-0" />
          )}
          <div className="min-w-0 space-y-1">
            <p>{AUTOMATIC_SCHEDULED_REPORT_COPY[result.primaryReasonCode]}</p>
            <p className="font-mono text-[11px] opacity-80">
              {result.scheduleEvaluation
                ? `${result.scheduleEvaluation.easternDate} ${result.scheduleEvaluation.easternTime} ET`
                : "Schedule unavailable"}
            </p>
          </div>
        </div>
        <div className="flex shrink-0 flex-wrap gap-2">
          <Badge variant={delivered ? "bull" : failed || unavailable ? "bear" : "default"}>
            {result.automaticDeliveryState.replaceAll("_", " ")}
          </Badge>
          {result.delivery?.providerStatusCode !== null &&
          result.delivery?.providerStatusCode !== undefined ? (
            <Badge variant="default">
              HTTP {result.delivery.providerStatusCode}
            </Badge>
          ) : null}
        </div>
      </div>
    </div>
  );
}

function AutomaticDiscordDeliveryNotice({
  result,
}: {
  result: DiscordAutomaticTradePlanAlertDeliveryResponse;
}) {
  const delivered = result.automaticDeliveryState === "DELIVERED";
  const failed = result.automaticDeliveryState === "FAILED";

  return (
    <div
      role="status"
      className={cn(
        "rounded-md border p-3 text-xs",
        delivered
          ? "border-bull/30 bg-bull/5 text-bull"
          : failed
            ? "border-bear/30 bg-bear/5 text-bear"
            : "border-panel-border bg-background/40 text-muted-foreground",
      )}
    >
      <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex min-w-0 items-start gap-2">
          {delivered ? (
            <BellRing className="mt-0.5 h-4 w-4 shrink-0" />
          ) : failed ? (
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
          ) : (
            <Info className="mt-0.5 h-4 w-4 shrink-0" />
          )}
          <div className="min-w-0 space-y-1">
            <p>{DISCORD_DELIVERY_COPY[result.primaryReasonCode]}</p>
            <p className="font-mono text-[11px] opacity-80">
              Automatic foreground evaluation ·{" "}
              {formatAlertMonitorTimestamp(result.evaluatedAt)}
            </p>
          </div>
        </div>
        <div className="flex shrink-0 flex-wrap gap-2">
          <Badge variant={delivered ? "bull" : failed ? "bear" : "default"}>
            {result.automaticDeliveryState.replaceAll("_", " ")}
          </Badge>
          <Badge variant="default">
            {result.attemptCount}/{result.maximumAttempts} attempts
          </Badge>
        </div>
      </div>
    </div>
  );
}

function DiscordDeliveryNotice({
  result,
  retrying,
  onRetry,
}: {
  result: DiscordTradePlanAlertDeliveryResponse;
  retrying: boolean;
  onRetry: () => void;
}) {
  const delivered = result.deliveryState === "DELIVERED";

  return (
    <div
      role="status"
      className={cn(
        "flex items-start gap-2 rounded-md border p-3 text-xs",
        delivered
          ? "border-bull/30 bg-bull/5 text-bull"
          : result.state.retryEligible
            ? "border-wait/30 bg-wait/5 text-wait"
            : "border-panel-border bg-background/40 text-muted-foreground",
      )}
    >
      {delivered ? (
        <BellRing className="mt-0.5 h-4 w-4 shrink-0" />
      ) : (
        <Info className="mt-0.5 h-4 w-4 shrink-0" />
      )}
      <div className="min-w-0 flex-1 space-y-1">
        <p>{DISCORD_DELIVERY_COPY[result.primaryReasonCode]}</p>
        <p className="font-mono text-[11px] opacity-80">
          Explicit delivery only ·{" "}
          {formatAlertMonitorTimestamp(result.attemptedAt)}
        </p>
      </div>
      {result.state.retryEligible ? (
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={retrying}
          onClick={onRetry}
        >
          <RefreshCw className={cn("h-4 w-4", retrying && "animate-spin")} />
          {retrying ? "Retrying…" : "Retry delivery"}
        </Button>
      ) : null}
    </div>
  );
}

function DiscordDeliveryAttemptCard({
  result,
}: {
  result: DiscordTradePlanAlertDeliveryResponse;
}) {
  const delivered = result.deliveryState === "DELIVERED";
  const statusCode =
    result.providerStatusCode === null
      ? "Not requested"
      : String(result.providerStatusCode);

  return (
    <div className="rounded-md border border-panel-border bg-background/40 p-3">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0 space-y-1">
          <p className="text-sm font-medium text-foreground">
            {DISCORD_DELIVERY_COPY[result.primaryReasonCode]}
          </p>
          <p className="font-mono text-[11px] text-muted-foreground">
            {formatAlertMonitorTimestamp(result.attemptedAt)}
          </p>
        </div>
        <div className="flex shrink-0 flex-wrap gap-2">
          <Badge
            variant={
              delivered
                ? "bull"
                : result.state.retryEligible
                  ? "wait"
                  : "default"
            }
          >
            {result.deliveryState.replaceAll("_", " ")}
          </Badge>
          {result.state.retryEligible ? (
            <Badge variant="wait">Retry eligible</Badge>
          ) : null}
        </div>
      </div>

      <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-4">
        <CompactValue
          label="Reason"
          value={result.primaryReasonCode.replaceAll("_", " ")}
        />
        <CompactValue label="Provider Status" value={statusCode} />
        <CompactValue
          label="Transition State"
          value={result.transition?.transitionState ?? "Not evaluated"}
        />
        <CompactValue
          label="State Commit"
          value={
            result.state.transitionStateCommitted
              ? "Committed"
              : "Not committed"
          }
        />
      </div>
    </div>
  );
}

function CurrentEvaluation({
  result,
}: {
  result: SpyZeroDteTradePlanAlertTransitionResponse;
}) {
  const view = getAlertMonitorStateView(result.transitionState);

  return (
    <div className="rounded-md border border-panel-border bg-background/40 p-3">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
        <div className="space-y-1">
          <p className="font-mono text-sm font-semibold text-foreground">
            {view.title}
          </p>
          <p className="text-xs leading-relaxed text-muted-foreground">
            {view.description}
          </p>
          <p className="text-xs leading-relaxed text-muted-foreground">
            {getAlertMonitorReasonDescription(result.primaryReasonCode)}
          </p>
        </div>
        <Badge variant={badgeVariant(view.tone)}>
          {result.transitionState}
        </Badge>
      </div>

      <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-4">
        <CompactValue
          label="Source Candidate"
          value={result.sourceCandidate?.alertState ?? "Unavailable"}
        />
        <CompactValue
          label="Process State Mutation"
          value={result.state.mutationApplied ? "Applied" : "None"}
        />
        <CompactValue
          label="Cooldown Remaining"
          value={formatAlertMonitorDuration(
            result.cooldown.remainingMilliseconds,
          )}
        />
        <CompactValue label="Storage" value="Process memory only" />
      </div>
    </div>
  );
}

function SessionEventCard({ entry }: { entry: SessionAlertEvent }) {
  const severity = getAlertSeverityView(entry.event.severity);

  return (
    <div className="rounded-md border border-panel-border bg-background/40 p-3">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex min-w-0 items-start gap-3">
          <BellRing
            className={cn(
              "mt-0.5 h-4 w-4 shrink-0",
              severity.tone === "bull" && "text-bull",
              severity.tone === "wait" && "text-wait",
              severity.tone === "accent" && "text-accent",
              severity.tone === "bear" && "text-bear",
            )}
          />
          <div className="min-w-0 space-y-1">
            <p className="text-sm font-medium text-foreground">
              {entry.event.title}
            </p>
            <p className="text-xs leading-relaxed text-muted-foreground">
              {entry.event.message}
            </p>
            <p className="font-mono text-[11px] text-muted-foreground">
              {formatAlertMonitorTimestamp(entry.evaluatedAt)} ·{" "}
              {entry.currentMarketDate}
            </p>
          </div>
        </div>

        <div className="flex shrink-0 flex-wrap gap-2">
          <Badge variant={badgeVariant(severity.tone)}>{severity.label}</Badge>
          <Badge variant="default">
            {getAlertTransitionTypeLabel(entry.event.transitionType)}
          </Badge>
        </div>
      </div>

      <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-2">
        <CompactValue
          label="Previous Candidate"
          value={
            entry.event.previousCandidate?.category.replaceAll("_", " ") ??
            "None"
          }
        />
        <CompactValue
          label="Current Candidate"
          value={
            entry.event.currentCandidate?.category.replaceAll("_", " ") ??
            "None"
          }
        />
      </div>
    </div>
  );
}

function CompactValue({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md border border-panel-border bg-background/30 px-3 py-2">
      <p className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
        {label}
      </p>
      <p className="mt-1 break-words font-mono text-xs text-foreground">
        {value}
      </p>
    </div>
  );
}
