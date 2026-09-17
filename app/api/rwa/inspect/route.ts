import { NextResponse } from 'next/server';
import { inspectRequestSchema } from '@/lib/rwa/schema';
import { getFixture } from '@/lib/rwa/fixtures';
import { inspectOnChain } from '@/lib/server/rwa/inspect';
import { RpcError } from '@/lib/server/rwa/rpc';
import { rateLimit } from '@/lib/server/rwa/rate-limit';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** Failure kind → HTTP status. Nothing here leaks a provider URL or a stack. */
const STATUS: Record<string, number> = {
  'invalid-address': 400,
  'not-found': 404,
  'rate-limited': 429,
  'not-configured': 503,
  timeout: 504,
  'provider-failure': 502,
  'decoder-failure': 502,
};

export async function POST(request: Request) {
  const limited = await rateLimit(request, 'inspect');
  if (!limited.ok) {
    return NextResponse.json(
      { status: 'unavailable', message: 'Too many requests. Wait a moment and try again.' },
      { status: 429, headers: { 'retry-after': String(limited.retryAfterSeconds) } },
    );
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ status: 'invalid', message: 'Send a JSON body.' }, { status: 400 });
  }

  const parsed = inspectRequestSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { status: 'invalid', message: parsed.error.issues[0]?.message ?? 'Check the mint and wallet addresses.' },
      { status: 400 },
    );
  }

  // Fixture mode shares the exact response contract with live mode.
  if (parsed.data.fixtureId) {
    const fixture = getFixture(parsed.data.fixtureId);
    if (!fixture) {
      return NextResponse.json({ status: 'invalid', message: 'Unknown fixture.' }, { status: 400 });
    }
    return NextResponse.json(fixture.result, { status: 200 });
  }

  try {
    const result = await inspectOnChain({
      cluster: parsed.data.cluster,
      mint: parsed.data.mint,
      owner: parsed.data.owner,
    });
    return NextResponse.json(result, { status: 200 });
  } catch (error) {
    if (error instanceof RpcError) {
      return NextResponse.json(
        {
          status: error.kind === 'invalid-address' ? 'invalid' : 'unavailable',
          message: error.message,
          kind: error.kind,
        },
        { status: STATUS[error.kind] ?? 502 },
      );
    }
    // Never surface an unexpected error's text to the client.
    return NextResponse.json(
      { status: 'unavailable', message: 'The inspection could not be completed.' },
      { status: 502 },
    );
  }
}
