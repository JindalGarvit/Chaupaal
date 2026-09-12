/**
 * Mehfil membership + channel helpers (M0).
 * Used by api/media-config agora_token / mehfil_ensure_member / notif_mehfil_ring.
 * Mirrors Firestore chat membership → RTDB mehfilMembers/{chatId}/{uid} for rules.
 */
'use strict';

const CHANNEL_PREFIX = 'mh_';

function sanitizeChatId(chatId) {
  return String(chatId || '')
    .replace(/[^a-zA-Z0-9_-]/g, '')
    .slice(0, 120);
}

function channelForChatId(chatId) {
  const id = sanitizeChatId(chatId);
  if (!id) return '';
  return (CHANNEL_PREFIX + id).slice(0, 64);
}

/** Parse mh_{chatId} channel → chatId (best-effort; chatId may be truncated to fit 64). */
function chatIdFromChannel(channel) {
  const ch = String(channel || '').trim();
  if (!ch.startsWith(CHANNEL_PREFIX)) return '';
  return sanitizeChatId(ch.slice(CHANNEL_PREFIX.length));
}

function isBlockedMehfilChatId(chatId, chatData) {
  const id = String(chatId || '');
  if (!id) return true;
  if (id.startsWith('chat_self') || id.startsWith('chat_chaupaal_')) return true;
  const d = chatData || {};
  if (d.type === 'self' || d.isSelf || d.type === 'chaupaal' || d.isChaupaal) return true;
  return false;
}

function memberSetFromChatData(data) {
  const d = data || {};
  const raw = d.participants || d.members || d.participantIds || [];
  if (Array.isArray(raw)) return new Set(raw.map(String).filter(Boolean));
  if (raw && typeof raw === 'object') return new Set(Object.keys(raw).map(String));
  return new Set();
}

/**
 * @param {import('firebase-admin')} adminNs
 * @param {string} chatId
 * @param {string} uid
 * @returns {Promise<{ ok:boolean, code?:string, members?:Set<string>, chatData?:object }>}
 */
async function assertChatMember(adminNs, chatId, uid) {
  const id = sanitizeChatId(chatId);
  const userUid = String(uid || '');
  if (!id || !userUid) return { ok: false, code: 'VALIDATION_ERROR' };
  const db = adminNs.firestore();
  const snap = await db.collection('chats').doc(id).get();
  if (!snap.exists) return { ok: false, code: 'NOT_FOUND' };
  const chatData = snap.data() || {};
  if (isBlockedMehfilChatId(id, chatData)) return { ok: false, code: 'BLOCKED_CHAT' };
  const members = memberSetFromChatData(chatData);
  if (!members.has(userUid)) return { ok: false, code: 'FORBIDDEN' };
  return { ok: true, members, chatData };
}

/**
 * Write RTDB mehfilMembers/{chatId}/{uid}=true for the caller (Admin SDK bypasses rules).
 * Optionally seed other known member uids so peers can join without a separate call.
 */
async function mirrorMehfilMembers(adminNs, chatId, uids) {
  const id = sanitizeChatId(chatId);
  const list = [...new Set((uids || []).map(String).filter(Boolean))].slice(0, 80);
  if (!id || !list.length) return { ok: false };
  const rtdb = adminNs.database();
  const updates = {};
  list.forEach((u) => {
    updates[`mehfilMembers/${id}/${u}`] = true;
  });
  await rtdb.ref().update(updates);
  return { ok: true, count: list.length };
}

/**
 * Full gate for Agora mint: membership + channel matches chat.
 * @returns {Promise<{ ok:true, chatId:string, channel:string }|{ ok:false, code:string, status:number }>}
 */
async function assertMehfilAgoraAccess(adminNs, opts) {
  const o = opts || {};
  const uid = String(o.uid || '');
  let chatId = sanitizeChatId(o.chatId);
  const channel = String(o.channel || '')
    .replace(/[^a-zA-Z0-9_-]/g, '')
    .slice(0, 64);
  if (!channel) return { ok: false, code: 'VALIDATION_ERROR', status: 400 };
  if (!chatId) chatId = chatIdFromChannel(channel);
  if (!chatId) return { ok: false, code: 'VALIDATION_ERROR', status: 400 };
  const expected = channelForChatId(chatId);
  // Channel is truncated to 64 — accept exact match or prefix match when chatId was truncated.
  if (channel !== expected) {
    return { ok: false, code: 'FORBIDDEN', status: 403 };
  }
  if (!channel.startsWith(CHANNEL_PREFIX)) {
    return { ok: false, code: 'FORBIDDEN', status: 403 };
  }
  const check = await assertChatMember(adminNs, chatId, uid);
  if (!check.ok) {
    const status = check.code === 'NOT_FOUND' ? 404 : check.code === 'VALIDATION_ERROR' ? 400 : 403;
    return { ok: false, code: check.code === 'BLOCKED_CHAT' ? 'FORBIDDEN' : check.code, status };
  }
  try {
    await mirrorMehfilMembers(adminNs, chatId, [uid]);
  } catch (e) {
    console.warn('[mehfil-access] mirror', e?.message || e);
  }
  return { ok: true, chatId, channel: expected || channel };
}

module.exports = {
  CHANNEL_PREFIX,
  sanitizeChatId,
  channelForChatId,
  chatIdFromChannel,
  isBlockedMehfilChatId,
  memberSetFromChatData,
  assertChatMember,
  mirrorMehfilMembers,
  assertMehfilAgoraAccess,
};
