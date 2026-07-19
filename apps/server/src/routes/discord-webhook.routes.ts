import {
  DiscordAutomaticTradePlanAlertDeliveryRequestSchema,
  DiscordScheduledReportDeliveryRequestSchema,
  DiscordTradePlanAlertDeliveryRequestSchema,
  DiscordWebhookTestRequestSchema,
  type DiscordAutomaticTradePlanAlertDeliveryRequest,
  type DiscordAutomaticTradePlanAlertDeliveryResponse,
  type DiscordScheduledReportDeliveryRequest,
  type DiscordScheduledReportDeliveryResponse,
  type DiscordTradePlanAlertDeliveryResponse,
  type DiscordWebhookStatusResponse,
  type DiscordWebhookTestDeliveryResponse,
} from "@spy-copilot/shared";
import { Router, type Response } from "express";
import { isAllowedAccountRiskOrigin } from "./account-risk.routes";
import { runDiscordAutomaticTradePlanAlertDelivery } from "../services/discord-automatic-trade-plan-alert.service";
import { sendDiscordTradePlanAlert } from "../services/discord-trade-plan-alert.service";
import { sendDiscordScheduledReport } from "../services/discord-scheduled-report.service";
import {
  getDiscordWebhookStatus,
  sendDiscordWebhookTest,
} from "../services/discord-webhook.service";

export interface DiscordWebhookRouterDependencies {
  getStatus: () => DiscordWebhookStatusResponse;
  sendTest: () => Promise<DiscordWebhookTestDeliveryResponse>;
  sendTradePlanAlert: () => Promise<DiscordTradePlanAlertDeliveryResponse>;
  sendAutomaticTradePlanAlert: (
    request: DiscordAutomaticTradePlanAlertDeliveryRequest,
  ) => Promise<DiscordAutomaticTradePlanAlertDeliveryResponse>;
  sendScheduledReport: (
    request: DiscordScheduledReportDeliveryRequest,
  ) => Promise<DiscordScheduledReportDeliveryResponse>;
  frontendUrl: () => string | undefined;
  log: (category: string) => void;
}

const DEFAULT_DEPENDENCIES: DiscordWebhookRouterDependencies = {
  getStatus: getDiscordWebhookStatus,
  sendTest: sendDiscordWebhookTest,
  sendTradePlanAlert: sendDiscordTradePlanAlert,
  sendAutomaticTradePlanAlert: runDiscordAutomaticTradePlanAlertDelivery,
  sendScheduledReport: sendDiscordScheduledReport,
  frontendUrl: () => process.env.FRONTEND_URL,
  log: (category) => {
    // Fixed category only. Never log the webhook URL, token, payload, or provider body.
    // eslint-disable-next-line no-console
    console.error(`[discord-webhook] ${category}`);
  },
};

export function setDiscordWebhookHeaders(res: Response): void {
  res.setHeader("Cache-Control", "no-store");
  res.setHeader("Pragma", "no-cache");
  res.setHeader("Cross-Origin-Resource-Policy", "same-site");
  res.setHeader("X-Content-Type-Options", "nosniff");
}

export function createDiscordWebhookRouter(
  dependencies: Partial<DiscordWebhookRouterDependencies> = {},
): Router {
  const deps = { ...DEFAULT_DEPENDENCIES, ...dependencies };
  const router = Router();

  router.get("/status", (req, res) => {
    setDiscordWebhookHeaders(res);
    if (Object.keys(req.query).length > 0) {
      res.status(400).json({ error: "QUERY_PARAMETERS_NOT_SUPPORTED" });
      return;
    }
    res.json(deps.getStatus());
  });

  router.post("/test", async (req, res) => {
    setDiscordWebhookHeaders(res);

    const requestOrigin = req.get("Origin");
    if (!isAllowedAccountRiskOrigin(requestOrigin, deps.frontendUrl())) {
      res.removeHeader("Access-Control-Allow-Origin");
      res.status(403).json({ error: "DISCORD_WEBHOOK_ORIGIN_FORBIDDEN" });
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

    const parsedBody = DiscordWebhookTestRequestSchema.safeParse(req.body ?? {});
    if (!parsedBody.success) {
      res.status(400).json({ error: "INVALID_DISCORD_WEBHOOK_TEST_REQUEST" });
      return;
    }

    try {
      res.json(await deps.sendTest());
    } catch {
      deps.log("route-level unexpected failure");
      res.status(500).json({ error: "DISCORD_WEBHOOK_TEST_UNEXPECTED_FAILURE" });
    }
  });

  router.post("/scheduled-report", async (req, res) => {
    setDiscordWebhookHeaders(res);

    const requestOrigin = req.get("Origin");
    if (!isAllowedAccountRiskOrigin(requestOrigin, deps.frontendUrl())) {
      res.removeHeader("Access-Control-Allow-Origin");
      res.status(403).json({ error: "DISCORD_SCHEDULED_REPORT_ORIGIN_FORBIDDEN" });
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

    const parsedBody = DiscordScheduledReportDeliveryRequestSchema.safeParse(
      req.body ?? {},
    );
    if (!parsedBody.success) {
      res.status(400).json({ error: "INVALID_DISCORD_SCHEDULED_REPORT_REQUEST" });
      return;
    }

    try {
      res.json(await deps.sendScheduledReport(parsedBody.data));
    } catch {
      deps.log("scheduled report route-level unexpected failure");
      res.status(500).json({
        error: "DISCORD_SCHEDULED_REPORT_UNEXPECTED_FAILURE",
      });
    }
  });

  router.post("/trade-plan-alert/automatic", async (req, res) => {
    setDiscordWebhookHeaders(res);

    const requestOrigin = req.get("Origin");
    if (!isAllowedAccountRiskOrigin(requestOrigin, deps.frontendUrl())) {
      res.removeHeader("Access-Control-Allow-Origin");
      res.status(403).json({
        error: "DISCORD_AUTOMATIC_TRADE_PLAN_ALERT_ORIGIN_FORBIDDEN",
      });
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

    const parsedBody =
      DiscordAutomaticTradePlanAlertDeliveryRequestSchema.safeParse(
        req.body ?? {},
      );
    if (!parsedBody.success) {
      res.status(400).json({
        error: "INVALID_DISCORD_AUTOMATIC_TRADE_PLAN_ALERT_REQUEST",
      });
      return;
    }

    try {
      res.json(await deps.sendAutomaticTradePlanAlert(parsedBody.data));
    } catch {
      deps.log("automatic trade-plan alert route-level unexpected failure");
      res.status(500).json({
        error: "DISCORD_AUTOMATIC_TRADE_PLAN_ALERT_UNEXPECTED_FAILURE",
      });
    }
  });

  router.post("/trade-plan-alert", async (req, res) => {
    setDiscordWebhookHeaders(res);

    const requestOrigin = req.get("Origin");
    if (!isAllowedAccountRiskOrigin(requestOrigin, deps.frontendUrl())) {
      res.removeHeader("Access-Control-Allow-Origin");
      res.status(403).json({ error: "DISCORD_TRADE_PLAN_ALERT_ORIGIN_FORBIDDEN" });
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

    const parsedBody = DiscordTradePlanAlertDeliveryRequestSchema.safeParse(
      req.body ?? {},
    );
    if (!parsedBody.success) {
      res.status(400).json({ error: "INVALID_DISCORD_TRADE_PLAN_ALERT_REQUEST" });
      return;
    }

    try {
      res.json(await deps.sendTradePlanAlert());
    } catch {
      deps.log("trade-plan alert route-level unexpected failure");
      res.status(500).json({
        error: "DISCORD_TRADE_PLAN_ALERT_UNEXPECTED_FAILURE",
      });
    }
  });

  return router;
}

export const discordWebhookRouter = createDiscordWebhookRouter();
