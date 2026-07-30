/**
 * Pure Dangal progress · soft streaks · weekly missions.
 * UMD: browser script tag + Node require for regression tests.
 * Storage / profile wiring stays in game-ui.js.
 */
(function (root, factory) {
  var api = factory();
  if (typeof module === 'object' && module.exports) {
    module.exports = api;
  }
  if (root) {
    root.ChaupaalDangalProgress = api;
  }
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  var SCORE_FOCUS_GAMES = { rushrunner: true, tiptap: true, ankjod: true, wordguess: true };
  var LOWER_BETTER_SCORE = { wordguess: true, ankjod: true };

  function normalizeDangalGameId(gameId) {
    var id = String(gameId || '').toLowerCase();
    if (id === 'muqabala' || id === 'quiz') return 'quiz';
    if (id === 'kakuro') return 'ankjod';
    if (id === 'tictactoe') return 'ttt';
    return id;
  }

  function dangalCalendarDay(nowMs) {
    var d = nowMs != null ? new Date(nowMs) : new Date();
    try {
      return new Intl.DateTimeFormat('en-CA', {
        timeZone: 'Asia/Kolkata',
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
      }).format(d);
    } catch (e) {
      return d.toISOString().slice(0, 10);
    }
  }

  function dangalWeekKey(dayStr) {
    var d = new Date((dayStr || dangalCalendarDay()) + 'T12:00:00');
    var day = (d.getDay() + 6) % 7; // Mon=0
    d.setDate(d.getDate() - day);
    return d.toISOString().slice(0, 10);
  }

  function emptyDangalGameStats() {
    return {
      played: 0,
      wins: 0,
      losses: 0,
      draws: 0,
      streak: 0,
      bestStreak: 0,
      bestScore: null,
      lastAt: 0,
    };
  }

  function emptyDangalWeek(weekKey) {
    return {
      key: weekKey || dangalWeekKey(),
      plays: 0,
      unique: [],
      wins: 0,
      gotd: false,
      shabd: false,
      celebrated: {},
    };
  }

  function emptyDangalProgress(weekKey) {
    return {
      v: 1,
      games: {},
      softDayStreak: 0,
      lastPlayDay: '',
      week: emptyDangalWeek(weekKey),
      panelCollapsed: false,
      hideMissionsUntil: '',
    };
  }

  /** Ensure week rolls over and games map exists (pure). */
  function coerceDangalProgress(raw, today) {
    var day = today || dangalCalendarDay();
    var data = Object.assign(emptyDangalProgress(dangalWeekKey(day)), raw && typeof raw === 'object' ? raw : {});
    var weekKey = dangalWeekKey(day);
    if (!data.week || data.week.key !== weekKey) {
      data.week = emptyDangalWeek(weekKey);
    }
    if (!data.games || typeof data.games !== 'object') data.games = {};
    return data;
  }

  function isScoreBetter(gameId, next, prev) {
    if (prev == null) return true;
    var id = normalizeDangalGameId(gameId);
    if (LOWER_BETTER_SCORE[id]) return next < prev;
    return next > prev;
  }

  /**
   * Apply one finished session onto a progress snapshot (pure; no I/O).
   * @param {object} progress
   * @param {string} gameId
   * @param {{ won?: boolean, drew?: boolean, score?: number, scoreOnly?: boolean, gotd?: boolean }} [opts]
   * @param {{ today?: string, nowMs?: number }} [clock]
   */
  function applyDangalSession(progress, gameId, opts, clock) {
    var today = (clock && clock.today) || dangalCalendarDay(clock && clock.nowMs);
    var nowMs = (clock && clock.nowMs) || Date.now();
    var data = coerceDangalProgress(progress, today);
    var id = normalizeDangalGameId(gameId);
    if (!id) return data;

    var o = opts || {};
    var g = Object.assign(emptyDangalGameStats(), data.games[id] || {});
    g.played += 1;
    g.lastAt = nowMs;

    var scoreOnly =
      o.scoreOnly === true || (SCORE_FOCUS_GAMES[id] && o.won == null && o.drew == null && o.score != null);
    if (scoreOnly) {
      if (o.won === true) {
        g.wins += 1;
        g.streak += 1;
        g.bestStreak = Math.max(g.bestStreak, g.streak);
      }
    } else if (o.drew) {
      g.draws += 1;
    } else if (o.won === true) {
      g.wins += 1;
      g.streak += 1;
      g.bestStreak = Math.max(g.bestStreak, g.streak);
    } else if (o.won === false) {
      g.losses += 1;
      g.streak = 0;
    }

    if (o.score != null && Number.isFinite(Number(o.score))) {
      var next = Number(o.score);
      if (isScoreBetter(id, next, g.bestScore)) g.bestScore = next;
    }
    data.games[id] = g;

    if (data.lastPlayDay !== today) {
      var y = new Date(today + 'T12:00:00');
      y.setDate(y.getDate() - 1);
      data.softDayStreak =
        data.lastPlayDay === y.toISOString().slice(0, 10) ? (data.softDayStreak || 0) + 1 : 1;
      data.lastPlayDay = today;
    }

    var week = data.week || emptyDangalWeek(dangalWeekKey(today));
    week.plays += 1;
    if (!Array.isArray(week.unique)) week.unique = [];
    if (!week.unique.includes(id)) week.unique.push(id);
    if (o.won === true) week.wins += 1;
    if (o.gotd) week.gotd = true;
    if (id === 'wordguess') week.shabd = true;
    data.week = week;
    return data;
  }

  function getDangalMissions(progress) {
    var p = progress || emptyDangalProgress();
    var week = p.week || emptyDangalWeek();
    var uniqueCount = Array.isArray(week.unique) ? week.unique.length : 0;
    return [
      {
        id: 'play3',
        label: 'Play 3 sessions',
        hint: 'Any games count',
        progress: Math.min(week.plays || 0, 3),
        target: 3,
      },
      {
        id: 'variety',
        label: 'Try 2 different games',
        hint: 'Mix solos & duels',
        progress: Math.min(uniqueCount, 2),
        target: 2,
      },
      {
        id: 'win1',
        label: 'Win one match',
        hint: 'Optional — no pressure',
        progress: Math.min(week.wins || 0, 1),
        target: 1,
      },
      {
        id: 'shabd',
        label: "Finish today's Shabd",
        hint: 'Daily 5-letter word',
        progress: week.shabd ? 1 : 0,
        target: 1,
        gameId: 'wordguess',
      },
      {
        id: 'gotd',
        label: 'Play Game of the Day',
        hint: 'Featured on the hub',
        progress: week.gotd ? 1 : 0,
        target: 1,
      },
    ];
  }

  /** Mark newly completed missions on week.celebrated; returns newly completed list. */
  function markCelebratedMissions(progress) {
    var p = progress || emptyDangalProgress();
    if (!p.week) p.week = emptyDangalWeek();
    if (!p.week.celebrated) p.week.celebrated = {};
    var newly = [];
    getDangalMissions(p).forEach(function (m) {
      if (m.progress >= m.target && !p.week.celebrated[m.id]) {
        p.week.celebrated[m.id] = true;
        newly.push(m);
      }
    });
    return newly;
  }

  function summarizeDangalHub(progress, today) {
    var day = today || dangalCalendarDay();
    var p = coerceDangalProgress(progress, day);
    var missions = getDangalMissions(p);
    var done = missions.filter(function (m) {
      return m.progress >= m.target;
    }).length;
    var matches = Object.keys(p.games || {}).reduce(
      function (acc, key) {
        var g = p.games[key] || {};
        acc.played += g.played || 0;
        acc.wins += g.wins || 0;
        return acc;
      },
      { played: 0, wins: 0 }
    );
    return {
      softDayStreak: p.softDayStreak || 0,
      weekPlays: (p.week && p.week.plays) || 0,
      weekWins: (p.week && p.week.wins) || 0,
      missionsDone: done,
      missionsTotal: missions.length,
      totalPlayed: matches.played,
      totalWins: matches.wins,
      panelCollapsed: !!p.panelCollapsed,
      hideMissions: p.hideMissionsUntil === day,
      missions: missions,
    };
  }

  return {
    SCORE_FOCUS_GAMES: SCORE_FOCUS_GAMES,
    LOWER_BETTER_SCORE: LOWER_BETTER_SCORE,
    normalizeDangalGameId: normalizeDangalGameId,
    dangalCalendarDay: dangalCalendarDay,
    dangalWeekKey: dangalWeekKey,
    emptyDangalGameStats: emptyDangalGameStats,
    emptyDangalWeek: emptyDangalWeek,
    emptyDangalProgress: emptyDangalProgress,
    coerceDangalProgress: coerceDangalProgress,
    isScoreBetter: isScoreBetter,
    applyDangalSession: applyDangalSession,
    getDangalMissions: getDangalMissions,
    markCelebratedMissions: markCelebratedMissions,
    summarizeDangalHub: summarizeDangalHub,
  };
});
