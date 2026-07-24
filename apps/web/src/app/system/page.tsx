"use client";

import { PageHeader } from "@/components/layout/page-header";
import { SystemReadinessPanel } from "@/components/system/system-readiness-panel";

export default function SystemPage() {
  return (
    <div className="space-y-4">
      <PageHeader
        title="System Readiness"
        description="V1.9.0 configuration, persistence, locked-policy, setup-registry, Trading Workspace runtime, security, and explicit end-to-end data status."
      />
      <SystemReadinessPanel />
    </div>
  );
}
