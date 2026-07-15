import "./bootstrap-env";
import cors from "cors";
import express from "express";
import { getSchwabConfig, hasDatabaseUrl } from "./config/env";
import { alertsRouter } from "./routes/alerts.routes";
import { authRouter } from "./routes/auth.routes";
import { candlesRouter } from "./routes/candles.routes";
import { gapRouter } from "./routes/gap.routes";
import { journalRouter } from "./routes/journal.routes";
import { quoteRouter } from "./routes/quote.routes";
import { reportRouter } from "./routes/report.routes";
import { sessionDataRouter } from "./routes/session-data.routes";
import { sessionLevelsRouter } from "./routes/session-levels.routes";
import { snapshotRouter } from "./routes/snapshot.routes";
import { vwapRouter } from "./routes/vwap.routes";

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

app.use("/api/snapshot", snapshotRouter);
app.use("/api/reports", reportRouter);
app.use("/api/journal", journalRouter);
app.use("/api/quote", quoteRouter);
app.use("/api/candles", candlesRouter);
app.use("/api/gap", gapRouter);
app.use("/api/session-data", sessionDataRouter);
app.use("/api/session-levels", sessionLevelsRouter);
app.use("/api/vwap", vwapRouter);
app.use("/api/alerts", alertsRouter);
app.use("/api/auth", authRouter);

app.listen(PORT, () => {
  // eslint-disable-next-line no-console
  console.log(`[server] Dashboard API listening on http://localhost:${PORT}`);
  console.log(
    `[server] SPY quote endpoint (/api/quote/spy) uses Schwab when an authenticated connection is available; every quote is labeled LIVE, STALE, or MOCK.`,
  );
  console.log(
    `[server] RTH VWAP, core session levels, and RTH gap metrics are derived deterministically from the normalized SPY candle pipeline; remaining advanced analytics are still mock data.`,
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
