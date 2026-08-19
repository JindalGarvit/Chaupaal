const CACHE = 'chaupaal-v814d77';
const ASSETS = [
  '/index.html',
  '/icon-charpai-v2as.png',
  '/icon-192-charpai-v2as.png',
  '/icon-512-charpai-v2as.png',
  '/icon-maskable-512-charpai-v2as.png',
  '/apple-touch-icon-charpai-v2as.png',
  '/brand/chaupaal-mark-charpai-v2as.png',
  '/brand/chaupaal-mark-32-charpai-v2as.png',
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
  // Never intercept media — SW re-fetch breaks cross-origin <audio>/<video> on some browsers
  const dest = e.request.destination;
  if (dest === 'audio' || dest === 'video' || dest === 'track' || dest === 'mediastream') return;
  try {
    const host = new URL(e.request.url).hostname;
    if (
      host.endsWith('saavncdn.com') ||
      host.endsWith('itunes.apple.com') ||
      host.endsWith('mzstatic.com') ||
      host.includes('saavncdn') ||
      host.includes('itunes-assets')
    ) {
      return;
    }
  } catch (err) {}

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
  let payload = {};
  try {
    payload = e.data ? e.data.json() : {};
  } catch (err) {
    payload = {};
  }
  const title = payload.notification?.title || payload.data?.title || payload.title || 'Chaupaal';
  const body = payload.notification?.body || payload.data?.body || payload.body || '';
  const url = payload.fcmOptions?.link || payload.data?.url || payload.url || '/';
  e.waitUntil(
    self.registration.showNotification(title, {
      body,
      icon: '/icon-charpai-v2as.png',
      badge: '/icon-charpai-v2as.png',
      data: url,
    })
  );
});

self.addEventListener('notificationclick', (e) => {
  e.notification.close();
  e.waitUntil(clients.openWindow(e.notification.data || '/'));
});
