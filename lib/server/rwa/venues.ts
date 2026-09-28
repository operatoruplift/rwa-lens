import 'server-only';
import { METEORA_DLMM_HOST, normalizeVenues, upstreamPageSchema, venuesUpstreamUrl, type VenuesResponse } from '@/lib/rwa/venues';
import { fetchAllowedJson, type MetadataOutcome } from './metadata-fetch';

const CACHE_TTL_MS = 60_000;
const MAX_CACHE_ENTRIES = 500;

type FetchJson = (uri: string) => Promise<MetadataOutcome>;
type Dependencies = { fetchJson: FetchJson; now: () => number };
const defaults: Dependencies = {
  // The same DNS-pinned, bounded, redirect-free HTTPS reader used for issuer metadata,
  // with the allowlist fixed to Meteora's data host. No caller supplies a URL.
  fetchJson: uri => fetchAllowedJson(uri, [METEORA_DLMM_HOST], upstreamPageSchema),
  now: Date.now,
};

/** Read-through cache per mint. Failures are not cached, so a recovered upstream is visible on the next request. */
export function createVenueReader(deps: Dependencies = defaults) {
  const cache = new Map<string, { at: number; value: Extract<VenuesResponse, { state: 'ok' | 'none' }> }>();
  return async (mint: string): Promise<VenuesResponse> => {
    const now = deps.now();
    const cached = cache.get(mint);
    if (cached && now - cached.at < CACHE_TTL_MS) {
      return cached.value.state === 'ok' ? { ...cached.value, cacheAgeMs: Math.max(0, Math.floor(now - cached.at)) } : cached.value;
    }
    let outcome: MetadataOutcome;
    try { outcome = await deps.fetchJson(venuesUpstreamUrl(mint)); }
    catch { return { state: 'unavailable', reason: 'Meteora’s data API could not be reached. Inspection results are unaffected.' }; }
    if (outcome.state !== 'ok') return { state: 'unavailable', reason: 'Meteora’s data API did not return a usable pool list. Inspection results are unaffected.' };
    const page = upstreamPageSchema.safeParse(outcome.body);
    if (!page.success) return { state: 'unavailable', reason: 'Meteora’s pool list did not match the expected shape.' };
    const value = normalizeVenues(mint, page.data.data, new Date(now).toISOString());
    if (cache.size >= MAX_CACHE_ENTRIES) cache.delete(cache.keys().next().value!);
    cache.set(mint, { at: now, value });
    return value;
  };
}
export const readVenues = createVenueReader();
