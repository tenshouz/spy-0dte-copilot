import { Router } from "express";
import {
  getLastResortSpyRthVwap,
  getSpyRthVwap,
} from "../services/rth-vwap.service";

export const vwapRouter = Router();

// GET /api/vwap/spy — cumulative current/latest RTH-session VWAP. The service
// owns source reuse, session selection, calculation, provenance, and schema
// validation; this route remains intentionally transport-only.
vwapRouter.get("/spy", async (_req, res) => {
  try {
    res.json(await getSpyRthVwap());
  } catch {
    // eslint-disable-next-line no-console
    console.error("[vwap] route-level unexpected failure");
    res.json(getLastResortSpyRthVwap());
  }
});
