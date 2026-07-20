"use client";

import { Panel } from "@/components/panels/panel";
import {
  MARKET_BIAS_TRANSPORT_WARNING,
  useDisplaySpyZeroDteDeterministicBias,
} from "@/hooks/use-spy-market-bias";
import { cn } from "@/lib/utils";

export function ConfidenceCard() {
  const { display, isLoading, isError } = useDisplaySpyZeroDteDeterministicBias();
  const bias = display?.response;
  const confidence = bias?.confidenceScore ?? null;
  const filledSegments = confidence === null ? 0 : Math.round(confidence / 10);

  return (
    <Panel title="Structural Confidence" isLoading={isLoading} isError={isError} className="lg:col-span-1">
      {bias && (
        <div className="flex h-full flex-col justify-between gap-3">
          <div className="flex items-baseline justify-between">
            <span className="font-mono text-3xl font-bold tabular">
              {confidence === null ? "—" : confidence.toFixed(0)}
            </span>
            <span className="text-xs text-muted-foreground">/ 100</span>
          </div>
          <div className="flex gap-0.5">
            {Array.from({ length: 10 }).map((_, index) => (
              <span
                key={index}
                className={cn(
                  "h-1.5 flex-1 rounded-sm",
                  index < filledSegments ? "bg-accent" : "bg-muted",
                )}
              />
            ))}
          </div>
          <p className="text-xs text-muted-foreground">
            {bias.bullishEvidenceCount} bullish · {bias.bearishEvidenceCount} bearish · {bias.neutralEvidenceCount} neutral
          </p>
          {display?.transportFailed && (
            <p className="text-xs text-wait">{MARKET_BIAS_TRANSPORT_WARNING}</p>
          )}
        </div>
      )}
    </Panel>
  );
}
