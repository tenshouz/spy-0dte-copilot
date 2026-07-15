"use client";

import type { QuoteSourceState, VwapMetricState } from "@spy-copilot/shared";
import { PageHeader } from "@/components/layout/page-header";
import { ChartContainer } from "@/components/panels/chart-container";
import { DataTable, type DataTableColumn } from "@/components/panels/data-table";
import { MetricCard } from "@/components/panels/metric-card";
import { Panel } from "@/components/panels/panel";
import { Badge } from "@/components/ui/badge";
import { useMarketSnapshot } from "@/hooks/use-market-snapshot";
import { CANDLE_TRANSPORT_WARNING, useDisplaySpyCandles } from "@/hooks/use-spy-candles";
import {
  RTH_VWAP_TRANSPORT_WARNING,
  useDisplaySpyRthVwap,
} from "@/hooks/use-spy-rth-vwap";
import { formatPrice, formatVolume } from "@/lib/format";

const SOURCE_BADGE: Record<QuoteSourceState, { variant: "bull" | "wait" | "bear"; label: string }> = {
  LIVE: { variant: "bull", label: "SPY LIVE" },
  STALE: { variant: "wait", label: "SPY STALE" },
  MOCK: { variant: "bear", label: "SPY MOCK" },
};

const VWAP_BADGE: Record<VwapMetricState, { variant: "bull" | "wait" | "bear"; label: string }> = {
  LIVE: { variant: "bull", label: "VWAP LIVE" },
  STALE: { variant: "wait", label: "VWAP STALE" },
  MOCK: { variant: "bear", label: "VWAP MOCK" },
  UNAVAILABLE: { variant: "wait", label: "VWAP UNAVAILABLE" },
};

interface StructureRow {
  label: string;
  value: string;
}

export default function MarketDataPage() {
  const { data: snapshot, isLoading, isError } = useMarketSnapshot();
  const { display, isLoading: candlesLoading, isError: candlesError } = useDisplaySpyCandles();
  const { display: vwapDisplay } = useDisplaySpyRthVwap();
  const isMockCandles = display?.response.sourceState === "MOCK";

  const vwapSeries =
    display &&
    vwapDisplay &&
    ((isMockCandles && vwapDisplay.response.metricState === "MOCK") ||
      (!isMockCandles &&
        (vwapDisplay.response.metricState === "LIVE" ||
          vwapDisplay.response.metricState === "STALE")))
      ? vwapDisplay.chartSeries
      : undefined;

  const columns: DataTableColumn<StructureRow>[] = [
    { key: "label", header: "Level", render: (r) => r.label },
    { key: "value", header: "Price", align: "right", render: (r) => r.value },
  ];

  const rows: StructureRow[] = [];
  if (snapshot) {
    rows.push(
      { label: "Overnight High · MOCK", value: `$${formatPrice(snapshot.overnightHigh ?? 0)}` },
      { label: "Overnight Low · MOCK", value: `$${formatPrice(snapshot.overnightLow ?? 0)}` },
      { label: "Premarket High · MOCK", value: `$${formatPrice(snapshot.premarketHigh ?? 0)}` },
      { label: "Premarket Low · MOCK", value: `$${formatPrice(snapshot.premarketLow ?? 0)}` },
      { label: "Opening Range High · MOCK", value: `$${formatPrice(snapshot.openingRangeHigh ?? 0)}` },
      { label: "Opening Range Low · MOCK", value: `$${formatPrice(snapshot.openingRangeLow ?? 0)}` },
    );
  }
  if (vwapDisplay) {
    const value =
      vwapDisplay.response.latestVwap === null
        ? "Unavailable until RTH"
        : `$${formatPrice(vwapDisplay.response.latestVwap)}`;
    rows.push({ label: `RTH VWAP · ${vwapDisplay.response.metricState}`, value });
  }

  return (
    <div className="mx-auto max-w-[1600px]">
      <PageHeader
        title="Market Data"
        description="SPY candles and RTH VWAP are live from Schwab when available; remaining structure levels and advanced analytics are still mock."
      />

      <div className="grid grid-cols-1 gap-3 lg:grid-cols-4">
        <Panel
          title="Price Chart · 5m"
          isLoading={candlesLoading}
          isError={candlesError}
          noPadding
          className="lg:col-span-3"
          action={
            display && (
              <div className="flex items-center gap-2">
                <Badge variant={SOURCE_BADGE[display.response.sourceState].variant}>
                  {SOURCE_BADGE[display.response.sourceState].label}
                </Badge>
                {vwapDisplay && (
                  <Badge variant={VWAP_BADGE[vwapDisplay.response.metricState].variant}>
                    {VWAP_BADGE[vwapDisplay.response.metricState].label}
                  </Badge>
                )}
              </div>
            )
          }
        >
          {display && (
            <div>
              <ChartContainer
                candles={display.chartCandles}
                vwapSeries={vwapSeries}
                openingRangeHigh={isMockCandles ? snapshot?.openingRangeHigh : undefined}
                openingRangeLow={isMockCandles ? snapshot?.openingRangeLow : undefined}
                previousClose={isMockCandles && snapshot ? snapshot.spotPrice - 2.1 : undefined}
                previousHigh={isMockCandles && snapshot ? snapshot.spotPrice + 1.4 : undefined}
                previousLow={isMockCandles && snapshot ? snapshot.spotPrice - 4.8 : undefined}
                showDerivedSessionExtremes={isMockCandles}
                height={420}
              />
              {display.transportFailed && (
                <p className="px-4 pb-3 text-xs text-wait">{CANDLE_TRANSPORT_WARNING}</p>
              )}
              {vwapDisplay?.transportFailed && (
                <p className="px-4 pb-3 text-xs text-wait">{RTH_VWAP_TRANSPORT_WARNING}</p>
              )}
            </div>
          )}
        </Panel>

        <Panel title="Structure Levels" isLoading={isLoading} isError={isError}>
          <DataTable columns={columns} rows={rows} rowKey={(r) => r.label} />
        </Panel>

        <Panel title="Trend & Volume" isLoading={isLoading} isError={isError} className="lg:col-span-2">
          {snapshot && (
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              <MetricCard label="5m Trend" value={snapshot.trend5m} />
              <MetricCard label="1m Trend" value={snapshot.trend1m} />
              <MetricCard label="EMA Trend" value={snapshot.emaTrend} />
              <MetricCard label="Rel. Volume" value={`${snapshot.relativeVolume.toFixed(2)}x`} />
              <MetricCard label="Volume" value={formatVolume(snapshot.volume)} className="col-span-2" />
              <MetricCard
                label="Expiration"
                value={snapshot.isZeroDte ? "0DTE" : "Nearest ≤ 2d"}
                className="col-span-2"
              />
            </div>
          )}
        </Panel>

        <Panel title="IV Rank" isLoading={isLoading} isError={isError}>
          {snapshot && (
            <div className="flex h-full flex-col items-center justify-center gap-1 text-center">
              <span className="font-mono text-2xl font-bold tabular">{snapshot.ivRank ?? "—"}</span>
              <span className="text-xs text-muted-foreground">IV Rank (0–100)</span>
            </div>
          )}
        </Panel>
      </div>
    </div>
  );
}
