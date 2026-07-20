import {
  BackendAutomationRunOnceRequestSchema,
  BackendAutomationSettingsUpdateRequestSchema,
  type BackendAutomationDeliveryHistoryResponse,
  type BackendAutomationRunOnceResponse,
  type BackendAutomationSettingsResponse,
  type BackendAutomationSettingsUpdateRequest,
  type BackendAutomationStatusResponse,
} from "@spy-copilot/shared";
import { Router, type Response } from "express";
import { isAllowedAccountRiskOrigin } from "./account-risk.routes";
import {
  getBackendAutomationSettings,
  getBackendAutomationStatus,
  listBackendAutomationHistory,
  runBackendAutomationOnce,
  updateBackendAutomationSettings,
} from "../services/backend-automation.service";

export interface BackendAutomationRouterDependencies {
  getSettings: () => Promise<BackendAutomationSettingsResponse>;
  updateSettings: (
    request: BackendAutomationSettingsUpdateRequest,
  ) => Promise<BackendAutomationSettingsResponse>;
  getStatus: () => Promise<BackendAutomationStatusResponse>;
  getHistory: () => Promise<BackendAutomationDeliveryHistoryResponse>;
  runOnce: () => Promise<BackendAutomationRunOnceResponse>;
  frontendUrl: () => string | undefined;
  log: (category: string) => void;
}

const DEFAULT_DEPENDENCIES: BackendAutomationRouterDependencies = {
  getSettings: getBackendAutomationSettings,
  updateSettings: updateBackendAutomationSettings,
  getStatus: getBackendAutomationStatus,
  getHistory: listBackendAutomationHistory,
  runOnce: runBackendAutomationOnce,
  frontendUrl: () => process.env.FRONTEND_URL,
  log: (category) => {
    // Fixed category only. Never log settings contents, webhook secrets, or
    // provider/report payloads.
    // eslint-disable-next-line no-console
    console.error(`[backend-automation] ${category}`);
  },
};

export function setBackendAutomationHeaders(res: Response): void {
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
    res.status(403).json({ error: "BACKEND_AUTOMATION_ORIGIN_FORBIDDEN" });
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

export function createBackendAutomationRouter(
  dependencies: Partial<BackendAutomationRouterDependencies> = {},
): Router {
  const deps = { ...DEFAULT_DEPENDENCIES, ...dependencies };
  const router = Router();

  router.get("/settings", async (req, res) => {
    setBackendAutomationHeaders(res);
    if (rejectQuery(req.query, res)) return;
    try {
      res.json(await deps.getSettings());
    } catch {
      deps.log("settings read failure");
      res.status(500).json({ error: "BACKEND_AUTOMATION_UNEXPECTED_FAILURE" });
    }
  });

  router.patch("/settings", async (req, res) => {
    setBackendAutomationHeaders(res);
    if (!configureOrigin(req.get("Origin"), deps.frontendUrl(), res)) return;
    if (rejectQuery(req.query, res)) return;
    const parsed = BackendAutomationSettingsUpdateRequestSchema.safeParse(
      req.body ?? {},
    );
    if (!parsed.success) {
      res.status(400).json({ error: "INVALID_BACKEND_AUTOMATION_SETTINGS_REQUEST" });
      return;
    }
    try {
      res.json(await deps.updateSettings(parsed.data));
    } catch {
      deps.log("settings update failure");
      res.status(500).json({ error: "BACKEND_AUTOMATION_UNEXPECTED_FAILURE" });
    }
  });

  router.get("/status", async (req, res) => {
    setBackendAutomationHeaders(res);
    if (rejectQuery(req.query, res)) return;
    try {
      res.json(await deps.getStatus());
    } catch {
      deps.log("status read failure");
      res.status(500).json({ error: "BACKEND_AUTOMATION_UNEXPECTED_FAILURE" });
    }
  });

  router.get("/history", async (req, res) => {
    setBackendAutomationHeaders(res);
    if (rejectQuery(req.query, res)) return;
    try {
      res.json(await deps.getHistory());
    } catch {
      deps.log("history read failure");
      res.status(500).json({ error: "BACKEND_AUTOMATION_UNEXPECTED_FAILURE" });
    }
  });

  router.post("/run-once", async (req, res) => {
    setBackendAutomationHeaders(res);
    if (!configureOrigin(req.get("Origin"), deps.frontendUrl(), res)) return;
    if (rejectQuery(req.query, res)) return;
    const parsed = BackendAutomationRunOnceRequestSchema.safeParse(req.body ?? {});
    if (!parsed.success) {
      res.status(400).json({ error: "INVALID_BACKEND_AUTOMATION_RUN_REQUEST" });
      return;
    }
    try {
      res.json(await deps.runOnce());
    } catch {
      deps.log("run once failure");
      res.status(500).json({ error: "BACKEND_AUTOMATION_UNEXPECTED_FAILURE" });
    }
  });

  return router;
}

export const backendAutomationRouter = createBackendAutomationRouter();
