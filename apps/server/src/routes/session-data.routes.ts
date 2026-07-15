import { Router } from "express";
import {
  getLastResortSessionDataFoundation,
  getSpySessionDataFoundation,
} from "../services/session-data.service";

export const sessionDataRouter = Router();

// GET /api/session-data/spy — diagnostic Session Data Foundation metadata.
// No trading metrics are calculated here. The service owns auth, retrieval,
// retained-data behavior, and validation; this route remains intentionally thin.
sessionDataRouter.get("/spy", async (_req, res) => {
  try {
    res.json(await getSpySessionDataFoundation());
  } catch {
    // eslint-disable-next-line no-console
    console.error("[session-data] route-level unexpected failure");
    res.json(getLastResortSessionDataFoundation());
  }
});
