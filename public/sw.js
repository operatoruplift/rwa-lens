/* RWA Lens caches only public static assets and an offline notice. RPC reads,
 * metadata, saved reports and sign-in responses never enter Cache Storage. */
const CACHE = 'rwa-lens-public-v1';
const STATIC_PATHS = ['/_next/static/', '/icons/', '/brand/'];
const STATIC_FILES = new Set(['/favicon.ico', '/icon.svg', '/apple-icon.png']);
const OFFLINE_HTML = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover"><title>RWA Lens is offline</title><style>body{margin:0;min-height:100vh;display:grid;place-items:center;font-family:system-ui,sans-serif;background:#f6f7fb;color:#101a3a;padding:env(safe-area-inset-top) env(safe-area-inset-right) env(safe-area-inset-bottom) env(safe-area-inset-left)}main{max-width:28rem;padding:2rem;text-align:center}h1{font-size:1.4rem}p{color:#46516e;line-height:1.5}a{color:#5b5ce2}</style></head><body><main><h1>You’re offline.</h1><p>RWA Lens reads live Solana state, so inspection needs a connection. Reconnect and <a href="/rwa">open the inspector</a> again.</p></main></body></html>`;

function isStatic(url) {
  return url.origin === self.location.origin && (STATIC_FILES.has(url.pathname) || STATIC_PATHS.some((path) => url.pathname.startsWith(path)));
}

self.addEventListener('install', (event) => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE);
    await cache.put('/__offline', new Response(OFFLINE_HTML, { headers: { 'Content-Type': 'text/html; charset=utf-8' } }));
    await self.skipWaiting();
  })());
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter((key) => key.startsWith('rwa-lens-public-') && key !== CACHE).map((key) => caches.delete(key)));
    await self.clients.claim();
  })());
});

self.addEventListener('fetch', (event) => {
  const request = event.request;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;
  if (request.mode === 'navigate') {
    // Documents are always network-first; the offline notice is the only fallback.
    event.respondWith(fetch(request).catch(async () => (await caches.match('/__offline', { cacheName: CACHE })) || new Response('RWA Lens is offline.', { status: 503 })));
    return;
  }
  if (isStatic(url)) {
    // Hashed Next chunks and icons are immutable: cache on first use.
    event.respondWith((async () => {
      const cached = await caches.match(request, { cacheName: CACHE });
      if (cached) return cached;
      const response = await fetch(request);
      if (response.ok && response.type === 'basic') { const cache = await caches.open(CACHE); cache.put(request, response.clone()).catch(() => {}); }
      return response;
    })());
  }
});
