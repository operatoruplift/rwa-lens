'use client';

import { useCallback, useRef, useState } from 'react';
import { ArrowDownToLine, ArrowRight, ArrowUpRight, ChevronDown, FlaskConical, Info, LoaderCircle, Search, ShieldCheck } from 'lucide-react';
import { addressSchema, inspectResultSchema } from '@/lib/rwa/schema';
import { FIXTURES } from '@/lib/rwa/fixtures';
import liveAssets from '@/lib/rwa/live-assets.json';
import type { Cluster, InspectRequest, InspectResult } from '@/lib/rwa/types';
import { Callout, StatusPill } from './primitives';
import { BalanceCard, EvidenceDrawer, ExtensionInventory, IdentityCard, RegistryPanel, TransferReadinessCard } from './result-panels';
import { ReportActions } from './report-actions';

type Scenario = 'before' | 'at' | 'after';
type FixtureId = Extract<InspectRequest, { mode: 'fixture' }>['fixtureId'];
const scenarioLabels: Record<Scenario, string> = { before: 'Before change', at: 'At boundary', after: 'After change' };
const fixtureLabels: Record<string, string> = { 'treasury-scaled': 'Treasury receipt', 'credit-hooked': 'Private-credit receipt', 'plain-spl': 'Plain SPL token' };

function validAddress(value: string) {
  return addressSchema.safeParse(value).success;
}

function download(filename: string, body: string, type: string) {
  const url = URL.createObjectURL(new Blob([body], { type }));
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function metadataUri(result: InspectResult): string | undefined {
  const uri = result.identity?.metadata?.uri ?? result.extensions.find(extension => extension.kind === 'TokenMetadata')?.fields.find(field => field.label === 'URI')?.value;
  return uri || undefined;
}

function toCsv(result: InspectResult, hash: string, request: InspectRequest): string {
  // Prefix formula-like strings so issuer metadata cannot become spreadsheet code.
  const cell = (value: string) => `"${(/^[=+@\-\t\r]/.test(value) ? `'${value}` : value).replace(/"/g, '""')}"`;
  const rows = [
    ['field', 'value'], ['receipt_type', 'point-in-time observation; not an attestation'], ['payload_sha256', hash],
    ['mode', result.provenance.mode], ['status', result.status], ['cluster', result.provenance.cluster],
    ['mint', result.identity?.mint ?? ''], ['token_program', result.identity?.tokenProgram ?? ''], ['decimals', String(result.identity?.decimals ?? '')],
    ['supply_raw_units', result.identity?.supply ?? ''], ['mint_authority', result.identity?.mintAuthority ?? ''], ['freeze_authority', result.identity?.freezeAuthority ?? ''],
    ['balance_status', result.balanceStatus], ['inspected_owner', request.mode === 'live' ? request.owner ?? '' : result.balances?.owner ?? ''], ['inspection_request', JSON.stringify(request)],
    ['raw_amount', result.balances?.display.rawAmount ?? ''], ['standard_ui_amount', result.balances?.display.standardUiAmount ?? ''],
    ['extension_ui_amount', result.balances?.display.extensionUiAmount ?? ''], ['multiplier', result.balances?.display.multiplier ?? ''],
    ['pending_multiplier', result.balances?.display.pendingMultiplier ?? ''], ['effective_at', result.balances?.display.effectiveAt ?? ''], ['boundary', result.balances?.display.boundary ?? ''],
    ['rounding', result.balances?.display.rounding ?? ''], ['complete_account_list', String(result.balances?.complete ?? '')],
    ['transfer_readiness', result.transferReadiness?.verdict ?? ''], ['extensions', result.extensions.map(extension => extension.kind).join(' ')],
    ['rpc_provider', result.provenance.rpcProvider], ['fetched_at', result.provenance.fetchedAt], ['slot', result.provenance.slot ?? ''],
    ['block_time', result.provenance.blockTime ?? ''], ['clock_timestamp', result.provenance.clockTimestamp ?? ''],
    ['clock_slot', result.provenance.clockSlot ?? ''], ['time_source', result.provenance.timeSource], ['decoder', result.provenance.decoderVersion],
    ['limitations', result.limitations.join(' | ')], ['warnings', result.warnings.join(' | ')], ['sources', JSON.stringify(result.provenance.sources)],
    ['public_accounts', JSON.stringify(result.balances?.accounts ?? [])], ['extension_evidence', JSON.stringify(result.extensions)], ['registry', JSON.stringify(result.registry ?? null)],
  ];
  return rows.map(row => row.map(cell).join(',')).join('\r\n') + '\r\n';
}

export function RwaLensShell({ cluster, reportsEnabled }: { cluster: Cluster; reportsEnabled: boolean }) {
  const [mint, setMint] = useState('');
  const [owner, setOwner] = useState('');
  const [fixtureId, setFixtureId] = useState<FixtureId | null>(FIXTURES[0].id);
  const [scenario, setScenario] = useState<Scenario>('before');
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<InspectResult>(FIXTURES[0].result);
  const [activeRequest, setActiveRequest] = useState<InspectRequest>({ mode: 'fixture', fixtureId: FIXTURES[0].id, scenario: 'before' });
  const [error, setError] = useState<string | null>(null);
  const [exportError, setExportError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const requestCounter = useRef(0);
  const mintValid = validAddress(mint);
  const ownerValid = !owner.trim() || validAddress(owner);
  const isFixture = result.provenance.mode === 'fixture' || result.provenance.rpcProvider === 'fixture';
  const liveAsset = liveAssets.find(asset => asset.mint === result.identity?.mint && asset.cluster === result.provenance.cluster);

  const run = useCallback(async (body: InspectRequest, selectedFixture: FixtureId | null = null, nextScenario: Scenario = 'before') => {
    const requestId = ++requestCounter.current;
    setLoading(true); setError(null); setNotice(null);
    try {
      const response = await fetch('/api/rwa/inspect', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
      const data = (await response.json()) as InspectResult & { message?: string };
      if (requestCounter.current !== requestId) return;
      if (!response.ok) {
        setError(data.message ?? (response.status === 429 ? 'Too many inspections. Wait a moment and try again.' : 'The inspection could not be completed. Check the mint address or try again.'));
        return;
      }
      const validated = inspectResultSchema.parse(data);
      setResult(validated); setActiveRequest(body); setFixtureId(selectedFixture); setScenario(nextScenario);
    } catch {
      if (requestCounter.current === requestId) setError('The request could not be completed. Check your connection and try again.');
    } finally { if (requestCounter.current === requestId) setLoading(false); }
  }, []);

  const inspectFixture = (id: FixtureId, nextScenario: Scenario = 'before') => void run({ mode: 'fixture', fixtureId: id, scenario: nextScenario }, id, nextScenario);
  const exportReceipt = async (format: 'json' | 'csv') => {
    setExportError(null);
    try {
      const payload = JSON.stringify(result);
      const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(payload));
      const hash = Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, '0')).join('');
      const filename = `rwa-lens-${isFixture ? 'synthetic-example' : result.identity?.mint ?? 'observation'}`;
      if (format === 'json') download(`${filename}.json`, JSON.stringify({ receiptType: 'RWA Lens observation', inspectionRequest: activeRequest, exportedAt: new Date().toISOString(), hashAlgorithm: 'SHA-256', hashEncoding: 'UTF-8 JSON.stringify(observation)', contentHash: hash, note: 'A point-in-time observation. The hash identifies this payload; it does not prove its truth or issuer endorsement.', observation: result }, null, 2), 'application/json');
      else download(`${filename}.csv`, toCsv(result, hash, activeRequest), 'text/csv');
    } catch { setExportError('Export could not be prepared. Please try again in a secure browser connection.'); }
  };

  return (
    <div className="site-width inspection-shell">
      <section id="inspect" className="search-panel" aria-label="Inspect a Solana token">
        <div className="search-heading"><h2><Search size={18} />Inspect a token</h2><span><ShieldCheck size={14} /> No wallet connection required</span></div>
        <form className="mint-form" onSubmit={event => { event.preventDefault(); if (mintValid && ownerValid && !loading) void run({ mode: 'live', cluster, mint: mint.trim(), owner: owner.trim() || undefined }); }}>
          <div className="mint-field"><label htmlFor="rwa-mint">Mint address</label><input id="rwa-mint" value={mint} onChange={event => setMint(event.target.value)} placeholder="Paste a Solana token mint" spellCheck={false} autoComplete="off" maxLength={64} aria-invalid={!!mint && !mintValid} aria-describedby={mint && !mintValid ? 'mint-error' : undefined} /></div>
          <div className="owner-field"><label htmlFor="rwa-owner">Wallet address <span>optional</span></label><input id="rwa-owner" value={owner} onChange={event => setOwner(event.target.value)} placeholder="Read a holder’s public balance" spellCheck={false} autoComplete="off" maxLength={64} aria-invalid={!!owner && !ownerValid} aria-describedby={owner && !ownerValid ? 'owner-error' : undefined} /></div>
          <button type="submit" className="primary-button" disabled={!mintValid || !ownerValid || loading}>{loading ? <LoaderCircle size={17} className="spinner" /> : <Search size={17} />}{loading ? 'Inspecting…' : 'Inspect'}<ArrowRight size={16} /></button>
        </form>
        {mint && !mintValid ? <p id="mint-error" className="input-error">That is not a valid base58 Solana address. A mint must decode to exactly 32 bytes.</p> : null}
        {owner && !ownerValid ? <p id="owner-error" className="input-error">Enter a valid Solana wallet address, or leave the optional field empty.</p> : null}
        <div className="example-bar"><div className="live-example"><span className="micro-label">LIVE EXAMPLE</span><button className="example-button live-example-button" type="button" disabled={loading} onClick={() => { const asset = liveAssets[0]; setMint(asset.mint); setOwner(''); if (cluster === asset.cluster) void run({ mode: 'live', cluster, mint: asset.mint }); else setNotice('USDY is on Solana mainnet. This deployment is configured for devnet; use a devnet mint or explore a synthetic example below.'); }}>{liveAssets[0].symbol}<ArrowUpRight size={12} /></button><span className="example-description">Treasury-linked note</span></div><div className="fixture-examples"><span className="micro-label"><FlaskConical size={12} />SYNTHETIC</span>{FIXTURES.map(fixture => <button key={fixture.id} className={`example-button ${isFixture && fixtureId === fixture.id ? 'selected' : ''}`} type="button" aria-pressed={isFixture && fixtureId === fixture.id} disabled={loading} onClick={() => inspectFixture(fixture.id)}>{fixtureLabels[fixture.id] ?? fixture.label}</button>)}</div></div>
        {notice ? <div className="mt-3"><Callout tone="amber">{notice}</Callout></div> : null}
      </section>

      <div aria-live="polite" aria-atomic="true">{error ? <div className="inspection-error"><Callout tone="amber"><strong>Inspection unavailable.</strong> {error} Your previous observation remains below. Try again, or open a synthetic example.</Callout></div> : null}</div>
      <section className={`inspection-results ${loading ? 'is-loading' : ''}`} aria-busy={loading} aria-label="Inspection results">
        <div className="observation-bar"><div className="observation-label"><span className={`observation-dot ${isFixture ? 'synthetic' : result.status === 'verified' ? 'live' : ''}`} /><strong>{isFixture ? 'Synthetic example' : result.provenance.mode === 'recorded' ? 'Recorded observation' : 'Live observation'}</strong>{!isFixture || result.status !== 'verified' ? <StatusPill status={result.status} /> : <span className="muted-tag">Illustrative data</span>}</div><span className="observation-detail">{isFixture ? 'No RPC call · not a real issuer or holding' : `${result.provenance.rpcProvider}${result.provenance.slot ? ` · slot ${result.provenance.slot}` : ''}`}</span><div className="export-buttons"><button type="button" onClick={() => void exportReceipt('json')} aria-label="Export JSON"><ArrowDownToLine size={14} />JSON</button><button type="button" onClick={() => void exportReceipt('csv')} aria-label="Export CSV"><ArrowDownToLine size={14} />CSV</button></div></div>
        {exportError ? <Callout tone="amber">{exportError}</Callout> : null}
        {liveAsset ? <div className="issuer-attribution"><span className="asset-monogram">{liveAsset.symbol.slice(0, 1)}</span><div><strong>{liveAsset.name} <span>{liveAsset.symbol}</span></strong><p>{liveAsset.category} · Issuer attribution: {liveAsset.issuer}</p></div><a href={liveAsset.addressSourceUrl} target="_blank" rel="noreferrer noopener">Official address source <ArrowUpRight size={14} /></a><p className="attribution-note">Issuer documentation retrieved {liveAsset.retrievedAt}. Attribution does not establish backing, eligibility or redemption rights.</p></div> : null}
        {result.warnings.filter(warning => !isFixture || !/illustrative|fixture data|not a real issuer/i.test(warning)).length ? <div className="result-warnings">{result.warnings.filter(warning => !isFixture || !/illustrative|fixture data|not a real issuer/i.test(warning)).map(warning => <Callout key={warning} tone="amber">{warning}</Callout>)}</div> : null}
        <div className="primary-results">
          {result.identity ? <IdentityCard identity={result.identity} metadataUri={metadataUri(result)} synthetic={isFixture} cluster={result.provenance.cluster} /> : null}
          <div className="balance-column">{result.balances ? <BalanceCard balances={result.balances} decimals={result.identity?.decimals} synthetic={isFixture} timeline={isFixture && fixtureId === 'treasury-scaled' ? <div className="timeline"><div className="timeline-top"><span><FlaskConical size={13} />SCHEDULED MULTIPLIER EXAMPLE</span><span className="raw-fixed">RAW UNITS STAY FIXED</span></div><div className="timeline-track" role="group" aria-label="Scheduled multiplier timeline">{(['before', 'at', 'after'] as const).map(side => <button key={side} type="button" disabled={loading} aria-pressed={scenario === side} onClick={() => inspectFixture('treasury-scaled', side)}><span className="timeline-point" /><span>{scenarioLabels[side]}</span><strong>{side === 'before' ? '× 1.04235' : '× 1.05114'}</strong></button>)}</div><p>Changes the simulated observation time. No tokens move.</p></div> : undefined} /> : <div className="empty-balance"><span className="empty-icon"><Search size={25} /></span><p className="micro-label">HOLDER BALANCE</p><h2>{result.balanceStatus === 'unavailable' ? 'Balance unavailable' : 'Add a wallet. See the full picture.'}</h2><p>{result.balanceStatus === 'unavailable' ? 'The public account lookup did not complete. The amount is unknown. Retry with the same wallet when the provider is available.' : 'Mint identity is available above. Add a public wallet address to reconcile its exact raw units and displayed amount.'}</p><button type="button" className="text-link" onClick={() => document.getElementById('rwa-owner')?.focus()}>Enter a wallet address <ArrowRight size={15} /></button><span>No signature required</span></div>}</div>
        </div>
        <div className="control-results"><ExtensionInventory extensions={result.extensions} synthetic={isFixture} />{result.transferReadiness ? <TransferReadinessCard readiness={result.transferReadiness} synthetic={isFixture} /> : null}</div>
        <RegistryPanel registry={result.registry} />
        <EvidenceDrawer provenance={result.provenance} />
        <div id="reports">{reportsEnabled ? <ReportActions request={activeRequest} /> : <div className="guest-export-note"><ArrowDownToLine size={16} /><p><strong>Your observation, ready to take away.</strong> Export JSON or CSV above. Cloud reports are not enabled on this deployment.</p><span>No sign-in needed</span></div>}</div>
        <details className="limitations"><summary><Info size={15} /><span>What this observation can and cannot tell you</span><ChevronDown size={16} /></summary><ul>{result.limitations.map(limitation => <li key={limitation}>{limitation}</li>)}<li>Decoded token data does not verify an investment, asset backing or legal eligibility. An export is an observation receipt, not an attestation.</li></ul></details>
      </section>
    </div>
  );
}
