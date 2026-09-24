import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { getFixture } from '@/lib/rwa/fixtures';
import { inspectResultSchema } from '@/lib/rwa/schema';
import { RpcError } from '@/lib/server/rwa/rpc';
const mocks = vi.hoisted(() => ({ inspect: vi.fn(), limit: vi.fn() }));
vi.mock('@/lib/server/rwa/inspect', () => ({ inspectRequest: mocks.inspect }));
vi.mock('@/lib/server/rwa/rate-limit', () => ({ rateLimit: mocks.limit }));
import { POST } from '@/app/api/rwa/inspect/route';
const request = (body: unknown, origin?: string) => new Request('https://rwalens.example/api/rwa/inspect', { method: 'POST', headers: { 'content-type': 'application/json', ...(origin ? { origin } : {}) }, body: JSON.stringify(body) });
const live = { mode: 'live', cluster: 'mainnet-beta', mint: 'A1KLoBrKBde8Ty9qtNQUtq3C2ortoC3u7twggz7sEto6' };
beforeEach(() => { vi.stubEnv('RWA_FIXTURES_ENABLED', 'false'); vi.stubEnv('RWA_CLUSTER', 'mainnet-beta'); mocks.limit.mockResolvedValue({ ok: true }); mocks.inspect.mockResolvedValue(getFixture('treasury-scaled')!.result); });
afterEach(() => { vi.resetAllMocks(); vi.unstubAllEnvs(); });
describe('inspection API contract', () => {
  it.each([['mainnet-beta', 'preview', 'true'], ['devnet', 'production', 'true'], ['devnet', 'preview', 'false']])('rejects fixtures on %s / %s when flag is %s', async (cluster, environment, enabled) => {
    vi.stubEnv('RWA_CLUSTER', cluster); vi.stubEnv('VERCEL_ENV', environment); vi.stubEnv('RWA_FIXTURES_ENABLED', enabled);
    const response = await POST(request({ mode: 'fixture', fixtureId: 'treasury-scaled', scenario: 'at' }));
    expect(response.status).toBe(403);
    expect(mocks.inspect).not.toHaveBeenCalled();
    expect(mocks.limit).not.toHaveBeenCalled();
  });
  it('serves an explicitly enabled offline fixture through its separate lightweight limit', async () => {
    vi.stubEnv('RWA_FIXTURES_ENABLED', 'true'); vi.stubEnv('RWA_CLUSTER', 'devnet'); vi.stubEnv('VERCEL_ENV', 'preview');
    const response = await POST(request({ mode: 'fixture', fixtureId: 'treasury-scaled', scenario: 'at' }));
    expect(response.status).toBe(200); expect(inspectResultSchema.safeParse(await response.json()).success).toBe(true);
    expect(mocks.limit.mock.calls[0][1]).toBe('fixture');
  });
  it('rejects a synthetic fixture with overridden identity and arbitrary RPC URL', async () => {
    for (const body of [{ mode: 'fixture', fixtureId: 'treasury-scaled', mint: live.mint }, { ...live, rpcUrl: 'https://evil.example' }]) expect((await POST(request(body))).status).toBe(400);
    expect(mocks.inspect).not.toHaveBeenCalled();
  });
  it('rejects cross-origin browser requests', async () => {
    expect((await POST(request(live, 'https://evil.example'))).status).toBe(403);
    expect(mocks.inspect).not.toHaveBeenCalled();
  });
  it('migrates deployed live-only calls without relaxing validation', async () => {
    const legacy = { cluster: live.cluster, mint: live.mint };
    await POST(request(legacy)); expect(mocks.inspect).toHaveBeenCalledWith(live);
  });
  it.each([
    ['timeout', 503], ['not-configured', 503], ['provider-failure', 502], ['not-found', 404], ['not-a-mint', 422], ['decoder-failure', 422], ['response-too-large', 503], ['rate-limited', 429],
  ] as const)('classifies %s as HTTP %d', async (kind, status) => {
    mocks.inspect.mockRejectedValue(new RpcError(kind, 'A safe failure message.'));
    const response = await POST(request(live)); expect(response.status).toBe(status);
    expect(await response.json()).toMatchObject({ kind, message: 'A safe failure message.' });
  });
  it('redacts unexpected exceptions', async () => {
    mocks.inspect.mockRejectedValue(new Error('private-api-key=secret'));
    const response = await POST(request(live)); expect(response.status).toBe(502);
    expect(await response.text()).not.toMatch(/private-api-key|secret|stack/);
  });
  it('bounds request body bytes', async () => {
    expect((await POST(request({ ...live, extra: 'x'.repeat(5000) }))).status).toBe(400);
    expect(mocks.inspect).not.toHaveBeenCalled();
  });
});
