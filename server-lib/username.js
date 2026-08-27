/**
 * Username normalize / validate / suggestions — keep in sync with public/src/js/core/username.js
 */
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

const SEP_CLASS = '[._-]';
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
    return { ok: false, reason: 'invalid', detail: 'empty' };
  }
  if (u.length < USERNAME_MIN) {
    return { ok: false, reason: 'too_short', detail: `At least ${USERNAME_MIN} characters` };
  }
  if (u.length > USERNAME_MAX) {
    return { ok: false, reason: 'too_long', detail: `Max ${USERNAME_MAX} characters` };
  }
  if (INVALID_CHAR_RE.test(u)) {
    return { ok: false, reason: 'invalid_chars', detail: 'Only letters, numbers, dots, underscores, and hyphens' };
  }
  if (!/^[a-z0-9]/.test(u)) {
    return { ok: false, reason: 'bad_start', detail: 'Must start with a letter or number' };
  }
  if (!/[a-z0-9]$/.test(u)) {
    return { ok: false, reason: 'bad_end', detail: 'Must end with a letter or number' };
  }
  if (DOUBLE_SEP_RE.test(u)) {
    return { ok: false, reason: 'double_sep', detail: 'No consecutive dots, underscores, or hyphens' };
  }
  if (RESERVED.has(u)) {
    return { ok: false, reason: 'reserved', detail: 'This handle is reserved' };
  }
  if (!VALID_RE.test(u)) {
    return { ok: false, reason: 'invalid', detail: 'Invalid username format' };
  }
  return { ok: true, username: u };
}

function trimSeparators(u) {
  return String(u || '').replace(new RegExp(`^${SEP_CLASS}+|${SEP_CLASS}+$`, 'g'), '');
}

function fitStem(stem, suffix) {
  const room = USERNAME_MAX - suffix.length;
  const base = stem.slice(0, Math.max(USERNAME_MIN - suffix.length, room));
  return (base + suffix).slice(0, USERNAME_MAX);
}

/** ~12–15 similar candidates from a taken handle (deduped, validated shape). */
function buildUsernameCandidates(taken) {
  const base = normalizeUsername(taken);
  const out = [];
  const seen = new Set();

  function add(c) {
    const n = normalizeUsername(c);
    if (!n || n === base || seen.has(n) || n.length < USERNAME_MIN || n.length > USERNAME_MAX) return;
    seen.add(n);
    out.push(n);
  }

  const cleaned = trimSeparators(base).replace(/[._-]{2,}/g, '.');
  if (cleaned && cleaned !== base) add(cleaned);

  const stem = trimSeparators(base) || base.replace(/[^a-z0-9]/g, '').slice(0, USERNAME_MAX) || 'user';

  ['01', '02', '07', '11', '21', '42', '77', '99'].forEach((s) => add(fitStem(stem, s)));
  ['123', '007', '101'].forEach((s) => add(fitStem(stem, s)));

  ['1', '01', 'in', 'hq', 'real'].forEach((s) => {
    add(fitStem(stem, '_' + s));
    add(fitStem(stem, '-' + s));
    add(fitStem(stem, '.' + s));
  });

  return out.slice(0, 15);
}

async function filterAvailableUsernames(db, candidates) {
  if (!db || !Array.isArray(candidates) || !candidates.length) return [];
  const unique = [];
  const seen = new Set();
  candidates.forEach((c) => {
    const v = validateUsername(c);
    if (!v.ok || seen.has(v.username)) return;
    seen.add(v.username);
    unique.push(v.username);
  });
  if (!unique.length) return [];

  try {
    const refs = unique.map((u) => db.collection('usernames').doc(u));
    const snaps = refs.length ? await db.getAll(...refs) : [];
    const taken = new Set();
    snaps.forEach((s) => {
      if (s.exists) taken.add(s.id);
    });
    return unique.filter((u) => !taken.has(u));
  } catch (e) {
    console.warn('[username] filterAvailable', e?.message || e);
    return [];
  }
}

async function suggestAvailableUsernames(db, taken) {
  const candidates = buildUsernameCandidates(taken);
  const free = await filterAvailableUsernames(db, candidates);
  return free.slice(0, 5);
}

module.exports = {
  USERNAME_MIN,
  USERNAME_MAX,
  RESERVED,
  normalizeUsername,
  validateUsername,
  buildUsernameCandidates,
  filterAvailableUsernames,
  suggestAvailableUsernames,
};
