/**
 * Minimal in-process sliding-window rate limiter (F6.1).
 *
 * Suits per-instance abuse damping on low-QPS B2B endpoints (receipt lookups):
 * serverless instances each enforce the window independently, which still caps
 * a single-connection scraper. Not a distributed quota — swap the store for
 * Redis if a hard global limit is ever required.
 */
interface Window {
  start: number;
  count: number;
}

const windows = new Map<string, Window>();
const MAX_KEYS = 10_000; // bound memory under key churn

export interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  retryAfterSeconds: number;
}

export function rateLimit(key: string, limit: number, windowMs: number, now = Date.now()): RateLimitResult {
  let w = windows.get(key);
  if (!w || now - w.start >= windowMs) {
    if (windows.size >= MAX_KEYS && !windows.has(key)) windows.clear(); // crude but bounded
    w = { start: now, count: 0 };
    windows.set(key, w);
  }
  w.count += 1;
  const allowed = w.count <= limit;
  return {
    allowed,
    remaining: Math.max(0, limit - w.count),
    retryAfterSeconds: allowed ? 0 : Math.ceil((w.start + windowMs - now) / 1000),
  };
}

/** Test hook. */
export function resetRateLimiter(): void {
  windows.clear();
}
