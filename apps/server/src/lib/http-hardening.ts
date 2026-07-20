import { randomUUID } from "crypto";
import type { CorsOptions } from "cors";
import type { NextFunction, Request, Response } from "express";

const DEFAULT_WRITE_LIMIT = 120;
const DEFAULT_WINDOW_MS = 60_000;

interface RateWindow {
  count: number;
  resetAt: number;
}

function normalizedOrigin(value: string): string | null {
  try {
    const url = new URL(value);
    if (!['http:', 'https:'].includes(url.protocol)) return null;
    if (url.username || url.password || url.search || url.hash) return null;
    return url.origin;
  } catch {
    return null;
  }
}

export function buildAllowedFrontendOrigins(
  frontendUrl: string | undefined,
  nodeEnv = process.env.NODE_ENV,
): ReadonlySet<string> {
  const origins = new Set<string>();
  const configured = frontendUrl ? normalizedOrigin(frontendUrl) : null;
  if (configured) origins.add(configured);

  if (nodeEnv !== "production") {
    origins.add("http://localhost:3000");
    origins.add("http://127.0.0.1:3000");
  }

  return origins;
}


export function isAllowedWriteOrigin(
  requestOrigin: string | undefined,
  frontendUrl: string | undefined,
  nodeEnv = process.env.NODE_ENV,
): boolean {
  if (requestOrigin === undefined) return true;
  return buildAllowedFrontendOrigins(frontendUrl, nodeEnv).has(requestOrigin);
}

export function buildCorsOptions(
  frontendUrl: string | undefined,
  nodeEnv = process.env.NODE_ENV,
): CorsOptions {
  const allowedOrigins = buildAllowedFrontendOrigins(frontendUrl, nodeEnv);
  return {
    origin(origin, callback) {
      if (origin === undefined || allowedOrigins.has(origin)) {
        callback(null, true);
        return;
      }
      callback(null, false);
    },
    credentials: false,
    methods: ["GET", "POST", "PATCH", "OPTIONS"],
    allowedHeaders: ["Content-Type"],
    maxAge: 600,
  };
}

export function applyGlobalSecurityHeaders(
  _req: Request,
  res: Response,
  next: NextFunction,
): void {
  res.setHeader("Cache-Control", "no-store");
  res.setHeader("Pragma", "no-cache");
  res.setHeader("Cross-Origin-Resource-Policy", "same-site");
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("X-Frame-Options", "DENY");
  res.setHeader("Referrer-Policy", "no-referrer");
  res.setHeader(
    "Permissions-Policy",
    "camera=(), microphone=(), geolocation=(), payment=(), usb=()",
  );
  res.setHeader(
    "Content-Security-Policy",
    "default-src 'none'; frame-ancestors 'none'; base-uri 'none'; form-action 'none'",
  );
  next();
}

export function attachRequestContext(
  _req: Request,
  res: Response,
  next: NextFunction,
): void {
  const requestId = randomUUID();
  res.locals.requestId = requestId;
  res.setHeader("X-Request-Id", requestId);
  next();
}

export function getRequestId(res: Response): string {
  const value = res.locals.requestId;
  return typeof value === "string" && value.length > 0 ? value : "unavailable";
}

export function createWriteRateLimiter(args: {
  limit?: number;
  windowMs?: number;
  now?: () => number;
} = {}) {
  const limit = args.limit ?? DEFAULT_WRITE_LIMIT;
  const windowMs = args.windowMs ?? DEFAULT_WINDOW_MS;
  const now = args.now ?? Date.now;
  const windows = new Map<string, RateWindow>();
  let lastSweepAt = 0;

  return (req: Request, res: Response, next: NextFunction): void => {
    if (!req.path.startsWith("/api/") || !["POST", "PATCH", "PUT", "DELETE"].includes(req.method)) {
      next();
      return;
    }

    const timestamp = now();
    if (timestamp - lastSweepAt >= windowMs) {
      lastSweepAt = timestamp;
      for (const [key, value] of windows) {
        if (value.resetAt <= timestamp) windows.delete(key);
      }
    }

    const key = req.ip || req.socket.remoteAddress || "local";
    const existing = windows.get(key);
    const current =
      existing && existing.resetAt > timestamp
        ? existing
        : { count: 0, resetAt: timestamp + windowMs };

    current.count += 1;
    windows.set(key, current);

    res.setHeader("X-RateLimit-Limit", String(limit));
    res.setHeader("X-RateLimit-Remaining", String(Math.max(0, limit - current.count)));
    res.setHeader("X-RateLimit-Reset", String(Math.ceil(current.resetAt / 1000)));

    if (current.count > limit) {
      res.setHeader("Retry-After", String(Math.max(1, Math.ceil((current.resetAt - timestamp) / 1000))));
      res.status(429).json({
        error: "WRITE_RATE_LIMIT_EXCEEDED",
        requestId: getRequestId(res),
      });
      return;
    }

    next();
  };
}
