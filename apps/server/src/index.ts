import "./bootstrap-env";
import cors from "cors";
import express, { type NextFunction, type Request, type Response } from "express";
import { getSchwabConfig, hasDatabaseUrl } from "./config/env";
import {
  accountRiskRouter,
  setAccountRiskPrivateHeaders,
} from "./routes/account-risk.routes";
import { alertsRouter } from "./routes/alerts.routes";
import { backendAutomationRouter, setBackendAutomationHeaders } from "./routes/backend-automation.routes";
import { authRouter } from "./routes/auth.routes";
import { candlesRouter } from "./routes/candles.routes";
import { expectedMoveRouter } from "./routes/expected-move.routes";
import { exposureStructureRouter } from "./routes/exposure-structure.routes";
import { dexRouter } from "./routes/dex.routes";
import { discordWebhookRouter, setDiscordWebhookHeaders } from "./routes/discord-webhook.routes";
import { gapRouter } from "./routes/gap.routes";
import { gexRouter } from "./routes/gex.routes";
import { journalRouter, setDeterministicJournalHeaders } from "./routes/journal.routes";
import { historicalReplayRouter, setHistoricalReplayHeaders } from "./routes/historical-replay.routes";
import { marketContextRouter } from "./routes/market-context.routes";
import { marketBiasRouter } from "./routes/market-bias.routes";
import { marketStateRouter } from "./routes/market-state.routes";
import { openingRangeRouter } from "./routes/opening-range.routes";
import { optionsChainRouter } from "./routes/options-chain.routes";
import { quoteRouter } from "./routes/quote.routes";
import { reportRouter, setDeterministicReportHeaders } from "./routes/report.routes";
import { sessionDataRouter } from "./routes/session-data.routes";
import { sessionLevelsRouter } from "./routes/session-levels.routes";
import { sessionStructureRouter } from "./routes/session-structure.routes";
import { snapshotRouter } from "./routes/snapshot.routes";
import { tradePlanRouter } from "./routes/trade-plan.routes";
import { tradePlanAssemblyRouter } from "./routes/trade-plan-assembly.routes";
import { tradePlanAlertRouter } from "./routes/trade-plan-alert.routes";
import { tradeContractRouter } from "./routes/trade-contract.routes";
import { tradeRiskRouter } from "./routes/trade-risk.routes";
import {
  schwabAssistedTradeSizingRouter,
} from "./routes/trade-sizing-schwab.routes";
import { tradeSizingRouter } from "./routes/trade-sizing.routes";
import { vwapRouter } from "./routes/vwap.routes";
import { startBackendAutomationScheduler } from "./services/backend-automation.service";

const app = express();
const PORT = process.env.PORT ? Number(process.env.PORT) : 4000;

app.use(cors());
app.use(express.json());

app.get("/health", (_req, res) => {
  // Mixed data: the SPY quote endpoint serves real Schwab data when an
  // authenticated connection is available; remaining analytics are mock.
  // Every quote payload identifies its own source via sourceState.
  res.json({ status: "ok", dataSources: "mixed", quoteSourceField: "sourceState" });
});

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

app.use((error: unknown, req: Request, res: Response, next: NextFunction) => {
  const status =
    typeof error === "object" && error !== null && "status" in error
      ? (error as { status?: unknown }).status
      : null;
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
    req.originalUrl.startsWith(
      "/api/discord/trade-plan-alert/automatic",
    ) &&
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
    res.setHeader("Cache-Control", "no-store");
    res.setHeader("Pragma", "no-cache");
    res.status(400).json({
      error: "INVALID_POSITION_SIZING_REQUEST",
      issues: [{ path: "$", code: "INVALID_JSON" }],
    });
    return;
  }
  next(error);
});

const backendAutomationScheduler = startBackendAutomationScheduler();

const server = app.listen(PORT, () => {
  // eslint-disable-next-line no-console
  console.log(`[server] Dashboard API listening on http://localhost:${PORT}`);
  console.log(
    `[server] SPY quote endpoint (/api/quote/spy) uses Schwab when an authenticated connection is available; every quote is labeled LIVE, STALE, or MOCK.`,
  );
  console.log(
    `[server] RTH VWAP, core session levels, RTH gap metrics, fixed 5/15/30-minute Opening Ranges, and Traditional daily/weekly pivots are derived deterministically from normalized SPY candles. The SPY current-date Options Chain, deterministic ATM straddle-Mark implied move, returned-window 0DTE GEX and DEX proxies, and deterministic Exposure Structure (ranked walls, cumulative Gamma-balance proxy, cliffs, and DEX anchor) are live when Schwab returns eligible inputs.`,
  );
  if (!hasDatabaseUrl) {
    console.log(
      `[server] DATABASE_URL is not set — Schwab connection status will show "Database not configured". See README for local Postgres setup.`,
    );
  }
  const schwabConfig = getSchwabConfig();
  if (schwabConfig.status === "missing") {
    console.log(
      `[server] Schwab OAuth env vars are incomplete (${schwabConfig.missingVars.join(", ")}) — Settings will show "Schwab credentials not configured".`,
    );
  } else if (schwabConfig.status === "invalid") {
    console.log(`[server] Schwab configuration is invalid: ${schwabConfig.reason}`);
  }
});


function shutdown(): void {
  backendAutomationScheduler.stop();
  server.close(() => process.exit(0));
}

process.once("SIGINT", shutdown);
process.once("SIGTERM", shutdown);
