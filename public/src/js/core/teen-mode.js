/**
 * Teen Mode + age helpers (Phase 2).
 * Hard line: under 13 blocked. 13–17 = teen until parentalConsent verified.
 * Pure gates live in teen-gates.js (ChaupaalTeenGates).
 */
(function () {
  'use strict';

  const DEVICE_ID_KEY = 'chaupaal_device_id';
  const LAST_USER_KEY = 'chaupaal_last_user';
  const G = typeof ChaupaalTeenGates !== 'undefined' ? ChaupaalTeenGates : null;

  function ageFromDob(dob) {
    return G ? G.ageFromDob(dob) : 0;
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
    return G ? G.isMinorAge(age) : age > 0 && age < 18;
  }

  function isBlockedAge(age) {
    return G ? G.isBlockedAge(age) : age > 0 && age < 13;
  }

  function isTeenAge(age) {
    return G ? G.isTeenAge(age) : age >= 13 && age < 18;
  }

  function userAge(userOrProfile) {
    const u = userOrProfile || (typeof userProfile !== 'undefined' ? userProfile : null) || {};
    return G ? G.userAge(u) : 0;
  }

  function isTeenModeUser(userOrProfile) {
    const u = userOrProfile || (typeof userProfile !== 'undefined' ? userProfile : null);
    return G ? G.isTeenModeUser(u) : false;
  }

  function needsParentalConsent(userOrProfile) {
    const u = userOrProfile || (typeof userProfile !== 'undefined' ? userProfile : null);
    return G ? G.needsParentalConsent(u) : false;
  }

  function teenHideDatingIntents() {
    return isTeenModeUser();
  }

  /** Minors may only be messaged by other minors or reciprocal friends. */
  function canMessageTarget(targetUser, relationshipState) {
    const me = typeof userProfile !== 'undefined' ? userProfile : null;
    if (G) return G.canMessageTarget(me, targetUser, relationshipState);
    return { ok: true };
  }

  function teenMessageBlockedToast(reason) {
    if (typeof showToast !== 'function') return;
    showToast(
      reason === 'teen_adult_stranger'
        ? 'Teen Mode: message friends (or other teens) only'
        : 'This teen can only be messaged by friends'
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
    return G ? G.canSeeLocation(relationshipState) : !!(relationshipState?.friend);
  }

  function teenAiSystemHint() {
    if (!isTeenModeUser()) return '';
    return (
      ' The user is under 18 (Teen Mode). Keep replies warm, age-appropriate, and non-suggestive. ' +
      'Avoid dating/romance coaching, sexual content, or adult meetups. Prefer hobbies, school, friendship, and safety.'
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
      showToast('Ask a parent to verify your account in Settings');
    }
  }
  window.openParentalConsentSheet = openParentalConsentSheet;
})();
