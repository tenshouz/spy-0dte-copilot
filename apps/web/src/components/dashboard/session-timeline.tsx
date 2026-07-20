"use client";

import { Panel } from "@/components/panels/panel";
import { Badge } from "@/components/ui/badge";
import { useDisplaySpyZeroDteDeterministicBias } from "@/hooks/use-spy-market-bias";
import { useDisplaySpyZeroDteDeterministicMarketState } from "@/hooks/use-spy-market-state";
import { useSpyZeroDteTradePlanAssembly } from "@/hooks/use-spy-trade-plan-assembly";
import { formatEasternTime } from "@/lib/format";

export function SessionTimeline() {
  const marketState = useDisplaySpyZeroDteDeterministicMarketState();
  const bias = useDisplaySpyZeroDteDeterministicBias();
  const assemblyQuery = useSpyZeroDteTradePlanAssembly();
  const assembly = assemblyQuery.isError ? null : assemblyQuery.data ?? null;

  const isLoading = marketState.isLoading || bias.isLoading || assemblyQuery.isLoading;
  const isError = marketState.isError || bias.isError || assemblyQuery.isError;

  return (
    <Panel title="Deterministic Pipeline" isLoading={isLoading} isError={isError}>
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
        {marketState.display && (
          <div className="rounded-md border border-panel-border bg-background/40 p-3">
            <div className="flex items-center justify-between gap-2">
              <span className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
                Market State
              </span>
              <Badge variant={marketState.display.response.engineState === "AVAILABLE" ? "bull" : "wait"}>
                {marketState.display.response.engineState}
              </Badge>
            </div>
            <p className="mt-2 font-mono text-xs">
              {formatEasternTime(marketState.display.response.calculatedAt)}
            </p>
            <p className="mt-1 text-[11px] text-muted-foreground">V1 · current snapshot</p>
          </div>
        )}

        {bias.display && (
          <div className="rounded-md border border-panel-border bg-background/40 p-3">
            <div className="flex items-center justify-between gap-2">
              <span className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
                Bias & Confidence
              </span>
              <Badge variant={bias.display.response.engineState === "AVAILABLE" ? "bull" : "wait"}>
                {bias.display.response.engineState}
              </Badge>
            </div>
            <p className="mt-2 font-mono text-xs">
              {formatEasternTime(bias.display.response.calculatedAt)}
            </p>
            <p className="mt-1 text-[11px] text-muted-foreground">BIAS_V1 · structural evidence</p>
          </div>
        )}

        {assembly && (
          <div className="rounded-md border border-panel-border bg-background/40 p-3">
            <div className="flex items-center justify-between gap-2">
              <span className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
                Trade Plan Assembly
              </span>
              <Badge variant={assembly.engineState === "AVAILABLE" ? "bull" : "wait"}>
                {assembly.engineState}
              </Badge>
            </div>
            <p className="mt-2 font-mono text-xs">{formatEasternTime(assembly.calculatedAt)}</p>
            <p className="mt-1 text-[11px] text-muted-foreground">ASSEMBLY_V2 · no history persisted</p>
          </div>
        )}
      </div>
    </Panel>
  );
}
