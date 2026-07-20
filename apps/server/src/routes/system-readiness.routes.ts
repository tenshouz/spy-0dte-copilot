import {
  SystemDataProbeRequestSchema,
  type SystemDataProbeResponse,
  type SystemReadinessResponse,
} from "@spy-copilot/shared";
import { Router, type Response } from "express";
import { isAllowedWriteOrigin } from "../lib/http-hardening";

export interface SystemReadinessRouterDependencies {
  getReadiness: () => Promise<SystemReadinessResponse>;
  runProbe: () => Promise<SystemDataProbeResponse>;
  frontendUrl: () => string | undefined;
  log: (category: string) => void;
}

const DEFAULT_DEPENDENCIES: SystemReadinessRouterDependencies = {
  getReadiness: async () =>
    (await import("../services/system-readiness.service")).getSystemReadiness(),
  runProbe: async () =>
    (await import("../services/system-readiness.service")).runSystemDataProbe(),
  frontendUrl: () => process.env.FRONTEND_URL,
  log: (category) => {
    // Fixed categories only. Never log environment values, tokens, provider
    // bodies, account data, or arbitrary Error.message strings.
    // eslint-disable-next-line no-console
    console.error(`[system-readiness] ${category}`);
  },
};

export function setSystemReadinessHeaders(res: Response): void {
  res.setHeader("Cache-Control", "no-store");
  res.setHeader("Pragma", "no-cache");
  res.setHeader("Cross-Origin-Resource-Policy", "same-site");
  res.setHeader("X-Content-Type-Options", "nosniff");
}

function rejectQuery(query: Record<string, unknown>, res: Response): boolean {
  if (Object.keys(query).length === 0) return false;
  res.status(400).json({ error: "QUERY_PARAMETERS_NOT_SUPPORTED" });
  return true;
}

function allowOrigin(
  requestOrigin: string | undefined,
  frontendUrl: string | undefined,
  res: Response,
): boolean {
  if (!isAllowedWriteOrigin(requestOrigin, frontendUrl)) {
    res.removeHeader("Access-Control-Allow-Origin");
    res.status(403).json({ error: "SYSTEM_READINESS_ORIGIN_FORBIDDEN" });
    return false;
  }
  if (requestOrigin !== undefined) {
    res.setHeader("Access-Control-Allow-Origin", requestOrigin);
    res.setHeader("Vary", "Origin");
  }
  return true;
}

export function createSystemReadinessRouter(
  dependencies: Partial<SystemReadinessRouterDependencies> = {},
): Router {
  const deps = { ...DEFAULT_DEPENDENCIES, ...dependencies };
  const router = Router();

  router.get("/readiness", async (req, res) => {
    setSystemReadinessHeaders(res);
    if (rejectQuery(req.query, res)) return;
    try {
      res.json(await deps.getReadiness());
    } catch {
      deps.log("readiness failure");
      res.status(500).json({ error: "SYSTEM_READINESS_UNEXPECTED_FAILURE" });
    }
  });

  router.post("/probe", async (req, res) => {
    setSystemReadinessHeaders(res);
    if (!allowOrigin(req.get("Origin"), deps.frontendUrl(), res)) return;
    if (rejectQuery(req.query, res)) return;
    const parsed = SystemDataProbeRequestSchema.safeParse(req.body ?? {});
    if (!parsed.success) {
      res.status(400).json({ error: "INVALID_SYSTEM_DATA_PROBE_REQUEST" });
      return;
    }
    try {
      res.json(await deps.runProbe());
    } catch {
      deps.log("data probe failure");
      res.status(500).json({ error: "SYSTEM_DATA_PROBE_UNEXPECTED_FAILURE" });
    }
  });

  return router;
}

export const systemReadinessRouter = createSystemReadinessRouter();
