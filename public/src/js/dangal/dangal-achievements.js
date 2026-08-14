/**
 * Achievement catalog + toast. Awards happen server-side in dangal_game_resolve.
 */
(function () {
  'use strict';

  const ACHIEVEMENTS = {
    first_game: { label: 'Pehla Qadam', desc: 'Play your first Dangal game', chips: 100, icon: '🎮' },
    first_win: { label: 'Pehli Jeet', desc: 'Win your first game', chips: 150, icon: '🏆' },
    ten_games: { label: 'Khiladi', desc: 'Play 10 Dangal games', chips: 250, icon: '🎯' },
    fifty_games: { label: 'Ustaad', desc: 'Play 50 Dangal games', chips: 500, icon: '⭐' },
    hundred_games: { label: 'Dangal Guru', desc: 'Play 100 Dangal games', chips: 1000, icon: '🌟' },
    won_stake: { label: 'Raazi Tha', desc: 'Win a chip-staked game', chips: 100, icon: '🎰' },
    chess_first_win: { label: 'Pehli Chaal', desc: 'Win your first chess game', chips: 150, icon: '♟' },
  };

  function showAchievementToast(ach) {
    if (!ach) return;
    const el = document.createElement('div');
    el.className = 'chaupaal-achievement-toast';
    el.setAttribute('data-nav-ignore', '1');
    el.innerHTML =
      '<span class="chaupaal-achievement-toast__icon">' +
      (ach.icon || '✨') +
      '</span><div class="chaupaal-achievement-toast__body"><strong>' +
      String(ach.label || '').replace(/</g, '') +
      '</strong><span>' +
      String(ach.desc || '').replace(/</g, '') +
      '</span></div><span class="chaupaal-achievement-toast__chips">+' +
      (ach.chips || 0) +
      ' ⚡</span>';
    (document.querySelector('.device') || document.body).appendChild(el);
    if (typeof Sound !== 'undefined') Sound.play('ui.achieve');
    if (typeof Haptic !== 'undefined') Haptic.achieve();
    setTimeout(() => el.classList.add('is-out'), 3200);
    setTimeout(() => el.remove(), 3800);
  }

  function showAchievementToasts(list) {
    (list || []).forEach((row, i) => {
      const meta = ACHIEVEMENTS[row.key] || row;
      setTimeout(() => showAchievementToast(Object.assign({}, meta, row)), i * 1600);
    });
  }

  window.ACHIEVEMENTS = ACHIEVEMENTS;
  window.showAchievementToast = showAchievementToast;
  window.showAchievementToasts = showAchievementToasts;
})();
