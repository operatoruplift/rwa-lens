import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { rateLimit, resetRateLimits } from '@/lib/server/rwa/rate-limit';
const request = new Request('https://rwa.example.com/api/rwa/inspect');
beforeEach(() => { resetRateLimits(); });
afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs(); });
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
