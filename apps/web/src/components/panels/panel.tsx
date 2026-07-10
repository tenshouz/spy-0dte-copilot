import type { ReactNode } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";

interface PanelProps {
  title: string;
  action?: ReactNode;
  className?: string;
  contentClassName?: string;
  children: ReactNode;
  /** Pass through query state so every panel shows loading/error consistently. */
  isLoading?: boolean;
  isError?: boolean;
  isEmpty?: boolean;
  emptyMessage?: string;
  noPadding?: boolean;
}

export function Panel({
  title,
  action,
  className,
  contentClassName,
  children,
  isLoading,
  isError,
  isEmpty,
  emptyMessage = "No data yet.",
  noPadding,
}: PanelProps) {
  return (
    <Card className={cn("flex h-full flex-col", className)}>
      <CardHeader>
        <CardTitle>{title}</CardTitle>
        {action}
      </CardHeader>
      <CardContent className={cn("flex-1", noPadding && "p-0", contentClassName)}>
        {isError ? (
          <PanelMessage tone="error">Couldn't load this data. Retrying shortly.</PanelMessage>
        ) : isLoading ? (
          <PanelSkeleton />
        ) : isEmpty ? (
          <PanelMessage tone="empty">{emptyMessage}</PanelMessage>
        ) : (
          <div className="animate-fade-in">{children}</div>
        )}
      </CardContent>
    </Card>
  );
}

function PanelMessage({ tone, children }: { tone: "error" | "empty"; children: ReactNode }) {
  return (
    <div
      className={cn(
        "flex h-full min-h-[64px] items-center justify-center rounded-md border border-dashed p-4 text-center text-xs",
        tone === "error"
          ? "border-bear/30 text-bear"
          : "border-panel-border text-muted-foreground",
      )}
    >
      {children}
    </div>
  );
}

function PanelSkeleton() {
  return (
    <div className="space-y-2.5">
      <div className="h-3 w-3/4 animate-pulse rounded-md bg-muted" />
      <div className="h-3 w-1/2 animate-pulse rounded-md bg-muted" style={{ animationDelay: "75ms" }} />
      <div className="h-3 w-2/3 animate-pulse rounded-md bg-muted" style={{ animationDelay: "150ms" }} />
    </div>
  );
}

export { PanelMessage };
