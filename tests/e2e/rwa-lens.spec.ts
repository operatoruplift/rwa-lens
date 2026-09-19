import { createHash } from 'node:crypto';
import { mkdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { expect, test } from '@playwright/test';
import { FIXTURES } from '../../lib/rwa/fixtures';

const VALID_MINT = 'A1KLoBrKBde8Ty9qtNQUtq3C2ortoC3u7twggz7sEto6';
const screenshotDir = path.resolve('docs/screenshots');

test.describe('RWA Lens guest product', () => {
  test('both entry routes show the brand, working inspector and an honest synthetic observation', async ({ page }) => {
    const errors: string[] = [];
    page.on('pageerror', error => errors.push(String(error)));
    for (const route of ['/', '/rwa']) {
      await page.goto(route);
      await expect(page.getByRole('heading', { name: /know what your real-world token means/i })).toBeVisible();
      await expect(page.getByText('Synthetic example', { exact: true })).toBeVisible();
      await expect(page.getByTestId('raw-balance')).toHaveText('1000000000');
      await expect(page.getByRole('heading', { name: 'ScaledUiAmountConfig' })).toBeVisible();
      await expect(page.getByRole('heading', { name: /a balance is a number/i })).toBeAttached();
      await expect(page.locator('.observation-bar')).not.toContainText('verified');
    }
    expect(errors).toEqual([]);
  });

  test('scheduled before/at/after controls call the API and preserve raw units', async ({ page }) => {
    await page.goto('/rwa');
    await expect(page.getByTestId('display-balance')).toHaveText('1042.35');
    for (const [button, scenario, amount] of [['At boundary', 'at', '1051.14'], ['After change', 'after', '1051.14'], ['Before change', 'before', '1042.35']] as const) {
      const request = page.waitForRequest(request => request.url().includes('/api/rwa/inspect'));
      await page.getByRole('button', { name: new RegExp(button) }).click();
      expect((await request).postDataJSON()).toEqual({ mode: 'fixture', fixtureId: 'treasury-scaled', scenario });
      await expect(page.getByTestId('display-balance')).toHaveText(amount);
      await expect(page.getByTestId('raw-balance')).toHaveText('1000000000');
      await expect(page.getByRole('button', { name: new RegExp(button) })).toHaveAttribute('aria-pressed', 'true');
    }
  });

  test('account details and source evidence are progressively disclosed', async ({ page }) => {
    await page.goto('/rwa');
    await page.locator('.account-details > summary').click();
    await expect(page.getByRole('region', { name: 'Token accounts' })).toBeVisible();
    await expect(page.getByRole('cell', { name: '1000000000', exact: true })).toBeVisible();
    await page.locator('#evidence > summary').click();
    await expect(page.getByRole('region', { name: 'RPC sources' })).toBeVisible();
    await expect(page.getByText('Observed Clock timestamp', { exact: true })).toBeVisible();
    await expect(page.locator('#evidence .evidence-body')).toContainText('@solana-program/token-2022');
  });

  test('explains permanent delegation and default state without declaring existing holders frozen', async ({ page }) => {
    await page.goto('/rwa');
    await expect(page.getByRole('heading', { name: 'PermanentDelegate' })).toBeVisible();
    await expect(page.getByText(/without your signature/i).first()).toBeVisible();
    await expect(page.getByRole('heading', { name: 'DefaultAccountState' })).toBeVisible();
    await expect(page.locator('.readiness-overview')).toContainText('attention');
  });

  test('confidential portions and transfer hooks remain unknown', async ({ page }) => {
    await page.goto('/rwa');
    await page.getByRole('button', { name: 'Private-credit receipt', exact: true }).click();
    await expect(page.locator('.readiness-overview')).toContainText('unknown');
    await expect(page.getByRole('heading', { name: 'TransferHook', exact: true })).toBeVisible();
    await expect(page.getByText(/it is not zero/i).first()).toBeVisible();
    await expect(page.getByRole('heading', { name: 'ConfidentialTransferAccount', exact: true })).toBeVisible();
  });

  test('legacy SPL mint-only inspection explains why balance was not requested', async ({ page }) => {
    await page.goto('/rwa');
    await page.getByRole('button', { name: 'Plain SPL token', exact: true }).click();
    await expect(page.getByText(/cannot carry Token-2022 extensions/i).first()).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Add a wallet. See the full picture.' })).toBeVisible();
    await expect(page.getByTestId('raw-balance')).toHaveCount(0);
  });

  test('validates both address decoding and optional owner before any RPC request', async ({ page }) => {
    const requests: unknown[] = [];
    page.on('request', request => { if (request.url().includes('/api/rwa/inspect')) requests.push(request); });
    await page.goto('/rwa');
    await page.getByLabel('Mint address', { exact: true }).fill('not-a-real-mint');
    await expect(page.getByText(/not a valid base58/i)).toBeVisible();
    await expect(page.getByRole('button', { name: 'Inspect', exact: true })).toBeDisabled();
    await page.getByLabel('Mint address', { exact: true }).fill('1'.repeat(33));
    await expect(page.getByRole('button', { name: 'Inspect', exact: true })).toBeDisabled();
    await page.getByLabel('Mint address', { exact: true }).fill(VALID_MINT);
    await page.getByLabel(/wallet address/i).fill('invalid-owner');
    await expect(page.getByText(/enter a valid solana wallet/i)).toBeVisible();
    await expect(page.getByRole('button', { name: 'Inspect', exact: true })).toBeDisabled();
    expect(requests).toHaveLength(0);
  });

  test('the guest live form sends the owner and labels a decoded live response', async ({ page }) => {
    const observation = structuredClone(FIXTURES[0].result);
    observation.mode = 'live'; observation.provenance.mode = 'live'; observation.provenance.rpcProvider = 'test-provider';
    observation.identity!.mint = VALID_MINT;
    observation.balances!.owner = VALID_MINT;
    await page.route('**/api/rwa/inspect', route => route.fulfill({ json: observation }));
    await page.goto('/rwa');
    await page.getByLabel('Mint address', { exact: true }).fill(VALID_MINT);
    await page.getByLabel(/wallet address/i).fill(VALID_MINT);
    const request = page.waitForRequest(request => request.url().includes('/api/rwa/inspect'));
    await page.getByRole('button', { name: 'Inspect', exact: true }).click();
    expect((await request).postDataJSON()).toMatchObject({ mode: 'live', mint: VALID_MINT, owner: VALID_MINT });
    await expect(page.getByText('Live observation', { exact: true })).toBeVisible();
    await expect(page.getByTestId('raw-balance')).toHaveText('1000000000');
  });

  test('JSON exports a point-in-time receipt with a reproducible payload hash', async ({ page }) => {
    await page.goto('/rwa');
    const download = page.waitForEvent('download');
    await page.getByRole('button', { name: 'Export JSON', exact: true }).click();
    const file = await download;
    expect(file.suggestedFilename()).toMatch(/synthetic-example\.json$/);
    const receipt = JSON.parse(await readFile((await file.path())!, 'utf8'));
    expect(receipt.observation.mode).toBe('fixture');
    expect(receipt.observation.balances.display.rawAmount).toBe('1000000000');
    expect(receipt.contentHash).toBe(createHash('sha256').update(JSON.stringify(receipt.observation)).digest('hex'));
    expect(receipt.note).toContain('does not prove its truth');
  });

  test('CSV exports raw strings, display precision and provenance without sign-in', async ({ page }) => {
    await page.goto('/rwa');
    const download = page.waitForEvent('download');
    await page.getByRole('button', { name: 'Export CSV', exact: true }).click();
    const file = await download;
    const csv = await readFile((await file.path())!, 'utf8');
    expect(csv).toContain('"raw_amount","1000000000"');
    expect(csv).toContain('"mode","fixture"');
    expect(csv).toContain('"rounding","official-helper"');
    expect(csv).toMatch(/"payload_sha256","[a-f0-9]{64}"/);
  });

  test('disabled cloud reports omit active save and wallet controls', async ({ page }) => {
    await page.goto('/rwa');
    await expect(page.getByRole('button', { name: 'Save this report' })).toHaveCount(0);
    await expect(page.getByText(/cloud reports are not enabled on this deployment/i)).toBeVisible();
    await expect(page.getByRole('button', { name: 'Export JSON' })).toBeEnabled();
    expect((await page.locator('body').innerText()).toLowerCase()).toContain('never a transaction');
  });

  test('a live provider failure retains prior observation and leaves actual fixtures usable', async ({ page }) => {
    await page.route('**/api/rwa/inspect', async route => {
      if (route.request().postDataJSON().mode === 'live') await route.fulfill({ status: 503, json: { status: 'unavailable', message: 'The RPC provider is unavailable. Try again later.' } });
      else await route.continue();
    });
    await page.goto('/rwa');
    await page.getByLabel('Mint address', { exact: true }).fill(VALID_MINT);
    await page.getByRole('button', { name: 'Inspect', exact: true }).click();
    await expect(page.getByText('Inspection unavailable.', { exact: true })).toBeVisible();
    await expect(page.getByTestId('raw-balance')).toHaveText('1000000000');
    await page.getByRole('button', { name: 'Private-credit receipt', exact: true }).click();
    await expect(page.locator('.readiness-overview')).toContainText('unknown');
    await page.getByRole('button', { name: 'Treasury receipt', exact: true }).click();
    await expect(page.getByTestId('raw-balance')).toHaveText('1000000000');
  });

  test('metadata is not fetched automatically and unsupported URI is visible as skipped', async ({ page }) => {
    const metadataCalls: string[] = [];
    page.on('request', request => { if (request.url().includes('/api/rwa/metadata')) metadataCalls.push(request.url()); });
    const observation = structuredClone(FIXTURES[0].result);
    observation.identity!.metadata!.uri = 'ipfs://issuer-document';
    await page.route('**/api/rwa/inspect', route => route.fulfill({ json: observation }));
    await page.goto('/rwa');
    await page.getByRole('button', { name: 'Treasury receipt', exact: true }).click();
    await page.locator('.inline-details > summary').click();
    await expect(page.getByText('ipfs://issuer-document', { exact: true })).toBeVisible();
    await expect(page.getByText(/skipped: this uri does not meet/i)).toBeVisible();
    expect(metadataCalls).toEqual([]);
  });

  test('registry unavailable and stale attribution stay separate from on-chain proof', async ({ page }) => {
    await page.goto('/rwa');
    const panel = page.locator('#issuer-registry');
    await expect(panel).toContainText('Issuer attribution unavailable');
    await panel.locator('summary').click();
    await expect(panel).toContainText('A decoded mint alone does not establish');
    const observation = structuredClone(FIXTURES[0].result);
    observation.registry = { issuer: 'Example issuer', assetClass: 'Treasury note', source: 'https://example.com/issuer-record', fetchedAt: '2026-09-15T00:00:00.000Z', stale: true };
    await page.route('**/api/rwa/inspect', route => route.fulfill({ json: observation }));
    await page.getByRole('button', { name: 'Treasury receipt', exact: true }).click();
    await expect(panel).toContainText('Stale source');
    await expect(panel).toContainText('2026-09-15T00:00:00.000Z');
    await expect(panel).toContainText('does not verify backing');
    await expect(panel.getByRole('link', { name: 'Open registry source' })).toHaveAttribute('href', 'https://example.com/issuer-record');
  });

  for (const width of [360, 390, 768, 1440]) {
    test(`responsive ${width}px layout has no overflow and usable touch controls`, async ({ page }) => {
      await page.setViewportSize({ width, height: width === 1440 ? 1000 : 900 });
      await page.goto('/rwa');
      await page.evaluate(() => document.fonts.ready);
      expect(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1)).toBe(false);
      const shortControls = await page.locator('button, input, summary').evaluateAll(elements => elements.filter(element => { const box = element.getBoundingClientRect(); return box.width > 0 && box.height > 0 && box.height < 43; }).map(element => element.textContent));
      expect(shortControls).toEqual([]);
      await expect(page.getByTestId('raw-balance')).toHaveText('1000000000');
      await mkdir(screenshotDir, { recursive: true });
      const name = width === 1440 ? 'rwa-desktop-1440.png' : width === 768 ? 'rwa-tablet-768.png' : `rwa-mobile-${width}.png`;
      await page.screenshot({ path: path.join(screenshotDir, name), fullPage: true });
    });
  }

  test('keyboard focus is visible and form fields have a predictable order', async ({ page }) => {
    await page.goto('/rwa');
    await page.keyboard.press('Tab');
    await expect(page.getByRole('link', { name: 'Skip to inspection' })).toBeFocused();
    await page.getByLabel('Mint address', { exact: true }).focus();
    const outline = await page.getByLabel('Mint address', { exact: true }).evaluate(element => getComputedStyle(element).outlineStyle);
    expect(outline).not.toBe('none');
    await page.keyboard.press('Tab');
    await expect(page.getByLabel(/wallet address/i)).toBeFocused();
    await mkdir(screenshotDir, { recursive: true });
    await page.screenshot({ path: path.join(screenshotDir, 'rwa-keyboard.png') });
  });

  test('reduced-motion mode preserves working timeline and disables animated transitions', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.goto('/rwa');
    expect(await page.evaluate(() => matchMedia('(prefers-reduced-motion: reduce)').matches)).toBe(true);
    await page.getByRole('button', { name: /After change/ }).click();
    await expect(page.getByTestId('display-balance')).toHaveText('1051.14');
    expect(await page.locator('.inspection-results').evaluate(element => getComputedStyle(element).transitionDuration)).toBe('1e-05s');
    await mkdir(screenshotDir, { recursive: true });
    await page.screenshot({ path: path.join(screenshotDir, 'rwa-reduced-motion.png'), fullPage: true });
  });
});
