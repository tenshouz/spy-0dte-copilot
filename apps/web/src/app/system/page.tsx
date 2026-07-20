"use client";

import { PageHeader } from "@/components/layout/page-header";
import { SystemReadinessPanel } from "@/components/system/system-readiness-panel";

export default function SystemPage() {
  return (
    <div className="space-y-4">
      <PageHeader
        title="System Readiness"
        description="Final V1 operational status, security boundaries, recovery findings, and an explicit live-data probe."
      />
      <SystemReadinessPanel />
    </div>
  );
}
