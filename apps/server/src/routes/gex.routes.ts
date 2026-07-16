import { Router } from "express";
import {
  getLastResortSpyZeroDteGexProxy,
  getSpyZeroDteGexProxy,
} from "../services/spy-gex-proxy.service";

export const gexRouter = Router();

// GET /api/gex/spy — returned ATM-window SPY 0DTE Gamma Exposure proxy.
gexRouter.get("/spy", async (_req, res) => {
  try {
    res.json(await getSpyZeroDteGexProxy());
  } catch {
    // eslint-disable-next-line no-console
    console.error("[gex] route-level unexpected failure");
    res.json(getLastResortSpyZeroDteGexProxy());
  }
});
