// ===================== SERVICE WORKER =====================
(function () {
  const SW_CACHE_KEY = 'chaupaal_sw_cache';
  const SW_FAIL_KEY = 'chaupaal_sw_reg_fail_shown';
  let updateBannerEl = null;
  let offlineBannerEl = null;
  let reloading = false;

  function reportSwFailure(message, stack) {
    try {
      if (typeof reportClientError === 'function') {
        reportClientError({
          feature: 'service_worker',
          message: String(message || 'SW registration failed').slice(0, 500),
          stack: String(stack || '').slice(0, 1200),
          screen: 'boot',
        });
      } else {
        console.warn('[sw]', message, stack || '');
      }
    } catch (e) {}
  }

  function showUpdateBanner() {
    if (updateBannerEl || !document.body) return;
    hideOfflineBanner();
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

  /** Subtle, dismissible notice — offline/PWA features are not active. */
  function showOfflineBanner(reason) {
    if (offlineBannerEl || updateBannerEl || !document.body) return;
    try {
      if (sessionStorage.getItem(SW_FAIL_KEY) === '1') return;
      sessionStorage.setItem(SW_FAIL_KEY, '1');
    } catch (e) {}

    const el = document.createElement('div');
    el.id = 'chaupaalSwOffline';
    el.setAttribute('data-nav-ignore', '1');
    el.setAttribute('role', 'status');
    el.style.cssText =
      'position:fixed;left:12px;right:12px;bottom:calc(12px + env(safe-area-inset-bottom,0px));z-index:99990;' +
      'display:flex;align-items:center;gap:10px;padding:12px 14px;border-radius:14px;' +
      'background:rgba(27,31,59,.94);color:#fff;font:600 13px/1.35 Inter,system-ui,sans-serif;' +
      'box-shadow:0 8px 24px rgba(0,0,0,.22);';
    el.innerHTML =
      '<span style="flex:1;min-width:0">Offline &amp; install features unavailable right now</span>' +
      '<button type="button" data-sw-dismiss aria-label="Dismiss" style="border:none;background:rgba(255,255,255,.12);color:#fff;border-radius:10px;padding:8px 10px;font-weight:700;cursor:pointer;">OK</button>';
    el.querySelector('[data-sw-dismiss]')?.addEventListener('click', hideOfflineBanner);
    document.body.appendChild(el);
    offlineBannerEl = el;
    if (reason) console.warn('[sw] offline features inactive:', reason);
  }

  function hideOfflineBanner() {
    try {
      offlineBannerEl?.remove();
    } catch (e) {}
    offlineBannerEl = null;
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
  }

  function registerWhenReady() {
    if (!('serviceWorker' in navigator)) {
      reportSwFailure('serviceWorker unsupported');
      showOfflineBanner('unsupported');
      return;
    }

    navigator.serviceWorker.addEventListener('message', (event) => {
      const data = event.data || {};
      if (data.type === 'SW_ACTIVATED' && data.cache) onNewCache(data.cache);
    });

    navigator.serviceWorker.addEventListener('controllerchange', () => {
      if (reloading) return;
      showUpdateBanner();
    });

    navigator.serviceWorker
      .register('/sw.js?v=54')
      .then((reg) => {
        console.log('SW registered');
        hideOfflineBanner();
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
      .catch((err) => {
        reportSwFailure(err?.message || String(err), err?.stack || '');
        showOfflineBanner(err?.message || 'register failed');
      });
  }

  if (document.readyState === 'complete') {
    registerWhenReady();
  } else {
    window.addEventListener('load', registerWhenReady);
  }
})();
