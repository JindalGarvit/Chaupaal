/**
 * Shared game UI — tokens, chrome, results, share, friend picker, PB, coach.
 * Load after game-runtime.js; before game files that call these APIs.
 */
(function () {
  'use strict';

  /** Map common game actions → existing SoundLib + haptic cues (no new one-off sounds). */
  const ACTION_MAP = {
    select: { sound: 'tap', haptic: 'light' },
    move: { sound: 'move', haptic: 'light' },
    place: { sound: 'place', haptic: 'medium' },
    card: { sound: 'card', haptic: 'medium' },
    valid: { sound: 'tap', haptic: 'light' },
    invalid: { sound: 'error', haptic: 'error' },
    turn: { sound: 'notification', haptic: 'light' },
    win: { sound: 'cheer', haptic: 'success', confetti: true },
    lose: { sound: 'wrongTone', haptic: 'error' },
    draw: { sound: 'sectionComplete', haptic: 'medium' },
    complete: { sound: 'sectionComplete', haptic: 'success', confetti: true },
    dice: { sound: 'dice', haptic: 'medium' },
    stone: { sound: 'stone', haptic: 'medium' },
    capture: { sound: 'capture', haptic: 'heavy' },
    coin: { sound: 'coin', haptic: 'light' },
    jump: { sound: 'jump', haptic: 'light' },
    crash: { sound: 'crash', haptic: 'heavy' },
    kick: { sound: 'kick', haptic: 'medium' },
    bat: { sound: 'bat', haptic: 'medium' },
    check: { sound: 'check', haptic: 'medium' },
    timeout: { sound: 'wrongTone', haptic: 'error' },
  };

  const GAME_ACCENTS = {
    muqabala: '#6200EA',
    quiz: '#6200EA',
    akhbaar: '#E63946',
    chess: '#8B5E3C',
    snakes: '#2E7D32',
    ludo: '#E040FB',
    uno: '#D32F2F',
    tictactoe: '#1565C0',
    ttt: '#1565C0',
    wordguess: '#00796B',
    scribble: '#E91E63',
    tiptap: '#FF6D00',
    ankjod: '#1A237E',
    kakuro: '#1A237E',
    streetcricket: '#2E7D32',
    badminton: '#01579B',
    tambola: '#E91E8C',
    carrom: '#8D6E63',
    rummy: '#6A1B9A',
    teenpatti: '#4A148C',
    bluff: '#37474F',
    brickbreaker: '#5C6BC0',
    imposter: '#C2185B',
    rajamantri: '#B8860B',
    charades: '#00897B',
    mostlikely: '#7C4DFF',
    werewolf: '#3949AB',
    penalty: '#00A86B',
    poker: '#1B7F4B',
    wrap: '#8134AF',
    duniya: '#E63946',
    peepal: '#2A9D8F',
    profile: '#C9A227',
  };

  const GAME_LABELS = {
    quiz: t('dangal.muqabala'),
    muqabala: t('dangal.muqabala'),
    akhbaar: t('dangal.akhbaar'),
    chess: t('common.chess'),
    snakes: t('dangal.snakes_ladders'),
    ludo: t('dangal.ludo'),
    uno: t('dangal.oh_no'),
    ttt: t('dangal.tic_tac_toe'),
    wordguess: t('dangal.shabd_five'),
    scribble: t('dangal.scribble'),
    tiptap: t('dangal.tip_tap'),
    ankjod: t('dangal.kakuro'),
    kakuro: t('dangal.kakuro'),
    streetcricket: t('dangal.street_cricket'),
    badminton: t('dangal.badminton'),
    tambola: t('dangal.classics.tambola'),
    carrom: t('dangal.classics.carrom'),
    rummy: t('dangal.classics.rummy'),
    teenpatti: t('dangal.classics.teen_patti'),
    bluff: t('dangal.classics.bluff'),
    brickbreaker: t('dangal.brick_breaker'),
    imposter: t('dangal.party.imposter'),
    rajamantri: t('dangal.party.raja_mantri_chor_sipahi'),
    charades: t('dangal.party.charades'),
    mostlikely: t('dangal.most_likely_to'),
    werewolf: t('dangal.party.werewolf'),
    penalty: t('dangal.penalty_shootout'),
    poker: t('dangal.texas_hold_em'),
    wrap: t('dangal.monthly_wrap'),
    duniya: t('dangal.duniya'),
    peepal: t('dangal.peepal'),
    profile: t('common.profile'),
  };

  function trackShareEvent(name, params) {
    try {
      if (typeof trackEvent === 'function') trackEvent(name, params || {});
    } catch (e) {}
  }

  const COACH_TIPS = {
    quiz: [
      t('dangal.daily_quiz_same_10_for_everyone'),
      t('dangal.correct_600_up_to_400_for'),
      t('dangal.practice_any_category_unlimited_and_unrate'),
    ],
    chess: [t('dangal.tap_a_piece_then_a_highlighted'), t('dangal.fischer_random_shuffles_the_back_rank'), t('dangal.harder_ai_thinks_a_little_longer')],
    snakes: [
      t('dangal.classic_vedic_bounce_speed_2_dice'),
      t('dangal.live_1v1_host_locks_one_board'),
      t('dangal.virtual_stakes_settle_once_rematch_opens'),
    ],
    ludo: [t('dangal.roll_six_to_enter_a_piece'), t('dangal.tap_a_glowing_piece_to_move'), t('dangal.capture_rivals_by_landing_on_them')],
    ttt: [
      t('dangal.get_three_in_a_row_block'),
      t('dangal.practice_easy_medium_hard_ai'),
      t('dangal.live_1v1_virtual_stakes_settle_once'),
    ],
    wordguess: [
      t('dangal.one_daily_puzzle_per_local_day'),
      t('dangal.hard_mode_reuses_greens_ambers_archive'),
      t('dangal.practice_has_its_own_stats_never'),
    ],
    scribble: [
      t('dangal.live_room_for_2_12_the'),
      t('dangal.faster_guesses_score_more_300_50'),
      t('dangal.host_sets_rounds_draw_time_hints'),
    ],
    tiptap: [
      t('dangal.match_4_line_l_or_t'),
      t('dangal.finish_every_goal_before_moves_or'),
      t('dangal.daily_challenge_same_board_for_everyone'),
    ],
    ankjod: [
      t('dangal.kakuro_each_run_of_white_cells'),
      t('dangal.every_puzzle_has_exactly_one_answer'),
      t('dangal.pencil_notes_auto_notes_sums_helper'),
      t('dangal.daily_kakuro_same_puzzle_for_everyone'),
    ],
    streetcricket: [
      t('dangal.based_on_the_mcc_laws_of'),
      t('dangal.wides_and_no_balls_cost_an'),
      t('dangal.standard_is_rated_gully_and_backyard'),
    ],
    badminton: [
      t('dangal.best_of_3_games_to_21'),
      t('dangal.serve_from_the_right_court_on'),
      t('dangal.tap_as_the_shuttle_reaches_the'),
    ],
    tambola: [
      t('dangal.numbers_are_called_one_by_one'),
      t('dangal.tap_claim_when_a_prize_is'),
      t('dangal.a_wrong_claim_bogey_blocks_that'),
    ],
    carrom: [t('dangal.pocket_your_own_men_from_your'), t('dangal.queen_after_one_of_yours_then'), t('dangal.striker_in_the_pocket_foul_due')],
    uno: [t('dangal.match_colour_number_or_symbol_to'), t('dangal.tap_oh_no_as_you_play'), t('dangal.think_a_draw_four_was_a')],
    rummy: [
      t('dangal.draw_a_card_throw_a_card'),
      t('dangal.13_card_declare_with_2_sequences'),
      t('dangal.points_pool_or_deals_bots_easy'),
    ],
    teenpatti: [
      t('dangal.everyone_pays_the_boot_three_cards'),
      t('dangal.bet_blind_or_look_and_bet'),
      t('dangal.show_when_two_are_left_pot'),
    ],
    bluff: [
      t('dangal.play_1_4_cards_face_down'),
      t('dangal.anyone_can_call_bluff_before_the'),
      t('dangal.empty_your_hand_and_survive_the'),
    ],
    imposter: [
      t('dangal.everyone_gets_the_same_secret_word'),
      t('dangal.take_turns_giving_one_clue_word'),
      t('dangal.discuss_then_vote_catch_the_imposter'),
      t('dangal.undercover_the_imposter_gets_a_close'),
    ],
    rajamantri: [
      t('dangal.everyone_draws_a_secret_chit_raja'),
      t('dangal.the_raja_reveals_and_calls_mantri'),
      t('dangal.the_mantri_picks_the_chor_right'),
      t('dangal.5_8_players_add_rani_daku'),
    ],
    charades: [
      t('dangal.two_teams_take_turns_the_actor'),
      t('dangal.teammates_guess_before_the_timer_ends'),
      t('dangal.one_pass_per_turn_by_default'),
      t('dangal.on_a_video_call_teammates_can'),
    ],
    mostlikely: [
      t('dangal.most_likely_to_everyone_secretly_votes'),
      t('dangal.would_you_rather_pick_a_or'),
      t('dangal.never_have_i_ever_tap_i'),
      t('dangal.votes_stay_hidden_until_the_reveal'),
      t('dangal.settings_packs_rounds_anonymous_reveal_and'),
    ],
    werewolf: [
      t('dangal.secret_roles_werewolves_a_seer_a'),
      t('dangal.night_everyone_taps_a_choice_werewolves'),
      t('dangal.day_hear_who_was_taken_talk'),
      t('dangal.village_wins_when_every_werewolf_is'),
      t('dangal.advanced_hunter_witch_bodyguard_tanner_tim'),
    ],
    penalty: [
      t('dangal.shoot_drag_on_the_goal_to'),
      t('dangal.save_tap_where_to_dive_then'),
      t('dangal.kicks_alternate_best_of_5_ends'),
      t('dangal.live_both_pick_at_once_and'),
    ],
    poker: [
      t('dangal.texas_hold_em_two_cards_each'),
      t('dangal.blinds_then_bet_on_the_flop'),
      t('dangal.royal_flush_beats_straight_flush_four'),
      t('dangal.practice_vs_bots_quick_tables_and'),
      t('dangal.virtual_chips_only_they_can_t'),
    ],
    brickbreaker: [
      t('dangal.campaign_60_levels_endless_or_the'),
      t('dangal.where_the_ball_hits_the_paddle'),
      t('dangal.steel_can_t_break_bombs_clear'),
      t('dangal.power_ups_wide_multi_ball_slow'),
    ],
  };

  const PB_KEYS = {
    tiptap: { key: 'chaupaal_pb_tiptap', label: t('dangal.pts'), higherBetter: true },
    wordguess: { key: 'chaupaal_pb_wordguess', label: t('dangal.guesses'), higherBetter: false },
    ankjod: { key: 'chaupaal_pb_ankjod', label: 's', higherBetter: false },
    ankjod_easy: { key: 'chaupaal_pb_ankjod_easy', label: 's', higherBetter: false },
    ankjod_medium: { key: 'chaupaal_pb_ankjod_medium', label: 's', higherBetter: false },
    ankjod_hard: { key: 'chaupaal_pb_ankjod_hard', label: 's', higherBetter: false },
    ankjod_expert: { key: 'chaupaal_pb_ankjod_expert', label: 's', higherBetter: false },
    ankjod_daily: { key: 'chaupaal_pb_ankjod_daily', label: 's', higherBetter: false },
    quiz: { key: 'chaupaal_pb_quiz', label: '/10', higherBetter: true },
    streetcricket: { key: 'chaupaal_pb_streetcricket', label: t('dangal.runs'), higherBetter: true },
    streetcricket_over: { key: 'chaupaal_pb_streetcricket_over', label: t('dangal.runs'), higherBetter: true },
    streetcricket_nets: { key: 'chaupaal_pb_streetcricket_nets', label: t('dangal.clean'), higherBetter: true },
    streetcricket_chase: { key: 'chaupaal_pb_streetcricket_chase', label: t('dangal.runs'), higherBetter: true },
    streetcricket_chase_wins: { key: 'chaupaal_pb_streetcricket_chase_wins', label: t('dangal.wins'), higherBetter: true },
    badminton: { key: 'chaupaal_pb_badminton', label: t('dangal.pts'), higherBetter: true },
    carrom: { key: 'chaupaal_pb_carrom', label: t('dangal.coins'), higherBetter: true },
    brickbreaker: { key: 'chaupaal_pb_brickbreaker', label: t('dangal.pts'), higherBetter: true },
    brickbreaker_endless: { key: 'chaupaal_pb_brickbreaker_endless', label: t('dangal.pts'), higherBetter: true },
  };

  function gameFeedback(action, opts) {
    const o = opts || {};
    const key = String(action || 'select').toLowerCase();
    const spec = ACTION_MAP[key] || ACTION_MAP.select;
    try {
      if (typeof SoundLib !== 'undefined' && SoundLib.play) {
        SoundLib.play(spec.sound);
      }
    } catch (e) {}
    try {
      if (typeof Sound !== 'undefined' && Sound.play) {
        if (key === 'win') Sound.play('ui.win');
        else if (key === 'lose') Sound.play('ui.lose');
        else if (key === 'draw') Sound.play('ui.draw');
        else Sound.play('ui.click');
      }
    } catch (e) {}
    try {
      if (typeof haptic === 'function' && spec.haptic) haptic(spec.haptic);
    } catch (e) {}
    try {
      if (typeof Haptic !== 'undefined') {
        if (key === 'win' && Haptic.win) Haptic.win();
      }
    } catch (e) {}
    if (spec.confetti && typeof launchConfetti === 'function' && !o.noConfetti) {
      try {
        launchConfetti(o.origin || { x: 50, y: 40 }, o.confettiCount || 36);
      } catch (e) {}
    }
  }

  /**
   * @param {{ mode?: 'yours'|'theirs'|'waiting'|'over', label?: string, sub?: string, pulse?: boolean, practice?: boolean }} state
   */
  function gameTurnBannerHtml(state) {
    const s = state || {};
    const mode = s.mode || 'waiting';
    const practice = !!s.practice;
    const defaultTheirs = practice ? t('dangal.practice_ai_thinking') : t('dangal.opponent_thinking');
    const label =
      s.label ||
      (mode === 'yours'
        ? t('dangal.your_turn')
        : mode === 'theirs'
          ? defaultTheirs
          : mode === 'over'
            ? t('dangal.game_over')
            : t('dangal.waiting'));
    const sub = s.sub ? `<span class="game-turn-sub">${s.sub}</span>` : '';
    const pulse = s.pulse || mode === 'yours' ? ' game-turn--pulse' : '';
    return `<div class="game-turn game-turn--${mode}${pulse}" role="status" aria-live="polite"><span class="game-turn-dot" aria-hidden="true"></span><span class="game-turn-label">${label}</span>${sub}</div>`;
  }

  /** Canonical Practice opponent label — never Priya-style fakes. */
  function practiceOppLabel(chatOrName) {
    if (typeof practiceAiChat === 'function') {
      const c = practiceAiChat();
      if (c && c.name) return c.name;
    }
    const raw =
      chatOrName && typeof chatOrName === 'object'
        ? chatOrName.name || chatOrName.displayName || ''
        : chatOrName;
    const id =
      chatOrName && typeof chatOrName === 'object'
        ? String(chatOrName.id || chatOrName.uid || '')
        : '';
    // Canonical AI seat ids always map to Practice AI — never a friend display name.
    if (!id || id === 'ai' || /^ai(_|$)/i.test(id) || id === 'practice') return t('dangal.practice_ai');
    const s = String(raw || '').trim();
    if (!s || /^(ai|practice|friend|opponent)$/i.test(s) || /^ai\s*\d*$/i.test(s)) {
      return t('dangal.practice_ai');
    }
    if (/practice\s*ai/i.test(s)) return t('dangal.practice_ai');
    if (/^ai(\s|$)/i.test(s)) return t('dangal.practice_ai');
    // Prefer honesty: human-looking leftover names on Practice launches → Practice AI
    return t('dangal.practice_ai');
  }

  /**
   * Practice turn / thinking copy for banners and hints.
   * @param {{ myTurn?: boolean, liveOn?: boolean, thinking?: boolean, sport?: string, oppName?: string }} opts
   */
  function practiceTurnStatus(opts) {
    const o = opts || {};
    if (o.liveOn) {
      const name = o.oppName || t('dangal.opponent');
      return {
        mode: o.myTurn ? 'yours' : 'theirs',
        label: o.myTurn ? t('dangal.your_turn') : t('dangal.name_s_turn', { name }),
        thinking: false,
      };
    }
    const sport = String(o.sport || '').trim();
    const thinkingVerb = sport
      ? t('dangal.practice_ai_sport_value', { sport, value: /\.\.\.|…$/.test(sport) ? '' : '…' })
      : t('dangal.practice_ai_thinking');
    if (o.myTurn) {
      return { mode: 'yours', label: t('dangal.your_turn'), thinking: false };
    }
    return {
      mode: 'theirs',
      label: o.thinking !== false ? thinkingVerb : t('dangal.practice_ai_s_turn'),
      thinking: true,
    };
  }

  /** Min dwell so AI seats don’t feel frozen (Practice only). Returns clearable timer id. */
  function schedulePracticeAiThink(fn, ms, store) {
    const delay = Math.max(300, Number(ms) || 400);
    const bag = store && typeof store === 'object' ? store : null;
    if (bag && bag.timer) {
      try {
        clearTimeout(bag.timer);
      } catch (e) {}
      bag.timer = 0;
    }
    const id = setTimeout(() => {
      if (bag) bag.timer = 0;
      try {
        if (typeof fn === 'function') fn();
      } catch (e) {}
    }, delay);
    if (bag) bag.timer = id;
    return id;
  }

  function clearPracticeAiThink(store) {
    if (!store || !store.timer) return;
    try {
      clearTimeout(store.timer);
    } catch (e) {}
    store.timer = 0;
  }

  function safe(value) {
    return String(value ?? '').replace(/[&<>"']/g, (ch) => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
    })[ch]);
  }

  function gameBrandMarkHtml(compact) {
    return `<span class="game-brand-mark${compact ? ' game-brand-mark--compact' : ''}" aria-hidden="true"><span class="game-brand-chair">🪑</span><span class="game-brand-word">Chaupaal</span></span>`;
  }

  /** Shared Muqabala-derived header used by every Dangal game. */
  function gameChromeHtml(opts) {
    const o = opts || {};
    const backId = safe(o.backId || 'gameBack');
    const title = safe(o.title || t('dangal.game'));
    const subtitle = o.subtitle ? `<span class="game-chrome-subtitle">${safe(o.subtitle)}</span>` : '';
    const brand = o.hideBrand ? '' : `<div class="game-chrome-brand">${gameBrandMarkHtml(true)}</div>`;
    const gameMark =
      o.gameId && typeof gameMarkHtml === 'function' && o.hideGameMark !== true
        ? `<span class="game-chrome-mark">${gameMarkHtml(o.gameId, { size: 22 })}</span>`
        : '';
    const pauseId = o.pauseId ? safe(o.pauseId) : '';
    const pauseBtn = pauseId
      ? `<button type="button" id="${pauseId}" class="game-chrome-action game-tap-target" aria-label="${tHtml('dangal.pause')}">⏸</button>`
      : '';
    const rightInner = o.rightHtml || '<span class="game-chrome-spacer" aria-hidden="true"></span>';
    const right = pauseBtn + rightInner;
    return `<div class="game-chrome">
      ${typeof backButtonHtml==='function'?backButtonHtml({ className: 'game-back-btn game-tap-target', id: backId }):`<button type="button" id="${backId}" class="game-back-btn game-tap-target cp-back-btn" aria-label="${tHtml('common.back')}">${typeof iconHtml==='function'?iconHtml('arrow-left',{size:22}):''}</button>`}
      <div class="game-chrome-heading">${brand}${gameMark}<div class="game-chrome-title">${title}</div>${subtitle}</div>
      <div class="game-chrome-right">${right}</div>
    </div>`;
  }

  function gameScoreHtml(left, right) {
    const a = left || {};
    const b = right || {};
    return `<div class="game-scoreboard">
      <div class="game-score-side"><span>${safe(a.label || 'You')}</span><strong>${safe(a.score ?? 0)}</strong></div>
      <div class="game-score-divider">–</div>
      <div class="game-score-side game-score-side--right"><span>${safe(b.label || t('dangal.opponent'))}</span><strong>${safe(b.score ?? 0)}</strong></div>
    </div>`;
  }

  /** Standard result CTAs: Play again · Share · Challenge friend (+ optional extras). */
  function defaultResultActions(opts) {
    const o = opts || {};
    if (Array.isArray(o.actions) && o.actions.length) return o.actions;
    const list = [{ label: o.againLabel || t('dangal.play_again'), primary: true, id: 'again' }];
    if (o.share !== false) list.push({ label: o.shareLabel || t('common.share'), primary: false, id: 'share' });
    if (o.challenge !== false) list.push({ label: o.challengeLabel || t('dangal.challenge_friend'), primary: false, id: 'challenge' });
    if (o.story) list.push({ label: t('dangal.post_to_story'), primary: false, id: 'story' });
    (o.extraActions || []).forEach((a) => list.push(a));
    return list;
  }

  /** Calm shared results shell — Muqabala-derived, emoji optional and small. */
  function gameResultHtml(opts) {
    const o = opts || {};
    const title = safe(o.title || t('dangal.game_over'));
    const pbLine = o.pbHtml || (o.vsBest ? `<p class="game-result-pb">${safe(o.vsBest)}</p>` : '');
    const subtitle = o.subtitle ? `<p class="game-result-sub">${safe(o.subtitle)}</p>` : '';
    let glyph = '';
    if (o.glyph) {
      glyph = `<div class="game-result-glyph" aria-hidden="true">${safe(o.glyph)}</div>`;
    } else if (o.gameId && typeof gameMarkHtml === 'function' && o.hideMark !== true) {
      glyph = `<div class="game-result-glyph game-result-glyph--mark" aria-hidden="true">${gameMarkHtml(o.gameId, { size: 28 })}</div>`;
    }
    const brand = o.hideBrand ? '' : `<div class="game-result-brand">${gameBrandMarkHtml(true)}</div>`;
    const shareCard = o.shareCardHtml || '';
    const score =
      o.scoreHtml ||
      (o.you != null || o.opp != null
        ? gameScoreHtml({ label: o.youLabel || t('dangal.solo.you'), score: o.you ?? 0 }, { label: o.oppLabel || t('dangal.opponent'), score: o.opp ?? 0 })
        : '');
    const statsStrip =
      o.statsHtml ||
      (o.hideStats ? '' : o.gameId ? gamePersonalStatsHtml(o.gameId) : '');
    const missionHint = o.missionHtml || (o.hideMissions ? '' : o.gameId ? dangalMissionNudgeHtml(o.gameId) : '');
    const actions = defaultResultActions(o)
      .map(
        (a, i) =>
          `<button type="button" class="game-result-btn ${a.primary ? 'game-result-btn--primary' : ''}" data-result-action="${i}"${a.id ? ` data-result-id="${safe(a.id)}"` : ''}>${safe(a.label)}</button>`
      )
      .join('');
    return `<div class="game-result" role="status">
      ${brand}
      ${shareCard}
      ${glyph}
      <h2 class="game-result-title">${title}</h2>
      ${subtitle}
      ${pbLine}
      ${score}
      ${statsStrip}
      ${missionHint}
      <div class="game-result-actions">${actions}</div>
    </div>`;
  }

  function setGameTurnBanner(el, state) {
    if (!el) return;
    const wrap = el.classList && el.classList.contains('game-turn') ? el : el.querySelector && el.querySelector('.game-turn');
    const target = wrap || el;
    const tmp = document.createElement('div');
    tmp.innerHTML = gameTurnBannerHtml(state);
    const next = tmp.firstElementChild;
    if (!next) return;
    if (target.classList && target.classList.contains('game-turn')) {
      target.className = next.className;
      target.innerHTML = next.innerHTML;
      target.setAttribute('role', 'status');
      target.setAttribute('aria-live', 'polite');
    } else {
      target.innerHTML = next.outerHTML;
    }
  }

  function gameSkeletonHtml(opts) {
    const o = opts || {};
    const title = o.title || t('dangal.classics.loading');
    const dark = o.theme === 'dark';
    return `
      <div class="game-overlay ${dark ? 'game-overlay--dark' : 'game-overlay--light'} game-overlay--entering" data-game-shell="1">
        <div class="game-chrome">
          <button type="button" class="game-back-btn cp-back-btn" data-overlay-dismiss style="visibility:hidden" aria-hidden="true"></button>
          <div class="game-chrome-title">${title}</div>
          <div style="width:36px"></div>
        </div>
        <div class="game-skeleton-body">
          <div class="skeleton game-skel-bar"></div>
          <div class="skeleton game-skel-board"></div>
          <div class="skeleton game-skel-bar game-skel-bar--short"></div>
        </div>
      </div>`;
  }

  /** Apply shared shell classes + entry motion to a game overlay element. */
  function unlockGameOrientation() {
    try {
      if (screen.orientation && typeof screen.orientation.unlock === 'function') {
        screen.orientation.unlock();
      }
    } catch (e) {}
  }

  function lockPortraitOrientation() {
    try {
      if (screen.orientation && typeof screen.orientation.lock === 'function') {
        const p = screen.orientation.lock('portrait');
        if (p && typeof p.catch === 'function') p.catch(() => {});
      }
    } catch (e) {}
  }

  function resolveGameAccent(gameId, fallback) {
    const id = normalizeDangalGameId(gameId);
    if (typeof getGameIdentity === 'function') {
      const ident = getGameIdentity(id);
      if (ident && ident.primary) return ident.primary;
    }
    if (GAME_ACCENTS[id]) return GAME_ACCENTS[id];
    return fallback != null ? fallback : '#E63946';
  }

  function prepareGameOverlay(overlay, opts) {
    const o = opts || {};
    if (!overlay) return overlay;
    overlay.classList.add('game-overlay');
    overlay.classList.add('game-landscape-ok');
    if (o.theme === 'dark') overlay.classList.add('game-overlay--dark');
    else if (o.theme === 'light') overlay.classList.add('game-overlay--light');
    overlay.classList.add('game-overlay--entering');
    const gameId = String(o.gameId || overlay.dataset?.gameId || '').toLowerCase();
    if (gameId) {
      overlay.dataset.gameId = gameId;
      const accent = o.accent || resolveGameAccent(gameId);
      overlay.style.setProperty('--game-accent', accent);
      if (typeof applyGameIdentity === 'function') applyGameIdentity(normalizeDangalGameId(gameId), overlay);
      if (o.accent) overlay.style.setProperty('--game-accent', o.accent);
      // Prefer SVG mark in chrome when callers only passed a title string
      if (typeof gameMarkHtml === 'function' && o.hideGameMark !== true) {
        try {
          const heading = overlay.querySelector('.game-chrome-heading');
          if (heading && !heading.querySelector('.game-chrome-mark')) {
            const wrap = document.createElement('span');
            wrap.className = 'game-chrome-mark';
            wrap.innerHTML = gameMarkHtml(gameId, { size: 22 });
            const titleEl = heading.querySelector('.game-chrome-title');
            if (titleEl) heading.insertBefore(wrap, titleEl);
            else heading.appendChild(wrap);
          }
        } catch (e) {}
      }
    }
    unlockGameOrientation();
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        overlay.classList.remove('game-overlay--entering');
        overlay.classList.add('game-overlay--ready');
        if (gameId && o.coach !== false) maybeShowGameCoach(overlay, gameId);
      });
    });
    return overlay;
  }

  /** Exit motion then callback (default removes node via caller). */
  function animateGameExit(overlay, done) {
    if (!overlay || !overlay.isConnected) {
      lockPortraitOrientation();
      if (typeof done === 'function') done();
      return;
    }
    overlay.classList.remove('game-overlay--ready');
    overlay.classList.add('game-overlay--exiting');
    const ms =
      (typeof getComputedStyle === 'function' &&
        parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--game-exit-ms'))) ||
      220;
    setTimeout(() => {
      lockPortraitOrientation();
      if (typeof done === 'function') done();
    }, Math.max(160, ms || 220));
  }

  /** Light press feedback on a cell/button. */
  function pulseGameEl(el) {
    if (!el || !el.classList) return;
    el.classList.remove('game-pulse');
    void el.offsetWidth;
    el.classList.add('game-pulse');
  }

  /** Ensure min tap target for interactive game controls. */
  function ensureGameTapTarget(el) {
    if (!el || !el.style) return;
    el.classList.add('game-tap-target');
  }

  /**
   * Size a canvas to its CSS box with devicePixelRatio so draws stay sharp on phones.
   * @param {HTMLCanvasElement} canvas
   * @param {{ maxDpr?: number }} [opts]
   * @returns {{ w: number, h: number, dpr: number }}
   */
  function setupGameCanvas(canvas, opts) {
    const o = opts || {};
    if (!canvas) return { w: 0, h: 0, dpr: 1 };
    const dpr = Math.min(o.maxDpr || 2.5, Math.max(1, window.devicePixelRatio || 1));
    const rect = canvas.getBoundingClientRect();
    const cssW = Math.max(1, Math.floor(rect.width || canvas.clientWidth || canvas.offsetWidth || 1));
    const cssH = Math.max(1, Math.floor(rect.height || canvas.clientHeight || canvas.offsetHeight || 1));
    const bw = Math.round(cssW * dpr);
    const bh = Math.round(cssH * dpr);
    if (canvas.width !== bw || canvas.height !== bh) {
      canvas.width = bw;
      canvas.height = bh;
    }
    canvas.style.width = cssW + 'px';
    canvas.style.height = cssH + 'px';
    const ctx = canvas.getContext('2d');
    if (ctx && typeof ctx.setTransform === 'function') {
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    }
    return { w: cssW, h: cssH, dpr };
  }

  /* ── Invalid-move juice ── */
  function shakeInvalidMove(el, opts) {
    const o = opts || {};
    gameFeedback('invalid');
    if (!el || !el.classList) return;
    el.classList.remove('game-invalid-shake');
    void el.offsetWidth;
    el.classList.add('game-invalid-shake');
    if (o.toast && typeof showToast === 'function') showToast(o.toast);
    setTimeout(() => el.classList.remove('game-invalid-shake'), 520);
  }

  /* ── Personal bests ── */
  /** Kakuro per-difficulty PB ids (id stays `ankjod`; legacy overall key is `ankjod`). */
  function ankJodPbGameId(difficulty) {
    const d = String(difficulty || '').toLowerCase();
    if (d === 'easy' || d === 'medium' || d === 'hard' || d === 'expert' || d === 'daily') return 'ankjod_' + d;
    return 'ankjod';
  }

  /** Street Cricket per-format PB ids. Legacy `streetcricket` maps to Over. */
  function streetCricketPbGameId(format) {
    const f = String(format || 'over').toLowerCase();
    if (f === 'nets') return 'streetcricket_nets';
    if (f === 'chase') return 'streetcricket_chase';
    return 'streetcricket_over';
  }

  function migrateStreetCricketPb() {
    try {
      const overKey = 'chaupaal_pb_streetcricket_over';
      const legacyKey = 'chaupaal_pb_streetcricket';
      if (localStorage.getItem(overKey) == null || localStorage.getItem(overKey) === '') {
        const legacy = localStorage.getItem(legacyKey);
        if (legacy != null && legacy !== '') localStorage.setItem(overKey, legacy);
      }
    } catch (e) {}
  }

  function getGamePB(gameId) {
    if (gameId === 'streetcricket_over' || gameId === 'streetcricket') migrateStreetCricketPb();
    const meta = PB_KEYS[gameId];
    if (!meta) return null;
    const raw = localStorage.getItem(meta.key);
    if (raw == null || raw === '') {
      // Legacy street cricket runs → Over
      if (gameId === 'streetcricket_over') {
        const legacy = localStorage.getItem('chaupaal_pb_streetcricket');
        if (legacy != null && legacy !== '') {
          const n = Number(legacy);
          return Number.isFinite(n) ? n : null;
        }
      }
      if (gameId === 'streetcricket') {
        return getGamePB('streetcricket_over');
      }
      return null;
    }
    const n = Number(raw);
    return Number.isFinite(n) ? n : null;
  }

  function setGamePB(gameId, value) {
    const meta = PB_KEYS[gameId];
    if (!meta || value == null || !Number.isFinite(Number(value))) return getGamePB(gameId);
    const next = Number(value);
    const prev = getGamePB(gameId);
    const better =
      prev == null ||
      (meta.higherBetter ? next > prev : next < prev);
    if (better) {
      localStorage.setItem(meta.key, String(next));
      // Per-diff Kakuro wins also refresh overall legacy key (lower time = better)
      if (String(gameId).indexOf('ankjod_') === 0) {
        setGamePB('ankjod', next);
      }
      // Over best keeps legacy streetcricket key in sync for hub tiles
      if (gameId === 'streetcricket_over') {
        try {
          localStorage.setItem('chaupaal_pb_streetcricket', String(next));
        } catch (e) {}
      }
      return next;
    }
    return prev;
  }

  function formatVsBest(gameId, value) {
    const meta = PB_KEYS[gameId];
    if (!meta || value == null) return '';
    const pb = getGamePB(gameId);
    const unit = meta.label || '';
    const fmt =
      String(gameId).indexOf('ankjod') === 0
        ? (n) => {
            const s = Math.max(0, Math.round(Number(n) || 0));
            const m = Math.floor(s / 60);
            return m + ':' + String(s % 60).padStart(2, '0');
          }
        : (n) => n + unit;
    if (pb == null) return t('dangal.first_score_value', { value: fmt(value) });
    const better =
      meta.higherBetter ? Number(value) > pb : Number(value) < pb;
    if (better) return t('dangal.new_best_value_was_pb', { value: fmt(value), pb: fmt(pb) });
    if (Number(value) === pb) return t('dangal.tied_best_pb', { pb: fmt(pb) });
    return `${fmt(value)} · Best ${fmt(pb)}`;
  }

  /* ── Share card + share helpers ── */
  function gameDisplayName(gameId) {
    if (typeof getGame === 'function') {
      const g = getGame(gameId === 'muqabala' ? 'quiz' : gameId);
      if (g && g.name) return g.name;
    }
    if (typeof getGameIdentity === 'function') {
      const ident = getGameIdentity(gameId === 'muqabala' ? 'quiz' : gameId);
      if (ident && ident.label) return ident.label;
    }
    return GAME_LABELS[gameId] || gameId || t('dangal.game');
  }

  function buildGameShareCard(gameId, stats) {
    const s = stats || {};
    const name = safe(s.title || gameDisplayName(gameId));
    const rawScore = s.scoreLine || (s.score != null ? String(s.score) : s.caption || '—');
    const scoreLine = safe(String(rawScore).length > 90 ? String(rawScore).slice(0, 87) + '…' : rawScore);
    const meta = safe(s.meta || '');
    const vs = s.vs ? safe(s.vs) : '';
    const accent = resolveGameAccent(gameId, GAME_ACCENTS.quiz);
    const mark =
      typeof gameMarkHtml === 'function'
        ? `<span class="game-share-mark">${gameMarkHtml(gameId, { size: 22 })}</span>`
        : '';
    return `<div class="game-share-card" data-game-share="${safe(gameId)}" style="--share-accent:${accent}">
      <div class="game-share-brand">${mark}${gameBrandMarkHtml(false)} · ${name}</div>
      <div class="game-share-score${String(rawScore).length > 40 ? ' game-share-score--caption' : ''}">${scoreLine}</div>
      ${meta ? `<div class="game-share-meta">${meta}</div>` : ''}
      ${vs ? `<div class="game-share-vs">${vs}</div>` : ''}
    </div>`;
  }

  function buildBeatScoreLink(gameId, score, extra) {
    const e = extra || {};
    const nameRaw =
      (typeof userProfile !== 'undefined' && (userProfile?.username || userProfile?.name)) ||
      (typeof currentUser !== 'undefined' && currentUser?.displayName) ||
      t('common.someone');
    const params = new URLSearchParams();
    params.set('name', String(nameRaw).slice(0, 60));
    if (score != null) params.set('score', String(score));
    if (e.cat) params.set('cat', String(e.cat));
    if (e.extra) Object.entries(e.extra).forEach(([k, v]) => params.set(k, String(v)));
    const gid = encodeURIComponent(String(gameId || 'quiz').slice(0, 40));
    const qs = params.toString();
    const base = `${window.location.origin}/challenge/${gid}${qs ? `?${qs}` : ''}`;
    return typeof withReferralParam === 'function' ? withReferralParam(base) : base;
  }

  async function shareGameResult(gameId, stats) {
    const s = stats || {};
    const name = gameDisplayName(gameId);
    const scoreBit = s.scoreLine || (s.score != null ? String(s.score) : '');
    const text =
      s.text ||
      `Chaupaal ${name}${scoreBit ? `: ${scoreBit}` : ''}${s.meta ? ` · ${s.meta}` : ''}. Can you beat me?`;
    const url = s.url || buildBeatScoreLink(gameId, s.score, { cat: s.cat, extra: s.linkExtra });
    const tagged = typeof withReferralParam === 'function' ? withReferralParam(url) : url;
    const payload = { title: `Chaupaal · ${name}`, text, url: tagged };

    // Prefer attaching a canvas PNG when available (no heavy deps)
    let file;
    try {
      if (s.cardEl || s.includeImage !== false) {
        const blob = await exportShareCardImage(gameId, s);
        if (blob && navigator.canShare) {
          file = new File([blob], `chaupaal-${gameId || 'game'}.png`, { type: 'image/png' });
          if (navigator.canShare({ files: [file] })) {
            await navigator.share({ ...payload, files: [file] });
            trackShareEvent('share_method', { surface: gameId || 'unknown', method: 'share-file' });
            return { ok: true, method: 'share-file' };
          }
        }
      }
    } catch (e) {}

    try {
      if (navigator.share) {
        await navigator.share(payload);
        trackShareEvent('share_method', { surface: gameId || 'unknown', method: 'share' });
        return { ok: true, method: 'share' };
      }
    } catch (e) {
      if (e && e.name === 'AbortError') return { ok: false, method: 'abort' };
    }
    try {
      if (navigator.clipboard && navigator.clipboard.writeText) {
        await navigator.clipboard.writeText(`${text}\n${url}`);
        if (typeof showToast === 'function') showToast(t('dangal.link_copied_share_anywhere'));
        trackShareEvent('share_method', { surface: gameId || 'unknown', method: 'clipboard' });
        return { ok: true, method: 'clipboard' };
      }
    } catch (e) {}
    if (typeof showToast === 'function') showToast(url);
    return { ok: false, method: 'fallback' };
  }

  /** Wrap long caption lines for canvas share cards. */
  function wrapCanvasText(ctx, text, x, y, maxWidth, lineHeight, maxLines) {
    const words = String(text || '').split(/\s+/).filter(Boolean);
    let line = '';
    let cy = y;
    let lines = 0;
    const limit = maxLines || 6;
    for (let i = 0; i < words.length; i++) {
      const test = line ? `${line} ${words[i]}` : words[i];
      if (ctx.measureText(test).width > maxWidth && line) {
        ctx.fillText(line, x, cy);
        line = words[i];
        cy += lineHeight;
        lines++;
        if (lines >= limit - 1) {
          const rest = words.slice(i).join(' ');
          const ellipsis = rest.length > 40 ? rest.slice(0, 37) + '…' : rest;
          ctx.fillText(ellipsis, x, cy);
          return cy + lineHeight;
        }
      } else {
        line = test;
      }
    }
    if (line) ctx.fillText(line, x, cy);
    return cy + lineHeight;
  }

  /** Client-side share card → PNG via canvas (no deps). */
  function exportShareCardImage(gameId, stats) {
    return new Promise((resolve) => {
      try {
        const s = stats || {};
        const w = 720;
        const h = 900;
        const canvas = document.createElement('canvas');
        canvas.width = w;
        canvas.height = h;
        const ctx = canvas.getContext('2d');
        if (!ctx) return resolve(null);
        const accent = resolveGameAccent(gameId);
        const isContent = !!(s.caption || gameId === 'duniya' || gameId === 'peepal' || gameId === 'profile');
        // Background
        const grad = ctx.createLinearGradient(0, 0, w, h);
        grad.addColorStop(0, '#1F2542');
        grad.addColorStop(1, '#2A3158');
        ctx.fillStyle = grad;
        ctx.fillRect(0, 0, w, h);
        // Accent bar
        ctx.fillStyle = accent;
        ctx.fillRect(0, 0, w, 10);
        // Brand
        ctx.fillStyle = '#FFC93C';
        ctx.font = '700 22px "Space Grotesk", sans-serif';
        ctx.fillText(t('dangal.chaupaal'), 48, 80);
        ctx.fillStyle = 'rgba(255,255,255,0.7)';
        ctx.font = '600 18px "Space Grotesk", sans-serif';
        ctx.fillText(gameDisplayName(gameId), 48, 112);
        if (isContent) {
          ctx.fillStyle = '#fff';
          ctx.font = '600 36px "Space Grotesk", sans-serif';
          const body = String(s.caption || s.scoreLine || s.text || '').slice(0, 220);
          wrapCanvasText(ctx, body, 48, 220, w - 96, 44, 7);
          if (s.meta) {
            ctx.fillStyle = 'rgba(255,255,255,0.7)';
            ctx.font = '500 22px Inter, sans-serif';
            ctx.fillText(String(s.meta).slice(0, 48), 48, h - 120);
          }
        } else {
          // Score
          ctx.fillStyle = '#fff';
          ctx.font = '700 72px "Space Grotesk", sans-serif';
          const scoreLine = String(s.scoreLine || s.score || '—');
          ctx.fillText(scoreLine.slice(0, 28), 48, 280);
          // Meta
          ctx.fillStyle = 'rgba(255,255,255,0.75)';
          ctx.font = '500 24px Inter, sans-serif';
          if (s.meta) ctx.fillText(String(s.meta).slice(0, 48), 48, 340);
          if (s.vs) {
            ctx.font = '700 26px "Space Grotesk", sans-serif';
            ctx.fillStyle = '#fff';
            ctx.fillText(String(s.vs).slice(0, 40), 48, 400);
          }
        }
        // Footer
        ctx.fillStyle = 'rgba(255,255,255,0.45)';
        ctx.font = '500 18px Inter, sans-serif';
        ctx.fillText(isContent ? t('dangal.on_chaupaal') : t('dangal.play_on_chaupaal'), 48, h - 56);
        canvas.toBlob((blob) => resolve(blob), 'image/png', 0.92);
      } catch (e) {
        resolve(null);
      }
    });
  }

  /* ── Friend picker sheet ── */
  async function loadFriendProfilesForPicker() {
    try {
      if (typeof callRelationship === 'function') {
        const data = await callRelationship('list_friends');
        if (data && Array.isArray(data.profiles)) return data.profiles;
      }
      if (typeof apiFetch === 'function') {
        const envelope = await apiFetch('/api/relationships', {
          method: 'POST',
          needAuth: true,
          body: { action: 'list_friends' },
        });
        const profiles = envelope?.data?.profiles || envelope?.profiles;
        if (Array.isArray(profiles)) return profiles;
      }
    } catch (e) {}
    return [];
  }

  /**
   * Friend picker — replaces prompt() for challenges.
   * @returns {Promise<{name:string,id:string,uid?:string}|null>}
   */
  function openFriendPickerSheet(opts) {
    const o = opts || {};
    return new Promise(async (resolve) => {
      document.getElementById('gameFriendPicker')?.remove();
      const sheet = document.createElement('div');
      sheet.id = 'gameFriendPicker';
      sheet.className = 'game-friend-sheet';
      sheet.innerHTML = `
        <div class="game-friend-backdrop" data-fp-cancel></div>
        <div class="game-friend-card" role="dialog" aria-modal="true" aria-label="${safe(o.title || t('dangal.challenge_a_friend'))}">
          <div class="game-friend-title">${safe(o.title || t('dangal.challenge_a_friend'))}</div>
          <div class="game-friend-sub">${safe(o.subtitle || t('dangal.pick_someone_from_your_friends'))}</div>
          <div data-list-filter-host class="game-friend-filter"></div>
          <div class="game-friend-list" data-fp-list><div class="game-friend-loading">${tHtml('dangal.loading_friends')}</div></div>
          <div class="game-friend-empty" data-list-filter-empty hidden>${tHtml('common.no_matches')}</div>
          <button type="button" class="game-friend-cancel" data-fp-cancel>${tHtml('common.cancel')}</button>
        </div>`;
      const host = document.querySelector('.device') || document.body;
      host.appendChild(sheet);
      const finish = (val) => {
        sheet.remove();
        resolve(val);
      };
      sheet.querySelectorAll('[data-fp-cancel]').forEach((el) =>
        el.addEventListener('click', () => finish(null))
      );

      const listEl = sheet.querySelector('[data-fp-list]');
      const profiles = await loadFriendProfilesForPicker();
      if (typeof enrichUsersWithProfileType === 'function') {
        await enrichUsersWithProfileType(profiles);
      }
      if (!profiles.length) {
        listEl.innerHTML = `<div class="game-friend-empty">${tHtml('dangal.no_friends_yet_add_friends_in')}</div>
          <button type="button" class="game-result-btn game-result-btn--primary" data-fp-manual>${tHtml('dangal.enter_username')}</button>`;
        listEl.querySelector('[data-fp-manual]')?.addEventListener('click', async () => {
          sheet.remove();
          const name =
            typeof promptNameSheet === 'function'
              ? await promptNameSheet({
                  title: t('dangal.friend_username'),
                  placeholder: t('dangal.enter_username'),
                  confirmLabel: t('common.dangal_challenge_start'),
                })
              : null;
          finish(name ? { name, id: 'friend_' + name } : null);
        });
        return;
      }
      let list = profiles;
      if (typeof pinYouInProfiles === 'function') list = pinYouInProfiles(profiles);
      listEl.innerHTML = list
        .map((p, i) => {
          const isYou = !!(p._isYou || (typeof currentUser !== 'undefined' && p.uid === currentUser?.uid));
          const you = typeof selfListLabel === 'function' ? selfListLabel() : null;
          const rawName = isYou
            ? `You${you?.name && you.name !== 'You' ? ` · ${you.name}` : ''}`
            : p.name || p.username || p.displayName || t('common.friend');
          const name =
            isYou
              ? safe(rawName)
              : typeof formatDisplayNameHtml === 'function'
                ? formatDisplayNameHtml(rawName, p)
                : safe(rawName);
          const meta = safe(isYou ? (you?.username ? `@${you.username}` : '') : p.username || p.meta || '');
          const avatar = safe(p.avatar || '👤');
          const filterText = `${rawName} ${p.username || ''} ${p.name || ''}`.toLowerCase();
          return `<button type="button" class="game-friend-row" data-fp-i="${i}" data-filter-text="${safe(filterText)}"${
            isYou ? ' data-is-you="1"' : ''
          }>
            <span class="game-friend-avatar">${avatar}</span>
            <span class="game-friend-info"><span class="game-friend-name">${name}</span>${meta ? `<span class="game-friend-meta">${meta}</span>` : ''}</span>
          </button>`;
        })
        .join('');
      listEl.querySelectorAll('[data-fp-i]').forEach((btn) => {
        btn.addEventListener('click', () => {
          const p = list[Number(btn.dataset.fpI)];
          if (!p) return finish(null);
          finish({
            name: p.name || p.username || (typeof selfDisplayName === 'function' ? selfDisplayName() : t('common.friend')),
            id: p.uid || p.id || 'friend_' + (p.username || p.name),
            uid: p.uid || p.id,
            avatar: p.avatar,
            profileType: p.profileType || null,
          });
        });
      });
      const filterHost = sheet.querySelector('[data-list-filter-host]');
      if (filterHost && typeof mountListFilter === 'function') {
        mountListFilter({
          host: filterHost,
          placeholder: t('dangal.search_friends'),
          surfaceId: 'friend_picker',
          getRows: () => [...listEl.querySelectorAll('.game-friend-row')],
          emptyEl: sheet.querySelector('[data-list-filter-empty]'),
        });
      }
    });
  }

  /* ── First-run coach overlays ── */
  function coachStorageKey(gameId) {
    return `chaupaal_coach_seen_${gameId}`;
  }

  function maybeShowGameCoach(overlay, gameId) {
    if (!overlay || !gameId) return;
    try {
      if (localStorage.getItem(coachStorageKey(gameId))) return;
    } catch (e) {
      return;
    }
    const tips = COACH_TIPS[gameId] || COACH_TIPS[gameId === 'muqabala' ? 'quiz' : ''];
    if (!tips || !tips.length) return;
    if (overlay.querySelector('.game-coach')) return;
    const coach = document.createElement('div');
    coach.className = 'game-coach';
    coach.innerHTML = `
      <div class="game-coach-card">
        <div class="game-coach-brand">${gameBrandMarkHtml(true)}</div>
        <div class="game-coach-title">${safe(gameDisplayName(gameId))}</div>
        <ul class="game-coach-tips">${tips.map((t) => `<li>${safe(t)}</li>`).join('')}</ul>
        <button type="button" class="game-result-btn game-result-btn--primary" data-coach-dismiss>${tHtml('dangal.got_it')}</button>
      </div>`;
    overlay.appendChild(coach);
    const dismiss = () => {
      try {
        localStorage.setItem(coachStorageKey(gameId), '1');
      } catch (e) {}
      coach.remove();
    };
    coach.querySelector('[data-coach-dismiss]')?.addEventListener('click', dismiss);
    coach.addEventListener('click', (e) => {
      if (e.target === coach) dismiss();
    });
  }

  function resetGameCoach(gameId) {
    try {
      localStorage.removeItem(coachStorageKey(gameId));
    } catch (e) {}
  }

  /**
   * Progressive How to — compact control; detail behind tap (not on Manch tile).
   * @param {HTMLElement} overlay
   * @param {{ title?: string, body?: string, tips?: string[] }} opts
   */
  function attachHowTo(overlay, opts) {
    const o = opts || {};
    if (!overlay || !overlay.appendChild) return;
    if (overlay.querySelector('.game-howto-btn')) return;
    const title = o.title || t('dangal.how_to_play');
    let body = o.body || '';
    if (!body && Array.isArray(o.tips) && o.tips.length) body = o.tips.join(' · ');
    if (!body && o.gameId) {
      const tips = COACH_TIPS[o.gameId];
      if (tips && tips.length) body = tips.join(' · ');
      const honesty =
        typeof federationHonestyLine === 'function' ? federationHonestyLine(o.gameId) : '';
      if (honesty) body = honesty + (body ? ' · ' + body : '');
    }
    if (!body) return;
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'game-howto-btn';
    btn.setAttribute('aria-label', t('dangal.how_to_play'));
    btn.textContent = t('dangal.how_to');
    btn.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      if (o.gameId && !o.body && window.DangalRules && window.DangalRules.get(o.gameId)) {
        window.DangalRules.openSheet(o.gameId, { title: title });
        return;
      }
      if (typeof openHalfSheet === 'function') {
        openHalfSheet({
          id: 'gameHowToSheet',
          title: title,
          accent: 'dangal',
          snap: 'mid',
          bodyHtml:
            '<div class="game-howto-body" style="font-size:13px;line-height:1.5;color:var(--ink);padding:4px 2px 12px;">' +
            String(body)
              .split(/\s*·\s*/)
              .map((p) => '<p style="margin:0 0 10px;">' + safe(p) + '</p>')
              .join('') +
            '</div>',
        });
        return;
      }
      if (typeof showToast === 'function') showToast(String(body).slice(0, 160));
    });
    const chrome = overlay.querySelector('.game-chrome-right') || overlay.querySelector('.game-chrome');
    if (chrome) chrome.appendChild(btn);
    else overlay.appendChild(btn);
  }

  /* ── Contextual HUD helper ── */
  function gameHudHtml(items) {
    const list = (items || []).filter(Boolean);
    if (!list.length) return '';
    return `<div class="game-hud" role="status">${list
      .map(
        (it) =>
          `<div class="game-hud-item"><span class="game-hud-label">${safe(it.label)}</span><strong class="game-hud-value">${safe(it.value)}</strong></div>`
      )
      .join('')}</div>`;
  }

  /* ── Duel streaks (1:1 finishes) ── */
  function duelStreakKey(oppId) {
    return `chaupaal_duel_streak_${oppId || 'anon'}`;
  }

  function recordDuelStreak(oppId, won, drew) {
    const key = duelStreakKey(oppId);
    let data = { streak: 0, best: 0 };
    try {
      data = JSON.parse(localStorage.getItem(key) || '{"streak":0,"best":0}') || data;
    } catch (e) {}
    if (drew) {
      /* streak unchanged on draw */
    } else if (won) {
      data.streak = (data.streak || 0) + 1;
      data.best = Math.max(data.best || 0, data.streak);
    } else {
      data.streak = 0;
    }
    try {
      localStorage.setItem(key, JSON.stringify(data));
    } catch (e) {}
    return data;
  }

  function getDuelStreak(oppId) {
    try {
      return JSON.parse(localStorage.getItem(duelStreakKey(oppId)) || '{"streak":0,"best":0}');
    } catch (e) {
      return { streak: 0, best: 0 };
    }
  }

  /* Shabd Five stats, share grid and stats sheet live in shabd-core.js + shabd-ui.js (Dangal P5). */

  /** Upload share-card PNG when Cloudinary is available (for story media). */
  async function uploadShareCardMedia(gameId, stats) {
    try {
      if (typeof uploadToCloudinary !== 'function') return '';
      const blob = await exportShareCardImage(gameId, stats);
      if (!blob) return '';
      const up = await uploadToCloudinary(blob, {
        resourceType: 'image',
        folder: 'story-shares',
        filename: `chaupaal-${gameId || 'share'}.png`,
      });
      return up?.secure_url || up?.url || '';
    } catch (e) {
      return '';
    }
  }

  /* ── Post score to Baithak / Duniya story ── */
  async function postGameScoreStory(gameId, stats) {
    const s = stats || {};
    if (typeof createPlatformStory !== 'function') {
      if (typeof showToast === 'function') showToast(t('dangal.sign_in_to_post_a_story'));
      return null;
    }
    const name = gameDisplayName(gameId);
    const text =
      s.text ||
      `${name}${s.scoreLine ? `: ${s.scoreLine}` : s.score != null ? `: ${s.score}` : ''}${s.meta ? ` · ${s.meta}` : ''}`;
    let media = s.media || '';
    if (!media && s.attachCard !== false) {
      media = await uploadShareCardMedia(gameId, s);
    }
    try {
      const story = await createPlatformStory({
        destination: s.destination || 'baithak',
        visibility: s.visibility || 'friends',
        kind: 'story',
        type: 'score',
        text,
        media: media || undefined,
        mediaType: media ? 'image' : undefined,
        score: s.score != null ? Number(s.score) : undefined,
        total: s.total != null ? Number(s.total) : undefined,
        streak: s.streak != null ? Number(s.streak) : undefined,
        sharedGameId: gameId === 'muqabala' ? 'quiz' : gameId,
      });
      trackShareEvent('share_method', { surface: gameId || 'unknown', method: 'story' });
      if (typeof showToast === 'function') showToast(t('dangal.posted_to_story'));
      return story;
    } catch (e) {
      if (typeof showToast === 'function') showToast(e?.message || t('dangal.could_not_post_story'));
      return null;
    }
  }

  /** Prefill Baithak DM after friend pick (optional path alongside OS share). */
  function sendShareInBaithak(friend, gameId, stats) {
    if (!friend) return;
    const s = stats || {};
    const url = s.url || buildBeatScoreLink(gameId, s.score, { cat: s.cat, extra: s.linkExtra });
    const body =
      s.friendText ||
      s.text ||
      t('dangal.hey_name_check_out_my_chaupaal', { name: friend.name, gameDisplayName: gameDisplayName(gameId) });
    const text = `${body}${url ? `\n${url}` : ''}`;
    const chat = {
      id: friend.uid || friend.id || 'friend_' + (friend.name || 'dm'),
      type: 'dm',
      name: friend.name || t('common.friend'),
      avatar: friend.avatar || '👤',
      preview: text.slice(0, 48),
      time: 'now',
      unread: 0,
      peerUid: friend.uid || friend.id,
    };
    try {
      if (typeof baithakChats !== 'undefined' && Array.isArray(baithakChats)) {
        if (typeof upsertBaithakInboxChat === 'function') upsertBaithakInboxChat(chat);
        else if (!baithakChats.find((c) => c.id === chat.id)) baithakChats.unshift(chat);
      }
    } catch (e) {}
    document.querySelectorAll('.tab-btn').forEach((b) => {
      if (b.dataset.tab === 'baithak') b.click();
    });
    setTimeout(() => {
      if (typeof openChatScreen === 'function') openChatScreen(chat);
      setTimeout(() => {
        const input = document.getElementById('chatMsgInput');
        if (input) {
          input.value = text;
          input.focus();
          try {
            input.dispatchEvent(new Event('input', { bubbles: true }));
          } catch (e) {}
        }
        if (typeof showToast === 'function') showToast(t('dangal.message_ready_tap_send'));
      }, 350);
    }, 250);
    trackShareEvent('share_method', { surface: gameId || 'unknown', method: 'baithak' });
  }

  /** After friend picker: Send in Baithak or OS share. */
  function openFriendShareFollowup(friend, gameId, stats) {
    return new Promise((resolve) => {
      document.getElementById('chaupaalFriendShareFollowup')?.remove();
      const sheet = document.createElement('div');
      sheet.id = 'chaupaalFriendShareFollowup';
      sheet.className = 'game-friend-sheet';
      sheet.innerHTML = `
        <div class="game-friend-backdrop" data-fsf-close></div>
        <div class="game-friend-card" role="dialog" aria-modal="true" aria-label="${tHtml('dangal.share_with_name', { name: friend.name })}">
          <div class="game-friend-title">${tHtml('dangal.share_with_safe', { safe: safe(friend.name) })}</div>
          <div class="game-friend-sub">${tHtml('dangal.send_in_baithak_chat_or_share')}</div>
          <div class="game-result-actions chaupaal-share-actions">
            <button type="button" class="game-result-btn game-result-btn--primary" data-fsf="baithak">${tHtml('dangal.send_in_baithak')}</button>
            <button type="button" class="game-result-btn" data-fsf="os">${tHtml('dangal.share_card_link')}</button>
          </div>
          <button type="button" class="game-friend-cancel" data-fsf-close>${tHtml('common.cancel')}</button>
        </div>`;
      const host = document.querySelector('.device') || document.body;
      host.appendChild(sheet);
      const finish = (val) => {
        sheet.remove();
        resolve(val);
      };
      sheet.querySelectorAll('[data-fsf-close]').forEach((el) => el.addEventListener('click', () => finish(null)));
      sheet.querySelector('[data-fsf="baithak"]')?.addEventListener('click', () => {
        sendShareInBaithak(friend, gameId, stats);
        finish('baithak');
      });
      sheet.querySelector('[data-fsf="os"]')?.addEventListener('click', async () => {
        const personalized = {
          ...stats,
          text:
            stats.friendText ||
            `Hey ${friend.name} — ${stats.text || t('dangal.check_out_my_chaupaal_gamedisplayname_scor', { gameDisplayName: gameDisplayName(gameId) })}`,
        };
        await shareGameResult(gameId, personalized);
        trackShareEvent('share_method', { surface: gameId || 'unknown', method: 'friend_os' });
        finish('os');
      });
    });
  }

  /* ── Wire standard result buttons (again / share / challenge / story) ── */
  function wireGameResultActions(root, handlers) {
    const h = handlers || {};
    if (!root) return;
    root.querySelectorAll('[data-result-action]').forEach((btn) => {
      const id = btn.dataset.resultId;
      const idx = Number(btn.dataset.resultAction);
      btn.addEventListener('click', () => {
        if (id && typeof h[id] === 'function') return h[id](btn);
        if (typeof h[idx] === 'function') return h[idx](btn);
        if (id === 'share' && h.share) return h.share(btn);
        if (id === 'challenge' && h.challenge) return h.challenge(btn);
        if (id === 'again' && h.again) return h.again(btn);
        if (id === 'story' && h.story) return h.story(btn);
        if (id === 'chat' && h.chat) return h.chat(btn);
      });
    });
  }

  /**
   * Instagram-inspired share sheet (step 1):
   * Friends grid · recent chats · search · Copy link · External/More → OS share (step 2).
   * Never jump straight to navigator.share on first tap.
   */
  function openUnifiedShareSheet(opts) {
    const o = opts || {};
    const gameId = o.gameId || 'quiz';
    const stats = Object.assign({}, o.stats || {});
    if (stats.url && typeof withReferralParam === 'function') {
      stats.url = withReferralParam(stats.url);
    }
    document.getElementById('chaupaalShareSheet')?.remove();
    try {
      if (typeof restoreAppShell === 'function') restoreAppShell('share_open');
    } catch (e) {}
    const sheet = document.createElement('div');
    sheet.id = 'chaupaalShareSheet';
    sheet.className = 'game-friend-sheet chaupaal-share-sheet share-sheet-ig';
    sheet.dataset.navManaged = '1';
    const showStory = o.story !== false;
    const title = o.title || (typeof t === 'function' ? t('dangal.share_title', 'Share') : t('dangal.share_title'));
    const ico = (name, size) =>
      typeof iconHtml === 'function' ? iconHtml(name, { size: size || 18 }) : '';
    sheet.innerHTML = `
      <div class="game-friend-backdrop" data-cs-close></div>
      <div class="game-friend-card share-sheet-card" role="dialog" aria-modal="true" aria-label="${safe(title)}">
        <div class="share-sheet-handle" aria-hidden="true"></div>
        <div class="share-sheet-hero">
          <div class="share-sheet-mark" aria-hidden="true">${typeof TabElements !== 'undefined' && TabElements.markHtml ? TabElements.markHtml('chaupaal', 28) : ico('share', 22)}</div>
          <div class="game-friend-title">${safe(title)}</div>
          ${o.subtitle ? `<div class="game-friend-sub">${safe(o.subtitle)}</div>` : `<div class="game-friend-sub">${safe(typeof t === 'function' ? t('dangal.share_sub', 'Send to someone on Chaupaal') : t('dangal.send_to_someone_on_chaupaal'))}</div>`}
        </div>
        <div class="share-section-label">${safe(typeof t === 'function' ? t('dangal.share_friends', 'Friends') : t('dangal.share_friends'))}</div>
        <div class="share-users-row" data-cs-friends><div class="game-friend-loading">…</div></div>
        <div class="share-recents" data-cs-recents></div>
        <div class="share-search-wrap search-field">
          <span class="share-search-ico search-field-icon" aria-hidden="true">${ico('search', 16)}</span>
          <input type="search" class="share-search-input search-field-input search-field-hide-native-clear" data-cs-search placeholder="${safe(typeof t === 'function' ? t('share_search_ph', 'Search people…') : t('common.share_search_ph'))}" autocomplete="off" enterkeyhint="search" data-living-ph="share_search">
          <button type="button" class="search-field-clear share-search-clear" data-cs-clear aria-label="${safe(typeof t === 'function' ? t('search_clear', 'Clear search') : t('common.search_clear'))}" hidden>✕</button>
        </div>
        <div class="share-sheet-actions">
          <button type="button" class="share-action-row" data-cs="copy"><span class="share-action-ico">${ico('link', 18)}</span><span>${safe(typeof t === 'function' ? t('share_copy_link', 'Copy link') : t('common.share_copy_link'))}</span></button>
          ${
            typeof currentUser !== 'undefined' && currentUser && gameId !== 'invite'
              ? `<button type="button" class="share-action-row" data-cs="invite-chaupaal"><span class="share-action-ico">${ico('users', 18)}</span><span>${safe(typeof t === 'function' ? t('contacts_invite_cta', 'Invite to Chaupaal') : t('common.invite_to_chaupaal'))}</span></button>`
              : ''
          }
          ${showStory ? `<button type="button" class="share-action-row" data-cs="story"><span class="share-action-ico">${ico('book-open', 18) || ico('image', 18)}</span><span>${safe(typeof t === 'function' ? t('dangal.share_to_story', 'Post to story') : t('dangal.post_to_story'))}</span></button>` : ''}
          <button type="button" class="share-action-row share-action-row--external" data-cs="external"><span class="share-action-ico">${ico('share', 18)}</span><span>${safe(typeof t === 'function' ? t('share_external_more', 'External / More') : t('common.share_external_more'))}</span></button>
        </div>
        <button type="button" class="game-friend-cancel" data-cs-close>${safe(typeof t === 'function' ? t('cancel', 'Cancel') : t('common.cancel'))}</button>
      </div>`;
    const hostEl = document.querySelector('.device') || document.body;
    hostEl.appendChild(sheet);
    trackShareEvent('share_opened', { surface: gameId, method: 'sheet' });

    const close = () => {
      try {
        sheet.querySelector('[data-cs-search]')?.blur?.();
      } catch (e) {}
      if (typeof removeNavLayer === 'function') removeNavLayer(sheet);
      sheet.remove();
      try {
        if (typeof restoreAppShell === 'function') restoreAppShell('share_close');
      } catch (e) {}
    };
    if (typeof openLayer === 'function') openLayer(sheet, close, { host: hostEl });
    else if (typeof pushNavLayer === 'function') pushNavLayer(sheet, close);
    sheet.querySelectorAll('[data-cs-close]').forEach((el) => el.addEventListener('click', close));
    if (typeof bindLivingPlaceholder === 'function') {
      bindLivingPlaceholder(sheet.querySelector('[data-cs-search]'), 'share_search');
    }
    const shareSearch = sheet.querySelector('[data-cs-search]');
    if (typeof enhanceSearchField === 'function' && shareSearch) {
      enhanceSearchField(shareSearch, {
        clearBtn: sheet.querySelector('[data-cs-clear]'),
        surfaceId: 'share',
        onClear() {},
      });
    }

    async function sendToFriend(friend) {
      if (!friend) return;
      trackShareEvent('share_method', { surface: gameId, method: 'friend' });
      close();
      if (typeof o.onFriend === 'function') {
        await o.onFriend(stats, friend);
        return;
      }
      await openFriendShareFollowup(friend, gameId, stats);
      if (typeof o.onShared === 'function') o.onShared({ method: 'friend' });
    }

    (async () => {
      const listEl = sheet.querySelector('[data-cs-friends]');
      const recentsEl = sheet.querySelector('[data-cs-recents]');
      let profiles = [];
      try {
        profiles = await loadFriendProfilesForPicker();
      } catch (e) {
        profiles = [];
      }
      if (typeof enrichUsersWithProfileType === 'function') {
        try {
          await enrichUsersWithProfileType(profiles);
        } catch (e) {}
      }
      if (!profiles.length) {
        listEl.innerHTML = `<div class="share-empty">${safe(typeof t === 'function' ? t('dangal.share_no_friends', 'No friends yet — search someone or use External / More.') : t('dangal.no_friends_yet_search_someone_or'))}</div>`;
      } else {
        listEl.innerHTML = profiles
          .slice(0, 24)
          .map((p) => {
            const name = safe((p.name || p.username || t('common.friend')).split(' ')[0]);
            const av = typeof renderUserAvatarHtml==='function'
              ? renderUserAvatarHtml(p,{decorative:true})
              :(p.photoURL?`<img src="${safe(p.photoURL)}" alt="">`:`<span class="share-user-chip-fallback">${ico('user', 20)}</span>`);
            return `<button type="button" class="share-user-chip" data-uid="${safe(p.uid || p.id || '')}" data-name="${safe(p.name || p.username || '')}">
              <span class="share-user-chip-avatar">${av}</span>
              <span class="share-user-chip-name">${name}</span>
            </button>`;
          })
          .join('');
        listEl.querySelectorAll('.share-user-chip').forEach((btn) => {
          btn.addEventListener('click', () => {
            const uid = btn.dataset.uid;
            const friend = profiles.find((p) => String(p.uid || p.id) === uid) || {
              uid,
              id: uid,
              name: btn.dataset.name,
            };
            sendToFriend(friend);
          });
        });
      }

      // Recent chats / groups row
      try {
        const chats =
          typeof baithakChats !== 'undefined' && Array.isArray(baithakChats)
            ? baithakChats.filter((c) => c && !c.isSelf && !c.isChaupaal).slice(0, 8)
            : [];
        if (chats.length && recentsEl) {
          recentsEl.innerHTML = `<div class="share-section-label">${safe(typeof t === 'function' ? t('share_recent', 'Recent') : t('common.share_recent'))}</div>
            <div class="share-users-row">${chats
              .map((c) => {
                const label = safe((c.name || c.peerName || t('common.chat')).split(' ')[0]);
                const id = safe(c.firestoreId || c.id || '');
                const avatarIco = c.type === 'group' ? ico('users', 18) : ico('message-circle', 18);
                return `<button type="button" class="share-user-chip" data-chat-id="${id}" data-name="${safe(c.name || '')}">
                  <span class="share-user-chip-avatar share-user-chip-avatar--glyph">${avatarIco}</span>
                  <span class="share-user-chip-name">${label}</span>
                </button>`;
              })
              .join('')}</div>`;
          recentsEl.querySelectorAll('[data-chat-id]').forEach((btn) => {
            btn.addEventListener('click', async () => {
              const chat = chats.find((c) => String(c.firestoreId || c.id) === btn.dataset.chatId);
              if (!chat) return;
              trackShareEvent('share_method', { surface: gameId, method: 'recent_chat' });
              close();
              if (typeof sendShareInBaithak === 'function') {
                await sendShareInBaithak(chat, gameId, stats);
              } else if (typeof openChatScreen === 'function') {
                openChatScreen(chat);
              }
              if (typeof o.onShared === 'function') o.onShared({ method: 'recent_chat' });
            });
          });
        }
      } catch (e) {}
    })();

    sheet.querySelector('[data-cs-search]')?.addEventListener('keydown', (e) => {
      if (e.key !== 'Enter') return;
      e.preventDefault();
      const q = e.target.value.trim();
      if (!q) return;
      close();
      if (typeof openUniversalSearch === 'function') {
        openUniversalSearch({ initialQuery: q.replace(/^@/, ''), types: ['users'] });
      }
    });

    sheet.querySelector('[data-cs="copy"]')?.addEventListener('click', async () => {
      let url = stats.url || buildBeatScoreLink(gameId, stats.score, { cat: stats.cat, extra: stats.linkExtra });
      if (typeof withReferralParam === 'function') url = withReferralParam(url);
      const text = `${stats.text || `Chaupaal ${gameDisplayName(gameId)}`}\n${url}`;
      try {
        if (navigator.clipboard && navigator.clipboard.writeText) {
          await navigator.clipboard.writeText(text);
          if (typeof showToast === 'function') showToast(typeof t === 'function' ? t('dangal.share_copied', 'Link copied') : t('common.link_copied'));
        } else if (typeof showToast === 'function') showToast(url);
      } catch (e) {
        if (typeof showToast === 'function') showToast(url);
      }
      trackShareEvent('share_method', { surface: gameId, method: 'copy' });
      if (typeof o.onShared === 'function') o.onShared({ method: 'copy' });
      close();
    });

    sheet.querySelector('[data-cs="invite-chaupaal"]')?.addEventListener('click', () => {
      close();
      trackShareEvent('share_method', { surface: gameId, method: 'invite_chaupaal' });
      if (typeof openInviteToChaupaalShare === 'function') openInviteToChaupaalShare();
      else if (typeof ChaupaalReferrals?.openInviteToChaupaalShare === 'function') {
        ChaupaalReferrals.openInviteToChaupaalShare();
      }
    });

    sheet.querySelector('[data-cs="story"]')?.addEventListener('click', async () => {
      close();
      await postGameScoreStory(gameId, stats);
      if (typeof o.onShared === 'function') o.onShared({ method: 'story' });
    });

    // Step 2 — OS share only from External / More
    sheet.querySelector('[data-cs="external"]')?.addEventListener('click', async () => {
      trackShareEvent('share_method', { surface: gameId, method: 'external' });
      close();
      const result = await shareGameResult(gameId, stats);
      if (typeof o.onShared === 'function') o.onShared(result || { method: 'external' });
    });

    return sheet;
  }

  /** Build share-stats payload helpers can reuse (Akhbaar, wraps, etc.). */
  function buildShareStats(partial) {
    return Object.assign(
      {
        scoreLine: '',
        meta: '',
        text: '',
      },
      partial || {}
    );
  }

  /* ── Dangal progress · stats · soft weekly missions (local, per active profile) ── */
  const SCORE_FOCUS_GAMES = {
    tiptap: true,
    ankjod: true,
    wordguess: true,
    streetcricket: true,
    badminton: true,
    carrom: true,
    brickbreaker: true,
  };
  const HIGHER_BETTER_SCORE = {
    tiptap: true,
    quiz: true,
    streetcricket: true,
    badminton: true,
    carrom: true,
    brickbreaker: true,
  };
  const LOWER_BETTER_SCORE = { wordguess: true, ankjod: true };

  function normalizeDangalGameId(gameId) {
    const id = String(gameId || '').toLowerCase();
    if (id === 'muqabala' || id === 'quiz' || id === 'quizroom') return 'quiz';
    if (id === 'kakuro') return 'ankjod';
    if (id === 'tictactoe') return 'ttt';
    return id;
  }

  function dangalProgressProfileId() {
    try {
      if (typeof window !== 'undefined' && window.activeProfileId) return String(window.activeProfileId);
      if (typeof userProfile !== 'undefined' && userProfile?.activeProfileId) return String(userProfile.activeProfileId);
    } catch (e) {}
    return 'primary';
  }

  function dangalProgressStorageKey() {
    return `chaupaal_dangal_progress_${dangalProgressProfileId()}`;
  }

  function dangalCalendarDay() {
    try {
      return new Intl.DateTimeFormat('en-CA', {
        timeZone: 'Asia/Kolkata',
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
      }).format(new Date());
    } catch (e) {
      return new Date().toISOString().slice(0, 10);
    }
  }

  function dangalWeekKey(dayStr) {
    const d = new Date((dayStr || dangalCalendarDay()) + 'T12:00:00');
    const day = (d.getDay() + 6) % 7; // Mon=0
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

  function emptyDangalProgress() {
    return {
      v: 1,
      games: {},
      softDayStreak: 0,
      lastPlayDay: '',
      week: emptyDangalWeek(),
      lastWeek: null,
      panelCollapsed: false,
      hideMissionsUntil: '',
    };
  }

  function getDangalProgress() {
    let data = emptyDangalProgress();
    try {
      const raw = localStorage.getItem(dangalProgressStorageKey());
      if (raw) data = Object.assign(emptyDangalProgress(), JSON.parse(raw) || {});
    } catch (e) {}
    const weekKey = dangalWeekKey();
    if (!data.week || data.week.key !== weekKey) {
      if (data.week && data.week.key && data.week.key !== weekKey) {
        data.lastWeek = {
          key: data.week.key,
          plays: data.week.plays || 0,
          wins: data.week.wins || 0,
        };
      }
      data.week = emptyDangalWeek(weekKey);
      saveDangalProgress(data);
    }
    if (!data.games || typeof data.games !== 'object') data.games = {};
    return data;
  }

  function saveDangalProgress(data) {
    try {
      localStorage.setItem(dangalProgressStorageKey(), JSON.stringify(data));
    } catch (e) {}
    return data;
  }

  function getDangalGameStats(gameId) {
    const id = normalizeDangalGameId(gameId);
    const progress = getDangalProgress();
    return Object.assign(emptyDangalGameStats(), progress.games[id] || {});
  }

  /**
   * Record a finished session. Soft streaks + weekly mission progress.
   * @param {string} gameId
   * @param {{ won?: boolean, drew?: boolean, score?: number, scoreOnly?: boolean, gotd?: boolean }} [opts]
   */
  function recordDangalSession(gameId, opts) {
    const id = normalizeDangalGameId(gameId);
    if (!id) return getDangalProgress();
    const o = opts || {};
    const data = getDangalProgress();
    const g = Object.assign(emptyDangalGameStats(), data.games[id] || {});
    g.played += 1;
    g.lastAt = Date.now();

    // Score-only runs (e.g. Rush) skip W/L unless caller passes an explicit clear (won===true)
    const scoreOnly =
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
      const next = Number(o.score);
      const prev = g.bestScore;
      let better = prev == null;
      if (!better) {
        if (LOWER_BETTER_SCORE[id]) better = next < prev;
        else better = next > prev;
      }
      if (better) g.bestScore = next;
    }
    data.games[id] = g;

    const today = dangalCalendarDay();
    if (data.lastPlayDay !== today) {
      const y = new Date(today + 'T12:00:00');
      y.setDate(y.getDate() - 1);
      data.softDayStreak =
        data.lastPlayDay === y.toISOString().slice(0, 10) ? (data.softDayStreak || 0) + 1 : 1;
      data.lastPlayDay = today;
    }

    const week = data.week || emptyDangalWeek();
    week.plays += 1;
    if (!Array.isArray(week.unique)) week.unique = [];
    if (!week.unique.includes(id)) week.unique.push(id);
    if (o.won === true) week.wins += 1;
    if (o.gotd) week.gotd = true;
    if (id === 'wordguess') week.shabd = true;
    data.week = week;

    saveDangalProgress(data);
    maybeCelebrateMissions(data);
    // P16: one short post-game tip from the match stats (never mid-game; off via Rules → Game settings).
    try {
      if (o.tip !== false && window.DangalAssistUI && typeof DangalAssistUI.showPostGameTip === 'function') {
        DangalAssistUI.showPostGameTip(id, Object.assign({ won: o.won === true, draw: !!o.drew }, o.tipStats || {}), { live: !!o.live, rated: !!o.rated, stake: o.stake, midGame: !!o.midGame });
      }
    } catch (e) {}
    try {
      if (typeof tickKhelDailies === 'function') tickKhelDailies(id, { won: o.won === true, drew: !!o.drew });
    } catch (e) {}
    // P4 spine — promote local session into consented event log (cross-device learnable)
    try {
      if (typeof trackSignal === 'function') {
        const result = o.drew ? 'draw' : o.won === true ? 'win' : o.won === false ? 'loss' : 'complete';
        trackSignal('game_end', {
          surface: 'dangal',
          objType: 'game',
          objId: id,
          dur: Number.isFinite(o.durationMs) ? o.durationMs : null,
          ctx: {
            gameId: id,
            mode: o.mode || (o.gotd ? 'gotd' : 'solo'),
            result,
            rated: !!o.rated,
            eloDelta: Number.isFinite(o.eloDelta) ? o.eloDelta : null,
            genre: o.genre || null,
          },
        });
      }
      if (typeof trackGameEvent === 'function') {
        trackGameEvent('game_completed', {
          game_type: id,
          mode: o.mode || 'solo',
          result: o.drew ? 'draw' : o.won === true ? 'win' : o.won === false ? 'loss' : 'complete',
          time_spent_ms: o.durationMs,
        });
      }
      try {
        if (window.ChaupaalPwa && typeof window.ChaupaalPwa.noteMeaningfulMoment === 'function') {
          window.ChaupaalPwa.noteMeaningfulMoment('game');
        }
      } catch (e) {}
    } catch (e) {}
    return data;
  }

  function getDangalMissions(progress) {
    const p = progress || getDangalProgress();
    const week = p.week || emptyDangalWeek();
    const uniqueCount = Array.isArray(week.unique) ? week.unique.length : 0;
    return [
      {
        id: 'play3',
        label: t('dangal.play_3_sessions'),
        hint: t('dangal.any_games_count'),
        progress: Math.min(week.plays || 0, 3),
        target: 3,
      },
      {
        id: 'variety',
        label: t('dangal.try_2_different_games'),
        hint: t('dangal.mix_solos_duels'),
        progress: Math.min(uniqueCount, 2),
        target: 2,
      },
      {
        id: 'win1',
        label: t('dangal.win_one_match'),
        hint: t('dangal.optional_no_pressure'),
        progress: Math.min(week.wins || 0, 1),
        target: 1,
      },
      {
        id: 'shabd',
        label: t('dangal.finish_today_s_shabd'),
        hint: t('dangal.daily_5_letter_word'),
        progress: week.shabd ? 1 : 0,
        target: 1,
        gameId: 'wordguess',
      },
      {
        id: 'gotd',
        label: t('dangal.play_game_of_the_day'),
        hint: t('dangal.featured_on_the_hub'),
        progress: week.gotd ? 1 : 0,
        target: 1,
      },
    ];
  }

  function maybeCelebrateMissions(progress) {
    const p = progress || getDangalProgress();
    if (!p.week.celebrated) p.week.celebrated = {};
    const newly = [];
    getDangalMissions(p).forEach((m) => {
      if (m.progress >= m.target && !p.week.celebrated[m.id]) {
        p.week.celebrated[m.id] = true;
        newly.push(m);
      }
    });
    if (newly.length) {
      saveDangalProgress(p);
      const first = newly[0];
      try {
        if (typeof showToast === 'function') {
          showToast(newly.length > 1 ? t('dangal.weekly_goals_newlycount_done', { newlyCount: newly.length }) : t('dangal.goal_done_label', { label: first.label }));
        }
      } catch (e) {}
    }
  }

  function getDangalHubSummary() {
    const p = getDangalProgress();
    const missions = getDangalMissions(p);
    const done = missions.filter((m) => m.progress >= m.target).length;
    const matches = Object.keys(p.games || {})
      .filter((id) => !(typeof isRetiredGameId === 'function' && isRetiredGameId(id)))
      .map((id) => p.games[id] || {})
      .reduce(
      (acc, g) => {
        acc.played += g.played || 0;
        acc.wins += g.wins || 0;
        return acc;
      },
      { played: 0, wins: 0 }
    );
    return {
      softDayStreak: p.softDayStreak || 0,
      weekPlays: p.week?.plays || 0,
      weekWins: p.week?.wins || 0,
      missionsDone: done,
      missionsTotal: missions.length,
      totalPlayed: matches.played,
      totalWins: matches.wins,
      panelCollapsed: !!p.panelCollapsed,
      hideMissions: p.hideMissionsUntil === dangalCalendarDay(),
      missions,
    };
  }

  function gamePersonalStatsHtml(gameId) {
    const id = normalizeDangalGameId(gameId);
    const g = getDangalGameStats(id);
    if (!g.played) return '';
    const decided = (g.wins || 0) + (g.losses || 0);
    const rate = decided > 0 ? Math.round(((g.wins || 0) / decided) * 100) : null;
    const bits = [`${g.played} play${g.played === 1 ? '' : 's'}`];
    if (rate != null && decided >= 2) bits.push(`${rate}% wins`);
    if (g.streak > 1) bits.push(`streak ${g.streak}`);
    else if (g.bestStreak > 1) bits.push(t('common.best_streak_beststreak', { bestStreak: g.bestStreak }));
    if (g.bestScore != null) {
      const unit = (PB_KEYS[id] && PB_KEYS[id].label) || '';
      bits.push(`best ${g.bestScore}${unit}`);
    }
    return `<div class="game-result-stats" aria-label="${tHtml('dangal.your_stats')}">${bits
      .map((b) => `<span class="game-result-stat">${safe(b)}</span>`)
      .join('')}</div>`;
  }

  function dangalMissionNudgeHtml(gameId) {
    const summary = getDangalHubSummary();
    if (summary.hideMissions) return '';
    const open = summary.missions.find((m) => m.progress < m.target);
    if (!open) {
      return `<p class="game-result-mission is-done">${tHtml('dangal.weekly_goals_complete_nice_and_calm')}</p>`;
    }
    return `<p class="game-result-mission">${safe(open.label)} · ${open.progress}/${open.target}</p>`;
  }

  function dangalHubProgressHtml() {
    const summary = getDangalHubSummary();
    const streakLabel = summary.softDayStreak > 1 ? t('dangal.play_streak_days', { count: summary.softDayStreak }) : summary.softDayStreak === 1 ? t('common.played_today') : t('dangal.start_a_soft_streak');
    const missionsHidden = summary.hideMissions;
    const collapsed = summary.panelCollapsed;
    const missionRows = missionsHidden
      ? ''
      : summary.missions
          .map((m) => {
            const pct = Math.round((m.progress / m.target) * 100);
            const done = m.progress >= m.target;
            return `<button type="button" class="dangal-mission${done ? ' is-done' : ''}" data-mission="${safe(m.id)}"${m.gameId ? ` data-mission-game="${safe(m.gameId)}"` : ''}>
              <div class="dangal-mission-top"><span class="dangal-mission-label">${safe(m.label)}</span><span class="dangal-mission-count">${m.progress}/${m.target}</span></div>
              <div class="dangal-mission-track"><div class="dangal-mission-fill" style="width:${pct}%"></div></div>
              <div class="dangal-mission-hint">${safe(m.hint)}</div>
            </button>`;
          })
          .join('');

    return `<div class="dangal-progress" id="dangalProgressPanel">
      <div class="dangal-progress-summary">
        <div class="dangal-progress-pill"><span class="dangal-progress-k">${tHtml('common.shortcut_akhbaar_streak')}</span><strong>${safe(streakLabel)}</strong></div>
        <div class="dangal-progress-pill"><span class="dangal-progress-k">${tHtml('common.this_week')}</span><strong>${tHtml('dangal.plays_count', { count: summary.weekPlays })}</strong></div>
        <div class="dangal-progress-pill"><span class="dangal-progress-k">${tHtml('dangal.goals')}</span><strong>${summary.missionsDone}/${summary.missionsTotal}</strong></div>
      </div>
      <div class="dangal-progress-toolbar">
        <button type="button" class="dangal-progress-toggle" id="dangalMissionsToggle" aria-expanded="${collapsed ? 'false' : 'true'}">${collapsed ? tHtml('dangal.show_weekly_goals') : tHtml('dangal.hide_weekly_goals')}</button>
        ${missionsHidden ? '' : `<button type="button" class="dangal-progress-snooze" id="dangalMissionsSnooze" title="${tHtml('dangal.hide_goals_for_today')}">${tHtml('common.not_now')}</button>`}
      </div>
      <div class="dangal-missions${collapsed || missionsHidden ? ' is-collapsed' : ''}" id="dangalMissionsList">
        ${missionsHidden ? `<div class="dangal-missions-snoozed">${tHtml('dangal.goals_tucked_away_for_today_they')}</div>` : missionRows}
      </div>
    </div>`;
  }

  function wireDangalProgressPanel(root) {
    const host = root || document;
    const panel = host.querySelector('#dangalProgressPanel');
    if (!panel || panel.dataset.wired) return;
    panel.dataset.wired = '1';
    panel.querySelector('#dangalMissionsToggle')?.addEventListener('click', () => {
      const data = getDangalProgress();
      data.panelCollapsed = !data.panelCollapsed;
      saveDangalProgress(data);
      if (typeof renderDangalGamesGrid === 'function') renderDangalGamesGrid();
    });
    panel.querySelector('#dangalMissionsSnooze')?.addEventListener('click', () => {
      const data = getDangalProgress();
      data.hideMissionsUntil = dangalCalendarDay();
      data.panelCollapsed = true;
      saveDangalProgress(data);
      if (typeof showToast === 'function') showToast(t('dangal.goals_hidden_for_today'));
      if (typeof renderDangalGamesGrid === 'function') renderDangalGamesGrid();
    });
    panel.querySelectorAll('[data-mission-game]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const gid = btn.dataset.missionGame;
        if (gid && typeof handleDangalGameTap === 'function') handleDangalGameTap(gid);
      });
    });
  }

  function tileProgressPillHtml(gameId) {
    const g = getDangalGameStats(gameId);
    if (!g.played) return '<div class="dangal-game-progress-pill dangal-game-progress-pill--new">' + tHtml('dangal.try_it') + '</div>';
    const decided = (g.wins || 0) + (g.losses || 0);
    if (g.streak > 1) return `<div class="dangal-game-progress-pill">${tHtml('dangal.streak_streak', { streak: g.streak })}</div>`;
    if (decided >= 3) {
      const rate = Math.round(((g.wins || 0) / decided) * 100);
      return `<div class="dangal-game-progress-pill">${tHtml('dangal.rate_wins_played', { rate, played: g.played })}</div>`;
    }
    if (g.bestScore != null) {
      const unit = (PB_KEYS[normalizeDangalGameId(gameId)] && PB_KEYS[normalizeDangalGameId(gameId)].label) || '';
      return `<div class="dangal-game-progress-pill">${tHtml('dangal.best_bestscore_unit', { bestScore: g.bestScore, unit })}</div>`;
    }
    return `<div class="dangal-game-progress-pill">${tHtml('dangal.plays_count', { count: g.played })}</div>`;
  }

  /* ── Last played / continue helpers ── */
  function markGamePlayed(gameId) {
    if (!gameId) return;
    try {
      localStorage.setItem('chaupaal_last_game', JSON.stringify({ id: gameId, at: Date.now() }));
    } catch (e) {}
    // Mark GOTD mission when the featured game is opened
    try {
      const gotdId =
        (typeof window !== 'undefined' && window.__dangalGotdId) ||
        (typeof _dangalGotdCache !== 'undefined' && _dangalGotdCache?.gameId);
      if (gotdId && normalizeDangalGameId(gotdId) === normalizeDangalGameId(gameId)) {
        const data = getDangalProgress();
        if (data.week && !data.week.gotd) {
          data.week.gotd = true;
          saveDangalProgress(data);
          maybeCelebrateMissions(data);
        }
      }
    } catch (e) {}
    // Server play counter (Game of the Day popularity) — best-effort; apiFetch waits for auth.
    if (typeof apiFetch === 'function') {
      apiFetch('/api/media-config', {
        method: 'POST',
        needAuth: true,
        body: { action: 'record_game_play', gameId },
      }).catch(() => {});
    }
    try {
      if (typeof trackSignal === 'function') {
        trackSignal('game_start', { surface: 'dangal', objType: 'game', objId: normalizeDangalGameId(gameId) || gameId });
      }
      if (typeof trackGameEvent === 'function') {
        trackGameEvent('game_started', { game_type: gameId });
      }
    } catch (e) {}
  }

  function getLastPlayedGame() {
    try {
      return JSON.parse(localStorage.getItem('chaupaal_last_game') || 'null');
    } catch (e) {
      return null;
    }
  }

  /* ── Daily spotlight rotation ── */
  function getDailySpotlightGameId(ids) {
    const list = ids && ids.length ? ids : ['quiz', 'wordguess', 'brickbreaker', 'chess', 'tiptap', 'ankjod'];
    const seed = new Date().toISOString().split('T')[0];
    let h = 0;
    for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) >>> 0;
    return list[h % list.length];
  }

  /* ── Weekly friends board from readable gameRatings ── */
  async function buildWeeklyFriendsBoard(ratingKey) {
    const key = ratingKey || 'chess';
    const rows = [];
    // Self
    try {
      const mine =
        (typeof getGameRating === 'function' ? getGameRating(key) : null) ||
        (typeof userProfile !== 'undefined' && userProfile?.gameRatings?.[key]) ||
        1200;
      rows.push({
        name: (typeof userProfile !== 'undefined' && userProfile?.name?.split(' ')[0]) || 'You',
        rating: mine,
        you: true,
        profileType:
          typeof ownProfileType === 'function'
            ? ownProfileType()
            : typeof getProfileType === 'function'
              ? getProfileType()
              : userProfile?.profileType || 'personal',
        uid: typeof currentUser !== 'undefined' ? currentUser?.uid : null,
      });
    } catch (e) {}
    // Friends — only if profile docs expose gameRatings (no new endpoints)
    try {
      const profiles = await loadFriendProfilesForPicker();
      for (const p of profiles.slice(0, 12)) {
        // gameRatings stay private on users/ — only use ratings already on the friend picker blob
        const rating = p.gameRatings?.[key];
        if (rating != null) {
          rows.push({
            name: (p.name || t('common.friend')).split(' ')[0],
            rating: Number(rating),
            you: false,
            profileType: p.profileType || null,
            uid: p.uid || p.id || null,
          });
        }
      }
    } catch (e) {}
    rows.sort((a, b) => b.rating - a.rating);
    if (typeof enrichUsersWithProfileType === 'function') {
      await enrichUsersWithProfileType(rows);
    }
    return rows.slice(0, 8);
  }

  function weeklyFriendsBoardHtml(rows) {
    if (!rows || !rows.length) return '';
    const mine = rows.find((r) => r.you) || null;
    const shareBtn = mine
      ? `<button type="button" class="btn btn--sm dangal-share-rank-btn" data-share-rank="1" data-rank="${
          rows.indexOf(mine) + 1
        }" data-score="${safe(mine.rating)}" style="margin-top:8px;width:100%;">${tHtml('dangal.share_my_rank')}</button>`
      : '';
    return `<div class="dangal-friends-board">
      <div class="dangal-section-label">${tHtml('dangal.friends_this_week')}</div>
      ${rows
        .map(
          (r, i) =>
            `<div class="dangal-friends-row${r.you ? ' is-you' : ''}"><span class="dangal-friends-rank">${i + 1}</span><span class="dangal-friends-name">${typeof formatDisplayNameHtml==='function'?formatDisplayNameHtml(r.name,r):safe(r.name)}</span><span class="dangal-friends-rating">${safe(r.rating)}</span></div>`
        )
        .join('')}
      ${shareBtn}
    </div>`;
  }

  function openLeaderboardRankShare(opts) {
    const o = opts || {};
    const rank = o.rank != null ? Number(o.rank) : null;
    const score = o.score != null ? o.score : '';
    const uname =
      (typeof userProfile !== 'undefined' && userProfile?.username) ||
      (typeof currentUser !== 'undefined' && currentUser?.uid) ||
      '';
    const profileUrl =
      uname && typeof shareUrl === 'function'
        ? shareUrl('profile', String(uname).replace(/^@/, ''))
        : location.origin + '/';
    const rankLine = rank != null ? `#${rank} this week` : t('dangal.on_the_board_this_week');
    const scoreLine = score !== '' && score != null ? String(score) : rankLine;
    const stats =
      typeof buildShareStats === 'function'
        ? buildShareStats({
            scoreLine,
            meta: t('dangal.dangal_weekly_virtual_chips_only'),
            caption: rankLine,
            text: t('dangal.i_m_rankline_on_chaupaal_dangal_2', { rankLine, value: score !== '' ? ` (${score})` : '' }),
            url: profileUrl,
          })
        : {
            scoreLine,
            meta: t('dangal.dangal_weekly'),
            text: t('dangal.i_m_rankline_on_chaupaal_dangal', { rankLine }),
            url: profileUrl,
          };
    if (typeof trackShareEvent === 'function') {
      trackShareEvent('share_opened', { surface: 'dangal_rank', method: 'sheet' });
    }
    if (typeof openUnifiedShareSheet === 'function') {
      openUnifiedShareSheet({
        gameId: 'dangal',
        title: t('dangal.share_my_rank'),
        subtitle: rankLine,
        stats,
      });
    }
  }

  document.addEventListener('click', (e) => {
    const btn = e.target?.closest?.('[data-share-rank]');
    if (!btn) return;
    e.preventDefault();
    openLeaderboardRankShare({
      rank: btn.dataset.rank,
      score: btn.dataset.score,
    });
  });

  /* ── Consume async beat-my-score challenge from URL ── */
  function consumeBeatScoreChallenge() {
    try {
      const pathMatch = String(location.pathname || '').match(/^\/challenge\/([^/?#]+)\/?$/i);
      const params = new URLSearchParams(window.location.search);
      const gameFromPath = pathMatch ? decodeURIComponent(pathMatch[1]) : null;
      const challenger = params.get('name') || params.get('challenge');
      if (!challenger && !gameFromPath) return null;
      const game = gameFromPath || params.get('game') || 'quiz';
      if (typeof isRetiredGameId === 'function' && isRetiredGameId(game)) return null;
      const score = params.get('score');
      const cat = params.get('cat') || 'GK';
      const extra = {};
      ['board', 'lv', 'mode', 'diff', 'day', 'seed', 'n', 'label'].forEach((k) => {
        const v = params.get(k);
        if (v != null && v !== '') extra[k] = String(v).slice(0, 60);
      });
      return {
        challenger: challenger ? decodeURIComponent(challenger) : 'Someone',
        game,
        score: score != null ? Number(score) : null,
        cat,
        params: extra,
      };
    } catch (e) {
      return null;
    }
  }

  /** prefers-reduced-motion or Quiet mode — reduce particles / screen shake in canvas games. */
  function shouldReduceGameMotion() {
    try {
      if (typeof quietMode !== 'undefined' && quietMode) return true;
      if (localStorage.getItem('dangal_reduce_motion') === '1') return true;
      if (window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches) return true;
    } catch (e) {}
    return false;
  }

  /**
   * Leave confirm — Promise<boolean>. Quiet / reduced-motion friendly sheet.
   */
  function confirmLeaveGame(opts) {
    const o = opts || {};
    return new Promise((resolve) => {
      const prev = document.getElementById('gameLeaveConfirm');
      if (prev) {
        if (typeof prev.__leaveDone === 'function') prev.__leaveDone(false);
        else prev.remove();
      }
      const sheet = document.createElement('div');
      sheet.id = 'gameLeaveConfirm';
      sheet.className = 'game-pause-scrim';
      sheet.setAttribute('role', 'dialog');
      sheet.innerHTML = `<div class="game-pause-card">
        <h3 class="game-pause-title">${o.title || tHtml('dangal.leave_game')}</h3>
        <p style="font-size:13px;color:rgba(255,255,255,.7);margin:0 0 14px;line-height:1.4;">${
          o.body || tHtml('dangal.progress_on_this_run_will_be')
        }</p>
        <button type="button" class="btn btn--primary game-tap-target" data-leave-stay data-overlay-dismiss>${tHtml('dangal.keep_playing')}</button>
        <button type="button" class="btn btn--secondary game-tap-target" data-leave-go>${tHtml('dangal.leave')}</button>
      </div>`;
      const host = document.querySelector('.device') || document.body;
      const owner = Array.from(document.querySelectorAll('.game-overlay')).pop() || null;
      // Inside the game: on the shell it would sit under the nav-stack's z-indexed overlays.
      if (owner) sheet.style.zIndex = '1000';
      (owner || host).appendChild(sheet);
      let settled = false;
      let watch = null;
      const done = (v) => {
        if (settled) return;
        settled = true;
        if (watch) watch.disconnect();
        sheet.remove();
        resolve(!!v);
      };
      sheet.__leaveDone = done;
      // The game closed under the prompt — never leave its blurred scrim stranded on the app.
      if (owner && typeof MutationObserver === 'function') {
        watch = new MutationObserver(() => {
          if (!owner.isConnected) done(false);
        });
        watch.observe(host, { childList: true });
      }
      sheet.querySelector('[data-leave-stay]')?.addEventListener('click', () => done(false));
      sheet.querySelector('[data-leave-go]')?.addEventListener('click', () => done(true));
    });
  }

  /**
   * Pause scrim with Resume / Quit, auto-pause on visibility hidden.
   * @param {{ host?: Element, overlay?: Element, pauseBtnId?: string, onPause?: Function, onResume?: Function, onQuit?: Function }} opts
   */
  function createGamePauseController(opts) {
    const o = opts || {};
    const host = o.host || o.overlay;
    if (!host) return { pause: () => {}, resume: () => {}, toggle: () => {}, isPaused: () => false, destroy: () => {} };
    const onPause = typeof o.onPause === 'function' ? o.onPause : () => {};
    const onResume = typeof o.onResume === 'function' ? o.onResume : () => {};
    const onQuit = typeof o.onQuit === 'function' ? o.onQuit : typeof o.onClose === 'function' ? o.onClose : () => {};
    let paused = false;
    let scrim = null;
    let pauseBtn = null;
    let pauseClick = null;

    function hideScrim() {
      if (scrim) {
        scrim.remove();
        scrim = null;
      }
    }

    function showScrim() {
      if (scrim) return;
      scrim = document.createElement('div');
      scrim.className = 'game-pause-scrim';
      scrim.setAttribute('role', 'dialog');
      scrim.setAttribute('aria-label', t('dangal.game_paused'));
      scrim.innerHTML = `<div class="game-pause-card">
        <h3 class="game-pause-title">${tHtml('dangal.paused')}</h3>
        <button type="button" class="btn btn--primary game-tap-target" data-gp-resume>${tHtml('common.shortcut_dangal_resume')}</button>
        <button type="button" class="btn btn--secondary game-tap-target" data-gp-quit>${tHtml('dangal.quit')}</button>
      </div>`;
      host.appendChild(scrim);
      scrim.querySelector('[data-gp-resume]')?.addEventListener('click', () => resume());
      scrim.querySelector('[data-gp-quit]')?.addEventListener('click', () => {
        destroy();
        onQuit();
      });
    }

    function pause() {
      if (paused) return;
      paused = true;
      showScrim();
      onPause();
    }

    function resume() {
      if (!paused) return;
      paused = false;
      hideScrim();
      onResume();
    }

    function toggle() {
      if (paused) resume();
      else pause();
    }

    const visHandler = () => {
      if (document.hidden && !paused) pause();
    };
    document.addEventListener('visibilitychange', visHandler);

    if (o.pauseBtnId) {
      pauseBtn = document.getElementById(o.pauseBtnId);
      if (pauseBtn) {
        pauseClick = () => toggle();
        pauseBtn.addEventListener('click', pauseClick);
      }
    }

    function destroy() {
      document.removeEventListener('visibilitychange', visHandler);
      if (pauseBtn && pauseClick) pauseBtn.removeEventListener('click', pauseClick);
      hideScrim();
      paused = false;
    }

    return { pause, resume, toggle, isPaused: () => paused, destroy };
  }

  /** Arrow / A-D paddle helper — returns unbind(). */
  function bindGameKeyboardPaddle(keys, onMove) {
    const left = (keys && keys.left) || ['ArrowLeft', 'a', 'A']; // i18n-ignore (codes / names)
    const right = (keys && keys.right) || ['ArrowRight', 'd', 'D']; // i18n-ignore (codes / names)
    const move = typeof onMove === 'function' ? onMove : () => {};
    const handler = (e) => {
      if (left.includes(e.key)) {
        e.preventDefault();
        move(-1);
      } else if (right.includes(e.key)) {
        e.preventDefault();
        move(1);
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }

  window.GameFeedback = gameFeedback;
  window.gameFeedback = gameFeedback;
  window.gameTurnBannerHtml = gameTurnBannerHtml;
  window.practiceOppLabel = practiceOppLabel;
  window.practiceTurnStatus = practiceTurnStatus;
  window.schedulePracticeAiThink = schedulePracticeAiThink;
  window.clearPracticeAiThink = clearPracticeAiThink;
  window.gameChromeHtml = gameChromeHtml;
  window.gameScoreHtml = gameScoreHtml;
  window.gameResultHtml = gameResultHtml;
  window.defaultResultActions = defaultResultActions;
  window.setGameTurnBanner = setGameTurnBanner;
  window.gameSkeletonHtml = gameSkeletonHtml;
  window.prepareGameOverlay = prepareGameOverlay;
  window.resolveGameAccent = resolveGameAccent;
  window.animateGameExit = animateGameExit;
  window.pulseGameEl = pulseGameEl;
  window.ensureGameTapTarget = ensureGameTapTarget;
  window.setupGameCanvas = setupGameCanvas;
  window.shakeInvalidMove = shakeInvalidMove;
  window.getGamePB = getGamePB;
  window.setGamePB = setGamePB;
  window.formatVsBest = formatVsBest;
  window.ankJodPbGameId = ankJodPbGameId;
  window.streetCricketPbGameId = streetCricketPbGameId;
  window.migrateStreetCricketPb = migrateStreetCricketPb;
  window.buildGameShareCard = buildGameShareCard;
  window.buildBeatScoreLink = buildBeatScoreLink;
  window.shareGameResult = shareGameResult;
  window.exportShareCardImage = exportShareCardImage;
  window.openFriendPickerSheet = openFriendPickerSheet;
  window.openUnifiedShareSheet = openUnifiedShareSheet;
  window.buildShareStats = buildShareStats;
  window.sendShareInBaithak = sendShareInBaithak;
  window.openFriendShareFollowup = openFriendShareFollowup;
  window.uploadShareCardMedia = uploadShareCardMedia;
  window.maybeShowGameCoach = maybeShowGameCoach;
  window.resetGameCoach = resetGameCoach;
  window.attachHowTo = attachHowTo;
  window.GameUI = Object.assign(window.GameUI || {}, { attachHowTo: attachHowTo });
  window.gameHudHtml = gameHudHtml;
  window.gameBrandMarkHtml = gameBrandMarkHtml;
  window.recordDuelStreak = recordDuelStreak;
  window.getDuelStreak = getDuelStreak;
  window.postGameScoreStory = postGameScoreStory;
  window.wireGameResultActions = wireGameResultActions;
  window.markGamePlayed = markGamePlayed;
  window.getLastPlayedGame = getLastPlayedGame;
  window.getDailySpotlightGameId = getDailySpotlightGameId;
  window.buildWeeklyFriendsBoard = buildWeeklyFriendsBoard;
  window.weeklyFriendsBoardHtml = weeklyFriendsBoardHtml;
  window.openLeaderboardRankShare = openLeaderboardRankShare;
  window.consumeBeatScoreChallenge = consumeBeatScoreChallenge;
  window.recordDangalSession = recordDangalSession;
  window.getDangalProgress = getDangalProgress;
  window.getDangalGameStats = getDangalGameStats;
  window.getDangalHubSummary = getDangalHubSummary;
  window.getDangalMissions = getDangalMissions;
  window.dangalHubProgressHtml = dangalHubProgressHtml;
  window.wireDangalProgressPanel = wireDangalProgressPanel;
  window.gamePersonalStatsHtml = gamePersonalStatsHtml;
  window.tileProgressPillHtml = tileProgressPillHtml;
  window.normalizeDangalGameId = normalizeDangalGameId;
  window.GAME_ACCENTS = GAME_ACCENTS;
  window.shouldReduceGameMotion = shouldReduceGameMotion;
  window.createGamePauseController = createGamePauseController;
  window.confirmLeaveGame = confirmLeaveGame;
  window.bindGameKeyboardPaddle = bindGameKeyboardPaddle;
})();
