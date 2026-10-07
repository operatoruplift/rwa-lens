import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { expect, test, type Page } from '@playwright/test';

const ISSUES = 'https://github.com/operatoruplift/rwa-lens/issues';
const PAGES = ['/', '/rwa', '/yield', '/watchlist', '/demo', '/technical', '/pitch', '/brand-kit', '/privacy', '/terms'];

async function expectAccessible(page: Page) {
  await page.addScriptTag({ content: await readFile(path.resolve('node_modules/axe-core/axe.min.js'), 'utf8') });
  const violations = await page.evaluate(async () => {
    const axe = (window as unknown as { axe: { run: (context: unknown, options: unknown) => Promise<{ violations: Array<{ id: string; nodes: unknown[] }> }> } }).axe;
    return (await axe.run(document, { runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21aa'] } })).violations.map(violation => `${violation.id} (${violation.nodes.length})`);
  });
  expect(violations).toEqual([]);
}

test.describe('privacy policy and terms', () => {
  // These pages need no chain data. Every API read is refused in the browser, so nothing reaches a provider.
  test.beforeEach(async ({ page }) => { await page.route('**/api/**', route => route.abort()); });

  for (const route of PAGES) {
    test(`${route} links to the privacy policy and terms from its footer`, async ({ page }) => {
      await page.goto(route);
      const footer = page.locator('footer').last();
      await expect(footer.getByRole('link', { name: 'Privacy', exact: true })).toHaveAttribute('href', '/privacy');
      await expect(footer.getByRole('link', { name: 'Terms', exact: true })).toHaveAttribute('href', '/terms');
    });
  }

  test('the footer link opens a public privacy policy written for RWA Lens', async ({ page }) => {
    await page.goto('/yield');
    await page.locator('footer').last().getByRole('link', { name: 'Privacy', exact: true }).click();
    await expect(page).toHaveURL(/\/privacy$/);
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Privacy policy');
    const main = page.getByRole('main');
    await expect(main).toContainText('Last updated: 7 October 2026');
    await expect(main).toContainText('RWA Lens is operated by Operator Uplift');
    for (const heading of ['Addresses you inspect', 'Wallet sign-in and saved reports', 'Rate limiting', 'Token metadata', 'Service providers', 'On your device', 'How long we keep data', 'Delete your data', 'Security', 'Children', 'Changes to this policy', 'Contact'])
      await expect(main.getByRole('heading', { level: 2, name: heading })).toBeVisible();
    for (const processor of ['Vercel', 'Supabase', 'Jupiter', 'Meteora', 'xStocks']) await expect(main).toContainText(processor);
    await expect(main.getByRole('link', { name: 'github.com/operatoruplift/rwa-lens/issues' }).first()).toHaveAttribute('href', ISSUES);
    await expect(page).toHaveTitle('Privacy policy — RWA Lens');
    await expect(page.locator('link[rel="canonical"]')).toHaveAttribute('href', 'https://rwalensonsolana.vercel.app/privacy');
  });

  test('the terms state the store clause, the limits of an observation and the deploy risks', async ({ page }) => {
    await page.goto('/terms');
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Terms of use');
    const main = page.getByRole('main');
    await expect(main).toContainText('Last updated: 7 October 2026');
    await expect(main).toContainText('Observations, not attestations');
    await expect(main).toContainText('not investment, legal or tax advice');
    await expect(main).toContainText('Solana Mobile is not a party to these terms and has no responsibility or liability for RWA Lens, its content, support or maintenance.');
    for (const risk of ['impermanent loss', 'out of range', 'price impact', 'slippage']) await expect(main).toContainText(risk);
    await expect(main).toContainText('RWA Lens never holds your keys or funds');
    await expect(main).toContainText('18');
    await expect(main.getByRole('link', { name: 'privacy policy' }).first()).toHaveAttribute('href', '/privacy');
    await expect(page).toHaveTitle('Terms of use — RWA Lens');
  });

  for (const width of [320, 390, 1280]) {
    test(`both documents fit ${width}px and pass an accessibility sweep`, async ({ page }) => {
      await page.setViewportSize({ width, height: 900 });
      for (const route of ['/privacy', '/terms']) {
        await page.goto(route);
        await page.evaluate(() => document.fonts.ready);
        expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), `${route} overflows at ${width}px`).toBe(true);
        await expectAccessible(page);
      }
    });
  }

  test('the sitemap lists both documents', async ({ request }) => {
    const sitemap = await (await request.get('/sitemap.xml')).text();
    expect(sitemap).toContain('<loc>https://rwalensonsolana.vercel.app/privacy</loc>');
    expect(sitemap).toContain('<loc>https://rwalensonsolana.vercel.app/terms</loc>');
  });
});
