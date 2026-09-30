import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { expect, test, type Page } from '@playwright/test';
import { inspectResultSchema } from '../../lib/rwa/schema';
import evidence from '../../docs/evidence/live-observations.json';
import { screenerFixture, TSLAX, USDY } from './yield-fixture';

const mintObservation = inspectResultSchema.parse(evidence.observations[0].result);
const rows = (page: Page) => page.locator('[data-pool]');

test.describe('yield screener (deploy flag off)', () => {
  test.beforeEach(async ({ page }) => {
    await page.route('**/api/rwa/screener', route => route.fulfill({ json: screenerFixture }));
  });

  test('lists pools, keeps filters in the URL and links each token to the inspector', async ({ page }) => {
    await page.goto('/yield');
    await expect(page.getByRole('heading', { name: 'Yield opportunities', exact: true })).toBeVisible();
    await expect(page.getByText('4 of 4 pools · 3 assets with a listed pool of 1,075 checked')).toBeVisible();
    await expect(rows(page)).toHaveCount(4);
    await expect(rows(page).first()).toContainText('NVDAx-SOL');
    await expect(rows(page).first()).toContainText('Trading halted');
    await expect(page.locator('[data-pool="BCZLEgknvcyCsJ9ERRN38U4gBTNn4ftU11fEtV3XHnK2"]')).toContainText('over 1,000%');
    await expect(page.getByRole('button', { name: /Deploy USDC/ })).toHaveCount(0);
    await expect(page.getByRole('link', { name: 'Inspect TSLAx' }).first()).toHaveAttribute('href', `/rwa?mint=${TSLAX}`);

    await page.getByText('USDC only', { exact: true }).click();
    await expect(page).toHaveURL(/\/yield\?pair=usdc$/);
    await expect(rows(page)).toHaveCount(2);
    await page.getByText('Ondo', { exact: true }).click();
    await expect(rows(page)).toHaveCount(1);
    await expect(rows(page).first()).toContainText('USDY-USDC');

    await page.goto('/yield?issuer=xStocks&tvl=1000&sort=apy');
    await expect(rows(page)).toHaveCount(2);
    await expect(rows(page).first()).toContainText('TSLAx-SOL');
    await expect(page.getByLabel('Sort by')).toHaveValue('apy');
  });

  test('fits a phone and passes an accessibility sweep', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto('/yield');
    await expect(rows(page)).toHaveCount(4);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    await page.addScriptTag({ content: await readFile(path.resolve('node_modules/axe-core/axe.min.js'), 'utf8') });
    const violations = await page.evaluate(async () => {
      const axe = (window as unknown as { axe: { run: (context: unknown, options: unknown) => Promise<{ violations: Array<{ id: string; nodes: unknown[] }> }> } }).axe;
      return (await axe.run('main', { runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21aa'] } })).violations.map(violation => `${violation.id} (${violation.nodes.length})`);
    });
    expect(violations).toEqual([]);
  });

  test('says plainly when pool data is unavailable', async ({ page }) => {
    await page.unroute('**/api/rwa/screener');
    await page.route('**/api/rwa/screener', route => route.fulfill({ status: 503, json: { state: 'unavailable', reason: 'The pool or issuer data could not be read. Try again shortly.' } }));
    await page.goto('/yield');
    await expect(page.getByText('The pool or issuer data could not be read. Try again shortly.')).toBeVisible();
    await expect(rows(page)).toHaveCount(0);
  });

  test('the inspector opens on a mint from the URL, and ignores a bad one', async ({ page }) => {
    const bodies: Array<{ mint: string }> = [];
    await page.route('**/api/rwa/inspect', route => { bodies.push(route.request().postDataJSON()); return route.fulfill({ json: mintObservation }); });
    await page.goto(`/rwa?mint=${TSLAX}`);
    await expect.poll(() => bodies.length).toBeGreaterThan(0);
    expect(bodies[0].mint).toBe(TSLAX);
    await page.goto('/rwa?mint=not-a-mint');
    await expect.poll(() => bodies.length).toBeGreaterThan(1);
    expect(bodies[1].mint).toBe(USDY);
  });
});
