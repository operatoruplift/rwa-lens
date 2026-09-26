import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { MetadataOutcome } from '@/lib/server/rwa/metadata-fetch';

const mocks = vi.hoisted(() => ({ fetchMetadata: vi.fn(), limit: vi.fn() }));
vi.mock('@/lib/server/rwa/metadata-fetch', () => ({ fetchMetadata: mocks.fetchMetadata }));
vi.mock('@/lib/server/rwa/rate-limit', () => ({ rateLimit: mocks.limit }));
import { POST } from '@/app/api/rwa/metadata/route';

const MINT = 'A1KLoBrKBde8Ty9qtNQUtq3C2ortoC3u7twggz7sEto6';
const body = (over: Record<string, unknown> = {}) => ({ mint: MINT, uri: 'https://metadata.example.com/token.json', ...over });
const request = (payload: unknown, origin?: string) =>
  new Request('https://rwalens.example/api/rwa/metadata', { method: 'POST', headers: { 'content-type': 'application/json', ...(origin ? { origin } : {}) }, body: JSON.stringify(payload) });

beforeEach(() => { mocks.limit.mockResolvedValue({ ok: true }); });
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

  it.each([
    ['a non-https URI', body({ uri: 'ipfs://issuer-document' })],
    ['a private host', body({ uri: 'https://169.254.169.254/latest/meta-data/' })],
    ['a malformed mint', body({ mint: 'not-a-mint' })],
  ])('still rejects %s as a bad request', async (_label, payload) => {
    const response = await POST(request(payload));
    expect(response.status).toBe(400);
    expect(mocks.fetchMetadata).not.toHaveBeenCalled();
  });

  it('rejects cross-origin and paced requests without reading metadata', async () => {
    expect((await POST(request(body(), 'https://evil.example'))).status).toBe(403);
    mocks.limit.mockResolvedValue({ ok: false, retryAfterSeconds: 30 });
    expect((await POST(request(body()))).status).toBe(429);
    expect(mocks.fetchMetadata).not.toHaveBeenCalled();
  });
});
