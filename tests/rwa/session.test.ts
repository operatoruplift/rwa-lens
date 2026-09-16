import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import nacl from 'tweetnacl';
import bs58 from 'bs58';
import {
  consumeNonce,
  createSessionToken,
  issueNonce,
  readSessionToken,
  resetNonces,
  sessionsConfigured,
  signInMessage,
} from '@/lib/server/rwa/session';

const SECRET = 'a'.repeat(48);
const ADDRESS = 'XsbEhLAtcf6HdfpFZ5xEMdqW8nfAvcsP5bdudRLJzJp';

beforeEach(() => {
  resetNonces();
  vi.stubEnv('RWA_SESSION_SECRET', SECRET);
});
afterEach(() => vi.unstubAllEnvs());

describe('sign-in message', () => {
  it('says plainly that it is not a transaction', () => {
    const message = signInMessage(ADDRESS, 'nonce-value');
    expect(message).toMatch(/not a transaction/i);
    expect(message).toMatch(/moves no funds/i);
    expect(message).toContain(ADDRESS);
    expect(message).toContain('nonce-value');
  });
});

describe('nonces', () => {
  it('are single use — a replay finds nothing', () => {
    const { nonce } = issueNonce(ADDRESS);
    expect(consumeNonce(nonce, ADDRESS)).toBe(true);
    expect(consumeNonce(nonce, ADDRESS)).toBe(false);
  });

  it('are bound to the address that requested them', () => {
    const { nonce } = issueNonce(ADDRESS);
    expect(consumeNonce(nonce, 'XspzcW1PRtgf6Wj92HCiZdjzKCyFekVD8P5Ueh3dRMX')).toBe(false);
  });

  it('reject an unknown value', () => {
    expect(consumeNonce('never-issued', ADDRESS)).toBe(false);
  });

  it('expire', () => {
    const { nonce } = issueNonce(ADDRESS);
    vi.useFakeTimers();
    vi.setSystemTime(Date.now() + 6 * 60 * 1000);
    expect(consumeNonce(nonce, ADDRESS)).toBe(false);
    vi.useRealTimers();
  });
});

describe('session tokens', () => {
  it('round-trip the address they were issued for', () => {
    const token = createSessionToken(ADDRESS)!;
    expect(readSessionToken(token)).toEqual({ address: ADDRESS });
  });

  it('reject a tampered payload', () => {
    const token = createSessionToken(ADDRESS)!;
    const [payload, signature] = token.split('.');
    const forgedPayload = Buffer.from(`EvilAddress.${Date.now() + 100000}`).toString('base64url');
    expect(readSessionToken(`${forgedPayload}.${signature}`)).toBeNull();
    expect(readSessionToken(`${payload}.not-the-signature`)).toBeNull();
  });

  it('reject a token signed with a different secret', () => {
    const token = createSessionToken(ADDRESS)!;
    vi.stubEnv('RWA_SESSION_SECRET', 'b'.repeat(48));
    expect(readSessionToken(token)).toBeNull();
  });

  it('reject an expired token', () => {
    const token = createSessionToken(ADDRESS)!;
    vi.useFakeTimers();
    vi.setSystemTime(Date.now() + 8 * 24 * 60 * 60 * 1000);
    expect(readSessionToken(token)).toBeNull();
    vi.useRealTimers();
  });

  it.each([undefined, '', 'garbage', 'a.b.c'])('reject malformed token %s', value => {
    expect(readSessionToken(value as string | undefined)).toBeNull();
  });

  it('are disabled without a long enough secret', () => {
    vi.stubEnv('RWA_SESSION_SECRET', 'too-short');
    expect(sessionsConfigured()).toBe(false);
    expect(createSessionToken(ADDRESS)).toBeNull();
  });
});

describe('signature verification, as the route performs it', () => {
  it('accepts a real ed25519 signature over the exact challenge message', () => {
    const pair = nacl.sign.keyPair();
    const address = bs58.encode(pair.publicKey);
    const { nonce } = issueNonce(address);
    const message = new TextEncoder().encode(signInMessage(address, nonce));
    const signature = nacl.sign.detached(message, pair.secretKey);

    expect(consumeNonce(nonce, address)).toBe(true);
    expect(nacl.sign.detached.verify(message, signature, bs58.decode(address))).toBe(true);
  });

  it('rejects a signature over a different nonce', () => {
    const pair = nacl.sign.keyPair();
    const address = bs58.encode(pair.publicKey);
    const signature = nacl.sign.detached(new TextEncoder().encode(signInMessage(address, 'other-nonce')), pair.secretKey);
    const expected = new TextEncoder().encode(signInMessage(address, 'real-nonce'));
    expect(nacl.sign.detached.verify(expected, signature, bs58.decode(address))).toBe(false);
  });

  it('rejects a valid signature from a different keypair', () => {
    const victim = nacl.sign.keyPair();
    const attacker = nacl.sign.keyPair();
    const address = bs58.encode(victim.publicKey);
    const message = new TextEncoder().encode(signInMessage(address, 'nonce'));
    const signature = nacl.sign.detached(message, attacker.secretKey);
    expect(nacl.sign.detached.verify(message, signature, victim.publicKey)).toBe(false);
  });
});
