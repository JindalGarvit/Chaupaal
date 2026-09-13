/**
 * Mehfil membership + channel helpers (M0).
 * Used by api/media-config agora_token / mehfil_ensure_member / notif_mehfil_ring.
 * Mirrors Firestore chat membership → RTDB mehfilMembers/{chatId}/{uid} for rules.
 */
'use strict';

const CHANNEL_PREFIX = 'mh_';
/** Group soft caps (M7) — publishers ≈ speakers with Agora publisher tokens. */
const MEHFIL_MAX_PUBLISHERS = 10;
const MEHFIL_MAX_PARTICIPANTS = 40;

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
 * Full gate for Agora mint: membership + channel matches chat + not removed.
 * @returns {Promise<{ ok:true, chatId:string, channel:string, chatType?:string, voiceRole?:string }|{ ok:false, code:string, status:number }>}
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
  const removed = await assertNotRemovedFromMehfil(adminNs, chatId, uid);
  if (!removed.ok) {
    return { ok: false, code: removed.code || 'REMOVED', status: 403 };
  }
  try {
    await mirrorMehfilMembers(adminNs, chatId, [uid]);
  } catch (e) {
    console.warn('[mehfil-access] mirror', e?.message || e);
  }
  const voice = await resolveMehfilVoiceRole(adminNs, {
    chatId,
    uid,
    chatData: check.chatData,
  });
  const voiceRole = typeof voice === 'string' ? voice : voice?.voiceRole || 'publisher';
  const voiceReason = typeof voice === 'object' ? voice.reason || '' : '';
  const chatType = String(check.chatData?.type || 'dm');
  return {
    ok: true,
    chatId,
    channel: expected || channel,
    chatType,
    voiceRole,
    voiceReason,
    caps: {
      maxPublishers: MEHFIL_MAX_PUBLISHERS,
      maxParticipants: MEHFIL_MAX_PARTICIPANTS,
    },
  };
}

/** Removal cooldown still active? */
async function assertNotRemovedFromMehfil(adminNs, chatId, uid) {
  const id = sanitizeChatId(chatId);
  const userUid = String(uid || '');
  if (!id || !userUid) return { ok: false, code: 'VALIDATION_ERROR' };
  try {
    const snap = await adminNs.database().ref(`mehfil/${id}/removed/${userUid}`).once('value');
    const v = snap.val();
    if (!v) return { ok: true };
    const until = Number(v.until) || 0;
    if (until && until > Date.now()) {
      return { ok: false, code: 'REMOVED', until };
    }
    // Expired — clear stale node
    await adminNs.database().ref(`mehfil/${id}/removed/${userUid}`).remove();
    return { ok: true };
  } catch (e) {
    console.warn('[mehfil-access] removed check', e?.message || e);
    return { ok: true };
  }
}

/**
 * Count RTDB roles that may publish (speaker/host; not listener).
 * Host without a roles entry still counts as a publisher.
 */
async function countMehfilPublishers(adminNs, chatId, excludeUid) {
  const id = sanitizeChatId(chatId);
  if (!id) return 0;
  const rtdb = adminNs.database();
  const [rolesSnap, hostSnap] = await Promise.all([
    rtdb.ref(`mehfil/${id}/roles`).once('value'),
    rtdb.ref(`mehfil/${id}/roomHost/uid`).once('value'),
  ]);
  const roles = rolesSnap.val() || {};
  const hostUid = hostSnap.val() ? String(hostSnap.val()) : '';
  const skip = excludeUid ? String(excludeUid) : '';
  let n = 0;
  Object.entries(roles).forEach(([uid, meta]) => {
    if (skip && String(uid) === skip) return;
    if (String(meta?.role || 'speaker') === 'listener') return;
    n += 1;
  });
  if (hostUid && hostUid !== skip && !roles[hostUid]) n += 1;
  return n;
}

/**
 * DM → always publisher. Group listener → subscriber.
 * M7: new joiners beyond MEHFIL_MAX_PUBLISHERS become listeners (subscriber token).
 */
async function resolveMehfilVoiceRole(adminNs, opts) {
  const o = opts || {};
  const chatData = o.chatData || {};
  const isGroup = chatData.type === 'group';
  if (!isGroup) return { voiceRole: 'publisher', reason: 'dm' };
  const chatId = sanitizeChatId(o.chatId);
  const uid = String(o.uid || '');
  if (!chatId || !uid) return { voiceRole: 'publisher', reason: 'fallback' };
  try {
    const rtdb = adminNs.database();
    const roleSnap = await rtdb.ref(`mehfil/${chatId}/roles/${uid}/role`).once('value');
    const existing = roleSnap.val() != null ? String(roleSnap.val()) : '';
    if (existing === 'listener') {
      return { voiceRole: 'subscriber', reason: 'listener' };
    }

    const hostSnap = await rtdb.ref(`mehfil/${chatId}/roomHost/uid`).once('value');
    const hostUid = hostSnap.val() ? String(hostSnap.val()) : '';
    if (hostUid === uid || existing === 'speaker') {
      return { voiceRole: 'publisher', reason: existing === 'speaker' ? 'speaker' : 'host' };
    }

    // No explicit role yet — apply publisher cap for first-time joiners.
    const publishers = await countMehfilPublishers(adminNs, chatId, uid);
    if (publishers >= MEHFIL_MAX_PUBLISHERS) {
      try {
        await rtdb.ref(`mehfil/${chatId}/roles/${uid}`).set({
          role: 'listener',
          at: Date.now(),
          reason: 'publisher_cap',
        });
      } catch (e) {
        console.warn('[mehfil-access] cap write', e?.message || e);
      }
      return { voiceRole: 'subscriber', reason: 'publisher_cap' };
    }
    return { voiceRole: 'publisher', reason: 'open_slot' };
  } catch (e) {
    return { voiceRole: 'publisher', reason: 'error' };
  }
}

module.exports = {
  CHANNEL_PREFIX,
  MEHFIL_MAX_PUBLISHERS,
  MEHFIL_MAX_PARTICIPANTS,
  sanitizeChatId,
  channelForChatId,
  chatIdFromChannel,
  isBlockedMehfilChatId,
  memberSetFromChatData,
  assertChatMember,
  mirrorMehfilMembers,
  assertMehfilAgoraAccess,
  assertNotRemovedFromMehfil,
  resolveMehfilVoiceRole,
  countMehfilPublishers,
};
