import { Router } from "express";
import { getCandles, getLatestSnapshot, getStrikeExposures } from "../services/mock-data.service";

export const snapshotRouter = Router();

// GET /api/snapshot/latest — Milestone 1: returns mock data.
// Milestone 2: will be backed by the Metrics Engine (PRD Section 5/14).
snapshotRouter.get("/latest", (_req, res) => {
  res.json(getLatestSnapshot());
});

// GET /api/snapshot/strikes — per-strike GEX/DEX rows (mock for now).
snapshotRouter.get("/strikes", (_req, res) => {
  res.json(getStrikeExposures());
});

// GET /api/snapshot/candles — 5-minute candles for the live chart (mock for now).
snapshotRouter.get("/candles", (_req, res) => {
  res.json(getCandles());
});
