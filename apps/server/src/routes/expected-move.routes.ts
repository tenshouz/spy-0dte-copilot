import { Router } from "express";
import {
  getLastResortSpyZeroDteExpectedMove,
  getSpyZeroDteExpectedMove,
} from "../services/spy-expected-move.service";

export const expectedMoveRouter = Router();

// GET /api/expected-move/spy — current-date SPY ATM straddle provider-Mark implied move.
expectedMoveRouter.get("/spy", async (_req, res) => {
  try {
    res.json(await getSpyZeroDteExpectedMove());
  } catch {
    // eslint-disable-next-line no-console
    console.error("[expected-move] route-level unexpected failure");
    res.json(getLastResortSpyZeroDteExpectedMove());
  }
});
