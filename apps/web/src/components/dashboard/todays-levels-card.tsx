"use client";

import { Panel } from "@/components/panels/panel";
import { MetricCard } from "@/components/panels/metric-card";
import { useMarketSnapshot } from "@/hooks/use-market-snapshot";
import { formatPrice } from "@/lib/format";

export function TodaysLevelsCard() {
  const { data: snapshot, isLoading, isError } = useMarketSnapshot();

  return (
    <Panel title="Today's Levels" isLoading={isLoading} isError={isError} className="lg:col-span-2">
      {snapshot && (
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
          <MetricCard label="Overnight High" value={`$${formatPrice(snapshot.overnightHigh ?? 0)}`} />
          <MetricCard label="Overnight Low" value={`$${formatPrice(snapshot.overnightLow ?? 0)}`} />
          <MetricCard label="Premarket High" value={`$${formatPrice(snapshot.premarketHigh ?? 0)}`} />
          <MetricCard label="Premarket Low" value={`$${formatPrice(snapshot.premarketLow ?? 0)}`} />
          <MetricCard label="Opening Range High" value={`$${formatPrice(snapshot.openingRangeHigh ?? 0)}`} />
          <MetricCard label="Opening Range Low" value={`$${formatPrice(snapshot.openingRangeLow ?? 0)}`} />
        </div>
      )}
    </Panel>
  );
}
