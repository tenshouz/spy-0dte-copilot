"use client";

import { Panel } from "@/components/panels/panel";
import {
  MARKET_BIAS_TRANSPORT_WARNING,
  useDisplaySpyZeroDteDeterministicBias,
} from "@/hooks/use-spy-market-bias";
import {
  formatDashboardNumber,
  formatDashboardRatioPercent,
  getDashboardConfidenceExplanation,
} from "@/lib/dashboard-deterministic-view";
import { cn } from "@/lib/utils";

function ConfidenceMetric({
  label,
  value,
  tone = "default",
}: {
  label: string;
  value: string;
  tone?: "default" | "bull" | "bear" | "wait";
}) {
  return (
    <div className="rounded-md border border-panel-border bg-background/40 px-2.5 py-2">
      <p className="text-[9px] font-medium uppercase tracking-wider text-muted-foreground">
        {label}
      </p>
      <p
        className={cn(
          "mt-0.5 font-mono text-sm font-semibold tabular-nums",
          tone === "bull"
            ? "text-bull"
            : tone === "bear"
              ? "text-bear"
              : tone === "wait"
                ? "text-wait"
                : "text-foreground",
        )}
      >
        {value}
      </p>
    </div>
  );
}

export function ConfidenceCard() {
  const { display, isLoading, isError } = useDisplaySpyZeroDteDeterministicBias();
  const bias = display?.response;
  const confidence = bias?.confidenceScore ?? null;
  const filledSegments = confidence === null ? 0 : Math.round(confidence / 10);

  return (
    <Panel title="Structural Confidence" isLoading={isLoading} isError={isError} className="lg:col-span-1">
      {bias && (
        <div className="space-y-3">
          <div className="flex items-baseline justify-between">
            <span className="font-mono text-3xl font-bold tabular-nums">
              {confidence === null ? "—" : confidence.toFixed(0)}
            </span>
            <span className="text-xs text-muted-foreground">/ 100</span>
          </div>

          <div className="flex gap-0.5" aria-label={`Confidence ${confidence ?? "unavailable"} out of 100`}>
            {Array.from({ length: 10 }).map((_, index) => (
              <span
                key={index}
                className={cn(
                  "h-1.5 flex-1 rounded-sm",
                  index < filledSegments ? "bg-accent" : "bg-muted",
                )}
              />
            ))}
          </div>

          <div className="grid grid-cols-2 gap-2">
            <ConfidenceMetric
              label="Bull score"
              value={formatDashboardNumber(bias.bullishScore)}
              tone="bull"
            />
            <ConfidenceMetric
              label="Bear score"
              value={formatDashboardNumber(bias.bearishScore)}
              tone="bear"
            />
            <ConfidenceMetric
              label="Contradiction"
              value={formatDashboardRatioPercent(bias.contradictionRatio)}
              tone={(bias.contradictionRatio ?? 0) > 0 ? "wait" : "default"}
            />
            <ConfidenceMetric
              label="Data quality"
              value={bias.sourceQualityState}
              tone={bias.sourceQualityState === "COMPLETE" ? "bull" : "wait"}
            />
          </div>

          <div className="rounded-md border border-panel-border bg-background/30 px-2.5 py-2">
            <p className="text-[9px] font-medium uppercase tracking-wider text-muted-foreground">
              Confidence limiter
            </p>
            <p className="mt-0.5 text-[11px] leading-snug text-foreground">
              {getDashboardConfidenceExplanation(bias)}
            </p>
          </div>

          <p className="text-[11px] text-muted-foreground">
            Support {formatDashboardRatioPercent(bias.directionalSupportRatio)} · Sufficiency {formatDashboardRatioPercent(bias.sufficiencyRatio)}
          </p>
          {display?.transportFailed && (
            <p className="text-xs text-wait">{MARKET_BIAS_TRANSPORT_WARNING}</p>
          )}
        </div>
      )}
    </Panel>
  );
}
