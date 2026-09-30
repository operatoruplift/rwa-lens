import 'server-only';
import { addressSchema } from '@/lib/rwa/schema';
import { METEORA_DLMM_API, METEORA_DLMM_HOST, USDC_MINT_ADDRESS, normalizeVenues, upstreamPoolSchema, type VenuesResponse } from '@/lib/rwa/venues';
import { fetchAllowedJson, type MetadataOutcome } from '../metadata-fetch';

type Dependencies = { fetchJson: (uri: string) => Promise<MetadataOutcome>; now: () => number };
const defaults: Dependencies = {
  // The fixed pool endpoint uses the same DNS-pinned HTTPS reader, five-second
  // deadline, 128 KB bound and redirect rejection as other market-data reads.
  fetchJson: uri => fetchAllowedJson(uri, [METEORA_DLMM_HOST], upstreamPoolSchema),
  now: Date.now,
};

/** Validate the selected pool independently of the inspector's five-row display. */
export function createSelectedPoolReader(deps: Dependencies = defaults) {
  return async (mint: string, pool: string): Promise<VenuesResponse> => {
    if (!addressSchema.safeParse(mint).success || !addressSchema.safeParse(pool).success) {
      return { state: 'unavailable', reason: 'The selected mint or pool address is invalid.' };
    }
    let outcome: MetadataOutcome;
    try { outcome = await deps.fetchJson(`${METEORA_DLMM_API}/pools/${pool}`); }
    catch { return { state: 'unavailable', reason: 'Meteora’s selected pool could not be reached.' }; }
    if (outcome.state !== 'ok') return { state: 'unavailable', reason: 'Meteora’s selected pool could not be read.' };
    const parsed = upstreamPoolSchema.safeParse(outcome.body);
    if (!parsed.success || parsed.data.address !== pool) return { state: 'unavailable', reason: 'Meteora’s response did not match the selected pool.' };
    const row = parsed.data;
    const pairsUsdc = mint !== USDC_MINT_ADDRESS && (
      (row.token_x.address === mint && row.token_y.address === USDC_MINT_ADDRESS)
      || (row.token_y.address === mint && row.token_x.address === USDC_MINT_ADDRESS)
    );
    // The shared normalizer enforces exact mint, TVL floor and blacklist policy.
    // One selected row cannot be removed by the inspector's display limit.
    return normalizeVenues(mint, pairsUsdc ? [row] : [], new Date(deps.now()).toISOString());
  };
}

export const readSelectedPool = createSelectedPoolReader();
