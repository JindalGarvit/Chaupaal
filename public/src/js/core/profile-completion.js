/**
 * Profile completion % (Phase 3).
 *
 * One shared definition of "what counts as filled" so profile modal, discovery
 * gating, and Analytics (Phase 5) stay consistent. Weights favor fields that
 * help matching (bio, city, interests) over niche demographics.
 *
 * Persists `profileCompletion` on users/{uid} for server-side filtering later.
 */
(function () {
  /** Ordered checklist — keep in sync with profile editor sections. */
  const COMPLETION_FIELDS = [
    { key: 'displayName', weight: 1, label: 'Name' },
    { key: 'bio', weight: 1.5, label: 'Bio' },
    { key: 'dateOfBirth', weight: 1, label: 'Birthday' },
    { key: 'gender', weight: 0.5, label: 'Gender' },
    { key: 'currentCity', weight: 1.5, label: 'City' },
    { key: 'occupation', weight: 1, label: 'Occupation' },
    { key: 'highestEducation', weight: 0.5, label: 'Education', aliases: ['education'] },
    { key: 'relationshipStatus', weight: 1, label: 'Relationship' },
    { key: 'diet', weight: 0.5, label: 'Diet' },
    { key: 'hobbies', weight: 1.5, label: 'Hobbies' },
    { key: 'interests', weight: 1.5, label: 'Interests' },
    { key: 'lifeGoals', weight: 1, label: 'Goals', aliases: ['dreams'] },
    { key: 'mbti', weight: 0.5, label: 'Personality' },
    { key: 'languages', weight: 1, label: 'Languages' },
    { key: 'prompts', weight: 1.5, label: 'Prompts' },
  ];

  function fieldValue(dp, def) {
    if (!dp) return null;
    if (dp[def.key] != null && dp[def.key] !== '') return dp[def.key];
    for (const a of def.aliases || []) {
      if (dp[a] != null && dp[a] !== '') return dp[a];
    }
    return null;
  }

  function isFilled(val) {
    if (val == null || val === '') return false;
    if (Array.isArray(val)) return val.length > 0;
    if (typeof val === 'string') return val.trim().length > 0;
    return true;
  }

  function calcProfileCompletion(dp = typeof digitalProfile !== 'undefined' ? digitalProfile : {}) {
    let earned = 0;
    let total = 0;
    const missing = [];
    COMPLETION_FIELDS.forEach((def) => {
      total += def.weight;
      if (isFilled(fieldValue(dp, def))) earned += def.weight;
      else missing.push(def.label);
    });
    // Bonus slots: photo + family + profile media strip
    total += 3;
    if (dp.photos?.length > 0 || (typeof userProfile !== 'undefined' && userProfile?.photoURL)) earned += 1;
    else missing.push('Photo');
    if (dp.family?.length > 0) earned += 1;
    try {
      const media = JSON.parse(localStorage.getItem('chaupaal_profile_media') || '[]');
      if (media.length > 0 || (dp.profileMedia && dp.profileMedia.length > 0)) earned += 1;
      else missing.push('Profile media');
    } catch (e) {
      missing.push('Profile media');
    }

    const pct = Math.round((earned / total) * 100);
    return {
      pct: Math.max(0, Math.min(100, pct)),
      missing,
      filledCount: COMPLETION_FIELDS.length - missing.filter((m) => !['Photo'].includes(m)).length,
      totalFields: COMPLETION_FIELDS.length + 2,
    };
  }

  function persistProfileCompletion(stats) {
    if (!db || !currentUser || !stats) return;
    if (typeof assertOwnUid === 'function' && !assertOwnUid(currentUser.uid)) return;
    db.collection('users')
      .doc(currentUser.uid)
      .set(
        {
          profileCompletion: stats.pct,
          profileCompletionUpdatedAt: firebase.firestore.FieldValue.serverTimestamp(),
        },
        { merge: true }
      )
      .catch(() => {});
    if (typeof trackProfileCompletion === 'function') trackProfileCompletion(stats);
  }

  /** Call after profile field edits. */
  function refreshProfileCompletionUI() {
    const stats = calcProfileCompletion();
    persistProfileCompletion(stats);
    const pctEl = document.querySelector('[data-ui="profile-completion-pct"]');
    const barEl = document.querySelector('[data-ui="profile-completion-bar"]');
    const hintEl = document.querySelector('[data-ui="profile-completion-hint"]');
    if (pctEl) {
      pctEl.textContent = `${stats.pct}%`;
      pctEl.style.color = stats.pct >= 80 ? 'var(--green)' : 'var(--red)';
    }
    if (barEl) {
      barEl.style.width = `${stats.pct}%`;
      barEl.style.background = stats.pct >= 80 ? '#2ECC71' : 'var(--red)';
    }
    if (hintEl) {
      hintEl.style.display = stats.pct < 60 ? '' : 'none';
      if (stats.missing.length) {
        hintEl.textContent = `Add ${stats.missing.slice(0, 3).join(', ')} to improve discovery ✨`;
      }
    }
    return stats;
  }

  window.COMPLETION_FIELDS = COMPLETION_FIELDS;
  window.calcProfileCompletion = calcProfileCompletion;
  window.persistProfileCompletion = persistProfileCompletion;
  window.refreshProfileCompletionUI = refreshProfileCompletionUI;
})();
