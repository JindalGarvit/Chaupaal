/**
 * Mehfil access control — chat membership before RTDB presence / Agora tokens.
 * RTDB cannot read Firestore, so participant creates go through Admin after this check.
 */
'use strict';

const DEFAULT_DATABASE_URL =
  'https://chaupaal-chaupaal-default-rtdb.asia-southeast1.firebasedatabase.app';

function cleanChatId(raw) {
  return String(raw || '')
    .trim()
    .replace(/[^a-zA-Z0-9_-]/g, '')
    .slice(0, 120);
}

function channelForChat(chatId) {
  // Agora channel max 64; keep mh_ + id within that so chatIdFromChannel round-trips.
  const id = cleanChatId(chatId).slice(0, 61);
  if (!id) return '';
  return 'mh_' + id;
}

/** Inverse of channelForChat — returns '' when channel is not a Mehfil channel. */
function chatIdFromChannel(channel) {
  const ch = String(channel || '')
    .replace(/[^a-zA-Z0-9_-]/g, '')
    .slice(0, 64);
  if (!ch.startsWith('mh_') || ch.length <= 3) return '';
  return cleanChatId(ch.slice(3));
}

function memberSetFromChatData(data) {
  const members = data?.participants || data?.members || data?.participantIds || [];
  if (Array.isArray(members)) return new Set(members.map(String));
  if (members && typeof members === 'object') return new Set(Object.keys(members));
  return new Set();
}

/**
 * @returns {Promise<{ ok: true, chatId: string } | { ok: false, error: string }>}
 */
async function assertChatParticipant(adminApp, uid, chatId) {
  const id = cleanChatId(chatId);
  if (!adminApp || !uid || !id) return { ok: false, error: 'MISSING' };
  const snap = await adminApp.firestore().collection('chats').doc(id).get();
  if (!snap.exists) return { ok: false, error: 'CHAT_NOT_FOUND' };
  const members = memberSetFromChatData(snap.data());
  if (!members.has(String(uid))) return { ok: false, error: 'NOT_MEMBER' };
  return { ok: true, chatId: id };
}

function getDatabaseURL() {
  return String(process.env.FIREBASE_DATABASE_URL || DEFAULT_DATABASE_URL).trim();
}

/**
 * Admin write of mehfil/{chatId}/participants/{uid}. Bypasses RTDB rules.
 * Requires initAdmin() to have set databaseURL (see server-lib/auth.js).
 */
async function ensureMehfilParticipantAdmin(adminApp, chatId, uid, meta = {}) {
  const id = cleanChatId(chatId);
  if (!adminApp || !id || !uid) return { ok: false, error: 'MISSING' };
  const ref = adminApp.database().ref(`mehfil/${id}/participants/${uid}`);
  await ref.set({
    at: Date.now(),
    name: String(meta.name || 'Member').slice(0, 80),
  });
  return { ok: true, chatId: id, channel: channelForChat(id) };
}

module.exports = {
  DEFAULT_DATABASE_URL,
  cleanChatId,
  channelForChat,
  chatIdFromChannel,
  memberSetFromChatData,
  assertChatParticipant,
  ensureMehfilParticipantAdmin,
  getDatabaseURL,
};
