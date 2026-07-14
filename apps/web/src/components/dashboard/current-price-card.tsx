"use client";

import type { QuoteSourceState, QuoteWarningCode } from "@spy-copilot/shared";
import { Panel } from "@/components/panels/panel";
import { Badge } from "@/components/ui/badge";
import { formatPrice, formatTime, formatVolume } from "@/lib/format";
import { QUOTE_TRANSPORT_WARNING, useDisplaySpyQuote } from "@/hooks/use-spy-quote";
import { cn } from "@/lib/utils";

/** Labels are quote-scoped ("SPY LIVE") — never a bare LIVE that could describe the whole dashboard. */
const SOURCE_BADGE: Record<QuoteSourceState, { variant: "bull" | "wait" | "bear"; label: string }> = {
  LIVE: { variant: "bull", label: "SPY LIVE" },
  STALE: { variant: "wait", label: "SPY STALE" },
  MOCK: { variant: "bear", label: "SPY MOCK" },
};

/** Safe, fixed warning strings keyed by machine-readable codes — raw upstream errors never reach the UI. */
const WARNING_TEXT: Record<QuoteWarningCode, string> = {
  NOT_CONNECTED: "Schwab is not connected — showing mock data.",
  AUTH_EXPIRED: "Schwab authorization expired — reconnect in Settings.",
  RECONNECT_REQUIRED: "Schwab connection needs to be re-established in Settings.",
  FORBIDDEN: "Schwab denied access to market data for this app.",
  RATE_LIMITED: "Rate limited by Schwab — retrying shortly.",
  UPSTREAM_ERROR: "Schwab returned an error — showing last known data.",
  NETWORK_ERROR: "Network problem reaching Schwab — showing last known data.",
  TIMEOUT: "Schwab request timed out — showing last known data.",
  VALIDATION_FAILED: "Unexpected Schwab response — showing last known data.",
  DATABASE_ERROR: "Local database unavailable — showing mock data.",
};

const MARKET_STATUS_LABEL: Record<string, string> = {
  NORMAL: "Normal",
  HALTED: "Halted",
  CLOSED: "Closed",
  UNKNOWN: "—",
};

function StatValue({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col gap-0.5">
      <span className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
        {label}
      </span>
      <span className="font-mono text-sm font-semibold tabular">{value}</span>
    </div>
  );
}

export function CurrentPriceCard() {
  const { display, isLoading, isError } = useDisplaySpyQuote();
  const quote = display?.quote;

  return (
    <Panel
      title="Current Price · SPY"
      isLoading={isLoading}
      isError={isError} // only true when no quote has EVER loaded — retained quotes keep rendering
      className="lg:col-span-4"
      action={quote && <Badge variant={SOURCE_BADGE[quote.sourceState].variant}>{SOURCE_BADGE[quote.sourceState].label}</Badge>}
    >
      {quote && (
        <div className="space-y-2">
          <div className="flex flex-wrap items-end gap-x-6 gap-y-3">
            <span
              className={cn(
                // Neutral color: no bull/bear coloring derived from mock analytics.
                "font-mono text-3xl font-bold tabular",
                quote.sourceState === "MOCK" ? "text-muted-foreground" : "text-foreground",
              )}
            >
              ${formatPrice(quote.lastPrice)}
            </span>
            <StatValue label="Bid" value={quote.bidPrice != null ? `$${formatPrice(quote.bidPrice)}` : "—"} />
            <StatValue label="Ask" value={quote.askPrice != null ? `$${formatPrice(quote.askPrice)}` : "—"} />
            <StatValue label="Volume" value={quote.volume != null ? formatVolume(quote.volume) : "—"} />
            <StatValue label="Quote Time" value={formatTime(quote.quoteTimestamp)} />
            <StatValue label="Session" value={MARKET_STATUS_LABEL[quote.marketStatus] ?? "—"} />
          </div>
          {display?.transportFailed && (
            <p className="text-xs text-wait">{QUOTE_TRANSPORT_WARNING}</p>
          )}
          {!display?.transportFailed && quote.warningCode && (
            <p className="text-xs text-wait">{WARNING_TEXT[quote.warningCode]}</p>
          )}
        </div>
      )}
    </Panel>
  );
}
