import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { expect, test, type Page } from '@playwright/test';
import { inspectResultSchema } from '../../lib/rwa/schema';
import { WATCHLIST_STORAGE_KEY } from '../../lib/rwa/watchlist';
import evidence from '../../docs/evidence/live-observations.json';
import { screenerFixture, USDY } from './yield-fixture';

// Archived observations are replayed only by browser interception. The app's
// request validation and receipt hashing still run normally in these journeys.
const mintObservation = inspectResultSchema.parse(evidence.observations[0].result);
const holderObservation = inspectResultSchema.parse(evidence.observations[1].result);
const OWNER = holderObservation.balances!.owner!;
const tabs = ['Overview', 'Balances', 'Controls', 'Liquidity', 'Evidence'] as const;
type InspectorTab = typeof tabs[number];
const venues = {
  state: 'ok', mint: USDY, source: 'Meteora DLMM data API',
  fetchedAt: screenerFixture.fetchedAt, matched: 1, belowFloor: 0,
  pools: screenerFixture.pools.filter(pool => pool.mint === USDY),
};

class Workspace {
  constructor(readonly page: Page) {}

  get navigation() { return this.page.getByRole('navigation', { name: 'Workspace navigation' }); }
  tab(name: InspectorTab) { return this.page.getByRole('tab', { name, exact: true }); }

  async ready() {
    await expect(this.page.getByText('Live observation', { exact: true })).toBeVisible();
    await expect(this.page.getByRole('button', { name: 'Inspect', exact: true })).toBeEnabled();
  }

  async selected(name: InspectorTab) {
    await expect(this.tab(name)).toHaveAttribute('aria-selected', 'true');
    await expect(this.page.getByRole('tab', { selected: true })).toHaveCount(1);
    await expect(this.page.locator('[role="tabpanel"]')).toHaveCount(tabs.length);
    await expect(this.page.locator('[role="tabpanel"]:visible')).toHaveCount(1);
    const panelId = await this.tab(name).getAttribute('aria-controls');
    expect(panelId).toBeTruthy();
    await expect(this.page.locator(`[id="${panelId}"]`)).toBeVisible();
    await expect.poll(() => new URL(this.page.url()).searchParams.get('tab') ?? 'overview').toBe(name.toLowerCase());
  }

  async select(name: InspectorTab) {
    await this.tab(name).click();
    await this.selected(name);
  }
}

async function expectAccessible(page: Page) {
  await page.addScriptTag({ content: await readFile(path.resolve('node_modules/axe-core/axe.min.js'), 'utf8') });
  const violations = await page.evaluate(async () => {
    const axe = (window as unknown as { axe: {
      run: (context: unknown, options: unknown) => Promise<{ violations: Array<{ id: string; nodes: Array<{ target: string[] }> }> }>;
    } }).axe;
    return (await axe.run(document, { runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21aa'] } }))
      .violations.map(violation => ({ id: violation.id, targets: violation.nodes.map(node => node.target) }));
  });
  expect(violations).toEqual([]);
}

test.describe('RWA Lens app workspace', () => {
  const errors = new WeakMap<Page, string[]>();
  const requests = new WeakMap<Page, { inspections: number; venues: number }>();

  test.beforeEach(async ({ page }) => {
    const browserErrors: string[] = [];
    errors.set(page, browserErrors);
    page.on('pageerror', error => browserErrors.push(error.message));
    page.on('console', message => { if (message.type() === 'error') browserErrors.push(message.text()); });
    const counts = { inspections: 0, venues: 0 };
    requests.set(page, counts);
    await page.route('**/api/rwa/inspect', route => {
      counts.inspections += 1;
      return route.fulfill({ json: route.request().postDataJSON().owner ? holderObservation : mintObservation });
    });
    await page.route('**/api/rwa/venues?**', route => {
      counts.venues += 1;
      return route.fulfill({ json: venues });
    });
    await page.route('**/api/rwa/screener', route => route.fulfill({ json: screenerFixture }));
  });

  test.afterEach(async ({ page }) => {
    expect(errors.get(page), 'Workspace journeys should not emit browser errors').toEqual([]);
  });

  test('workspace navigation reaches each tool and preserves yield filters through browser history', async ({ page }) => {
    const app = new Workspace(page);
    await page.goto('/rwa');
    await app.ready();
    for (const [name, href] of [['Inspector', '/rwa'], ['Yield', '/yield'], ['Watchlist', '/watchlist']]) {
      await expect(app.navigation.getByRole('link', { name, exact: true })).toHaveAttribute('href', href);
    }
    await expect(app.navigation.getByRole('link', { name: 'Inspector', exact: true })).toHaveAttribute('aria-current', 'page');
    await expect(page.getByRole('link', { name: 'Demo', exact: true })).toHaveAttribute('href', '/demo');
    await app.navigation.getByRole('link', { name: 'Watchlist', exact: true }).click();
    await expect(page).toHaveURL(/\/watchlist$/);
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
    await expect(app.navigation.getByRole('link', { name: 'Watchlist', exact: true })).toHaveAttribute('aria-current', 'page');

    await app.navigation.getByRole('link', { name: 'Yield', exact: true }).click();
    await expect(app.navigation.getByRole('link', { name: 'Yield', exact: true })).toHaveAttribute('aria-current', 'page');
    await expect(page.locator('[data-pool]')).toHaveCount(4);
    await page.getByText('USDC only', { exact: true }).click();
    await expect.poll(() => new URL(page.url()).searchParams.get('pair')).toBe('usdc');
    await page.getByText('Ondo', { exact: true }).click();
    await expect(page.locator('[data-pool]')).toHaveCount(1);
    expect(new URL(page.url()).searchParams.get('issuer')).toBe('Ondo');
    expect(new URL(page.url()).searchParams.get('pair')).toBe('usdc');
    const filteredUrl = page.url();
    await page.getByRole('link', { name: 'Inspect USDY', exact: true }).click();
    await app.ready();
    await expect(page.getByLabel('Mint address', { exact: true })).toHaveValue(USDY);
    await app.selected('Overview');
    await page.goBack();
    await expect(page).toHaveURL(filteredUrl);
    await expect(page.locator('[data-pool]')).toHaveCount(1);
    await expect(page.locator('[data-pool]').first()).toContainText('USDY-USDC');
    await page.goForward();
    await app.ready();
    await expect(page.getByLabel('Mint address', { exact: true })).toHaveValue(USDY);
    await app.selected('Overview');
  });

  test('tab changes and browser history preserve the mint, wallet draft, and loaded observation', async ({ page }) => {
    const app = new Workspace(page);
    await page.goto(`/rwa?mint=${USDY}&tab=overview`);
    await app.ready();
    await page.getByLabel(/wallet address/i).fill(OWNER);
    await app.select('Balances');
    await app.select('Controls');
    await app.select('Evidence');
    await page.goBack();
    await app.selected('Controls');
    await page.goBack();
    await app.selected('Balances');
    await page.goForward();
    await app.selected('Controls');
    // Re-selecting the current section must not replace the remaining Forward history.
    await app.tab('Controls').click();
    await page.goForward();
    await app.selected('Evidence');
    await expect(page.getByLabel(/wallet address/i)).toHaveValue(OWNER);
    await expect(page.getByLabel('Mint address', { exact: true })).toHaveValue(USDY);
    expect(new URL(page.url()).searchParams.get('mint')).toBe(USDY);
    expect(requests.get(page)?.inspections).toBe(1);
  });

  test('a saved mint persists on a phone, opens an inspection, deduplicates, and can be removed', async ({ page }) => {
    const app = new Workspace(page);
    await page.setViewportSize({ width: 390, height: 900 });
    await page.goto('/rwa');
    await app.ready();
    await page.getByRole('button', { name: 'Save to watchlist', exact: true }).click();
    await expect(page.getByRole('button', { name: 'Remove from watchlist', exact: true })).toHaveAttribute('aria-pressed', 'true');
    await app.navigation.getByRole('link', { name: 'Watchlist', exact: true }).click();
    const list = page.getByRole('region', { name: 'Device watchlist' });
    await expect(list.locator('article')).toHaveCount(1);
    await expect(list.locator('article')).toContainText(USDY);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
    await expectAccessible(page);
    await list.getByLabel('Add a Solana mint').fill(USDY);
    await list.getByRole('button', { name: 'Save mint', exact: true }).click();
    await expect(list.locator('article')).toHaveCount(1);
    await page.reload();
    await expect(list.locator('article')).toHaveCount(1);
    await list.getByRole('link', { name: 'Open inspector', exact: true }).click();
    await app.ready();
    await expect(page.getByLabel('Mint address', { exact: true })).toHaveValue(USDY);
    await expect(page.getByRole('button', { name: 'Remove from watchlist', exact: true })).toHaveAttribute('aria-pressed', 'true');
    await app.navigation.getByRole('link', { name: 'Watchlist', exact: true }).click();
    await list.locator('article').getByRole('button', { name: /Remove .* from watchlist/ }).click();
    await expect(list.locator('article')).toHaveCount(0);
    await expect(list.getByRole('heading', { name: 'A place for assets you follow.' })).toBeVisible();
    await page.reload();
    await expect(list.getByRole('heading', { name: 'A place for assets you follow.' })).toBeVisible();
    await list.getByLabel('Add a Solana mint').fill('not-a-mint');
    await list.getByRole('button', { name: 'Save mint', exact: true }).click();
    await expect(list.getByRole('status')).toContainText('Enter a valid Solana mint address');
    await expect(list.locator('article')).toHaveCount(0);
  });

  test('unreadable device storage is explained and recovers only after an explicit clear', async ({ page }) => {
    await page.goto('/watchlist');
    await page.evaluate(key => localStorage.setItem(key, '{broken'), WATCHLIST_STORAGE_KEY);
    await page.reload();
    const list = page.getByRole('region', { name: 'Device watchlist' });
    await expect(list.getByRole('status')).toContainText('saved list could not be read');
    await list.getByLabel('Add a Solana mint').fill(USDY);
    await list.getByRole('button', { name: 'Save mint', exact: true }).click();
    expect(await page.evaluate(key => localStorage.getItem(key), WATCHLIST_STORAGE_KEY)).toBe('{broken');
    await expect(list.locator('article')).toHaveCount(0);
    await list.getByRole('button', { name: 'Clear saved list', exact: true }).click();
    await expect(list.getByRole('status')).toContainText('saved list was cleared');
    await list.getByRole('button', { name: 'Save mint', exact: true }).click();
    await expect(list.locator('article')).toHaveCount(1);
    await expect(list.locator('article')).toContainText(USDY);
  });

  test('each section can be opened directly and an unsupported tab falls back to Overview', async ({ page }) => {
    const app = new Workspace(page);
    for (const name of tabs) {
      await page.goto(`/rwa?mint=${USDY}&tab=${name.toLowerCase()}`);
      await app.ready();
      await app.selected(name);
      await expect(page.getByLabel('Mint address', { exact: true })).toHaveValue(USDY);
    }
    await page.goto(`/rwa?mint=${USDY}&tab=unknown`);
    await app.ready();
    await expect(app.tab('Overview')).toHaveAttribute('aria-selected', 'true');
    await expect(page.locator('.identity-card')).toBeVisible();
    await expect(page.locator('[role="tabpanel"]:visible')).toHaveCount(1);
  });

  test('switching sections retains disclosures and makes no extra reads or receipt changes', async ({ page }) => {
    const app = new Workspace(page);
    await page.goto('/rwa');
    await app.ready();
    await page.getByLabel(/wallet address/i).fill(OWNER);
    await page.getByRole('button', { name: 'Inspect', exact: true }).click();
    await app.select('Balances');
    await expect(page.getByTestId('raw-balance')).toHaveText(holderObservation.balances!.display.rawAmount);
    await page.locator('.account-details > summary').click();
    await app.select('Liquidity');
    await expect(page.getByRole('region', { name: 'Liquidity venues on Meteora' })).toHaveAttribute('data-venues-state', 'ok');
    const counts = { ...requests.get(page)! };
    for (const name of tabs) await app.select(name);
    await app.select('Balances');
    await expect(page.locator('.account-details')).toHaveAttribute('open', '');
    await expect(page.getByTestId('raw-balance')).toHaveText(holderObservation.balances!.display.rawAmount);
    expect(requests.get(page)).toEqual(counts);
    expect(counts.inspections).toBe(2);
    expect(counts.venues).toBe(1);
    await app.select('Controls');
    const download = page.waitForEvent('download');
    await page.getByRole('button', { name: 'Export JSON', exact: true }).click();
    const receipt = JSON.parse(await readFile((await (await download).path())!, 'utf8'));
    expect(receipt.observation).toEqual(holderObservation);
    expect(receipt.inspectionRequest).toEqual({ mode: 'live', cluster: 'mainnet-beta', mint: USDY, owner: OWNER });
    expect(receipt.contentHash).toBe(createHash('sha256').update(JSON.stringify(holderObservation)).digest('hex'));
  });

  test('tabs support arrow keys, Home, End, and one keyboard stop', async ({ page }) => {
    const app = new Workspace(page);
    await page.goto('/rwa');
    await app.ready();
    await app.tab('Overview').focus();
    for (const [key, name] of [['ArrowRight', 'Balances'], ['End', 'Evidence'], ['Home', 'Overview'], ['ArrowLeft', 'Evidence']] as const) {
      await page.keyboard.press(key);
      await app.selected(name);
      await expect(app.tab(name)).toBeFocused();
      for (const other of tabs) await expect(app.tab(other)).toHaveAttribute('tabindex', other === name ? '0' : '-1');
    }
    await page.keyboard.press('Tab');
    expect(await page.locator('[role="tabpanel"]:visible').evaluate(panel => panel.contains(document.activeElement))).toBe(true);
  });

  for (const width of [390, 1440]) {
    test(`${width}px workspace keeps every section usable and passes accessibility checks`, async ({ page }, testInfo) => {
      const app = new Workspace(page);
      await page.setViewportSize({ width, height: 900 });
      await page.goto('/rwa');
      await app.ready();
      await page.evaluate(() => document.fonts.ready);
      for (const name of tabs) {
        await app.select(name);
        expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), `${name} overflow at ${width}px`).toBe(true);
      }
      for (const name of ['Inspector', 'Yield', 'Watchlist']) {
        await expect(app.navigation.getByRole('link', { name, exact: true })).toBeInViewport();
      }
      const footer = page.getByRole('contentinfo');
      await expect(footer.getByRole('link', { name: 'Watch the demo', exact: true })).toBeVisible();
      await expect(footer.getByRole('link', { name: 'Watch the demo', exact: true })).toHaveAttribute('href', '/demo');
      await expect(footer.getByRole('link', { name: 'Brand kit', exact: true })).toBeVisible();
      await expect(footer.getByRole('link', { name: 'Brand kit', exact: true })).toHaveAttribute('href', '/brand-kit');
      await expectAccessible(page);
      await page.getByRole('heading', { level: 1 }).click();
      await page.screenshot({ path: testInfo.outputPath(`workspace-evidence-${width}.png`), fullPage: true });
      await app.select('Overview');
      await expectAccessible(page);
      await page.getByRole('heading', { level: 1 }).click();
      await page.screenshot({ path: testInfo.outputPath(`workspace-overview-${width}.png`), fullPage: true });
    });
  }

  test('reduced motion keeps tab transitions, inspection, and exports usable', async ({ page }) => {
    const app = new Workspace(page);
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.goto('/rwa?tab=balances');
    await app.ready();
    await app.selected('Balances');
    await page.getByLabel(/wallet address/i).fill(OWNER);
    await page.getByRole('button', { name: 'Inspect', exact: true }).click();
    await expect(page.getByTestId('raw-balance')).toHaveText(holderObservation.balances!.display.rawAmount);
    await app.select('Evidence');
    await expect(page.getByRole('button', { name: 'Export CSV', exact: true })).toBeEnabled();
    await expect.poll(() => page.locator('[role="tabpanel"]:visible').evaluate(panel => panel.getAnimations({ subtree: true })
      .filter(animation => animation.playState === 'running' || animation.pending).length)).toBe(0);
  });
});
