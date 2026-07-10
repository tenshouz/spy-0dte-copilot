"use client";

import { Panel } from "@/components/panels/panel";
import { useLatestReport } from "@/hooks/use-report";
import { cn } from "@/lib/utils";

export function ConfidenceCard() {
  const { data: report, isLoading, isError } = useLatestReport();

  const topFactor = report?.factorScores.slice().sort((a, b) => b.points - a.points)[0];

  return (
    <Panel title="Confidence" isLoading={isLoading} isError={isError} className="lg:col-span-1">
      {report && (
        <div className="flex h-full flex-col justify-between gap-3">
          <div className="flex items-baseline justify-between">
            <span className="font-mono text-3xl font-bold tabular">{report.confidence}</span>
            <span className="text-xs text-muted-foreground">/ 10</span>
          </div>
          <div className="flex gap-0.5">
            {Array.from({ length: 10 }).map((_, i) => (
              <span
                key={i}
                className={cn(
                  "h-1.5 flex-1 rounded-sm",
                  i < report.confidence ? "bg-accent" : "bg-muted",
                )}
              />
            ))}
          </div>
          {topFactor && (
            <p className="text-xs text-muted-foreground">
              Top factor: <span className="text-foreground">{topFactor.factor}</span> ({topFactor.points > 0 ? "+" : ""}
              {topFactor.points})
            </p>
          )}
        </div>
      )}
    </Panel>
  );
}
