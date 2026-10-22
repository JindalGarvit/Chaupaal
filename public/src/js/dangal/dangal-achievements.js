/**
 * Achievement catalog + toast. Awards happen server-side in dangal_game_resolve.
 */
(function () {
  'use strict';

  const ACHIEVEMENTS = {
    first_game: { label: t('dangal.pehla_qadam'), desc: t('dangal.play_your_first_dangal_game'), chips: 100, icon: '🎮' },
    first_win: { label: t('dangal.pehli_jeet'), desc: t('dangal.win_your_first_game'), chips: 150, icon: '🏆' },
    ten_games: { label: t('dangal.khiladi'), desc: t('dangal.play_10_dangal_games'), chips: 250, icon: '🎯' },
    fifty_games: { label: t('dangal.ustaad'), desc: t('dangal.play_50_dangal_games'), chips: 500, icon: '⭐' },
    hundred_games: { label: t('dangal.dangal_guru'), desc: t('dangal.play_100_dangal_games'), chips: 1000, icon: '🌟' },
    won_stake: { label: t('dangal.raazi_tha'), desc: t('dangal.win_a_chip_staked_game'), chips: 100, icon: '🎰' },
    chess_first_win: { label: t('dangal.pehli_chaal'), desc: t('dangal.win_your_first_chess_game'), chips: 150, icon: '♟' },
    penalty_clean_sheet: { label: t('dangal.clean_sheet'), desc: t('dangal.win_a_penalty_shootout_without_conceding'), chips: 150, icon: '🧤' },
    penalty_panenka: { label: t('dangal.panenka'), desc: t('dangal.score_a_soft_chip_down_the'), chips: 150, icon: '🥄' },
    poker_royal_flush: { label: t('dangal.royal_flush'), desc: t('dangal.make_a_royal_flush_at_texas'), chips: 250, icon: '👑' },
    poker_bluff_master: { label: t('dangal.bluff_master'), desc: t('dangal.win_10_pots_without_a_showdown'), chips: 200, icon: '🃏' },
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
