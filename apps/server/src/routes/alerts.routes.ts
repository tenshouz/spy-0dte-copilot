import { Router } from "express";
import { getAlerts } from "../services/mock-data.service";

export const alertsRouter = Router();

// GET /api/alerts — Milestone 1: returns mock data.
// Milestone 2+: reads DiscordLog rows + live-generated alerts (PRD Section 12).
alertsRouter.get("/", (_req, res) => {
  res.json(getAlerts());
});
