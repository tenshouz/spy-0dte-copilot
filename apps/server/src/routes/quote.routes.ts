import { Router } from "express";
import { getLastResortMockQuote, getSpyQuote } from "../services/schwab-market-data.service";

export const quoteRouter = Router();

// GET /api/quote/spy — normalized SPY quote (LIVE / STALE / MOCK decided by
// the service). getSpyQuote never throws and handles all normal failures
// internally (cache-first for temporary ones). This catch is only a
// catastrophic last resort: one fixed sanitized category, and a validated
// MOCK payload — never a cached real quote, since authentication cannot be
// confirmed on this path, and never a raw exception.
quoteRouter.get("/spy", async (_req, res) => {
  try {
    res.json(await getSpyQuote());
  } catch {
    // eslint-disable-next-line no-console
    console.error("[quote] route-level unexpected failure");
    res.json(getLastResortMockQuote());
  }
});
