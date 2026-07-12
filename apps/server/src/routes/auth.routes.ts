import { randomBytes } from "crypto";
import { Router } from "express";
import { getSchwabConfig } from "../config/env";
import { buildAuthorizeUrl, exchangeCodeForTokens, getConnectionStatus } from "../services/schwab-auth.service";

export const authRouter = Router();

/**
 * In-memory OAuth CSRF state store.
 *
 * LIMITATION (deliberate, documented): this is for the current single-user
 * local-development milestone only. States do not survive a backend restart —
 * if the server restarts mid-OAuth, the user simply clicks Connect again.
 * A cookie-based binding is intentionally NOT used because the flow starts on
 * localhost but returns through an HTTPS tunnel hostname, so a state cookie
 * set on one origin would not be sent on the callback. Revisit alongside real
 * multi-user auth (PRD Section 20.3).
 *
 * Properties: multiple outstanding states, cryptographically random values,
 * short TTL, single use, bounded size, and values are never logged.
 */
const STATE_TTL_MS = 10 * 60 * 1000; // 10 minutes
const MAX_PENDING_STATES = 20;
const pendingStates = new Map<string, number>(); // state -> expiry epoch ms

function pruneStates(): void {
  const now = Date.now();
  for (const [state, expiresAt] of pendingStates) {
    if (expiresAt <= now) pendingStates.delete(state);
  }
  // Bound growth: drop oldest entries if something is spamming /login.
  while (pendingStates.size >= MAX_PENDING_STATES) {
    const oldest = pendingStates.keys().next().value;
    if (oldest === undefined) break;
    pendingStates.delete(oldest);
  }
}

function issueState(): string {
  pruneStates();
  const state = randomBytes(32).toString("hex");
  pendingStates.set(state, Date.now() + STATE_TTL_MS);
  return state;
}

/** Consumes a state exactly once. Returns false for missing, unknown, reused, or expired states. */
function consumeState(state: unknown): boolean {
  if (typeof state !== "string" || state.length === 0) return false;
  const expiresAt = pendingStates.get(state);
  pendingStates.delete(state); // single-use regardless of outcome
  if (expiresAt === undefined) return false;
  return expiresAt > Date.now();
}

const FRONTEND_URL = process.env.FRONTEND_URL ?? "http://localhost:3000";

// GET /api/auth/schwab/login — redirects the browser to Schwab's consent
// screen, or back to Settings with a reason when configuration is missing or
// invalid. Never renders a raw JSON error page and never sends an
// authorization request to Schwab on bad configuration.
authRouter.get("/schwab/login", (_req, res) => {
  const config = getSchwabConfig();
  if (config.status === "missing") {
    res.redirect(`${FRONTEND_URL}/settings?schwab=credentials_missing`);
    return;
  }
  if (config.status === "invalid") {
    res.redirect(`${FRONTEND_URL}/settings?schwab=config_invalid`);
    return;
  }
  try {
    res.redirect(buildAuthorizeUrl(issueState()));
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error("[auth] Failed to start Schwab authorization:", (err as Error).message);
    res.redirect(`${FRONTEND_URL}/settings?schwab=error`);
  }
});

// GET /api/auth/schwab/callback — Schwab redirects here with ?code=&state=.
authRouter.get("/schwab/callback", async (req, res) => {
  const { code, state } = req.query;

  if (typeof code !== "string" || !consumeState(state)) {
    res.redirect(`${FRONTEND_URL}/settings?schwab=error`);
    return;
  }

  try {
    await exchangeCodeForTokens(code);
    res.redirect(`${FRONTEND_URL}/settings?schwab=connected`);
  } catch (err) {
    // Message is already sanitized by the service layer (status + short
    // fragment only); tokens/codes/secrets never appear in it.
    // eslint-disable-next-line no-console
    console.error("[auth] Schwab token exchange failed:", (err as Error).message);
    res.redirect(`${FRONTEND_URL}/settings?schwab=error`);
  }
});

// GET /api/auth/schwab/status — always returns 200 with a definite state; the
// Settings page renders one of: database_not_configured,
// credentials_not_configured, config_invalid, not_connected, connected,
// token_expired. Never a raw 500 for expected states.
authRouter.get("/schwab/status", async (_req, res) => {
  try {
    res.json(await getConnectionStatus());
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error("[auth] Unexpected error checking Schwab status:", (err as Error).message);
    res.json({ state: "database_not_configured", expiresAt: null, detail: null });
  }
});
