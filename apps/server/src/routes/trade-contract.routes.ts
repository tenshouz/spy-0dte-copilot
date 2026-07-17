import { Router } from "express";
import {
  getLastResortSpyZeroDteContractSelection,
  getSpyZeroDteContractSelection,
} from "../services/trade-contract.service";

export const tradeContractRouter = Router();

// GET /api/trade-contract/spy — deterministic SPY 0DTE contract/liquidity selection only.
tradeContractRouter.get("/spy", async (_req, res) => {
  try {
    res.json(await getSpyZeroDteContractSelection());
  } catch {
    // eslint-disable-next-line no-console
    console.error("[trade-contract] route-level unexpected failure");
    res.json(getLastResortSpyZeroDteContractSelection());
  }
});
