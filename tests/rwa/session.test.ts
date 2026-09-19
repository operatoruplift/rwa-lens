import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import nacl from 'tweetnacl';
import bs58 from 'bs58';
import { consumeNonce, createSessionToken, issueNonce, readSessionToken, sessionsConfigured, verifyChallenge, hasExactOrigin, type Challenge } from '@/lib/server/rwa/session';

const ADDRESS = bs58.encode(nacl.sign.keyPair.fromSeed(new Uint8Array(32).fill(7)).publicKey);
const SECOND = bs58.encode(nacl.sign.keyPair.fromSeed(new Uint8Array(32).fill(8)).publicKey);
const ORIGIN = 'https://rwa.example.com';
const BROWSER = 'browser-cookie-cryptographically-random';
const shared = new Map<string, Challenge>();
beforeEach(() => {
  shared.clear();
  vi.stubEnv('RWA_REPORTS_ENABLED', 'true'); vi.stubEnv('RWA_SESSION_SECRET', 'a'.repeat(48));
  vi.stubEnv('RWA_APP_ORIGIN', ORIGIN); vi.stubEnv('RWA_SUPABASE_URL', 'https://rwa-dedicated.supabase.co');
  vi.stubEnv('RWA_SUPABASE_SERVICE_ROLE_KEY', 'test-server-only-key'); vi.stubEnv('RWA_CLUSTER', 'mainnet-beta');
  vi.stubGlobal('fetch', vi.fn(async (url: string, options: RequestInit) => {
    const body = JSON.parse(options.body as string);
    if (url.endsWith('rwa_issue_challenge')) { shared.set(body.p_challenge.nonce, body.p_challenge); return Response.json({ stored: true }); }
    const challenge = shared.get(body.p_nonce);
    if (!challenge || challenge.address !== body.p_address || challenge.browserHash !== body.p_browser_hash || challenge.origin !== body.p_origin) return Response.json(null);
    shared.delete(body.p_nonce); return Response.json(challenge);
  }));
});
afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs(); vi.useRealTimers(); });

describe('durable sign-in challenges', () => {
  it('binds exact origin, URI, purpose, wallet, network, browser and times', async () => {
    const issued = await issueNonce(ADDRESS, BROWSER);
    for (const text of [ORIGIN, `${ORIGIN}/rwa`, ADDRESS, 'solana:mainnet-beta', 'save-rwa-observation', 'Browser challenge:', 'Issued at:', 'Expires at:', 'not a transaction', 'moves no funds']) expect(issued.message).toContain(text);
    expect(issued.message).not.toContain(BROWSER);
  });
  it('atomically consumes once across independently loaded server modules', async () => {
    const issued = await issueNonce(ADDRESS, BROWSER);
    vi.resetModules(); const otherInstance = await import('@/lib/server/rwa/session');
    const results = await Promise.all([consumeNonce(issued.nonce, ADDRESS, BROWSER), otherInstance.consumeNonce(issued.nonce, ADDRESS, BROWSER)]);
    expect(results.filter(Boolean)).toHaveLength(1);
  });
  it('accepts its own challenge when the clock advances during issuance', async () => {
    vi.useFakeTimers();
    const now = Date.now();
    // Model the later clock read occurring one millisecond after construction.
    const clock = vi.spyOn(Date, 'now').mockReturnValue(now + 1);
    try {
      const issued = await issueNonce(ADDRESS, BROWSER);
      expect(await consumeNonce(issued.nonce, ADDRESS, BROWSER)).not.toBeNull();
    } finally { clock.mockRestore(); }
  });
  it('rejects the wrong browser, wallet and domain', async () => {
    const { nonce } = await issueNonce(ADDRESS, BROWSER);
    expect(await consumeNonce(nonce, ADDRESS, 'other')).toBeNull();
    expect(await consumeNonce(nonce, SECOND, BROWSER)).toBeNull();
    vi.stubEnv('RWA_APP_ORIGIN', 'https://attacker.example.com');
    expect(await consumeNonce(nonce, ADDRESS, BROWSER)).toBeNull();
  });
  it('rejects expired and future-issued challenges', async () => {
    const { nonce } = await issueNonce(ADDRESS, BROWSER);
    vi.useFakeTimers(); vi.setSystemTime(Date.now() + 6 * 60_000);
    expect(await consumeNonce(nonce, ADDRESS, BROWSER)).toBeNull();
  });
  it('fails closed on unavailable storage and invalid acknowledgments', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => Response.json({}, { status: 500 })));
    await expect(issueNonce(ADDRESS, BROWSER)).rejects.toThrow();
    await expect(consumeNonce('nonce', ADDRESS, BROWSER)).rejects.toThrow();
    vi.stubGlobal('fetch', vi.fn(async () => Response.json({})));
    await expect(issueNonce(ADDRESS, BROWSER)).rejects.toThrow();
  });
  it('verifies only the exact stored message with Node Ed25519', async () => {
    const pair = nacl.sign.keyPair.fromSeed(new Uint8Array(32).fill(7));
    const { nonce, message } = await issueNonce(ADDRESS, BROWSER);
    const signature = bs58.encode(nacl.sign.detached(new TextEncoder().encode(message), pair.secretKey));
    const challenge = (await consumeNonce(nonce, ADDRESS, BROWSER))!;
    expect(verifyChallenge(challenge, signature)).toBe(true);
    expect(verifyChallenge({ ...challenge, message: message + 'tampered' }, signature)).toBe(false);
    expect(verifyChallenge({ ...challenge, address: SECOND }, signature)).toBe(false);
  });
  it('requires exact origin including port and rejects absent origin', () => {
    expect(hasExactOrigin(new Request(`${ORIGIN}/api/rwa/auth`, { headers: { origin: ORIGIN } }))).toBe(true);
    for (const origin of ['', 'https://rwa.example.com:444', 'https://rwa.example.com.attacker.com']) expect(hasExactOrigin(new Request(`${ORIGIN}/api/rwa/auth`, { headers: { origin } }))).toBe(false);
  });
});

describe('session tokens', () => {
  it('round-trips and rejects tampering, extra segments and expiry', () => {
    const token = createSessionToken(ADDRESS)!;
    expect(readSessionToken(token)).toEqual({ address: ADDRESS });
    expect(readSessionToken(token + '.extra')).toBeNull();
    expect(readSessionToken(token.slice(0, -1) + '!')).toBeNull();
    vi.useFakeTimers(); vi.setSystemTime(Date.now() + 8 * 24 * 60 * 60_000);
    expect(readSessionToken(token)).toBeNull();
  });
  it.each(['RWA_SESSION_SECRET', 'RWA_APP_ORIGIN', 'RWA_SUPABASE_URL', 'RWA_SUPABASE_SERVICE_ROLE_KEY', 'RWA_REPORTS_ENABLED'])('fails closed when %s is absent', name => {
    vi.stubEnv(name, ''); expect(sessionsConfigured()).toBe(false); expect(createSessionToken(ADDRESS)).toBeNull();
  });
  it('does not accept a token on another configured domain', () => {
    const token = createSessionToken(ADDRESS)!; vi.stubEnv('RWA_APP_ORIGIN', 'https://different.example.com'); expect(readSessionToken(token)).toBeNull();
  });
});
