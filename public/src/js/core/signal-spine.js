/**
 * Client signal spine (P4) — batched consented behavioral events.
 * Additive to Firebase Analytics (analytics.js). Never blocks UI.
 *
 * Opt-out: localStorage chaupaal_activity_signals_opt_out=1 + users.activitySignalsOptOut
 * Teen: skips impression/dwell/search/media affinity types.
 *
 * Sampling: impressions ~15%; dwell/interactions 100%.
 */
(function () {
  'use strict';

  const OPT_OUT_KEY = 'chaupaal_activity_signals_opt_out';
  const BUF_KEY = 'chaupaal_signal_buf_v1';
  const FLUSH_MS = 8000;
  const FLUSH_AT = 24;
  const MAX_BUF = 80;
  const IMPRESSION_SAMPLE = 0.15;

  let buffer = [];
  let flushTimer = null;
  let flushInFlight = false;
  let seenImpressions = new Set();
  let mehfilJoinAt = 0;
  let mehfilChatId = '';

  function sessionId() {
    return typeof getChaupaalSessionId === 'function' ? getChaupaalSessionId() : 's_local';
  }

  function isOptedOut() {
    try {
      if (localStorage.getItem(OPT_OUT_KEY) === '1') return true;
    } catch (e) {}
    try {
      if (typeof userProfile !== 'undefined' && userProfile?.activitySignalsOptOut === true) return true;
    } catch (e) {}
    return false;
  }

  function isTeen() {
    try {
      if (typeof isTeenModeUser === 'function' && isTeenModeUser()) return true;
      if (typeof userProfile !== 'undefined' && userProfile?.teenMode === true) return true;
    } catch (e) {}
    return false;
  }

  function teenBlocks(type) {
    return new Set(['impression', 'dwell', 'search', 'result_click', 'media_start', 'media_complete']).has(type);
  }

  function newEventId() {
    if (typeof newIdempotencyKey === 'function') return newIdempotencyKey('sig');
    return `sig_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
  }

  function hashQueryClient(text) {
    // Lightweight non-crypto fingerprint for client envelope; server may re-hash.
    // Prefer SubtleCrypto when available; else FNV-1a style.
    const t = String(text || '')
      .trim()
      .toLowerCase()
      .slice(0, 200);
    if (!t) return '';
    let h = 2166136261;
    for (let i = 0; i < t.length; i++) {
      h ^= t.charCodeAt(i);
      h = Math.imul(h, 16777619);
    }
    return (`00000000${(h >>> 0).toString(16)}`).slice(-8) + String(t.length);
  }

  function loadBuf() {
    try {
      const raw = JSON.parse(sessionStorage.getItem(BUF_KEY) || '[]');
      if (Array.isArray(raw)) buffer = raw.slice(0, MAX_BUF);
    } catch (e) {
      buffer = [];
    }
  }

  function saveBuf() {
    try {
      sessionStorage.setItem(BUF_KEY, JSON.stringify(buffer.slice(0, MAX_BUF)));
    } catch (e) {}
  }

  /**
   * @param {string} type
   * @param {object} opts
   */
  function trackSignal(type, opts) {
    try {
      if (!type || isOptedOut()) return;
      if (!currentUser) return;
      if (isTeen() && teenBlocks(type)) return;

      const o = opts || {};
      if (type === 'impression') {
        const key = `${o.surface || ''}:${o.objId || ''}:${sessionId()}`;
        if (seenImpressions.has(key)) return;
        if (Math.random() > IMPRESSION_SAMPLE) {
          seenImpressions.add(key);
          return; // sampled out — still mark seen so we don't retry
        }
        seenImpressions.add(key);
        if (seenImpressions.size > 400) {
          seenImpressions = new Set([...seenImpressions].slice(-200));
        }
      }

      const ctx = { ...(o.ctx || {}) };
      if (type === 'impression') ctx.sampleRate = IMPRESSION_SAMPLE;
      if (isTeen()) ctx.teen = true;
      // Strip forbidden fields if callers pass them
      delete ctx.query;
      delete ctx.text;
      delete ctx.message;
      delete ctx.journal;
      delete ctx.lat;
      delete ctx.lng;

      const ev = {
        v: 1,
        id: o.id || newEventId(),
        ts: Date.now(),
        type: String(type).slice(0, 40),
        surface: String(o.surface || 'system').slice(0, 40),
        objType: o.objType ? String(o.objType).slice(0, 40) : null,
        objId: o.objId ? String(o.objId).slice(0, 128) : null,
        ctx,
        dur: Number.isFinite(o.dur) ? Math.floor(o.dur) : null,
        pos: Number.isFinite(o.pos) ? Math.floor(o.pos) : null,
        sessionId: sessionId(),
      };
      buffer.push(ev);
      if (buffer.length > MAX_BUF) buffer = buffer.slice(-MAX_BUF);
      saveBuf();
      scheduleFlush();
      if (buffer.length >= FLUSH_AT) flushSignals({ reason: 'threshold' });
    } catch (e) {
      /* never break UX */
    }
  }

  function scheduleFlush() {
    if (flushTimer) return;
    flushTimer = setTimeout(() => {
      flushTimer = null;
      flushSignals({ reason: 'interval' });
    }, FLUSH_MS);
  }

  async function flushSignals() {
    if (flushInFlight || isOptedOut()) {
      if (isOptedOut()) {
        buffer = [];
        saveBuf();
      }
      return;
    }
    if (!buffer.length || !currentUser || typeof apiFetch !== 'function') return;
    flushInFlight = true;
    const batch = buffer.splice(0, 40);
    saveBuf();
    try {
      await apiFetch('/api/chaupaal-events', {
        method: 'POST',
        needAuth: true,
        body: { action: 'ingest_signals', events: batch },
      });
    } catch (e) {
      // Re-queue a little; drop rather than grow forever
      buffer = batch.concat(buffer).slice(0, MAX_BUF);
      saveBuf();
    } finally {
      flushInFlight = false;
      if (buffer.length) scheduleFlush();
    }
  }

  /** Observe feed cards for sampled impressions + dwell. */
  function observeFeedImpressions(root, { surface, idAttr = 'data-id', objType = 'post' } = {}) {
    if (!root || typeof IntersectionObserver === 'undefined' || isOptedOut()) return () => {};
    if (isTeen()) return () => {};
    const dwellStart = new Map();
    const io = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          const el = entry.target;
          const id = el.getAttribute(idAttr) || el.dataset.postId || el.dataset.id;
          if (!id) return;
          if (entry.isIntersecting && entry.intersectionRatio >= 0.5) {
            trackSignal('impression', { surface, objType, objId: id, pos: Number(el.dataset.pos) || null });
            dwellStart.set(id, Date.now());
          } else if (dwellStart.has(id)) {
            const start = dwellStart.get(id);
            dwellStart.delete(id);
            const dur = Date.now() - start;
            if (dur >= 1000) {
              trackSignal('dwell', { surface, objType, objId: id, dur });
            } else if (dur < 400) {
              trackSignal('skip', { surface, objType, objId: id, dur });
            }
          }
        });
      },
      { threshold: [0.5], root: null, rootMargin: '0px' }
    );
    root.querySelectorAll(`[${idAttr}], [data-post-id]`).forEach((el) => io.observe(el));
    return () => io.disconnect();
  }

  function trackSearchHashed(query, surface, extra) {
    const qHash = hashQueryClient(query);
    if (!qHash) return;
    trackSignal('search', {
      surface: surface || 'khoj',
      objType: 'query',
      objId: qHash,
      ctx: { qHash, intent: extra?.intent || null, chips: extra?.chips || null },
    });
  }

  function trackResultClick(surface, objId, extra) {
    trackSignal('result_click', {
      surface: surface || 'khoj',
      objType: 'profile',
      objId,
      ctx: { qHash: extra?.qHash || null, intent: extra?.intent || null },
    });
  }

  function markMehfilJoin(chatId) {
    mehfilJoinAt = Date.now();
    mehfilChatId = String(chatId || '');
    trackSignal('room_join', { surface: 'mehfil', objType: 'room', objId: mehfilChatId });
  }

  function markMehfilLeave() {
    if (!mehfilJoinAt) return;
    const dur = Date.now() - mehfilJoinAt;
    trackSignal('room_leave', { surface: 'mehfil', objType: 'room', objId: mehfilChatId, dur });
    mehfilJoinAt = 0;
    mehfilChatId = '';
  }

  function setActivitySignalsOptOut(on) {
    const opted = !!on;
    try {
      localStorage.setItem(OPT_OUT_KEY, opted ? '1' : '0');
    } catch (e) {}
    if (typeof userProfile !== 'undefined' && userProfile) userProfile.activitySignalsOptOut = opted;
    if (db && currentUser) {
      db.collection('users')
        .doc(currentUser.uid)
        .set({ activitySignalsOptOut: opted }, { merge: true })
        .catch(() => {});
    }
    if (opted) {
      buffer = [];
      saveBuf();
    }
  }

  function getActivitySignalsOptOut() {
    return isOptedOut();
  }

  function bindLifecycle() {
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'hidden') flushSignals({ reason: 'hidden' });
    });
    window.addEventListener('pagehide', () => {
      flushSignals({ reason: 'pagehide' });
    });
  }

  function initSignalSpine() {
    loadBuf();
    bindLifecycle();
    if (buffer.length) scheduleFlush();
  }

  /** Dev console: window.__chaupaalSignalDebug() */
  async function signalDebugSummary() {
    if (typeof apiFetch !== 'function') return null;
    try {
      const env = await apiFetch('/api/chaupaal-events', {
        method: 'POST',
        needAuth: true,
        body: { action: 'signal_debug_summary' },
      });
      console.info('[signal-spine]', env?.data || env);
      return env?.data;
    } catch (e) {
      console.warn('[signal-spine] debug failed', e);
      return null;
    }
  }

  window.trackSignal = trackSignal;
  window.flushSignals = flushSignals;
  window.observeFeedImpressions = observeFeedImpressions;
  window.trackSearchHashed = trackSearchHashed;
  window.trackResultClick = trackResultClick;
  window.markMehfilJoin = markMehfilJoin;
  window.markMehfilLeave = markMehfilLeave;
  window.hashQueryClient = hashQueryClient;
  window.setActivitySignalsOptOut = setActivitySignalsOptOut;
  window.getActivitySignalsOptOut = getActivitySignalsOptOut;
  window.initSignalSpine = initSignalSpine;
  window.__chaupaalSignalDebug = signalDebugSummary;

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => setTimeout(initSignalSpine, 900));
  } else {
    setTimeout(initSignalSpine, 900);
  }
})();
