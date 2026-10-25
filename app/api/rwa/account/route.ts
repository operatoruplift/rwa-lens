import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { deleteWalletData, repositoryState } from '@/lib/server/rwa/repository';
import { CHALLENGE_COOKIE, SESSION_COOKIE, hasExactOrigin, readSessionToken, sessionRefusal } from '@/lib/server/rwa/session';
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
  const session = await readSessionToken(store.get(SESSION_COOKIE)?.value);
  const refusal = sessionRefusal(session);
  if (refusal || session.state !== 'session') return NextResponse.json(refusal?.body ?? { state: 'unauthenticated' }, { status: refusal?.status ?? 401, headers: NO_STORE });
  const owner = session.address;
  try {
    const deleted = await deleteWalletData(owner);
    // The deletion moved the wallet's session epoch on, so every copy of the cookie is dead; this one is cleared for tidiness.
    store.delete(SESSION_COOKIE); store.delete(CHALLENGE_COOKIE);
    return NextResponse.json({ state: 'deleted', ...deleted }, { headers: NO_STORE });
  } catch {
    // Keep the session so the user can retry. Storage errors stay server-side.
    return NextResponse.json({ state: 'unavailable', message: 'Your data could not be deleted. Try again later.' }, { status: 503, headers: NO_STORE });
  }
}
