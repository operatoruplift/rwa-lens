import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { deleteWalletData, repositoryState } from '@/lib/server/rwa/repository';
import { CHALLENGE_COOKIE, SESSION_COOKIE, hasExactOrigin, readSessionToken } from '@/lib/server/rwa/session';
import { rateLimit } from '@/lib/server/rwa/rate-limit';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
const NO_STORE = { 'cache-control': 'no-store' };

/**
 * Delete my data: every saved report and sign-in challenge of the signed-in wallet, then the session.
 * The wallet comes only from the verified session cookie; nothing in the request can name another one.
 */
export async function DELETE(request: Request) {
  if (repositoryState() !== 'ready') return NextResponse.json({ state: 'feature-disabled', message: 'Saved reports are not enabled. There is no account data to delete.' }, { status: 503 });
  if (!hasExactOrigin(request)) return NextResponse.json({ state: 'invalid', message: 'Deleting data requires this site’s exact origin.' }, { status: 403 });
  const limited = await rateLimit(request, 'reports');
  if (!limited.ok) return NextResponse.json({ state: 'unavailable', message: 'Report storage is busy or unavailable. Try again later.' }, { status: limited.source === 'unavailable' ? 503 : 429, headers: { 'retry-after': String(limited.retryAfterSeconds) } });
  const store = await cookies();
  const owner = readSessionToken(store.get(SESSION_COOKIE)?.value)?.address;
  if (!owner) return NextResponse.json({ state: 'unauthenticated', message: 'Sign in with your wallet to delete its data.' }, { status: 401, headers: NO_STORE });
  try {
    const deleted = await deleteWalletData(owner);
    // The session is stateless, so ending it means clearing its cookie.
    store.delete(SESSION_COOKIE); store.delete(CHALLENGE_COOKIE);
    return NextResponse.json({ state: 'deleted', ...deleted }, { headers: NO_STORE });
  } catch {
    // Keep the session so the user can retry. Storage errors stay server-side.
    return NextResponse.json({ state: 'unavailable', message: 'Your data could not be deleted. Try again later.' }, { status: 503, headers: NO_STORE });
  }
}
