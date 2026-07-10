import { hasDatabaseUrl } from "../config/env";
import { prisma } from "./prisma";

/** Cheap connectivity probe — used to fail gracefully instead of throwing a raw Prisma error. */
export async function isDatabaseReachable(): Promise<boolean> {
  if (!hasDatabaseUrl) return false;
  try {
    await prisma.$queryRaw`SELECT 1`;
    return true;
  } catch {
    return false;
  }
}
