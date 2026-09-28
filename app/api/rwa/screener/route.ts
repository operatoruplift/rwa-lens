import { after, NextResponse } from 'next/server';
import type { ScreenerResponse } from '@/lib/rwa/screener';
import { rateLimit } from '@/lib/server/rwa/rate-limit';
import { screenerStore } from '@/lib/server/rwa/screener';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Public market data: Meteora DLMM pools holding known tokenized assets. The
 * same snapshot serves everyone, so the CDN may cache it; a stale snapshot is
 * served while the refresh runs after the response.
 */
export async function GET(request: Request) {
  const noStore = { 'cache-control': 'no-store' };
  if ([...new URL(request.url).searchParams.keys()].length) {
    return NextResponse.json({ state: 'unavailable', reason: 'This endpoint takes no parameters.' } satisfies ScreenerResponse, { status: 400, headers: noStore });
  }
  const limited = await rateLimit(request, 'screener');
  if (!limited.ok) return NextResponse.json({ state: 'unavailable', reason: 'Too many screener requests from this network.' } satisfies ScreenerResponse, { status: 429, headers: { ...noStore, 'retry-after': String(limited.retryAfterSeconds) } });
  const { response, refresh } = await screenerStore.read();
  if (refresh) after(refresh);
  return NextResponse.json(response, {
    status: response.state === 'ok' ? 200 : 503,
    headers: response.state === 'ok' ? { 'cache-control': 'public, s-maxage=300, stale-while-revalidate=3600' } : noStore,
  });
}
