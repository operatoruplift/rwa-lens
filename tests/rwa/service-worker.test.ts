import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import { describe, expect, it, vi } from 'vitest';

import nextConfig from '@/next.config';

const SOURCE = readFileSync(new URL('../../public/sw.js', import.meta.url), 'utf8');
const ORIGIN = 'https://rwalens.test';
/** The release the page registered the worker with, as mobile-support.tsx does: sw.js?v=<release>. */
const RELEASE = 'abc123def456';
const CURRENT_CACHE = `rwa-lens-public-${RELEASE}`;
const RELEASE_PATTERN = /^[A-Za-z0-9._-]{1,64}$/;
type RequestKey = string | { url: string };
type WorkerEvent = {
  request?: { url: string; method: string; mode: string };
  respondWith: (response: Promise<Response>) => void;
  waitUntil: (work: Promise<unknown>) => void;
};

function networkResponse(body: string, status = 200) {
  // Browser same-origin fetches have type "basic"; Node's constructed responses do not.
  return Object.defineProperty(new Response(body, { status }), 'type', { value: 'basic' });
}

function worker(scriptUrl = `${ORIGIN}/sw.js?v=${RELEASE}`) {
  const listeners = new Map<string, (event: WorkerEvent) => void>();
  const stores = new Map<string, Map<string, Response>>();
  const key = (request: RequestKey) => new URL(typeof request === 'string' ? request : request.url, ORIGIN).href;
  const store = (name: string) => {
    if (!stores.has(name)) stores.set(name, new Map());
    return stores.get(name)!;
  };
  // Writes land in whichever cache the worker opened, so the name it chose is observable.
  const put = vi.fn(async (name: string, request: RequestKey, response: Response) => { store(name).set(key(request), response.clone()); });
  const caches = {
    open: vi.fn(async (name: string) => ({ put: (request: RequestKey, response: Response) => put(name, request, response) })),
    match: vi.fn(async (request: RequestKey, options: { cacheName: string }) => store(options.cacheName).get(key(request))?.clone()),
    keys: vi.fn(async () => [...stores.keys()]),
    delete: vi.fn(async (name: string) => stores.delete(name)),
  };
  const fetcher = vi.fn(async () => networkResponse('fresh'));
  const claim = vi.fn(async () => undefined);
  runInNewContext(SOURCE, {
    self: { location: { origin: ORIGIN, href: scriptUrl }, addEventListener: (name: string, listener: (event: WorkerEvent) => void) => listeners.set(name, listener), skipWaiting: async () => undefined, clients: { claim } },
    caches, fetch: fetcher, URL, Response,
  });
  return {
    caches, fetcher, put, stores, claim,
    seed(path: string, body: string, name = CURRENT_CACHE) { store(name).set(key(path), new Response(body)); },
    async lifecycle(name: string) {
      let work: Promise<unknown> | undefined;
      listeners.get(name)!({ respondWith: () => undefined, waitUntil: value => { work = value; } });
      await work;
    },
    request(path: string, mode = 'cors', method = 'GET') {
      let response: Promise<Response> | undefined;
      listeners.get('fetch')!({ request: { url: key(path), mode, method }, respondWith: value => { response = value; }, waitUntil: () => undefined });
      return response;
    },
  };
}

describe('public service worker cache policy', () => {
  it.each(['/brand/hero.webp', '/icons/icon-512.png', '/icon.svg', '/favicon.ico', '/apple-icon.png'])('refreshes mutable asset %s and retains the new version offline', async path => {
    const sw = worker();
    sw.seed(path, 'old');
    expect(await (await sw.request(path))!.text()).toBe('fresh');
    expect(sw.fetcher).toHaveBeenCalledOnce();
    sw.fetcher.mockRejectedValueOnce(new Error('offline'));
    expect(await (await sw.request(path))!.text()).toBe('fresh');
  });

  it('reuses build-addressed Next assets without another network fetch', async () => {
    const sw = worker();
    sw.seed('/_next/static/chunks/abc123.js', 'chunk');
    expect(await (await sw.request('/_next/static/chunks/abc123.js'))!.text()).toBe('chunk');
    expect(sw.fetcher).not.toHaveBeenCalled();
  });

  it('returns successful assets even when storage reads or writes fail', async () => {
    const sw = worker();
    sw.caches.match.mockRejectedValue(new Error('storage unavailable'));
    sw.put.mockRejectedValue(new Error('quota exceeded'));
    expect(await (await sw.request('/_next/static/chunks/new.js'))!.text()).toBe('fresh');
    expect(await (await sw.request('/brand/hero.webp'))!.text()).toBe('fresh');
  });

  it('does not replace a removed asset with an old successful response', async () => {
    const sw = worker();
    sw.seed('/brand/removed.svg', 'old');
    sw.fetcher.mockResolvedValueOnce(networkResponse('missing', 404));
    expect((await sw.request('/brand/removed.svg'))!.status).toBe(404);
    expect(sw.put).not.toHaveBeenCalled();
  });

  it('shows an offline notice instead of caching documents or observations', async () => {
    const sw = worker();
    await sw.lifecycle('install');
    sw.put.mockClear();
    expect(await (await sw.request('/rwa', 'navigate'))!.text()).toBe('fresh');
    expect(sw.put).not.toHaveBeenCalled();
    sw.fetcher.mockRejectedValueOnce(new Error('offline'));
    expect(await (await sw.request('/rwa', 'navigate'))!.text()).toContain('You’re offline.');
  });

  it('leaves APIs, sign-in, external requests and writes to the network', () => {
    const sw = worker();
    for (const path of ['/api/rwa/inspect', '/api/rwa/screener', '/api/auth/challenge', '/api/rwa/reports', 'https://rpc.test/brand/account']) expect(sw.request(path)).toBeUndefined();
    expect(sw.request('/brand/hero.webp', 'cors', 'POST')).toBeUndefined();
    expect(sw.caches.match).not.toHaveBeenCalled();
    expect(sw.fetcher).not.toHaveBeenCalled();
  });

  it('deletes the caches of every earlier release on activate and preserves unrelated cache namespaces', async () => {
    const sw = worker();
    sw.seed('/brand/hero.webp', 'old', 'rwa-lens-public-v2');
    sw.seed('/_next/static/chunks/old-build.js', 'old', 'rwa-lens-public-v3');
    sw.seed('/_next/static/chunks/previous-release.js', 'old', 'rwa-lens-public-9f8e7d6c5b4a');
    sw.seed('/other', 'keep', 'other-app');
    await sw.lifecycle('install');
    await sw.lifecycle('activate');
    expect([...sw.stores.keys()]).toEqual(['other-app', CURRENT_CACHE]);
    expect(sw.claim).toHaveBeenCalledOnce();
  });

  it('names its cache after the release it was registered with, and falls back to one name for anything else', async () => {
    for (const [url, expected] of [
      [`${ORIGIN}/sw.js?v=2026.10.24-rc_1`, 'rwa-lens-public-2026.10.24-rc_1'],
      [`${ORIGIN}/sw.js`, 'rwa-lens-public-unversioned'],
      [`${ORIGIN}/sw.js?v=${'x'.repeat(65)}`, 'rwa-lens-public-unversioned'],
      [`${ORIGIN}/sw.js?v=../evil`, 'rwa-lens-public-unversioned'],
    ]) {
      const sw = worker(url);
      await sw.lifecycle('install');
      expect([...sw.stores.keys()]).toEqual([expected]);
    }
  });

  it('is given a release id by the build that the worker accepts as a cache name', () => {
    expect(nextConfig.env?.NEXT_PUBLIC_RELEASE_ID).toMatch(RELEASE_PATTERN);
  });
});
