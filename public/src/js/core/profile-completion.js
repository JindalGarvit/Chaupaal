/**
 * Profile completion — overall + five sections (Identity, Social, Relationship,
 * Career, Trust). Matching-useful fields weigh more than niche extras.
 * Highlights / custom tabs are never part of %.
 *
 * Persists `profileCompletion: { pct, sections }` on users/{uid}.
 */
(function () {
  const SECTION_WEIGHTS = {
    identity: 0.28,
    social: 0.24,
    relationship: 0.16,
    career: 0.14,
    trust: 0.18,
  };
  /** When Relationship is hidden (teen), redistribute to Identity / Social / Trust. */
  const TEEN_WEIGHTS = {
    identity: 0.34,
    social: 0.28,
    career: 0.16,
    trust: 0.22,
  };

  const SECTION_META = {
    identity: { id: 'identity', label: 'Identity', editSec: 'Personal' },
    social: { id: 'social', label: 'Social', editSec: 'Personal' },
    relationship: { id: 'relationship', label: 'Relationship', editSec: 'Relationships' },
    career: { id: 'career', label: 'Career', editSec: 'Career' },
    trust: { id: 'trust', label: 'Trust', editSec: 'Personal' },
  };

  /** Compat labels for field-save toasts. */
  const COMPLETION_FIELDS = [
    { key: 'displayName', weight: 1, label: 'Name' },
    { key: 'bio', weight: 1.5, label: 'Bio' },
    { key: 'dateOfBirth', weight: 1, label: 'Birthday' },
    { key: 'gender', weight: 0.5, label: 'Gender' },
    { key: 'currentCity', weight: 1.5, label: 'City' },
    { key: 'occupation', weight: 1, label: 'Occupation' },
    { key: 'industry', weight: 1, label: 'Industry' },
    { key: 'relationshipStatus', weight: 1, label: 'Relationship' },
    { key: 'lookingFor', weight: 1, label: 'Looking for' },
    { key: 'hobbies', weight: 1.5, label: 'Hobbies' },
    { key: 'interests', weight: 1.5, label: 'Interests' },
    { key: 'languages', weight: 1, label: 'Languages' },
    { key: 'prompts', weight: 1.5, label: 'Prompts' },
    { key: 'photos', weight: 1.5, label: 'Photo' },
    { key: 'username', weight: 1, label: 'Username' },
  ];

  function isFilled(val) {
    if (val == null || val === '') return false;
    if (Array.isArray(val)) return val.length > 0;
    if (typeof val === 'string') return val.trim().length > 0;
    return true;
  }

  function promptsFilled(dp) {
    const p = dp?.prompts;
    if (Array.isArray(p) && p.some((x) => String(x?.answer || x || '').trim())) return true;
    const ice = dp?.icebreakers || dp?.icebreakerAnswers;
    if (Array.isArray(ice) && ice.some((x) => String(x?.answer || x || '').trim())) return true;
    return false;
  }

  function interestsOrHobbies(dp) {
    return (
      isFilled(dp?.interests) ||
      isFilled(dp?.hobbies) ||
      isFilled(dp?.interestsFreeText) ||
      isFilled(dp?.hobbiesFreeText)
    );
  }

  function hasPhoto(dp, ctx) {
    if (dp?.photos?.length > 0) return true;
    if (isFilled(dp?.photoURL)) return true;
    return !!ctx.photoURL;
  }

  function cheapPostsFilled(ctx) {
    const keys = ['duniyaCount', 'peepalCount', 'postCount'];
    const present = keys.some((k) => ctx[k] != null && ctx[k] !== '');
    if (!present) return null;
    const n =
      Number(ctx.duniyaCount || 0) + Number(ctx.peepalCount || 0) + Number(ctx.postCount || 0);
    return n > 0;
  }

  function completionContext(dp, override) {
    const up = typeof userProfile !== 'undefined' ? userProfile || {} : {};
    const cu = typeof auth !== 'undefined' ? auth?.currentUser : null;
    const stats = up.stats || dp?.stats || {};
    const teenFn = typeof isTeenModeUser === 'function';
    return Object.assign(
      {
        teen: teenFn ? isTeenModeUser(up) : !!(up.teenMode || up.isMinor),
        profileType:
          (typeof getProfileType === 'function' ? getProfileType() : null) ||
          dp?.profileType ||
          up.profileType ||
          'personal',
        photoURL: dp?.photoURL || up.photoURL || cu?.photoURL || '',
        username: dp?.username || up.username || '',
        emailVerified: !!(up.emailVerified || cu?.emailVerified),
        phoneVerified: !!(up.phoneVerified || cu?.phoneNumber),
        duniyaCount: up.duniyaCount != null ? up.duniyaCount : stats.duniya,
        peepalCount: up.peepalCount != null ? up.peepalCount : stats.peepal,
        postCount: up.postCount != null ? up.postCount : stats.posts,
      },
      override || {}
    );
  }

  function scoreItems(items) {
    let earned = 0;
    let total = 0;
    const missing = [];
    items.forEach((it) => {
      total += it.weight;
      if (it.filled) earned += it.weight;
      else missing.push(it.label);
    });
    const pct = total ? Math.round((earned / total) * 100) : 100;
    return {
      pct: Math.max(0, Math.min(100, pct)),
      complete: total > 0 && earned >= total - 1e-9,
      missing,
    };
  }

  function calcProfileCompletion(dp, ctxOverride) {
    const profile = dp || (typeof digitalProfile !== 'undefined' ? digitalProfile : {}) || {};
    const ctx = completionContext(profile, ctxOverride);
    const photo = hasPhoto(profile, ctx);
    const hideRel = !!ctx.teen;

    const identity = scoreItems([
      { label: 'Photo', weight: 2, filled: photo },
      { label: 'Bio', weight: 2, filled: isFilled(profile.bio) },
      { label: 'Prompts', weight: 1.5, filled: promptsFilled(profile) },
    ]);

    const socialItems = [
      { label: 'City', weight: 2, filled: isFilled(profile.currentCity) || isFilled(profile.city) },
      { label: 'Languages', weight: 1, filled: isFilled(profile.languages) },
      { label: 'Interests', weight: 2, filled: interestsOrHobbies(profile) },
    ];
    const posts = cheapPostsFilled(ctx);
    if (posts != null) {
      socialItems.push({ label: 'A post', weight: 1, filled: posts });
    }
    const social = scoreItems(socialItems);

    const relationship = hideRel
      ? { pct: 100, complete: true, missing: [], hidden: true }
      : scoreItems([
          { label: 'Relationship status', weight: 1, filled: isFilled(profile.relationshipStatus) },
          { label: 'Looking for', weight: 1, filled: isFilled(profile.lookingFor) },
        ]);

    const isPro = String(ctx.profileType || '').toLowerCase() === 'professional';
    const careerItems = [
      { label: 'Occupation', weight: 1.5, filled: isFilled(profile.occupation) },
    ];
    if (isPro) {
      careerItems.push({
        label: 'Industry',
        weight: 1,
        filled: isFilled(profile.industry),
      });
    }
    const career = scoreItems(careerItems);

    const trust = scoreItems([
      { label: 'Username', weight: 1, filled: isFilled(ctx.username) || isFilled(profile.username) },
      { label: 'Photo', weight: 1, filled: photo },
      {
        label: 'Verified email or phone',
        weight: 1.5,
        filled: !!(ctx.emailVerified || ctx.phoneVerified),
      },
    ]);

    const sections = { identity, social, relationship, career, trust };
    const weights = hideRel ? TEEN_WEIGHTS : SECTION_WEIGHTS;
    let earned = 0;
    let total = 0;
    Object.keys(weights).forEach((id) => {
      const w = weights[id];
      total += w;
      earned += w * ((sections[id]?.pct || 0) / 100);
    });
    const pct = Math.round((earned / Math.max(total, 1e-9)) * 100);

    const missing = [];
    ['identity', 'social', hideRel ? null : 'relationship', 'career', 'trust']
      .filter(Boolean)
      .forEach((id) => {
        (sections[id].missing || []).forEach((m) => {
          if (!missing.includes(m)) missing.push(m);
        });
      });

    return {
      pct: Math.max(0, Math.min(100, pct)),
      missing,
      sections,
      hideRelationship: hideRel,
      filledCount: COMPLETION_FIELDS.length - missing.length,
      totalFields: COMPLETION_FIELDS.length,
    };
  }

  function persistProfileCompletion(stats) {
    if (!db || !currentUser || !stats) return;
    if (typeof assertOwnUid === 'function' && !assertOwnUid(currentUser.uid)) return;
    const sections = {};
    ['identity', 'social', 'relationship', 'career', 'trust'].forEach((id) => {
      const s = stats.sections?.[id] || {};
      sections[id] = {
        pct: s.pct || 0,
        complete: !!s.complete,
        hidden: !!s.hidden,
      };
    });
    db.collection('users')
      .doc(currentUser.uid)
      .set(
        {
          profileCompletion: {
            pct: stats.pct,
            sections,
          },
          profileCompletionUpdatedAt: firebase.firestore.FieldValue.serverTimestamp(),
        },
        { merge: true }
      )
      .catch(() => {});
    if (typeof trackProfileCompletion === 'function') trackProfileCompletion(stats);
  }

  function nextMissingHint(stats) {
    const miss = (stats.missing || []).slice(0, 2);
    if (!miss.length) return 'Looking good — this Profile feels like you.';
    if (miss.length === 1) return `Next: add ${miss[0]}`;
    return `Next: ${miss[0]}, ${miss[1]}`;
  }

  function refreshProfileCompletionUI() {
    if (typeof isProfilePreviewMode === 'function' && isProfilePreviewMode()) return calcProfileCompletion();
    const stats = calcProfileCompletion();
    persistProfileCompletion(stats);
    const displayPct =
      typeof playfulProfilePct === 'function' ? playfulProfilePct(stats.pct) : stats.pct;
    const hideBar = stats.pct >= 97;
    const collapseBar = stats.pct >= 91 && stats.pct < 97;
    const pctEl = document.querySelector('[data-ui="profile-completion-pct"]');
    const barEl = document.querySelector('[data-ui="profile-completion-bar"]');
    const hintEl = document.querySelector('[data-ui="profile-completion-hint"]');
    const completeWrap = document.querySelector('.dp-hero-complete');
    if (completeWrap) {
      completeWrap.style.display = hideBar ? 'none' : '';
      completeWrap.classList.toggle('is-collapsed', collapseBar);
    }
    if (pctEl) {
      pctEl.textContent = `${displayPct}%`;
      pctEl.style.color = '';
    }
    if (barEl) {
      barEl.style.width = `${stats.pct}%`;
      barEl.style.background = '';
    }
    if (hintEl) {
      hintEl.style.display = stats.pct >= 91 ? 'none' : '';
      hintEl.textContent = nextMissingHint(stats);
    }
    document.querySelectorAll('[data-complete-section]').forEach((row) => {
      const id = row.getAttribute('data-complete-section');
      const sec = stats.sections?.[id];
      if (!sec) return;
      if (id === 'relationship' && stats.hideRelationship) {
        row.hidden = true;
        row.setAttribute('hidden', 'true');
        return;
      }
      row.hidden = false;
      row.removeAttribute('hidden');
      const fill = row.querySelector('[data-section-bar]');
      const lab = row.querySelector('[data-section-pct]');
      if (fill) fill.style.width = `${sec.pct || 0}%`;
      if (lab) lab.textContent = `${sec.pct || 0}%`;
      row.classList.toggle('is-complete', !!sec.complete);
    });
    return stats;
  }

  const NUDGE_SESSION = 'chaupaal_profile_nudge_skip';
  const NUDGE_OFFERED = 'chaupaal_profile_nudge_offered';

  function profileNudgeSkippedThisSession() {
    try {
      return sessionStorage.getItem(NUDGE_SESSION) === '1' || sessionStorage.getItem(NUDGE_OFFERED) === '1';
    } catch (e) {
      return false;
    }
  }

  function skipProfileNudgeThisSession() {
    try {
      sessionStorage.setItem(NUDGE_SESSION, '1');
    } catch (e) {}
  }

  function maybeOfferProfileCompleteNudge(opts) {
    const reason = opts?.reason || 'edit';
    if (typeof isProfilePreviewMode === 'function' && isProfilePreviewMode()) return false;
    if (profileNudgeSkippedThisSession()) return false;
    const stats = calcProfileCompletion();
    if (stats.pct >= 91) return false;
    const identityEmpty = !stats.sections?.identity?.complete;
    const photoMissing = (stats.missing || []).includes('Photo');
    if (!identityEmpty && reason !== 'signup') return false;
    if (reason === 'signup' && !photoMissing && stats.sections?.identity?.pct >= 50) return false;

    try {
      sessionStorage.setItem(NUDGE_OFFERED, '1');
    } catch (e) {}
    const host = document.querySelector('.device') || document.body;
    document.getElementById('profileCompleteNudgeSheet')?.remove();
    const sheet = document.createElement('div');
    sheet.id = 'profileCompleteNudgeSheet';
    sheet.className = 'archive-overlay profile-complete-nudge';
    sheet.setAttribute('data-nav-managed', '1');
    const next = (stats.missing || []).slice(0, 2);
    const line = photoMissing
      ? 'A photo helps people recognise you — totally optional.'
      : next.length
        ? `Finish Identity — add ${next.join(' & ').toLowerCase()}.`
        : 'Add a bio whenever you like. No rush.';
    sheet.innerHTML = `
      <div class="archive-header">
        <button type="button" data-overlay-dismiss aria-label="Not now">←</button>
        <div style="flex:1"><strong>Make it feel like you</strong></div>
      </div>
      <div style="padding:18px 16px 24px;">
        <p style="font-size:14px;line-height:1.5;margin:0 0 16px;color:var(--ink);">${line}</p>
        <button type="button" class="btn btn--primary btn--block" data-nudge-edit>Open Profile Edit</button>
        <button type="button" class="auth-guest-btn" data-nudge-skip style="margin-top:10px;">Not now</button>
      </div>
    `;
    const finishSkip = () => {
      skipProfileNudgeThisSession();
      if (typeof close === 'function') close();
    };
    let closer = { close: () => sheet.remove() };
    try {
      if (typeof openLayer === 'function') closer = openLayer(sheet, finishSkip, { host });
      else host.appendChild(sheet);
    } catch (e) {
      host.appendChild(sheet);
    }
    const close = () => {
      try {
        closer.close();
      } catch (e) {
        sheet.remove();
      }
    };
    sheet.querySelector('[data-overlay-dismiss]')?.addEventListener('click', () => {
      skipProfileNudgeThisSession();
      close();
    });
    sheet.querySelector('[data-nudge-skip]')?.addEventListener('click', () => {
      skipProfileNudgeThisSession();
      close();
    });
    sheet.querySelector('[data-nudge-edit]')?.addEventListener('click', () => {
      skipProfileNudgeThisSession();
      close();
      if (typeof showTab === 'function') showTab('profile');
      else document.getElementById('profileModal')?.classList.remove('hidden');
      if (typeof renderProfileModal === 'function') renderProfileModal();
    });
    return true;
  }

  const api = {
    COMPLETION_FIELDS,
    SECTION_META,
    calcProfileCompletion,
    persistProfileCompletion,
    refreshProfileCompletionUI,
    maybeOfferProfileCompleteNudge,
    skipProfileNudgeThisSession,
    profileNudgeSkippedThisSession,
  };

  if (typeof window !== 'undefined') {
    window.COMPLETION_FIELDS = COMPLETION_FIELDS;
    window.PROFILE_SECTION_META = SECTION_META;
    window.calcProfileCompletion = calcProfileCompletion;
    window.persistProfileCompletion = persistProfileCompletion;
    window.refreshProfileCompletionUI = refreshProfileCompletionUI;
    window.maybeOfferProfileCompleteNudge = maybeOfferProfileCompleteNudge;
    window.skipProfileNudgeThisSession = skipProfileNudgeThisSession;
    window.profileNudgeSkippedThisSession = profileNudgeSkippedThisSession;
  }
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = api;
  }
})();
