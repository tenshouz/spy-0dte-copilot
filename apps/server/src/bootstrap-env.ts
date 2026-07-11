import { existsSync, readFileSync } from "fs";
import { resolve } from "path";

/**
 * Must be the FIRST import in src/index.ts, before config/env, prisma, routes,
 * or services — those all read process.env at module-load time, so the .env
 * file has to be loaded before any of them are imported.
 *
 * Uses an absolute path (relative to this file, not process.cwd()) so it
 * works the same whether the server is started from the monorepo root
 * (`npm run dev:server`) or directly from apps/server.
 *
 * Parses .env manually (no dependency on Node's experimental
 * process.loadEnvFile or an extra npm package) — existing real environment
 * variables always win over anything in the file.
 */
const envPath = resolve(__dirname, "..", ".env");

function parseEnvFile(contents: string): Record<string, string> {
  const result: Record<string, string> = {};
  for (const rawLine of contents.split("\n")) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;

    const eqIndex = line.indexOf("=");
    if (eqIndex === -1) continue;

    const key = line.slice(0, eqIndex).trim();
    let value = line.slice(eqIndex + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    result[key] = value;
  }
  return result;
}

if (existsSync(envPath)) {
  try {
    const parsed = parseEnvFile(readFileSync(envPath, "utf8"));
    for (const [key, value] of Object.entries(parsed)) {
      if (process.env[key] === undefined) {
        process.env[key] = value;
      }
    }
  } catch (err) {
    // eslint-disable-next-line no-console
    console.warn(`[env] Found ${envPath} but failed to load it:`, (err as Error).message);
  }
} else {
  // eslint-disable-next-line no-console
  console.warn(`[env] No .env file found at ${envPath} — copy .env.example to .env if you need it.`);
}

const REQUIRED_VARS = [
  "DATABASE_URL",
  "SCHWAB_CLIENT_ID",
  "SCHWAB_CLIENT_SECRET",
  "SCHWAB_REDIRECT_URI",
  "SCHWAB_TOKEN_ENCRYPTION_KEY",
  "FRONTEND_URL",
] as const;

// Presence only — never log actual values, even in dev.
// eslint-disable-next-line no-console
console.log(
  "[env] Variable presence:",
  Object.fromEntries(REQUIRED_VARS.map((name) => [name, Boolean(process.env[name])])),
);
