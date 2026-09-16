import 'server-only';
import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';

/**
 * Wallet sign-in for saved reports.
 *
 * The wallet is asked for a **message signature only** — never a transaction,
 * never a key. The server issues a single-use nonce, verifies the signature
 * against it, and issues an HttpOnly cookie. Guest inspection never touches any
 * of this.
 */

export const SESSION_COOKIE = 'rwa_lens_session';
const NONCE_TTL_MS = 5 * 60 * 1000;
const SESSION_TTL_MS = 7 * 24 * 60 * 60 * 1000;
const MAX_NONCES = 5000;

type NonceEntry = { address: string; expiresAt: number };
const nonces = new Map<string, NonceEntry>();

function secret(): string | null {
  const value = (process.env.RWA_SESSION_SECRET ?? '').trim();
  return value.length >= 32 ? value : null;
}

export function sessionsConfigured(): boolean {
  return secret() !== null;
}

export function issueNonce(address: string): { nonce: string; message: string; expiresAt: string } {
  if (nonces.size > MAX_NONCES) nonces.clear();
  const nonce = randomBytes(24).toString('base64url');
  const expiresAt = Date.now() + NONCE_TTL_MS;
  nonces.set(nonce, { address, expiresAt });
  return {
    nonce,
    message: signInMessage(address, nonce),
    expiresAt: new Date(expiresAt).toISOString(),
  };
}

/** The exact bytes the wallet is asked to sign. Deliberately unmistakable. */
export function signInMessage(address: string, nonce: string): string {
  return [
    'RWA Lens sign-in',
    '',
    'Signing this message proves you control this address so RWA Lens can save',
    'reports to your account. It is not a transaction and moves no funds.',
    '',
    `Address: ${address}`,
    `Nonce: ${nonce}`,
  ].join('\n');
}

/** Single use: a nonce is consumed on first check, so a replay finds nothing. */
export function consumeNonce(nonce: string, address: string): boolean {
  const entry = nonces.get(nonce);
  if (!entry) return false;
  nonces.delete(nonce);
  if (entry.expiresAt < Date.now()) return false;
  return entry.address === address;
}

export function createSessionToken(address: string): string | null {
  const key = secret();
  if (!key) return null;
  const expiresAt = Date.now() + SESSION_TTL_MS;
  const payload = `${address}.${expiresAt}`;
  const signature = createHmac('sha256', key).update(payload).digest('base64url');
  return `${Buffer.from(payload).toString('base64url')}.${signature}`;
}

export function readSessionToken(token: string | undefined): { address: string } | null {
  const key = secret();
  if (!key || !token) return null;
  const [encodedPayload, signature] = token.split('.');
  if (!encodedPayload || !signature) return null;

  let payload: string;
  try {
    payload = Buffer.from(encodedPayload, 'base64url').toString('utf8');
  } catch {
    return null;
  }

  const expected = createHmac('sha256', key).update(payload).digest('base64url');
  const given = Buffer.from(signature);
  const want = Buffer.from(expected);
  // Constant-time compare so a forged token cannot be tuned byte by byte.
  if (given.length !== want.length || !timingSafeEqual(given, want)) return null;

  const [address, expiresAt] = payload.split('.');
  if (!address || !expiresAt) return null;
  if (Number.parseInt(expiresAt, 10) < Date.now()) return null;
  return { address };
}

export const SESSION_COOKIE_OPTIONS = {
  httpOnly: true,
  sameSite: 'lax' as const,
  secure: process.env.NODE_ENV === 'production',
  path: '/',
  maxAge: SESSION_TTL_MS / 1000,
};

/** Test-only reset so nonce state never leaks between cases. */
export function resetNonces(): void {
  nonces.clear();
}
