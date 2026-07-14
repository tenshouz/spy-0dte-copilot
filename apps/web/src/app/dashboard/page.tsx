"use client";

import { BiasCard } from "@/components/dashboard/bias-card";
import { ConfidenceCard } from "@/components/dashboard/confidence-card";
import { CurrentPriceCard } from "@/components/dashboard/current-price-card";
import { LiveChart } from "@/components/dashboard/live-chart";
import { MarketRegimeCard } from "@/components/dashboard/market-regime-card";
import { SessionTimeline } from "@/components/dashboard/session-timeline";
import { TodaysLevelsCard } from "@/components/dashboard/todays-levels-card";
import { MetricCard } from "@/components/panels/metric-card";
import { Panel } from "@/components/panels/panel";
import { PageHeader } from "@/components/layout/page-header";
import { useMarketSnapshot } from "@/hooks/use-market-snapshot";
import { useLatestReport } from "@/hooks/use-report";
import { formatCompactCurrency, formatPrice } from "@/lib/format";

export default function DashboardPage() {
  const { data: snapshot, isLoading: snapshotLoading, isError: snapshotError } = useMarketSnapshot();
  const { data: report, isLoading: reportLoading, isError: reportError } = useLatestReport();

  return (
    <div className="mx-auto max-w-[1600px]">
      <PageHeader
        title="Dashboard"
        description="If I had no position right now, should I buy Calls, buy Puts, or stay out?"
      />

      <div className="grid grid-cols-1 gap-3 sm:gap-4 lg:grid-cols-4">
        <CurrentPriceCard />
        <BiasCard />
        <ConfidenceCard />
        <MarketRegimeCard />

        <Panel
          title="Support / Resistance"
          isLoading={snapshotLoading}
          isError={snapshotError}
          className="lg:col-span-1"
        >
          {snapshot && (
            <div className="grid grid-cols-1 gap-2">
              <MetricCard label="Call Wall" value={`$${formatPrice(snapshot.callWall ?? 0)}`} tone="bear" />
              <MetricCard label="Gamma Flip" value={`$${formatPrice(snapshot.gammaFlip ?? 0)}`} />
              <MetricCard label="Put Wall" value={`$${formatPrice(snapshot.putWall ?? 0)}`} tone="bull" />
            </div>
          )}
        </Panel>

        <TodaysLevelsCard />

        <Panel
          title="Expected Move"
          isLoading={snapshotLoading}
          isError={snapshotError}
          className="lg:col-span-1"
        >
          {snapshot && (
            <div className="flex h-full flex-col items-center justify-center gap-1 text-center">
              <span className="font-mono text-2xl font-bold tabular">
                ± ${formatPrice(snapshot.expectedMove)}
              </span>
              <span className="text-xs text-muted-foreground">
                {(((snapshot.expectedMove / snapshot.spotPrice) * 100) || 0).toFixed(2)}% of spot
              </span>
            </div>
          )}
        </Panel>

        <Panel
          title="GEX / DEX"
          isLoading={snapshotLoading}
          isError={snapshotError}
          className="lg:col-span-1"
        >
          {snapshot && (
            <div className="grid grid-cols-1 gap-2">
              <MetricCard label="Net GEX" value={formatCompactCurrency(snapshot.netGex)} tone="bull" />
              <MetricCard label="Net DEX" value={formatCompactCurrency(snapshot.netDex)} tone="bull" />
              <MetricCard
                label="Dealer Positioning"
                value={snapshot.dealerPositioning.replace(/_/g, " ")}
              />
            </div>
          )}
        </Panel>

        <LiveChart />

        <Panel title="Trade Plan" isLoading={reportLoading} isError={reportError} className="lg:col-span-2">
          {report && (
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              <MetricCard label="Entry" value={report.tradePlan.entryCondition} className="col-span-2 sm:col-span-4" />
              <MetricCard
                label="Targets"
                value={`$${formatPrice(report.tradePlan.targets[0])} / $${formatPrice(report.tradePlan.targets[1])}`}
                tone={report.bias === "PUTS" ? "bear" : "bull"}
              />
              <MetricCard
                label="Invalidation"
                value={`$${formatPrice(report.tradePlan.invalidation)}`}
                tone={report.bias === "PUTS" ? "bull" : "bear"}
              />
              <MetricCard label="Risk Note" value={report.tradePlan.riskNote} className="col-span-2" />
            </div>
          )}
        </Panel>

        <div className="lg:col-span-4">
          <SessionTimeline />
        </div>
      </div>
    </div>
  );
}
