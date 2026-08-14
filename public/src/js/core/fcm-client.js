/**
 * Register FCM token with existing service worker when VAPID is configured.
 */
(function () {
  'use strict';

  let started = false;

  async function registerFcm() {
    if (started) return;
    started = true;
    if (typeof firebase === 'undefined' || !firebase.messaging) return;
    if (typeof apiFetch !== 'function') return;
    if (typeof Notification === 'undefined' || Notification.permission === 'denied') return;
    let vapid = '';
    try {
      const env = await apiFetch('/api/media-config', {
        method: 'POST',
        needAuth: true,
        body: { action: 'fcm_config' },
      });
      vapid = env?.data?.vapidKey || '';
    } catch (e) {
      return;
    }
    if (!vapid) return;
    try {
      if (Notification.permission === 'default') {
        /* don't prompt here — reuse existing onboarding permission */
        return;
      }
      const messaging = firebase.messaging();
      const reg = await navigator.serviceWorker.ready;
      const token = await messaging.getToken({ vapidKey: vapid, serviceWorkerRegistration: reg });
      if (!token) return;
      await apiFetch('/api/media-config', {
        method: 'POST',
        needAuth: true,
        body: { action: 'fcm_register', token },
      });
    } catch (e) {
      console.warn('[fcm-client]', e?.message || e);
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
})();
