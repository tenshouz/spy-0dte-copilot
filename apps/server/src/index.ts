import "./bootstrap-env";
import cors from "cors";
import express, { type NextFunction, type Request, type Response } from "express";
import { getSchwabConfig, hasDatabaseUrl } from "./config/env";
import {
  applyGlobalSecurityHeaders,
  attachRequestContext,
  buildCorsOptions,
  createWriteRateLimiter,
  getRequestId,
} from "./lib/http-hardening";
import { prisma } from "./lib/prisma";
import {
  accountRiskRouter,
  setAccountRiskPrivateHeaders,
} from "./routes/account-risk.routes";
import { alertsRouter } from "./routes/alerts.routes";
import {
  backendAutomationRouter,
  setBackendAutomationHeaders,
} from "./routes/backend-automation.routes";
import { authRouter } from "./routes/auth.routes";
import { candlesRouter } from "./routes/candles.routes";
import { expectedMoveRouter } from "./routes/expected-move.routes";
import { exposureStructureRouter } from "./routes/exposure-structure.routes";
import { dexRouter } from "./routes/dex.routes";
import {
  discordWebhookRouter,
  setDiscordWebhookHeaders,
} from "./routes/discord-webhook.routes";
import { gapRouter } from "./routes/gap.routes";
import { gexRouter } from "./routes/gex.routes";
import {
  historicalReplayRouter,
  setHistoricalReplayHeaders,
} from "./routes/historical-replay.routes";
import {
  journalRouter,
  setDeterministicJournalHeaders,
} from "./routes/journal.routes";
import { marketBiasRouter } from "./routes/market-bias.routes";
import { marketContextRouter } from "./routes/market-context.routes";
import { marketStateRouter } from "./routes/market-state.routes";
import { openingRangeRouter } from "./routes/opening-range.routes";
import { optionsChainRouter } from "./routes/options-chain.routes";
import { quoteRouter } from "./routes/quote.routes";
import {
  reportRouter,
  setDeterministicReportHeaders,
} from "./routes/report.routes";
import { sessionDataRouter } from "./routes/session-data.routes";
import { sessionLevelsRouter } from "./routes/session-levels.routes";
import { sessionStructureRouter } from "./routes/session-structure.routes";
import { snapshotRouter } from "./routes/snapshot.routes";
import {
  setSystemReadinessHeaders,
  systemReadinessRouter,
} from "./routes/system-readiness.routes";
import { tradePlanAlertRouter } from "./routes/trade-plan-alert.routes";
import { tradePlanAssemblyRouter } from "./routes/trade-plan-assembly.routes";
import { tradeContractRouter } from "./routes/trade-contract.routes";
import { tradePlanRouter } from "./routes/trade-plan.routes";
import { tradeRiskRouter } from "./routes/trade-risk.routes";
import { schwabAssistedTradeSizingRouter } from "./routes/trade-sizing-schwab.routes";
import { tradeSizingRouter } from "./routes/trade-sizing.routes";
import { vwapRouter } from "./routes/vwap.routes";
import { startBackendAutomationScheduler } from "./services/backend-automation.service";

const app = express();
const PORT = process.env.PORT ? Number(process.env.PORT) : 4000;
const JSON_BODY_LIMIT = "32kb";
const REQUEST_TIMEOUT_MS = 45_000;
const HEADERS_TIMEOUT_MS = 50_000;
const SHUTDOWN_TIMEOUT_MS = 10_000;

app.disable("x-powered-by");
app.set("trust proxy", false);
app.use(attachRequestContext);
app.use(applyGlobalSecurityHeaders);
app.use(cors(buildCorsOptions(process.env.FRONTEND_URL)));
app.use(createWriteRateLimiter());
app.use(express.json({ limit: JSON_BODY_LIMIT, strict: true }));

app.get("/health", (_req, res) => {
  res.json({
    status: "ok",
    service: "spy-0dte-copilot-api",
    releaseVersion: "1.3.0",
    uptimeSeconds: Math.max(0, Math.floor(process.uptime())),
  });
});

app.use("/api/system", systemReadinessRouter);
app.use("/api/account-risk", accountRiskRouter);
app.use("/api/automation", backendAutomationRouter);
app.use("/api/snapshot", snapshotRouter);
app.use("/api/reports", reportRouter);
app.use("/api/journal", journalRouter);
app.use("/api/replay", historicalReplayRouter);
app.use("/api/market-context", marketContextRouter);
app.use("/api/market-bias", marketBiasRouter);
app.use("/api/market-state", marketStateRouter);
app.use("/api/trade-plan", tradePlanRouter);
app.use("/api/trade-plan-assembly", tradePlanAssemblyRouter);
app.use("/api/trade-plan-alert", tradePlanAlertRouter);
app.use("/api/trade-contract", tradeContractRouter);
app.use("/api/trade-risk", tradeRiskRouter);
app.use("/api/trade-sizing", schwabAssistedTradeSizingRouter);
app.use("/api/trade-sizing", tradeSizingRouter);
app.use("/api/opening-range", openingRangeRouter);
app.use("/api/options-chain", optionsChainRouter);
app.use("/api/quote", quoteRouter);
app.use("/api/candles", candlesRouter);
app.use("/api/expected-move", expectedMoveRouter);
app.use("/api/exposure-structure", exposureStructureRouter);
app.use("/api/dex", dexRouter);
app.use("/api/discord", discordWebhookRouter);
app.use("/api/gap", gapRouter);
app.use("/api/gex", gexRouter);
app.use("/api/session-data", sessionDataRouter);
app.use("/api/session-levels", sessionLevelsRouter);
app.use("/api/session-structure", sessionStructureRouter);
app.use("/api/vwap", vwapRouter);
app.use("/api/alerts", alertsRouter);
app.use("/api/auth", authRouter);

app.use("/api", (_req, res) => {
  res.status(404).json({
    error: "API_ROUTE_NOT_FOUND",
    requestId: getRequestId(res),
  });
});

app.use((error: unknown, req: Request, res: Response, _next: NextFunction) => {
  const status =
    typeof error === "object" && error !== null && "status" in error
      ? (error as { status?: unknown }).status
      : null;

  if (status === 413) {
    res.status(413).json({
      error: "REQUEST_BODY_TOO_LARGE",
      requestId: getRequestId(res),
    });
    return;
  }

  if (
    req.originalUrl.startsWith("/api/system/probe") &&
    error instanceof SyntaxError &&
    status === 400
  ) {
    setSystemReadinessHeaders(res);
    res.status(400).json({ error: "INVALID_SYSTEM_DATA_PROBE_JSON" });
    return;
  }
  if (
    req.originalUrl.startsWith("/api/replay/spy/runs") &&
    error instanceof SyntaxError &&
    status === 400
  ) {
    setHistoricalReplayHeaders(res);
    res.status(400).json({ error: "INVALID_HISTORICAL_REPLAY_JSON" });
    return;
  }
  if (
    req.originalUrl.startsWith("/api/automation/") &&
    error instanceof SyntaxError &&
    status === 400
  ) {
    setBackendAutomationHeaders(res);
    res.status(400).json({ error: "INVALID_BACKEND_AUTOMATION_JSON" });
    return;
  }
  if (
    req.originalUrl.startsWith("/api/journal/spy/snapshots/automatic") &&
    error instanceof SyntaxError &&
    status === 400
  ) {
    setDeterministicJournalHeaders(res);
    res.status(400).json({
      error: "INVALID_DETERMINISTIC_JOURNAL_AUTOMATIC_CAPTURE_REQUEST",
    });
    return;
  }
  if (
    req.originalUrl.startsWith("/api/journal/spy/snapshots") &&
    error instanceof SyntaxError &&
    status === 400
  ) {
    setDeterministicJournalHeaders(res);
    res.status(400).json({ error: "INVALID_DETERMINISTIC_JOURNAL_REQUEST" });
    return;
  }
  if (
    req.originalUrl.startsWith("/api/reports/spy/deterministic") &&
    error instanceof SyntaxError &&
    status === 400
  ) {
    setDeterministicReportHeaders(res);
    res.status(400).json({ error: "INVALID_DETERMINISTIC_REPORT_REQUEST" });
    return;
  }
  if (
    req.originalUrl.startsWith("/api/discord/trade-plan-alert/automatic") &&
    error instanceof SyntaxError &&
    status === 400
  ) {
    setDiscordWebhookHeaders(res);
    res.status(400).json({
      error: "INVALID_DISCORD_AUTOMATIC_TRADE_PLAN_ALERT_REQUEST",
    });
    return;
  }
  if (
    req.originalUrl.startsWith("/api/discord/trade-plan-alert") &&
    error instanceof SyntaxError &&
    status === 400
  ) {
    setDiscordWebhookHeaders(res);
    res.status(400).json({ error: "INVALID_DISCORD_TRADE_PLAN_ALERT_REQUEST" });
    return;
  }
  if (
    req.originalUrl.startsWith("/api/discord/test") &&
    error instanceof SyntaxError &&
    status === 400
  ) {
    setDiscordWebhookHeaders(res);
    res.status(400).json({ error: "INVALID_DISCORD_WEBHOOK_TEST_REQUEST" });
    return;
  }
  if (
    req.originalUrl.startsWith("/api/trade-sizing/") &&
    error instanceof SyntaxError &&
    status === 400
  ) {
    if (req.originalUrl.startsWith("/api/trade-sizing/spy/schwab")) {
      setAccountRiskPrivateHeaders(res);
      res.status(400).json({
        error: "INVALID_SCHWAB_ASSISTED_POSITION_SIZING_REQUEST",
        issues: [{ path: "$", code: "INVALID_JSON" }],
      });
      return;
    }
    res.status(400).json({
      error: "INVALID_POSITION_SIZING_REQUEST",
      issues: [{ path: "$", code: "INVALID_JSON" }],
    });
    return;
  }

  const requestId = getRequestId(res);
  // Fixed, sanitized log category plus opaque request ID only.
  // eslint-disable-next-line no-console
  console.error(`[server] unhandled request failure requestId=${requestId}`);
  if (!res.headersSent) {
    res.status(500).json({ error: "UNEXPECTED_SERVER_ERROR", requestId });
  }
});

const backendAutomationScheduler = startBackendAutomationScheduler();

const server = app.listen(PORT, () => {
  // eslint-disable-next-line no-console
  console.log(`[server] SPY 0DTE Copilot V1 API listening on http://localhost:${PORT}`);
  // eslint-disable-next-line no-console
  console.log("[server] System readiness: GET /api/system/readiness; explicit data probe: POST /api/system/probe");
  if (!hasDatabaseUrl) {
    // eslint-disable-next-line no-console
    console.log("[server] DATABASE_URL is not set; persistent features are blocked until configured.");
  }
  const schwabConfig = getSchwabConfig();
  if (schwabConfig.status === "missing") {
    // eslint-disable-next-line no-console
    console.log(`[server] Schwab OAuth configuration is incomplete (${schwabConfig.missingVars.join(", ")}).`);
  } else if (schwabConfig.status === "invalid") {
    // eslint-disable-next-line no-console
    console.log(`[server] Schwab configuration is invalid: ${schwabConfig.reason}`);
  }
});

server.requestTimeout = REQUEST_TIMEOUT_MS;
server.headersTimeout = HEADERS_TIMEOUT_MS;
server.keepAliveTimeout = 5_000;

let shuttingDown = false;

async function shutdown(signal: string, exitCode: number): Promise<void> {
  if (shuttingDown) return;
  shuttingDown = true;
  // eslint-disable-next-line no-console
  console.log(`[server] graceful shutdown requested (${signal})`);
  backendAutomationScheduler.stop();

  const forceTimer = setTimeout(() => {
    // eslint-disable-next-line no-console
    console.error("[server] graceful shutdown timed out; closing active connections");
    server.closeAllConnections();
    process.exit(exitCode || 1);
  }, SHUTDOWN_TIMEOUT_MS);
  forceTimer.unref();

  await new Promise<void>((resolve) => {
    server.close(() => resolve());
  });

  try {
    await prisma.$disconnect();
  } catch {
    // Fixed category only; never expose Prisma/database text.
    // eslint-disable-next-line no-console
    console.warn("[server] database disconnect did not complete cleanly");
  }

  clearTimeout(forceTimer);
  process.exit(exitCode);
}

process.once("SIGINT", () => void shutdown("SIGINT", 0));
process.once("SIGTERM", () => void shutdown("SIGTERM", 0));
process.once("uncaughtException", () => {
  // eslint-disable-next-line no-console
  console.error("[server] uncaught exception");
  void shutdown("uncaughtException", 1);
});
process.once("unhandledRejection", () => {
  // eslint-disable-next-line no-console
  console.error("[server] unhandled rejection");
  void shutdown("unhandledRejection", 1);
});
