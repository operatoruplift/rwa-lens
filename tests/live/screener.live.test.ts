import { describe, expect, it } from 'vitest';
import { screen, DEFAULT_FILTERS } from '@/lib/rwa/screener';
import { createScreenerStore } from '@/lib/server/rwa/screener';

/** Live read of the xStocks catalog and Meteora pools. Skipped unless RWA_LIVE_SCREENER=1. */
describe.skipIf(process.env.RWA_LIVE_SCREENER !== '1')('screener against the live APIs', () => {
  it('builds a snapshot of pools holding tokenized assets', async () => {
    const started = Date.now();
    const { response } = await createScreenerStore().read();
    console.log(JSON.stringify(response.state === 'ok'
      ? { ms: Date.now() - started, catalogSize: response.catalogSize, assets: response.assets.length, pools: response.pools.length, top: screen(response, DEFAULT_FILTERS).slice(0, 8).map(row => `${row.pool.pair} ${Math.round(row.pool.tvlUsd)} ${row.asset.market ?? '-'}`) }
      : response, null, 1));
    expect(response.state).toBe('ok');
    if (response.state !== 'ok') return;
    expect(response.catalogSize).toBeGreaterThan(500);
    expect(response.assets.some(asset => asset.symbol === 'USDY' && asset.reserveProofUrl)).toBe(true);
    expect(response.pools.length).toBeGreaterThan(20);
  }, 120_000);
});
