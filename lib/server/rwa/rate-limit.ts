import 'server-only';
import { createHash } from 'node:crypto';
import { z } from 'zod';
import { databaseConfig } from './session';

type Bucket = { count: number; resetAt: number };
const WINDOW_SECONDS = 60;
const LIMITS: Record<string, number> = { inspect: 30, fixture: 120, metadata: 20, reports: 30, auth: 10 };
const MAX_TRACKED_KEYS = 5000;
const buckets = new Map<string, Bucket>();

export type RateLimitResult = { ok: true; source: 'shared' | 'local' } | { ok: false; retryAfterSeconds: number; source: 'shared' | 'local' | 'unavailable' };
function sharedConfig() {
  const dedicated = databaseConfig();
  if (dedicated) return { ...dedicated, legacySecret: null };
  const url = (process.env.NEXT_PUBLIC_SUPABASE_URL ?? '').trim();
  const key = (process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? '').trim();
  const legacySecret = (process.env.RATE_LIMIT_SECRET ?? '').trim();
  return url && key && legacySecret ? { url, key, legacySecret } : null;
}
export function sharedLimiterConfigured(): boolean { return sharedConfig() !== null; }

function clientKey(request: Request): string {
  // Vercel overwrites this platform-specific header. Outside Vercel an operator
  // proxy must strip/overwrite forwarded headers; otherwise use one common bucket.
  const forwarded = process.env.VERCEL ? request.headers.get('x-vercel-forwarded-for') : null;
  const identity = forwarded?.split(',')[0]?.trim() || 'shared-unknown-client';
  return createHash('sha256').update(identity).digest('hex').slice(0, 32);
}

async function consumeShared(key: string, limit: number): Promise<RateLimitResult | null> {
  const config = sharedConfig();
  if (!config) return null;
  try {
    const response = await fetch(`${config.url}/rest/v1/rpc/${config.legacySecret ? 'consume_rate_limit' : 'rwa_consume_rate_limit'}`, {
      method: 'POST', signal: AbortSignal.timeout(1500), cache: 'no-store',
      headers: { apikey: config.key, authorization: `Bearer ${config.key}`, 'content-type': 'application/json' },
      body: JSON.stringify({ p_key: key, p_limit: limit, p_window_seconds: WINDOW_SECONDS, ...(config.legacySecret ? { p_secret: config.legacySecret } : {}) }),
    });
    if (!response.ok) return null;
    const body: unknown = await response.json();
    const row = config.legacySecret && Array.isArray(body) ? body[0] : body;
    const parsed = z.object({ allowed: z.boolean(), retry_after: z.number().int().nonnegative().max(WINDOW_SECONDS) }).safeParse(row);
    if (!parsed.success) return null;
    return parsed.data.allowed ? { ok: true, source: 'shared' } : { ok: false, retryAfterSeconds: Math.max(1, parsed.data.retry_after), source: 'shared' };
  } catch { return null; }
}

function consumeLocal(key: string, limit: number): RateLimitResult {
  const now = Date.now();
  if (buckets.size >= MAX_TRACKED_KEYS && !buckets.has(key)) {
    for (const [id, bucket] of buckets) if (bucket.resetAt <= now) buckets.delete(id);
    if (buckets.size >= MAX_TRACKED_KEYS) return { ok: false, retryAfterSeconds: WINDOW_SECONDS, source: 'local' };
  }
  const existing = buckets.get(key);
  if (!existing || existing.resetAt <= now) {
    buckets.set(key, { count: 1, resetAt: now + WINDOW_SECONDS * 1000 });
    return { ok: true, source: 'local' };
  }
  if (existing.count >= limit) return { ok: false, retryAfterSeconds: Math.max(1, Math.ceil((existing.resetAt - now) / 1000)), source: 'local' };
  existing.count += 1;
  return { ok: true, source: 'local' };
}

export async function rateLimit(request: Request, scope: string): Promise<RateLimitResult> {
  const limit = LIMITS[scope] ?? 20;
  const key = `${scope}:${clientKey(request)}`;
  const shared = await consumeShared(key, limit);
  if (shared) return shared;
  // Authentication/persistence fail closed. Public reads retain a bounded local
  // fallback for availability; it is not a cross-instance security guarantee.
  if (scope === 'auth' || scope === 'reports') return { ok: false, retryAfterSeconds: WINDOW_SECONDS, source: 'unavailable' };
  return consumeLocal(key, limit);
}
export function resetRateLimits(): void { buckets.clear(); }
