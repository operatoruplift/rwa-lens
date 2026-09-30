/** Record a real app journey and its public-read/download evidence.
 * Usage: node scripts/demo-capture.mjs <shot-plan.json> <output-directory>
 * Optional API forwarding uses only current production responses. No wallet
 * action, stored response replay or fabricated response is used.
 */
import { mkdir, readFile, writeFile, copyFile } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { createRequire } from 'node:module';
import { createHash } from 'node:crypto';

const require = createRequire(import.meta.url);
let chromium;
try { ({ chromium } = require('@playwright/test')); }
catch { ({ chromium } = require('playwright')); }

const [planPath, destination] = process.argv.slice(2);
if (!planPath || !destination) throw new Error('Provide shot-plan.json and an output directory.');
const plan = JSON.parse(await readFile(resolve(planPath), 'utf8'));
const origin = new URL(plan.baseUrl);
if (!['http:', 'https:'].includes(origin.protocol)) throw new Error('A web origin is required.');
const output = resolve(destination);
const viewport = plan.viewport ?? { width: 1440, height: 900 };
if (![viewport.width, viewport.height].every(value => Number.isInteger(value) && value >= 360 && value <= 3840)) throw new Error('Viewport dimensions must be between 360 and 3840 pixels.');
const apiOrigin = plan.apiBaseUrl ? new URL(plan.apiBaseUrl) : origin;
if (apiOrigin.origin !== origin.origin && apiOrigin.origin !== 'https://rwalensonsolana.vercel.app') throw new Error('API forwarding is limited to the public RWA Lens production backend.');
const publicReads = ['/api/rwa/inspect', '/api/rwa/screener', '/api/rwa/venues'];
await mkdir(output, { recursive: true });
await mkdir(join(output, 'downloads'), { recursive: true });
const browser = await chromium.launch({ executablePath: process.env.PW_EXE });
const context = await browser.newContext({
  viewport,
  deviceScaleFactor: 1,
  reducedMotion: 'no-preference',
  acceptDownloads: true,
  recordVideo: { dir: join(output, 'raw'), size: viewport },
});
const page = await context.newPage();
page.setDefaultTimeout(20_000);
page.setDefaultNavigationTimeout(45_000);
const startedAt = Date.now();
const seconds = () => Number(((Date.now() - startedAt) / 1000).toFixed(3));
const reads = [], downloads = [], errors = [], shots = [], pending = [];
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const settle = async (promises, timeoutMs = 10_000) => {
  let timer;
  try { await Promise.race([Promise.allSettled(promises), new Promise(resolve => { timer = setTimeout(resolve, timeoutMs); })]); }
  finally { clearTimeout(timer); }
};
if (apiOrigin.origin !== origin.origin) {
  await page.route(url => url.origin === origin.origin && publicReads.includes(url.pathname), async route => {
    const request = route.request();
    const localUrl = new URL(request.url());
    const remoteUrl = new URL(localUrl.pathname + localUrl.search, apiOrigin);
    try {
      // Send only the app's public-read request. Never forward local cookies,
      // authorization headers, or any wallet operation to the public backend.
      const response = await fetch(remoteUrl, {
        method: request.method(),
        headers: { 'content-type': 'application/json' },
        body: ['GET', 'HEAD'].includes(request.method()) ? undefined : request.postData(),
        signal: AbortSignal.timeout(65_000),
        redirect: 'error',
      });
      await route.fulfill({ status: response.status, contentType: response.headers.get('content-type') ?? 'application/json', body: Buffer.from(await response.arrayBuffer()) });
    } catch (error) {
      errors.push({ at: seconds(), message: `Production read failed at ${localUrl.pathname}: ${error.message}` });
      await route.abort('failed');
    }
  });
}
page.on('pageerror', error => errors.push({ at: seconds(), message: error.message }));
page.on('console', message => {
  if (message.type() === 'error') errors.push({ at: seconds(), message: message.text() });
});
page.on('response', response => {
  const url = new URL(response.url());
  if (url.origin !== origin.origin || !publicReads.includes(url.pathname)) return;
  pending.push((async () => {
    try {
      const body = await response.json();
      reads.push({ at: seconds(), path: url.pathname, backend: new URL(url.pathname + url.search, apiOrigin).href, status: response.status(), body });
    } catch { errors.push({ at: seconds(), message: `Unreadable response at ${url.pathname}` }); }
  })());
});

function locator(target) {
  if (!target || (!target.text && (!target.role || !target.name))) throw new Error('Every locator needs observed visible text or a role and accessible name.');
  const found = target.text ? page.getByText(target.text, { exact: target.exact !== false }) : page.getByRole(target.role, { name: target.name, exact: target.exact !== false });
  return target.index === undefined ? found : found.nth(target.index);
}

async function action(step) {
  if (step.type === 'goto') {
    const url = new URL(step.path, origin);
    if (url.origin !== origin.origin) throw new Error('The capture plan must stay on the application origin.');
    await page.goto(url.href, { waitUntil: 'domcontentloaded' });
  } else if (step.type === 'click') {
    await locator(step.target).click();
  } else if (step.type === 'fill') {
    await locator(step.target).fill(step.value);
  } else if (step.type === 'select') {
    await locator(step.target).selectOption(step.value);
  } else if (step.type === 'wait') {
    await locator(step.target).waitFor({ state: 'visible', timeout: step.timeoutMs ?? 65_000 });
  } else if (step.type === 'scroll') {
    if (step.offset === undefined) await locator(step.target).scrollIntoViewIfNeeded();
    else {
      if (!Number.isFinite(step.offset) || step.offset < 0 || step.offset > 400) throw new Error('Scroll offset must be 0–400 pixels.');
      await locator(step.target).evaluate((element, offset) => window.scrollTo({ top: window.scrollY + element.getBoundingClientRect().top - offset, behavior: 'smooth' }), step.offset);
      await page.waitForTimeout(750);
    }
  } else if (step.type === 'hover') {
    await locator(step.target).hover();
  } else if (step.type === 'hold') {
    if (!Number.isFinite(step.seconds) || step.seconds < 0 || step.seconds > 30) throw new Error('Hold must be 0–30 seconds.');
    await page.waitForTimeout(step.seconds * 1000);
  } else if (step.type === 'download') {
    const [download] = await Promise.all([page.waitForEvent('download'), locator(step.target).click()]);
    const name = download.suggestedFilename().replace(/[^a-zA-Z0-9._-]/g, '_');
    const path = join(output, 'downloads', `${downloads.length + 1}-${name}`);
    await download.saveAs(path);
    const bytes = await readFile(path);
    downloads.push({ at: seconds(), name, file: path, bytes: bytes.length, sha256: hash(bytes) });
  } else if (step.type === 'mainnet') {
    await settle(pending);
    const read = reads.findLast(item => item.path === '/api/rwa/inspect');
    if (!read || read.status !== 200 || read.body.mode !== 'live' || read.body.provenance?.mode !== 'live' || read.body.provenance?.cluster !== 'mainnet-beta' || !read.body.identity?.mint) {
      throw new Error('No successful actual mainnet inspection was observed.');
    }
    if (step.mint && read.body.identity.mint !== step.mint) throw new Error('Observed mint does not match the planned token.');
  } else throw new Error(`Unsupported action: ${step.type}`);
}

let failure = null;
const saveLedger = async () => writeFile(join(output, 'capture.json'), JSON.stringify({
  source: plan.baseUrl, apiSource: apiOrigin.origin, capturedAt: new Date(startedAt).toISOString(), viewport,
  video: 'journey.webm', timing: 'Elapsed recording-clock seconds; verify first-frame alignment before final edit.',
  shots, reads, downloads, errors, failure,
}, null, 2) + '\n');
try {
  for (const step of plan.prepare ?? []) await action(step);
  for (const scene of plan.scenes) {
    if (!/^[a-z0-9-]+$/.test(scene.id)) throw new Error('Scene IDs must contain lowercase letters, digits and hyphens.');
    const shot = { id: scene.id, label: scene.label, start: seconds(), actions: [] };
    shots.push(shot);
    console.log(`Recording ${scene.id} at ${shot.start}s`);
    for (const step of scene.actions) {
      const entry = { type: step.type, start: seconds() };
      shot.actions.push(entry);
      await action(step);
      entry.end = seconds();
    }
    shot.end = seconds();
    // Review frames extracted from the finished recording by default. Concurrent
    // screenshot capture can stall Chromium's video surface during scrolling.
    if (plan.captureScreenshots === true) await page.screenshot({ path: join(output, `${String(shots.length).padStart(2, '0')}-${scene.id}.png`), timeout: 10_000 });
    console.log(`Completed ${scene.id} at ${shot.end}s`);
    await saveLedger();
  }
  console.log('Settling public read receipts');
  await settle(pending);
  if (errors.length) throw new Error(`Capture produced ${errors.length} browser or response error(s).`);
} catch (error) { failure = error.message; }
finally {
  await saveLedger();
  console.log('Closing recorder');
  await context.close();
  const source = await page.video().path();
  await copyFile(source, join(output, 'journey.webm'));
  await browser.close();
  await saveLedger();
}
if (failure) throw new Error(failure);
console.log(`Captured ${shots.length} real-app scenes, ${reads.length} public reads and ${downloads.length} downloads into ${output}.`);
