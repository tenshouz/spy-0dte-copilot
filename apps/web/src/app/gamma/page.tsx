"use client";

import type {
  GexMetricState,
  GexStrikeRow,
  StrikeExposure,
} from "@spy-copilot/shared";
import { GexProxyChart } from "@/components/dashboard/gex-proxy-chart";
import { PageHeader } from "@/components/layout/page-header";
import { DataTable, type DataTableColumn } from "@/components/panels/data-table";
import { MetricCard } from "@/components/panels/metric-card";
import { Panel } from "@/components/panels/panel";
import { Badge } from "@/components/ui/badge";
import {
  GEX_PROXY_TRANSPORT_WARNING,
  useDisplaySpyZeroDteGexProxy,
} from "@/hooks/use-spy-gex-proxy";
import { useMarketSnapshot, useStrikeExposures } from "@/hooks/use-market-snapshot";
import { formatCompactCurrency, formatEasternTime, formatPrice } from "@/lib/format";

const STATE_BADGE: Record<
  GexMetricState,
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
      return "Some returned-window contracts were missing required exposure inputs; totals may be understated.";
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

export default function GammaPage() {
  const { display, isLoading, isError } = useDisplaySpyZeroDteGexProxy();
  const { data: dexStrikes, isLoading: dexLoading, isError: dexError } = useStrikeExposures();
  const { data: snapshot } = useMarketSnapshot();
  const gex = display?.response ?? null;
  const badge = gex ? STATE_BADGE[gex.metricState] : STATE_BADGE.UNAVAILABLE;
  const warning = gex ? gexWarningMessage(gex.warningCode) : null;

  const gexColumns: DataTableColumn<GexStrikeRow>[] = [
    { key: "strike", header: "Strike", render: (row) => `$${formatPrice(row.strikePrice)}` },
    { key: "callOi", header: "Call OI", align: "right", render: (row) => row.callOpenInterest.toLocaleString() },
    { key: "putOi", header: "Put OI", align: "right", render: (row) => row.putOpenInterest.toLocaleString() },
    { key: "callGex", header: "Call GEX", align: "right", render: (row) => formatCompactCurrency(row.callGammaExposure) },
    { key: "putGex", header: "Put GEX Magnitude", align: "right", render: (row) => formatMagnitudeCurrency(row.putGammaExposureMagnitude) },
    { key: "netGex", header: "Net GEX Proxy", align: "right", render: (row) => formatCompactCurrency(row.netGammaExposureProxy) },
  ];

  const dexColumns: DataTableColumn<StrikeExposure>[] = [
    { key: "strike", header: "Strike", render: (row) => `$${row.strike}` },
    { key: "dex", header: "DEX (Mock)", align: "right", render: (row) => formatCompactCurrency(row.dex) },
  ];

  return (
    <div className="mx-auto max-w-[1600px]">
      <PageHeader
        title="GEX / DEX"
        description="Live returned-window SPY 0DTE Gamma Exposure proxy. DEX remains mock and is labeled separately."
        action={
          <div className="flex items-center gap-2">
            <Badge variant={badge.variant}>GEX {badge.label}</Badge>
            <Badge variant="bear">DEX MOCK</Badge>
          </div>
        }
      />

      {(display?.transportFailed || warning) && (
        <div className="mb-3 space-y-1 rounded-md border border-wait/30 bg-wait-muted px-3 py-2 text-xs text-wait">
          {display?.transportFailed && <p>{GEX_PROXY_TRANSPORT_WARNING}</p>}
          {warning && <p>{warning}</p>}
        </div>
      )}

      <div className="grid grid-cols-1 gap-3 lg:grid-cols-4">
        <Panel title="Returned-Window Call GEX" isLoading={isLoading} isError={isError}>
          <MetricCard
            label="Magnitude · per 1% move"
            value={gex?.returnedWindowCallGammaExposure == null ? "—" : formatCompactCurrency(gex.returnedWindowCallGammaExposure)}
            sublabel="Calls use the positive analytical convention"
          />
        </Panel>
        <Panel title="Returned-Window Put GEX" isLoading={isLoading} isError={isError}>
          <MetricCard
            label="Magnitude · per 1% move"
            value={gex?.returnedWindowPutGammaExposureMagnitude == null ? "—" : formatMagnitudeCurrency(gex.returnedWindowPutGammaExposureMagnitude)}
            sublabel="Positive magnitude; shown left of zero in the chart"
          />
        </Panel>
        <Panel title="Returned-Window Net GEX Proxy" isLoading={isLoading} isError={isError}>
          <MetricCard
            label="Call magnitude − Put magnitude"
            value={gex?.returnedWindowNetGammaExposureProxy == null ? "—" : formatCompactCurrency(gex.returnedWindowNetGammaExposureProxy)}
            sublabel="Descriptive proxy, not a bullish or bearish signal"
          />
        </Panel>
        <Panel title="Net DEX" isLoading={dexLoading} isError={dexError}>
          <MetricCard
            label="Mock data"
            value={snapshot ? formatCompactCurrency(snapshot.netDex) : "—"}
            sublabel={<Badge variant="bear">MOCK</Badge>}
          />
        </Panel>

        <Panel title="Methodology & Coverage" className="lg:col-span-4">
          <div className="grid grid-cols-2 gap-2 text-xs sm:grid-cols-4 lg:grid-cols-8">
            <Summary label="Method" value="OI-Weighted Gamma / 1%" />
            <Summary label="Scope" value="Returned Chain Window" />
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
            Calculated from current provider Gamma and Open Interest across the returned ATM-centered strike window. Values are local exposure estimates using a Call-positive / Put-negative analytical convention, not observed dealer inventory. Open Interest may not update intraday.
          </p>
        </Panel>

        <Panel
          title="0DTE GEX Proxy by Returned Strike"
          isLoading={isLoading}
          isError={isError}
          isEmpty={!isLoading && !isError && (gex?.strikes.length ?? 0) === 0}
          emptyMessage={warning ?? "No eligible returned-window GEX strike data is available."}
          className="lg:col-span-4"
        >
          {gex && gex.strikes.length > 0 && (
            <GexProxyChart strikes={gex.strikes} underlyingPrice={gex.underlyingPrice} />
          )}
        </Panel>

        <Panel
          title="Per-Strike 0DTE GEX Proxy"
          isLoading={isLoading}
          isError={isError}
          className="lg:col-span-4"
          noPadding
        >
          <DataTable
            columns={gexColumns}
            rows={gex?.strikes ?? []}
            rowKey={(row) => String(row.strikePrice)}
            emptyMessage="No eligible returned-window GEX rows are available."
          />
        </Panel>

        <Panel
          title="DEX by Strike · MOCK"
          isLoading={dexLoading}
          isError={dexError}
          className="lg:col-span-4"
          noPadding
        >
          <DataTable
            columns={dexColumns}
            rows={dexStrikes ?? []}
            rowKey={(row) => String(row.strike)}
          />
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
