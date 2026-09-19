import { NextResponse } from 'next/server';
import { metadataRequestSchema } from '@/lib/rwa/schema';
import { fetchMetadata } from '@/lib/server/rwa/metadata-fetch';
import { rateLimit } from '@/lib/server/rwa/rate-limit';
import { readBoundedJson, requestOrigin } from '@/lib/server/rwa/http';

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
  const origin = request.headers.get('origin');
  if (origin && origin !== requestOrigin(request)) return NextResponse.json({ state: 'blocked', reason: 'Cross-origin requests are not permitted.' }, { status: 403 });
  const limited = await rateLimit(request, 'metadata');
  if (!limited.ok) {
    return NextResponse.json(
      { state: 'failed', reason: 'Too many requests. Wait a moment and try again.' },
      { status: 429, headers: { 'retry-after': String(limited.retryAfterSeconds) } },
    );
  }

  let body: unknown;
  try {
    body = await readBoundedJson(request);
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
