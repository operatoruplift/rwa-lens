import { describe, expect, it, vi } from 'vitest';
import bs58 from 'bs58';
import { createWatchlistStore, MAX_WATCHLIST_ITEMS, WATCHLIST_STORAGE_KEY, watchlistDocumentSchema } from '@/lib/rwa/watchlist';

const USDY = 'A1KLoBrKBde8Ty9qtNQUtq3C2ortoC3u7twggz7sEto6';
const USDC = 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v';
const savedAt = '2026-09-30T12:00:00.000Z';

function harness(initial: string | null = null) {
  let raw = initial;
  let readBlocked = false;
  let writeBlocked = false;
  const listeners = new Set<() => void>();
  const announce = () => listeners.forEach(listener => listener());
  const storage = {
    getItem: vi.fn(() => { if (readBlocked) throw new Error('blocked'); return raw; }),
    setItem: vi.fn((_key: string, value: string) => { if (writeBlocked) throw new Error('quota'); raw = value; }),
  };
  const store = createWatchlistStore({
    storage: () => storage, now: () => Date.parse(savedAt), announce,
    subscribe: listener => { listeners.add(listener); return () => { listeners.delete(listener); }; },
  });
  return { store, storage, raw: () => raw, blockRead: () => { readBlocked = true; }, blockWrite: (blocked: boolean) => { writeBlocked = blocked; }, externalWrite: (value: string | null) => { raw = value; announce(); } };
}

describe('device watchlist', () => {
  it('hydrates from a stable empty server snapshot without reading browser storage on the server', () => {
    const { store, storage } = harness();
    expect(store.getServerSnapshot()).toEqual({ items: [], status: 'loading' });
    expect(store.getServerSnapshot()).toBe(store.getServerSnapshot());
    expect(storage.getItem).not.toHaveBeenCalled();
    expect(store.getSnapshot()).toEqual({ items: [], status: 'ready' });
    expect(store.getSnapshot()).toBe(store.getSnapshot());
  });

  it('persists only public mint metadata and the save time, then restores it', () => {
    const { store, storage, raw } = harness();
    expect(store.add({ mint: ` ${USDY} `, symbol: ' USDY ', name: 'Ondo U.S. Dollar Yield' })).toEqual({ ok: true });
    expect(storage.setItem).toHaveBeenCalledWith(WATCHLIST_STORAGE_KEY, expect.any(String));
    const saved = JSON.parse(raw()!);
    expect(saved).toEqual({ version: 1, items: [{ mint: USDY, symbol: 'USDY', name: 'Ondo U.S. Dollar Yield', savedAt }] });
    expect(watchlistDocumentSchema.safeParse(saved).success).toBe(true);
    expect(harness(raw()).store.getSnapshot().items).toEqual(saved.items);
  });

  it('rejects malformed addresses, wrong decoded lengths, and private fields before writing', () => {
    const { store, storage } = harness();
    for (const input of [{ mint: 'not-a-mint' }, { mint: '1'.repeat(33) }, { mint: USDY, owner: USDC }, { mint: USDY, holdings: '50' }, { mint: USDY, name: 'x'.repeat(201) }]) {
      expect(store.add(input).ok).toBe(false);
    }
    expect(storage.setItem).not.toHaveBeenCalled();
  });

  it('deduplicates by exact mint and does not renew the original save time', () => {
    const { store } = harness();
    store.add({ mint: USDY, symbol: 'USDY' });
    expect(store.add({ mint: USDY, symbol: 'replacement' })).toEqual({ ok: true });
    expect(store.getSnapshot().items).toEqual([{ mint: USDY, symbol: 'USDY', savedAt }]);
  });

  it('caps the list at twenty without discarding an existing entry', () => {
    const { store } = harness();
    const mints = Array.from({ length: MAX_WATCHLIST_ITEMS + 1 }, (_, index) => bs58.encode(Uint8Array.from({ length: 32 }, (_, byte) => byte === 31 ? index : 7)));
    mints.slice(0, MAX_WATCHLIST_ITEMS).forEach(mint => expect(store.add({ mint }).ok).toBe(true));
    expect(store.add({ mint: mints[MAX_WATCHLIST_ITEMS] })).toMatchObject({ ok: false, message: expect.stringContaining('20') });
    expect(store.getSnapshot().items.map(item => item.mint)).toEqual(mints.slice(0, MAX_WATCHLIST_ITEMS).reverse());
    store.remove(mints[0]);
    expect(store.add({ mint: mints[MAX_WATCHLIST_ITEMS] }).ok).toBe(true);
  });

  it('notifies local subscribers and reads the latest tab state before removing an item', () => {
    const { store, externalWrite } = harness();
    const listener = vi.fn();
    const unsubscribe = store.subscribe(listener);
    store.add({ mint: USDY });
    expect(listener).toHaveBeenCalledTimes(1);
    externalWrite(JSON.stringify({ version: 1, items: [{ mint: USDY, savedAt }, { mint: USDC, savedAt }] }));
    expect(store.getSnapshot().items).toHaveLength(2);
    store.remove(USDY);
    expect(store.getSnapshot().items).toEqual([{ mint: USDC, savedAt }]);
    unsubscribe();
    const calls = listener.mock.calls.length;
    externalWrite(null);
    expect(listener).toHaveBeenCalledTimes(calls);
    expect(store.getSnapshot().items).toEqual([]);
  });

  it('reports storage access and quota failures without claiming unsaved changes succeeded', () => {
    const blocked = harness();
    blocked.blockRead();
    expect(blocked.store.getSnapshot()).toMatchObject({ status: 'unavailable', items: [] });
    expect(blocked.store.add({ mint: USDY }).ok).toBe(false);
    expect(blocked.storage.setItem).not.toHaveBeenCalled();

    const quota = harness();
    quota.store.add({ mint: USDY });
    quota.blockWrite(true);
    expect(quota.store.remove(USDY).ok).toBe(false);
    expect(quota.store.getSnapshot()).toMatchObject({ status: 'unavailable', items: [{ mint: USDY }] });
    quota.blockWrite(false);
    expect(quota.store.remove(USDY).ok).toBe(true);
    expect(quota.store.getSnapshot()).toEqual({ status: 'ready', items: [] });
  });

  it.each([
    '{broken',
    JSON.stringify({ version: 2, items: [] }),
    JSON.stringify({ version: 1, items: [{ mint: USDY, savedAt, owner: USDC }] }),
    JSON.stringify({ version: 1, items: [{ mint: USDY, savedAt }, { mint: USDY, savedAt }] }),
    JSON.stringify({ version: 1, items: [{ mint: USDY, savedAt: 'not-a-date' }] }),
    ' '.repeat(20_001),
  ])('does not trust or silently overwrite invalid stored data', raw => {
    const { store, storage } = harness(raw);
    expect(store.getSnapshot()).toEqual({ status: 'invalid', items: [] });
    expect(store.add({ mint: USDY }).ok).toBe(false);
    expect(storage.setItem).not.toHaveBeenCalled();
    expect(store.clear()).toEqual({ ok: true });
    expect(store.getSnapshot()).toEqual({ status: 'ready', items: [] });
  });

  it('keeps the snapshot stable when clearing invalid data also hits a storage failure', () => {
    const { store, blockWrite } = harness('{broken');
    blockWrite(true);
    expect(store.clear().ok).toBe(false);
    expect(store.getSnapshot()).toEqual({ status: 'invalid', items: [] });
    expect(store.getSnapshot()).toBe(store.getSnapshot());
  });
});
