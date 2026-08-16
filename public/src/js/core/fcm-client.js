/**
 * Register FCM token with the existing service worker when VAPID is configured.
 * Key is served from POST /api/media-config { action: 'fcm_config' } (FCM_VAPID_KEY).
 */
(function () {
  'use strict';

  let inFlight = false;
  let registeredToken = '';

  async function registerFcm() {
    if (inFlight) return;
    if (typeof firebase === 'undefined' || !firebase.messaging) return;
    if (typeof apiFetch !== 'function') return;
    if (typeof Notification === 'undefined' || Notification.permission === 'denied') return;
    if (Notification.permission !== 'granted') return;

    inFlight = true;
    try {
      const env = await apiFetch('/api/media-config', {
        method: 'POST',
        needAuth: true,
        body: { action: 'fcm_config' },
      });
      const vapid = env?.data?.vapidKey || '';
      if (!vapid) return;

      const messaging = firebase.messaging();
      const reg = await navigator.serviceWorker.ready;
      const token = await messaging.getToken({ vapidKey: vapid, serviceWorkerRegistration: reg });
      if (!token || token === registeredToken) return;
      await apiFetch('/api/media-config', {
        method: 'POST',
        needAuth: true,
        body: { action: 'fcm_register', token },
      });
      registeredToken = token;
    } catch (e) {
      console.warn('[fcm-client]', e?.message || e);
    } finally {
      inFlight = false;
    }
  }

  function boot() {
    if (typeof ChaupaalEnv !== 'undefined' && ChaupaalEnv.whenAuthReady) {
      ChaupaalEnv.whenAuthReady(12000)
        .then((u) => {
          if (u) registerFcm();
        })
        .catch(() => {});
    } else {
      setTimeout(registerFcm, 4000);
    }
  }

  if (document.readyState === 'complete') boot();
  else window.addEventListener('load', boot);

  window.registerChaupaalFcm = registerFcm;
})();
