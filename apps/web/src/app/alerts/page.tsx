"use client";

import { TradePlanAlertMonitor } from "@/components/alerts/trade-plan-alert-monitor";
import { PageHeader } from "@/components/layout/page-header";

export default function AlertsPage() {
  return (
    <div className="mx-auto max-w-[1600px] min-w-0">
      <PageHeader
        title="Alerts"
        description="Deterministic Trade Plan monitoring with persistent backend Discord automation plus explicit foreground-session controls. Delivery audit data may be persisted, but webhook secrets, private account data, sizing data, and order execution are excluded."
      />

      <TradePlanAlertMonitor />
    </div>
  );
}
