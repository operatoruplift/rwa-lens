import { describe, expect, it, vi } from 'vitest';
import bs58 from 'bs58';
import { DEFAULT_FILTERS, screen, screenerResponseSchema, type ScreenerResponse } from '@/lib/rwa/screener';
import { createScreenerStore } from '@/lib/server/rwa/screener';

const USDC = 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v';
const SOL = 'So11111111111111111111111111111111111111112';
const USDY = 'A1KLoBrKBde8Ty9qtNQUtq3C2ortoC3u7twggz7sEto6';
const TSLAX = 'XsDoVfqeBukxuZHWhdvWHBhgEHjGNst4MLodqsJHzoB';
const NVDAX = 'Xsc9qvGR1efVDFGLrVsmkzv3qi45LTBjeUKSPmx9qEh';
const METAX = 'Xsa62P5mvPszXL1krVUnU5ar38bBSVcWAB6fmPCo5Zu';

const token = (address: string, symbol: string) => ({ address, symbol, decimals: 6, is_verified: true });
function pool(address: string, x: [string, string], y: [string, string], tvl: number, over: Record<string, unknown> = {}) {
  return {
    address, name: `${x[1]}-${y[1]}`, token_x: token(...x), token_y: token(...y), tvl, apy: 12.5, current_price: 1,
    volume: { '24h': tvl / 2 }, fees: { '24h': tvl / 1000 }, fee_tvl_ratio: { '24h': 0.1 }, pool_config: { bin_step: 25, base_fee_pct: 0.25 }, is_blacklisted: false, ...over,
  };
}
const xstock = (symbol: string, mint: string, trading: Record<string, unknown> | null, halted = false) => ({
  symbol, name: `${symbol.replace(/x$/, '')} xStock`, underlyingSymbol: symbol.replace(/x$/, ''), isTradingHalted: halted, trading,
  deployments: [{ network: 'Ton', address: 'EQB4Iwq' }, { network: 'Solana', address: mint }],
});

const POOLS = [
  pool('4dLtt8WQEjkZCiRrNJA5XRqqDBsoymdBxN54dz7pbDie', [USDY, 'USDY'], [USDC, 'USDC'], 1743),
  pool('BCZLEgknvcyCsJ9ERRN38U4gBTNn4ftU11fEtV3XHnK2', [TSLAX, 'TSLAx'], [USDC, 'USDC'], 928),
  pool('CHGfdEfKFYDWGPASCsZnpkDzvpLKNEVoAb4UEorPPkGK', [TSLAX, 'TSLAx'], [SOL, 'SOL'], 6193, { apy: 40 }),
  pool('8is7SBzMYLUTUtVU5H4QEPkgeQP7WaM7rQ6QPxXTa4PB', [NVDAX, 'NVDAx'], [TSLAX, 'TSLAx'], 6103),
];

function fakeFetch(options: { failXStocks?: boolean; failPools?: boolean; pools?: ReturnType<typeof pool>[]; marketOpen?: boolean; total?: number } = {}) {
  return vi.fn(async (uri: string) => {
    const url = new URL(uri);
    if (url.hostname === 'api.xstocks.fi') {
      if (options.failXStocks) return { state: 'failed' as const, reason: 'down' };
      const page = Number(url.searchParams.get('page'));
      const nodes = page === 1
        ? [xstock('TSLAx', TSLAX, { openNow: options.marketOpen ?? true }), xstock('NVDAx', NVDAX, { openNow: false }), { symbol: 'broken' }]
        : [xstock('METAx', METAX, null, true), xstock('NOSOLx', 'not-a-mint', { openNow: true })];
      return { state: 'ok' as const, body: { nodes, page: { hasNextPage: page === 1 } }, fetchedAt: '', bytes: 1 };
    }
    if (options.failPools) return { state: 'failed' as const, reason: 'down' };
    const filter = url.searchParams.get('filter_by') ?? '';
    const [, side, list] = /^(token_x|token_y)=\[([^\]]*)\]/.exec(filter) ?? [];
    const mints = new Set(list.split(','));
    const rows = (options.pools ?? POOLS).filter(row => mints.has(side === 'token_x' ? row.token_x.address : row.token_y.address));
    const start = (Number(url.searchParams.get('page') ?? 1) - 1) * 200;
    return { state: 'ok' as const, body: { total: options.total ?? rows.length, data: rows.slice(start, start + 200) }, fetchedAt: '', bytes: 1 };
  });
}

describe('screener snapshot', () => {
  it('retries a failed issuer page once and recovers a complete cold snapshot', async () => {
    const base = fakeFetch();
    let attempts = 0;
    const fetchJson = vi.fn(async (uri: string) => {
      const url = new URL(uri);
      if (url.hostname === 'api.xstocks.fi' && url.searchParams.get('page') === '2' && ++attempts === 1) {
        return { state: 'failed' as const, reason: 'The metadata host did not respond in time.' };
      }
      return base(uri);
    });
    const { response } = await createScreenerStore({ fetchJson, now: () => 0 }).read();
    expect(response).toMatchObject({ state: 'ok', catalogSize: 4 });
    expect(attempts).toBe(2);
  });

  it.each([['failed', 2], ['blocked', 1], ['not-configured', 1]] as const)('bounds retries for a %s issuer page', async (state, expectedAttempts) => {
    const base = fakeFetch();
    let attempts = 0;
    const fetchJson = vi.fn(async (uri: string) => {
      const url = new URL(uri);
      if (url.hostname === 'api.xstocks.fi' && url.searchParams.get('page') === '2') {
        attempts++;
        return { state, reason: 'Unavailable page.' };
      }
      return base(uri);
    });
    const { response } = await createScreenerStore({ fetchJson, now: () => 0 }).read();
    expect(response).toMatchObject({ state: 'unavailable' });
    expect(attempts).toBe(expectedAttempts);
  });

  it('keeps a sixth USDC pool available to pair and APY filters', async () => {
    const pools = Array.from({ length: 6 }, (_, index) => pool(`pool${String(index).padStart(32, '0')}`, [TSLAX, 'TSLAx'], index === 5 ? [USDC, 'USDC'] : [SOL, 'SOL'], 6000 - index * 1000, { apy: index === 5 ? 90 : 10 }));
    const { response } = await createScreenerStore({ fetchJson: fakeFetch({ pools }), now: () => 0 }).read();
    if (response.state !== 'ok') throw new Error('expected ok');
    expect(response.pools).toHaveLength(6);
    expect(screen(response, { ...DEFAULT_FILTERS, pair: 'usdc' }).map(row => row.pool.address)).toEqual([pools[5].address]);
    expect(screen(response, { ...DEFAULT_FILTERS, sort: 'apy' })[0].pool.address).toBe(pools[5].address);
  });

  it('reads later Meteora pages instead of presenting the first 200 rows as complete', async () => {
    const pools = Array.from({ length: 201 }, (_, index) => pool(`pool${String(index).padStart(32, '0')}`, [TSLAX, 'TSLAx'], [USDC, 'USDC'], 1000));
    const fetchJson = fakeFetch({ pools });
    const { response } = await createScreenerStore({ fetchJson, now: () => 0 }).read();
    if (response.state !== 'ok') throw new Error('expected ok');
    expect(response.pools).toHaveLength(201);
    expect(response.pools.some(entry => entry.address === pools[200].address)).toBe(true);
    expect(fetchJson.mock.calls.some(([uri]) => new URL(uri).hostname === 'dlmm.datapi.meteora.ag' && new URL(uri).searchParams.get('page') === '2')).toBe(true);
  });

  it('returns unavailable when the upstream result exceeds the bounded page scan', async () => {
    const fetchJson = fakeFetch({ total: 5001 });
    const { response } = await createScreenerStore({ fetchJson, now: () => 0 }).read();
    expect(response).toMatchObject({ state: 'unavailable' });
    expect(fetchJson.mock.calls.filter(([uri]) => new URL(uri).hostname === 'dlmm.datapi.meteora.ag').length).toBeLessThanOrEqual(2);
  });

  it('does not keep serving an old snapshot once a refresh detects incomplete coverage', async () => {
    let now = 0;
    const options: Parameters<typeof fakeFetch>[0] = {};
    const store = createScreenerStore({ fetchJson: fakeFetch(options), now: () => now });
    expect((await store.read()).response.state).toBe('ok');
    options.total = 5001;
    now = 10 * 60_000;
    await (await store.read()).refresh!();
    expect((await store.read()).response).toMatchObject({ state: 'unavailable', reason: expect.stringContaining('scan limits') });
  });

  it('returns unavailable for an incomplete page sequence rather than a partial snapshot', async () => {
    const { response } = await createScreenerStore({ fetchJson: fakeFetch({ total: 201 }), now: () => 0 }).read();
    expect(response).toMatchObject({ state: 'unavailable' });
  });

  it('bounds the combined row count across all pool queries', async () => {
    const assets = Array.from({ length: 41 }, (_, index) => xstock(`ASSET${index}x`, bs58.encode(Uint8Array.from({ length: 32 }, (_, byte) => byte === 31 ? index : 7)), null));
    const fetchJson = vi.fn(async (uri: string) => new URL(uri).hostname === 'api.xstocks.fi'
      ? { state: 'ok' as const, body: { nodes: assets, page: { hasNextPage: false } }, fetchedAt: '', bytes: 1 }
      : { state: 'ok' as const, body: { total: 4000, data: Array.from({ length: 200 }, () => POOLS[0]) }, fetchedAt: '', bytes: 1 });
    const { response } = await createScreenerStore({ fetchJson, now: () => 0 }).read();
    expect(response).toMatchObject({ state: 'unavailable', reason: expect.stringContaining('scan limits') });
  });

  it('returns unavailable when the issuer catalog still has pages beyond its scan cap', async () => {
    const base = fakeFetch();
    const fetchJson = vi.fn(async (uri: string) => {
      const outcome = await base(uri);
      if (new URL(uri).hostname === 'api.xstocks.fi' && outcome.state === 'ok') {
        return { ...outcome, body: { ...outcome.body, page: { hasNextPage: true } } };
      }
      return outcome;
    });
    expect((await createScreenerStore({ fetchJson, now: () => 0 }).read()).response).toMatchObject({ state: 'unavailable' });
    expect(fetchJson.mock.calls.filter(([uri]) => new URL(uri).hostname === 'api.xstocks.fi')).toHaveLength(40);
  });

  it('expires market flags on stale reads and observes market transitions during refresh', async () => {
    let now = 0;
    const options = { marketOpen: true };
    const fetchJson = fakeFetch(options);
    const store = createScreenerStore({ fetchJson, now: () => now });
    const initial = await store.read();
    expect(initial.response.state === 'ok' && initial.response.assets.find(asset => asset.mint === TSLAX)?.market).toBe('open');
    options.marketOpen = false;
    now = 10 * 60_000;
    const stale = await store.read();
    expect(stale.response.state === 'ok' && stale.response.assets.every(asset => asset.market === null)).toBe(true);
    await stale.refresh!();
    const refreshed = await store.read();
    expect(refreshed.response.state === 'ok' && refreshed.response.assets.find(asset => asset.mint === TSLAX)?.market).toBe('closed');
    expect(initial.response.state === 'ok' && initial.response.assets.find(asset => asset.mint === TSLAX)?.market).toBe('open');
  });

  it('keeps issuer identity during an outage without renewing expired market flags', async () => {
    let now = 0;
    const options = { failXStocks: false };
    const store = createScreenerStore({ fetchJson: fakeFetch(options), now: () => now });
    await store.read();
    options.failXStocks = true;
    now = 10 * 60_000;
    await (await store.read()).refresh!();
    const cached = await store.read();
    expect(cached.refresh).toBeUndefined();
    expect(cached.response).toMatchObject({ state: 'ok', stale: false, fetchedAt: new Date(now).toISOString() });
    if (cached.response.state !== 'ok') throw new Error('expected ok');
    expect(cached.response.assets.find(asset => asset.mint === TSLAX)).toMatchObject({ symbol: 'TSLAx', issuer: 'xStocks', market: null });
    now += 9 * 60_000;
    const later = await store.read();
    expect(later.response.state === 'ok' && later.response.assets.every(asset => asset.market === null)).toBe(true);
  });

  it('joins the issuer catalogs with every listed pool, from either side of the pair', async () => {
    const fetchJson = fakeFetch();
    const store = createScreenerStore({ fetchJson, now: () => Date.parse('2026-09-28T12:00:00.000Z') });
    const { response } = await store.read();
    expect(screenerResponseSchema.parse(response)).toEqual(response);
    if (response.state !== 'ok') throw new Error('expected ok');
    expect(response.catalogSize).toBe(4);
    expect(response.assets.map(asset => [asset.symbol, asset.issuer, asset.market])).toEqual([['USDY', 'Ondo', null], ['TSLAx', 'xStocks', 'open'], ['NVDAx', 'xStocks', 'closed']]);
    expect(response.assets[0].reserveProofUrl).toBe('https://ondo.finance/usdy');
    expect(response.pools.filter(entry => entry.mint === TSLAX).map(entry => entry.pair).sort()).toEqual(['NVDAx-TSLAx', 'TSLAx-SOL', 'TSLAx-USDC']);
    expect(response.pools.find(entry => entry.mint === NVDAX)).toMatchObject({ pair: 'NVDAx-TSLAx', tokenSymbol: 'NVDAx', counterSymbol: 'TSLAx' });
    const meteoraQueries = fetchJson.mock.calls.map(call => new URL(call[0] as string)).filter(url => url.hostname === 'dlmm.datapi.meteora.ag');
    expect(meteoraQueries.map(url => url.searchParams.get('filter_by')!.split('=')[0])).toEqual(['token_x', 'token_y']);
    expect(meteoraQueries[0].searchParams.get('filter_by')).toContain('&& tvl>=100 && is_blacklisted=false');
    expect(meteoraQueries.every(url => url.href.length <= 2048)).toBe(true);
  });

  it('serves fresh snapshots from memory, stale ones with a refresh, and never caches a failure', async () => {
    let now = 0;
    const fetchJson = fakeFetch();
    const store = createScreenerStore({ fetchJson, now: () => now });
    await store.read();
    const calls = fetchJson.mock.calls.length;
    now = 9 * 60_000;
    expect((await store.read()).refresh).toBeUndefined();
    expect(fetchJson.mock.calls.length).toBe(calls);
    now = 20 * 60_000;
    const stale = await store.read();
    expect(stale.response).toMatchObject({ state: 'ok', stale: true });
    await stale.refresh!();
    expect(fetchJson.mock.calls.length).toBeGreaterThan(calls);
    const failing = createScreenerStore({ fetchJson: fakeFetch({ failPools: true }), now: () => 0 });
    expect((await failing.read()).response).toMatchObject({ state: 'unavailable' });
    expect((await createScreenerStore({ fetchJson: fakeFetch({ failXStocks: true }), now: () => 0 }).read()).response).toMatchObject({ state: 'unavailable' });
  });
});

describe('screening', () => {
  const response = (async () => (await createScreenerStore({ fetchJson: fakeFetch(), now: () => 0 }).read()).response as Extract<ScreenerResponse, { state: 'ok' }>)();
  it('filters by issuer, pair and depth, and sorts with stable ties', async () => {
    const value = await response;
    expect(screen(value, DEFAULT_FILTERS).map(row => row.pool.pair)).toEqual(['TSLAx-SOL', 'NVDAx-TSLAx', 'NVDAx-TSLAx', 'USDY-USDC', 'TSLAx-USDC']);
    expect(screen(value, { ...DEFAULT_FILTERS, issuer: 'Ondo' }).map(row => row.asset.symbol)).toEqual(['USDY']);
    expect(screen(value, { ...DEFAULT_FILTERS, pair: 'usdc' }).map(row => row.pool.pair)).toEqual(['USDY-USDC', 'TSLAx-USDC']);
    expect(screen(value, { ...DEFAULT_FILTERS, minTvl: 1_000 }).map(row => row.pool.pair)).toEqual(['TSLAx-SOL', 'NVDAx-TSLAx', 'NVDAx-TSLAx', 'USDY-USDC']);
    expect(screen(value, { ...DEFAULT_FILTERS, sort: 'apy' })[0].pool.pair).toBe('TSLAx-SOL');
  });
});
