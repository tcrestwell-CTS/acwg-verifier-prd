import { NextRequest, NextResponse } from "next/server";

// NOTE: This is a per-instance in-memory limiter.
// On Vercel serverless each cold start gets a fresh instance,
// so this only throttles within a single function invocation lifetime.
// For production cross-instance rate limiting, swap the store for
// Upstash Redis: https://upstash.com (free tier works well with Vercel).

interface RateLimitEntry {
  count: number;
  resetAt: number;
}

const store = new Map<string, RateLimitEntry>();

setInterval(() => {
  const now = Date.now();
  Array.from(store.entries()).forEach(([key, entry]) => {
    if (entry.resetAt < now) store.delete(key);
  });
}, 5 * 60 * 1000).unref(); // .unref() prevents keeping the process alive

interface RateLimitConfig {
  windowMs: number;
  maxRequests: number;
}

export function rateLimit(config: RateLimitConfig) {
  return function check(req: NextRequest): NextResponse | null {
    const ip =
      req.headers.get("x-forwarded-for")?.split(",")[0].trim() ??
      req.headers.get("x-real-ip") ??
      "unknown";

    const key = `${req.nextUrl.pathname}:${ip}`;
    const now = Date.now();
    const entry = store.get(key);

    if (!entry || entry.resetAt < now) {
      store.set(key, { count: 1, resetAt: now + config.windowMs });
      return null;
    }

    entry.count += 1;

    if (entry.count > config.maxRequests) {
      const retryAfter = Math.ceil((entry.resetAt - now) / 1000);
      return NextResponse.json(
        { error: "Too many requests", retryAfterSeconds: retryAfter },
        {
          status: 429,
          headers: {
            "Retry-After": String(retryAfter),
            "X-RateLimit-Limit": String(config.maxRequests),
            "X-RateLimit-Remaining": "0",
          },
        }
      );
    }

    return null;
  };
}

export const verifyLimiter = rateLimit({ windowMs: 60_000, maxRequests: 20 });
export const decisionLimiter = rateLimit({ windowMs: 60_000, maxRequests: 30 });
export const aiLimiter = rateLimit({ windowMs: 60_000, maxRequests: 10 });
