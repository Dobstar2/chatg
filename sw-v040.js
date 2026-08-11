const RESET_TARGET = new URL('recovery-direct-030.html?recovered=sw-v040-kill', self.registration.scope).href;

self.addEventListener('install', (event) => {
  event.waitUntil(self.skipWaiting());
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    try {
      const keys = await caches.keys();
      await Promise.all(keys.filter((key) => key.startsWith('pocket-spatial-runtime-')).map((key) => caches.delete(key)));
    } catch (_) {}

    try {
      const clients = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
      await self.registration.unregister();
      await Promise.all(clients.map(async (client) => {
        try { await client.navigate(RESET_TARGET); } catch (_) {}
      }));
    } catch (_) {
      try { await self.registration.unregister(); } catch (_) {}
    }
  })());
});

self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return;
  event.respondWith(fetch(event.request, { cache: 'no-store' }));
});
