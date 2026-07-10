import cors from "cors";
import express from "express";
import { hasDatabaseUrl, hasSchwabCredentials } from "./config/env";
import { alertsRouter } from "./routes/alerts.routes";
import { authRouter } from "./routes/auth.routes";
import { journalRouter } from "./routes/journal.routes";
import { reportRouter } from "./routes/report.routes";
import { snapshotRouter } from "./routes/snapshot.routes";

const app = express();
const PORT = process.env.PORT ? Number(process.env.PORT) : 4000;

app.use(cors());
app.use(express.json());

app.get("/health", (_req, res) => {
  res.json({ status: "ok", milestone: 1, dataSource: "mock" });
});

app.use("/api/snapshot", snapshotRouter);
app.use("/api/reports", reportRouter);
app.use("/api/journal", journalRouter);
app.use("/api/alerts", alertsRouter);
app.use("/api/auth", authRouter);

app.listen(PORT, () => {
  // eslint-disable-next-line no-console
  console.log(`[server] Milestone 1 mock API listening on http://localhost:${PORT}`);
  console.log(`[server] NOTE: all data below is mocked. Schwab is not connected (see PRD Sec. 5).`);
  if (!hasDatabaseUrl) {
    console.log(
      `[server] DATABASE_URL is not set — Schwab connection status will show "Database not configured". See README for local Postgres setup.`,
    );
  }
  if (!hasSchwabCredentials) {
    console.log(
      `[server] Schwab OAuth env vars are incomplete — Schwab connection status will show "Schwab credentials not configured".`,
    );
  }
});
