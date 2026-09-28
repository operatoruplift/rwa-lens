import { NextResponse } from 'next/server';
import { signatureSchema, type DeployStatus } from '@/lib/rwa/deploy';
import { deployEnabled } from '@/lib/server/rwa/config';
import { createDeployChain } from '@/lib/server/rwa/deploy/chain';
import { readDeployStatus } from '@/lib/server/rwa/deploy/status';
import { rateLimit } from '@/lib/server/rwa/rate-limit';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
const HEADERS = { 'cache-control': 'no-store' };
const reply = (body: DeployStatus | { state: 'invalid'; message: string }, status = 200, headers: Record<string, string> = {}) => NextResponse.json(body, { status, headers: { ...HEADERS, ...headers } });

/** Confirmation for a deploy the user's wallet submitted. Read-only. */
export async function GET(request: Request) {
  if (!deployEnabled()) return reply({ state: 'invalid', message: 'Not found.' }, 404);
  const params = new URL(request.url).searchParams;
  const signature = signatureSchema.safeParse(params.get('signature'));
  const height = params.get('lastValidBlockHeight') ?? '';
  if ([...params.keys()].some(key => key !== 'signature' && key !== 'lastValidBlockHeight') || !signature.success || !/^\d{1,20}$/.test(height)) {
    return reply({ state: 'invalid', message: 'Send one signature and its last valid block height.' }, 400);
  }
  const limited = await rateLimit(request, 'deploy-status');
  if (!limited.ok) return reply({ state: 'unavailable', message: 'Too many confirmation checks. It will retry.' }, 429, { 'retry-after': String(limited.retryAfterSeconds) });
  let chain: ReturnType<typeof createDeployChain>;
  try { chain = createDeployChain(); }
  catch { return reply({ state: 'unavailable', message: 'Deploy is not configured on this deployment.' }, 503); }
  return reply(await readDeployStatus(chain, signature.data, BigInt(height)));
}
