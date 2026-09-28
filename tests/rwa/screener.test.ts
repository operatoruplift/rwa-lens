import { describe, expect, it, vi } from 'vitest';
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

function fakeFetch(options: { failXStocks?: boolean; failPools?: boolean } = {}) {
  return vi.fn(async (uri: string) => {
    const url = new URL(uri);
    if (url.hostname === 'api.xstocks.fi') {
      if (options.failXStocks) return { state: 'failed' as const, reason: 'down' };
      const page = Number(url.searchParams.get('page'));
      const nodes = page === 1
        ? [xstock('TSLAx', TSLAX, { openNow: true }), xstock('NVDAx', NVDAX, { openNow: false }), { symbol: 'broken' }]
        : [xstock('METAx', METAX, null, true), xstock('NOSOLx', 'not-a-mint', { openNow: true })];
      return { state: 'ok' as const, body: { nodes, page: { hasNextPage: page === 1 } }, fetchedAt: '', bytes: 1 };
    }
    if (options.failPools) return { state: 'failed' as const, reason: 'down' };
    const filter = url.searchParams.get('filter_by') ?? '';
    const [, side, list] = /^(token_x|token_y)=\[([^\]]*)\]/.exec(filter) ?? [];
    const mints = new Set(list.split(','));
    return { state: 'ok' as const, body: { total: 0, data: POOLS.filter(row => mints.has(side === 'token_x' ? row.token_x.address : row.token_y.address)) }, fetchedAt: '', bytes: 1 };
  });
}

describe('screener snapshot', () => {
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
