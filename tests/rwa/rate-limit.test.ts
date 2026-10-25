import { createHash } from 'node:crypto';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { clientNetwork, localCounterCount, rateLimit, resetRateLimits, upstreamBudget } from '@/lib/server/rwa/rate-limit';
const sha256 = (value: string) => createHash('sha256').update(value).digest('hex');
function sharedStorage(reply: unknown = { allowed: true, retry_after: 60 }) {
  vi.stubEnv('RWA_SUPABASE_URL', 'https://dedicated.supabase.co'); vi.stubEnv('RWA_SUPABASE_SERVICE_ROLE_KEY', 'test-key');
  const fetch = vi.fn<(url: string, init: RequestInit) => Promise<Response>>(async () => Response.json(reply));
  vi.stubGlobal('fetch', fetch);
  return { fetch, keys: () => fetch.mock.calls.map(([, init]) => JSON.parse(String(init.body)).p_key as string) };
}
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

describe('client networks', () => {
  it('names an IPv6 client by its /64 prefix and an IPv4 client by its whole address', () => {
    expect(clientNetwork('2001:db8:1:2:aaaa:bbbb:cccc:dddd')).toBe('2001:0db8:0001:0002::/64');
    expect(clientNetwork('2001:DB8:1:2::1')).toBe('2001:0db8:0001:0002::/64');
    expect(clientNetwork('2001:db8:1:3::1')).toBe('2001:0db8:0001:0003::/64');
    expect(clientNetwork('::1')).toBe('0000:0000:0000:0000::/64');
    expect(clientNetwork('64:ff9b::203.0.113.7')).toBe('0064:ff9b:0000:0000::/64');
    expect(clientNetwork('::ffff:203.0.113.7')).toBe('203.0.113.7');
    expect(clientNetwork('203.0.113.7')).toBe('203.0.113.7');
    expect(clientNetwork('shared-unknown-client')).toBe('shared-unknown-client');
  });

  it('sends the shared limiter one key for every address in a /64, and separate keys for IPv4 neighbours', async () => {
    vi.stubEnv('VERCEL', '1');
    const storage = sharedStorage();
    for (const ip of ['2001:db8:1:2:aaaa::1', '2001:db8:1:2:bbbb::2', '2001:db8:1:3::1', '203.0.113.7', '203.0.113.8']) await rateLimit(from(ip), 'inspect');
    const [sameA, sameB, otherPrefix, v4A, v4B] = storage.keys();
    expect(sameA).toBe(sameB);
    expect(sameA).toBe(`inspect:${sha256('2001:0db8:0001:0002::/64').slice(0, 32)}`);
    expect(otherPrefix).not.toBe(sameA);
    expect(v4A).not.toBe(v4B);
    for (const key of storage.keys()) expect(key).not.toMatch(/2001|203\.0\.113/);
  });

  it('counts a whole /64 together in memory', async () => {
    vi.stubEnv('VERCEL', '1');
    for (let i = 0; i < 30; i++) expect((await rateLimit(from(`2001:db8:1:2::${i.toString(16)}`), 'inspect')).ok).toBe(true);
    expect(await rateLimit(from('2001:db8:1:2:ffff::1'), 'inspect')).toMatchObject({ ok: false, source: 'local' });
    expect((await rateLimit(from('2001:db8:1:3::1'), 'inspect')).ok).toBe(true);
    expect(localCounterCount()).toBe(2);
  });
});

describe('per-upstream ceiling', () => {
  it('counts every instance and every client in one fixed shared key per upstream', async () => {
    const storage = sharedStorage();
    expect(await upstreamBudget('rpc')).toEqual({ ok: true, source: 'shared' });
    expect(await upstreamBudget('meteora')).toEqual({ ok: true, source: 'shared' });
    expect(storage.fetch.mock.calls.map(([, init]) => JSON.parse(String(init.body)))).toEqual([
      { p_key: 'upstream:rpc', p_limit: 300, p_window_seconds: 60 },
      { p_key: 'upstream:meteora', p_limit: 120, p_window_seconds: 60 },
    ]);
    sharedStorage({ allowed: false, retry_after: 20 });
    expect(await upstreamBudget('rpc')).toEqual({ ok: false, retryAfterSeconds: 20, source: 'shared' });
  });

  it('bounds each instance on its own when the shared counter is unavailable', async () => {
    for (let i = 0; i < 120; i++) expect((await upstreamBudget('meteora')).ok).toBe(true);
    expect(await upstreamBudget('meteora')).toMatchObject({ ok: false, source: 'local' });
    expect((await upstreamBudget('rpc')).ok).toBe(true);
  });

  it('takes an operator override only within the limiter’s bounds', async () => {
    vi.stubEnv('RWA_UPSTREAM_RPC_PER_MINUTE', '2');
    vi.stubEnv('RWA_UPSTREAM_METEORA_PER_MINUTE', '5000');
    expect((await upstreamBudget('rpc')).ok).toBe(true);
    expect((await upstreamBudget('rpc')).ok).toBe(true);
    expect((await upstreamBudget('rpc')).ok).toBe(false);
    const storage = sharedStorage();
    await upstreamBudget('meteora');
    expect(JSON.parse(String(storage.fetch.mock.calls[0][1].body))).toMatchObject({ p_key: 'upstream:meteora', p_limit: 120 });
  });
});
