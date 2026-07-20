"use client";

import { Minus, TrendingDown, TrendingUp } from "lucide-react";
import { Panel } from "@/components/panels/panel";
import {
  MARKET_BIAS_TRANSPORT_WARNING,
  useDisplaySpyZeroDteDeterministicBias,
} from "@/hooks/use-spy-market-bias";
import { getDashboardBiasView } from "@/lib/dashboard-deterministic-view";
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

export function BiasCard() {
  const { display, isLoading, isError } = useDisplaySpyZeroDteDeterministicBias();
  const bias = display?.response;
  const view = bias ? getDashboardBiasView(bias.biasState) : null;
  const Icon = bias ? ICONS[bias.biasState] : Minus;

  return (
    <Panel title="Structural Bias" isLoading={isLoading} isError={isError} className="lg:col-span-1">
      {bias && view && (
        <div className="flex h-full flex-col justify-between gap-3">
          <div
            className={cn(
              "flex items-center gap-2 rounded-md border px-4 py-3",
              TONE_CLASSES[view.tone],
            )}
          >
            <Icon className="h-5 w-5" />
            <span className="font-mono text-xl font-bold tracking-tight">{view.label}</span>
          </div>

          <p className="text-xs leading-relaxed text-muted-foreground">
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
