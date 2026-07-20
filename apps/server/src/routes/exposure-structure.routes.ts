import { Router, type Response } from "express";
import {
  getLastResortSpyZeroDteExposureStructure,
  getSpyZeroDteExposureStructure,
} from "../services/spy-exposure-structure.service";

export const exposureStructureRouter = Router();

export function setExposureStructureHeaders(res: Response): void {
  res.setHeader("Cache-Control", "no-store");
  res.setHeader("Pragma", "no-cache");
  res.setHeader("Cross-Origin-Resource-Policy", "same-site");
  res.setHeader("X-Content-Type-Options", "nosniff");
}

exposureStructureRouter.get("/spy", async (req, res) => {
  setExposureStructureHeaders(res);
  if (Object.keys(req.query).length > 0) {
    res.status(400).json({ error: "QUERY_PARAMETERS_NOT_ALLOWED" });
    return;
  }
  try {
    res.json(await getSpyZeroDteExposureStructure());
  } catch {
    // eslint-disable-next-line no-console
    console.error("[exposure-structure] route-level unexpected failure");
    res.json(getLastResortSpyZeroDteExposureStructure());
  }
});
