import { z } from 'zod';

/** Base58 without the ambiguous characters. Solana addresses are 32-44 chars. */
const BASE58_ADDRESS = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/;

export const MAX_ADDRESS_LENGTH = 64;

export const addressSchema = z
  .string()
  .trim()
  .max(MAX_ADDRESS_LENGTH, 'Address is too long.')
  .regex(BASE58_ADDRESS, 'Enter a valid base58 Solana address.');

export const clusterSchema = z.enum(['devnet', 'mainnet-beta']);

export const fixtureIdSchema = z
  .string()
  .trim()
  .max(64)
  .regex(/^[a-z0-9-]+$/, 'Unknown fixture.');

export const inspectRequestSchema = z.object({
  cluster: clusterSchema,
  mint: addressSchema,
  owner: addressSchema.optional(),
  fixtureId: fixtureIdSchema.optional(),
});

export type InspectRequestInput = z.infer<typeof inspectRequestSchema>;

/**
 * Metadata URIs are untrusted. Only https and a configured ipfs gateway are
 * accepted, and private / loopback / link-local hosts are rejected outright so
 * a token's metadata pointer can never drive a request into the local network.
 */
const PRIVATE_HOST = /^(localhost$|127\.|10\.|0\.|169\.254\.|::1$|\[::1\]$|192\.168\.|172\.(1[6-9]|2\d|3[01])\.|.*\.local$|.*\.internal$)/i;

export const metadataUriSchema = z
  .string()
  .trim()
  .max(2048)
  .refine(value => {
    let url: URL;
    try {
      url = new URL(value);
    } catch {
      return false;
    }
    if (url.protocol !== 'https:') return false;
    if (PRIVATE_HOST.test(url.hostname)) return false;
    // A bare IPv4 literal is never a legitimate metadata host here.
    if (/^\d+\.\d+\.\d+\.\d+$/.test(url.hostname)) return false;
    return true;
  }, 'Metadata URI must be https and must not target a private or loopback host.');

export const metadataRequestSchema = z.object({
  uri: metadataUriSchema,
  mint: addressSchema,
});

/** The normalised metadata body we are willing to render. */
export const metadataBodySchema = z.object({
  name: z.string().max(200).optional(),
  symbol: z.string().max(40).optional(),
  description: z.string().max(4000).optional(),
  image: z.string().max(2048).optional(),
  external_url: z.string().max(2048).optional(),
});

export const reportCreateSchema = z.object({
  cluster: clusterSchema,
  mint: addressSchema,
  owner: addressSchema.optional(),
  observation: z.unknown(),
});

export const reportIdSchema = z
  .string()
  .trim()
  .uuid('Unknown report.');

/** Host allowlists arrive as comma-separated env values. */
export function parseAllowedHosts(raw: string | undefined): string[] {
  if (!raw) return [];
  return raw
    .split(',')
    .map(host => host.trim().toLowerCase())
    .filter(Boolean)
    .slice(0, 50);
}

export function isHostAllowed(uri: string, allowed: string[]): boolean {
  if (allowed.length === 0) return false;
  try {
    const host = new URL(uri).hostname.toLowerCase();
    return allowed.some(entry => host === entry || host.endsWith(`.${entry}`));
  } catch {
    return false;
  }
}
