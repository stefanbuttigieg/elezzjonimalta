// Lightweight in-memory rate limiter for public API endpoints.
//
// LIMITATIONS (read before relying on this):
// - Counters are per server instance. With N instances the effective cap is
//   roughly limit * N requests per window.
// - Counters reset whenever the instance restarts.
// - No distributed coordination, no persistence.
//
// This is intentionally a stopgap to protect against accidental hammering.
// A proper gateway- or Redis-backed limiter should replace it before we rely
// on it for abuse prevention.

type Bucket = { count: number; resetAt: number };

const buckets = new Map<string, Bucket>();

// Periodically prune expired buckets so the map can't grow forever.
const PRUNE_EVERY = 1000;
let opsSincePrune = 0;

function prune(now: number) {
  for (const [key, bucket] of buckets) {
    if (bucket.resetAt <= now) buckets.delete(key);
  }
}

export type RateLimitResult = {
  allowed: boolean;
  limit: number;
  remaining: number;
  resetAt: number; // epoch ms
};

export function checkRateLimit(
  key: string,
  options: { limit: number; windowMs: number }
): RateLimitResult {
  const now = Date.now();
  opsSincePrune += 1;
  if (opsSincePrune >= PRUNE_EVERY) {
    opsSincePrune = 0;
    prune(now);
  }

  const existing = buckets.get(key);
  if (!existing || existing.resetAt <= now) {
    const fresh: Bucket = { count: 1, resetAt: now + options.windowMs };
    buckets.set(key, fresh);
    return {
      allowed: true,
      limit: options.limit,
      remaining: options.limit - 1,
      resetAt: fresh.resetAt,
    };
  }

  if (existing.count >= options.limit) {
    return {
      allowed: false,
      limit: options.limit,
      remaining: 0,
      resetAt: existing.resetAt,
    };
  }

  existing.count += 1;
  return {
    allowed: true,
    limit: options.limit,
    remaining: options.limit - existing.count,
    resetAt: existing.resetAt,
  };
}

/**
 * Best-effort client identifier for rate limiting. Falls back to a constant
 * if no header is present (everyone shares the same bucket — still better
 * than nothing).
 */
export function clientKeyFromRequest(request: Request, prefix: string): string {
  const fwd =
    request.headers.get("cf-connecting-ip") ||
    request.headers.get("x-real-ip") ||
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    "unknown";
  return `${prefix}:${fwd}`;
}

export function rateLimitHeaders(result: RateLimitResult): Record<string, string> {
  const headers: Record<string, string> = {
    "X-RateLimit-Limit": String(result.limit),
    "X-RateLimit-Remaining": String(result.remaining),
    "X-RateLimit-Reset": String(Math.ceil(result.resetAt / 1000)),
  };
  if (!result.allowed) {
    const retryAfter = Math.max(1, Math.ceil((result.resetAt - Date.now()) / 1000));
    headers["Retry-After"] = String(retryAfter);
  }
  return headers;
}
