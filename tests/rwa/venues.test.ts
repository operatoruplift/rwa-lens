import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { formatPct, formatUsd, MAX_LISTED_POOLS, MIN_LISTED_TVL_USD, normalizeVenues, venuesResponseSchema, venuesUpstreamUrl } from '@/lib/rwa/venues';
import { createVenueReader } from '@/lib/server/rwa/venues';
import type { MetadataOutcome } from '@/lib/server/rwa/metadata-fetch';

const mocks = vi.hoisted(() => ({ readVenues: vi.fn(), limit: vi.fn() }));
vi.mock('@/lib/server/rwa/rate-limit', () => ({ rateLimit: mocks.limit }));

const USDY = 'A1KLoBrKBde8Ty9qtNQUtq3C2ortoC3u7twggz7sEto6';
const USDC = 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v';
const SOL = 'So11111111111111111111111111111111111111112';
const OTHER = 'DezXAZ8z7PnrnRJjz3wXBoRgixCa6xjnB7YaB1pPB263';
const AT = '2026-09-28T12:00:00.000Z';
const token = (address: string, symbol: string, verified = true) => ({ address, symbol, decimals: 6, is_verified: verified, name: symbol });
const pool = (over: Record<string, unknown> = {}) => ({
  address: '4dLtt8WQEjkZCiRrNJA5XRqqDBsoymdBxN54dz7pbDie', name: 'USDY-USDC', token_x: token(USDY, 'USDY'), token_y: token(USDC, 'USDC'),
  tvl: 1742.86, apy: 2.818, current_price: 1.1449, volume: { '24h': 717.92 }, fees: { '24h': 0.1327 }, fee_tvl_ratio: { '24h': 0.0076 },
  pool_config: { bin_step: 1, base_fee_pct: 0.01 }, dynamic_fee_pct: 0, is_blacklisted: false, has_farm: false, farm_apy: 0, ...over,
});

describe('Meteora venue normalization', () => {
  it('builds a fixed upstream URL from the mint alone', () => {
    const url = new URL(venuesUpstreamUrl(USDY));
    expect(url.origin).toBe('https://dlmm.datapi.meteora.ag');
    expect(url.pathname).toBe('/pools');
    expect(Object.fromEntries(url.searchParams)).toEqual({ query: USDY, order_by: 'tvl', sort: 'desc', page_size: '20' });
  });

  it('keeps only exact-mint, non-blacklisted pools above the TVL floor, ordered by TVL, from either side of the pair', () => {
    const rows = [
      pool({ address: 'BDpP98gnA9cVN4ATYh6F76nDHw4hXxDpzSt7ZiGUxxLQ', name: 'SOL-USDY', token_x: token(SOL, 'SOL'), token_y: token(USDY, 'USDY'), tvl: 250, apy: 12.5, has_farm: true, farm_apy: 3.2 }),
      pool(),
      pool({ address: '3yC4Mft2k1R3MRozfhqjMaxPEQc1oZPr8DmtQ9ej87MM', name: 'USDY-SCAM', tvl: 90_000, is_blacklisted: true }),
      pool({ address: '6AjcDUEhMbyyacB6iYGjzB8abzwmTdMYCmLgyvK41X7n', name: 'USDY-LOOKALIKE', token_x: token(OTHER, 'USDY', false), tvl: 50_000 }),
      pool({ address: '7NAkYNHu4pNaD8XitcJ1tqt7jvzi7zsDyVAWMt2JtrTq', tvl: 0.0004 }),
      { address: 'not a pool' },
      pool({ address: 'GuBQaPTV9Cu5KzKfHkVLSh3bXc1z3BShXefQG7e2V5R3', tvl: Number.NaN }),
    ];
    const result = normalizeVenues(USDY, rows, AT);
    expect(result).toMatchObject({ state: 'ok', mint: USDY, matched: 3, belowFloor: 1, fetchedAt: AT });
    if (result.state !== 'ok') throw new Error('expected pools');
    expect(result.pools.map(item => item.pair)).toEqual(['USDY-USDC', 'SOL-USDY']);
    expect(result.pools[0]).toEqual({
      address: '4dLtt8WQEjkZCiRrNJA5XRqqDBsoymdBxN54dz7pbDie', pair: 'USDY-USDC', counterSymbol: 'USDC', counterMint: USDC, counterVerified: true,
      tvlUsd: 1742.86, volume24hUsd: 717.92, fees24hUsd: 0.1327, feeTvl24hPct: 0.0076, feeApyPct: 2.818, farmApyPct: null,
      binStep: 1, baseFeePct: 0.01, meteoraUrl: 'https://app.meteora.ag/dlmm/4dLtt8WQEjkZCiRrNJA5XRqqDBsoymdBxN54dz7pbDie',
    });
    expect(result.pools[1]).toMatchObject({ counterSymbol: 'SOL', counterMint: SOL, farmApyPct: 3.2 });
    expect(venuesResponseSchema.parse(result)).toEqual(result);
  });

  it('reports none when every matching pool is below the floor, and caps the listed pools', () => {
    expect(normalizeVenues(USDY, [pool({ tvl: MIN_LISTED_TVL_USD - 1 })], AT)).toEqual({ state: 'none', mint: USDY, source: 'Meteora DLMM data API', fetchedAt: AT, matched: 1, belowFloor: 1 });
    expect(normalizeVenues(USDY, [], AT)).toMatchObject({ state: 'none', matched: 0 });
    const many = Array.from({ length: 9 }, (_, index) => pool({ address: `${'4dLtt8WQEjkZCiRrNJA5XRqqDBsoymdBxN54dz7pbDi'}${String.fromCharCode(97 + index)}${index}`, tvl: 1000 + index }));
    const capped = normalizeVenues(USDY, many, AT);
    expect(capped.state === 'ok' && capped.pools).toHaveLength(MAX_LISTED_POOLS);
    expect(capped.state === 'ok' && capped.pools[0].tvlUsd).toBe(1008);
  });

  it('never lists a pool that pairs the mint with itself', () => {
    expect(normalizeVenues(USDY, [pool({ token_y: token(USDY, 'USDY') })], AT)).toMatchObject({ state: 'none', matched: 0 });
  });

  it('formats third-party figures for display without inventing precision', () => {
    expect([formatUsd(1742.86), formatUsd(717.92), formatUsd(0.1327), formatUsd(0.004), formatUsd(0), formatUsd(2_450_000)]).toEqual(['$1,743', '$718', '$0.13', '<$0.01', '$0.00', '$2.5M']);
    expect([formatPct(2.818), formatPct(12.345), formatPct(0.0076), formatPct(0), formatPct(Number.NaN)]).toEqual(['2.82%', '12.3%', '<0.01%', '0%', 'Unavailable']);
  });
});

describe('venue reader', () => {
  const ok = (body: unknown): MetadataOutcome => ({ state: 'ok', body: body as Record<string, unknown>, fetchedAt: AT, bytes: 100 });
  it('reads the fixed Meteora URL once per minute per mint and reports cache age', async () => {
    let now = Date.parse(AT);
    const fetchJson = vi.fn(async () => ok({ total: 1, data: [pool()] }));
    const read = createVenueReader({ fetchJson, now: () => now });
    expect(await read(USDY)).toMatchObject({ state: 'ok', fetchedAt: AT });
    now += 30_000;
    expect(await read(USDY)).toMatchObject({ state: 'ok', cacheAgeMs: 30_000 });
    expect(fetchJson).toHaveBeenCalledTimes(1);
    expect(fetchJson).toHaveBeenCalledWith(venuesUpstreamUrl(USDY));
    now += 31_000;
    await read(USDY);
    expect(fetchJson).toHaveBeenCalledTimes(2);
  });
  it('turns transport failures and unexpected shapes into an uncached unavailable state', async () => {
    const fetchJson = vi.fn<(uri: string) => Promise<MetadataOutcome>>()
      .mockResolvedValueOnce({ state: 'failed', reason: 'The metadata host could not be reached.' })
      .mockResolvedValueOnce(ok({ total: 'many', data: [] }))
      .mockRejectedValueOnce(new Error('socket'))
      .mockResolvedValueOnce(ok({ total: 1, data: [pool()] }));
    const read = createVenueReader({ fetchJson, now: () => Date.parse(AT) });
    for (let attempt = 0; attempt < 3; attempt++) expect(await read(USDY)).toMatchObject({ state: 'unavailable' });
    expect(await read(USDY)).toMatchObject({ state: 'ok' });
    expect(fetchJson).toHaveBeenCalledTimes(4);
  });
});

describe('venues API', () => {
  beforeEach(() => { mocks.limit.mockResolvedValue({ ok: true, source: 'local' }); });
  afterEach(() => { vi.resetAllMocks(); vi.doUnmock('@/lib/server/rwa/venues'); });
  async function route() {
    vi.resetModules();
    vi.doMock('@/lib/server/rwa/venues', () => ({ readVenues: mocks.readVenues }));
    return (await import('@/app/api/rwa/venues/route')).GET;
  }
  const request = (query: string) => new Request(`https://rwalens.example/api/rwa/venues?${query}`);

  it('answers a mainnet lookup with the reader result and no-store caching', async () => {
    const GET = await route();
    mocks.readVenues.mockResolvedValue(normalizeVenues(USDY, [pool()], AT));
    const response = await GET(request(`mint=${USDY}&cluster=mainnet-beta`));
    expect(response.status).toBe(200);
    expect(response.headers.get('cache-control')).toBe('no-store');
    expect(await response.json()).toMatchObject({ state: 'ok', mint: USDY });
    expect(mocks.readVenues).toHaveBeenCalledWith(USDY);
  });
  it('says devnet is not covered without contacting Meteora', async () => {
    const GET = await route();
    const response = await GET(request(`mint=${USDY}&cluster=devnet`));
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ state: 'not-applicable' });
    expect(mocks.readVenues).not.toHaveBeenCalled();
  });
  it.each([['a malformed mint', 'mint=not-a-mint'], ['an unknown parameter', `mint=${USDY}&url=https://evil.example`], ['a repeated mint', `mint=${USDY}&mint=${USDC}`], ['no mint', 'cluster=mainnet-beta'], ['an unknown cluster', `mint=${USDY}&cluster=testnet`]])('rejects %s', async (_label, query) => {
    const GET = await route();
    expect((await GET(request(query))).status).toBe(400);
    expect(mocks.readVenues).not.toHaveBeenCalled();
  });
  it('rate limits before reading and maps upstream failure to 503', async () => {
    const GET = await route();
    mocks.limit.mockResolvedValueOnce({ ok: false, retryAfterSeconds: 12, source: 'local' });
    const limited = await GET(request(`mint=${USDY}`));
    expect(limited.status).toBe(429);
    expect(limited.headers.get('retry-after')).toBe('12');
    expect(mocks.readVenues).not.toHaveBeenCalled();
    mocks.readVenues.mockResolvedValue({ state: 'unavailable', reason: 'down' });
    expect((await GET(request(`mint=${USDY}`))).status).toBe(503);
  });
});
