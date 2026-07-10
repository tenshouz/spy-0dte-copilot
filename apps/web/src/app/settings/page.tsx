"use client";

import { PageHeader } from "@/components/layout/page-header";
import { Panel } from "@/components/panels/panel";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

export default function SettingsPage() {
  return (
    <div className="mx-auto max-w-2xl">
      <PageHeader
        title="Settings"
        description="Placeholder in Milestone 1 — no keys are stored or sent anywhere yet."
      />

      <Tabs defaultValue="connections">
        <TabsList>
          <TabsTrigger value="connections">Connections</TabsTrigger>
          <TabsTrigger value="alerts">Alerts</TabsTrigger>
          <TabsTrigger value="scoring">Scoring</TabsTrigger>
        </TabsList>

        <TabsContent value="connections">
          <Panel title="Schwab API">
            <div className="space-y-3">
              <Badge variant="wait">Not connected — Milestone 2</Badge>
              <Field label="Client ID" placeholder="Coming in Milestone 2" />
              <Field label="Client Secret" placeholder="Coming in Milestone 2" type="password" />
              <Button disabled className="mt-1">
                Connect Schwab account
              </Button>
            </div>
          </Panel>

          <div className="h-3" />

          <Panel title="Discord Webhook">
            <div className="space-y-3">
              <Field label="Webhook URL" placeholder="https://discord.com/api/webhooks/…" />
              <Button disabled>Save webhook</Button>
            </div>
          </Panel>
        </TabsContent>

        <TabsContent value="alerts">
          <Panel title="Alert Preferences">
            <div className="space-y-3 text-sm">
              {[
                "Premarket report",
                "Scheduled intraday updates (9:35 / 9:45 / 10:00)",
                "Bias change alerts",
                "Trade plan invalidation alerts",
                "End-of-day summary",
              ].map((label) => (
                <div key={label} className="flex items-center justify-between border-b border-panel-border pb-2 last:border-0">
                  <span>{label}</span>
                  <Badge variant="default">Toggle — M2</Badge>
                </div>
              ))}
            </div>
          </Panel>
        </TabsContent>

        <TabsContent value="scoring">
          <Panel title="Reasoning Engine">
            <div className="space-y-3 text-sm">
              <div className="flex items-center justify-between">
                <span>Scoring rules version</span>
                <Badge variant="accent">v1</Badge>
              </div>
              <Separator />
              <p className="text-xs text-muted-foreground">
                Per-factor point weights (PRD Section 9) will be editable here once the deterministic
                scoring layer ships in Milestone 3 — including an aggressiveness profile
                (conservative / standard / aggressive).
              </p>
            </div>
          </Panel>
        </TabsContent>
      </Tabs>
    </div>
  );
}

function Field({
  label,
  placeholder,
  type = "text",
}: {
  label: string;
  placeholder: string;
  type?: string;
}) {
  return (
    <label className="block space-y-1">
      <span className="text-xs font-medium text-muted-foreground">{label}</span>
      <input
        disabled
        type={type}
        placeholder={placeholder}
        className="w-full rounded-md border border-panel-border bg-background/40 px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground disabled:cursor-not-allowed disabled:opacity-60"
      />
    </label>
  );
}
