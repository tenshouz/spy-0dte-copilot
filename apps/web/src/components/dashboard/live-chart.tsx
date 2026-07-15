"use client";

import type { QuoteSourceState } from "@spy-copilot/shared";
import { ChartContainer } from "@/components/panels/chart-container";
import { Panel } from "@/components/panels/panel";
import { Badge } from "@/components/ui/badge";
import { CANDLE_TRANSPORT_WARNING, useDisplaySpyCandles } from "@/hooks/use-spy-candles";
import { useMarketSnapshot } from "@/hooks/use-market-snapshot";

/** Candle-dataset-scoped labels — never a bare LIVE that could describe the whole dashboard. */
const SOURCE_BADGE: Record<QuoteSourceState, { variant: "bull" | "wait" | "bear"; label: string }> = {
  LIVE: { variant: "bull", label: "SPY LIVE" },
  STALE: { variant: "wait", label: "SPY STALE" },
  MOCK: { variant: "bear", label: "SPY MOCK" },
};

export function LiveChart() {
  const { display, isLoading, isError } = useDisplaySpyCandles();
  const { data: snapshot } = useMarketSnapshot();
  const isMockCandles = display?.response.sourceState === "MOCK";

  return (
    <Panel
      title="Live Chart · 5m"
      isLoading={isLoading}
      isError={isError}
      className="lg:col-span-2"
      noPadding
      action={
        display && (
          <Badge variant={SOURCE_BADGE[display.response.sourceState].variant}>
            {SOURCE_BADGE[display.response.sourceState].label}
          </Badge>
        )
      }
    >
      {display && (
        <div>
          <ChartContainer
            candles={display.chartCandles}
            vwap={isMockCandles ? snapshot?.vwap : undefined}
            openingRangeHigh={isMockCandles ? snapshot?.openingRangeHigh : undefined}
            openingRangeLow={isMockCandles ? snapshot?.openingRangeLow : undefined}
            previousClose={isMockCandles && snapshot ? snapshot.spotPrice - 2.1 : undefined}
            previousHigh={isMockCandles && snapshot ? snapshot.spotPrice + 1.4 : undefined}
            previousLow={isMockCandles && snapshot ? snapshot.spotPrice - 4.8 : undefined}
            showDerivedSessionExtremes={isMockCandles}
          />
          {display.transportFailed && (
            <p className="px-4 pb-3 text-xs text-wait">{CANDLE_TRANSPORT_WARNING}</p>
          )}
        </div>
      )}
    </Panel>
  );
}
