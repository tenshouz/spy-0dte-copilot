"use client";

import type { ReportType } from "@spy-copilot/shared";
import { Panel } from "@/components/panels/panel";
import { useReportHistory } from "@/hooks/use-report";
import { cn } from "@/lib/utils";
import { useUiStore } from "@/stores/ui-store";

const REPORT_LABELS: Record<ReportType, string> = {
  premarket: "9:25 Premarket",
  "0935": "9:35 Update",
  "0945": "9:45 Update",
  "1000": "10:00 Update",
  continuous: "Live",
  manual: "Manual refresh",
};

export function SessionTimeline() {
  const { data: reports, isLoading, isError } = useReportHistory();
  const activeReportId = useUiStore((s) => s.activeReportId);
  const setActiveReportId = useUiStore((s) => s.setActiveReportId);

  return (
    <Panel title="Session Timeline" isLoading={isLoading} isError={isError}>
      <div className="flex flex-wrap items-center gap-2">
        {[...(reports ?? [])].reverse().map((report) => {
          const active = activeReportId ? activeReportId === report.id : report === reports?.[0];
          return (
            <button
              key={report.id}
              onClick={() => setActiveReportId(report.id)}
              className={cn(
                "flex items-center gap-2 rounded-md border px-2.5 py-1.5 text-xs transition-colors",
                active
                  ? "border-accent/40 bg-accent/10 text-foreground"
                  : "border-panel-border text-muted-foreground hover:bg-panel-hover",
              )}
            >
              <span
                className={cn(
                  "h-1.5 w-1.5 rounded-full",
                  report.bias === "CALLS" && "bg-bull",
                  report.bias === "PUTS" && "bg-bear",
                  report.bias === "WAIT" && "bg-wait",
                )}
              />
              {REPORT_LABELS[report.type]}
            </button>
          );
        })}
      </div>
    </Panel>
  );
}
