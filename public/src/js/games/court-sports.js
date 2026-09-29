/**
 * Court sports — Badminton (the RALLIES shell now serves badminton only).
 *
 * Laws (scoring, service courts, ends, intervals, faults, lets, stats) live in badminton-engine.js;
 * shots, flight, footwork, stamina and the bots in badminton-rally.js; the match flow (seats, toss,
 * contact windows, intervals, AFK, reconnect lets) in badminton-match.js. All three are shared with
 * the server. This file is the home, the court view, the drills and the two controllers:
 *   vs Bot / bot partner — the same reducer runs on the phone;
 *   Live singles + doubles — POST /api/media-config { action: 'badminton_match' } →
 *   server-lib/badminton-engine.js resolves every exchange; the phone sends the tap time + swipe.
 *
 * Controls: swipe up from the court or the Hit pad — length = depth, speed = attack, sideways = aim,
 * hold before swiping = deception. A plain tap plays the natural shot. Drag your own marker to move
 * your base. Simple controls (tap only, the shot is picked for you) are unrated.
 */
(function () {
  'use strict';

  const GAME = 'badminton';
  const LABEL = 'Badminton';
  const KEY_SETTINGS = 'chaupaal_bd_settings_v1';
  const KEY_COACH = 'chaupaal_rally_coach_badminton';
  const KEY_DRILLS = 'chaupaal_bd_drills_v1';
  const HIGH_RTT_MS = 350;
  const LIVE_POLICY = window.DangalLivePolicy ? window.DangalLivePolicy.policyFor(GAME) : { reconnectMs: 90000 };
  const RECONNECT_MS = LIVE_POLICY.reconnectMs || 90000;

  const E = () => window.BadmintonEngine;
  const BM = () => window.BadmintonMatch;
  const R = () => window.BadmintonRally;
  const Kit = () => window.PartyKit;

  function esc(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }
  function tr(key, fallback) {
    return typeof t === 'function' ? t('badminton.' + key, fallback) : fallback;
  }
  function toast(msg) {
    if (typeof showToast === 'function') showToast(msg);
  }
  function buzz(a, extra) {
    if (typeof gameFeedback === 'function') gameFeedback(a, extra);
  }
  function readJson(key, fb) {
    try {
      const v = JSON.parse(localStorage.getItem(key) || 'null');
      return v == null ? fb : v;
    } catch (e) {
      return fb;
    }
  }
  function writeJson(key, v) {
    try {
      localStorage.setItem(key, JSON.stringify(v));
    } catch (e) {}
  }
  function myUid() {
    if (Kit()) return Kit().myUid();
    return typeof getCurrentUid === 'function' ? getCurrentUid() || '' : '';
  }
  function myName() {
    const n = (Kit() && Kit().myName()) || '';
    return n ? n.split(' ')[0].slice(0, 16) : tr('you', 'You');
  }
  function cleanId(raw) {
    return String(raw || '')
      .replace(/[^\w.-]/g, '')
      .slice(0, 120);
  }
  function persistable(uid) {
    if (!uid) return false;
    return typeof isPersistableUid === 'function' ? isPersistableUid(uid) : /^[\w-]{6,128}$/.test(uid);
  }

  function settings() {
    const s = readJson(KEY_SETTINGS, {}) || {};
    const Rl = R();
    return {
      format: E() ? E().normFormat(s.format) : s.format || 'standard',
      // Old P12 tiers (easy / normal / sharp) map onto the P13 levels.
      level: Rl ? Rl.levelOf(s.level) : 'club',
      persona: Rl ? Rl.personaOf(s.persona) : 'allround',
      simple: s.simple === true,
      voice: s.voice === true,
      sound: s.sound !== false,
    };
  }
  function saveSettings(s) {
    writeJson(KEY_SETTINGS, s);
  }
  function formatLabel(id) {
    const f = E() && E().FORMATS[id];
    return f ? tr('format.' + id, f.label) : id;
  }
  /** "Pro · Attacker Bot" — always labelled as a bot. */
  function levelLabel(level, persona) {
    const Rl = R();
    if (!Rl) return tr('bot', 'Bot');
    const L = Rl.LEVELS[Rl.levelOf(level)];
    const p = Rl.personaOf(persona);
    return tr('level.' + L.id, L.label) + (p === 'allround' ? '' : ' · ' + tr('persona.' + p, Rl.PERSONAS[p].label)) + ' ' + tr('bot', 'Bot');
  }
  function botSeatFor(s) {
    return 'bot:' + s.level + (s.persona && s.persona !== 'allround' ? ':' + s.persona : '');
  }

  // ---------------------------------------------------------------- shared shell

  function practiceSub(detail) {
    if (typeof DangalLive !== 'undefined' && DangalLive.modeChromeLabel) {
      return DangalLive.modeChromeLabel(false, detail || 'vs Bot');
    }
    return detail ? 'Practice · ' + detail : 'Practice vs Bot';
  }

  function liveSub() {
    if (typeof DangalLive !== 'undefined' && DangalLive.modeChromeLabel) {
      return DangalLive.modeChromeLabel(true);
    }
    return 'Live';
  }

  function resolveChat(arg) {
    if (typeof chatFromLaunch === 'function' && arg != null) {
      const from = chatFromLaunch(arg);
      if (from && (from.name || from.dangalMatchId || from.uid || from.opponentUid || from.peerUid)) {
        return from;
      }
    }
    if (arg && arg.chat) return resolveChat(arg.chat);
    if (arg && (arg.name || arg.dangalMatchId || arg.uid || arg.opponentUid || arg.peerUid)) return arg;
    const ctx = window.__dangalLaunchCtx || {};
    return Object.assign(
      { name: 'Opponent' },
      ctx.chat || {},
      {
        dangalMatchId: ctx.matchId || undefined,
        opponentUid: ctx.opponentUid || undefined,
        uid: ctx.opponentUid || undefined,
        dangalSource: ctx.source || undefined,
      }
    );
  }

  function chatLiveOn(chat) {
    return typeof DangalLive !== 'undefined' && DangalLive.isLive(chat);
  }

  function matchIdFor(chat, gameType) {
    return (
      (chat && chat.dangalMatchId) ||
      (window.__dangalLaunchCtx && window.__dangalLaunchCtx.matchId) ||
      (typeof dangalMatchId === 'function' ? dangalMatchId(gameType, chat) : gameType + '_' + Date.now())
    );
  }

  async function confirmAndClose(shell, opts) {
    const o = opts || {};
    if (typeof leaveGameShell === 'function') {
      return leaveGameShell(shell, {
        live: !!o.live || !!o.liveHandle,
        liveHandle: o.liveHandle != null ? o.liveHandle : shell.liveHandle,
        isPlaying: o.isPlaying,
        title: o.title,
        body: o.body,
        forfeitBody: o.forfeitBody,
        reason: o.reason || 'dismissed',
      });
    }
    const playing = o.isPlaying !== false;
    const live = !!o.live || !!o.liveHandle;
    if (typeof confirmLeaveGame === 'function') {
      const leave = await confirmLeaveGame({
        title: o.title || 'Leave game?',
        body: live && playing ? 'Leaving now counts as a forfeit.' : o.body || 'This match will end.',
      });
      if (!leave) return false;
    }
    if (o.liveHandle && playing) {
      try {
        o.liveHandle.leave({ forfeit: true });
      } catch (e) {}
    }
    try {
      if (shell.markOver) shell.markOver();
    } catch (e) {}
    try {
      shell.liveHandle = null;
    } catch (e) {}
    shell.close(o.reason || 'dismissed');
    return true;
  }

  function openShell(opts) {
    const o = opts || {};
    const overlay = document.createElement('div');
    overlay.className = 'game-overlay game-overlay--dark dangal-fullgame';
    overlay.style.cssText =
      'position:absolute;inset:0;z-index:80;display:flex;flex-direction:column;background:' +
      (o.bg || '#061018') +
      ';';
    let liveHandle = o.liveHandle || null;
    let gameOver = false;
    const begin = typeof beginGameOverlaySession === 'function' ? beginGameOverlaySession : null;
    const gs = begin
      ? begin({
          type: o.id,
          title: o.title,
          mode: o.mode || (o.live ? 'live' : 'practice'),
          overlay,
          chat: o.chat,
          source: o.source || (window.__dangalLaunchCtx && window.__dangalLaunchCtx.source) || '',
          cleanup() {
            if (typeof o.cleanup === 'function') o.cleanup();
            // Forced dismiss while still playing → forfeit once here.
            if (liveHandle) {
              try {
                liveHandle.leave({ forfeit: !gameOver });
              } catch (e) {}
              liveHandle = null;
            }
          },
        })
      : null;
    if (begin && (!gs || !gs.alive())) return null;
    if (!begin) {
      const device = document.querySelector('.device') || document.body;
      device.appendChild(overlay);
    }
    overlay.dataset.gameId = o.id || '';
    if (typeof applyGameIdentity === 'function') applyGameIdentity(o.id, overlay);
    const sub = o.subtitle || (o.live ? liveSub() : practiceSub(o.practiceDetail || 'vs Bot'));
    overlay.innerHTML =
      (typeof gameChromeHtml === 'function'
        ? gameChromeHtml({
            title: o.title,
            subtitle: sub,
            backId: o.backId || 'csBack',
            pauseId: o.pauseId || '',
            gameId: o.id || '',
          })
        : '') + `<div class="dangal-fullgame-body" data-cs-body></div>`;
    // After chrome DOM exists — accent CSS + mark inject if chrome omitted gameId
    if (typeof prepareGameOverlay === 'function') {
      prepareGameOverlay(overlay, { theme: 'dark', gameId: o.id, accent: o.accent });
    }
    const body = overlay.querySelector('[data-cs-body]');
    let closed = false;
    const close = (reason) => {
      gameOver = true;
      closed = true;
      if (gs) gs.close(reason || 'dismissed');
      else if (typeof animateGameExit === 'function') animateGameExit(overlay, () => overlay.remove());
      else overlay.remove();
      if (!gs && typeof o.cleanup === 'function') o.cleanup();
    };
    const shell = {
      overlay,
      body,
      gs,
      close,
      alive: () => !closed && (gs ? gs.alive() : true),
      host: overlay,
      get liveHandle() {
        return liveHandle;
      },
      set liveHandle(h) {
        liveHandle = h;
      },
      markOver() {
        gameOver = true;
      },
      get gameOver() {
        return gameOver;
      },
      setSub(text) {
        const el = overlay.querySelector('.game-chrome-subtitle');
        if (el) el.textContent = text || '';
      },
    };
    overlay.querySelector('#' + (o.backId || 'csBack'))?.addEventListener('click', async () => {
      if (typeof o.onBack === 'function') return o.onBack(shell);
      await confirmAndClose(shell, {
        live: !!o.live || !!liveHandle,
        liveHandle,
        isPlaying: !gameOver,
        title: 'Leave ' + (o.title || 'game') + '?',
        body: o.leaveBody || 'This match will end.',
      });
    });
    return shell;
  }

  // ---------------------------------------------------------------- voice

  function speak(text) {
    if (!settings().voice || !text) return;
    try {
      const synth = window.speechSynthesis;
      if (!synth) return;
      synth.cancel();
      const u = new SpeechSynthesisUtterance(String(text).replace(/–/g, ' '));
      u.rate = 1.02;
      u.lang = 'en';
      synth.speak(u);
    } catch (e) {}
  }
  function hush() {
    try {
      if (window.speechSynthesis) window.speechSynthesis.cancel();
    } catch (e) {}
  }

  // ---------------------------------------------------------------- sound + haptics (synthesised, no files)

  const Snd = (() => {
    let ctx = null;
    function ac() {
      if (!settings().sound) return null;
      try {
        if (!ctx) {
          const A = window.AudioContext || window.webkitAudioContext;
          if (!A) return null;
          ctx = new A();
        }
        if (ctx.state === 'suspended') ctx.resume();
        return ctx;
      } catch (e) {
        return null;
      }
    }
    /** A band-passed noise burst: racket strings, shuttle cork, a crowd swell. */
    function burst(dur, freq, gain, q, attack) {
      const a = ac();
      if (!a) return;
      try {
        const n = Math.max(1, Math.floor(a.sampleRate * dur));
        const buf = a.createBuffer(1, n, a.sampleRate);
        const d = buf.getChannelData(0);
        for (let i = 0; i < n; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / n, 2);
        const src = a.createBufferSource();
        src.buffer = buf;
        const f = a.createBiquadFilter();
        f.type = 'bandpass';
        f.frequency.value = freq;
        f.Q.value = q || 1;
        const g = a.createGain();
        const t0 = a.currentTime;
        g.gain.setValueAtTime(0.0001, t0);
        g.gain.exponentialRampToValueAtTime(gain, t0 + (attack || 0.004));
        g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
        src.connect(f).connect(g).connect(a.destination);
        src.start(t0);
      } catch (e) {}
    }
    return {
      hit(power) {
        burst(0.07 + power * 0.06, 1800 - power * 700, 0.25 + power * 0.35, 3);
      },
      cord() {
        burst(0.12, 420, 0.25, 6);
      },
      crowd(big) {
        burst(big ? 1.4 : 0.8, 900, big ? 0.12 : 0.06, 0.6, 0.25);
      },
    };
  })();
  function vibrate(ms) {
    try {
      if (navigator.vibrate) navigator.vibrate(ms);
    } catch (e) {}
  }

  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  /**
   * A finished pointer gesture → the swipe the model reads, or null for a plain tap.
   * Up = toward the other court. Length = depth, speed = attack, sideways = aim, a still hold before
   * moving = deception ("hold").
   */
  function swipeFrom(g) {
    const dx = g.x1 - g.x0;
    const dy = g.y0 - g.y1;
    const dist = Math.hypot(dx, dy);
    if (dist < 14) return null;
    const ref = clamp((window.innerHeight || 700) * 0.32, 120, 260);
    let len = clamp(dist / ref, 0, 1);
    if (dy < 0) len = Math.min(len, 0.3);
    const moveMs = Math.max(1, g.t1 - (g.tMove || g.t0));
    return { sw: { len: Math.round(len * 100) / 100, hard: dist / moveMs > 0.9, x: Math.round(clamp(dx / (ref * 0.8), -1, 1) * 100) / 100 }, hold: (g.tMove || g.t0) - g.t0 > 280 };
  }

  // ---------------------------------------------------------------- court view

  const HALF = 6.7;
  const HALF_W = 3.05;
  /** Screen % for a spot in `side`'s own frame, with `bottom` the side drawn at the bottom. */
  function toScreen(side, spot, bottom) {
    const near = side === bottom;
    const x = Number(spot && spot.x) || 0;
    const y = Math.max(0, Number(spot && spot.y) || 0);
    const left = 50 + ((near ? x : -x) / HALF_W) * 46;
    const top = near ? 50 + (Math.min(y, HALF + 0.6) / HALF) * 46 : 50 - (Math.min(y, HALF + 0.6) / HALF) * 46;
    return { left: Math.max(2, Math.min(98, left)), top: Math.max(1, Math.min(99, top)) };
  }
  /** Where a player stands: their service court (serve positions; P13 adds footwork). */
  function playerSpot(state, side, player, serving) {
    let court = state.court;
    if (state.config.perSide === 2) court = state.pos[side][0] === player ? 'R' : 'L';
    const isServer = serving && state.server.side === side && state.server.player === player;
    return { x: court === 'R' ? 1.2 : -1.2, y: isServer ? 2.5 : 3.1 };
  }

  function boardRowHtml(state, side, mine, names) {
    const won = E().gamesWon(state)[side];
    const need = Math.floor(state.format.games / 2) + 1;
    const pips = state.format.games > 1 ? Array.from({ length: need }, (_, i) => `<i class="bd-pip${i < won ? ' is-on' : ''}"></i>`).join('') : '';
    const serving = state.server.side === side && !state.over;
    return `<div class="bd-row${mine ? ' is-mine' : ''}${serving ? ' is-serving' : ''}">
      <span class="bd-serve-dot" aria-label="${serving ? esc(tr('serving', 'Serving')) : ''}"></span>
      <span class="bd-names">${esc(names)}</span>
      <span class="bd-pips">${pips}</span>
      <span class="bd-score">${state.score[side]}</span>
    </div>`;
  }

  /** The plain rule-source line lives in design-system (the one place federation names appear). */
  function attribution() {
    return (typeof federationHonestyLine === 'function' && federationHonestyLine(GAME)) || 'Rules based on the Laws of Badminton';
  }

  function netHtml(rtt) {
    if (!rtt) return '';
    const cls = rtt > HIGH_RTT_MS ? 'bad' : rtt > 180 ? 'ok' : 'good';
    return `<span class="bd-net bd-net--${cls}" title="${esc(tr('net.title', 'Connection'))}">${rtt} ms</span>`;
  }

  function statsHtml(pub, viewSide, upTo) {
    const s = BM().statsOf(pub, upTo);
    const st = s.state;
    const names = [st.config.sides[0].name, st.config.sides[1].name];
    const a = viewSide;
    const b = 1 - viewSide;
    const row = (label, x, y) => `<tr><td>${esc(x)}</td><th>${esc(label)}</th><td>${esc(y)}</td></tr>`;
    return `<div class="bd-stats">
      <table class="bd-stats-table">
        <thead><tr><td>${esc(names[a])}</td><th></th><td>${esc(names[b])}</td></tr></thead>
        <tbody>
          ${s.games.length ? row(tr('stats.games', 'Games'), s.games.map((g) => g[a]).join(' · '), s.games.map((g) => g[b]).join(' · ')) : ''}
          ${row(tr('stats.serve', 'Won on serve'), s.serve[a].won + '/' + s.serve[a].of, s.serve[b].won + '/' + s.serve[b].of)}
          ${row(tr('stats.receive', 'Won on receive'), s.receive[a].won + '/' + s.receive[a].of, s.receive[b].won + '/' + s.receive[b].of)}
          ${row(tr('stats.winners', 'Winners'), s.winners[a], s.winners[b])}
          ${row(tr('stats.errors', 'Errors'), s.errors[a], s.errors[b])}
          ${row(tr('stats.streak', 'Best streak'), s.bestStreak[a], s.bestStreak[b])}
          ${s.fastest ? row(tr('stats.fastest', 'Fastest smash'), BM().sideOfSeat(s.fastest.seat) === a ? s.fastest.kmh + ' ' + tr('simkmh', 'sim km/h') : '', BM().sideOfSeat(s.fastest.seat) === b ? s.fastest.kmh + ' ' + tr('simkmh', 'sim km/h') : '') : ''}
        </tbody>
      </table>
      <p class="bd-stats-line">${esc(tr('stats.rallies', 'Rallies') + ' ' + s.rallies + ' · ' + tr('stats.longest', 'longest') + ' ' + s.longest + ' ' + tr('stats.shots', 'shots') + ' · ' + tr('stats.avg', 'average') + ' ' + s.avgRally + (s.lets ? ' · ' + tr('stats.lets', 'lets') + ' ' + s.lets : ''))}</p>
    </div>`;
  }

  function openRules() {
    const Eng = E();
    const html = `<div class="bd-rules">
      <p class="bd-attrib">${esc(attribution())}</p>
      ${(Eng ? Eng.LAWS : []).map((l) => `<h4>${esc(l.h)} <small>${esc(l.law)}</small></h4><p>${esc(l.body)}</p>`).join('')}
      <h4>${esc(tr('rules.formats', 'Formats'))}</h4>
      <p>${esc(Eng ? Eng.FORMAT_ORDER.map((id) => Eng.FORMATS[id].label + ' — ' + Eng.FORMATS[id].blurb + (Eng.FORMATS[id].rated ? ' (rated in Live singles)' : ' (unrated)')).join(' · ') : '')}</p>
      <h4>${esc(tr('rules.play', 'Playing'))}</h4>
      <p>${esc(tr('rules.playBody', 'Release as the bar crosses the green band — the centre is your best contact. Swipe up to choose the shot: a longer swipe goes deeper, a quick swipe attacks (smash, drive, kill), sideways aims. Hold still for a moment before swiping to disguise it. A plain tap plays the natural shot. You run to the shuttle yourself; drag your marker to change where you recover to.'))}</p>
      <p>${esc(tr('rules.playMore', 'You can only smash from above your head, and only net-shot when you reach the net early. Long rallies tire you (slower feet, weaker shots); you recover between points and at intervals. Doubles: attack front-and-back, defend side-by-side — your partner rotates with you.'))}</p>
      <h4>${esc(tr('rules.simple', 'Simple controls'))}</h4>
      <p>${esc(tr('rules.simpleBody', 'Tap only, and the shot is picked for you. Matches with Simple controls are always unrated.'))}</p>
      <h4>${esc(tr('rules.bots', 'Bots'))}</h4>
      <p>${esc(tr('rules.botsBody', 'Beginner, Club, County and Pro, each as an All-rounder, Attacker, Retriever or Net player. Bots are always labelled as bots.'))}</p>
      <p class="bd-attrib">${esc(tr('rules.sim', 'Line calls and km/h are simulated.'))}</p>
    </div>`;
    if (Kit() && Kit().openSheet) Kit().openSheet({ title: tr('rules.title', 'How to play Badminton'), bodyHtml: html });
    else if (window.DangalRules && typeof window.DangalRules.open === 'function') window.DangalRules.open(GAME);
  }

  /**
   * One court view for every mode. `o`: { shell, me, spectator, serverNow(), send(op, args), live,
   * onRematch(), onAgain(), rtt() }. Call view.set(pub) on every update.
   */
  function createCourtView(o) {
    const shell = o.shell;
    const body = shell.body;
    let pub = null;
    let raf = 0;
    let shownEvents = -1;
    let shownPhase = '';
    let resultShown = false;
    let intervalShown = '';
    const sent = {};
    let cachedKey = '';
    let cachedState = null;
    let callText = '';
    let callUntil = 0;
    let coachShown = !!readJson(KEY_COACH, false);
    let dragBase = null;
    let heard = '';
    let trail = [];
    let lcUntil = 0;
    let lcSeen = '';
    let pausedShown = '';

    const mySeat = () => (pub && !o.spectator ? BM().seatOfUid(pub, o.me) : '');
    const mySide = () => {
      const s = mySeat();
      return s ? BM().sideOfSeat(s) : 0;
    };
    const visibleState = (now) => {
      const n = pub.log.filter((e) => !e.at || e.at <= now).length;
      const key = pub.log.length + ':' + n + ':' + pub.format;
      if (key !== cachedKey) {
        cachedKey = key;
        cachedState = BM().stateOf(pub, now);
        cachedState.visibleCount = n;
      }
      return cachedState;
    };
    const seatName = (seat) => (pub.names && pub.names[seat]) || seat;
    const seatIsMine = (seat) => !o.spectator && pub.seats[seat] === o.me;

    function layout() {
      body.innerHTML = `<div class="bd">
        <div class="bd-board" data-bd-board></div>
        <p class="bd-call" data-bd-call aria-live="polite"></p>
        <div class="bd-court-wrap">
          <div class="bd-court" data-bd-court>
            <div class="bd-half bd-half--far"><i class="bd-box" data-box="far-L"></i><i class="bd-box" data-box="far-R"></i></div>
            <div class="bd-netline"></div>
            <div class="bd-half bd-half--near"><i class="bd-box" data-box="near-L"></i><i class="bd-box" data-box="near-R"></i></div>
            <i class="bd-land" data-bd-land></i>
            <i class="bd-trail" data-bd-trail="0"></i><i class="bd-trail" data-bd-trail="1"></i><i class="bd-trail" data-bd-trail="2"></i>
            <span class="bd-shuttle" data-bd-shuttle aria-hidden="true"></span>
            <div class="bd-linecall" data-bd-linecall hidden><b data-bd-lc-text></b><small>${esc(tr('linecall', 'Simulated line call'))}</small></div>
          </div>
          <div class="bd-side-chips"><span data-bd-net></span><span class="bd-chip" data-bd-stamina hidden></span></div>
        </div>
        <div class="bd-controls">
          <div class="bd-bar" data-bd-bar aria-hidden="true"><i class="bd-bar-sweet"></i><i class="bd-bar-perfect"></i><i class="bd-bar-fill" data-bd-fill></i></div>
          <button type="button" class="bd-hit" data-bd-hit disabled>${esc(tr('hit', 'Hit'))}</button>
          <p class="bd-hint" data-bd-hint></p>
        </div>
        <div class="bd-links">
          <button type="button" class="bd-link" data-bd-stats>${esc(tr('stats.title', 'Stats'))}</button>
          <button type="button" class="bd-link" data-bd-rules>${esc(tr('rules.short', 'Rules'))}</button>
          <button type="button" class="bd-link" data-bd-voice>${esc(settings().voice ? tr('voice.on', 'Umpire voice on') : tr('voice.off', 'Umpire voice off'))}</button>
        </div>
        <div class="bd-layer" data-bd-layer hidden></div>
      </div>`;
      const hit = body.querySelector('[data-bd-hit]');
      const courtEl = body.querySelector('[data-bd-court]');
      wireGestures(hit);
      wireGestures(courtEl);
      hit.addEventListener('keydown', (ev) => {
        if (ev.key === 'Enter' || ev.key === ' ') {
          ev.preventDefault();
          tapHit(null, o.serverNow());
        }
      });
      body.querySelector('[data-bd-stats]').addEventListener('click', () => openStats());
      body.querySelector('[data-bd-rules]').addEventListener('click', openRules);
      body.querySelector('[data-bd-voice]').addEventListener('click', (ev) => {
        const s = settings();
        s.voice = !s.voice;
        saveSettings(s);
        if (!s.voice) hush();
        ev.currentTarget.textContent = s.voice ? tr('voice.on', 'Umpire voice on') : tr('voice.off', 'Umpire voice off');
      });
      // Players in their seats.
      const court = body.querySelector('[data-bd-court]');
      BM()
        .seatList(pub)
        .forEach((seat) => {
          const el = document.createElement('span');
          el.className = 'bd-p' + (BM().sideOfSeat(seat) === mySide() ? ' bd-p--near' : ' bd-p--far') + (seatIsMine(seat) ? ' is-me' : '');
          el.dataset.p = seat;
          el.innerHTML = `<b>${esc(initials(seatName(seat)))}</b>`;
          el.title = seatName(seat);
          court.appendChild(el);
        });
    }
    function initials(name) {
      const n = String(name || '').trim();
      if (/Bot$/.test(n)) return 'B';
      return n ? n.charAt(0).toUpperCase() : '?';
    }

    const myContactOpen = () => {
      const c = pub && pub.contact;
      return !!(c && !o.spectator && seatIsMine(c.seat) && (pub.phase === 'serve' || pub.phase === 'rally') && !sent[c.n + ':' + c.k]);
    };
    /** Send the shot: `g` = the swipe (null = tap), `at` = when the finger released (shared clock). */
    function tapHit(g, at) {
      if (!pub || o.spectator) return;
      const c = pub.contact;
      if (!myContactOpen()) return;
      const key = c.n + ':' + c.k;
      const t = (at || o.serverNow()) - c.startAt;
      if (t < -150) return;
      sent[key] = true;
      if (!coachShown) {
        coachShown = true;
        writeJson(KEY_COACH, true);
      }
      const hitEl = body.querySelector('[data-bd-hit]');
      if (hitEl) hitEl.classList.add('is-swing');
      setTimeout(() => hitEl && hitEl.classList.remove('is-swing'), 220);
      buzz('move');
      const args = { n: c.n, k: c.k, t: Math.round(t), rtt: o.rtt ? o.rtt() : 0 };
      if (g && g.sw) {
        args.sw = g.sw;
        if (g.hold) args.hold = true;
      }
      Promise.resolve(o.send('hit', args)).catch((e) => {
        if (e && e.code !== 'STALE_CONTACT') toast(o.errorText ? o.errorText(e) : tr('err.generic', 'Couldn’t reach the match — try again'));
      });
    }

    /** Court → metres in my own half (for dragging my base). */
    function spotFromPointer(ev) {
      const court = body.querySelector('[data-bd-court]');
      const r = court.getBoundingClientRect();
      const left = ((ev.clientX - r.left) / r.width) * 100;
      const top = ((ev.clientY - r.top) / r.height) * 100;
      return { x: Math.round((((left - 50) / 46) * HALF_W) * 100) / 100, y: Math.round(clamp(((top - 50) / 46) * HALF, 0.8, HALF - 0.6) * 100) / 100, left, top };
    }
    /**
     * One pointer gesture on the court or the Hit pad: while it's my shot, a swipe (release = the
     * contact time) or a tap (press = the contact time); otherwise dragging my marker moves my base.
     */
    function wireGestures(el) {
      let g = null;
      el.addEventListener('pointerdown', (ev) => {
        if (!pub || o.spectator) return;
        const me = ev.target && ev.target.closest && ev.target.closest('.bd-p.is-me');
        if (me && pub.status === 'playing' && !myContactOpen()) {
          ev.preventDefault();
          g = { drag: me, id: ev.pointerId };
          me.classList.add('is-drag');
          try {
            el.setPointerCapture(ev.pointerId);
          } catch (e) {}
          return;
        }
        if (!myContactOpen()) return;
        ev.preventDefault();
        g = { id: ev.pointerId, x0: ev.clientX, y0: ev.clientY, t0: Date.now(), tMove: 0, at0: o.serverNow() };
        try {
          el.setPointerCapture(ev.pointerId);
        } catch (e) {}
        // Simple controls: the press is the shot.
        if (pub.simple && pub.simple[o.me]) {
          tapHit(null, g.at0);
          g = null;
        }
      });
      el.addEventListener('pointermove', (ev) => {
        if (!g || ev.pointerId !== g.id) return;
        if (g.drag) {
          const s = spotFromPointer(ev);
          g.drag.style.left = clamp(s.left, 2, 98) + '%';
          g.drag.style.top = clamp(Math.max(s.top, 52), 2, 98) + '%';
          g.spot = s;
          return;
        }
        if (!g.tMove && Math.hypot(ev.clientX - g.x0, ev.clientY - g.y0) > 8) g.tMove = Date.now();
      });
      const end = (ev) => {
        if (!g || ev.pointerId !== g.id) return;
        const cur = g;
        g = null;
        if (cur.drag) {
          cur.drag.classList.remove('is-drag');
          if (cur.spot) {
            dragBase = { x: cur.spot.x, y: cur.spot.y };
            Promise.resolve(o.send('move', { base: dragBase })).catch(() => {});
          }
          return;
        }
        if (ev.type === 'pointercancel') return;
        cur.x1 = ev.clientX;
        cur.y1 = ev.clientY;
        cur.t1 = Date.now();
        const sw = swipeFrom(cur);
        // A tap counts from the press; a swipe from the release (that's when the racket meets it).
        tapHit(sw, sw ? o.serverNow() : cur.at0);
      };
      el.addEventListener('pointerup', end);
      el.addEventListener('pointercancel', end);
    }

    function paintBoard(state) {
      const side = mySide();
      const names = [state.config.sides[0].name, state.config.sides[1].name];
      const board = body.querySelector('[data-bd-board]');
      if (!board) return;
      const g = state.games.length;
      board.innerHTML =
        boardRowHtml(state, side, !o.spectator, names[side]) +
        boardRowHtml(state, 1 - side, false, names[1 - side]) +
        `<div class="bd-board-meta">${esc(formatLabel(pub.format) + (state.format.games > 1 ? ' · ' + tr('game', 'Game') + ' ' + g : '') + (pub.discipline === 'doubles' ? ' · ' + tr('doubles', 'Doubles') : ''))}</div>`;
    }

    function showCall(text, now) {
      callText = text;
      callUntil = now + 2600;
      const el = body.querySelector('[data-bd-call]');
      if (el) {
        el.textContent = text;
        el.classList.remove('is-fresh');
        void el.offsetWidth;
        el.classList.add('is-fresh');
      }
    }

    function paintPositions(state, now) {
      const court = body.querySelector('[data-bd-court]');
      if (!court) return;
      const bottom = mySide();
      const serving = pub.phase === 'serve' || (pub.contact && pub.contact.serve);
      const snap = posAt(now);
      const c = pub.contact;
      const last = lastHit(now);
      BM()
        .seatList(pub)
        .forEach((seat) => {
          const el = court.querySelector('[data-p="' + seat + '"]');
          if (!el) return;
          const side = BM().sideOfSeat(seat);
          const pos = toScreen(side, snap && snap[seat] ? snap[seat] : playerSpot(state, side, BM().playerOfSeat(seat), serving), bottom);
          if (!el.classList.contains('is-drag')) {
            el.style.left = pos.left + '%';
            el.style.top = pos.top + '%';
          }
          // Footwork cues: split step as the shuttle comes, a lunge when stretched, the jump smash.
          const mineUp = c && c.seat === seat && !c.serve;
          el.classList.toggle('is-split', !!(mineUp && now >= c.startAt - 260 && now < c.startAt + 60));
          el.classList.toggle('is-lunge', !!(mineUp && (c.r || 0) > 0.78 && now >= c.startAt && now < c.startAt + c.dur));
          el.classList.toggle('is-jump', !!(last && last.seat === seat && last.shot === 'smash_jump' && now - last.at < 380));
          const isServer = state.server.side === side && state.server.player === BM().playerOfSeat(seat);
          const isRecv = state.receiver.side === side && state.receiver.player === BM().playerOfSeat(seat);
          el.classList.toggle('is-server', !state.over && isServer);
          el.classList.toggle('is-receiver', !state.over && serving && isRecv);
          el.classList.toggle('is-up', !!(pub.contact && pub.contact.seat === seat && pub.contact.startAt <= now + 400));
        });
      // Service courts: the server's box and the diagonal receiver's box (their right = our right at the bottom).
      court.querySelectorAll('.bd-box').forEach((b) => b.classList.remove('is-serve', 'is-recv'));
      if (!state.over && serving) {
        const boxFor = (side, letter) => {
          const near = side === bottom;
          const screen = near ? letter : letter === 'R' ? 'L' : 'R';
          return court.querySelector('[data-box="' + (near ? 'near' : 'far') + '-' + screen + '"]');
        };
        const sb = boxFor(state.server.side, state.court);
        const rb = boxFor(state.receiver.side, state.court);
        if (sb) sb.classList.add('is-serve');
        if (rb) rb.classList.add('is-recv');
      }
      court.classList.toggle('is-doubles', pub.discipline === 'doubles');
    }

    /** The rally on screen: the current one, or the finished one still playing out before the next serve. */
    function rallyHits(now) {
      const c = pub.contact;
      let all = pub.hits || [];
      if (!all.some((h) => h.at <= now) && (pub.prevHits || []).length && (!c || now < c.startAt - 400)) all = pub.prevHits;
      return { all, hits: all.filter((h) => h.at <= now) };
    }
    function lastHit(now) {
      const r = rallyHits(now);
      return r.hits[r.hits.length - 1] || null;
    }
    /** Where everyone is: the latest played shot's footwork snapshot, else the serve positions. */
    function posAt(now) {
      const h = lastHit(now);
      const snap = h && h.pos ? Object.assign({}, h.pos) : pub.startPos ? Object.assign({}, pub.startPos) : null;
      const seat = mySeat();
      if (snap && seat && dragBase && pub.phase !== 'serve' && !(pub.contact && pub.contact.seat === seat)) snap[seat] = dragBase;
      return snap;
    }
    /** New shots / points on the shared clock: racket + crowd sounds, haptics on smash / kill, net cord. */
    function cueSounds(now) {
      const r = rallyHits(now);
      const h = r.hits[r.hits.length - 1];
      const key = h ? h.seat + ':' + h.at : '';
      if (!h || key === heard) return;
      heard = key;
      const fam = R() && R().SHOTS[h.shot] ? R().SHOTS[h.shot].family : '';
      const power = R() && R().SHOTS[h.shot] ? R().SHOTS[h.shot].power : 0.2;
      Snd.hit(power);
      if (fam === 'smash' || fam === 'kill') {
        vibrate(h.kind === 'winner' ? [30, 40, 30] : 25);
        const pl = body.querySelector('[data-p="' + h.seat + '"]');
        if (pl) {
          pl.classList.remove('is-smash');
          void pl.offsetWidth;
          pl.classList.add('is-smash');
        }
      }
      if (h.code === 'net' || h.code === 'serve_net' || h.code === 'caught_net') {
        const net = body.querySelector('.bd-netline');
        setTimeout(() => {
          Snd.cord();
          if (net) {
            net.classList.remove('is-cord');
            void net.offsetWidth;
            net.classList.add('is-cord');
          }
        }, 260);
      }
      if (h.kind === 'winner' || h.kind === 'fault') setTimeout(() => Snd.crowd(h.kind === 'winner' && (fam === 'smash' || fam === 'kill')), 500);
    }
    /** Close calls replay as a zoomed "Simulated line call" (the engine's code already decided it). */
    function lineCall(now) {
      const el = body.querySelector('[data-bd-linecall]');
      if (!el) return;
      if (lcUntil && now > lcUntil) {
        el.hidden = true;
        lcUntil = 0;
      }
      const r = rallyHits(now);
      const h = r.hits[r.hits.length - 1];
      if (!h || r.all.length !== r.hits.length || lcSeen === h.seat + ':' + h.at || !(h.kind === 'winner' || h.code === 'out' || /^serve_(long|wide|short)$/.test(h.code || ''))) return;
      lcSeen = h.seat + ':' + h.at;
      if (now - h.at > 2500 || !R()) return;
      const cc = R().closeCall(h.land, { discipline: pub.discipline, serve: !!h.serve, court: pub.contact ? pub.contact.court : 'R', margin: 0.15 });
      if (!cc) return;
      const spot = toScreen(1 - BM().sideOfSeat(h.seat), h.land, mySide());
      el.style.left = spot.left + '%';
      el.style.top = spot.top + '%';
      el.classList.toggle('is-out', cc.out);
      el.querySelector('[data-bd-lc-text]').textContent = cc.out ? tr('lc.out', 'Out!') : tr('lc.in', 'In');
      setTimeout(() => {
        el.hidden = false;
        lcUntil = o.serverNow() + 1800;
      }, 650);
    }

    /** Shuttle position on the shared clock from the rally's hits and the contact in play. */
    function paintShuttle(state, now) {
      const court = body.querySelector('[data-bd-court]');
      const sh = court && court.querySelector('[data-bd-shuttle]');
      const landEl = court && court.querySelector('[data-bd-land]');
      if (!sh) return;
      const bottom = mySide();
      const c = pub.contact;
      // The finished rally keeps playing out until the next serve window is about to open.
      const rh = rallyHits(now);
      const all = rh.all;
      const hits = rh.hits;
      const snapNow = posAt(now);
      const seatSpot = (seat) => {
        const side = BM().sideOfSeat(seat);
        return toScreen(side, snapNow && snapNow[seat] ? snapNow[seat] : playerSpot(state, side, BM().playerOfSeat(seat), pub.phase === 'serve'), bottom);
      };
      let from = null;
      let to = null;
      let p = 0;
      let arc = null;
      const h = hits[hits.length - 1];
      if (!hits.length) {
        if (c && c.serve) from = to = seatSpot(c.seat);
      } else {
        // From where the hitter met it (the previous shot's footwork snapshot).
        const before = hits.length >= 2 ? hits[hits.length - 2].pos : pub.startPos;
        const hs = BM().sideOfSeat(h.seat);
        from = before && before[h.seat] ? toScreen(hs, before[h.seat], bottom) : seatSpot(h.seat);
        const land = h.land && h.land.y > 0 ? h.land : { x: h.land ? h.land.x : 0, y: 0.05 };
        to = toScreen(1 - hs, land, bottom);
        const nextHit = all[hits.length];
        const following = all === pub.hits && c && !c.serve && c.k === hits.length ? c : null;
        let dur = 600;
        if (nextHit) dur = Math.max(160, nextHit.at - h.at);
        else if (following) dur = Math.max(160, following.startAt + following.dur * 0.55 - h.at);
        if (nextHit || following) {
          // Going to be hit again: head for where the next hitter meets it.
          const ns = nextHit ? nextHit.seat : following.seat;
          const target = h.pos && h.pos[ns] ? toScreen(BM().sideOfSeat(ns), h.pos[ns], bottom) : seatSpot(ns);
          to = { left: (to.left + target.left * 2) / 3, top: (to.top + target.top * 2) / 3 };
        }
        p = Math.max(0, Math.min(1, (now - h.at) / dur));
        arc = R() ? R().flightAt(h.shot, p) : { s: p, h: Math.sin(p * Math.PI) * 4 };
      }
      if (!from) {
        sh.style.opacity = '0';
        if (landEl) landEl.style.opacity = '0';
        court.querySelectorAll('[data-bd-trail]').forEach((t) => (t.style.opacity = '0'));
        return;
      }
      const s = arc ? arc.s : 0;
      const lift = arc ? arc.h * 1.5 : 0;
      const left = from.left + (to.left - from.left) * s;
      const top = from.top + (to.top - from.top) * s - lift;
      sh.style.opacity = '1';
      sh.style.left = left + '%';
      sh.style.top = top + '%';
      sh.style.transform = 'translate(-50%,-50%) scale(' + (1 + lift / 14) + ')';
      // Trail: the last few positions while it flies.
      const moving = arc && p > 0 && p < 1;
      if (moving && (!trail.length || Math.abs(trail[0].left - left) + Math.abs(trail[0].top - top) > 0.8)) trail.unshift({ left, top });
      if (!moving) trail = [];
      trail = trail.slice(0, 4);
      court.querySelectorAll('[data-bd-trail]').forEach((t, i) => {
        const pt = trail[i + 1];
        t.style.opacity = pt ? String(0.45 - i * 0.13) : '0';
        if (pt) {
          t.style.left = pt.left + '%';
          t.style.top = pt.top + '%';
        }
      });
      const lastVisible = pub.log[state.visibleCount - 1];
      const ended = all === pub.prevHits || (lastVisible && lastVisible.t === 'rally' && all.length === hits.length && pub.phase !== 'rally');
      // Coming to me: the landing marker appears once I've "read" it (my reaction time).
      const incoming = c && !ended && !c.serve && seatIsMine(c.seat) && c.land && h && now >= h.at + (c.readMs || 250);
      if (landEl && incoming) {
        const spot = toScreen(BM().sideOfSeat(c.seat), c.land, bottom);
        landEl.style.left = spot.left + '%';
        landEl.style.top = spot.top + '%';
        landEl.style.opacity = '0.8';
        landEl.classList.add('is-read');
        landEl.classList.remove('is-out');
      } else if (landEl) {
        landEl.classList.remove('is-read');
        if (ended && h && h.land && all.length === hits.length && p >= 1) {
          const spot = toScreen(1 - BM().sideOfSeat(h.seat), h.land.y > 0 ? h.land : { x: h.land.x, y: 0.05 }, bottom);
          landEl.style.left = spot.left + '%';
          landEl.style.top = spot.top + '%';
          landEl.style.opacity = '1';
          landEl.classList.toggle('is-out', h.kind === 'fault');
        } else landEl.style.opacity = '0';
      }
    }

    function paintBar(now) {
      const c = pub.contact;
      const bar = body.querySelector('[data-bd-bar]');
      const fill = body.querySelector('[data-bd-fill]');
      const hit = body.querySelector('[data-bd-hit]');
      const hint = body.querySelector('[data-bd-hint]');
      if (!bar || !hit) return;
      const mine = c && seatIsMine(c.seat) && (pub.phase === 'serve' || pub.phase === 'rally') && pub.status === 'playing';
      const key = c ? c.n + ':' + c.k : '';
      const open = mine && !sent[key] && now >= c.startAt - 150;
      bar.classList.toggle('is-mine', !!mine);
      if (c && now >= c.startAt && pub.status === 'playing') {
        const p = Math.max(0, Math.min(1, (now - c.startAt) / c.dur));
        fill.style.transform = 'scaleX(' + p + ')';
      } else fill.style.transform = 'scaleX(0)';
      hit.disabled = !open;
      hit.classList.toggle('is-live', !!open);
      hit.textContent = c && c.serve ? tr('serve', 'Serve') : tr('hit', 'Hit');
      if (!hint) return;
      let text = '';
      if (pub.status !== 'playing') text = '';
      else if (pub.toss && now < pub.toss.until) {
        const w = pub.toss.winner;
        text = w === mySide() && !o.spectator ? tr('toss.you', 'You won the toss — you serve first') : BM().configOf(pub).sides[w].name + ' ' + tr('toss.them', 'won the toss and serve first');
      } else if (c) {
        const court = c.court === 'L' ? tr('court.L', 'left court') : tr('court.R', 'right court');
        const simple = pub.simple && pub.simple[o.me];
        if (seatIsMine(c.seat)) {
          if (simple) text = c.serve ? tr('hint.serveSimple', 'Your serve — tap in the green') : tr('hint.hitSimple', 'Your shot — tap in the green');
          else if (c.serve) text = tr('hint.serve', 'Your serve from the') + ' ' + court + ' · ' + (coachShown ? tr('hint.serveShort', 'tap = low · swipe long = high') : tr('hint.serveCoach', 'tap for a low serve, swipe up long for a high one, quick for a flick'));
          else text = coachShown ? tr('hint.hit', 'Your shot — swipe or tap in the green') : tr('hint.hitCoach', 'Swipe up in the green: long = deep, quick = attack, sideways = aim · tap = natural shot');
        }
        else if (BM().sideOfSeat(c.seat) === mySide() && !o.spectator) text = seatName(c.seat) + ' ' + tr('hint.partner', 'has this one');
        else text = seatName(c.seat) + (c.serve ? ' ' + tr('hint.serving', 'serving from the') + ' ' + court : ' ' + tr('hint.their', 'to play'));
      }
      hint.textContent = text;
      const net = body.querySelector('[data-bd-net]');
      if (net && o.live) net.innerHTML = netHtml(o.rtt ? o.rtt() : 0);
      // Legs: only worth showing once they're tiring.
      const stEl = body.querySelector('[data-bd-stamina]');
      const seat = mySeat();
      const stv = seat && pub.rally && pub.rally.st ? pub.rally.st[seat] : null;
      if (stEl) {
        const show = stv != null && stv < 0.6 && pub.status === 'playing';
        stEl.hidden = !show;
        if (show) {
          stEl.textContent = tr('stamina', 'Legs') + ' ' + Math.round(stv * 100) + '%';
          stEl.classList.toggle('is-low', stv < 0.3);
        }
      }
    }

    /** Someone dropped mid-rally: the rally is replayed as a let once they're back. */
    function paintPaused(now) {
      const pz = pub.pause;
      if (!(pub.phase === 'paused' && pz)) {
        if (pausedShown) layerHtml(null);
        pausedShown = '';
        return;
      }
      const left = Math.max(0, Math.ceil((pz.until - now) / 1000));
      const key = 'p:' + pz.from;
      if (pausedShown === key) {
        const cd = body.querySelector('[data-bd-countdown]');
        if (cd) cd.textContent = left + 's';
        return;
      }
      pausedShown = key;
      const who = pz.who && pz.who === mySeat() ? tr('paused.you', 'You') : seatName(pz.who);
      layerHtml(`<div class="bd-interval">
        <div class="bd-interval-title">${esc(tr('paused.title', 'Connection lost'))} <span data-bd-countdown>${left}s</span></div>
        <div class="bd-interval-call">${esc(who + ' ' + tr('paused.body', 'dropped out — waiting to reconnect.'))}</div>
        ${pz.let ? `<div class="bd-interval-ends">${esc(tr('paused.let', 'Let — that rally will be replayed'))}</div>` : ''}
        <p class="bd-note">${esc(tr('paused.note', 'If they don’t make it back in time, the match is forfeited.'))}</p>
      </div>`);
    }

    function layerHtml(html) {
      const layer = body.querySelector('[data-bd-layer]');
      if (!layer) return null;
      if (html == null) {
        layer.hidden = true;
        layer.innerHTML = '';
        return null;
      }
      layer.hidden = false;
      layer.innerHTML = html;
      return layer;
    }

    function paintInterval(state, now) {
      const pz = pub.pause;
      const key = pz ? pz.kind + ':' + pz.from : '';
      if (!(pub.phase === 'interval' && pz && pz.from <= now)) {
        if (intervalShown) layerHtml(null);
        intervalShown = '';
        return;
      }
      const left = Math.max(0, Math.ceil((pz.until - now) / 1000));
      if (intervalShown === key) {
        const cd = body.querySelector('[data-bd-countdown]');
        if (cd) cd.textContent = left + 's';
        const rb = body.querySelector('[data-bd-ready]');
        if (rb && pub.ready && pub.ready[o.me]) {
          rb.disabled = true;
          rb.textContent = tr('interval.waiting', 'Waiting for the others…');
        }
        return;
      }
      intervalShown = key;
      const title = pz.kind === 'game' ? tr('interval.game', 'Game break') : tr('interval.mid', 'Interval');
      const calls = state.calls.map((c) => c.text).join(' · ');
      const layer = layerHtml(`<div class="bd-interval">
        <div class="bd-interval-title">${esc(title)} <span data-bd-countdown>${left}s</span></div>
        <div class="bd-interval-call">${esc(calls)}</div>
        ${pz.ends ? `<div class="bd-interval-ends">${esc(tr('interval.ends', 'Change ends'))}</div>` : ''}
        ${statsHtml(pub, mySide(), now)}
        ${o.spectator ? '' : `<button type="button" class="bd-btn bd-btn--primary" data-bd-ready>${esc(tr('interval.ready', 'Ready'))}</button>`}
      </div>`);
      layer?.querySelector('[data-bd-ready]')?.addEventListener('click', (ev) => {
        ev.currentTarget.disabled = true;
        ev.currentTarget.textContent = tr('interval.waiting', 'Waiting for the others…');
        Promise.resolve(o.send('ready', {})).catch(() => {});
      });
    }

    function outcomeTitle(state) {
      const r = state.result;
      if (!r) return tr('result.void', 'Match ended');
      if (o.spectator) return state.config.sides[r.winner].name + ' ' + tr('result.win3', 'win');
      return r.winner === mySide() ? tr('result.youWin', 'You win') : tr('result.youLose', 'You lose');
    }

    function settlementNote() {
      const sm = pub.settlement && pub.settlement[o.me];
      if (!o.live || o.spectator) return '';
      if (!sm) return pub.rated || pub.stake || BM().humans(pub).length > 1 ? tr('live.settling', 'Settling…') : '';
      const bits = [];
      if (sm.chipDelta) bits.push((sm.chipDelta > 0 ? '+' : '') + sm.chipDelta + ' ' + tr('chips', 'chips'));
      if (sm.eloDelta) bits.push((sm.eloDelta > 0 ? '+' : '') + sm.eloDelta + ' ' + tr('rating', 'rating'));
      if (sm.team) bits.push(sm.won ? tr('team.won', 'Team win recorded') : tr('team.lost', 'Team result recorded'));
      return bits.join(' · ') + (sm.chipDelta ? ' · ' + tr('virtual', 'virtual chips only') : '');
    }

    function shareText(state) {
      const lines = state.games.map((g) => g.score[mySide()] + '–' + g.score[1 - mySide()]).join(', ');
      const won = state.result && state.result.winner === mySide();
      return (won ? tr('share.won', 'I won at Badminton on Chaupaal') : tr('share.played', 'I played Badminton on Chaupaal')) + ': ' + lines;
    }

    function paintResult(state) {
      const note = body.querySelector('[data-bd-note]');
      if (resultShown) {
        if (note) note.textContent = settlementNote();
        const rb = body.querySelector('[data-bd-rematch]');
        if (rb && o.rematchLabel) {
          const l = o.rematchLabel(pub);
          rb.textContent = l.text;
          rb.disabled = !!l.disabled;
        }
        return;
      }
      resultShown = true;
      shell.markOver();
      const r = state.result;
      const won = r && r.winner === mySide() && !o.spectator;
      if (shell.gs && typeof shell.gs.setOutcome === 'function' && !o.spectator) shell.gs.setOutcome(r ? (won ? 'won' : 'lost') : 'draw');
      if (!o.spectator) buzz(won ? 'win' : 'lose');
      const lines = state.games.map((g) => `<span class="bd-game-line">${g.score[mySide()]}–${g.score[1 - mySide()]}</span>`).join('');
      const layer = layerHtml(`<div class="bd-result">
        <div class="bd-result-mark">${typeof gameMarkHtml === 'function' ? gameMarkHtml(GAME, { size: 56 }) : '🏸'}</div>
        <div class="bd-result-title">${esc(outcomeTitle(state))}</div>
        <div class="bd-result-games">${lines}</div>
        <div class="bd-result-sub">${esc(r && r.by !== 'games' ? r.text : state.calls.map((c) => c.text).join(' · '))}</div>
        <p class="bd-note" data-bd-note>${esc(settlementNote())}</p>
        ${statsHtml(pub, mySide())}
        <div class="bd-result-actions">
          ${o.spectator ? '' : `<button type="button" class="bd-btn bd-btn--primary" data-bd-rematch>${esc(o.live ? tr('rematch', 'Rematch') : tr('again', 'Play again'))}</button>`}
          <button type="button" class="bd-btn" data-bd-share>${esc(tr('share', 'Share'))}</button>
          <button type="button" class="bd-btn bd-btn--ghost" data-bd-done>${esc(tr('done', 'Done'))}</button>
        </div>
      </div>`);
      if (!layer) return;
      layer.querySelector('[data-bd-rematch]')?.addEventListener('click', (ev) => {
        if (o.live) {
          ev.currentTarget.disabled = true;
          if (o.onRematch) o.onRematch();
        } else if (o.onAgain) o.onAgain();
      });
      layer.querySelector('[data-bd-share]')?.addEventListener('click', () => {
        const s = BM().statsOf(pub);
        const scoreLine = state.games.map((g) => g.score[mySide()] + '–' + g.score[1 - mySide()]).join(' ');
        const mySmash = s.fastest && BM().sideOfSeat(s.fastest.seat) === mySide() ? s.fastest.kmh : 0;
        const meta =
          tr('share.meta', 'Longest rally') + ' ' + s.longest + ' ' + tr('stats.shots', 'shots') + (mySmash ? ' · ' + tr('share.smash', 'Fastest smash') + ' ' + mySmash + ' ' + tr('simkmh', 'sim km/h') : '') + ' · ' + tr('stats.winners', 'Winners') + ' ' + s.winners[mySide()];
        if (typeof openUnifiedShareSheet === 'function') {
          openUnifiedShareSheet({
            gameId: GAME,
            stats: {
              scoreLine,
              text: shareText(state),
              meta,
              longestRally: s.longest,
              fastestSmash: mySmash ? mySmash + ' sim km/h' : '',
            },
          });
        } else toast(shareText(state) + ' · ' + meta);
      });
      layer.querySelector('[data-bd-done]')?.addEventListener('click', () => shell.close('done'));
    }

    function openStats() {
      if (!pub) return;
      const html = statsHtml(pub, mySide(), o.serverNow());
      if (Kit() && Kit().openSheet) Kit().openSheet({ title: tr('stats.title', 'Stats'), bodyHtml: html });
      else layerHtml(html + `<button type="button" class="bd-btn" data-bd-close>${esc(tr('close', 'Close'))}</button>`)?.querySelector('[data-bd-close]')?.addEventListener('click', () => layerHtml(null));
    }

    function frame() {
      raf = 0;
      if (!pub || !shell.alive()) return;
      const now = o.serverNow();
      const state = visibleState(now);
      if (state.visibleCount !== shownEvents) {
        const first = shownEvents < 0;
        const prev = shownEvents;
        shownEvents = state.visibleCount;
        paintBoard(state);
        const text = state.calls.map((c) => c.text).join(' · ');
        if (text) {
          showCall(text, now);
          if (!first) speak(text);
        }
        if (!first && prev >= 0) {
          const last = pub.log[state.visibleCount - 1];
          if (last && last.t === 'rally' && !o.spectator) buzz(last.w === mySide() ? 'kick' : 'select');
        }
      }
      if (pub.phase !== shownPhase) shownPhase = pub.phase;
      paintPositions(state, now);
      paintShuttle(state, now);
      cueSounds(now);
      lineCall(now);
      if (pub.status === 'over' && (pub.endedAt || 0) <= now) paintResult(BM().stateOf(pub));
      else {
        paintBar(now);
        paintInterval(state, now);
        paintPaused(now);
      }
      if (callText && now > callUntil + 4000) {
        const el = body.querySelector('[data-bd-call]');
        if (el) el.classList.remove('is-fresh');
      }
      raf = requestAnimationFrame(frame);
    }

    return {
      set(next) {
        const first = !pub;
        pub = next;
        if (first) {
          layout();
          if (!coachShown && !o.spectator) toast(pub.simple && pub.simple[o.me] ? tr('coachSimple', 'Tap as the bar crosses the green band') : tr('coach', 'Swipe up (or tap) as the bar crosses the green band'));
        }
        if (resultShown && pub.status === 'over') paintResult(BM().stateOf(pub));
        if (!raf) raf = requestAnimationFrame(frame);
      },
      get pub() {
        return pub;
      },
      destroy() {
        if (raf) cancelAnimationFrame(raf);
        raf = 0;
        hush();
      },
      mySide,
    };
  }

  // ---------------------------------------------------------------- vs Bot (local reducer)

  function startLocal(opts) {
    const o = opts || {};
    if (!E() || !BM() || !R()) {
      toast(LABEL + ' ' + tr('loading', 'is still loading — try again'));
      return;
    }
    const s = settings();
    const doubles = o.discipline === 'doubles';
    const bot = botSeatFor(s);
    // Your doubles partner is an All-rounder of the same level (it rotates and covers for you).
    const partner = 'bot:' + s.level;
    const seats = doubles ? { A0: 'me', A1: partner, B0: bot, B1: bot } : { A0: 'me', B0: bot };
    let view = null;
    let timer = 0;
    const shell = openShell({
      id: GAME,
      title: LABEL,
      subtitle: practiceSub((doubles ? tr('doubles', 'Doubles') + ' · ' : '') + formatLabel(s.format) + ' · ' + levelLabel(s.level, s.persona) + (s.simple ? ' · ' + tr('simple', 'Simple controls') : '')),
      mode: 'practice',
      accent: '#01579B',
      bg: '#000D1A',
      leaveBody: tr('leave.practice', 'This match will end.'),
      cleanup: () => {
        if (timer) clearInterval(timer);
        timer = 0;
        if (view) view.destroy();
      },
    });
    if (!shell) return;
    attachHow(shell);
    let room = BM().reduceMatch(null, 'me', 'create', { matchId: 'local_' + Date.now().toString(36), discipline: doubles ? 'doubles' : 'singles', format: s.format, seats, names: { A0: myName() }, tier: s.level, persona: s.persona, simple: s.simple, local: true }, Date.now(), Math.random).match;
    const send = (op, args) => {
      const r = BM().reduceMatch(room, 'me', op, args, Date.now(), Math.random);
      if (r) {
        room = r.match;
        view.set(room.pub);
      }
      return Promise.resolve(r && r.result);
    };
    view = createCourtView({
      shell,
      me: 'me',
      live: false,
      serverNow: () => Date.now(),
      send: (op, args) => {
        try {
          return send(op, args);
        } catch (e) {
          return Promise.reject(e);
        }
      },
      onAgain: () => {
        shell.close('again');
        setTimeout(() => startLocal(o), 150);
      },
    });
    view.set(room.pub);
    timer = setInterval(() => {
      if (!shell.alive()) return;
      const p = room.pub;
      if (p.status === 'playing' && Date.now() >= p.deadline) {
        try {
          send('tick', {});
        } catch (e) {}
      }
    }, 120);
  }

  function attachHow(shell) {
    if (typeof GameUI !== 'undefined' && GameUI.attachHowTo) {
      const spec = RALLY;
      const shared = window.DangalRules && window.DangalRules.get(spec.id);
      GameUI.attachHowTo(shell.overlay, shared
        ? { gameId: spec.id, title: 'How to play ' + (spec.name || 'Badminton') }
        : { title: spec.name, body: attribution() });
    }
  }

  // ---------------------------------------------------------------- Live (server-resolved)

  let lastRtt = 0;
  function noteRtt(ms) {
    if (!(ms > 0) || ms > 10000) return;
    lastRtt = lastRtt ? Math.round(lastRtt * 0.7 + ms * 0.3) : Math.round(ms);
  }
  async function liveCall(op, args) {
    if (typeof apiFetch !== 'function') throw Object.assign(new Error('Offline'), { code: 'OFFLINE' });
    const t0 = Date.now();
    const res = await apiFetch('/api/media-config', {
      method: 'POST',
      needAuth: true,
      body: Object.assign({ action: 'badminton_match', op }, args || {}),
    });
    noteRtt(Date.now() - t0);
    if (!res || !res.ok) {
      const e = new Error((res && res.error && res.error.message) || 'Something went wrong');
      e.code = (res && res.error && res.error.code) || 'ERROR';
      throw e;
    }
    return res.data || {};
  }
  function liveErrorText(e) {
    const code = String((e && e.code) || '').toUpperCase();
    if (code === 'NOT_IN_MATCH') return tr('err.notIn', 'This match is for other players');
    if (code === 'RATE_LIMITED') return tr('err.rate', 'Slow down a little — try again in a moment');
    if (code === 'MATCH_NOT_FOUND') return tr('err.gone', 'That match has ended');
    if (code === 'BAD_OPPONENT') return tr('err.opp', 'Pick a real opponent');
    if (code === 'NOT_YOUR_SHOT') return tr('err.notYours', 'Your partner has this one');
    return typeof navigator !== 'undefined' && navigator.onLine === false
      ? tr('err.offline', 'You’re offline — reconnect to keep playing')
      : tr('err.generic', 'Couldn’t reach the match — try again');
  }

  /**
   * @param {{ matchId: string, opponentUid?: string, host?: boolean, stake?: number, create?: object,
   *           spectate?: boolean, source?: string, chat?: object, oppName?: string }} cfg
   */
  function startLive(cfg) {
    if (!E() || !BM()) {
      toast(LABEL + ' ' + tr('loading', 'is still loading — try again'));
      return;
    }
    const me = myUid();
    const spectator = !!cfg.spectate;
    const matchId = cleanId(cfg.matchId);
    const s = settings();
    if (!me || !matchId || (!spectator && !cfg.create && !persistable(cfg.opponentUid) && !cfg.joinOnly)) {
      toast(tr('err.link', 'That challenge link is broken — try again from Dangal'));
      return;
    }
    const ref = typeof rtdb !== 'undefined' && rtdb ? rtdb.ref('games/badminton/' + matchId) : null;
    const TS = window.firebase && firebase.database && firebase.database.ServerValue ? firebase.database.ServerValue.TIMESTAMP : Date.now();
    let pub = null;
    let presence = {};
    let offset = 0;
    let stopped = false;
    let view = null;
    let lastTick = 0;
    let lastSettle = 0;
    let rematchAsked = false;
    let switching = false;
    let mode = '';
    const subs = [];
    const timers = [];
    const liveHandle = {
      leave() {
        if (!pub || pub.status !== 'playing' || spectator) return;
        liveCall('leave', { matchId }).catch(() => {});
      },
    };
    const shell = openShell({
      id: GAME,
      title: LABEL,
      subtitle: spectator ? tr('watch', 'Watching') : liveSub(),
      mode: spectator ? 'practice' : 'live',
      live: !spectator,
      chat: cfg.chat,
      accent: '#01579B',
      bg: '#000D1A',
      liveHandle: spectator ? null : liveHandle,
      leaveBody: tr('leave.live', 'You’ll forfeit this Live match.'),
      cleanup: () => {
        stopped = true;
        subs.forEach((f) => {
          try {
            f();
          } catch (e) {}
        });
        timers.forEach((id) => clearInterval(id));
        if (view) view.destroy();
        try {
          if (presRef) presRef.set({ at: TS, online: false });
        } catch (e) {}
      },
    });
    if (!shell) return;
    attachHow(shell);
    const serverNow = () => Date.now() + offset;
    const oppUids = () => (pub ? BM().humans(pub).filter((u) => u !== me) : []);
    const goneFor = (uid) => {
      const p = presence[uid];
      if (!p || !p.at) return 0;
      if (p.online !== false && serverNow() - p.at < 25000) return 0;
      return Math.max(0, serverNow() - p.at);
    };

    function card(title, sub, actions) {
      if (view) {
        view.destroy();
        view = null;
      }
      mode = 'card';
      shell.body.innerHTML = `<div class="bd-card">
        <div class="bd-result-mark">${typeof gameMarkHtml === 'function' ? gameMarkHtml(GAME, { size: 56 }) : '🏸'}</div>
        <div class="bd-card-title">${esc(title)}</div>
        ${sub ? `<div class="bd-card-sub">${sub}</div>` : ''}
        <div class="bd-result-actions">${(actions || []).map((a, i) => `<button type="button" class="bd-btn${a.primary ? ' bd-btn--primary' : ''}" data-act="${i}">${esc(a.label)}</button>`).join('')}</div>
      </div>`;
      (actions || []).forEach((a, i) => shell.body.querySelector('[data-act="' + i + '"]')?.addEventListener('click', a.fn));
    }

    function renderWaiting() {
      const seats = BM()
        .seatList(pub)
        .map((seat) => {
          const v = pub.seats[seat];
          const bot = BM().isBot(v);
          const ok = bot || pub.joined[v];
          return `<li class="bd-seat${ok ? ' is-in' : ''}"><span>${esc(pub.names[seat] || seat)}</span><em>${esc(bot ? tr('seat.bot', 'Bot') : ok ? tr('seat.in', 'Ready') : tr('seat.wait', 'Invited…'))}</em></li>`;
        })
        .join('');
      const host = pub.host === me && pub.discipline === 'doubles';
      const late = serverNow() - pub.createdAt > 20000;
      card(
        pub.discipline === 'doubles' ? tr('wait.doubles', 'Doubles — waiting for players') : tr('wait.title', 'Waiting for your opponent'),
        `<ul class="bd-seats">${seats}</ul><p class="bd-card-note">${esc(formatLabel(pub.format) + (pub.rated ? ' · ' + tr('rated', 'rated') : ' · ' + tr('unrated', 'unrated')) + (Object.keys(pub.simple || {}).length ? ' · ' + tr('simple', 'Simple controls') : ''))}</p>${
          pub.rated && lastRtt > HIGH_RTT_MS ? `<p class="bd-card-note bd-card-warn">${esc(tr('net.warnWait', 'Your connection is slow') + ' (' + lastRtt + ' ms) — ' + tr('net.warnWait2', 'shots may land late in this rated match. Try Wi-Fi, or play unrated.'))}</p>` : ''
        }`,
        [
          host && late ? { label: tr('wait.fill', 'Fill empty seats with Bots'), primary: true, fn: () => liveCall('fill', { matchId, tier: s.level, persona: s.persona }).catch((e) => toast(liveErrorText(e))) } : null,
          { label: tr('wait.cancel', 'Cancel'), fn: () => liveCall('leave', { matchId }).catch(() => {}).then(() => shell.close('cancel')) },
        ].filter(Boolean)
      );
      mode = 'waiting';
    }

    function rematchLabel(p) {
      const r = p.rematch || {};
      if (p.nextMatchId && (rematchAsked || r[me])) return { text: tr('rematch.opening', 'Opening…'), disabled: true };
      if (rematchAsked || r[me]) return { text: tr('rematch.waiting', 'Waiting for the others…'), disabled: true };
      if (oppUids().some((u) => r[u])) return { text: tr('rematch.accept', 'Rematch requested — accept'), disabled: false };
      return { text: tr('rematch', 'Rematch'), disabled: false };
    }
    function askRematch() {
      rematchAsked = true;
      liveCall('rematch', { matchId })
        .then((r) => {
          if (r && r.nextMatchId) switchTo(r.nextMatchId);
        })
        .catch((e) => {
          rematchAsked = false;
          toast(liveErrorText(e));
        });
    }
    function switchTo(nextId) {
      if (switching) return;
      switching = true;
      shell.markOver();
      shell.close('rematch');
      setTimeout(() => startLive({ matchId: nextId, joinOnly: true, source: cfg.source, chat: cfg.chat }), 150);
    }

    function render() {
      if (!pub || stopped || switching) return;
      if (pub.status === 'waiting') return renderWaiting();
      if (pub.status === 'void') return card(tr('void', 'Match cancelled'), esc(pub.reason === 'no_show' ? tr('void.noShow', 'Not everyone joined in time') : ''), [{ label: tr('done', 'Done'), primary: true, fn: () => shell.close('done') }]);
      if (mode !== 'play') {
        mode = 'play';
        shell.body.innerHTML = '';
        view = createCourtView({
          shell,
          me,
          spectator,
          live: true,
          serverNow,
          rtt: () => lastRtt,
          errorText: liveErrorText,
          send: (op, args) => liveCall(op, Object.assign({ matchId }, args)),
          onRematch: askRematch,
          rematchLabel,
        });
        // Rated match on a slow connection: say so before the first serve.
        if (pub.rated && lastRtt > HIGH_RTT_MS) toast(tr('net.warn', 'Your connection is slow — timing may feel late in this rated match'));
      }
      view.set(pub);
      if (pub.status === 'over' && pub.nextMatchId && (rematchAsked || (pub.rematch && pub.rematch[me]))) switchTo(pub.nextMatchId);
    }

    function paintPresence() {
      let el = shell.overlay.querySelector('[data-bd-banner]');
      const gone = pub && pub.status === 'playing' && !spectator ? oppUids().find((u) => goneFor(u) > 0) : '';
      if (!gone) {
        if (el) el.remove();
        return;
      }
      if (!el) {
        el = document.createElement('div');
        el.className = 'bd-banner';
        el.setAttribute('data-bd-banner', '');
        el.setAttribute('role', 'status');
        shell.overlay.appendChild(el);
      }
      const seat = BM().seatOfUid(pub, gone);
      const leftMs = Math.max(0, RECONNECT_MS - goneFor(gone));
      el.textContent = (pub.names[seat] || tr('opp', 'Opponent')) + ' ' + tr('live.reconnecting', 'lost connection — waiting') + ' ' + Math.ceil(leftMs / 1000) + 's';
    }

    function loop() {
      if (stopped || !pub) return;
      const now = serverNow();
      paintPresence();
      if (spectator) return;
      const gap = Date.now() - lastTick;
      const anyGone = oppUids().some((u) => goneFor(u) > RECONNECT_MS + 500);
      // A dropped player mid-rally → the server turns the rally into a let and pauses; while paused,
      // keep nudging so play resumes as soon as everyone's back.
      const dropNow = (pub.phase === 'serve' || pub.phase === 'rally') && oppUids().some((u) => goneFor(u) > 0);
      if (pub.status === 'playing' && (pub.phase === 'paused' || dropNow) && gap > 2000) {
        lastTick = Date.now();
        liveCall('tick', { matchId }).catch(() => {});
        return;
      }
      if (pub.status === 'waiting' && now >= pub.deadline && gap > 2500) {
        lastTick = Date.now();
        liveCall('tick', { matchId }).catch(() => {});
      } else if (pub.status === 'waiting' && mode === 'waiting' && pub.host === me && gap > 5000) {
        lastTick = Date.now();
        renderWaiting();
      } else if (pub.status === 'playing' && gap > 900 && (now >= pub.deadline + 200 || anyGone)) {
        lastTick = Date.now();
        setTimeout(() => liveCall('tick', { matchId }).catch(() => {}), Math.floor(Math.random() * 250));
      } else if (pub.status === 'over' && !pub.settlement && now - (pub.endedAt || 0) > 6000 && Date.now() - lastSettle > 8000) {
        lastSettle = Date.now();
        liveCall('settle', { matchId }).catch(() => {});
      }
    }

    let presRef = null;
    function subscribe() {
      if (!ref) {
        card(tr('err.generic', 'Couldn’t reach the match — try again'), '', [{ label: tr('done', 'Done'), fn: () => shell.close('done') }]);
        return;
      }
      const pubRef = ref.child('pub');
      const onPub = (snap) => {
        const v = snap.val();
        if (!v) {
          if (spectator) card(tr('err.gone', 'That match has ended'), '', [{ label: tr('done', 'Done'), fn: () => shell.close('done') }]);
          return;
        }
        pub = BM().hydrate({ pub: v }).pub;
        render();
      };
      pubRef.on('value', onPub, () => {
        if (spectator) card(tr('err.watchDenied', 'You can’t watch this match'), '', [{ label: tr('done', 'Done'), fn: () => shell.close('done') }]);
      });
      subs.push(() => pubRef.off('value', onPub));
      try {
        const offsetRef = rtdb.ref('.info/serverTimeOffset');
        const onOff = (snap) => {
          const v = snap && snap.val();
          if (typeof v === 'number' && isFinite(v)) offset = v;
        };
        offsetRef.on('value', onOff);
        subs.push(() => offsetRef.off('value', onOff));
      } catch (e) {}
      timers.push(setInterval(loop, 300));
      if (spectator) return;
      const presAll = ref.child('presence');
      const onPres = (snap) => {
        presence = snap.val() || {};
      };
      presAll.on('value', onPres, () => {});
      subs.push(() => presAll.off('value', onPres));
      presRef = ref.child('presence/' + me);
      const beat = () => {
        if (stopped) return;
        const t0 = Date.now();
        presRef
          .set({ at: TS, online: true })
          .then(() => noteRtt(Date.now() - t0))
          .catch(() => {});
      };
      try {
        presRef.onDisconnect().set({ at: TS, online: false });
      } catch (e) {}
      beat();
      timers.push(setInterval(beat, 10000));
      const onVis = () => {
        if (document.visibilityState === 'visible') beat();
      };
      document.addEventListener('visibilitychange', onVis);
      subs.push(() => document.removeEventListener('visibilitychange', onVis));
    }

    if (spectator) {
      card(tr('watch.connecting', 'Opening the match…'), '', []);
      subscribe();
      return;
    }
    card(tr('live.connecting', 'Joining the match…'), '', []);
    const first = cfg.create
      ? liveCall('create', Object.assign({ matchId, name: myName(), tier: s.level, persona: s.persona, simple: s.simple }, cfg.create))
      : liveCall('join', {
          matchId,
          opponentUid: cfg.opponentUid,
          playerA: cfg.host ? me : cfg.opponentUid,
          stake: cfg.host ? cfg.stake || 0 : undefined,
          format: cfg.host ? (cfg.matchmaking ? 'standard' : s.format) : undefined,
          name: myName(),
          simple: s.simple || undefined,
        });
    first
      .then(() => subscribe())
      .catch((e) => {
        if (String(e && e.code).toUpperCase() === 'EXISTS') return subscribe();
        card(liveErrorText(e), '', [{ label: tr('done', 'Done'), primary: true, fn: () => shell.close('done') }]);
      });
  }

  // ---------------------------------------------------------------- home + invites

  function signedInOrPrompt() {
    if (myUid()) return true;
    toast(tr('err.signin', 'Sign in to play Live'));
    return false;
  }

  let home = null;
  function openHome() {
    if (!Kit()) return startLocal({});
    if (home && !home.closed) home.close();
    const s = settings();
    const shell = Kit().openShell({ gameId: GAME, title: LABEL, subtitle: tr('home.sub', 'Sports') });
    home = shell;
    const line = formatLabel(s.format) + ' · ' + levelLabel(s.level, s.persona) + (s.simple ? ' · ' + tr('simple', 'Simple controls') : '');
    shell.render(`<div class="pk-page bd-home">
      <div class="pk-hero">
        <div class="pk-hero-mark">${typeof gameMarkHtml === 'function' ? gameMarkHtml(GAME, { size: 64 }) : '🏸'}</div>
        <div class="pk-hero-title">${esc(LABEL)}</div>
        <div class="pk-hero-sub">${esc(tr('home.tag', 'Serve, rally, win the point.'))}</div>
      </div>
      <div class="pk-modes">
        <button type="button" class="pk-mode pk-mode--primary" data-go="bot">
          <span class="pk-mode-title">${esc(tr('home.bot', 'Play vs Bot'))}</span>
          <span class="pk-mode-sub">${esc(tr('singles', 'Singles') + ' · ' + line)}</span>
        </button>
        <button type="button" class="pk-mode" data-go="friend">
          <span class="pk-mode-title">${esc(tr('home.friend', 'Play a friend'))}</span>
          <span class="pk-mode-sub">${esc(tr('home.friendSub', 'Live singles · Standard is rated'))}</span>
        </button>
        <button type="button" class="pk-mode" data-go="doubles">
          <span class="pk-mode-title">${esc(tr('home.doubles', 'Doubles'))}</span>
          <span class="pk-mode-sub">${esc(tr('home.doublesSub', 'With a Bot partner, friends, or anyone'))}</span>
        </button>
        <button type="button" class="pk-link" data-go="find">${esc(tr('home.find', 'Find an opponent'))}</button>
        <button type="button" class="pk-link" data-go="drills">${esc(tr('home.drills', 'Drills'))}</button>
        <button type="button" class="pk-link" data-go="settings">${esc(tr('home.settings', 'Match settings'))}</button>
        <button type="button" class="pk-link" data-go="rules">${esc(tr('rules.short', 'Rules'))}</button>
      </div>
    </div>`);
    const go = (sel, fn) => shell.body.querySelector(sel)?.addEventListener('click', fn);
    go('[data-go="bot"]', () => Kit().closeThen(shell, () => startLocal({})));
    go('[data-go="friend"]', () => challengeFriend(shell));
    go('[data-go="doubles"]', () => openDoublesSheet(shell));
    go('[data-go="find"]', () => findOpponent(shell));
    go('[data-go="drills"]', () => openDrillsSheet(shell));
    go('[data-go="settings"]', () => openSettings(() => Kit().closeThen(shell, openHome)));
    go('[data-go="rules"]', openRules);
  }

  const PERSONA_HELP = {
    allround: 'mixes everything, no obvious weakness.',
    attacker: 'smashes and kills whenever it can — make it hit from deep.',
    retriever: 'gets everything back with clears and lifts — be patient, then finish.',
    net: 'lives at the net with tight spinners and kills — lift it to the back.',
  };

  function openSettings(onDone) {
    const K = Kit();
    const Eng = E();
    const Rl = R();
    const st = settings();
    K.openSheet({
      title: tr('home.settings', 'Match settings'),
      bodyHtml: '<div data-bd-set></div>',
      onMount: (el, close) => {
        const host = el.querySelector('[data-bd-set]');
        const paint = () => {
          host.innerHTML = `
            <div class="pk-field"><div class="pk-field-label">${esc(tr('set.format', 'Format'))}</div>
              ${K.segHtml('format', st.format, Eng.FORMAT_ORDER.map((id) => [id, formatLabel(id)]))}
              <div class="pk-field-help">${esc(Eng.FORMATS[st.format].blurb + (Eng.FORMATS[st.format].rated ? ' · ' + tr('set.rated', 'rated in Live singles') : ' · ' + tr('unrated', 'unrated')))}</div></div>
            <div class="pk-field"><div class="pk-field-label">${esc(tr('set.level', 'Bot level'))}</div>
              ${K.segHtml('level', st.level, Rl.LEVEL_ORDER.map((id) => [id, tr('level.' + id, Rl.LEVELS[id].label)]))}</div>
            <div class="pk-field"><div class="pk-field-label">${esc(tr('set.persona', 'Bot style'))}</div>
              ${K.segHtml('persona', st.persona, Rl.PERSONA_ORDER.map((id) => [id, tr('persona.' + id, Rl.PERSONAS[id].label)]))}
              <div class="pk-field-help">${esc(levelLabel(st.level, st.persona) + ' — ' + tr('persona.help.' + st.persona, PERSONA_HELP[st.persona] || ''))}</div></div>
            <details class="bd-adv"><summary>${esc(tr('set.more', 'More'))}</summary>
              <label class="bd-toggle"><input type="checkbox" data-bd-pref="simple"${st.simple ? ' checked' : ''}> <span>${esc(tr('set.simple', 'Simple controls — tap only, the shot is picked for you (unrated)'))}</span></label>
              <label class="bd-toggle"><input type="checkbox" data-bd-pref="sound"${st.sound ? ' checked' : ''}> <span>${esc(tr('set.sound', 'Racket, shuttle and crowd sounds'))}</span></label>
              <label class="bd-toggle"><input type="checkbox" data-bd-pref="voice"${st.voice ? ' checked' : ''}> <span>${esc(tr('set.voice', 'Umpire calls read aloud'))}</span></label>
            </details>
            <button type="button" class="pk-btn pk-btn--primary" data-done>${esc(tr('set.done', 'Done'))}</button>`;
          K.wireSegs(host, st, () => {
            saveSettings(st);
            paint();
          });
          host.querySelectorAll('[data-bd-pref]').forEach((cb) =>
            cb.addEventListener('change', () => {
              st[cb.dataset.bdPref] = cb.checked;
              saveSettings(st);
            })
          );
          host.querySelector('[data-done]').addEventListener('click', () => {
            close();
            if (onDone) onDone();
          });
        };
        paint();
      },
    });
  }

  async function challengeFriend(homeShell) {
    if (!signedInOrPrompt()) return;
    if (typeof openFriendPickerSheet !== 'function') return toast(tr('err.friends', 'Friends aren’t available right now'));
    const f = await openFriendPickerSheet({ title: tr('challenge.title', 'Challenge · Badminton'), subtitle: tr('challenge.sub', 'Live singles · virtual chips only') });
    if (!f) return;
    const uid = f.uid || f.id || '';
    if (!persistable(uid)) return toast(tr('err.opp', 'Pick a real opponent'));
    let stake = 0;
    if (typeof openDangalStakeSheet === 'function' && (typeof stakesEnabledForGame !== 'function' || stakesEnabledForGame(GAME))) {
      const picked = await openDangalStakeSheet(GAME, { defaultStake: 0 });
      if (picked == null) return;
      stake = Number(picked) || 0;
    }
    const s = settings();
    const mid = cleanId(typeof dangalMatchId === 'function' ? dangalMatchId(GAME, { name: f.name, uid, opponentUid: uid }) : GAME + '_' + Date.now());
    const chatId = f.chatId || f.firestoreId || '';
    if (typeof sendChallengeCard === 'function' && chatId) {
      try {
        await sendChallengeCard(uid, GAME, { chatId, matchId: mid, stake, mode: tr('singles', 'Singles') + ' · ' + formatLabel(s.format) });
      } catch (e) {}
    }
    const go = () => startLive({ matchId: mid, opponentUid: uid, host: true, stake, oppName: f.name, source: 'challenge_host' });
    if (homeShell && !homeShell.closed) Kit().closeThen(homeShell, go);
    else go();
  }

  function openDoublesSheet(homeShell) {
    const K = Kit();
    K.openSheet({
      title: tr('home.doubles', 'Doubles'),
      bodyHtml: `<div class="pk-modes">
        <button type="button" class="pk-mode pk-mode--primary" data-d="bot"><span class="pk-mode-title">${esc(tr('dbl.bot', 'You + Bot partner vs 2 Bots'))}</span><span class="pk-mode-sub">${esc(tr('dbl.botSub', 'Practice the doubles serve rotation'))}</span></button>
        <button type="button" class="pk-mode" data-d="friends"><span class="pk-mode-title">${esc(tr('dbl.friends', 'Doubles with friends'))}</span><span class="pk-mode-sub">${esc(tr('dbl.friendsSub', 'Pick a partner and opponents — Bots fill any seat'))}</span></button>
        <button type="button" class="pk-mode" data-d="find"><span class="pk-mode-title">${esc(tr('dbl.find', 'Find doubles'))}</span><span class="pk-mode-sub">${esc(tr('dbl.findSub', 'Meet three players · unrated'))}</span></button>
      </div>`,
      onMount: (el, close) => {
        el.querySelector('[data-d="bot"]').addEventListener('click', () => {
          close();
          K.closeThen(homeShell, () => startLocal({ discipline: 'doubles' }));
        });
        el.querySelector('[data-d="friends"]').addEventListener('click', () => {
          close();
          openDoublesSetup(homeShell);
        });
        el.querySelector('[data-d="find"]').addEventListener('click', () => {
          close();
          findDoubles(homeShell);
        });
      },
    });
  }

  /** Pick a partner + two opponents (each a friend or a Bot), create the room, send invites. */
  function openDoublesSetup(homeShell) {
    if (!signedInOrPrompt()) return;
    const K = Kit();
    const picks = { A1: null, B0: null, B1: null };
    const labels = { A1: tr('dbl.partner', 'Your partner'), B0: tr('dbl.opp1', 'Opponent 1'), B1: tr('dbl.opp2', 'Opponent 2') };
    K.openSheet({
      title: tr('dbl.friends', 'Doubles with friends'),
      bodyHtml: '<div data-bd-dbl></div>',
      onMount: (el, close) => {
        const host = el.querySelector('[data-bd-dbl]');
        const paint = () => {
          host.innerHTML = `<ul class="bd-seats">${Object.keys(picks)
            .map((s) => `<li class="bd-seat"><span>${esc(labels[s])}</span><button type="button" class="pk-btn pk-btn--ghost" data-pick="${s}">${esc(picks[s] ? picks[s].name : tr('seat.bot', 'Bot'))}</button></li>`)
            .join('')}</ul>
            <p class="pk-field-help">${esc(tr('dbl.help', 'Tap a seat to invite a friend. Doubles is unrated; team results go on your profile.'))}</p>
            <button type="button" class="pk-btn pk-btn--primary" data-start>${esc(tr('dbl.start', 'Send invites'))}</button>`;
          host.querySelectorAll('[data-pick]').forEach((b) =>
            b.addEventListener('click', async () => {
              const seat = b.dataset.pick;
              if (picks[seat]) {
                picks[seat] = null;
                return paint();
              }
              if (typeof openFriendPickerSheet !== 'function') return toast(tr('err.friends', 'Friends aren’t available right now'));
              const f = await openFriendPickerSheet({ title: labels[seat], subtitle: tr('dbl.pickSub', 'Live doubles · unrated') });
              const uid = f && (f.uid || f.id);
              if (!uid || !persistable(uid)) return;
              if (Object.keys(picks).some((k) => picks[k] && picks[k].uid === uid)) return toast(tr('dbl.dupe', 'They already have a seat'));
              picks[seat] = { uid, name: String(f.name || 'Friend').split(' ')[0].slice(0, 16), chatId: f.chatId || f.firestoreId || '' };
              paint();
            })
          );
          host.querySelector('[data-start]').addEventListener('click', async () => {
            const friends = Object.keys(picks).filter((k) => picks[k]);
            close();
            if (!friends.length) return K.closeThen(homeShell, () => startLocal({ discipline: 'doubles' }));
            const s = settings();
            const mid = cleanId(GAME + '_d_' + Date.now().toString(36) + Math.floor(Math.random() * 1e4).toString(36));
            const seats = {};
            const names = {};
            Object.keys(picks).forEach((k) => {
              seats[k] = picks[k] ? picks[k].uid : k === 'A1' ? 'bot:' + s.level : botSeatFor(s);
              if (picks[k]) names[k] = picks[k].name;
            });
            const go = () => startLive({ matchId: mid, create: { discipline: 'doubles', format: s.format, seats, names }, source: 'doubles_host' });
            K.closeThen(homeShell, go);
            // Invites after the room exists (a short beat covers the create call).
            setTimeout(() => {
              friends.forEach((k) => {
                const p = picks[k];
                if (typeof sendChallengeCard === 'function' && p.chatId) {
                  sendChallengeCard(p.uid, GAME, { chatId: p.chatId, matchId: mid, stake: 0, mode: tr('doubles', 'Doubles') + ' · ' + formatLabel(s.format) }).catch(() => {});
                }
              });
            }, 1500);
          });
        };
        paint();
      },
    });
  }

  function findOpponent(homeShell) {
    if (!signedInOrPrompt()) return;
    if (typeof findRealOpponent !== 'function') return toast(tr('err.mm', 'Matchmaking isn’t available right now'));
    const K = Kit();
    let handle = null;
    let settled = false;
    const sheet = K.openSheet({
      title: tr('find.title', 'Finding an opponent'),
      bodyHtml: `<div class="bd-finding"><div class="bd-finding-mark" aria-hidden="true">🏸</div>
        <div class="pk-sub">${esc(tr('find.sub', 'Looking for someone near your rating…'))}</div>
        <button type="button" class="pk-btn pk-btn--ghost" data-cancel>${esc(tr('find.cancel', 'Cancel'))}</button></div>`,
      onMount: (el, close) => el.querySelector('[data-cancel]').addEventListener('click', () => close()),
      onClose: () => {
        if (!settled && handle) handle.cancel();
      },
    });
    handle = findRealOpponent(
      { category: GAME, gameId: GAME },
      (m) => {
        settled = true;
        sheet.close();
        const go = () => {
          if (!m || m.simulated || !m.matchId || !persistable(m.uid)) {
            toast(tr('find.none', 'No one free right now — warming up against a Bot'));
            return startLocal({});
          }
          startLive({ matchId: m.matchId, opponentUid: m.uid, host: m.role === 'host', stake: 0, oppName: m.name, source: 'matchmaking', matchmaking: true });
        };
        setTimeout(() => (homeShell && !homeShell.closed ? K.closeThen(homeShell, go) : go()), 80);
      },
      () => {
        settled = true;
      }
    );
  }

  /** Doubles queue: poll the server until four players meet (or offer a Bot game). */
  function findDoubles(homeShell) {
    if (!signedInOrPrompt()) return;
    const K = Kit();
    let done = false;
    let timer = 0;
    const started = Date.now();
    const stop = () => {
      done = true;
      if (timer) clearInterval(timer);
    };
    const sheet = K.openSheet({
      title: tr('dbl.find', 'Find doubles'),
      bodyHtml: `<div class="bd-finding"><div class="bd-finding-mark" aria-hidden="true">🏸</div>
        <div class="pk-sub" data-q>${esc(tr('dbl.finding', 'Looking for three more players…'))}</div>
        <button type="button" class="pk-btn pk-btn--ghost" data-cancel>${esc(tr('find.cancel', 'Cancel'))}</button></div>`,
      onMount: (el, close) => el.querySelector('[data-cancel]').addEventListener('click', () => close()),
      onClose: () => {
        if (!done) {
          stop();
          liveCall('unqueue', {}).catch(() => {});
        }
      },
    });
    const poll = () => {
      if (done) return;
      if (Date.now() - started > 60000) {
        stop();
        liveCall('unqueue', {}).catch(() => {});
        sheet.close();
        toast(tr('dbl.none', 'Not enough players right now — try doubles with a Bot partner'));
        return K.closeThen(homeShell, () => startLocal({ discipline: 'doubles' }));
      }
      liveCall('queue', { name: myName() })
        .then((r) => {
          if (done) return;
          if (r && r.matchId) {
            stop();
            sheet.close();
            K.closeThen(homeShell, () => startLive({ matchId: r.matchId, joinOnly: true, source: 'matchmaking_doubles' }));
            return;
          }
          const q = sheet.el ? sheet.el.querySelector('[data-q]') : document.querySelector('.pk-sheet [data-q]');
          if (q && r && r.count) q.textContent = tr('dbl.count', 'In the queue:') + ' ' + r.count + '/4';
        })
        .catch(() => {});
    };
    poll();
    timer = setInterval(poll, 2000);
  }

  // ---------------------------------------------------------------- drills (solo, unrated)

  function drillBests() {
    return readJson(KEY_DRILLS, {}) || {};
  }

  function openDrillsSheet(homeShell) {
    const K = Kit();
    const Rl = R();
    if (!K || !Rl) return;
    const best = drillBests();
    K.openSheet({
      title: tr('drills.title', 'Drills'),
      bodyHtml: `<div class="pk-modes">${Rl.DRILL_ORDER.map((id) => {
        const D = Rl.DRILLS[id];
        const pb = best[id] != null ? ' · ' + tr('drills.best', 'Best') + ' ' + best[id] + '/' + D.max : '';
        return `<button type="button" class="pk-mode" data-drill="${id}"><span class="pk-mode-title">${esc(tr('drill.' + id, D.label))}</span><span class="pk-mode-sub">${esc(tr('drill.' + id + '.sub', D.blurb) + pb)}</span></button>`;
      }).join('')}</div><p class="pk-field-help">${esc(tr('drills.help', 'Solo practice · unrated · 10 shots each'))}</p>`,
      onMount: (el, close) => {
        el.querySelectorAll('[data-drill]').forEach((b) =>
          b.addEventListener('click', () => {
            close();
            K.closeThen(homeShell, () => startDrill(b.dataset.drill));
          })
        );
      },
    });
  }

  function startDrill(kind) {
    const Rl = R();
    if (!E() || !Rl) {
      toast(LABEL + ' ' + tr('loading', 'is still loading — try again'));
      return;
    }
    const D = Rl.DRILLS[kind] || Rl.DRILLS.serve;
    let raf = 0;
    const shell = openShell({
      id: GAME,
      title: tr('drill.' + D.id, D.label),
      subtitle: practiceSub(tr('drills.one', 'Drill · unrated')),
      mode: 'practice',
      accent: '#01579B',
      bg: '#000D1A',
      leaveBody: tr('leave.drill', 'This drill will end.'),
      cleanup: () => {
        if (raf) cancelAnimationFrame(raf);
        raf = 0;
      },
    });
    if (!shell) return;
    attachHow(shell);
    const d = Rl.createDrill(D.id, Math.floor(Math.random() * 1e9));
    let startAt = 0;
    let dur = 0;
    let done = false;
    let shot = null;
    shell.body.innerHTML = `<div class="bd bd--drill">
      <div class="bd-board"><div class="bd-row is-mine"><span class="bd-names">${esc(tr('drill.' + D.id, D.label))}</span><span class="bd-score" data-dr-score>0</span></div>
        <div class="bd-board-meta" data-dr-meta></div></div>
      <p class="bd-call" data-dr-call aria-live="polite"></p>
      <div class="bd-court-wrap"><div class="bd-court" data-bd-court>
        <div class="bd-half bd-half--far"><i class="bd-box" data-box="far-L"></i><i class="bd-box" data-box="far-R"></i></div>
        <div class="bd-netline"></div>
        <div class="bd-half bd-half--near"><i class="bd-box" data-box="near-L"></i><i class="bd-box" data-box="near-R"></i></div>
        <i class="bd-land" data-bd-land></i>
        <span class="bd-shuttle" data-bd-shuttle aria-hidden="true"></span>
        <span class="bd-p bd-p--far" data-dr-p="B0"><b>B</b></span>
        <span class="bd-p bd-p--near is-me" data-dr-p="A0"><b>${esc(myName().charAt(0).toUpperCase())}</b></span>
      </div></div>
      <div class="bd-controls">
        <div class="bd-bar is-mine" aria-hidden="true"><i class="bd-bar-sweet"></i><i class="bd-bar-perfect"></i><i class="bd-bar-fill" data-bd-fill></i></div>
        <button type="button" class="bd-hit" data-bd-hit>${esc(tr('hit', 'Hit'))}</button>
        <p class="bd-hint" data-dr-hint>${esc(tr('drill.' + D.id + '.sub', D.blurb))}</p>
      </div>
      <div class="bd-layer" data-dr-layer hidden></div>
    </div>`;
    const $ = (sel) => shell.body.querySelector(sel);
    const court = $('[data-bd-court]');
    const place = (el, spot) => {
      if (!el || !spot) return;
      el.style.left = spot.left + '%';
      el.style.top = spot.top + '%';
    };
    function arm() {
      if (!d.contact) return finish();
      startAt = Date.now() + 900;
      dur = d.contact.win || 900;
      shot = null;
      const meta = $('[data-dr-meta]');
      if (meta) meta.textContent = tr('drills.shot', 'Shot') + ' ' + Math.min(d.i + 1, D.shots) + '/' + D.shots + (d.kind === 'serve' ? ' · ' + (d.target === 'low' ? tr('drill.targetLow', 'Target: low serve, just over the short line') : tr('drill.targetDeep', 'Target: swipe long — a high serve or flick to the back')) : '');
    }
    function play(g, at) {
      if (done || !d.contact || shot || !startAt || at < startAt - 150) return;
      const p = (at - startAt) / dur;
      const timing = p > 1 ? 'late' : E().timingOf(p) === 'none' ? 'early' : E().timingOf(p);
      const req = g && g.sw ? Object.assign({}, g.sw) : { tap: true };
      shot = Rl.playDrill(d, g === 'miss' ? { miss: true } : { req, hold: !!(g && g.hold), timing });
      shot.at = Date.now();
      if (Rl.SHOTS[shot.shot]) Snd.hit(Rl.SHOTS[shot.shot].power);
      if (Rl.SHOTS[shot.shot] && /smash|kill/.test(Rl.SHOTS[shot.shot].family)) vibrate(25);
      const call = $('[data-dr-call]');
      if (call) {
        call.textContent = (shot.pts ? '+' + shot.pts + ' · ' : '') + shot.note + (shot.shot && Rl.SHOTS[shot.shot] ? ' · ' + Rl.SHOTS[shot.shot].label : '');
        call.classList.remove('is-fresh');
        void call.offsetWidth;
        call.classList.add('is-fresh');
      }
      $('[data-dr-score]').textContent = String(d.score);
      setTimeout(() => {
        if (!done && shell.alive()) arm();
      }, 1300);
    }
    function finish() {
      if (done) return;
      done = true;
      const best = drillBests();
      const prev = best[D.id];
      const isBest = prev == null || d.score > prev;
      if (isBest) {
        best[D.id] = d.score;
        writeJson(KEY_DRILLS, best);
      }
      const layer = $('[data-dr-layer]');
      layer.hidden = false;
      layer.innerHTML = `<div class="bd-result">
        <div class="bd-result-title">${esc(d.score + ' / ' + D.max)}</div>
        <div class="bd-result-sub">${esc(isBest ? tr('drills.newBest', 'New personal best!') : tr('drills.best', 'Best') + ' ' + prev + '/' + D.max)}</div>
        <div class="bd-result-actions">
          <button type="button" class="bd-btn bd-btn--primary" data-again>${esc(tr('again', 'Play again'))}</button>
          <button type="button" class="bd-btn bd-btn--ghost" data-done>${esc(tr('done', 'Done'))}</button>
        </div></div>`;
      if (isBest) buzz('win');
      layer.querySelector('[data-again]').addEventListener('click', () => {
        shell.close('again');
        setTimeout(() => startDrill(D.id), 150);
      });
      layer.querySelector('[data-done]').addEventListener('click', () => shell.close('done'));
    }
    // Controls: swipe / tap anywhere on the court or the pad.
    [court, $('[data-bd-hit]')].forEach((el) => {
      let g = null;
      el.addEventListener('pointerdown', (ev) => {
        if (done || !d.contact || shot) return;
        ev.preventDefault();
        g = { id: ev.pointerId, x0: ev.clientX, y0: ev.clientY, t0: Date.now(), tMove: 0 };
        try {
          el.setPointerCapture(ev.pointerId);
        } catch (e) {}
      });
      el.addEventListener('pointermove', (ev) => {
        if (g && ev.pointerId === g.id && !g.tMove && Math.hypot(ev.clientX - g.x0, ev.clientY - g.y0) > 8) g.tMove = Date.now();
      });
      el.addEventListener('pointerup', (ev) => {
        if (!g || ev.pointerId !== g.id) return;
        const cur = Object.assign(g, { x1: ev.clientX, y1: ev.clientY, t1: Date.now() });
        g = null;
        const sw = swipeFrom(cur);
        play(sw, sw ? Date.now() : cur.t0);
      });
      el.addEventListener('pointercancel', () => (g = null));
    });
    function frame() {
      raf = 0;
      if (!shell.alive()) return;
      const now = Date.now();
      const rs = d.rs;
      place(court.querySelector('[data-dr-p="A0"]'), toScreen(0, rs.pos.A0, 0));
      place(court.querySelector('[data-dr-p="B0"]'), toScreen(1, rs.pos.B0, 0));
      const sh = court.querySelector('[data-bd-shuttle]');
      const landEl = court.querySelector('[data-bd-land]');
      if (shot && shot.land) {
        // My shot flying to their half.
        const p = clamp((now - shot.at) / 700, 0, 1);
        const arc = Rl.flightAt(shot.shot || 'lift', p);
        const from = toScreen(0, rs.pos.A0, 0);
        const to = toScreen(1, shot.land.y > 0 ? shot.land : { x: shot.land.x, y: 0.05 }, 0);
        place(sh, { left: from.left + (to.left - from.left) * arc.s, top: from.top + (to.top - from.top) * arc.s - arc.h * 1.5 });
        if (landEl) {
          landEl.style.opacity = p >= 1 ? '1' : '0';
          landEl.classList.toggle('is-out', shot.kind === 'fault');
          place(landEl, to);
        }
      } else if (d.contact && startAt) {
        // The feed coming to me (smash / net), or the shuttle in my hand (serve).
        const me = toScreen(0, rs.pos.A0, 0);
        const from = d.kind === 'serve' ? me : toScreen(1, rs.pos.B0, 0);
        const p = clamp(1 - (startAt + dur * 0.55 - now) / (dur * 0.55 + 900), 0, 1);
        const arc = Rl.flightAt(d.kind === 'smash' ? 'smash_jump' : 'net_tumble', p);
        place(sh, d.kind === 'serve' ? me : { left: from.left + (me.left - from.left) * arc.s, top: from.top + (me.top - from.top) * arc.s - arc.h * 1.5 });
        if (landEl) landEl.style.opacity = '0';
        if (!shot && now > startAt + dur + 500) play('miss', now);
      }
      if (sh) sh.style.opacity = d.contact || shot ? '1' : '0';
      const fill = $('[data-bd-fill]');
      if (fill) fill.style.transform = 'scaleX(' + (startAt && !shot ? clamp((now - startAt) / dur, 0, 1) : 0) + ')';
      if (!done) raf = requestAnimationFrame(frame);
    }
    arm();
    raf = requestAnimationFrame(frame);
  }

  // ---------------------------------------------------------------- entry + registration

  const RALLY = {
    id: 'badminton',
    name: 'Badminton',
    icon: '🏸',
    accent: '#01579B',
    bg: '#000D1A',
  };

  /** The rally shell entry: Live from a chat / challenge, else the badminton home. */
  function openRallySport(spec) {
    const o = spec || {};
    const chat = resolveChat(o.chat || o);
    const ctx = window.__dangalLaunchCtx || {};
    const src = String(o.source || (chat && chat.dangalSource) || ctx.source || '');
    const mid = o.matchId || (chat && chat.dangalMatchId) || '';
    const opp = o.opponentUid || (chat && (chat.opponentUid || chat.uid || chat.peerUid)) || '';
    if ((o.mode === 'watch' || o.spectate) && mid) return startLive({ matchId: mid, spectate: true });
    if (chatLiveOn(chat)) {
      const roles = DangalLive.roles(chat, o);
      return startLive({ matchId: cleanId(matchIdFor(chat, GAME)), opponentUid: roles.opp, host: !!roles.host, stake: Number(chat.stake || ctx.stake) || 0, chat, source: src || 'chat_live' });
    }
    if (mid && persistable(opp) && (o.mode === 'live' || /^challenge|matchmaking/.test(src))) {
      return startLive({ matchId: cleanId(mid), opponentUid: opp, host: src === 'challenge_host', stake: Number(o.stake != null ? o.stake : ctx.stake) || 0, chat, source: src });
    }
    if (o.practiceKind === 'vsBot' || o.practiceKind === 'vsAi') return startLocal({});
    return openHome();
  }

  const lazy = (fn) =>
    function () {
      const K = Kit();
      const args = arguments;
      if (K && typeof K.withGameData === 'function') return K.withGameData(GAME, fn).apply(this, args);
      return fn.apply(this, args);
    };
  const openGame = lazy(openRallySport);

  if (typeof registerGame === 'function') {
    registerGame({
      id: 'badminton',
      name: RALLY.name,
      desc: 'Best of 3 games to 21 · singles + doubles · Live',
      icon: RALLY.icon,
      ratingKey: RALLY.id,
      gameType: 'dual',
      liveDuel: true,
      genre: 'rw_sports',
      selfChat: true,
      dangal: true,
      chat1v1: true,
      ownHome: true,
      order: 20,
      meta: {
        core: 'badminton-engine.js (laws, scoring, service courts, stats) + badminton-match.js (match flow) — shared with the server',
        live: 'badminton_match → server-lib/badminton-engine.js; the server resolves every contact',
        complete: true,
      },
      launch(ctx) {
        return openGame(Object.assign({}, ctx && typeof ctx === 'object' ? ctx : {}, { chat: ctx }));
      },
    });
  }

  window.openBadminton = (ctx) => openGame(Object.assign({}, ctx && typeof ctx === 'object' ? ctx : {}, { chat: ctx }));
  window.BadmintonGame = {
    launch: openGame,
    startLocal: lazy(startLocal),
    startLive: lazy(startLive),
    watch: lazy((matchId) => startLive({ matchId, spectate: true })),
    openHome: lazy(openHome),
  };
})();
