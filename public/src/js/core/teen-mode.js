/**
 * Teen Mode + age helpers (Phase 2; Global L8 rules in core/compliance.js).
 * Hard line: under 13 → no account. Under 18 → Teen mode everywhere, lifted on the 18th birthday.
 * Parental consent (where the region's law needs it) unlocks consent-dependent processing only.
 */
(function () {
  'use strict';

  const DEVICE_ID_KEY = 'chaupaal_device_id';
  const LAST_USER_KEY = 'chaupaal_last_user';
  const C = () => (typeof ChaupaalCompliance !== 'undefined' ? ChaupaalCompliance : null);
  const country = () => {
    try {
      return typeof ChaupaalPrivacy !== 'undefined' ? ChaupaalPrivacy.region().country : null;
    } catch (e) {
      return null;
    }
  };

  /** Whole years, birthday-exact (0 when unknown — callers treat 0 as "no DOB"). */
  function ageFromDob(dob) {
    const c = C();
    if (c) return c.exactAge(dob) || 0;
    if (!dob) return 0;
    const d = dob instanceof Date ? dob : new Date(dob);
    if (Number.isNaN(d.getTime())) return 0;
    return Math.floor((Date.now() - d.getTime()) / (365.25 * 86400000));
  }

  function getOrCreateDeviceId() {
    try {
      let id = localStorage.getItem(DEVICE_ID_KEY);
      if (!id) {
        id =
          'dev_' +
          Math.random().toString(36).slice(2) +
          '_' +
          Date.now().toString(36);
        localStorage.setItem(DEVICE_ID_KEY, id);
      }
      return id;
    } catch (e) {
      return 'dev_ephemeral';
    }
  }

  function rememberLastUser(profile) {
    if (!profile) return;
    try {
      localStorage.setItem(
        LAST_USER_KEY,
        JSON.stringify({
          uid: profile.uid || null,
          username: profile.username || null,
          name: profile.name || profile.displayName || null,
          photoURL: profile.photoURL || null,
          deviceId: getOrCreateDeviceId(),
          at: Date.now(),
        })
      );
    } catch (e) {}
  }

  function readLastUser() {
    try {
      return JSON.parse(localStorage.getItem(LAST_USER_KEY) || 'null');
    } catch (e) {
      return null;
    }
  }

  function clearLastUser() {
    try {
      localStorage.removeItem(LAST_USER_KEY);
    } catch (e) {}
  }

  function isMinorAge(age) {
    return age > 0 && age < 18;
  }

  function isBlockedAge(age) {
    return age > 0 && age < 13;
  }

  function isTeenAge(age) {
    return age >= 13 && age < 18;
  }

  function userAge(userOrProfile) {
    const u = userOrProfile || (typeof userProfile !== 'undefined' ? userProfile : null) || {};
    const c = C();
    if (c) return c.ageOf(u).age || 0;
    if (Number.isFinite(u.age) && u.age > 0) return Number(u.age);
    return ageFromDob(u.dob || u.dateOfBirth || u.profile?.dateOfBirth);
  }

  function me() {
    return typeof userProfile !== 'undefined' ? userProfile : null;
  }

  /** Under 18 by DOB (teen flags only when there is no DOB). Consent never lifts it; the 18th birthday does. */
  function isTeenModeUser(userOrProfile) {
    const u = userOrProfile || me();
    if (!u) return false;
    const c = C();
    if (c) return c.isTeen(u, { country: country() });
    return u.teenMode === true || u.isMinor === true || isMinorAge(userAge(u));
  }

  /** Below the region's digital consent age where its law needs a parent (IN, EU consent basis …). */
  function needsParentalConsent(userOrProfile) {
    const u = userOrProfile || me();
    if (!u) return false;
    const c = C();
    if (c) return c.ageInfo(u, { country: country() }).needsParentalConsent;
    return isTeenAge(userAge(u)) && !u.parentalConsent?.verified;
  }

  function teenHideDatingIntents() {
    return isTeenModeUser();
  }

  /** Teens and adults never DM as strangers; teen ↔ teen strangers only when the recipient allows it. */
  function canMessageTarget(targetUser, relationshipState) {
    const c = C();
    if (c) return c.canMessage(me() || {}, targetUser || {}, relationshipState || {}, { country: country() });
    const meTeen = isTeenModeUser();
    const themTeen = isTeenModeUser(targetUser);
    if (relationshipState?.friend || (!meTeen && !themTeen)) return { ok: true };
    return { ok: false, reason: meTeen ? 'teen_adult_stranger' : 'adult_teen_stranger' };
  }

  function teenMessageBlockedToast(reason) {
    if (typeof showToast !== 'function') return;
    showToast(
      reason === 'teen_adult_stranger'
        ? t('settings.teen_mode_message_friends_or_other')
        : reason === 'teen_friends_only'
          ? t('privacy.teen_friends_only_toast')
          : t('settings.this_teen_can_only_be_messaged')
    );
  }

  /**
   * Gate DM / Say hi before creating a chat.
   * @returns {Promise<boolean>} true if messaging is allowed
   */
  async function assertCanMessage(targetUserOrUid) {
    if (typeof canMessageTarget !== 'function') return true;
    const target =
      typeof targetUserOrUid === 'string'
        ? { uid: targetUserOrUid }
        : targetUserOrUid || {};
    const uid = target.uid;
    if (!uid) return true;
    let rel = { friend: !!target.isFriend };
    try {
      if (typeof hydrateRelationships === 'function') {
        const states = await hydrateRelationships([uid]).catch(() => ({}));
        if (states?.[uid]) rel = states[uid];
      } else if (typeof relationshipState === 'function') {
        rel = relationshipState(uid) || rel;
      }
    } catch (e) {}
    // Enrich teen flags from users_public when possible
    let peer = { ...target };
    try {
      if (typeof db !== 'undefined' && db && (!peer.teenMode && peer.age == null && !peer.dob)) {
        const snap = await db.collection('users_public').doc(uid).get();
        if (snap.exists) {
          const d = snap.data() || {};
          peer = {
            ...peer,
            teenMode: d.teenMode,
            isMinor: d.isMinor,
            age: d.age,
            dob: d.dob || d.dateOfBirth,
            parentalConsent: d.parentalConsent,
            privacy: { teenNonFriendDms: d.teenDmsOpen === true },
          };
        }
      }
    } catch (e) {}
    const gate = canMessageTarget(peer, rel);
    if (!gate.ok) {
      teenMessageBlockedToast(gate.reason);
      return false;
    }
    return true;
  }

  /** Location never visible to non-friends (app-wide). */
  function canSeeLocation(relationshipState) {
    return !!(relationshipState?.friend);
  }

  function teenAiSystemHint() {
    if (!isTeenModeUser()) return '';
    // LLM system prompt (model instructions, not UI copy).
    return (
      ' The user is under 18 (Teen Mode). Keep replies warm, age-appropriate, and non-suggestive. ' + // i18n-ignore
      'Avoid dating/romance coaching, sexual content, or adult meetups. Prefer hobbies, school, friendship, and safety.' // i18n-ignore
    );
  }

  const TEEN_HIDDEN_PEEPAL_HINTS = [
    'date',
    'dating',
    'marriage',
    'marry',
    'job',
    'career',
    'hire',
    'co-founder',
    'cofounder',
    'networking',
  ];

  function filterPeepalSearchNudges(root) {
    if (!teenHideDatingIntents()) return;
    const scope = root || document;
    scope.querySelectorAll('#peepalSearchNudges .peepal-nudge-chip,[data-hint]').forEach((chip) => {
      const hint = String(chip.getAttribute('data-hint') || chip.textContent || '').toLowerCase();
      if (TEEN_HIDDEN_PEEPAL_HINTS.some((k) => hint.includes(k))) {
        chip.classList.add('hidden');
        chip.setAttribute('hidden', 'true');
      }
    });
  }

  window.ageFromDob = ageFromDob;
  window.userAge = userAge;
  window.isMinorAge = isMinorAge;
  window.isBlockedAge = isBlockedAge;
  window.isTeenAge = isTeenAge;
  window.isTeenModeUser = isTeenModeUser;
  window.teenHideDatingIntents = teenHideDatingIntents;
  window.needsParentalConsent = needsParentalConsent;
  window.canMessageTarget = canMessageTarget;
  window.assertCanMessage = assertCanMessage;
  window.teenMessageBlockedToast = teenMessageBlockedToast;
  window.canSeeLocation = canSeeLocation;
  window.teenAiSystemHint = teenAiSystemHint;
  window.filterPeepalSearchNudges = filterPeepalSearchNudges;
  window.getOrCreateDeviceId = getOrCreateDeviceId;
  window.rememberLastUser = rememberLastUser;
  window.readLastUser = readLastUser;
  window.clearLastUser = clearLastUser;

  function openParentalConsentSheet() {
    if (typeof showAuthScreen === 'function') {
      showAuthScreen('authParentalConsentScreen');
      return;
    }
    const el = document.getElementById('authParentalConsentScreen');
    if (el) {
      document.querySelectorAll('.auth-form-screen').forEach((s) => s.classList.add('hidden'));
      el.classList.remove('hidden');
      document.getElementById('authOverlay')?.classList.remove('hidden');
    } else if (typeof showToast === 'function') {
      showToast(t('settings.ask_a_parent_to_verify_your'));
    }
  }
  window.openParentalConsentSheet = openParentalConsentSheet;
})();
