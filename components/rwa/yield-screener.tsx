'use client';

import { useEffect, useMemo, useState } from 'react';
import dynamic from 'next/dynamic';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { ArrowUpRight, LoaderCircle } from 'lucide-react';
import {
  APY_DISPLAY_CAP, DEFAULT_FILTERS, ISSUERS, MIN_TVL_CHOICES, SORTS, screen, screenerResponseSchema,
  type Opportunity, type ScreenerFilters, type ScreenerResponse,
} from '@/lib/rwa/screener';
import { formatPct, formatUsd, USDC_MINT_ADDRESS } from '@/lib/rwa/venues';
import { Callout } from './primitives';
import styles from './yield-screener.module.css';

const DeployDialog = dynamic(() => import('./deploy/deploy-dialog'), { ssr: false });
const PAGE = 25;
const SORT_LABEL: Record<ScreenerFilters['sort'], string> = { tvl: 'TVL', volume: '24h volume', apy: 'Fee APY' };
const MARKET_LABEL = { open: 'Market open', closed: 'Market closed', halted: 'Trading halted' } as const;
const utc = new Intl.DateTimeFormat('en-GB', { hour: '2-digit', minute: '2-digit', timeZone: 'UTC', hour12: false });

function parseFilters(params: URLSearchParams): ScreenerFilters {
  const pick = <T extends string | number>(value: string | null, allowed: readonly T[], fallback: T): T => allowed.find(option => String(option) === value) ?? fallback;
  return {
    issuer: pick(params.get('issuer'), ['all', ...ISSUERS] as const, DEFAULT_FILTERS.issuer),
    pair: pick(params.get('pair'), ['all', 'usdc'] as const, DEFAULT_FILTERS.pair),
    minTvl: pick(params.get('tvl'), MIN_TVL_CHOICES, DEFAULT_FILTERS.minTvl),
    sort: pick(params.get('sort'), SORTS, DEFAULT_FILTERS.sort),
  };
}
function toQuery(filters: ScreenerFilters): string {
  const params = new URLSearchParams();
  if (filters.issuer !== DEFAULT_FILTERS.issuer) params.set('issuer', filters.issuer);
  if (filters.pair !== DEFAULT_FILTERS.pair) params.set('pair', filters.pair);
  if (filters.minTvl !== DEFAULT_FILTERS.minTvl) params.set('tvl', String(filters.minTvl));
  if (filters.sort !== DEFAULT_FILTERS.sort) params.set('sort', filters.sort);
  return params.toString();
}
const apy = (value: number) => (value > APY_DISPLAY_CAP ? `over ${APY_DISPLAY_CAP.toLocaleString('en-US')}%` : formatPct(value));

function Choice<T extends string | number>({ legend, name, value, options, onChange }: { legend: string; name: string; value: T; options: ReadonlyArray<readonly [T, string]>; onChange: (value: T) => void }) {
  return (
    <fieldset className={styles.choice}>
      <legend>{legend}</legend>
      <div>{options.map(([option, label]) => <label key={String(option)}><input type="radio" name={name} checked={value === option} onChange={() => onChange(option)} />{label}</label>)}</div>
    </fieldset>
  );
}

function Row({ opportunity, onDeploy }: { opportunity: Opportunity; onDeploy?: (opportunity: Opportunity) => void }) {
  const { asset, pool } = opportunity;
  return (
    <li className={styles.row} data-pool={pool.address}>
      <div className={styles.asset}>
        <Link href={`/rwa?mint=${asset.mint}`} aria-label={`Inspect ${asset.symbol}`}>{asset.symbol}</Link>
        <span>{asset.name} · {asset.issuer}</span>
        {asset.market ? <em data-market={asset.market}>{MARKET_LABEL[asset.market]}</em> : null}
      </div>
      <div className={styles.pair}><strong>{pool.pair}</strong><span>Paired with {pool.counterSymbol}</span></div>
      <dl className={styles.metrics}>
        <div><dt>TVL</dt><dd>{formatUsd(pool.tvlUsd)}</dd></div>
        <div><dt>24h volume</dt><dd>{formatUsd(pool.volume24hUsd)}</dd></div>
        <div><dt>24h fees</dt><dd>{formatUsd(pool.fees24hUsd)}</dd></div>
        <div><dt>Fee APY*</dt><dd>{apy(pool.feeApyPct)}</dd></div>
        <div><dt>Bin step</dt><dd>{pool.binStep}</dd></div>
      </dl>
      <div className={styles.actions}>
        {onDeploy && pool.counterMint === USDC_MINT_ADDRESS ? <button type="button" className="venue-deploy" onClick={() => onDeploy(opportunity)} aria-label={`Deploy USDC into the ${pool.pair} pool`}>Deploy USDC</button> : null}
        <Link href={`/rwa?mint=${asset.mint}`}>Inspect</Link>
        <a href={pool.meteoraUrl} target="_blank" rel="noreferrer noopener" aria-label={`Open the ${pool.pair} pool on Meteora`}>Meteora <ArrowUpRight size={13} /></a>
      </div>
    </li>
  );
}

/** Pools that hold tokenized assets, filtered in the URL so a view can be shared. */
export function YieldScreener({ deployEnabled }: { deployEnabled: boolean }) {
  const router = useRouter();
  const params = useSearchParams();
  const filters = useMemo(() => parseFilters(new URLSearchParams(params.toString())), [params]);
  const [state, setState] = useState<{ phase: 'loading' } | { phase: 'done'; value: ScreenerResponse }>({ phase: 'loading' });
  const [limit, setLimit] = useState(PAGE);
  const [deploying, setDeploying] = useState<Opportunity | null>(null);

  useEffect(() => {
    let cancelled = false;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 30_000);
    void (async () => {
      let value: ScreenerResponse;
      try {
        const parsed = screenerResponseSchema.safeParse(await (await fetch('/api/rwa/screener', { signal: controller.signal })).json());
        value = parsed.success ? parsed.data : { state: 'unavailable', reason: 'The screener response did not match the expected shape.' };
      } catch { value = { state: 'unavailable', reason: 'Pool data could not be loaded. Try again shortly.' }; }
      finally { clearTimeout(timer); }
      if (!cancelled) setState({ phase: 'done', value });
    })();
    return () => { cancelled = true; clearTimeout(timer); controller.abort(); };
  }, []);

  const value = state.phase === 'done' && state.value.state === 'ok' ? state.value : null;
  const rows = useMemo(() => (value ? screen(value, filters) : []), [value, filters]);
  const update = (next: Partial<ScreenerFilters>) => {
    const query = toQuery({ ...filters, ...next });
    router.replace(query ? `/yield?${query}` : '/yield', { scroll: false });
    setLimit(PAGE);
  };

  return (
    <section className={styles.screener} aria-labelledby="screener-title" aria-busy={state.phase === 'loading'}>
      <div className={styles.head}>
        <h2 id="screener-title">Pools holding tokenized assets</h2>
        <p aria-live="polite">{value ? `${rows.length} of ${value.pools.length} pools · ${value.assets.length} assets with a listed pool of ${value.catalogSize.toLocaleString('en-US')} checked · updated ${utc.format(new Date(value.fetchedAt))} UTC${value.stale ? ', refreshing' : ''}` : state.phase === 'loading' ? 'Reading Meteora pools and issuer catalogs…' : 'Unavailable'}</p>
      </div>
      <div className={styles.filters}>
        <Choice legend="Issuer" name="issuer" value={filters.issuer} options={[['all', 'All'], ['xStocks', 'xStocks'], ['Ondo', 'Ondo']]} onChange={issuer => update({ issuer })} />
        <Choice legend="Pair" name="pair" value={filters.pair} options={[['all', 'Any token'], ['usdc', 'USDC only']]} onChange={pair => update({ pair })} />
        <Choice legend="Liquidity" name="tvl" value={filters.minTvl} options={MIN_TVL_CHOICES.map(choice => [choice, `${formatUsd(choice)}+`] as const)} onChange={minTvl => update({ minTvl })} />
        <label className={styles.sort}>Sort by<select value={filters.sort} onChange={event => update({ sort: event.target.value as ScreenerFilters['sort'] })}>{SORTS.map(sort => <option key={sort} value={sort}>{SORT_LABEL[sort]}</option>)}</select></label>
      </div>
      {state.phase === 'loading' ? <p className={styles.loading}><LoaderCircle size={16} className="spinner" aria-hidden="true" />Reading Meteora pools and issuer catalogs…</p> : null}
      {state.phase === 'done' && state.value.state === 'unavailable' ? <Callout tone="slate">{state.value.reason}</Callout> : null}
      {value && !rows.length ? <Callout tone="slate">No pool matches these filters. Lower the liquidity floor or include any paired token.</Callout> : null}
      {rows.length ? <ul className={styles.list} data-deploy={deployEnabled ? 'true' : undefined}>{rows.slice(0, limit).map(row => <Row key={`${row.asset.mint}-${row.pool.address}`} opportunity={row} onDeploy={deployEnabled ? setDeploying : undefined} />)}</ul> : null}
      {rows.length > limit ? <button type="button" className={styles.more} onClick={() => setLimit(current => current + PAGE)}>Show {Math.min(PAGE, rows.length - limit)} more</button> : null}
      {value ? (
        <p className={styles.note}>
          Sources: Meteora’s DLMM data API for pools, the xStocks public API for the xStock catalog and its market sessions, and RWA Lens’s issuer attribution for Ondo USDY.
          {' '}*Fee APY is Meteora’s annualization of the last 24 hours of fees relative to TVL; in small pools one busy day can produce very large figures, shown here as over {APY_DISPLAY_CAP.toLocaleString('en-US')}%. Past fees do not predict returns, and a DLMM position earns only while the price sits inside its bins.
          {' '}“Market” is the issuer’s reported session for the underlying share. A pool that pairs two listed assets appears under each. None of this is investment advice or evidence of backing: inspect a token to see its controls, and follow its issuer’s reserve reports where RWA Lens links them.
        </p>
      ) : null}
      {deploying ? <DeployDialog mint={deploying.asset.mint} pool={deploying.pool} onClose={() => setDeploying(null)} /> : null}
    </section>
  );
}
