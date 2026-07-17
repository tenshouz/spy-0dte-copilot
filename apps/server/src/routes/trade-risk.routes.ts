import { Router } from "express";
import {
  getLastResortSpyZeroDteObjectiveRiskFramework,
  getSpyZeroDteObjectiveRiskFramework,
} from "../services/trade-risk.service";

export const tradeRiskRouter = Router();

// GET /api/trade-risk/spy — same-snapshot SPY underlying objective/risk framework only.
tradeRiskRouter.get("/spy", async (_req, res) => {
  try {
    res.json(await getSpyZeroDteObjectiveRiskFramework());
  } catch {
    // eslint-disable-next-line no-console
    console.error("[trade-risk] route-level unexpected failure");
    res.json(getLastResortSpyZeroDteObjectiveRiskFramework());
  }
});
