import { Router } from "express";
import {
  getLastResortSpyZeroDteTradePlanAssembly,
  getSpyZeroDteTradePlanAssembly,
} from "../services/trade-plan-assembly.service";

export const tradePlanAssemblyRouter = Router();

// GET /api/trade-plan-assembly/spy — concise deterministic Trade Plan assembly.
tradePlanAssemblyRouter.get("/spy", async (_req, res) => {
  try {
    res.json(await getSpyZeroDteTradePlanAssembly());
  } catch {
    // eslint-disable-next-line no-console
    console.error("[trade-plan-assembly] route-level unexpected failure");
    res.json(getLastResortSpyZeroDteTradePlanAssembly());
  }
});
