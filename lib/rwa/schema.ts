import { z } from 'zod';
import bs58 from 'bs58';

/** Base58 without the ambiguous characters. Solana addresses are 32-44 chars. */
const BASE58_ADDRESS = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/;

export const MAX_ADDRESS_LENGTH = 64;

export const addressSchema = z
  .string()
  .trim()
  .max(MAX_ADDRESS_LENGTH, 'Address is too long.')
  .regex(BASE58_ADDRESS, 'Enter a valid base58 Solana address.')
  .refine(value => {
    try { return bs58.decode(value).length === 32; } catch { return false; }
  }, 'A Solana address must decode to exactly 32 bytes.');

export const clusterSchema = z.enum(['devnet', 'mainnet-beta']);

export const fixtureIdSchema = z.enum(['treasury-scaled', 'credit-hooked', 'plain-spl']);

const liveRequestSchema = z.object({
  mode: z.literal('live'),
  cluster: clusterSchema,
  mint: addressSchema,
  owner: addressSchema.optional(),
}).strict();
const fixtureRequestSchema = z.object({
  mode: z.literal('fixture'),
  fixtureId: fixtureIdSchema,
  scenario: z.enum(['before', 'at', 'after']).default('before'),
}).strict();
/** The previous live-only shape is migrated explicitly; mixed fixture identities are rejected. */
export const inspectRequestSchema = z.preprocess(value => {
  if (value && typeof value === 'object' && !Array.isArray(value) && !('mode' in value) && !('fixtureId' in value)) {
    return { ...value, mode: 'live' };
  }
  return value;
}, z.discriminatedUnion('mode', [liveRequestSchema, fixtureRequestSchema]));

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
    if (url.username || url.password || (url.port && url.port !== '443')) return false;
    if (url.hostname.includes(':') || url.hostname.startsWith('[')) return false;
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

export const reportCreateSchema = z.object({ request: inspectRequestSchema }).strict();

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
    return allowed.some(entry => host === entry);
  } catch {
    return false;
  }
}

const integerString = z.string().regex(/^\d+$/).max(100);
const text = z.string().max(10000);
const observedAddress = z.string().min(1).max(64); // Synthetic identities are labels, never live request addresses.
const timestampSchema = z.string().datetime();
export const registryAssetSchema = z.object({
  issuer: z.string().max(200).optional(), assetClass: z.string().max(120).optional(),
  documentationUrl: metadataUriSchema.optional(), reserveProofUrl: metadataUriSchema.optional(),
  jurisdiction: z.string().max(120).optional(), redemption: z.string().max(2000).optional(),
  source: z.string().max(2048), fetchedAt: timestampSchema, stale: z.boolean().optional(),
});
const sourceSchema = z.object({
  label: text, method: text, status: z.enum(['ok', 'failed', 'skipped']), detail: text.optional(),
  slot: integerString.optional(), blockTime: timestampSchema.optional(), commitment: z.enum(['confirmed', 'finalized']).optional(),
});
const displaySchema = z.object({
  rawAmount: integerString, standardUiAmount: text.optional(), extensionUiAmount: text.optional(),
  multiplier: text.optional(), pendingMultiplier: text.optional(), effectiveAt: timestampSchema.optional(),
  boundary: z.enum(['before', 'at', 'after', 'none', 'unknown']).optional(),
  rounding: z.enum(['exact-decimal', 'official-helper', 'rounded-for-display', 'unavailable']), note: text.optional(),
});
export const inspectResultSchema = z.object({
  status: z.enum(['verified', 'partial', 'unavailable', 'invalid']),
  mode: z.enum(['live', 'fixture', 'recorded']),
  balanceStatus: z.enum(['not-requested', 'observed', 'partial', 'unavailable']),
  identity: z.object({
    mint: observedAddress, tokenProgram: z.enum(['token-2022', 'spl-token', 'unknown']), tokenProgramAddress: observedAddress,
    decimals: z.number().int().min(0).max(255), supply: integerString.optional(),
    mintAuthority: observedAddress.optional(), freezeAuthority: observedAddress.optional(), isInitialized: z.boolean(),
    metadata: z.object({
      name: text.optional(), symbol: text.optional(), uri: text.optional(),
      uriFetch: z.enum(['ok', 'skipped', 'blocked', 'failed', 'not-configured']),
      additional: z.array(z.object({ key: text, value: text })).max(100).optional(),
    }).optional(),
  }).optional(),
  balances: z.object({
    owner: observedAddress.optional(), accounts: z.array(z.object({
      tokenAccount: observedAddress, owner: observedAddress, rawAmount: integerString,
      decimals: z.number().int().min(0).max(255), state: z.enum(['initialized', 'frozen', 'uninitialized', 'unknown']),
      extensions: z.array(text),
    })).max(1000), complete: z.boolean(), accountLimit: z.number().int().positive().optional(),
    totalRawAmount: integerString, display: displaySchema,
  }).optional(),
  extensions: z.array(z.object({
    kind: text, scope: z.enum(['mint', 'account']), severity: z.enum(['info', 'attention', 'blocking', 'opaque']),
    impact: text, authorities: z.array(z.object({ role: text, address: observedAddress })),
    fields: z.array(z.object({ label: text, value: text })), calculationUnavailable: z.boolean(),
    inactive: z.boolean().optional(), byteLength: z.number().int().nonnegative().optional(),
  })),
  transferReadiness: z.object({
    verdict: z.enum(['ready', 'attention', 'blocked', 'unknown']), knownBlock: z.boolean().optional(), unknownChecks: z.boolean().optional(),
    reasons: z.array(z.object({ verdict: z.enum(['ready', 'attention', 'blocked', 'unknown']), check: text, detail: text, evidence: text.optional() })),
    disclaimer: text,
  }).optional(),
  registry: registryAssetSchema.nullable().optional(),
  provenance: z.object({
    mode: z.enum(['live', 'fixture', 'recorded']), cluster: clusterSchema, rpcProvider: text, fetchedAt: timestampSchema,
    slot: integerString.optional(), blockTime: timestampSchema.optional(), commitment: z.enum(['confirmed', 'finalized']),
    decoderVersion: text, cacheAgeMs: z.number().nonnegative().optional(),
    timeSource: z.enum(['chain', 'block-time-estimate', 'local-estimate', 'fixture']),
    clockTimestamp: timestampSchema.optional(), clockSlot: integerString.optional(), observedTimestamp: timestampSchema.optional(), slotSpread: integerString.optional(),
    sources: z.array(sourceSchema),
  }),
  warnings: z.array(text), limitations: z.array(text), message: text.optional(),
}).superRefine((value, context) => {
  if (value.mode !== value.provenance.mode) context.addIssue({ code: 'custom', message: 'Observation and provenance modes must match.' });
  if (value.mode === 'live' && value.identity && !addressSchema.safeParse(value.identity.mint).success) context.addIssue({ code: 'custom', message: 'Live identity must be a valid mint address.' });
  if (value.balanceStatus === 'not-requested' || value.balanceStatus === 'unavailable') {
    if (value.balances) context.addIssue({ code: 'custom', message: 'Unavailable or unrequested balances must not fabricate a total.' });
  } else if (!value.balances) context.addIssue({ code: 'custom', message: 'Observed balances need account evidence.' });
});

export const persistedReportSchema = z.object({
  id: reportIdSchema, owner: addressSchema, cluster: clusterSchema, mint: observedAddress,
  inspectedOwner: observedAddress.optional(), createdAt: timestampSchema, decoderVersion: text,
  mode: z.enum(['live', 'fixture', 'recorded']), contentHash: z.string().regex(/^[a-f0-9]{64}$/), observation: inspectResultSchema,
});
