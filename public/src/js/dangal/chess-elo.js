/**
 * Client Elo helper — display only. Mutations go through dangal_game_resolve.
 */
(function () {
  'use strict';

  function computeElo(playerA, playerB, winnerUidOrDraw) {
    const k = (games) => ((games || 0) < 30 ? 20 : 10);
    const expected = (a, b) => 1 / (1 + Math.pow(10, (b - a) / 400));
    const expA = expected(playerA.elo ?? 1200, playerB.elo ?? 1200);
    const scoreA = winnerUidOrDraw === 'draw' ? 0.5 : winnerUidOrDraw === playerA.uid ? 1 : 0;
    const deltaA = Math.round(k(playerA.totalGames) * (scoreA - expA));
    return { [playerA.uid]: deltaA, [playerB.uid]: -deltaA };
  }

  window.computeElo = computeElo;
})();
