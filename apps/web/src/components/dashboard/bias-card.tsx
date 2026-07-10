"use client";

import type { Bias } from "@spy-copilot/shared";
import { Minus, TrendingDown, TrendingUp } from "lucide-react";
import { Panel } from "@/components/panels/panel";
import { useLatestReport } from "@/hooks/use-report";
import { cn } from "@/lib/utils";

const biasConfig: Record<Bias, { label: string; icon: typeof TrendingUp; className: string }> = {
  CALLS: { label: "CALLS", icon: TrendingUp, className: "text-bull border-bull/40 bg-bull-muted" },
  PUTS: { label: "PUTS", icon: TrendingDown, className: "text-bear border-bear/40 bg-bear-muted" },
  WAIT: { label: "WAIT", icon: Minus, className: "text-wait border-wait/40 bg-wait-muted" },
};

export function BiasCard() {
  const { data: report, isLoading, isError } = useLatestReport();

  return (
    <Panel title="Current Bias" isLoading={isLoading} isError={isError} className="lg:col-span-1">
      {report && (
        <div className="flex flex-col gap-3">
          <div
            className={cn(
              "flex items-center justify-between rounded-md border px-4 py-3",
              biasConfig[report.bias].className,
            )}
          >
            <div className="flex items-center gap-2">
              {(() => {
                const Icon = biasConfig[report.bias].icon;
                return <Icon className="h-5 w-5" />;
              })()}
              <span className="font-mono text-2xl font-bold tracking-tight">
                {biasConfig[report.bias].label}
              </span>
            </div>
            <ConfidenceMeter confidence={report.confidence} />
          </div>

          <p className="text-xs leading-relaxed text-muted-foreground">
            {report.factorScores
              .slice(0, 3)
              .map((f) => f.factor)
              .join(" · ")}
          </p>
        </div>
      )}
    </Panel>
  );
}

function ConfidenceMeter({ confidence }: { confidence: number }) {
  return (
    <div className="flex flex-col items-end gap-1">
      <span className="font-mono text-sm font-semibold tabular">{confidence}/10</span>
      <div className="flex gap-0.5">
        {Array.from({ length: 10 }).map((_, i) => (
          <span
            key={i}
            className={cn(
              "h-1.5 w-2 rounded-sm",
              i < confidence ? "bg-current" : "bg-current/20",
            )}
          />
        ))}
      </div>
    </div>
  );
}
