import 'server-only';
import { z } from 'zod';
import bs58 from 'bs58';
import liveAssets from '@/lib/rwa/live-assets.json';
import { screenerResponseSchema, type ScreenerAsset, type ScreenerResponse } from '@/lib/rwa/screener';
import { METEORA_DLMM_API, METEORA_DLMM_HOST, MIN_LISTED_TVL_USD, normalizeVenues } from '@/lib/rwa/venues';
import { fetchAllowedJson, type MetadataOutcome } from './metadata-fetch';

export const XSTOCKS_HOST = 'api.xstocks.fi';
/** Fifty assets answer in about a second; a hundred take seven, past the fetch deadline. */
const XSTOCKS_PAGE_SIZE = 50;
const XSTOCKS_MAX_PAGES = 40;
const XSTOCKS_PAGES_AT_ONCE = 6;
/** An xStocks catalog page carries every network's deployment per asset, about 6 KB each. */
const XSTOCKS_MAX_BYTES = 1024 * 1024;
/** Mints per Meteora filter: forty keep each URL under the fetch policy's 2,048 characters. */
const MINTS_PER_QUERY = 40;
const POOLS_PER_QUERY = 200;
const MAX_POOL_BYTES = 512 * 1024;
const CONCURRENCY = 6;
const FRESH_MS = 10 * 60_000;
const MAX_AGE_MS = 60 * 60_000;
const CATALOG_TTL_MS = 6 * 60 * 60_000;

const isMint = (value: string) => { try { return /^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(value) && bs58.decode(value).length === 32; } catch { return false; } };

const xStockSchema = z.object({
  symbol: z.string().min(1).max(40),
  name: z.string().min(1).max(120),
  underlyingSymbol: z.string().max(24).nullish(),
  isTradingHalted: z.boolean().nullish(),
  trading: z.object({ isTradingHalted: z.boolean().nullish(), openNow: z.boolean().nullish() }).passthrough().nullish(),
  deployments: z.array(z.object({ network: z.string().max(40), address: z.string().max(80) }).passthrough()).max(40).nullish(),
}).passthrough();
const xStocksPageSchema = z.object({ nodes: z.array(z.unknown()).max(XSTOCKS_PAGE_SIZE), page: z.object({ hasNextPage: z.boolean() }).passthrough() }).passthrough();
const poolPageSchema = z.object({ total: z.number().int().min(0), data: z.array(z.unknown()).max(POOLS_PER_QUERY) }).passthrough();

type FetchJson = (uri: string, hosts: string[], schema: z.ZodType<Record<string, unknown>>, limits: { maxBytes: number }) => Promise<MetadataOutcome>;
type Dependencies = { fetchJson: FetchJson; now: () => number };
const defaults: Dependencies = { fetchJson: (uri, hosts, schema, limits) => fetchAllowedJson(uri, hosts, schema, limits), now: Date.now };

/** Ondo and any other curated attribution, from the same manifest the inspector uses. */
function curatedAssets(): ScreenerAsset[] {
  return (liveAssets as Array<{ cluster: string; mint: string; symbol: string; name: string; issuer: string; reserveProofUrl?: string }>)
    .filter(asset => asset.cluster === 'mainnet-beta' && /ondo/i.test(asset.issuer))
    .map(asset => ({ mint: asset.mint, symbol: asset.symbol, name: asset.name, issuer: 'Ondo' as const, underlying: null, market: null, reserveProofUrl: asset.reserveProofUrl ?? null }));
}

function toXStock(raw: unknown): ScreenerAsset | null {
  const parsed = xStockSchema.safeParse(raw);
  if (!parsed.success) return null;
  const asset = parsed.data;
  const mint = asset.deployments?.find(deployment => deployment.network === 'Solana')?.address;
  if (!mint || !isMint(mint)) return null;
  const halted = asset.isTradingHalted === true || asset.trading?.isTradingHalted === true;
  const open = asset.trading?.openNow;
  return {
    mint, symbol: asset.symbol, name: asset.name, issuer: 'xStocks', underlying: asset.underlyingSymbol ?? null,
    market: halted ? 'halted' : open === true ? 'open' : open === false ? 'closed' : null, reserveProofUrl: null,
  };
}

/** Pages are read a few at a time and processed in order until one reports no next page. */
async function readXStocks(deps: Dependencies): Promise<ScreenerAsset[]> {
  const assets: ScreenerAsset[] = [];
  for (let first = 1; first <= XSTOCKS_MAX_PAGES; first += XSTOCKS_PAGES_AT_ONCE) {
    const pages = Array.from({ length: Math.min(XSTOCKS_PAGES_AT_ONCE, XSTOCKS_MAX_PAGES - first + 1) }, (_, offset) => first + offset);
    const bodies = await Promise.all(pages.map(async page => {
      const outcome = await deps.fetchJson(`https://${XSTOCKS_HOST}/api/v2/public/assets?network=Solana&pageSize=${XSTOCKS_PAGE_SIZE}&page=${page}`, [XSTOCKS_HOST], xStocksPageSchema, { maxBytes: XSTOCKS_MAX_BYTES });
      if (outcome.state !== 'ok') throw new Error('xStocks catalog unavailable');
      return xStocksPageSchema.parse(outcome.body);
    }));
    for (const body of bodies) {
      for (const node of body.nodes) { const asset = toXStock(node); if (asset) assets.push(asset); }
      if (!body.page.hasNextPage) return assets;
    }
  }
  return assets;
}

async function mapLimited<T, R>(items: readonly T[], limit: number, task: (item: T) => Promise<R>): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let next = 0;
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (next < items.length) { const index = next++; results[index] = await task(items[index]); }
  }));
  return results;
}

function poolsQuery(side: 'token_x' | 'token_y', mints: readonly string[]): string {
  const url = new URL('/pools', METEORA_DLMM_API);
  url.searchParams.set('filter_by', `${side}=[${mints.join(',')}] && tvl>=${MIN_LISTED_TVL_USD} && is_blacklisted=false`);
  url.searchParams.set('sort_by', 'tvl:desc');
  url.searchParams.set('page_size', String(POOLS_PER_QUERY));
  return url.href;
}

/** Every pool with at least $100 TVL that holds one of the mints, from either side. */
async function readPools(mints: readonly string[], deps: Dependencies): Promise<unknown[]> {
  const chunks: string[][] = [];
  for (let index = 0; index < mints.length; index += MINTS_PER_QUERY) chunks.push(mints.slice(index, index + MINTS_PER_QUERY));
  const queries = chunks.flatMap(chunk => [poolsQuery('token_x', chunk), poolsQuery('token_y', chunk)]);
  const pages = await mapLimited(queries, CONCURRENCY, async query => {
    const outcome = await deps.fetchJson(query, [METEORA_DLMM_HOST], poolPageSchema, { maxBytes: MAX_POOL_BYTES });
    if (outcome.state !== 'ok') throw new Error('Meteora pools unavailable');
    return poolPageSchema.parse(outcome.body).data;
  });
  return pages.flat();
}

const tokenMints = (row: unknown): string[] => {
  const pool = row as { token_x?: { address?: unknown }; token_y?: { address?: unknown } };
  return [pool.token_x?.address, pool.token_y?.address].filter((value): value is string => typeof value === 'string');
};

type Snapshot = { at: number; value: Extract<ScreenerResponse, { state: 'ok' }> };

export function createScreenerStore(deps: Dependencies = defaults) {
  let snapshot: Snapshot | null = null;
  let inflight: Promise<Snapshot> | null = null;
  let catalog: { at: number; assets: ScreenerAsset[] } | null = null;

  async function build(): Promise<Snapshot> {
    const at = deps.now();
    if (!catalog || at - catalog.at > CATALOG_TTL_MS) {
      try { catalog = { at, assets: [...curatedAssets(), ...await readXStocks(deps)] }; }
      catch (error) { if (!catalog) throw error; }
    }
    const assets = catalog.assets;
    const known = new Set(assets.map(asset => asset.mint));
    const rows = await readPools([...known], deps);
    const byMint = new Map<string, unknown[]>();
    for (const row of rows) for (const mint of tokenMints(row)) if (known.has(mint)) byMint.set(mint, [...(byMint.get(mint) ?? []), row]);
    const fetchedAt = new Date(at).toISOString();
    const pools = [...byMint].flatMap(([mint, group]) => {
      const venues = normalizeVenues(mint, [...new Map(group.map(row => [(row as { address?: string }).address, row])).values()], fetchedAt);
      return venues.state === 'ok' ? venues.pools.map(pool => ({ ...pool, mint })) : [];
    });
    const listed = new Set(pools.map(pool => pool.mint));
    const value = screenerResponseSchema.parse({ state: 'ok', fetchedAt, assets: assets.filter(asset => listed.has(asset.mint)), pools, catalogSize: assets.length, stale: false });
    return { at, value: value as Snapshot['value'] };
  }

  function refresh(): Promise<Snapshot> {
    inflight ??= build().then(fresh => { snapshot = fresh; return fresh; }).finally(() => { inflight = null; });
    return inflight;
  }

  return {
    /** A fresh snapshot, a stale one plus the refresh to run after responding, or unavailable. */
    async read(): Promise<{ response: ScreenerResponse; refresh?: () => Promise<unknown> }> {
      const now = deps.now();
      if (snapshot && now - snapshot.at < FRESH_MS) return { response: snapshot.value };
      if (snapshot && now - snapshot.at < MAX_AGE_MS) return { response: { ...snapshot.value, stale: true }, refresh: () => refresh().catch(() => undefined) };
      try { return { response: (await refresh()).value }; }
      catch { return { response: { state: 'unavailable', reason: 'The pool or issuer data could not be read. Try again shortly.' } }; }
    },
  };
}
export const screenerStore = createScreenerStore();
