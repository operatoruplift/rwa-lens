import 'server-only';

/**
 * Small in-process fixed-window limiter.
 *
 * Deliberately not a distributed limiter: this protects a single instance from
 * a hot loop and from casual abuse of the RPC budget. It is not a security
 * boundary, and it is documented as such in docs/rwa-limitations.md.
 */

type Bucket = { count: number; resetAt: number };

const WINDOW_MS = 60_000;
const LIMITS: Record<string, number> = { inspect: 30, metadata: 20, reports: 30 };
const MAX_TRACKED_KEYS = 5000;

const buckets = new Map<string, Bucket>();

function clientKey(request: Request): string {
  const forwarded = request.headers.get('x-forwarded-for');
  const real = forwarded?.split(',')[0]?.trim() || request.headers.get('x-real-ip') || 'unknown';
  return real.slice(0, 64);
}

export type RateLimitResult = { ok: true } | { ok: false; retryAfterSeconds: number };

export function rateLimit(request: Request, scope: keyof typeof LIMITS | string): RateLimitResult {
  const limit = LIMITS[scope] ?? 20;
  const key = `${scope}:${clientKey(request)}`;
  const now = Date.now();

  // Bounded memory: drop the whole map rather than grow without limit.
  if (buckets.size > MAX_TRACKED_KEYS) buckets.clear();

  const existing = buckets.get(key);
  if (!existing || existing.resetAt <= now) {
    buckets.set(key, { count: 1, resetAt: now + WINDOW_MS });
    return { ok: true };
  }
  if (existing.count >= limit) {
    return { ok: false, retryAfterSeconds: Math.max(1, Math.ceil((existing.resetAt - now) / 1000)) };
  }
  existing.count += 1;
  return { ok: true };
}

/** Test-only reset so limiter state never leaks between cases. */
export function resetRateLimits(): void {
  buckets.clear();
}
