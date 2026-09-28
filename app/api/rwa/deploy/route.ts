import { NextResponse } from 'next/server';
import { deployRequestSchema, type DeployResponse } from '@/lib/rwa/deploy';
import { deployEnabled, deployPriorityMicroLamports } from '@/lib/server/rwa/config';
import { buildDeploy } from '@/lib/server/rwa/deploy/build';
import { createDeployChain } from '@/lib/server/rwa/deploy/chain';
import { createJupiter } from '@/lib/server/rwa/deploy/jupiter';
import { hasSameOrigin, readBoundedJson } from '@/lib/server/rwa/http';
import { rateLimit } from '@/lib/server/rwa/rate-limit';
import { configuredOrigin } from '@/lib/server/rwa/session';
import { readVenues } from '@/lib/server/rwa/venues';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
const HEADERS = { 'cache-control': 'no-store' };
const STATUS: Record<DeployResponse['state'], number> = { ready: 200, refused: 422, unavailable: 503, invalid: 400 };
const reply = (body: DeployResponse, init?: { status?: number; headers?: Record<string, string> }) => NextResponse.json(body, { status: init?.status ?? STATUS[body.state], headers: { ...HEADERS, ...init?.headers } });

/**
 * Builds and simulates an unsigned deploy transaction for the caller's wallet.
 * Nothing is signed or sent here; the wallet signs and submits it.
 */
export async function POST(request: Request) {
  if (!deployEnabled()) return reply({ state: 'invalid', message: 'Not found.' }, { status: 404 });
  if (!hasSameOrigin(request, configuredOrigin())) return reply({ state: 'invalid', message: 'Deploy requests must come from this site.' }, { status: 403 });
  const limited = await rateLimit(request, 'deploy');
  if (!limited.ok) return reply({ state: 'unavailable', message: 'Too many deploy previews from this network. Wait a minute and try again.' }, { status: 429, headers: { 'retry-after': String(limited.retryAfterSeconds) } });
  let raw: unknown;
  try { raw = await readBoundedJson(request, 2048); }
  catch { return reply({ state: 'invalid', message: 'Send a small JSON body.' }); }
  const parsed = deployRequestSchema.safeParse(raw);
  if (!parsed.success) return reply({ state: 'invalid', message: 'Check the amount, slippage, pool and wallet address.' });
  let chain: ReturnType<typeof createDeployChain>;
  try { chain = createDeployChain(); }
  catch { return reply({ state: 'unavailable', message: 'Deploy is not configured on this deployment.' }); }
  try {
    return reply(await buildDeploy(parsed.data, { chain, jupiter: createJupiter(), venues: readVenues, now: Date.now, priorityMicroLamports: deployPriorityMicroLamports() }));
  } catch {
    // Anything the builder does not already translate stays behind the same redacted envelope.
    return reply({ state: 'unavailable', message: 'The deploy preview failed unexpectedly. Nothing was offered to your wallet. Try again shortly.' });
  }
}
