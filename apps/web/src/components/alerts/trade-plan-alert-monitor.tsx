"use client";

import { useEffect, useState } from "react";
import type {
  SpyZeroDteTradePlanAlertTransitionResponse,
  DiscordTradePlanAlertDeliveryPrimaryReasonCode,
  DiscordTradePlanAlertDeliveryResponse,
  TradePlanAlertTransitionEvent,
} from "@spy-copilot/shared";
import {
  AlertTriangle,
  BellRing,
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
import {
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
  const [sessionEvents, setSessionEvents] = useState<SessionAlertEvent[]>([]);
  const [discordDeliveryAttempts, setDiscordDeliveryAttempts] = useState<
    DiscordTradePlanAlertDeliveryResponse[]
  >([]);
  const query = useSpyTradePlanAlertTransition(monitoring);
  const discordStatus = useDiscordWebhookStatus();
  const discordDelivery = useDiscordTradePlanAlertDelivery();
  const result = query.data ?? null;

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
                persisted. Discord delivery occurs only when you explicitly
                select Evaluate & send to Discord, using a separate backend
                process-memory delivery state.
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
