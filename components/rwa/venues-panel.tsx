'use client';

import { useEffect, useState } from 'react';
import dynamic from 'next/dynamic';
import { ArrowUpRight, LoaderCircle, Waves } from 'lucide-react';
import { formatPct, formatUsd, MIN_LISTED_TVL_USD, USDC_MINT_ADDRESS, venuesResponseSchema, type VenuePool, type VenuesResponse } from '@/lib/rwa/venues';
import { Callout } from './primitives';

// Loaded only when an operator has enabled deploy and a user opens it.
const DeployDialog = dynamic(() => import('./deploy/deploy-dialog'), { ssr: false });

type PanelState = { phase: 'loading' } | { phase: 'done'; value: VenuesResponse };

const utc = new Intl.DateTimeFormat('en-GB', { hour: '2-digit', minute: '2-digit', second: '2-digit', timeZone: 'UTC', hour12: false });

function Pool({ pool, onDeploy }: { pool: VenuePool; onDeploy?: (pool: VenuePool) => void }) {
  return (
    <li className="venue" data-pool={pool.address}>
      <div className="venue-pair">
        <strong>{pool.pair}</strong>
        <span>Paired with {pool.counterSymbol} · {pool.counterVerified ? 'verified token' : 'unverified token'}</span>
      </div>
      <dl className="venue-metrics">
        <div><dt>TVL</dt><dd>{formatUsd(pool.tvlUsd)}</dd></div>
        <div><dt>24h volume</dt><dd>{formatUsd(pool.volume24hUsd)}</dd></div>
        <div><dt>24h fees</dt><dd>{formatUsd(pool.fees24hUsd)}</dd></div>
        <div><dt>Fee APY*</dt><dd>{formatPct(pool.feeApyPct)}</dd></div>
        <div><dt>Bin step · fee</dt><dd>{pool.binStep} · {formatPct(pool.baseFeePct)}</dd></div>
      </dl>
      <div className="venue-actions">
        {onDeploy && pool.counterMint === USDC_MINT_ADDRESS ? <button type="button" className="venue-deploy" onClick={() => onDeploy(pool)} aria-label={`Deploy USDC into the ${pool.pair} pool`}>Deploy USDC</button> : null}
        <a href={pool.meteoraUrl} target="_blank" rel="noreferrer noopener" aria-label={`Open the ${pool.pair} pool on Meteora`}>Open on Meteora <ArrowUpRight size={14} /></a>
      </div>
    </li>
  );
}

/**
 * Where the inspected token has liquidity, from Meteora's public data API.
 * A separate request after the inspection: it never delays, alters or joins the
 * observation, its export or a saved report.
 */
export function VenuesPanel({ mint, deployEnabled = false }: { mint: string; deployEnabled?: boolean }) {
  const [state, setState] = useState<PanelState>({ phase: 'loading' });
  const [deploying, setDeploying] = useState<VenuePool | null>(null);
  useEffect(() => {
    // Unmounting cancels silently; the 15-second deadline reports "unavailable" instead of spinning forever.
    let cancelled = false;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 15_000);
    void (async () => {
      let value: VenuesResponse;
      try {
        const response = await fetch(`/api/rwa/venues?mint=${encodeURIComponent(mint)}&cluster=mainnet-beta`, { signal: controller.signal, cache: 'no-store' });
        const parsed = venuesResponseSchema.safeParse(await response.json());
        value = parsed.success ? parsed.data : { state: 'unavailable', reason: 'The venue response did not match the expected shape.' };
        if (parsed.success && (value.state === 'ok' || value.state === 'none') && value.mint !== mint) value = { state: 'unavailable', reason: 'The venue response was for a different token.' };
      } catch {
        value = { state: 'unavailable', reason: 'Venue data could not be loaded. Inspection results are unaffected.' };
      } finally { clearTimeout(timer); }
      if (!cancelled) setState({ phase: 'done', value });
    })();
    return () => { cancelled = true; clearTimeout(timer); controller.abort(); };
  }, [mint]);

  const value = state.phase === 'done' ? state.value : null;
  const summary = !value ? 'Reading Meteora pools…'
    : value.state === 'ok' ? `${value.pools.length} of ${value.matched} pool${value.matched === 1 ? '' : 's'} listed · ${formatUsd(value.pools.reduce((sum, pool) => sum + pool.tvlUsd, 0))} TVL listed`
      : value.state === 'none' ? (value.matched ? `${value.matched} pool${value.matched === 1 ? '' : 's'}, none with ${formatUsd(MIN_LISTED_TVL_USD)} TVL` : 'No Meteora DLMM pool holds this token')
        : 'Unavailable';
  return (
    <section className="venues-panel" id="liquidity-venues" aria-labelledby="venues-title" aria-busy={state.phase === 'loading'} data-venues-state={value?.state ?? 'loading'}>
      <div className="venues-head">
        <span className="evidence-icon shrink-0"><Waves size={18} /></span>
        <div>
          <p className="micro-label">THIRD-PARTY MARKET DATA</p>
          <h2 id="venues-title">Liquidity venues on Meteora</h2>
          <p>{summary}</p>
        </div>
        {state.phase === 'loading' ? <LoaderCircle size={18} className="spinner venues-spinner" aria-hidden="true" /> : null}
      </div>
      {value?.state === 'ok' ? <ul className="venue-list">{value.pools.map(pool => <Pool key={pool.address} pool={pool} onDeploy={deployEnabled ? setDeploying : undefined} />)}</ul> : null}
      {value?.state === 'none' ? <p className="detail-note">{value.matched ? `The ${value.matched} DLMM pool${value.matched === 1 ? '' : 's'} holding this token each have under ${formatUsd(MIN_LISTED_TVL_USD)} in total value locked, too little for meaningful rates, so none are listed.` : 'Meteora’s data API lists no DLMM pool for this exact mint.'}</p> : null}
      {value?.state === 'unavailable' || value?.state === 'not-applicable' ? <Callout tone="slate">{value.reason}</Callout> : null}
      {value?.state === 'ok' || value?.state === 'none' ? (
        <p className="detail-note">
          Source: {value.source}, fetched {utc.format(new Date(value.fetchedAt))} UTC{value.state === 'ok' && value.belowFloor ? `; ${value.belowFloor} smaller pool${value.belowFloor === 1 ? '' : 's'} under ${formatUsd(MIN_LISTED_TVL_USD)} TVL not listed` : ''}.
          {value.state === 'ok' ? ' *Fee APY is Meteora’s annualization of the last 24 hours of fees relative to TVL. Past fees do not predict returns. A DLMM position earns only while the price sits inside its bins and can end holding a different mix of tokens than it started with.' : ''}
          {' '}This data is not part of the observation above, is not included in exports or saved reports, and says nothing about the asset’s backing.
          {deployEnabled && value.state === 'ok' && value.pools.some(pool => pool.counterMint === USDC_MINT_ADDRESS) ? ' Deploy builds one transaction for your own wallet to review, sign and send; RWA Lens never holds keys or funds.' : ''}
        </p>
      ) : null}
      {deploying ? <DeployDialog mint={mint} pool={deploying} onClose={() => setDeploying(null)} /> : null}
    </section>
  );
}
