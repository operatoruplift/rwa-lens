import { createHash } from 'node:crypto';
import { mkdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { expect, test, type Page } from '@playwright/test';
import { inspectResultSchema } from '../../lib/rwa/schema';
import evidence from '../../docs/evidence/live-observations.json';
import token2022Evidence from '../../docs/evidence/token-2022-live-observation.json';

// Replay previously captured RPC responses only inside browser-test interception.
// Production never imports these files or substitutes them for a network read.
const mintObservation = inspectResultSchema.parse(evidence.observations[0].result);
const holderObservation = inspectResultSchema.parse(evidence.observations[1].result);
const token2022Observation = inspectResultSchema.parse(token2022Evidence.result);
const VALID_MINT = mintObservation.identity!.mint;
const OWNER = holderObservation.balances!.owner!;
const screenshotDir = path.resolve('test-results/screenshots');

async function ready(page: Page) {
  await expect(page.getByText('Live observation', { exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Inspect', exact: true })).toBeEnabled();
}
async function inspectHolder(page: Page) {
  await ready(page);
  await page.getByLabel(/wallet address/i).fill(OWNER);
  await page.getByRole('button', { name: 'Inspect', exact: true }).click();
  await expect(page.getByTestId('raw-balance')).toHaveText(holderObservation.balances!.display.rawAmount);
}

test.describe('RWA Lens mainnet product', () => {
  test.beforeEach(async ({ page }) => {
    await page.route('**/api/rwa/inspect', route => route.fulfill({ json: route.request().postDataJSON().owner ? holderObservation : mintObservation }));
  });

  test('both entry routes load a mainnet observation and expose no offline controls', async ({ page }) => {
    const errors: string[] = [];
    page.on('pageerror', error => errors.push(String(error)));
    for (const route of ['/', '/rwa']) {
      const request = page.waitForRequest(request => request.url().includes('/api/rwa/inspect'));
      await page.goto(route);
      expect((await request).postDataJSON()).toEqual({ mode: 'live', cluster: 'mainnet-beta', mint: VALID_MINT });
      await ready(page);
      await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
      await expect(page.locator('.identity-card')).toContainText(VALID_MINT);
      await expect(page.getByRole('heading', { name: 'Add a wallet. See the full picture.' })).toBeVisible();
      await expect(page.getByTestId('raw-balance')).toHaveCount(0);
      expect(await page.locator('body').innerText()).not.toMatch(/\b(simulation|example|public rehearsal|sample|illustrative)\b/i);
      await expect(page.locator('.fixture-examples')).toHaveCount(0);
    }
    expect(errors).toEqual([]);
  });

  test('source evidence includes the original slots, provider and observation time', async ({ page }) => {
    await page.goto('/rwa');
    await ready(page);
    await page.locator('#evidence > summary').click();
    await expect(page.getByRole('region', { name: 'RPC sources' })).toBeVisible();
    await expect(page.locator('#evidence .evidence-body')).toContainText(mintObservation.provenance.slot!);
    await expect(page.locator('#evidence .evidence-body')).toContainText(mintObservation.provenance.fetchedAt);
    await expect(page.locator('#evidence .evidence-body')).toContainText('@solana-program/token-2022');
  });

  test('a legacy mint does not acquire Token-2022 extensions or an invented balance', async ({ page }) => {
    await page.goto('/rwa');
    await ready(page);
    await expect(page.getByText(/cannot carry Token-2022 extensions/i).first()).toBeVisible();
    await expect(page.getByText('No Token-2022 extensions were found on this mint.')).toBeVisible();
    await expect(page.getByTestId('raw-balance')).toHaveCount(0);
  });

  test('validates both address decoding and optional owner before additional requests', async ({ page }) => {
    const requests: unknown[] = [];
    page.on('request', request => { if (request.url().includes('/api/rwa/inspect')) requests.push(request); });
    await page.goto('/rwa');
    await ready(page);
    const initialRequests = requests.length;
    await page.getByLabel('Mint address', { exact: true }).fill('not-a-real-mint');
    await expect(page.getByText(/not a valid base58/i)).toBeVisible();
    await expect(page.getByRole('button', { name: 'Inspect', exact: true })).toBeDisabled();
    await page.getByLabel('Mint address', { exact: true }).fill('1'.repeat(33));
    await expect(page.getByRole('button', { name: 'Inspect', exact: true })).toBeDisabled();
    await page.getByLabel('Mint address', { exact: true }).fill(VALID_MINT);
    await page.getByLabel(/wallet address/i).fill('invalid-owner');
    await expect(page.getByText(/enter a valid solana wallet/i)).toBeVisible();
    await expect(page.getByRole('button', { name: 'Inspect', exact: true })).toBeDisabled();
    expect(requests).toHaveLength(initialRequests);
  });

  test('the form sends its owner and reconciles the returned public balance', async ({ page }) => {
    await page.goto('/rwa');
    await ready(page);
    await page.getByLabel(/wallet address/i).fill(OWNER);
    const request = page.waitForRequest(request => request.url().includes('/api/rwa/inspect'));
    await page.getByRole('button', { name: 'Inspect', exact: true }).click();
    expect((await request).postDataJSON()).toEqual({ mode: 'live', cluster: 'mainnet-beta', mint: VALID_MINT, owner: OWNER });
    await expect(page.getByTestId('raw-balance')).toHaveText(holderObservation.balances!.display.rawAmount);
    await page.locator('.account-details > summary').click();
    await expect(page.locator('.account-details')).toContainText(OWNER);
    expect(holderObservation.balances!.totalRawAmount).toBe(holderObservation.balances!.accounts.reduce((sum, account) => sum + BigInt(account.rawAmount), 0n).toString());
  });

  test('decoded Token-2022 controls and partial amounts are displayed without strengthening claims', async ({ page }) => {
    await page.goto('/rwa');
    await ready(page);
    await page.route('**/api/rwa/inspect', route => route.fulfill({ json: token2022Observation }));
    await page.getByLabel('Mint address', { exact: true }).fill(token2022Observation.identity!.mint);
    await page.getByLabel(/wallet address/i).fill(token2022Observation.balances!.owner!);
    await page.getByRole('button', { name: 'Inspect', exact: true }).click();
    await expect(page.getByRole('heading', { name: 'PermanentDelegate', exact: true })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'ScaledUiAmountConfig', exact: true })).toBeVisible();
    await expect(page.getByText('Partial public balance', { exact: true })).toBeVisible();
    await expect(page.getByText(/not a complete wallet balance/)).toBeVisible();
    await expect(page.getByTestId('raw-balance')).toHaveText(token2022Observation.balances!.display.rawAmount);
    await expect(page.getByTestId('display-balance')).toHaveText(token2022Observation.balances!.display.extensionUiAmount!);
  });

  test('JSON exports the exact observed payload and its reproducible hash', async ({ page }) => {
    await page.goto('/rwa');
    await inspectHolder(page);
    const download = page.waitForEvent('download');
    await page.getByRole('button', { name: 'Export JSON', exact: true }).click();
    const file = await download;
    expect(file.suggestedFilename()).toBe(`rwa-lens-${VALID_MINT}.json`);
    const receipt = JSON.parse(await readFile((await file.path())!, 'utf8'));
    expect(receipt.observation).toEqual(holderObservation);
    expect(receipt.inspectionRequest).toEqual({ mode: 'live', cluster: 'mainnet-beta', mint: VALID_MINT, owner: OWNER });
    expect(receipt.contentHash).toBe(createHash('sha256').update(JSON.stringify(receipt.observation)).digest('hex'));
    expect(receipt.note).toContain('does not prove its truth');
  });

  test('CSV exports raw strings and provenance without sign-in', async ({ page }) => {
    await page.goto('/rwa');
    await inspectHolder(page);
    const download = page.waitForEvent('download');
    await page.getByRole('button', { name: 'Export CSV', exact: true }).click();
    const file = await download;
    const csv = await readFile((await file.path())!, 'utf8');
    expect(csv).toContain(`"raw_amount","${holderObservation.balances!.display.rawAmount}"`);
    expect(csv).toContain('"mode","live"');
    expect(csv).toContain(`"inspected_owner","${OWNER}"`);
    expect(csv).toMatch(/"payload_sha256","[a-f0-9]{64}"/);
  });

  test('disabled cloud reports leave guest JSON and CSV exports available', async ({ page }) => {
    await page.goto('/rwa');
    await ready(page);
    await expect(page.getByRole('button', { name: 'Save this report' })).toHaveCount(0);
    await expect(page.getByText(/cloud reports are not enabled on this deployment/i)).toBeVisible();
    await expect(page.getByRole('button', { name: 'Export JSON' })).toBeEnabled();
  });

  test('initial provider failure shows no fabricated result or export, and retry recovers', async ({ page }) => {
    await page.route('**/api/rwa/inspect', route => route.fulfill({ status: 503, json: { status: 'unavailable', message: 'The RPC provider is unavailable. Try again later.' } }));
    await page.goto('/rwa');
    await expect(page.getByText('Inspection unavailable.', { exact: true })).toBeVisible();
    await expect(page.getByTestId('raw-balance')).toHaveCount(0);
    await expect(page.locator('.identity-card')).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Export JSON' })).toHaveCount(0);
    await page.route('**/api/rwa/inspect', route => route.fulfill({ json: mintObservation }));
    await page.getByRole('button', { name: 'Inspect', exact: true }).click();
    await ready(page);
  });

  test('failed refresh keeps the prior observation and its original provenance', async ({ page }) => {
    await page.goto('/rwa');
    await ready(page);
    await page.route('**/api/rwa/inspect', route => route.fulfill({ status: 429, json: { status: 'unavailable', message: 'Too many inspections. Try again shortly.' } }));
    await page.getByRole('button', { name: 'Inspect', exact: true }).click();
    await expect(page.getByText('Inspection unavailable.', { exact: true })).toBeVisible();
    await expect(page.getByText(/previous observation remains below with its original timestamp/)).toBeVisible();
    await page.locator('#evidence > summary').click();
    await expect(page.locator('#evidence')).toContainText(mintObservation.provenance.fetchedAt);
    await expect(page.getByRole('button', { name: 'Export JSON' })).toBeEnabled();
  });

  test('mismatched response identity cannot replace a valid observation', async ({ page }) => {
    await page.goto('/rwa');
    await ready(page);
    await page.route('**/api/rwa/inspect', route => route.fulfill({ json: token2022Observation }));
    await page.getByRole('button', { name: 'Inspect', exact: true }).click();
    await expect(page.getByText(/returned observation does not match/)).toBeVisible();
    await expect(page.locator('.identity-card')).toContainText(VALID_MINT);
    await expect(page.getByRole('heading', { name: 'ScaledUiAmountConfig' })).toHaveCount(0);
  });

  test('exports stay disabled while a fresh read is pending', async ({ page }) => {
    await page.goto('/rwa');
    await ready(page);
    let release!: () => void;
    const pending = new Promise<void>(resolve => { release = resolve; });
    await page.route('**/api/rwa/inspect', async route => { await pending; await route.fulfill({ json: mintObservation }); });
    await page.getByRole('button', { name: 'Inspect', exact: true }).click();
    await expect(page.getByRole('button', { name: 'Export JSON' })).toBeDisabled();
    await expect(page.getByRole('button', { name: 'Export CSV' })).toBeDisabled();
    release();
    await ready(page);
    await expect(page.getByRole('button', { name: 'Export JSON' })).toBeEnabled();
  });

  test('metadata remains opt-in and unsupported URI stays explicitly skipped', async ({ page }) => {
    const calls: string[] = [];
    page.on('request', request => { if (request.url().includes('/api/rwa/metadata')) calls.push(request.url()); });
    const response = structuredClone(mintObservation);
    response.identity!.metadata = { name: 'RPC metadata test', symbol: 'TST', uri: 'ipfs://issuer-document', uriFetch: 'skipped' };
    await page.route('**/api/rwa/inspect', route => route.fulfill({ json: response }));
    await page.goto('/rwa');
    await ready(page);
    await page.locator('.inline-details > summary').click();
    await expect(page.getByText('ipfs://issuer-document', { exact: true })).toBeVisible();
    await expect(page.getByText(/skipped: this uri does not meet/i)).toBeVisible();
    expect(calls).toEqual([]);
  });

  test('stale issuer attribution stays separate from decoded evidence', async ({ page }) => {
    const response = structuredClone(mintObservation);
    response.registry = { issuer: 'Issuer record', assetClass: 'Treasury note', source: 'https://docs.ondo.finance/addresses', fetchedAt: '2026-09-15T00:00:00.000Z', stale: true };
    await page.route('**/api/rwa/inspect', route => route.fulfill({ json: response }));
    await page.goto('/rwa');
    await ready(page);
    const panel = page.locator('#issuer-registry');
    await expect(panel).toContainText('Stale source');
    await panel.locator('summary').click();
    await expect(panel).toContainText('2026-09-15T00:00:00.000Z');
    await expect(panel).toContainText('does not verify backing');
    await expect(panel.getByRole('link', { name: 'Open registry source' })).toHaveAttribute('href', 'https://docs.ondo.finance/addresses');
  });

  for (const width of [360, 390, 768, 1440]) {
    test(`responsive ${width}px layout has no overflow and usable controls`, async ({ page }) => {
      await page.setViewportSize({ width, height: width === 1440 ? 1000 : 900 });
      await page.goto('/rwa');
      await inspectHolder(page);
      await page.evaluate(() => document.fonts.ready);
      expect(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1)).toBe(false);
      const shortControls = await page.locator('button, input, summary').evaluateAll(elements => elements.filter(element => { const box = element.getBoundingClientRect(); return box.width > 0 && box.height > 0 && box.height < 43; }).map(element => element.textContent));
      expect(shortControls).toEqual([]);
      await mkdir(screenshotDir, { recursive: true });
      await page.screenshot({ path: path.join(screenshotDir, `mainnet-${width}.png`), fullPage: true });
    });
  }

  test('keyboard focus remains visible and form fields retain a predictable order', async ({ page }) => {
    await page.goto('/rwa');
    await ready(page);
    await page.keyboard.press('Tab');
    await expect(page.getByRole('link', { name: 'Skip to inspection' })).toBeFocused();
    await page.getByLabel('Mint address', { exact: true }).focus();
    expect(await page.getByLabel('Mint address', { exact: true }).evaluate(element => getComputedStyle(element).outlineStyle)).not.toBe('none');
    await page.keyboard.press('Tab');
    await expect(page.getByLabel(/wallet address/i)).toBeFocused();
  });

  test('reduced-motion mode preserves the live form and holder query', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.goto('/rwa');
    await inspectHolder(page);
    expect(await page.evaluate(() => matchMedia('(prefers-reduced-motion: reduce)').matches)).toBe(true);
    expect(await page.locator('.inspection-results').evaluate(element => getComputedStyle(element).transitionDuration)).toBe('1e-05s');
  });

  test('brand kit serves every advertised asset and stays reachable from the product', async ({ page }) => {
    await page.goto('/rwa');
    await page.getByRole('navigation', { name: 'Main navigation' }).getByRole('link', { name: 'Brand kit' }).click();
    await expect(page).toHaveURL(/\/brand-kit$/);
    await expect(page.getByRole('heading', { level: 1 })).toHaveText(/Clarity,\s*by design\./);
    await page.evaluate(async () => {
      for (let y = 0; y < document.body.scrollHeight; y += 600) { window.scrollTo(0, y); await new Promise(resolve => setTimeout(resolve, 120)); }
      window.scrollTo(0, 0);
    });
    await expect.poll(() => page.evaluate(() => Array.from(document.images).every(image => image.complete && image.naturalWidth > 0))).toBe(true);
    const links = await page.locator('a[download]').evaluateAll(nodes => nodes.map(node => node.getAttribute('href')!));
    expect(links.length).toBeGreaterThanOrEqual(17);
    for (const href of links) expect((await page.request.get(href)).status(), href).toBe(200);
    expect(links).toContain('/brand-kit/rwa-lens-brand-kit.zip');
  });

  for (const width of [390, 1440]) {
    test(`landing and asset gallery fit a ${width}px viewport`, async ({ page }) => {
      await page.setViewportSize({ width, height: 960 });
      await page.emulateMedia({ reducedMotion: 'reduce' });
      for (const route of ['/', '/brand-kit']) {
        await page.goto(route);
        await page.evaluate(() => document.fonts.ready);
        await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
        expect(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1)).toBe(false);
      }
      await page.goto('/');
      await page.getByRole('navigation', { name: 'Main navigation' }).getByRole('link', { name: 'Inspect', exact: true }).click();
      await expect(page.getByLabel('Mint address', { exact: true })).toBeVisible();
      await ready(page);
    });
  }
});
