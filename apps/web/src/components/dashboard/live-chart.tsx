"use client";

import { ChartContainer } from "@/components/panels/chart-container";
import { Panel } from "@/components/panels/panel";
import { useCandles, useMarketSnapshot } from "@/hooks/use-market-snapshot";

export function LiveChart() {
  const { data: candles, isLoading: candlesLoading, isError: candlesError } = useCandles();
  const { data: snapshot } = useMarketSnapshot();

  return (
    <Panel
      title="Live Chart · 5m"
      isLoading={candlesLoading}
      isError={candlesError}
      className="lg:col-span-2"
      noPadding
    >
      {candles && (
        <ChartContainer
          candles={candles}
          vwap={snapshot?.vwap}
          openingRangeHigh={snapshot?.openingRangeHigh}
          openingRangeLow={snapshot?.openingRangeLow}
        />
      )}
    </Panel>
  );
}
