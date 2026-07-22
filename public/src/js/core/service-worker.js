// ===================== SERVICE WORKER =====================
(function () {
  if (!('serviceWorker' in navigator)) return;

  const SW_CACHE_KEY = 'chaupaal_sw_cache';
  let updateBannerEl = null;
  let reloading = false;

  function showUpdateBanner() {
    if (updateBannerEl || !document.body) return;
    const el = document.createElement('button');
    el.type = 'button';
    el.id = 'chaupaalSwUpdate';
    el.setAttribute('data-nav-ignore', '1');
    el.textContent = 'New version available — tap to reload';
    el.style.cssText =
      'position:fixed;left:12px;right:12px;bottom:calc(12px + env(safe-area-inset-bottom,0px));z-index:99999;' +
      'padding:14px 16px;border:none;border-radius:14px;background:#1a1a2e;color:#fff;' +
      'font-family:Space Grotesk,Inter,sans-serif;font-weight:700;font-size:14px;cursor:pointer;' +
      'box-shadow:0 8px 28px rgba(0,0,0,.28);';
    el.addEventListener('click', () => {
      reloading = true;
      window.location.reload();
    });
    document.body.appendChild(el);
    updateBannerEl = el;
  }

  function onNewCache(cacheName) {
    if (!cacheName || reloading) return;
    let prev = null;
    try {
      prev = localStorage.getItem(SW_CACHE_KEY);
    } catch (e) {}
    try {
      localStorage.setItem(SW_CACHE_KEY, cacheName);
    } catch (e) {}

    // Version change → one reload so the HTML shell + assets rematch.
    if (prev && prev !== cacheName) {
      const gate = 'chaupaal_sw_reload_' + cacheName;
      try {
        if (sessionStorage.getItem(gate)) {
          showUpdateBanner();
          return;
        }
        sessionStorage.setItem(gate, '1');
      } catch (e) {}
      reloading = true;
      window.location.reload();
      return;
    }

    // Same version (or first install): surface a soft prompt if an update is waiting.
  }

  navigator.serviceWorker.addEventListener('message', (event) => {
    const data = event.data || {};
    if (data.type === 'SW_ACTIVATED' && data.cache) onNewCache(data.cache);
  });

  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (reloading) return;
    showUpdateBanner();
  });

  window.addEventListener('load', () => {
    navigator.serviceWorker
      .register('/sw.js')
      .then((reg) => {
        console.log('SW registered');
        if (reg.waiting) showUpdateBanner();
        reg.addEventListener('updatefound', () => {
          const installing = reg.installing;
          if (!installing) return;
          installing.addEventListener('statechange', () => {
            if (installing.state === 'installed' && navigator.serviceWorker.controller) {
              showUpdateBanner();
            }
          });
        });
        setInterval(() => {
          try {
            reg.update();
          } catch (e) {}
        }, 5 * 60 * 1000);
      })
      .catch(() => {});
  });
})();
