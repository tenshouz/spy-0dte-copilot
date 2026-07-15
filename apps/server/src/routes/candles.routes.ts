import { Router } from "express";
import { getLastResortMockCandles, getSpyCandles } from "../services/schwab-candles.service";

export const candlesRouter = Router();

// GET /api/candles/spy — normalized SPY 5-minute candles (LIVE / STALE / MOCK
// decided by the service). getSpyCandles never throws and handles all normal
// failures internally (cache-first for temporary ones). This catch is only a
// catastrophic last resort: one fixed sanitized category and a validated MOCK
// payload — never retained real data, since authentication cannot be
// confirmed on this path, and never a raw exception.
candlesRouter.get("/spy", async (_req, res) => {
  try {
    res.json(await getSpyCandles());
  } catch {
    // eslint-disable-next-line no-console
    console.error("[candles] route-level unexpected failure");
    res.json(getLastResortMockCandles());
  }
});
