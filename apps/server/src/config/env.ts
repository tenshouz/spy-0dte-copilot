import { z } from "zod";

/**
 * Reads and lightly validates process.env once at startup. Nothing here ever
 * throws — the server must still boot when the database or Schwab
 * credentials aren't configured yet (see lib/prisma.ts and
 * services/schwab-auth.service.ts, which use the flags below to fail
 * gracefully instead of crashing or 500-ing).
 */

const EnvShapeSchema = z.object({
  DATABASE_URL: z.string().url().optional(),
  SCHWAB_REDIRECT_URI: z.string().url().optional(),
  FRONTEND_URL: z.string().url().optional(),
  SCHWAB_CLIENT_ID: z.string().min(1).optional(),
  SCHWAB_CLIENT_SECRET: z.string().min(1).optional(),
  SCHWAB_TOKEN_ENCRYPTION_KEY: z.string().min(32, "should be a long random string (32+ chars)").optional(),
});

const parsed = EnvShapeSchema.safeParse({
  DATABASE_URL: process.env.DATABASE_URL || undefined,
  SCHWAB_REDIRECT_URI: process.env.SCHWAB_REDIRECT_URI || undefined,
  FRONTEND_URL: process.env.FRONTEND_URL || undefined,
  SCHWAB_CLIENT_ID: process.env.SCHWAB_CLIENT_ID || undefined,
  SCHWAB_CLIENT_SECRET: process.env.SCHWAB_CLIENT_SECRET || undefined,
  SCHWAB_TOKEN_ENCRYPTION_KEY: process.env.SCHWAB_TOKEN_ENCRYPTION_KEY || undefined,
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

/** True only if every Schwab OAuth env var is present. Does not mean the values are correct. */
export const hasSchwabCredentials = Boolean(
  process.env.SCHWAB_CLIENT_ID &&
    process.env.SCHWAB_CLIENT_SECRET &&
    process.env.SCHWAB_REDIRECT_URI &&
    process.env.SCHWAB_TOKEN_ENCRYPTION_KEY,
);
