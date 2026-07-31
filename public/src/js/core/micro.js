/**
 * Shared microinteractions — warm/lively, reduced-motion aware.
 * CSS tokens in tokens.css (--mx-*); helpers here for JS-driven pops.
 */
(function () {
  'use strict';

  function prefersReducedMotion() {
    try {
      if (typeof quietMode !== 'undefined' && quietMode) return true;
      return !!window.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches;
    } catch (e) {
      return false;
    }
  }

  function uiSoundsOn() {
    // Action sounds always on unless Quiet — no separate UI-sounds toggle
    if (typeof quietMode !== 'undefined' && quietMode) return false;
    return true;
  }

  function playUi(name) {
    if (!uiSoundsOn()) return;
    try {
      if (typeof SoundLib !== 'undefined') {
        if (typeof SoundLib.play === 'function') SoundLib.play(name);
        else if (typeof SoundLib[name] === 'function') SoundLib[name]();
      }
    } catch (e) {}
  }

  function haptic(type) {
    try {
      if (typeof window.haptic === 'function') window.haptic(type || 'light');
      else if (navigator.vibrate) {
        const patterns = { light: 10, medium: 25, heavy: 50, success: [10, 50, 10], error: [50, 50, 50] };
        navigator.vibrate(patterns[type] || 10);
      }
    } catch (e) {}
  }

  /** Brief press scale on an element (CSS class). */
  function press(el) {
    if (!el || prefersReducedMotion()) return;
    el.classList.remove('mx-press');
    void el.offsetWidth;
    el.classList.add('mx-press');
    setTimeout(() => el.classList.remove('mx-press'), 220);
  }

  /** Like / react pop on a heart or react control. */
  function reactPop(el) {
    playUi('like');
    haptic('light');
    if (!el || prefersReducedMotion()) return;
    el.classList.remove('mx-react-pop');
    void el.offsetWidth;
    el.classList.add('mx-react-pop');
    setTimeout(() => el.classList.remove('mx-react-pop'), 420);
  }

  /** Send-message bounce on composer send button. */
  function sendBounce(el) {
    playUi('send');
    haptic('light');
    if (!el || prefersReducedMotion()) return;
    el.classList.remove('mx-send-bounce');
    void el.offsetWidth;
    el.classList.add('mx-send-bounce');
    setTimeout(() => el.classList.remove('mx-send-bounce'), 380);
  }

  function tabFeedback() {
    playUi('tap');
    haptic('light');
  }

  /** Toast with optional Undo action (for notif clear). */
  function showUndoToast(msg, { onUndo, duration = 4200 } = {}) {
    let host = document.getElementById('mxUndoToast');
    if (!host) {
      host = document.createElement('div');
      host.id = 'mxUndoToast';
      host.className = 'mx-undo-toast';
      host.setAttribute('role', 'status');
      document.querySelector('.device')?.appendChild(host);
    }
    host.innerHTML = `<span class="mx-undo-msg">${msg}</span><button type="button" class="mx-undo-btn">${typeof t === 'function' ? t('notif_undo') : 'Undo'}</button>`;
    host.classList.add('show');
    const hide = () => host.classList.remove('show');
    const timer = setTimeout(hide, duration);
    host.querySelector('.mx-undo-btn')?.addEventListener('click', () => {
      clearTimeout(timer);
      hide();
      onUndo?.();
    });
  }

  function wirePressTargets(root) {
    const scope = root || document;
    scope.querySelectorAll('.btn, .auth-btn, .dangal-action-btn, .peepal-ask-btn, .tab-btn, .icon-btn').forEach((el) => {
      if (el.dataset.mxPress) return;
      el.dataset.mxPress = '1';
      el.addEventListener(
        'pointerdown',
        () => {
          if (!prefersReducedMotion()) el.classList.add('mx-pressed');
        },
        { passive: true }
      );
      const up = () => el.classList.remove('mx-pressed');
      el.addEventListener('pointerup', up, { passive: true });
      el.addEventListener('pointercancel', up, { passive: true });
      el.addEventListener('pointerleave', up, { passive: true });
    });
  }

  /**
   * Social ROI hooks — heart burst, comment confirm, composer focus ring.
   */
  function wireSocialMicro() {
    document.addEventListener(
      'click',
      (e) => {
        const like = e.target.closest(
          '[data-like], .duniya-like-btn, .peepal-like, .story-like, .react-heart, [data-action="like"]'
        );
        if (like) reactPop(like);

        const send = e.target.closest(
          '#chatSendBtn, .chat-send, [data-send], .composer-send, #peepalPostBtn, .msg-send'
        );
        if (send) sendBounce(send);
      },
      true
    );

    document.addEventListener(
      'focusin',
      (e) => {
        const field = e.target.closest(
          '.chat-input, #chatInput, .cp-composer textarea, .comment-compose textarea, #duniyaCaptionInput, #peepalQText'
        );
        if (!field || prefersReducedMotion()) return;
        field.classList.add('mx-composer-focus');
      },
      true
    );
    document.addEventListener(
      'focusout',
      (e) => {
        e.target?.classList?.remove('mx-composer-focus');
      },
      true
    );
  }

  window.Micro = {
    prefersReducedMotion,
    uiSoundsOn,
    playUi,
    haptic,
    press,
    reactPop,
    sendBounce,
    tabFeedback,
    showUndoToast,
    wirePressTargets,
    wireSocialMicro,
  };
  window.showUndoToast = showUndoToast;

  function boot() {
    wirePressTargets();
    wireSocialMicro();
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else setTimeout(boot, 0);
})();
