import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { reportIdSchema } from '@/lib/rwa/schema';
import { getReport, repositoryState } from '@/lib/server/rwa/repository';
import { SESSION_COOKIE, readSessionToken } from '@/lib/server/rwa/session';
import { rateLimit } from '@/lib/server/rwa/rate-limit';
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export async function GET(request: Request, context: { params: Promise<{ reportId: string }> }) {
  if (repositoryState() !== 'ready') return NextResponse.json({ state: 'feature-disabled' }, { status: 503 });
  const limited = await rateLimit(request, 'reports');
  if (!limited.ok) return NextResponse.json({ state: 'unavailable' }, { status: limited.source === 'unavailable' ? 503 : 429, headers: { 'retry-after': String(limited.retryAfterSeconds) } });
  const owner = readSessionToken((await cookies()).get(SESSION_COOKIE)?.value)?.address;
  if (!owner) return NextResponse.json({ state: 'unauthenticated' }, { status: 401 });
  const parsed = reportIdSchema.safeParse((await context.params).reportId);
  if (!parsed.success) return NextResponse.json({ state: 'not-found' }, { status: 404 });
  try {
    const report = await getReport(owner, parsed.data);
    if (!report) return NextResponse.json({ state: 'not-found' }, { status: 404 });
    return NextResponse.json({ state: 'success', report }, { headers: { 'cache-control': 'no-store' } });
  } catch { return NextResponse.json({ state: 'unavailable', message: 'Report storage is unavailable. Try again later.' }, { status: 503 }); }
}
