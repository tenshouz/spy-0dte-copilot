import {
  DeterministicJournalCaptureRequestSchema,
  type DeterministicJournalCaptureResponse,
  type DeterministicJournalSnapshotListResponse,
} from "@spy-copilot/shared";
import { Router, type Response } from "express";
import { isAllowedAccountRiskOrigin } from "./account-risk.routes";
import {
  captureDeterministicJournalSnapshot,
  listDeterministicJournalSnapshots,
} from "../services/deterministic-journal.service";

export interface JournalRouterDependencies {
  listSnapshots: () => Promise<DeterministicJournalSnapshotListResponse>;
  captureSnapshot: () => Promise<DeterministicJournalCaptureResponse>;
  frontendUrl: () => string | undefined;
  log: (category: string) => void;
}

const DEFAULT_DEPENDENCIES: JournalRouterDependencies = {
  listSnapshots: listDeterministicJournalSnapshots,
  captureSnapshot: captureDeterministicJournalSnapshot,
  frontendUrl: () => process.env.FRONTEND_URL,
  log: (category) => {
    // Fixed category only. Never log persisted journal data.
    // eslint-disable-next-line no-console
    console.error(`[deterministic-journal] ${category}`);
  },
};

export function setDeterministicJournalHeaders(res: Response): void {
  res.setHeader("Cache-Control", "no-store");
  res.setHeader("Pragma", "no-cache");
  res.setHeader("Cross-Origin-Resource-Policy", "same-site");
  res.setHeader("X-Content-Type-Options", "nosniff");
}

function configureJournalOrigin(
  requestOrigin: string | undefined,
  frontendUrl: string | undefined,
  res: Response,
): boolean {
  if (!isAllowedAccountRiskOrigin(requestOrigin, frontendUrl)) {
    res.removeHeader("Access-Control-Allow-Origin");
    res.status(403).json({ error: "DETERMINISTIC_JOURNAL_ORIGIN_FORBIDDEN" });
    return false;
  }

  if (requestOrigin !== undefined) {
    res.setHeader("Access-Control-Allow-Origin", requestOrigin);
    res.setHeader("Vary", "Origin");
  } else {
    res.removeHeader("Access-Control-Allow-Origin");
  }
  return true;
}

export function createJournalRouter(
  dependencies: Partial<JournalRouterDependencies> = {},
): Router {
  const deps = { ...DEFAULT_DEPENDENCIES, ...dependencies };
  const router = Router();

  // GET /api/journal/spy/snapshots — persisted deterministic snapshot summaries.
  router.get("/spy/snapshots", async (req, res) => {
    setDeterministicJournalHeaders(res);
    if (!configureJournalOrigin(req.get("Origin"), deps.frontendUrl(), res)) {
      return;
    }
    if (Object.keys(req.query).length > 0) {
      res.status(400).json({ error: "QUERY_PARAMETERS_NOT_SUPPORTED" });
      return;
    }

    try {
      res.json(await deps.listSnapshots());
    } catch {
      deps.log("list route unexpected failure");
      res.status(500).json({ error: "DETERMINISTIC_JOURNAL_UNEXPECTED_FAILURE" });
    }
  });

  // POST /api/journal/spy/snapshots — explicit capture of the current Assembly.
  router.post("/spy/snapshots", async (req, res) => {
    setDeterministicJournalHeaders(res);
    if (!configureJournalOrigin(req.get("Origin"), deps.frontendUrl(), res)) {
      return;
    }
    if (Object.keys(req.query).length > 0) {
      res.status(400).json({ error: "QUERY_PARAMETERS_NOT_SUPPORTED" });
      return;
    }
    const parsed = DeterministicJournalCaptureRequestSchema.safeParse(
      req.body ?? {},
    );
    if (!parsed.success) {
      res.status(400).json({ error: "INVALID_DETERMINISTIC_JOURNAL_REQUEST" });
      return;
    }

    try {
      res.json(await deps.captureSnapshot());
    } catch {
      deps.log("capture route unexpected failure");
      res.status(500).json({ error: "DETERMINISTIC_JOURNAL_UNEXPECTED_FAILURE" });
    }
  });

  return router;
}

export const journalRouter = createJournalRouter();
