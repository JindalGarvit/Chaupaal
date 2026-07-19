/**
 * Profile completion rewards (micro + milestone celebrations).
 * Builds on Phase 3 calcProfileCompletion — non-blocking toast strip, no modal.
 */
(function () {
  const MILESTONES = [
    { pct: 25, id: 'm25', title: 'Getting to know you 🌱', blurb: 'First quarter done — the Chaupaal is starting to recognise you.' },
    { pct: 50, id: 'm50', title: 'Finding your circle 🌿', blurb: 'Halfway. Discovery has enough to stop guessing.' },
    { pct: 75, id: 'm75', title: 'Almost there 🔥', blurb: 'Three-quarters filled — Peepal matching gets serious from here.' },
    { pct: 100, id: 'm100', title: 'Chaupaal Regular ✅', blurb: 'Full profile. You show up complete — and matching can use everything.' },
  ];

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

  /**
   * Call after a field save when the field newly becomes filled.
   */
  async function celebrateSectionComplete(fieldName, value) {
    const fact =
      typeof getProfileFact === 'function'
        ? await getProfileFact(fieldName, value)
        : { line: 'Section saved.', unlockHint: null };
    if (typeof SoundLib !== 'undefined' && SoundLib.sectionComplete) SoundLib.sectionComplete();
    if (typeof launchConfetti === 'function') launchConfetti({ x: 50, y: 42 }, 28);
    if (typeof haptic === 'function') haptic('success');
    const label =
      (typeof COMPLETION_FIELDS !== 'undefined' &&
        COMPLETION_FIELDS.find((f) => f.key === fieldName || (f.aliases || []).includes(fieldName))?.label) ||
      fieldName;
    showRewardToast({
      title: `${label} ✓`,
      line: fact.line,
      trivia: fact.trivia || null,
      unlockHint: fact.unlockHint,
      durationMs: fact.trivia ? 3400 : 2600,
    });
  }

  function celebrateMilestones(pct) {
    const unlocked = loadUnlocked();
    const newly = [];
    MILESTONES.forEach((m) => {
      if (pct >= m.pct && !unlocked.includes(m.id)) newly.push(m);
    });
    if (!newly.length) return;
    const ids = unlocked.concat(newly.map((m) => m.id));
    saveUnlocked(ids);
    // Persist badge titles on user doc (best-effort)
    if (db && currentUser) {
      const titles = MILESTONES.filter((m) => ids.includes(m.id)).map((m) => m.title);
      db.collection('users')
        .doc(currentUser.uid)
        .set({ profileBadges: titles, profileMilestoneIds: ids }, { merge: true })
        .catch(() => {});
    }
    // Show highest new milestone only (distinct achievement, not a stack)
    const top = newly.sort((a, b) => b.pct - a.pct)[0];
    if (typeof SoundLib !== 'undefined' && SoundLib.milestone) SoundLib.milestone();
    if (typeof launchConfetti === 'function') launchConfetti({ x: 50, y: 35 }, 70);
    if (typeof haptic === 'function') haptic('success');
    showRewardToast({
      title: `Unlocked: ${top.title}`,
      line: top.blurb,
      milestoneTitle: `${top.pct}% profile`,
      unlockHint: top.pct >= 75 ? 'Peepal matching can use your full profile signals.' : null,
      durationMs: 3800,
    });
  }

  /**
   * Hook from saveProfileField — only celebrates empty→filled transitions.
   */
  async function onProfileFieldSaved(fieldName, value, prevSnapshot) {
    const newlyFilled = wasEmpty(prevSnapshot, fieldName) && isNowFilled(value);
    if (newlyFilled) {
      await celebrateSectionComplete(fieldName, value);
    }
    const stats = typeof calcProfileCompletion === 'function' ? calcProfileCompletion() : null;
    if (stats) celebrateMilestones(stats.pct);
  }

  window.PROFILE_MILESTONES = MILESTONES;
  window.celebrateSectionComplete = celebrateSectionComplete;
  window.celebrateMilestones = celebrateMilestones;
  window.onProfileFieldSaved = onProfileFieldSaved;
  window.getUnlockedProfileMilestones = loadUnlocked;
  window.showRewardToast = showRewardToast;
})();
