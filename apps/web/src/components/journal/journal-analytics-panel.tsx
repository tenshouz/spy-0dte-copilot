"use client";

import type { DeterministicJournalAnalyticsBreakdownEntry } from "@spy-copilot/shared";
import { BarChart3, Database } from "lucide-react";
import { MetricCard } from "@/components/panels/metric-card";
import { Panel } from "@/components/panels/panel";
import { Badge } from "@/components/ui/badge";
import { useDeterministicJournalAnalytics } from "@/hooks/use-journal";
import {
  analyticsMoneyTone,
  analyticsReasonCopy,
  formatAnalyticsMoney,
  formatAnalyticsPercent,
  formatProfitFactor,
  visibleBreakdownRows,
} from "@/lib/deterministic-journal-analytics-view";

function BreakdownTable({
  title,
  rows,
}: {
  title: string;
  rows: readonly DeterministicJournalAnalyticsBreakdownEntry[];
}) {
  const visibleRows = visibleBreakdownRows(rows);
  return (
    <div className="overflow-hidden rounded-md border border-panel-border bg-background/30">
      <div className="border-b border-panel-border px-3 py-2 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
        {title}
      </div>
      {visibleRows.length === 0 ? (
        <div className="px-3 py-4 text-center text-xs text-muted-foreground">
          No populated categories yet.
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[520px] text-left text-xs">
            <thead className="text-[10px] uppercase tracking-wide text-muted-foreground">
              <tr className="border-b border-panel-border">
                <th className="px-3 py-2 font-medium">Category</th>
                <th className="px-3 py-2 text-right font-medium">Snapshots</th>
                <th className="px-3 py-2 text-right font-medium">Trades</th>
                <th className="px-3 py-2 text-right font-medium">W / L / BE</th>
                <th className="px-3 py-2 text-right font-medium">Win rate</th>
                <th className="px-3 py-2 text-right font-medium">P&amp;L</th>
              </tr>
            </thead>
            <tbody>
              {visibleRows.map((row) => (
                <tr key={row.key} className="border-b border-panel-border/70 last:border-0">
                  <td className="px-3 py-2 font-medium">{row.label}</td>
                  <td className="px-3 py-2 text-right font-mono">{row.snapshotCount}</td>
                  <td className="px-3 py-2 text-right font-mono">{row.tradeCount}</td>
                  <td className="px-3 py-2 text-right font-mono">
                    {row.wins} / {row.losses} / {row.breakevens}
                  </td>
                  <td className="px-3 py-2 text-right font-mono">
                    {formatAnalyticsPercent(row.winRatePercent)}
                  </td>
                  <td className="px-3 py-2 text-right font-mono">
                    {formatAnalyticsMoney(row.totalPnlDollars)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

export function JournalAnalyticsPanel() {
  const query = useDeterministicJournalAnalytics();
  const response = query.data ?? null;
  const analytics = response?.analytics ?? null;

  return (
    <Panel
      title="Journal Performance Analytics"
      className="mb-3"
      action={
        <Badge variant={response?.engineState === "AVAILABLE" ? "bull" : "default"}>
          {response?.engineState ?? (query.isLoading ? "Loading" : "Unavailable")}
        </Badge>
      }
      isLoading={query.isLoading}
      isError={query.isError}
    >
      {response && analytics ? (
        <div className="space-y-4">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
            <div className="flex items-start gap-2">
              <BarChart3 className="mt-0.5 h-4 w-4 text-accent" />
              <div>
                <p className="text-sm font-semibold">User-reviewed, database-backed results</p>
                <p className="mt-1 max-w-3xl text-xs leading-relaxed text-muted-foreground">
                  Unreviewed and no-trade snapshots are excluded from realized P&amp;L.
                  Win rate excludes breakevens; expectancy includes them. Every outcome
                  remains explicitly user-entered.
                </p>
              </div>
            </div>
            <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
              <Database className="h-3.5 w-3.5" />
              {analytics.dataStartMarketDate && analytics.dataEndMarketDate
                ? `${analytics.dataStartMarketDate} → ${analytics.dataEndMarketDate}`
                : "No saved history"}
            </div>
          </div>

          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-7">
            <MetricCard
              label="Review coverage"
              value={formatAnalyticsPercent(analytics.performance.reviewCoveragePercent)}
              sublabel={`${analytics.counts.reviewedSnapshots} of ${analytics.counts.totalSnapshots} snapshots`}
            />
            <MetricCard
              label="Trade outcomes"
              value={analytics.counts.tradeOutcomes}
              sublabel={`${analytics.counts.noTradeSnapshots} no-trade reviews`}
            />
            <MetricCard
              label="Win rate"
              value={formatAnalyticsPercent(analytics.performance.winRatePercent)}
              sublabel={`${analytics.counts.wins}W / ${analytics.counts.losses}L / ${analytics.counts.breakevens}BE`}
            />
            <MetricCard
              label="Total P&L"
              value={formatAnalyticsMoney(analytics.performance.totalPnlDollars)}
              tone={analyticsMoneyTone(analytics.performance.totalPnlDollars)}
              sublabel="Reviewed trades only"
            />
            <MetricCard
              label="Expectancy"
              value={formatAnalyticsMoney(analytics.performance.expectancyDollars)}
              tone={analyticsMoneyTone(analytics.performance.expectancyDollars)}
              sublabel="Average per reviewed trade"
            />
            <MetricCard
              label="Profit factor"
              value={formatProfitFactor(analytics.performance.profitFactor)}
              sublabel="Gross wins ÷ gross losses"
            />
            <MetricCard
              label="Average W / L"
              value={`${formatAnalyticsMoney(analytics.performance.averageWinDollars)} / ${formatAnalyticsMoney(analytics.performance.averageLossDollars)}`}
              sublabel={`Largest ${formatAnalyticsMoney(analytics.performance.largestWinDollars)} / ${formatAnalyticsMoney(analytics.performance.largestLossDollars)}`}
            />
          </div>

          <div className="rounded-md border border-panel-border bg-background/30 px-3 py-2 text-xs text-muted-foreground">
            {analyticsReasonCopy(response.primaryReasonCode)}
          </div>

          <div className="grid gap-3 xl:grid-cols-2">
            <BreakdownTable title="Performance by direction" rows={analytics.byDirection} />
            <BreakdownTable title="Performance by confidence" rows={analytics.byConfidenceBand} />
            <BreakdownTable title="Performance by plan state" rows={analytics.byPlanState} />
            <BreakdownTable title="Performance by capture mode" rows={analytics.byCaptureMode} />
          </div>

          <div className="overflow-hidden rounded-md border border-panel-border bg-background/30">
            <div className="border-b border-panel-border px-3 py-2 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
              Recent daily performance · latest 30 market dates
            </div>
            {analytics.dailyPerformance.length === 0 ? (
              <div className="px-3 py-4 text-center text-xs text-muted-foreground">
                No daily journal history yet.
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[680px] text-left text-xs">
                  <thead className="text-[10px] uppercase tracking-wide text-muted-foreground">
                    <tr className="border-b border-panel-border">
                      <th className="px-3 py-2 font-medium">Market date</th>
                      <th className="px-3 py-2 text-right font-medium">Snapshots</th>
                      <th className="px-3 py-2 text-right font-medium">Reviewed</th>
                      <th className="px-3 py-2 text-right font-medium">No trade</th>
                      <th className="px-3 py-2 text-right font-medium">W / L / BE</th>
                      <th className="px-3 py-2 text-right font-medium">P&amp;L</th>
                    </tr>
                  </thead>
                  <tbody>
                    {analytics.dailyPerformance.map((row) => (
                      <tr key={row.marketDate} className="border-b border-panel-border/70 last:border-0">
                        <td className="px-3 py-2 font-mono">{row.marketDate}</td>
                        <td className="px-3 py-2 text-right font-mono">{row.snapshotCount}</td>
                        <td className="px-3 py-2 text-right font-mono">{row.reviewedCount}</td>
                        <td className="px-3 py-2 text-right font-mono">{row.noTradeCount}</td>
                        <td className="px-3 py-2 text-right font-mono">
                          {row.wins} / {row.losses} / {row.breakevens}
                        </td>
                        <td className="px-3 py-2 text-right font-mono">
                          {formatAnalyticsMoney(row.totalPnlDollars)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      ) : response ? (
        <div className="rounded-md border border-wait/30 bg-wait-muted px-3 py-3 text-xs text-wait">
          {analyticsReasonCopy(response.primaryReasonCode)}
        </div>
      ) : null}
    </Panel>
  );
}
