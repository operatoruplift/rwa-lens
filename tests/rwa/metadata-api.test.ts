import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { getFixture } from '@/lib/rwa/fixtures';
import type { MetadataOutcome } from '@/lib/server/rwa/metadata-fetch';
import { RpcError } from '@/lib/server/rwa/rpc';

const mocks = vi.hoisted(() => ({ fetchMetadata: vi.fn(), limit: vi.fn(), inspect: vi.fn() }));
vi.mock('@/lib/server/rwa/metadata-fetch', () => ({ fetchMetadata: mocks.fetchMetadata }));
vi.mock('@/lib/server/rwa/rate-limit', () => ({ rateLimit: mocks.limit }));
vi.mock('@/lib/server/rwa/inspect', () => ({ inspectRequest: mocks.inspect }));
import { POST } from '@/app/api/rwa/metadata/route';

const MINT = 'A1KLoBrKBde8Ty9qtNQUtq3C2ortoC3u7twggz7sEto6';
const DECLARED = 'https://metadata.example.com/token.json';
const body = (over: Record<string, unknown> = {}) => ({ mint: MINT, cluster: 'mainnet-beta', ...over });
const request = (payload: unknown, origin?: string) =>
  new Request('https://rwalens.example/api/rwa/metadata', { method: 'POST', headers: { 'content-type': 'application/json', ...(origin ? { origin } : {}) }, body: JSON.stringify(payload) });
/** What the inspection path returns for the mint: an observation whose identity declares one URI, or none. */
function observation(uri?: string) {
  const base = getFixture('treasury-scaled')!.result;
  return { ...base, identity: { ...base.identity!, mint: MINT, metadata: { name: 'Fixture', symbol: 'FIX', uriFetch: 'skipped' as const, ...(uri ? { uri } : {}) } } };
}

beforeEach(() => { mocks.limit.mockResolvedValue({ ok: true }); mocks.inspect.mockResolvedValue(observation(DECLARED)); });
afterEach(() => { vi.resetAllMocks(); });

describe('metadata API status contract', () => {
  it.each([
    ['ok', { state: 'ok', body: { name: 'Fixture Fund' }, fetchedAt: '2026-09-26T00:00:00.000Z', bytes: 24 }],
    ['skipped', { state: 'skipped', reason: 'No URI was requested.' }],
    ['not-configured', { state: 'not-configured', reason: 'No metadata host is allowlisted.' }],
    ['blocked', { state: 'blocked', reason: 'The metadata URI is not permitted by the HTTPS host policy.' }],
  ] as const)('answers a %s determination with HTTP 200', async (state, outcome) => {
    mocks.fetchMetadata.mockResolvedValue(outcome as MetadataOutcome);
    const response = await POST(request(body()));
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ state });
  });

  it('reports an upstream read failure as 502', async () => {
    mocks.fetchMetadata.mockResolvedValue({ state: 'failed', reason: 'The metadata host could not be reached.' } satisfies MetadataOutcome);
    expect((await POST(request(body()))).status).toBe(502);
  });
});

describe('the URI comes from the mint, never from the caller', () => {
  it('reads the mint through the inspection path and fetches only the URI it declares', async () => {
    mocks.fetchMetadata.mockResolvedValue({ state: 'ok', body: {}, fetchedAt: '2026-09-26T00:00:00.000Z', bytes: 2 } satisfies MetadataOutcome);
    expect((await POST(request(body()))).status).toBe(200);
    expect(mocks.inspect).toHaveBeenCalledWith({ mode: 'live', cluster: 'mainnet-beta', mint: MINT });
    expect(mocks.fetchMetadata).toHaveBeenCalledTimes(1);
    expect(mocks.fetchMetadata).toHaveBeenCalledWith(DECLARED);
  });

  it('rejects a caller-supplied URI outright', async () => {
    const response = await POST(request(body({ uri: 'https://attacker.example/collect.json' })));
    expect(response.status).toBe(400);
    expect(mocks.inspect).not.toHaveBeenCalled();
    expect(mocks.fetchMetadata).not.toHaveBeenCalled();
  });

  it('says so when the mint declares no URI, and fetches nothing', async () => {
    mocks.inspect.mockResolvedValue(observation());
    const response = await POST(request(body()));
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ state: 'skipped', reason: 'This mint declares no metadata URI.' });
    expect(mocks.fetchMetadata).not.toHaveBeenCalled();
  });

  it.each([['not-found', 404], ['not-a-mint', 422], ['rate-limited', 429], ['provider-failure', 502], ['timeout', 503]] as const)('answers an inspection that fails with %s as HTTP %d, without a fetch', async (kind, status) => {
    mocks.inspect.mockRejectedValue(new RpcError(kind, 'A safe failure message.'));
    const response = await POST(request(body()));
    expect(response.status).toBe(status);
    expect(await response.json()).toEqual({ state: 'failed', reason: 'A safe failure message.' });
    expect(mocks.fetchMetadata).not.toHaveBeenCalled();
  });

  it('redacts an unexpected inspection error', async () => {
    mocks.inspect.mockRejectedValue(new Error('private-api-key=secret'));
    const response = await POST(request(body()));
    expect(response.status).toBe(502);
    expect(await response.text()).not.toMatch(/private-api-key|secret/);
  });

  it.each([
    ['a malformed mint', body({ mint: 'not-a-mint' })],
    ['a missing cluster', { mint: MINT }],
    ['an unknown cluster', body({ cluster: 'testnet' })],
  ])('still rejects %s as a bad request', async (_label, payload) => {
    const response = await POST(request(payload));
    expect(response.status).toBe(400);
    expect(mocks.inspect).not.toHaveBeenCalled();
    expect(mocks.fetchMetadata).not.toHaveBeenCalled();
  });

  it('rejects cross-origin and paced requests before reading anything', async () => {
    expect((await POST(request(body(), 'https://evil.example'))).status).toBe(403);
    mocks.limit.mockResolvedValue({ ok: false, retryAfterSeconds: 30 });
    expect((await POST(request(body()))).status).toBe(429);
    expect(mocks.inspect).not.toHaveBeenCalled();
    expect(mocks.fetchMetadata).not.toHaveBeenCalled();
  });
});
