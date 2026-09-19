import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { randomBytes } from 'node:crypto';
import { z } from 'zod';
import { addressSchema } from '@/lib/rwa/schema';
import { rateLimit } from '@/lib/server/rwa/rate-limit';
import { readBoundedJson } from '@/lib/server/rwa/http';
import {
  SESSION_COOKIE, SESSION_COOKIE_OPTIONS, CHALLENGE_COOKIE, CHALLENGE_COOKIE_OPTIONS,
  consumeNonce, createSessionToken, issueNonce, sessionsConfigured, hasExactOrigin, verifyChallenge,
} from '@/lib/server/rwa/session';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const bodySchema = z.discriminatedUnion('action', [
  z.object({ action: z.literal('challenge'), address: addressSchema }).strict(),
  z.object({ action: z.literal('verify'), address: addressSchema, nonce: z.string().regex(/^[A-Za-z0-9_-]{32}$/), signature: z.string().min(64).max(100) }).strict(),
  z.object({ action: z.literal('sign-out') }).strict(),
]);

export async function POST(request: Request) {
  if (!sessionsConfigured()) return NextResponse.json({ state: 'feature-disabled', message: 'Wallet sign-in is not enabled. Inspection and export need no account.' }, { status: 503 });
  if (!hasExactOrigin(request)) return NextResponse.json({ state: 'invalid', message: 'Sign-in requires this site’s exact origin.' }, { status: 403 });
  const limited = await rateLimit(request, 'auth');
  if (!limited.ok) return NextResponse.json({ state: 'unavailable', message: limited.source === 'unavailable' ? 'Sign-in storage is unavailable. Try again later.' : 'Too many requests.' }, { status: limited.source === 'unavailable' ? 503 : 429, headers: { 'retry-after': String(limited.retryAfterSeconds) } });
  let raw: unknown;
  try { raw = await readBoundedJson(request); }
  catch { return NextResponse.json({ state: 'invalid', message: 'Send a small JSON body.' }, { status: 400 }); }
  const parsed = bodySchema.safeParse(raw);
  if (!parsed.success) return NextResponse.json({ state: 'invalid', message: 'Unsupported request.' }, { status: 400 });
  const store = await cookies();
  if (parsed.data.action === 'sign-out') {
    store.delete(SESSION_COOKIE); store.delete(CHALLENGE_COOKIE);
    return NextResponse.json({ state: 'signed-out' });
  }
  try {
    if (parsed.data.action === 'challenge') {
      const browserToken = randomBytes(32).toString('base64url');
      const challenge = await issueNonce(parsed.data.address, browserToken);
      store.set(CHALLENGE_COOKIE, browserToken, CHALLENGE_COOKIE_OPTIONS);
      return NextResponse.json({ state: 'challenge', ...challenge }, { headers: { 'cache-control': 'no-store' } });
    }
    const { address, nonce, signature } = parsed.data;
    const challenge = await consumeNonce(nonce, address, store.get(CHALLENGE_COOKIE)?.value ?? '');
    store.delete(CHALLENGE_COOKIE);
    if (!challenge) return NextResponse.json({ state: 'invalid', message: 'That sign-in challenge expired or did not match this browser. Try again.' }, { status: 400 });
    if (!verifyChallenge(challenge, signature)) return NextResponse.json({ state: 'invalid', message: 'That signature did not match the address.' }, { status: 401 });
    const token = createSessionToken(address);
    if (!token) return NextResponse.json({ state: 'feature-disabled' }, { status: 503 });
    store.set(SESSION_COOKIE, token, SESSION_COOKIE_OPTIONS);
    return NextResponse.json({ state: 'signed-in', address }, { headers: { 'cache-control': 'no-store' } });
  } catch {
    return NextResponse.json({ state: 'unavailable', message: 'Sign-in storage is unavailable. No session was created. Try again later.' }, { status: 503 });
  }
}
