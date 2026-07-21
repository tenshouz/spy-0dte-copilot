"use client";

import { Panel } from "@/components/panels/panel";
import { useDisplaySpyZeroDteDeterministicBias } from "@/hooks/use-spy-market-bias";
import {
  MARKET_STATE_TRANSPORT_WARNING,
  useDisplaySpyZeroDteDeterministicMarketState,
} from "@/hooks/use-spy-market-state";
import {
  formatDashboardPrice,
  formatDashboardReferenceDistance,
  getDashboardBiasView,
  getNearestDashboardMarketReference,
} from "@/lib/dashboard-deterministic-view";
import { cn } from "@/lib/utils";

function displayState(value: string | null): string {
  return value === null ? "Unavailable" : value.replace(/_/g, " ");
}

export function MarketRegimeCard() {
  const marketStateQuery = useDisplaySpyZeroDteDeterministicMarketState();
  const biasQuery = useDisplaySpyZeroDteDeterministicBias();
  const state = marketStateQuery.display?.response;
  const bias = biasQuery.display?.response;
  const biasView = bias ? getDashboardBiasView(bias.biasState) : null;
  const nearestReference = state ? getNearestDashboardMarketReference(state) : null;

  return (
    <Panel
      title="Market Structure"
      isLoading={marketStateQuery.isLoading}
      isError={marketStateQuery.isError}
      className="lg:col-span-1"
    >
      {state && (
        <div className="space-y-3">
          <span className="font-mono text-xl font-bold tracking-tight">
            {displayState(state.features.sessionPhase.state)}
          </span>

          <div className="grid grid-cols-2 gap-2">
            <div className="rounded-md border border-panel-border bg-background/40 px-2.5 py-2">
              <p className="text-[9px] font-medium uppercase tracking-wider text-muted-foreground">
                Directional read
              </p>
              <p
                className={cn(
                  "mt-0.5 font-mono text-sm font-semibold",
                  biasView?.tone === "bull"
                    ? "text-bull"
                    : biasView?.tone === "bear"
                      ? "text-bear"
                      : biasView?.tone === "wait"
                        ? "text-wait"
                        : "text-muted-foreground",
                )}
              >
                {biasView?.label ?? "UNAVAILABLE"}
              </p>
            </div>
            <div className="rounded-md border border-panel-border bg-background/40 px-2.5 py-2">
              <p className="text-[9px] font-medium uppercase tracking-wider text-muted-foreground">
                Nearest key level
              </p>
              <p className="mt-0.5 truncate font-mono text-sm font-semibold">
                {nearestReference?.label ?? "Unavailable"}
              </p>
              {nearestReference && (
                <p className="mt-0.5 text-[10px] leading-snug text-muted-foreground">
                  {formatDashboardPrice(nearestReference.level)} · {formatDashboardReferenceDistance(nearestReference.distancePoints)}
                </p>
              )}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-x-2 gap-y-1.5 text-[11px]">
            <span className="text-muted-foreground">Vs. VWAP</span>
            <span className="text-right font-mono">{displayState(state.features.priceVsVwap.state)}</span>
            <span className="text-muted-foreground">Prior Range</span>
            <span className="text-right font-mono">{displayState(state.features.priceVsPriorDayRange.state)}</span>
            <span className="text-muted-foreground">Premarket</span>
            <span className="text-right font-mono">{displayState(state.features.priceVsPremarketRange.state)}</span>
            <span className="text-muted-foreground">Opening Range</span>
            <span className="text-right font-mono">{displayState(state.features.priceVsOpeningRange.state)}</span>
          </div>

          {marketStateQuery.display?.transportFailed && (
            <p className="text-xs text-wait">{MARKET_STATE_TRANSPORT_WARNING}</p>
          )}
        </div>
      )}
    </Panel>
  );
}
