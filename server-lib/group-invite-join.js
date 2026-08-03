/**
 * Group invite join (Admin SDK) + pure eligibility helpers.
 *
 * Client Firestore rules only allow tokenless self-join for public + instant
 * groups. Private groups and approval-mode joins must go through
 * joinGroupByInviteToken so the invite token is actually verified.
 */
'use strict';

/**
 * Mirrors firebase/firestore.rules validInviteSelfJoin constraints.
 * Tokenless client self-join is allowed only for public instant groups.
 */
function clientInviteSelfJoinAllowed(chatData) {
  if (!chatData || typeof chatData !== 'object') return false;
  if (chatData.type != null && chatData.type !== 'group') return false;
  if (chatData.isPublic !== true) return false;
  const invite = chatData.invite;
  if (!invite || typeof invite !== 'object') return false;
  if (invite.enabled === false) return false;
  if (typeof invite.token !== 'string' || !String(invite.token).trim()) return false;
  const mode = invite.mode == null || invite.mode === '' ? 'instant' : String(invite.mode);
  return mode === 'instant';
}

/** Public groups only — missing isPublic/visibility is not searchable. */
function isGroupPublicForSearch(groupData) {
  if (!groupData || typeof groupData !== 'object') return false;
  if (groupData.isPublic === true) return true;
  if (groupData.isPublic === false) return false;
  return groupData.visibility === 'public';
}

function cleanInviteToken(raw) {
  return String(raw || '')
    .trim()
    .slice(0, 128);
}

function memberProfileFrom(profile, uid) {
  const p = profile && typeof profile === 'object' ? profile : {};
  return {
    name: String(p.name || 'Member').slice(0, 80),
    avatar: String(p.avatar || '👤').slice(0, 16),
    photoURL: String(p.photoURL || '').slice(0, 500),
    role: 'member',
    profileType: String(p.profileType || 'personal').slice(0, 32),
    joinedAt: Date.now(),
  };
}

/**
 * Verify groupInvites/{token} and either add the member or queue approval.
 * @returns {{ ok: true, pending?: boolean, chatId: string, alreadyMember?: boolean } | { ok: false, code: string }}
 */
async function joinGroupByInviteToken(db, admin, { uid, token, profile } = {}) {
  if (!uid || !token) return { ok: false, code: 'VALIDATION_ERROR' };
  const inviteToken = cleanInviteToken(token);
  if (!inviteToken) return { ok: false, code: 'VALIDATION_ERROR' };

  const inviteRef = db.collection('groupInvites').doc(inviteToken);
  const inviteSnap = await inviteRef.get();
  if (!inviteSnap.exists) return { ok: false, code: 'NOT_FOUND' };
  const inviteMeta = inviteSnap.data() || {};
  if (inviteMeta.enabled === false) return { ok: false, code: 'DISABLED' };
  const chatId = String(inviteMeta.chatId || '').trim();
  if (!chatId || chatId.length > 128) return { ok: false, code: 'NOT_FOUND' };

  const chatRef = db.collection('chats').doc(chatId);
  const chatSnap = await chatRef.get();
  if (!chatSnap.exists) return { ok: false, code: 'NOT_FOUND' };
  const chat = chatSnap.data() || {};
  if (chat.type != null && chat.type !== 'group') return { ok: false, code: 'NOT_FOUND' };

  const participants = Array.isArray(chat.participants) ? chat.participants.map(String) : [];
  if (participants.includes(uid)) {
    return { ok: true, chatId, alreadyMember: true };
  }

  const mode = inviteMeta.mode === 'approval' || chat.invite?.mode === 'approval' ? 'approval' : 'instant';
  if (mode === 'approval') {
    await chatRef.collection('joinRequests').doc(uid).set(
      {
        uid,
        name: String(profile?.name || 'Member').slice(0, 80),
        avatar: String(profile?.avatar || '👤').slice(0, 16),
        photoURL: String(profile?.photoURL || '').slice(0, 500),
        profileType: String(profile?.profileType || 'personal').slice(0, 32),
        status: 'pending',
        requestedAt: admin.firestore.FieldValue.serverTimestamp(),
      },
      { merge: true }
    );
    return { ok: true, pending: true, chatId };
  }

  const memberProfile = memberProfileFrom(profile, uid);
  await chatRef.update({
    participants: admin.firestore.FieldValue.arrayUnion(uid),
    [`memberProfiles.${uid}`]: memberProfile,
    memberCount: admin.firestore.FieldValue.increment(1),
    updatedAt: admin.firestore.FieldValue.serverTimestamp(),
  });

  return { ok: true, pending: false, chatId };
}

module.exports = {
  clientInviteSelfJoinAllowed,
  isGroupPublicForSearch,
  cleanInviteToken,
  joinGroupByInviteToken,
};
