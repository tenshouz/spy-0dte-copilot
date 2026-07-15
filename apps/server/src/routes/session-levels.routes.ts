import { Router } from "express";
import {
  getLastResortSpySessionLevels,
  getSpySessionLevels,
} from "../services/session-levels.service";

export const sessionLevelsRouter = Router();

// GET /api/session-levels/spy — five deterministic core session price levels.
// The service owns shared source reuse, canonical session/date selection,
// coverage eligibility, calculation, provenance, and schema validation.
sessionLevelsRouter.get("/spy", async (_req, res) => {
  try {
    res.json(await getSpySessionLevels());
  } catch {
    // eslint-disable-next-line no-console
    console.error("[session-levels] route-level unexpected failure");
    res.json(getLastResortSpySessionLevels());
  }
});
