"use client";

import { PageHeader } from "@/components/layout/page-header";
import { AlertCard } from "@/components/panels/alert-card";
import { Panel } from "@/components/panels/panel";
import { useAlerts } from "@/hooks/use-alerts";

export default function AlertsPage() {
  const { data: alerts, isLoading, isError } = useAlerts();

  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader
        title="Alerts"
        description="Mirrors what's sent to Discord (PRD Section 12) — webhook delivery lands in Milestone 2."
      />

      <Panel
        title={`Recent alerts (${alerts?.length ?? 0})`}
        isLoading={isLoading}
        isError={isError}
        isEmpty={alerts?.length === 0}
        emptyMessage="No alerts yet."
      >
        <div className="space-y-2">
          {alerts?.map((alert) => (
            <AlertCard key={alert.id} alert={alert} />
          ))}
        </div>
      </Panel>
    </div>
  );
}
