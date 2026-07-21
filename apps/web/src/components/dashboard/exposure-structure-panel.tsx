"use client";

import { MetricCard } from "@/components/panels/metric-card";
import { Panel } from "@/components/panels/panel";
import { Badge } from "@/components/ui/badge";
import {
  EXPOSURE_STRUCTURE_TRANSPORT_WARNING,
  useDisplaySpyZeroDteExposureStructure,
} from "@/hooks/use-spy-exposure-structure";
import {
  exposureStructureTone,
  exposureStructureWarningMessage,
  formatExposureState,
} from "@/lib/exposure-structure-view";
import { formatCompactCurrency, formatPrice, formatSigned } from "@/lib/format";
import { Info } from "lucide-react";
import { cn } from "@/lib/utils";

interface ExposureStructurePanelProps {
  className?: string;
  compact?: boolean;
}

function price(value: number | null | undefined): string {
  return value == null ? "—" : `$${formatPrice(value)}`;
}

function percentage(value: number | null): string {
  return value === null ? "—" : `${formatSigned(value)}%`;
}

export function ExposureStructurePanel({ className, compact = false }: ExposureStructurePanelProps) {
  const query = useDisplaySpyZeroDteExposureStructure();
  const response = query.display?.response ?? null;
  const tone = response ? exposureStructureTone(response.engineState) : "wait";

  return (
    <Panel
      title="0DTE Exposure Structure"
      isLoading={query.isLoading}
      isError={query.isError}
      className={className}
      action={response ? <Badge variant={tone}>{response.engineState}</Badge> : undefined}
    >
      {response && (
        <div className="space-y-3">
          <div className={cn("grid gap-2", compact ? "grid-cols-1 sm:grid-cols-2" : "grid-cols-2 lg:grid-cols-4")}>
            <MetricCard
              label="Gamma Regime"
              className={compact ? "p-2.5" : undefined}
              value={formatExposureState(response.gammaRegime)}
              sublabel={`${percentage(response.gammaRegimeRatioPercent)} of gross returned-window Gamma`}
              tone={
                response.gammaRegime === "CALL_DOMINANT"
                  ? "bull"
                  : response.gammaRegime === "PUT_DOMINANT"
                    ? "bear"
                    : "wait"
              }
            />
            <MetricCard
              label="Primary Call Wall"
              className={compact ? "p-2.5" : undefined}
              value={price(response.callWalls[0]?.strikePrice)}
              sublabel={
                response.callWalls[0]
                  ? `${formatCompactCurrency(response.callWalls[0].exposureMagnitude)} · ${response.callWalls[0].shareOfSidePercent.toFixed(1)}% of Call GEX`
                  : "Unavailable"
              }
              tone="bull"
            />
            <MetricCard
              label="Primary Put Wall"
              className={compact ? "p-2.5" : undefined}
              value={price(response.putWalls[0]?.strikePrice)}
              sublabel={
                response.putWalls[0]
                  ? `${formatCompactCurrency(response.putWalls[0].exposureMagnitude)} · ${response.putWalls[0].shareOfSidePercent.toFixed(1)}% of Put GEX`
                  : "Unavailable"
              }
              tone="bear"
            />
            <MetricCard
              label="Gamma Balance Proxy"
              className={compact ? "p-2.5" : undefined}
              value={price(response.gammaFlipProxy.estimatedStrike)}
              sublabel={`${formatExposureState(response.gammaFlipProxy.state)} · cumulative balance, not a dealer flip`}
            />
          </div>

          {!compact && (
            <>
              <div className="grid grid-cols-1 gap-2 md:grid-cols-3">
                <MetricCard
                  label="Largest Net DEX Anchor"
                  value={price(response.largestAbsoluteDexAnchor?.strikePrice)}
                  sublabel={
                    response.largestAbsoluteDexAnchor
                      ? `${formatCompactCurrency(response.largestAbsoluteDexAnchor.netDeltaExposureProxy)} net DEX`
                      : "DEX unavailable"
                  }
                />
                <MetricCard
                  label="Largest Positive Net GEX"
                  value={price(response.largestPositiveNetGexStrike)}
                  sublabel="Returned-window strike reference"
                  tone="bull"
                />
                <MetricCard
                  label="Largest Negative Net GEX"
                  value={price(response.largestNegativeNetGexStrike)}
                  sublabel="Returned-window strike reference"
                  tone="bear"
                />
              </div>

              <div className="grid grid-cols-1 gap-3 lg:grid-cols-3">
                <RankedLevels
                  title="Ranked Call Walls"
                  rows={response.callWalls.map((wall) => ({
                    rank: wall.rank,
                    level: price(wall.strikePrice),
                    value: formatCompactCurrency(wall.exposureMagnitude),
                    detail: `${wall.shareOfSidePercent.toFixed(1)}% of side · ${formatSigned(wall.distanceFromUnderlyingPoints)} pts`,
                  }))}
                />
                <RankedLevels
                  title="Ranked Put Walls"
                  rows={response.putWalls.map((wall) => ({
                    rank: wall.rank,
                    level: price(wall.strikePrice),
                    value: formatCompactCurrency(wall.exposureMagnitude),
                    detail: `${wall.shareOfSidePercent.toFixed(1)}% of side · ${formatSigned(wall.distanceFromUnderlyingPoints)} pts`,
                  }))}
                />
                <RankedLevels
                  title="Ranked Gamma Cliffs"
                  rows={response.gammaCliffs.map((cliff) => ({
                    rank: cliff.rank,
                    level: `${price(cliff.lowerStrike)} → ${price(cliff.upperStrike)}`,
                    value: formatCompactCurrency(cliff.netGammaChange),
                    detail: formatExposureState(cliff.direction),
                  }))}
                />
              </div>
            </>
          )}

          {(query.display?.transportFailed || response.warnings.length > 0) && (
            <div className="space-y-1 rounded-md border border-wait/30 bg-wait-muted px-3 py-2 text-xs text-wait">
              {query.display?.transportFailed && <p>{EXPOSURE_STRUCTURE_TRANSPORT_WARNING}</p>}
              {response.warnings.map((warning) => (
                <p key={warning}>{exposureStructureWarningMessage(warning)}</p>
              ))}
            </div>
          )}

          {compact ? (
            <details className="rounded-md border border-panel-border bg-background/30 px-2.5 py-2 text-[11px] text-muted-foreground">
              <summary className="flex cursor-pointer items-center gap-1.5 font-medium text-foreground">
                <Info className="h-3.5 w-3.5" />
                Methodology
              </summary>
              <p className="mt-2 leading-relaxed">
                Returned-window analytical structure only. Call-positive and Put-negative Gamma conventions do not reveal observed dealer inventory. The Gamma balance level is a cumulative Net GEX zero-crossing proxy, not a true dealer Gamma Flip or standalone trading signal.
              </p>
            </details>
          ) : (
            <p className="text-[11px] leading-relaxed text-muted-foreground">
              Returned-window analytical structure only. Call-positive and Put-negative Gamma conventions do not reveal observed dealer inventory. The Gamma balance level is a cumulative Net GEX zero-crossing proxy, not a true dealer Gamma Flip or standalone trading signal.
            </p>
          )}
        </div>
      )}
    </Panel>
  );
}

function RankedLevels({
  title,
  rows,
}: {
  title: string;
  rows: Array<{ rank: number; level: string; value: string; detail: string }>;
}) {
  return (
    <div className="rounded-md border border-panel-border bg-background/40 p-3">
      <h3 className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">{title}</h3>
      <div className="mt-2 space-y-2">
        {rows.length === 0 && <p className="text-xs text-muted-foreground">Unavailable</p>}
        {rows.map((row) => (
          <div key={`${title}-${row.rank}`} className="grid grid-cols-[1.5rem_1fr_auto] items-center gap-2 text-xs">
            <span className="font-mono text-muted-foreground">#{row.rank}</span>
            <div>
              <div className="font-mono font-semibold">{row.level}</div>
              <div className="text-[10px] text-muted-foreground">{row.detail}</div>
            </div>
            <span className="font-mono tabular-nums">{row.value}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
