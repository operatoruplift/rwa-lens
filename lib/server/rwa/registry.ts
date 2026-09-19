import 'server-only';
import { z } from 'zod';
import { metadataUriSchema, parseAllowedHosts, registryAssetSchema } from '@/lib/rwa/schema';
import type { Cluster, RegistryAsset } from '@/lib/rwa/types';
import liveAssets from '@/lib/rwa/live-assets.json';
import { fetchAllowedJson } from './metadata-fetch';

export interface RwaRegistryAdapter { getAsset(mint: string, signal: AbortSignal): Promise<RegistryAsset | null> }
export interface NavAdapter { getNav(mint: string, signal: AbortSignal): Promise<{ value: string; currency: string; asOf: string; source: string } | null> }
const registryBodySchema = z.object({
  issuer: z.string().max(200).optional(), assetClass: z.string().max(120).optional(),
  documentationUrl: metadataUriSchema.optional(), reserveProofUrl: metadataUriSchema.optional(),
  jurisdiction: z.string().max(120).optional(), redemption: z.string().max(2000).optional(),
});
const STALE_AFTER_MS = 24 * 60 * 60 * 1000;
export function registryConfigured(): boolean { return Boolean((process.env.RWA_REGISTRY_URL ?? '').trim()); }
class HttpRegistryAdapter implements RwaRegistryAdapter {
  constructor(private readonly endpoint: string) {}
  async getAsset(mint: string, signal: AbortSignal): Promise<RegistryAsset | null> {
    if (signal.aborted) return null;
    const url = `${this.endpoint.replace(/\/$/, '')}/${encodeURIComponent(mint)}`;
    const outcome = await fetchAllowedJson(url, parseAllowedHosts(process.env.RWA_REGISTRY_ALLOWED_HOSTS), registryBodySchema);
    if (outcome.state !== 'ok' || signal.aborted) return null;
    return registryAssetSchema.parse({ ...outcome.body, source: url, fetchedAt: outcome.fetchedAt, stale: false });
  }
}
export function getRegistryAdapter(): RwaRegistryAdapter | null {
  const endpoint = (process.env.RWA_REGISTRY_URL ?? '').trim();
  return endpoint ? new HttpRegistryAdapter(endpoint) : null;
}
/** Official-source attribution is separate from on-chain decoding and is never backing verification. */
export async function lookupRegistry(mint: string, cluster?: Cluster): Promise<RegistryAsset | null> {
  const curated = liveAssets.find(asset => asset.mint === mint && asset.cluster === cluster);
  const fallback = curated ? registryAssetSchema.parse({ issuer: curated.issuer, assetClass: curated.category, documentationUrl: curated.addressSourceUrl, source: curated.addressSourceUrl, fetchedAt: curated.retrievedAtUtc, stale: Date.now() - Date.parse(curated.retrievedAtUtc) > STALE_AFTER_MS }) : null;
  const adapter = getRegistryAdapter();
  if (!adapter) return fallback;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 5000);
  try {
    const asset = await adapter.getAsset(mint, controller.signal);
    if (!asset) return fallback;
    const parsed = registryAssetSchema.safeParse(asset);
    if (!parsed.success) return fallback;
    return { ...parsed.data, stale: Date.now() - Date.parse(parsed.data.fetchedAt) > STALE_AFTER_MS };
  } catch { return fallback; } finally { clearTimeout(timer); }
}
export function getNavAdapter(): NavAdapter | null { return null; }
