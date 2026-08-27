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
      return { ok: false, reason: 'too_long', detail: `Max ${USERNAME_MAX} characters` };
    }
    const u = raw.slice(0, USERNAME_MAX);
    if (!u) {
      return { ok: false, reason: 'invalid', detail: 'Enter a username' };
    }
    if (u.length < USERNAME_MIN) {
      return { ok: false, reason: 'too_short', detail: `At least ${USERNAME_MIN} characters` };
    }
    if (u.length > USERNAME_MAX) {
      return { ok: false, reason: 'too_long', detail: `Max ${USERNAME_MAX} characters` };
    }
    if (INVALID_CHAR_RE.test(u)) {
      return {
        ok: false,
        reason: 'invalid_chars',
        detail: 'Only letters, numbers, dots, underscores, and hyphens',
      };
    }
    if (!/^[a-z0-9]/.test(u)) {
      return { ok: false, reason: 'bad_start', detail: 'Must start with a letter or number' };
    }
    if (!/[a-z0-9]$/.test(u)) {
      return { ok: false, reason: 'bad_end', detail: 'Must end with a letter or number' };
    }
    if (DOUBLE_SEP_RE.test(u)) {
      return {
        ok: false,
        reason: 'double_sep',
        detail: 'No consecutive dots, underscores, or hyphens',
      };
    }
    if (RESERVED.has(u)) {
      return { ok: false, reason: 'reserved', detail: 'This handle is reserved' };
    }
    if (!VALID_RE.test(u)) {
      return { ok: false, reason: 'invalid', detail: 'Invalid username format' };
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
