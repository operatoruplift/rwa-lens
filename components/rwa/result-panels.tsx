'use client';

import { useState } from 'react';
import { ArrowRight, ArrowUpRight, Check, ChevronDown, Copy, FileSearch, Fingerprint, Info, Layers3, LockKeyhole, ShieldCheck } from 'lucide-react';
import { Card, Callout, Field, VerdictPill, severityStyle } from './primitives';
import { MetadataPanel } from './metadata-panel';
import type { Balances, Cluster, DecodedExtension, Identity, Provenance, RegistryAsset, TransferReadiness } from '@/lib/rwa/types';

export function IdentityCard({ identity, metadataUri, synthetic = false, cluster }: { identity: Identity; metadataUri?: string; synthetic?: boolean; cluster?: Cluster }) {
  const [copied, setCopied] = useState(false);
  const [copyError, setCopyError] = useState(false);
  const isToken2022 = identity.tokenProgram === 'token-2022';
  return (
    <Card title="Token identity" step="01" className="identity-card" aside={<Fingerprint size={17} className="text-navy-faint" />}>
      <div className="token-name"><span className="token-emblem"><Layers3 size={23} /></span><div><h3>{identity.metadata?.name ?? (isToken2022 ? 'Token-2022 mint' : 'SPL token mint')}</h3><span>{identity.metadata?.symbol ? `${identity.metadata.symbol} · ` : ''}{synthetic ? 'Synthetic asset' : 'Public mint account'}</span></div></div>
      <span className="program-badge">{isToken2022 ? 'Token-2022' : identity.tokenProgram === 'spl-token' ? 'SPL Token · legacy program' : 'Unknown program'}</span>
      <div className="mint-address-block"><div className="field-header"><span>Mint address</span>{!synthetic ? <button type="button" aria-label="Copy mint address" onClick={async () => { try { await navigator.clipboard.writeText(identity.mint); setCopied(true); setCopyError(false); } catch { setCopyError(true); } }}>{copied ? <Check size={14} /> : <Copy size={14} />}</button> : null}</div><p className="tabular">{identity.mint}</p>{copyError ? <p role="status">Copy unavailable. Select the address to copy it.</p> : null}</div>
      <dl className="identity-numbers"><Field label="Decimals" value={String(identity.decimals)} /><Field label="Supply · raw units" value={identity.supply} /></dl>
      <dl className="identity-authorities"><Field label="Mint authority" value={identity.mintAuthority ?? 'None observed'} /><Field label="Freeze authority" value={identity.freezeAuthority ?? 'None observed'} /></dl>
      <details className="inline-details"><summary>Program & metadata <ChevronDown size={14} /></summary><dl><Field label="Owning program" value={identity.tokenProgramAddress} /><Field label="Initialized" value={identity.isInitialized ? 'Yes' : 'No'} /></dl>{identity.metadata ? <p className="detail-note">Names and symbols are issuer-supplied metadata. They do not establish asset backing.</p> : <p className="detail-note">No decoded on-chain name or symbol is available in this observation.</p>}{metadataUri ? <MetadataPanel key={`${identity.mint}:${metadataUri}`} identity={identity} uri={metadataUri} /> : null}</details>
      {!isToken2022 ? <p className="legacy-note">This is a legacy SPL mint. It cannot carry Token-2022 extensions.</p> : null}
      {!synthetic ? <a className="text-link explorer-link" href={`https://explorer.solana.com/address/${identity.mint}${cluster === 'devnet' ? '?cluster=devnet' : ''}`} target="_blank" rel="noreferrer noopener">View on Solana Explorer <ArrowUpRight size={14} /></a> : null}
    </Card>
  );
}

export function BalanceCard({ balances, decimals, timeline, synthetic = false }: { balances: Balances; decimals?: number; timeline?: React.ReactNode; synthetic?: boolean }) {
  const { display } = balances;
  const scalePresent = display.multiplier !== undefined;
  const conversionUnavailable = display.rounding === 'unavailable';
  const preciseDecimals = decimals ?? balances.accounts[0]?.decimals;
  const hasConfidential = balances.accounts.some(account => account.extensions.some(extension => extension.includes('Confidential')));
  return (
    <Card title="Balance reconciliation" step="02" className="balance-card" aside={<span className="muted-tag">{balances.complete ? 'Observed public units' : 'Partial public balance'}</span>}>
      <div className="balance-ledger">
        <div className="raw-balance"><div className="balance-label-row"><p>Raw base units</p><span title="Token-2022 stores integer base units. A Scaled UI Amount multiplier changes display conversion, never the stored units."><LockKeyhole size={13} /><span>EXACT</span></span></div><p className="raw-value tabular" data-testid="raw-balance">{display.rawAmount}</p><span>Unchanged by a display multiplier</span></div>
        <div className="display-balances"><div><p className="balance-label">Standard decimal</p><p className="standard-value tabular">{display.standardUiAmount ?? 'Unavailable'}</p><span>{preciseDecimals !== undefined ? <>Raw units ÷ 10<sup>{preciseDecimals}</sup></> : 'Mint decimals unavailable'}</span></div><span className="conversion-arrow"><ArrowRight size={21} /></span><div><p className="balance-label">{scalePresent ? 'Extension-aware amount' : conversionUnavailable ? 'Display conversion' : 'Displayed amount'}</p><p className="scaled-value tabular" data-testid="display-balance" aria-live="polite">{conversionUnavailable ? 'Unavailable' : display.extensionUiAmount ?? display.standardUiAmount ?? 'Unavailable'}</p><span>{scalePresent ? `× multiplier ${display.multiplier}` : conversionUnavailable ? 'Detected, calculation unavailable' : 'No display multiplier applied'}</span></div></div>
      </div>
      {scalePresent ? <div className="conversion-formula"><span>THE CONVERSION</span><p className="tabular">raw units ÷ 10<sup>decimals</sup> × multiplier</p><button type="button" aria-label="Explain scaled amount" onClick={() => document.getElementById('scaled-explanation')?.toggleAttribute('open')}><Info size={15} /></button><details id="scaled-explanation"><summary>Why can the displayed amount change?</summary><p>Token-2022 stores raw integer units. Scaled UI Amount changes the display conversion. A scheduled multiplier update is not a transfer or proof of earned yield.</p></details></div> : null}
      {timeline}
      {display.effectiveAt ? <p className="boundary-note">{synthetic ? 'Simulated observation' : 'Observed time'}: <strong>{display.boundary ?? 'unknown'}</strong> the scheduled boundary. Effective <span className="tabular">{display.effectiveAt}</span>{display.pendingMultiplier ? <> · pending × {display.pendingMultiplier}</> : null}.</p> : null}
      {display.rounding === 'official-helper' || display.rounding === 'rounded-for-display' ? <div className="rounding-note"><Info size={15} /><p><strong>Rounded display · exact raw units.</strong> {display.note ?? 'The conversion uses floating-point arithmetic and may not round-trip exactly.'}</p></div> : display.note ? <p className="balance-note">{display.note}</p> : null}
      {!balances.complete ? <div className="mt-3"><Callout tone="amber">This account observation is incomplete. The amount covers only decoded public units and is not a complete wallet balance. Review the evidence for omitted or unavailable data.</Callout></div> : null}
      {hasConfidential ? <div className="mt-3"><Callout tone="indigo">Confidential account capability detected. Any encrypted portion is unknown; it is not zero.</Callout></div> : null}
      <details className="account-details"><summary><span>Public token accounts <span className="count-badge">{balances.accounts.length}</span></span><ChevronDown size={15} /></summary>{balances.owner ? <p className="account-owner tabular">Owner: {balances.owner}</p> : null}{balances.accounts.length ? <div className="table-scroll" tabIndex={0} role="region" aria-label="Token accounts"><table><thead><tr><th>Token account</th><th>Raw amount</th><th>State</th><th>Extensions</th></tr></thead><tbody>{balances.accounts.map(account => <tr key={account.tokenAccount}><td className="tabular">{account.tokenAccount}</td><td className="tabular">{account.rawAmount}</td><td><span className={account.state === 'frozen' ? 'state-frozen' : 'muted-tag'}>{account.state}</span></td><td>{account.extensions.join(', ') || 'None detected'}</td></tr>)}</tbody></table></div> : <p className="detail-note">No matching public token accounts were returned by this lookup.</p>}</details>
    </Card>
  );
}

export function ExtensionInventory({ extensions, synthetic = false }: { extensions: DecodedExtension[]; synthetic?: boolean }) {
  return (
    <Card title="Extension inventory" step="03" className="extensions-card" aside={<span className="muted-tag">{extensions.length} detected</span>}>
      <p className="panel-intro">What the token&rsquo;s configuration means for a holder.</p>
      {!extensions.length ? <Callout tone="slate">No Token-2022 extensions were found on this mint.</Callout> : <ul className="extension-list">{extensions.map((extension, index) => { const style = severityStyle(extension.severity); return <li key={`${extension.kind}-${extension.scope}-${index}`}><div className="extension-title"><span className={`extension-mark ${style.rail}`} /><h3>{extension.kind}</h3><span className={`severity-chip ${style.chip}`}>{extension.inactive ? 'inactive' : extension.severity}</span></div><p>{extension.impact}</p>{extension.calculationUnavailable ? <span className="unavailable-note">Detected · calculation unavailable</span> : null}<details className="extension-details"><summary><span>{extension.scope} configuration{extension.authorities.length ? ` · ${extension.authorities.length} ${extension.authorities.length === 1 ? 'authority' : 'authorities'}` : ''}</span><ChevronDown size={14} /></summary><dl>{extension.fields.map((field, fieldIndex) => <Field key={`${field.label}-${fieldIndex}`} label={field.label} value={field.value} />)}{extension.authorities.map((authority, authorityIndex) => <Field key={`${authority.address}-${authorityIndex}`} label={authority.role} value={authority.address} />)}{extension.byteLength !== undefined ? <Field label="Encoded length" value={`${extension.byteLength} bytes`} /> : null}</dl><p className="detail-note">Source: {synthetic ? 'synthetic fixture' : 'decoded on-chain account'} · {extension.scope} scope</p></details></li>; })}</ul>}
    </Card>
  );
}

export function TransferReadinessCard({ readiness, synthetic = false }: { readiness: TransferReadiness; synthetic?: boolean }) {
  const summary = { ready: 'No blocking control observed', attention: 'Review the controls', blocked: 'A blocking state was observed', unknown: 'Movement remains uncertain' }[readiness.verdict];
  return (
    <Card title="Transfer readiness" step="04" className="readiness-card" aside={<ShieldCheck size={17} className="text-navy-faint" />}>
      <div className="readiness-overview"><VerdictPill verdict={readiness.verdict} /><h3>{summary}</h3><p>{synthetic ? 'Synthetic configuration · ' : ''}An explanation of observed controls.</p></div>
      <ul className="readiness-list">{readiness.reasons.map((reason, index) => <li key={`${reason.check}-${index}`}><span className={`reason-indicator reason-${reason.verdict}`}>{reason.verdict === 'ready' ? <Check size={13} /> : reason.verdict === 'blocked' ? <LockKeyhole size={12} /> : <Info size={13} />}</span><div><h3>{reason.check}</h3><p>{reason.detail}</p>{reason.evidence ? <details><summary>View evidence <ChevronDown size={12} /></summary><p className="tabular">{reason.evidence}</p></details> : null}</div></li>)}</ul>
      <p className="readiness-disclaimer">{readiness.disclaimer}</p>
    </Card>
  );
}

export function EvidenceDrawer({ provenance }: { provenance: Provenance }) {
  const synthetic = provenance.mode === 'fixture';
  return (
    <details className="evidence-drawer" id="evidence"><summary><div><span className="evidence-icon"><FileSearch size={20} /></span><span><strong>Every observation has a source.</strong><span>{synthetic ? 'Synthetic fixture · no live RPC' : `${provenance.sources.length} source observations · ${provenance.commitment} commitment`}</span></span></div><span className="evidence-expand">Inspect evidence <ChevronDown size={16} /></span></summary>
      <div className="evidence-body"><dl className="evidence-grid"><Field label="Mode / network" value={`${provenance.mode} / ${provenance.cluster}`} /><Field label="RPC provider" value={provenance.rpcProvider} /><Field label="Commitment" value={provenance.commitment} /><Field label="Mint context slot" value={provenance.slot} /><Field label="Block time" value={provenance.blockTime} /><Field label="Observed Clock timestamp" value={provenance.clockTimestamp} /><Field label="Clock context slot" value={provenance.clockSlot} /><Field label="Observed slot spread" value={provenance.slotSpread?.toString()} /><Field label="Fetched at" value={provenance.fetchedAt} /><Field label="Time source" value={provenance.timeSource} /><Field label="Cache age" value={provenance.cacheAgeMs !== undefined ? `${provenance.cacheAgeMs} ms at response` : 'Not cached / not supplied'} /><Field label="Decoder" value={provenance.decoderVersion} /></dl>
      {provenance.timeSource === 'local-estimate' || provenance.timeSource === 'block-time-estimate' ? <div className="mt-4"><Callout tone="amber">The multiplier uses a {provenance.timeSource === 'local-estimate' ? 'local-clock' : 'block-time'} estimate. The Clock sysvar was unavailable; this conversion is not chain-time verified. A scheduled boundary may be uncertain.</Callout></div> : null}
      <div className="table-scroll" tabIndex={0} role="region" aria-label="RPC sources"><table><thead><tr><th>Source</th><th>Method</th><th>Status</th><th>Context slot</th><th>Detail</th></tr></thead><tbody>{provenance.sources.map((source, index) => <tr key={`${source.label}-${index}`}><td>{source.label}</td><td className="tabular">{source.method}</td><td><span className={source.status === 'failed' ? 'source-failed' : source.status === 'ok' && !synthetic ? 'source-ok' : 'muted-tag'}>{source.status}</span></td><td className="tabular">{source.slot ?? '—'}</td><td>{source.detail ?? '—'}{source.blockTime ? ` · ${source.blockTime}` : ''}</td></tr>)}</tbody></table></div><p className="detail-note">Separate account reads are not an atomic snapshot. Context slots describe each read; a latest slot is not proof that every account was observed there.</p></div>
    </details>
  );
}


function publicHttpsLink(value: string | undefined): string | undefined {
  if (!value) return undefined;
  try {
    const url = new URL(value);
    return url.protocol === 'https:' && !url.username && !url.password ? url.href : undefined;
  } catch { return undefined; }
}

export function RegistryPanel({ registry }: { registry?: RegistryAsset | null }) {
  const sourceLink = publicHttpsLink(registry?.source);
  const documentationLink = publicHttpsLink(registry?.documentationUrl);
  const reserveLink = publicHttpsLink(registry?.reserveProofUrl);
  return (
    <details className="evidence-drawer" id="issuer-registry">
      <summary>
        <div className="min-w-0">
          <span className="evidence-icon shrink-0"><Fingerprint size={20} /></span>
          <span className="min-w-0 [overflow-wrap:anywhere]">
            <strong>{registry ? 'Issuer registry attribution' : 'Issuer attribution unavailable'}</strong>
            <span>{registry ? `${registry.issuer ?? 'Issuer not supplied'} · retrieved ${registry.fetchedAt}` : 'No registry record · on-chain inspection remains available'}</span>
          </span>
        </div>
        <span className="evidence-expand">
          {registry?.stale ? <span className="status-pill bg-amber-wash text-amber-ink">Stale source</span> : <span>{registry ? 'View attribution' : 'What this means'}</span>}
          <ChevronDown size={16} />
        </span>
      </summary>
      <div className="evidence-body">
        {registry ? (
          <>
            {registry.stale ? <Callout tone="amber">This attribution is older than the source freshness window. Check the issuer source for an update before relying on its description.</Callout> : null}
            <dl className="evidence-grid mt-4">
              <Field label="Issuer" value={registry.issuer} mono={false} />
              <Field label="Asset class" value={registry.assetClass} mono={false} />
              <Field label="Retrieved at" value={registry.fetchedAt} />
              <Field label="Freshness" value={registry.stale === true ? 'Stale' : registry.stale === false ? 'Current at recorded fetch' : 'Unavailable'} mono={false} />
              <Field label="Attribution source" value={registry.source} />
              {registry.jurisdiction ? <Field label="Jurisdiction label" value={registry.jurisdiction} mono={false} /> : null}
              {registry.redemption ? <Field label="Issuer redemption description" value={registry.redemption} mono={false} /> : null}
            </dl>
            <div className="flex flex-wrap gap-x-6">
              {sourceLink ? <a className="text-link" href={sourceLink} target="_blank" rel="noreferrer noopener">Open registry source <ArrowUpRight size={14} /></a> : null}
              {documentationLink && documentationLink !== sourceLink ? <a className="text-link" href={documentationLink} target="_blank" rel="noreferrer noopener">Issuer documentation <ArrowUpRight size={14} /></a> : null}
              {reserveLink ? <a className="text-link" href={reserveLink} target="_blank" rel="noreferrer noopener">Issuer reserve document <ArrowUpRight size={14} /></a> : null}
            </div>
            <p className="detail-note">Registry content describes the issuer&rsquo;s claims. It is separate from on-chain decoding and does not verify backing, legal eligibility, reserve sufficiency or redemption rights.</p>
          </>
        ) : <Callout tone="slate">No issuer attribution was returned for this observation. A decoded mint alone does not establish that it represents a real-world asset. Consult an official issuer source; the token identity, balance and control evidence remain available here.</Callout>}
      </div>
    </details>
  );
}
