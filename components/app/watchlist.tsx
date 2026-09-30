'use client';

import Link from 'next/link';
import { useId, useState, useSyncExternalStore, type FormEvent } from 'react';
import { ArrowUpRight, Bookmark, Check, Plus, Trash2 } from 'lucide-react';
import { MAX_WATCHLIST_ITEMS, watchlistStore, type WatchlistSnapshot } from '@/lib/rwa/watchlist';
import styles from './watchlist.module.css';

function useWatchlist() {
  return useSyncExternalStore(watchlistStore.subscribe, watchlistStore.getSnapshot, watchlistStore.getServerSnapshot);
}

function storageNotice(status: WatchlistSnapshot['status']) {
  if (status === 'unavailable') return 'Device storage is unavailable. Changes cannot be saved. You can still inspect any mint.';
  if (status === 'invalid') return 'This device’s saved list could not be read. Clear the saved list to start again.';
  return null;
}

export function WatchlistButton({ mint, symbol, name }: { mint: string; symbol?: string; name?: string }) {
  const snapshot = useWatchlist();
  const [message, setMessage] = useState<string | null>(null);
  const saved = snapshot.items.some(item => item.mint === mint.trim());
  const notice = snapshot.status === 'unavailable' ? storageNotice(snapshot.status) : message ?? storageNotice(snapshot.status);
  function toggle() {
    const result = saved ? watchlistStore.remove(mint) : watchlistStore.add({ mint, ...(symbol?.trim() ? { symbol } : {}), ...(name?.trim() ? { name } : {}) });
    setMessage(result.ok ? null : result.message);
  }
  return <div className={styles.buttonGroup}>
    <button type="button" className={styles.saveButton} onClick={toggle} aria-pressed={saved} disabled={snapshot.status === 'loading'} aria-label={saved ? 'Remove from watchlist' : 'Save to watchlist'}>
      {saved ? <Check size={15} aria-hidden="true" /> : <Bookmark size={15} aria-hidden="true" />}{saved ? 'Saved on this device' : 'Save to watchlist'}
    </button>
    {notice ? <p className={styles.notice} role="status">{notice} {snapshot.status === 'invalid' ? <Link href="/watchlist">Open watchlist</Link> : null}</p> : null}
  </div>;
}

export function WatchlistView() {
  const snapshot = useWatchlist();
  const [mint, setMint] = useState('');
  const [message, setMessage] = useState<string | null>(null);
  const mintId = useId();
  const messageId = useId();
  const notice = snapshot.status === 'unavailable' ? storageNotice(snapshot.status) : message ?? storageNotice(snapshot.status);

  function add(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const result = watchlistStore.add({ mint });
    if (result.ok) { setMint(''); setMessage('Mint saved on this device.'); }
    else setMessage(result.message);
  }
  function remove(address: string) {
    const result = watchlistStore.remove(address);
    setMessage(result.ok ? 'Mint removed from this device.' : result.message);
  }
  function clearInvalid() {
    const result = watchlistStore.clear();
    setMessage(result.ok ? 'The saved list was cleared. Add a mint to start again.' : result.message);
  }

  return <section className={styles.watchlist} aria-label="Device watchlist">
    <div className={styles.intro}>
      <div><p className={styles.eyebrow}><Bookmark size={14} aria-hidden="true" />SAVED ON THIS DEVICE</p><h2>Your next look starts here.</h2><p>Keep public mint addresses close. Open a fresh inspection whenever you return.</p></div>
      <span className={styles.count}>{snapshot.items.length}<span> / {MAX_WATCHLIST_ITEMS} saved</span></span>
    </div>
    <form className={styles.form} onSubmit={add}>
      <div><label htmlFor={mintId}>Add a Solana mint</label><input id={mintId} value={mint} onChange={event => { setMint(event.target.value); setMessage(null); }} placeholder="Paste a mint address" maxLength={64} spellCheck={false} autoCapitalize="none" autoComplete="off" aria-describedby={notice ? messageId : undefined} /></div>
      <button type="submit" disabled={!mint.trim() || snapshot.status === 'loading'}><Plus size={16} aria-hidden="true" />Save mint</button>
    </form>
    {notice ? <div id={messageId} className={styles.notice} role="status">{notice} {snapshot.status === 'invalid' ? <button type="button" className={styles.clearButton} onClick={clearInvalid}>Clear saved list</button> : null}</div> : null}
    {snapshot.status === 'loading' ? <p className={styles.loading} role="status">Opening your device watchlist…</p> : snapshot.items.length ? <div className={styles.grid}>
      {snapshot.items.map(item => <article className={styles.card} key={item.mint}>
        <div className={styles.cardTop}><span className={styles.monogram}>{item.symbol?.slice(0, 2) ?? <Bookmark size={19} aria-hidden="true" />}</span><span className={styles.network}>SOLANA MAINNET</span></div>
        <h3>{item.symbol ?? 'Saved mint'}</h3><p className={styles.name}>{item.name ?? 'Open the inspector for token identity and controls.'}</p>
        <p className={styles.address}>{item.mint}</p>
        <p className={styles.savedAt}>Saved <time dateTime={item.savedAt}>{new Date(item.savedAt).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' })}</time></p>
        <div className={styles.cardActions}><Link href={`/rwa?mint=${encodeURIComponent(item.mint)}`}>Open inspector<ArrowUpRight size={16} aria-hidden="true" /></Link><button type="button" onClick={() => remove(item.mint)} aria-label={`Remove ${item.symbol ?? item.mint} from watchlist`}><Trash2 size={15} aria-hidden="true" /><span>Remove</span></button></div>
      </article>)}
    </div> : <div className={styles.empty}><span className={styles.emptyIcon}><Bookmark size={28} aria-hidden="true" /></span><h3>A place for assets you follow.</h3><p>Save a mint above or add one after inspecting a token. Your list stays in this browser.</p><Link href="/yield">Explore assets<ArrowUpRight size={16} aria-hidden="true" /></Link></div>}
    <p className={styles.footnote}>Only public mint addresses, names, symbols and save times are stored. Your watchlist stays on this device and clears when you clear browser data. No wallet connection needed.</p>
  </section>;
}
