const CACHE = 'chaupaal-v49';
const ASSETS = [
  '/index.html',
  '/icon.png',
  '/splash.png',
  '/vendor/chess.js',
  'https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@500;700&family=Inter:wght@400;500;600;700&display=swap',
];

function isHtmlShell(request) {
  if (request.mode === 'navigate' || request.destination === 'document') return true;
  try {
    const path = new URL(request.url).pathname;
    return path === '/' || path === '/index.html' || path.endsWith('/index.html');
  } catch (e) {
    return false;
  }
}

function networkFirstShell(request) {
  return fetch(request)
    .then((res) => {
      if (res && res.ok) {
        const clone = res.clone();
        caches.open(CACHE).then((c) => c.put('/index.html', clone)).catch(() => {});
        return res;
      }
      return caches.match('/index.html').then((cached) => cached || res);
    })
    .catch(() => caches.match('/index.html'));
}

self.addEventListener('install', (e) => {
  e.waitUntil(
    caches
      .open(CACHE)
      .then((c) => c.addAll(ASSETS).catch(() => {}))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    (async () => {
      const keys = await caches.keys();
      // Drop every cache that is not this version (v43–v46/etc).
      await Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)));
      await self.clients.claim();
      const windows = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
      await Promise.all(
        windows.map(async (client) => {
          try {
            client.postMessage({ type: 'SW_ACTIVATED', cache: CACHE });
          } catch (err) {}
          // Force re-navigation so installs that never got the update banner still
          // pick up a fresh HTML shell (covers pre-v47 clients with no message listener).
          if (typeof client.navigate === 'function') {
            try {
              await client.navigate(client.url);
            } catch (err) {}
          }
        })
      );
    })()
  );
});

self.addEventListener('fetch', (e) => {
  if (e.request.method !== 'GET') return;
  if (e.request.url.includes('/api/') || e.request.url.includes('firebase')) return;

  // HTML shell: always network-first (cache only as offline fallback).
  // Cache-first here leaves PWAs on a stale index.html that points at old ?v= assets.
  if (isHtmlShell(e.request)) {
    e.respondWith(networkFirstShell(e.request));
    return;
  }

  e.respondWith(
    caches.match(e.request).then((cached) => {
      const network = fetch(e.request)
        .then((res) => {
          if (res && res.ok && e.request.url.startsWith('https://fonts')) {
            const clone = res.clone();
            caches.open(CACHE).then((c) => c.put(e.request, clone)).catch(() => {});
          }
          return res;
        })
        // Never substitute index.html for JS/CSS — that parses as a SyntaxError and blanks the app.
        .catch(() => cached || Response.error());

      // Stale-while-revalidate for fonts / precached assets; otherwise prefer network.
      if (cached && e.request.url.startsWith('https://fonts')) return cached;
      return network;
    })
  );
});

self.addEventListener('push', (e) => {
  const data = e.data?.json() || { title: 'Chaupaal 🪑', body: 'Something new is waiting for you!' };
  e.waitUntil(
    self.registration.showNotification(data.title, {
      body: data.body,
      icon: '/icon.png',
      badge: '/icon.png',
      data: data.url || '/',
    })
  );
});

self.addEventListener('notificationclick', (e) => {
  e.notification.close();
  e.waitUntil(clients.openWindow(e.notification.data || '/'));
});
