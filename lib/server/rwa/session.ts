import 'server-only';
import { createHash, createHmac, randomBytes, timingSafeEqual, createPublicKey, verify } from 'node:crypto';
import bs58 from 'bs58';
import { z } from 'zod';
import { addressSchema } from '@/lib/rwa/schema';
import { requestOrigin } from '@/lib/server/rwa/http';

export const SESSION_COOKIE = 'rwa_lens_session';
export const CHALLENGE_COOKIE = 'rwa_lens_challenge';
const NONCE_TTL_MS = 5 * 60 * 1000;
const SESSION_TTL_MS = 7 * 24 * 60 * 60 * 1000;
const PURPOSE = 'save-rwa-observation';

function secret(): string | null {
  const value = (process.env.RWA_SESSION_SECRET ?? '').trim();
  return value.length >= 32 ? value : null;
}

/** Dedicated RWA credentials only. Generic shared-project credentials are never used. */
export function databaseConfig(): { url: string; key: string } | null {
  const url = (process.env.RWA_SUPABASE_URL ?? '').trim();
  const key = (process.env.RWA_SUPABASE_SERVICE_ROLE_KEY ?? '').trim();
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== 'https:' || parsed.username || parsed.password || parsed.pathname !== '/' || !key) return null;
    return { url: parsed.origin, key };
  } catch { return null; }
}

export function configuredOrigin(): string | null {
  try {
    const raw = (process.env.RWA_APP_ORIGIN ?? '').trim();
    const url = new URL(raw);
    if (url.origin !== raw || url.username || url.password) return null;
    if (url.protocol !== 'https:' && !(process.env.NODE_ENV !== 'production' && url.protocol === 'http:' && ['localhost', '127.0.0.1'].includes(url.hostname))) return null;
    return url.origin;
  } catch { return null; }
}

export function sessionsConfigured(): boolean {
  return process.env.RWA_REPORTS_ENABLED === 'true' && !!secret() && !!databaseConfig() && !!configuredOrigin();
}

/** Cookie-authorized writes require the single configured exact origin. */
export function hasExactOrigin(request: Request): boolean {
  const origin = configuredOrigin();
  return !!origin && request.headers.get('origin') === origin && requestOrigin(request) === origin;
}

const challengeSchema = z.object({
  nonce: z.string().regex(/^[A-Za-z0-9_-]{32}$/),
  address: addressSchema,
  browserHash: z.string().regex(/^[a-f0-9]{64}$/),
  origin: z.string().url(),
  uri: z.string().url(),
  cluster: z.enum(['mainnet-beta', 'devnet']),
  purpose: z.literal(PURPOSE),
  issuedAt: z.string().datetime(),
  expiresAt: z.string().datetime(),
  message: z.string().max(2000),
}).strict();
export type Challenge = z.infer<typeof challengeSchema>;

/** Fail closed: there is deliberately no process-memory nonce store. */
async function authRpc(method: string, body: unknown): Promise<unknown> {
  const config = databaseConfig();
  if (!config) throw new Error('Sign-in storage is not configured.');
  const response = await fetch(`${config.url}/rest/v1/rpc/${method}`, {
    method: 'POST', signal: AbortSignal.timeout(3000), cache: 'no-store',
    headers: { apikey: config.key, authorization: `Bearer ${config.key}`, 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!response.ok) throw new Error('Sign-in storage is unavailable.');
  return response.json();
}

function browserHash(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}

export function signInMessage(challenge: Omit<Challenge, 'message'>): string {
  return [
    `${new URL(challenge.origin).host} requests an RWA Lens sign-in`, '',
    'Sign this message to save observation reports to your account.',
    'This is not a transaction and moves no funds.', '',
    `Address: ${challenge.address}`, `URI: ${challenge.uri}`, `Domain: ${challenge.origin}`,
    `Network: solana:${challenge.cluster}`, `Purpose: ${challenge.purpose}`,
    `Nonce: ${challenge.nonce}`, `Browser challenge: ${challenge.browserHash}`,
    `Issued at: ${challenge.issuedAt}`, `Expires at: ${challenge.expiresAt}`,
  ].join('\n');
}

export async function issueNonce(address: string, browserToken: string): Promise<Pick<Challenge, 'nonce' | 'message' | 'expiresAt'>> {
  if (!sessionsConfigured()) throw new Error('Sign-in is disabled.');
  const origin = configuredOrigin()!;
  const cluster = process.env.RWA_CLUSTER === 'mainnet-beta' ? 'mainnet-beta' : 'devnet';
  const issuedAt = Date.now();
  const fields: Omit<Challenge, 'message'> = {
    nonce: randomBytes(24).toString('base64url'), address: addressSchema.parse(address),
    browserHash: browserHash(browserToken), origin, uri: `${origin}/rwa`, cluster, purpose: PURPOSE,
    issuedAt: new Date(issuedAt).toISOString(), expiresAt: new Date(issuedAt + NONCE_TTL_MS).toISOString(),
  };
  const challenge = { ...fields, message: signInMessage(fields) };
  z.object({ stored: z.literal(true) }).strict().parse(await authRpc('rwa_issue_challenge', { p_challenge: challenge }));
  return { nonce: challenge.nonce, message: challenge.message, expiresAt: challenge.expiresAt };
}

/** SQL DELETE ... RETURNING atomically consumes the stored exact message across instances. */
export async function consumeNonce(nonce: string, address: string, browserToken: string): Promise<Challenge | null> {
  if (!sessionsConfigured() || !browserToken) return null;
  const value = await authRpc('rwa_consume_challenge', {
    p_nonce: nonce, p_address: address, p_browser_hash: browserHash(browserToken), p_origin: configuredOrigin(),
  });
  const parsed = challengeSchema.safeParse(value);
  if (!parsed.success) return null;
  const challenge = parsed.data;
  const origin = configuredOrigin();
  const cluster = process.env.RWA_CLUSTER === 'mainnet-beta' ? 'mainnet-beta' : 'devnet';
  if (challenge.address !== address || challenge.nonce !== nonce || challenge.browserHash !== browserHash(browserToken)
    || challenge.origin !== origin || challenge.uri !== `${origin}/rwa` || challenge.cluster !== cluster
    || Date.parse(challenge.expiresAt) <= Date.now() || Date.parse(challenge.issuedAt) > Date.now()
    || Date.parse(challenge.expiresAt) - Date.parse(challenge.issuedAt) > NONCE_TTL_MS
    || challenge.message !== signInMessage(challenge)) return null;
  return challenge;
}

/**
 * Ed25519 points of small order. RFC 8032 verification accepts these as public keys,
 * so an all-zero signature validates against them for roughly one message in four:
 * a signature that proves possession of no key at all. Node and OpenSSL do not filter
 * them, so we must. These are the eight canonical encodings.
 */
const SMALL_ORDER_KEYS = new Set([
  '0000000000000000000000000000000000000000000000000000000000000000',
  '0000000000000000000000000000000000000000000000000000000000000080',
  '0100000000000000000000000000000000000000000000000000000000000000',
  'ecffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff7f',
  '26e8958fc2b227b045c3f489f2ef98f0d5dfac05d3c63339b13802886d53fc05',
  '26e8958fc2b227b045c3f489f2ef98f0d5dfac05d3c63339b13802886d53fc85',
  'c7176a703d4dd84fba3c0b760d10670f2a2053fa2c39ccc64ec7fd7792ac037a',
  'c7176a703d4dd84fba3c0b760d10670f2a2053fa2c39ccc64ec7fd7792ac03fa',
]);

/** Node's maintained Ed25519 implementation verifies the exact stored message. */
export function verifyChallenge(challenge: Challenge, signature: string): boolean {
  try {
    const publicKey = bs58.decode(challenge.address);
    const signatureBytes = bs58.decode(signature);
    if (publicKey.length !== 32 || signatureBytes.length !== 64) return false;
    // No real wallet holds one of these, and accepting one authenticates nobody.
    if (SMALL_ORDER_KEYS.has(Buffer.from(publicKey).toString('hex'))) return false;
    // R is the first half of the signature; the identity element proves nothing.
    if (signatureBytes.subarray(0, 32).every(byte => byte === 0)) return false;
    const key = createPublicKey({ key: Buffer.concat([Buffer.from('302a300506032b6570032100', 'hex'), Buffer.from(publicKey)]), format: 'der', type: 'spki' });
    return verify(null, Buffer.from(challenge.message), key, signatureBytes);
  } catch { return false; }
}

export function createSessionToken(address: string): string | null {
  const key = secret();
  if (!key || !sessionsConfigured() || !addressSchema.safeParse(address).success) return null;
  const payload = Buffer.from(JSON.stringify({ address, expiresAt: Date.now() + SESSION_TTL_MS, origin: configuredOrigin(), purpose: PURPOSE })).toString('base64url');
  return `${payload}.${createHmac('sha256', key).update(payload).digest('base64url')}`;
}

export function readSessionToken(token: string | undefined): { address: string } | null {
  const key = secret();
  if (!key || !sessionsConfigured() || !token || token.length > 2000) return null;
  const parts = token.split('.');
  if (parts.length !== 2 || parts.some(part => !/^[A-Za-z0-9_-]+$/.test(part))) return null;
  const [payload, signature] = parts;
  const expected = createHmac('sha256', key).update(payload).digest('base64url');
  if (signature.length !== expected.length || !timingSafeEqual(Buffer.from(signature), Buffer.from(expected))) return null;
  try {
    const data = z.object({ address: addressSchema, expiresAt: z.number().int().finite(), origin: z.literal(configuredOrigin()!), purpose: z.literal(PURPOSE) }).strict().parse(JSON.parse(Buffer.from(payload, 'base64url').toString('utf8')));
    if (data.expiresAt <= Date.now() || data.expiresAt > Date.now() + SESSION_TTL_MS) return null;
    return { address: data.address };
  } catch { return null; }
}

export const SESSION_COOKIE_OPTIONS = { httpOnly: true, sameSite: 'strict' as const, secure: process.env.NODE_ENV === 'production', path: '/', maxAge: SESSION_TTL_MS / 1000 };
export const CHALLENGE_COOKIE_OPTIONS = { ...SESSION_COOKIE_OPTIONS, maxAge: NONCE_TTL_MS / 1000 };
