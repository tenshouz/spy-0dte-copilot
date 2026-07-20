"use client";

import type {
  MarketContextState,
  MarketStateEngineState,
  QuoteSourceState,
  SessionLevelValue,
  SpyOpeningRangeResponse,
  SpyRthGapResponse,
  VwapMetricState,
} from "@spy-copilot/shared";
import { ExposureStructurePanel } from "@/components/dashboard/exposure-structure-panel";
import { SessionStructurePanel } from "@/components/dashboard/session-structure-panel";
import { PageHeader } from "@/components/layout/page-header";
import { ChartContainer } from "@/components/panels/chart-container";
import { DataTable, type DataTableColumn } from "@/components/panels/data-table";
import { MetricCard } from "@/components/panels/metric-card";
import { Panel } from "@/components/panels/panel";
import { Badge } from "@/components/ui/badge";
import { CANDLE_TRANSPORT_WARNING, useDisplaySpyCandles } from "@/hooks/use-spy-candles";
import { useDisplaySpyZeroDteExposureStructure } from "@/hooks/use-spy-exposure-structure";
import {
  MARKET_CONTEXT_TRANSPORT_WARNING,
  useDisplaySpyZeroDteMarketContext,
} from "@/hooks/use-spy-market-context";
import {
  MARKET_STATE_TRANSPORT_WARNING,
  useDisplaySpyZeroDteDeterministicMarketState,
} from "@/hooks/use-spy-market-state";
import {
  OPENING_RANGE_TRANSPORT_WARNING,
  useDisplaySpyOpeningRange,
} from "@/hooks/use-spy-opening-range";
import { QUOTE_TRANSPORT_WARNING, useDisplaySpyQuote } from "@/hooks/use-spy-quote";
import {
  RTH_GAP_TRANSPORT_WARNING,
  useDisplaySpyRthGap,
} from "@/hooks/use-spy-rth-gap";
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
import { getExposureStructureReferenceLines } from "@/lib/exposure-structure-view";
import { formatEasternTime, formatPrice, formatSigned, formatVolume } from "@/lib/format";
import {
  formatDeterministicState,
  formatFeatureStatus,
  formatOptionalPoints,
  summarizeMarketContextCoverage,
} from "@/lib/market-data-deterministic-view";
import {
  getEasternMarketDate,
  getSessionStructureReferenceLines,
} from "@/lib/session-structure-view";

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

const CONTEXT_BADGE: Record<MarketContextState, { variant: "bull" | "wait" | "bear"; label: string }> = {
  READY: { variant: "bull", label: "CONTEXT READY" },
  DEGRADED: { variant: "wait", label: "CONTEXT DEGRADED" },
  UNAVAILABLE: { variant: "bear", label: "CONTEXT UNAVAILABLE" },
};

const ENGINE_BADGE: Record<MarketStateEngineState, { variant: "bull" | "wait" | "bear"; label: string }> = {
  AVAILABLE: { variant: "bull", label: "STATE AVAILABLE" },
  PARTIAL: { variant: "wait", label: "STATE PARTIAL" },
  UNAVAILABLE: { variant: "bear", label: "STATE UNAVAILABLE" },
};

interface StructureLevelRow {
  label: string;
  value: string;
}

interface DeterministicFeatureRow {
  label: string;
  status: string;
  state: string;
  detail: string;
}

interface ComponentRow {
  component: string;
  status: string;
  provenance: string;
  warning: string;
}

function formatSessionLevel(level: SessionLevelValue): string {
  return level.value === null ? "Unavailable" : `$${formatPrice(level.value)}`;
}

function renderableLevel(level: SessionLevelValue): number | undefined {
  return (level.state === "LIVE" || level.state === "STALE") && level.value !== null
    ? level.value
    : undefined;
}

function formatGapValue(gap: SpyRthGapResponse): string {
  if (gap.gapPoints === null || gap.gapPercent === null) return "Unavailable";
  return `${formatSigned(gap.gapPoints)} pts / ${formatSigned(gap.gapPercent)}% · ${gap.direction}`;
}

function formatOpeningRangeValue(value: number | null, range: SpyOpeningRangeResponse): string {
  if (value === null) return "Unavailable";
  return `$${formatPrice(value)} · ${formatDeterministicState(range.phase)}`;
}

function formatGapFill(gap: SpyRthGapResponse): string {
  if (gap.firstObservedFillCandleAt) {
    return `${formatDeterministicState(gap.fillState)} · ${formatEasternTime(gap.firstObservedFillCandleAt)}`;
  }
  return formatDeterministicState(gap.fillState);
}

function valueOrDash(value: number | null | undefined, formatter: (value: number) => string): string {
  return value === null || value === undefined ? "—" : formatter(value);
}

export default function MarketDataPage() {
  const quoteQuery = useDisplaySpyQuote();
  const candleQuery = useDisplaySpyCandles();
  const vwapQuery = useDisplaySpyRthVwap();
  const gapQuery = useDisplaySpyRthGap();
  const openingRangeQuery = useDisplaySpyOpeningRange();
  const levelsQuery = useDisplaySpySessionLevels();
  const contextQuery = useDisplaySpyZeroDteMarketContext();
  const marketStateQuery = useDisplaySpyZeroDteDeterministicMarketState();
  const sessionStructureQuery = useDisplaySpyDeterministicSessionStructure();
  const exposureStructureQuery = useDisplaySpyZeroDteExposureStructure();

  const quote = quoteQuery.display?.quote ?? null;
  const candleDisplay = candleQuery.display;
  const candleResponse = candleDisplay?.response ?? null;
  const vwapDisplay = vwapQuery.display;
  const gapDisplay = gapQuery.display;
  const openingRangeDisplay = openingRangeQuery.display;
  const levelsDisplay = levelsQuery.display;
  const context = contextQuery.display?.response ?? null;
  const marketState = marketStateQuery.display?.response ?? null;
  const sessionStructure = sessionStructureQuery.display?.response ?? null;
  const exposureStructure = exposureStructureQuery.display?.response ?? null;

  const isMockCandles = candleResponse?.sourceState === "MOCK";
  const vwapSeries =
    candleDisplay &&
    vwapDisplay &&
    ((isMockCandles && vwapDisplay.response.metricState === "MOCK") ||
      (!isMockCandles &&
        (vwapDisplay.response.metricState === "LIVE" ||
          vwapDisplay.response.metricState === "STALE")))
      ? vwapDisplay.chartSeries
      : undefined;

  const canRenderRealLevels =
    Boolean(candleDisplay && levelsDisplay) &&
    !isMockCandles &&
    levelsDisplay!.response.candleSourceState !== "MOCK" &&
    levelsDisplay!.response.currentMarketDateHasDefinedSessionData;
  const levels = canRenderRealLevels ? levelsDisplay!.response : null;

  const openingRange =
    candleDisplay &&
    openingRangeDisplay &&
    !isMockCandles &&
    (openingRangeDisplay.response.metricState === "LIVE" ||
      openingRangeDisplay.response.metricState === "STALE")
      ? openingRangeDisplay.response
      : null;

  const chartMarketDate = getEasternMarketDate(candleResponse?.latestCandleAt ?? null);
  const sessionReferenceLines =
    candleDisplay &&
    !isMockCandles &&
    sessionStructure &&
    chartMarketDate === sessionStructure.currentMarketDate
      ? getSessionStructureReferenceLines(sessionStructure)
      : [];
  const exposureReferenceLines =
    candleDisplay &&
    !isMockCandles &&
    exposureStructure &&
    chartMarketDate === exposureStructure.currentMarketDate
      ? getExposureStructureReferenceLines(exposureStructure)
      : [];
  const additionalPriceLines = [...sessionReferenceLines, ...exposureReferenceLines];

  const structureColumns: DataTableColumn<StructureLevelRow>[] = [
    { key: "label", header: "Level", render: (row) => row.label },
    { key: "value", header: "Value", align: "right", render: (row) => row.value },
  ];

  const structureRows: StructureLevelRow[] = [];
  if (levelsDisplay) {
    const response = levelsDisplay.response;
    structureRows.push(
      {
        label: `Premarket High · ${response.premarketHigh.state}`,
        value: formatSessionLevel(response.premarketHigh),
      },
      {
        label: `Premarket Low · ${response.premarketLow.state}`,
        value: formatSessionLevel(response.premarketLow),
      },
      {
        label: `Previous-Day High · ${response.previousDayHigh.state}`,
        value: formatSessionLevel(response.previousDayHigh),
      },
      {
        label: `Previous-Day Low · ${response.previousDayLow.state}`,
        value: formatSessionLevel(response.previousDayLow),
      },
      {
        label: `Previous-Day Close · ${response.previousDayClose.state}`,
        value: formatSessionLevel(response.previousDayClose),
      },
    );
  }
  if (gapDisplay) {
    const gap = gapDisplay.response;
    structureRows.push(
      {
        label: `RTH Open · ${gap.metricState}`,
        value: gap.currentRthOpen === null ? "Unavailable" : `$${formatPrice(gap.currentRthOpen)}`,
      },
      { label: `RTH Gap · ${gap.metricState}`, value: formatGapValue(gap) },
      { label: `Gap Fill · ${gap.metricState}`, value: formatGapFill(gap) },
    );
  }
  if (openingRangeDisplay) {
    const range = openingRangeDisplay.response;
    structureRows.push(
      {
        label: `Opening Range High · ${range.metricState}`,
        value: formatOpeningRangeValue(range.openingRangeHigh, range),
      },
      {
        label: `Opening Range Low · ${range.metricState}`,
        value: formatOpeningRangeValue(range.openingRangeLow, range),
      },
    );
  }
  if (vwapDisplay) {
    structureRows.push({
      label: `RTH VWAP · ${vwapDisplay.response.metricState}`,
      value:
        vwapDisplay.response.latestVwap === null
          ? "Unavailable until RTH"
          : `$${formatPrice(vwapDisplay.response.latestVwap)}`,
    });
  }

  const featureColumns: DataTableColumn<DeterministicFeatureRow>[] = [
    { key: "label", header: "Feature", render: (row) => row.label },
    { key: "status", header: "Status", render: (row) => row.status },
    { key: "state", header: "State", render: (row) => row.state },
    { key: "detail", header: "Detail", align: "right", render: (row) => row.detail },
  ];

  const featureRows: DeterministicFeatureRow[] = marketState
    ? [
        {
          label: "Session Phase",
          status: formatFeatureStatus(marketState.features.sessionPhase.status),
          state: formatDeterministicState(marketState.features.sessionPhase.state),
          detail: marketState.features.sessionPhase.referenceDate ?? "—",
        },
        {
          label: "Price vs VWAP",
          status: formatFeatureStatus(marketState.features.priceVsVwap.status),
          state: formatDeterministicState(marketState.features.priceVsVwap.state),
          detail: formatOptionalPoints(marketState.features.priceVsVwap.derived.distancePoints),
        },
        {
          label: "Price vs Prior-Day Range",
          status: formatFeatureStatus(marketState.features.priceVsPriorDayRange.status),
          state: formatDeterministicState(marketState.features.priceVsPriorDayRange.state),
          detail: `High ${formatOptionalPoints(marketState.features.priceVsPriorDayRange.derived.distanceToHighPoints)} · Low ${formatOptionalPoints(marketState.features.priceVsPriorDayRange.derived.distanceToLowPoints)}`,
        },
        {
          label: "Price vs Premarket Range",
          status: formatFeatureStatus(marketState.features.priceVsPremarketRange.status),
          state: formatDeterministicState(marketState.features.priceVsPremarketRange.state),
          detail: `High ${formatOptionalPoints(marketState.features.priceVsPremarketRange.derived.distanceToHighPoints)} · Low ${formatOptionalPoints(marketState.features.priceVsPremarketRange.derived.distanceToLowPoints)}`,
        },
        {
          label: "Price vs Opening Range",
          status: formatFeatureStatus(marketState.features.priceVsOpeningRange.status),
          state: formatDeterministicState(marketState.features.priceVsOpeningRange.state),
          detail: `High ${formatOptionalPoints(marketState.features.priceVsOpeningRange.derived.distanceToHighPoints)} · Low ${formatOptionalPoints(marketState.features.priceVsOpeningRange.derived.distanceToLowPoints)}`,
        },
        {
          label: "RTH Gap Context",
          status: formatFeatureStatus(marketState.features.gapContext.status),
          state: formatDeterministicState(marketState.features.gapContext.state),
          detail: formatDeterministicState(marketState.features.gapContext.inputs.fillState),
        },
        {
          label: "Expected-Move Position",
          status: formatFeatureStatus(marketState.features.priceVsExpectedMoveRange.status),
          state: formatDeterministicState(marketState.features.priceVsExpectedMoveRange.state),
          detail: `Upper ${formatOptionalPoints(marketState.features.priceVsExpectedMoveRange.derived.distanceToUpperPoints)} · Lower ${formatOptionalPoints(marketState.features.priceVsExpectedMoveRange.derived.distanceToLowerPoints)}`,
        },
        {
          label: "Returned-Window Net GEX",
          status: formatFeatureStatus(marketState.features.netGexProxySign.status),
          state: formatDeterministicState(marketState.features.netGexProxySign.state),
          detail: `${marketState.features.netGexProxySign.inputs.eligibleStrikeCount} eligible strikes`,
        },
        {
          label: "Returned-Window Net DEX",
          status: formatFeatureStatus(marketState.features.netDexProxySign.status),
          state: formatDeterministicState(marketState.features.netDexProxySign.state),
          detail: `${marketState.features.netDexProxySign.inputs.eligibleStrikeCount} eligible strikes`,
        },
      ]
    : [];

  const coverage = summarizeMarketContextCoverage(context);
  const componentColumns: DataTableColumn<ComponentRow>[] = [
    { key: "component", header: "Component", render: (row) => row.component },
    { key: "status", header: "Status", render: (row) => row.status },
    { key: "provenance", header: "Source / Metric", render: (row) => row.provenance },
    { key: "warning", header: "Warning", align: "right", render: (row) => row.warning },
  ];
  const componentRows: ComponentRow[] = (context?.components ?? []).map((component) => ({
    component: formatDeterministicState(component.component),
    status: formatDeterministicState(component.status),
    provenance: [component.sourceState, component.metricState, component.coverageState]
      .filter((value): value is string => Boolean(value))
      .join(" / ") || "—",
    warning: component.warningCode ? formatDeterministicState(component.warningCode) : "—",
  }));

  const latestCandle = candleResponse?.candles[candleResponse.candles.length - 1] ?? null;

  return (
    <div className="mx-auto max-w-[1600px]">
      <PageHeader
        title="Market Data"
        description="Validated SPY quote, five-minute candles, session structure, unified context, and deterministic V1 features. Missing or inapplicable inputs remain explicitly unavailable."
      />

      <div className="grid grid-cols-1 gap-3 lg:grid-cols-4">
        <Panel
          title="Price Chart · 5m"
          isLoading={candleQuery.isLoading}
          isError={candleQuery.isError}
          noPadding
          className="lg:col-span-3"
          action={
            candleResponse && (
              <div className="flex items-center gap-2">
                <Badge variant={SOURCE_BADGE[candleResponse.sourceState].variant}>
                  {SOURCE_BADGE[candleResponse.sourceState].label}
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
          {candleDisplay && (
            <div>
              <ChartContainer
                candles={candleDisplay.chartCandles}
                vwapSeries={vwapSeries}
                openingRangeHigh={openingRange?.openingRangeHigh}
                openingRangeLow={openingRange?.openingRangeLow}
                premarketHigh={levels ? renderableLevel(levels.premarketHigh) : undefined}
                premarketLow={levels ? renderableLevel(levels.premarketLow) : undefined}
                previousClose={levels ? renderableLevel(levels.previousDayClose) : undefined}
                previousHigh={levels ? renderableLevel(levels.previousDayHigh) : undefined}
                previousLow={levels ? renderableLevel(levels.previousDayLow) : undefined}
                additionalPriceLines={additionalPriceLines}
                showDerivedSessionExtremes={false}
                height={420}
              />
              {candleDisplay.transportFailed && (
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

        <Panel
          title="Structure Levels"
          isLoading={levelsQuery.isLoading && gapQuery.isLoading && openingRangeQuery.isLoading}
          isError={levelsQuery.isError && gapQuery.isError && openingRangeQuery.isError}
        >
          <div className="space-y-2">
            {levelsDisplay && (
              <p className="text-xs text-muted-foreground">
                Current date: {levelsDisplay.response.currentMarketDate} · Previous RTH:{" "}
                {levelsDisplay.response.previousRthMarketDate ?? "Unavailable"}
              </p>
            )}
            <DataTable
              columns={structureColumns}
              rows={structureRows}
              rowKey={(row) => row.label}
              emptyMessage="No validated session levels are available."
            />
            {gapDisplay?.transportFailed && (
              <p className="text-xs text-wait">{RTH_GAP_TRANSPORT_WARNING}</p>
            )}
            {openingRangeDisplay?.transportFailed && (
              <p className="text-xs text-wait">{OPENING_RANGE_TRANSPORT_WARNING}</p>
            )}
          </div>
        </Panel>

        <SessionStructurePanel className="lg:col-span-4" />

        <ExposureStructurePanel className="lg:col-span-4" />

        <Panel
          title="Quote & Candle Context"
          isLoading={quoteQuery.isLoading && candleQuery.isLoading}
          isError={quoteQuery.isError && candleQuery.isError}
          className="lg:col-span-2"
          action={
            quote && (
              <Badge variant={SOURCE_BADGE[quote.sourceState].variant}>
                {SOURCE_BADGE[quote.sourceState].label}
              </Badge>
            )
          }
        >
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4">
            <MetricCard label="Last" value={valueOrDash(quote?.lastPrice, (value) => `$${formatPrice(value)}`)} />
            <MetricCard label="Bid" value={valueOrDash(quote?.bidPrice, (value) => `$${formatPrice(value)}`)} />
            <MetricCard label="Ask" value={valueOrDash(quote?.askPrice, (value) => `$${formatPrice(value)}`)} />
            <MetricCard label="Volume" value={quote?.volume == null ? "—" : formatVolume(quote.volume)} />
            <MetricCard label="Market Status" value={quote ? formatDeterministicState(quote.marketStatus) : "—"} />
            <MetricCard label="Quote Time" value={quote ? formatEasternTime(quote.quoteTimestamp) : "—"} />
            <MetricCard label="5m Candles" value={candleResponse ? String(candleResponse.candles.length) : "—"} />
            <MetricCard label="Latest Close" value={valueOrDash(latestCandle?.close, (value) => `$${formatPrice(value)}`)} />
            <MetricCard label="Session Open" value={valueOrDash(context?.candles.sessionOpen, (value) => `$${formatPrice(value)}`)} />
            <MetricCard label="Session High" value={valueOrDash(context?.candles.sessionHigh, (value) => `$${formatPrice(value)}`)} />
            <MetricCard label="Session Low" value={valueOrDash(context?.candles.sessionLow, (value) => `$${formatPrice(value)}`)} />
            <MetricCard label="Latest Candle" value={candleResponse?.latestCandleAt ? formatEasternTime(candleResponse.latestCandleAt) : "—"} />
          </div>
          {quoteQuery.display?.transportFailed && (
            <p className="mt-3 text-xs text-wait">{QUOTE_TRANSPORT_WARNING}</p>
          )}
        </Panel>

        <Panel
          title="Deterministic Structure"
          isLoading={marketStateQuery.isLoading}
          isError={marketStateQuery.isError}
          className="lg:col-span-2"
          action={
            marketState && (
              <Badge variant={ENGINE_BADGE[marketState.engineState].variant}>
                {ENGINE_BADGE[marketState.engineState].label}
              </Badge>
            )
          }
        >
          <DataTable
            columns={featureColumns}
            rows={featureRows}
            rowKey={(row) => row.label}
            emptyMessage="Deterministic Market State is unavailable."
          />
          {marketStateQuery.display?.transportFailed && (
            <p className="mt-3 text-xs text-wait">{MARKET_STATE_TRANSPORT_WARNING}</p>
          )}
        </Panel>

        <Panel
          title="Unified Context Coverage"
          isLoading={contextQuery.isLoading}
          isError={contextQuery.isError}
          className="lg:col-span-4"
          action={
            context && (
              <Badge variant={CONTEXT_BADGE[context.contextState].variant}>
                {CONTEXT_BADGE[context.contextState].label}
              </Badge>
            )
          }
        >
          <div className="mb-3 grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6">
            <MetricCard label="Available" value={coverage.available} tone="bull" />
            <MetricCard label="Stale" value={coverage.stale} tone="wait" />
            <MetricCard label="Partial" value={coverage.partial} tone="wait" />
            <MetricCard label="Not Applicable" value={coverage.notApplicable} />
            <MetricCard label="Unavailable" value={coverage.unavailable} tone="bear" />
            <MetricCard label="Warnings" value={coverage.warningCount} tone={coverage.warningCount > 0 ? "wait" : "default"} />
          </div>
          <DataTable
            columns={componentColumns}
            rows={componentRows}
            rowKey={(row) => row.component}
            emptyMessage="Unified Market Context is unavailable."
          />
          {context && (
            <p className="mt-3 text-xs text-muted-foreground">
              Current market date: {context.currentMarketDate} · Most recent RTH:{" "}
              {context.mostRecentRthSessionDate ?? "Unavailable"} · Assembled:{" "}
              {formatEasternTime(context.assembledAt)}
            </p>
          )}
          {contextQuery.display?.transportFailed && (
            <p className="mt-2 text-xs text-wait">{MARKET_CONTEXT_TRANSPORT_WARNING}</p>
          )}
        </Panel>
      </div>
    </div>
  );
}
