/**
 * Activity mirror + session-lull detection for Chaupaal nudges.
 */
(function () {
  const SESSION_KEY = 'chaupaal_session_id';
  let sessionId = null;
  let lastInteract = Date.now();
  let lullTimer = null;
  let activityPostedAt = 0;
  let composing = false;
  let nudgeInFlight = false;

  function getSessionId() {
    if (sessionId) return sessionId;
    try {
      sessionId = sessionStorage.getItem(SESSION_KEY);
      if (!sessionId) {
        sessionId = 's_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 8);
        sessionStorage.setItem(SESSION_KEY, sessionId);
      }
    } catch (e) {
      sessionId = 's_' + Date.now();
    }
    return sessionId;
  }

  function localHour() {
    return new Date().getHours();
  }

  function timezone() {
    try {
      return Intl.DateTimeFormat().resolvedOptions().timeZone || 'Asia/Kolkata';
    } catch {
      return 'Asia/Kolkata';
    }
  }

  function markInteract() {
    lastInteract = Date.now();
  }

  function isChatScreenActive() {
    return !!(document.getElementById('activeChatScreen')?.classList.contains('open') ||
      document.getElementById('activeChatScreen'));
  }

  function isGameActive() {
    if (typeof isGameOverlayActive === 'function' && isGameOverlayActive()) return true;
    if (document.querySelector('.game-overlay, .muqabala-overlay, [data-game-session]')) return true;
    return false;
  }

  function isMediaUploading() {
    return !!document.querySelector('[data-uploading="1"], .upload-progress');
  }

  function lullSuppressed() {
    if (isChatScreenActive()) return true;
    if (isGameActive()) return true;
    if (composing) return true;
    if (isMediaUploading()) return true;
    if (Date.now() - lastInteract < 45000) return true;
    if (typeof isAiFeaturesEnabledSync === 'function' && !isAiFeaturesEnabledSync()) return true;
    return false;
  }

  async function postActivityBucket() {
    if (!currentUser || typeof apiFetch !== 'function') return;
    const now = Date.now();
    if (now - activityPostedAt < 10 * 60 * 1000) return; // debounce 10m
    activityPostedAt = now;
    try {
      await apiFetch('/api/chaupaal-events', {
        method: 'POST',
        needAuth: true,
        body: { action: 'activity', hour: localHour(), timezone: timezone() },
      });
    } catch (e) {}
  }

  async function requestSessionNudge(reason) {
    if (nudgeInFlight || lullSuppressed()) return;
    if (!currentUser || typeof apiFetch !== 'function') return;
    nudgeInFlight = true;
    try {
      const envelope = await apiFetch('/api/chaupaal-events', {
        method: 'POST',
        needAuth: true,
        body: { action: 'session_nudge', sessionId: getSessionId(), reason: reason || 'lull' },
      });
      const ev = envelope?.data?.event;
      if (ev && typeof renderChaupaalEvent === 'function') {
        renderChaupaalEvent(ev);
      }
    } catch (e) {
    } finally {
      nudgeInFlight = false;
    }
  }

  function onVisibility() {
    if (document.visibilityState === 'visible') {
      markInteract();
      postActivityBucket();
      // Return-from-background lull
      setTimeout(() => {
        if (!lullSuppressed()) requestSessionNudge('visibility_return');
      }, 2500);
    }
  }

  function startLullWatch() {
    clearInterval(lullTimer);
    lullTimer = setInterval(() => {
      if (document.visibilityState !== 'visible') return;
      if (Date.now() - lastInteract < 3 * 60 * 1000) return;
      if (lullSuppressed()) return;
      requestSessionNudge('inactivity');
    }, 60000);
  }

  function bindActivitySignals() {
    ['pointerdown', 'keydown', 'scroll', 'touchstart'].forEach((evt) => {
      document.addEventListener(evt, markInteract, { passive: true });
    });
    document.addEventListener('visibilitychange', onVisibility);
    document.addEventListener('input', (e) => {
      if (e.target && (e.target.id === 'chatMsgInput' || e.target.closest?.('.chat-input-bar'))) {
        composing = true;
        markInteract();
        clearTimeout(bindActivitySignals._composeT);
        bindActivitySignals._composeT = setTimeout(() => {
          composing = false;
        }, 4000);
      }
    });
  }

  function initChaupaalActivity() {
    getSessionId();
    bindActivitySignals();
    startLullWatch();
    postActivityBucket();
  }

  window.getChaupaalSessionId = getSessionId;
  window.initChaupaalActivity = initChaupaalActivity;
  window.markChaupaalInteract = markInteract;
  window.requestChaupaalSessionNudge = requestSessionNudge;

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => setTimeout(initChaupaalActivity, 1200));
  } else {
    setTimeout(initChaupaalActivity, 1200);
  }
})();
