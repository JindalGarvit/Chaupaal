/**
 * One-shot / incremental denorm backfills (Admin SDK).
 * - groups: isPublic, nameLower, memberCount for type=='group'
 * - users_public: project private users → public docs (never clears hiddenFromDiscovery)
 *   Visibility-aware via server-lib/users-public-projection.js (P0).
 */
const BATCH = 40;
const { buildPublicProjection, normalizeVisibility } = require('./users-public-projection');

const PUBLIC_WIPE_KEYS = [
  'bio',
  'prompts',
  'interests',
  'hobbies',
  'profileMedia',
  'lookingFor',
  'occupation',
  'city',
  'age',
  'gender',
  'icebreakers',
  'topCat',
  'matchIntent',
  'intents',
  'personality',
  'industry',
  'purpose',
  'sectionOrder',
  'customSections',
  'digitalLayout',
  'profileTheme',
];

function groupNameLower(name) {
  return String(name || '')
    .toLowerCase()
    .trim()
    .slice(0, 80);
}

/**
 * Backfill group discoverability fields.
 * @returns {{ scanned, patched, done, lastId }}
 */
async function backfillGroups(db, { limit = BATCH, startAfterId = null } = {}) {
  let q = db.collection('chats').where('type', '==', 'group').orderBy('__name__').limit(limit);
  if (startAfterId) {
    const cursor = await db.collection('chats').doc(startAfterId).get();
    if (cursor.exists) q = q.startAfter(cursor);
  }
  const snap = await q.get();
  let patched = 0;
  const batch = db.batch();
  let ops = 0;

  snap.docs.forEach((doc) => {
    const d = doc.data() || {};
    const patch = {};
    if (!('isPublic' in d) && !('visibility' in d)) {
      // Do not force-migrate legacy groups to public — leave flags alone
    }
    const wantLower = groupNameLower(d.name);
    if (wantLower && d.nameLower !== wantLower) patch.nameLower = wantLower;
    const count = Array.isArray(d.participants) ? d.participants.length : 0;
    if (typeof d.memberCount !== 'number') patch.memberCount = count;
    if (Object.keys(patch).length) {
      batch.set(doc.ref, patch, { merge: true });
      ops += 1;
      patched += 1;
    }
  });

  if (ops) await batch.commit();
  const lastId = snap.docs.length ? snap.docs[snap.docs.length - 1].id : startAfterId;
  return {
    scanned: snap.size,
    patched,
    done: snap.empty || snap.size < limit,
    lastId: snap.empty ? null : lastId,
  };
}

/**
 * Backfill users_public from users (merge; does not touch hiddenFromDiscovery).
 */
async function backfillUsersPublic(db, { limit = BATCH, startAfterId = null } = {}) {
  let q = db.collection('users').orderBy('__name__').limit(limit);
  if (startAfterId) {
    const cursor = await db.collection('users').doc(startAfterId).get();
    if (cursor.exists) q = q.startAfter(cursor);
  }
  const snap = await q.get();
  let patched = 0;
  const batch = db.batch();
  let ops = 0;

  snap.docs.forEach((doc) => {
    const raw = doc.data() || {};
    const proj = buildPublicProjection(doc.id, raw);
    // Never write hiddenFromDiscovery from private user projection
    delete proj.hiddenFromDiscovery;
    const visibility = normalizeVisibility(raw);
    // merge cannot remove keys — delete gated fields when Private / Friends only
    if (visibility === 'private' || visibility === 'friends only') {
      try {
        const FieldValue = require('firebase-admin').firestore.FieldValue;
        PUBLIC_WIPE_KEYS.forEach((k) => {
          if (proj[k] === undefined) proj[k] = FieldValue.delete();
        });
      } catch (e) {
        /* best-effort wipe */
      }
    }
    batch.set(db.collection('users_public').doc(doc.id), proj, { merge: true });
    ops += 1;
    patched += 1;
  });

  if (ops) await batch.commit();
  const lastId = snap.docs.length ? snap.docs[snap.docs.length - 1].id : startAfterId;
  return {
    scanned: snap.size,
    patched,
    done: snap.empty || snap.size < limit,
    lastId: snap.empty ? null : lastId,
  };
}

/**
 * Set updatedAt on chat docs that only have createdAt/ts/lastMessageAt.
 * Firestore orderBy('updatedAt') omits those docs from the Baithak inbox.
 */
async function backfillChatUpdatedAt(db, { limit = BATCH, startAfterId = null } = {}) {
  let q = db.collection('chats').orderBy('__name__').limit(limit);
  if (startAfterId) {
    const cursor = await db.collection('chats').doc(startAfterId).get();
    if (cursor.exists) q = q.startAfter(cursor);
  }
  const snap = await q.get();
  let patched = 0;
  const batch = db.batch();
  let ops = 0;
  snap.docs.forEach((doc) => {
    const data = doc.data() || {};
    if (data.updatedAt != null) return;
    const stamp = data.lastMessageAt || data.createdAt || data.ts || new Date();
    batch.set(doc.ref, { updatedAt: stamp }, { merge: true });
    ops += 1;
    patched += 1;
  });
  if (ops) await batch.commit();
  const lastId = snap.docs.length ? snap.docs[snap.docs.length - 1].id : startAfterId;
  return {
    scanned: snap.size,
    patched,
    done: snap.empty || snap.size < limit,
    lastId: snap.empty ? null : lastId,
  };
}

/**
 * Run one page of both jobs using cursors in chaupaalMeta/denormBackfill.
 */
async function runDenormBackfillPage(db) {
  const ref = db.collection('chaupaalMeta').doc('denormBackfill');
  const snap = await ref.get();
  const meta = snap.exists ? snap.data() || {} : {};
  const out = { groups: null, usersPublic: null };

  if (!meta.groupsDone) {
    out.groups = await backfillGroups(db, { startAfterId: meta.groupsLastId || null });
    await ref.set(
      {
        groupsLastId: out.groups.done ? null : out.groups.lastId,
        groupsDone: !!out.groups.done,
        groupsPatchedTotal: (Number(meta.groupsPatchedTotal) || 0) + out.groups.patched,
        updatedAt: new Date(),
      },
      { merge: true }
    );
  } else {
    out.groups = { skipped: true, done: true };
  }

  if (!meta.usersDone) {
    out.usersPublic = await backfillUsersPublic(db, { startAfterId: meta.usersLastId || null });
    await ref.set(
      {
        usersLastId: out.usersPublic.done ? null : out.usersPublic.lastId,
        usersDone: !!out.usersPublic.done,
        usersPatchedTotal: (Number(meta.usersPatchedTotal) || 0) + out.usersPublic.patched,
        updatedAt: new Date(),
      },
      { merge: true }
    );
  } else {
    out.usersPublic = { skipped: true, done: true };
  }

  if (!meta.chatsUpdatedAtDone) {
    out.chatsUpdatedAt = await backfillChatUpdatedAt(db, { startAfterId: meta.chatsUpdatedAtLastId || null });
    await ref.set(
      {
        chatsUpdatedAtLastId: out.chatsUpdatedAt.done ? null : out.chatsUpdatedAt.lastId,
        chatsUpdatedAtDone: !!out.chatsUpdatedAt.done,
        chatsUpdatedAtPatchedTotal: (Number(meta.chatsUpdatedAtPatchedTotal) || 0) + out.chatsUpdatedAt.patched,
        updatedAt: new Date(),
      },
      { merge: true }
    );
  } else {
    out.chatsUpdatedAt = { skipped: true, done: true };
  }

  return out;
}

module.exports = {
  BATCH,
  buildPublicProjection,
  backfillGroups,
  backfillUsersPublic,
  backfillChatUpdatedAt,
  runDenormBackfillPage,
};
