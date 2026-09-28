import { mkdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import bs58 from 'bs58';
import { expect, test, type Page } from '@playwright/test';
import { inspectResultSchema } from '../../lib/rwa/schema';
import evidence from '../../docs/evidence/live-observations.json';
import { screenerFixture, TSLAX } from '../e2e/yield-fixture';

// Archived mainnet payloads replayed inside browser interception only.
const mintObservation = inspectResultSchema.parse(evidence.observations[0].result);
const MINT = mintObservation.identity!.mint;
const POOL = '4dLtt8WQEjkZCiRrNJA5XRqqDBsoymdBxN54dz7pbDie';
const WALLET = 'H8sMJSCQxfKiFTCfDR3DUMLPwcRbM61LGFJ8N4dK3WjS';
const STRANGER = 'AC5RDfQFmDS1deWZos921JfqscXdByf8BKHs5ACWjtW2';
const SIGNATURE = bs58.encode(new Uint8Array(64).fill(7));
const screenshotDir = path.resolve('test-results/screenshots');
const venues = {
  state: 'ok', mint: MINT, source: 'Meteora DLMM data API', fetchedAt: '2026-09-28T12:00:00.000Z', matched: 2, belowFloor: 0,
  pools: [
    { address: POOL, pair: 'USDY-USDC', tokenSymbol: 'USDY', counterSymbol: 'USDC', counterMint: 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v', counterVerified: true, tvlUsd: 1742.86, volume24hUsd: 717.92, fees24hUsd: 0.1327, feeTvl24hPct: 0.0076, feeApyPct: 2.818, farmApyPct: null, binStep: 1, baseFeePct: 0.01, meteoraUrl: `https://app.meteora.ag/dlmm/${POOL}` },
    { address: 'BDpP98gnA9cVN4ATYh6F76nDHw4hXxDpzSt7ZiGUxxLQ', pair: 'USDY-SOL', tokenSymbol: 'USDY', counterSymbol: 'SOL', counterMint: 'So11111111111111111111111111111111111111112', counterVerified: true, tvlUsd: 250, volume24hUsd: 12, fees24hUsd: 0.02, feeTvl24hPct: 0.008, feeApyPct: 2.96, farmApyPct: null, binStep: 10, baseFeePct: 0.1, meteoraUrl: 'https://app.meteora.ag/dlmm/BDpP98gnA9cVN4ATYh6F76nDHw4hXxDpzSt7ZiGUxxLQ' },
  ],
};

/** A minimal v0 wire transaction whose only required signer is `feePayer`. */
function prepared(feePayer: string) {
  const bytes = new Uint8Array(1 + 64 + 4 + 1 + 32 + 32 + 2);
  bytes[0] = 1;
  bytes.set([0x80, 1, 0, 0, 1], 65);
  bytes.set(bs58.decode(feePayer), 70);
  return Buffer.from(bytes).toString('base64');
}
const readyResponse = (feePayer = WALLET, priceGapPct = 0.3267631721102836) => ({
  state: 'ready', transaction: prepared(feePayer), lastValidBlockHeight: '429423818', builtAt: '2026-09-28T17:18:54.887Z',
  simulation: { unitsConsumed: 455811, computeUnitLimit: 544183, slot: '451384035' },
  summary: {
    pool: POOL, pair: 'USDY-USDC', tokenSymbol: 'USDY', tokenMint: MINT, tokenDecimals: 6, owner: WALLET, budgetRaw: '10000000',
    swap: { inRaw: '5000000', quotedOutRaw: '4353028', minOutRaw: '4309498', venues: ['Whirlpool'], priceImpactPct: 0, price: 1.148625738221762 },
    deposit: { tokenRaw: '4309498', usdcRaw: '5000000', activeBinId: 1353, lowerBinId: 1319, upperBinId: 1387, binStep: 1, poolPrice: 1.1448724523238734, minPrice: 1.1409866898102303, maxPrice: 1.1487714482524611, maxActiveBinSlippage: 100 },
    priceGapPct, position: { address: '7wZzy5RfSwQHnseJurgvkX4rXNvd6LVZyVpvNw2fNYUb', isNew: true },
    sol: { positionRentLamports: '41899840', otherRentLamports: '1488440', networkFeeLamports: '59419' }, newBinArrays: 0,
  },
});

/** A Wallet Standard wallet that records what it is asked to send and returns a fixed signature. */
async function installWallet(page: Page) {
  await page.addInitScript(({ owner }) => {
    const account = Object.freeze({ address: owner, publicKey: new Uint8Array(32), chains: ['solana:mainnet'], features: ['solana:signAndSendTransaction'] });
    const state = window as unknown as { __sent: unknown[]; __reject?: boolean };
    state.__sent = [];
    const wallet = {
      version: '1.0.0', name: 'Test Wallet', icon: 'data:image/svg+xml;base64,PHN2Zy8+', chains: ['solana:mainnet'], accounts: [account],
      features: {
        'standard:connect': { version: '1.0.0', connect: async () => ({ accounts: [account] }) },
        'solana:signAndSendTransaction': {
          version: '1.0.0', supportedTransactionVersions: ['legacy', 0],
          signAndSendTransaction: async (...inputs: Array<{ account: { address: string }; chain: string; transaction: Uint8Array }>) => {
            state.__sent.push({ account: inputs[0].account.address, chain: inputs[0].chain, transaction: btoa(String.fromCharCode(...inputs[0].transaction)) });
            if (state.__reject) throw new Error('User rejected the request.');
            return [{ signature: new Uint8Array(64).fill(7) }];
          },
        },
      },
    };
    window.addEventListener('wallet-standard:app-ready', event => (event as CustomEvent<{ register: (value: unknown) => void }>).detail.register(wallet));
  }, { owner: WALLET });
}

async function openDeploy(page: Page, screenshot?: string) {
  await page.route('**/api/rwa/inspect', route => route.fulfill({ json: mintObservation }));
  await page.route('**/api/rwa/venues?**', route => route.fulfill({ json: venues }));
  await page.goto('/rwa');
  const panel = page.getByRole('region', { name: 'Liquidity venues on Meteora' });
  await expect(panel).toHaveAttribute('data-venues-state', 'ok');
  // Only the USDC pair offers deploy.
  await expect(panel.getByRole('button', { name: /Deploy USDC/ })).toHaveCount(1);
  await expect(panel).toContainText('RWA Lens never holds keys or funds');
  if (screenshot) { await mkdirScreens(); await panel.screenshot({ path: path.join(screenshotDir, screenshot) }); }
  await panel.getByRole('button', { name: 'Deploy USDC into the USDY-USDC pool' }).click();
  const dialog = page.getByRole('dialog', { name: 'Deploy USDC into USDY-USDC' });
  await expect(dialog).toBeVisible();
  return dialog;
}
const sent = (page: Page) => page.evaluate(() => (window as unknown as { __sent: Array<{ account: string; chain: string; transaction: string }> }).__sent);

test.describe('operator-enabled deploy', () => {
  test('previews, signs in the wallet and confirms on chain', async ({ page }) => {
    await installWallet(page);
    let statusCalls = 0;
    await page.route('**/api/rwa/deploy', route => route.fulfill({ json: readyResponse() }));
    await page.route('**/api/rwa/deploy/status?**', route => route.fulfill({ json: ++statusCalls < 2 ? { state: 'pending' } : { state: 'confirmed', slot: '451384099' } }));
    const dialog = await openDeploy(page, 'venues-deploy-1280.png');
    await dialog.getByRole('button', { name: 'Connect Test Wallet' }).click();
    await expect(dialog).toContainText(`Test Wallet · ${WALLET.slice(0, 4)}…${WALLET.slice(-4)}`);
    await dialog.getByLabel('USDC to deploy').fill('10');
    await dialog.getByText('1%', { exact: true }).click();
    const request = page.waitForRequest(candidate => candidate.url().endsWith('/api/rwa/deploy') && candidate.method() === 'POST');
    await dialog.getByRole('button', { name: 'Preview deploy' }).click();
    expect((await request).postDataJSON()).toEqual({ mint: MINT, pool: POOL, owner: WALLET, amount: '10', slippageBps: 100 });
    await expect(dialog).toContainText('5 USDC → at least 4.309498 USDY');
    await expect(dialog).toContainText('4.309498 USDY + 5 USDC');
    await expect(dialog).toContainText('Spread evenly over 69 bins centred on the pool price, in a new position');
    await expect(dialog).toContainText('1.1410 – 1.1488 USDC per USDY');
    await expect(dialog).toContainText('0.0419 SOL position rent');
    await expect(dialog).toContainText('plus 0.00149 SOL for new token accounts and about 0.00006 SOL in network fees');
    await expect(dialog).toContainText('Simulated successfully against mainnet');
    await expect(dialog).toContainText(/Preview valid for \d+s/);
    await expect(dialog.getByText(/away from the swap price/)).toHaveCount(0);
    await mkdirScreens();
    await page.screenshot({ path: path.join(screenshotDir, 'deploy-review-1280.png'), fullPage: false });
    await runAxe(page);
    await dialog.getByRole('button', { name: 'Sign in Test Wallet' }).click();
    await expect(dialog).toContainText('Deployed. Your position holds USDY and USDC in USDY-USDC.');
    expect(await sent(page)).toEqual([{ account: WALLET, chain: 'solana:mainnet', transaction: readyResponse().transaction }]);
    expect(statusCalls).toBeGreaterThanOrEqual(2);
    await expect(dialog.getByRole('link', { name: /View transaction/ })).toHaveAttribute('href', `https://solscan.io/tx/${SIGNATURE}`);
    await expect(dialog.getByRole('link', { name: /Manage or withdraw on Meteora/ })).toHaveAttribute('href', `https://app.meteora.ag/dlmm/${POOL}`);
    await page.screenshot({ path: path.join(screenshotDir, 'deploy-confirmed-1280.png'), fullPage: false });
  });

  test('refusals, mismatches and declines never move anything', async ({ page }) => {
    await installWallet(page);
    const responses = [
      { status: 422, json: { state: 'refused', code: 'insufficient-usdc', message: 'This wallet holds 3.2 USDC in its main USDC account; the deploy needs 10 USDC.' } },
      { status: 200, json: readyResponse(STRANGER) },
      { status: 200, json: readyResponse(WALLET, 3.2) },
    ];
    await page.route('**/api/rwa/deploy', route => route.fulfill(responses.shift() ?? { json: readyResponse() }));
    const dialog = await openDeploy(page);
    await dialog.getByRole('button', { name: 'Connect Test Wallet' }).click();
    await dialog.getByRole('button', { name: 'Preview deploy' }).click();
    await expect(dialog.getByRole('alert')).toContainText('the deploy needs 10 USDC');
    await dialog.getByRole('button', { name: 'Back to amount' }).click();
    await dialog.getByRole('button', { name: 'Preview deploy' }).click();
    await expect(dialog.getByRole('alert')).toContainText('does not match the connected wallet');
    await dialog.getByRole('button', { name: 'Back to amount' }).click();
    await dialog.getByRole('button', { name: 'Preview deploy' }).click();
    await expect(dialog).toContainText('The pool’s price is 3.20% away from the swap price.');
    await page.evaluate(() => { (window as unknown as { __reject: boolean }).__reject = true; });
    await dialog.getByRole('button', { name: 'Sign in Test Wallet' }).click();
    await expect(dialog.getByRole('alert')).toContainText('returned without sending');
    expect((await sent(page)).length).toBe(1);
  });

  test('an expired preview has to be rebuilt before it can be signed', async ({ page }) => {
    await installWallet(page);
    await page.clock.install();
    let previews = 0;
    await page.route('**/api/rwa/deploy', route => { previews += 1; return route.fulfill({ json: readyResponse() }); });
    const dialog = await openDeploy(page);
    await dialog.getByRole('button', { name: 'Connect Test Wallet' }).click();
    await dialog.getByRole('button', { name: 'Preview deploy' }).click();
    await expect(dialog.getByRole('button', { name: 'Sign in Test Wallet' })).toBeVisible();
    await page.clock.runFor(46_000);
    await expect(dialog).toContainText('Preview expired');
    await expect(dialog.getByRole('button', { name: 'Sign in Test Wallet' })).toHaveCount(0);
    await dialog.getByRole('button', { name: 'Refresh preview' }).click();
    await expect(dialog.getByRole('button', { name: 'Sign in Test Wallet' })).toBeVisible();
    expect(previews).toBe(2);
    expect(await sent(page)).toEqual([]);
  });

  test('explains when no wallet can send transactions, and fits a phone', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    const dialog = await openDeploy(page, 'venues-deploy-390.png');
    await expect(dialog).toContainText('No wallet that can send Solana transactions is available.');
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    await dialog.getByRole('button', { name: 'Close deploy' }).click();
    await expect(dialog).toBeHidden();
  });

  test('review stays readable on a phone', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await installWallet(page);
    await page.route('**/api/rwa/deploy', route => route.fulfill({ json: readyResponse() }));
    const dialog = await openDeploy(page);
    await dialog.getByRole('button', { name: 'Connect Test Wallet' }).click();
    await dialog.getByRole('button', { name: 'Preview deploy' }).click();
    await expect(dialog).toContainText('Simulated successfully against mainnet');
    const box = await dialog.boundingBox();
    expect(box!.width).toBeLessThanOrEqual(390 - 32 + 1);
    await mkdirScreens();
    await page.screenshot({ path: path.join(screenshotDir, 'deploy-review-390.png'), fullPage: false });
    await runAxe(page);
  });

  test('the yield screener offers deploy on USDC pools and previews the chosen one', async ({ page }) => {
    await installWallet(page);
    await page.route('**/api/rwa/screener', route => route.fulfill({ json: screenerFixture }));
    let body: unknown = null;
    await page.route('**/api/rwa/deploy', route => { body = route.request().postDataJSON(); return route.fulfill({ status: 422, json: { state: 'refused', code: 'insufficient-usdc', message: 'This wallet holds 0 USDC in its main USDC account; the deploy needs 10 USDC.' } }); });
    await page.goto('/yield');
    await expect(page.getByRole('button', { name: /Deploy USDC/ })).toHaveCount(2);
    await page.getByRole('button', { name: 'Deploy USDC into the TSLAx-USDC pool' }).click();
    const dialog = page.getByRole('dialog', { name: 'Deploy USDC into TSLAx-USDC' });
    await dialog.getByRole('button', { name: 'Connect Test Wallet' }).click();
    await dialog.getByRole('button', { name: 'Preview deploy' }).click();
    await expect(dialog.getByRole('alert')).toContainText('the deploy needs 10 USDC');
    expect(body).toEqual({ mint: TSLAX, pool: 'BCZLEgknvcyCsJ9ERRN38U4gBTNn4ftU11fEtV3XHnK2', owner: WALLET, amount: '10', slippageBps: 50 });
  });

  test('the landing copy says inspection stays read-only while deploy is enabled', async ({ page }) => {
    await page.goto('/');
    await expect(page.getByText('Read-only inspection', { exact: true })).toBeVisible();
    await expect(page.getByText('Read-only by design')).toHaveCount(0);
    await expect(page.getByText(/Inspection never signs or moves assets; the optional deploy action asks your own wallet to sign one transaction you review first\./)).toBeVisible();
  });
});

async function mkdirScreens() { await mkdir(screenshotDir, { recursive: true }); }
async function runAxe(page: Page) {
  await page.addScriptTag({ content: await readFile(path.resolve('node_modules/axe-core/axe.min.js'), 'utf8') });
  const violations = await page.evaluate(async () => {
    const axe = (window as unknown as { axe: { run: (context: unknown, options: unknown) => Promise<{ violations: Array<{ id: string; impact: string; nodes: unknown[] }> }> } }).axe;
    const result = await axe.run('dialog[open]', { runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21aa'] } });
    return result.violations.map(violation => ({ id: violation.id, impact: violation.impact, nodes: violation.nodes.length }));
  });
  expect(violations).toEqual([]);
}
