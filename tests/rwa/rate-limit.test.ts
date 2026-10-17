import { createHash } from 'node:crypto';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { localCounterCount, rateLimit, resetRateLimits } from '@/lib/server/rwa/rate-limit';
const request = new Request('https://rwa.example.com/api/rwa/inspect');
const from = (ip: string) => new Request('https://rwa.example.com/api/rwa/inspect', { headers: { 'x-vercel-forwarded-for': ip } });
beforeEach(() => { resetRateLimits(); });
afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs(); vi.useRealTimers(); });
describe('rate limit storage boundaries', () => {
  it('bounds public fallback and never calls it shared protection', async () => {
    for (let i=0;i<30;i++) expect(await rateLimit(request,'inspect')).toEqual({ok:true,source:'local'});
    expect(await rateLimit(request,'inspect')).toMatchObject({ok:false,source:'local'});
  });
  it('fails closed for auth and reports without shared storage', async () => {
    expect(await rateLimit(request,'auth')).toMatchObject({ok:false,source:'unavailable'});
    expect(await rateLimit(request,'reports')).toMatchObject({ok:false,source:'unavailable'});
  });
  it('retains the independent deployment’s legacy shared public limiter', async () => {
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL','https://dedicated.supabase.co');vi.stubEnv('NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY','test-key');vi.stubEnv('RATE_LIMIT_SECRET','test-secret');
    const fetch = vi.fn(async () => Response.json([{allowed:false,remaining:0,retry_after:20}]));vi.stubGlobal('fetch',fetch);
    expect(await rateLimit(request,'inspect')).toEqual({ok:false,source:'shared',retryAfterSeconds:20});
    expect(fetch.mock.calls[0]).toBeDefined();
  });
  it('uses durable dedicated shared storage and degrades public reads only on errors', async () => {
    vi.stubEnv('RWA_SUPABASE_URL','https://dedicated.supabase.co');vi.stubEnv('RWA_SUPABASE_SERVICE_ROLE_KEY','test-key');
    vi.stubGlobal('fetch',vi.fn(async () => Response.json({allowed:true,retry_after:60})));
    expect(await rateLimit(request,'auth')).toEqual({ok:true,source:'shared'});
    vi.stubGlobal('fetch',vi.fn(async () => Response.json({},{status:503})));
    expect(await rateLimit(request,'auth')).toMatchObject({ok:false,source:'unavailable'});
    expect(await rateLimit(request,'inspect')).toMatchObject({ok:true,source:'local'});
  });
});

describe('rate limit privacy', () => {
  it('sends the shared limiter only the kind of request and a shortened hash, never the IP', async () => {
    vi.stubEnv('VERCEL', '1');
    vi.stubEnv('RWA_SUPABASE_URL', 'https://dedicated.supabase.co'); vi.stubEnv('RWA_SUPABASE_SERVICE_ROLE_KEY', 'test-key');
    const fetch = vi.fn<(url: string, init: RequestInit) => Promise<Response>>(async () => Response.json({ allowed: true, retry_after: 60 }));
    vi.stubGlobal('fetch', fetch);
    await rateLimit(from('203.0.113.7'), 'inspect');
    const [url, init] = fetch.mock.calls[0];
    expect(url).toBe('https://dedicated.supabase.co/rest/v1/rpc/rwa_consume_rate_limit');
    // The contract supabase/migrations/20261008142115_rwa_rate_limit_privacy.sql keys: at most 100 characters.
    expect(JSON.parse(String(init.body))).toEqual({ p_key: `inspect:${createHash('sha256').update('203.0.113.7').digest('hex').slice(0, 32)}`, p_limit: 30, p_window_seconds: 60 });
    expect(String(init.body)).not.toContain('203.0.113.7');
  });

  it('forgets in-memory counters once their minute has ended', async () => {
    vi.stubEnv('VERCEL', '1');
    vi.useFakeTimers({ now: new Date('2026-10-08T12:00:00Z') });
    for (const ip of ['203.0.113.1', '203.0.113.2', '203.0.113.3']) await rateLimit(from(ip), 'inspect');
    expect(localCounterCount()).toBe(3);
    vi.advanceTimersByTime(59_000);
    await rateLimit(from('203.0.113.1'), 'inspect');
    expect(localCounterCount()).toBe(3);
    vi.advanceTimersByTime(1_000);
    // The next request from anyone removes every counter whose minute is over, including on refused scopes.
    await rateLimit(from('203.0.113.9'), 'auth');
    expect(localCounterCount()).toBe(0);
  });

  it('restarts a network’s count in memory after its minute', async () => {
    vi.useFakeTimers({ now: new Date('2026-10-08T12:00:00Z') });
    for (let i = 0; i < 30; i++) await rateLimit(request, 'inspect');
    expect(await rateLimit(request, 'inspect')).toMatchObject({ ok: false, source: 'local' });
    vi.advanceTimersByTime(60_000);
    expect(await rateLimit(request, 'inspect')).toEqual({ ok: true, source: 'local' });
    expect(localCounterCount()).toBe(1);
  });
});
