"use client";

import type { QuoteSourceState, VwapMetricState } from "@spy-copilot/shared";
import { ChartContainer } from "@/components/panels/chart-container";
import { Panel } from "@/components/panels/panel";
import { Badge } from "@/components/ui/badge";
import { CANDLE_TRANSPORT_WARNING, useDisplaySpyCandles } from "@/hooks/use-spy-candles";
import {
  RTH_VWAP_TRANSPORT_WARNING,
  useDisplaySpyRthVwap,
} from "@/hooks/use-spy-rth-vwap";
import { useMarketSnapshot } from "@/hooks/use-market-snapshot";

/** Candle-dataset-scoped labels — never a bare LIVE that could describe the whole dashboard. */
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

export function LiveChart() {
  const { display, isLoading, isError } = useDisplaySpyCandles();
  const { display: vwapDisplay } = useDisplaySpyRthVwap();
  const { data: snapshot } = useMarketSnapshot();
  const isMockCandles = display?.response.sourceState === "MOCK";

  // Never draw a MOCK VWAP over LIVE/STALE provider candles, or a provider
  // VWAP over mock candles. The two independent query lifecycles must agree on
  // provenance before the overlay is composed.
  const vwapSeries =
    display &&
    vwapDisplay &&
    ((isMockCandles && vwapDisplay.response.metricState === "MOCK") ||
      (!isMockCandles &&
        (vwapDisplay.response.metricState === "LIVE" ||
          vwapDisplay.response.metricState === "STALE")))
      ? vwapDisplay.chartSeries
      : undefined;

  return (
    <Panel
      title="Live Chart · 5m"
      isLoading={isLoading}
      isError={isError}
      className="lg:col-span-2"
      noPadding
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
  );
}
