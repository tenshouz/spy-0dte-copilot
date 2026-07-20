"use client";

import type {
  BackendAutomationCadenceSeconds,
  BackendAutomationSettingsUpdateRequest,
} from "@spy-copilot/shared";
import { useEffect, useState } from "react";
import { Panel } from "@/components/panels/panel";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  BACKEND_AUTOMATION_CADENCE_OPTIONS,
  useBackendAutomationHistory,
  useBackendAutomationSettings,
  useBackendAutomationStatus,
  useRunBackendAutomationOnce,
  useUpdateBackendAutomationSettings,
} from "@/hooks/use-backend-automation";
import {
  backendAutomationDeliveryTone,
  backendAutomationReasonCopy,
  backendAutomationRuntimeLabel,
  backendAutomationRuntimeTone,
  formatBackendAutomationTime,
} from "@/lib/backend-automation-view";

const DEFAULT_DRAFT: BackendAutomationSettingsUpdateRequest = {
  enabled: false,
  tradePlanAlertsEnabled: true,
  scheduledReportsEnabled: true,
  cadenceSeconds: 30,
};

export function BackendAutomationPanel() {
  const settingsQuery = useBackendAutomationSettings();
  const statusQuery = useBackendAutomationStatus();
  const historyQuery = useBackendAutomationHistory();
  const updateSettings = useUpdateBackendAutomationSettings();
  const runOnce = useRunBackendAutomationOnce();
  const [draft, setDraft] = useState<BackendAutomationSettingsUpdateRequest>(
    DEFAULT_DRAFT,
  );

  useEffect(() => {
    const settings = settingsQuery.data?.settings;
    if (!settings) return;
    setDraft({
      enabled: settings.enabled,
      tradePlanAlertsEnabled: settings.tradePlanAlertsEnabled,
      scheduledReportsEnabled: settings.scheduledReportsEnabled,
      cadenceSeconds: settings.cadenceSeconds,
    });
  }, [settingsQuery.data]);

  const invalidEnabledState =
    draft.enabled &&
    !draft.tradePlanAlertsEnabled &&
    !draft.scheduledReportsEnabled;
  const settingsUnavailable =
    settingsQuery.data?.engineState === "UNAVAILABLE" ||
    settingsQuery.isError;

  return (
    <div className="space-y-3">
      <Panel
        title="Persistent Backend Automation"
        isLoading={settingsQuery.isLoading || statusQuery.isLoading}
        isError={settingsQuery.isError || statusQuery.isError}
        action={
          statusQuery.data ? (
            <Badge
              variant={backendAutomationRuntimeTone(
                statusQuery.data.runtimeState,
              )}
            >
              {backendAutomationRuntimeLabel(statusQuery.data.runtimeState)}
            </Badge>
          ) : null
        }
      >
        <div className="space-y-4">
          <div>
            <p className="text-sm font-semibold text-foreground">
              Run Discord alert and scheduled-report evaluation in the backend,
              independent of an open browser tab.
            </p>
            <p className="mt-1 text-xs text-muted-foreground">
              Settings, duplicate keys, ambiguous outcomes, scheduler lease, and
              delivery audit history are persisted in PostgreSQL. Enabling this
              resumes automation after backend restarts.
            </p>
          </div>

          <label className="flex items-start gap-3 rounded-md border border-panel-border p-3">
            <input
              type="checkbox"
              checked={draft.enabled}
              disabled={settingsUnavailable || updateSettings.isPending}
              onChange={(event) =>
                setDraft((current) => ({
                  ...current,
                  enabled: event.target.checked,
                }))
              }
              className="mt-0.5 h-4 w-4 accent-accent"
            />
            <span>
              <span className="block text-sm font-semibold">
                Enable persistent backend automation
              </span>
              <span className="block text-xs text-muted-foreground">
                The backend scheduler runs while the backend process is online;
                the Alerts page no longer needs to remain open.
              </span>
            </span>
          </label>

          <div className="grid gap-3 md:grid-cols-3">
            <label className="rounded-md border border-panel-border p-3">
              <span className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                <input
                  type="checkbox"
                  checked={draft.tradePlanAlertsEnabled}
                  disabled={settingsUnavailable || updateSettings.isPending}
                  onChange={(event) =>
                    setDraft((current) => ({
                      ...current,
                      tradePlanAlertsEnabled: event.target.checked,
                    }))
                  }
                  className="h-4 w-4 accent-accent"
                />
                Trade Plan alerts
              </span>
              <span className="mt-2 block text-xs text-muted-foreground">
                Persistent transition state and restart-safe duplicate
                suppression.
              </span>
            </label>

            <label className="rounded-md border border-panel-border p-3">
              <span className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                <input
                  type="checkbox"
                  checked={draft.scheduledReportsEnabled}
                  disabled={settingsUnavailable || updateSettings.isPending}
                  onChange={(event) =>
                    setDraft((current) => ({
                      ...current,
                      scheduledReportsEnabled: event.target.checked,
                    }))
                  }
                  className="h-4 w-4 accent-accent"
                />
                Scheduled reports
              </span>
              <span className="mt-2 block text-xs text-muted-foreground">
                NYSE-calendar-aware delivery during the four fixed report
                windows.
              </span>
            </label>

            <label className="rounded-md border border-panel-border p-3">
              <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                Evaluation cadence
              </span>
              <select
                aria-label="Persistent backend automation cadence"
                value={draft.cadenceSeconds}
                disabled={settingsUnavailable || updateSettings.isPending}
                onChange={(event) =>
                  setDraft((current) => ({
                    ...current,
                    cadenceSeconds: Number(
                      event.target.value,
                    ) as BackendAutomationCadenceSeconds,
                  }))
                }
                className="mt-2 h-9 w-full rounded-md border border-input bg-background px-3 text-xs"
              >
                {BACKEND_AUTOMATION_CADENCE_OPTIONS.map((seconds) => (
                  <option key={seconds} value={seconds}>
                    {seconds} seconds
                  </option>
                ))}
              </select>
            </label>
          </div>

          {invalidEnabledState ? (
            <div className="rounded-md border border-bear/30 bg-bear-muted px-3 py-2 text-xs text-bear">
              Enable at least one delivery category before turning on backend
              automation.
            </div>
          ) : null}

          <div className="flex flex-wrap gap-2">
            <Button
              disabled={
                settingsUnavailable ||
                invalidEnabledState ||
                updateSettings.isPending
              }
              onClick={() => updateSettings.mutate(draft)}
            >
              {updateSettings.isPending ? "Saving…" : "Save automation settings"}
            </Button>
            <Button
              variant="outline"
              disabled={
                !settingsQuery.data?.settings?.enabled || runOnce.isPending
              }
              onClick={() => runOnce.mutate()}
            >
              {runOnce.isPending ? "Evaluating…" : "Evaluate now"}
            </Button>
          </div>

          {updateSettings.data ? (
            <div className="rounded-md border border-bull/30 bg-bull-muted px-3 py-2 text-xs text-bull">
              Persistent backend automation settings were saved.
            </div>
          ) : null}
          {updateSettings.isError || runOnce.isError ? (
            <div className="rounded-md border border-bear/30 bg-bear-muted px-3 py-2 text-xs text-bear">
              The backend automation request failed. Check the backend terminal.
            </div>
          ) : null}
          {runOnce.data ? (
            <div className="rounded-md border border-accent/30 bg-accent/10 px-3 py-2 text-xs text-accent">
              Manual evaluation: {runOnce.data.primaryReasonCode.replaceAll("_", " ").toLowerCase()}.
            </div>
          ) : null}

          {statusQuery.data ? (
            <>
              <div className="grid gap-3 md:grid-cols-4">
                <StatusCard
                  label="Runtime"
                  value={backendAutomationRuntimeLabel(
                    statusQuery.data.runtimeState,
                  )}
                  detail={backendAutomationReasonCopy(
                    statusQuery.data.primaryReasonCode,
                  )}
                />
                <StatusCard
                  label="Last heartbeat"
                  value={formatBackendAutomationTime(
                    statusQuery.data.scheduler.lastHeartbeatAt,
                  )}
                  detail={
                    statusQuery.data.scheduler.databaseLeaseHeld
                      ? "This backend holds the database lease"
                      : "Lease not held by this backend"
                  }
                />
                <StatusCard
                  label="Trade Plan alerts"
                  value={statusQuery.data.tradePlanAlerts.outcome ?? "—"}
                  detail={backendAutomationReasonCopy(
                    statusQuery.data.tradePlanAlerts.reasonCode,
                  )}
                />
                <StatusCard
                  label="Scheduled reports"
                  value={statusQuery.data.scheduledReports.outcome ?? "—"}
                  detail={backendAutomationReasonCopy(
                    statusQuery.data.scheduledReports.reasonCode,
                  )}
                />
              </div>
              {statusQuery.data.lastErrorCode ? (
                <div className="rounded-md border border-wait/30 bg-wait-muted px-3 py-2 text-xs text-wait">
                  Latest sanitized scheduler error: {statusQuery.data.lastErrorCode}
                </div>
              ) : null}
            </>
          ) : null}
        </div>
      </Panel>

      <Panel
        title="Persistent Delivery Audit"
        isLoading={historyQuery.isLoading}
        isError={historyQuery.isError}
        isEmpty={historyQuery.data?.entries.length === 0}
        emptyMessage="No backend-scheduler provider attempts have been recorded yet."
        noPadding
      >
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Attempted</TableHead>
              <TableHead>Category</TableHead>
              <TableHead>State</TableHead>
              <TableHead>Reason</TableHead>
              <TableHead>Provider</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {historyQuery.data?.entries.map((entry) => (
              <TableRow key={entry.id}>
                <TableCell>{formatBackendAutomationTime(entry.attemptedAt)}</TableCell>
                <TableCell>
                  {entry.category === "TRADE_PLAN_ALERT"
                    ? "Trade Plan alert"
                    : entry.reportType?.replaceAll("_", " ") ?? "Scheduled report"}
                </TableCell>
                <TableCell>
                  <Badge variant={backendAutomationDeliveryTone(entry.deliveryState)}>
                    {entry.deliveryState}
                  </Badge>
                </TableCell>
                <TableCell className="max-w-[260px] whitespace-normal">
                  {backendAutomationReasonCopy(entry.reasonCode)}
                </TableCell>
                <TableCell>
                  {entry.providerStatusCode
                    ? `HTTP ${entry.providerStatusCode}`
                    : entry.providerRequestAttempted
                      ? "No confirmed status"
                      : "Not attempted"}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </Panel>
    </div>
  );
}

function StatusCard({
  label,
  value,
  detail,
}: {
  label: string;
  value: string;
  detail: string;
}) {
  return (
    <div className="rounded-md border border-panel-border p-3">
      <div className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
        {label}
      </div>
      <div className="mt-1 font-mono text-sm font-semibold text-foreground">
        {value}
      </div>
      <div className="mt-1 text-[11px] text-muted-foreground">{detail}</div>
    </div>
  );
}
