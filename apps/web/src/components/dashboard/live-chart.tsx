"use client";

import type {
  QuoteSourceState,
  SessionLevelValue,
  VwapMetricState,
} from "@spy-copilot/shared";
import { ChartContainer } from "@/components/panels/chart-container";
import { Panel } from "@/components/panels/panel";
import { Badge } from "@/components/ui/badge";
import { CANDLE_TRANSPORT_WARNING, useDisplaySpyCandles } from "@/hooks/use-spy-candles";
import {
  OPENING_RANGE_TRANSPORT_WARNING,
  useDisplaySpyOpeningRange,
} from "@/hooks/use-spy-opening-range";
import {
  SESSION_LEVELS_TRANSPORT_WARNING,
  useDisplaySpySessionLevels,
} from "@/hooks/use-spy-session-levels";
import {
  SESSION_STRUCTURE_TRANSPORT_WARNING,
  useDisplaySpyDeterministicSessionStructure,
} from "@/hooks/use-spy-session-structure";
import {
  RTH_VWAP_TRANSPORT_WARNING,
  useDisplaySpyRthVwap,
} from "@/hooks/use-spy-rth-vwap";
import {
  getEasternMarketDate,
  getSessionStructureReferenceLines,
} from "@/lib/session-structure-view";

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

function renderableLevel(level: SessionLevelValue): number | undefined {
  return (level.state === "LIVE" || level.state === "STALE") && level.value !== null
    ? level.value
    : undefined;
}

export function LiveChart() {
  const { display, isLoading, isError } = useDisplaySpyCandles();
  const { display: vwapDisplay } = useDisplaySpyRthVwap();
  const { display: levelsDisplay } = useDisplaySpySessionLevels();
  const { display: openingRangeDisplay } = useDisplaySpyOpeningRange();
  const sessionStructureQuery = useDisplaySpyDeterministicSessionStructure();
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

  // Core session levels target the current New York market date. Before that
  // date has any defined-session candles, the chart may still be showing the
  // prior completed day; do not draw today's previous-session references over
  // the wrong chart date.
  const canRenderRealLevels =
    Boolean(display && levelsDisplay) &&
    !isMockCandles &&
    levelsDisplay!.response.candleSourceState !== "MOCK" &&
    levelsDisplay!.response.currentMarketDateHasDefinedSessionData;
  const levels = canRenderRealLevels ? levelsDisplay!.response : null;

  const openingRange =
    display &&
    openingRangeDisplay &&
    !isMockCandles &&
    (openingRangeDisplay.response.metricState === "LIVE" ||
      openingRangeDisplay.response.metricState === "STALE")
      ? openingRangeDisplay.response
      : null;

  // Pivots and alternate opening ranges are current-market-date references.
  // Do not overlay them when the chart has fallen back to a prior session
  // (weekends, holidays, or before current-date candles exist).
  const sessionStructure = sessionStructureQuery.display?.response ?? null;
  const chartMarketDate = getEasternMarketDate(display?.response.latestCandleAt ?? null);
  const additionalPriceLines =
    display &&
    !isMockCandles &&
    sessionStructure &&
    chartMarketDate === sessionStructure.currentMarketDate
      ? getSessionStructureReferenceLines(sessionStructure)
      : [];

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
            openingRangeHigh={openingRange?.openingRangeHigh ?? undefined}
            openingRangeLow={openingRange?.openingRangeLow ?? undefined}
            premarketHigh={levels ? renderableLevel(levels.premarketHigh) : undefined}
            premarketLow={levels ? renderableLevel(levels.premarketLow) : undefined}
            previousClose={levels ? renderableLevel(levels.previousDayClose) : undefined}
            previousHigh={levels ? renderableLevel(levels.previousDayHigh) : undefined}
            previousLow={levels ? renderableLevel(levels.previousDayLow) : undefined}
            additionalPriceLines={additionalPriceLines}
            showDerivedSessionExtremes={false}
          />
          {display.transportFailed && (
            <p className="px-4 pb-3 text-xs text-wait">{CANDLE_TRANSPORT_WARNING}</p>
          )}
          {vwapDisplay?.transportFailed && (
            <p className="px-4 pb-3 text-xs text-wait">{RTH_VWAP_TRANSPORT_WARNING}</p>
          )}
          {levelsDisplay?.transportFailed && (
            <p className="px-4 pb-3 text-xs text-wait">{SESSION_LEVELS_TRANSPORT_WARNING}</p>
          )}
          {openingRangeDisplay?.transportFailed && (
            <p className="px-4 pb-3 text-xs text-wait">{OPENING_RANGE_TRANSPORT_WARNING}</p>
          )}
          {sessionStructureQuery.display?.transportFailed && (
            <p className="px-4 pb-3 text-xs text-wait">
              {SESSION_STRUCTURE_TRANSPORT_WARNING}
            </p>
          )}
        </div>
      )}
    </Panel>
  );
}
