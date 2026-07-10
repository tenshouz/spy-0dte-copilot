import { hasSchwabCredentials } from "../config/env";
import { isDatabaseReachable } from "../lib/db-status";
import { prisma } from "../lib/prisma";
import { decrypt, encrypt } from "./crypto.service";

/**
 * Schwab OAuth only. No market-data calls happen here (PRD Section 5.1/13.3) —
 * this service exists purely to obtain and keep alive a valid access token.
 * Milestone 2 will use getValidAccessToken() to call the actual Market Data API.
 */

const SCHWAB_AUTHORIZE_URL = "https://api.schwabapi.com/v1/oauth/authorize";
const SCHWAB_TOKEN_URL = "https://api.schwabapi.com/v1/oauth/token";
const DEFAULT_USER_EMAIL = process.env.SCHWAB_DEFAULT_USER_EMAIL ?? "trader@local";

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is not set.`);
  return value;
}

async function getOrCreateDefaultUser() {
  return prisma.user.upsert({
    where: { email: DEFAULT_USER_EMAIL },
    update: {},
    create: { email: DEFAULT_USER_EMAIL },
  });
}

export function buildAuthorizeUrl(state: string): string {
  const clientId = requireEnv("SCHWAB_CLIENT_ID");
  const redirectUri = requireEnv("SCHWAB_REDIRECT_URI");
  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    response_type: "code",
    state,
  });
  return `${SCHWAB_AUTHORIZE_URL}?${params.toString()}`;
}

interface SchwabTokenResponse {
  access_token: string;
  refresh_token: string;
  expires_in: number; // seconds
}

async function requestToken(body: URLSearchParams): Promise<SchwabTokenResponse> {
  const clientId = requireEnv("SCHWAB_CLIENT_ID");
  const clientSecret = requireEnv("SCHWAB_CLIENT_SECRET");
  const basicAuth = Buffer.from(`${clientId}:${clientSecret}`).toString("base64");

  const res = await fetch(SCHWAB_TOKEN_URL, {
    method: "POST",
    headers: {
      Authorization: `Basic ${basicAuth}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: body.toString(),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Schwab token request failed: ${res.status} ${text}`);
  }

  return res.json();
}

export async function exchangeCodeForTokens(code: string) {
  const redirectUri = requireEnv("SCHWAB_REDIRECT_URI");
  const tokens = await requestToken(
    new URLSearchParams({
      grant_type: "authorization_code",
      code,
      redirect_uri: redirectUri,
    }),
  );

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
      refreshToken: encrypt(tokens.refresh_token),
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
    await refreshTokens();
    const refreshed = await prisma.schwabToken.findUniqueOrThrow({ where: { userId: user.id } });
    return decrypt(refreshed.accessToken);
  }

  return decrypt(record.accessToken);
}

export type SchwabConnectionState =
  | "database_not_configured"
  | "credentials_not_configured"
  | "not_connected"
  | "connected"
  | "token_expired";

export async function getConnectionStatus(): Promise<{
  state: SchwabConnectionState;
  expiresAt: string | null;
}> {
  const dbReachable = await isDatabaseReachable();
  if (!dbReachable) {
    return { state: "database_not_configured", expiresAt: null };
  }

  if (!hasSchwabCredentials) {
    return { state: "credentials_not_configured", expiresAt: null };
  }

  const user = await getOrCreateDefaultUser();
  const record = await prisma.schwabToken.findUnique({ where: { userId: user.id } });
  if (!record) {
    return { state: "not_connected", expiresAt: null };
  }
  if (record.expiresAt.getTime() <= Date.now()) {
    return { state: "token_expired", expiresAt: record.expiresAt.toISOString() };
  }
  return { state: "connected", expiresAt: record.expiresAt.toISOString() };
}
