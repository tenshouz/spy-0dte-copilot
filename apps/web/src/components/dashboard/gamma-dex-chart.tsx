"use client";

import type { StrikeExposure } from "@spy-copilot/shared";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { formatCompactCurrency } from "@/lib/format";
import { cn } from "@/lib/utils";

interface GammaDexChartProps {
  strikes: StrikeExposure[];
  spotPrice?: number;
}

/** InsiderFinance-style diverging per-strike exposure bars with color-intensity and hover detail. */
export function GammaDexChart({ strikes, spotPrice }: GammaDexChartProps) {
  const sorted = [...strikes].sort((a, b) => b.strike - a.strike);
  const closestStrike = spotPrice
    ? sorted.reduce((prev, curr) =>
        Math.abs(curr.strike - spotPrice) < Math.abs(prev.strike - spotPrice) ? curr : prev,
      ).strike
    : undefined;

  return (
    <TooltipProvider delayDuration={100}>
      <Tabs defaultValue="gex">
        <TabsList>
          <TabsTrigger value="gex">GEX</TabsTrigger>
          <TabsTrigger value="dex">DEX</TabsTrigger>
        </TabsList>

        <TabsContent value="gex">
          <ExposureBars strikes={sorted} field="gex" closestStrike={closestStrike} />
        </TabsContent>
        <TabsContent value="dex">
          <ExposureBars strikes={sorted} field="dex" closestStrike={closestStrike} />
        </TabsContent>
      </Tabs>
    </TooltipProvider>
  );
}

function ExposureBars({
  strikes,
  field,
  closestStrike,
}: {
  strikes: StrikeExposure[];
  field: "gex" | "dex";
  closestStrike?: number;
}) {
  const maxAbs = Math.max(1, ...strikes.map((s) => Math.abs(s[field])));

  return (
    <div className="space-y-0.5">
      {strikes.map((s) => {
        const value = s[field];
        const magnitude = Math.abs(value) / maxAbs;
        const widthPct = magnitude * 50;
        const opacity = 0.25 + magnitude * 0.75;
        const positive = value >= 0;

        return (
          <Tooltip key={s.strike}>
            <TooltipTrigger asChild>
              <div
                className={cn(
                  "flex items-center gap-2 rounded-sm px-1 py-0.5",
                  s.strike === closestStrike && "bg-accent/10 ring-1 ring-accent/30",
                )}
              >
                <span className="w-12 shrink-0 text-right font-mono text-[11px] tabular text-muted-foreground">
                  {s.strike}
                </span>
                <div className="relative h-4 flex-1">
                  <div className="absolute inset-y-0 left-1/2 w-px bg-panel-border" />
                  <div
                    className={cn(
                      "absolute inset-y-0 rounded-sm",
                      positive ? "left-1/2 bg-bull" : "right-1/2 bg-bear",
                    )}
                    style={{ width: `${widthPct}%`, opacity }}
                  />
                </div>
              </div>
            </TooltipTrigger>
            <TooltipContent>
              <div className="space-y-0.5">
                <p className="font-semibold">${s.strike} strike</p>
                <p>GEX: {formatCompactCurrency(s.gex)}</p>
                <p>DEX: {formatCompactCurrency(s.dex)}</p>
                <p className="text-muted-foreground">
                  Call OI {s.callOpenInterest.toLocaleString()} · Put OI {s.putOpenInterest.toLocaleString()}
                </p>
              </div>
            </TooltipContent>
          </Tooltip>
        );
      })}
    </div>
  );
}
