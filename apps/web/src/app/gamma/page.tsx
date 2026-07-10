"use client";

import type { StrikeExposure } from "@spy-copilot/shared";
import { PageHeader } from "@/components/layout/page-header";
import { DataTable, type DataTableColumn } from "@/components/panels/data-table";
import { MetricCard } from "@/components/panels/metric-card";
import { Panel } from "@/components/panels/panel";
import { useMarketSnapshot, useStrikeExposures } from "@/hooks/use-market-snapshot";
import { formatCompactCurrency } from "@/lib/format";
import { cn } from "@/lib/utils";

export default function GammaPage() {
  const { data: strikes, isLoading, isError } = useStrikeExposures();
  const { data: snapshot } = useMarketSnapshot();

  const columns: DataTableColumn<StrikeExposure>[] = [
    { key: "strike", header: "Strike", render: (r) => `$${r.strike}` },
    {
      key: "callOi",
      header: "Call OI",
      align: "right",
      render: (r) => r.callOpenInterest.toLocaleString(),
    },
    {
      key: "putOi",
      header: "Put OI",
      align: "right",
      render: (r) => r.putOpenInterest.toLocaleString(),
    },
    { key: "gex", header: "GEX", align: "right", render: (r) => formatCompactCurrency(r.gex) },
    { key: "dex", header: "DEX", align: "right", render: (r) => formatCompactCurrency(r.dex) },
  ];

  const maxAbsGex = Math.max(1, ...(strikes ?? []).map((s) => Math.abs(s.gex)));

  return (
    <div className="mx-auto max-w-[1600px]">
      <PageHeader
        title="GEX / DEX"
        description="Proprietary gamma & delta exposure, computed in-house per PRD Section 5.2 — mock data for Milestone 1."
      />

      <div className="grid grid-cols-1 gap-3 lg:grid-cols-4">
        <Panel title="Net GEX" isLoading={isLoading} isError={isError}>
          {snapshot && <MetricCard label="Whole chain" value={formatCompactCurrency(snapshot.netGex)} tone="bull" />}
        </Panel>
        <Panel title="Net DEX" isLoading={isLoading} isError={isError}>
          {snapshot && <MetricCard label="Whole chain" value={formatCompactCurrency(snapshot.netDex)} tone="bull" />}
        </Panel>
        <Panel title="Gamma Flip" isLoading={isLoading} isError={isError}>
          {snapshot && <MetricCard label="Flip level" value={`$${snapshot.gammaFlip?.toFixed(2)}`} />}
        </Panel>
        <Panel title="Dealer Positioning" isLoading={isLoading} isError={isError}>
          {snapshot && (
            <MetricCard label="Stance" value={snapshot.dealerPositioning.replace(/_/g, " ")} tone="bull" />
          )}
        </Panel>

        <Panel
          title="Gamma Heatmap (by strike)"
          isLoading={isLoading}
          isError={isError}
          className="lg:col-span-4"
        >
          {strikes && (
            <div className="flex items-end gap-1 overflow-x-auto pb-2 scrollbar-thin">
              {strikes.map((s) => {
                const heightPct = (Math.abs(s.gex) / maxAbsGex) * 100;
                return (
                  <div key={s.strike} className="flex min-w-[44px] flex-1 flex-col items-center gap-1">
                    <div className="flex h-28 w-full items-end">
                      <div
                        className={cn("w-full rounded-t-sm", s.gex >= 0 ? "bg-bull" : "bg-bear")}
                        style={{ height: `${Math.max(4, heightPct)}%` }}
                      />
                    </div>
                    <span className="font-mono text-[10px] tabular text-muted-foreground">{s.strike}</span>
                  </div>
                );
              })}
            </div>
          )}
        </Panel>

        <Panel title="Per-Strike Exposure" isLoading={isLoading} isError={isError} className="lg:col-span-4" noPadding>
          <DataTable columns={columns} rows={strikes ?? []} rowKey={(r) => String(r.strike)} />
        </Panel>
      </div>
    </div>
  );
}
