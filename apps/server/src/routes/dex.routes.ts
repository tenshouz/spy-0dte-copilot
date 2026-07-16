import { Router } from "express";
import {
  getLastResortSpyZeroDteDexProxy,
  getSpyZeroDteDexProxy,
} from "../services/spy-dex-proxy.service";

export const dexRouter = Router();

// GET /api/dex/spy — returned-window SPY 0DTE Delta Exposure proxy.
dexRouter.get("/spy", async (_req, res) => {
  try {
    res.json(await getSpyZeroDteDexProxy());
  } catch {
    // eslint-disable-next-line no-console
    console.error("[dex] route-level unexpected failure");
    res.json(getLastResortSpyZeroDteDexProxy());
  }
});
