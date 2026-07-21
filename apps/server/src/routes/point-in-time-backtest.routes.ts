import {
  PointInTimeBacktestRunIdSchema,
  PointInTimeBacktestRunRequestSchema,
  type PointInTimeBacktestHistoryResponse,
  type PointInTimeBacktestRunRequest,
  type PointInTimeBacktestRunResponse,
} from "@spy-copilot/shared";
import { Router, type Response } from "express";
import { isAllowedAccountRiskOrigin } from "./account-risk.routes";
import {
  createPointInTimeBacktestRun,
  getPointInTimeBacktestRun,
  listPointInTimeBacktestRuns,
} from "../services/point-in-time-backtest.service";

export interface PointInTimeBacktestRouterDependencies {
  createRun: (
    request: PointInTimeBacktestRunRequest,
  ) => Promise<PointInTimeBacktestRunResponse>;
  listRuns: () => Promise<PointInTimeBacktestHistoryResponse>;
  getRun: (runId: string) => Promise<PointInTimeBacktestRunResponse>;
  frontendUrl: () => string | undefined;
  log: (category: string) => void;
}

const DEFAULT_DEPENDENCIES: PointInTimeBacktestRouterDependencies = {
  createRun: createPointInTimeBacktestRun,
  listRuns: listPointInTimeBacktestRuns,
  getRun: getPointInTimeBacktestRun,
  frontendUrl: () => process.env.FRONTEND_URL,
  log: (category) => {
    // Fixed category only. Never log stored market data or backtest payloads.
    // eslint-disable-next-line no-console
    console.error(`[point-in-time-backtest] ${category}`);
  },
};

export function setPointInTimeBacktestHeaders(res: Response): void {
  res.setHeader("Cache-Control", "no-store");
  res.setHeader("Pragma", "no-cache");
  res.setHeader("Cross-Origin-Resource-Policy", "same-site");
  res.setHeader("X-Content-Type-Options", "nosniff");
}

function configureOrigin(
  requestOrigin: string | undefined,
  frontendUrl: string | undefined,
  res: Response,
): boolean {
  if (!isAllowedAccountRiskOrigin(requestOrigin, frontendUrl)) {
    res.removeHeader("Access-Control-Allow-Origin");
    res.status(403).json({ error: "POINT_IN_TIME_BACKTEST_ORIGIN_FORBIDDEN" });
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

function rejectQuery(query: Record<string, unknown>, res: Response): boolean {
  if (Object.keys(query).length === 0) return false;
  res.status(400).json({ error: "QUERY_PARAMETERS_NOT_SUPPORTED" });
  return true;
}

export function createPointInTimeBacktestRouter(
  dependencies: Partial<PointInTimeBacktestRouterDependencies> = {},
): Router {
  const deps = { ...DEFAULT_DEPENDENCIES, ...dependencies };
  const router = Router();

  router.get("/spy/runs", async (req, res) => {
    setPointInTimeBacktestHeaders(res);
    if (!configureOrigin(req.get("Origin"), deps.frontendUrl(), res)) return;
    if (rejectQuery(req.query, res)) return;
    try {
      res.json(await deps.listRuns());
    } catch {
      deps.log("history route unexpected failure");
      res.status(500).json({ error: "POINT_IN_TIME_BACKTEST_UNEXPECTED_FAILURE" });
    }
  });

  router.get("/spy/runs/:runId", async (req, res) => {
    setPointInTimeBacktestHeaders(res);
    if (!configureOrigin(req.get("Origin"), deps.frontendUrl(), res)) return;
    if (rejectQuery(req.query, res)) return;
    const runId = PointInTimeBacktestRunIdSchema.safeParse(req.params.runId);
    if (!runId.success) {
      res.status(400).json({ error: "INVALID_POINT_IN_TIME_BACKTEST_RUN_ID" });
      return;
    }
    try {
      res.json(await deps.getRun(runId.data));
    } catch {
      deps.log("detail route unexpected failure");
      res.status(500).json({ error: "POINT_IN_TIME_BACKTEST_UNEXPECTED_FAILURE" });
    }
  });

  router.post("/spy/runs", async (req, res) => {
    setPointInTimeBacktestHeaders(res);
    if (!configureOrigin(req.get("Origin"), deps.frontendUrl(), res)) return;
    if (rejectQuery(req.query, res)) return;
    const request = PointInTimeBacktestRunRequestSchema.safeParse(req.body ?? {});
    if (!request.success) {
      res.status(400).json({ error: "INVALID_POINT_IN_TIME_BACKTEST_REQUEST" });
      return;
    }
    try {
      res.json(await deps.createRun(request.data));
    } catch {
      deps.log("create route unexpected failure");
      res.status(500).json({ error: "POINT_IN_TIME_BACKTEST_UNEXPECTED_FAILURE" });
    }
  });

  return router;
}

export const pointInTimeBacktestRouter = createPointInTimeBacktestRouter();
