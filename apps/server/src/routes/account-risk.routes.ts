import {
  AccountRiskSnapshotOriginErrorResponseSchema,
  AccountRiskSnapshotRequestErrorResponseSchema,
  type SchwabReadOnlyAccountRiskSnapshotResponse,
} from "@spy-copilot/shared";
import { Router, type Request, type Response } from "express";
import {
  getLastResortSchwabReadOnlyAccountRiskSnapshot,
  getSchwabReadOnlyAccountRiskSnapshot,
} from "../services/schwab-account-risk.service";

export interface AccountRiskRouterDependencies {
  getSnapshot: () => Promise<SchwabReadOnlyAccountRiskSnapshotResponse>;
  frontendUrl: () => string | undefined;
  log: (category: string) => void;
}

const DEFAULT_DEPENDENCIES: AccountRiskRouterDependencies = {
  getSnapshot: getSchwabReadOnlyAccountRiskSnapshot,
  frontendUrl: () => process.env.FRONTEND_URL,
  log: (category) => {
    // Fixed category only. Never include Origin or account data.
    // eslint-disable-next-line no-console
    console.error(`[account-risk] ${category}`);
  },
};

export function setAccountRiskPrivateHeaders(res: Response): void {
  res.setHeader("Cache-Control", "no-store");
  res.setHeader("Pragma", "no-cache");
  res.setHeader("Cross-Origin-Resource-Policy", "same-site");
  res.setHeader("X-Content-Type-Options", "nosniff");
}

function configuredFrontendOrigin(frontendUrl: string | undefined): string | null {
  if (!frontendUrl) return null;
  try {
    return new URL(frontendUrl).origin;
  } catch {
    return null;
  }
}

export function isAllowedAccountRiskOrigin(
  requestOrigin: string | undefined,
  frontendUrl: string | undefined,
): boolean {
  if (requestOrigin === undefined) return true;
  const allowedOrigin = configuredFrontendOrigin(frontendUrl);
  return allowedOrigin !== null && requestOrigin === allowedOrigin;
}

export function hasUnsupportedAccountRiskQuery(req: Request): boolean {
  return Object.keys(req.query).length > 0;
}

export function createAccountRiskRouter(
  dependencies: Partial<AccountRiskRouterDependencies> = {},
): Router {
  const deps = { ...DEFAULT_DEPENDENCIES, ...dependencies };
  const router = Router();

  // GET /api/account-risk/schwab — private, read-only, fresh provider snapshot.
  router.get("/schwab", async (req, res) => {
    setAccountRiskPrivateHeaders(res);

    const requestOrigin = req.get("Origin");
    if (!isAllowedAccountRiskOrigin(requestOrigin, deps.frontendUrl())) {
      // Global CORS may already have emitted this header. Remove it before the
      // private route rejects the browser origin.
      res.removeHeader("Access-Control-Allow-Origin");
      res
        .status(403)
        .json(
          AccountRiskSnapshotOriginErrorResponseSchema.parse({
            error: "ACCOUNT_RISK_SNAPSHOT_ORIGIN_FORBIDDEN",
          }),
        );
      return;
    }

    if (requestOrigin !== undefined) {
      res.setHeader("Access-Control-Allow-Origin", requestOrigin);
      res.setHeader("Vary", "Origin");
    } else {
      res.removeHeader("Access-Control-Allow-Origin");
    }

    if (hasUnsupportedAccountRiskQuery(req)) {
      res.status(400).json(
        AccountRiskSnapshotRequestErrorResponseSchema.parse({
          error: "INVALID_ACCOUNT_RISK_SNAPSHOT_REQUEST",
          issues: [
            {
              path: "query",
              code: "QUERY_PARAMETERS_NOT_SUPPORTED",
            },
          ],
        }),
      );
      return;
    }

    try {
      res.json(await deps.getSnapshot());
    } catch {
      deps.log("route-level unexpected failure");
      res.json(getLastResortSchwabReadOnlyAccountRiskSnapshot());
    }
  });

  return router;
}

export const accountRiskRouter = createAccountRiskRouter();
