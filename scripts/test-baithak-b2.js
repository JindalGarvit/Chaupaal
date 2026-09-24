/**
 * Baithak B2 — Sabha / Sambhavanayein / Mitra filter predicates (lock 2A).
 */
'use strict';

const fs = require('fs');
const path = require('path');

function assert(cond, msg) {
  if (!cond) throw new Error(msg || 'assert failed');
  console.log('✓', msg);
}

const root = path.join(__dirname, '..');
const read = (p) => fs.readFileSync(path.join(root, p), 'utf8');

const data = read('public/src/js/features/baithak-data.js');
const baithak = read('public/src/js/features/baithak.js');
const sectionModes = read('public/src/js/core/section-modes.js');
const firstRun = read('public/src/js/core/first-run.js');
const tabGestures = read('public/src/js/core/tab-gestures.js');
const i18n = read('public/src/js/core/i18n.js');
const conventions = read('CONVENTIONS.md');

assert(/function filterBaithakSectionChats/.test(data), 'filterBaithakSectionChats defined');
assert(/lock 2A/.test(data) && /ALL groups/.test(data), 'Mitra includes all groups (2A)');
assert(/chaupaal:relationship-changed/.test(data), 're-filter on relationship change');
assert(/baithakGuestSabhaList/.test(data) && /baithakGuestSabhaList/.test(baithak), 'guest Sabha Demo helper');
assert(/Friends and groups land here/i.test(data) || /baithak_mitra_empty_msg/.test(data), 'Mitra empty mentions groups');
assert(/baithak_sambhav_groups_in_mitra/.test(data), 'Sambhav empty points to Mitra not Sabha-only');
assert(/Demo chats stay in Sabha/.test(data) || /baithak_section_guest_msg/.test(data), 'guest section empty honest');
assert(/\['sambhavanayein', 'sabha', 'mitra'\]/.test(sectionModes), 'swipe order sambhav ↔ sabha ↔ mitra');
assert(/Friends & groups/.test(firstRun), 'first-run Mitra job Friends & groups');
assert(/Friends & groups/.test(tabGestures) || /morphLabel\('baithak', 'mitra'/.test(tabGestures), 'morph Mitra label');
assert(/Friends and groups land here/.test(i18n), 'i18n Mitra empty mentions groups');
assert(/baithak_sambhav_groups_in_mitra/.test(i18n), 'i18n Sambhav→Mitra');
assert(/Baithak B2/.test(conventions), 'CONVENTIONS documents B2');
assert(!/Groups and friend chats live in Sabha/.test(data), 'no stale Sambhav→Sabha groups copy');

/** Pure replica of filterBaithakSectionChats (B2 contract). */
function isFriendOrFollowing(st) {
  if (!st) return false;
  return !!(st.friend || st.following || st.status === 'friends' || st.status === 'following');
}
function filterSection(chats, section, states, opts) {
  const sec = ['sabha', 'sambhavanayein', 'mitra'].includes(section) ? section : 'sabha';
  const list = Array.isArray(chats) ? chats : [];
  const guest = !!(opts && opts.guest);
  const isSelf = (c) => !!(c && (c.isSelf || c.type === 'self'));
  const isCai = (c) => !!(c && (c.isChaupaal || c.type === 'chaupaal'));
  const peer = (c) => String(c.peerUid || c.uid || '').trim();
  const blocked = (opts && opts.blocked) || new Set();

  if (sec === 'sabha') {
    return list.filter((c) => {
      if (!c) return false;
      if (isSelf(c) || isCai(c)) return true;
      if (c.type === 'group') return true;
      const uid = peer(c);
      if (uid && blocked.has(uid)) return false;
      return true;
    });
  }
  const social = list.filter((c) => c && !isSelf(c) && !isCai(c));
  const live = guest ? [] : social.filter((c) => !(c.isSample || c.isDemo));
  if (sec === 'sambhavanayein') {
    return live.filter((c) => {
      if (c.type === 'group') return false;
      const uid = peer(c);
      if (!uid || blocked.has(uid)) return false;
      return !isFriendOrFollowing(states[uid] || {});
    });
  }
  const dms = live.filter((c) => {
    if (c.type === 'group') return false;
    const uid = peer(c);
    if (!uid || blocked.has(uid)) return false;
    return isFriendOrFollowing(states[uid] || {});
  });
  const groups = live.filter((c) => c.type === 'group');
  return [...dms, ...groups];
}

const chats = [
  { id: 'cai', isChaupaal: true, type: 'chaupaal' },
  { id: 'me', isSelf: true, type: 'self' },
  { id: 'stranger', type: 'dm', peerUid: 'u1', unread: 2 },
  { id: 'friend', type: 'dm', peerUid: 'u2', unread: 1 },
  { id: 'follow', type: 'dm', peerUid: 'u3' },
  { id: 'grp', type: 'group', name: 'Squad' },
  { id: 'blocked', type: 'dm', peerUid: 'u4' },
  { id: 'demo', type: 'dm', peerUid: 'demo1', isDemo: true, isSample: true },
];
const states = {
  u1: {},
  u2: { friend: true },
  u3: { following: true },
  u4: {},
};

const sabha = filterSection(chats, 'sabha', states, { blocked: new Set(['u4']) });
assert(
  sabha.some((c) => c.id === 'cai') && sabha.some((c) => c.id === 'me') && sabha.some((c) => c.id === 'grp'),
  'Sabha keeps pins + groups'
);
assert(!sabha.some((c) => c.id === 'blocked'), 'Sabha hides blocked DM');

const sambhav = filterSection(chats, 'sambhavanayein', states, { blocked: new Set(['u4']) });
assert(
  sambhav.length === 1 && sambhav[0].id === 'stranger',
  'Sambhav: only non-friend/non-follow DM'
);
assert(!sambhav.some((c) => c.type === 'group' || c.isChaupaal || c.isSelf), 'Sambhav: no groups/pins');

const mitra = filterSection(chats, 'mitra', states, {});
assert(
  mitra.map((c) => c.id).sort().join(',') === 'follow,friend,grp',
  'Mitra: friend + following DMs + all groups'
);
assert(!mitra.some((c) => c.isSelf || c.isChaupaal), 'Mitra: no pins');

const guestMitra = filterSection(chats, 'mitra', states, { guest: true });
assert(guestMitra.length === 0, 'guest Mitra empty — no Demo invent');

const guestSambhav = filterSection(chats, 'sambhavanayein', states, { guest: true });
assert(guestSambhav.length === 0, 'guest Sambhav empty — no Demo invent');

const apiCount = fs.readdirSync(path.join(root, 'api')).filter((f) => f.endsWith('.js')).length;
assert(apiCount === 12, `api/*.js === 12 (got ${apiCount})`);

console.log('\nBaithak B2 checks passed.');
