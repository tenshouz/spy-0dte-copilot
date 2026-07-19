"use client";

import { TradePlanAlertMonitor } from "@/components/alerts/trade-plan-alert-monitor";
import { PageHeader } from "@/components/layout/page-header";

export default function AlertsPage() {
  return (
    <div className="mx-auto max-w-[1600px] min-w-0">
      <PageHeader
        title="Alerts"
        description="Opt-in monitoring and Discord delivery for deterministic Trade Plan alert transitions. Foreground browser sessions only; no database persistence, private account data, or order execution."
      />

      <TradePlanAlertMonitor />
    </div>
  );
}
