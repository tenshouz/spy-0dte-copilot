import { z } from "zod";
import { getSchwabConfig } from "../config/env";
import { isDatabaseReachable } from "../lib/db-status";
import { prisma } from "../lib/prisma";
import { decrypt, encrypt } from "./crypto.service";

/**
 * Schwab OAuth only. No market-data calls happen here (PRD Section 5.1/13.3) —
 * this service exists purely to obtain and keep alive a valid access token.
 * Milestone 2 will use getValidAccessToken() to call the actual Market Data API.
 *
 * All configuration is consumed through getSchwabConfig() (config/env.ts) —
 * the single validated source of truth. No process.env reads here, no
 * localhost fallback anywhere, and the exact same validated redirect URI is
 * used for both the authorization request and the token exchange.
 */

const SCHWAB_AUTHORIZE_URL = "https://api.schwabapi.com/v1/oauth/authorize";
const SCHWAB_TOKEN_URL = "https://api.schwabapi.com/v1/oauth/token";
const TOKEN_REQUEST_TIMEOUT_MS = 15_000;
const DEFAULT_USER_EMAIL = process.env.SCHWAB_DEFAULT_USER_EMAIL ?? "trader@local";

/**
 * Runtime validation of Schwab's token endpoint response — the external body
 * is untrusted and must never be blindly cast. refresh_token is optional
 * because refresh responses may omit it; callers must preserve the stored one
 * in that case (see refreshTokens below).
 */
const SchwabTokenResponseSchema = z.object({
  access_token: z.string().min(1),
  expires_in: z.number().int().positive(),
  refresh_token: z.string().min(1).optional(),
  token_type: z.string().optional(),
  scope: z.string().optional(),
});
type SchwabTokenResponse = z.infer<typeof SchwabTokenResponseSchema>;

function requireValidConfig() {
  const config = getSchwabConfig();
  if (config.status !== "valid") {
    // Deliberately terse: reasons/state are surfaced through getConnectionStatus,
    // and route handlers gate on config before calling into token flows.
    throw new Error(`Schwab configuration is not usable (status: ${config.status}).`);
  }
  return config;
}

async function getOrCreateDefaultUser() {
  return prisma.user.upsert({
    where: { email: DEFAULT_USER_EMAIL },
    update: {},
    create: { email: DEFAULT_USER_EMAIL },
  });
}

export function buildAuthorizeUrl(state: string): string {
  const config = requireValidConfig();
  const params = new URLSearchParams({
    client_id: config.clientId,
    redirect_uri: config.redirectUri,
    response_type: "code",
    state,
  });
  return `${SCHWAB_AUTHORIZE_URL}?${params.toString()}`;
}

async function requestToken(body: URLSearchParams): Promise<SchwabTokenResponse> {
  const config = requireValidConfig();
  const basicAuth = Buffer.from(`${config.clientId}:${config.clientSecret}`).toString("base64");

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), TOKEN_REQUEST_TIMEOUT_MS);

  let res: Response;
  try {
    res = await fetch(SCHWAB_TOKEN_URL, {
      method: "POST",
      headers: {
        Authorization: `Basic ${basicAuth}`,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: body.toString(),
      signal: controller.signal,
    });
  } catch (err) {
    if ((err as Error).name === "AbortError") {
      throw new Error(`Schwab token request timed out after ${TOKEN_REQUEST_TIMEOUT_MS / 1000}s.`);
    }
    throw new Error("Schwab token request failed before receiving a response (network error).");
  } finally {
    clearTimeout(timeout);
  }

  if (!res.ok) {
    // Status only. The external response body is untrusted and is deliberately
    // NOT read into the error or any log — truncation is not reliable redaction.
    throw new Error(`Schwab token endpoint returned HTTP ${res.status}.`);
  }

  let json: unknown;
  try {
    json = await res.json();
  } catch {
    throw new Error("Schwab token endpoint returned a non-JSON body.");
  }

  const parsed = SchwabTokenResponseSchema.safeParse(json);
  if (!parsed.success) {
    const missing = parsed.error.issues.map((i) => i.path.join(".")).join(", ");
    throw new Error(`Schwab token response failed validation (problem fields: ${missing || "unknown"}).`);
  }
  return parsed.data;
}

export async function exchangeCodeForTokens(code: string) {
  const config = requireValidConfig();
  const tokens = await requestToken(
    new URLSearchParams({
      grant_type: "authorization_code",
      code,
      redirect_uri: config.redirectUri,
    }),
  );

  if (!tokens.refresh_token) {
    // An initial code exchange must include a refresh token or we cannot keep
    // the connection alive; fail clearly rather than storing a half-usable record.
    throw new Error("Schwab token response for the code exchange did not include a refresh_token.");
  }

  const user = await getOrCreateDefaultUser();
  const expiresAt = new Date(Date.now() + tokens.expires_in * 1000);

  await prisma.schwabToken.upsert({
    where: { userId: user.id },
    update: {
      accessToken: encrypt(tokens.access_token),
      refreshToken: encrypt(tokens.refresh_token),
      expiresAt,
    },
    create: {
      userId: user.id,
      accessToken: encrypt(tokens.access_token),
      refreshToken: encrypt(tokens.refresh_token),
      expiresAt,
    },
  });

  return { expiresAt };
}

export async function refreshTokens() {
  const user = await getOrCreateDefaultUser();
  const record = await prisma.schwabToken.findUnique({ where: { userId: user.id } });
  if (!record) throw new Error("No Schwab tokens on file to refresh.");

  const tokens = await requestToken(
    new URLSearchParams({
      grant_type: "refresh_token",
      refresh_token: decrypt(record.refreshToken),
    }),
  );

  const expiresAt = new Date(Date.now() + tokens.expires_in * 1000);
  await prisma.schwabToken.update({
    where: { userId: user.id },
    data: {
      accessToken: encrypt(tokens.access_token),
      // Refresh responses may omit refresh_token — keep the stored one in that
      // case; never overwrite it with undefined/empty.
      ...(tokens.refresh_token ? { refreshToken: encrypt(tokens.refresh_token) } : {}),
      expiresAt,
    },
  });

  return { expiresAt };
}

/** Returns a valid access token, refreshing first if it's expired. Not called anywhere yet — market data is still mock (see PRD Sec. 5). */
export async function getValidAccessToken(): Promise<string> {
  const user = await getOrCreateDefaultUser();
  const record = await prisma.schwabToken.findUnique({ where: { userId: user.id } });
  if (!record) throw new Error("Schwab is not connected.");

  if (record.expiresAt.getTime() <= Date.now() + 60_000) {
    // Deliberately no automatic retry loop here — one refresh attempt per
    // call; keep future retry behavior conservative and bounded.
    await refreshTokens();
    const refreshed = await prisma.schwabToken.findUniqueOrThrow({ where: { userId: user.id } });
    return decrypt(refreshed.accessToken);
  }

  return decrypt(record.accessToken);
}

export type SchwabConnectionState =
  | "database_not_configured"
  | "credentials_not_configured"
  | "config_invalid"
  | "not_connected"
  | "connected"
  | "token_expired";

export async function getConnectionStatus(): Promise<{
  state: SchwabConnectionState;
  expiresAt: string | null;
  detail: string | null;
}> {
  const dbReachable = await isDatabaseReachable();
  if (!dbReachable) {
    return { state: "database_not_configured", expiresAt: null, detail: null };
  }

  const config = getSchwabConfig();
  if (config.status === "missing") {
    return {
      state: "credentials_not_configured",
      expiresAt: null,
      detail: `Missing: ${config.missingVars.join(", ")}`,
    };
  }
  if (config.status === "invalid") {
    return { state: "config_invalid", expiresAt: null, detail: config.reason };
  }

  const user = await getOrCreateDefaultUser();
  const record = await prisma.schwabToken.findUnique({ where: { userId: user.id } });
  if (!record) {
    return { state: "not_connected", expiresAt: null, detail: null };
  }
  if (record.expiresAt.getTime() <= Date.now()) {
    return { state: "token_expired", expiresAt: record.expiresAt.toISOString(), detail: null };
  }
  return { state: "connected", expiresAt: record.expiresAt.toISOString(), detail: null };
}
