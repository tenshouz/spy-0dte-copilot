import { Router } from "express";
import {
  getLastResortSpyZeroDteOptionsChain,
  getSpyZeroDteOptionsChain,
} from "../services/schwab-options-chain.service";

export const optionsChainRouter = Router();

// GET /api/options-chain/spy — SPY only, current America/New_York expiration
// only, deliberately bounded strikes, normalized backend-owned contracts.
optionsChainRouter.get("/spy", async (_req, res) => {
  try {
    res.json(await getSpyZeroDteOptionsChain());
  } catch {
    // eslint-disable-next-line no-console
    console.error("[options-chain] route-level unexpected failure");
    res.json(getLastResortSpyZeroDteOptionsChain());
  }
});
