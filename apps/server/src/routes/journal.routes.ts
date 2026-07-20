import {
  DeterministicJournalCaptureRequestSchema,
  DeterministicJournalOutcomeUpdateRequestSchema,
  DeterministicJournalSnapshotIdSchema,
  type DeterministicJournalCaptureResponse,
  type DeterministicJournalOutcomeUpdateRequest,
  type DeterministicJournalOutcomeUpdateResponse,
  type DeterministicJournalSnapshotListResponse,
} from "@spy-copilot/shared";
import { Router, type Response } from "express";
import { isAllowedAccountRiskOrigin } from "./account-risk.routes";
import {
  captureDeterministicJournalSnapshot,
  listDeterministicJournalSnapshots,
  updateDeterministicJournalOutcome,
} from "../services/deterministic-journal.service";

export interface JournalRouterDependencies {
  listSnapshots: () => Promise<DeterministicJournalSnapshotListResponse>;
  captureSnapshot: () => Promise<DeterministicJournalCaptureResponse>;
  updateOutcome: (
    snapshotId: string,
    request: DeterministicJournalOutcomeUpdateRequest,
  ) => Promise<DeterministicJournalOutcomeUpdateResponse>;
  frontendUrl: () => string | undefined;
  log: (category: string) => void;
}

const DEFAULT_DEPENDENCIES: JournalRouterDependencies = {
  listSnapshots: listDeterministicJournalSnapshots,
  captureSnapshot: captureDeterministicJournalSnapshot,
  updateOutcome: updateDeterministicJournalOutcome,
  frontendUrl: () => process.env.FRONTEND_URL,
  log: (category) => {
    // Fixed category only. Never log persisted journal or outcome data.
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

function rejectUnsupportedQuery(query: Record<string, unknown>, res: Response): boolean {
  if (Object.keys(query).length === 0) return false;
  res.status(400).json({ error: "QUERY_PARAMETERS_NOT_SUPPORTED" });
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
    if (!configureJournalOrigin(req.get("Origin"), deps.frontendUrl(), res)) return;
    if (rejectUnsupportedQuery(req.query, res)) return;

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
    if (!configureJournalOrigin(req.get("Origin"), deps.frontendUrl(), res)) return;
    if (rejectUnsupportedQuery(req.query, res)) return;

    const parsed = DeterministicJournalCaptureRequestSchema.safeParse(req.body ?? {});
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

  // PATCH /api/journal/spy/snapshots/:snapshotId/outcome — explicit user-entered outcome annotation.
  router.patch("/spy/snapshots/:snapshotId/outcome", async (req, res) => {
    setDeterministicJournalHeaders(res);
    if (!configureJournalOrigin(req.get("Origin"), deps.frontendUrl(), res)) return;
    if (rejectUnsupportedQuery(req.query, res)) return;

    const parsedId = DeterministicJournalSnapshotIdSchema.safeParse(req.params.snapshotId);
    const parsedBody = DeterministicJournalOutcomeUpdateRequestSchema.safeParse(
      req.body ?? {},
    );
    if (!parsedId.success || !parsedBody.success) {
      res.status(400).json({ error: "INVALID_DETERMINISTIC_JOURNAL_OUTCOME_REQUEST" });
      return;
    }

    try {
      res.json(await deps.updateOutcome(parsedId.data, parsedBody.data));
    } catch {
      deps.log("outcome route unexpected failure");
      res.status(500).json({ error: "DETERMINISTIC_JOURNAL_UNEXPECTED_FAILURE" });
    }
  });

  return router;
}

export const journalRouter = createJournalRouter();
