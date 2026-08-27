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
      khoj: { brand: 'Khoj', job: 'Find people who match your vibe' },
      vriksha: { brand: 'Vriksha', job: 'Discussions & discovery feed' },
      mashhoor: { brand: 'Mashhoor', job: 'Popular discussions' },
    },
    duniya: {
      vishwa: { brand: 'Vishwa', job: 'Photos, stories & posts' },
      lehar: { brand: 'Lehar', job: 'Short clips' },
      prasidha: { brand: 'Prasidha', job: 'Trending this week' },
    },
    baithak: {
      sabha: { brand: 'Sabha', job: 'All your chats' },
      sambhavanayein: { brand: 'Sambhavanayein', job: 'New connections' },
      mitra: { brand: 'Mitra', job: 'Friends' },
    },
    akhbaar: {
      surkhiya: { brand: 'Surkhiya', job: 'Headlines near you' },
      all: { brand: 'Khabar', job: 'News & quizzes' },
      saathi: { brand: 'Saathi', job: 'Friends’ updates' },
    },
    dangal: {
      khel: { brand: 'Khel', job: 'Game of the day' },
      manch: { brand: 'Manch', job: 'Game library' },
      maidan: { brand: 'Maidan', job: 'Resume a match' },
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
        <div style="flex:1"><strong>${tt('coach_title', 'Quick tips')}</strong></div>
        <button type="button" class="btn" data-coach-skip style="font-size:12px;">${tt('coach_skip', 'Skip')}</button>
      </div>
      <div class="first-run-coach-body${quiet ? ' is-quiet' : ''}">
        <div class="first-run-coach-card" data-coach-card="0">
          <div class="first-run-coach-ico" aria-hidden="true">↔️</div>
          <h3>${tt('coach_swipe_title', 'Swipe to switch modes')}</h3>
          <p>${tt('coach_swipe_body', 'On Peepal, swipe the feed: Khoj · Vriksha · Mashhoor. Same idea on Baithak, Duniya & Akhbaar.')}</p>
        </div>
        <div class="first-run-coach-card" data-coach-card="1" hidden>
          <div class="first-run-coach-ico" aria-hidden="true">长</div>
          <h3>${tt('coach_hold_title', 'Press & hold a tab')}</h3>
          <p>${tt('coach_hold_body', 'Hold the bottom tab to open shortcuts — post, find people, switch sections fast.')}</p>
        </div>
        <div class="first-run-coach-card" data-coach-card="2" hidden>
          <div class="first-run-coach-ico" aria-hidden="true">👆👆</div>
          <h3>${tt('coach_dbl_title', 'Double-tap for notifications')}</h3>
          <p>${tt('coach_dbl_body', 'Double-tap any tab to open that tab’s notifications — empty is fine (“No new notifications”).')}</p>
        </div>
        <div class="first-run-coach-dots" aria-hidden="true"><i class="is-on"></i><i></i><i></i></div>
        <button type="button" class="btn btn--primary btn--block" data-coach-next>${tt('coach_next', 'Next')}</button>
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
      if (next) next.textContent = step >= 2 ? tt('coach_got_it', 'Got it') : tt('coach_next', 'Next');
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
  }

  function openDay0ValueFork(opts) {
    if (forkDone()) {
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
        <div style="flex:1"><strong>${tt('day0_fork_title', 'What first?')}</strong></div>
        <button type="button" class="btn" data-fork-skip style="font-size:12px;">${tt('day0_fork_skip', 'Skip')}</button>
      </div>
      <div class="day0-fork-body">
        <p class="day0-fork-lead">${tt('day0_fork_lead', 'One step — play solo or meet someone. You can do both later.')}</p>
        <button type="button" class="day0-fork-card" data-fork="play">
          <strong>${tt('day0_play', 'Play')}</strong>
          <span>${tt('day0_play_sub', 'Akhbaar quizzes or a quick Dangal game')}</span>
        </button>
        <button type="button" class="day0-fork-card" data-fork="meet">
          <strong>${tt('day0_meet', 'Meet')}</strong>
          <span>${tt('day0_meet_sub', 'Invite friends, find contacts, or search on Peepal')}</span>
        </button>
      </div>`;
    document.querySelector('.device')?.appendChild(sheet);
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
      if (typeof showTab === 'function') showTab('akhbaar');
      else document.querySelector('.tab-btn[data-tab="akhbaar"]')?.click();
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
        <div style="flex:1"><strong>${tt('day0_meet', 'Meet')}</strong></div>
      </div>
      <div style="padding:16px;display:flex;flex-direction:column;gap:10px;">
        <button type="button" class="btn btn--primary btn--block" data-meet="invite">${tt('contacts_invite_cta', 'Invite friends')}</button>
        <button type="button" class="btn btn--block" data-meet="contacts">${tt('day0_contacts', 'Find from contacts')}</button>
        <button type="button" class="btn btn--block" data-meet="khoj">${tt('day0_khoj', 'Find on Peepal')}</button>
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
      if (typeof shareInviteToChaupaal === 'function') shareInviteToChaupaal();
      else if (typeof openInviteShare === 'function') openInviteShare();
      else shareInviteFallback();
    });
    sheet.querySelector('[data-meet="contacts"]')?.addEventListener('click', () => {
      close();
      if (typeof openPeopleSearchWithContacts === 'function') openPeopleSearchWithContacts({ surface: 'baithak' });
      else if (typeof showTab === 'function') showTab('baithak');
    });
    sheet.querySelector('[data-meet="khoj"]')?.addEventListener('click', () => {
      close();
      if (typeof showTab === 'function') showTab('peepal');
      if (typeof setPeepalMode === 'function') setPeepalMode('khoj');
    });
  }

  function shareInviteFallback() {
    const uname =
      (typeof digitalProfile !== 'undefined' && digitalProfile?.username) ||
      (typeof userProfile !== 'undefined' && userProfile?.username) ||
      '';
    const url =
      typeof shareUrl === 'function' && uname
        ? shareUrl('profile', uname)
        : `${location.origin}/`;
    const text = tt('contacts_invite_text', 'Join me on Chaupaal — {{url}}', { url });
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
    const isPrivacy = kind === 'privacy';
    const title = isPrivacy ? 'Privacy Policy' : 'Terms of Service';
    document.getElementById('legalSheetV1')?.remove();
    const sheet = document.createElement('div');
    sheet.id = 'legalSheetV1';
    sheet.className = 'archive-overlay legal-sheet-v1';
    sheet.dataset.navManaged = '1';
    const body = isPrivacy
      ? `<p>Chaupaal (“we”) values your privacy. We collect account info you provide (name, username, email or phone), profile content you post, and basic device/usage data to run the app.</p>
         <p><strong>How we use it:</strong> to authenticate you, show your profile and posts to people you choose, improve discovery and safety, and send essential service messages.</p>
         <p><strong>Sharing:</strong> we don’t sell your personal data. Content you mark public can be seen by other members. We use trusted processors (hosting, analytics, push) under contracts.</p>
         <p><strong>Your choices:</strong> edit or delete profile content, adjust visibility, sign out, or request account deletion via Settings. Contact us from in-app feedback for privacy requests.</p>
         <p class="legal-v1-note">This is a short v1 summary for early access. A fuller policy will replace it as we grow.</p>`
      : `<p>By creating a Chaupaal account you confirm you are 13+ and agree to use the product respectfully.</p>
         <p><strong>Your content:</strong> you own what you post. You grant Chaupaal a license to host and display it as needed to operate the service.</p>
         <p><strong>Rules:</strong> no harassment, illegal content, spam, or impersonation. We may remove content or restrict accounts that break these rules.</p>
         <p><strong>The service:</strong> Chaupaal is provided “as is” during early access; features may change. We’re not liable for indirect damages from use of the app.</p>
         <p class="legal-v1-note">This is a short v1 Terms summary. Full Terms will replace it when published.</p>`;
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
    sheet.querySelector('[data-legal-close]')?.addEventListener('click', close);
  }

  /** After signup success — ONE primary next step. */
  function runPostSignupPrimaryPath() {
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
  window.shareInviteToChaupaal = shareInviteFallback;
  window.openLegalSheet = openLegalSheet;
  window.runPostSignupPrimaryPath = runPostSignupPrimaryPath;

  // Returning guest / signed-in first session — coach once if onboarding already done.
  document.addEventListener('DOMContentLoaded', () => {
    setTimeout(() => {
      try {
        if (localStorage.getItem('chaupaal_onboarded') !== 'true') return;
        if (coachDone()) return;
        // Don't steal focus from auth overlay
        if (document.getElementById('authOverlay') && !document.getElementById('authOverlay').classList.contains('hidden')) return;
        maybeOfferFirstRunCoach({ delayMs: 0 });
      } catch (e) {}
    }, 1400);
  });
})();
