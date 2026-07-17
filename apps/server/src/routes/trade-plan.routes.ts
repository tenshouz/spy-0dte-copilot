import { Router } from "express";
import {
  getLastResortSpyZeroDteDeterministicTradePlan,
  getSpyZeroDteDeterministicTradePlan,
} from "../services/trade-plan.service";

export const tradePlanRouter = Router();

// GET /api/trade-plan/spy — same-snapshot deterministic setup eligibility only.
tradePlanRouter.get("/spy", async (_req, res) => {
  try {
    res.json(await getSpyZeroDteDeterministicTradePlan());
  } catch {
    // eslint-disable-next-line no-console
    console.error("[trade-plan] route-level unexpected failure");
    res.json(getLastResortSpyZeroDteDeterministicTradePlan());
  }
});
