import { DashboardGuide } from "@/components/guide/dashboard-guide";
import { PageHeader } from "@/components/layout/page-header";

export default function GuidePage() {
  return (
    <div className="mx-auto max-w-[1500px]">
      <PageHeader
        title="Dashboard Guide"
        description="A plain-English walkthrough of every page, status, Trade Plan step, alert, and safety boundary in the SPY 0DTE Copilot."
      />
      <DashboardGuide />
    </div>
  );
}
