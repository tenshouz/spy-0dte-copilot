"use client";

import { Panel } from "@/components/panels/panel";
import { useMarketSnapshot } from "@/hooks/use-market-snapshot";
import { formatPrice } from "@/lib/format";
import { cn } from "@/lib/utils";

export function MarketRegimeCard() {
  const { data: snapshot, isLoading, isError } = useMarketSnapshot();

  const regime =
    snapshot &&
    (snapshot.trend5m === "UP" && snapshot.emaTrend === "UP"
      ? "Trending Up"
      : snapshot.trend5m === "DOWN" && snapshot.emaTrend === "DOWN"
        ? "Trending Down"
        : "Range-Bound");

  const aboveVwap = snapshot ? snapshot.spotPrice >= snapshot.vwap : undefined;

  return (
    <Panel title="Market Regime" isLoading={isLoading} isError={isError} className="lg:col-span-1">
      {snapshot && (
        <div className="flex h-full flex-col justify-between gap-2">
          <span
            className={cn(
              "font-mono text-xl font-bold tracking-tight",
              regime === "Trending Up" && "text-bull",
              regime === "Trending Down" && "text-bear",
              regime === "Range-Bound" && "text-wait",
            )}
          >
            {regime}
          </span>
          <div className="grid grid-cols-2 gap-x-2 gap-y-1 text-xs">
            <span className="text-muted-foreground">vs VWAP</span>
            <span className={cn("text-right font-mono", aboveVwap ? "text-bull" : "text-bear")}>
              {aboveVwap ? "Above" : "Below"} ${formatPrice(snapshot.vwap)}
            </span>
            <span className="text-muted-foreground">5m Trend</span>
            <span className="text-right font-mono">{snapshot.trend5m}</span>
            <span className="text-muted-foreground">EMA Trend</span>
            <span className="text-right font-mono">{snapshot.emaTrend}</span>
            <span className="text-muted-foreground">Rel. Volume</span>
            <span className="text-right font-mono">{snapshot.relativeVolume.toFixed(2)}x</span>
          </div>
        </div>
      )}
    </Panel>
  );
}
