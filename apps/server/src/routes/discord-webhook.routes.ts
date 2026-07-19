import {
  DiscordWebhookTestRequestSchema,
  type DiscordWebhookStatusResponse,
  type DiscordWebhookTestDeliveryResponse,
} from "@spy-copilot/shared";
import { Router, type Response } from "express";
import { isAllowedAccountRiskOrigin } from "./account-risk.routes";
import {
  getDiscordWebhookStatus,
  sendDiscordWebhookTest,
} from "../services/discord-webhook.service";

export interface DiscordWebhookRouterDependencies {
  getStatus: () => DiscordWebhookStatusResponse;
  sendTest: () => Promise<DiscordWebhookTestDeliveryResponse>;
  frontendUrl: () => string | undefined;
  log: (category: string) => void;
}

const DEFAULT_DEPENDENCIES: DiscordWebhookRouterDependencies = {
  getStatus: getDiscordWebhookStatus,
  sendTest: sendDiscordWebhookTest,
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

  return router;
}

export const discordWebhookRouter = createDiscordWebhookRouter();
