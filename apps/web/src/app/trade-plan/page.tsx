"use client";

import type { FactorScore } from "@spy-copilot/shared";
import { AlertTriangle } from "lucide-react";
import { PageHeader } from "@/components/layout/page-header";
import { DataTable, type DataTableColumn } from "@/components/panels/data-table";
import { MetricCard } from "@/components/panels/metric-card";
import { Panel } from "@/components/panels/panel";
import { Badge } from "@/components/ui/badge";
import { useLatestReport } from "@/hooks/use-report";
import { formatPrice } from "@/lib/format";

export default function TradePlanPage() {
  const { data: report, isLoading, isError } = useLatestReport();

  const columns: DataTableColumn<FactorScore>[] = [
    { key: "factor", header: "Factor", render: (r) => r.factor },
    { key: "detail", header: "Detail", render: (r) => <span className="text-muted-foreground">{r.detail}</span> },
    {
      key: "points",
      header: "Points",
      align: "right",
      render: (r) => (
        <span className={r.points >= 0 ? "text-bull" : "text-bear"}>
          {r.points > 0 ? `+${r.points}` : r.points}
        </span>
      ),
    },
  ];

  const total = report?.factorScores.reduce((sum, f) => sum + f.points, 0) ?? 0;

  return (
    <div className="mx-auto max-w-[1600px]">
      <PageHeader
        title="AI Trade Plan"
        description="Never a black box — every recommendation traces back to a scored factor list (PRD Section 9)."
      />

      <div className="grid grid-cols-1 gap-3 lg:grid-cols-3">
        <Panel title="Bullish Scenario" isLoading={isLoading} isError={isError} className="lg:col-span-1">
          {report && <p className="text-sm leading-relaxed text-foreground">{report.bullishScenario}</p>}
        </Panel>
        <Panel title="Bearish Scenario" isLoading={isLoading} isError={isError} className="lg:col-span-1">
          {report && <p className="text-sm leading-relaxed text-foreground">{report.bearishScenario}</p>}
        </Panel>
        <Panel title="Reasoning" isLoading={isLoading} isError={isError} className="lg:col-span-1">
          {report && <p className="text-sm leading-relaxed text-foreground">{report.reasoning}</p>}
        </Panel>

        <Panel title="Trade Plan" isLoading={isLoading} isError={isError} className="lg:col-span-2">
          {report && (
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              <MetricCard
                label="Entry Condition"
                value={report.tradePlan.entryCondition}
                className="col-span-2 sm:col-span-4"
              />
              <MetricCard
                label="Target 1"
                value={`$${formatPrice(report.tradePlan.targets[0])}`}
                tone="bull"
              />
              <MetricCard
                label="Target 2"
                value={`$${formatPrice(report.tradePlan.targets[1])}`}
                tone="bull"
              />
              <MetricCard
                label="Invalidation"
                value={`$${formatPrice(report.tradePlan.invalidation)}`}
                tone="bear"
              />
              <MetricCard label="Risk Note" value={report.tradePlan.riskNote} />
            </div>
          )}
        </Panel>

        <Panel title="Warnings" isLoading={isLoading} isError={isError}>
          {report && (
            <ul className="space-y-2">
              {report.warnings.length === 0 && (
                <li className="text-xs text-muted-foreground">No active warnings.</li>
              )}
              {report.warnings.map((w) => (
                <li key={w} className="flex items-start gap-2 text-xs text-wait">
                  <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                  {w}
                </li>
              ))}
            </ul>
          )}
        </Panel>

        <Panel
          title="Reasoning Engine Scorecard"
          isLoading={isLoading}
          isError={isError}
          className="lg:col-span-3"
          noPadding
          action={
            report && (
              <Badge variant={report.bias === "PUTS" ? "bear" : report.bias === "WAIT" ? "wait" : "bull"}>
                Total {total}/10 → {report.bias}
              </Badge>
            )
          }
        >
          <DataTable columns={columns} rows={report?.factorScores ?? []} rowKey={(r) => r.factor} />
        </Panel>
      </div>
    </div>
  );
}
