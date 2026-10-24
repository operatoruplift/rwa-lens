import bs58 from 'bs58';
import nacl from 'tweetnacl';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// The route reads and clears cookies through next/headers, which needs a request scope.
const jar = vi.hoisted(() => ({ values: new Map<string, string>(), deleted: [] as string[] }));
const limiter = vi.hoisted(() => ({ rateLimit: vi.fn() }));
vi.mock('next/headers', () => ({
  cookies: async () => ({
    get: (name: string) => (jar.values.has(name) ? { name, value: jar.values.get(name)! } : undefined),
    delete: (name: string) => { jar.deleted.push(name); jar.values.delete(name); },
  }),
}));
vi.mock('@/lib/server/rwa/rate-limit', () => limiter);
import { DELETE } from '@/app/api/rwa/account/route';
import { CHALLENGE_COOKIE, SESSION_COOKIE, createSessionToken } from '@/lib/server/rwa/session';

const ORIGIN = 'https://rwa.example.com';
const wallet = (seed: number) => bs58.encode(nacl.sign.keyPair.fromSeed(new Uint8Array(32).fill(seed)).publicKey);
const ALICE = wallet(31);
const BOB = wallet(32);
type Row = { owner_id: string; id: string };
const reports: Row[] = [];
const challenges: Array<{ nonce: string; address: string }> = [];
const storageCalls: Array<{ path: string; body: Record<string, unknown> }> = [];
const epochs = new Map<string, number>();

/** PostgREST transport: the session epoch function as the migration behaves, and rwa_delete_wallet_data with its owner filter on in-memory rows. */
function fakeStorage(status = 200) {
  vi.stubGlobal('fetch', vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
    const url = new URL(input instanceof Request ? input.url : input.toString());
    const body = JSON.parse((init?.body as string) ?? '{}') as Record<string, unknown>;
    if (status !== 200) return Response.json({ message: 'internal storage detail' }, { status });
    if (url.pathname === '/rest/v1/rpc/rwa_session_epoch') {
      const owner = body.p_owner_id as string;
      const current = epochs.get(owner) ?? 0;
      if (body.p_action === 'read') return Response.json(current);
      const next = body.p_action === 'bump' && current > 0 ? current + 1 : Math.max(current, 1);
      epochs.set(owner, next);
      return Response.json(next);
    }
    storageCalls.push({ path: url.pathname, body });
    expect(url.pathname).toBe('/rest/v1/rpc/rwa_delete_wallet_data');
    const owner = body.p_owner_id as string;
    const before = { reports: reports.length, challenges: challenges.length };
    reports.splice(0, reports.length, ...reports.filter(row => row.owner_id !== owner));
    challenges.splice(0, challenges.length, ...challenges.filter(row => row.address !== owner));
    // The deletion bumps the wallet's epoch in the same transaction.
    epochs.set(owner, (epochs.get(owner) ?? 0) + 1);
    return Response.json({ reports: before.reports - reports.length, challenges: before.challenges - challenges.length });
  }));
}
function request({ base = ORIGIN, origin = ORIGIN as string | null, query = '', body }: { base?: string; origin?: string | null; query?: string; body?: unknown } = {}) {
  return new Request(`${base}/api/rwa/account${query}`, {
    method: 'DELETE',
    headers: { ...(origin ? { origin } : {}), ...(body ? { 'content-type': 'application/json' } : {}) },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
}
const signIn = async (address: string) => { jar.values.set(SESSION_COOKIE, (await createSessionToken(address))!); jar.values.set(CHALLENGE_COOKIE, 'pending-browser-token'); };

beforeEach(() => {
  jar.values.clear(); jar.deleted.length = 0; storageCalls.length = 0; epochs.clear();
  reports.splice(0, reports.length, { owner_id: ALICE, id: 'a1' }, { owner_id: ALICE, id: 'a2' }, { owner_id: BOB, id: 'b1' });
  challenges.splice(0, challenges.length, { nonce: 'n-alice', address: ALICE }, { nonce: 'n-bob', address: BOB });
  vi.stubEnv('RWA_REPORTS_ENABLED', 'true'); vi.stubEnv('RWA_SESSION_SECRET', 's'.repeat(48));
  vi.stubEnv('RWA_APP_ORIGIN', ORIGIN); vi.stubEnv('RWA_SUPABASE_URL', 'https://rwa-dedicated.supabase.co');
  vi.stubEnv('RWA_SUPABASE_SERVICE_ROLE_KEY', 'test-service-role-key');
  limiter.rateLimit.mockResolvedValue({ ok: true, source: 'shared' });
  fakeStorage();
});
afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs(); vi.resetAllMocks(); });

describe('DELETE /api/rwa/account', () => {
  it('deletes only the signed-in wallet’s reports and challenges, then ends its session', async () => {
    await signIn(ALICE);
    // A client-supplied owner is ignored: the session alone names the wallet.
    const response = await DELETE(request({ query: `?owner=${BOB}`, body: { owner: BOB } }));
    expect(response.status).toBe(200);
    expect(response.headers.get('cache-control')).toBe('no-store');
    expect(await response.json()).toEqual({ state: 'deleted', reports: 2, challenges: 1 });
    expect(reports).toEqual([{ owner_id: BOB, id: 'b1' }]);
    expect(challenges).toEqual([{ nonce: 'n-bob', address: BOB }]);
    expect(storageCalls).toEqual([{ path: '/rest/v1/rpc/rwa_delete_wallet_data', body: { p_owner_id: ALICE } }]);
    expect(jar.deleted).toEqual(expect.arrayContaining([SESSION_COOKIE, CHALLENGE_COOKIE]));
    expect(limiter.rateLimit).toHaveBeenCalledWith(expect.any(Request), 'reports');
  });

  it('requires a signed-in wallet session', async () => {
    expect((await DELETE(request())).status).toBe(401);
    jar.values.set(SESSION_COOKIE, `${(await createSessionToken(ALICE))!.slice(0, -2)}xx`);
    expect((await DELETE(request())).status).toBe(401);
    // A session issued for another configured origin is not a session here.
    jar.values.set(SESSION_COOKIE, (await createSessionToken(ALICE))!);
    vi.stubEnv('RWA_APP_ORIGIN', 'https://other.example.com');
    expect((await DELETE(request({ base: 'https://other.example.com', origin: 'https://other.example.com' }))).status).toBe(401);
    expect(storageCalls).toHaveLength(0);
    expect(reports).toHaveLength(3);
  });

  it('refuses a missing or different origin before reading the session', async () => {
    await signIn(ALICE);
    for (const origin of [null, 'https://evil.example', 'https://rwa.example.com:444', 'http://rwa.example.com']) {
      const response = await DELETE(request({ origin }));
      expect(response.status).toBe(403);
    }
    expect(storageCalls).toHaveLength(0);
    expect(limiter.rateLimit).not.toHaveBeenCalled();
    expect(jar.deleted).toEqual([]);
    expect(reports).toHaveLength(3);
  });

  it('is rate limited, and fails closed when the shared limiter is unavailable', async () => {
    await signIn(ALICE);
    limiter.rateLimit.mockResolvedValueOnce({ ok: false, retryAfterSeconds: 12, source: 'shared' });
    const limited = await DELETE(request());
    expect(limited.status).toBe(429);
    expect(limited.headers.get('retry-after')).toBe('12');
    limiter.rateLimit.mockResolvedValueOnce({ ok: false, retryAfterSeconds: 60, source: 'unavailable' });
    expect((await DELETE(request())).status).toBe(503);
    expect(storageCalls).toHaveLength(0);
    expect(jar.deleted).toEqual([]);
  });

  it('does not exist while saved reports are switched off', async () => {
    await signIn(ALICE);
    vi.stubEnv('RWA_REPORTS_ENABLED', 'false');
    const response = await DELETE(request());
    expect(response.status).toBe(503);
    expect((await response.json()).state).toBe('feature-disabled');
    expect(limiter.rateLimit).not.toHaveBeenCalled();
    expect(storageCalls).toHaveLength(0);
  });

  it('ends every copy of the session: the cookie it just deleted no longer works, and a copy kept elsewhere does not either', async () => {
    await signIn(ALICE);
    const copy = jar.values.get(SESSION_COOKIE)!;
    expect((await DELETE(request())).status).toBe(200);
    jar.values.set(SESSION_COOKIE, copy);
    expect((await DELETE(request())).status).toBe(401);
    expect(storageCalls).toHaveLength(1);
  });

  it('keeps the session when storage fails, so the user can try again', async () => {
    await signIn(ALICE);
    fakeStorage(500);
    const response = await DELETE(request());
    expect(response.status).toBe(503);
    expect(response.headers.get('cache-control')).toBe('no-store');
    expect(JSON.stringify(await response.json())).not.toContain('internal storage detail');
    expect(jar.deleted).toEqual([]);
    expect(jar.values.has(SESSION_COOKIE)).toBe(true);
  });
});
