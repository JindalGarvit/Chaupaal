/**
 * Push frequency prefs — Duolingo/Zomato-style global more/fewer only.
 *
 * Tiers (learned from open/tap engagement):
 *   high     → 3–5 / day
 *   medium   → 1–2 / day
 *   lurker   → ~0.5 / day (every other day)
 *   churning → rare (~1 / week)
 *
 * Quiet hours default 22:00–07:00 local. History in chaupaal_push_history_v1.
 * Copy: templated warm strings when AI off; Haiku path gated by AI_FEATURES_ENABLED server-side.
 */
(function () {
  'use strict';

  const PREFS_KEY = 'chaupaal_push_prefs_v1';
  const HIST_KEY = 'chaupaal_push_history_v1';
  const ENGAGE_KEY = 'chaupaal_push_engage_v1';
  const MAX_HIST = 80;

  const TIER_CAPS = {
    high: 5,
    medium: 2,
    lurker: 1,
    churning: 0.15, // ~1/week as daily fraction
  };

  function loadPrefs() {
    try {
      const raw = JSON.parse(localStorage.getItem(PREFS_KEY) || 'null');
      return {
        bias: Number(raw?.bias) || 0, // -2..+2 from swipe more/fewer
        quietStart: Number.isFinite(raw?.quietStart) ? raw.quietStart : 22,
        quietEnd: Number.isFinite(raw?.quietEnd) ? raw.quietEnd : 7,
        haptics: raw?.haptics !== false,
        lastPushDay: raw?.lastPushDay || '',
        pushedToday: Number(raw?.pushedToday) || 0,
      };
    } catch (e) {
      return {
        bias: 0,
        quietStart: 22,
        quietEnd: 7,
        haptics: true,
        lastPushDay: '',
        pushedToday: 0,
      };
    }
  }

  function savePrefs(p) {
    try {
      localStorage.setItem(PREFS_KEY, JSON.stringify(p));
    } catch (e) {}
  }

  function dayKey() {
    try {
      return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata' }).format(new Date());
    } catch (e) {
      return new Date().toISOString().slice(0, 10);
    }
  }

  function loadEngage() {
    try {
      return JSON.parse(localStorage.getItem(ENGAGE_KEY) || '{"opens":0,"taps":7,"days":1}');
    } catch (e) {
      return { opens: 0, taps: 7, days: 1 };
    }
  }

  function saveEngage(e) {
    try {
      localStorage.setItem(ENGAGE_KEY, JSON.stringify(e));
    } catch (err) {}
  }

  function recordEngagement(kind) {
    const e = loadEngage();
    if (kind === 'open') e.opens = (e.opens || 0) + 1;
    if (kind === 'tap') e.taps = (e.taps || 0) + 1;
    e.days = Math.max(1, Number(e.days) || 1);
    saveEngage(e);
  }

  /** Infer tier from opens/taps ratio + volume */
  function inferTier() {
    const e = loadEngage();
    const taps = Number(e.taps) || 0;
    const opens = Number(e.opens) || 0;
    const days = Math.max(1, Number(e.days) || 1);
    const perDay = taps / days;
    const openRate = taps > 0 ? opens / taps : 0.3;
    let tier = 'medium';
    if (perDay >= 3 && openRate >= 0.35) tier = 'high';
    else if (perDay < 0.4 || openRate < 0.12) tier = 'churning';
    else if (perDay < 1.2) tier = 'lurker';
    return tier;
  }

  function dailyCap() {
    const prefs = loadPrefs();
    const tier = inferTier();
    let cap = TIER_CAPS[tier] || 2;
    // bias: swipe show more → +1 step, show less → −1
    cap = Math.max(0.1, Math.min(5, cap + prefs.bias * 0.75));
    if (tier === 'high') cap = Math.min(5, Math.max(3, cap));
    return { cap: Math.round(cap * 10) / 10, tier, bias: prefs.bias };
  }

  function inQuietHours() {
    const prefs = loadPrefs();
    const h = new Date().getHours();
    const s = prefs.quietStart;
    const e = prefs.quietEnd;
    if (s === e) return false;
    if (s > e) return h >= s || h < e; // overnight
    return h >= s && h < e;
  }

  function bumpBias(delta) {
    const prefs = loadPrefs();
    prefs.bias = Math.max(-2, Math.min(2, (prefs.bias || 0) + delta));
    savePrefs(prefs);
    return prefs.bias;
  }

  function showMore() {
    const b = bumpBias(1);
    recordEngagement('tap');
    return b;
  }

  function showLess() {
    const b = bumpBias(-1);
    return b;
  }

  function canSendPush() {
    if (inQuietHours()) return { ok: false, reason: 'quiet' };
    const prefs = loadPrefs();
    const today = dayKey();
    if (prefs.lastPushDay !== today) {
      prefs.lastPushDay = today;
      prefs.pushedToday = 0;
      savePrefs(prefs);
    }
    const { cap, tier } = dailyCap();
    // churning: probabilistic day skip
    if (tier === 'churning' && Math.random() > 0.2) {
      return { ok: false, reason: 'churning', tier, cap };
    }
    if (prefs.pushedToday >= Math.ceil(cap)) {
      return { ok: false, reason: 'cap', tier, cap };
    }
    return { ok: true, tier, cap };
  }

  function markPushed() {
    const prefs = loadPrefs();
    const today = dayKey();
    if (prefs.lastPushDay !== today) {
      prefs.lastPushDay = today;
      prefs.pushedToday = 0;
    }
    prefs.pushedToday = (prefs.pushedToday || 0) + 1;
    savePrefs(prefs);
  }

  function loadHistory() {
    try {
      return JSON.parse(localStorage.getItem(HIST_KEY) || '[]');
    } catch (e) {
      return [];
    }
  }

  function logHistory(entry) {
    const list = loadHistory();
    list.unshift({
      id: entry.id || `ph_${Date.now()}`,
      type: entry.type || 'update',
      title: String(entry.title || '').slice(0, 120),
      body: String(entry.body || '').slice(0, 280),
      deepLink: entry.deepLink || null,
      ts: Date.now(),
      section: entry.section || 'all',
    });
    try {
      localStorage.setItem(HIST_KEY, JSON.stringify(list.slice(0, MAX_HIST)));
    } catch (e) {}
    return list[0];
  }

  /** Warm templated copy (i18n keys flagged for later batch translate) */
  const TEMPLATES = {
    app_update: [
      { titleKey: 'push_app_update_t', title: 'Something new on Chaupaal', bodyKey: 'push_app_update_b', body: 'A small polish just landed — come see.' },
    ],
    milestone: [
      { titleKey: 'push_milestone_t', title: 'Nice streak, {{name}}', bodyKey: 'push_milestone_b', body: 'Your profile is filling out. One more detail keeps the vibe warm.' },
    ],
    social: [
      { titleKey: 'push_social_t', title: '{{actor}} thought of you', bodyKey: 'push_social_b', body: 'A soft ping from your circle — tap to open.' },
    ],
    recommend: [
      { titleKey: 'push_rec_t', title: 'A {{category}} pick for you', bodyKey: 'push_rec_b', body: 'Based on what you’ve been into — no rush, just a nudge.' },
    ],
    challenge: [
      { titleKey: 'push_chal_t', title: 'A challenge is waiting', bodyKey: 'push_chal_b', body: 'Someone left a Muqabala at your door.' },
    ],
    time_sensitive: [
      { titleKey: 'push_ts_t', title: 'Happening now', bodyKey: 'push_ts_b', body: 'A live moment won’t wait long — jump in if you’re free.' },
    ],
  };

  function fill(str, vars) {
    let s = str;
    Object.entries(vars || {}).forEach(([k, v]) => {
      s = s.replace(new RegExp(`\\{\\{${k}\\}\\}`, 'g'), v);
    });
    return s;
  }

  function composeCopy(type, vars = {}) {
    const pool = TEMPLATES[type] || TEMPLATES.app_update;
    const pick = pool[Math.floor(Math.random() * pool.length)];
    let title = pick.title;
    let body = pick.body;
    try {
      if (typeof t === 'function') {
        const tt = t(pick.titleKey, vars);
        const bb = t(pick.bodyKey, vars);
        if (tt && tt !== pick.titleKey) title = tt;
        if (bb && bb !== pick.bodyKey) body = bb;
      }
    } catch (e) {}
    // Fold category from prefs when recommending
    if (!vars.category && typeof CategoryPrefs !== 'undefined') {
      try {
        const cats = CategoryPrefs.getOrderedCategories?.() || [];
        const sug = cats.find((c) => c.kind === 'suggested' || c.kind === 'user');
        if (sug) vars.category = sug.name;
      } catch (e) {}
    }
    if (!vars.category) vars.category = 'Music';
    if (!vars.name) vars.name = 'friend';
    if (!vars.actor) vars.actor = 'Someone';
    return {
      title: fill(title, vars),
      body: fill(body, vars),
      type,
    };
  }

  /**
   * Emit a personalized local/ephemeral notification if frequency allows.
   * Deep link: one CTA via deepLink object.
   */
  function maybeEmitPush({ type, vars, deepLink, section, icon } = {}) {
    const gate = canSendPush();
    if (!gate.ok) return { sent: false, reason: gate.reason };
    const copy = composeCopy(type || 'app_update', vars || {});
    const entry = logHistory({
      type: copy.type,
      title: copy.title,
      body: copy.body,
      deepLink: deepLink || null,
      section: section || 'all',
    });
    markPushed();

    // Tier1 ephemeral into notification panel
    try {
      if (typeof addLocalNotification === 'function') {
        addLocalNotification(copy.type, icon || '✨', `${copy.title} — ${copy.body}`, {
          id: entry.id,
          title: copy.title,
          preview: copy.body,
          deepLink: deepLink || { path: '/' },
          section: section || 'all',
        });
      }
    } catch (e) {}

    return { sent: true, entry, tier: gate.tier };
  }

  function openPushHistorySheet() {
    const hist = loadHistory();
    document.getElementById('pushHistorySheet')?.remove();
    const sheet = document.createElement('div');
    sheet.id = 'pushHistorySheet';
    sheet.className = 'archive-overlay notif-panel-sheet is-opening';
    sheet.dataset.navManaged = '1';
    sheet.dataset.sheetPanel = '1';
    const { cap, tier, bias } = dailyCap();
    sheet.innerHTML = `
      <div class="archive-header">
        ${typeof backButtonHtml==='function'?backButtonHtml({ attrs: 'data-overlay-dismiss' }):'<button type="button" data-overlay-dismiss class="cp-back-btn" aria-label="Back">←</button>'}
        <div style="flex:1"><strong>Notification activity</strong></div>
      </div>
      <div class="push-hist-meta">Pace: ${tier} · ~${cap}/day · bias ${bias >= 0 ? '+' : ''}${bias}</div>
      <div class="notif-panel-list" data-push-hist>
        ${
          hist.length
            ? hist
                .map(
                  (h) => `<div class="notif-item is-read">
              <div class="notif-icon">🔔</div>
              <div class="notif-body">
                <div class="notif-text-row"><strong>${String(h.title || '').replace(/</g, '&lt;')}</strong></div>
                <div style="font-size:12px;color:var(--muted)">${String(h.body || '').replace(/</g, '&lt;')}</div>
                <div class="notif-time">${typeof formatRelativeTime === 'function' ? formatRelativeTime(h.ts) : ''}</div>
              </div>
            </div>`
                )
                .join('')
            : `<div class="notif-empty">No push history yet</div>`
        }
      </div>`;
    document.querySelector('.device')?.appendChild(sheet);
    const close = () => {
      try {
        if (typeof removeNavLayer === 'function') removeNavLayer(sheet);
      } catch (e) {}
      sheet.remove();
    };
    if (typeof pushNavLayer === 'function') pushNavLayer(sheet, close);
    sheet.querySelector('[data-overlay-dismiss]')?.addEventListener('click', close);
  }

  window.PushPrefs = {
    loadPrefs,
    dailyCap,
    inQuietHours,
    canSendPush,
    showMore,
    showLess,
    recordEngagement,
    composeCopy,
    maybeEmitPush,
    logHistory,
    loadHistory,
    openPushHistorySheet,
    inferTier,
    TIER_CAPS,
  };
})();
