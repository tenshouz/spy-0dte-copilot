"use client";

import { SPY_COPILOT_RELEASE_LABEL } from "@spy-copilot/shared";
import { CheckCircle2, CircleAlert, RefreshCw, ShieldCheck, XCircle } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Panel } from "@/components/panels/panel";
import { useRunSystemDataProbe, useSystemReadiness } from "@/hooks/use-system-readiness";
import {
  dataProbeComponentLabel,
  dataProbeComponentTone,
  dataProbeLabel,
  dataProbeTone,
  formatReadinessTimestamp,
  readinessCheckLabel,
  readinessCheckTone,
  readinessEngineLabel,
  readinessEngineTone,
} from "@/lib/system-readiness-view";

export function SystemReadinessPanel() {
  const readiness = useSystemReadiness();
  const probe = useRunSystemDataProbe();
  const data = readiness.data;

  return (
    <div className="space-y-4">
      <Panel
        title={`System Readiness — ${SPY_COPILOT_RELEASE_LABEL}`}
        isLoading={readiness.isLoading}
        isError={readiness.isError}
        action={
          data ? (
            <Badge variant={readinessEngineTone(data.engineState)}>
              {readinessEngineLabel(data.engineState)}
            </Badge>
          ) : null
        }
      >
        {data ? (
          <div className="space-y-4">
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <Summary label="Release" value={`v${data.releaseVersion}`} />
              <Summary label="Checks passed" value={`${data.summary.passCount}/${data.summary.totalChecks}`} />
              <Summary label="Warnings" value={String(data.summary.warningCount)} />
              <Summary label="Required failures" value={String(data.summary.requiredFailureCount)} />
            </div>

            <div className="rounded-md border border-panel-border bg-background/30 px-3 py-2 text-xs text-muted-foreground">
              Evaluated {formatReadinessTimestamp(data.calculatedAt)} · {data.runtime.nodeVersion} · {data.runtime.environment} · uptime {data.runtime.uptimeSeconds}s
            </div>

            <div className="grid gap-3 lg:grid-cols-2">
              {data.checks.map((item) => (
                <div key={item.id} className="rounded-md border border-panel-border bg-background/20 p-3">
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex items-center gap-2">
                      {item.state === "PASS" ? (
                        <CheckCircle2 className="h-4 w-4 text-bull" />
                      ) : item.state === "WARNING" ? (
                        <CircleAlert className="h-4 w-4 text-wait" />
                      ) : (
                        <XCircle className="h-4 w-4 text-bear" />
                      )}
                      <div>
                        <p className="text-sm font-medium">{item.label}</p>
                        <p className="font-mono text-[10px] text-muted-foreground">{item.reasonCode}</p>
                      </div>
                    </div>
                    <Badge variant={readinessCheckTone(item.state)}>
                      {readinessCheckLabel(item.state)}
                    </Badge>
                  </div>
                  <p className="mt-2 text-xs text-muted-foreground">{item.detail}</p>
                  {item.remediation ? (
                    <p className="mt-2 text-xs text-foreground">Next: {item.remediation}</p>
                  ) : null}
                </div>
              ))}
            </div>
          </div>
        ) : null}
      </Panel>

      <Panel
        title="Explicit Live-Data Probe"
        action={
          <Button
            size="sm"
            disabled={probe.isPending}
            onClick={() => probe.mutate()}
          >
            <RefreshCw className={`h-4 w-4 ${probe.isPending ? "animate-spin" : ""}`} />
            {probe.isPending ? "Running…" : "Run complete probe"}
          </Button>
        }
      >
        <div className="space-y-3">
          <div className="flex items-start gap-2 rounded-md border border-accent/20 bg-accent/5 p-3 text-xs text-muted-foreground">
            <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-accent" />
            <p>
              This explicit five-component probe may call Schwab through the existing rate-limited, cache-aware services and evaluates the Trading Workspace without READY reconciliation. It does not send Discord messages, write Journal records, confirm or close a position, record an override, access private account data, or create orders.
            </p>
          </div>

          {probe.data ? (
            <div className="space-y-3" role="status">
              <div className="flex items-center justify-between rounded-md border border-panel-border px-3 py-2">
                <div>
                  <p className="text-sm font-medium">Latest probe</p>
                  <p className="text-xs text-muted-foreground">{formatReadinessTimestamp(probe.data.calculatedAt)}</p>
                </div>
                <Badge variant={dataProbeTone(probe.data.probeState)}>
                  {dataProbeLabel(probe.data.probeState)}
                </Badge>
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                {probe.data.components.map((item) => (
                  <div key={item.id} className="rounded-md border border-panel-border p-3">
                    <div className="flex items-center justify-between gap-2">
                      <p className="text-sm font-medium">{item.label}</p>
                      <Badge variant={dataProbeComponentTone(item.state)}>
                        {dataProbeComponentLabel(item.state)}
                      </Badge>
                    </div>
                    <p className="mt-1 font-mono text-[10px] text-muted-foreground">{item.sourceState} · {item.reasonCode}</p>
                    <p className="mt-2 text-xs text-muted-foreground">{item.detail}</p>
                  </div>
                ))}
              </div>
            </div>
          ) : probe.isError ? (
            <div className="rounded-md border border-bear/30 bg-bear-muted p-3 text-xs text-bear" role="status">
              The explicit probe could not complete. Check the backend terminal and System Readiness checks.
            </div>
          ) : (
            <p className="text-xs text-muted-foreground">
              No complete probe has been run in this browser session. The readiness checks above avoid live provider calls; run the probe to validate quote, candles, options, Assembly, and Trading Workspace together.
            </p>
          )}
        </div>
      </Panel>
    </div>
  );
}

function Summary({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md border border-panel-border bg-background/20 px-3 py-3">
      <p className="text-[10px] uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className="mt-1 font-mono text-lg font-semibold">{value}</p>
    </div>
  );
}
