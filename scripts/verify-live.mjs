import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import assert from 'node:assert/strict';

// Explicit opt-in network verification; deterministic CI does not run this.
const base = process.env.RWA_VERIFY_BASE_URL ?? 'https://rwalensonsolana.vercel.app';
const output = resolve(process.env.RWA_VERIFY_OUTPUT ?? 'docs/evidence/live-observations.json');
const assets = JSON.parse(await readFile(new URL('../lib/rwa/live-assets.json', import.meta.url), 'utf8'));
const asset = assets[0];
const observations = [];
let verified = false;

function assertBalances(result, owner) {
  assert.ok(['observed', 'partial'].includes(result.balanceStatus), 'Owner balance must be observed or explicitly partial');
  const balances = result.balances;
  assert.ok(balances && Array.isArray(balances.accounts), 'Accounts must be present');
  if (owner) assert.equal(balances.owner, owner);
  assert.equal(typeof balances.complete, 'boolean');
  const seen = new Set();
  const total = balances.accounts.reduce((sum, account) => {
    assert.match(account.rawAmount, /^\d+$/);
    assert.equal(account.owner, balances.owner);
    assert.equal(account.decimals, result.identity.decimals);
    assert.ok(account.tokenAccount && !seen.has(account.tokenAccount), 'Token accounts must be unique');
    seen.add(account.tokenAccount);
    return sum + BigInt(account.rawAmount);
  }, 0n).toString();
  assert.match(balances.totalRawAmount, /^\d+$/);
  assert.equal(balances.totalRawAmount, total, 'Raw total must reconcile with observed accounts');
  assert.equal(balances.display.rawAmount, total);
  assert.match(balances.display.standardUiAmount, /^\d+(?:\.\d+)?$/);
  if (balances.display.extensionUiAmount !== undefined || balances.display.rounding === 'official-helper') {
    assert.match(balances.display.extensionUiAmount, /^\d+(?:\.\d+)?$/);
  }
  assert.ok(['exact-decimal', 'official-helper', 'rounded-for-display'].includes(balances.display.rounding));
  if (!balances.complete) assert.equal(result.status, 'partial');
}

async function inspect(label, request) {
  const response = await fetch(new URL('/api/rwa/inspect', base), {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(request),
    signal: AbortSignal.timeout(60_000),
  });
  const result = await response.json();
  observations.push({ label, request, httpStatus: response.status, result });
  assert.equal(response.status, 200, `${label}: ${result.message ?? response.status}`);
  assert.ok(['verified', 'partial'].includes(result.status), `${label}: inspection must be available`);
  assert.equal(result.mode, request.mode);
  assert.equal(result.provenance.mode, request.mode);
  if (request.mode === 'live') {
    assert.equal(result.provenance.cluster, request.cluster);
    assert.equal(result.identity.mint, request.mint);
    assert.match(result.provenance.slot, /^\d+$/);
  }
  return result;
}

try {
  const mint = await inspect('Officially attributed non-stock mint', {
    mode: 'live', cluster: asset.cluster, mint: asset.mint,
  });
  assert.equal(mint.identity.mint, asset.mint);
  assert.equal(mint.identity.tokenProgramAddress, asset.observedProgramAddress);
  assert.equal(mint.provenance.mode, 'live');
  assert.equal(mint.balanceStatus, 'not-requested');
  assert.equal(mint.balances, undefined);
  assert.ok(mint.provenance.slot, 'Mint context slot must be present');
  assert.ok(mint.provenance.sources.some(source => source.slot), 'Per-call slot evidence must be present');

  // The mint authority is a public on-chain address, used only as a declared
  // read-only query. No claim is made about who controls it or its holdings.
  const owner = mint.identity.mintAuthority;
  assert.ok(owner, 'This reproducible public-owner query needs the observed authority');
  const holder = await inspect('Declared public owner (observed mint authority)', {
    mode: 'live', cluster: asset.cluster, mint: asset.mint, owner,
  });
  assertBalances(holder, owner);
  assert.equal(holder.identity.tokenProgramAddress, asset.observedProgramAddress);

  const rejected = await fetch(new URL('/api/rwa/inspect', base), {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ mode: 'fixture', fixtureId: 'treasury-scaled', scenario: 'before' }), signal: AbortSignal.timeout(30_000),
  });
  const rejection = await rejected.json();
  observations.push({ label: 'Production offline-data rejection', httpStatus: rejected.status, result: rejection });
  assert.equal(rejected.status, 403, 'Production must reject fixture requests');
  verified = true;
  console.log(JSON.stringify({ verifiedAt: new Date().toISOString(), base, mint: asset.mint, owner,
    program: mint.identity.tokenProgram, slot: mint.provenance.slot,
    ownerStatus: holder.balanceStatus, ownerComplete: holder.balances.complete,
    offlineDataRejected: true, output }, null, 2));
} finally {
  await mkdir(dirname(output), { recursive: true });
  await writeFile(output, JSON.stringify({ capturedAt: new Date().toISOString(), verified, base,
    attribution: asset, observations }, null, 2) + '\n');
}
