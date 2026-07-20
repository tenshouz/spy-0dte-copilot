"use client";

import { Panel } from "@/components/panels/panel";
import {
  MARKET_STATE_TRANSPORT_WARNING,
  useDisplaySpyZeroDteDeterministicMarketState,
} from "@/hooks/use-spy-market-state";

function displayState(value: string | null): string {
  return value === null ? "Unavailable" : value.replace(/_/g, " ");
}

export function MarketRegimeCard() {
  const { display, isLoading, isError } = useDisplaySpyZeroDteDeterministicMarketState();
  const state = display?.response;

  return (
    <Panel title="Market Structure" isLoading={isLoading} isError={isError} className="lg:col-span-1">
      {state && (
        <div className="flex h-full flex-col justify-between gap-2">
          <span className="font-mono text-xl font-bold tracking-tight">
            {displayState(state.features.sessionPhase.state)}
          </span>
          <div className="grid grid-cols-2 gap-x-2 gap-y-1 text-xs">
            <span className="text-muted-foreground">Vs. VWAP</span>
            <span className="text-right font-mono">{displayState(state.features.priceVsVwap.state)}</span>
            <span className="text-muted-foreground">Prior Range</span>
            <span className="text-right font-mono">{displayState(state.features.priceVsPriorDayRange.state)}</span>
            <span className="text-muted-foreground">Premarket</span>
            <span className="text-right font-mono">{displayState(state.features.priceVsPremarketRange.state)}</span>
            <span className="text-muted-foreground">Opening Range</span>
            <span className="text-right font-mono">{displayState(state.features.priceVsOpeningRange.state)}</span>
          </div>
          {display.transportFailed && (
            <p className="text-xs text-wait">{MARKET_STATE_TRANSPORT_WARNING}</p>
          )}
        </div>
      )}
    </Panel>
  );
}
