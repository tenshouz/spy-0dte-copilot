"use client";

import { Menu } from "lucide-react";
import { useEffect, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useMarketSnapshot } from "@/hooks/use-market-snapshot";
import { formatPrice } from "@/lib/format";
import { useUiStore } from "@/stores/ui-store";

export function Header() {
  const toggleSidebar = useUiStore((s) => s.toggleSidebar);
  const { data: snapshot } = useMarketSnapshot();
  const [now, setNow] = useState<Date | null>(null);

  useEffect(() => {
    setNow(new Date());
    const id = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(id);
  }, []);

  const isAboveVwap = snapshot ? snapshot.spotPrice >= snapshot.vwap : undefined;

  return (
    <header className="flex h-14 shrink-0 items-center justify-between gap-4 border-b border-panel-border bg-panel px-4">
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="icon" onClick={toggleSidebar} className="hidden md:inline-flex">
          <Menu className="h-4 w-4" />
        </Button>
        <span className="font-mono text-sm font-semibold tracking-tight md:hidden">
          SPY 0DTE COPILOT
        </span>

        {snapshot && (
          <div className="hidden items-center gap-2 sm:flex">
            <span className="font-mono text-sm font-semibold tabular">SPY</span>
            <span
              className={`font-mono text-sm font-semibold tabular ${
                isAboveVwap ? "text-bull" : "text-bear"
              }`}
            >
              ${formatPrice(snapshot.spotPrice)}
            </span>
            <span className="hidden text-xs text-muted-foreground lg:inline">
              VWAP ${formatPrice(snapshot.vwap)}
            </span>
          </div>
        )}
      </div>

      <div className="flex items-center gap-3">
        <Badge variant="wait" className="hidden sm:inline-flex">
          Mock data — Milestone 1
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
