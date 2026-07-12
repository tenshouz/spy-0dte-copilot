"use client";

import type { SchwabConnectionState } from "@spy-copilot/shared";
import { useEffect, useState } from "react";
import { PageHeader } from "@/components/layout/page-header";
import { Panel } from "@/components/panels/panel";
import { Badge, type BadgeProps } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useSchwabStatus } from "@/hooks/use-schwab-status";
import { schwabLoginUrl } from "@/lib/api-client";

/**
 * Fixed, safe notices keyed by the known ?schwab= callback values the backend
 * redirects with. Raw query content is never rendered — unknown values are
 * ignored entirely.
 */
const CALLBACK_NOTICES = {
  connected: {
    tone: "bull" as const,
    text: "Schwab authorization completed successfully.",
  },
  error: {
    tone: "bear" as const,
    text: "Schwab authorization failed. Check the backend terminal for a sanitized error message.",
  },
  config_invalid: {
    tone: "bear" as const,
    text: "Schwab configuration is invalid — SCHWAB_REDIRECT_URI must be the exact HTTPS callback registered with Schwab.",
  },
  credentials_missing: {
    tone: "wait" as const,
    text: "Schwab environment variables are incomplete — fill them in apps/server/.env and restart the server.",
  },
} satisfies Record<string, { tone: "bull" | "bear" | "wait"; text: string }>;

type CallbackNoticeKey = keyof typeof CALLBACK_NOTICES;

function isKnownCallbackValue(value: string | null): value is CallbackNoticeKey {
  return value !== null && Object.prototype.hasOwnProperty.call(CALLBACK_NOTICES, value);
}

/** Reads ?schwab= once on mount, then removes it from the URL without reloading. Static-build safe (no useSearchParams). */
function useSchwabCallbackNotice(): CallbackNoticeKey | null {
  const [notice, setNotice] = useState<CallbackNoticeKey | null>(null);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const value = params.get("schwab");
    if (isKnownCallbackValue(value)) {
      setNotice(value);
    }
    if (value !== null) {
      params.delete("schwab");
      const query = params.toString();
      const cleanUrl = `${window.location.pathname}${query ? `?${query}` : ""}${window.location.hash}`;
      window.history.replaceState(null, "", cleanUrl);
    }
  }, []);

  return notice;
}

const NOTICE_TONE_CLASSES = {
  bull: "border-bull/30 bg-bull-muted text-bull",
  bear: "border-bear/30 bg-bear-muted text-bear",
  wait: "border-wait/30 bg-wait-muted text-wait",
} as const;

export default function SettingsPage() {
  const { data: schwabStatus, isLoading: schwabLoading, isError: schwabError } = useSchwabStatus();
  const callbackNotice = useSchwabCallbackNotice();
  const blockedState =
    schwabStatus?.state === "database_not_configured" ||
    schwabStatus?.state === "credentials_not_configured" ||
    schwabStatus?.state === "config_invalid";

  return (
    <div className="mx-auto max-w-2xl">
      <PageHeader
        title="Settings"
        description="Schwab connection is live (OAuth only — no market data yet). Everything else is still a placeholder."
      />

      {callbackNotice && (
        <div
          role="status"
          className={`mb-4 rounded-md border px-3 py-2 text-xs ${NOTICE_TONE_CLASSES[CALLBACK_NOTICES[callbackNotice].tone]}`}
        >
          {CALLBACK_NOTICES[callbackNotice].text}
        </div>
      )}

      <Tabs defaultValue="connections">
        <TabsList>
          <TabsTrigger value="connections">Connections</TabsTrigger>
          <TabsTrigger value="alerts">Alerts</TabsTrigger>
          <TabsTrigger value="scoring">Scoring</TabsTrigger>
        </TabsList>

        <TabsContent value="connections">
          <Panel title="Schwab API" isLoading={schwabLoading} isError={schwabError}>
            <div className="space-y-3">
              <SchwabStatusBadge state={schwabStatus?.state} expiresAt={schwabStatus?.expiresAt ?? null} />
              {schwabStatus?.detail && (
                <p className="text-xs text-wait">{schwabStatus.detail}</p>
              )}
              {schwabStatus?.state === "credentials_not_configured" && (
                <p className="text-xs text-muted-foreground">
                  Fill in the Schwab variables in apps/server/.env (see .env.example and the README
                  Windows Quick Start), then restart the server.
                </p>
              )}
              {schwabStatus?.state === "config_invalid" && (
                <p className="text-xs text-muted-foreground">
                  SCHWAB_REDIRECT_URI must be the exact HTTPS callback registered with Schwab —
                  https://&lt;your-tunnel-host&gt;/api/auth/schwab/callback — with no query string or
                  fragment. Fix apps/server/.env and restart the server.
                </p>
              )}
              <p className="text-xs text-muted-foreground">
                Authenticates with Schwab via OAuth and stores an encrypted token. Market data calls
                are not made yet (PRD Section 5).
              </p>
              {blockedState ? (
                <Button disabled className="mt-1">
                  Connect Schwab account
                </Button>
              ) : (
                <Button asChild className="mt-1">
                  <a href={schwabLoginUrl}>
                    {schwabStatus?.state === "connected" || schwabStatus?.state === "token_expired"
                      ? "Reconnect Schwab account"
                      : "Connect Schwab account"}
                  </a>
                </Button>
              )}
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

const SCHWAB_STATE_CONFIG: Record<
  SchwabConnectionState,
  { label: string; variant: BadgeProps["variant"] }
> = {
  database_not_configured: { label: "Database not configured", variant: "wait" },
  credentials_not_configured: { label: "Schwab credentials not configured", variant: "wait" },
  config_invalid: { label: "Schwab configuration invalid", variant: "bear" },
  not_connected: { label: "Not connected", variant: "default" },
  connected: { label: "Connected", variant: "bull" },
  token_expired: { label: "Token expired", variant: "bear" },
};

function SchwabStatusBadge({
  state,
  expiresAt,
}: {
  state?: SchwabConnectionState;
  expiresAt: string | null;
}) {
  if (!state) return null;
  const config = SCHWAB_STATE_CONFIG[state];
  const showExpiry = state === "connected" && expiresAt;

  return (
    <Badge variant={config.variant}>
      {config.label}
      {showExpiry ? ` — expires ${new Date(expiresAt).toLocaleTimeString()}` : ""}
    </Badge>
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
