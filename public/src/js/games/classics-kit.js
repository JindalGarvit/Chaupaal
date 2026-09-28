/**
 * Classics kit — shared client pieces for Ludo, Snakes & Ladders and Tic-Tac-Toe:
 * seeded practice dice, dice widget + roll animation, colour-blind-safe shape markers,
 * sounds / haptics / auto-move / speed preferences, the Dice history + fairness sheet,
 * and small lobby helpers. Live dice never come from here — the server rolls them.
 */
(function () {
  'use strict';

  const PREFS_KEY = 'chaupaal_classics_prefs';
  const PRACTICE_DICE_KEY = 'chaupaal_practice_dice';
  const DEFAULT_PREFS = { sound: true, haptics: true, autoMove: true, speed: false };

  const esc = (s) =>
    String(s == null ? '' : s).replace(/[&<>"']/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[ch]);
  const Kit = () => window.PartyKit;

  function tr(key, fallback) {
    return typeof t === 'function' ? t('classics.' + key, fallback) : fallback;
  }
  function toast(msg) {
    if (typeof showToast === 'function') showToast(msg);
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

  // ---------------- preferences ----------------

  function prefs() {
    return Object.assign({}, DEFAULT_PREFS, readJson(PREFS_KEY, {}));
  }
  function setPref(key, value) {
    const p = prefs();
    p[key] = value;
    writeJson(PREFS_KEY, p);
    return p;
  }
  /** Animation duration scaled by the Speed preference (and reduced motion). */
  function ms(base) {
    const reduce = typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (reduce) return Math.round(base * 0.25);
    return prefs().speed ? Math.round(base * 0.45) : base;
  }
  const sleep = (n) => new Promise((r) => setTimeout(r, n));

  // ---------------- seeded practice RNG (mulberry32) ----------------

  function newSeed() {
    try {
      const a = new Uint32Array(1);
      crypto.getRandomValues(a);
      return a[0] >>> 0;
    } catch (e) {
      return (Date.now() ^ Math.floor(Math.random() * 0xffffffff)) >>> 0;
    }
  }
  function seededRng(seed) {
    let s = seed >>> 0;
    const next = function () {
      s = (s + 0x6d2b79f5) >>> 0;
      let x = s;
      x = Math.imul(x ^ (x >>> 15), x | 1);
      x ^= x + Math.imul(x ^ (x >>> 7), x | 61);
      return ((x ^ (x >>> 14)) >>> 0) / 4294967296;
    };
    next.seed = seed >>> 0;
    next.die = () => 1 + Math.floor(next() * 6);
    return next;
  }

  // ---------------- sound + haptics ----------------

  let audio = null;
  function tone(freq, dur, type, gain, when) {
    try {
      audio = audio || new (window.AudioContext || window.webkitAudioContext)();
      const t0 = audio.currentTime + (when || 0);
      const o = audio.createOscillator();
      const g = audio.createGain();
      o.type = type || 'sine';
      o.frequency.setValueAtTime(freq, t0);
      g.gain.setValueAtTime(gain || 0.06, t0);
      g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
      o.connect(g);
      g.connect(audio.destination);
      o.start(t0);
      o.stop(t0 + dur + 0.02);
    } catch (e) {}
  }
  const SOUNDS = {
    roll: () => [0, 0.05, 0.1, 0.15].forEach((w, i) => tone(180 + i * 40, 0.05, 'square', 0.03, w)),
    hop: () => tone(520, 0.05, 'triangle', 0.035),
    capture: () => (tone(300, 0.12, 'sawtooth', 0.05), tone(160, 0.2, 'sawtooth', 0.05, 0.1)),
    climb: () => [0, 0.07, 0.14, 0.21].forEach((w, i) => tone(400 + i * 120, 0.08, 'triangle', 0.04, w)),
    slide: () => [0, 0.07, 0.14, 0.21].forEach((w, i) => tone(700 - i * 120, 0.09, 'sine', 0.04, w)),
    home: () => (tone(660, 0.1, 'triangle', 0.05), tone(880, 0.16, 'triangle', 0.05, 0.1)),
    place: () => tone(440, 0.06, 'triangle', 0.04),
    turn: () => tone(740, 0.08, 'sine', 0.04),
    win: () => [523, 659, 784, 1046].forEach((f, i) => tone(f, 0.16, 'triangle', 0.05, i * 0.11)),
    lose: () => [392, 330, 262].forEach((f, i) => tone(f, 0.2, 'sine', 0.045, i * 0.14)),
    invalid: () => tone(140, 0.12, 'square', 0.03),
  };
  const HAPTICS = { roll: [12], capture: [30, 40, 30], climb: [15], slide: [40], home: [20, 30, 20], win: [30, 50, 60], invalid: [60], turn: [10], place: [8] };

  function fx(kind) {
    const p = prefs();
    if (p.sound && SOUNDS[kind]) SOUNDS[kind]();
    if (p.haptics && HAPTICS[kind] && navigator.vibrate) {
      try {
        navigator.vibrate(HAPTICS[kind]);
      } catch (e) {}
    }
  }

  // ---------------- shapes + dice ----------------

  /** Shape marker so colour is never the only cue (colour-blind safe). */
  function shapePath(shape, cx, cy, r) {
    const pts = (n, rot) =>
      Array.from({ length: n }, (_, i) => {
        const a = rot + (i * 2 * Math.PI) / n;
        return (cx + r * Math.cos(a)).toFixed(3) + ',' + (cy + r * Math.sin(a)).toFixed(3);
      }).join(' ');
    if (shape === 'triangle') return `<polygon points="${pts(3, -Math.PI / 2)}"/>`;
    if (shape === 'square') return `<rect x="${cx - r * 0.78}" y="${cy - r * 0.78}" width="${r * 1.56}" height="${r * 1.56}" rx="${r * 0.12}"/>`;
    if (shape === 'diamond') return `<polygon points="${pts(4, -Math.PI / 2)}"/>`;
    if (shape === 'hexagon') return `<polygon points="${pts(6, 0)}"/>`;
    if (shape === 'star') {
      const p = [];
      for (let i = 0; i < 10; i++) {
        const a = -Math.PI / 2 + (i * Math.PI) / 5;
        const rr = i % 2 ? r * 0.45 : r;
        p.push((cx + rr * Math.cos(a)).toFixed(3) + ',' + (cy + rr * Math.sin(a)).toFixed(3));
      }
      return `<polygon points="${p.join(' ')}"/>`;
    }
    return `<circle cx="${cx}" cy="${cy}" r="${r * 0.8}"/>`;
  }
  function shapeSvg(shape, color, size) {
    const s = size || 18;
    return `<svg class="cl-shape" width="${s}" height="${s}" viewBox="0 0 20 20" aria-hidden="true"><g fill="${esc(color)}" stroke="#1b1b1b" stroke-width="1.4">${shapePath(shape, 10, 10, 8)}</g></svg>`;
  }

  const PIPS = { 1: [[50, 50]], 2: [[28, 28], [72, 72]], 3: [[28, 28], [50, 50], [72, 72]], 4: [[28, 28], [72, 28], [28, 72], [72, 72]], 5: [[28, 28], [72, 28], [50, 50], [28, 72], [72, 72]], 6: [[28, 25], [72, 25], [28, 50], [72, 50], [28, 75], [72, 75]] };
  function dieFaceSvg(v) {
    const pips = (PIPS[v] || [])
      .map(([x, y]) => `<circle cx="${x}" cy="${y}" r="9"/>`)
      .join('');
    return `<svg viewBox="0 0 100 100" aria-hidden="true"><rect x="4" y="4" width="92" height="92" rx="20" class="cl-die-face"/><g class="cl-die-pips">${pips}</g></svg>`;
  }
  /** Dice button: tap to roll when it's your turn. */
  function diceHtml(o) {
    const v = o.value || 0;
    const label = o.canRoll ? tr('roll', 'Roll') : v ? tr('rolled', 'Rolled') + ' ' + v : o.waitLabel || '';
    return `<button type="button" class="cl-die${o.canRoll ? ' is-ready' : ''}" data-roll ${o.canRoll ? '' : 'disabled'} aria-label="${esc(o.canRoll ? tr('rollDie', 'Roll the die') : v ? tr('rolled', 'Rolled') + ' ' + v : tr('die', 'Die'))}">
      <span class="cl-die-art" data-die-art>${v ? dieFaceSvg(v) : dieFaceSvg(o.idle || 6)}</span>
      <span class="cl-die-label">${esc(label)}</span>
    </button>`;
  }
  /** Tumble through faces, land on `value`. */
  async function animateDie(root, value) {
    const art = root && root.querySelector('[data-die-art]');
    fx('roll');
    if (!art) return;
    art.classList.add('is-rolling');
    const steps = Math.max(2, Math.round(ms(480) / 60));
    for (let i = 0; i < steps; i++) {
      art.innerHTML = dieFaceSvg(1 + Math.floor(Math.random() * 6));
      await sleep(60);
    }
    art.innerHTML = dieFaceSvg(value);
    art.classList.remove('is-rolling');
  }

  // ---------------- dice history + fairness ----------------

  function counts(rolls) {
    const c = [0, 0, 0, 0, 0, 0];
    (rolls || []).forEach((v) => {
      if (v >= 1 && v <= 6) c[v - 1] += 1;
    });
    return c;
  }
  function recordPracticeRolls(rolls) {
    const cur = readJson(PRACTICE_DICE_KEY, [0, 0, 0, 0, 0, 0]);
    const add = counts(rolls);
    writeJson(PRACTICE_DICE_KEY, cur.map((v, i) => (Number(v) || 0) + add[i]));
  }
  function chiSquare(c) {
    const n = c.reduce((a, b) => a + b, 0);
    if (!n) return 0;
    const e = n / 6;
    return c.reduce((s, x) => s + ((x - e) * (x - e)) / e, 0);
  }
  function barsHtml(c) {
    const n = c.reduce((a, b) => a + b, 0);
    const max = Math.max(1, ...c);
    return `<div class="cl-bars" role="img" aria-label="${esc(c.map((x, i) => i + 1 + ': ' + x).join(', '))}">${c
      .map(
        (x, i) => `<div class="cl-bar"><div class="cl-bar-fill" style="height:${Math.round((x / max) * 100)}%"></div><span class="cl-bar-n">${x}</span><span class="cl-bar-face">${i + 1}</span></div>`
      )
      .join('')}</div><div class="cl-bars-meta">${n} ${esc(tr('rolls', 'rolls'))}${n ? ' · ' + esc(tr('expected', 'expected')) + ' ≈ ' + (n / 6).toFixed(1) + ' ' + esc(tr('each', 'each')) : ''}</div>`;
  }
  function fairnessLine(c) {
    const n = c.reduce((a, b) => a + b, 0);
    if (n < 60) return tr('fair.few', 'Too few rolls to judge yet — dice even out over hundreds of rolls.');
    return chiSquare(c) < 15.1
      ? tr('fair.ok', 'Within the normal range for a fair die.')
      : tr('fair.odd', 'Unusual spread — it happens by chance about once in a hundred players.');
  }

  /**
   * Dice history (per player, this game) + lifetime fairness (your Live rolls from the server,
   * your practice rolls on this phone).
   * @param {{ seats: {name:string,color:string,shape:string,rolls:number[]}[], live?: boolean, game: string }} o
   */
  function openDiceSheet(o) {
    const K = Kit();
    if (!K) return;
    const rows = (o.seats || [])
      .map(
        (s) => `<details class="cl-dice-row"><summary>${shapeSvg(s.shape, s.color, 16)} <b>${esc(s.name)}</b> <span>${(s.rolls || []).length} ${esc(tr('rolls', 'rolls'))} · ${
          counts(s.rolls)[5]
        }× 6</span></summary>${barsHtml(counts(s.rolls))}<div class="cl-dice-seq">${(s.rolls || []).slice(-30).join(' ')}</div></details>`
      )
      .join('');
    const practice = readJson(PRACTICE_DICE_KEY, [0, 0, 0, 0, 0, 0]);
    K.openSheet({
      title: tr('dice.title', 'Dice history'),
      bodyHtml: `<div class="cl-dice">
        <p class="cl-note">${esc(
          o.live
            ? tr('dice.live', 'Live dice are rolled on our server with a secure random generator. No weighting, no pity rolls — ever.')
            : tr('dice.practice', 'Practice dice use a seeded random generator on this phone. Same rules: no weighting, no pity rolls.')
        )}</p>
        <div class="cl-section">${esc(tr('dice.thisGame', 'This game'))}</div>
        ${rows || `<p class="cl-note">${esc(tr('dice.none', 'No rolls yet'))}</p>`}
        <div class="cl-section">${esc(tr('dice.lifetime', 'Your lifetime rolls'))}</div>
        <div data-live-dice><p class="cl-note">${esc(K.isSignedIn() ? tr('loading', 'Loading…') : tr('dice.signIn', 'Sign in to see your Live dice.'))}</p></div>
        <div class="cl-sub">${esc(tr('dice.practiceLife', 'Practice on this phone'))}</div>
        ${barsHtml(practice)}
        <p class="cl-note">${esc(fairnessLine(practice))}</p>
      </div>`,
      onMount(el) {
        if (!K.isSignedIn()) return;
        K.roomCall(o.game || 'ludo', 'dice_stats', {})
          .then((r) => {
            const host = el.querySelector('[data-live-dice]');
            if (!host) return;
            const c = (r && r.counts) || [0, 0, 0, 0, 0, 0];
            host.innerHTML = `<div class="cl-sub">${esc(tr('dice.liveLife', 'Live games (server dice)'))}</div>${barsHtml(c)}<p class="cl-note">${esc(fairnessLine(c))}</p>`;
          })
          .catch(() => {
            const host = el.querySelector('[data-live-dice]');
            if (host) host.innerHTML = `<p class="cl-note">${esc(tr('dice.offline', 'Couldn’t load your Live dice right now.'))}</p>`;
          });
      },
    });
  }

  // ---------------- settings sheet ----------------

  function openPrefsSheet(keys, onChange) {
    const K = Kit();
    if (!K) return;
    const labels = {
      sound: tr('pref.sound', 'Sounds'),
      haptics: tr('pref.haptics', 'Vibration'),
      autoMove: tr('pref.autoMove', 'Auto-move when only one move is possible'),
      speed: tr('pref.speed', 'Fast animations'),
    };
    const p = prefs();
    K.openSheet({
      title: tr('pref.title', 'Settings'),
      bodyHtml: `<div class="cl-prefs">${(keys || Object.keys(DEFAULT_PREFS))
        .map(
          (k) => `<label class="cl-pref"><span>${esc(labels[k] || k)}</span><input type="checkbox" data-pref="${esc(k)}" ${p[k] ? 'checked' : ''}></label>`
        )
        .join('')}</div>`,
      onMount(el) {
        el.querySelectorAll('[data-pref]').forEach((box) =>
          box.addEventListener('change', () => {
            setPref(box.dataset.pref, box.checked);
            if (onChange) onChange(prefs());
          })
        );
      },
    });
  }

  // ---------------- misc ----------------

  const STAKES = [0, 10, 25, 50, 100];
  function stakeLabel(n) {
    return n ? '⚡' + n + ' ' + tr('chips', 'virtual chips') : tr('friendly', 'Friendly (no chips)');
  }
  function levelLabel(level) {
    return { easy: tr('lvl.easy', 'Easy'), normal: tr('lvl.normal', 'Normal'), smart: tr('lvl.smart', 'Smart'), medium: tr('lvl.medium', 'Medium'), hard: tr('lvl.hard', 'Hard'), unbeatable: tr('lvl.unbeatable', 'Unbeatable') }[level] || level;
  }
  function placeLabel(n) {
    return n === 1 ? tr('place.1', '1st') : n === 2 ? tr('place.2', '2nd') : n === 3 ? tr('place.3', '3rd') : n + tr('place.th', 'th');
  }
  function shareWin(game, label, line) {
    const K = Kit();
    if (K && K.shareLine) K.shareLine(game, label, line);
  }
  /** Seat list editor for local games: each seat is You / Friend (pass & play) / Bot. */
  function seatPickerHtml(seats, opts) {
    const o = opts || {};
    return `<div class="cl-seats">${seats
      .map(
        (s, i) => `<div class="cl-seat">${shapeSvg(s.shape, s.color, 20)}
          <input class="pk-input cl-seat-name" data-seat-name="${i}" value="${esc(s.name)}" maxlength="16" ${s.kind === 'bot' ? 'disabled' : ''} aria-label="${esc(tr('seatName', 'Seat name'))}">
          <select class="cl-seat-kind" data-seat-kind="${i}" aria-label="${esc(tr('seatKind', 'Who plays'))}" ${i === 0 && o.lockFirst ? 'disabled' : ''}>
            <option value="human" ${s.kind === 'human' ? 'selected' : ''}>${esc(tr('seat.human', 'Person'))}</option>
            <option value="bot" ${s.kind === 'bot' ? 'selected' : ''}>${esc(tr('seat.bot', 'Bot'))}</option>
          </select></div>`
      )
      .join('')}</div>`;
  }

  window.ClassicsKit = {
    esc,
    tr,
    toast,
    readJson,
    writeJson,
    prefs,
    setPref,
    ms,
    sleep,
    newSeed,
    seededRng,
    fx,
    shapeSvg,
    shapePath,
    dieFaceSvg,
    diceHtml,
    animateDie,
    counts,
    chiSquare,
    recordPracticeRolls,
    openDiceSheet,
    openPrefsSheet,
    STAKES,
    stakeLabel,
    levelLabel,
    placeLabel,
    shareWin,
    seatPickerHtml,
  };
})();
