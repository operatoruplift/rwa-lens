import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { getFixture } from '@/lib/rwa/fixtures';

/** The save route with its collaborators mocked: the session names a wallet, the inspection reproduces, storage answers. */
const mocks = vi.hoisted(() => ({ createReport: vi.fn(), inspect: vi.fn(), limit: vi.fn(), session: vi.fn() }));
vi.mock('next/headers', () => ({ cookies: async () => ({ get: (name: string) => ({ name, value: 'session-cookie' }) }) }));
vi.mock('@/lib/server/rwa/rate-limit', () => ({ rateLimit: mocks.limit }));
vi.mock('@/lib/server/rwa/inspect', () => ({ inspectRequest: mocks.inspect }));
vi.mock('@/lib/server/rwa/session', async importOriginal => ({
  ...(await importOriginal<typeof import('@/lib/server/rwa/session')>()),
  readSessionToken: mocks.session,
  hasExactOrigin: () => true,
}));
vi.mock('@/lib/server/rwa/repository', async importOriginal => ({
  ...(await importOriginal<typeof import('@/lib/server/rwa/repository')>()),
  repositoryState: () => 'ready',
  createReport: mocks.createReport,
}));
import { POST } from '@/app/api/rwa/reports/route';
import { ReportQuotaError } from '@/lib/server/rwa/repository';

const ORIGIN = 'https://rwa.example.com';
const WALLET = 'H8sMJSCQxfKiFTCfDR3DUMLPwcRbM61LGFJ8N4dK3WjS';
const MINT = 'A1KLoBrKBde8Ty9qtNQUtq3C2ortoC3u7twggz7sEto6';
const save = () => POST(new Request(`${ORIGIN}/api/rwa/reports`, { method: 'POST', headers: { 'content-type': 'application/json', origin: ORIGIN }, body: JSON.stringify({ request: { mode: 'live', cluster: 'mainnet-beta', mint: MINT } }) }));

beforeEach(() => {
  mocks.limit.mockResolvedValue({ ok: true, source: 'shared' });
  mocks.session.mockResolvedValue({ state: 'session', address: WALLET });
  mocks.inspect.mockResolvedValue(getFixture('treasury-scaled')!.result);
});
afterEach(() => { vi.resetAllMocks(); });

describe('POST /api/rwa/reports', () => {
  it('answers a wallet at its quota with 409 and a message that says what to do', async () => {
    mocks.createReport.mockRejectedValue(new ReportQuotaError('rows'));
    const response = await save();
    expect(response.status).toBe(409);
    expect(response.headers.get('cache-control')).toBe('no-store');
    expect(await response.json()).toEqual({ state: 'quota-exceeded', message: 'This wallet already holds 100 saved reports, the most it can keep. Delete my data removes all of them; exported JSON and CSV files stay on your device.' });
  });

  it('answers the size cap the same way', async () => {
    mocks.createReport.mockRejectedValue(new ReportQuotaError('bytes'));
    const response = await save();
    expect(response.status).toBe(409);
    expect((await response.json()).message).toContain('16 MB');
  });

  it('keeps every other storage failure a 503 that says nothing about the cause', async () => {
    mocks.createReport.mockRejectedValue(new Error('connection refused: internal detail'));
    const response = await save();
    expect(response.status).toBe(503);
    expect(await response.text()).not.toContain('internal detail');
  });

  it('answers 401 without a live session and 503 while the session store cannot say', async () => {
    mocks.session.mockResolvedValue({ state: 'none' });
    expect((await save()).status).toBe(401);
    mocks.session.mockResolvedValue({ state: 'unavailable' });
    const response = await save();
    expect(response.status).toBe(503);
    expect(await response.json()).toMatchObject({ state: 'unavailable' });
    expect(mocks.createReport).not.toHaveBeenCalled();
  });

  it('stores the reproduced observation for the session wallet when there is room', async () => {
    mocks.createReport.mockResolvedValue({ id: '6f1c1d36-8f71-4b8e-9a51-0c4a5b0a3e11' });
    const response = await save();
    expect(response.status).toBe(201);
    expect(mocks.createReport).toHaveBeenCalledWith(expect.objectContaining({ owner: WALLET }));
  });
});
