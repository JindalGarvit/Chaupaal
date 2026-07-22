/**
 * One-shot / incremental denorm backfills (Admin SDK).
 * - groups: isPublic, nameLower, memberCount for type=='group'
 * - users_public: project private users → public docs (never clears hiddenFromDiscovery)
 */
const BATCH = 40;

function groupNameLower(name) {
  return String(name || '')
    .toLowerCase()
    .trim()
    .slice(0, 80);
}

function buildPublicProjection(uid, raw) {
  const u = raw && typeof raw === 'object' ? raw : {};
  const proj = { uid: uid || u.uid || null };
  const fields = [
    'name',
    'nameLower',
    'username',
    'usernameLower',
    'photoURL',
    'photoThumb',
    'avatar',
    'profileType',
    'city',
    'bio',
    'age',
    'interests',
    'hobbies',
    'topCat',
    'prompts',
    'icebreakers',
    'profileMedia',
    'sectionOrder',
    'customSections',
    'openToMeet',
    'createdAt',
    'lookingFor',
    'matchIntent',
    'intents',
    'occupation',
    'personality',
    'relationshipCounts',
  ];
  fields.forEach((k) => {
    if (u[k] !== undefined) proj[k] = u[k];
  });
  if (u.profile && typeof u.profile === 'object') {
    const nested = {};
    ['displayName', 'username', 'bio', 'interests', 'prompts', 'profileType', 'currentCity', 'occupation', 'lookingFor', 'age', 'profileMedia', 'sectionOrder', 'customSections'].forEach((k) => {
      if (u.profile[k] != null) nested[k] = u.profile[k];
    });
    if (Object.keys(nested).length) proj.profile = nested;
  }
  if (!proj.city && u.profile?.currentCity) proj.city = u.profile.currentCity;
  if (!proj.bio && u.profile?.bio) proj.bio = u.profile.bio;
  if (!proj.nameLower && proj.name) proj.nameLower = String(proj.name).toLowerCase().trim();
  if (!proj.usernameLower && proj.username) proj.usernameLower = String(proj.username).toLowerCase().trim();
  if (!proj.profileType) proj.profileType = u.profile?.profileType || 'personal';
  return proj;
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
    if (!('isPublic' in d)) patch.isPublic = true;
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
    const proj = buildPublicProjection(doc.id, doc.data() || {});
    // Never write hiddenFromDiscovery from private user projection
    delete proj.hiddenFromDiscovery;
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

  return out;
}

module.exports = {
  BATCH,
  buildPublicProjection,
  backfillGroups,
  backfillUsersPublic,
  runDenormBackfillPage,
};
