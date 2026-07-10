import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

interface MetricCardProps {
  label: string;
  value: ReactNode;
  sublabel?: ReactNode;
  tone?: "default" | "bull" | "bear" | "wait";
  className?: string;
}

const toneClasses: Record<NonNullable<MetricCardProps["tone"]>, string> = {
  default: "text-foreground",
  bull: "text-bull",
  bear: "text-bear",
  wait: "text-wait",
};

/**
 * The atomic data unit of the terminal: a label, a tabular-numeral value, and
 * an optional sublabel (e.g. a delta vs. prior value). Used for VWAP, spot
 * price, GEX, DEX, expected move, and every other single-figure stat.
 */
export function MetricCard({ label, value, sublabel, tone = "default", className }: MetricCardProps) {
  return (
    <div className={cn("flex flex-col gap-0.5 rounded-md border border-panel-border bg-background/40 p-3", className)}>
      <span className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
        {label}
      </span>
      <span className={cn("font-mono text-lg font-semibold tabular", toneClasses[tone])}>{value}</span>
      {sublabel ? (
        <span className="text-[11px] text-muted-foreground">{sublabel}</span>
      ) : null}
    </div>
  );
}
