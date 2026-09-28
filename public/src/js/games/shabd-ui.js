/**
 * Shabd Five (Dangal P5) — five letters, six guesses. Solo; no Live mode, no chips.
 *
 * Modes: Daily (same puzzle for everyone, flips at local midnight) · Past puzzles (archive) ·
 * Practice (unlimited, separate stats) · Challenge (a friend's word, encrypted in the link).
 * Rules + stats + share + challenge tokens: shabd-core.js. Words: shabd-lexicon.js (encoded schedule).
 * Social: friends' Daily results (after you've played), result + challenge cards in Baithak chats,
 * stats synced to the account through /api/media-config { action: 'shabd' }.
 */
(function () {
  'use strict';

  const GAME = 'wordguess';
  const LABEL = 'Shabd Five';
  const STATS_KEY = 'chaupaal_shabd_stats_v2';
  const LEGACY_STATS_KEY = 'chaupaal_shabd_stats_v1';
  const DAILY_KEY = 'chaupaal_shabd_daily_v2';
  const ARCHIVE_KEY = 'chaupaal_shabd_archive_v1';
  const HARD_KEY = 'chaupaal_shabd_hard_v1';
  const CONTRAST_KEY = 'chaupaal_shabd_contrast_v1';
  const FLIP_MS = 250;

  const Core = () => window.ShabdCore;
  const Lex = () => window.ShabdLexicon;
  const esc = (s) =>
    String(s == null ? '' : s).replace(/[&<>"']/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[ch]);
  const tr = (key, fallback) => (typeof t === 'function' ? t('shabd.' + key, fallback) : fallback);
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
  const flag = (k) => {
    const v = readJson(k, false);
    return v === true || v === 1 || v === '1';
  };
  const setFlag = (k, on) => writeJson(k, !!on);
  const today = () => Core().dayNumber(new Date());
  const signedIn = () => typeof currentUser !== 'undefined' && !!currentUser && typeof apiFetch === 'function';

  // ---------------- stats (local copy + account sync) ----------------

  function loadStats() {
    const v2 = readJson(STATS_KEY, null);
    if (v2) return Core().normalizeStats(v2);
    const legacy = readJson(LEGACY_STATS_KEY, null);
    const s = legacy ? Core().migrateLegacy(legacy) : Core().emptyStats();
    writeJson(STATS_KEY, s);
    return s;
  }
  const saveStats = (s) => (writeJson(STATS_KEY, s), s);

  async function api(op, args) {
    if (!signedIn()) return null;
    try {
      const res = await apiFetch('/api/media-config', { method: 'POST', needAuth: true, body: Object.assign({ action: 'shabd', op }, args || {}) });
      return (res && (res.data || res)) || null;
    } catch (e) {
      return null;
    }
  }
  let syncing = null;
  function syncStats() {
    if (syncing) return syncing;
    syncing = api('sync', { stats: loadStats() })
      .then((out) => {
        if (out && out.stats) saveStats(Core().mergeStats(loadStats(), out.stats));
        return loadStats();
      })
      .finally(() => (syncing = null));
    return syncing;
  }

  // ---------------- saved boards ----------------

  function loadBoard(mode, dayNo) {
    if (mode === 'daily') {
      const s = readJson(DAILY_KEY, null);
      return s && s.dayNo === dayNo ? s : null;
    }
    if (mode === 'archive') return (readJson(ARCHIVE_KEY, {}) || {})[dayNo] || null;
    return null;
  }
  function saveBoard(mode, dayNo, board) {
    if (mode === 'daily') writeJson(DAILY_KEY, Object.assign({ dayNo }, board));
    else if (mode === 'archive') {
      const all = readJson(ARCHIVE_KEY, {}) || {};
      all[dayNo] = board;
      const keys = Object.keys(all).map(Number).sort((a, b) => b - a);
      keys.slice(400).forEach((k) => delete all[k]);
      writeJson(ARCHIVE_KEY, all);
    }
  }

  // ---------------- chat cards + sending ----------------

  async function sendToFriend(att, text, title) {
    if (!signedIn()) {
      toast(tr('signIn', 'Sign in to send this to a friend'));
      return false;
    }
    if (typeof openFriendPickerSheet !== 'function' || typeof sendRealtimeMessage !== 'function') return false;
    const friend = await openFriendPickerSheet({ title: title || tr('sendTo', 'Send to a friend') });
    if (!friend) return false;
    let chatId = friend.chatId || friend.firestoreId || '';
    if (!chatId && (friend.uid || friend.id) && typeof openPeerDm === 'function') {
      try {
        await openPeerDm({ uid: friend.uid || friend.id, origin: 'shabd', seedHello: false });
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

  function miniGridHtml(rows) {
    const cls = { g: 'is-correct', y: 'is-present', x: 'is-absent' };
    return `<span class="sf-mini">${(rows || [])
      .map((r) => `<span class="sf-mini-row">${String(r).split('').map((c) => `<i class="${cls[c] || ''}"></i>`).join('')}</span>`)
      .join('')}</span>`;
  }

  /** Baithak card for `shabd_result` / `shabd_challenge` attachments. */
  function chatCardHtml(att, m) {
    const contrast = flag(CONTRAST_KEY) ? ' sf-contrast' : '';
    if (att.type === 'shabd_challenge') {
      const token = String(att.token || '').replace(/[^0-9a-z]/gi, '').slice(0, 10);
      return `<div class="sf-card${contrast}"><div class="sf-card-head">📝 <strong>${esc(LABEL)}</strong><span>${esc(tr('challenge', 'Challenge'))}</span></div>
        <div class="sf-card-text">${esc((m && m.text) || tr('challengeText', 'Can you guess my word?'))}</div>
        <button type="button" class="sf-card-btn" data-shabd-challenge="${esc(token)}">${esc(tr('solve', 'Solve it'))}</button></div>`;
    }
    const score = (att.won ? att.guesses : 'X') + '/6' + (att.hard ? '*' : '');
    const title = att.puzzle ? '#' + Number(att.puzzle) : tr('practice', 'Practice');
    return `<div class="sf-card${contrast}"><div class="sf-card-head">📝 <strong>${esc(LABEL)} ${esc(title)}</strong><span>${esc(score)}</span></div>
      ${miniGridHtml(Array.isArray(att.rows) ? att.rows.slice(0, 6) : [])}
      <button type="button" class="sf-card-btn" data-shabd-open="daily">${esc(tr('playToday', 'Play today’s puzzle'))}</button></div>`;
  }

  if (typeof document !== 'undefined') {
    document.addEventListener('click', (e) => {
      const ch = e.target.closest && e.target.closest('[data-shabd-challenge]');
      if (ch) {
        e.preventDefault();
        return openChallenge(ch.dataset.shabdChallenge);
      }
      const op = e.target.closest && e.target.closest('[data-shabd-open]');
      if (op) {
        e.preventDefault();
        open({ mode: 'daily' });
      }
    });
  }

  // ---------------- sheets ----------------

  function sheet(o) {
    if (window.PartyKit && typeof PartyKit.openSheet === 'function') return PartyKit.openSheet(o);
    return null;
  }

  function openStats(highlight) {
    const s = loadStats();
    const sum = Core().summary(s, today());
    const max = Math.max(1, ...sum.dist);
    const bars = sum.dist
      .map((n, i) => `<div class="sf-bar${highlight === i + 1 ? ' is-today' : ''}"><span>${i + 1}</span><div><b style="width:${n ? Math.max(8, Math.round((100 * n) / max)) : 0}%">${n}</b></div></div>`)
      .join('');
    const p = s.practice;
    const x = sheet({
      title: tr('stats', 'Statistics'),
      bodyHtml: `<div class="sf-stats">
        <div class="sf-stats-grid">
          <div><b>${sum.played}</b><span>${esc(tr('played', 'Played'))}</span></div>
          <div><b>${sum.winPct}</b><span>${esc(tr('winPct', 'Win %'))}</span></div>
          <div><b>${sum.streak}</b><span>${esc(tr('streak', 'Current streak'))}</span></div>
          <div><b>${sum.maxStreak}</b><span>${esc(tr('maxStreak', 'Max streak'))}</span></div>
        </div>
        <div class="sf-sub">${esc(tr('distribution', 'Daily guess distribution'))}</div>
        <div class="sf-bars">${bars}</div>
        <p class="sf-note">${esc(tr('practiceLine', 'Practice & past puzzles'))}: ${p.played} ${esc(tr('playedLower', 'played'))} · ${p.played ? Math.round((100 * p.wins) / p.played) : 0}% ${esc(tr('won', 'won'))}</p>
        ${signedIn() ? `<p class="sf-note">${esc(tr('synced', 'Your streak follows your account on every device.'))}</p>` : `<p class="sf-note">${esc(tr('signInSync', 'Sign in to keep your streak on every device.'))}</p>`}
      </div>`,
    });
    if (signedIn())
      syncStats().then((fresh) => {
        const now = Core().summary(fresh, today());
        if (x && x.el && x.el.isConnected && (now.played !== sum.played || now.streak !== sum.streak)) {
          x.close();
          openStats(highlight);
        }
      });
  }

  function openRules() {
    sheet({
      title: tr('howTo', 'How to play'),
      bodyHtml: `<div class="sf-rules">
        <p>${esc(tr('rule1', 'Guess the five-letter word in six tries. Each guess must be a real word.'))}</p>
        <p><span class="sf-chip is-correct">G</span> ${esc(tr('rule2', 'right letter, right spot'))}</p>
        <p><span class="sf-chip is-present">Y</span> ${esc(tr('rule3', 'in the word, wrong spot'))}</p>
        <p><span class="sf-chip is-absent">X</span> ${esc(tr('rule4', 'not in the word (or no more copies of it)'))}</p>
        <p>${esc(tr('rule5', 'Hard mode: revealed hints must be used — greens stay put, yellows must be reused.'))}</p>
        <p>${esc(tr('rule6', 'A new Daily arrives at your local midnight. Practice and past puzzles don’t touch your streak.'))}</p>
      </div>`,
    });
  }

  async function openFriends(dayNo) {
    const n = dayNo == null ? today() : dayNo;
    const x = sheet({ title: tr('friendsToday', 'Friends today') + ' · #' + Core().puzzleNo(n), bodyHtml: `<div class="sf-lb"><p class="sf-note">${esc(tr('loading', 'Loading…'))}</p></div>` });
    if (!x) return;
    const body = x.el.querySelector('.sf-lb');
    if (!signedIn()) {
      body.innerHTML = `<p class="sf-note">${esc(tr('signInFriends', 'Sign in to see how your friends did.'))}</p>`;
      return;
    }
    const out = await api('leaderboard', { dayNo: n });
    if (!body.isConnected) return;
    if (!out) body.innerHTML = `<p class="sf-note">${esc(tr('lbError', 'Couldn’t load results — try again'))}</p>`;
    else if (out.locked) body.innerHTML = `<p class="sf-note">${esc(tr('lbLocked', 'Finish today’s puzzle to see your friends’ results — no spoilers before then.'))}</p>`;
    else if (out.rows.length <= 1)
      body.innerHTML = `${lbRows(out.rows)}<p class="sf-note">${esc(tr('lbEmpty', 'None of the people you follow have played yet. Challenge a friend!'))}</p>`;
    else body.innerHTML = lbRows(out.rows);
  }
  function lbRows(rows) {
    return `<ol class="sf-lb-list${flag(CONTRAST_KEY) ? ' sf-contrast' : ''}">${rows
      .map(
        (r, i) =>
          `<li class="${r.me ? 'is-me' : ''}"><span class="sf-lb-rank">${i + 1}</span><span class="sf-lb-name">${esc(r.me ? tr('you', 'You') : r.name)}${r.hard ? ' <em>' + esc(tr('hardStar', 'Hard')) + '</em>' : ''}</span>${miniGridHtml(r.rows)}<b>${r.won ? r.guesses : 'X'}/6</b></li>`
      )
      .join('')}</ol>`;
  }

  function openArchive(onPick) {
    const now = today();
    const saved = readJson(ARCHIVE_KEY, {}) || {};
    const s = loadStats();
    const cells = [];
    for (let n = now - 1; n >= 0 && cells.length < 120; n--) {
      const d = s.days[n];
      const a = saved[n];
      const mark = d ? (d.w ? '✓' : '·') : a && a.over ? (a.won ? '✓' : '·') : '';
      cells.push(`<button type="button" class="sf-arch${mark ? ' is-done' : ''}" data-day="${n}"><b>#${Core().puzzleNo(n)}</b><span>${esc(Core().dayKeyOf(n).slice(5))}</span><i>${mark}</i></button>`);
    }
    sheet({
      title: tr('archive', 'Past puzzles'),
      bodyHtml: `<p class="sf-note">${esc(tr('archiveNote', 'Replay any earlier Daily for practice. Your streak isn’t affected.'))}</p><div class="sf-arch-grid">${cells.join('') || `<p class="sf-note">${esc(tr('archiveEmpty', 'No past puzzles yet.'))}</p>`}</div>`,
      onMount(el, close) {
        el.querySelectorAll('[data-day]').forEach((b) => b.addEventListener('click', () => (close(), onPick(Number(b.dataset.day)))));
      },
    });
  }

  function openChallengeMaker() {
    sheet({
      title: tr('challengeFriend', 'Challenge a friend'),
      bodyHtml: `<div class="sf-maker">
        <p class="sf-note">${esc(tr('makerNote', 'Pick any five-letter word. It’s encrypted in the link — your friend can’t read it.'))}</p>
        <input class="sf-input" data-word maxlength="5" autocomplete="off" autocapitalize="characters" spellcheck="false" placeholder="${esc(tr('yourWord', 'Your word'))}" aria-label="${esc(tr('yourWord', 'Your word'))}">
        <p class="sf-err" data-err></p>
        <button type="button" class="pk-btn pk-btn--primary pk-btn--block" data-send>${esc(tr('sendFriend', 'Send to a friend'))}</button>
        <button type="button" class="pk-btn pk-btn--ghost pk-btn--block" data-link>${esc(tr('shareLink', 'Share link'))}</button>
      </div>`,
      onMount(el, close) {
        const input = el.querySelector('[data-word]');
        const errEl = el.querySelector('[data-err]');
        input.addEventListener('input', () => {
          input.value = input.value.toUpperCase().replace(/[^A-Z]/g, '').slice(0, 5);
          errEl.textContent = '';
        });
        const token = () => {
          const w = input.value;
          if (w.length !== 5) return (errEl.textContent = tr('need5', 'Enter five letters')), null;
          if (!Lex().isAllowed(w)) return (errEl.textContent = tr('notWord', 'Not in the word list')), null;
          if (window.WordSafety && WordSafety.isBlocked(w)) return (errEl.textContent = tr('pickAnother', 'Pick a different word')), null;
          return Core().encodeChallenge(w);
        };
        const link = (tk) => location.origin + '/party/shabd-' + tk;
        el.querySelector('[data-send]').addEventListener('click', async () => {
          const tk = token();
          if (!tk) return;
          const who = typeof currentUser !== 'undefined' && currentUser ? currentUser.displayName || '' : '';
          const ok = await sendToFriend({ type: 'shabd_challenge', token: tk }, (who ? who + ' ' : '') + tr('challengeSent', 'challenged you to guess their five-letter word'), tr('challengeFriend', 'Challenge a friend'));
          if (ok) close();
        });
        el.querySelector('[data-link]').addEventListener('click', () => {
          const tk = token();
          if (!tk) return;
          const url = link(tk);
          const text = tr('challengeShare', 'Can you guess my five-letter word? Six tries.');
          if (navigator.share) navigator.share({ title: LABEL, text, url }).catch(() => {});
          else if (navigator.clipboard) navigator.clipboard.writeText(text + '\n' + url).then(() => toast(tr('copied', 'Link copied')));
        });
        setTimeout(() => input.focus(), 50);
      },
    });
  }

  // ---------------- the board ----------------

  /**
   * @param {{ mode?: 'daily'|'archive'|'practice'|'challenge', dayNo?: number, word?: string, chat?: object }} opts
   */
  function open(opts) {
    const o = opts || {};
    if (!Core() || !Lex()) return toast(tr('loading', 'Shabd Five is still loading — try again'));
    const mode = o.mode || 'daily';
    const dayNo = mode === 'daily' ? today() : mode === 'archive' ? Math.max(0, Math.min(today() - 1, Math.floor(Number(o.dayNo) || 0))) : null;
    const answer = mode === 'challenge' ? Core().norm(o.word) : mode === 'practice' ? Lex().random() : Lex().daily(dayNo);
    if (!Core().isWord(answer)) return toast(tr('broken', 'That puzzle isn’t available'));

    const saved = loadBoard(mode, dayNo);
    const st = {
      guesses: saved && Array.isArray(saved.guesses) ? saved.guesses.filter((g) => Core().isWord(g)).slice(0, 6) : [],
      current: '',
      hard: saved ? !!saved.hard : flag(HARD_KEY),
      over: false,
      won: false,
      revealing: -1,
      shake: false,
      recorded: !!(saved && saved.recorded),
      submitted: !!(saved && saved.submitted),
    };
    const lastGuess = st.guesses[st.guesses.length - 1];
    st.won = lastGuess === answer;
    st.over = st.won || st.guesses.length >= 6;
    if (mode === 'daily' && Core().normalizeStats(loadStats()).days[dayNo] && !st.over) {
      // Finished on another device: show the recorded result without the letters we don't have.
      st.recorded = true;
    }

    const overlay = document.createElement('div');
    overlay.className = 'sf-overlay' + (flag(CONTRAST_KEY) ? ' sf-contrast' : '');
    const kb = (e) => {
      if (!gs.alive() || e.metaKey || e.ctrlKey || e.altKey) return;
      if (e.target && /INPUT|TEXTAREA/.test(e.target.tagName)) return;
      if (document.querySelector('.pk-sheet-wrap, .pk-sheet')) return;
      if (e.key === 'Backspace') press('⌫');
      else if (e.key === 'Enter') press('↵');
      else if (/^[a-zA-Z]$/.test(e.key)) press(e.key.toUpperCase());
    };
    const gs = beginGameOverlaySession({
      type: GAME,
      title: LABEL,
      mode: 'solo',
      chat: o.chat,
      overlay,
      cleanup() {
        document.removeEventListener('keydown', kb);
        persist();
      },
    });
    if (!gs.alive()) return;
    if (typeof prepareGameOverlay === 'function') prepareGameOverlay(overlay, { theme: 'dark', gameId: GAME });
    // The overlay session resets className to the shared game shell.
    overlay.classList.add('sf-overlay');
    overlay.classList.toggle('sf-contrast', flag(CONTRAST_KEY));
    if (typeof markGamePlayed === 'function') markGamePlayed(GAME);
    if (signedIn() && mode === 'daily')
      syncStats().then((fresh) => {
        if (!gs.alive() || st.revealing >= 0) return;
        if (!st.over && !st.recorded && fresh.days[dayNo]) st.recorded = true;
        render();
      });

    function persist() {
      if (mode !== 'daily' && mode !== 'archive') return;
      saveBoard(mode, dayNo, { guesses: st.guesses.slice(), hard: st.hard, over: st.over, won: st.won, recorded: st.recorded, submitted: st.submitted });
    }

    function subtitle() {
      if (mode === 'daily') return '#' + Core().puzzleNo(dayNo) + ' · ' + tr('daily', 'Daily');
      if (mode === 'archive') return '#' + Core().puzzleNo(dayNo) + ' · ' + tr('pastPuzzle', 'Past puzzle');
      if (mode === 'challenge') return tr('friendChallenge', 'Friend’s challenge');
      return tr('practice', 'Practice');
    }

    function finish() {
      st.over = true;
      gs.setOutcome(st.won ? 'won' : 'lost');
      if (typeof recordGameResult === 'function') recordGameResult(GAME, st.won);
      if (typeof gameFeedback === 'function') gameFeedback(st.won ? 'win' : 'lose');
      if (!st.recorded) {
        st.recorded = true;
        if (mode === 'daily') {
          saveStats(Core().recordDaily(loadStats(), dayNo, { won: st.won, guesses: st.guesses.length, hard: st.hard }));
          if (st.won && typeof setGamePB === 'function') setGamePB(GAME, st.guesses.length);
        } else saveStats(Core().recordPractice(loadStats(), { won: st.won, guesses: st.guesses.length }));
      }
      persist();
      if (mode === 'daily' && !st.submitted && signedIn()) {
        api('submit', { dayNo, rows: Core().rowCodes(st.guesses, answer), hard: st.hard }).then((out) => {
          if (out) {
            st.submitted = true;
            persist();
            syncStats();
          }
        });
      }
    }

    function rejectGuess(msg) {
      st.shake = true;
      toast(msg);
      if (typeof gameFeedback === 'function') gameFeedback('invalid');
      render();
      gs.schedule(() => {
        st.shake = false;
        render();
      }, 450);
    }

    function press(k) {
      if (!gs.alive() || st.over || st.revealing >= 0 || st.recorded) return;
      if (k === '⌫') st.current = st.current.slice(0, -1);
      else if (k === '↵') {
        const g = st.current;
        if (g.length !== 5) return rejectGuess(tr('need5', 'Not enough letters'));
        if (!Lex().isAllowed(g)) return rejectGuess(tr('notWord', 'Not in the word list'));
        if (st.hard) {
          const why = Core().hardModeViolation(g, st.guesses, answer);
          if (why) return rejectGuess(why);
        }
        st.guesses.push(g);
        st.current = '';
        st.revealing = st.guesses.length - 1;
        setFlag(HARD_KEY, st.hard);
        persist();
        render();
        const states = Core().evaluate(g, answer);
        states.forEach((s, i) =>
          gs.schedule(() => {
            try {
              if (typeof haptic === 'function') haptic(s === 'correct' ? 'success' : s === 'present' ? 'medium' : 'light');
            } catch (e) {}
          }, FLIP_MS * i + FLIP_MS)
        );
        gs.schedule(() => {
          st.revealing = -1;
          st.won = g === answer;
          if (st.won || st.guesses.length >= 6) finish();
          render();
        }, FLIP_MS * 5 + 300);
        return;
      } else if (/^[A-Z]$/.test(k) && st.current.length < 5) st.current += k;
      try {
        if (typeof haptic === 'function') haptic('light');
      } catch (e) {}
      render();
    }

    function tilesHtml() {
      const rows = [];
      for (let r = 0; r < 6; r++) {
        const g = st.guesses[r];
        let cells = '';
        if (g) {
          const s = Core().evaluate(g, answer);
          for (let c = 0; c < 5; c++) {
            const anim = r === st.revealing ? ` is-flip" style="animation-delay:${c * FLIP_MS}ms` : '';
            cells += `<div class="sf-tile is-${s[c]}${anim}" aria-label="${esc(g[c] + ' ' + tr(s[c], s[c]))}">${esc(g[c])}</div>`;
          }
        } else if (r === st.guesses.length && !st.over) {
          for (let c = 0; c < 5; c++) cells += `<div class="sf-tile${st.current[c] ? ' is-filled' : ''}">${esc(st.current[c] || '')}</div>`;
        } else for (let c = 0; c < 5; c++) cells += '<div class="sf-tile"></div>';
        rows.push(`<div class="sf-row${r === st.guesses.length && st.shake ? ' is-shake' : ''}" role="row">${cells}</div>`);
      }
      return `<div class="sf-grid" role="grid" aria-label="${esc(tr('board', 'Guesses'))}">${rows.join('')}</div>`;
    }

    function keyboardHtml() {
      const keys = st.revealing >= 0 ? Core().keyStates(st.guesses.slice(0, -1), answer) : Core().keyStates(st.guesses, answer);
      return `<div class="sf-kb">${['QWERTYUIOP', 'ASDFGHJKL', '↵ZXCVBNM⌫']
        .map(
          (row) =>
            `<div class="sf-kb-row">${row
              .split('')
              .map((k) => {
                const wide = k === '↵' || k === '⌫';
                const label = k === '↵' ? tr('enter', 'Enter') : k === '⌫' ? '⌫' : k;
                const aria = k === '↵' ? tr('enter', 'Enter') : k === '⌫' ? tr('delete', 'Delete') : k + (keys[k] ? ' ' + tr(keys[k], keys[k]) : '');
                return `<button type="button" class="sf-key${wide ? ' is-wide' : ''}${keys[k] ? ' is-' + keys[k] : ''}" data-k="${k}" aria-label="${esc(aria)}">${esc(label)}</button>`;
              })
              .join('')}</div>`
        )
        .join('')}</div>`;
    }

    function resultHtml() {
      if (!st.over && !st.recorded) return '';
      if (!st.over && st.recorded) {
        return `<div class="sf-result"><div class="sf-result-title">${esc(tr('doneElsewhere', 'You already played today’s puzzle'))}</div>
          <div class="sf-actions"><button type="button" class="pk-btn pk-btn--primary" data-act="friends">${esc(tr('friendsToday', 'Friends today'))}</button><button type="button" class="pk-btn pk-btn--ghost" data-act="practice">${esc(tr('practice', 'Practice'))}</button></div></div>`;
      }
      const reveal = typeof shabdRevealHtml === 'function' ? shabdRevealHtml({ won: st.won, word: answer, guesses: st.guesses.length, hard: st.hard, mode }) : `<p>${esc(answer)}</p>`;
      const title = typeof shabdWinTitle === 'function' && st.won ? shabdWinTitle(st.guesses.length) : st.won ? tr('solved', 'Solved!') : tr('lose', 'Out of guesses');
      const next = mode === 'daily' ? `<p class="sf-next">${esc(tr('nextIn', 'Next puzzle in'))} <b data-next>${fmtCountdown(Core().msToMidnight(new Date()))}</b></p>` : '';
      const primary = [`<button type="button" class="pk-btn pk-btn--primary" data-act="share">${esc(tr('share', 'Share'))}</button>`];
      if (mode === 'daily') primary.push(`<button type="button" class="pk-btn pk-btn--ghost" data-act="friends">${esc(tr('friendsToday', 'Friends today'))}</button>`);
      primary.push(`<button type="button" class="pk-btn pk-btn--ghost" data-act="practice">${esc(mode === 'practice' ? tr('again', 'New word') : tr('practice', 'Practice'))}</button>`);
      return `<div class="sf-result"><div class="sf-result-title">${esc(title)}</div>${reveal}${next}
        <div class="sf-actions">${primary.join('')}</div>
        <div class="sf-links"><button type="button" class="pk-link" data-act="chat">${esc(tr('sendChat', 'Send to a chat'))}</button><button type="button" class="pk-link" data-act="challenge">${esc(tr('challengeFriend', 'Challenge a friend'))}</button><button type="button" class="pk-link" data-act="stats">${esc(tr('stats', 'Statistics'))}</button></div></div>`;
    }

    function fmtCountdown(ms) {
      const s = Math.floor(ms / 1000);
      const h = Math.floor(s / 3600);
      const m = Math.floor((s % 3600) / 60);
      return h + ':' + String(m).padStart(2, '0') + ':' + String(s % 60).padStart(2, '0');
    }

    function shareText() {
      return Core().shareGrid(st.guesses, answer, { hard: st.hard, contrast: flag(CONTRAST_KEY), mode, puzzle: dayNo != null ? Core().puzzleNo(dayNo) : null });
    }

    function doShare() {
      const text = shareText();
      const stats = { scoreLine: (st.won ? st.guesses.length : 'X') + '/6', score: st.won ? st.guesses.length : 0, meta: subtitle() + (st.hard ? ' · ' + tr('hard', 'Hard') : ''), text: text + '\n\n' + tr('playOn', 'Play on Chaupaal'), includeImage: false };
      if (typeof shareGameResult === 'function') shareGameResult(GAME, stats);
      else if (navigator.clipboard) navigator.clipboard.writeText(text).then(() => toast(tr('copied', 'Copied')));
    }

    function openMore() {
      const locked = st.guesses.length > 0 || st.over || st.recorded;
      sheet({
        title: LABEL,
        bodyHtml: `<div class="sf-more">
          <label class="sf-toggle"><span><b>${esc(tr('hardMode', 'Hard mode'))}</b><small>${esc(locked ? tr('hardLocked', 'Change it before your first guess') : tr('hardDesc', 'Revealed hints must be used in later guesses'))}</small></span><input type="checkbox" data-hard ${st.hard ? 'checked' : ''} ${locked ? 'disabled' : ''}></label>
          <label class="sf-toggle"><span><b>${esc(tr('contrast', 'High contrast colours'))}</b><small>${esc(tr('contrastDesc', 'Orange and blue, for colour-blind players'))}</small></span><input type="checkbox" data-contrast ${flag(CONTRAST_KEY) ? 'checked' : ''}></label>
          <button type="button" class="pk-row-btn" data-go="practice">${esc(tr('practice', 'Practice'))}<span class="pk-chev">›</span></button>
          <button type="button" class="pk-row-btn" data-go="archive">${esc(tr('archive', 'Past puzzles'))}<span class="pk-chev">›</span></button>
          <button type="button" class="pk-row-btn" data-go="friends">${esc(tr('friendsToday', 'Friends today'))}<span class="pk-chev">›</span></button>
          <button type="button" class="pk-row-btn" data-go="challenge">${esc(tr('challengeFriend', 'Challenge a friend'))}<span class="pk-chev">›</span></button>
          <button type="button" class="pk-row-btn" data-go="rules">${esc(tr('howTo', 'How to play'))}<span class="pk-chev">›</span></button>
        </div>`,
        onMount(el, close) {
          el.querySelector('[data-hard]').addEventListener('change', (e) => {
            if (locked) return;
            st.hard = !!e.target.checked;
            setFlag(HARD_KEY, st.hard);
            persist();
            render();
          });
          el.querySelector('[data-contrast]').addEventListener('change', (e) => {
            setFlag(CONTRAST_KEY, !!e.target.checked);
            overlay.classList.toggle('sf-contrast', !!e.target.checked);
          });
          el.querySelectorAll('[data-go]').forEach((b) =>
            b.addEventListener('click', () => {
              close();
              go(b.dataset.go);
            })
          );
        },
      });
    }

    function reopen(next) {
      persist();
      gs.close('restart');
      open(Object.assign({ chat: o.chat }, next));
    }

    function go(where) {
      if (where === 'practice') return reopen({ mode: 'practice' });
      if (where === 'archive') return openArchive((n) => reopen({ mode: 'archive', dayNo: n }));
      if (where === 'friends') return openFriends(mode === 'archive' ? dayNo : today());
      if (where === 'challenge') return openChallengeMaker();
      if (where === 'rules') return openRules();
      if (where === 'stats') return openStats(st.won && mode === 'daily' ? st.guesses.length : null);
      if (where === 'daily') return reopen({ mode: 'daily' });
      if (where === 'share') return doShare();
      if (where === 'chat') {
        const att = { type: 'shabd_result', puzzle: dayNo != null ? Core().puzzleNo(dayNo) : null, won: st.won, guesses: st.guesses.length, hard: st.hard, rows: Core().rowCodes(st.guesses, answer) };
        return sendToFriend(att, shareText().split('\n')[0], tr('sendChat', 'Send to a chat'));
      }
    }

    async function askLeave() {
      persist();
      if (st.over || st.recorded || !st.guesses.length || mode === 'daily' || mode === 'archive') return gs.close();
      const body = tr('leaveBody', 'This board won’t be saved.');
      const ok = typeof confirmLeaveGame === 'function' ? await confirmLeaveGame({ title: tr('leaveTitle', 'Leave Shabd Five?'), body }) : true;
      if (ok) gs.close();
    }

    let tick = null;
    function render() {
      if (!gs.alive()) return;
      const right = `<button type="button" class="game-chrome-action" data-act="stats" aria-label="${esc(tr('stats', 'Statistics'))}">📊</button><button type="button" class="game-chrome-action" data-act="more" aria-label="${esc(tr('more', 'More'))}">⋯</button>`;
      const chrome =
        typeof gameChromeHtml === 'function'
          ? gameChromeHtml({ title: LABEL, subtitle: subtitle() + (st.hard ? ' · ' + tr('hard', 'Hard') : ''), backId: 'wgBack', rightHtml: right })
          : `<div class="sf-top"><button type="button" id="wgBack">‹</button><b>${esc(LABEL)}</b>${right}</div>`;
      const done = st.over || st.recorded;
      overlay.innerHTML = `${chrome}<div class="sf-main">${tilesHtml()}${resultHtml()}</div>${done ? '' : keyboardHtml()}`;
      overlay.querySelector('#wgBack').addEventListener('click', askLeave);
      overlay.querySelectorAll('[data-act]').forEach((b) =>
        b.addEventListener('click', () => {
          const a = b.dataset.act;
          if (a === 'more') return openMore();
          go(a);
        })
      );
      overlay.querySelectorAll('[data-k]').forEach((b) => b.addEventListener('click', () => press(b.dataset.k)));
      if (tick) clearInterval(tick);
      const nx = overlay.querySelector('[data-next]');
      if (nx) {
        tick = setInterval(() => {
          if (!gs.alive() || !nx.isConnected) return clearInterval(tick);
          const ms = Core().msToMidnight(new Date());
          nx.textContent = fmtCountdown(ms);
          if (ms < 1000) {
            clearInterval(tick);
            toast(tr('newPuzzle', 'A new puzzle is ready'));
          }
        }, 1000);
      }
    }

    document.addEventListener('keydown', kb);
    render();
    if (st.over) gs.setOutcome(st.won ? 'won' : 'lost');
  }

  function openChallenge(token) {
    const w = Core() && Core().decodeChallenge(token);
    if (!w || !Lex() || !Lex().isAllowed(w)) return toast(tr('badChallenge', 'That challenge link doesn’t work'));
    open({ mode: 'challenge', word: w });
  }

  function launch(ctx) {
    const c = ctx || {};
    const chat = typeof chatFromLaunch === 'function' ? chatFromLaunch(c) : c.chat;
    if (c.mode === 'practice' || c.practiceKind) return open({ mode: 'practice', chat });
    return open({ mode: 'daily', chat });
  }

  if (typeof registerGame === 'function') {
    registerGame({
      id: 'wordguess',
      name: LABEL,
      desc: 'Five letters, six tries · Daily · Practice · Hard mode',
      icon: '📝',
      ratingKey: GAME,
      gameType: 'solo',
      genre: 'words',
      solo: true,
      chat1v1: true,
      selfChat: true,
      order: 60,
      meta: {
        core: 'shabd-core.js (tiles, hard mode, days, stats, share, challenge tokens)',
        social: 'friends’ Daily results + stats sync via media-config { action: shabd }',
      },
      launch,
    });
  }

  window.ShabdFive = { open, launch, openChallenge, openStats, openFriends, chatCardHtml, syncStats };
})();
