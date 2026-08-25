/**
 * Khel daily challenges — rebuilt each IST day from the games this profile plays most,
 * plus one discovery pick. Not a static list.
 */
(function () {
  'use strict';

  function esc(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');
  }

  function hashSeed(str) {
    let h = 2166136261;
    const s = String(str || '');
    for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
    return h >>> 0;
  }

  function gameMeta(id) {
    const g = typeof getGame === 'function' ? getGame(id) : null;
    return {
      id,
      name: g?.name || (typeof GAME_LABELS !== 'undefined' && GAME_LABELS[id]) || id,
      icon: g?.icon || '🎮',
    };
  }

  function catalogIds() {
    try {
      const all = (typeof getGames === 'function' ? getGames({ dangal: true }) : []).map((g) => g.id).filter(Boolean);
      // Prefer graduated / live titles for Khel missions (Phase 8 hub truth)
      const preferred = all.filter((id) => {
        if (typeof dangalManchVisibility === 'function' && dangalManchVisibility(id) === 'hidden') {
          return false;
        }
        if (typeof getGameGraduation !== 'function') return true;
        const info = getGameGraduation(id);
        return info.grade === 'graduated' || info.grade === 'live';
      });
      return preferred.length ? preferred : all;
    } catch (e) {
      return ['chess', 'quiz', 'wordguess', 'streetcricket'];
    }
  }

  function topPlayed(progress) {
    const games = (progress && progress.games) || {};
    return Object.keys(games)
      .map((id) => ({ id, played: games[id].played || 0, lastAt: games[id].lastAt || 0 }))
      .filter((r) => r.played > 0)
      .sort((a, b) => b.played - a.played || b.lastAt - a.lastAt);
  }

  function ensureKhelDailies() {
    if (typeof getDangalProgress !== 'function' || typeof saveDangalProgress !== 'function') return [];
    const day = typeof dangalCalendarDay === 'function' ? dangalCalendarDay() : new Date().toISOString().slice(0, 10);
    const data = getDangalProgress();
    if (data.khelDay === day && Array.isArray(data.khelDailies) && data.khelDailies.length) {
      return data.khelDailies;
    }
      const rng = typeof seededRng === 'function' ? seededRng(hashSeed(day)) : Math.random;
    const pool = catalogIds();
    const ranked = topPlayed(data);
    const fav = ranked.map((r) => r.id).filter((id) => pool.indexOf(id) >= 0);
    const used = {};
    const picks = [];

    function take(id) {
      if (!id || used[id] || pool.indexOf(id) < 0) return null;
      used[id] = true;
      return id;
    }

    const favPlay = take(fav[0]) || take(pool[Math.floor(rng() * pool.length)]);
    if (favPlay) {
      const m = gameMeta(favPlay);
      picks.push({
        key: 'fav_play',
        gameId: favPlay,
        kind: 'play',
        label: ranked[0] && ranked[0].id === favPlay ? 'Your usual · play ' + m.name : 'Play ' + m.name,
        icon: m.icon,
        done: false,
      });
    }
    const favWin = take(fav[1]) || take(fav[0]) || take(pool[Math.floor(rng() * pool.length)]);
    if (favWin) {
      const m = gameMeta(favWin);
      picks.push({
        key: 'fav_win',
        gameId: favWin,
        kind: 'win',
        label: 'Win a round of ' + m.name,
        icon: m.icon,
        done: false,
      });
    }
    const rest = pool.filter((id) => !used[id]);
    const discover = rest.length ? rest[Math.floor(rng() * rest.length)] : take(pool[0]);
    if (discover) {
      const m = gameMeta(discover);
      picks.push({
        key: 'discover',
        gameId: discover,
        kind: 'play',
        label: 'Try something else · ' + m.name,
        icon: m.icon,
        done: false,
      });
    }
    const gotd = typeof window !== 'undefined' && window.__dangalGotdId;
    if (gotd && !used[gotd] && pool.indexOf(gotd) >= 0) {
      const m = gameMeta(gotd);
      picks.push({
        key: 'gotd',
        gameId: gotd,
        kind: 'play',
        label: 'Featured today · ' + m.name,
        icon: m.icon,
        done: false,
      });
    }

    data.khelDay = day;
    data.khelDailies = picks.slice(0, 4);
    saveDangalProgress(data);
    return data.khelDailies;
  }

  function tickKhelDailies(gameId, opts) {
    const o = opts || {};
    const id = typeof canonicalGameId === 'function' ? canonicalGameId(gameId) : gameId;
    if (!id || typeof getDangalProgress !== 'function') return;
    const list = ensureKhelDailies();
    let changed = false;
    list.forEach((ch) => {
      if (ch.done) return;
      if (ch.gameId !== id) return;
      if (ch.kind === 'play') {
        ch.done = true;
        changed = true;
      } else if (ch.kind === 'win' && o.won === true) {
        ch.done = true;
        changed = true;
      }
    });
    if (!changed) return;
    const data = getDangalProgress();
    data.khelDailies = list;
    saveDangalProgress(data);
    const just = list.filter((c) => c.done);
    if (just.length && typeof showToast === 'function') {
      const n = just.length;
      const all = list.every((c) => c.done);
      showToast(all ? 'Khel dailies complete' : 'Daily challenge done');
    }
    if (typeof haptic === 'function') haptic('success');
  }

  function khelDailiesHtml() {
    const list = ensureKhelDailies();
    if (!list.length) return '';
    const done = list.filter((c) => c.done).length;
    return `<div class="khel-dailies" data-khel-dailies>
      <div class="khel-dailies-head">
        <span>Today on Khel</span>
        <strong>${done}/${list.length}</strong>
      </div>
      <div class="khel-dailies-list">
        ${list
          .map(
            (c) => `<button type="button" class="khel-daily${c.done ? ' is-done' : ''}" data-khel-game="${esc(c.gameId)}">
            <span class="khel-daily-ico">${esc(c.icon || '🎮')}</span>
            <span class="khel-daily-label">${esc(c.label)}</span>
            <span class="khel-daily-mark">${c.done ? '✓' : '→'}</span>
          </button>`
          )
          .join('')}
      </div>
    </div>`;
  }

  function mountKhelDailies(host) {
    if (!host) return;
    const wrap = document.createElement('div');
    wrap.innerHTML = khelDailiesHtml();
    const el = wrap.firstElementChild;
    if (!el) return;
    host.appendChild(el);
    el.querySelectorAll('[data-khel-game]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const id = btn.dataset.khelGame;
        if (typeof markGamePlayed === 'function') markGamePlayed(id);
        if (typeof handleDangalGameTap === 'function') handleDangalGameTap(id);
      });
    });
  }

  window.ensureKhelDailies = ensureKhelDailies;
  window.tickKhelDailies = tickKhelDailies;
  window.khelDailiesHtml = khelDailiesHtml;
  window.mountKhelDailies = mountKhelDailies;
})();
