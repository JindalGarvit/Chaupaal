/**
 * Growth G6 — calm PWA install affordance.
 *
 * Chromium: capture beforeinstallprompt → Settings row + soft sheet (not first paint).
 * iOS Safari: honest Add-to-Home-Screen how-to (no fake install button).
 * Standalone: never show install CTA.
 *
 * Timing (soft sheet): after a meaningful moment (day-0 fork done, quiz/game,
 * or return visit) + cooldown 7 days after dismiss; once per session max.
 * Always dismissible. Guests may install. Respect Quiet; skip during auth overlay.
 */
(function () {
  'use strict';

  const DISMISS_KEY = 'chaupaal_pwa_install_dismiss_v1';
  const ACCEPTED_KEY = 'chaupaal_pwa_install_accepted_v1';
  const SESSION_SOFT_KEY = 'chaupaal_pwa_soft_shown';
  const VISIT_KEY = 'chaupaal_pwa_visit_days';
  const COOLDOWN_MS = 7 * 24 * 60 * 60 * 1000;
  const SOFT_DELAY_MS = 12000;

  let deferredPrompt = null;
  let softTimer = null;
  let sheetEl = null;

  function env() {
    return typeof window.ChaupaalEnv !== 'undefined' ? window.ChaupaalEnv : null;
  }

  function isStandalone() {
    try {
      if (env()?.isStandalone) return !!env().isStandalone();
    } catch (e) {}
    try {
      return (
        window.matchMedia('(display-mode: standalone)').matches ||
        window.navigator.standalone === true
      );
    } catch (e) {
      return false;
    }
  }

  function isIOS() {
    try {
      if (env()?.isIOS) return !!env().isIOS();
    } catch (e) {}
    return /iphone|ipad|ipod/i.test(navigator.userAgent || '');
  }

  function isQuiet() {
    try {
      if (typeof window.quietMode !== 'undefined' && window.quietMode) return true;
      if (localStorage.getItem('chaupaal_quiet') === '1') return true;
    } catch (e) {}
    return false;
  }

  function authOpen() {
    try {
      const el = document.getElementById('authOverlay');
      return !!(el && !el.classList.contains('hidden'));
    } catch (e) {
      return false;
    }
  }

  function track(name) {
    try {
      if (typeof trackEvent === 'function') trackEvent(name, { surface: 'pwa_install' });
    } catch (e) {}
    try {
      const key = 'chaupaal_pwa_signal_' + name;
      const n = Number(localStorage.getItem(key) || 0) + 1;
      localStorage.setItem(key, String(n));
    } catch (e) {}
  }

  function dismissUntil() {
    try {
      return Number(localStorage.getItem(DISMISS_KEY) || 0) || 0;
    } catch (e) {
      return 0;
    }
  }

  function markDismissed() {
    try {
      localStorage.setItem(DISMISS_KEY, String(Date.now() + COOLDOWN_MS));
    } catch (e) {}
    track('install_dismissed');
  }

  function markAccepted() {
    try {
      localStorage.setItem(ACCEPTED_KEY, '1');
      localStorage.removeItem(DISMISS_KEY);
    } catch (e) {}
    track('install_accepted');
  }

  function cooldownActive() {
    return Date.now() < dismissUntil();
  }

  function recordVisitDay() {
    try {
      const day = new Date().toISOString().slice(0, 10);
      const raw = localStorage.getItem(VISIT_KEY);
      const days = raw ? JSON.parse(raw) : [];
      if (!Array.isArray(days)) return;
      if (!days.includes(day)) {
        days.push(day);
        while (days.length > 14) days.shift();
        localStorage.setItem(VISIT_KEY, JSON.stringify(days));
      }
    } catch (e) {}
  }

  function visitDayCount() {
    try {
      const days = JSON.parse(localStorage.getItem(VISIT_KEY) || '[]');
      return Array.isArray(days) ? days.length : 0;
    } catch (e) {
      return 0;
    }
  }

  function day0Done() {
    try {
      const keys = Object.keys(localStorage).filter((k) => k.indexOf('chaupaal_day0_fork_v1_') === 0);
      return keys.some((k) => localStorage.getItem(k) === '1');
    } catch (e) {
      return false;
    }
  }

  function playedSomething() {
    try {
      const today = new Date().toISOString().slice(0, 10);
      if (localStorage.getItem('chaupaal_akhbaar_played_' + today)) return true;
      if (localStorage.getItem('chaupaal_dangal_ever_played')) return true;
      if (localStorage.getItem('chaupaal_gotd_ever')) return true;
    } catch (e) {}
    return false;
  }

  function hasMeaningfulMoment() {
    return day0Done() || playedSomething() || visitDayCount() >= 2;
  }

  /**
   * @returns {'standalone'|'ready'|'ios'|'unavailable'}
   */
  function installState() {
    if (isStandalone()) return 'standalone';
    try {
      if (localStorage.getItem(ACCEPTED_KEY) === '1' && isStandalone()) return 'standalone';
    } catch (e) {}
    if (deferredPrompt) return 'ready';
    if (isIOS()) return 'ios';
    return 'unavailable';
  }

  function updateSettingsRow() {
    const row = document.getElementById('pwaInstallSettingsRow');
    const label = document.getElementById('pwaInstallSettingsLabel');
    const desc = document.getElementById('pwaInstallSettingsDesc');
    const btn = document.getElementById('pwaInstallSettingsBtn');
    if (!row || !label) return;

    const state = installState();
    row.hidden = false;
    if (state === 'standalone') {
      label.textContent = 'Installed';
      if (desc) desc.textContent = 'Chaupaal opens full screen from your home screen.';
      if (btn) {
        btn.disabled = true;
        btn.textContent = 'Done';
      }
      return;
    }
    if (state === 'ready') {
      label.textContent = 'Install Chaupaal';
      if (desc) desc.textContent = 'Faster open, full screen — optional.';
      if (btn) {
        btn.disabled = false;
        btn.textContent = 'Install';
      }
      return;
    }
    if (state === 'ios') {
      label.textContent = 'Add to Home Screen';
      if (desc) desc.textContent = 'Safari: Share → Add to Home Screen.';
      if (btn) {
        btn.disabled = false;
        btn.textContent = 'How to';
      }
      return;
    }
    label.textContent = 'Install Chaupaal';
    if (desc) desc.textContent = 'Available in Chrome or Edge when the browser offers it.';
    if (btn) {
      btn.disabled = true;
      btn.textContent = 'Later';
    }
  }

  function removeSheet() {
    try {
      sheetEl?.remove();
    } catch (e) {}
    sheetEl = null;
  }

  function showIosGuide() {
    removeSheet();
    if (!document.body) return;
    const el = document.createElement('div');
    el.id = 'pwaInstallSheet';
    el.className = 'pwa-install-sheet';
    el.setAttribute('role', 'dialog');
    el.setAttribute('aria-label', 'Add Chaupaal to Home Screen');
    el.innerHTML =
      '<div class="pwa-install-card">' +
      '<strong>Add Chaupaal to Home Screen</strong>' +
      '<p>On iPhone or iPad Safari:</p>' +
      '<ol>' +
      '<li>Tap the Share button</li>' +
      '<li>Scroll and tap <em>Add to Home Screen</em></li>' +
      '<li>Tap Add</li>' +
      '</ol>' +
      '<p class="pwa-install-note">Safari does not allow apps to install with one tap — this is Apple’s rule, not a Chaupaal limit.</p>' +
      '<button type="button" class="btn btn--primary btn--block" data-pwa-ok>Got it</button>' +
      '</div>';
    el.querySelector('[data-pwa-ok]')?.addEventListener('click', () => {
      removeSheet();
      markDismissed();
    });
    el.addEventListener('click', (e) => {
      if (e.target === el) {
        removeSheet();
        markDismissed();
      }
    });
    document.body.appendChild(el);
    sheetEl = el;
    track('install_ios_guide');
  }

  function showSoftSheet() {
    if (sheetEl || isStandalone() || isQuiet() || authOpen()) return;
    if (cooldownActive()) return;
    try {
      if (sessionStorage.getItem(SESSION_SOFT_KEY) === '1') return;
    } catch (e) {}

    const state = installState();
    if (state === 'standalone') return;
    if (state === 'unavailable') return;
    if (state === 'ready' && !deferredPrompt) return;

    removeSheet();
    if (!document.body) return;

    try {
      sessionStorage.setItem(SESSION_SOFT_KEY, '1');
    } catch (e) {}

    const el = document.createElement('div');
    el.id = 'pwaInstallSheet';
    el.className = 'pwa-install-sheet';
    el.setAttribute('role', 'dialog');
    el.setAttribute('aria-label', 'Install Chaupaal');

    if (state === 'ios') {
      el.innerHTML =
        '<div class="pwa-install-card">' +
        '<strong>Keep Chaupaal handy</strong>' +
        '<p>Add Chaupaal to your Home Screen for a faster, full-screen open.</p>' +
        '<button type="button" class="btn btn--primary btn--block" data-pwa-how>How to add</button>' +
        '<button type="button" class="btn btn--block" data-pwa-later>Not now</button>' +
        '</div>';
      el.querySelector('[data-pwa-how]')?.addEventListener('click', () => {
        removeSheet();
        showIosGuide();
      });
    } else {
      el.innerHTML =
        '<div class="pwa-install-card">' +
        '<strong>Install Chaupaal</strong>' +
        '<p>Faster open, full screen — optional. You can keep browsing either way.</p>' +
        '<button type="button" class="btn btn--primary btn--block" data-pwa-install>Install</button>' +
        '<button type="button" class="btn btn--block" data-pwa-later>Not now</button>' +
        '</div>';
      el.querySelector('[data-pwa-install]')?.addEventListener('click', () => {
        removeSheet();
        promptInstall();
      });
    }

    el.querySelector('[data-pwa-later]')?.addEventListener('click', () => {
      removeSheet();
      markDismissed();
    });
    el.addEventListener('click', (e) => {
      if (e.target === el) {
        removeSheet();
        markDismissed();
      }
    });
    document.body.appendChild(el);
    sheetEl = el;
    track('install_sheet_shown');
  }

  async function promptInstall() {
    const state = installState();
    if (state === 'ios') {
      showIosGuide();
      return { ok: false, reason: 'ios_guide' };
    }
    if (state === 'standalone') return { ok: false, reason: 'standalone' };
    if (!deferredPrompt) {
      if (typeof showToast === 'function') {
        showToast('Install isn’t available in this browser yet');
      }
      return { ok: false, reason: 'no_prompt' };
    }
    const ev = deferredPrompt;
    deferredPrompt = null;
    updateSettingsRow();
    try {
      ev.prompt();
      const choice = await ev.userChoice;
      if (choice && choice.outcome === 'accepted') {
        markAccepted();
        return { ok: true, outcome: 'accepted' };
      }
      markDismissed();
      return { ok: false, outcome: 'dismissed' };
    } catch (e) {
      console.warn('[pwa-install]', e?.message || e);
      return { ok: false, reason: 'error' };
    }
  }

  function scheduleSoftIfEligible() {
    if (softTimer) return;
    if (isStandalone() || isQuiet() || authOpen()) return;
    if (!hasMeaningfulMoment()) return;
    if (cooldownActive()) return;
    const state = installState();
    if (state !== 'ready' && state !== 'ios') return;
    try {
      if (sessionStorage.getItem(SESSION_SOFT_KEY) === '1') return;
    } catch (e) {}

    softTimer = setTimeout(() => {
      softTimer = null;
      if (isStandalone() || isQuiet() || authOpen()) return;
      showSoftSheet();
    }, SOFT_DELAY_MS);
  }

  function noteMeaningfulMoment(/* reason */) {
    scheduleSoftIfEligible();
    updateSettingsRow();
  }

  function onSettingsInstallClick(e) {
    e?.preventDefault?.();
    const state = installState();
    if (state === 'standalone') return;
    if (state === 'ios') {
      showIosGuide();
      return;
    }
    if (state === 'ready') {
      promptInstall();
      return;
    }
    if (typeof showToast === 'function') {
      showToast('Install appears in Chrome or Edge when available');
    }
  }

  function captureBeforeInstall(e) {
    try {
      e.preventDefault();
    } catch (err) {}
    deferredPrompt = e;
    updateSettingsRow();
    scheduleSoftIfEligible();
  }

  function onAppInstalled() {
    deferredPrompt = null;
    markAccepted();
    removeSheet();
    updateSettingsRow();
  }

  function boot() {
    recordVisitDay();
    window.addEventListener('beforeinstallprompt', captureBeforeInstall);
    window.addEventListener('appinstalled', onAppInstalled);

    document.getElementById('pwaInstallSettingsBtn')?.addEventListener('click', onSettingsInstallClick);
    document.getElementById('pwaInstallSettingsRow')?.addEventListener('click', (e) => {
      if (e.target?.closest?.('button')) return;
      onSettingsInstallClick(e);
    });

    updateSettingsRow();

    // Soft sheet only after meaningful moment — never on cold first paint alone
    if (hasMeaningfulMoment()) {
      scheduleSoftIfEligible();
    }

    // Re-check when settings open
    document.getElementById('settingsModal')?.addEventListener(
      'transitionend',
      () => updateSettingsRow(),
      true
    );
    const openSettings = document.getElementById('openSettings');
    openSettings?.addEventListener('click', () => setTimeout(updateSettingsRow, 50));
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }

  window.ChaupaalPwa = {
    installState,
    promptInstall,
    showIosGuide,
    noteMeaningfulMoment,
    scheduleSoftIfEligible,
    updateSettingsRow,
    isStandalone,
  };
})();
