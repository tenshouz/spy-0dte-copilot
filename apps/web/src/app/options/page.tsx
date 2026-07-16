"use client";

import type {
  NormalizedOptionContract,
  OptionsChainMetricState,
} from "@spy-copilot/shared";
import { PageHeader } from "@/components/layout/page-header";
import { Panel } from "@/components/panels/panel";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  OPTIONS_CHAIN_TRANSPORT_WARNING,
  useDisplaySpyZeroDteOptionsChain,
} from "@/hooks/use-spy-options-chain";
import { formatEasternTime, formatPrice, formatVolume } from "@/lib/format";
import { selectAtmCenteredStrikeWindow } from "@/lib/options-chain-window";

interface ChainRow {
  key: string;
  strike: number;
  call: NormalizedOptionContract | null;
  put: NormalizedOptionContract | null;
}

const STATE_BADGE: Record<
  OptionsChainMetricState,
  { variant: "bull" | "wait" | "bear"; label: string }
> = {
  LIVE: { variant: "bull", label: "LIVE" },
  STALE: { variant: "wait", label: "STALE" },
  MOCK: { variant: "bear", label: "MOCK" },
  UNAVAILABLE: { variant: "wait", label: "UNAVAILABLE" },
};

function groupByStrike(contracts: readonly NormalizedOptionContract[]) {
  const grouped = new Map<number, NormalizedOptionContract[]>();
  for (const contract of contracts) {
    const list = grouped.get(contract.strikePrice) ?? [];
    list.push(contract);
    grouped.set(contract.strikePrice, list);
  }
  for (const list of grouped.values()) {
    list.sort((a, b) => a.contractSymbol.localeCompare(b.contractSymbol));
  }
  return grouped;
}

function buildRows(
  calls: readonly NormalizedOptionContract[],
  puts: readonly NormalizedOptionContract[],
  visibleStrikes: readonly number[],
): ChainRow[] {
  const callsByStrike = groupByStrike(calls);
  const putsByStrike = groupByStrike(puts);
  const rows: ChainRow[] = [];

  for (const strike of visibleStrikes) {
    const strikeCalls = callsByStrike.get(strike) ?? [];
    const strikePuts = putsByStrike.get(strike) ?? [];
    const rowCount = Math.max(strikeCalls.length, strikePuts.length, 1);
    for (let index = 0; index < rowCount; index += 1) {
      const call = strikeCalls[index] ?? null;
      const put = strikePuts[index] ?? null;
      rows.push({
        key: `${strike}-${call?.contractSymbol ?? "no-call"}-${put?.contractSymbol ?? "no-put"}`,
        strike,
        call,
        put,
      });
    }
  }

  return rows;
}

function formatOptionalPrice(value: number | null | undefined): string {
  return value === null || value === undefined ? "—" : value.toFixed(2);
}

function formatOptionalInteger(value: number | null | undefined): string {
  return value === null || value === undefined ? "—" : formatVolume(value);
}

function formatOptionalGreek(value: number | null | undefined): string {
  return value === null || value === undefined ? "—" : value.toFixed(3);
}

function formatOptionalIv(value: number | null | undefined): string {
  return value === null || value === undefined ? "—" : `${value.toFixed(2)}%`;
}

function warningMessage(code: string | null): string | null {
  switch (code) {
    case "AUTH_REQUIRED":
      return "Connect Schwab in Settings to load the live SPY options chain.";
    case "OPTIONS_ACCESS_UNAVAILABLE":
      return "Schwab did not authorize Options Chain access for this connection.";
    case "NO_CURRENT_DATE_EXPIRATION":
      return "SPY has no options expiration matching today’s New York date.";
    case "UPSTREAM_RATE_LIMITED":
      return "Schwab temporarily rate-limited the Options Chain request.";
    case "UPSTREAM_TIMEOUT":
    case "UPSTREAM_NETWORK_ERROR":
    case "UPSTREAM_UNAVAILABLE":
      return "The Schwab Options Chain service is temporarily unavailable.";
    case "UPSTREAM_SCHEMA_INVALID":
      return "Schwab returned an Options Chain shape that could not be validated safely.";
    case "NO_VALID_CONTRACTS":
      return "No valid current-date option contracts remained after validation.";
    case "RETAINED_STALE_CHAIN":
      return "Showing the last valid real chain while a refresh is temporarily unavailable.";
    case "PARTIAL_CONTRACT_DATA":
      return "Some malformed contract fields were omitted; the remaining chain is valid.";
    case "DATABASE_ERROR":
      return "The stored Schwab connection could not be read safely.";
    default:
      return null;
  }
}

export default function OptionsPage() {
  const { display, isLoading, isError } = useDisplaySpyZeroDteOptionsChain();
  const chain = display?.response ?? null;
  const strikeWindow = chain
    ? selectAtmCenteredStrikeWindow(
        [...chain.calls, ...chain.puts].map((contract) => contract.strikePrice),
        chain.underlyingPrice,
      )
    : { atmStrike: null, visibleStrikes: [] };
  const rows = chain ? buildRows(chain.calls, chain.puts, strikeWindow.visibleStrikes) : [];
  const badge = chain ? STATE_BADGE[chain.metricState] : STATE_BADGE.UNAVAILABLE;
  const warning = chain ? warningMessage(chain.warningCode) : null;

  return (
    <div className="mx-auto max-w-[1800px]">
      <PageHeader
        title="SPY 0DTE Options Chain"
        description="Current New York date only. Provider quotes and Greeks are displayed without ranking or trade recommendations."
        action={<Badge variant={badge.variant}>{badge.label}</Badge>}
      />

      <div className="mb-3 grid grid-cols-2 gap-2 text-xs sm:grid-cols-3 lg:grid-cols-6">
        <Summary label="Expiration" value={chain?.requestedExpirationDate ?? "—"} />
        <Summary
          label="Underlying"
          value={chain?.underlyingPrice == null ? "—" : `$${formatPrice(chain.underlyingPrice)}`}
        />
        <Summary label="Strikes" value={chain ? String(chain.returnedUniqueStrikeCount) : "—"} />
        <Summary label="Calls / Puts" value={chain ? `${chain.callContractCount} / ${chain.putContractCount}` : "—"} />
        <Summary label="Fetched" value={chain ? formatEasternTime(chain.fetchedAt) : "—"} />
        <Summary
          label="Latest quote"
          value={chain?.latestOptionQuoteAt ? formatEasternTime(chain.latestOptionQuoteAt) : "—"}
        />
      </div>

      {(display?.transportFailed || warning || chain?.isDelayed) && (
        <div className="mb-3 space-y-1 rounded-md border border-wait/30 bg-wait-muted px-3 py-2 text-xs text-wait">
          {display?.transportFailed && <p>{OPTIONS_CHAIN_TRANSPORT_WARNING}</p>}
          {warning && <p>{warning}</p>}
          {chain?.isDelayed && <p>Schwab identifies this chain as delayed.</p>}
        </div>
      )}

      <Panel
        title="Calls | Strike | Puts"
        isLoading={isLoading}
        isError={isError}
        isEmpty={!isLoading && !isError && rows.length === 0}
        emptyMessage={warning ?? "No current-date SPY option contracts are available."}
        noPadding
      >
        <Table className="min-w-[1450px]">
          <TableHeader>
            <TableRow>
              <TableHead className="text-right">Call Bid</TableHead>
              <TableHead className="text-right">Ask</TableHead>
              <TableHead className="text-right">Mark</TableHead>
              <TableHead className="text-right">Volume</TableHead>
              <TableHead className="text-right">OI</TableHead>
              <TableHead className="text-right">IV</TableHead>
              <TableHead className="text-right">Delta</TableHead>
              <TableHead className="sticky left-0 z-10 bg-panel text-center">Strike</TableHead>
              <TableHead className="text-right">Put Bid</TableHead>
              <TableHead className="text-right">Ask</TableHead>
              <TableHead className="text-right">Mark</TableHead>
              <TableHead className="text-right">Volume</TableHead>
              <TableHead className="text-right">OI</TableHead>
              <TableHead className="text-right">IV</TableHead>
              <TableHead className="text-right">Delta</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((row) => {
              const isAtm = row.strike === strikeWindow.atmStrike;
              return (
                <TableRow
                  key={row.key}
                  className={isAtm ? "bg-accent/5 hover:bg-accent/10" : undefined}
                  data-atm={isAtm ? "true" : undefined}
                >
                  <OptionCell contract={row.call} value={formatOptionalPrice(row.call?.bid)} />
                  <OptionCell contract={row.call} value={formatOptionalPrice(row.call?.ask)} />
                  <OptionCell contract={row.call} value={formatOptionalPrice(row.call?.mark)} />
                  <OptionCell contract={row.call} value={formatOptionalInteger(row.call?.volume)} />
                  <OptionCell contract={row.call} value={formatOptionalInteger(row.call?.openInterest)} />
                  <OptionCell contract={row.call} value={formatOptionalIv(row.call?.impliedVolatilityPercent)} />
                  <OptionCell contract={row.call} value={formatOptionalGreek(row.call?.delta)} />
                  <TableCell
                    className={
                      isAtm
                        ? "sticky left-0 z-10 bg-panel-hover text-center font-mono font-semibold tabular"
                        : "sticky left-0 z-10 bg-panel text-center font-mono font-semibold tabular"
                    }
                  >
                    <span className="inline-flex items-center justify-center gap-1.5 whitespace-nowrap">
                      <span>${row.strike.toFixed(2)}</span>
                      {isAtm && (
                        <Badge variant="default" className="px-1.5 py-0 text-[9px] tracking-normal">
                          ATM
                        </Badge>
                      )}
                    </span>
                  </TableCell>
                  <OptionCell contract={row.put} value={formatOptionalPrice(row.put?.bid)} />
                  <OptionCell contract={row.put} value={formatOptionalPrice(row.put?.ask)} />
                  <OptionCell contract={row.put} value={formatOptionalPrice(row.put?.mark)} />
                  <OptionCell contract={row.put} value={formatOptionalInteger(row.put?.volume)} />
                  <OptionCell contract={row.put} value={formatOptionalInteger(row.put?.openInterest)} />
                  <OptionCell contract={row.put} value={formatOptionalIv(row.put?.impliedVolatilityPercent)} />
                  <OptionCell contract={row.put} value={formatOptionalGreek(row.put?.delta)} />
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </Panel>
    </div>
  );
}

function Summary({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md border border-panel-border bg-panel px-3 py-2">
      <div className="text-[10px] uppercase tracking-wider text-muted-foreground">{label}</div>
      <div className="mt-1 font-mono font-semibold tabular">{value}</div>
    </div>
  );
}

function OptionCell({
  contract,
  value,
}: {
  contract: NormalizedOptionContract | null;
  value: string;
}) {
  return (
    <TableCell
      className="text-right font-mono tabular"
      title={contract ? `${contract.contractSymbol}${contract.nonStandard ? " · nonstandard" : ""}` : undefined}
    >
      {value}
    </TableCell>
  );
}
