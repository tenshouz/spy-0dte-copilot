import { Router } from "express";
import {
  getLastResortSpyOpeningRange,
  getSpyOpeningRange,
} from "../services/opening-range.service";

export const openingRangeRouter = Router();

// GET /api/opening-range/spy — fixed current-date [09:30, 09:45) RTH
// Opening Range. Selection, coverage, extrema, provenance, and validation all
// remain in deterministic service/logic layers; this route is transport-only.
openingRangeRouter.get("/spy", async (_req, res) => {
  try {
    res.json(await getSpyOpeningRange());
  } catch {
    // eslint-disable-next-line no-console
    console.error("[opening-range] route-level unexpected failure");
    res.json(getLastResortSpyOpeningRange());
  }
});
