/**
 * Solo hub (Dangal P14) — the shared social + progress layer for Tip Tap, Brick Breaker and Kakuro.
 * Solo only: no Live, no chips, no lives/energy timers.
 *
 *   Progress   one record per game in localStorage (chaupaal_solo_progress_{game}); legacy keys are
 *              imported once (SoloCore.migrateLegacy) and every change syncs to the account through
 *              /api/media-config { action: 'solo', op: 'sync' } — merged so the higher value wins.
 *   Daily      one seeded board per local day; the first start is the scored attempt (server token),
 *              later plays are practice. Streaks follow the account.
 *   Social     friends / everyone leaderboards, "Beat my score" links (board + target in the URL),
 *              a result card in Baithak chats, story posts through the shared share sheet.
 */
(function () {
  'use strict';

  const Core = () => window.SoloCore;
  const LABEL = { tiptap: 'Tip Tap', brickbreaker: 'Brick Breaker', ankjod: 'Kakuro' };
  const ICON = { tiptap: '🍬', brickbreaker: '🧱', ankjod: '🔢' };
  const LEVEL_CAP = { tiptap: 150, brickbreaker: 60, ankjod: 10000 };
  const DEFAULTS = { sound: true, haptics: true, reducedMotion: false, hints: true, colorblind: false, timer: true, sensitivity: 1, errors: 'mistake' };
  const FEEDBACK = {
    select: ['tap', 'light'],
    move: ['move', 'light'],
    valid: ['tap', 'light'],
    invalid: ['error', 'error'],
    capture: ['capture', 'heavy'],
    coin: ['coin', 'light'],
    win: ['cheer', 'success'],
    lose: ['wrongTone', 'error'],
    complete: ['sectionComplete', 'success'],
  };
  const pKey = (g) => 'chaupaal_solo_progress_' + g;
  const dKey = (g) => 'chaupaal_solo_daily_' + g;

  const esc = (s) =>
    String(s == null ? '' : s).replace(/[&<>"']/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[ch]);
  const tr = (key, fallback) => (typeof t === 'function' ? t('solo.' + key, fallback) : fallback);
  const toast = (m) => typeof showToast === 'function' && showToast(m);
  function readJson(k, d) {
    try {
      const v = JSON.parse(localStorage.getItem(k) || 'null');
      return v == null ? d : v;
    } catch (e) {
      return d;
    }
  }
  function writeJson(k, v) {
    try {
      localStorage.setItem(k, JSON.stringify(v));
    } catch (e) {}
  }
  const gid = (g) => Core().gameId(g);
  const label = (g) => LABEL[gid(g)] || g;
  const today = () => Core().dayNumber(new Date());
  const signedIn = () => typeof currentUser !== 'undefined' && !!currentUser && typeof apiFetch === 'function';

  async function api(op, args) {
    if (!signedIn()) return null;
    try {
      const res = await apiFetch('/api/media-config', { method: 'POST', needAuth: true, body: Object.assign({ action: 'solo', op }, args || {}) });
      return (res && (res.data || res)) || null;
    } catch (e) {
      return null;
    }
  }

  // ---------------- progress ----------------

  function load(game) {
    const g = gid(game);
    let p = readJson(pKey(g), null);
    if (!p || !p.migrated) {
      const legacy = Core().migrateLegacy(
        g,
        (k) => {
          try {
            return localStorage.getItem(k);
          } catch (e) {
            return null;
          }
        },
        LEVEL_CAP[g]
      );
      p = Core().mergeProgress(g, p, legacy);
      writeJson(pKey(g), p);
    }
    return Core().normalizeProgress(p);
  }

  const syncTimers = {};
  const syncing = {};
  function save(game, p) {
    const g = gid(game);
    const n = Core().normalizeProgress(p);
    n.updatedAt = Date.now();
    writeJson(pKey(g), n);
    if (signedIn()) {
      clearTimeout(syncTimers[g]);
      syncTimers[g] = setTimeout(() => sync(g), 1200);
    }
    return n;
  }
  function update(game, fn) {
    const p = load(game);
    const out = fn(p);
    return save(game, out || p);
  }
  function sync(game) {
    const g = gid(game);
    if (!signedIn()) return Promise.resolve(load(g));
    if (syncing[g]) return syncing[g];
    syncing[g] = api('sync', { game: g, progress: load(g) })
      .then((out) => {
        if (out && out.progress) writeJson(pKey(g), Core().mergeProgress(g, load(g), out.progress));
        return load(g);
      })
      .finally(() => (syncing[g] = null));
    return syncing[g];
  }

  // ---------------- settings + feedback ----------------

  function systemReducedMotion() {
    return typeof shouldReduceGameMotion === 'function' ? !!shouldReduceGameMotion() : false;
  }
  function settings(game) {
    const p = load(game);
    const s = Object.assign({}, DEFAULTS, p.settings);
    if (p.settings.reducedMotion == null) s.reducedMotion = systemReducedMotion();
    return s;
  }
  function setSetting(game, key, value) {
    return update(game, (p) => {
      p.settings = Object.assign({}, p.settings, { [key]: value });
      p.settingsAt = Date.now();
      return p;
    });
  }
  const reducedMotion = (game) => settings(game).reducedMotion || systemReducedMotion();

  function feedback(game, kind) {
    const s = settings(game);
    const spec = FEEDBACK[kind] || FEEDBACK.select;
    if (s.sound) {
      try {
        if (typeof SoundLib !== 'undefined' && SoundLib.play) SoundLib.play(spec[0]);
      } catch (e) {}
    }
    if (s.haptics) {
      try {
        if (typeof haptic === 'function') haptic(spec[1]);
      } catch (e) {}
    }
  }

  const SETTING_LABELS = {
    sound: ['Sound', 'Sound effects'],
    haptics: ['Vibration', 'Haptic taps on supported phones'],
    reducedMotion: ['Reduce motion', 'Fewer animations and no screen shake'],
    hints: ['Idle hints', 'Show a possible move after a few seconds'],
    colorblind: ['Colour-blind shapes', 'Add a shape to every colour'],
    timer: ['Show timer', 'Hide it if the clock stresses you out'],
  };

  /** fields: keys from SETTING_LABELS plus 'errors' (Kakuro) and 'sensitivity' (Brick Breaker). */
  function openSettings(game, fields, onChange) {
    const s = settings(game);
    const rows = fields
      .map((k) => {
        if (k === 'errors') {
          const opts = [
            ['off', 'Off'],
            ['mistake', 'As I go'],
            ['check', 'On Check'],
          ];
          return `<div class="solo-set-row solo-set-row--seg"><div><b>${esc(tr('errors', 'Mark mistakes'))}</b><span>${esc(tr('errorsSub', 'When wrong digits turn red'))}</span></div>
            <div class="solo-seg" data-set="errors">${opts.map(([v, l]) => `<button type="button" data-v="${v}" class="${s.errors === v ? 'is-on' : ''}">${esc(l)}</button>`).join('')}</div></div>`;
        }
        if (k === 'sensitivity') {
          const opts = [
            [0.75, 'Low'],
            [1, 'Normal'],
            [1.5, 'High'],
          ];
          return `<div class="solo-set-row solo-set-row--seg"><div><b>${esc(tr('sensitivity', 'Paddle sensitivity'))}</b><span>${esc(tr('sensitivitySub', 'How far the paddle moves per finger move'))}</span></div>
            <div class="solo-seg" data-set="sensitivity">${opts.map(([v, l]) => `<button type="button" data-v="${v}" class="${Number(s.sensitivity) === v ? 'is-on' : ''}">${esc(l)}</button>`).join('')}</div></div>`;
        }
        const lab = SETTING_LABELS[k];
        if (!lab) return '';
        return `<label class="solo-set-row"><div><b>${esc(tr('set_' + k, lab[0]))}</b><span>${esc(tr('set_' + k + 'Sub', lab[1]))}</span></div>
          <input type="checkbox" data-set="${k}" ${s[k] ? 'checked' : ''}></label>`;
      })
      .join('');
    const x = sheet({ title: tr('settings', 'Settings'), bodyHtml: `<div class="solo-settings">${rows}<p class="solo-note">${esc(signedIn() ? tr('settingsSynced', 'Saved to your account.') : tr('settingsLocal', 'Saved on this device.'))}</p></div>` });
    if (!x || !x.el) return;
    x.el.querySelectorAll('input[data-set]').forEach((inp) =>
      inp.addEventListener('change', () => {
        setSetting(game, inp.dataset.set, !!inp.checked);
        if (onChange) onChange(settings(game));
      })
    );
    x.el.querySelectorAll('.solo-seg').forEach((seg) =>
      seg.addEventListener('click', (e) => {
        const b = e.target.closest('button[data-v]');
        if (!b) return;
        const key = seg.dataset.set;
        const v = key === 'sensitivity' ? Number(b.dataset.v) : b.dataset.v;
        setSetting(game, key, v);
        seg.querySelectorAll('button').forEach((o) => o.classList.toggle('is-on', o === b));
        if (onChange) onChange(settings(game));
      })
    );
  }

  // ---------------- daily ----------------

  function dailyState(game) {
    const g = gid(game);
    const d = readJson(dKey(g), null);
    const day = today();
    return d && d.day === day ? d : { day, started: false, done: false, token: null, result: null };
  }

  /** First start of the day is the scored attempt; everything after is practice. */
  async function startDaily(game) {
    const g = gid(game);
    const d = dailyState(g);
    if (d.started) return { scored: false, state: d };
    d.started = true;
    d.startedAt = Date.now();
    writeJson(dKey(g), d);
    if (signedIn()) {
      const out = await api('daily_start', { game: g, dayNo: d.day });
      if (out) {
        if (out.scored) d.token = out.token;
        else d.elsewhere = true;
        writeJson(dKey(g), d);
        return { scored: !!out.scored, state: d };
      }
    }
    return { scored: true, state: d, offline: true };
  }

  /** Scored Daily finished. `run` is the plausibility payload; `result` = { score, line } for display. */
  async function finishDaily(game, run, result) {
    const g = gid(game);
    const d = dailyState(g);
    if (!d.started || d.done || d.elsewhere) return { scored: false };
    d.done = true;
    d.result = result || null;
    writeJson(dKey(g), d);
    update(g, (p) => Core().recordDaily(p, d.day));
    let res = null;
    if (signedIn() && d.token) res = await submit(g, Core().boardId(g, 'daily', d.day), run, d.token);
    d.submit = res ? { ranked: !!res.ranked, reason: res.reason || null } : null;
    writeJson(dKey(g), d);
    if (signedIn()) sync(g);
    return Object.assign({ scored: true }, res || {});
  }

  function streak(game) {
    return Core().liveStreak(load(game), today());
  }

  function countdown() {
    const ms = Core().msToMidnight(new Date());
    const h = Math.floor(ms / 3600000);
    const m = Math.floor((ms % 3600000) / 60000);
    return h ? h + 'h ' + m + 'm' : m + 'm';
  }

  /**
   * Daily entry sheet. o: { title, detail, onPlay(scored), boardTitle }.
   * Shows the streak, whether this try counts, time until the next one, and the leaderboard.
   */
  function openDaily(game, o) {
    const g = gid(game);
    const d = dailyState(g);
    const st = streak(g);
    const fresh = !d.started;
    const resLine = d.result && d.result.line ? `<div class="solo-daily-res">${esc(tr('yourResult', 'Your result'))}: <b>${esc(d.result.line)}</b></div>` : '';
    const body = `<div class="solo-daily">
      <div class="solo-daily-head"><span class="solo-daily-ico">${ICON[g] || '★'}</span><div><b>${esc(o.title || tr('daily', 'Daily Challenge'))}</b><span>${esc(o.detail || '')}</span></div></div>
      <div class="solo-daily-stats"><div><b>${st}</b><span>${esc(tr('streak', 'Day streak'))}</span></div><div><b>${countdown()}</b><span>${esc(tr('nextIn', 'Next one in'))}</span></div></div>
      ${resLine}
      <p class="solo-note">${esc(fresh ? tr('firstCounts', 'Same board for everyone today. Your first try counts — replays after that are practice.') : tr('practiceNow', 'You’ve had today’s scored try. Play again as practice as often as you like.'))}</p>
      <div class="solo-actions">
        <button type="button" class="solo-btn solo-btn--primary" data-d="play">${esc(fresh ? tr('playDaily', 'Play today’s challenge') : tr('practice', 'Practice'))}</button>
        <button type="button" class="solo-btn" data-d="board">${esc(tr('leaderboard', 'Leaderboard'))}</button>
      </div></div>`;
    const x = sheet({ title: tr('daily', 'Daily Challenge'), bodyHtml: body });
    if (!x || !x.el) return o.onPlay && o.onPlay(fresh);
    x.el.querySelector('[data-d="play"]').addEventListener('click', () => {
      x.close();
      if (o.onPlay) o.onPlay(fresh);
    });
    x.el.querySelector('[data-d="board"]').addEventListener('click', () => openBoard(g, Core().boardId(g, 'daily', d.day), { title: o.boardTitle || o.title }));
  }

  // ---------------- scores + leaderboards ----------------

  async function submit(game, board, run, token) {
    const out = await api('submit', { game: gid(game), board, run, token: token || undefined });
    return out || null;
  }

  function fmtMs(ms) {
    const s = Math.max(0, Math.round((Number(ms) || 0) / 1000));
    const h = Math.floor(s / 3600);
    const m = Math.floor((s % 3600) / 60);
    const sec = String(s % 60).padStart(2, '0');
    return h ? h + ':' + String(m).padStart(2, '0') + ':' + sec : m + ':' + sec;
  }
  function valueHtml(game, r) {
    if (gid(game) === 'ankjod') return esc(fmtMs(r.ms)) + (r.hints ? ` <small>+${r.hints} ${r.hints === 1 ? 'hint' : 'hints'}</small>` : '');
    const stars = r.stars ? ` <small class="solo-stars">${'★'.repeat(r.stars)}</small>` : '';
    return esc(Number(r.score || 0).toLocaleString()) + stars;
  }
  function rowsHtml(game, rows, empty) {
    if (!rows || !rows.length) return `<div class="solo-empty">${esc(empty)}</div>`;
    return `<ol class="solo-lb-rows">${rows
      .map((r, i) => `<li class="${r.me ? 'is-me' : ''}"><span class="solo-lb-place">${i + 1}</span><span class="solo-lb-name">${esc(r.me ? tr('you', 'You') : r.name)}</span><span class="solo-lb-val">${valueHtml(game, r)}</span></li>`)
      .join('')}</ol>`;
  }

  /** Friends (people you follow) + everyone tabs for one board. */
  async function openBoard(game, board, o) {
    const g = gid(game);
    const opts = o || {};
    const x = sheet({
      title: opts.title || tr('leaderboard', 'Leaderboard'),
      bodyHtml: `<div class="solo-lb"><div class="solo-seg solo-lb-tabs"><button type="button" data-tab="friends" class="is-on">${esc(tr('friends', 'Friends'))}</button><button type="button" data-tab="top">${esc(tr('everyone', 'Everyone'))}</button></div>
        <div class="solo-lb-list"><div class="solo-empty">${esc(tr('loading', 'Loading…'))}</div></div></div>`,
    });
    if (!x || !x.el) return;
    const list = x.el.querySelector('.solo-lb-list');
    if (!signedIn()) {
      list.innerHTML = `<div class="solo-empty">${esc(tr('signInBoards', 'Sign in to see how you rank against friends.'))}</div>`;
      return;
    }
    const data = await api('board', { game: g, board });
    if (!x.el.isConnected) return;
    if (!data) {
      list.innerHTML = `<div class="solo-empty">${esc(tr('boardOffline', 'Couldn’t load the leaderboard — try again in a moment.'))}</div>`;
      return;
    }
    const render = (tab) => {
      list.innerHTML =
        tab === 'top'
          ? rowsHtml(g, data.top, tr('noScores', 'No scores yet — be the first.')) + (data.me && !data.myPlace ? `<p class="solo-note">${esc(tr('yourBest', 'Your best'))}: ${valueHtml(g, data.me)}</p>` : '')
          : rowsHtml(g, data.friends, tr('noFriendScores', 'None of the people you follow have played this yet. Send them a challenge!'));
    };
    render('friends');
    x.el.querySelector('.solo-lb-tabs').addEventListener('click', (e) => {
      const b = e.target.closest('button[data-tab]');
      if (!b) return;
      x.el.querySelectorAll('.solo-lb-tabs button').forEach((o2) => o2.classList.toggle('is-on', o2 === b));
      render(b.dataset.tab);
    });
  }

  // ---------------- share · challenge links · chat cards ----------------

  function beatLink(game, score, params) {
    const extra = {};
    Object.keys(params || {}).forEach((k) => {
      if (params[k] != null && params[k] !== '') extra[k] = params[k];
    });
    if (typeof buildBeatScoreLink === 'function') return buildBeatScoreLink(gid(game), score, { extra });
    const q = new URLSearchParams(Object.assign({ score: String(score) }, extra));
    return location.origin + '/challenge/' + gid(game) + '?' + q.toString();
  }

  async function sendCardTo(friend, att, text) {
    if (!signedIn()) return toast(tr('signIn', 'Sign in to send this to a friend'));
    if (typeof sendRealtimeMessage !== 'function') return false;
    let chatId = friend.chatId || friend.firestoreId || '';
    if (!chatId && (friend.uid || friend.id) && typeof openPeerDm === 'function') {
      try {
        await openPeerDm({ uid: friend.uid || friend.id, origin: 'solo', seedHello: false });
        const open = window.currentOpenChat;
        chatId = open ? open.firestoreId || open.id : '';
      } catch (e) {}
    }
    if (!chatId) return false;
    try {
      await sendRealtimeMessage(chatId, text, false, null, att);
      toast(tr('sent', 'Sent to') + ' ' + (friend.name || tr('yourFriend', 'your friend')));
      return true;
    } catch (e) {
      toast(tr('sendFailed', 'Couldn’t send — try again'));
      return false;
    }
  }

  /**
   * Spoiler-free result share. info: { title, line, score, params, label, meta }
   *   title  "Daily #270" / "Level 12" / "Medium #4"      line  "18,240 pts" / "4:05 · no hints" / "★★★ 9,120"
   *   params board params for the challenge link          label chip text for the target ("4:05")
   */
  function share(game, info) {
    const g = gid(game);
    const i = info || {};
    const params = Object.assign({}, i.params || {}, i.label ? { label: i.label } : {});
    const url = beatLink(g, i.score, params);
    const text = i.text || `${label(g)} ${i.title}: ${i.line}. Can you beat it?`;
    const stats = { score: i.score, scoreLine: i.line, meta: [i.title, i.meta].filter(Boolean).join(' · '), url, text, linkExtra: params };
    const me =
      (typeof userProfile !== 'undefined' && userProfile && (userProfile.name || userProfile.username)) ||
      (typeof currentUser !== 'undefined' && currentUser && currentUser.displayName) ||
      '';
    const att = { type: 'solo_result', game: g, title: String(i.title || '').slice(0, 40), line: String(i.line || '').slice(0, 60), score: i.score, params, url, from: String(me).slice(0, 40) };
    if (typeof openUnifiedShareSheet === 'function') {
      return openUnifiedShareSheet({
        gameId: g,
        title: tr('shareTitle', 'Share your result'),
        subtitle: `${label(g)} · ${i.title}`,
        stats,
        onFriend: (st, friend) => sendCardTo(friend, att, text),
      });
    }
    if (typeof shareGameResult === 'function') return shareGameResult(g, stats);
    return null;
  }

  function chatCardHtml(att, m) {
    const g = gid(att.game);
    const params = att.params && typeof att.params === 'object' ? att.params : {};
    const clean = {};
    Object.keys(params)
      .slice(0, 8)
      .forEach((k) => (clean[String(k).replace(/[^a-z]/gi, '').slice(0, 10)] = String(params[k]).slice(0, 40)));
    const from = String(att.from || '').slice(0, 40);
    return `<div class="solo-card"><div class="solo-card-head">${ICON[g] || '★'} <strong>${esc(label(g))}</strong><span>${esc(att.title || '')}</span></div>
      <div class="solo-card-line">${esc(att.line || (m && m.text) || '')}</div>
      <button type="button" class="solo-card-btn" data-solo-open="${esc(g)}" data-solo-params="${esc(JSON.stringify(clean))}" data-solo-score="${esc(att.score == null ? '' : att.score)}" data-solo-from="${esc(from)}">${esc(tr('beatIt', 'Beat it'))}</button></div>`;
  }

  function launchWith(game, params, score, challenger) {
    const g = gid(game);
    const reg = typeof getGame === 'function' ? getGame(g) : null;
    const ctx = { source: 'challenge', params: params || {}, beatScore: score, challenger: challenger || '' };
    if (reg && typeof reg.launch === 'function') return reg.launch(ctx);
    return null;
  }

  if (typeof document !== 'undefined') {
    document.addEventListener('click', (e) => {
      const b = e.target.closest && e.target.closest('[data-solo-open]');
      if (!b) return;
      e.preventDefault();
      let params = {};
      try {
        params = JSON.parse(b.dataset.soloParams || '{}');
      } catch (err) {}
      const sc = b.dataset.soloScore;
      launchWith(b.dataset.soloOpen, params, sc === '' ? null : Number(sc), b.dataset.soloFrom || '');
    });
  }

  /** Banner for a challenge launch: "Beat Sam — 4:05". */
  function targetHtml(ctx) {
    if (!ctx || ctx.source !== 'challenge') return '';
    const p = ctx.params || {};
    const target = p.label || (Number.isFinite(ctx.beatScore) ? Number(ctx.beatScore).toLocaleString() : '');
    if (!target) return '';
    const who = ctx.challenger ? esc(ctx.challenger) : esc(tr('yourFriend', 'your friend'));
    return `<div class="solo-target">🎯 ${esc(tr('beat', 'Beat'))} ${who}: <b>${esc(target)}</b></div>`;
  }

  function sheet(o) {
    if (window.PartyKit && typeof PartyKit.openSheet === 'function') return PartyKit.openSheet(o);
    return null;
  }

  /** Shared result block for all three games: title, lines, one primary action + overflow. */
  function resultHtml(o) {
    const lines = (o.lines || []).filter(Boolean).map((l) => `<div class="solo-res-line">${l}</div>`).join('');
    const status = o.status ? `<div class="solo-res-status">${esc(o.status)}</div>` : '';
    return `<div class="solo-res">
      <div class="solo-res-title">${esc(o.title || '')}</div>
      ${o.stars != null ? `<div class="solo-res-stars" aria-label="${o.stars} of 3 stars">${[1, 2, 3].map((k) => `<span class="${k <= o.stars ? 'is-on' : ''}">★</span>`).join('')}</div>` : ''}
      ${lines}${status}
      <div class="solo-actions">
        ${o.primary ? `<button type="button" class="solo-btn solo-btn--primary" data-res="primary">${esc(o.primary)}</button>` : ''}
        ${o.secondary ? `<button type="button" class="solo-btn" data-res="secondary">${esc(o.secondary)}</button>` : ''}
      </div>
      <div class="solo-actions solo-actions--quiet">
        ${o.share !== false ? `<button type="button" class="solo-link" data-res="share">${esc(tr('share', 'Share / challenge'))}</button>` : ''}
        ${o.board ? `<button type="button" class="solo-link" data-res="board">${esc(tr('leaderboard', 'Leaderboard'))}</button>` : ''}
        ${o.close !== false ? `<button type="button" class="solo-link" data-res="close">${esc(o.closeLabel || tr('menu', 'Menu'))}</button>` : ''}
      </div></div>`;
  }
  function wireResult(root, handlers) {
    if (!root) return;
    root.querySelectorAll('[data-res]').forEach((b) =>
      b.addEventListener('click', (e) => {
        e.preventDefault();
        const fn = handlers[b.dataset.res];
        if (fn) fn();
      })
    );
  }

  /** Honest one-liner for a submit result (shown under the result, never blocking). */
  function submitNote(res) {
    if (!res) return signedIn() ? '' : tr('signInRank', 'Sign in to join the leaderboard.');
    if (res.ranked === false && res.reason === 'practice') return tr('practiceRun', 'Practice run — not ranked.');
    if (res.accepted === false) return tr('keptLocal', 'Saved on this phone. This run couldn’t be verified, so it isn’t ranked.');
    if (res.ranked && res.improved === false) return tr('notBetter', 'Ranked — your earlier best still stands.');
    if (res.ranked) return tr('ranked', 'Ranked on the leaderboard.');
    return '';
  }

  window.SoloHub = {
    LABEL,
    DEFAULTS,
    label,
    today,
    signedIn,
    load,
    save,
    update,
    sync,
    settings,
    setSetting,
    reducedMotion,
    feedback,
    openSettings,
    dailyState,
    startDaily,
    finishDaily,
    streak,
    countdown,
    openDaily,
    submit,
    submitNote,
    openBoard,
    fmtMs,
    beatLink,
    share,
    chatCardHtml,
    launchWith,
    targetHtml,
    resultHtml,
    wireResult,
    sheet,
  };
})();
