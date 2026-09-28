import { z } from 'zod';
import { USDC_MINT_ADDRESS, venuePoolSchema, type VenuePool } from './venues';

/**
 * Yield opportunities across tokenized assets: every Meteora DLMM pool with at
 * least $100 TVL that holds a known RWA token (Ondo USDY and every xStock with
 * a Solana deployment). Third-party market data, never an inspection result.
 */
export const SCREENER_SOURCES = ['Meteora DLMM data API', 'xStocks public API', 'RWA Lens issuer attribution'] as const;
export const ISSUERS = ['xStocks', 'Ondo'] as const;
export type Issuer = (typeof ISSUERS)[number];

export const screenerAssetSchema = z.object({
  mint: z.string().min(32).max(64),
  symbol: z.string().max(40),
  name: z.string().max(120),
  issuer: z.enum(ISSUERS),
  /** The listed share or fund the token tracks, when the issuer names one. */
  underlying: z.string().max(24).nullable(),
  /** Issuer-reported trading session for xStocks; null when the issuer publishes none. */
  market: z.enum(['open', 'closed', 'halted']).nullable(),
  reserveProofUrl: z.string().url().startsWith('https://').nullable(),
});
export type ScreenerAsset = z.infer<typeof screenerAssetSchema>;

export const screenerResponseSchema = z.discriminatedUnion('state', [
  z.object({
    state: z.literal('ok'),
    fetchedAt: z.string().datetime(),
    /** Assets with at least one listed pool. */
    assets: z.array(screenerAssetSchema).max(2000),
    pools: z.array(venuePoolSchema.extend({ mint: z.string().min(32).max(64) })).max(5000),
    /** RWA tokens considered, including those with no listed pool. */
    catalogSize: z.number().int().min(0),
    /** True when this snapshot is older than the refresh interval and a refresh is under way. */
    stale: z.boolean(),
  }),
  z.object({ state: z.literal('unavailable'), reason: z.string().max(300) }),
]);
export type ScreenerResponse = z.infer<typeof screenerResponseSchema>;
export type ScreenerPool = Extract<ScreenerResponse, { state: 'ok' }>['pools'][number];

export const MIN_TVL_CHOICES = [100, 1_000, 10_000] as const;
export const SORTS = ['tvl', 'volume', 'apy'] as const;
export type ScreenerFilters = { issuer: 'all' | Issuer; pair: 'usdc' | 'all'; minTvl: (typeof MIN_TVL_CHOICES)[number]; sort: (typeof SORTS)[number] };
export const DEFAULT_FILTERS: ScreenerFilters = { issuer: 'all', pair: 'all', minTvl: 100, sort: 'tvl' };

export type Opportunity = { asset: ScreenerAsset; pool: ScreenerPool };

const SORT_KEY: Record<ScreenerFilters['sort'], (pool: VenuePool) => number> = {
  tvl: pool => pool.tvlUsd,
  volume: pool => pool.volume24hUsd,
  apy: pool => pool.feeApyPct,
};

/** Filters and orders pools. Ties break on TVL, then pool address, so the order is stable. */
export function screen(response: Extract<ScreenerResponse, { state: 'ok' }>, filters: ScreenerFilters): Opportunity[] {
  const assets = new Map(response.assets.map(asset => [asset.mint, asset]));
  const key = SORT_KEY[filters.sort];
  return response.pools
    .flatMap(pool => {
      const asset = assets.get(pool.mint);
      if (!asset) return [];
      if (filters.issuer !== 'all' && asset.issuer !== filters.issuer) return [];
      if (filters.pair === 'usdc' && pool.counterMint !== USDC_MINT_ADDRESS) return [];
      if (pool.tvlUsd < filters.minTvl) return [];
      return [{ asset, pool }];
    })
    .sort((a, b) => key(b.pool) - key(a.pool) || b.pool.tvlUsd - a.pool.tvlUsd || a.pool.address.localeCompare(b.pool.address));
}

/** One-day fee annualisations above this are shown as "over 1,000%": the figure says more about one day than about a rate. */
export const APY_DISPLAY_CAP = 1000;
