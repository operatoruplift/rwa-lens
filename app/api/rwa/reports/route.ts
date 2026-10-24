import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { reportCreateSchema } from '@/lib/rwa/schema';
import { ReportQuotaError, createReport, listReports, repositoryState } from '@/lib/server/rwa/repository';
import { SESSION_COOKIE, readSessionToken, hasExactOrigin, sessionRefusal } from '@/lib/server/rwa/session';
import { rateLimit } from '@/lib/server/rwa/rate-limit';
import { readBoundedJson } from '@/lib/server/rwa/http';
import { inspectRequest } from '@/lib/server/rwa/inspect';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
const DISABLED = { state: 'feature-disabled', message: 'Saved reports are not enabled. JSON and CSV export work without an account.' };
const NO_STORE = { 'cache-control': 'no-store' };
/** The signed-in wallet, or the response that says why there is none. */
async function currentOwner(): Promise<{ owner: string } | { refused: NextResponse }> {
  const session = await readSessionToken((await cookies()).get(SESSION_COOKIE)?.value);
  const refusal = sessionRefusal(session);
  return refusal ? { refused: NextResponse.json(refusal.body, { status: refusal.status, headers: NO_STORE }) } : { owner: (session as { address: string }).address };
}
async function gate(request: Request) {
  if (repositoryState() !== 'ready') return NextResponse.json(DISABLED, { status: 503 });
  const limited = await rateLimit(request, 'reports');
  if (!limited.ok) return NextResponse.json({ state: 'unavailable', message: 'Report storage is busy or unavailable. Try again later.' }, { status: limited.source === 'unavailable' ? 503 : 429, headers: { 'retry-after': String(limited.retryAfterSeconds) } });
  return null;
}
export async function GET(request: Request) {
  const blocked = await gate(request); if (blocked) return blocked;
  const current = await currentOwner();
  if ('refused' in current) return current.refused;
  const { owner } = current;
  try { return NextResponse.json({ state: 'success', reports: await listReports(owner) }, { headers: NO_STORE }); }
  catch { return NextResponse.json({ state: 'unavailable', message: 'Report storage is unavailable. Try again later.' }, { status: 503 }); }
}
export async function POST(request: Request) {
  if (repositoryState() !== 'ready') return NextResponse.json(DISABLED, { status: 503 });
  if (!hasExactOrigin(request)) return NextResponse.json({ state: 'invalid', message: 'Saving requires this site’s exact origin.' }, { status: 403 });
  const blocked = await gate(request); if (blocked) return blocked;
  const current = await currentOwner();
  if ('refused' in current) return current.refused;
  const { owner } = current;
  let body: unknown;
  try { body = await readBoundedJson(request); }
  catch { return NextResponse.json({ state: 'invalid', message: 'Send a small JSON inspection request.' }, { status: 400 }); }
  const parsed = reportCreateSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ state: 'invalid', message: 'Save an inspection request; uploaded observations are not accepted.' }, { status: 400 });
  try {
    // Re-run the server-owned inspection. Client JSON can never claim a live observation.
    const observation = await inspectRequest(parsed.data.request);
    if (observation.status === 'unavailable' || observation.status === 'invalid') return NextResponse.json({ state: 'unavailable', message: 'The observation could not be reproduced. Inspect again before saving.' }, { status: 503 });
    const report = await createReport({
      owner, cluster: observation.provenance.cluster, mint: observation.identity!.mint,
      ownerAddress: parsed.data.request.mode === 'live' ? parsed.data.request.owner : undefined,
      observation, decoderVersion: observation.provenance.decoderVersion, mode: observation.provenance.mode,
    });
    if (!report) throw new Error('storage-unavailable');
    return NextResponse.json({ state: 'success', report }, { status: 201, headers: { 'cache-control': 'no-store' } });
  } catch (error) {
    // The database holds the per-wallet cap; the user can free it only by deleting everything.
    if (error instanceof ReportQuotaError) return NextResponse.json({ state: 'quota-exceeded', message: `${error.message} Delete my data removes all of them; exported JSON and CSV files stay on your device.` }, { status: 409, headers: { 'cache-control': 'no-store' } });
    return NextResponse.json({ state: 'unavailable', message: 'The report could not be saved. Export locally or try again later.' }, { status: 503 });
  }
}
