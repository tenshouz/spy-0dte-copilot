import { Router } from "express";
import {
  getLastResortSpyRthGap,
  getSpyRthGap,
} from "../services/rth-gap.service";

export const gapRouter = Router();

// GET /api/gap/spy — deterministic current-date RTH opening gap and factual
// candle-level fill status. The service owns shared source reuse, eligibility,
// calculation, provenance, and schema validation; this route is transport-only.
gapRouter.get("/spy", async (_req, res) => {
  try {
    res.json(await getSpyRthGap());
  } catch {
    // eslint-disable-next-line no-console
    console.error("[gap] route-level unexpected failure");
    res.json(getLastResortSpyRthGap());
  }
});
