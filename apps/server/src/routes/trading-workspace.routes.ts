import {
  CloseTradingPositionRequestSchema,
  ConfirmTradingEntryRequestSchema,
  RecordTradingOverrideRequestSchema,
  UpsertTradingRestrictedEventRequestSchema,
} from "@spy-copilot/shared";
import { Router, type Response } from "express";
import { isAllowedAccountRiskOrigin } from "./account-risk.routes";
import {
  closeTradingPosition,
  confirmTradingEntry,
  getTradingWorkspace,
  recordManualTradingOverride,
  removeTradingRestrictedEvent,
  saveTradingRestrictedEvent,
} from "../services/trading-workspace.service";

export const tradingWorkspaceRouter = Router();

export function setTradingWorkspaceHeaders(res: Response): void {
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

function allowWriteOrigin(origin: string | undefined, res: Response): boolean {
  if (!isAllowedAccountRiskOrigin(origin, process.env.FRONTEND_URL)) {
    res.removeHeader("Access-Control-Allow-Origin");
    res.status(403).json({ error: "TRADING_WORKSPACE_ORIGIN_FORBIDDEN" });
    return false;
  }
  if (origin !== undefined) {
    res.setHeader("Access-Control-Allow-Origin", origin);
    res.setHeader("Vary", "Origin");
  }
  return true;
}

tradingWorkspaceRouter.get("/spy", async (req, res) => {
  setTradingWorkspaceHeaders(res);
  if (rejectQuery(req.query, res)) return;
  try {
    res.json(await getTradingWorkspace({ reconcile: false }));
  } catch {
    // Fixed category only; never log positions, prices, or provider payloads.
    // eslint-disable-next-line no-console
    console.error("[trading-workspace] read failure");
    res.status(503).json({ error: "TRADING_WORKSPACE_UNAVAILABLE" });
  }
});

tradingWorkspaceRouter.post("/spy/confirm-entry", async (req, res) => {
  setTradingWorkspaceHeaders(res);
  if (!allowWriteOrigin(req.get("Origin"), res)) return;
  if (rejectQuery(req.query, res)) return;
  const parsed = ConfirmTradingEntryRequestSchema.safeParse(req.body ?? {});
  if (!parsed.success) {
    res.status(400).json({ error: "INVALID_TRADING_ENTRY_CONFIRMATION_REQUEST" });
    return;
  }
  try {
    const response = await confirmTradingEntry(parsed.data);
    res.status(response.actionState === "REJECTED" ? 409 : 200).json(response);
  } catch {
    // eslint-disable-next-line no-console
    console.error("[trading-workspace] entry confirmation failure");
    res.status(500).json({ error: "TRADING_ENTRY_CONFIRMATION_FAILURE" });
  }
});

tradingWorkspaceRouter.post("/spy/positions/:positionId/close", async (req, res) => {
  setTradingWorkspaceHeaders(res);
  if (!allowWriteOrigin(req.get("Origin"), res)) return;
  if (rejectQuery(req.query, res)) return;
  const parsed = CloseTradingPositionRequestSchema.safeParse(req.body ?? {});
  if (!parsed.success || !req.params.positionId) {
    res.status(400).json({ error: "INVALID_TRADING_POSITION_CLOSE_REQUEST" });
    return;
  }
  try {
    const response = await closeTradingPosition(req.params.positionId, parsed.data);
    res.status(response.actionState === "REJECTED" ? 409 : 200).json(response);
  } catch {
    // eslint-disable-next-line no-console
    console.error("[trading-workspace] position close failure");
    res.status(500).json({ error: "TRADING_POSITION_CLOSE_FAILURE" });
  }
});

tradingWorkspaceRouter.post("/spy/override", async (req, res) => {
  setTradingWorkspaceHeaders(res);
  if (!allowWriteOrigin(req.get("Origin"), res)) return;
  if (rejectQuery(req.query, res)) return;
  const parsed = RecordTradingOverrideRequestSchema.safeParse(req.body ?? {});
  if (!parsed.success) {
    res.status(400).json({ error: "INVALID_TRADING_OVERRIDE_REQUEST" });
    return;
  }
  try {
    res.json(await recordManualTradingOverride(parsed.data));
  } catch {
    // eslint-disable-next-line no-console
    console.error("[trading-workspace] override record failure");
    res.status(500).json({ error: "TRADING_OVERRIDE_RECORD_FAILURE" });
  }
});

tradingWorkspaceRouter.post("/events", async (req, res) => {
  setTradingWorkspaceHeaders(res);
  if (!allowWriteOrigin(req.get("Origin"), res)) return;
  if (rejectQuery(req.query, res)) return;
  const parsed = UpsertTradingRestrictedEventRequestSchema.safeParse(req.body ?? {});
  if (!parsed.success) {
    res.status(400).json({ error: "INVALID_TRADING_RESTRICTED_EVENT_REQUEST" });
    return;
  }
  try {
    res.status(201).json(await saveTradingRestrictedEvent(parsed.data));
  } catch {
    // eslint-disable-next-line no-console
    console.error("[trading-workspace] restricted event create failure");
    res.status(500).json({ error: "TRADING_RESTRICTED_EVENT_WRITE_FAILURE" });
  }
});

tradingWorkspaceRouter.put("/events/:eventId", async (req, res) => {
  setTradingWorkspaceHeaders(res);
  if (!allowWriteOrigin(req.get("Origin"), res)) return;
  if (rejectQuery(req.query, res)) return;
  const parsed = UpsertTradingRestrictedEventRequestSchema.safeParse(req.body ?? {});
  if (!parsed.success || !req.params.eventId) {
    res.status(400).json({ error: "INVALID_TRADING_RESTRICTED_EVENT_REQUEST" });
    return;
  }
  try {
    res.json(await saveTradingRestrictedEvent(parsed.data, req.params.eventId));
  } catch {
    // eslint-disable-next-line no-console
    console.error("[trading-workspace] restricted event update failure");
    res.status(500).json({ error: "TRADING_RESTRICTED_EVENT_WRITE_FAILURE" });
  }
});

tradingWorkspaceRouter.delete("/events/:eventId", async (req, res) => {
  setTradingWorkspaceHeaders(res);
  if (!allowWriteOrigin(req.get("Origin"), res)) return;
  if (rejectQuery(req.query, res)) return;
  if (!req.params.eventId) {
    res.status(400).json({ error: "TRADING_RESTRICTED_EVENT_ID_REQUIRED" });
    return;
  }
  try {
    const deleted = await removeTradingRestrictedEvent(req.params.eventId);
    if (!deleted) {
      res.status(404).json({ error: "TRADING_RESTRICTED_EVENT_NOT_FOUND" });
      return;
    }
    res.status(204).end();
  } catch {
    // eslint-disable-next-line no-console
    console.error("[trading-workspace] restricted event delete failure");
    res.status(500).json({ error: "TRADING_RESTRICTED_EVENT_DELETE_FAILURE" });
  }
});
