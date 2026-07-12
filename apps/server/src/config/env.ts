import { z } from "zod";

/**
 * Reads and lightly validates process.env once at startup. Nothing here ever
 * throws — the server must still boot when the database or Schwab
 * configuration is missing or invalid (see lib/prisma.ts and
 * services/schwab-auth.service.ts, which use the results below to fail
 * gracefully instead of crashing or 500-ing).
 *
 * IMPORTANT: this module must only be imported AFTER src/bootstrap-env.ts has
 * run (it is the first import in src/index.ts), because it reads process.env
 * at module-load time.
 */

const EnvShapeSchema = z.object({
  DATABASE_URL: z.string().url().optional(),
  FRONTEND_URL: z.string().url().optional(),
});

const parsed = EnvShapeSchema.safeParse({
  DATABASE_URL: process.env.DATABASE_URL || undefined,
  FRONTEND_URL: process.env.FRONTEND_URL || undefined,
});

if (!parsed.success) {
  // eslint-disable-next-line no-console
  console.warn(
    "[env] Some environment variables are set but look malformed:",
    parsed.error.flatten().fieldErrors,
  );
}

/** True only if DATABASE_URL is present and looks like a URL. Actual reachability is checked separately (lib/db-status.ts). */
export const hasDatabaseUrl = Boolean(process.env.DATABASE_URL && process.env.DATABASE_URL.trim().length > 0);

// ---------------------------------------------------------------------------
// Schwab configuration — one authoritative validation path.
// ---------------------------------------------------------------------------

export const SCHWAB_CALLBACK_PATH = "/api/auth/schwab/callback";

export type SchwabConfig =
  | { status: "missing"; missingVars: string[] }
  | { status: "invalid"; reason: string }
  | {
      status: "valid";
      clientId: string;
      clientSecret: string;
      redirectUri: string;
      tokenEncryptionKey: string;
    };

/**
 * Validates SCHWAB_REDIRECT_URI strictly. Error reasons are safe to log and
 * to surface to the (local, single-user) frontend: they describe WHAT is
 * wrong without echoing the full configured value.
 */
function validateRedirectUri(raw: string): { ok: true; value: string } | { ok: false; reason: string } {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return { ok: false, reason: "SCHWAB_REDIRECT_URI is not a parseable URL." };
  }
  if (url.protocol !== "https:") {
    return {
      ok: false,
      reason: "SCHWAB_REDIRECT_URI must use https:// — Schwab rejects http:// callback URLs.",
    };
  }
  if (url.username || url.password) {
    return { ok: false, reason: "SCHWAB_REDIRECT_URI must not embed a username or password." };
  }
  if (url.hash) {
    return { ok: false, reason: "SCHWAB_REDIRECT_URI must not contain a #fragment." };
  }
  if (url.search) {
    return { ok: false, reason: "SCHWAB_REDIRECT_URI must not contain query parameters." };
  }
  if (url.pathname !== SCHWAB_CALLBACK_PATH) {
    return {
      ok: false,
      reason: `SCHWAB_REDIRECT_URI path must be exactly ${SCHWAB_CALLBACK_PATH}.`,
    };
  }
  // Return the raw string, NOT url.toString() — never silently normalize the
  // value that was registered with Schwab.
  return { ok: true, value: raw };
}

/**
 * The single source of truth for Schwab OAuth configuration. Everything in
 * the OAuth implementation must consume this instead of reading process.env
 * directly, so authorization and token exchange always use the exact same
 * validated redirect URI and there is no localhost fallback anywhere.
 */
export function getSchwabConfig(): SchwabConfig {
  const clientId = process.env.SCHWAB_CLIENT_ID?.trim() || "";
  const clientSecret = process.env.SCHWAB_CLIENT_SECRET?.trim() || "";
  // Read the ORIGINAL string — never trimmed, never normalized. The exact
  // value registered with Schwab must be used verbatim or the flow fails.
  const redirectUriRaw = process.env.SCHWAB_REDIRECT_URI ?? "";
  const tokenEncryptionKey = process.env.SCHWAB_TOKEN_ENCRYPTION_KEY || "";

  const missingVars: string[] = [];
  if (!clientId) missingVars.push("SCHWAB_CLIENT_ID");
  if (!clientSecret) missingVars.push("SCHWAB_CLIENT_SECRET");
  if (redirectUriRaw === "") missingVars.push("SCHWAB_REDIRECT_URI");
  if (!tokenEncryptionKey) missingVars.push("SCHWAB_TOKEN_ENCRYPTION_KEY");
  if (missingVars.length > 0) {
    return { status: "missing", missingVars };
  }

  // Leading/trailing whitespace is INVALID, not silently trimmed — a padded
  // value would not byte-match what was registered with Schwab.
  if (redirectUriRaw !== redirectUriRaw.trim()) {
    return {
      status: "invalid",
      reason: "SCHWAB_REDIRECT_URI has leading or trailing whitespace — remove it; the value must byte-match the URI registered with Schwab.",
    };
  }

  const redirect = validateRedirectUri(redirectUriRaw);
  if (!redirect.ok) {
    return { status: "invalid", reason: redirect.reason };
  }

  if (tokenEncryptionKey.length < 32) {
    return {
      status: "invalid",
      reason: "SCHWAB_TOKEN_ENCRYPTION_KEY must be at least 32 characters (generate a long random string).",
    };
  }

  return {
    status: "valid",
    clientId,
    clientSecret,
    redirectUri: redirect.value,
    tokenEncryptionKey,
  };
}
