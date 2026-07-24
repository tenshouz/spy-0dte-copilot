import { DashboardGuide } from "@/components/guide/dashboard-guide";
import { PageHeader } from "@/components/layout/page-header";

export default function GuidePage() {
  return (
    <div className="mx-auto max-w-[1500px]">
      <PageHeader
        title="Dashboard Guide"
        description="A plain-English walkthrough of V1.9.0, including every page, the locked trading policy, Workspace lifecycle, statuses, alerts, research, and safety boundaries."
      />
      <DashboardGuide />
    </div>
  );
}
