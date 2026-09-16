import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { reportCreateSchema } from '@/lib/rwa/schema';
import { DECODER_VERSION } from '@/lib/rwa/types';
import { createReport, listReports, repositoryState } from '@/lib/server/rwa/repository';
import { SESSION_COOKIE, readSessionToken } from '@/lib/server/rwa/session';
import { rateLimit } from '@/lib/server/rwa/rate-limit';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const DISABLED = {
  state: 'feature-disabled',
  message: 'Saved reports are not enabled on this deployment. JSON and CSV export work without an account.',
};

async function currentOwner(): Promise<string | null> {
  const store = await cookies();
  return readSessionToken(store.get(SESSION_COOKIE)?.value)?.address ?? null;
}

export async function GET(request: Request) {
  const state = repositoryState();
  if (state !== 'ready') return NextResponse.json(DISABLED, { status: 503 });
  if (!rateLimit(request, 'reports').ok) {
    return NextResponse.json({ state: 'unavailable', message: 'Too many requests.' }, { status: 429 });
  }

  const owner = await currentOwner();
  if (!owner) return NextResponse.json({ state: 'unauthenticated' }, { status: 401 });
  return NextResponse.json({ state: 'success', reports: await listReports(owner) });
}

export async function POST(request: Request) {
  const state = repositoryState();
  if (state !== 'ready') return NextResponse.json(DISABLED, { status: 503 });
  if (!rateLimit(request, 'reports').ok) {
    return NextResponse.json({ state: 'unavailable', message: 'Too many requests.' }, { status: 429 });
  }

  const owner = await currentOwner();
  if (!owner) return NextResponse.json({ state: 'unauthenticated' }, { status: 401 });

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ state: 'invalid', message: 'Send a JSON body.' }, { status: 400 });
  }

  const parsed = reportCreateSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { state: 'invalid', message: parsed.error.issues[0]?.message ?? 'Check the report payload.' },
      { status: 400 },
    );
  }

  // Ownership comes from the session, never from the request body.
  const report = await createReport({
    owner,
    cluster: parsed.data.cluster,
    mint: parsed.data.mint,
    ownerAddress: parsed.data.owner,
    observation: parsed.data.observation,
    decoderVersion: DECODER_VERSION,
  });
  if (!report) return NextResponse.json({ state: 'unavailable', message: 'The report could not be saved.' }, { status: 502 });
  return NextResponse.json({ state: 'success', report }, { status: 201 });
}
