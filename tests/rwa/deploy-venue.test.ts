import { describe, expect, it, vi } from 'vitest';
import { normalizeVenues, venuesResponseSchema } from '@/lib/rwa/venues';
import { createSelectedPoolReader } from '@/lib/server/rwa/deploy/venue';
import type { MetadataOutcome } from '@/lib/server/rwa/metadata-fetch';

const USDY = 'A1KLoBrKBde8Ty9qtNQUtq3C2ortoC3u7twggz7sEto6';
const USDC = 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v';
const SOL = 'So11111111111111111111111111111111111111112';
const POOL = '4dLtt8WQEjkZCiRrNJA5XRqqDBsoymdBxN54dz7pbDie';
const OTHER = 'BDpP98gnA9cVN4ATYh6F76nDHw4hXxDpzSt7ZiGUxxLQ';
const AT = '2026-09-30T12:00:00.000Z';
const token = (address: string, symbol: string) => ({ address, symbol, decimals: 6, is_verified: true });
const pool = (over: Record<string, unknown> = {}) => ({
  address: POOL, name: 'USDY-USDC', token_x: token(USDY, 'USDY'), token_y: token(USDC, 'USDC'),
  tvl: 150, apy: 2, current_price: 1.14, volume: { '24h': 200 }, fees: { '24h': 0.02 }, fee_tvl_ratio: { '24h': 0.01 },
  pool_config: { bin_step: 1, base_fee_pct: 0.01 }, is_blacklisted: false, ...over,
});
const ok = (body: unknown): MetadataOutcome => ({ state: 'ok', body: body as Record<string, unknown>, fetchedAt: AT, bytes: 1000 });

describe('selected deploy pool reader', () => {
  it('accepts a qualifying sixth pool without changing the inspector cap', async () => {
    const largerPools = [OTHER, SOL, USDC, USDY, '8is7SBzMYLUTUtVU5H4QEPkgeQP7WaM7rQ6QPxXTa4PB'].map(address => pool({ address, tvl: 2000 }));
    const rows = [...largerPools, pool()];
    const inspector = normalizeVenues(USDY, rows, AT);
    expect(inspector.state === 'ok' && inspector.pools).toHaveLength(5);
    expect(inspector.state === 'ok' && inspector.pools.some(row => row.address === POOL)).toBe(false);
    const fetchJson = vi.fn(async () => ok(pool()));
    const read = createSelectedPoolReader({ fetchJson, now: () => Date.parse(AT) });
    const result = await read(USDY, POOL);
    expect(result).toMatchObject({ state: 'ok', pools: [{ address: POOL, counterMint: USDC }], fetchedAt: AT });
    expect(venuesResponseSchema.parse(result)).toEqual(result);
    expect(fetchJson).toHaveBeenCalledExactlyOnceWith(`https://dlmm.datapi.meteora.ag/pools/${POOL}`);
  });

  it('accepts the mint on either side and includes the exact liquidity floor', async () => {
    const read = createSelectedPoolReader({ fetchJson: async () => ok(pool({ token_x: token(USDC, 'USDC'), token_y: token(USDY, 'USDY'), tvl: 100 })), now: () => 0 });
    expect(await read(USDY, POOL)).toMatchObject({ state: 'ok', pools: [{ address: POOL, tokenSymbol: 'USDY', counterMint: USDC }] });
  });

  it.each([
    ['wrong mint', { token_x: token(SOL, 'SOL') }],
    ['non-USDC pair', { token_y: token(SOL, 'SOL') }],
    ['below liquidity floor', { tvl: 99.99 }],
    ['blacklisted', { is_blacklisted: true }],
  ])('does not approve a %s pool', async (_label, over) => {
    const read = createSelectedPoolReader({ fetchJson: async () => ok(pool(over)), now: () => 0 });
    expect(await read(USDY, POOL)).toMatchObject({ state: 'none' });
  });

  it('rejects mismatched pool addresses and malformed provider responses', async () => {
    const fetchJson = vi.fn().mockResolvedValueOnce(ok(pool({ address: OTHER }))).mockResolvedValueOnce(ok({ address: POOL }));
    const read = createSelectedPoolReader({ fetchJson, now: () => 0 });
    expect(await read(USDY, POOL)).toMatchObject({ state: 'unavailable' });
    expect(await read(USDY, POOL)).toMatchObject({ state: 'unavailable' });
  });

  it('rejects invalid address paths before contacting the provider', async () => {
    const fetchJson = vi.fn(async () => ok(pool()));
    const read = createSelectedPoolReader({ fetchJson, now: () => 0 });
    expect(await read(USDY, '../stats')).toMatchObject({ state: 'unavailable' });
    expect(await read('not a mint', POOL)).toMatchObject({ state: 'unavailable' });
    expect(fetchJson).not.toHaveBeenCalled();
  });

  it('fails closed on upstream failure and reads again after recovery', async () => {
    const fetchJson = vi.fn().mockRejectedValueOnce(new Error('secret provider detail')).mockResolvedValueOnce({ state: 'failed', reason: 'down' }).mockResolvedValueOnce(ok(pool()));
    const read = createSelectedPoolReader({ fetchJson, now: () => 0 });
    expect(await read(USDY, POOL)).toMatchObject({ state: 'unavailable' });
    expect(await read(USDY, POOL)).toMatchObject({ state: 'unavailable' });
    expect(await read(USDY, POOL)).toMatchObject({ state: 'ok' });
    expect(fetchJson).toHaveBeenCalledTimes(3);
  });
});
