import { Router } from "express";
import { getJournalEntries } from "../services/mock-data.service";

export const journalRouter = Router();

// GET /api/journal — Milestone 1: returns mock data.
// Milestone 2+: reads/writes JournalEntry rows via Prisma (PRD Section 11/15).
journalRouter.get("/", (_req, res) => {
  res.json(getJournalEntries());
});
