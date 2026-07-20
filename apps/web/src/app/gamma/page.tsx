"use client";

import type {
  DexStrikeRow,
  GexStrikeRow,
} from "@spy-copilot/shared";
import { DexProxyChart } from "@/components/dashboard/dex-proxy-chart";
import { GexProxyChart } from "@/components/dashboard/gex-proxy-chart";
import { ExposureStructurePanel } from "@/components/dashboard/exposure-structure-panel";
import { PageHeader } from "@/components/layout/page-header";
import { DataTable, type DataTableColumn } from "@/components/panels/data-table";
import { MetricCard } from "@/components/panels/metric-card";
import { Panel } from "@/components/panels/panel";
import { Badge } from "@/components/ui/badge";
import {
  DEX_PROXY_TRANSPORT_WARNING,
  useDisplaySpyZeroDteDexProxy,
} from "@/hooks/use-spy-dex-proxy";
import {
  GEX_PROXY_TRANSPORT_WARNING,
  useDisplaySpyZeroDteGexProxy,
} from "@/hooks/use-spy-gex-proxy";
import { selectDexChartStrikeWindow } from "@/lib/dex-chart-window";
import { formatCompactCurrency, formatEasternTime, formatPrice } from "@/lib/format";
import { selectGexChartStrikeWindow } from "@/lib/gex-chart-window";

type ExposureMetricState = "LIVE" | "STALE" | "UNAVAILABLE";

const STATE_BADGE: Record<
  ExposureMetricState,
  { variant: "bull" | "wait"; label: string }
> = {
  LIVE: { variant: "bull", label: "LIVE" },
  STALE: { variant: "wait", label: "STALE" },
  UNAVAILABLE: { variant: "wait", label: "UNAVAILABLE" },
};

function gexWarningMessage(code: string | null): string | null {
  switch (code) {
    case "AUTH_REQUIRED":
      return "Connect Schwab in Settings to calculate the live GEX proxy.";
    case "OPTIONS_ACCESS_UNAVAILABLE":
      return "Schwab did not authorize Options Chain access for this connection.";
    case "NO_CURRENT_DATE_EXPIRATION":
      return "SPY has no options expiration matching today’s New York date.";
    case "UNDERLYING_PRICE_UNAVAILABLE":
      return "The Options Chain did not provide a valid underlying-price snapshot.";
    case "NO_ELIGIBLE_GEX_CONTRACTS":
      return "No returned standard contracts had all required GEX inputs.";
    case "PARTIAL_GEX_INPUTS":
      return "Some returned-window contracts were missing required GEX inputs; totals may be understated.";
    case "RETAINED_STALE_CHAIN":
      return "The GEX proxy is based on the last eligible retained Options Chain snapshot.";
    case "DATABASE_ERROR":
    case "OPTIONS_CHAIN_UNAVAILABLE":
    case "INVALID_GEX_INPUTS":
      return "The 0DTE GEX proxy is currently unavailable.";
    default:
      return null;
  }
}

function dexWarningMessage(code: string | null): string | null {
  switch (code) {
    case "AUTH_REQUIRED":
      return "Connect Schwab in Settings to calculate the live DEX proxy.";
    case "OPTIONS_ACCESS_UNAVAILABLE":
      return "Schwab did not authorize Options Chain access for this connection.";
    case "NO_CURRENT_DATE_EXPIRATION":
      return "SPY has no options expiration matching today’s New York date.";
    case "UNDERLYING_PRICE_UNAVAILABLE":
      return "The Options Chain did not provide a valid underlying-price snapshot.";
    case "NO_ELIGIBLE_DEX_CONTRACTS":
      return "No returned standard contracts had all required DEX inputs.";
    case "PARTIAL_DEX_INPUTS":
      return "Some returned-window contracts were missing required DEX inputs; totals may be understated.";
    case "RETAINED_STALE_CHAIN":
      return "The DEX proxy is based on the last eligible retained Options Chain snapshot.";
    case "DATABASE_ERROR":
    case "OPTIONS_CHAIN_UNAVAILABLE":
    case "INVALID_DEX_INPUTS":
      return "The 0DTE DEX proxy is currently unavailable.";
    default:
      return null;
  }
}

export default function GammaPage() {
  const {
    display: gexDisplay,
    isLoading: gexLoading,
    isError: gexError,
  } = useDisplaySpyZeroDteGexProxy();
  const {
    display: dexDisplay,
    isLoading: dexLoading,
    isError: dexError,
  } = useDisplaySpyZeroDteDexProxy();

  const gex = gexDisplay?.response ?? null;
  const dex = dexDisplay?.response ?? null;
  const gexBadge = gex ? STATE_BADGE[gex.metricState] : STATE_BADGE.UNAVAILABLE;
  const dexBadge = dex ? STATE_BADGE[dex.metricState] : STATE_BADGE.UNAVAILABLE;
  const gexWarning = gex ? gexWarningMessage(gex.warningCode) : null;
  const dexWarning = dex ? dexWarningMessage(dex.warningCode) : null;

  const gexChartWindow = gex
    ? selectGexChartStrikeWindow(gex.strikes, gex.underlyingPrice)
    : {
        atmStrike: null,
        rows: [],
        calculationStrikeCount: 0,
        displayedStrikeCount: 0,
        isSubset: false,
      };
  const dexChartWindow = dex
    ? selectDexChartStrikeWindow(dex.strikes, dex.underlyingPrice)
    : {
        atmStrike: null,
        rows: [],
        calculationStrikeCount: 0,
        displayedStrikeCount: 0,
        isSubset: false,
      };

  const gexColumns: DataTableColumn<GexStrikeRow>[] = [
    { key: "strike", header: "Strike", render: (row) => `$${formatPrice(row.strikePrice)}` },
    { key: "callOi", header: "Call OI", align: "right", render: (row) => row.callOpenInterest.toLocaleString() },
    { key: "putOi", header: "Put OI", align: "right", render: (row) => row.putOpenInterest.toLocaleString() },
    { key: "callGex", header: "Call GEX", align: "right", render: (row) => formatCompactCurrency(row.callGammaExposure) },
    { key: "putGex", header: "Put GEX Magnitude", align: "right", render: (row) => formatMagnitudeCurrency(row.putGammaExposureMagnitude) },
    { key: "netGex", header: "Net GEX Proxy", align: "right", render: (row) => formatCompactCurrency(row.netGammaExposureProxy) },
  ];

  const dexColumns: DataTableColumn<DexStrikeRow>[] = [
    { key: "strike", header: "Strike", render: (row) => `$${formatPrice(row.strikePrice)}` },
    { key: "callOi", header: "Call OI", align: "right", render: (row) => row.callOpenInterest.toLocaleString() },
    { key: "putOi", header: "Put OI", align: "right", render: (row) => row.putOpenInterest.toLocaleString() },
    { key: "callDex", header: "Call DEX", align: "right", render: (row) => formatCompactCurrency(row.callDeltaExposure) },
    { key: "putDex", header: "Put DEX Magnitude", align: "right", render: (row) => formatMagnitudeCurrency(row.putDeltaExposureMagnitude) },
    { key: "netDex", header: "Net DEX Proxy", align: "right", render: (row) => formatCompactCurrency(row.netDeltaExposureProxy) },
  ];

  return (
    <div className="mx-auto max-w-[1600px]">
      <PageHeader
        title="GEX / DEX"
        description="Live returned-window SPY 0DTE exposure structure, ranked Gamma walls and cliffs, cumulative Gamma-balance proxy, and GEX/DEX calculations from one normalized Options Chain snapshot."
        action={
          <div className="flex items-center gap-2">
            <Badge variant={gexBadge.variant}>GEX {gexBadge.label}</Badge>
            <Badge variant={dexBadge.variant}>DEX {dexBadge.label}</Badge>
          </div>
        }
      />

      {(gexDisplay?.transportFailed || dexDisplay?.transportFailed || gexWarning || dexWarning) && (
        <div className="mb-3 space-y-1 rounded-md border border-wait/30 bg-wait-muted px-3 py-2 text-xs text-wait">
          {gexDisplay?.transportFailed && <p>{GEX_PROXY_TRANSPORT_WARNING}</p>}
          {dexDisplay?.transportFailed && <p>{DEX_PROXY_TRANSPORT_WARNING}</p>}
          {gexWarning && <p>GEX: {gexWarning}</p>}
          {dexWarning && <p>DEX: {dexWarning}</p>}
        </div>
      )}

      <div className="grid grid-cols-1 gap-3 lg:grid-cols-4">
        <ExposureStructurePanel className="lg:col-span-4" />

        <Panel title="Returned-Window Call GEX" isLoading={gexLoading} isError={gexError}>
          <MetricCard
            label="Magnitude · per 1% move"
            value={gex?.returnedWindowCallGammaExposure == null ? "—" : formatCompactCurrency(gex.returnedWindowCallGammaExposure)}
            sublabel="Calls use the positive analytical convention"
          />
        </Panel>
        <Panel title="Returned-Window Put GEX" isLoading={gexLoading} isError={gexError}>
          <MetricCard
            label="Magnitude · per 1% move"
            value={gex?.returnedWindowPutGammaExposureMagnitude == null ? "—" : formatMagnitudeCurrency(gex.returnedWindowPutGammaExposureMagnitude)}
            sublabel="Positive magnitude; shown left of zero in the chart"
          />
        </Panel>
        <Panel title="Returned-Window Net GEX Proxy" isLoading={gexLoading} isError={gexError}>
          <MetricCard
            label="Call magnitude − Put magnitude"
            value={gex?.returnedWindowNetGammaExposureProxy == null ? "—" : formatCompactCurrency(gex.returnedWindowNetGammaExposureProxy)}
            sublabel="Descriptive proxy, not a bullish or bearish signal"
          />
        </Panel>
        <div className="hidden lg:block" aria-hidden />

        <Panel title="Returned-Window Call DEX" isLoading={dexLoading} isError={dexError}>
          <MetricCard
            label="Estimated dollar Delta notional"
            value={dex?.returnedWindowCallDeltaExposure == null ? "—" : formatCompactCurrency(dex.returnedWindowCallDeltaExposure)}
            sublabel="Uses provider-supplied positive Call Delta"
          />
        </Panel>
        <Panel title="Returned-Window Put DEX" isLoading={dexLoading} isError={dexError}>
          <MetricCard
            label="Magnitude · estimated Delta notional"
            value={dex?.returnedWindowPutDeltaExposureMagnitude == null ? "—" : formatMagnitudeCurrency(dex.returnedWindowPutDeltaExposureMagnitude)}
            sublabel="Positive magnitude; shown left of zero in the chart"
          />
        </Panel>
        <Panel title="Returned-Window Net DEX Proxy" isLoading={dexLoading} isError={dexError}>
          <MetricCard
            label="Call notional − Put magnitude"
            value={dex?.returnedWindowNetDeltaExposureProxy == null ? "—" : formatCompactCurrency(dex.returnedWindowNetDeltaExposureProxy)}
            sublabel="Descriptive proxy, not a directional market signal"
          />
        </Panel>
        <div className="hidden lg:block" aria-hidden />

        <Panel title="GEX Methodology & Coverage" className="lg:col-span-4">
          <div className="grid grid-cols-2 gap-2 text-xs sm:grid-cols-4 lg:grid-cols-9">
            <Summary label="Method" value="OI-Weighted Gamma / 1%" />
            <Summary
              label="Calculation Scope"
              value={gex ? `Returned Chain Window · ${gex.returnedUniqueStrikeCount} strikes` : "—"}
            />
            <Summary
              label="Chart Display"
              value={
                gex
                  ? gexChartWindow.isSubset
                    ? `Nearest ${gexChartWindow.displayedStrikeCount} strikes`
                    : `All ${gexChartWindow.displayedStrikeCount} strikes`
                  : "—"
              }
            />
            <Summary label="Coverage" value={gex?.coverageState ?? "UNAVAILABLE"} />
            <Summary label="Expiration" value={gex?.expirationDate ?? "—"} />
            <Summary label="Underlying" value={gex?.underlyingPrice == null ? "—" : `$${formatPrice(gex.underlyingPrice)}`} />
            <Summary
              label="Strike Range"
              value={
                gex?.minimumReturnedStrike == null || gex.maximumReturnedStrike == null
                  ? "—"
                  : `$${gex.minimumReturnedStrike}–$${gex.maximumReturnedStrike}`
              }
            />
            <Summary label="Latest Quote" value={gex?.latestOptionQuoteAt ? formatEasternTime(gex.latestOptionQuoteAt) : "—"} />
            <Summary label="Chain Fetched" value={gex?.chainFetchedAt ? formatEasternTime(gex.chainFetchedAt) : "—"} />
          </div>
          <div className="mt-3 grid grid-cols-2 gap-2 text-xs sm:grid-cols-4 lg:grid-cols-6">
            <Summary label="Eligible Calls" value={gex ? String(gex.eligibleCallContractCount) : "—"} />
            <Summary label="Eligible Puts" value={gex ? String(gex.eligiblePutContractCount) : "—"} />
            <Summary label="Excluded Calls" value={gex ? String(gex.excludedCallContractCount) : "—"} />
            <Summary label="Excluded Puts" value={gex ? String(gex.excludedPutContractCount) : "—"} />
            <Summary label="Missing Gamma" value={gex ? String(gex.contractsMissingGamma) : "—"} />
            <Summary label="Missing OI" value={gex ? String(gex.contractsMissingOpenInterest) : "—"} />
          </div>
          <p className="mt-3 text-xs leading-relaxed text-muted-foreground">
            Calculated from current provider Gamma and Open Interest across the expanded returned chain window. The chart may show only the nearest eligible strikes for readability, while totals and the table use every eligible GEX strike row from that window. Values are local exposure estimates using a Call-positive / Put-negative analytical convention, not observed dealer inventory. Open Interest may not update intraday.
          </p>
        </Panel>

        <Panel
          title="0DTE GEX Proxy Chart"
          isLoading={gexLoading}
          isError={gexError}
          isEmpty={!gexLoading && !gexError && (gex?.strikes.length ?? 0) === 0}
          emptyMessage={gexWarning ?? "No eligible returned-window GEX strike data is available."}
          className="lg:col-span-4"
        >
          {gex && gexChartWindow.rows.length > 0 && (
            <div>
              <p className="mb-2 text-xs text-muted-foreground">
                Chart display: {gexChartWindow.isSubset
                  ? `nearest ${gexChartWindow.displayedStrikeCount} of ${gexChartWindow.calculationStrikeCount} eligible GEX strike rows`
                  : `all ${gexChartWindow.displayedStrikeCount} eligible GEX strike rows`}. Totals use every eligible strike row from the returned chain window.
              </p>
              <GexProxyChart strikes={gexChartWindow.rows} underlyingPrice={gex.underlyingPrice} />
            </div>
          )}
        </Panel>

        <Panel
          title="Per-Strike 0DTE GEX Proxy"
          isLoading={gexLoading}
          isError={gexError}
          className="lg:col-span-4"
          noPadding
        >
          <div className="max-h-[32rem] overflow-y-auto">
            <DataTable
              columns={gexColumns}
              rows={gex?.strikes ?? []}
              rowKey={(row) => String(row.strikePrice)}
              emptyMessage="No eligible returned-window GEX rows are available."
            />
          </div>
        </Panel>

        <Panel title="DEX Methodology & Coverage" className="lg:col-span-4">
          <div className="grid grid-cols-2 gap-2 text-xs sm:grid-cols-4 lg:grid-cols-9">
            <Summary label="Method" value="OI-Weighted Delta Notional" />
            <Summary
              label="Calculation Scope"
              value={dex ? `Returned Chain Window · ${dex.returnedUniqueStrikeCount} strikes` : "—"}
            />
            <Summary
              label="Chart Display"
              value={
                dex
                  ? dexChartWindow.isSubset
                    ? `Nearest ${dexChartWindow.displayedStrikeCount} strikes`
                    : `All ${dexChartWindow.displayedStrikeCount} strikes`
                  : "—"
              }
            />
            <Summary label="Coverage" value={dex?.coverageState ?? "UNAVAILABLE"} />
            <Summary label="Expiration" value={dex?.expirationDate ?? "—"} />
            <Summary label="Underlying" value={dex?.underlyingPrice == null ? "—" : `$${formatPrice(dex.underlyingPrice)}`} />
            <Summary
              label="Strike Range"
              value={
                dex?.minimumReturnedStrike == null || dex.maximumReturnedStrike == null
                  ? "—"
                  : `$${dex.minimumReturnedStrike}–$${dex.maximumReturnedStrike}`
              }
            />
            <Summary label="Latest Quote" value={dex?.latestOptionQuoteAt ? formatEasternTime(dex.latestOptionQuoteAt) : "—"} />
            <Summary label="Chain Fetched" value={dex?.chainFetchedAt ? formatEasternTime(dex.chainFetchedAt) : "—"} />
          </div>
          <div className="mt-3 grid grid-cols-2 gap-2 text-xs sm:grid-cols-4 lg:grid-cols-7">
            <Summary label="Eligible Calls" value={dex ? String(dex.eligibleCallContractCount) : "—"} />
            <Summary label="Eligible Puts" value={dex ? String(dex.eligiblePutContractCount) : "—"} />
            <Summary label="Excluded Calls" value={dex ? String(dex.excludedCallContractCount) : "—"} />
            <Summary label="Excluded Puts" value={dex ? String(dex.excludedPutContractCount) : "—"} />
            <Summary label="Missing Delta" value={dex ? String(dex.contractsMissingDelta) : "—"} />
            <Summary label="Invalid Delta" value={dex ? String(dex.contractsWithInvalidDelta) : "—"} />
            <Summary label="Missing OI" value={dex ? String(dex.contractsMissingOpenInterest) : "—"} />
          </div>
          <p className="mt-3 text-xs leading-relaxed text-muted-foreground">
            Calculated from provider Delta and Open Interest across the returned current-date strike window. Totals and the complete table use every eligible DEX strike row; the chart may show only the nearest strikes for readability. This is a Delta Exposure proxy, not observed dealer inventory or confirmed hedge demand. Open Interest may not update intraday.
          </p>
        </Panel>

        <Panel
          title="0DTE DEX Proxy Chart"
          isLoading={dexLoading}
          isError={dexError}
          isEmpty={!dexLoading && !dexError && (dex?.strikes.length ?? 0) === 0}
          emptyMessage={dexWarning ?? "No eligible returned-window DEX strike data is available."}
          className="lg:col-span-4"
        >
          {dex && dexChartWindow.rows.length > 0 && (
            <div>
              <p className="mb-2 text-xs text-muted-foreground">
                Chart display: {dexChartWindow.isSubset
                  ? `nearest ${dexChartWindow.displayedStrikeCount} of ${dexChartWindow.calculationStrikeCount} eligible DEX strike rows`
                  : `all ${dexChartWindow.displayedStrikeCount} eligible DEX strike rows`}. Totals use every eligible strike row from the returned chain window.
              </p>
              <DexProxyChart strikes={dexChartWindow.rows} underlyingPrice={dex.underlyingPrice} />
            </div>
          )}
        </Panel>

        <Panel
          title="Per-Strike 0DTE DEX Proxy"
          isLoading={dexLoading}
          isError={dexError}
          className="lg:col-span-4"
          noPadding
        >
          <div className="max-h-[32rem] overflow-y-auto">
            <DataTable
              columns={dexColumns}
              rows={dex?.strikes ?? []}
              rowKey={(row) => String(row.strikePrice)}
              emptyMessage="No eligible returned-window DEX rows are available."
            />
          </div>
        </Panel>
      </div>
    </div>
  );
}

function Summary({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md border border-panel-border bg-background/40 px-3 py-2">
      <div className="text-[10px] uppercase tracking-wider text-muted-foreground">{label}</div>
      <div className="mt-1 font-mono font-semibold tabular">{value}</div>
    </div>
  );
}

function formatMagnitudeCurrency(value: number): string {
  return formatCompactCurrency(value).replace(/^\+/, "");
}
