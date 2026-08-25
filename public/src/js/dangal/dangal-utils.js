/**
 * Dangal shared utilities (IIFE). Canonical game ids stay snakes / ttt / uno / quiz / fiveinrow.
 */
(function () {
  'use strict';

  const GAME_ID_ALIASES = {
    snakesladders: 'snakes',
    tictactoe: 'ttt',
    ohnocards: 'uno',
    'ohno-cards': 'uno',
    muqabala: 'quiz',
    fiveinarow: 'fiveinrow',
    shabdfive: 'wordguess',
    kakuro: 'ankjod',
    cricket: 'streetcricket',
    football: 'gullykick',
    snooker: 'pool',
    billiards: 'pool',
    andarbahar: 'andarbaahar',
    sattepesatta: 'sattepe',
    kite: 'patangbaazi',
    fischerrandom: 'chess',
    chess960: 'chess',
  };

  function canonicalGameId(id) {
    const raw = String(id || '')
      .trim()
      .toLowerCase()
      .replace(/[\s-]+/g, '');
    if (!raw) return '';
    return GAME_ID_ALIASES[raw] || raw;
  }

  function seededRng(seed) {
    let s = seed >>> 0;
    return function rng() {
      s = (Math.imul(1664525, s) + 1013904223) >>> 0;
      return s / 4294967296;
    };
  }

  function shuffleArray(arr, rng) {
    const a = [...(arr || [])];
    const fn = rng || Math.random;
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(fn() * (i + 1));
      const t = a[i];
      a[i] = a[j];
      a[j] = t;
    }
    return a;
  }

  function pickRandom(arr, rng) {
    if (!arr || !arr.length) return undefined;
    const fn = rng || Math.random;
    return arr[Math.floor(fn() * arr.length)];
  }

  function chunkArray(arr, size) {
    const n = Math.max(1, Number(size) || 1);
    const chunks = [];
    const a = arr || [];
    for (let i = 0; i < a.length; i += n) chunks.push(a.slice(i, i + n));
    return chunks;
  }

  function getTodayDateString() {
    const d = new Date();
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return y + '-' + m + '-' + day;
  }

  function getPreviousDateString(daysBack) {
    const d = new Date();
    d.setDate(d.getDate() - (Number(daysBack) || 1));
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return y + '-' + m + '-' + day;
  }

  function formatMs(ms) {
    const s = Math.floor(Math.max(0, Number(ms) || 0) / 1000);
    const m = Math.floor(s / 60);
    return m + ':' + String(s % 60).padStart(2, '0');
  }

  function formatMsShort(ms) {
    const n = Math.max(0, Number(ms) || 0);
    const s = Math.floor(n / 1000);
    if (s < 60) return (n / 1000).toFixed(1) + 's';
    return formatMs(n);
  }

  function getCurrentUid() {
    if (typeof currentUser !== 'undefined' && currentUser?.uid) return currentUser.uid;
    try {
      return firebase.auth().currentUser?.uid || null;
    } catch (e) {
      return null;
    }
  }

  function getDisplayName() {
    if (typeof currentUser !== 'undefined' && currentUser?.name) return currentUser.name;
    try {
      return firebase.auth().currentUser?.displayName || 'Player';
    } catch (e) {
      return 'Player';
    }
  }

  function getPhotoURL() {
    if (typeof currentUser !== 'undefined' && currentUser?.photoURL) return currentUser.photoURL;
    try {
      return firebase.auth().currentUser?.photoURL || null;
    } catch (e) {
      return null;
    }
  }

  function otherSide(side) {
    return side === 'A' ? 'B' : 'A';
  }

  function average(arr) {
    const a = arr || [];
    if (!a.length) return 0;
    return a.reduce((x, y) => x + Number(y || 0), 0) / a.length;
  }

  function clamp(val, min, max) {
    return Math.max(min, Math.min(max, val));
  }

  function delay(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  function hexToRgba(hex) {
    const h = String(hex || '').replace('#', '');
    if (h.length < 6) return [0, 0, 0, 255];
    return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16), 255];
  }

  function colorsMatch(a, b, tolerance) {
    const t = tolerance == null ? 15 : tolerance;
    return Math.abs(a[0] - b[0]) <= t && Math.abs(a[1] - b[1]) <= t && Math.abs(a[2] - b[2]) <= t;
  }

  function normalisePoint(x, y, el) {
    const w = el?.width || el?.clientWidth || 1;
    const h = el?.height || el?.clientHeight || 1;
    return [parseFloat((x / w).toFixed(4)), parseFloat((y / h).toFixed(4))];
  }

  function denormalisePoint(nx, ny, el) {
    const w = el?.width || el?.clientWidth || 1;
    const h = el?.height || el?.clientHeight || 1;
    return [nx * w, ny * h];
  }

  function isPersistableUid(uid) {
    const s = String(uid || '');
    if (s.length < 20 || s.length > 128) return false;
    if (/^(ai|random)$/i.test(s)) return false;
    if (/^(chat_|grp_|dm_|friend_)/.test(s)) return false;
    return true;
  }

  function opponentUidFromChat(chat) {
    if (!chat) return '';
    const me = getCurrentUid();
    const raw = [
      chat.uid,
      chat.peerUid,
      chat.otherUid,
      chat.opponentUid,
      Array.isArray(chat.participants)
        ? chat.participants.find((p) => p && p !== me)
        : null,
    ];
    for (let i = 0; i < raw.length; i++) {
      const id = raw[i] ? String(raw[i]) : '';
      if (id && id !== me && isPersistableUid(id)) return id.slice(0, 128);
    }
    return '';
  }

  function chatFromLaunch(ctx) {
    const c = Object.assign({}, (ctx && ctx.chat) || {});
    if (ctx && ctx.matchId) c.dangalMatchId = ctx.matchId;
    if (ctx && ctx.opponentUid) {
      c.uid = ctx.opponentUid;
      c.peerUid = ctx.opponentUid;
      c.opponentUid = ctx.opponentUid;
    }
    if (ctx && ctx.source) c.dangalSource = ctx.source;
    return c;
  }

  function dangalMatchId(gameType, chat, nonce) {
    const g = canonicalGameId(gameType) || 'game';
    const me = getCurrentUid() || 'me';
    const other = opponentUidFromChat(chat) || 'solo';
    const pair = [me, other].sort().join('_');
    const n = nonce != null ? String(nonce) : String(Date.now());
    return (g + '_' + pair + '_' + n).replace(/[^\w.-]/g, '').slice(0, 120);
  }

  function normalizeDangalResult(result) {
    const s = String(result == null ? '' : result).toLowerCase();
    if (!s || ['dismissed', 'aborted', 'error', 'quit', 'restart'].indexOf(s) !== -1) {
      return null;
    }
    if (s === 'win' || s === 'won') return 'win';
    if (s === 'loss' || s === 'lost' || s === 'lose') return 'loss';
    if (s === 'draw' || s === 'tie' || s === 'stalemate') return 'draw';
    // Solo score runs — treat finished run as loss for economy unless explicitly won
    if (s === 'complete' || s === 'finished') return 'loss';
    return null;
  }

  window.GAME_ID_ALIASES = GAME_ID_ALIASES;
  window.canonicalGameId = canonicalGameId;
  window.seededRng = seededRng;
  window.shuffleArray = shuffleArray;
  window.pickRandom = pickRandom;
  window.chunkArray = chunkArray;
  window.getTodayDateString = getTodayDateString;
  window.getPreviousDateString = getPreviousDateString;
  window.formatMs = formatMs;
  window.formatMsShort = formatMsShort;
  window.getCurrentUid = getCurrentUid;
  window.getDisplayName = getDisplayName;
  window.getPhotoURL = getPhotoURL;
  window.otherSide = otherSide;
  window.average = average;
  window.clamp = clamp;
  window.delay = delay;
  window.hexToRgba = hexToRgba;
  window.colorsMatch = colorsMatch;
  window.normalisePoint = normalisePoint;
  window.denormalisePoint = denormalisePoint;
  window.isPersistableUid = isPersistableUid;
  window.opponentUidFromChat = opponentUidFromChat;
  window.chatFromLaunch = chatFromLaunch;
  window.dangalMatchId = dangalMatchId;
  window.normalizeDangalResult = normalizeDangalResult;
})();
