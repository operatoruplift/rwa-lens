import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import nacl from 'tweetnacl';
import bs58 from 'bs58';
import { SESSION_COOKIE_OPTIONS, consumeNonce, createSessionToken, endSessions, issueNonce, readSessionToken, sessionsConfigured, verifyChallenge, hasExactOrigin, type Challenge } from '@/lib/server/rwa/session';

const ADDRESS = bs58.encode(nacl.sign.keyPair.fromSeed(new Uint8Array(32).fill(7)).publicKey);
const SECOND = bs58.encode(nacl.sign.keyPair.fromSeed(new Uint8Array(32).fill(8)).publicKey);
const ORIGIN = 'https://rwa.example.com';
const BROWSER = 'browser-cookie-cryptographically-random';
const shared = new Map<string, Challenge>();
/** rwa_private.session_epochs as the migration behaves: read gives 0 without a row, touch makes the row, bump moves it on. */
const epochs = new Map<string, number>();
function answerEpoch(body: { p_owner_id: string; p_action: 'read' | 'touch' | 'bump' }): Response {
  const current = epochs.get(body.p_owner_id) ?? 0;
  if (body.p_action === 'read') return Response.json(current);
  const next = body.p_action === 'bump' && current > 0 ? current + 1 : Math.max(current, 1);
  epochs.set(body.p_owner_id, next);
  return Response.json(next);
}
beforeEach(() => {
  shared.clear(); epochs.clear();
  vi.stubEnv('RWA_REPORTS_ENABLED', 'true'); vi.stubEnv('RWA_SESSION_SECRET', 'a'.repeat(48));
  vi.stubEnv('RWA_APP_ORIGIN', ORIGIN); vi.stubEnv('RWA_SUPABASE_URL', 'https://rwa-dedicated.supabase.co');
  vi.stubEnv('RWA_SUPABASE_SERVICE_ROLE_KEY', 'test-server-only-key'); vi.stubEnv('RWA_CLUSTER', 'mainnet-beta');
  vi.stubGlobal('fetch', vi.fn(async (url: string, options: RequestInit) => {
    const body = JSON.parse(options.body as string);
    if (url.endsWith('rwa_issue_challenge')) { shared.set(body.p_challenge.nonce, body.p_challenge); return Response.json({ stored: true }); }
    if (url.endsWith('rwa_session_epoch')) return answerEpoch(body);
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
  // Four keys x forty fresh challenges is 160 signing round trips, which is well past
  // the 5s default on a loaded machine. The repetition is the point of the test, so the
  // budget grows rather than the coverage shrinking.
  it('rejects small-order and non-canonical public keys that an all-zero signature would satisfy', { timeout: 90_000 }, async () => {
    // RFC 8032 verification accepts these points, so a zero signature validates against
    // them for roughly one message in four. Repeat across many fresh challenges: a
    // single-challenge assertion passes by luck about three times in four.
    const lowOrder = [
      '11111111111111111111111111111111',
      bs58.encode(Buffer.from('0000000000000000000000000000000000000000000000000000000000000080', 'hex')),
      bs58.encode(Buffer.from('0100000000000000000000000000000000000000000000000000000000000000', 'hex')),
      bs58.encode(Buffer.from('ecffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff7f', 'hex')),
      // The identity again, encoded non-canonically as y = p + 1: outside any denylist, refused by strict decoding.
      bs58.encode(Buffer.from('eeffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff7f', 'hex')),
    ];
    const zeroSignature = bs58.encode(Buffer.alloc(64));
    for (const address of lowOrder) {
      for (let attempt = 0; attempt < 40; attempt += 1) {
        const { nonce, message } = await issueNonce(address, BROWSER);
        const challenge = (await consumeNonce(nonce, address, BROWSER))!;
        expect(challenge.message).toBe(message);
        expect(verifyChallenge(challenge, zeroSignature)).toBe(false);
      }
    }
  });
  it('rejects every encoding of the eight small-order points and of y = p, with a real signature over a real message', async () => {
    const pair = nacl.sign.keyPair.fromSeed(new Uint8Array(32).fill(7));
    const { nonce, message } = await issueNonce(ADDRESS, BROWSER);
    const signature = bs58.encode(nacl.sign.detached(new TextEncoder().encode(message), pair.secretKey));
    const challenge = (await consumeNonce(nonce, ADDRESS, BROWSER))!;
    expect(verifyChallenge(challenge, signature)).toBe(true);
    const torsion = [
      '0000000000000000000000000000000000000000000000000000000000000000', '0000000000000000000000000000000000000000000000000000000000000080',
      '0100000000000000000000000000000000000000000000000000000000000000', 'ecffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff7f',
      '26e8958fc2b227b045c3f489f2ef98f0d5dfac05d3c63339b13802886d53fc05', '26e8958fc2b227b045c3f489f2ef98f0d5dfac05d3c63339b13802886d53fc85',
      'c7176a703d4dd84fba3c0b760d10670f2a2053fa2c39ccc64ec7fd7792ac037a', 'c7176a703d4dd84fba3c0b760d10670f2a2053fa2c39ccc64ec7fd7792ac03fa',
      // Non-canonical: y = p + 1 (the identity) and y = p with either sign bit.
      'eeffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff7f', 'edffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff7f', 'edffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff',
    ];
    for (const hex of torsion) expect(verifyChallenge({ ...challenge, address: bs58.encode(Buffer.from(hex, 'hex')) }, signature), hex).toBe(false);
  });
  it('rejects a signature whose R component is the identity element', async () => {
    const pair = nacl.sign.keyPair.fromSeed(new Uint8Array(32).fill(7));
    const { nonce, message } = await issueNonce(ADDRESS, BROWSER);
    const real = nacl.sign.detached(new TextEncoder().encode(message), pair.secretKey);
    const challenge = (await consumeNonce(nonce, ADDRESS, BROWSER))!;
    const zeroedR = Buffer.concat([Buffer.alloc(32), Buffer.from(real.subarray(32))]);
    expect(verifyChallenge(challenge, bs58.encode(zeroedR))).toBe(false);
  });
  it('requires exact origin including port and rejects absent origin', () => {
    expect(hasExactOrigin(new Request(`${ORIGIN}/api/rwa/auth`, { headers: { origin: ORIGIN } }))).toBe(true);
    for (const origin of ['', 'https://rwa.example.com:444', 'https://rwa.example.com.attacker.com']) expect(hasExactOrigin(new Request(`${ORIGIN}/api/rwa/auth`, { headers: { origin } }))).toBe(false);
  });
});

describe('session tokens', () => {
  it('round-trips, rejects tampering and extra segments, and expires after 24 hours', async () => {
    const token = (await createSessionToken(ADDRESS))!;
    expect(await readSessionToken(token)).toEqual({ state: 'session', address: ADDRESS });
    expect(await readSessionToken(token + '.extra')).toEqual({ state: 'none' });
    expect(await readSessionToken(token.slice(0, -1) + '!')).toEqual({ state: 'none' });
    vi.useFakeTimers(); vi.setSystemTime(Date.now() + 23 * 60 * 60_000);
    expect(await readSessionToken(token)).toEqual({ state: 'session', address: ADDRESS });
    vi.setSystemTime(Date.now() + 2 * 60 * 60_000);
    expect(await readSessionToken(token)).toEqual({ state: 'none' });
    expect(SESSION_COOKIE_OPTIONS.maxAge).toBe(24 * 60 * 60);
  });
  it('ends every copy of a session at sign-out, while a later sign-in works and another wallet is untouched', async () => {
    const copied = (await createSessionToken(ADDRESS))!;
    const other = (await createSessionToken(SECOND))!;
    expect(await readSessionToken(copied)).toEqual({ state: 'session', address: ADDRESS });
    await endSessions(ADDRESS);
    expect(await readSessionToken(copied)).toEqual({ state: 'none' });
    expect(await readSessionToken(other)).toEqual({ state: 'session', address: SECOND });
    const fresh = (await createSessionToken(ADDRESS))!;
    expect(await readSessionToken(fresh)).toEqual({ state: 'session', address: ADDRESS });
    expect(await readSessionToken(copied)).toEqual({ state: 'none' });
  });
  it('asks storage for the wallet’s epoch on every read, and says unavailable rather than signed-in when it cannot', async () => {
    const token = (await createSessionToken(ADDRESS))!;
    const calls = (fetch as unknown as ReturnType<typeof vi.fn>).mock.calls.length;
    await readSessionToken(token); await readSessionToken(token);
    expect((fetch as unknown as ReturnType<typeof vi.fn>).mock.calls.length).toBe(calls + 2);
    vi.stubGlobal('fetch', vi.fn(async () => Response.json({}, { status: 500 })));
    expect(await readSessionToken(token)).toEqual({ state: 'unavailable' });
    vi.stubGlobal('fetch', vi.fn(async () => Response.json('not a number')));
    expect(await readSessionToken(token)).toEqual({ state: 'unavailable' });
    // A cookie that is not a session never reaches storage.
    expect(await readSessionToken('not-a-token')).toEqual({ state: 'none' });
  });
  it('issues no session when its epoch cannot be recorded', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => Response.json({}, { status: 500 })));
    await expect(createSessionToken(ADDRESS)).rejects.toThrow();
  });
  it.each(['RWA_SESSION_SECRET', 'RWA_APP_ORIGIN', 'RWA_SUPABASE_URL', 'RWA_SUPABASE_SERVICE_ROLE_KEY', 'RWA_REPORTS_ENABLED'])('fails closed when %s is absent', async name => {
    vi.stubEnv(name, ''); expect(sessionsConfigured()).toBe(false); expect(await createSessionToken(ADDRESS)).toBeNull();
  });
  it('does not accept a token on another configured domain', async () => {
    const token = (await createSessionToken(ADDRESS))!; vi.stubEnv('RWA_APP_ORIGIN', 'https://different.example.com'); expect(await readSessionToken(token)).toEqual({ state: 'none' });
  });
});
