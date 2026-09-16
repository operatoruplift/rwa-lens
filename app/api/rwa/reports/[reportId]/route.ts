import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { reportIdSchema } from '@/lib/rwa/schema';
import { getReport, repositoryState } from '@/lib/server/rwa/repository';
import { SESSION_COOKIE, readSessionToken } from '@/lib/server/rwa/session';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(_request: Request, context: { params: Promise<{ reportId: string }> }) {
  if (repositoryState() !== 'ready') {
    return NextResponse.json({ state: 'feature-disabled' }, { status: 503 });
  }

  const store = await cookies();
  const owner = readSessionToken(store.get(SESSION_COOKIE)?.value)?.address;
  if (!owner) return NextResponse.json({ state: 'unauthenticated' }, { status: 401 });

  const { reportId } = await context.params;
  const parsed = reportIdSchema.safeParse(reportId);
  // A malformed id and someone else's id are both "not found": an id must not
  // be probeable for existence.
  if (!parsed.success) return NextResponse.json({ state: 'not-found' }, { status: 404 });

  const report = await getReport(owner, parsed.data);
  if (!report) return NextResponse.json({ state: 'not-found' }, { status: 404 });
  return NextResponse.json({ state: 'success', report });
}
