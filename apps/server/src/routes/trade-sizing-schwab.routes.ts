import {
  SchwabAssistedPositionSizingOriginErrorResponseSchema,
  SchwabAssistedPositionSizingRequestErrorResponseSchema,
  SpyZeroDteSchwabAssistedPositionSizingRequestSchema,
  type SchwabAssistedPositionSizingRequestErrorResponse,
  type SchwabAssistedPositionSizingRequestIssueCode,
  type SpyZeroDteSchwabAssistedPositionSizingRequest,
  type SpyZeroDteSchwabAssistedPositionSizingResponse,
} from "@spy-copilot/shared";
import { Router, type Request, type Response } from "express";
import type { ZodIssue } from "zod";
import {
  isAllowedAccountRiskOrigin,
  setAccountRiskPrivateHeaders,
} from "./account-risk.routes";
import {
  getLastResortSchwabAssistedPositionSizing,
  getSpyZeroDteSchwabAssistedPositionSizing,
} from "../services/trade-sizing-schwab.service";

export interface SchwabAssistedTradeSizingRouterDependencies {
  getSizing: (
    request: SpyZeroDteSchwabAssistedPositionSizingRequest,
  ) => Promise<SpyZeroDteSchwabAssistedPositionSizingResponse>;
  frontendUrl: () => string | undefined;
  log: (category: string) => void;
}

const DEFAULT_DEPENDENCIES: SchwabAssistedTradeSizingRouterDependencies = {
  getSizing: getSpyZeroDteSchwabAssistedPositionSizing,
  frontendUrl: () => process.env.FRONTEND_URL,
  log: (category) => {
    // Fixed category only. Never include Origin, request values, balances,
    // account identifiers, tokens, or provider response data.
    // eslint-disable-next-line no-console
    console.error(`[trade-sizing-schwab] ${category}`);
  },
};

function issuePath(issue: ZodIssue, unrecognizedKey?: string): string {
  const parts = [...issue.path.map(String)];
  if (unrecognizedKey) parts.push(unrecognizedKey);
  return parts.length > 0 ? parts.join(".") : "$";
}

function issueCode(issue: ZodIssue): SchwabAssistedPositionSizingRequestIssueCode {
  const path = issue.path.map(String).join(".");
  if (issue.code === "unrecognized_keys") return "UNRECOGNIZED_KEY";
  if (issue.code === "not_finite") return "NOT_FINITE";
  if (issue.code === "invalid_type") {
    if (issue.received === "undefined") return "REQUIRED";
    if (path === "riskPolicy.maximumContracts" && issue.received === "float") {
      return "MUST_BE_SAFE_INTEGER";
    }
    return "INVALID_TYPE";
  }
  if (issue.code === "too_big" && path === "riskPolicy.maximumContracts") {
    return "MUST_BE_SAFE_INTEGER";
  }
  if (issue.code === "too_small") {
    return path === "callerRiskInputs.accountEquityDollars"
      ? "MUST_BE_POSITIVE"
      : "MUST_BE_NONNEGATIVE";
  }
  return path === "riskPolicy.maximumContracts"
    ? "MUST_BE_SAFE_INTEGER"
    : "INVALID_TYPE";
}

export function schwabAssistedPositionSizingRequestError(
  issues: ZodIssue[],
): SchwabAssistedPositionSizingRequestErrorResponse {
  const sanitized = issues.flatMap((issue) => {
    if (issue.code === "unrecognized_keys") {
      return issue.keys.map((key) => ({
        path: issuePath(issue, key),
        code: "UNRECOGNIZED_KEY" as const,
      }));
    }
    return [{ path: issuePath(issue), code: issueCode(issue) }];
  });
  return SchwabAssistedPositionSizingRequestErrorResponseSchema.parse({
    error: "INVALID_SCHWAB_ASSISTED_POSITION_SIZING_REQUEST",
    issues: sanitized,
  });
}

export function hasUnsupportedSchwabAssistedSizingQuery(req: Request): boolean {
  return Object.keys(req.query).length > 0;
}

export function createSchwabAssistedTradeSizingRouter(
  dependencies: Partial<SchwabAssistedTradeSizingRouterDependencies> = {},
): Router {
  const deps = { ...DEFAULT_DEPENDENCIES, ...dependencies };
  const router = Router();

  // POST /api/trade-sizing/spy/schwab — mixed-source, read-only sizing. Schwab
  // supplies available cash; the caller supplies equity and explicit budgets.
  router.post("/spy/schwab", async (req, res) => {
    setAccountRiskPrivateHeaders(res);

    const requestOrigin = req.get("Origin");
    if (!isAllowedAccountRiskOrigin(requestOrigin, deps.frontendUrl())) {
      res.removeHeader("Access-Control-Allow-Origin");
      res.status(403).json(
        SchwabAssistedPositionSizingOriginErrorResponseSchema.parse({
          error: "SCHWAB_ASSISTED_POSITION_SIZING_ORIGIN_FORBIDDEN",
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

    if (hasUnsupportedSchwabAssistedSizingQuery(req)) {
      res.status(400).json(
        SchwabAssistedPositionSizingRequestErrorResponseSchema.parse({
          error: "INVALID_SCHWAB_ASSISTED_POSITION_SIZING_REQUEST",
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

    const parsed = SpyZeroDteSchwabAssistedPositionSizingRequestSchema.safeParse(
      req.body,
    );
    if (!parsed.success) {
      res.status(400).json(
        schwabAssistedPositionSizingRequestError(parsed.error.issues),
      );
      return;
    }

    try {
      res.json(await deps.getSizing(parsed.data));
    } catch {
      deps.log("route-level unexpected failure");
      res.json(getLastResortSchwabAssistedPositionSizing(parsed.data));
    }
  });

  return router;
}

export const schwabAssistedTradeSizingRouter =
  createSchwabAssistedTradeSizingRouter();
