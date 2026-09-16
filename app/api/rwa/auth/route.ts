import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { z } from 'zod';
import bs58 from 'bs58';
import nacl from 'tweetnacl';
import { addressSchema } from '@/lib/rwa/schema';
import { rateLimit } from '@/lib/server/rwa/rate-limit';
import {
  SESSION_COOKIE,
  SESSION_COOKIE_OPTIONS,
  consumeNonce,
  createSessionToken,
  issueNonce,
  sessionsConfigured,
  signInMessage,
} from '@/lib/server/rwa/session';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const challengeSchema = z.object({ action: z.literal('challenge'), address: addressSchema });
const verifySchema = z.object({
  action: z.literal('verify'),
  address: addressSchema,
  nonce: z.string().trim().max(128),
  signature: z.string().trim().max(200),
});
const signOutSchema = z.object({ action: z.literal('sign-out') });

const bodySchema = z.union([challengeSchema, verifySchema, signOutSchema]);

export async function POST(request: Request) {
  if (!rateLimit(request, 'reports').ok) {
    return NextResponse.json({ state: 'unavailable', message: 'Too many requests.' }, { status: 429 });
  }
  if (!sessionsConfigured()) {
    return NextResponse.json(
      {
        state: 'feature-disabled',
        message: 'Wallet sign-in is not enabled on this deployment. Inspection and export need no account.',
      },
      { status: 503 },
    );
  }

  let raw: unknown;
  try {
    raw = await request.json();
  } catch {
    return NextResponse.json({ state: 'invalid', message: 'Send a JSON body.' }, { status: 400 });
  }

  const parsed = bodySchema.safeParse(raw);
  if (!parsed.success) return NextResponse.json({ state: 'invalid', message: 'Unsupported request.' }, { status: 400 });

  if (parsed.data.action === 'sign-out') {
    const store = await cookies();
    store.delete(SESSION_COOKIE);
    return NextResponse.json({ state: 'signed-out' });
  }

  if (parsed.data.action === 'challenge') {
    return NextResponse.json({ state: 'challenge', ...issueNonce(parsed.data.address) });
  }

  const { address, nonce, signature } = parsed.data;
  // Single use: a replayed nonce finds nothing, so a captured signature is dead.
  if (!consumeNonce(nonce, address)) {
    return NextResponse.json({ state: 'invalid', message: 'That sign-in challenge has expired. Try again.' }, { status: 400 });
  }

  let verified = false;
  try {
    verified = nacl.sign.detached.verify(
      new TextEncoder().encode(signInMessage(address, nonce)),
      bs58.decode(signature),
      bs58.decode(address),
    );
  } catch {
    verified = false;
  }

  // A failed signature never degrades into a session.
  if (!verified) {
    return NextResponse.json({ state: 'invalid', message: 'That signature did not match the address.' }, { status: 401 });
  }

  const token = createSessionToken(address);
  if (!token) {
    return NextResponse.json({ state: 'feature-disabled' }, { status: 503 });
  }

  const store = await cookies();
  store.set(SESSION_COOKIE, token, SESSION_COOKIE_OPTIONS);
  return NextResponse.json({ state: 'signed-in', address });
}
