import { randomUUID } from 'node:crypto';
import nacl from 'tweetnacl';
import bs58 from 'bs58';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createReport, getReport, listReports, repositoryState } from '@/lib/server/rwa/repository';
import { getFixture } from '@/lib/rwa/fixtures';
import { reportCreateSchema } from '@/lib/rwa/schema';

const alice = bs58.encode(nacl.sign.keyPair.fromSeed(new Uint8Array(32).fill(11)).publicKey);
const bob = bs58.encode(nacl.sign.keyPair.fromSeed(new Uint8Array(32).fill(12)).publicKey);
const rows: Record<string, unknown>[] = [];
const requests: Array<{ method: string; url: URL; body: Record<string, unknown> | null }> = [];
beforeEach(() => {
  rows.length = 0; requests.length = 0;
  vi.stubEnv('RWA_REPORTS_ENABLED','true'); vi.stubEnv('RWA_SESSION_SECRET','x'.repeat(48));
  vi.stubEnv('RWA_APP_ORIGIN','https://rwa.example.com'); vi.stubEnv('RWA_SUPABASE_URL','https://rwa-dedicated.supabase.co'); vi.stubEnv('RWA_SUPABASE_SERVICE_ROLE_KEY','test-service-role-key');
  vi.stubGlobal('fetch', vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
    const url = new URL(input instanceof Request ? input.url : input.toString());
    const method = init?.method ?? 'GET';
    const body = init?.body ? JSON.parse(init.body as string) : null;
    requests.push({ method, url, body });
    expect(url.pathname).toBe('/rest/v1/rwa_wallet_reports');
    const columns = url.searchParams.get('select')!.split(',').map(s => s.trim());
    const select = (row: Record<string, unknown>) => Object.fromEntries(columns.map(key => [key, row[key]]));
    if (method === 'POST') {
      const row = { ...body, id: randomUUID(), created_at: new Date().toISOString() }; rows.push(row); return Response.json(select(row), { status: 201 });
    }
    const owner = url.searchParams.get('owner_id')?.replace(/^eq\./,'');
    const id = url.searchParams.get('id')?.replace(/^eq\./,'');
    const found = rows.filter(row => row.owner_id === owner && (!id || row.id === id)).map(select);
    const headers = new Headers(init?.headers);
    return Response.json(headers.get('accept')?.includes('vnd.pgrst.object') ? (found[0] ?? null) : found);
  }));
});
afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs(); });
const input = (owner: string) => {
  const observation = getFixture('treasury-scaled')!.result;
  return { owner, cluster: observation.provenance.cluster, mint: observation.identity!.mint, observation, decoderVersion: observation.provenance.decoderVersion, mode: observation.mode };
};

describe('real repository query path, mocked PostgREST transport', () => {
  it('writes ownership only from server input and isolates two owners for list and get', async () => {
    expect(repositoryState()).toBe('ready');
    const aliceReport = (await createReport(input(alice)))!;
    const bobReport = (await createReport(input(bob)))!;
    expect((await listReports(alice)).map(row => row.id)).toEqual([aliceReport.id]);
    expect((await listReports(bob)).map(row => row.id)).toEqual([bobReport.id]);
    expect((await getReport(alice, aliceReport.id))?.observation).toBeDefined();
    expect(await getReport(bob, aliceReport.id)).toBeNull();
    expect(await getReport(alice, bobReport.id)).toBeNull();
    for (const request of requests.filter(item => item.method === 'GET')) expect(request.url.searchParams.get('owner_id')).toMatch(/^eq\./);
    expect(rows[0].owner_id).toBe(alice); expect(rows[1].owner_id).toBe(bob);
  });
  it('rejects forged uploaded observations at the API schema boundary', () => {
    expect(reportCreateSchema.safeParse({ cluster:'mainnet-beta',mint:alice,observation:{status:'verified'} }).success).toBe(false);
    expect(reportCreateSchema.safeParse({ request:{mode:'fixture',fixtureId:'treasury-scaled'},observation:{status:'verified'} }).success).toBe(false);
    expect(reportCreateSchema.safeParse({ request:{mode:'fixture',fixtureId:'treasury-scaled'} }).success).toBe(true);
  });
  it('rejects persisted content that no longer matches its hash', async () => {
    const created = (await createReport(input(alice)))!;
    rows[0].content_hash = '0'.repeat(64);
    await expect(getReport(alice, created.id)).rejects.toThrow(/integrity/);
  });
  it('reports storage failures instead of fabricating an empty list or not-found', async () => {
    vi.stubGlobal('fetch',vi.fn(async () => Response.json({ message:'internal-secret' },{status:500})));
    await expect(listReports(alice)).rejects.toThrow('Report storage is unavailable.');
  });
  it('does not activate with generic credentials or flag alone', () => {
    vi.stubEnv('RWA_SUPABASE_SERVICE_ROLE_KEY',''); vi.stubEnv('SUPABASE_SECRET_KEY','sb_secret_do_not_use');
    expect(repositoryState()).toBe('misconfigured');
  });
});
