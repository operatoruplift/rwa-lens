import 'server-only';
import { z } from 'zod';
import { isHostAllowed, parseAllowedHosts } from '@/lib/rwa/schema';
import type { RegistryAsset } from '@/lib/rwa/types';

/**
 * Optional issuer metadata and NAV.
 *
 * Both are disabled unless an operator configures an endpoint, and **no issuer
 * endpoint is hard-coded anywhere in this file**. Whatever a registry returns is
 * issuer-supplied description, never on-chain proof, and it is labelled that way
 * everywhere it surfaces. Neither adapter can fail the core inspection.
 */

export interface RwaRegistryAdapter {
  getAsset(mint: string, signal: AbortSignal): Promise<RegistryAsset | null>;
}

export interface NavAdapter {
  getNav(
    mint: string,
    signal: AbortSignal,
  ): Promise<{ value: string; currency: string; asOf: string; source: string } | null>;
}

const registrySchema = z.object({
  issuer: z.string().max(200).optional(),
  assetClass: z.string().max(120).optional(),
  documentationUrl: z.string().max(2048).optional(),
  reserveProofUrl: z.string().max(2048).optional(),
  jurisdiction: z.string().max(120).optional(),
  redemption: z.string().max(2000).optional(),
});

/** Anything older than this is shown as stale rather than presented as current. */
const STALE_AFTER_MS = 24 * 60 * 60 * 1000;
const TIMEOUT_MS = 5000;

export function registryConfigured(): boolean {
  return Boolean((process.env.RWA_REGISTRY_URL ?? '').trim());
}

class HttpRegistryAdapter implements RwaRegistryAdapter {
  constructor(private readonly endpoint: string) {}

  async getAsset(mint: string, signal: AbortSignal): Promise<RegistryAsset | null> {
    const allowed = parseAllowedHosts(process.env.RWA_REGISTRY_ALLOWED_HOSTS);
    const url = `${this.endpoint.replace(/\/$/, '')}/${encodeURIComponent(mint)}`;
    if (!isHostAllowed(url, allowed)) return null;

    try {
      const response = await fetch(url, { signal, redirect: 'error', headers: { accept: 'application/json' } });
      if (!response.ok) return null;
      const parsed = registrySchema.safeParse(await response.json());
      if (!parsed.success) return null;

      const fetchedAt = new Date().toISOString();
      let host = 'registry';
      try {
        host = new URL(url).hostname;
      } catch {
        host = 'registry';
      }
      return { ...parsed.data, source: host, fetchedAt, stale: false };
    } catch {
      // A registry failure is never allowed to fail an inspection.
      return null;
    }
  }
}

export function getRegistryAdapter(): RwaRegistryAdapter | null {
  const endpoint = (process.env.RWA_REGISTRY_URL ?? '').trim();
  if (!endpoint) return null;
  return new HttpRegistryAdapter(endpoint);
}

/**
 * Looks up issuer metadata when configured. Returns null — never a fabricated
 * record — when the adapter is off, times out or answers with something
 * unexpected.
 */
export async function lookupRegistry(mint: string): Promise<RegistryAsset | null> {
  const adapter = getRegistryAdapter();
  if (!adapter) return null;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const asset = await adapter.getAsset(mint, controller.signal);
    if (!asset) return null;
    const age = Date.now() - Date.parse(asset.fetchedAt);
    return { ...asset, stale: Number.isFinite(age) ? age > STALE_AFTER_MS : true };
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

/**
 * No NAV source is configured in this release. The interface exists so a price
 * can be added behind an explicit adapter later; until then the app shows no
 * fiat value at all rather than inventing one.
 */
export function getNavAdapter(): NavAdapter | null {
  return null;
}
