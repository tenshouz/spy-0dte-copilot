import type { EmpiricalGammaResearchResponse } from "@spy-copilot/shared";
import { Router, type Response } from "express";
import { isAllowedAccountRiskOrigin } from "./account-risk.routes";
import { getEmpiricalGammaResearch } from "../services/empirical-gamma-research.service";

export interface GammaResearchRouterDependencies {
  getResearch: () => Promise<EmpiricalGammaResearchResponse>;
  frontendUrl: () => string | undefined;
  log: (category: string) => void;
}

const DEFAULT_DEPENDENCIES: GammaResearchRouterDependencies = {
  getResearch: getEmpiricalGammaResearch,
  frontendUrl: () => process.env.FRONTEND_URL,
  log: (category) => {
    // Fixed category only. Never log persisted research rows or P&L.
    // eslint-disable-next-line no-console
    console.error(`[empirical-gamma-research] ${category}`);
  },
};

export function setGammaResearchHeaders(res: Response): void {
  res.setHeader("Cache-Control", "no-store");
  res.setHeader("Pragma", "no-cache");
  res.setHeader("Cross-Origin-Resource-Policy", "same-site");
  res.setHeader("X-Content-Type-Options", "nosniff");
}

export function createGammaResearchRouter(
  dependencies: Partial<GammaResearchRouterDependencies> = {},
): Router {
  const deps = { ...DEFAULT_DEPENDENCIES, ...dependencies };
  const router = Router();

  // GET /api/gamma-research/spy — observational, setup-matched Gamma research.
  router.get("/spy", async (req, res) => {
    setGammaResearchHeaders(res);
    const requestOrigin = req.get("Origin");
    if (!isAllowedAccountRiskOrigin(requestOrigin, deps.frontendUrl())) {
      res.removeHeader("Access-Control-Allow-Origin");
      res.status(403).json({ error: "GAMMA_RESEARCH_ORIGIN_FORBIDDEN" });
      return;
    }
    if (requestOrigin !== undefined) {
      res.setHeader("Access-Control-Allow-Origin", requestOrigin);
      res.setHeader("Vary", "Origin");
    }
    if (Object.keys(req.query).length > 0) {
      res.status(400).json({ error: "QUERY_PARAMETERS_NOT_SUPPORTED" });
      return;
    }

    try {
      res.json(await deps.getResearch());
    } catch {
      deps.log("route unexpected failure");
      res.status(500).json({ error: "EMPIRICAL_GAMMA_RESEARCH_UNEXPECTED_FAILURE" });
    }
  });

  return router;
}

export const gammaResearchRouter = createGammaResearchRouter();
