"use client";

import { Minus, TrendingDown, TrendingUp } from "lucide-react";
import { Panel } from "@/components/panels/panel";
import {
  MARKET_BIAS_TRANSPORT_WARNING,
  useDisplaySpyZeroDteDeterministicBias,
} from "@/hooks/use-spy-market-bias";
import {
  getDashboardBiasEvidenceSummary,
  getDashboardBiasView,
} from "@/lib/dashboard-deterministic-view";
import { cn } from "@/lib/utils";

const ICONS = {
  BULLISH: TrendingUp,
  BEARISH: TrendingDown,
  NEUTRAL: Minus,
  UNAVAILABLE: Minus,
} as const;

const TONE_CLASSES = {
  bull: "text-bull border-bull/40 bg-bull-muted",
  bear: "text-bear border-bear/40 bg-bear-muted",
  wait: "text-wait border-wait/40 bg-wait-muted",
  default: "text-muted-foreground border-panel-border bg-background/40",
} as const;

function EvidenceCount({
  label,
  value,
  tone,
}: {
  label: string;
  value: number;
  tone: "bull" | "bear" | "wait";
}) {
  return (
    <div className="rounded-md border border-panel-border bg-background/40 px-2.5 py-2">
      <p className="text-[9px] font-medium uppercase tracking-wider text-muted-foreground">
        {label}
      </p>
      <p
        className={cn(
          "mt-0.5 font-mono text-base font-semibold tabular-nums",
          tone === "bull" ? "text-bull" : tone === "bear" ? "text-bear" : "text-wait",
        )}
      >
        {value}
      </p>
    </div>
  );
}

export function BiasCard() {
  const { display, isLoading, isError } = useDisplaySpyZeroDteDeterministicBias();
  const bias = display?.response;
  const view = bias ? getDashboardBiasView(bias.biasState) : null;
  const evidence = bias ? getDashboardBiasEvidenceSummary(bias) : null;
  const Icon = bias ? ICONS[bias.biasState] : Minus;

  return (
    <Panel title="Structural Bias" isLoading={isLoading} isError={isError} className="lg:col-span-1">
      {bias && view && evidence && (
        <div className="space-y-3">
          <div
            className={cn(
              "flex items-center gap-2 rounded-md border px-3 py-2.5",
              TONE_CLASSES[view.tone],
            )}
          >
            <Icon className="h-4 w-4" />
            <span className="font-mono text-lg font-bold tracking-tight">{view.label}</span>
          </div>

          <div className="grid grid-cols-3 gap-2">
            <EvidenceCount label="Bullish" value={bias.bullishEvidenceCount} tone="bull" />
            <EvidenceCount label="Bearish" value={bias.bearishEvidenceCount} tone="bear" />
            <EvidenceCount label="Neutral" value={bias.neutralEvidenceCount} tone="wait" />
          </div>

          <div className="space-y-2 text-[11px]">
            <div className="rounded-md border border-panel-border bg-background/30 px-2.5 py-2">
              <p className="text-[9px] font-medium uppercase tracking-wider text-muted-foreground">
                Primary driver
              </p>
              <p className="mt-0.5 leading-snug text-foreground">{evidence.primaryDriver}</p>
            </div>
            <div className="rounded-md border border-panel-border bg-background/30 px-2.5 py-2">
              <p className="text-[9px] font-medium uppercase tracking-wider text-muted-foreground">
                Counterweight
              </p>
              <p className="mt-0.5 leading-snug text-foreground">{evidence.counterweight}</p>
            </div>
          </div>

          <p className="text-[11px] leading-relaxed text-muted-foreground">
            {bias.usableDirectionalEvidenceCount} usable directional inputs · {bias.sourceQualityState.toLowerCase()} source quality
          </p>
          {display.transportFailed && (
            <p className="text-xs text-wait">{MARKET_BIAS_TRANSPORT_WARNING}</p>
          )}
        </div>
      )}
    </Panel>
  );
}
