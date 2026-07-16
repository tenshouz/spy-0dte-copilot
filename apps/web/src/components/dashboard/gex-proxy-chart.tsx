"use client";

import { selectAtmStrike, type GexStrikeRow } from "@spy-copilot/shared";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { formatCompactCurrency } from "@/lib/format";
import { cn } from "@/lib/utils";

interface GexProxyChartProps {
  strikes: GexStrikeRow[];
  underlyingPrice: number | null;
}

/** Two-sided returned-window GEX display. Put magnitude is negated only for visual orientation. */
export function GexProxyChart({ strikes, underlyingPrice }: GexProxyChartProps) {
  const sorted = [...strikes].sort((a, b) => b.strikePrice - a.strikePrice);
  const atmStrike = selectAtmStrike(
    sorted.map((row) => row.strikePrice),
    underlyingPrice,
  );
  const maxMagnitude = Math.max(
    1,
    ...sorted.flatMap((row) => [row.callGammaExposure, row.putGammaExposureMagnitude]),
  );

  return (
    <TooltipProvider delayDuration={100}>
      <div className="mb-2 grid grid-cols-[3rem_1fr_1fr] gap-2 text-[10px] uppercase tracking-wider text-muted-foreground">
        <span className="text-right">Strike</span>
        <span className="text-right">Put magnitude</span>
        <span>Call magnitude</span>
      </div>
      <div className="space-y-0.5">
        {sorted.map((row) => {
          const callWidth = (row.callGammaExposure / maxMagnitude) * 50;
          const putWidth = (row.putGammaExposureMagnitude / maxMagnitude) * 50;
          const isAtm = row.strikePrice === atmStrike;

          return (
            <Tooltip key={row.strikePrice}>
              <TooltipTrigger asChild>
                <div
                  className={cn(
                    "grid grid-cols-[3rem_1fr] items-center gap-2 rounded-sm px-1 py-0.5",
                    isAtm && "bg-accent/10 ring-1 ring-accent/30",
                  )}
                >
                  <span className="text-right font-mono text-[11px] tabular text-muted-foreground">
                    {row.strikePrice}
                  </span>
                  <div className="relative h-4">
                    <div className="absolute inset-y-0 left-1/2 w-px bg-panel-border" />
                    <div
                      className="absolute inset-y-0 right-1/2 rounded-l-sm bg-wait/70"
                      style={{ width: `${putWidth}%` }}
                    />
                    <div
                      className="absolute inset-y-0 left-1/2 rounded-r-sm bg-accent/70"
                      style={{ width: `${callWidth}%` }}
                    />
                  </div>
                </div>
              </TooltipTrigger>
              <TooltipContent>
                <div className="space-y-0.5">
                  <p className="font-semibold">${row.strikePrice} strike</p>
                  <p>Call GEX: {formatCompactCurrency(row.callGammaExposure)}</p>
                  <p>Put magnitude: {formatMagnitudeCurrency(row.putGammaExposureMagnitude)}</p>
                  <p>Net proxy: {formatCompactCurrency(row.netGammaExposureProxy)}</p>
                  <p className="text-muted-foreground">
                    Call OI {row.callOpenInterest.toLocaleString()} · Put OI {row.putOpenInterest.toLocaleString()}
                  </p>
                </div>
              </TooltipContent>
            </Tooltip>
          );
        })}
      </div>
    </TooltipProvider>
  );
}

function formatMagnitudeCurrency(value: number): string {
  return formatCompactCurrency(value).replace(/^\+/, "");
}
