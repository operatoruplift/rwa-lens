import { z } from 'zod';
import { addressSchema } from './schema';

export const WATCHLIST_STORAGE_KEY = 'rwa-lens:watchlist:v1';
export const WATCHLIST_CHANGE_EVENT = 'rwa-lens:watchlist-changed';
export const MAX_WATCHLIST_ITEMS = 20;
const MAX_STORED_LENGTH = 20_000;
const STORAGE_MESSAGE = 'Device storage is unavailable. Changes could not be saved. You can still inspect any mint.';
const INVALID_MESSAGE = 'This device’s saved list could not be read. Clear the saved list to start again.';

const inputSchema = z.object({
  mint: addressSchema,
  symbol: z.string().trim().min(1).max(40).optional(),
  name: z.string().trim().min(1).max(200).optional(),
}).strict();
export const watchlistItemSchema = inputSchema.extend({ savedAt: z.string().datetime() });
export const watchlistDocumentSchema = z.object({
  version: z.literal(1),
  items: z.array(watchlistItemSchema).max(MAX_WATCHLIST_ITEMS)
    .refine(items => new Set(items.map(item => item.mint)).size === items.length),
}).strict();
export type WatchlistItem = z.infer<typeof watchlistItemSchema>;
export type WatchlistSnapshot = { items: readonly WatchlistItem[]; status: 'loading' | 'ready' | 'unavailable' | 'invalid' };
export type WatchlistAction = { ok: true } | { ok: false; message: string };
const SERVER_SNAPSHOT: WatchlistSnapshot = { items: [], status: 'loading' };

type Dependencies = {
  storage: () => Pick<Storage, 'getItem' | 'setItem'>;
  now: () => number;
  subscribe: (listener: () => void) => () => void;
  announce: () => void;
};
const browser: Dependencies = {
  storage: () => window.localStorage,
  now: Date.now,
  subscribe(listener) {
    const onStorage = (event: StorageEvent) => {
      if (event.key === WATCHLIST_STORAGE_KEY || event.key === null) listener();
    };
    window.addEventListener('storage', onStorage);
    window.addEventListener(WATCHLIST_CHANGE_EVENT, listener);
    return () => {
      window.removeEventListener('storage', onStorage);
      window.removeEventListener(WATCHLIST_CHANGE_EVENT, listener);
    };
  },
  announce: () => window.dispatchEvent(new Event(WATCHLIST_CHANGE_EVENT)),
};

/** Public mint bookmarks only. Storage is read lazily, never during server rendering. */
export function createWatchlistStore(deps: Dependencies = browser) {
  let snapshot = SERVER_SNAPSHOT;
  let lastRaw: string | null | undefined;
  let readFailed = false;
  let writeFailed = false;

  function getSnapshot(): WatchlistSnapshot {
    let raw: string | null;
    try { raw = deps.storage().getItem(WATCHLIST_STORAGE_KEY); readFailed = false; }
    catch {
      readFailed = true;
      if (snapshot.status !== 'unavailable') snapshot = { items: snapshot.items, status: 'unavailable' };
      return snapshot;
    }
    if (raw === lastRaw && snapshot.status !== 'loading'
      && (snapshot.status === 'invalid' || (writeFailed ? snapshot.status === 'unavailable' : snapshot.status !== 'unavailable'))) return snapshot;
    lastRaw = raw;
    try {
      if (raw !== null && raw.length > MAX_STORED_LENGTH) throw new Error('oversized');
      const document = watchlistDocumentSchema.parse(raw === null ? { version: 1, items: [] } : JSON.parse(raw));
      snapshot = { items: document.items, status: writeFailed ? 'unavailable' : 'ready' };
    } catch { snapshot = { items: [], status: 'invalid' }; }
    return snapshot;
  }

  function write(items: readonly WatchlistItem[]): WatchlistAction {
    try {
      deps.storage().setItem(WATCHLIST_STORAGE_KEY, JSON.stringify({ version: 1, items }));
      writeFailed = false;
    } catch {
      writeFailed = true;
      lastRaw = undefined;
      deps.announce();
      return { ok: false, message: STORAGE_MESSAGE };
    }
    lastRaw = undefined;
    deps.announce();
    return { ok: true };
  }

  function editable(): WatchlistAction {
    getSnapshot();
    if (readFailed) return { ok: false, message: STORAGE_MESSAGE };
    if (snapshot.status === 'invalid') return { ok: false, message: INVALID_MESSAGE };
    return { ok: true };
  }

  return {
    getSnapshot,
    getServerSnapshot: () => SERVER_SNAPSHOT,
    subscribe: deps.subscribe,
    add(input: unknown): WatchlistAction {
      const parsed = inputSchema.safeParse(input);
      if (!parsed.success) return { ok: false, message: 'Enter a valid Solana mint address and a short name or symbol.' };
      const allowed = editable(); if (!allowed.ok) return allowed;
      if (snapshot.items.some(item => item.mint === parsed.data.mint)) return { ok: true };
      if (snapshot.items.length >= MAX_WATCHLIST_ITEMS) return { ok: false, message: 'Your watchlist holds up to 20 mints. Remove one before adding another.' };
      return write([{ ...parsed.data, savedAt: new Date(deps.now()).toISOString() }, ...snapshot.items]);
    },
    remove(mint: string): WatchlistAction {
      const parsed = addressSchema.safeParse(mint);
      if (!parsed.success) return { ok: false, message: 'That mint address is invalid.' };
      const allowed = editable(); if (!allowed.ok) return allowed;
      return write(snapshot.items.filter(item => item.mint !== parsed.data));
    },
    clear: (): WatchlistAction => write([]),
  };
}

export const watchlistStore = createWatchlistStore();
