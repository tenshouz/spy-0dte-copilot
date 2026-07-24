"use client";

import { TradePlanAlertMonitor } from "@/components/alerts/trade-plan-alert-monitor";
import { PageHeader } from "@/components/layout/page-header";

export default function AlertsPage() {
  return (
    <div className="mx-auto max-w-[1600px] min-w-0">
      <PageHeader
        title="Alerts"
        description="Source Trade Plan transition monitoring. This page distinguishes persistent backend Discord automation from explicit foreground-session controls. Discord webhook secrets remain server-side, and all controls for broker order execution are excluded. V1.9 READY alerts and position-management lifecycle remain authoritative in Trading Workspace."
      />

      <TradePlanAlertMonitor />
    </div>
  );
}
