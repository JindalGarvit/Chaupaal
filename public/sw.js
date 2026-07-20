const CACHE = 'chaupaal-v31';
const ASSETS = ['/', '/index.html', '/icon.png', '/splash.png', '/vendor/chess.js',
  'https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@500;700&family=Inter:wght@400;500;600;700&display=swap'];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(ASSETS).catch(()=>{})));
  self.skipWaiting();
});

self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(k=>k!==CACHE).map(k=>caches.delete(k)))));
  self.clients.claim();
});

self.addEventListener('fetch', e => {
  if(e.request.method !== 'GET') return;
  if(e.request.url.includes('/api/') || e.request.url.includes('firebase')) return;

  // Deep links / PWA navigations: always serve the SPA shell
  if(e.request.mode === 'navigate'){
    e.respondWith(
      fetch('/index.html').then(res => res.ok ? res : caches.match('/index.html'))
        .catch(() => caches.match('/index.html'))
    );
    return;
  }

  e.respondWith(
    caches.match(e.request).then(cached => {
      if(cached) return cached;
      return fetch(e.request).then(res => {
        if(res.ok && e.request.url.startsWith('https://fonts')){
          const clone = res.clone();
          caches.open(CACHE).then(c => c.put(e.request, clone));
        }
        return res;
      }).catch(() => caches.match('/index.html'));
    })
  );
});

self.addEventListener('push', e => {
  const data = e.data?.json() || {title:'Chaupaal 🪑', body:'Something new is waiting for you!'};
  e.waitUntil(self.registration.showNotification(data.title, {body:data.body, icon:'/icon.png', badge:'/icon.png', data:data.url||'/'}));
});

self.addEventListener('notificationclick', e => {
  e.notification.close();
  e.waitUntil(clients.openWindow(e.notification.data||'/'));
});
