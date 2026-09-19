import { NextResponse } from 'next/server';
import { inspectRequestSchema } from '@/lib/rwa/schema';
import { inspectRequest } from '@/lib/server/rwa/inspect';
import { RpcError } from '@/lib/server/rwa/rpc';
import { readBoundedJson, requestOrigin } from '@/lib/server/rwa/http';
import { rateLimit } from '@/lib/server/rwa/rate-limit';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
const STATUS: Record<string, number> = { 'invalid-address': 400, 'not-found': 404, 'not-a-mint': 422, 'rate-limited': 429, 'not-configured': 503, timeout: 503, 'provider-failure': 502, 'decoder-failure': 422, 'response-too-large': 503 };
export async function POST(request: Request) {
  const origin = request.headers.get('origin');
  if (origin && origin !== requestOrigin(request)) return NextResponse.json({ status: 'invalid', message: 'Cross-origin requests are not permitted.' }, { status: 403 });
  let body: unknown;
  try { body = await readBoundedJson(request); }
  catch { return NextResponse.json({ status: 'invalid', message: 'Send a JSON body no larger than 4 KB.' }, { status: 400 }); }
  const parsed = inspectRequestSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ status: 'invalid', message: parsed.error.issues[0]?.message ?? 'Check the mint and wallet addresses.' }, { status: 400 });
  const limited = await rateLimit(request, parsed.data.mode === 'fixture' ? 'fixture' : 'inspect');
  if (!limited.ok) return NextResponse.json({ status: 'unavailable', kind: 'rate-limited', message: 'Too many requests. Wait a moment and try again.' }, { status: 429, headers: { 'retry-after': String(limited.retryAfterSeconds) } });
  try { return NextResponse.json(await inspectRequest(parsed.data), { status: 200 }); }
  catch (error) {
    if (error instanceof RpcError) return NextResponse.json({ status: ['invalid-address', 'not-a-mint', 'decoder-failure'].includes(error.kind) ? 'invalid' : 'unavailable', message: error.message, kind: error.kind }, { status: STATUS[error.kind] ?? 502 });
    return NextResponse.json({ status: 'unavailable', message: 'The inspection could not be completed.' }, { status: 502 });
  }
}
