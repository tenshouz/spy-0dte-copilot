import { Router } from "express";
import {
  getLastResortSpyZeroDteDeterministicMarketState,
  getSpyZeroDteDeterministicMarketState,
} from "../services/market-state.service";

export const marketStateRouter = Router();

// GET /api/market-state/spy — objective, versioned features only; no bias or recommendation.
marketStateRouter.get("/spy", async (_req, res) => {
  try {
    res.json(await getSpyZeroDteDeterministicMarketState());
  } catch {
    // eslint-disable-next-line no-console
    console.error("[market-state] route-level unexpected failure");
    res.json(getLastResortSpyZeroDteDeterministicMarketState());
  }
});
