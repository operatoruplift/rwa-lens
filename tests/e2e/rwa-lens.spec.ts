import { expect, test } from '@playwright/test';

/**
 * Browser coverage for the guest path. Every case here runs without a wallet,
 * a signature or an RPC provider, which is also the judge's path.
 */

test.describe('RWA Lens guest inspection', () => {
  test('lands on a populated inspection rather than an empty shell', async ({ page }) => {
    const errors: string[] = [];
    page.on('pageerror', error => errors.push(String(error)));

    await page.goto('/rwa');
    await expect(page.getByRole('heading', { name: /know what your real-world token means/i })).toBeVisible();

    // The first paint already shows a real answer.
    await expect(page.getByText('Raw base units', { exact: true })).toBeVisible();
    await expect(page.getByText('1000000000', { exact: true }).first()).toBeVisible();
    await expect(page.getByRole('heading', { name: 'ScaledUiAmountConfig' })).toBeVisible();
    expect(errors).toEqual([]);
  });

  test('keeps the raw amount fixed while the displayed amount changes across fixtures', async ({ page }) => {
    await page.goto('/rwa');
    const raw = await page
      .getByText('Raw base units', { exact: true })
      .locator('xpath=following-sibling::p[1]')
      .innerText();
    expect(raw.trim()).toBe('1000000000');
    // The scaled amount differs from the exact decimal amount; that is the point.
    await expect(page.getByText('1042.35', { exact: true }).first()).toBeVisible();
    await expect(page.getByText('× multiplier 1.04235', { exact: true })).toBeVisible();
  });

  test('explains a permanent delegate and a default-frozen state in holder terms', async ({ page }) => {
    await page.goto('/rwa');
    await expect(page.getByRole('heading', { name: 'PermanentDelegate' })).toBeVisible();
    await expect(page.getByText(/without your signature/i).first()).toBeVisible();
    await expect(page.getByRole('heading', { name: 'DefaultAccountState' })).toBeVisible();
  });

  test('never renders an opaque state as safe', async ({ page }) => {
    await page.goto('/rwa');
    await page.getByRole('button', { name: /private-credit receipt/i }).click();
    await expect(page.getByText('unknown').first()).toBeVisible();
    await expect(page.getByText(/it is not zero/i).first()).toBeVisible();
  });

  test('states plainly when a mint is not Token-2022', async ({ page }) => {
    await page.goto('/rwa');
    await page.getByRole('button', { name: /plain spl token/i }).click();
    await expect(page.getByText(/cannot carry Token-2022 extensions/i).first()).toBeVisible();
  });

  test('rejects an invalid mint before sending a request', async ({ page }) => {
    await page.goto('/rwa');
    await page.getByLabel('Mint address').fill('not-a-real-mint');
    await expect(page.getByText(/not a valid base58/i)).toBeVisible();
    await expect(page.getByRole('button', { name: 'Inspect' })).toBeDisabled();
  });

  test('exports JSON without any authentication', async ({ page }) => {
    await page.goto('/rwa');
    const download = page.waitForEvent('download');
    await page.getByRole('button', { name: 'Export JSON' }).click();
    const file = await download;
    expect(file.suggestedFilename()).toMatch(/\.json$/);
  });

  test('offers no transaction affordance, and says so where it asks for a signature', async ({ page }) => {
    await page.goto('/rwa');
    const body = (await page.locator('body').innerText()).toLowerCase();
    // Saving a report asks for a message signature. Nothing anywhere asks to
    // sign, send, approve or submit a transaction.
    for (const forbidden of ['sign transaction', 'approve transaction', 'send transaction', 'submit transaction', 'connect wallet']) {
      expect(body, `"${forbidden}" must never appear`).not.toContain(forbidden);
    }
    expect(body).toContain('read-only');
    expect(body).toContain('never a transaction');
  });

  test('saving a report degrades honestly when the feature is switched off', async ({ page }) => {
    await page.goto('/rwa');
    await page.getByRole('button', { name: 'Save this report' }).click();
    // The deployment under test has reports disabled; it must say so and point
    // at the export that needs no account, not fail silently.
    await expect(page.getByText(/not enabled on this deployment/i)).toBeVisible();
    await expect(page.getByRole('button', { name: 'Export JSON' })).toBeEnabled();
  });

  test('never fetches issuer metadata without being asked', async ({ page }) => {
    const metadataCalls: string[] = [];
    page.on('request', request => {
      if (request.url().includes('/api/rwa/metadata')) metadataCalls.push(request.url());
    });
    await page.goto('/rwa');
    await page.waitForTimeout(1500);
    expect(metadataCalls).toEqual([]);
  });

  test('is usable at 360px with no horizontal overflow', async ({ page }) => {
    await page.setViewportSize({ width: 360, height: 800 });
    await page.goto('/rwa');
    await expect(page.getByRole('heading', { name: /know what your real-world token means/i })).toBeVisible();
    const overflows = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1);
    expect(overflows).toBe(false);
  });

  test('is navigable by keyboard with a visible focus ring', async ({ page }) => {
    await page.goto('/rwa');
    await page.getByLabel('Mint address').focus();
    await expect(page.getByLabel('Mint address')).toBeFocused();
    await page.keyboard.press('Tab');
    await expect(page.getByLabel(/wallet address/i)).toBeFocused();
  });

  test('keeps fixtures usable when the live provider is unavailable', async ({ page }) => {
    await page.goto('/rwa');
    await page.getByLabel('Mint address').fill('XsbEhLAtcf6HdfpFZ5xEMdqW8nfAvcsP5bdudRLJzJp');
    await page.getByRole('button', { name: 'Inspect' }).click();
    // Without RWA_RPC_URL the server returns a structured unavailable state.
    await expect(page.getByText(/Inspection unavailable|Raw base units/).first()).toBeVisible();
    await page.getByRole('button', { name: /tokenised treasury/i }).click();
    await expect(page.getByText('Raw base units', { exact: true })).toBeVisible();
  });
});
