import { Router } from "express";
import {
  getLastResortSpyZeroDteDeterministicBias,
  getSpyZeroDteDeterministicBias,
} from "../services/market-bias.service";

export const marketBiasRouter = Router();

// GET /api/market-bias/spy — deterministic Bias and structural Confidence only; no trade plan.
marketBiasRouter.get("/spy", async (_req, res) => {
  try {
    res.json(await getSpyZeroDteDeterministicBias());
  } catch {
    // eslint-disable-next-line no-console
    console.error("[market-bias] route-level unexpected failure");
    res.json(getLastResortSpyZeroDteDeterministicBias());
  }
});
