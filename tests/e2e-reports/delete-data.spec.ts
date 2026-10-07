import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { expect, test, type Page, type Request, type Route } from '@playwright/test';
import { inspectResultSchema } from '../../lib/rwa/schema';
import evidence from '../../docs/evidence/live-observations.json';

// An archived mainnet observation, replayed only inside browser interception.
const observation = inspectResultSchema.parse(evidence.observations[0].result);
const MINT = observation.identity!.mint;
const WALLET = 'H8sMJSCQxfKiFTCfDR3DUMLPwcRbM61LGFJ8N4dK3WjS';
const report = (id: string, createdAt: string) => ({ id, cluster: 'mainnet-beta', mint: MINT, ownerAddress: null, createdAt, decoderVersion: observation.provenance.decoderVersion, contentHash: 'a'.repeat(64), mode: 'live' });
const SAVED = [report('6f1c1d36-8f71-4b8e-9a51-0c4a5b0a3e11', '2026-10-03T14:05:00.000Z'), report('0d3c7c55-2f0b-4a8e-bb43-7a2f0a1e9c20', '2026-10-01T09:30:00.000Z')];
const DELETED = { status: 200, json: { state: 'deleted', reports: 2, challenges: 1 } };

type Api = { deletions: Request[]; saves: Request[]; auth: Array<{ action: string }> };

/** Answers every API request in the browser. Anything unplanned is refused, never sent to the server. */
async function mockApi(page: Page, { signedIn = true, deletion = DELETED as { status: number; json: unknown } } = {}): Promise<Api> {
  const api: Api = { deletions: [], saves: [], auth: [] };
  let session = signedIn;
  await page.route('**/api/**', route => route.abort());
  await page.route('**/api/rwa/inspect', route => route.fulfill({ json: observation }));
  await page.route('**/api/rwa/reports', (route: Route) => {
    if (route.request().method() === 'POST') { api.saves.push(route.request()); return route.fulfill({ status: 503, json: { state: 'unavailable' } }); }
    return session ? route.fulfill({ json: { state: 'success', reports: SAVED } }) : route.fulfill({ status: 401, json: { state: 'unauthenticated' } });
  });
  await page.route('**/api/rwa/auth', route => {
    const body = route.request().postDataJSON() as { action: string };
    api.auth.push(body);
    if (body.action === 'challenge') return route.fulfill({ json: { state: 'challenge', nonce: 'n'.repeat(32), message: 'rwa-lens.invalid requests an RWA Lens sign-in', expiresAt: '2026-10-07T12:05:00.000Z' } });
    if (body.action === 'verify') { session = true; return route.fulfill({ json: { state: 'signed-in', address: WALLET } }); }
    session = false;
    return route.fulfill({ json: { state: 'signed-out' } });
  });
  await page.route('**/api/rwa/account', route => {
    api.deletions.push(route.request());
    if (deletion.status === 200) session = false;
    return route.fulfill(deletion);
  });
  return api;
}

/** A Wallet Standard wallet that can only sign messages, and counts each request. */
async function installSigningWallet(page: Page) {
  await page.addInitScript(({ owner }) => {
    const account = Object.freeze({ address: owner, publicKey: new Uint8Array(32), chains: ['solana:mainnet'], features: ['solana:signMessage'] });
    const state = window as unknown as { __signed: number };
    state.__signed = 0;
    const wallet = {
      version: '1.0.0', name: 'Test Wallet', icon: 'data:image/svg+xml;base64,PHN2Zy8+', chains: ['solana:mainnet'], accounts: [account],
      features: {
        'standard:connect': { version: '1.0.0', connect: async () => ({ accounts: [account] }) },
        'solana:signMessage': { version: '1.0.0', signMessage: async () => { state.__signed += 1; return [{ signedMessage: new Uint8Array(0), signature: new Uint8Array(64).fill(9) }]; } },
      },
    };
    window.addEventListener('wallet-standard:app-ready', event => (event as CustomEvent<{ register: (value: unknown) => void }>).detail.register(wallet));
  }, { owner: WALLET });
}

async function openReports(page: Page) {
  await page.goto('/rwa?tab=evidence');
  const panel = page.getByRole('region', { name: 'Saved reports' });
  await expect(panel.getByRole('button', { name: 'Save this report' })).toBeEnabled();
  await panel.getByRole('button', { name: 'My reports' }).click();
  return panel;
}

async function axe(page: Page, selector: string) {
  await page.addScriptTag({ content: await readFile(path.resolve('node_modules/axe-core/axe.min.js'), 'utf8') });
  const violations = await page.evaluate(async target => {
    const runner = (window as unknown as { axe: { run: (context: unknown, options: unknown) => Promise<{ violations: Array<{ id: string; nodes: unknown[] }> }> } }).axe;
    const result = await runner.run(target, { runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21aa'] } });
    return result.violations.map(violation => ({ id: violation.id, nodes: violation.nodes.length }));
  }, selector);
  expect(violations).toEqual([]);
}

test.describe('delete my data (reports enabled)', () => {
  test('a signed-in wallet deletes all of its reports and ends its session after confirming', async ({ page }) => {
    const api = await mockApi(page);
    const panel = await openReports(page);
    await expect(panel.getByRole('button', { name: /Export saved report/ })).toHaveCount(2);
    await panel.getByRole('button', { name: 'Delete my data' }).click();
    const dialog = page.getByRole('dialog', { name: 'Delete your saved data?' });
    await expect(dialog).toBeVisible();
    await expect(dialog).toContainText('every report this wallet saved');
    await expect(dialog).toContainText('cannot be undone');
    await axe(page, 'dialog[open]');
    await dialog.getByRole('button', { name: 'Delete my data' }).click();

    await expect(dialog).toBeHidden();
    await expect(panel.getByRole('status')).toContainText('Deleted 2 saved reports and signed you out.');
    await expect(panel.getByRole('button', { name: /Export saved report/ })).toHaveCount(0);
    await expect(panel.getByRole('button', { name: 'Delete my data' })).toHaveCount(0);
    await expect(panel.getByRole('button', { name: 'Sign out' })).toHaveCount(0);
    expect(api.deletions).toHaveLength(1);
    // The server names the wallet from its session cookie; the browser sends no owner.
    expect(api.deletions[0].method()).toBe('DELETE');
    expect(api.deletions[0].postData()).toBeNull();
    expect(new URL(api.deletions[0].url()).search).toBe('');
    expect(api.saves).toHaveLength(0);
  });

  test('keeping the data sends nothing', async ({ page }) => {
    const api = await mockApi(page);
    const panel = await openReports(page);
    await panel.getByRole('button', { name: 'Delete my data' }).click();
    const dialog = page.getByRole('dialog', { name: 'Delete your saved data?' });
    await dialog.getByRole('button', { name: 'Keep my data' }).click();
    await expect(dialog).toBeHidden();
    await expect(panel.getByRole('button', { name: /Export saved report/ })).toHaveCount(2);
    await expect(panel.getByRole('button', { name: 'Delete my data' })).toBeVisible();
    expect(api.deletions).toHaveLength(0);
  });

  test('a failed deletion says so and keeps the session for another try', async ({ page }) => {
    const api = await mockApi(page, { deletion: { status: 503, json: { state: 'unavailable', message: 'Your data could not be deleted. Try again later.' } } });
    const panel = await openReports(page);
    await panel.getByRole('button', { name: 'Delete my data' }).click();
    const dialog = page.getByRole('dialog', { name: 'Delete your saved data?' });
    await dialog.getByRole('button', { name: 'Delete my data' }).click();
    await expect(dialog.getByRole('alert')).toHaveText('Your data could not be deleted. Try again later.');
    await dialog.getByRole('button', { name: 'Keep my data' }).click();
    await expect(panel.getByRole('button', { name: 'Delete my data' })).toBeVisible();
    await expect(panel.getByRole('button', { name: /Export saved report/ })).toHaveCount(2);
    expect(api.deletions).toHaveLength(1);
  });

  test('an expired session is told to sign in again rather than shown a false success', async ({ page }) => {
    await mockApi(page, { deletion: { status: 401, json: { state: 'unauthenticated' } } });
    const panel = await openReports(page);
    await panel.getByRole('button', { name: 'Delete my data' }).click();
    await page.getByRole('dialog', { name: 'Delete your saved data?' }).getByRole('button', { name: 'Delete my data' }).click();
    await expect(panel.getByRole('status')).toContainText('Your session has ended. Open My reports and sign in again to delete your data.');
    await expect(panel.getByRole('button', { name: 'Delete my data' })).toHaveCount(0);
  });

  test('a signed-out wallet signs in from My reports to reach deletion, without saving a report', async ({ page }) => {
    await installSigningWallet(page);
    const api = await mockApi(page, { signedIn: false });
    const panel = await openReports(page);
    const signIn = page.getByRole('dialog', { name: 'Open your saved reports.' });
    await expect(signIn).toBeVisible();
    await signIn.getByRole('button', { name: 'Connect Test Wallet' }).click();
    await expect(signIn).toBeHidden();
    await expect(panel.getByRole('button', { name: /Export saved report/ })).toHaveCount(2);
    await expect(panel.getByRole('button', { name: 'Delete my data' })).toBeVisible();
    expect(api.auth.map(call => call.action)).toEqual(['challenge', 'verify']);
    expect(await page.evaluate(() => (window as unknown as { __signed: number }).__signed)).toBe(1);
    expect(api.saves).toHaveLength(0);
  });

  test('the reports panel and its confirmation fit a phone', async ({ page }) => {
    await page.setViewportSize({ width: 360, height: 740 });
    await mockApi(page);
    const panel = await openReports(page);
    await panel.getByRole('button', { name: 'Delete my data' }).scrollIntoViewIfNeeded();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    await panel.getByRole('button', { name: 'Delete my data' }).click();
    const dialog = page.getByRole('dialog', { name: 'Delete your saved data?' });
    const box = await dialog.boundingBox();
    expect(box!.x).toBeGreaterThanOrEqual(0);
    expect(box!.x + box!.width).toBeLessThanOrEqual(360);
    await axe(page, 'dialog[open]');
  });
});
