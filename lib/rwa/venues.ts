import { z } from 'zod';

/**
 * Third-party liquidity venues for an inspected mint.
 *
 * These figures come from Meteora's public DLMM data API. They are market data
 * about pools that hold the token, never part of an inspection, a report or an
 * export, and never evidence of backing, redemption or investment performance.
 */
export const METEORA_DLMM_HOST = 'dlmm.datapi.meteora.ag';
export const METEORA_DLMM_API = `https://${METEORA_DLMM_HOST}`;
export const METEORA_SOURCE_LABEL = 'Meteora DLMM data API';
/** Mainnet USDC. Deploy is offered only on pools that pair the inspected token with it. */
export const USDC_MINT_ADDRESS = 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v';
/** Pools below this total value locked are counted but not listed: their rates are noise. */
export const MIN_LISTED_TVL_USD = 100;
export const MAX_LISTED_POOLS = 5;
/** Upstream page size: enough to find the listed pools after exact-mint filtering. */
export const UPSTREAM_PAGE_SIZE = 20;

const finite = z.number().finite();
const window24h = z.object({ '24h': finite }).passthrough();
const upstreamToken = z.object({
  address: z.string().min(32).max(64),
  symbol: z.string().max(40),
  decimals: z.number().int().min(0).max(18),
  is_verified: z.boolean().optional(),
}).passthrough();
export const upstreamPoolSchema = z.object({
  address: z.string().min(32).max(64),
  name: z.string().max(120),
  token_x: upstreamToken,
  token_y: upstreamToken,
  tvl: finite,
  apy: finite,
  current_price: finite,
  volume: window24h,
  fees: window24h,
  fee_tvl_ratio: window24h,
  pool_config: z.object({ bin_step: z.number().int().min(0).max(10_000), base_fee_pct: finite }).passthrough(),
  dynamic_fee_pct: finite.optional(),
  is_blacklisted: z.boolean(),
  has_farm: z.boolean().optional(),
  farm_apy: finite.optional(),
}).passthrough();
export const upstreamPageSchema = z.object({ total: z.number().int().min(0), data: z.array(z.unknown()).max(100) }).passthrough();
export type UpstreamPool = z.infer<typeof upstreamPoolSchema>;

const nonNegative = z.number().finite().min(0);
export const venuePoolSchema = z.object({
  address: z.string().min(32).max(64),
  pair: z.string().max(120),
  /** The inspected token's symbol as the pool lists it. */
  tokenSymbol: z.string().max(40),
  /** The other token in the pool, from the inspected mint's point of view. */
  counterSymbol: z.string().max(40),
  counterMint: z.string().min(32).max(64),
  counterVerified: z.boolean(),
  tvlUsd: nonNegative,
  volume24hUsd: nonNegative,
  fees24hUsd: nonNegative,
  /** Last-24-hour fees as a percentage of TVL, as Meteora reports it. */
  feeTvl24hPct: nonNegative,
  /** Meteora's annualization of the last 24 hours of fees, in percent. */
  feeApyPct: nonNegative,
  farmApyPct: nonNegative.nullable(),
  binStep: z.number().int().min(0).max(10_000),
  baseFeePct: nonNegative,
  meteoraUrl: z.string().url().startsWith('https://app.meteora.ag/dlmm/'),
});
export type VenuePool = z.infer<typeof venuePoolSchema>;

export const venuesResponseSchema = z.discriminatedUnion('state', [
  z.object({
    state: z.literal('ok'), mint: z.string().max(64), source: z.literal(METEORA_SOURCE_LABEL), fetchedAt: z.string().datetime(),
    pools: z.array(venuePoolSchema).max(MAX_LISTED_POOLS),
    /** Pools that hold this exact mint, before the TVL floor. */
    matched: z.number().int().min(0),
    /** Pools holding the mint below MIN_LISTED_TVL_USD, counted but not listed. */
    belowFloor: z.number().int().min(0),
    cacheAgeMs: z.number().int().min(0).optional(),
  }),
  z.object({ state: z.literal('none'), mint: z.string().max(64), source: z.literal(METEORA_SOURCE_LABEL), fetchedAt: z.string().datetime(), matched: z.number().int().min(0), belowFloor: z.number().int().min(0) }),
  z.object({ state: z.literal('unavailable'), reason: z.string().max(300) }),
  z.object({ state: z.literal('not-applicable'), reason: z.string().max(300) }),
]);
export type VenuesResponse = z.infer<typeof venuesResponseSchema>;

export function venuesUpstreamUrl(mint: string): string {
  const url = new URL('/pools', METEORA_DLMM_API);
  url.searchParams.set('query', mint);
  url.searchParams.set('order_by', 'tvl');
  url.searchParams.set('sort', 'desc');
  url.searchParams.set('page_size', String(UPSTREAM_PAGE_SIZE));
  return url.href;
}

const compact = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', notation: 'compact', maximumFractionDigits: 1 });
const whole = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 });
const cents = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 2, maximumFractionDigits: 2 });
/** Display rounding only; the figures are third-party estimates, never accounting values. */
export function formatUsd(value: number): string {
  if (!Number.isFinite(value) || value < 0) return 'Unavailable';
  if (value >= 1_000_000) return compact.format(value);
  if (value >= 100) return whole.format(value);
  if (value > 0 && value < 0.01) return '<$0.01';
  return cents.format(value);
}
export function formatPct(value: number): string {
  if (!Number.isFinite(value) || value < 0) return 'Unavailable';
  if (value === 0) return '0%';
  if (value < 0.01) return '<0.01%';
  return `${value.toFixed(value >= 10 ? 1 : 2)}%`;
}

const clampNonNegative = (value: number | undefined) => (value === undefined || !Number.isFinite(value) || value < 0 ? 0 : value);

/**
 * Keeps only pools whose own token list contains the exact mint (the upstream
 * query also matches names), drops blacklisted pools, and orders by TVL.
 */
export function normalizeVenues(mint: string, rows: unknown[], fetchedAt: string): Extract<VenuesResponse, { state: 'ok' | 'none' }> {
  const pools: UpstreamPool[] = [];
  for (const row of rows) {
    const parsed = upstreamPoolSchema.safeParse(row);
    if (!parsed.success || parsed.data.is_blacklisted) continue;
    if (parsed.data.token_x.address !== mint && parsed.data.token_y.address !== mint) continue;
    if (parsed.data.token_x.address === parsed.data.token_y.address) continue;
    pools.push(parsed.data);
  }
  pools.sort((a, b) => clampNonNegative(b.tvl) - clampNonNegative(a.tvl));
  const listed = pools.filter(pool => clampNonNegative(pool.tvl) >= MIN_LISTED_TVL_USD);
  const base = { mint, source: METEORA_SOURCE_LABEL, fetchedAt, matched: pools.length, belowFloor: pools.length - listed.length } as const;
  if (!listed.length) return { state: 'none', ...base };
  return {
    state: 'ok', ...base,
    pools: listed.slice(0, MAX_LISTED_POOLS).map(pool => {
      const [token, counter] = pool.token_x.address === mint ? [pool.token_x, pool.token_y] : [pool.token_y, pool.token_x];
      return {
        address: pool.address,
        pair: pool.name,
        tokenSymbol: token.symbol,
        counterSymbol: counter.symbol,
        counterMint: counter.address,
        counterVerified: counter.is_verified === true,
        tvlUsd: clampNonNegative(pool.tvl),
        volume24hUsd: clampNonNegative(pool.volume['24h']),
        fees24hUsd: clampNonNegative(pool.fees['24h']),
        feeTvl24hPct: clampNonNegative(pool.fee_tvl_ratio['24h']),
        feeApyPct: clampNonNegative(pool.apy),
        farmApyPct: pool.has_farm ? clampNonNegative(pool.farm_apy) : null,
        binStep: pool.pool_config.bin_step,
        baseFeePct: clampNonNegative(pool.pool_config.base_fee_pct),
        meteoraUrl: `https://app.meteora.ag/dlmm/${pool.address}`,
      };
    }),
  };
}
