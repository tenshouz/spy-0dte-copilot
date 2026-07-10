import { Router } from "express";
import { getLatestReport, getReportHistory } from "../services/mock-data.service";

export const reportRouter = Router();

// GET /api/reports/latest — Milestone 1: returns mock data.
// Milestone 3 will back this with the deterministic scoring layer + LLM narrative layer (PRD Sec. 6).
reportRouter.get("/latest", (_req, res) => {
  res.json(getLatestReport());
});

// GET /api/reports — session history (premarket + scheduled snapshots)
reportRouter.get("/", (_req, res) => {
  res.json(getReportHistory());
});
