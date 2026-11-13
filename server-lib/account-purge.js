/**
 * Account deletion (Global L8): 30-day grace, then a hard purge across every store.
 * Folded into api/media-config (request / cancel) + api/chaupaal-scheduler (purge) — no new function.
 *
 *   scheduleDeletion(adminApp, uid, { graceDays = 30, reason })  sign-out everywhere, hide the profile
 *   cancelDeletion(adminApp, uid)                                 log in within the grace period → undo
 *   purgeAccount(adminApp, uid)                                   the cascade below; Auth user last
 *   processDueDeletions(adminApp, { limit, deadlineMs })          scheduler: purge accounts past purgeAfterMs
 *
 * Other people keep what is theirs: their messages, their posts, their games. Where the deleted person
 * appears in someone else's thread or match, the users_public tombstone renders as "Deleted user"
 * and the deleted person's own words are redacted.
 */
'use strict';

const crypto = require('crypto');

const GRACE_DAYS = 30;
const DAY_MS = 86400000;
const QUERY_LIMIT = 400;

/**
 * The deletion cascade map (docs + tests). action:
 *   delete   — document(s) removed (recursive: sub-collections too)
 *   redact   — kept for the other people in the thread, the deleted person's content blanked
 *   tombstone— PII-free placeholder so shared threads/games render "Deleted user"
 *   retain   — kept, pseudonymised, for a stated legal reason
 */
const CASCADE = [
  { store: 'firestore', path: 'usernames/{handle}', match: 'uid', action: 'delete' },
  { store: 'firestore', path: 'phoneIndex/{e164}', match: 'uid', action: 'delete' },
  { store: 'firestore', path: 'phone_index/{e164}', match: 'uid', action: 'delete' },
  { store: 'firestore', path: 'phoneHashIndex/{hash}', match: 'uid', action: 'delete' },
  { store: 'firestore', path: 'duniya/{post} (+ likes, comments)', match: 'uid', action: 'delete' },
  { store: 'firestore', path: 'peepal/{question} (+ responses, comments, reactions)', match: 'uid', action: 'delete' },
  { store: 'firestore', path: 'duniya_stories/{story}', match: 'uid', action: 'delete' },
  { store: 'firestore', path: 'baithak_stories/{story}', match: 'uid', action: 'delete' },
  { store: 'firestore', path: '**/comments/{id} on other people’s posts', match: 'uid', action: 'redact' },
  { store: 'firestore', path: 'chats/{chat}/messages/{id} sent by the user', match: 'uid', action: 'redact' },
  { store: 'firestore', path: '**/likes|reactions|views|responses/{id}', match: 'uid', action: 'delete' },
  { store: 'firestore', path: 'users/{other}/followers|following|friendRequests|sentFriendRequests|close_friends/{uid}', match: 'graph edge', action: 'delete' },
  { store: 'firestore', path: 'notifications/{uid} (+ items)', match: 'doc id', action: 'delete' },
  { store: 'firestore', path: 'chaupaalUserState/{uid}, userModels/{uid}, premium/{uid}, user_status/{uid}, blocks/{uid}, shadowbans/{uid}', match: 'doc id', action: 'delete' },
  { store: 'firestore', path: 'signalEvents/*/items, daily_scores/*/scores, weeklyLeaderboard/*/scores, matchmaking/*/waiting', match: 'uid', action: 'delete' },
  { store: 'firestore', path: 'daily_checkins, liveLocationShares, search_feedback, discovery_reactions, match_outcomes, matchEngagementEvents, gameLikes, clientErrorReports, companionProductFeedback, stranger_counts, translateUsage, exportJobs, parentalConsents', match: 'uid / childUid', action: 'delete' },
  { store: 'firestore', path: 'chaupaalFeedback', match: 'userId', action: 'delete' },
  { store: 'firestore', path: 'chatRatings (rated by the user)', match: 'raterUid', action: 'delete' },
  { store: 'firestore', path: 'user_flags (reports the user filed)', match: 'reporterUid', action: 'redact' },
  { store: 'firestore', path: 'chaupaalTransactions', match: 'uid', action: 'retain', why: 'payment / tax records (pseudonymised: uid replaced by a one-way hash)' },
  { store: 'firestore', path: 'reports / statements / appeals', match: 'reporterUid / uid', action: 'retain', why: 'transparency reporting + legal hold (pseudonymised; contact, details and appeal text removed)' },
  { store: 'firestore', path: 'users_public/{uid} (+ friend_projection)', match: 'doc id', action: 'tombstone' },
  { store: 'firestore', path: 'users/{uid} (+ every sub-collection: profiles, fcmTokens, consentLog, journal, wallet, chipTransactions, gameStats …)', match: 'doc id', action: 'delete' },
  { store: 'rtdb', path: 'status/{uid}, mehfilInbox/{uid}', match: 'key', action: 'delete' },
  { store: 'storage', path: 'exports/{uid}/', match: 'prefix', action: 'delete' },
  { store: 'cloudinary', path: 'uploaded media referenced by the user’s own docs', match: 'public_id', action: 'delete', why: 'needs CLOUDINARY_API_KEY + CLOUDINARY_API_SECRET; otherwise listed for manual removal' },
  { store: 'device', path: 'chaupaal_device_accounts, translate / message caches, push token', match: 'this device', action: 'delete' },
  { store: 'auth', path: 'Firebase Auth user', match: 'uid', action: 'delete', why: 'last, so a failure earlier can be retried' },
  { store: 'firestore', path: 'accountDeletions/{sha256(uid)}', match: 'audit', action: 'retain', why: 'proof the deletion ran: timestamps + counts, no personal data' },
];

const OWNED_CONTENT = ['duniya', 'peepal', 'duniya_stories', 'baithak_stories'];
const BY_UID = [
  ['daily_checkins', 'uid'],
  ['liveLocationShares', 'uid'],
  ['search_feedback', 'uid'],
  ['discovery_reactions', 'uid'],
  ['match_outcomes', 'uid'],
  ['matchEngagementEvents', 'uid'],
  ['gameLikes', 'uid'],
  ['clientErrorReports', 'uid'],
  ['companionProductFeedback', 'uid'],
  ['stranger_counts', 'uid'],
  ['translateUsage', 'uid'],
  ['parentalConsents', 'childUid'],
  ['chaupaalFeedback', 'userId'],
  ['chatRatings', 'raterUid'],
];
const BY_DOC_ID = ['chaupaalUserState', 'userModels', 'premium', 'user_status', 'blocks', 'shadowbans'];
const GROUP_DELETE = ['items', 'scores', 'waiting', 'likes', 'reactions', 'views', 'responses'];
const GRAPH_EDGES = [
  // [my sub-collection, the mirror sub-collection on the other user]
  ['following', 'followers'],
  ['followers', 'following'],
  ['friendRequests', 'sentFriendRequests'],
  ['sentFriendRequests', 'friendRequests'],
  ['close_friends', null],
];

function hashUid(uid) {
  return crypto.createHash('sha256').update('chaupaal-del:' + String(uid)).digest('hex').slice(0, 40);
}

async function scheduleDeletion(adminApp, uid, opts) {
  const o = opts || {};
  const db = adminApp.firestore();
  const graceDays = o.graceDays != null ? Math.max(0, Number(o.graceDays)) : GRACE_DAYS;
  const now = o.now || Date.now();
  const purgeAfterMs = now + graceDays * DAY_MS;
  await db.collection('users').doc(uid).set(
    {
      deletionStatus: 'scheduled',
      deletionRequestedAt: new Date(now).toISOString(),
      deletionRequestedMs: now,
      purgeAfterMs,
      deletionReason: String(o.reason || 'user_request').slice(0, 40),
    },
    { merge: true }
  );
  try {
    await db.collection('users_public').doc(uid).set({ deletionRequested: true, hiddenFromDiscovery: true, updatedAt: new Date(now).toISOString() }, { merge: true });
  } catch (e) {}
  try {
    const { deleteUserModel } = require('./user-model');
    await deleteUserModel(db, uid);
  } catch (e) {}
  let tokensRevoked = false;
  try {
    await adminApp.auth().revokeRefreshTokens(uid);
    tokensRevoked = true;
  } catch (e) {}
  return { status: 'scheduled', purgeAfterMs, graceDays, tokensRevoked };
}

async function cancelDeletion(adminApp, uid) {
  const db = adminApp.firestore();
  const FieldValue = adminApp.firestore.FieldValue;
  const snap = await db.collection('users').doc(uid).get();
  const d = snap.exists ? snap.data() || {} : {};
  if (d.deletionStatus !== 'scheduled') return { ok: false, error: 'NOT_SCHEDULED' };
  if (d.deletionReason === 'under_min_age') return { ok: false, error: 'NOT_CANCELLABLE' };
  if (Number(d.purgeAfterMs) && Date.now() >= Number(d.purgeAfterMs)) return { ok: false, error: 'GRACE_OVER' };
  await db.collection('users').doc(uid).set(
    {
      deletionStatus: FieldValue.delete(),
      deletionRequestedAt: FieldValue.delete(),
      deletionRequestedMs: FieldValue.delete(),
      purgeAfterMs: FieldValue.delete(),
      deletionReason: FieldValue.delete(),
      deletionCancelledMs: Date.now(),
    },
    { merge: true }
  );
  try {
    await db.collection('users_public').doc(uid).set(
      { deletionRequested: FieldValue.delete(), hiddenFromDiscovery: FieldValue.delete() },
      { merge: true }
    );
  } catch (e) {}
  return { ok: true, status: 'active' };
}

async function queryAll(q) {
  try {
    const snap = await q.limit(QUERY_LIMIT).get();
    return snap.docs || [];
  } catch (e) {
    return [];
  }
}

async function deleteDocs(db, docs) {
  let n = 0;
  for (const d of docs) {
    try {
      if (typeof db.recursiveDelete === 'function') await db.recursiveDelete(d.ref);
      else await d.ref.delete();
      n++;
    } catch (e) {}
  }
  return n;
}

/** Cloudinary public_id from a delivery URL: …/upload/[transforms/]v123/folder/name.ext */
function cloudinaryPublicId(url) {
  const m = /res\.cloudinary\.com\/([^/]+)\/(image|video|raw)\/upload\/(.+)$/.exec(String(url || ''));
  if (!m) return null;
  const parts = m[3].split('?')[0].split('/');
  // Leading transformation segments (w_400,c_fill / f_auto …), then an optional version (v123).
  while (parts.length > 1 && /^[a-z]{1,3}_[^/]*$/.test(parts[0]) && !/\.[a-z0-9]+$/i.test(parts[0])) parts.shift();
  if (parts.length > 1 && /^v\d+$/.test(parts[0])) parts.shift();
  const rest = parts.join('/');
  return rest ? { cloud: m[1], type: m[2], publicId: rest.replace(/\.[a-z0-9]+$/i, '') } : null;
}

/** Every Cloudinary URL inside a value (deep). */
function collectMediaUrls(value, out) {
  const acc = out || new Set();
  const walk = (v, depth) => {
    if (depth > 8 || v == null) return;
    if (typeof v === 'string') {
      if (/^https:\/\/res\.cloudinary\.com\//.test(v)) acc.add(v);
      return;
    }
    if (Array.isArray(v)) return v.forEach((x) => walk(x, depth + 1));
    if (typeof v === 'object' && typeof v.toDate !== 'function') Object.keys(v).forEach((k) => walk(v[k], depth + 1));
  };
  walk(value, 0);
  return acc;
}

async function purgeCloudinary(urls) {
  const key = process.env.CLOUDINARY_API_KEY;
  const secret = process.env.CLOUDINARY_API_SECRET;
  const ids = [...urls].map(cloudinaryPublicId).filter(Boolean);
  if (!ids.length) return { mode: 'none', count: 0 };
  if (!key || !secret || typeof fetch !== 'function') return { mode: 'manual', count: ids.length };
  let deleted = 0;
  const groups = {};
  ids.forEach((x) => {
    const k = x.cloud + '|' + x.type;
    (groups[k] = groups[k] || []).push(x.publicId);
  });
  for (const k of Object.keys(groups)) {
    const [cloud, type] = k.split('|');
    const list = groups[k];
    for (let i = 0; i < list.length; i += 100) {
      const qs = list.slice(i, i + 100).map((id) => 'public_ids[]=' + encodeURIComponent(id)).join('&');
      try {
        const res = await fetch(`https://api.cloudinary.com/v1_1/${cloud}/resources/${type}/upload?${qs}`, {
          method: 'DELETE',
          headers: { Authorization: 'Basic ' + Buffer.from(key + ':' + secret).toString('base64') },
        });
        if (res.ok) deleted += list.slice(i, i + 100).length;
      } catch (e) {}
    }
  }
  return { mode: 'api', count: ids.length, deleted };
}

/**
 * Hard delete. Idempotent: safe to re-run after a partial failure (Auth delete is last).
 * @returns {{ ok, counts, media }}
 */
async function purgeAccount(adminApp, uid, opts) {
  const o = opts || {};
  const db = adminApp.firestore();
  const FieldValue = adminApp.firestore.FieldValue;
  const counts = {};
  const add = (k, n) => {
    counts[k] = (counts[k] || 0) + (Number(n) || 0);
  };
  const userRef = db.collection('users').doc(uid);
  const userSnap = await userRef.get();
  const user = userSnap.exists ? userSnap.data() || {} : {};
  const media = new Set();
  collectMediaUrls(user, media);
  try {
    await userRef.set({ deletionStatus: 'purging' }, { merge: true });
  } catch (e) {}

  // Identity indexes.
  for (const col of ['usernames', 'phoneIndex', 'phone_index', 'phoneHashIndex']) {
    add(col, await deleteDocs(db, await queryAll(db.collection(col).where('uid', '==', uid))));
  }

  // The user's own posts / stories (with their sub-collections).
  for (const col of OWNED_CONTENT) {
    const docs = await queryAll(db.collection(col).where('uid', '==', uid));
    docs.forEach((d) => collectMediaUrls(d.data(), media));
    add(col, await deleteDocs(db, docs));
  }

  // Their comments on other people's posts and their chat messages: redacted, threads stay intact.
  for (const group of ['comments', 'messages']) {
    const docs = await queryAll(db.collectionGroup(group).where('uid', '==', uid));
    for (const d of docs) {
      collectMediaUrls(d.data(), media);
      try {
        await d.ref.set(
          {
            text: '',
            media: FieldValue.delete(),
            mediaUrl: FieldValue.delete(),
            imageUrl: FieldValue.delete(),
            attachment: FieldValue.delete(),
            music: FieldValue.delete(),
            name: '',
            avatar: FieldValue.delete(),
            photoURL: FieldValue.delete(),
            user: { uid, name: '', photoURL: '' },
            redacted: true,
            authorDeleted: true,
          },
          { merge: true }
        );
        add(group + '_redacted', 1);
      } catch (e) {}
    }
  }
  // Shared chats keep their history for the others; the deleted member is marked for "Deleted user".
  for (const d of await queryAll(db.collection('chats').where('participants', 'array-contains', uid))) {
    try {
      await d.ref.set({ deletedParticipants: FieldValue.arrayUnion(uid) }, { merge: true });
      add('chats_marked', 1);
    } catch (e) {}
  }

  // Reactions / likes / views / per-day rows they own anywhere.
  for (const group of GROUP_DELETE) {
    add(group, await deleteDocs(db, await queryAll(db.collectionGroup(group).where('uid', '==', uid))));
  }

  // Social graph edges on other people's docs (mirror of mine).
  for (const [mine, theirs] of GRAPH_EDGES) {
    const docs = await queryAll(userRef.collection(mine));
    for (const d of docs) {
      const other = d.id;
      if (!theirs || !other || other === uid) continue;
      try {
        await db.collection('users').doc(other).collection(theirs).doc(uid).delete();
        add('graph_edges', 1);
      } catch (e) {}
      if (theirs === 'followers' || theirs === 'following') {
        try {
          await db
            .collection('users')
            .doc(other)
            .set({ relationshipCounts: { [theirs]: FieldValue.increment(-1) } }, { merge: true });
        } catch (e) {}
      }
    }
  }

  // Per-user docs keyed by uid.
  for (const col of BY_DOC_ID) {
    try {
      const ref = db.collection(col).doc(uid);
      const s = await ref.get();
      if (s.exists) {
        await ref.delete();
        add(col, 1);
      }
    } catch (e) {}
  }
  try {
    await db.recursiveDelete(db.collection('notifications').doc(uid));
    add('notifications', 1);
  } catch (e) {}

  for (const [col, field] of BY_UID) {
    add(col, await deleteDocs(db, await queryAll(db.collection(col).where(field, '==', uid))));
  }

  // Export jobs (+ fallback chunks) and their files.
  const jobs = await queryAll(db.collection('exportJobs').where('uid', '==', uid));
  add('exportJobs', await deleteDocs(db, jobs));
  try {
    const bucket = exportBucket(adminApp);
    if (bucket) await bucket.deleteFiles({ prefix: `exports/${uid}/` });
    add('storage_exports', 1);
  } catch (e) {}

  // Reports they filed stay for safety review, without the reporter's identity.
  for (const d of await queryAll(db.collection('user_flags').where('reporterUid', '==', uid))) {
    try {
      await d.ref.set({ reporterUid: 'deleted:' + hashUid(uid) }, { merge: true });
      add('user_flags_redacted', 1);
    } catch (e) {}
  }
  // Notices / statements / appeals: kept for transparency counts, identity removed.
  for (const [col, field] of [['reports', 'reporterUid'], ['statements', 'uid'], ['appeals', 'uid']]) {
    for (const d of await queryAll(db.collection(col).where(field, '==', uid))) {
      try {
        await d.ref.set({ [field]: 'deleted:' + hashUid(uid), contact: FieldValue.delete(), details: FieldValue.delete(), text: FieldValue.delete() }, { merge: true });
        add(col + '_pseudonymised', 1);
      } catch (e) {}
    }
  }
  // Payments: kept for accounting, pseudonymised.
  for (const d of await queryAll(db.collection('chaupaalTransactions').where('uid', '==', uid))) {
    try {
      await d.ref.set({ uid: 'deleted:' + hashUid(uid), email: FieldValue.delete(), name: FieldValue.delete(), phone: FieldValue.delete() }, { merge: true });
      add('chaupaalTransactions_pseudonymised', 1);
    } catch (e) {}
  }

  // Public card → tombstone (shared threads / games render "Deleted user").
  try {
    const pubRef = db.collection('users_public').doc(uid);
    try {
      await db.recursiveDelete(pubRef.collection('friend_projection'));
    } catch (e) {}
    await pubRef.set({ uid, deleted: true, deletionStatus: 'deleted', name: '', username: '', photoURL: '', profileVisibility: 'Private', hiddenFromDiscovery: true, deletedAtMs: Date.now() });
    add('users_public_tombstone', 1);
  } catch (e) {}

  // RTDB presence + Mehfil inbox.
  try {
    const rtdb = adminApp.database ? adminApp.database() : null;
    if (rtdb) {
      await rtdb.ref('status/' + uid).remove();
      await rtdb.ref('mehfilInbox/' + uid).remove();
      add('rtdb', 2);
    }
  } catch (e) {}

  // The private doc and every sub-collection (profiles, fcmTokens, consentLog, journal, wallet …).
  try {
    await db.recursiveDelete(userRef);
    add('users', 1);
  } catch (e) {
    try {
      await userRef.delete();
      add('users', 1);
    } catch (e2) {}
  }

  const mediaResult = o.skipMedia ? { mode: 'skipped', count: media.size } : await purgeCloudinary(media);

  // Auth identity last.
  let authDeleted = false;
  try {
    await adminApp.auth().deleteUser(uid);
    authDeleted = true;
  } catch (e) {
    authDeleted = e && e.code === 'auth/user-not-found';
  }

  try {
    await db.collection('accountDeletions').doc(hashUid(uid)).set({
      requestedAtMs: Number(user.deletionRequestedMs) || null,
      purgedAtMs: Date.now(),
      reason: user.deletionReason || 'user_request',
      counts,
      media: mediaResult,
      authDeleted,
      hadParentalConsent: !!(user.parentalConsent && user.parentalConsent.verified),
    });
  } catch (e) {}

  return { ok: authDeleted, counts, media: mediaResult, authDeleted };
}

async function processDueDeletions(adminApp, opts) {
  const o = opts || {};
  const db = adminApp.firestore();
  const now = o.now || Date.now();
  const limit = o.limit || 10;
  const out = { purged: 0, failed: 0, ids: [] };
  let docs = [];
  try {
    const snap = await db.collection('users').where('deletionStatus', 'in', ['scheduled', 'purging']).limit(limit * 4).get();
    docs = snap.docs || [];
  } catch (e) {
    return { ...out, error: e && e.message };
  }
  for (const d of docs) {
    if (out.purged + out.failed >= limit) break;
    if (o.deadlineMs && Date.now() > o.deadlineMs) break;
    const data = d.data() || {};
    if (data.deletionStatus === 'scheduled' && Number(data.purgeAfterMs) > now) continue;
    try {
      const r = await purgeAccount(adminApp, d.id, o);
      if (r.ok) out.purged++;
      else out.failed++;
      out.ids.push(hashUid(d.id));
    } catch (e) {
      out.failed++;
    }
  }
  return out;
}

function exportBucket(adminApp) {
  try {
    const { bucketName } = require('./account-export');
    const name = bucketName(adminApp);
    return name && adminApp.storage ? adminApp.storage().bucket(name) : null;
  } catch (e) {
    return null;
  }
}

module.exports = {
  GRACE_DAYS,
  CASCADE,
  scheduleDeletion,
  cancelDeletion,
  purgeAccount,
  processDueDeletions,
  cloudinaryPublicId,
  collectMediaUrls,
  hashUid,
};
