import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ read: vi.fn(), limit: vi.fn(), after: vi.fn() }));
vi.mock('next/server', async importOriginal => ({ ...(await importOriginal<typeof import('next/server')>()), after: mocks.after }));
vi.mock('@/lib/server/rwa/screener', () => ({ screenerStore: { read: mocks.read } }));
vi.mock('@/lib/server/rwa/rate-limit', () => ({ rateLimit: mocks.limit }));
import { GET } from '@/app/api/rwa/screener/route';

const ok = { state: 'ok', fetchedAt: '2026-09-28T12:00:00.000Z', assets: [], pools: [], catalogSize: 0, stale: false };
const get = (query = '') => GET(new Request(`https://rwalens.example/api/rwa/screener${query}`));

beforeEach(() => { mocks.limit.mockResolvedValue({ ok: true }); mocks.read.mockResolvedValue({ response: ok }); });
afterEach(() => { vi.resetAllMocks(); });

describe('screener route', () => {
  it('lets the CDN cache a good snapshot and never caches a failure', async () => {
    const response = await get();
    expect(response.status).toBe(200);
    expect(response.headers.get('cache-control')).toBe('public, s-maxage=300, stale-while-revalidate=3600');
    expect(mocks.after).not.toHaveBeenCalled();
    mocks.read.mockResolvedValueOnce({ response: { state: 'unavailable', reason: 'down' } });
    const failed = await get();
    expect(failed.status).toBe(503);
    expect(failed.headers.get('cache-control')).toBe('no-store');
  });

  it('serves a stale snapshot and refreshes after responding', async () => {
    const refresh = vi.fn();
    mocks.read.mockResolvedValueOnce({ response: { ...ok, stale: true }, refresh });
    expect(await (await get()).json()).toMatchObject({ stale: true });
    expect(mocks.after).toHaveBeenCalledWith(refresh);
  });

  it('takes no parameters and is rate limited', async () => {
    expect((await get('?mint=anything')).status).toBe(400);
    expect(mocks.read).not.toHaveBeenCalled();
    mocks.limit.mockResolvedValueOnce({ ok: false, retryAfterSeconds: 20, source: 'local' });
    const limited = await get();
    expect(limited.status).toBe(429);
    expect(limited.headers.get('retry-after')).toBe('20');
  });
});
