import type { Alert } from "@spy-copilot/shared";
import { AlertTriangle, Bell, TrendingUp, XOctagon } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { formatTime } from "@/lib/format";
import { cn } from "@/lib/utils";

const severityConfig: Record<
  Alert["severity"],
  { icon: typeof Bell; badge: "accent" | "bull" | "bear" | "wait"; label: string }
> = {
  info: { icon: Bell, badge: "accent", label: "Info" },
  bias_change: { icon: TrendingUp, badge: "bull", label: "Bias change" },
  invalidation: { icon: XOctagon, badge: "bear", label: "Invalidation" },
  warning: { icon: AlertTriangle, badge: "wait", label: "Warning" },
};

export function AlertCard({ alert }: { alert: Alert }) {
  const config = severityConfig[alert.severity];
  const Icon = config.icon;

  return (
    <div
      className={cn(
        "flex gap-3 rounded-md border border-panel-border bg-background/40 p-3",
        !alert.delivered && "border-dashed opacity-80",
      )}
    >
      <Icon
        className={cn(
          "mt-0.5 h-4 w-4 shrink-0",
          config.badge === "bull" && "text-bull",
          config.badge === "bear" && "text-bear",
          config.badge === "wait" && "text-wait",
          config.badge === "accent" && "text-accent",
        )}
      />
      <div className="flex-1 space-y-1">
        <div className="flex items-center justify-between gap-2">
          <span className="text-sm font-medium text-foreground">{alert.title}</span>
          <Badge variant={config.badge}>{config.label}</Badge>
        </div>
        <p className="text-xs text-muted-foreground">{alert.message}</p>
        <div className="flex items-center gap-2 text-[11px] text-muted-foreground">
          <span className="font-mono tabular">{formatTime(alert.createdAt)}</span>
          {!alert.delivered && <span className="text-wait">Delivery pending</span>}
        </div>
      </div>
    </div>
  );
}
