import { NextResponse } from 'next/server';
import { metadataRequestSchema } from '@/lib/rwa/schema';
import { inspectRequest } from '@/lib/server/rwa/inspect';
import { fetchMetadata } from '@/lib/server/rwa/metadata-fetch';
import { rateLimit } from '@/lib/server/rwa/rate-limit';
import { RpcError } from '@/lib/server/rwa/rpc';
import { readBoundedJson, requestOrigin } from '@/lib/server/rwa/http';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** Outcome → HTTP status. Every host-policy determination about a well-formed
 * request is a 200 carrying its honest state, including a declined host; only an
 * upstream read failure is a 5xx. Malformed requests keep their own 4xx below. */
const STATUS: Record<string, number> = {
  ok: 200,
  'not-configured': 200,
  skipped: 200,
  blocked: 200,
  failed: 502,
};
/** The mint could not be resolved: the same statuses the inspection route answers with. */
const INSPECTION_STATUS: Record<string, number> = {
  'invalid-address': 400, 'not-found': 404, 'not-a-mint': 422, 'decoder-failure': 422, 'rate-limited': 429,
  'not-configured': 503, timeout: 503, 'response-too-large': 503, 'provider-failure': 502,
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
      { state: 'blocked', reason: parsed.error.issues[0]?.message ?? 'Check the mint and cluster.' },
      { status: 400 },
    );
  }

  // The URI is the one the mint itself declares on chain, read through the
  // inspection path and its cache. The caller never names a URL to fetch.
  let declared: string | undefined;
  try {
    declared = (await inspectRequest({ mode: 'live', cluster: parsed.data.cluster, mint: parsed.data.mint })).identity?.metadata?.uri;
  } catch (error) {
    if (error instanceof RpcError) return NextResponse.json({ state: 'failed', reason: error.message }, { status: INSPECTION_STATUS[error.kind] ?? 502 });
    return NextResponse.json({ state: 'failed', reason: 'The mint could not be inspected.' }, { status: 502 });
  }
  if (!declared) return NextResponse.json({ state: 'skipped', reason: 'This mint declares no metadata URI.' }, { status: 200 });

  const outcome = await fetchMetadata(declared);
  return NextResponse.json(outcome, { status: STATUS[outcome.state] ?? 502 });
}
