import { NextResponse } from 'next/server';
import { addressSchema, clusterSchema } from '@/lib/rwa/schema';
import { rateLimit } from '@/lib/server/rwa/rate-limit';
import { readVenues } from '@/lib/server/rwa/venues';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
const HEADERS = { 'cache-control': 'no-store' };

/** Public, third-party market data for one mint. Never merged into an inspection or report. */
export async function GET(request: Request) {
  const params = new URL(request.url).searchParams;
  if ([...params.keys()].some(key => key !== 'mint' && key !== 'cluster') || params.getAll('mint').length !== 1 || params.getAll('cluster').length > 1) {
    return NextResponse.json({ state: 'invalid', message: 'Send one mint and an optional cluster.' }, { status: 400, headers: HEADERS });
  }
  const mint = addressSchema.safeParse(params.get('mint'));
  const cluster = clusterSchema.safeParse(params.get('cluster') ?? 'mainnet-beta');
  if (!mint.success || !cluster.success) return NextResponse.json({ state: 'invalid', message: 'Check the mint address and cluster.' }, { status: 400, headers: HEADERS });
  if (cluster.data !== 'mainnet-beta') return NextResponse.json({ state: 'not-applicable', reason: 'Meteora pool data covers Solana mainnet only.' }, { status: 200, headers: HEADERS });
  const limited = await rateLimit(request, 'venues');
  if (!limited.ok) return NextResponse.json({ state: 'unavailable', reason: 'Too many venue lookups were received from this network.' }, { status: 429, headers: { ...HEADERS, 'retry-after': String(limited.retryAfterSeconds) } });
  const result = await readVenues(mint.data);
  return NextResponse.json(result, { status: result.state === 'unavailable' ? 503 : 200, headers: HEADERS });
}
