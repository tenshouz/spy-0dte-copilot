"use client";

import type { SessionLevelValue } from "@spy-copilot/shared";
import { MetricCard } from "@/components/panels/metric-card";
import { Panel } from "@/components/panels/panel";
import { useMarketSnapshot } from "@/hooks/use-market-snapshot";
import { useDisplaySpySessionLevels } from "@/hooks/use-spy-session-levels";
import { formatPrice } from "@/lib/format";

function formatSessionLevel(level: SessionLevelValue): string {
  return level.value === null ? "Unavailable" : `$${formatPrice(level.value)}`;
}

export function TodaysLevelsCard() {
  const { data: snapshot } = useMarketSnapshot();
  const {
    display: levelsDisplay,
    isLoading: levelsLoading,
    isError: levelsError,
  } = useDisplaySpySessionLevels();
  const levels = levelsDisplay?.response;

  return (
    <Panel
      title="Today's Levels"
      isLoading={levelsLoading}
      isError={levelsError}
      className="lg:col-span-2"
    >
      {levels && (
        <div className="space-y-2">
          <p className="text-xs text-muted-foreground">
            Current date: {levels.currentMarketDate} · Previous RTH:{" "}
            {levels.previousRthMarketDate ?? "Unavailable"}
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
        </div>
      )}
    </Panel>
  );
}
