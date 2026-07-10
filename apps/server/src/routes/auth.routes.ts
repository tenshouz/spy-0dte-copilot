import { randomBytes } from "crypto";
import { Router } from "express";
import { hasSchwabCredentials } from "../config/env";
import { buildAuthorizeUrl, exchangeCodeForTokens, getConnectionStatus } from "../services/schwab-auth.service";

export const authRouter = Router();

// Single-slot in-memory CSRF state — fine for a single-user dev instance;
// revisit once real multi-user auth exists (PRD Section 20.3).
let pendingState: string | null = null;

const FRONTEND_URL = process.env.FRONTEND_URL ?? "http://localhost:3000";

// GET /api/auth/schwab/login — redirects the browser to Schwab's consent screen.
authRouter.get("/schwab/login", (_req, res) => {
  if (!hasSchwabCredentials) {
    res.redirect(`${FRONTEND_URL}/settings?schwab=credentials_missing`);
    return;
  }
  try {
    pendingState = randomBytes(16).toString("hex");
    res.redirect(buildAuthorizeUrl(pendingState));
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

// GET /api/auth/schwab/callback — Schwab redirects here with ?code=&state=.
authRouter.get("/schwab/callback", async (req, res) => {
  const { code, state } = req.query;

  if (typeof code !== "string" || typeof state !== "string" || state !== pendingState) {
    res.redirect(`${FRONTEND_URL}/settings?schwab=error`);
    return;
  }
  pendingState = null;

  try {
    await exchangeCodeForTokens(code);
    res.redirect(`${FRONTEND_URL}/settings?schwab=connected`);
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error("[auth] Schwab token exchange failed:", err);
    res.redirect(`${FRONTEND_URL}/settings?schwab=error`);
  }
});

// GET /api/auth/schwab/status — always returns 200 with a definite state; the
// Settings page renders one of: database_not_configured, credentials_not_configured,
// not_connected, connected, token_expired. Never a raw 500 for expected states.
authRouter.get("/schwab/status", async (_req, res) => {
  try {
    res.json(await getConnectionStatus());
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error("[auth] Unexpected error checking Schwab status:", err);
    res.json({ state: "database_not_configured", expiresAt: null });
  }
});
