"use client";

import type { GapDirection, SessionLevelValue, SpyRthGapResponse } from "@spy-copilot/shared";
import { MetricCard } from "@/components/panels/metric-card";
import { Panel } from "@/components/panels/panel";
import { useMarketSnapshot } from "@/hooks/use-market-snapshot";
import {
  RTH_GAP_TRANSPORT_WARNING,
  useDisplaySpyRthGap,
} from "@/hooks/use-spy-rth-gap";
import {
  SESSION_LEVELS_TRANSPORT_WARNING,
  useDisplaySpySessionLevels,
} from "@/hooks/use-spy-session-levels";
import { formatEasternTime, formatPrice, formatSigned } from "@/lib/format";

function formatSessionLevel(level: SessionLevelValue): string {
  return level.value === null ? "Unavailable" : `$${formatPrice(level.value)}`;
}

function gapTone(
  direction: GapDirection,
): "default" | "bull" | "bear" | "wait" {
  if (direction === "UP") return "bull";
  if (direction === "DOWN") return "bear";
  if (direction === "UNAVAILABLE") return "wait";
  return "default";
}

function formatGapValue(gap: SpyRthGapResponse): string {
  if (gap.gapPoints === null || gap.gapPercent === null) return "Unavailable";
  return `${formatSigned(gap.gapPoints)} pts / ${formatSigned(gap.gapPercent)}%`;
}

function formatFillSublabel(gap: SpyRthGapResponse): string | undefined {
  if (gap.firstObservedFillCandleAt) {
    return `First observed by ${formatEasternTime(gap.firstObservedFillCandleAt)}`;
  }
  if (gap.fillState === "UNKNOWN") return "Missing RTH interval";
  if (gap.fillState === "UNAVAILABLE") return "Available after the official RTH open";
  return undefined;
}

export function TodaysLevelsCard() {
  const { data: snapshot } = useMarketSnapshot();
  const {
    display: levelsDisplay,
    isLoading: levelsLoading,
    isError: levelsError,
  } = useDisplaySpySessionLevels();
  const {
    display: gapDisplay,
    isLoading: gapLoading,
    isError: gapError,
  } = useDisplaySpyRthGap();
  const levels = levelsDisplay?.response;
  const gap = gapDisplay?.response;

  return (
    <Panel
      title="Today's Levels"
      isLoading={levelsLoading && gapLoading}
      isError={levelsError && gapError}
      className="lg:col-span-2"
    >
      {(levels || gap) && (
        <div className="space-y-2">
          <p className="text-xs text-muted-foreground">
            Current date: {levels?.currentMarketDate ?? gap?.currentMarketDate ?? "Unavailable"} · Previous RTH:{" "}
            {levels?.previousRthMarketDate ?? gap?.previousRthMarketDate ?? "Unavailable"}
          </p>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
            {snapshot && (
              <>
                <MetricCard
                  label="Overnight High · MOCK"
                  value={`$${formatPrice(snapshot.overnightHigh ?? 0)}`}
                />
                <MetricCard
                  label="Overnight Low · MOCK"
                  value={`$${formatPrice(snapshot.overnightLow ?? 0)}`}
                />
              </>
            )}
            {levels && (
              <>
                <MetricCard
                  label={`Premarket High · ${levels.premarketHigh.state}`}
                  value={formatSessionLevel(levels.premarketHigh)}
                />
                <MetricCard
                  label={`Premarket Low · ${levels.premarketLow.state}`}
                  value={formatSessionLevel(levels.premarketLow)}
                />
                <MetricCard
                  label={`Prev Day High · ${levels.previousDayHigh.state}`}
                  value={formatSessionLevel(levels.previousDayHigh)}
                />
                <MetricCard
                  label={`Prev Day Low · ${levels.previousDayLow.state}`}
                  value={formatSessionLevel(levels.previousDayLow)}
                />
                <MetricCard
                  label={`Prev Day Close · ${levels.previousDayClose.state}`}
                  value={formatSessionLevel(levels.previousDayClose)}
                />
              </>
            )}
            {gap && (
              <>
                <MetricCard
                  label={`RTH Open · ${gap.metricState}`}
                  value={gap.currentRthOpen === null ? "Unavailable" : `$${formatPrice(gap.currentRthOpen)}`}
                  sublabel={gap.currentRthOpenAt ? formatEasternTime(gap.currentRthOpenAt) : undefined}
                  tone={gap.metricState === "UNAVAILABLE" ? "wait" : "default"}
                />
                <MetricCard
                  label={`RTH Gap · ${gap.metricState}`}
                  value={formatGapValue(gap)}
                  sublabel={gap.direction === "UNAVAILABLE" ? undefined : gap.direction}
                  tone={gapTone(gap.direction)}
                />
                <MetricCard
                  label={`Gap Fill · ${gap.metricState}`}
                  value={gap.fillState.replace(/_/g, " ")}
                  sublabel={formatFillSublabel(gap)}
                  tone={gap.fillState === "UNKNOWN" || gap.fillState === "UNAVAILABLE" ? "wait" : "default"}
                />
              </>
            )}
            {snapshot && (
              <>
                <MetricCard
                  label="Opening Range High · MOCK"
                  value={`$${formatPrice(snapshot.openingRangeHigh ?? 0)}`}
                />
                <MetricCard
                  label="Opening Range Low · MOCK"
                  value={`$${formatPrice(snapshot.openingRangeLow ?? 0)}`}
                />
              </>
            )}
          </div>
          {levelsDisplay?.transportFailed && (
            <p className="text-xs text-wait">{SESSION_LEVELS_TRANSPORT_WARNING}</p>
          )}
          {gapDisplay?.transportFailed && (
            <p className="text-xs text-wait">{RTH_GAP_TRANSPORT_WARNING}</p>
          )}
        </div>
      )}
    </Panel>
  );
}
