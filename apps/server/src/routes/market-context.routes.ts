import { Router } from "express";
import {
  getLastResortSpyZeroDteMarketContext,
  getSpyZeroDteMarketContext,
} from "../services/market-context.service";

export const marketContextRouter = Router();

// GET /api/market-context/spy — assembled deterministic summaries and provenance.
marketContextRouter.get("/spy", async (_req, res) => {
  try {
    res.json(await getSpyZeroDteMarketContext());
  } catch {
    // eslint-disable-next-line no-console
    console.error("[market-context] route-level unexpected failure");
    res.json(getLastResortSpyZeroDteMarketContext());
  }
});
