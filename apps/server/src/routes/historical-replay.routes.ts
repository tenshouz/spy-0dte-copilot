import {
  HistoricalReplayRunIdSchema,
  HistoricalReplayRunRequestSchema,
  type HistoricalReplayHistoryResponse,
  type HistoricalReplayRunRequest,
  type HistoricalReplayRunResponse,
} from "@spy-copilot/shared";
import { Router, type Response } from "express";
import { isAllowedAccountRiskOrigin } from "./account-risk.routes";
import {
  createHistoricalReplayRun,
  getHistoricalReplayRun,
  listHistoricalReplayRuns,
} from "../services/historical-replay.service";

export interface HistoricalReplayRouterDependencies {
  createRun: (
    request: HistoricalReplayRunRequest,
  ) => Promise<HistoricalReplayRunResponse>;
  listRuns: () => Promise<HistoricalReplayHistoryResponse>;
  getRun: (runId: string) => Promise<HistoricalReplayRunResponse>;
  frontendUrl: () => string | undefined;
  log: (category: string) => void;
}

const DEFAULT_DEPENDENCIES: HistoricalReplayRouterDependencies = {
  createRun: createHistoricalReplayRun,
  listRuns: listHistoricalReplayRuns,
  getRun: getHistoricalReplayRun,
  frontendUrl: () => process.env.FRONTEND_URL,
  log: (category) => {
    // Fixed category only. Never log replay filters, snapshots, or results.
    // eslint-disable-next-line no-console
    console.error(`[historical-replay] ${category}`);
  },
};

export function setHistoricalReplayHeaders(res: Response): void {
  res.setHeader("Cache-Control", "no-store");
  res.setHeader("Pragma", "no-cache");
  res.setHeader("Cross-Origin-Resource-Policy", "same-site");
  res.setHeader("X-Content-Type-Options", "nosniff");
}

function configureReplayOrigin(
  requestOrigin: string | undefined,
  frontendUrl: string | undefined,
  res: Response,
): boolean {
  if (!isAllowedAccountRiskOrigin(requestOrigin, frontendUrl)) {
    res.removeHeader("Access-Control-Allow-Origin");
    res.status(403).json({ error: "HISTORICAL_REPLAY_ORIGIN_FORBIDDEN" });
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

function rejectUnsupportedQuery(
  query: Record<string, unknown>,
  res: Response,
): boolean {
  if (Object.keys(query).length === 0) return false;
  res.status(400).json({ error: "QUERY_PARAMETERS_NOT_SUPPORTED" });
  return true;
}

export function createHistoricalReplayRouter(
  dependencies: Partial<HistoricalReplayRouterDependencies> = {},
): Router {
  const deps = { ...DEFAULT_DEPENDENCIES, ...dependencies };
  const router = Router();

  router.get("/spy/runs", async (req, res) => {
    setHistoricalReplayHeaders(res);
    if (!configureReplayOrigin(req.get("Origin"), deps.frontendUrl(), res)) return;
    if (rejectUnsupportedQuery(req.query, res)) return;

    try {
      res.json(await deps.listRuns());
    } catch {
      deps.log("history route unexpected failure");
      res.status(500).json({ error: "HISTORICAL_REPLAY_UNEXPECTED_FAILURE" });
    }
  });

  router.get("/spy/runs/:runId", async (req, res) => {
    setHistoricalReplayHeaders(res);
    if (!configureReplayOrigin(req.get("Origin"), deps.frontendUrl(), res)) return;
    if (rejectUnsupportedQuery(req.query, res)) return;

    const parsedId = HistoricalReplayRunIdSchema.safeParse(req.params.runId);
    if (!parsedId.success) {
      res.status(400).json({ error: "INVALID_HISTORICAL_REPLAY_RUN_ID" });
      return;
    }

    try {
      res.json(await deps.getRun(parsedId.data));
    } catch {
      deps.log("detail route unexpected failure");
      res.status(500).json({ error: "HISTORICAL_REPLAY_UNEXPECTED_FAILURE" });
    }
  });

  router.post("/spy/runs", async (req, res) => {
    setHistoricalReplayHeaders(res);
    if (!configureReplayOrigin(req.get("Origin"), deps.frontendUrl(), res)) return;
    if (rejectUnsupportedQuery(req.query, res)) return;

    const parsed = HistoricalReplayRunRequestSchema.safeParse(req.body ?? {});
    if (!parsed.success) {
      res.status(400).json({ error: "INVALID_HISTORICAL_REPLAY_REQUEST" });
      return;
    }

    try {
      res.json(await deps.createRun(parsed.data));
    } catch {
      deps.log("create route unexpected failure");
      res.status(500).json({ error: "HISTORICAL_REPLAY_UNEXPECTED_FAILURE" });
    }
  });

  return router;
}

export const historicalReplayRouter = createHistoricalReplayRouter();
