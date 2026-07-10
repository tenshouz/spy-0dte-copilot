import { PrismaClient } from "@prisma/client";
import { hasDatabaseUrl } from "../config/env";

// Prisma reads DATABASE_URL when the client is constructed and throws
// immediately if it's missing entirely — which would crash the whole server
// on boot. If it's not configured, point at an obviously-fake URL so
// construction succeeds; real queries will still fail cleanly and are only
// ever attempted after checking isDatabaseReachable() (see lib/db-status.ts).
if (!hasDatabaseUrl) {
  process.env.DATABASE_URL = "postgresql://not-configured:not-configured@localhost:5432/not_configured";
}

// Singleton so tsx watch / hot-reload doesn't open a new connection pool per reload.
declare global {
  // eslint-disable-next-line no-var
  var __prisma: PrismaClient | undefined;
}

export const prisma = globalThis.__prisma ?? new PrismaClient();
if (process.env.NODE_ENV !== "production") {
  globalThis.__prisma = prisma;
}
