/**
 * Quiz Muqabala (Dangal P6) — Daily Quiz, Duel (rated Live 1v1), Party Quiz (2–50), Practice, News Quiz.
 *
 * Live rooms: party_room game `quizroom` → server-lib/quiz-engine.js (questions + grading on the server;
 * the public room state never carries the right answer before the reveal).
 * Solo modes: POST /api/media-config { action: 'quiz', op } → server-lib/quiz-service.js.
 * Timing: questions open at a server time (`startAt` / `servedAt`); the ring counts down on the
 * server clock (PartyKit connectRoom().serverNow or the offset from the last response).
 */
(function () {
  'use strict';

  const GAME = 'quiz';
  const ROOM = 'quizroom';
  const LABEL = 'Quiz Muqabala';
  const PREFS_KEY = 'chaupaal_quiz_prefs';
  const PARTY_KEY = 'chaupaal_quiz_party';
  const SOUND_KEY = 'chaupaal_quiz_sound';
  const Core = () => window.QuizCore;
  const Kit = () => window.PartyKit;
  const CK = () => window.ClassicsKit;
  const esc = (s) =>
    String(s == null ? '' : s).replace(/[&<>"']/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[ch]);
  const tr = (key, fallback) => (typeof t === 'function' ? t('quiz.' + key, fallback) : fallback);
  const toast = (m) => m && typeof showToast === 'function' && showToast(m);
  const fmt = (n) => Number(n || 0).toLocaleString();
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
  const soundOn = () => readJson(SOUND_KEY, true) !== false;
  function fx(kind) {
    if (!soundOn()) return;
    const K = Kit();
    if (!K) return;
    if (kind === 'right') K.ding();
    else if (kind === 'wrong') K.buzz();
  }
  function localDay() {
    const d = new Date();
    return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
  }
  const catOf = (id) => (Core().CATEGORIES.find((c) => c.id === id) || { label: id, icon: '❓' });

  // ---------------- server calls ----------------

  let offset = 0;
  const serverNow = () => Date.now() + offset;
  async function quizCall(op, args) {
    if (typeof apiFetch !== 'function') throw Object.assign(new Error('Offline'), { code: 'OFFLINE' });
    const res = await apiFetch('/api/media-config', { method: 'POST', needAuth: true, body: Object.assign({ action: 'quiz', op }, args || {}) });
    if (!res || !res.ok) {
      const e = new Error((res && res.error && res.error.message) || 'Something went wrong');
      e.code = (res && res.error && res.error.code) || 'ERROR';
      throw e;
    }
    const d = res.data || {};
    if (Number(d.serverNow)) offset = Number(d.serverNow) - Date.now();
    return d;
  }
  function callError(e) {
    if (e && e.code === 'VALIDATION_ERROR' && e.message) return e.message;
    if (e && e.code === 'RATE_LIMITED') return tr('slow', 'Slow down a little — try again in a moment');
    return typeof navigator !== 'undefined' && navigator.onLine === false ? tr('offline', 'You’re offline — reconnect to play') : tr('failed', 'Couldn’t reach the quiz — try again');
  }

  // ---------------- shared pieces ----------------

  const RING_R = 26;
  const RING_C = 2 * Math.PI * RING_R;
  function ringHtml() {
    return `<div class="qz-ring" data-ring><svg viewBox="0 0 60 60" aria-hidden="true"><circle class="qz-ring-bg" cx="30" cy="30" r="${RING_R}"/><circle class="qz-ring-fg" cx="30" cy="30" r="${RING_R}" stroke-dasharray="${RING_C.toFixed(1)}" stroke-dashoffset="0"/></svg><span data-secs></span></div>`;
  }
  /** Paint the countdown ring. frac: 1 → full, 0 → empty; label: centre text. */
  function paintRing(root, frac, label, urgent) {
    const ring = root.querySelector('[data-ring]');
    if (!ring) return;
    ring.querySelector('.qz-ring-fg').setAttribute('stroke-dashoffset', (RING_C * (1 - Math.max(0, Math.min(1, frac)))).toFixed(1));
    ring.querySelector('[data-secs]').textContent = label;
    ring.classList.toggle('is-urgent', !!urgent);
  }
  function optionsHtml(q) {
    const keys = ['A', 'B', 'C', 'D'];
    return (q.options || []).map((o, i) => `<button type="button" class="qz-opt" data-opt="${i}" disabled><span class="qz-opt-key">${keys[i]}</span><span class="qz-opt-text">${esc(o)}</span></button>`).join('');
  }
  function markOptions(root, o) {
    root.querySelectorAll('[data-opt]').forEach((b) => {
      const i = Number(b.dataset.opt);
      b.classList.toggle('is-picked', o.picked === i);
      b.classList.toggle('is-correct', o.correct === i);
      b.classList.toggle('is-wrong', o.correct != null && o.picked === i && o.correct !== i);
      b.classList.toggle('is-dim', o.correct != null && o.correct !== i && o.picked !== i);
      b.disabled = !o.enabled;
      const n = o.counts && o.counts[i];
      let c = b.querySelector('.qz-opt-count');
      if (n != null && o.correct != null) {
        if (!c) {
          c = document.createElement('span');
          c.className = 'qz-opt-count';
          b.appendChild(c);
        }
        c.textContent = n;
      } else if (c) c.remove();
    });
  }
  function popHtml(gained, streak) {
    if (!gained) return '';
    return `<div class="qz-pop">+${fmt(gained)}${streak >= 2 ? `<span class="qz-flame" aria-label="${esc(tr('streak', 'Streak'))}">🔥${streak}</span>` : ''}</div>`;
  }

  function openReport(qid) {
    if (!qid) return;
    const K = Kit();
    const reasons = [
      ['wrong', tr('rWrong', 'The answer is wrong')],
      ['unclear', tr('rUnclear', 'The question is unclear')],
      ['offensive', tr('rOffensive', 'It’s offensive')],
    ];
    K.openSheet({
      title: tr('reportQ', 'Report this question'),
      bodyHtml: `<div class="qz-report">${reasons.map(([id, l]) => `<button type="button" class="pk-row-btn" data-reason="${id}">${esc(l)}</button>`).join('')}
        <input class="pk-input" data-note maxlength="240" placeholder="${esc(tr('reportNote', 'Anything else? (optional)'))}"></div>`,
      onMount(el, close) {
        el.querySelectorAll('[data-reason]').forEach((b) =>
          b.addEventListener('click', async () => {
            b.disabled = true;
            try {
              await quizCall('report', { qid, reason: b.dataset.reason, note: el.querySelector('[data-note]').value });
              toast(tr('reported', 'Thanks — we’ll review it'));
              close();
            } catch (e) {
              b.disabled = false;
              toast(callError(e));
            }
          })
        );
      },
    });
  }

  function shareText(line) {
    const K = Kit();
    if (K && K.shareLine) K.shareLine(GAME, LABEL, line);
    else if (navigator.share) navigator.share({ title: LABEL, text: line }).catch(() => {});
  }

  function openRules() {
    const R = window.DangalRules && window.DangalRules.get ? window.DangalRules.get('quiz') : null;
    const rules = (R && R.rules) || [];
    Kit().openSheet({
      title: tr('rulesTitle', 'How Quiz Muqabala works'),
      bodyHtml: `<div class="cl-rules">${rules.map((r) => `<div class="cl-sub">${esc(r.h)}</div><p class="cl-note">${esc(r.body)}</p>`).join('')}</div>`,
    });
  }

  // ---------------- solo runner (Daily / Practice / News) ----------------

  /**
   * One question on screen with a server-timed ring. Resolves with the tapped index (or null on timeout).
   * o: { body, q, servedAt, limitMs, header, onPick }
   */
  function mountSoloQuestion(body, o) {
    const q = o.q;
    const c = catOf(q.category);
    body.innerHTML = `<div class="qz-live qz-solo">
      <div class="qz-top"><span>${esc(o.header || '')}</span><span class="qz-cat">${c.icon} ${esc(tr('cat.' + q.category, c.label))}</span><span data-score>${esc(o.scoreLine || '')}</span></div>
      <div class="qz-card">${ringHtml()}<div class="qz-prompt">${esc(q.prompt)}</div></div>
      <div class="qz-opts" data-opts>${optionsHtml(q)}</div>
      <div class="qz-feedback" data-fb aria-live="polite"></div>
    </div>`;
    let done = false;
    let picked = null;
    let resolve;
    const result = new Promise((r) => (resolve = r));
    const finish = (i) => {
      if (done) return;
      done = true;
      picked = i;
      markOptions(body, { picked: i, enabled: false });
      resolve(i);
    };
    body.querySelectorAll('[data-opt]').forEach((b) => b.addEventListener('click', () => finish(Number(b.dataset.opt))));
    const timer = setInterval(() => {
      if (!body.isConnected) return clearInterval(timer);
      const now = serverNow();
      if (now < o.servedAt) {
        paintRing(body, 1, String(Math.ceil((o.servedAt - now) / 1000)));
        return;
      }
      if (!done) markOptions(body, { enabled: true });
      const left = o.servedAt + o.limitMs - now;
      paintRing(body, left / o.limitMs, String(Math.max(0, Math.ceil(left / 1000))), left < 5000);
      if (left <= 0 && !done) finish(null);
      if (done) clearInterval(timer);
    }, 100);
    return {
      result,
      reveal(rv) {
        clearInterval(timer);
        markOptions(body, { picked, correct: rv.correct, enabled: false });
        const fb = body.querySelector('[data-fb]');
        const right = rv.isCorrect;
        fx(right ? 'right' : 'wrong');
        fb.innerHTML = `${right ? popHtml(rv.gained, rv.streak) : `<div class="qz-verdict is-wrong">${esc(picked == null ? tr('timeUp', 'Time’s up') : tr('notQuite', 'Not quite'))}</div>`}
          ${rv.explanation ? `<p class="qz-explain">${esc(rv.explanation)}</p>` : ''}
          <div class="qz-fb-row"><button type="button" class="pk-link" data-report>${esc(tr('report', 'Report question'))}</button>${o.nextLabel ? `<button type="button" class="pk-btn pk-btn--primary" data-next>${esc(o.nextLabel)}</button>` : ''}</div>`;
        fb.querySelector('[data-report]').addEventListener('click', () => openReport(rv.qid || q.id));
        return fb.querySelector('[data-next]');
      },
    };
  }

  const wait = (ms) => new Promise((r) => setTimeout(r, Math.max(0, ms)));

  async function openDaily() {
    const K = Kit();
    if (!K.requireSignIn()) return;
    const day = localDay();
    const shell = K.openShell({ gameId: GAME, title: tr('daily', 'Daily Quiz'), subtitle: day });
    shell.render('<div class="pk-empty">' + esc(tr('loading', 'Loading…')) + '</div>');
    let s;
    try {
      s = await quizCall('daily_start', { day });
    } catch (e) {
      shell.render(`<div class="pk-empty">${esc(callError(e))}</div>`);
      return;
    }
    let score = s.score || 0;
    while (!s.done && !shell.closed) {
      const header = tr('question', 'Question') + ' ' + (s.qn + 1) + '/' + s.total;
      const view = mountSoloQuestion(shell.body, { q: s.q, servedAt: s.servedAt, limitMs: s.limitMs, header, scoreLine: fmt(score) });
      const i = await view.result;
      if (shell.closed) return;
      let out;
      try {
        out = await quizCall('daily_answer', { day, qn: s.qn, i });
      } catch (e) {
        toast(callError(e));
        try {
          s = await quizCall('daily_start', { day });
          continue;
        } catch (err) {
          return;
        }
      }
      if (out.reveal) view.reveal(Object.assign({ streak: 0 }, out.reveal));
      score = out.score || score;
      if (out.done) {
        await wait(2200);
        return renderDailyDone(shell, day, out.final);
      }
      s = Object.assign({}, out, { done: false });
      await wait(out.servedAt - serverNow() - 200);
    }
    if (s.done && !shell.closed) renderDailyDone(shell, day, s.final);
  }

  function renderDailyDone(shell, day, final) {
    if (shell.closed) return;
    const f = final || {};
    const body = shell.render(`<div class="pk-page qz-done">
      <div class="qz-done-title">${esc(tr('dailyDone', 'Daily Quiz done'))}</div>
      <div class="qz-big-score">${fmt(f.score)}</div>
      <div class="qz-done-sub">${f.correct || 0}/${f.total || 10} ${esc(tr('correct', 'correct'))} · 🔥 ${f.streak || 1} ${esc(tr('dayStreak', 'day streak'))}</div>
      <div class="qz-grid" aria-label="${esc(tr('resultGrid', 'Your results'))}">${esc(f.grid || '')}</div>
      <button type="button" class="pk-btn pk-btn--primary pk-btn--block" data-share>${esc(tr('share', 'Share'))}</button>
      <div class="qz-board-tabs">${Kit().segHtml('scope', 'global', [['global', tr('global', 'Everyone')], ['friends', tr('friends', 'Friends')]])}</div>
      <div data-board><p class="pk-sub">${esc(tr('loading', 'Loading…'))}</p></div>
      <p class="pk-sub">${esc(tr('nextDaily', 'A new Daily Quiz arrives at your midnight.'))}</p>
    </div>`);
    body.querySelector('[data-share]').addEventListener('click', () => shareText(`${tr('daily', 'Daily Quiz')} ${day} · ${f.correct || 0}/${f.total || 10} · ${fmt(f.score)}\n${f.grid || ''}`));
    const state = { scope: 'global' };
    const load = async () => {
      const host = body.querySelector('[data-board]');
      try {
        const b = await quizCall('daily_board', { day, scope: state.scope });
        host.innerHTML = b.rows.length
          ? `<ol class="cl-rank qz-rank">${b.rows
              .map((r, i) => `<li class="${r.me ? 'is-me' : ''}"><span class="cl-rank-place">${i + 1}</span><span class="cl-rank-name">${esc(r.me ? tr('you', 'You') : r.name)}</span><small>${r.correct}/10</small><b>${fmt(r.score)}</b></li>`)
              .join('')}</ol>`
          : `<p class="pk-sub">${esc(state.scope === 'friends' ? tr('noFriends', 'None of the people you follow have played today yet.') : tr('noScores', 'No scores yet.'))}</p>`;
      } catch (e) {
        host.innerHTML = `<p class="pk-sub">${esc(callError(e))}</p>`;
      }
    };
    Kit().wireSegs(body, state, load);
    load();
  }

  function prefs() {
    return Object.assign({ category: null, difficulty: 0, region: null }, readJson(PREFS_KEY, {}) || {});
  }

  function openPracticeSettings(onDone) {
    const K = Kit();
    const C = Core();
    const cur = prefs();
    K.openSheet({
      title: tr('settings', 'Settings'),
      bodyHtml: `<div class="cl-setup">
        <div class="cl-sub">${esc(tr('category', 'Category'))}</div>
        <div class="qz-cats">${[['', '🎲', tr('mixed', 'Mixed')]].concat(C.CATEGORIES.map((c) => [c.id, c.icon, tr('cat.' + c.id, c.label)])).map(([id, icon, l]) => `<button type="button" class="qz-cat-chip${(cur.category || '') === id ? ' is-on' : ''}" data-cat="${id}">${icon} ${esc(l)}</button>`).join('')}</div>
        <div class="cl-sub">${esc(tr('difficulty', 'Difficulty'))}</div>
        ${K.segHtml('difficulty', Number(cur.difficulty) || 0, [[0, tr('any', 'Any')], [1, tr('easy', 'Easy')], [2, tr('medium', 'Medium')], [3, tr('hard', 'Hard')]])}
        <details class="cl-advanced"><summary>${esc(tr('advanced', 'Advanced'))}</summary>
          <div class="cl-sub">${esc(tr('regional', 'Regional questions (optional)'))}</div>
          ${K.segHtml('region', cur.region || '', [['', tr('none', 'None')]].concat(C.REGIONS.map((r) => [r.id, tr('region.' + r.id, r.label)])))}
          <label class="cl-pref"><span><b>${esc(tr('sound', 'Sounds & haptics'))}</b></span><input type="checkbox" data-sound ${soundOn() ? 'checked' : ''}></label>
        </details>
        <button type="button" class="pk-btn pk-btn--primary pk-btn--block" data-save>${esc(tr('save', 'Save'))}</button>
      </div>`,
      onMount(el, close) {
        K.wireSegs(el, cur, () => {});
        el.querySelectorAll('[data-cat]').forEach((b) =>
          b.addEventListener('click', () => {
            cur.category = b.dataset.cat || null;
            el.querySelectorAll('[data-cat]').forEach((x) => x.classList.toggle('is-on', x === b));
          })
        );
        el.querySelector('[data-save]').addEventListener('click', () => {
          writeJson(PREFS_KEY, { category: cur.category || null, difficulty: Number(cur.difficulty) || 0, region: cur.region || null });
          writeJson(SOUND_KEY, el.querySelector('[data-sound]').checked);
          close();
          if (onDone) onDone();
        });
      },
    });
  }

  async function openSolo(mode, opts) {
    const K = Kit();
    if (!K.requireSignIn()) return;
    const news = mode === 'news';
    const o = opts || {};
    if (o.category) writeJson(PREFS_KEY, Object.assign(prefs(), { category: o.category }));
    const shell = K.openShell({ gameId: GAME, title: news ? tr('news', 'News Quiz') : tr('practice', 'Practice'), subtitle: news ? tr('newsSub', 'From this week’s Akhbaar') : tr('practiceSub', 'Unrated · unlimited') });
    let restart = true;
    let total = { score: 0, correct: 0, n: 0 };
    const loop = async () => {
      while (!shell.closed) {
        shell.render('<div class="pk-empty">' + esc(tr('loading', 'Loading…')) + '</div>');
        const p = prefs();
        let s;
        try {
          s = await quizCall('solo_next', { mode: news ? 'news' : 'practice', category: p.category, difficulty: p.difficulty, region: p.region, restart });
        } catch (e) {
          shell.render(`<div class="pk-empty">${esc(callError(e))}</div>`);
          return;
        }
        restart = false;
        if (s.done || s.empty) return renderSoloDone(shell, news, total, s.empty);
        const header = news ? tr('question', 'Question') + ' ' + s.q.n + '/' + (s.total || 5) : '#' + s.q.n;
        const view = mountSoloQuestion(shell.body, { q: s.q, servedAt: s.servedAt, limitMs: s.limitMs, header, scoreLine: fmt(s.score), nextLabel: tr('next', 'Next') });
        if (!news) {
          const bar = document.createElement('div');
          bar.className = 'qz-solo-bar';
          bar.innerHTML = `<button type="button" class="pk-link" data-settings>⚙ ${esc(tr('settings', 'Settings'))}</button><button type="button" class="pk-link" data-end>${esc(tr('finish', 'Finish'))}</button>`;
          shell.body.querySelector('.qz-live').appendChild(bar);
          bar.querySelector('[data-settings]').addEventListener('click', () => openPracticeSettings(() => toast(tr('nextApplies', 'Applies from the next question'))));
          bar.querySelector('[data-end]').addEventListener('click', () => renderSoloDone(shell, news, total));
        }
        const i = await view.result;
        if (shell.closed || !shell.body.querySelector('.qz-live')) return;
        let a;
        try {
          a = await quizCall('solo_answer', { qid: s.q.id, i });
        } catch (e) {
          toast(callError(e));
          continue;
        }
        total = { score: a.score, correct: total.correct + (a.isCorrect ? 1 : 0), n: a.n };
        const next = view.reveal(a);
        if (a.done) {
          await wait(2200);
          return renderSoloDone(shell, news, total);
        }
        await new Promise((r) => {
          const tmr = setTimeout(r, a.isCorrect ? 2500 : 5000);
          if (next)
            next.addEventListener('click', () => {
              clearTimeout(tmr);
              r();
            });
        });
      }
    };
    loop();
  }

  function renderSoloDone(shell, news, total, empty) {
    if (shell.closed) return;
    const body = shell.render(`<div class="pk-page qz-done">
      <div class="qz-done-title">${esc(empty ? tr('allCaught', 'You’re all caught up') : news ? tr('newsDone', 'News Quiz done') : tr('practiceDone', 'Nice practice'))}</div>
      ${empty ? `<p class="pk-sub">${esc(tr('emptySub', 'No new questions for these settings right now.'))}</p>` : `<div class="qz-big-score">${fmt(total.score)}</div><div class="qz-done-sub">${total.correct}/${total.n} ${esc(tr('correct', 'correct'))}</div>`}
      <button type="button" class="pk-btn pk-btn--primary pk-btn--block" data-again>${esc(news ? tr('home', 'Back to Quiz') : tr('again', 'Play more'))}</button>
      ${!empty && total.n ? `<button type="button" class="pk-btn pk-btn--ghost pk-btn--block" data-share>${esc(tr('share', 'Share'))}</button>` : ''}
    </div>`);
    body.querySelector('[data-again]').addEventListener('click', () => Kit().closeThen(shell, () => (news ? openHome() : openSolo('practice'))));
    body.querySelector('[data-share]')?.addEventListener('click', () => shareText(`${news ? tr('news', 'News Quiz') : LABEL}: ${total.correct}/${total.n} · ${fmt(total.score)}`));
  }

  // ---------------- live rooms (Duel / Party) ----------------

  function partyDefaults() {
    return Object.assign({ mode: 'party', categories: [], length: 10, questionMs: 20000, difficulty: 0, region: null, hostPlays: true }, readJson(PARTY_KEY, {}) || {});
  }
  const settingsOf = (ctrl) => (ctrl.view.pub && ctrl.view.pub.settings) || {};
  const isDuel = (ctrl) => settingsOf(ctrl).mode === 'duel';

  function lobbySummary(ctrl) {
    const s = settingsOf(ctrl);
    if (s.mode === 'duel') return tr('duelSummary', 'Duel · 10 questions · 15s · rated');
    const cats = Array.isArray(s.categories) ? s.categories : Object.values(s.categories || {});
    const bits = [(s.length || 10) + ' ' + tr('questions', 'questions'), Math.round((s.questionMs || 20000) / 1000) + 's', cats.length ? cats.map((c) => catOf(c).icon).join('') : tr('allCats', 'All categories')];
    if (Number(s.difficulty)) bits.push(Core().difficultyLabel(Number(s.difficulty)));
    if (s.hostPlays === false) bits.push(tr('bigScreen', 'Big screen'));
    return bits.join(' · ');
  }

  function openRoomSettings(ctrl) {
    if (isDuel(ctrl)) return toast(tr('duelFixed', 'Duels always use 10 mixed questions matched to both players'));
    const K = Kit();
    const C = Core();
    const cur = Object.assign(partyDefaults(), settingsOf(ctrl));
    const cats = new Set(Array.isArray(cur.categories) ? cur.categories : Object.values(cur.categories || {}));
    K.openSheet({
      title: tr('roomSettings', 'Quiz settings'),
      bodyHtml: `<div class="cl-setup">
        <div class="cl-sub">${esc(tr('categories', 'Categories'))} <small>${esc(tr('catsHint', 'none = all'))}</small></div>
        <div class="qz-cats">${C.CATEGORIES.map((c) => `<button type="button" class="qz-cat-chip${cats.has(c.id) ? ' is-on' : ''}" data-cat="${c.id}">${c.icon} ${esc(tr('cat.' + c.id, c.label))}</button>`).join('')}</div>
        <div class="cl-sub">${esc(tr('length', 'Questions'))}</div>
        ${K.segHtml('length', Number(cur.length) || 10, C.PARTY_LENGTHS.map((n) => [n, String(n)]))}
        <details class="cl-advanced"><summary>${esc(tr('advanced', 'Advanced'))}</summary>
          <div class="cl-sub">${esc(tr('timePer', 'Time per question'))}</div>
          ${K.segHtml('questionMs', Number(cur.questionMs) || 20000, [10000, 15000, 20000, 30000].map((n) => [n, n / 1000 + 's']))}
          <div class="cl-sub">${esc(tr('difficulty', 'Difficulty'))}</div>
          ${K.segHtml('difficulty', Number(cur.difficulty) || 0, [[0, tr('mixed', 'Mixed')], [1, tr('easy', 'Easy')], [2, tr('medium', 'Medium')], [3, tr('hard', 'Hard')]])}
          <div class="cl-sub">${esc(tr('regional', 'Regional questions (optional)'))}</div>
          ${K.segHtml('region', cur.region || '', [['', tr('none', 'None')]].concat(C.REGIONS.map((r) => [r.id, tr('region.' + r.id, r.label)])))}
          <label class="cl-pref"><span><b>${esc(tr('bigScreenOnly', 'Big screen only'))}</b><small>${esc(tr('bigScreenDesc', 'Host shows questions on a TV or laptop and doesn’t answer'))}</small></span><input type="checkbox" data-big ${cur.hostPlays === false ? 'checked' : ''}></label>
        </details>
        <button type="button" class="pk-btn pk-btn--primary pk-btn--block" data-save>${esc(tr('save', 'Save'))}</button>
      </div>`,
      onMount(el, close) {
        K.wireSegs(el, cur, () => {});
        el.querySelectorAll('[data-cat]').forEach((b) =>
          b.addEventListener('click', () => {
            if (cats.has(b.dataset.cat)) cats.delete(b.dataset.cat);
            else cats.add(b.dataset.cat);
            b.classList.toggle('is-on', cats.has(b.dataset.cat));
          })
        );
        el.querySelector('[data-save]').addEventListener('click', async () => {
          const next = { mode: 'party', categories: Array.from(cats), length: Number(cur.length), questionMs: Number(cur.questionMs), difficulty: Number(cur.difficulty) || 0, region: cur.region || null, hostPlays: !el.querySelector('[data-big]').checked };
          writeJson(PARTY_KEY, next);
          const out = await ctrl.act('settings', { settings: next });
          if (out) close();
        });
      },
    });
  }

  function canStart(ctrl, players) {
    if (isDuel(ctrl)) {
      if (players.length < 2) return { ok: false, label: settingsOf(ctrl).quick ? tr('finding', 'Finding an opponent…') : tr('waitOpp', 'Waiting for your opponent…') };
      return { ok: true, label: tr('startDuel', 'Start Duel') };
    }
    const need = settingsOf(ctrl).hostPlays === false ? 3 : 2;
    if (players.length < need) return { ok: false, label: tr('needMore', 'Invite at least') + ' ' + (need - players.length) + ' ' + tr('more', 'more') };
    return { ok: true, label: tr('start', 'Start') + ' · ' + players.length + ' ' + tr('players', 'players') };
  }

  const ERR = {
    TOO_EARLY: 'Wait for the question',
    NO_QUESTIONS: 'Not enough questions for those settings — pick more categories',
    NEED_PLAYERS: '',
    PHASE: '',
    OVER: '',
    STALE: '',
  };
  function errorText(e) {
    const code = String((e && e.code) || '').toUpperCase();
    if (code === 'NEED_PLAYERS' && e.message) return e.message;
    if (code in ERR) return ERR[code] ? tr('err.' + code.toLowerCase(), ERR[code]) : null;
    return Kit().roomErrorText ? Kit().roomErrorText(e) : e && e.message;
  }

  function hydrateView(s) {
    const st = s || {};
    st.players = Array.isArray(st.players) ? st.players : Object.values(st.players || {});
    st.answered = st.answered || {};
    st.categories = Array.isArray(st.categories) ? st.categories : Object.values(st.categories || {});
    if (st.question) st.question.options = Array.isArray(st.question.options) ? st.question.options : Object.values(st.question.options || {});
    if (st.reveal) {
      st.reveal.picks = st.reveal.picks || {};
      st.reveal.gained = st.reveal.gained || {};
      st.reveal.ms = st.reveal.ms || {};
      st.reveal.counts = Array.isArray(st.reveal.counts) ? st.reveal.counts : [0, 0, 0, 0];
    }
    if (st.summary) {
      st.summary.history = (Array.isArray(st.summary.history) ? st.summary.history : Object.values(st.summary.history || {})).map((h) =>
        Object.assign({ picks: {}, gained: {} }, h, { options: Array.isArray(h.options) ? h.options : Object.values(h.options || {}) })
      );
    }
    return st;
  }

  /** Two-step server-measured RTT samples (feeds the answer-time allowance). */
  async function measure(code, times) {
    const K = Kit();
    for (let k = 0; k < (times || 1); k++) {
      try {
        const a = await K.roomCall(ROOM, 'ping', { code });
        if (a && a.n) await K.roomCall(ROOM, 'ping', { code, n: a.n });
      } catch (e) {
        return;
      }
    }
  }

  function mountLive(ctrl) {
    const code = ctrl.view.code;
    const big = !!(ctrl.isHost() && ctrl.view.pub.state && ctrl.view.pub.state.hostPlays === false);
    const body = ctrl.render(`<div class="pk-page qz-live${big ? ' qz-big' : ''}">
      ${big ? `<div class="qz-join"><span>${esc(tr('joinAt', 'Join at'))} <b>${esc(location.host)}/party</b></span><span class="qz-join-code">${esc(code)}</span></div>` : ''}
      <div class="qz-top"><span data-qn></span><span class="qz-cat" data-cat></span><span data-me></span><button type="button" class="qz-sound" data-sound aria-label="${esc(tr('sound', 'Sounds & haptics'))}">${soundOn() ? '🔊' : '🔇'}</button></div>
      <div class="qz-opp" data-opp></div>
      <div class="qz-card">${ringHtml()}<div class="qz-prompt" data-prompt></div></div>
      <div class="qz-opts" data-opts></div>
      <div class="qz-feedback" data-fb aria-live="polite"></div>
      <div class="qz-board" data-board></div>
    </div>`);
    const m = { roundNo: ctrl.view.pub.roundNo, body, st: null, qn: -1, picks: {}, fxDone: {}, big, tick: null };
    body.querySelector('[data-sound]').addEventListener('click', (e) => {
      writeJson(SOUND_KEY, !soundOn());
      e.currentTarget.textContent = soundOn() ? '🔊' : '🔇';
    });
    const me = () => ctrl.uid;
    const inGame = () => !!(m.st && m.st.players.some((p) => p.id === me()));
    const now = () => (ctrl.conn ? ctrl.conn.serverNow() : Date.now());

    async function pick(i) {
      const st = m.st;
      if (!st || !st.question || m.picks[st.qn] != null || !inGame()) return;
      if (now() < st.startAt - 50) return;
      m.picks[st.qn] = i;
      markOptions(body, { picked: i, enabled: false });
      const out = await ctrl.act('answer', { qn: st.qn, i });
      if (!out) {
        delete m.picks[st.qn];
        paintOptions();
        return;
      }
      if (out.late) toast(tr('tooLate', 'Too late — time was up'));
      if (typeof navigator !== 'undefined' && navigator.vibrate && soundOn()) navigator.vibrate(12);
    }

    function paintOptions() {
      const st = m.st;
      if (!st || !st.question) return;
      const rv = st.reveal;
      const t = now();
      // After a rejoin the local pick is gone, but the server already has this player's answer.
      const answered = m.picks[st.qn] != null || !!(st.answered && st.answered[me()]);
      const open = !rv && t >= st.startAt && t <= st.endsAt && !answered && inGame() && !m.big;
      markOptions(body, { picked: rv && rv.picks[me()] != null ? rv.picks[me()] : m.picks[st.qn], correct: rv ? rv.correct : null, counts: rv && m.big ? rv.counts : null, enabled: open });
    }

    function clock() {
      const st = m.st;
      if (!st || !st.question || !body.isConnected) return;
      const t = now();
      if (ctrl.view.pub && ctrl.view.pub.paused) return paintRing(body, 1, '⏸');
      if (st.reveal) return paintRing(body, 0, '✓');
      if (t < st.startAt) {
        body.querySelector('[data-prompt]').classList.add('is-ready');
        return paintRing(body, 1, String(Math.ceil((st.startAt - t) / 1000)));
      }
      body.querySelector('[data-prompt]').classList.remove('is-ready');
      const left = st.endsAt - t;
      paintRing(body, left / st.questionMs, String(Math.max(0, Math.ceil(left / 1000))), left < 5000);
      paintOptions();
    }
    m.tick = setInterval(() => {
      if (ctrl.shell.closed || !body.isConnected) return clearInterval(m.tick);
      clock();
    }, 100);

    function standingsHtml(st, limit) {
      const rows = st.players.filter((p) => !p.out || st.mode === 'party').slice(0, limit || 50);
      return `<ol class="cl-rank qz-rank">${rows
        .map((p, i) => `<li class="${p.id === me() ? 'is-me' : ''}${p.out ? ' is-out' : ''}"><span class="cl-rank-place">${i + 1}</span><span class="cl-rank-name">${esc(p.id === me() ? tr('you', 'You') : p.name)}${p.streak >= 2 ? ' 🔥' + p.streak : ''}</span><b>${fmt(p.score)}</b></li>`)
        .join('')}</ol>`;
    }

    m.update = function (st) {
      m.st = st;
      const q = st.question;
      const mine = st.players.find((p) => p.id === me());
      body.querySelector('[data-qn]').textContent = q ? tr('question', 'Question') + ' ' + q.n + '/' + st.total : '';
      const c = q ? catOf(q.category) : null;
      body.querySelector('[data-cat]').textContent = c ? c.icon + ' ' + tr('cat.' + q.category, c.label) : '';
      body.querySelector('[data-me]').textContent = mine ? fmt(mine.score) : '';
      if (q && st.qn !== m.qn) {
        m.qn = st.qn;
        body.querySelector('[data-prompt]').textContent = q.prompt;
        body.querySelector('[data-opts]').innerHTML = optionsHtml(q);
        body.querySelectorAll('[data-opt]').forEach((b) => b.addEventListener('click', () => pick(Number(b.dataset.opt))));
        body.querySelector('[data-fb]').innerHTML = '';
        if (st.qn === 0 || st.qn % 3 === 0) measure(code, 1);
      }
      // Opponent / room progress: who answered, never what.
      const opp = body.querySelector('[data-opp]');
      if (st.mode === 'duel') {
        const other = st.players.find((p) => p.id !== me());
        opp.innerHTML = other
          ? `<span class="qz-opp-name">${esc(other.name)}</span><span class="qz-opp-score">${fmt(other.score)}</span><span class="qz-opp-state${st.answered[other.id] ? ' is-in' : ''}">${st.answered[other.id] ? '✓ ' + esc(tr('answered', 'Answered')) : esc(tr('thinking', 'Thinking…'))}</span>`
          : '';
      } else {
        const live = st.players.filter((p) => !p.out).length;
        const n = Object.keys(st.answered).length;
        opp.innerHTML = st.reveal ? '' : `<span class="qz-opp-state${n ? ' is-in' : ''}">${n}/${live} ${esc(tr('answeredL', 'answered'))}</span>`;
      }
      const fb = body.querySelector('[data-fb]');
      const board = body.querySelector('[data-board]');
      if (st.reveal) {
        const rv = st.reveal;
        const my = rv.picks[me()];
        const right = my != null && my === rv.correct;
        const gained = rv.gained[me()] || 0;
        if (!m.fxDone[st.qn] && inGame()) {
          m.fxDone[st.qn] = true;
          fx(right ? 'right' : 'wrong');
        }
        const key = 'r' + st.qn;
        if (fb.dataset.key !== key) {
          fb.dataset.key = key;
          fb.innerHTML = `${!inGame() ? '' : right ? popHtml(gained, mine && mine.streak) : `<div class="qz-verdict is-wrong">${esc(my == null ? tr('noAnswer', 'No answer') : tr('notQuite', 'Not quite'))}</div>`}
            ${rv.explanation ? `<p class="qz-explain">${esc(rv.explanation)}</p>` : ''}
            <div class="qz-fb-row"><button type="button" class="pk-link" data-report>${esc(tr('report', 'Report question'))}</button></div>`;
          fb.querySelector('[data-report]').addEventListener('click', () => openReport(rv.qid));
        }
        board.innerHTML = st.mode === 'party' ? standingsHtml(st, m.big ? 10 : 5) : '';
      } else {
        fb.dataset.key = '';
        if (!fb.querySelector('.qz-verdict, .qz-pop')) fb.innerHTML = '';
        board.innerHTML = '';
      }
      paintOptions();
      clock();
    };
    m.destroy = () => clearInterval(m.tick);
    return m;
  }

  function renderOver(ctrl, st) {
    if (ctrl.quiz && ctrl.quiz.destroy) ctrl.quiz.destroy();
    ctrl.quiz = null;
    const me = ctrl.uid;
    const set = ctrl.view.pub.settlement;
    const results = (set && set.results) || {};
    const ranked = st.players;
    const myIdx = ranked.findIndex((p) => p.id === me);
    const mine = ranked[myIdx];
    const duel = st.mode === 'duel';
    let title;
    if (duel) {
      const other = ranked.find((p) => p.id !== me);
      if (st.forfeit) title = st.forfeit === me ? tr('youForfeit', 'You left — Duel forfeited') : tr('oppForfeit', 'Your opponent left — you win');
      else if (mine && other && mine.score === other.score && mine.time === other.time) title = tr('draw', 'It’s a draw');
      else title = myIdx === 0 ? tr('youWin', 'You win!') : (other ? other.name : '') + ' ' + tr('wins', 'wins');
    } else title = myIdx === 0 ? tr('youWin', 'You win!') : ranked[0] ? ranked[0].name + ' ' + tr('wins', 'wins') : '';
    if (ctrl.quizOver !== ctrl.view.pub.roundNo) {
      ctrl.quizOver = ctrl.view.pub.roundNo;
      if (mine) {
        CK() && CK().fx && CK().fx(myIdx === 0 ? 'win' : 'lose');
        if (typeof recordGameResult === 'function') recordGameResult(GAME, myIdx === 0);
      }
    }
    const r = results[me] || {};
    const elo = duel && r.eloDelta ? `<div class="qz-elo ${r.eloDelta > 0 ? 'is-up' : 'is-down'}">${r.eloDelta > 0 ? '+' : ''}${r.eloDelta} ${esc(tr('rating', 'rating'))}</div>` : duel && set && set.status === 'pending' ? `<div class="qz-elo">${esc(tr('rating', 'rating'))} …</div>` : '';
    const podium = !duel
      ? `<div class="qz-podium">${[1, 0, 2]
          .map((k) => ranked[k] && `<div class="qz-pod qz-pod-${k + 1}"><div class="qz-pod-name">${esc(ranked[k].id === me ? tr('you', 'You') : ranked[k].name)}</div><div class="qz-pod-score">${fmt(ranked[k].score)}</div><div class="qz-pod-step">${k + 1}</div></div>`)
          .filter(Boolean)
          .join('')}</div>`
      : '';
    const list = `<ol class="cl-rank qz-rank">${ranked
      .map((p, i) => `<li class="${p.id === me ? 'is-me' : ''}"><span class="cl-rank-place">${i + 1}</span><span class="cl-rank-name">${esc(p.id === me ? tr('you', 'You') : p.name)}</span><small>${p.correct}/${st.total}</small><b>${fmt(p.score)}</b></li>`)
      .join('')}</ol>`;
    const hist = (st.summary && st.summary.history) || [];
    const review = hist.length
      ? `<details class="qz-review"><summary>${esc(tr('review', 'Review answers'))}</summary>${hist
          .map((h, i) => {
            const mp = h.picks[me];
            return `<div class="qz-rev"><div class="qz-rev-q">${i + 1}. ${esc(h.prompt)}</div><div class="qz-rev-a">✓ ${esc(h.options[h.correct])}${mp != null && mp !== h.correct ? ` · <span class="is-wrong">✗ ${esc(h.options[mp])}</span>` : ''}</div>
              <button type="button" class="pk-link" data-report="${esc(h.qid)}">${esc(tr('report', 'Report question'))}</button></div>`;
          })
          .join('')}</details>`
      : '';
    const K = Kit();
    const body = ctrl.render(`<div class="pk-page qz-over${ctrl.isHost() && st.hostPlays === false ? ' qz-big' : ''}"><div class="cl-result">
      <div class="cl-result-title">${esc(title)}</div>
      ${elo}
      ${podium}
      ${list}
      ${review}
      ${K.roomResultActions(ctrl, { nextLabel: duel ? tr('rematch', 'Rematch') : tr('again', 'Play again'), waitLabel: tr('waitAgain', 'Waiting for the host…') })}
    </div></div>`);
    body.querySelectorAll('[data-report]').forEach((b) => b.addEventListener('click', () => openReport(b.dataset.report)));
    K.wireRoomResultActions(ctrl, body, {
      nextOp: 'start',
      onShare: () => {
        const grid = hist.map((h) => (h.picks[me] == null ? '⬜' : h.picks[me] === h.correct ? '🟩' : '🟥')).join('');
        shareText(`${LABEL} ${duel ? tr('duel', 'Duel') : tr('party', 'Party')}: ${myIdx >= 0 ? '#' + (myIdx + 1) + '/' + ranked.length + ' · ' : ''}${fmt(mine ? mine.score : 0)}\n${grid}`);
      },
    });
  }

  function renderLive(ctrl, st) {
    if (st.over) return renderOver(ctrl, st);
    let m = ctrl.quiz;
    if (!m || m.roundNo !== ctrl.view.pub.roundNo || !m.body.isConnected) {
      if (m && m.destroy) m.destroy();
      m = ctrl.quiz = mountLive(ctrl);
    }
    m.update(st);
  }

  function openRoom(code, opts) {
    const K = Kit();
    const o = opts || {};
    return K.openRoomScreen({
      game: ROOM,
      label: LABEL,
      code,
      join: !!o.join,
      min: 2,
      max: 50,
      hydrate: hydrateView,
      lobbySummary,
      openSettings: openRoomSettings,
      canStart,
      errorText,
      renderPhase: renderLive,
      onLobbyMount(ctrl, body) {
        if (ctrl.quiz && ctrl.quiz.destroy) ctrl.quiz.destroy();
        ctrl.quiz = null;
        const s = settingsOf(ctrl);
        const players = ctrl.players();
        if (s.mode === 'duel') {
          const sec = body.querySelector('.pk-section');
          if (sec) sec.textContent = tr('inDuel', 'In the Duel') + ' · ' + players.length + '/2';
        }
        if (!ctrl.measured) {
          ctrl.measured = true;
          measure(code, 3);
        }
        if (s.mode === 'duel' && s.quick && ctrl.isHost()) {
          if (players.length >= 2 && !ctrl.autoStarted) {
            ctrl.autoStarted = true;
            setTimeout(() => ctrl.startWith('start'), 600);
          } else if (players.length < 2) keepQueue(ctrl);
        }
      },
    }).then((ctrl) => {
      if (ctrl && ctrl.shell) {
        const close = ctrl.shell.close;
        ctrl.shell.close = function () {
          if (ctrl.quiz && ctrl.quiz.destroy) ctrl.quiz.destroy();
          if (ctrl.queueTimer) {
            clearInterval(ctrl.queueTimer);
            quizCall('duel_cancel').catch(() => {});
          }
          return close.apply(this, arguments);
        };
      }
      return ctrl;
    });
  }

  /** Quick-match host: keep the waiting slot fresh until someone joins. */
  function keepQueue(ctrl) {
    if (ctrl.queueTimer) return;
    const started = Date.now();
    ctrl.queueTimer = setInterval(async () => {
      if (ctrl.shell.closed || ctrl.players().length >= 2) {
        clearInterval(ctrl.queueTimer);
        ctrl.queueTimer = null;
        return;
      }
      if (Date.now() - started > 3 * 60 * 1000) {
        clearInterval(ctrl.queueTimer);
        ctrl.queueTimer = null;
        quizCall('duel_cancel').catch(() => {});
        toast(tr('noOpp', 'No one’s around right now — challenge a friend instead'));
        return;
      }
      try {
        const r = await quizCall('duel_find', { name: Kit().myName() || 'Player' });
        if (r.matched && r.code && r.code !== ctrl.view.code) {
          clearInterval(ctrl.queueTimer);
          ctrl.queueTimer = null;
          await ctrl.act('end');
          Kit().closeThen(ctrl.shell, () => openRoom(r.code, { join: true }));
        }
      } catch (e) {}
    }, 10000);
  }

  async function quickDuel() {
    const K = Kit();
    if (!K.requireSignIn()) return;
    try {
      const r = await quizCall('duel_find', { name: K.myName() || 'Player' });
      if (r.matched) return openRoom(r.code, { join: true });
      return openRoom(r.code, {});
    } catch (e) {
      toast(callError(e));
    }
  }

  function createDuel(chat) {
    Kit().createRoom({ game: ROOM, label: LABEL + ' · ' + tr('duel', 'Duel'), chat: chat || null, settings: { mode: 'duel' }, open: (code) => openRoom(code, {}) });
  }
  function createParty(chat) {
    Kit().createRoom({ game: ROOM, label: LABEL, chat: chat || null, settings: partyDefaults(), open: (code) => openRoom(code, {}) });
  }

  function openDuelSheet() {
    const K = Kit();
    K.openSheet({
      title: tr('duel', 'Duel'),
      bodyHtml: `<p class="cl-note">${esc(tr('duelNote', 'Live 1v1 · 10 questions · rated. Same questions for both of you.'))}</p>
        <button type="button" class="pk-btn pk-btn--primary pk-btn--block" data-quick>${esc(tr('quick', 'Quick match'))}</button>
        <button type="button" class="pk-btn pk-btn--ghost pk-btn--block" data-friend>${esc(tr('challenge', 'Challenge a friend'))}</button>`,
      onMount(el, close) {
        el.querySelector('[data-quick]').addEventListener('click', () => {
          close();
          quickDuel();
        });
        el.querySelector('[data-friend]').addEventListener('click', () => {
          close();
          if (K.requireSignIn()) createDuel(null);
        });
      },
    });
  }

  // ---------------- home ----------------

  async function openHome(o) {
    const K = Kit();
    const opts = o || {};
    const shell = K.openShell({ gameId: GAME, title: LABEL, subtitle: tr('sub', 'Quiz') });
    const day = localDay();
    const render = (h) => {
      const d = (h && h.daily) || null;
      const streak = (h && h.streak && h.streak.streak) || 0;
      const dailySub = d && d.done ? tr('dailyDoneSub', 'Done for today · see the leaderboard') : tr('dailySub', '10 questions · same for everyone · one try');
      shell.render(`<div class="pk-page pk-home qz-home">
        <div class="pk-hero">
          <div class="pk-hero-mark">${typeof gameMarkHtml === 'function' ? gameMarkHtml(GAME, { size: 64 }) : '🧠'}</div>
          <div class="pk-hero-title">${esc(LABEL)}</div>
          <div class="pk-hero-sub">${esc(tr('tag', 'Fast, fair trivia — live with friends or on your own'))}</div>
        </div>
        <div class="pk-modes">
          <button type="button" class="pk-mode pk-mode--primary" data-go="daily"><span class="pk-mode-title">${esc(tr('daily', 'Daily Quiz'))}${streak ? ` <span class="qz-flame">🔥${streak}</span>` : ''}</span><span class="pk-mode-sub">${esc(dailySub)}</span></button>
          <button type="button" class="pk-mode" data-go="duel"><span class="pk-mode-title">${esc(tr('duel', 'Duel'))}</span><span class="pk-mode-sub">${esc(tr('duelSub', 'Live 1v1 · rated'))}</span></button>
          <button type="button" class="pk-mode" data-go="party"><span class="pk-mode-title">${esc(tr('party', 'Party Quiz'))}</span><span class="pk-mode-sub">${esc(tr('partySub', '2–50 players · big-screen friendly'))}</span></button>
          <button type="button" class="pk-mode" data-go="practice"><span class="pk-mode-title">${esc(tr('practice', 'Practice'))}</span><span class="pk-mode-sub">${esc(tr('practiceSub', 'Unrated · unlimited'))}</span></button>
          ${h && h.newsAvailable ? `<button type="button" class="pk-mode" data-go="news"><span class="pk-mode-title">${esc(tr('news', 'News Quiz'))}</span><span class="pk-mode-sub">${esc(tr('newsSub', 'From this week’s Akhbaar'))}</span></button>` : ''}
          <div class="cl-home-links">
            <button type="button" class="pk-link" data-go="join">${esc(tr('join', 'Have a room code? Join'))}</button>
            <button type="button" class="pk-link" data-go="settings">${esc(tr('settings', 'Settings'))}</button>
            <button type="button" class="pk-link" data-go="rules">${esc(tr('rules', 'How it works'))}</button>
          </div>
        </div>
      </div>`);
      const b = shell.body;
      const go = (sel, fn) => b.querySelector('[data-go="' + sel + '"]')?.addEventListener('click', fn);
      go('daily', () => K.closeThen(shell, openDaily));
      go('duel', openDuelSheet);
      go('party', () => {
        if (!K.requireSignIn()) return;
        K.closeThen(shell, () => createParty(opts.chat));
      });
      go('practice', () => K.closeThen(shell, () => openSolo('practice')));
      go('news', () => K.closeThen(shell, () => openSolo('news')));
      go('join', () => K.openJoinSheet((code) => K.closeThen(shell, () => openRoom(code, { join: true }))));
      go('settings', () => openPracticeSettings());
      go('rules', openRules);
    };
    render(null);
    if (!K.isSignedIn()) return;
    try {
      const h = await quizCall('home', { day });
      if (!shell.closed) render(h);
    } catch (e) {}
  }

  const LEGACY_CATS = { gk: 'gk', general: 'gk', world: 'geography', geography: 'geography', sports: 'sports', cricket: 'sports', tech: 'tech', technology: 'tech', science: 'science', business: 'gk', movies: 'movies', bollywood: 'movies', entertainment: 'movies', music: 'music', history: 'history', food: 'food', nature: 'nature', art: 'art', language: 'language' };
  const legacyCategory = (label) => LEGACY_CATS[String(label || '').toLowerCase().replace(/[^a-z]/g, '')] || null;

  function launch(ctx) {
    const c = ctx || {};
    if (!Core() || !Kit()) return toast(tr('loadingGame', 'Quiz is still loading — try again'));
    const chat = typeof chatFromLaunch === 'function' ? chatFromLaunch(c) : c.chat;
    const usable = chat && chat.id && chat.id !== 'ai';
    const group = usable && (chat.type === 'group' || chat.isGroup || c.isGroup);
    if (c.practiceKind === 'solo' || c.practiceKind === 'vsAi' || c.mode === 'practice') return openSolo('practice', { category: legacyCategory(c.category) });
    if (usable && (c.source === 'chat' || c.source === 'baithak' || c.source === 'challenge' || group) && Kit().isSignedIn()) return group ? createParty(chat) : createDuel(chat);
    if (c.matchId && c.mode === 'live') toast(tr('newDuels', 'Quiz Duels now run in live rooms — send a fresh challenge'));
    return openHome({ chat: usable ? chat : null });
  }

  const lazy = (fn) => (Kit() && typeof Kit().withGameData === 'function' ? Kit().withGameData(ROOM, fn) : fn);
  const api = {
    launch: lazy(launch),
    openHome: lazy(openHome),
    openDaily: lazy(openDaily),
    openPractice: lazy((o) => openSolo('practice', o)),
    openNews: lazy(() => openSolo('news')),
    openRoom: lazy(openRoom),
    createDuel: lazy(createDuel),
    createParty: lazy(createParty),
    quickDuel: lazy(quickDuel),
  };
  window.QuizGame = api;

  if (Kit() && typeof Kit().registerPartyGame === 'function') {
    Kit().registerPartyGame(ROOM, { openRoom: (code, o) => openRoom(code, { join: !!(o && o.join) }) });
  }

  // Legacy entry points: generic Muqabala launches open the new quiz; custom / AI question sets
  // (opts.questions from the challenge creator) keep the classic engine.
  const legacyStart = typeof window.startMuqabala === 'function' ? window.startMuqabala : null;
  window.startMuqabala = function (name, mode, opts) {
    const o = opts || {};
    const custom = (Array.isArray(o.questions) && o.questions.length) || /^(custom|ai)$/i.test(String(mode || '')) || o.source === 'custom' || o.source === 'ai';
    if (custom && legacyStart) return legacyStart.apply(this, arguments);
    if (o.practice || o.simulated) return api.openPractice({ category: legacyCategory(mode) });
    return api.openHome();
  };
  window.openQuizCategorySheet = function () {
    return api.openHome();
  };
})();
