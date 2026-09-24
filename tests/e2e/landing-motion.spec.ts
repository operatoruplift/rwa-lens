import { expect, test, type Locator, type Page } from '@playwright/test';
import { inspectResultSchema } from '../../lib/rwa/schema';
import evidence from '../../docs/evidence/live-observations.json';

// Fixtures are switched off wherever this suite runs, so the inspector has no
// seeded observation of its own. Replay the archived observation for the mint the
// page requests on arrival: the inspector verifies that a response matches its
// request and refuses anything else, so a mismatched replay renders an error.
const seededObservation = inspectResultSchema.parse(evidence.observations[0].result);

const transform = (element: Locator) => element.evaluate(node => getComputedStyle(node).transform);
const verticalTranslation = (element: Locator) => element.evaluate(node => new DOMMatrixReadOnly(getComputedStyle(node).transform).m42);

async function expectNoOverflow(page: Page) {
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
}

async function expectReadable(element: Locator) {
  await expect(element).toBeVisible();
  await expect(element).toHaveCSS('opacity', '1');
  await expect(element).toHaveCSS('visibility', 'visible');
}

test.describe('Native landing motion', () => {
  const pageErrors = new WeakMap<Page, string[]>();

  test.beforeEach(async ({ page }) => {
    const errors: string[] = [];
    pageErrors.set(page, errors);
    page.on('pageerror', error => errors.push(error.message));
  });

  test.afterEach(async ({ page }) => {
    expect(pageErrors.get(page), 'The landing experience should not throw browser errors').toEqual([]);
  });

  test('desktop and mobile wheel scrolling moves the page and adds restrained hero depth', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'no-preference' });
    for (const width of [1440, 390]) {
      await page.setViewportSize({ width, height: 900 });
      await page.goto('/');
      await expect(page.locator('[data-motion]')).toHaveAttribute('data-motion', 'active');
      const depth = page.locator('[data-hero-depth]');
      const before = await verticalTranslation(depth);

      await page.mouse.move(width / 2, 400);
      await page.mouse.wheel(0, 340);
      await expect.poll(() => page.evaluate(() => scrollY)).toBeGreaterThan(250);
      await expect.poll(() => verticalTranslation(depth)).toBeGreaterThan(before + 1);
      // The artwork moves subtly within the hero, while the browser owns the page scroll.
      expect(await verticalTranslation(depth)).toBeLessThan(100);
      await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
      await expectNoOverflow(page);

      await page.mouse.wheel(0, -340);
      await expect.poll(() => page.evaluate(() => scrollY)).toBe(0);
      await expect.poll(() => verticalTranslation(depth)).toBeCloseTo(before, 1);
    }
  });

  test('the optical scene responds to scrolling and each chapter remains readable at both sizes', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'no-preference' });
    for (const width of [1440, 390]) {
      await page.setViewportSize({ width, height: 900 });
      await page.goto('/');
      await expect(page.locator('[data-motion]')).toHaveAttribute('data-motion', 'active');
      const scene = page.locator('[data-motion-scene]');
      const orbit = scene.locator('svg > g').first();
      const chapters = page.locator('[data-motion-chapter]');
      await expect(chapters).toHaveCount(3);
      await scene.evaluate(node => node.scrollIntoView({ block: 'center', behavior: 'instant' }));
      await expect(scene).toBeInViewport();
      const firstRotation = await transform(orbit);

      await page.mouse.move(width / 2, 450);
      await page.mouse.wheel(0, 280);
      await expect.poll(() => transform(orbit)).not.toBe(firstRotation);

      for (let index = 0; index < 3; index++) {
        const chapter = chapters.nth(index);
        await chapter.evaluate(node => node.scrollIntoView({ block: 'center', behavior: 'instant' }));
        await expect(chapter.getByRole('heading')).toBeInViewport();
        await expectReadable(chapter);
        await expect(chapter.locator('p').last()).toBeInViewport();
        await expectNoOverflow(page);
      }
      await expect(scene).toHaveAttribute('data-step', '3');
      expect(await transform(orbit)).not.toBe(firstRotation);
    }
  });

  test('PageDown and native anchors retain keyboard navigation, including the compact inspector', async ({ page }) => {
    await page.goto('/');
    await page.keyboard.press('PageDown');
    await expect.poll(() => page.evaluate(() => scrollY)).toBeGreaterThan(200);
    await page.getByRole('link', { name: 'Explore the lens', exact: true }).click();
    await expect(page).toHaveURL(/#how-it-works$/);
    await expect(page.locator('#how-it-works')).toBeFocused();
    await expect(page.getByRole('heading', { name: /A number is only/ })).toBeInViewport();

    await page.getByRole('link', { name: 'Start a token inspection', exact: true }).click();
    await expect(page).toHaveURL(/#inspect$/);
    await expect(page.locator('#inspect')).toBeFocused();
    await expect(page.getByLabel('Mint address', { exact: true })).toBeInViewport();
    await page.keyboard.press('Tab');
    await expect(page.getByLabel('Mint address', { exact: true })).toBeFocused();

    await page.route('**/api/rwa/inspect', route => route.fulfill({ json: seededObservation }));
    await page.goto('/rwa');
    await expect(page.locator('[data-motion]')).toHaveAttribute('data-motion', 'static');
    await expect(page.locator('[data-motion-scene]')).toHaveCount(0);
    await page.keyboard.press('Tab');
    await expect(page.getByRole('link', { name: 'Skip to inspection' })).toBeFocused();
    await page.keyboard.press('Enter');
    await expect(page.locator('#inspect')).toBeFocused();
    await page.keyboard.press('Tab');
    await expect(page.getByLabel('Mint address', { exact: true })).toBeFocused();
    // /rwa is the compact inspector; the full result panels, and the raw-balance
    // readout with them, live on /demo. Assert what this surface shows: the
    // observation loaded and its identity is on screen after a keyboard-only walk.
    await expect(page.getByText('Inspection unavailable', { exact: false })).toHaveCount(0);
    await expect(page.getByText(seededObservation.registry!.assetClass!, { exact: false }).first()).toBeVisible();
  });

  test('reduced motion is static on arrival and immediately resets active motion when changed', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.goto('/');
    const root = page.locator('[data-motion]');
    const depth = page.locator('[data-hero-depth]');
    const orbit = page.locator('[data-motion-scene] svg > g').first();
    await expect(root).toHaveAttribute('data-motion', 'static');
    await expect(depth).toHaveCSS('transform', 'none');
    await expect(orbit).toHaveCSS('transform', 'none');
    await expectReadable(page.getByRole('heading', { level: 1 }));

    await page.emulateMedia({ reducedMotion: 'no-preference' });
    await expect(root).toHaveAttribute('data-motion', 'active');
    await page.mouse.wheel(0, 350);
    await expect.poll(() => verticalTranslation(depth)).toBeGreaterThan(1);
    await page.locator('[data-motion-chapter]').first().evaluate(node => node.scrollIntoView({ block: 'center', behavior: 'instant' }));
    await page.emulateMedia({ reducedMotion: 'reduce' });

    await expect(root).toHaveAttribute('data-motion', 'static');
    await expect(depth).toHaveCSS('transform', 'none');
    await expect(orbit).toHaveCSS('transform', 'none');
    await expect.poll(() => root.evaluate(node => node.getAnimations({ subtree: true }).filter(animation => animation.playState === 'running' || animation.pending).length)).toBe(0);
    for (const reveal of await page.locator('[data-reveal]').all()) await expectReadable(reveal);
    await page.mouse.wheel(0, 350);
    await expect(depth).toHaveCSS('transform', 'none');
    await expect(orbit).toHaveCSS('transform', 'none');
    await expectNoOverflow(page);
  });

  test.describe('without JavaScript', () => {
    test.use({ javaScriptEnabled: false, viewport: { width: 390, height: 900 } });

    test('marketing content and fragment links remain usable without JavaScript', async ({ page }) => {
      await page.goto('/');
      await expectReadable(page.getByRole('heading', { level: 1 }));
      await expect(page.locator('[data-motion]')).toHaveAttribute('data-motion', 'static');
      await page.getByRole('link', { name: 'Explore the lens', exact: true }).click();
      await expect(page).toHaveURL(/#how-it-works$/);
      await expect(page.getByRole('heading', { name: /A number is only/ })).toBeInViewport();
      // Finish the native anchor scroll before another click scrolls to the closing CTA.
      await expect.poll(() => page.locator('#how-it-works').evaluate(node => {
        const inset = parseFloat(getComputedStyle(document.documentElement).scrollPaddingTop);
        return Math.abs(node.getBoundingClientRect().top - inset);
      })).toBeLessThan(2);
      for (const chapter of await page.locator('[data-motion-chapter]').all()) await expectReadable(chapter);
      await page.getByRole('link', { name: 'Start a token inspection', exact: true }).click();
      await expect(page).toHaveURL(/#inspect$/);
      await expect(page.getByLabel('Mint address', { exact: true })).toBeInViewport();
      await expectNoOverflow(page);
    });
  });
});
