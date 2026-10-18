/**
 * New-user first ~10 minutes: gesture coach, mode job-titles, Play/Meet fork, legal v1.
 */
(function () {
  'use strict';

  const COACH_PREFIX = 'chaupaal_coach_v1_';
  const FORK_PREFIX = 'chaupaal_day0_fork_v1_';
  const HINTS_HIDE_KEY = 'chaupaal_hide_mode_hints';

  const MODE_JOBS = {
    peepal: {
      khoj: { brand: 'Khoj', job: t('onboarding.find_people_who_match_your_vibe') },
      vriksha: { brand: 'Vriksha', job: t('onboarding.discussions_discovery_feed') },
      mashhoor: { brand: 'Mashhoor', job: t('onboarding.trending_discussions_this_week') },
    },
    duniya: {
      vishwa: { brand: 'Vishwa', job: t('onboarding.photos_stories_posts') },
      lehar: { brand: 'Lehar', job: t('onboarding.short_clips') },
      prasidha: { brand: 'Prasidha', job: t('onboarding.trending_this_week') },
    },
    baithak: {
      sabha: { brand: 'Sabha', job: t('onboarding.all_your_chats') },
      sambhavanayein: { brand: 'Sambhavanayein', job: t('onboarding.new_connections') },
      mitra: { brand: 'Mitra', job: t('onboarding.friends_groups') },
    },
    akhbaar: {
      surkhiya: { brand: 'Surkhiya', job: t('onboarding.digest_jump_to_play') },
      all: { brand: 'Khabar', job: t('onboarding.news_quizzes') },
      saathi: { brand: 'Saathi', job: t('onboarding.friends_updates') },
    },
    dangal: {
      khel: { brand: 'Khel', job: t('common.shortcut_dangal_gotd') },
      manch: { brand: 'Manch', job: t('onboarding.game_library') },
      maidan: { brand: 'Maidan', job: t('onboarding.resume_a_match') },
    },
  };

  function tt(key, fallback, vars) {
    try {
      if (typeof t === 'function') {
        const v = t(key, vars);
        if (v && v !== key) return v;
      }
    } catch (e) {}
    return fallback;
  }

  function coachKey() {
    const uid =
      typeof currentUser !== 'undefined' && currentUser?.uid ? currentUser.uid : 'guest';
    return COACH_PREFIX + uid;
  }

  function forkKey() {
    const uid =
      typeof currentUser !== 'undefined' && currentUser?.uid ? currentUser.uid : 'guest';
    return FORK_PREFIX + uid;
  }

  function hintsHidden() {
    try {
      return localStorage.getItem(HINTS_HIDE_KEY) === '1';
    } catch (e) {
      return false;
    }
  }

  function modeJob(surface, mode) {
    const pack = MODE_JOBS[surface] || {};
    return pack[mode] || null;
  }

  function morphLabel(surface, mode, brandFallback) {
    const job = modeJob(surface, mode);
    if (!job) return brandFallback || mode;
    // Short job for tab morph (space-constrained)
    const short = job.job.split(/[&·,]/)[0].trim().split(' ').slice(0, 3).join(' ');
    return `${job.brand} · ${short}`;
  }

  /** Strip cosmetic mode title headers (room-kit theming stays on the panel). */
  function paintModeSubtitle(host, surface, mode) {
    host?.querySelectorAll?.(':scope > .room-kit-header, :scope > .cp-mode-subtitle').forEach((el) => el.remove());
    if (typeof cleanupModeHeaders === 'function') cleanupModeHeaders();
  }

  function escapeLite(s) {
    return String(s || '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/"/g, '&quot;');
  }

  function markCoachDone() {
    try {
      localStorage.setItem(coachKey(), '1');
    } catch (e) {}
  }

  function coachDone() {
    try {
      return localStorage.getItem(coachKey()) === '1';
    } catch (e) {
      return false;
    }
  }

  function openFirstRunCoach(opts) {
    if (coachDone()) {
      if (typeof opts?.onDone === 'function') opts.onDone();
      return false;
    }
    document.getElementById('firstRunCoachSheet')?.remove();
    const sheet = document.createElement('div');
    sheet.id = 'firstRunCoachSheet';
    sheet.className = 'archive-overlay first-run-coach';
    sheet.dataset.navManaged = '1';
    const quiet =
      document.documentElement.classList.contains('quiet-mode') ||
      window.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches;
    sheet.innerHTML = `
      <div class="archive-header">
        <div style="flex:1"><strong>${tt('onboarding.coach_title', 'Quick tips')}</strong></div>
        <button type="button" class="btn" data-coach-skip style="font-size:12px;">${tt('onboarding.coach_skip', 'Skip')}</button>
      </div>
      <div class="first-run-coach-body${quiet ? ' is-quiet' : ''}">
        <div class="first-run-coach-card" data-coach-card="0">
          <div class="first-run-coach-ico" aria-hidden="true">↔️</div>
          <h3>${tt('onboarding.coach_swipe_title', 'Swipe to switch modes')}</h3>
          <p>${tt('onboarding.coach_swipe_body', 'On Peepal, swipe the feed: Khoj · Vriksha · Mashhoor. Same idea on Baithak, Duniya & Akhbaar.')}</p>
        </div>
        <div class="first-run-coach-card" data-coach-card="1" hidden>
          <div class="first-run-coach-ico" aria-hidden="true">长</div>
          <h3>${tt('onboarding.coach_hold_title', 'Press & hold a tab')}</h3>
          <p>${tt('onboarding.coach_hold_body', 'Hold the bottom tab to open shortcuts — post, find people, switch sections fast.')}</p>
        </div>
        <div class="first-run-coach-card" data-coach-card="2" hidden>
          <div class="first-run-coach-ico" aria-hidden="true">👆👆</div>
          <h3>${tt('onboarding.coach_dbl_title', 'Double-tap for notifications')}</h3>
          <p>${tt('onboarding.coach_dbl_body', 'Double-tap any tab to open that tab’s notifications — empty is fine (“No new notifications”).')}</p>
        </div>
        <div class="first-run-coach-dots" aria-hidden="true"><i class="is-on"></i><i></i><i></i></div>
        <button type="button" class="btn btn--primary btn--block" data-coach-next>${tt('onboarding.coach_next', 'Next')}</button>
      </div>`;
    // Fix hold icon - use text not chinese
    sheet.querySelector('[data-coach-card="1"] .first-run-coach-ico').textContent = '☰';

    const device = document.querySelector('.device');
    device?.appendChild(sheet);
    let step = 0;
    const close = () => {
      markCoachDone();
      if (typeof removeNavLayer === 'function') removeNavLayer(sheet);
      sheet.remove();
      if (typeof opts?.onDone === 'function') opts.onDone();
    };
    if (typeof pushNavLayer === 'function') pushNavLayer(sheet, close);

    const paint = () => {
      sheet.querySelectorAll('[data-coach-card]').forEach((c) => {
        c.hidden = Number(c.dataset.coachCard) !== step;
      });
      sheet.querySelectorAll('.first-run-coach-dots i').forEach((d, i) => {
        d.classList.toggle('is-on', i === step);
      });
      const next = sheet.querySelector('[data-coach-next]');
      if (next) next.textContent = step >= 2 ? tt('onboarding.coach_got_it', 'Got it') : tt('onboarding.coach_next', 'Next');
    };
    sheet.querySelector('[data-coach-skip]')?.addEventListener('click', close);
    sheet.querySelector('[data-coach-next]')?.addEventListener('click', () => {
      if (step >= 2) close();
      else {
        step += 1;
        paint();
      }
    });
    paint();
    return true;
  }

  function maybeOfferFirstRunCoach(opts) {
    if (coachDone()) return false;
    // Defer slightly so overlays settle
    setTimeout(() => openFirstRunCoach(opts), opts?.delayMs != null ? opts.delayMs : 600);
    return true;
  }

  function forkDone() {
    try {
      return localStorage.getItem(forkKey()) === '1';
    } catch (e) {
      return false;
    }
  }

  function markForkDone() {
    try {
      localStorage.setItem(forkKey(), '1');
    } catch (e) {}
    try {
      if (window.ChaupaalPwa && typeof window.ChaupaalPwa.noteMeaningfulMoment === 'function') {
        window.ChaupaalPwa.noteMeaningfulMoment('day0');
      }
    } catch (e) {}
  }

  /** Deep link / invite / challenge / pending auth resume beats the Play·Meet fork. */
  function hasPendingDay0Destination() {
    try {
      if (typeof ChaupaalReferrals?.readPendingDeepLink === 'function') {
        const d = String(ChaupaalReferrals.readPendingDeepLink() || '');
        if (d && d !== '/' && d !== '/index.html' && !/^\/(\?|$)/.test(d)) return true;
        if (/[?&](ref|inv|challenge|score|join)=/.test(d)) return true;
      }
      if (typeof ChaupaalReferrals?.readPendingRef === 'function' && ChaupaalReferrals.readPendingRef()) {
        return true;
      }
      try {
        if (sessionStorage.getItem('chaupaal_pending_group_invite')) return true;
        if (sessionStorage.getItem('chaupaal_pending_action')) return true;
      } catch (e) {}
      const path = String(location.pathname || '');
      if (/^\/(profile|u|post|p|chat|c|join|challenge|invite|story)\//i.test(path)) return true;
      const params = new URLSearchParams(location.search || '');
      if (params.get('ref') || params.get('inv') || params.get('challenge') || params.get('score') || params.get('join')) {
        return true;
      }
    } catch (e) {}
    return false;
  }

  function startDay0Play() {
    try {
      if (typeof trackEvent === 'function') trackEvent('day0_play', { surface: 'first_run' });
    } catch (e) {}
    if (typeof showTab === 'function') showTab('akhbaar');
    else document.querySelector('.tab-btn[data-tab="akhbaar"]')?.click();
    setTimeout(() => {
      if (typeof startMuqabala === 'function') {
        startMuqabala(null, 'GK', {
          skipMatchmaking: true,
          practice: true,
          simulated: true,
          skipCredit: true,
          source: 'day0',
        });
        return;
      }
      if (typeof showTab === 'function') showTab('dangal');
      else document.querySelector('.tab-btn[data-tab="dangal"]')?.click();
      setTimeout(() => {
        if (typeof setDangalSection === 'function') setDangalSection('manch');
      }, 200);
    }, 350);
  }

  function openDay0ValueFork(opts) {
    if (forkDone()) {
      if (typeof opts?.onDone === 'function') opts.onDone();
      return false;
    }
    if (hasPendingDay0Destination()) {
      markForkDone();
      if (typeof opts?.onDone === 'function') opts.onDone();
      return false;
    }
    document.getElementById('day0ValueFork')?.remove();
    const sheet = document.createElement('div');
    sheet.id = 'day0ValueFork';
    sheet.className = 'archive-overlay day0-value-fork';
    sheet.dataset.navManaged = '1';
    sheet.innerHTML = `
      <div class="archive-header">
        <div style="flex:1"><strong>${tt('onboarding.day0_fork_title', 'What first?')}</strong></div>
        <button type="button" class="btn" data-fork-skip style="font-size:12px;">${tt('onboarding.day0_fork_skip', 'Skip')}</button>
      </div>
      <div class="day0-fork-body">
        <p class="day0-fork-lead">${tt('onboarding.day0_fork_lead', 'One step — play solo or meet someone. You can do both later.')}</p>
        <button type="button" class="day0-fork-card" data-fork="play">
          <strong>${tt('onboarding.day0_play', 'Play')}</strong>
          <span>${tt('onboarding.day0_play_sub', 'A short practice quiz — no account needed')}</span>
        </button>
        <button type="button" class="day0-fork-card" data-fork="meet">
          <strong>${tt('onboarding.day0_meet', 'Meet')}</strong>
          <span>${tt('onboarding.day0_meet_sub', 'Invite friends, find contacts, or search on Peepal')}</span>
        </button>
        ${typeof ChaupaalLangPicker !== 'undefined' ? ChaupaalLangPicker.chipHtml() : ''}
      </div>`;
    document.querySelector('.device')?.appendChild(sheet);
    if (typeof ChaupaalLangPicker !== 'undefined') ChaupaalLangPicker.wireChip(sheet);
    const close = () => {
      markForkDone();
      if (typeof removeNavLayer === 'function') removeNavLayer(sheet);
      sheet.remove();
      if (typeof opts?.onDone === 'function') opts.onDone();
    };
    if (typeof pushNavLayer === 'function') pushNavLayer(sheet, close);
    sheet.querySelector('[data-fork-skip]')?.addEventListener('click', close);
    sheet.querySelector('[data-fork="play"]')?.addEventListener('click', () => {
      close();
      startDay0Play();
    });
    sheet.querySelector('[data-fork="meet"]')?.addEventListener('click', () => {
      close();
      if (typeof openDay0MeetSheet === 'function') openDay0MeetSheet();
      else if (typeof openPeopleSearchWithContacts === 'function') {
        openPeopleSearchWithContacts({ surface: 'baithak' });
      } else if (typeof showTab === 'function') showTab('baithak');
    });
    return true;
  }

  function openDay0MeetSheet() {
    document.getElementById('day0MeetSheet')?.remove();
    const sheet = document.createElement('div');
    sheet.id = 'day0MeetSheet';
    sheet.className = 'archive-overlay';
    sheet.dataset.navManaged = '1';
    sheet.innerHTML = `
      <div class="archive-header">
        ${typeof backButtonHtml === 'function' ? backButtonHtml({ attrs: 'data-dismiss' }) : '<button type="button" data-dismiss class="cp-back-btn">←</button>'}
        <div style="flex:1"><strong>${tt('onboarding.day0_meet', 'Meet')}</strong></div>
      </div>
      <div style="padding:16px;display:flex;flex-direction:column;gap:10px;">
        <button type="button" class="btn btn--primary btn--block" data-meet="invite">${tt('contacts_invite_cta', 'Invite friends')}</button>
        <button type="button" class="btn btn--block" data-meet="contacts">${tt('onboarding.day0_contacts', 'Find from contacts')}</button>
        <button type="button" class="btn btn--block" data-meet="khoj">${tt('onboarding.day0_khoj', 'Find on Peepal')}</button>
      </div>`;
    document.querySelector('.device')?.appendChild(sheet);
    const close = () => {
      if (typeof removeNavLayer === 'function') removeNavLayer(sheet);
      sheet.remove();
    };
    if (typeof pushNavLayer === 'function') pushNavLayer(sheet, close);
    sheet.querySelector('[data-dismiss]')?.addEventListener('click', close);
    sheet.querySelector('[data-meet="invite"]')?.addEventListener('click', () => {
      close();
      if (typeof openInviteToChaupaalShare === 'function') openInviteToChaupaalShare();
      else if (typeof ChaupaalReferrals?.openInviteToChaupaalShare === 'function') {
        ChaupaalReferrals.openInviteToChaupaalShare();
      } else shareInviteFallback();
    });
    sheet.querySelector('[data-meet="contacts"]')?.addEventListener('click', () => {
      close();
      if (typeof openPeopleSearchWithContacts === 'function') openPeopleSearchWithContacts({ surface: 'baithak' });
      else if (typeof showTab === 'function') showTab('baithak');
    });
    sheet.querySelector('[data-meet="khoj"]')?.addEventListener('click', () => {
      close();
      if (typeof showTab === 'function') showTab('peepal');
      setTimeout(() => {
        if (typeof setPeepalMode === 'function') setPeepalMode('khoj');
      }, 80);
    });
  }

  function shareInviteFallback() {
    if (typeof openInviteToChaupaalShare === 'function') {
      openInviteToChaupaalShare();
      return;
    }
    const uname =
      (typeof digitalProfile !== 'undefined' && digitalProfile?.username) ||
      (typeof userProfile !== 'undefined' && userProfile?.username) ||
      '';
    const url =
      typeof shareUrl === 'function' && uname
        ? shareUrl('profile', uname)
        : typeof withReferralParam === 'function'
          ? withReferralParam(`${location.origin}/`)
          : `${location.origin}/`;
    const text = tt(
      'contacts_invite_text',
      'Join me on Chaupaal — chat, play, and catch up. Virtual chips · not real money. {{url}}',
      { url }
    );
    if (navigator.share) {
      navigator.share({ title: 'Chaupaal', text, url }).catch(() => {});
    } else {
      try {
        navigator.clipboard?.writeText(text);
        if (typeof showToast === 'function') showToast(tt('contacts_invite_copied', 'Invite link copied'));
      } catch (e) {
        if (typeof showToast === 'function') showToast(url);
      }
    }
  }

  function openLegalSheet(kind) {
    const k = String(kind || 'terms').toLowerCase();
    const isPrivacy = k === 'privacy';
    const isCollects = k === 'collects' || k === 'data' || k === 'what-we-collect';
    const title = isCollects
      ? t('common.what_chaupaal_collects')
      : isPrivacy
        ? t('common.privacy_policy')
        : t('onboarding.terms_of_service');
    document.getElementById('legalSheetV1')?.remove();
    const sheet = document.createElement('div');
    sheet.id = 'legalSheetV1';
    sheet.className = 'archive-overlay legal-sheet-v1';
    sheet.dataset.navManaged = '1';

    let body;
    if (isCollects) {
      body = `
        <p class="legal-v1-lead">${tHtml('onboarding.plain_english_no_charts_no_per')}</p>

        <h3 class="legal-v1-h">${tHtml('common.what_we_collect')}</h3>
        <ul class="legal-v1-list">
          <li><strong>${tHtml('onboarding.profile_you_enter')}</strong> ${tHtml('onboarding.name_username_bio_interests_photos_and')}</li>
          <li><strong>${tHtml('onboarding.activity_signals')}</strong> ${tHtml('onboarding.on_by_default_scrolls_likes_comments')}</li>
          <li><strong>${tHtml('onboarding.hashed_search')}</strong> ${tHtml('onboarding.a_fingerprint_of_search_text_never')}</li>
          <li><strong>${tHtml('onboarding.device_session_basics')}</strong> ${tHtml('onboarding.signed_in_sessions_push_tokens_and')}</li>
          <li><strong>${tHtml('common.chaupaal_journal')}</strong> ${tHtml('onboarding.your_archive_journal_stays_yours_soft')}</li>
        </ul>

        <h3 class="legal-v1-h">${tHtml('onboarding.what_we_use_it_for')}</h3>
        <ul class="legal-v1-list">
          <li>${tHtml('onboarding.better_people_games_and_content_recommenda')}</li>
          <li>${tHtml('onboarding.safety_block_mute_report_account_recovery')}</li>
          <li>${tHtml('onboarding.optional_tips_wishes_from_chaupaal_separat')}</li>
        </ul>

        <h3 class="legal-v1-h">${tHtml('onboarding.what_we_never_collect_or_infer')}</h3>
        <ul class="legal-v1-list">
          <li>${tHtml('onboarding.raw_message_dm_text_raw_search')}</li>
          <li>${tHtml('onboarding.journal_text_sent_to_any_ai')} <em>${tHtml('onboarding.without')}</em> ${tHtml('onboarding.per_entry_consent')}</li>
          <li>${tHtml('onboarding.sensitive_attributes_we_never_invent_relig')}</li>
          <li>${tHtml('onboarding.we_do_not_sell_your_personal')}</li>
        </ul>

        <h3 class="legal-v1-h">${tHtml('onboarding.how_long_we_keep_it')}</h3>
        <ul class="legal-v1-list">
          <li><strong>${tHtml('onboarding.activity_signal_stream')}</strong> ${tHtml('onboarding.pruned_on_a_short_rolling_window')}</li>
          <li><strong>${tHtml('onboarding.archive_soft_delete')}</strong> ${tHtml('onboarding.deleted_tab_recovery_is_on_this')}</li>
          <li><strong>${tHtml('onboarding.live_stories')}</strong> ${tHtml('onboarding.expire_after_24_hours_unless_saved')}</li>
          <li><strong>${tHtml('onboarding.account_deletion')}</strong> ${tHtml('onboarding.signs_you_out_and_revokes_sessions')}</li>
        </ul>

        <h3 class="legal-v1-h">${tHtml('onboarding.your_choices')}</h3>
        <p>${tHtml('onboarding.these_open_settings_to_the_matching')}</p>
        <div class="legal-v1-actions">
          <button type="button" class="btn btn--secondary btn--block" data-collects-focus="toggleActivitySignals">${tHtml('common.personalization_activity')}</button>
          <button type="button" class="btn btn--secondary btn--block" data-collects-focus="toggleCompanionOutreach">${tHtml('onboarding.tips_wishes')}</button>
          <button type="button" class="btn btn--secondary btn--block" data-collects-focus="toggleOpenToMeet">${tHtml('onboarding.open_to_meeting_people')}</button>
          <button type="button" class="btn btn--secondary btn--block" data-collects-go="export">${tHtml('common.download_my_data')}</button>
          <button type="button" class="btn btn--secondary btn--block" data-collects-go="archive">${tHtml('common.open_archive')}</button>
          <button type="button" class="btn btn--ghost btn--block" data-collects-go="privacy">${tHtml('onboarding.short_privacy_policy')}</button>
        </div>
        <p class="legal-v1-note">${tHtml('onboarding.ranking_and_matching_read_stored_fields')}</p>`;
    } else if (isPrivacy) {
      body = `         <p>${tHtml('onboarding.chaupaal_we_values_your_privacy_we')}</p>
         <p><strong>${tHtml('onboarding.how_we_use_it')}</strong> ${tHtml('onboarding.to_authenticate_you_show_your_profile')}</p>
         <p><strong>${tHtml('onboarding.sharing')}</strong> ${tHtml('onboarding.we_don_t_sell_your_personal')}</p>
         <p><strong>${tHtml('onboarding.your_choices_2')}</strong> ${tHtml('onboarding.edit_visibility_and_show_toggles_turn')}</p>
         <p><button type="button" class="btn btn--secondary btn--sm" data-legal="collects">${tHtml('onboarding.what_chaupaal_collects_full_plain_list')}</button></p>
         <p class="legal-v1-note">${tHtml('onboarding.this_is_a_short_v1_summary')}</p>`;
    } else {
      body = `<p>${tHtml('onboarding.by_creating_a_chaupaal_account_you')}</p>
         <p><strong>${tHtml('onboarding.your_content')}</strong> ${tHtml('onboarding.you_own_what_you_post_you')}</p>
         <p><strong>${tHtml('onboarding.rules')}</strong> ${tHtml('onboarding.no_harassment_illegal_content_spam_or')}</p>
         <p><strong>${tHtml('onboarding.the_service')}</strong> ${tHtml('onboarding.chaupaal_is_provided_as_is_during')}</p>
         <p class="legal-v1-note">${tHtml('onboarding.this_is_a_short_v1_terms')}</p>`;
    }

    sheet.innerHTML = `
      <div class="archive-header">
        ${typeof backButtonHtml === 'function' ? backButtonHtml({ attrs: 'data-legal-close' }) : '<button type="button" data-legal-close class="cp-back-btn">←</button>'}
        <div style="flex:1"><strong>${title}</strong></div>
      </div>
      <div class="legal-sheet-body">${body}</div>`;
    document.querySelector('.device')?.appendChild(sheet);
    const close = () => {
      if (typeof removeNavLayer === 'function') removeNavLayer(sheet);
      sheet.remove();
    };
    if (typeof pushNavLayer === 'function') pushNavLayer(sheet, close);
    else if (typeof openLayer === 'function') openLayer(sheet, close, { label: title });
    sheet.querySelector('[data-legal-close]')?.addEventListener('click', close);
    sheet.querySelectorAll('[data-legal="collects"]').forEach((btn) => {
      btn.addEventListener('click', () => {
        close();
        openLegalSheet('collects');
      });
    });
    sheet.querySelectorAll('[data-collects-focus]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const id = btn.getAttribute('data-collects-focus');
        close();
        if (typeof openSettingsPrivacyFocus === 'function') openSettingsPrivacyFocus(id);
        else if (typeof openSettingsModal === 'function') openSettingsModal();
      });
    });
    sheet.querySelectorAll('[data-collects-go]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const go = btn.getAttribute('data-collects-go');
        close();
        if (go === 'export' && typeof openAccountDataExport === 'function') openAccountDataExport();
        else if (go === 'archive' && typeof openArchiveHub === 'function') openArchiveHub('journal');
        else if (go === 'privacy') openLegalSheet('privacy');
      });
    });
  }

  /** After signup success — ONE primary next step. Prefer pending deep link over fork. */
  function runPostSignupPrimaryPath() {
    if (hasPendingDay0Destination()) {
      markForkDone();
      markCoachDone();
      return;
    }
    const deepenNeeded =
      typeof needsDigitalCanvasDeepen === 'function' && needsDigitalCanvasDeepen();
    if (deepenNeeded && typeof openDigitalCanvasDeepen === 'function') {
      openDigitalCanvasDeepen({
        reason: 'signup',
        onDone: () => {
          maybeOfferFirstRunCoach({
            onDone: () => openDay0ValueFork(),
          });
        },
      });
      return;
    }
    maybeOfferFirstRunCoach({
      onDone: () => openDay0ValueFork(),
    });
  }

  window.MODE_JOBS = MODE_JOBS;
  window.modeJob = modeJob;
  window.morphLabel = morphLabel;
  window.paintModeSubtitle = paintModeSubtitle;
  window.modeHintsHidden = hintsHidden;
  window.openFirstRunCoach = openFirstRunCoach;
  window.maybeOfferFirstRunCoach = maybeOfferFirstRunCoach;
  window.openDay0ValueFork = openDay0ValueFork;
  window.openDay0MeetSheet = openDay0MeetSheet;
  window.startDay0Play = startDay0Play;
  window.hasPendingDay0Destination = hasPendingDay0Destination;
  window.shareInviteToChaupaal = shareInviteFallback;
  window.openLegalSheet = openLegalSheet;
  window.runPostSignupPrimaryPath = runPostSignupPrimaryPath;

  // Returning guest / signed-in first session — coach once if onboarding already done.
  document.addEventListener('DOMContentLoaded', () => {
    setTimeout(() => {
      try {
        if (localStorage.getItem('chaupaal_onboarded') !== 'true') return;
        if (coachDone()) return;
        if (hasPendingDay0Destination()) return;
        // Don't steal focus from auth overlay
        if (document.getElementById('authOverlay') && !document.getElementById('authOverlay').classList.contains('hidden')) return;
        maybeOfferFirstRunCoach({ delayMs: 0 });
      } catch (e) {}
    }, 1400);
  });
})();
