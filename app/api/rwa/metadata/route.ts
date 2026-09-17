import { NextResponse } from 'next/server';
import { metadataRequestSchema } from '@/lib/rwa/schema';
import { fetchMetadata } from '@/lib/server/rwa/metadata-fetch';
import { rateLimit } from '@/lib/server/rwa/rate-limit';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** Outcome → HTTP status. A skipped fetch is a 200 with an honest state. */
const STATUS: Record<string, number> = {
  ok: 200,
  'not-configured': 200,
  skipped: 200,
  blocked: 400,
  failed: 502,
};

export async function POST(request: Request) {
  const limited = await rateLimit(request, 'metadata');
  if (!limited.ok) {
    return NextResponse.json(
      { state: 'failed', reason: 'Too many requests. Wait a moment and try again.' },
      { status: 429, headers: { 'retry-after': String(limited.retryAfterSeconds) } },
    );
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ state: 'blocked', reason: 'Send a JSON body.' }, { status: 400 });
  }

  const parsed = metadataRequestSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { state: 'blocked', reason: parsed.error.issues[0]?.message ?? 'Check the mint and URI.' },
      { status: 400 },
    );
  }

  const outcome = await fetchMetadata(parsed.data.uri);
  return NextResponse.json(outcome, { status: STATUS[outcome.state] ?? 502 });
}
