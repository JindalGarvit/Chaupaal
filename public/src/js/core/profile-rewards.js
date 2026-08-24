/**
 * Profile completion rewards (micro + milestone celebrations).
 * Builds on Phase 3 calcProfileCompletion — non-blocking toast strip, no modal.
 */
(function () {
  const MILESTONES = [
    { pct: 15, id: 'm15', title: 'First sparks ✨', blurb: 'You started. Matchmaking already has a little more to work with.' },
    { pct: 47, id: 'm47', title: 'Getting interesting 🌿', blurb: 'Almost halfway — discovery stops guessing as hard.' },
    { pct: 72, id: 'm72', title: 'Looking sharp 🔥', blurb: 'Solid profile energy. Nearby & Peepal get smarter from here.' },
    { pct: 91, id: 'm91', title: 'Nearly complete 💫', blurb: 'Over 91% — progress bar softens; you\'re basically there.' },
    { pct: 97, id: 'm97', title: 'Chaupaal Regular ✅', blurb: '97%+ — we\'ll tuck the progress chrome away. You show up complete.' },
  ];

  function playfulPct(real) {
    // Playful display: keep real underneath but nudge display off round tens sometimes
    if (real >= 97) return real;
    if (real >= 91) return Math.min(96, real + (real % 3 === 0 ? 1 : 0));
    const jitter = [0, 1, -1, 2][real % 4];
    return Math.max(0, Math.min(96, real + jitter));
  }

  const STORAGE_KEY = 'chaupaal_profile_milestones';

  function loadUnlocked() {
    try {
      return JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]');
    } catch {
      return [];
    }
  }

  function saveUnlocked(ids) {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(ids));
    } catch (e) {}
  }

  function ensureToastStyles() {
    if (document.getElementById('profileRewardStyles')) return;
    const s = document.createElement('style');
    s.id = 'profileRewardStyles';
    s.textContent = `
      .profile-reward-toast{
        position:absolute;left:12px;right:12px;bottom:88px;z-index:120;
        background:rgba(28,28,28,0.94);color:#fff;border-radius:16px;
        padding:12px 14px;font-family:Inter,sans-serif;
        box-shadow:0 10px 28px rgba(0,0,0,0.25);
        animation:prSlideIn .28s ease-out;
        pointer-events:none;
      }
      .profile-reward-toast.milestone{
        background:linear-gradient(135deg,#1c1c1c 0%,#3d1f1f 100%);
        border:1px solid rgba(230,57,70,0.45);
      }
      .profile-reward-toast .pr-title{font-family:Space Grotesk,sans-serif;font-weight:700;font-size:14px;margin-bottom:4px;}
      .profile-reward-toast .pr-line{font-size:12px;line-height:1.4;opacity:0.92;}
      .profile-reward-toast .pr-trivia{font-size:11px;line-height:1.4;opacity:0.78;margin-top:6px;font-style:italic;}
      .profile-reward-toast .pr-unlock{font-size:11px;margin-top:6px;color:#FFC93C;font-weight:600;}
      .profile-reward-toast .pr-badge{display:inline-block;font-size:11px;font-weight:700;background:rgba(255,255,255,0.12);padding:3px 8px;border-radius:999px;margin-bottom:6px;}
      @keyframes prSlideIn{from{transform:translateY(12px);opacity:0}to{transform:none;opacity:1}}
    `;
    document.head.appendChild(s);
  }

  function showRewardToast({ title, line, trivia, unlockHint, milestoneTitle, durationMs = 2800 }) {
    ensureToastStyles();
    const host = document.querySelector('.device');
    if (!host) {
      if (typeof showToast === 'function') showToast(line || title);
      return;
    }
    host.querySelectorAll('.profile-reward-toast').forEach((el) => el.remove());
    const el = document.createElement('div');
    el.className = 'profile-reward-toast' + (milestoneTitle ? ' milestone' : '');
    el.innerHTML = `
      ${milestoneTitle ? `<div class="pr-badge">${milestoneTitle}</div>` : ''}
      <div class="pr-title">${title || 'Nice!'}</div>
      <div class="pr-line">${line || ''}</div>
      ${trivia ? `<div class="pr-trivia">${trivia}</div>` : ''}
      ${unlockHint ? `<div class="pr-unlock">${unlockHint}</div>` : ''}
    `;
    host.appendChild(el);
    setTimeout(() => el.remove(), durationMs);
  }

  function wasEmpty(prev, field) {
    if (!prev) return true;
    const v = prev[field];
    if (v == null || v === '') return true;
    if (Array.isArray(v)) return v.length === 0;
    return false;
  }

  function isNowFilled(value) {
    if (value == null || value === '') return false;
    if (Array.isArray(value)) return value.length > 0;
    if (typeof value === 'string') return value.trim().length > 0;
    return true;
  }

  const SECTION_STORAGE = 'chaupaal_profile_section_done';

  function isQuietMotion() {
    return (
      document.documentElement.classList.contains('quiet-mode') ||
      (typeof Quiet !== 'undefined' && Quiet?.motion === false)
    );
  }

  function smallBurst() {
    if (isQuietMotion()) return;
    if (typeof launchConfetti === 'function') launchConfetti({ x: 50, y: 42 }, 16);
  }

  function bigBurst() {
    if (isQuietMotion()) return;
    if (typeof launchConfetti === 'function') launchConfetti({ x: 50, y: 35 }, 70);
  }

  function loadSectionDone() {
    try {
      return JSON.parse(localStorage.getItem(SECTION_STORAGE) || '[]');
    } catch {
      return [];
    }
  }

  function saveSectionDone(ids) {
    try {
      localStorage.setItem(SECTION_STORAGE, JSON.stringify(ids));
    } catch (e) {}
  }

  /** Field newly filled — toast + fact, no confetti (not every keystroke). */
  async function celebrateFieldFill(fieldName, value) {
    const fact =
      typeof getProfileFact === 'function'
        ? await getProfileFact(fieldName, value)
        : { line: 'Saved.', unlockHint: null };
    document.querySelectorAll(`[data-key="${fieldName}"]`).forEach((el) => {
      el.classList.add('dp-field-saved-pop');
      setTimeout(() => el.classList.remove('dp-field-saved-pop'), 700);
    });
    const label =
      (typeof COMPLETION_FIELDS !== 'undefined' &&
        COMPLETION_FIELDS.find((f) => f.key === fieldName || (f.aliases || []).includes(fieldName))?.label) ||
      fieldName;
    showRewardToast({
      title: `${label} ✓`,
      line: fact.line,
      trivia: fact.trivia || null,
      unlockHint: fact.unlockHint,
      durationMs: fact.trivia ? 3200 : 2400,
    });
  }

  async function celebrateProfileSection(sectionId) {
    const names = { identity: 'Identity', social: 'Social', relationship: 'Relationship', career: 'Career', trust: 'Trust' };
    const fact =
      typeof getSectionCompleteFact === 'function'
        ? await getSectionCompleteFact(sectionId)
        : typeof getProfileFact === 'function'
          ? await getProfileFact(sectionId, sectionId)
          : { line: 'Section complete.' };
    const quiet = isQuietMotion();
    if (!quiet && typeof SoundLib !== 'undefined' && SoundLib.sectionComplete) SoundLib.sectionComplete();
    smallBurst();
    if (typeof haptic === 'function') haptic('success');
    const emoji = { identity: '✨', social: '🌿', relationship: '💫', career: '🎯', trust: '🔒' }[sectionId] || '✨';
    showRewardToast({
      title: `${emoji} ${names[sectionId] || sectionId} complete`,
      line: fact.line,
      trivia: fact.trivia || null,
      durationMs: 3200,
    });
  }

  /** Back-compat name: field fill used to fire a section burst — keep export, quieter now. */
  async function celebrateSectionComplete(fieldName, value) {
    await celebrateFieldFill(fieldName, value);
  }

  function celebrateNewlyCompletedSections(prevStats, nextStats) {
    if (!nextStats?.sections) return;
    const done = loadSectionDone();
    const newly = [];
    ['identity', 'social', 'relationship', 'career', 'trust'].forEach((id) => {
      const next = nextStats.sections[id];
      const prev = prevStats?.sections?.[id];
      if (next?.hidden) return;
      if (next?.complete && !prev?.complete && !done.includes(id)) newly.push(id);
    });
    if (!newly.length) return;
    saveSectionDone(done.concat(newly));
    newly.forEach((id) => celebrateProfileSection(id));
  }

  function celebrateMilestones(pct) {
    const unlocked = loadUnlocked();
    const newly = [];
    MILESTONES.forEach((m) => {
      if (pct >= m.pct && !unlocked.includes(m.id)) newly.push(m);
    });
    // Cosmetics tied to completion (Phase 2)
    let cosmeticHint = '';
    if (typeof DigitalLayout?.unlockCosmeticIds === 'function') {
      const cosIds = DigitalLayout.unlockCosmeticIds(pct);
      const theme = DigitalLayout.getProfileTheme();
      const had = new Set(theme.unlocked || []);
      const freshCos = cosIds.filter((id) => !had.has(id));
      if (freshCos.length) {
        DigitalLayout.persistProfileTheme({ unlocked: [...new Set([...(theme.unlocked || []), ...cosIds])] });
        const names = {
          mango: 'Mango palette',
          neem: 'Neem palette',
          indigo: 'Indigo palette',
          neon: 'Neon Frame',
          arcade: 'Arcade frame',
          pulse: 'Pulse ring',
          spark: 'Spark ring',
        };
        cosmeticHint = `Unlocked: ${names[freshCos[freshCos.length - 1]] || freshCos[freshCos.length - 1]}`;
      }
    }
    if (!newly.length && !cosmeticHint) return;
    if (newly.length) {
      const ids = unlocked.concat(newly.map((m) => m.id));
      saveUnlocked(ids);
      if (db && currentUser) {
        const titles = MILESTONES.filter((m) => ids.includes(m.id)).map((m) => m.title);
        db.collection('users')
          .doc(currentUser.uid)
          .set({ profileBadges: titles, profileMilestoneIds: ids }, { merge: true })
          .catch(() => {});
      }
      const top = newly.sort((a, b) => b.pct - a.pct)[0];
      const big = top.pct >= 97;
      if (!isQuietMotion() && typeof SoundLib !== 'undefined' && SoundLib.milestone) SoundLib.milestone();
      if (big) bigBurst();
      if (typeof haptic === 'function') haptic('success');
      showRewardToast({
        title: `Unlocked: ${top.title}`,
        line: top.blurb,
        milestoneTitle: `${playfulPct(top.pct)}% vibes`,
        unlockHint: cosmeticHint || (top.pct >= 97 ? 'You show up complete — chrome tucks away.' : 'Every field helps people find you.'),
        durationMs: 3800,
      });
      return;
    }
    if (cosmeticHint) {
      if (!isQuietMotion()) smallBurst();
      showRewardToast({
        title: cosmeticHint,
        line: 'Equip it from Digital → Base palette.',
        unlockHint: 'Pride cosmetics for your Base.',
        durationMs: 3200,
      });
    }
  }

  /**
   * Hook from saveProfileField — field toast on empty→filled; burst only when a section completes.
   */
  async function onProfileFieldSaved(fieldName, value, prevSnapshot) {
    const prevStats =
      typeof calcProfileCompletion === 'function' ? calcProfileCompletion(prevSnapshot || {}) : null;
    const newlyFilled = wasEmpty(prevSnapshot, fieldName) && isNowFilled(value);
    if (newlyFilled) {
      await celebrateFieldFill(fieldName, value);
    }
    const stats = typeof calcProfileCompletion === 'function' ? calcProfileCompletion() : null;
    if (stats) {
      celebrateNewlyCompletedSections(prevStats, stats);
      celebrateMilestones(stats.pct);
    }
  }

  window.PROFILE_MILESTONES = MILESTONES;
  window.playfulProfilePct = playfulPct;
  window.celebrateSectionComplete = celebrateSectionComplete;
  window.celebrateFieldFill = celebrateFieldFill;
  window.celebrateProfileSection = celebrateProfileSection;
  window.celebrateMilestones = celebrateMilestones;
  window.onProfileFieldSaved = onProfileFieldSaved;
  window.getUnlockedProfileMilestones = loadUnlocked;
  window.showRewardToast = showRewardToast;
})();
