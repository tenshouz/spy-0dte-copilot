/**
 * Final V1 system-readiness, explicit data-probe, and HTTP-hardening tests.
 * Run: npx --no-install tsx apps/server/src/services/system-readiness.spec.ts
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import express from "express";
import type {
  BackendAutomationSettingsResponse,
  BackendAutomationStatusResponse,
  DiscordWebhookStatusResponse,
  SpyCandleResponse,
  SpyQuote,
  SpyZeroDteOptionsChainResponse,
  SpyZeroDteTradePlanAssemblyResponse,
} from "@spy-copilot/shared";
import {
  SystemDataProbeResponseSchema,
  SystemReadinessResponseSchema,
} from "@spy-copilot/shared";
import {
  applyGlobalSecurityHeaders,
  buildAllowedFrontendOrigins,
  buildCorsOptions,
  createWriteRateLimiter,
} from "../lib/http-hardening";
import { createSystemReadinessRouter } from "../routes/system-readiness.routes";
import {
  buildSystemDataProbeResponse,
  buildSystemReadinessResponse,
  type SystemReadinessInputs,
} from "./system-readiness.logic";

const tests: Array<[string, () => void | Promise<void>]> = [];
function test(name: string, fn: () => void | Promise<void>): void {
  tests.push([name, fn]);
}

function readyDiscord(): DiscordWebhookStatusResponse {
  return {
    product: "DISCORD_WEBHOOK_CONNECTION_STATUS",
    methodologyVersion: "DISCORD_WEBHOOK_CONNECTION_V1",
    state: "READY",
    primaryReasonCode: "WEBHOOK_READY",
    configured: true,
    canSendTest: true,
    detail: "A validated Discord webhook is configured on the backend.",
    disclosures: {
      webhookUrlReturned: false,
      webhookTokenReturned: false,
      noAutomaticDelivery: true,
      noPersistence: true,
      noPrivateAccountData: true,
      noOrderExecution: true,
    },
  };
}

function readyInputs(): SystemReadinessInputs {
  return {
    calculatedAt: new Date("2026-07-20T16:00:00.000Z"),
    uptimeSeconds: 123.9,
    nodeVersion: "v22.16.0",
    environment: "development",
    databaseConfigured: true,
    databaseReachable: true,
    schwabConfig: {
      status: "valid",
      clientId: "not-returned",
      clientSecret: "not-returned",
      redirectUri: "https://example.ngrok-free.app/api/auth/schwab/callback",
      tokenEncryptionKey: "x".repeat(64),
    },
    schwabConnection: {
      state: "connected",
      expiresAt: "2026-07-20T17:00:00.000Z",
      detail: null,
    },
    discordStatus: readyDiscord(),
    automationSettings: {
      engineState: "AVAILABLE",
      settings: {
        enabled: false,
        tradePlanAlertsEnabled: true,
        scheduledReportsEnabled: true,
        cadenceSeconds: 30,
        updatedAt: null,
      },
    } as BackendAutomationSettingsResponse,
    automationStatus: {
      engineState: "AVAILABLE",
      runtimeState: "STOPPED",
    } as BackendAutomationStatusResponse,
  };
}

function quote(sourceState: "LIVE" | "STALE" | "MOCK"): SpyQuote {
  return {
    sourceState,
    warningCode: sourceState === "MOCK" ? "NOT_CONNECTED" : null,
    dataAgeMs: sourceState === "STALE" ? 50_000 : 1_000,
  } as SpyQuote;
}

function candles(sourceState: "LIVE" | "STALE" | "MOCK"): SpyCandleResponse {
  return {
    sourceState,
    warningCode: sourceState === "MOCK" ? "NOT_CONNECTED" : null,
    dataAgeMs: sourceState === "STALE" ? 100_000 : 1_000,
    candles: [{}, {}],
  } as SpyCandleResponse;
}

function options(args: {
  metricState: "LIVE" | "STALE" | "MOCK" | "UNAVAILABLE";
  warningCode?: "NO_CURRENT_DATE_EXPIRATION" | "AUTH_REQUIRED" | null;
}): SpyZeroDteOptionsChainResponse {
  return {
    metricState: args.metricState,
    sourceState: args.metricState,
    warningCode: args.warningCode ?? null,
    totalContracts: args.metricState === "LIVE" ? 40 : 0,
    returnedUniqueStrikeCount: args.metricState === "LIVE" ? 20 : 0,
  } as SpyZeroDteOptionsChainResponse;
}

function assembly(args: {
  engineState: "AVAILABLE" | "PARTIAL" | "UNAVAILABLE";
  planState?: "READY" | "NOT_APPLICABLE" | "UNAVAILABLE";
}): SpyZeroDteTradePlanAssemblyResponse {
  return {
    engineState: args.engineState,
    planState: args.planState ?? "READY",
    direction: args.planState === "NOT_APPLICABLE" ? "NONE" : "CALLS",
    methodologyVersion: "ASSEMBLY_V1",
    primaryReasonCode:
      args.planState === "NOT_APPLICABLE"
        ? "SESSION_NOT_APPLICABLE"
        : "ASSEMBLED_READY",
  } as unknown as SpyZeroDteTradePlanAssemblyResponse;
}

test("fully ready configuration produces READY with nine passing checks", () => {
  const response = buildSystemReadinessResponse(readyInputs());
  SystemReadinessResponseSchema.parse(response);
  assert.equal(response.engineState, "READY");
  assert.equal(response.summary.totalChecks, 9);
  assert.equal(response.summary.passCount, 9);
  assert.equal(response.summary.requiredFailureCount, 0);
});

test("disabled backend automation is a safe passing state", () => {
  const response = buildSystemReadinessResponse(readyInputs());
  const item = response.checks.find((check) => check.id === "BACKEND_AUTOMATION");
  assert.equal(item?.state, "PASS");
  assert.equal(item?.reasonCode, "BACKEND_AUTOMATION_SAFE_DISABLED");
});

test("missing optional Discord configuration degrades without blocking", () => {
  const inputs = readyInputs();
  inputs.discordStatus = {
    ...readyDiscord(),
    state: "NOT_CONFIGURED",
    primaryReasonCode: "WEBHOOK_URL_MISSING",
    configured: false,
    canSendTest: false,
    detail: "Set DISCORD_WEBHOOK_URL.",
  };
  const response = buildSystemReadinessResponse(inputs);
  assert.equal(response.engineState, "DEGRADED");
  assert.equal(response.summary.warningCount, 1);
  assert.equal(response.summary.requiredFailureCount, 0);
});

test("missing database blocks V1 readiness", () => {
  const inputs = readyInputs();
  inputs.databaseConfigured = false;
  inputs.databaseReachable = false;
  inputs.schwabConnection = {
    state: "database_not_configured",
    expiresAt: null,
    detail: null,
  };
  inputs.automationSettings = null;
  inputs.automationStatus = null;
  const response = buildSystemReadinessResponse(inputs);
  assert.equal(response.engineState, "BLOCKED");
  assert.ok(response.summary.requiredFailureCount >= 1);
});

test("invalid Schwab configuration blocks readiness without returning secret values", () => {
  const inputs = readyInputs();
  inputs.schwabConfig = {
    status: "invalid",
    reason: "SCHWAB_REDIRECT_URI must use https://.",
  };
  inputs.schwabConnection = {
    state: "config_invalid",
    expiresAt: null,
    detail: "SCHWAB_REDIRECT_URI must use https://.",
  };
  const response = buildSystemReadinessResponse(inputs);
  assert.equal(response.engineState, "BLOCKED");
  assert.doesNotMatch(JSON.stringify(response), /clientSecret|tokenEncryptionKey/);
});

test("expired Schwab token blocks readiness", () => {
  const inputs = readyInputs();
  inputs.schwabConnection = {
    state: "token_expired",
    expiresAt: "2026-07-20T15:00:00.000Z",
    detail: null,
  };
  const response = buildSystemReadinessResponse(inputs);
  assert.equal(response.engineState, "BLOCKED");
  assert.equal(
    response.checks.find((item) => item.id === "SCHWAB_CONNECTION")?.reasonCode,
    "SCHWAB_TOKEN_EXPIRED",
  );
});

test("runtime uptime is normalized to nonnegative whole seconds", () => {
  const inputs = readyInputs();
  inputs.uptimeSeconds = 123.9;
  assert.equal(buildSystemReadinessResponse(inputs).runtime.uptimeSeconds, 123);
  inputs.uptimeSeconds = -5;
  assert.equal(buildSystemReadinessResponse(inputs).runtime.uptimeSeconds, 0);
});

test("live data probe passes with live quote candles options and assembly", () => {
  const response = buildSystemDataProbeResponse({
    calculatedAt: new Date("2026-07-20T16:00:00.000Z"),
    quote: quote("LIVE"),
    candles: candles("LIVE"),
    optionsChain: options({ metricState: "LIVE" }),
    assembly: assembly({ engineState: "AVAILABLE" }),
  });
  SystemDataProbeResponseSchema.parse(response);
  assert.equal(response.probeState, "PASS");
  assert.equal(response.summary.passCount, 4);
});

test("stale real market data produces DEGRADED probe", () => {
  const response = buildSystemDataProbeResponse({
    calculatedAt: new Date(),
    quote: quote("STALE"),
    candles: candles("STALE"),
    optionsChain: options({ metricState: "STALE" }),
    assembly: assembly({ engineState: "PARTIAL" }),
  });
  assert.equal(response.probeState, "DEGRADED");
  assert.equal(response.summary.degradedCount, 4);
});

test("mock provider fallback fails the explicit probe", () => {
  const response = buildSystemDataProbeResponse({
    calculatedAt: new Date(),
    quote: quote("MOCK"),
    candles: candles("MOCK"),
    optionsChain: options({ metricState: "MOCK" }),
    assembly: assembly({ engineState: "UNAVAILABLE", planState: "UNAVAILABLE" }),
  });
  assert.equal(response.probeState, "FAIL");
  assert.equal(response.summary.failCount, 4);
});

test("no current-date expiration is honestly not applicable", () => {
  const response = buildSystemDataProbeResponse({
    calculatedAt: new Date(),
    quote: quote("LIVE"),
    candles: candles("LIVE"),
    optionsChain: options({
      metricState: "UNAVAILABLE",
      warningCode: "NO_CURRENT_DATE_EXPIRATION",
    }),
    assembly: assembly({
      engineState: "AVAILABLE",
      planState: "NOT_APPLICABLE",
    }),
  });
  assert.equal(response.probeState, "PASS");
  assert.equal(response.summary.notApplicableCount, 2);
});

test("probe disclosures prevent side-effect ambiguity", () => {
  const response = buildSystemDataProbeResponse({
    calculatedAt: new Date(),
    quote: quote("LIVE"),
    candles: candles("LIVE"),
    optionsChain: options({ metricState: "LIVE" }),
    assembly: assembly({ engineState: "AVAILABLE" }),
  });
  assert.equal(response.disclosures.explicitUserInitiatedProbe, true);
  assert.equal(response.disclosures.noDiscordDelivery, true);
  assert.equal(response.disclosures.noJournalMutation, true);
  assert.equal(response.disclosures.noOrderExecution, true);
});

test("development CORS permits only configured and standard local frontend origins", () => {
  const origins = buildAllowedFrontendOrigins("http://localhost:3000", "development");
  assert.equal(origins.has("http://localhost:3000"), true);
  assert.equal(origins.has("http://127.0.0.1:3000"), true);
  assert.equal(origins.has("https://malicious.invalid"), false);
});

test("production CORS does not automatically allow localhost", () => {
  const origins = buildAllowedFrontendOrigins("https://dashboard.example.com", "production");
  assert.deepEqual([...origins], ["https://dashboard.example.com"]);
});

test("CORS callback rejects an unlisted browser origin without throwing", async () => {
  const options = buildCorsOptions("http://localhost:3000", "production");
  const origin = options.origin;
  assert.equal(typeof origin, "function");
  const result = await new Promise<unknown>((resolve, reject) => {
    if (typeof origin !== "function") return reject(new Error("origin callback missing"));
    origin("https://malicious.invalid", (error, allowed) => {
      if (error) reject(error);
      else resolve(allowed ?? false);
    });
  });
  assert.equal(result, false);
});

test("global security middleware applies the V1 header set", () => {
  const headers = new Map<string, string>();
  const response = {
    setHeader(name: string, value: string) {
      headers.set(name, value);
    },
  } as unknown as express.Response;
  let nextCalled = false;
  applyGlobalSecurityHeaders(
    {} as express.Request,
    response,
    () => {
      nextCalled = true;
    },
  );
  assert.equal(nextCalled, true);
  assert.equal(headers.get("X-Frame-Options"), "DENY");
  assert.equal(headers.get("Referrer-Policy"), "no-referrer");
  assert.match(headers.get("Content-Security-Policy") ?? "", /default-src 'none'/);
  assert.equal(headers.get("Cache-Control"), "no-store");
});

test("write rate limiter blocks only after the configured threshold", () => {
  let timestamp = 1_000;
  const middleware = createWriteRateLimiter({
    limit: 2,
    windowMs: 60_000,
    now: () => timestamp,
  });
  const request = {
    path: "/api/system/probe",
    method: "POST",
    ip: "127.0.0.1",
    socket: {},
  } as express.Request;
  let statusCode = 200;
  let body: unknown = null;
  const headers = new Map<string, string>();
  const response = {
    locals: { requestId: "test-id" },
    setHeader(name: string, value: string) {
      headers.set(name, value);
    },
    status(code: number) {
      statusCode = code;
      return this;
    },
    json(value: unknown) {
      body = value;
      return this;
    },
  } as unknown as express.Response;
  let nextCount = 0;
  const next = () => {
    nextCount += 1;
  };

  middleware(request, response, next);
  middleware(request, response, next);
  middleware(request, response, next);
  assert.equal(nextCount, 2);
  assert.equal(statusCode, 429);
  assert.deepEqual(body, {
    error: "WRITE_RATE_LIMIT_EXCEEDED",
    requestId: "test-id",
  });
  assert.equal(headers.get("Retry-After"), "60");

  timestamp += 60_001;
  middleware(request, response, next);
  assert.equal(nextCount, 3);
});

test("GET requests are not write-rate limited", () => {
  const middleware = createWriteRateLimiter({ limit: 0 });
  let nextCalled = false;
  middleware(
    {
      path: "/api/system/readiness",
      method: "GET",
      socket: {},
    } as express.Request,
    {} as express.Response,
    () => {
      nextCalled = true;
    },
  );
  assert.equal(nextCalled, true);
});

test("readiness route returns validated response and rejects query parameters", async () => {
  const readiness = buildSystemReadinessResponse(readyInputs());
  const probe = buildSystemDataProbeResponse({
    calculatedAt: new Date(),
    quote: quote("LIVE"),
    candles: candles("LIVE"),
    optionsChain: options({ metricState: "LIVE" }),
    assembly: assembly({ engineState: "AVAILABLE" }),
  });
  const app = express();
  app.use(express.json());
  app.use(
    "/api/system",
    createSystemReadinessRouter({
      getReadiness: async () => readiness,
      runProbe: async () => probe,
      frontendUrl: () => "http://localhost:3000",
      log: () => undefined,
    }),
  );
  const server = app.listen(0);
  try {
    const address = server.address();
    if (!address || typeof address === "string") throw new Error("missing address");
    const base = `http://127.0.0.1:${address.port}`;
    const response = await fetch(`${base}/api/system/readiness`);
    assert.equal(response.status, 200);
    SystemReadinessResponseSchema.parse(await response.json());
    assert.equal(response.headers.get("cache-control"), "no-store");

    const rejected = await fetch(`${base}/api/system/readiness?x=1`);
    assert.equal(rejected.status, 400);
  } finally {
    await new Promise<void>((resolveClose) => server.close(() => resolveClose()));
  }
});

test("explicit probe enforces request schema and allowed origin", async () => {
  const readiness = buildSystemReadinessResponse(readyInputs());
  const probe = buildSystemDataProbeResponse({
    calculatedAt: new Date(),
    quote: quote("LIVE"),
    candles: candles("LIVE"),
    optionsChain: options({ metricState: "LIVE" }),
    assembly: assembly({ engineState: "AVAILABLE" }),
  });
  const app = express();
  app.use(express.json());
  app.use(
    "/api/system",
    createSystemReadinessRouter({
      getReadiness: async () => readiness,
      runProbe: async () => probe,
      frontendUrl: () => "http://localhost:3000",
      log: () => undefined,
    }),
  );
  const server = app.listen(0);
  try {
    const address = server.address();
    if (!address || typeof address === "string") throw new Error("missing address");
    const base = `http://127.0.0.1:${address.port}`;
    const accepted = await fetch(`${base}/api/system/probe`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Origin: "http://localhost:3000",
      },
      body: "{}",
    });
    assert.equal(accepted.status, 200);
    SystemDataProbeResponseSchema.parse(await accepted.json());

    const invalid = await fetch(`${base}/api/system/probe`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: '{"unexpected":true}',
    });
    assert.equal(invalid.status, 400);

    const forbidden = await fetch(`${base}/api/system/probe`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Origin: "https://malicious.invalid",
      },
      body: "{}",
    });
    assert.equal(forbidden.status, 403);
  } finally {
    await new Promise<void>((resolveClose) => server.close(() => resolveClose()));
  }
});

test("server index registers hardening readiness route and graceful shutdown", () => {
  const source = readFileSync(resolve(process.cwd(), "apps/server/src/index.ts"), "utf8");
  assert.match(source, /app\.disable\("x-powered-by"\)/);
  assert.match(source, /express\.json\(\{ limit: JSON_BODY_LIMIT, strict: true \}\)/);
  assert.match(source, /createWriteRateLimiter/);
  assert.match(source, /\/api\/system/);
  assert.match(source, /server\.requestTimeout/);
  assert.match(source, /server\.headersTimeout/);
  assert.match(source, /prisma\.\$disconnect/);
  assert.match(source, /uncaughtException/);
  assert.match(source, /unhandledRejection/);
  assert.match(source, /API_ROUTE_NOT_FOUND/);
  assert.match(source, /UNEXPECTED_SERVER_ERROR/);
});

test("release documentation and verification scripts are present", () => {
  const readme = readFileSync(resolve(process.cwd(), "README.md"), "utf8");
  const runbook = readFileSync(
    resolve(process.cwd(), "docs/V1_RELEASE_RUNBOOK.md"),
    "utf8",
  );
  const audit = readFileSync(
    resolve(process.cwd(), "docs/V1_PRD_COMPLIANCE_AUDIT.md"),
    "utf8",
  );
  const premarketMethodology = readFileSync(
    resolve(process.cwd(), "docs/V1_1_1_PROVIDER_ALIGNED_PREMARKET.md"),
    "utf8",
  );
  const refreshMethodology = readFileSync(
    resolve(process.cwd(), "docs/V1_2_LIVE_MARKET_REFRESH.md"),
    "utf8",
  );
  const guideMethodology = readFileSync(
    resolve(process.cwd(), "docs/V1_3_DASHBOARD_GUIDE.md"),
    "utf8",
  );
  const executionQualityMethodology = readFileSync(
    resolve(process.cwd(), "docs/V1_4_EXECUTION_QUALITY.md"),
    "utf8",
  );
  const empiricalGammaMethodology = readFileSync(
    resolve(process.cwd(), "docs/V1_4_1_EMPIRICAL_GAMMA_RESEARCH.md"),
    "utf8",
  );
  const pointInTimeBacktestMethodology = readFileSync(
    resolve(process.cwd(), "docs/V1_5_POINT_IN_TIME_BACKTESTING.md"),
    "utf8",
  );
  const verifier = readFileSync(
    resolve(process.cwd(), "scripts/verify-v1.mjs"),
    "utf8",
  );
  assert.match(readme, /V1\.5\.0 Point-in-Time Backtesting/i);
  assert.match(runbook, /Backup and restore/i);
  assert.match(runbook, /Schwab recovery/i);
  assert.match(audit, /No order execution/i);
  assert.match(premarketMethodology, /07:00–09:30 ET/);
  assert.match(premarketMethodology, /missing 04:00–07:00 ET data does not produce `PARTIAL`/i);
  assert.match(refreshMethodology, /5 seconds/);
  assert.match(refreshMethodology, /does not modify, synthesize, or extend candle OHLC values/i);
  assert.match(guideMethodology, /Dashboard Guide/i);
  assert.match(guideMethodology, /public deployment warning/i);
  assert.match(executionQualityMethodology, /completed five-minute candles/i);
  assert.match(executionQualityMethodology, /not a win probability/i);
  assert.match(empiricalGammaMethodology, /research-only/i);
  assert.match(empiricalGammaMethodology, /no automatic directional weighting/i);
  assert.match(pointInTimeBacktestMethodology, /no[- ]look-ahead/i);
  assert.match(pointInTimeBacktestMethodology, /INSUFFICIENT_FUTURE_DATA/i);
  assert.match(verifier, /V1\.5\.0 verification passed/);
});

async function run(): Promise<void> {
  let passed = 0;
  for (const [name, fn] of tests) {
    try {
      await fn();
      passed += 1;
      console.log(`✓ ${name}`);
    } catch (error) {
      console.error(`✗ ${name}`);
      throw error;
    }
  }
  console.log(`\nSystem readiness and hardening tests: ${passed} passed, 0 failed`);
}

void run();
