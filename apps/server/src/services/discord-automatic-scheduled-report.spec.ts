import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  DiscordAutomaticScheduledReportDeliveryRequestSchema,
  DiscordAutomaticScheduledReportDeliveryResponseSchema,
  type DiscordAutomaticScheduledReportDeliveryRequest,
  type DiscordScheduledReportDeliveryResponse,
} from "@spy-copilot/shared";
import {
  automaticScheduledReportDeliveryKey,
  createDiscordAutomaticScheduledReportProcessState,
  isAmbiguousScheduledReportProviderOutcome,
} from "./discord-automatic-scheduled-report.logic";
import {
  createSerializedDiscordAutomaticScheduledReportRunner,
  runDiscordAutomaticScheduledReportDeliveryWithDependencies,
  type DiscordAutomaticScheduledReportDeliveryDependencies,
} from "./discord-automatic-scheduled-report.service";
import { evaluateSpyZeroDteScheduledReportSchedule } from "./scheduled-report-schedule.logic";

let passed = 0;
let failed = 0;
function test(name: string, fn: () => void | Promise<void>): void {
  Promise.resolve()
    .then(fn)
    .then(() => {
      passed += 1;
      console.log(`✓ ${name}`);
    })
    .catch((error) => {
      failed += 1;
      console.error(`✗ ${name}`);
      console.error(error);
    });
}

const request: DiscordAutomaticScheduledReportDeliveryRequest = {
  clientMode: "FOREGROUND_BROWSER_SESSION",
  cadenceMilliseconds: 60_000,
};
const dueMs = Date.parse("2026-07-20T13:25:30.000Z");
const waitingMs = Date.parse("2026-07-20T13:20:00.000Z");

function delivery(
  reason: DiscordScheduledReportDeliveryResponse["primaryReasonCode"],
  attemptedAtMs = dueMs,
): DiscordScheduledReportDeliveryResponse {
  const providerRequestAttempted = [
    "REPORT_DELIVERED",
    "WEBHOOK_REQUEST_TIMEOUT",
    "WEBHOOK_NETWORK_FAILURE",
    "WEBHOOK_RATE_LIMITED",
    "WEBHOOK_REJECTED",
    "WEBHOOK_PROVIDER_FAILURE",
  ].includes(reason);
  const report = [
    "WEBHOOK_NOT_CONFIGURED",
    "WEBHOOK_CONFIG_INVALID",
    "REPORT_GENERATION_FAILURE",
  ].includes(reason)
    ? null
    : {
        product: "SPY_ZERO_DTE_DETERMINISTIC_SCHEDULED_REPORT" as const,
        methodologyVersion: "SCHEDULED_REPORT_V1" as const,
        reportType: "PREMARKET_0925" as const,
        scheduleReferenceEasternTime: "09:25" as const,
        currentMarketDate: "2026-07-20",
        generatedAt: new Date(attemptedAtMs).toISOString(),
        engineState: "AVAILABLE" as const,
        reportState: "INFORMATIONAL" as const,
        primaryReasonCode: "NOT_APPLICABLE_SUMMARY" as const,
        title: "SPY 0DTE 9:25 AM Premarket Report",
        headline: "Methodology not applicable.",
        direction: "NONE" as const,
        checklistItemCount: 5,
        warningCount: 0,
      };

  return {
    product: "DISCORD_DETERMINISTIC_SCHEDULED_REPORT_DELIVERY",
    methodologyVersion: "DISCORD_SCHEDULED_REPORT_DELIVERY_V1",
    deliveryState: reason === "REPORT_DELIVERED" ? "DELIVERED" : "NOT_DELIVERED",
    primaryReasonCode: reason,
    reportType: "PREMARKET_0925",
    attemptedAt: new Date(attemptedAtMs).toISOString(),
    deliveredAt:
      reason === "REPORT_DELIVERED"
        ? new Date(attemptedAtMs).toISOString()
        : null,
    providerStatusCode:
      reason === "REPORT_DELIVERED"
        ? 200
        : reason === "WEBHOOK_RATE_LIMITED"
          ? 429
          : null,
    providerRequestAttempted,
    report,
    disclosures: {
      webhookUrlReturned: false,
      webhookTokenReturned: false,
      providerBodyReturned: false,
      explicitDeliveryOnly: true,
      noAutomaticSchedule: true,
      noDatabasePersistence: true,
      deterministicSourceOnly: true,
      noLlmGeneration: true,
      noPrivateAccountData: true,
      noOrderExecution: true,
      mentionsDisabled: true,
    },
    methodology: {
      sourceProduct: "SPY_ZERO_DTE_DETERMINISTIC_SCHEDULED_REPORT",
      sourceMethodology: "SCHEDULED_REPORT_V1",
      deliveryTrigger: "EXPLICIT_POST_ONLY",
      providerConfirmationMethod: "DISCORD_WAIT_TRUE_HTTP_SUCCESS",
      persistenceMethod: "NONE",
      schedulerMethod: "NONE",
      languageModelMethod: "NONE",
    },
  };
}

function dependencies(args: {
  now?: number;
  send?: DiscordAutomaticScheduledReportDeliveryDependencies["send"];
  state?: ReturnType<typeof createDiscordAutomaticScheduledReportProcessState>;
} = {}): DiscordAutomaticScheduledReportDeliveryDependencies {
  return {
    getSchedule: () => evaluateSpyZeroDteScheduledReportSchedule(args.now ?? dueMs),
    send: args.send ?? (async () => delivery("REPORT_DELIVERED")),
    now: () => args.now ?? dueMs,
    state: args.state ?? createDiscordAutomaticScheduledReportProcessState(),
  };
}

test("due report delivers and commits deterministic key", async () => {
  const result = await runDiscordAutomaticScheduledReportDeliveryWithDependencies(request, dependencies());
  assert.equal(result.automaticDeliveryState, "DELIVERED");
  assert.equal(result.deliveryKey, "2026-07-20:PREMARKET_0925");
  assert.equal(result.state.deliveredKeyCommitted, true);
  DiscordAutomaticScheduledReportDeliveryResponseSchema.parse(result);
});

test("non-due schedule performs no provider request", async () => {
  let sends = 0;
  const result = await runDiscordAutomaticScheduledReportDeliveryWithDependencies(
    request,
    dependencies({ now: waitingMs, send: async () => { sends += 1; return delivery("REPORT_DELIVERED"); } }),
  );
  assert.equal(result.primaryReasonCode, "NO_REPORT_DUE");
  assert.equal(sends, 0);
});

test("confirmed delivery suppresses duplicate poll", async () => {
  const state = createDiscordAutomaticScheduledReportProcessState();
  let sends = 0;
  const deps = dependencies({ state, send: async () => { sends += 1; return delivery("REPORT_DELIVERED"); } });
  await runDiscordAutomaticScheduledReportDeliveryWithDependencies(request, deps);
  const second = await runDiscordAutomaticScheduledReportDeliveryWithDependencies(request, deps);
  assert.equal(second.primaryReasonCode, "DUPLICATE_REPORT_SUPPRESSED");
  assert.equal(sends, 1);
});

test("ambiguous timeout commits suppression key", async () => {
  const state = createDiscordAutomaticScheduledReportProcessState();
  const deps = dependencies({ state, send: async () => delivery("WEBHOOK_REQUEST_TIMEOUT") });
  const first = await runDiscordAutomaticScheduledReportDeliveryWithDependencies(request, deps);
  const second = await runDiscordAutomaticScheduledReportDeliveryWithDependencies(request, deps);
  assert.equal(first.state.ambiguousKeyCommitted, true);
  assert.equal(second.primaryReasonCode, "AMBIGUOUS_PROVIDER_OUTCOME_SUPPRESSED");
});

test("network failure is treated as ambiguous", () => {
  assert.equal(isAmbiguousScheduledReportProviderOutcome(delivery("WEBHOOK_NETWORK_FAILURE")), true);
  assert.equal(isAmbiguousScheduledReportProviderOutcome(delivery("WEBHOOK_RATE_LIMITED")), false);
});

test("confirmed provider failure remains retryable on later poll", async () => {
  let sends = 0;
  const deps = dependencies({ send: async () => { sends += 1; return delivery("WEBHOOK_RATE_LIMITED"); } });
  await runDiscordAutomaticScheduledReportDeliveryWithDependencies(request, deps);
  await runDiscordAutomaticScheduledReportDeliveryWithDependencies(request, deps);
  assert.equal(sends, 2);
});

test("webhook not configured does not mutate delivery key state", async () => {
  const result = await runDiscordAutomaticScheduledReportDeliveryWithDependencies(
    request,
    dependencies({ send: async () => delivery("WEBHOOK_NOT_CONFIGURED") }),
  );
  assert.equal(result.automaticDeliveryState, "NO_DELIVERY");
  assert.equal(result.state.deliveredKeyCommitted, false);
  assert.equal(result.state.ambiguousKeyCommitted, false);
});

test("market date reset clears prior delivered keys", async () => {
  const state = createDiscordAutomaticScheduledReportProcessState();
  state.marketDate = "2026-07-17";
  state.deliveredKeys.add("2026-07-17:PREMARKET_0925");
  const result = await runDiscordAutomaticScheduledReportDeliveryWithDependencies(request, dependencies({ state }));
  assert.equal(result.state.marketDateReset, true);
  assert.equal(state.deliveredKeys.has("2026-07-17:PREMARKET_0925"), false);
});

test("invalid schedule fails closed without delivery", async () => {
  let sends = 0;
  const deps = dependencies({ send: async () => { sends += 1; return delivery("REPORT_DELIVERED"); } });
  deps.getSchedule = () => ({ invalid: true });
  const result = await runDiscordAutomaticScheduledReportDeliveryWithDependencies(request, deps);
  assert.equal(result.primaryReasonCode, "SCHEDULE_UNAVAILABLE");
  assert.equal(sends, 0);
});

test("delivery key exists only for due report", () => {
  assert.equal(automaticScheduledReportDeliveryKey(evaluateSpyZeroDteScheduledReportSchedule(dueMs)), "2026-07-20:PREMARKET_0925");
  assert.equal(automaticScheduledReportDeliveryKey(evaluateSpyZeroDteScheduledReportSchedule(waitingMs)), null);
});

test("serialized runner prevents concurrent duplicate deliveries", async () => {
  const state = createDiscordAutomaticScheduledReportProcessState();
  let sends = 0;
  const runner = createSerializedDiscordAutomaticScheduledReportRunner(
    dependencies({ state, send: async () => { sends += 1; await new Promise((resolve) => setTimeout(resolve, 5)); return delivery("REPORT_DELIVERED"); } }),
  );
  const [first, second] = await Promise.all([runner(request), runner(request)]);
  assert.equal(first.automaticDeliveryState, "DELIVERED");
  assert.equal(second.primaryReasonCode, "DUPLICATE_REPORT_SUPPRESSED");
  assert.equal(sends, 1);
});

test("response excludes private account and execution fields", async () => {
  const text = JSON.stringify(await runDiscordAutomaticScheduledReportDeliveryWithDependencies(request, dependencies()));
  for (const forbidden of ["accountNumber", "accountHash", "orderQuantity", "orderExecution", "positions", "transactions"]) {
    assert.equal(text.includes(forbidden), false);
  }
});

test("methodology is foreground-only with process-memory dedupe", async () => {
  const result = await runDiscordAutomaticScheduledReportDeliveryWithDependencies(request, dependencies({ now: waitingMs }));
  assert.equal(result.disclosures.foregroundBrowserSessionOnly, true);
  assert.equal(result.disclosures.noBackgroundScheduler, true);
  assert.equal(result.disclosures.processMemoryDeduplication, true);
  assert.equal(result.methodology.schedulerMethod, "FOREGROUND_BROWSER_TIMER_ONLY");
});

test("request schema allows only approved foreground cadences", () => {
  for (const cadenceMilliseconds of [30_000, 60_000, 120_000] as const) {
    assert.equal(
      DiscordAutomaticScheduledReportDeliveryRequestSchema.safeParse({
        clientMode: "FOREGROUND_BROWSER_SESSION",
        cadenceMilliseconds,
      }).success,
      true,
    );
  }
  assert.equal(
    DiscordAutomaticScheduledReportDeliveryRequestSchema.safeParse({
      clientMode: "FOREGROUND_BROWSER_SESSION",
      cadenceMilliseconds: 15_000,
    }).success,
    false,
  );
});

test("route and client expose dedicated automatic scheduled-report endpoint", () => {
  const route = readFileSync(resolve(process.cwd(), "apps/server/src/routes/discord-webhook.routes.ts"), "utf8");
  const client = readFileSync(resolve(process.cwd(), "apps/web/src/lib/api-client.ts"), "utf8");
  assert.equal(route.includes('/scheduled-report/automatic'), true);
  assert.equal(client.includes('/api/discord/scheduled-report/automatic'), true);
  assert.equal(route.includes("QUERY_PARAMETERS_NOT_SUPPORTED"), true);
});

test("frontend hook is opt-in and never polls in background", () => {
  const hook = readFileSync(resolve(process.cwd(), "apps/web/src/hooks/use-discord-webhook.ts"), "utf8");
  assert.equal(hook.includes("useDiscordAutomaticScheduledReportDelivery"), true);
  assert.equal(hook.includes("refetchIntervalInBackground: false"), true);
  assert.equal(hook.includes("refetchOnWindowFocus: false"), true);
  assert.equal(hook.includes("retry: false"), true);
});

test("automatic scheduled-report implementation has no persistence or scheduler dependency", () => {
  const service = readFileSync(resolve(process.cwd(), "apps/server/src/services/discord-automatic-scheduled-report.service.ts"), "utf8");
  for (const forbidden of ["prisma", "database", "cron", "node-schedule", "setInterval", "account-risk", "schwab-account"]) {
    assert.equal(service.toLowerCase().includes(forbidden), false, forbidden);
  }
});

process.on("beforeExit", () => {
  console.log(`\nAutomatic Discord scheduled-report tests: ${passed} passed, ${failed} failed`);
  if (failed > 0) process.exitCode = 1;
});
