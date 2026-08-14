/**
 * Dangal session layer — identity, move/game-over feedback.
 * Chess and Five in a Row are the first full consumers; other games inherit via beginGameOverlaySession.
 */
(function () {
  'use strict';

  let mountedEl = null;
  let mountedGame = '';

  function mount(overlayEl, options) {
    mountedEl = overlayEl || null;
    const opts = options || {};
    mountedGame = typeof canonicalGameId === 'function' ? canonicalGameId(opts.gameType) : String(opts.gameType || '');
    if (overlayEl && overlayEl.classList) {
      overlayEl.classList.add('dangal-dsl');
      overlayEl.dataset.dslGame = mountedGame;
    }
    if (overlayEl && typeof applyGameIdentity === 'function' && mountedGame) {
      applyGameIdentity(mountedGame, overlayEl);
    }
  }

  function unmount() {
    mountedEl = null;
    mountedGame = '';
    if (typeof Sound !== 'undefined' && Sound.stopAmbient) Sound.stopAmbient();
  }

  function onMove(gameType) {
    if (typeof Sound !== 'undefined' && Sound.play) Sound.play('ui.move');
    if (typeof Haptic !== 'undefined' && Haptic.tap) Haptic.tap();
    const g = gameType || mountedGame;
    if (g === 'chess' || g === 'fiveinrow') {
      if (typeof gameFeedback === 'function') {
        /* already called by engines; keep haptic-only here when feedback skipped */
      }
    }
  }

  function onGameOver(result) {
    const r = result || {};
    const tag = typeof normalizeDangalResult === 'function' ? normalizeDangalResult(r.result) : r.result;
    const won = r.won || tag === 'win' || r.result === 'won';
    const isDraw = r.isDraw || tag === 'draw' || r.result === 'draw';
    if (typeof Haptic !== 'undefined') {
      if (won && Haptic.win) Haptic.win();
      else if (Haptic.medium) Haptic.medium();
    }
    if (typeof Sound !== 'undefined' && Sound.play) {
      Sound.play(isDraw ? 'ui.draw' : won ? 'ui.win' : 'ui.lose');
    }
  }

  function showPostGame(result) {
    const r = result || {};
    const won = r.won || r.winnerUid === (typeof getCurrentUid === 'function' ? getCurrentUid() : '');
    const title = r.isDraw ? 'Draw' : won ? 'You won' : 'Game over';
    if (typeof showGameResult === 'function') {
      showGameResult({
        title,
        subtitle: r.gameType ? (typeof getGameIdentity === 'function' ? getGameIdentity(r.gameType)?.label : r.gameType) : '',
        actions: [
          { label: 'Done', primary: true, id: 'done' },
          { label: 'Rematch', primary: false, id: 'again' },
        ],
      });
      return;
    }
    if (typeof showToast === 'function') showToast(title);
  }

  window.DSL = { mount, unmount, showPostGame, onMove, onGameOver, getMounted() { return mountedEl; } };
})();
