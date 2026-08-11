const CACHE_NAME = 'pocket-spatial-runtime-v040c';
const META_URL = new URL('__pocket_release__.json', self.registration.scope).href;

function mimeFor(path) {
  const lower = path.toLowerCase();
  if (lower.endsWith('.js') || lower.endsWith('.mjs')) return 'text/javascript; charset=utf-8';
  if (lower.endsWith('.css')) return 'text/css; charset=utf-8';
  if (lower.endsWith('.html')) return 'text/html; charset=utf-8';
  if (lower.endsWith('.svg')) return 'image/svg+xml; charset=utf-8';
  if (lower.endsWith('.json')) return 'application/json; charset=utf-8';
  if (lower.endsWith('.webmanifest')) return 'application/manifest+json; charset=utf-8';
  if (lower.endsWith('.md')) return 'text/markdown; charset=utf-8';
  return 'application/octet-stream';
}

async function getRelease() {
  const cache = await caches.open(CACHE_NAME);
  const response = await cache.match(META_URL);
  if (!response) return null;
  try { return (await response.json()).release || null; } catch (_) { return null; }
}

self.addEventListener('install', (event) => {
  event.waitUntil(self.skipWaiting());
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter((key) => key.startsWith('pocket-spatial-runtime-') && key !== CACHE_NAME).map((key) => caches.delete(key)));
    await self.clients.claim();
  })());
});

self.addEventListener('message', (event) => {
  const data = event.data || {};
  const port = event.ports?.[0];
  if (data.type === 'GET_RELEASE') {
    event.waitUntil(getRelease().then((release) => port?.postMessage({ ok: true, release })));
    return;
  }
  if (data.type !== 'INSTALL_RELEASE') return;
  event.waitUntil((async () => {
    try {
      const cache = await caches.open(CACHE_NAME);
      const oldRequests = await cache.keys();
      await Promise.all(oldRequests.map((request) => cache.delete(request)));
      for (const file of data.files || []) {
        const url = new URL(String(file.path).replace(/^\.\//, ''), self.registration.scope).href;
        const response = new Response(file.bytes, {
          headers: {
            'Content-Type': mimeFor(file.path),
            'Cache-Control': 'no-store',
            'X-Pocket-Release': data.release || '',
          },
        });
        await cache.put(url, response);
      }
      await cache.put(META_URL, new Response(JSON.stringify({ release: data.release, installedAt: Date.now() }), {
        headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
      }));
      port?.postMessage({ ok: true, release: data.release });
    } catch (error) {
      port?.postMessage({ ok: false, message: error?.message || 'Cache installation failed.' });
    }
  })());
});

self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return;
  const url = new URL(event.request.url);
  if (url.origin !== self.location.origin) return;

  event.respondWith((async () => {
    const cache = await caches.open(CACHE_NAME);
    const scope = new URL(self.registration.scope);
    const isRoot = url.pathname === scope.pathname || url.pathname === `${scope.pathname}index.html`;

    // The bootstrap/root page must always come from the network unless the URL
    // explicitly requests the installed runtime. The previous worker cached the
    // runtime index at the root URL and accidentally served it for every query,
    // preventing new bootstrap fixes from ever becoming visible on Safari.
    if (isRoot) {
      if (url.searchParams.get('runtime') === '040') {
        const runtimeRoot = await cache.match(new URL('index.html', scope).href);
        if (runtimeRoot) return runtimeRoot;
      }
      return fetch(event.request, { cache: 'no-store' });
    }

    const clean = new URL(url.href);
    clean.search = '';
    const cached = await cache.match(clean.href);
    if (cached) return cached;
    return fetch(event.request);
  })());
});
