import { Router, type Response } from "express";
import {
  getLastResortSpyDeterministicSessionStructure,
  getSpyDeterministicSessionStructure,
} from "../services/session-structure.service";

export const sessionStructureRouter = Router();

export function setSessionStructureHeaders(res: Response): void {
  res.setHeader("Cache-Control", "no-store");
  res.setHeader("Pragma", "no-cache");
  res.setHeader("Cross-Origin-Resource-Policy", "same-site");
  res.setHeader("X-Content-Type-Options", "nosniff");
}

sessionStructureRouter.get("/spy", async (req, res) => {
  setSessionStructureHeaders(res);
  if (Object.keys(req.query).length > 0) {
    res.status(400).json({ error: "QUERY_PARAMETERS_NOT_ALLOWED" });
    return;
  }
  try {
    res.json(await getSpyDeterministicSessionStructure());
  } catch {
    // eslint-disable-next-line no-console
    console.error("[session-structure] route-level unexpected failure");
    res.json(getLastResortSpyDeterministicSessionStructure());
  }
});
