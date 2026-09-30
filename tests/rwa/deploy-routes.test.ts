import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ build: vi.fn(), limit: vi.fn(), chain: vi.fn(), status: vi.fn(), selectedPool: vi.fn() }));
vi.mock('@/lib/server/rwa/deploy/build', () => ({ buildDeploy: mocks.build }));
vi.mock('@/lib/server/rwa/deploy/chain', () => ({ createDeployChain: mocks.chain }));
vi.mock('@/lib/server/rwa/deploy/status', () => ({ readDeployStatus: mocks.status }));
vi.mock('@/lib/server/rwa/rate-limit', () => ({ rateLimit: mocks.limit }));
vi.mock('@/lib/server/rwa/deploy/venue', () => ({ readSelectedPool: mocks.selectedPool }));
import { POST } from '@/app/api/rwa/deploy/route';
import { GET } from '@/app/api/rwa/deploy/status/route';

const ORIGIN = 'https://rwalens.example';
const valid = { mint: 'A1KLoBrKBde8Ty9qtNQUtq3C2ortoC3u7twggz7sEto6', pool: '4dLtt8WQEjkZCiRrNJA5XRqqDBsoymdBxN54dz7pbDie', owner: 'H8sMJSCQxfKiFTCfDR3DUMLPwcRbM61LGFJ8N4dK3WjS', amount: '10', slippageBps: 100 };
const post = (body: unknown, origin: string | null = ORIGIN) => POST(new Request(`${ORIGIN}/api/rwa/deploy`, { method: 'POST', headers: { 'content-type': 'application/json', ...(origin ? { origin } : {}) }, body: JSON.stringify(body) }));
const SIGNATURE = '5'.repeat(88);
const status = (query: string) => GET(new Request(`${ORIGIN}/api/rwa/deploy/status?${query}`));

beforeEach(() => {
  vi.stubEnv('RWA_DEPLOY_ENABLED', 'true'); vi.stubEnv('RWA_CLUSTER', 'mainnet-beta'); vi.stubEnv('RWA_APP_ORIGIN', '');
  mocks.limit.mockResolvedValue({ ok: true }); mocks.chain.mockReturnValue({});
  mocks.build.mockResolvedValue({ state: 'refused', code: 'insufficient-usdc', message: 'This wallet holds 0 USDC.' });
  mocks.status.mockResolvedValue({ state: 'pending' });
});
afterEach(() => { vi.resetAllMocks(); vi.unstubAllEnvs(); });

describe('deploy routes', () => {
  it('do not exist while the operator flag is off, or off mainnet', async () => {
    for (const [flag, cluster] of [['false', 'mainnet-beta'], ['true', 'devnet']]) {
      vi.stubEnv('RWA_DEPLOY_ENABLED', flag); vi.stubEnv('RWA_CLUSTER', cluster);
      expect((await post(valid)).status).toBe(404);
      expect((await status(`signature=${SIGNATURE}&lastValidBlockHeight=5`)).status).toBe(404);
    }
    expect(mocks.build).not.toHaveBeenCalled();
    expect(mocks.limit).not.toHaveBeenCalled();
  });

  it('accept only this site’s browser requests with a strict body', async () => {
    expect((await post(valid, 'https://evil.example')).status).toBe(403);
    expect((await post(valid, null)).status).toBe(403);
    for (const body of [{ ...valid, rpcUrl: 'https://evil.example' }, { ...valid, slippageBps: 75 }, { ...valid, amount: '1e3' }, { ...valid, owner: 'nope' }]) expect((await post(body)).status).toBe(400);
    expect(mocks.build).not.toHaveBeenCalled();
    vi.stubEnv('RWA_APP_ORIGIN', 'https://rwalens.dev');
    expect((await post(valid)).status).toBe(403);
    expect((await post(valid, 'https://rwalens.dev')).status).not.toBe(403);
  });

  it('maps builder outcomes to status codes and never caches them', async () => {
    const response = await post(valid);
    expect(response.status).toBe(422);
    expect(response.headers.get('cache-control')).toBe('no-store');
    expect(mocks.build).toHaveBeenCalledWith(valid, expect.objectContaining({ priorityMicroLamports: 100_000n }));
    mocks.build.mockResolvedValueOnce({ state: 'unavailable', message: 'Jupiter could not be reached.' });
    expect((await post(valid)).status).toBe(503);
    mocks.chain.mockImplementationOnce(() => { throw new Error('not configured'); });
    expect((await post(valid)).status).toBe(503);
    mocks.build.mockRejectedValueOnce(new TypeError('secret internal detail'));
    const failed = await post(valid);
    expect(failed.status).toBe(503);
    expect(failed.headers.get('cache-control')).toBe('no-store');
    expect(JSON.stringify(await failed.json())).not.toContain('secret internal detail');
    mocks.limit.mockResolvedValueOnce({ ok: false, retryAfterSeconds: 30, source: 'local' });
    const limited = await post(valid);
    expect(limited.status).toBe(429);
    expect(limited.headers.get('retry-after')).toBe('30');
  });

  it('validates the requested pool independently of the inspector list', async () => {
    const listing = { state: 'ok', pools: [{ address: valid.pool }] };
    mocks.selectedPool.mockResolvedValueOnce(listing);
    mocks.build.mockImplementationOnce(async (request, deps) => {
      expect(await deps.venues(request.mint)).toBe(listing);
      return { state: 'refused', code: 'insufficient-usdc', message: 'This wallet holds 0 USDC.' };
    });
    expect((await post(valid)).status).toBe(422);
    expect(mocks.selectedPool).toHaveBeenCalledExactlyOnceWith(valid.mint, valid.pool);
  });

  it('checks confirmation for a well-formed signature only', async () => {
    mocks.status.mockResolvedValueOnce({ state: 'confirmed', slot: '9' });
    const response = await status(`signature=${SIGNATURE}&lastValidBlockHeight=429423818`);
    expect(await response.json()).toEqual({ state: 'confirmed', slot: '9' });
    expect(mocks.status).toHaveBeenCalledWith({}, SIGNATURE, 429_423_818n);
    for (const query of ['signature=short&lastValidBlockHeight=5', `signature=${SIGNATURE}`, `signature=${SIGNATURE}&lastValidBlockHeight=-1`, `signature=${SIGNATURE}&lastValidBlockHeight=5&cluster=devnet`]) {
      expect((await status(query)).status).toBe(400);
    }
  });
});
