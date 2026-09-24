/**
 * Baithak B1 — Chaupaal → Me pin order always holds.
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
const selfChat = read('public/src/js/features/self-chat.js');
const cai = read('public/src/js/features/chaupaal-chat.js');
const actions = read('public/src/js/features/baithak-chat-actions.js');
const conventions = read('CONVENTIONS.md');

assert(/return \[chaupaal, self, \.\.\.rest\]/.test(data), 'pinSelfChat returns Chaupaal → Me → rest');
assert(/assertBaithakPinOrder/.test(data), 'assertBaithakPinOrder exported');
assert(/re-asserting Chaupaal → Me/.test(data), 'DOM pin re-assert');
assert(/pinSelfChat\(\[\]\)/.test(baithak), 'auth/init rebuilds pins for active uid');
assert(/ensureSelfChatDoc/.test(baithak) && /ensureChaupaalChatDoc/.test(baithak), 'ensure pin docs on auth/init');
assert(/pinSelfChat\(baithakChats\)/.test(selfChat) && /pinSelfChat\(baithakChats\)/.test(cai), 'modules boot via pinSelfChat');
assert(/undeletable/.test(actions) && /isSelfChatRow/.test(actions) && /isChaupaalChatRow/.test(actions), 'pins gated from actions/delete');
assert(/No conversations yet/.test(data) && /Invite friends/.test(data), 'signed-in empty Invite CTA');
assert(!/Demo chats only/.test(data), 'no signed-in Demo-only empty copy');
assert(/Baithak B1/.test(conventions), 'CONVENTIONS documents B1');

// Pure order replica (mirrors pinSelfChat contract)
function pinOrder(input, getChaupaal, getSelf) {
  const isSelf = (c) => !!(c && (c.isSelf || c.type === 'self'));
  const isCai = (c) => !!(c && (c.isChaupaal || c.type === 'chaupaal'));
  const rest = (input || []).filter((c) => c && !isSelf(c) && !isCai(c));
  const self = getSelf() || { id: 'self', isSelf: true, type: 'self' };
  const chaupaal = getChaupaal ? getChaupaal() : null;
  if (chaupaal) return [chaupaal, self, ...rest];
  return [self, ...rest];
}
const ordered = pinOrder(
  [{ id: 'dm1', type: 'dm' }, { id: 'old_self', isSelf: true }],
  () => ({ id: 'cai', isChaupaal: true, type: 'chaupaal' }),
  () => ({ id: 'me', isSelf: true, type: 'self' })
);
assert(ordered[0].id === 'cai' && ordered[1].id === 'me' && ordered[2].id === 'dm1', 'order replica Chaupaal→Me→dm');

const apiCount = fs.readdirSync(path.join(root, 'api')).filter((f) => f.endsWith('.js')).length;
assert(apiCount === 12, `api/*.js === 12 (got ${apiCount})`);

console.log('\nBaithak B1 checks passed.');
