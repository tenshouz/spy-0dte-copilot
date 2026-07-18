import {
  PositionSizingRequestErrorResponseSchema,
  SpyZeroDtePositionSizingRequestSchema,
  type PositionSizingRequestErrorResponse,
  type PositionSizingRequestIssueCode,
} from "@spy-copilot/shared";
import { Router, type Response } from "express";
import type { ZodIssue } from "zod";
import {
  getLastResortSpyZeroDtePositionSizing,
  getSpyZeroDtePositionSizing,
} from "../services/trade-sizing.service";

export const tradeSizingRouter = Router();

function setPrivateNoStoreHeaders(res: Response): void {
  res.setHeader("Cache-Control", "no-store");
  res.setHeader("Pragma", "no-cache");
}

function issuePath(issue: ZodIssue, unrecognizedKey?: string): string {
  const parts = [...issue.path.map(String)];
  if (unrecognizedKey) parts.push(unrecognizedKey);
  return parts.length > 0 ? parts.join(".") : "$";
}

function issueCode(issue: ZodIssue): PositionSizingRequestIssueCode {
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
    return path === "accountSnapshot.accountEquityDollars"
      ? "MUST_BE_POSITIVE"
      : "MUST_BE_NONNEGATIVE";
  }
  return path === "riskPolicy.maximumContracts"
    ? "MUST_BE_SAFE_INTEGER"
    : "INVALID_TYPE";
}

export function positionSizingRequestError(
  issues: ZodIssue[],
): PositionSizingRequestErrorResponse {
  const sanitized = issues.flatMap((issue) => {
    if (issue.code === "unrecognized_keys") {
      return issue.keys.map((key) => ({
        path: issuePath(issue, key),
        code: "UNRECOGNIZED_KEY" as const,
      }));
    }
    return [{ path: issuePath(issue), code: issueCode(issue) }];
  });
  return PositionSizingRequestErrorResponseSchema.parse({
    error: "INVALID_POSITION_SIZING_REQUEST",
    issues: sanitized,
  });
}

// POST /api/trade-sizing/spy — stateless caller-supplied risk-policy sizing only.
tradeSizingRouter.post("/spy", async (req, res) => {
  setPrivateNoStoreHeaders(res);
  const parsed = SpyZeroDtePositionSizingRequestSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json(positionSizingRequestError(parsed.error.issues));
    return;
  }

  try {
    res.json(await getSpyZeroDtePositionSizing(parsed.data));
  } catch {
    // Deliberately excludes request/account values.
    // eslint-disable-next-line no-console
    console.error("[trade-sizing] route-level unexpected failure");
    res.json(getLastResortSpyZeroDtePositionSizing(parsed.data));
  }
});
