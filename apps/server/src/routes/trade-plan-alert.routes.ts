import { Router, type Response } from "express";
import { getSpyZeroDteTradePlanAlertCandidate } from "../services/trade-plan-alert-candidate.service";

export const tradePlanAlertRouter = Router();

export function setTradePlanAlertHeaders(res: Response): void {
  res.setHeader("Cache-Control", "no-store");
  res.setHeader("Pragma", "no-cache");
  res.setHeader("Cross-Origin-Resource-Policy", "same-site");
  res.setHeader("X-Content-Type-Options", "nosniff");
}

// GET /api/trade-plan-alert/spy — current-snapshot alert candidate only.
tradePlanAlertRouter.get("/spy", async (req, res) => {
  setTradePlanAlertHeaders(res);

  if (Object.keys(req.query).length > 0) {
    res.status(400).json({ error: "QUERY_PARAMETERS_NOT_SUPPORTED" });
    return;
  }

  res.json(await getSpyZeroDteTradePlanAlertCandidate());
});
