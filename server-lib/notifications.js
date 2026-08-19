/**
 * Server-side notification bundles (Admin SDK only).
 *
 * Path: notifications/{uid}/items/{bundleId}
 * bundleId is deterministic: type__refId (sanitized).
 *
 * Re-open after read: actorCount/actors reset to events since lastReadAt.
 * Prune: delete docs older than 30d that are already read (never unread).
 */
const ACTOR_STORE_MAX = 3;
const PRUNE_AGE_MS = 30 * 24 * 60 * 60 * 1000;
const DM_THROTTLE_MS = 2 * 60 * 1000; // skip spammy DM notifs for same chat
const { resolveActiveProfileName, resolveDisplayNameFromData } = require('./profile-display');

function sanitizeIdPart(raw) {
  return String(raw || '')
    .trim()
    .replace(/[^A-Za-z0-9_-]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 120);
}

function makeBundleId(type, refId) {
  const t = sanitizeIdPart(type) || 'event';
  const r = sanitizeIdPart(refId) || 'none';
  return `${t}__${r}`.slice(0, 200);
}

function normalizeActor(actor) {
  if (!actor || typeof actor !== 'object') return null;
  const uid = String(actor.uid || '').trim();
  if (!uid || uid.length > 128) return null;
  return {
    uid,
    name: String(actor.name || 'Someone').slice(0, 80),
    avatar: String(actor.avatar || actor.photoURL || '👤').slice(0, 16),
    photoURL: String(actor.photoURL || '').slice(0, 500),
  };
}

/**
 * Pure merge for unread bundles / reopen-after-read. Used by upsert + unit tests.
 */
function mergeBundleActors(existing, actor, { wasRead = false } = {}) {
  const a = normalizeActor(actor);
  if (!a) return null;
  if (!existing || wasRead) {
    return { actors: [a], actorCount: 1, reopened: !!existing && wasRead };
  }
  const prevActors = Array.isArray(existing.actors) ? existing.actors : [];
  const without = prevActors.filter((x) => x && x.uid !== a.uid);
  const nextActors = [a, ...without].slice(0, ACTOR_STORE_MAX);
  const prevCount = Math.max(0, Number(existing.actorCount) || without.length);
  const already = prevActors.some((x) => x && x.uid === a.uid);
  const nextCount = already ? Math.max(prevCount, nextActors.length) : prevCount + 1;
  return { actors: nextActors, actorCount: nextCount, reopened: false };
}

/** True when a read bundle is old enough to prune. */
function shouldPruneReadBundle(data, nowMs = Date.now(), maxAgeMs = PRUNE_AGE_MS) {
  if (!data || !data.read) return false;
  const ms = Number(data.updatedAtMs) || (data.updatedAt?.toMillis?.() || 0);
  return !!(ms && ms < nowMs - maxAgeMs);
}

function sectionForType(type) {
  const t = String(type || '').toLowerCase();
  if (['message', 'dm', 'friend_request', 'friend_accept', 'story', 'story_like', 'story_comment', 'mehfil'].some((x) => t.includes(x))) {
    return 'baithak';
  }
  if (['peepal', 'reaction', 'reply', 'mention', 'match'].some((x) => t.includes(x))) return 'peepal';
  if (['like', 'comment', 'follow', 'duniya', 'post', 'lehar', 'tag'].some((x) => t.includes(x))) return 'duniya';
  if (['duel', 'challenge', 'dangal', 'muqabala', 'game'].some((x) => t.includes(x))) return 'dangal';
  if (['streak', 'akhbaar', 'breaking', 'quiz'].some((x) => t.includes(x))) return 'akhbaar';
  return 'all';
}

function itemsRef(db, uid) {
  return db.collection('notifications').doc(uid).collection('items');
}

/**
 * Upsert a bundled notification for recipientUid.
 * @returns {Promise<{ bundleId: string, created: boolean, skipped?: string }|null>}
 */
async function upsertNotification(adminApp, recipientUid, { type, refId, actor, preview, deepLink } = {}) {
  if (!adminApp || !recipientUid) return null;
  const db = adminApp.firestore();
  const FieldValue = adminApp.firestore.FieldValue;
  const t = String(type || '').trim().slice(0, 40);
  const rid = String(refId || '').trim().slice(0, 180);
  if (!t || !rid) return null;

  const a = normalizeActor(actor);
  if (!a) return null;
  // Never notify yourself
  if (a.uid === recipientUid) return { bundleId: null, created: false, skipped: 'self' };

  const bundleId = makeBundleId(t, rid);
  const ref = itemsRef(db, recipientUid).doc(bundleId);
  const previewText = String(preview || '').slice(0, 280);
  const link = deepLink && typeof deepLink === 'object' ? deepLink : null;
  const section = (link && link.section) || sectionForType(t);

  const result = await db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    const now = Date.now();

    if (!snap.exists) {
      tx.set(ref, {
        type: t,
        refId: rid,
        section,
        actors: [a],
        actorCount: 1,
        preview: previewText,
        deepLink: link,
        createdAt: FieldValue.serverTimestamp(),
        updatedAt: FieldValue.serverTimestamp(),
        updatedAtMs: now,
        lastReadAt: null,
        read: false,
      });
      return { bundleId, created: true };
    }

    const data = snap.data() || {};
    const wasRead = !!data.read;
    const merged = mergeBundleActors(data, a, { wasRead });
    if (!merged) return { bundleId, created: false, skipped: 'actor' };

    if (wasRead) {
      // Fresh cycle since lastReadAt — only this actor
      tx.set(
        ref,
        {
          type: t,
          refId: rid,
          section,
          actors: merged.actors,
          actorCount: merged.actorCount,
          preview: previewText || data.preview || '',
          deepLink: link || data.deepLink || null,
          updatedAt: FieldValue.serverTimestamp(),
          updatedAtMs: now,
          read: false,
        },
        { merge: true }
      );
      return { bundleId, created: false, reopened: true };
    }

    // Unread bundle — merge actors
    tx.set(
      ref,
      {
        actors: merged.actors,
        actorCount: merged.actorCount,
        preview: previewText || data.preview || '',
        deepLink: link || data.deepLink || null,
        updatedAt: FieldValue.serverTimestamp(),
        updatedAtMs: now,
        read: false,
      },
      { merge: true }
    );
    return { bundleId, created: false };
  });

    if (result && !result.skipped) {
      try {
        const fcm = require('./fcm');
        const actorName = a.name || 'Someone';
        fcm
          .sendToUser(adminApp, recipientUid, {
            title: actorName,
            body: previewText || 'New activity on Chaupaal',
            link: '/',
            data: { type: t, refId: rid, section },
          })
          .catch(() => {});
      } catch (e) {}
    }

  return result;
}

async function markNotificationRead(adminApp, uid, bundleId) {
  if (!adminApp || !uid || !bundleId) return { ok: false };
  const db = adminApp.firestore();
  const FieldValue = adminApp.firestore.FieldValue;
  const ref = itemsRef(db, uid).doc(String(bundleId).slice(0, 200));
  await ref.set(
    {
      read: true,
      lastReadAt: FieldValue.serverTimestamp(),
      lastReadAtMs: Date.now(),
    },
    { merge: true }
  );
  return { ok: true };
}

async function markAllNotificationsRead(adminApp, uid, { section = null } = {}) {
  if (!adminApp || !uid) return { ok: false, count: 0 };
  const db = adminApp.firestore();
  const FieldValue = adminApp.firestore.FieldValue;
  let q = itemsRef(db, uid).where('read', '==', false).limit(100);
  const snap = await q.get();
  const now = Date.now();
  let count = 0;
  const batch = db.batch();
  snap.docs.forEach((doc) => {
    const data = doc.data() || {};
    if (section && section !== 'all' && data.section !== section && !String(data.type || '').includes(section)) {
      return;
    }
    batch.set(
      doc.ref,
      { read: true, lastReadAt: FieldValue.serverTimestamp(), lastReadAtMs: now },
      { merge: true }
    );
    count += 1;
  });
  if (count) await batch.commit();
  return { ok: true, count };
}

/**
 * Soft-clear = mark_read (docs stay for prune later).
 */
async function softClearNotifications(adminApp, uid, { bundleIds = null, section = null } = {}) {
  if (Array.isArray(bundleIds) && bundleIds.length) {
    let n = 0;
    for (const id of bundleIds.slice(0, 50)) {
      await markNotificationRead(adminApp, uid, id);
      n += 1;
    }
    return { ok: true, count: n };
  }
  return markAllNotificationsRead(adminApp, uid, { section });
}

/**
 * Delete read bundles older than 30 days. Never touches unread.
 */
async function pruneOldReadNotifications(adminApp, uid, { limit = 40 } = {}) {
  if (!adminApp || !uid) return { deleted: 0 };
  const db = adminApp.firestore();
  // Prefer updatedAtMs for cheap compare; fall back to scanning recent read docs
  let snap;
  try {
    snap = await itemsRef(db, uid)
      .where('read', '==', true)
      .orderBy('updatedAtMs', 'asc')
      .limit(limit)
      .get();
  } catch (e) {
    // Index may be missing — opportunistic scan of a page
    snap = await itemsRef(db, uid).orderBy('updatedAt', 'asc').limit(limit).get();
  }
  let deleted = 0;
  const batch = db.batch();
  snap.docs.forEach((doc) => {
    const d = doc.data() || {};
    if (shouldPruneReadBundle(d, Date.now(), PRUNE_AGE_MS)) {
      batch.delete(doc.ref);
      deleted += 1;
    }
  });
  if (deleted) await batch.commit();
  return { deleted };
}

/**
 * DM notify — skip if recipient is viewing this chat, or throttled.
 */
async function maybeNotifyDm(adminApp, { chatId, recipientUid, actor, preview }) {
  if (!adminApp || !chatId || !recipientUid) return { skipped: 'missing' };
  const db = adminApp.firestore();
  try {
    const statusSnap = await db.collection('user_status').doc(recipientUid).get();
    const active = String(statusSnap.data()?.activeChatId || '');
    if (active && active === String(chatId)) {
      return { skipped: 'active_chat' };
    }
  } catch (e) {
    /* continue */
  }

  const bundleId = makeBundleId('message', chatId);
  try {
    const existing = await itemsRef(db, recipientUid).doc(bundleId).get();
    if (existing.exists) {
      const d = existing.data() || {};
      const updatedMs = Number(d.updatedAtMs) || 0;
      const sameActor = Array.isArray(d.actors) && d.actors[0]?.uid === actor?.uid;
      if (!d.read && sameActor && updatedMs && Date.now() - updatedMs < DM_THROTTLE_MS) {
        return { skipped: 'throttle' };
      }
    }
  } catch (e) {}

  return upsertNotification(adminApp, recipientUid, {
    type: 'message',
    refId: chatId,
    actor,
    preview: preview || 'New message',
    deepLink: { chatId },
  });
}

/**
 * Resolve actor display from users / users_public.
 */
async function resolveActor(adminApp, uid) {
  if (!adminApp || !uid) return null;
  const db = adminApp.firestore();
  try {
    const [pub, priv] = await Promise.all([
      db.collection('users_public').doc(uid).get(),
      db.collection('users').doc(uid).get(),
    ]);
    const p = { ...(priv.data() || {}), ...(pub.data() || {}) };
    const profileName = await resolveActiveProfileName(db, uid, p);
    return normalizeActor({
      uid,
      name: resolveDisplayNameFromData(p, profileName),
      avatar: p.avatar || '👤',
      photoURL: p.photoURL || '',
    });
  } catch (e) {
    return normalizeActor({ uid, name: 'Someone', avatar: '👤' });
  }
}

module.exports = {
  ACTOR_STORE_MAX,
  PRUNE_AGE_MS,
  DM_THROTTLE_MS,
  makeBundleId,
  sanitizeIdPart,
  normalizeActor,
  mergeBundleActors,
  shouldPruneReadBundle,
  sectionForType,
  upsertNotification,
  markNotificationRead,
  markAllNotificationsRead,
  softClearNotifications,
  pruneOldReadNotifications,
  maybeNotifyDm,
  resolveActor,
};
