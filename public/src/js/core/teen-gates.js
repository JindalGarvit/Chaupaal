/**
 * Pure Teen Mode gates (age + messaging + consent).
 * UMD: browser script tag + Node require for regression tests.
 */
(function (root, factory) {
  var api = factory();
  if (typeof module === 'object' && module.exports) {
    module.exports = api;
  }
  if (root) {
    root.ChaupaalTeenGates = api;
  }
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  function ageFromDob(dob, nowMs) {
    if (nowMs == null) nowMs = Date.now();
    if (!dob) return 0;
    var d = dob instanceof Date ? dob : new Date(dob);
    if (Number.isNaN(d.getTime())) return 0;
    return Math.floor((nowMs - d.getTime()) / (365.25 * 86400000));
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

  function userAge(userOrProfile, nowMs) {
    if (nowMs == null) nowMs = Date.now();
    var u = userOrProfile || {};
    if (Number.isFinite(u.age) && u.age > 0) return Number(u.age);
    var dob = u.dob || u.dateOfBirth || (u.profile && u.profile.dateOfBirth);
    return ageFromDob(dob, nowMs);
  }

  function isTeenModeUser(userOrProfile, nowMs) {
    if (nowMs == null) nowMs = Date.now();
    var u = userOrProfile;
    if (!u) return false;
    if (u.teenMode === true) return true;
    if (u.isMinor === true) return true;
    var age = userAge(u, nowMs);
    if (!isMinorAge(age)) return false;
    return !(u.parentalConsent && u.parentalConsent.verified);
  }

  function needsParentalConsent(userOrProfile, nowMs) {
    if (nowMs == null) nowMs = Date.now();
    var u = userOrProfile;
    if (!u) return false;
    var age = userAge(u, nowMs);
    if (!isTeenAge(age) && !(isMinorAge(age) && age >= 13)) return false;
    return !(u.parentalConsent && u.parentalConsent.verified);
  }

  /**
   * Minors may only be messaged by other minors or reciprocal friends.
   * When `me` is omitted, caller must pass the current user explicitly for Node tests;
   * browser teen-mode wraps with userProfile.
   */
  function canMessageTarget(me, targetUser, relationshipState) {
    var meTeen = isTeenModeUser(me);
    var themTeen = isTeenModeUser(targetUser);
    if (!meTeen && !themTeen) return { ok: true };
    if (relationshipState && relationshipState.friend) return { ok: true };
    if (meTeen && themTeen) return { ok: true };
    if (meTeen && !themTeen) {
      return { ok: false, reason: 'teen_adult_stranger' };
    }
    if (!meTeen && themTeen) {
      return { ok: false, reason: 'adult_teen_stranger' };
    }
    return { ok: true };
  }

  function canSeeLocation(relationshipState) {
    return !!(relationshipState && relationshipState.friend);
  }

  return {
    ageFromDob: ageFromDob,
    userAge: userAge,
    isMinorAge: isMinorAge,
    isBlockedAge: isBlockedAge,
    isTeenAge: isTeenAge,
    isTeenModeUser: isTeenModeUser,
    needsParentalConsent: needsParentalConsent,
    canMessageTarget: canMessageTarget,
    canSeeLocation: canSeeLocation,
  };
});
