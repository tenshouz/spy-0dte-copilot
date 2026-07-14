"use client";

import type { QuoteSourceState } from "@spy-copilot/shared";
import { Menu } from "lucide-react";
import { useEffect, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useMarketSnapshot } from "@/hooks/use-market-snapshot";
import { useDisplaySpyQuote } from "@/hooks/use-spy-quote";
import { formatPrice } from "@/lib/format";
import { useUiStore } from "@/stores/ui-store";

/** Quote-scoped labels only — never a bare LIVE that could describe the whole dashboard. */
const SOURCE_BADGE: Record<QuoteSourceState, { variant: "bull" | "wait" | "bear"; label: string }> = {
  LIVE: { variant: "bull", label: "SPY LIVE" },
  STALE: { variant: "wait", label: "SPY STALE" },
  MOCK: { variant: "bear", label: "SPY MOCK" },
};

export function Header() {
  const toggleSidebar = useUiStore((s) => s.toggleSidebar);
  // Same shared display logic as the Current Price card — one query key,
  // identical price and identical effective source state in both places.
  const { display } = useDisplaySpyQuote();
  const quote = display?.quote;
  const { data: snapshot } = useMarketSnapshot();
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
            {/* Neutral color — no bull/bear coloring derived from mock VWAP or any
                other mock analytic. Live price + mock values must not be combined
                into any signal for this milestone. */}
            <span className="font-mono text-sm font-semibold tabular text-foreground">
              ${formatPrice(quote.lastPrice)}
            </span>
            <Badge variant={SOURCE_BADGE[quote.sourceState].variant}>
              {SOURCE_BADGE[quote.sourceState].label}
            </Badge>
            {snapshot && (
              <span className="hidden text-xs text-muted-foreground lg:inline">
                Mock VWAP ${formatPrice(snapshot.vwap)}
              </span>
            )}
          </div>
        )}
      </div>

      <div className="flex items-center gap-3">
        {/* Everything except the SPY quote is still mock — keep that unmistakable. */}
        <Badge variant="wait" className="hidden sm:inline-flex">
          Analytics: Mock
        </Badge>
        <span className="font-mono text-xs tabular text-muted-foreground" suppressHydrationWarning>
          {now
            ? now.toLocaleTimeString("en-US", { hour12: false, timeZoneName: "short" })
            : "--:--:--"}
        </span>
      </div>
    </header>
  );
}
