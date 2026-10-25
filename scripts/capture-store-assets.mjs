/**
 * Regenerates the Solana dApp Store listing assets in docs/dapp-store/, then verifies them.
 *
 *   node scripts/capture-store-assets.mjs              banner and screenshots
 *   node scripts/capture-store-assets.mjs banner       banner only
 *   node scripts/capture-store-assets.mjs screenshots  screenshots only
 *   node scripts/capture-store-assets.mjs verify       check the committed files only
 *
 * The banner is composed as HTML from public/brand-kit/ sources (the lens mark and Inter),
 * the brand palette and the lens artwork, and rendered at device scale factor 1.
 * Screenshots come from the live canonical site at a 360×640 viewport with device scale
 * factor 3 (1080×1920 files), mobile emulation and service workers blocked. They show live
 * mainnet data at capture time, so values change between runs.
 * Prerequisites: npm ci, then npx playwright install chromium.
 */
import { mkdirSync, readFileSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium, devices } from '@playwright/test';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const out = path.join(root, 'docs/dapp-store');
const shotsDir = path.join(out, 'screenshots');
const SITE = 'https://rwalensonsolana.vercel.app';
const AAPLX = 'XsbEhLAtcf6HdfpFZ5xEMdqW8nfAvcsP5bdudRLJzJp';
// A public Meteora AAPLx-SOL pool. Its reserve is a real AAPLx holding to reconcile.
const AAPLX_POOL = '3oJpVmbKATLWbKg4G3o1VBfDSMXQJwMv9VqgnS7yXf4R';
const BANNER = { width: 1200, height: 600 };
const SHOT = { width: 1080, height: 1920 };
const MAX_SHOT_BYTES = 3 * 1024 * 1024;
const DATA_TIMEOUT = 90_000;
const INK = '#101211', IVORY = '#f2f2e9', CITRON = '#d9ff65', GRAY = '#a4aaa2';

const asset = file => readFileSync(path.join(root, file));

function bannerHtml() {
  const font = asset('public/brand-kit/source/Inter-latin.woff2').toString('base64');
  const art = asset('public/brand/lens-hero.webp').toString('base64');
  const mark = asset('public/brand-kit/rwa-lens-mark-light.svg').toString('utf8');
  // With the art 620 px tall at x = 170, the lens centre lands near (888, 273).
  const cx = 888, cy = 273, r = 262;
  const ticks = [0, 90, 180, 270].map(angle => {
    const rad = (angle * Math.PI) / 180;
    const [x1, y1, x2, y2] = [cx + Math.cos(rad) * (r + 8), cy + Math.sin(rad) * (r + 8), cx + Math.cos(rad) * (r + 24), cy + Math.sin(rad) * (r + 24)];
    return `<path d="M${x1.toFixed(1)} ${y1.toFixed(1)}L${x2.toFixed(1)} ${y2.toFixed(1)}" stroke="${IVORY}" stroke-opacity=".45"/>`;
  }).join('');
  const point = angle => `${(cx + Math.cos(angle) * r).toFixed(1)} ${(cy + Math.sin(angle) * r).toFixed(1)}`;
  // Two short arcs on the ring, as in the landing hero's calibration mark; the first ends at the focus dot.
  const arcs = [[-1.62, -0.92], [1.52, 2.22]].map(([from, to]) => `<path d="M${point(from)}A${r} ${r} 0 0 1 ${point(to)}" stroke="${IVORY}" stroke-opacity=".6" stroke-width="1.4"/>`).join('');
  const orbit = { x: cx + Math.cos(-0.92) * r, y: cy + Math.sin(-0.92) * r };
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><style>
@font-face { font-family: Inter; src: url(data:font/woff2;base64,${font}) format('woff2'); font-weight: 100 900; }
* { margin: 0; padding: 0; box-sizing: border-box; }
html, body { width: ${BANNER.width}px; height: ${BANNER.height}px; background: ${INK}; }
body { position: relative; overflow: hidden; font-family: Inter, sans-serif; color: ${IVORY}; -webkit-font-smoothing: antialiased; }
.art { position: absolute; left: 170px; top: -10px; height: 620px; }
.shade { position: absolute; inset: 0; background: linear-gradient(90deg, ${INK} 0%, ${INK} 34%, ${INK}d9 47%, ${INK}00 66%); }
.floor { position: absolute; inset: auto 0 0 0; height: 150px; background: linear-gradient(0deg, ${INK}e6, ${INK}00); }
svg.calibration { position: absolute; inset: 0; }
.brand { position: absolute; left: 64px; top: 54px; display: flex; align-items: center; gap: 13px; font-size: 27px; font-weight: 550; letter-spacing: -1.2px; }
.brand svg { width: 38px; height: 38px; }
.kicker { position: absolute; left: 66px; top: 190px; font-size: 14px; font-weight: 600; letter-spacing: 2.6px; color: ${CITRON}; }
h1 { position: absolute; left: 60px; top: 222px; font-size: 82px; line-height: 1.02; font-weight: 500; letter-spacing: -4.8px; }
h1 span { color: ${CITRON}; }
.layers { position: absolute; left: 66px; bottom: 58px; display: flex; list-style: none; font-size: 13px; font-weight: 550; letter-spacing: 2px; color: ${GRAY}; }
.layers li { padding: 0 22px; border-left: 1px solid ${IVORY}33; }
.layers li:first-child { padding-left: 0; border-left: 0; }
.layers b { margin-right: 9px; color: ${CITRON}; font-weight: 550; }
.focus { position: absolute; right: 60px; bottom: 52px; text-align: right; font-size: 12px; font-weight: 550; letter-spacing: 2px; color: ${GRAY}; }
.focus strong { display: block; margin-top: 7px; font-size: 19px; font-weight: 500; letter-spacing: -.3px; color: ${IVORY}; }
</style></head><body>
<img class="art" alt="" src="data:image/webp;base64,${art}">
<div class="shade"></div><div class="floor"></div>
<svg class="calibration" width="${BANNER.width}" height="${BANNER.height}" viewBox="0 0 ${BANNER.width} ${BANNER.height}" fill="none" aria-hidden="true">
  <circle cx="${cx}" cy="${cy}" r="${r}" stroke="${IVORY}" stroke-opacity=".3" stroke-dasharray="1 9"/>
  ${arcs}${ticks}
  <circle cx="${orbit.x.toFixed(1)}" cy="${orbit.y.toFixed(1)}" r="5" fill="${CITRON}"/>
</svg>
<div class="brand">${mark}<span>RWA Lens</span></div>
<p class="kicker">THE TOKEN BEHIND THE ASSET</p>
<h1>Real assets.<br><span>Clearer vision.</span></h1>
<ul class="layers"><li><b>01</b>IDENTITY</li><li><b>02</b>BALANCE</li><li><b>03</b>CONTROLS</li></ul>
<p class="focus">SOLANA / PUBLIC DATA<strong>Read-only by default.</strong></p>
</body></html>`;
}

async function renderBanner(browser) {
  const page = await browser.newPage({ viewport: BANNER, deviceScaleFactor: 1 });
  await page.setContent(bannerHtml(), { waitUntil: 'load' });
  await page.evaluate(() => document.fonts.ready);
  await page.screenshot({ path: path.join(out, 'banner-1200x600.png') });
  await page.close();
}

/** Fonts and images loaded, then two frames so layout has settled before the capture. */
async function settle(page) {
  await page.evaluate(async () => {
    await document.fonts.ready;
    await Promise.all(Array.from(document.images).filter(image => !image.complete).map(image => new Promise(resolve => { image.onload = image.onerror = resolve; })));
    await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
  });
}

/** Puts an element's top edge just below the sticky top bar, without smooth scrolling. */
async function scrollToTop(locator, offset = 0) {
  await locator.evaluate((element, gap) => window.scrollTo({ top: element.getBoundingClientRect().top + window.scrollY - gap, behavior: 'instant' }), offset);
}

/** Scrolls so an element's bottom edge sits just above the viewport, hiding it entirely. */
async function scrollPast(locator, gap = 4) {
  await locator.evaluate((element, offset) => window.scrollTo({ top: element.getBoundingClientRect().bottom + window.scrollY + offset, behavior: 'instant' }), gap);
}

async function liveObservation(page) {
  await page.getByText('Live observation', { exact: true }).waitFor({ timeout: DATA_TIMEOUT });
}

const screenshots = [
  ['01-landing.png', async page => {
    await page.goto(`${SITE}/`, { waitUntil: 'load' });
    await page.getByRole('heading', { level: 1 }).waitFor();
  }],
  ['02-usdy-overview.png', async page => {
    await page.goto(`${SITE}/rwa`, { waitUntil: 'load' });
    await liveObservation(page);
    await page.locator('.issuer-attribution').waitFor({ timeout: DATA_TIMEOUT });
    await scrollPast(page.locator('#inspect'));
  }],
  ['03-aaplx-controls.png', async page => {
    await page.goto(`${SITE}/rwa?mint=${AAPLX}&tab=controls`, { waitUntil: 'load' });
    await liveObservation(page);
    await page.locator('#inspection-controls').waitFor({ timeout: DATA_TIMEOUT });
    await scrollToTop(page.getByRole('tablist', { name: 'Inspection sections' }), 12);
  }],
  ['04-aaplx-balance.png', async page => {
    await page.goto(`${SITE}/rwa?mint=${AAPLX}&tab=balances`, { waitUntil: 'load' });
    await liveObservation(page);
    await page.locator('#rwa-owner').fill(AAPLX_POOL);
    await page.getByRole('button', { name: 'Inspect', exact: true }).click();
    await page.getByTestId('raw-balance').waitFor({ timeout: DATA_TIMEOUT });
    await scrollToTop(page.getByRole('tablist', { name: 'Inspection sections' }), 12);
  }],
  ['05-yield-screener.png', async page => {
    await page.goto(`${SITE}/yield`, { waitUntil: 'load' });
    await page.locator('li[data-pool]').first().waitFor({ timeout: DATA_TIMEOUT });
    await scrollToTop(page.locator('li[data-pool]').first(), 16);
  }],
  ['06-pool-detail.png', async page => {
    await page.goto(`${SITE}/rwa?mint=${AAPLX}&tab=liquidity`, { waitUntil: 'load' });
    await liveObservation(page);
    await page.locator('[data-venues-state="ok"]').waitFor({ timeout: DATA_TIMEOUT });
    await scrollToTop(page.locator('#liquidity-venues'), 12);
  }],
];

async function captureScreenshots(browser, only) {
  mkdirSync(shotsDir, { recursive: true });
  const context = await browser.newContext({
    ...devices['Pixel 7'],
    viewport: { width: 360, height: 640 }, screen: { width: 360, height: 640 }, deviceScaleFactor: 3,
    isMobile: true, hasTouch: true, serviceWorkers: 'block', reducedMotion: 'reduce', locale: 'en-US', timezoneId: 'UTC',
  });
  for (const [name, prepare] of screenshots) {
    if (only && !only.includes(name)) continue;
    const page = await context.newPage();
    await prepare(page);
    await settle(page);
    await page.screenshot({ path: path.join(shotsDir, name), animations: 'disabled', caret: 'hide' });
    console.log(`captured ${name}`);
    await page.close();
  }
  await context.close();
}

function pngSize(file) {
  const bytes = readFileSync(file);
  if (bytes.subarray(0, 8).toString('hex') !== '89504e470d0a1a0a' || bytes.subarray(12, 16).toString('ascii') !== 'IHDR') throw new Error(`${file} is not a PNG`);
  return { width: bytes.readUInt32BE(16), height: bytes.readUInt32BE(20), bytes: statSync(file).size };
}

/** Throws unless the banner is exactly 1200×600 and there are 4 to 8 screenshots, each exactly 1080×1920 and under 3 MB. */
function verify() {
  const problems = [];
  const banner = pngSize(path.join(out, 'banner-1200x600.png'));
  if (banner.width !== BANNER.width || banner.height !== BANNER.height) problems.push(`banner is ${banner.width}×${banner.height}`);
  console.log(`banner-1200x600.png  ${banner.width}×${banner.height}  ${(banner.bytes / 1024).toFixed(0)} KB`);
  const files = readdirSync(shotsDir).filter(name => name.endsWith('.png')).sort();
  if (files.length < 4 || files.length > 8) problems.push(`${files.length} screenshots; the store takes 4 to 8`);
  for (const name of files) {
    const size = pngSize(path.join(shotsDir, name));
    if (size.width !== SHOT.width || size.height !== SHOT.height) problems.push(`${name} is ${size.width}×${size.height}`);
    if (size.bytes >= MAX_SHOT_BYTES) problems.push(`${name} is ${(size.bytes / 1048576).toFixed(2)} MB`);
    console.log(`screenshots/${name}  ${size.width}×${size.height}  ${(size.bytes / 1048576).toFixed(2)} MB`);
  }
  if (problems.length) throw new Error(`Store assets failed verification:\n- ${problems.join('\n- ')}`);
  console.log(`verified: banner 1200×600, ${files.length} screenshots at 1080×1920, each under 3 MB`);
}

const [mode = 'all', ...only] = process.argv.slice(2);
if (!['all', 'banner', 'screenshots', 'verify'].includes(mode)) throw new Error(`Unknown mode "${mode}". Use banner, screenshots, verify or nothing.`);
if (mode !== 'verify') {
  const browser = await chromium.launch();
  try {
    if (mode === 'all' || mode === 'banner') await renderBanner(browser);
    if (mode === 'all' || mode === 'screenshots') await captureScreenshots(browser, only.length ? only : null);
  } finally { await browser.close(); }
}
verify();
