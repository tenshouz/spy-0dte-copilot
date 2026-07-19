import {
  DeterministicScheduledReportRequestSchema,
  type DeterministicScheduledReportRequest,
  type SpyZeroDteDeterministicScheduledReportResponse,
} from "@spy-copilot/shared";
import { Router, type Response } from "express";
import { isAllowedAccountRiskOrigin } from "./account-risk.routes";
import { getLatestReport, getReportHistory } from "../services/mock-data.service";
import { getSpyZeroDteDeterministicScheduledReport } from "../services/deterministic-scheduled-report.service";

export interface ReportRouterDependencies {
  getDeterministicReport: (
    request: DeterministicScheduledReportRequest,
  ) => Promise<SpyZeroDteDeterministicScheduledReportResponse>;
  frontendUrl: () => string | undefined;
  log: (category: string) => void;
}

const DEFAULT_DEPENDENCIES: ReportRouterDependencies = {
  getDeterministicReport: getSpyZeroDteDeterministicScheduledReport,
  frontendUrl: () => process.env.FRONTEND_URL,
  log: (category) => {
    // Fixed category only. Never log request values or upstream provider data.
    // eslint-disable-next-line no-console
    console.error(`[deterministic-report] ${category}`);
  },
};

export function setDeterministicReportHeaders(res: Response): void {
  res.setHeader("Cache-Control", "no-store");
  res.setHeader("Pragma", "no-cache");
  res.setHeader("Cross-Origin-Resource-Policy", "same-site");
  res.setHeader("X-Content-Type-Options", "nosniff");
}

export function createReportRouter(
  dependencies: Partial<ReportRouterDependencies> = {},
): Router {
  const deps = { ...DEFAULT_DEPENDENCIES, ...dependencies };
  const router = Router();

  // POST /api/reports/spy/deterministic — explicit current-snapshot report generation only.
  router.post("/spy/deterministic", async (req, res) => {
    setDeterministicReportHeaders(res);

    const requestOrigin = req.get("Origin");
    if (!isAllowedAccountRiskOrigin(requestOrigin, deps.frontendUrl())) {
      res.removeHeader("Access-Control-Allow-Origin");
      res.status(403).json({ error: "DETERMINISTIC_REPORT_ORIGIN_FORBIDDEN" });
      return;
    }
    if (requestOrigin !== undefined) {
      res.setHeader("Access-Control-Allow-Origin", requestOrigin);
      res.setHeader("Vary", "Origin");
    } else {
      res.removeHeader("Access-Control-Allow-Origin");
    }

    if (Object.keys(req.query).length > 0) {
      res.status(400).json({ error: "QUERY_PARAMETERS_NOT_SUPPORTED" });
      return;
    }

    const parsedBody = DeterministicScheduledReportRequestSchema.safeParse(
      req.body ?? {},
    );
    if (!parsedBody.success) {
      res.status(400).json({ error: "INVALID_DETERMINISTIC_REPORT_REQUEST" });
      return;
    }

    try {
      res.json(await deps.getDeterministicReport(parsedBody.data));
    } catch {
      deps.log("route-level unexpected failure");
      res.status(500).json({ error: "DETERMINISTIC_REPORT_UNEXPECTED_FAILURE" });
    }
  });

  // GET /api/reports/latest — legacy mock dashboard report.
  router.get("/latest", (_req, res) => {
    res.json(getLatestReport());
  });

  // GET /api/reports — legacy mock session history.
  router.get("/", (_req, res) => {
    res.json(getReportHistory());
  });

  return router;
}

export const reportRouter = createReportRouter();
