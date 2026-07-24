"use client";

import type { QuoteSourceState, VwapMetricState } from "@spy-copilot/shared";
import { Menu } from "lucide-react";
import { useEffect, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useDisplaySpyQuote } from "@/hooks/use-spy-quote";
import { useDisplaySpyRthVwap } from "@/hooks/use-spy-rth-vwap";
import { formatPrice } from "@/lib/format";
import { useUiStore } from "@/stores/ui-store";

/** Quote-scoped labels only — never a bare LIVE that could describe the whole dashboard. */
const SOURCE_BADGE: Record<QuoteSourceState, { variant: "bull" | "wait" | "bear"; label: string }> = {
  LIVE: { variant: "bull", label: "SPY LIVE" },
  STALE: { variant: "wait", label: "SPY STALE" },
  MOCK: { variant: "bear", label: "SPY MOCK" },
};

const VWAP_LABEL: Record<VwapMetricState, string> = {
  LIVE: "VWAP LIVE",
  STALE: "VWAP STALE",
  MOCK: "VWAP MOCK",
  UNAVAILABLE: "VWAP UNAVAILABLE",
};

export function Header() {
  const toggleSidebar = useUiStore((s) => s.toggleSidebar);
  const { display } = useDisplaySpyQuote();
  const { display: vwapDisplay } = useDisplaySpyRthVwap();
  const quote = display?.quote;
  const [now, setNow] = useState<Date | null>(null);

  useEffect(() => {
    setNow(new Date());
    const id = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(id);
  }, []);

  return (
    <header className="flex h-14 shrink-0 items-center justify-between gap-4 border-b border-panel-border bg-panel px-4">
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="icon" onClick={toggleSidebar} className="hidden md:inline-flex">
          <Menu className="h-4 w-4" />
        </Button>
        <span className="font-mono text-sm font-semibold tracking-tight md:hidden">
          SPY 0DTE COPILOT
        </span>

        {quote && (
          <div className="hidden items-center gap-2 sm:flex">
            <span className="font-mono text-sm font-semibold tabular">SPY</span>
            <span className="font-mono text-sm font-semibold tabular text-foreground">
              ${formatPrice(quote.lastPrice)}
            </span>
            <Badge variant={SOURCE_BADGE[quote.sourceState].variant}>
              {SOURCE_BADGE[quote.sourceState].label}
            </Badge>
            {vwapDisplay && (
              <span className="hidden text-xs text-muted-foreground lg:inline">
                {VWAP_LABEL[vwapDisplay.response.metricState]}
                {vwapDisplay.response.latestVwap !== null
                  ? ` $${formatPrice(vwapDisplay.response.latestVwap)}`
                  : ""}
                {vwapDisplay.response.marketDate ? ` · ${vwapDisplay.response.marketDate}` : ""}
              </span>
            )}
          </div>
        )}
      </div>

      <div className="flex items-center gap-3">
        <span className="font-mono text-xs tabular text-muted-foreground" suppressHydrationWarning>
          {now
            ? now.toLocaleTimeString("en-US", { hour12: false, timeZoneName: "short" })
            : "--:--:--"}
        </span>
      </div>
    </header>
  );
}
