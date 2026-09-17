import 'server-only';
import { createHash } from 'node:crypto';

/**
 * Rate limiting that survives serverless.
 *
 * The in-memory window below is per-instance, which on Vercel means it is no
 * limiter at all under concurrency: forty parallel requests each land on a
 * fresh lambda with an empty map. When Supabase is configured, the count is
 * kept in Postgres via a SECURITY DEFINER function guarded by a server-held
 * secret, so it holds across every instance. Keys hash the client IP; the
 * database never stores an address.
 *
 * If the shared store is unreachable the limiter fails open to the local
 * window: this is a read-only tool, and availability beats strictness.
 */

type Bucket = { count: number; resetAt: number };

const WINDOW_SECONDS = 60;
const LIMITS: Record<string, number> = { inspect: 30, metadata: 20, reports: 30 };
const MAX_TRACKED_KEYS = 5000;
const SHARED_TIMEOUT_MS = 1500;

const buckets = new Map<string, Bucket>();

function clientKey(request: Request): string {
  const forwarded = request.headers.get('x-forwarded-for');
  const real = forwarded?.split(',')[0]?.trim() || request.headers.get('x-real-ip') || 'unknown';
  return createHash('sha256').update(real).digest('hex').slice(0, 32);
}

export type RateLimitResult = { ok: true } | { ok: false; retryAfterSeconds: number };

function sharedConfig() {
  const url = (process.env.NEXT_PUBLIC_SUPABASE_URL ?? '').trim();
  const key = (process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? '').trim();
  const secret = (process.env.RATE_LIMIT_SECRET ?? '').trim();
  return url && key && secret ? { url, key, secret } : null;
}

export function sharedLimiterConfigured(): boolean {
  return sharedConfig() !== null;
}

async function consumeShared(key: string, limit: number): Promise<RateLimitResult | null> {
  const config = sharedConfig();
  if (!config) return null;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), SHARED_TIMEOUT_MS);
  try {
    const response = await fetch(`${config.url}/rest/v1/rpc/consume_rate_limit`, {
      method: 'POST',
      signal: controller.signal,
      headers: { apikey: config.key, authorization: `Bearer ${config.key}`, 'content-type': 'application/json' },
      body: JSON.stringify({ p_secret: config.secret, p_key: key, p_limit: limit, p_window_seconds: WINDOW_SECONDS }),
    });
    if (!response.ok) return null;
    const rows = (await response.json()) as Array<{ allowed: boolean; remaining: number; retry_after: number }>;
    const row = rows[0];
    if (!row || typeof row.allowed !== 'boolean') return null;
    return row.allowed ? { ok: true } : { ok: false, retryAfterSeconds: Math.max(1, Number(row.retry_after) || WINDOW_SECONDS) };
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

function consumeLocal(key: string, limit: number): RateLimitResult {
  const now = Date.now();
  if (buckets.size > MAX_TRACKED_KEYS) buckets.clear();
  const existing = buckets.get(key);
  if (!existing || existing.resetAt <= now) {
    buckets.set(key, { count: 1, resetAt: now + WINDOW_SECONDS * 1000 });
    return { ok: true };
  }
  if (existing.count >= limit) {
    return { ok: false, retryAfterSeconds: Math.max(1, Math.ceil((existing.resetAt - now) / 1000)) };
  }
  existing.count += 1;
  return { ok: true };
}

export async function rateLimit(request: Request, scope: keyof typeof LIMITS | string): Promise<RateLimitResult> {
  const limit = LIMITS[scope] ?? 20;
  const key = `${scope}:${clientKey(request)}`;
  return (await consumeShared(key, limit)) ?? consumeLocal(key, limit);
}

/** Test-only reset so limiter state never leaks between cases. */
export function resetRateLimits(): void {
  buckets.clear();
}
