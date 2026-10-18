/**
 * Username normalize / validate — keep in sync with server-lib/username.js
 */
(function () {
  'use strict';

  const USERNAME_MIN = 3;
  const USERNAME_MAX = 30;

  const RESERVED = new Set([
    'admin',
    'support',
    'help',
    'chaupaal',
    'null',
    'undefined',
    'api',
    'www',
  ]);

  const VALID_RE = /^[a-z0-9](?:[a-z0-9._-]*[a-z0-9])?$/;
  const DOUBLE_SEP_RE = /[._-]{2,}/;
  const INVALID_CHAR_RE = /[^a-z0-9._-]/;

  function normalizeUsername(raw) {
    return String(raw || '')
      .trim()
      .toLowerCase()
      .replace(/^@+/, '')
      .slice(0, USERNAME_MAX);
  }

  function validateUsername(normalizedOrRaw) {
    const raw = String(normalizedOrRaw || '')
      .trim()
      .toLowerCase()
      .replace(/^@+/, '');
    if (raw.length > USERNAME_MAX) {
      return { ok: false, reason: 'too_long', detail: t('profile.max_username_max_characters', { USERNAME_MAX }) };
    }
    const u = raw.slice(0, USERNAME_MAX);
    if (!u) {
      return { ok: false, reason: 'invalid', detail: t('profile.enter_a_username') };
    }
    if (u.length < USERNAME_MIN) {
      return { ok: false, reason: 'too_short', detail: t('profile.at_least_username_min_characters', { USERNAME_MIN }) };
    }
    if (u.length > USERNAME_MAX) {
      return { ok: false, reason: 'too_long', detail: t('profile.max_username_max_characters', { USERNAME_MAX }) };
    }
    if (INVALID_CHAR_RE.test(u)) {
      return {
        ok: false,
        reason: 'invalid_chars',
        detail: t('profile.only_letters_numbers_dots_underscores_and'),
      };
    }
    if (!/^[a-z0-9]/.test(u)) {
      return { ok: false, reason: 'bad_start', detail: t('profile.must_start_with_a_letter_or') };
    }
    if (!/[a-z0-9]$/.test(u)) {
      return { ok: false, reason: 'bad_end', detail: t('profile.must_end_with_a_letter_or') };
    }
    if (DOUBLE_SEP_RE.test(u)) {
      return {
        ok: false,
        reason: 'double_sep',
        detail: t('profile.no_consecutive_dots_underscores_or_hyphens'),
      };
    }
    if (RESERVED.has(u)) {
      return { ok: false, reason: 'reserved', detail: t('profile.this_handle_is_reserved') };
    }
    if (!VALID_RE.test(u)) {
      return { ok: false, reason: 'invalid', detail: t('profile.invalid_username_format') };
    }
    return { ok: true, username: u };
  }

  /** Allow typing industry-standard handle chars only. */
  function sanitizeUsernameInput(raw) {
    return String(raw || '')
      .toLowerCase()
      .replace(/[^a-z0-9._-]/g, '')
      .slice(0, USERNAME_MAX);
  }

  window.ChaupaalUsername = {
    USERNAME_MIN,
    USERNAME_MAX,
    normalizeUsername,
    validateUsername,
    sanitizeUsernameInput,
  };
})();
