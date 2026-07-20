"use client";

import type {
  SessionOpeningRangeWindow,
  TraditionalPivotSet,
} from "@spy-copilot/shared";
import { MetricCard } from "@/components/panels/metric-card";
import { Panel } from "@/components/panels/panel";
import { Badge } from "@/components/ui/badge";
import {
  SESSION_STRUCTURE_TRANSPORT_WARNING,
  useDisplaySpyDeterministicSessionStructure,
} from "@/hooks/use-spy-session-structure";
import {
  formatPivotSourceRange,
  formatSessionStructureState,
  formatStructurePrice,
  openingRangeDetail,
  openingRangeTitle,
} from "@/lib/session-structure-view";

function engineTone(state: string): "bull" | "wait" | "bear" {
  if (state === "AVAILABLE" || state === "LIVE") return "bull";
  if (state === "UNAVAILABLE") return "bear";
  return "wait";
}

function PivotGrid({ pivots }: { pivots: TraditionalPivotSet }) {
  return (
    <div className="space-y-2 rounded-md border border-panel-border p-3">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <h3 className="text-xs font-semibold">
            {pivots.period === "DAILY"
              ? "Daily Traditional Pivots"
              : "Weekly Traditional Pivots"}
          </h3>
          <p className="mt-1 text-[11px] text-muted-foreground">
            Source: {formatPivotSourceRange(pivots)} · {pivots.observedTradingSessionCount}/
            {pivots.expectedTradingSessionCount} sessions
          </p>
        </div>
        <Badge variant={engineTone(pivots.metricState)}>
          {pivots.metricState}
        </Badge>
      </div>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-5">
        <MetricCard label="Pivot" value={formatStructurePrice(pivots.pivot)} />
        <MetricCard label="R1" value={formatStructurePrice(pivots.resistance1)} tone="bull" />
        <MetricCard label="S1" value={formatStructurePrice(pivots.support1)} tone="bear" />
        <MetricCard label="R2" value={formatStructurePrice(pivots.resistance2)} tone="bull" />
        <MetricCard label="S2" value={formatStructurePrice(pivots.support2)} tone="bear" />
      </div>
      {pivots.warningCode && (
        <p className="text-[11px] text-wait">
          {formatSessionStructureState(pivots.warningCode)}
        </p>
      )}
    </div>
  );
}

function OpeningRangeCard({ range }: { range: SessionOpeningRangeWindow }) {
  return (
    <div className="space-y-2 rounded-md border border-panel-border p-3">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <h3 className="text-xs font-semibold">{openingRangeTitle(range)}</h3>
          <p className="mt-1 text-[11px] text-muted-foreground">
            {openingRangeDetail(range)} · {range.observedCandleCount}/{range.expectedCandleCount} completed 5m candles
          </p>
        </div>
        <Badge variant={engineTone(range.metricState)}>{range.metricState}</Badge>
      </div>
      <div className="grid grid-cols-3 gap-2">
        <MetricCard label="High" value={formatStructurePrice(range.high)} />
        <MetricCard label="Midpoint" value={formatStructurePrice(range.midpoint)} />
        <MetricCard label="Low" value={formatStructurePrice(range.low)} />
      </div>
      <div className="grid grid-cols-2 gap-2 text-[11px] text-muted-foreground">
        <div>
          Price position: <span className="font-mono text-foreground">{formatSessionStructureState(range.pricePosition)}</span>
        </div>
        <div>
          Interaction: <span className="font-mono text-foreground">{formatSessionStructureState(range.interactionState)}</span>
        </div>
      </div>
      {range.warningCode && (
        <p className="text-[11px] text-wait">
          {formatSessionStructureState(range.warningCode)}
        </p>
      )}
    </div>
  );
}

export function SessionStructurePanel({ className }: { className?: string }) {
  const query = useDisplaySpyDeterministicSessionStructure();
  const response = query.display?.response ?? null;

  return (
    <Panel
      title="Complete Session Structure"
      isLoading={query.isLoading}
      isError={query.isError}
      className={className}
      action={
        response && (
          <Badge variant={engineTone(response.engineState)}>
            {response.engineState}
          </Badge>
        )
      }
    >
      {response && (
        <div className="space-y-3">
          <div className="grid gap-3 lg:grid-cols-2">
            <PivotGrid pivots={response.dailyPivots} />
            <PivotGrid pivots={response.weeklyPivots} />
          </div>
          <div className="grid gap-3 lg:grid-cols-3">
            <OpeningRangeCard range={response.openingRanges.fiveMinute} />
            <OpeningRangeCard range={response.openingRanges.fifteenMinute} />
            <OpeningRangeCard range={response.openingRanges.thirtyMinute} />
          </div>
          <p className="text-[11px] leading-relaxed text-muted-foreground">
            Traditional P/R1/S1/R2/S2 levels are derived from the immediate previous complete RTH session and the previous complete NYSE trading week. Opening-range states use completed five-minute candles only; acceptance requires two consecutive completed closes beyond a completed range.
          </p>
          {query.display?.transportFailed && (
            <p className="text-xs text-wait">{SESSION_STRUCTURE_TRANSPORT_WARNING}</p>
          )}
        </div>
      )}
    </Panel>
  );
}
