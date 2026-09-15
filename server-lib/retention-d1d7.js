/**
 * Growth G5 — honest D1–D7 retention (event-backed or clearly generic).
 *
 * Day-0 anchor: users/{uid}.createdAt (Auth signup / first profile write).
 * Calendar days use Asia/Kolkata (or chaupaalUserState.timezone).
 *
 * Caps: ≤1 retention push/local day; ≤4 in first 7 days (event-backed
 * "something waiting" may exceed the 4-cap; still 1/day). Guests, Quiet,
 * tips-off, and recently active (last 6h) skip "come back" templates.
 *
 * Idempotent keys: retentionSends/{dayKey}_{templateId} under the user.
 * No fake social proof. DMs stay on notifications.js — not this channel.
 */

const { localDateKey } = require('./chaupaal-cadence');
const { sendToUser } = require('./fcm');
const { hrefFromDeepLink } = require('./notifications');

const RECENT_ACTIVE_MS = 6 * 60 * 60 * 1000;
const FIRST7_CAP = 4;
const INACTIVE_MIN_DAYS = 7;
const INACTIVE_COOLDOWN_DAYS = 14;

const TEMPLATES = {
  d1_continue: {
    day: 1,
    kind: 'generic',
    title: 'Welcome back',
    body: 'Pick up where you left off on Chaupaal — a calm quiz or a quick look around.',
    section: 'akhbaar',
  },
  d2_dangal: {
    day: 2,
    kind: 'surface',
    title: 'Try a practice game',
    body: 'Pick up a Dangal practice game whenever you’re ready — no pressure.',
    section: 'dangal',
    requires: 'never_dangal',
  },
  d2_invite: {
    day: 2,
    kind: 'generic',
    title: 'Invite a friend',
    body: 'Chaupaal is better with someone you know — share an invite when it feels right.',
    section: 'baithak',
    path: '/invite',
    requires: 'never_invited',
  },
  d3_invite: {
    day: 3,
    kind: 'generic',
    title: 'Friends on Chaupaal',
    body: 'Invite a friend to Chaupaal — no fake counts, just a share link when you want.',
    section: 'baithak',
    path: '/invite',
    requires: 'never_invited',
  },
  d3_peepal: {
    day: 3,
    kind: 'generic',
    title: 'Explore Peepal',
    body: 'Take a look at Peepal Khoj — questions and people when you’re curious.',
    section: 'peepal',
  },
  d4_waiting: {
    day: 4,
    kind: 'event',
    title: 'Something’s waiting',
    body: 'You have an unread update on Chaupaal — open when you’re free.',
    section: null, // filled from event
    requires: 'has_waiting',
  },
  d5_waiting: {
    day: 5,
    kind: 'event',
    title: 'Still waiting for you',
    body: 'You still have an unread update — no rush, just a gentle reminder.',
    section: null,
    requires: 'has_waiting',
  },
  d6_quiz: {
    day: 6,
    kind: 'generic',
    title: 'Today’s quiz',
    body: 'Today’s Akhbaar quiz is ready when you are.',
    section: 'akhbaar',
  },
  d7_invite: {
    day: 7,
    kind: 'generic',
    title: 'One more invite?',
    body: 'If you haven’t yet, invite a friend to Chaupaal — optional, anytime.',
    section: 'baithak',
    path: '/invite',
    requires: 'never_invited',
  },
  d7_dangal: {
    day: 7,
    kind: 'generic',
    title: 'A quick game',
    body: 'A Dangal practice round is a gentle way to drop back in.',
    section: 'dangal',
  },
  inactive_gentle: {
    day: null,
    kind: 'generic',
    title: 'Chaupaal is here',
    body: 'Whenever you want a quiet quiz or to catch up — Chaupaal is ready.',
    section: 'akhbaar',
  },
};

function toMs(ts) {
  if (!ts) return null;
  if (typeof ts.toDate === 'function') return ts.toDate().getTime();
  if (typeof ts === 'number' && Number.isFinite(ts)) return ts;
  const t = new Date(ts).getTime();
  return Number.isFinite(t) ? t : null;
}

function calendarDayIndex(createdAt, tz = 'Asia/Kolkata', now = new Date()) {
  const ms = toMs(createdAt);
  if (!ms) return -1;
  const signupKey = localDateKey(tz, new Date(ms));
  const todayKey = localDateKey(tz, now);
  const a = Date.parse(`${signupKey}T00:00:00Z`);
  const b = Date.parse(`${todayKey}T00:00:00Z`);
  if (!Number.isFinite(a) || !Number.isFinite(b)) return -1;
  return Math.round((b - a) / 86400000);
}

function sectionPath(section, username) {
  const s = String(section || 'akhbaar').slice(0, 40);
  if (s === 'invite' || section === 'invite') {
    const u = String(username || '')
      .replace(/^@/, '')
      .trim()
      .slice(0, 80);
    return u ? `/invite/${encodeURIComponent(u)}` : '/invite';
  }
  return `/?section=${encodeURIComponent(s)}`;
}

/**
 * Pure selection — no I/O. Used by tests + processUserRetention.
 * @returns {{ templateId: string, template: object, section: string, path: string }|null}
 */
function selectRetentionTemplate({
  dayIndex,
  triedDangal,
  invited,
  waiting,
  waitingSection,
  first7Count,
  lastSentDayKey,
  todayKey,
  inactiveEligible,
}) {
  if (lastSentDayKey && lastSentDayKey === todayKey) {
    return { skip: 'already_today' };
  }

  const underFirst7Cap = (first7Count || 0) < FIRST7_CAP;

  if (dayIndex >= 1 && dayIndex <= 7) {
    const pick = (id, overrides = {}) => {
      const t = TEMPLATES[id];
      if (!t) return null;
      const section = overrides.section || t.section || 'akhbaar';
      const path =
        overrides.path ||
        (t.path === '/invite' ? sectionPath('invite', overrides.username) : sectionPath(section));
      return { templateId: id, template: t, section, path, eventBacked: t.kind === 'event' };
    };

    if (dayIndex === 1) return pick('d1_continue');

    if (dayIndex === 2) {
      if (!triedDangal) return pick('d2_dangal');
      if (!invited) return pick('d2_invite');
      return { skip: 'd2_already_explored' };
    }

    if (dayIndex === 3) {
      if (!invited) return pick('d3_invite');
      return pick('d3_peepal');
    }

    if (dayIndex === 4 || dayIndex === 5) {
      if (waiting) {
        const id = dayIndex === 4 ? 'd4_waiting' : 'd5_waiting';
        return pick(id, { section: waitingSection || 'baithak' });
      }
      if (!underFirst7Cap) return { skip: 'first7_cap' };
      // Soft generic once if nothing waiting
      if (dayIndex === 5) return pick('d6_quiz');
      return { skip: 'no_event_d4' };
    }

    if (dayIndex === 6) {
      if (!underFirst7Cap) return { skip: 'first7_cap' };
      return pick('d6_quiz');
    }

    if (dayIndex === 7) {
      if (!underFirst7Cap) return { skip: 'first7_cap' };
      if (!invited) return pick('d7_invite');
      return pick('d7_dangal');
    }
  }

  if (inactiveEligible) {
    return {
      templateId: 'inactive_gentle',
      template: TEMPLATES.inactive_gentle,
      section: 'akhbaar',
      path: sectionPath('akhbaar'),
      eventBacked: false,
    };
  }

  return { skip: 'out_of_window' };
}

async function latestSessionActiveMs(db, uid) {
  try {
    const snap = await db
      .collection('users')
      .doc(uid)
      .collection('sessions')
      .orderBy('lastActiveAt', 'desc')
      .limit(1)
      .get();
    if (snap.empty) return null;
    return toMs(snap.docs[0].data()?.lastActiveAt);
  } catch {
    return null;
  }
}

async function hasWaitingSignal(db, uid) {
  try {
    const unread = await db
      .collection('notifications')
      .doc(uid)
      .collection('items')
      .where('read', '==', false)
      .limit(3)
      .get();
    for (const d of unread.docs) {
      const data = d.data() || {};
      if (data.retention) continue; // don't self-trigger
      const section = String(data.section || 'baithak').slice(0, 40);
      return { waiting: true, section };
    }
  } catch {
    /* ignore */
  }
  try {
    const fr = await db.collection('users').doc(uid).collection('friendRequests').limit(5).get();
    for (const d of fr.docs) {
      const st = String(d.data()?.status || 'pending').toLowerCase();
      if (st === 'pending' || st === 'incoming' || !d.data()?.status) {
        return { waiting: true, section: 'peepal' };
      }
    }
  } catch {
    /* ignore */
  }
  return { waiting: false, section: null };
}

async function userTriedDangal(db, uid, profile) {
  if (
    profile?.dangalEverPlayed ||
    profile?.stats?.dangalGames > 0 ||
    profile?.gamesPlayed > 0 ||
    profile?.dangalGamesPlayed > 0 ||
    profile?.meta?.gamesPlayed > 0
  ) {
    return true;
  }
  try {
    const snap = await db.collection('users').doc(uid).collection('gameResults').limit(1).get();
    if (!snap.empty) return true;
  } catch {
    /* ignore */
  }
  try {
    const snap = await db.collection('users').doc(uid).collection('dangalResults').limit(1).get();
    if (!snap.empty) return true;
  } catch {
    /* ignore */
  }
  return false;
}

function userHasInvited(profile) {
  const stats = profile?.referralStats || {};
  return !!(
    Number(stats.invitesSent || 0) > 0 ||
    Number(stats.activated || 0) > 0 ||
    Number(stats.granted || 0) > 0 ||
    profile?.inviteSharedAt ||
    profile?.lastInviteAt
  );
}

async function incrementAggregates(db, admin, templateId) {
  const FieldValue = admin.firestore.FieldValue;
  const ref = db.collection('chaupaalMeta').doc('retentionAggregates');
  const patch = {
    retention_sent: FieldValue.increment(1),
    updatedAt: FieldValue.serverTimestamp(),
  };
  patch[`tpl_${String(templateId).slice(0, 40)}`] = FieldValue.increment(1);
  await ref.set(patch, { merge: true });
}

async function writeRetentionInbox(db, admin, uid, { templateId, dayKey, body, section, path }) {
  const FieldValue = admin.firestore.FieldValue;
  const id = `retention_${dayKey}_${templateId}`.slice(0, 180);
  await db
    .collection('notifications')
    .doc(uid)
    .collection('items')
    .doc(id)
    .set(
      {
        type: 'retention',
        refId: id,
        section: section || 'akhbaar',
        actors: [{ uid: 'system', name: 'Chaupaal', avatarUrl: '' }],
        actorCount: 1,
        preview: String(body || '').slice(0, 280),
        deepLink: { path, section },
        createdAt: FieldValue.serverTimestamp(),
        updatedAt: FieldValue.serverTimestamp(),
        updatedAtMs: Date.now(),
        lastReadAt: null,
        read: false,
        retention: true,
      },
      { merge: true }
    );
  return id;
}

/**
 * Process one signed-in user. Failures must not abort the batch.
 */
async function processUserRetention(db, admin, uid, state = {}, opts = {}) {
  const dryRun = !!opts.dryRun;
  const now = opts.now || new Date();
  const tz = state.timezone || 'Asia/Kolkata';
  const todayKey = localDateKey(tz, now);

  let profile = {};
  try {
    const snap = await db.collection('users').doc(uid).get();
    if (!snap.exists) return { skipped: 'no_user' };
    profile = snap.data() || {};
  } catch (e) {
    return { skipped: 'user_read_error', error: e?.message };
  }

  if (profile.guest === true || profile.isGuest === true || profile.guestMode === true) {
    return { skipped: 'guest' };
  }
  if (profile.quietMode === true) return { skipped: 'quiet' };
  if (profile.notifPrefs && profile.notifPrefs.tips === false) return { skipped: 'tips_off' };

  const createdAt = profile.createdAt || state.createdAt || null;
  const dayIndex = calendarDayIndex(createdAt, tz, now);
  if (dayIndex < 0 && dayIndex !== 0) {
    // missing createdAt — skip new-user cadence; inactive path still possible via lastActive
  }

  const ret = state.retention || profile.retention || {};
  const first7Count = Number(ret.first7Count || 0);
  const lastSentDayKey = ret.lastSentDayKey || null;

  const lastActiveMs =
    toMs(profile.lastActiveAt) || (await latestSessionActiveMs(db, uid)) || toMs(state.lastActiveAt);
  const recentlyActive = lastActiveMs && Date.now() - lastActiveMs < RECENT_ACTIVE_MS;

  const triedDangal = await userTriedDangal(db, uid, profile);
  const invited = userHasInvited(profile);
  const wait = await hasWaitingSignal(db, uid);

  let inactiveEligible = false;
  if (dayIndex < 0 || dayIndex > 7) {
    const inactiveDays = lastActiveMs
      ? (Date.now() - lastActiveMs) / 86400000
      : dayIndex > INACTIVE_MIN_DAYS
        ? dayIndex
        : 0;
    const lastInactive = toMs(ret.lastInactiveSentAt);
    const coolOk = !lastInactive || (Date.now() - lastInactive) / 86400000 >= INACTIVE_COOLDOWN_DAYS;
    inactiveEligible = inactiveDays >= INACTIVE_MIN_DAYS && coolOk && !recentlyActive;
  }

  // Come-back generics skip if active recently; event-backed waiting still allowed
  const selection = selectRetentionTemplate({
    dayIndex,
    triedDangal,
    invited,
    waiting: wait.waiting,
    waitingSection: wait.section,
    first7Count,
    lastSentDayKey,
    todayKey,
    inactiveEligible,
  });

  if (selection?.skip) return { skipped: selection.skip };
  if (!selection?.templateId) return { skipped: 'no_template' };

  if (recentlyActive && selection.template.kind !== 'event') {
    return { skipped: 'recently_active' };
  }

  const username = profile.username || profile.handle || '';
  let path = selection.path;
  if (selection.template.path === '/invite') {
    path = sectionPath('invite', username);
  }
  const section = selection.section || selection.template.section || 'akhbaar';
  const templateId = selection.templateId;
  const idemKey = `${todayKey}_${templateId}`;

  // Idempotent doc
  const sendRef = db.collection('users').doc(uid).collection('retentionSends').doc(idemKey);
  const existing = await sendRef.get();
  if (existing.exists) return { skipped: 'idempotent' };

  if (dryRun) {
    return {
      dryRun: true,
      templateId,
      dayIndex,
      path,
      section,
      title: selection.template.title,
      body: selection.template.body,
    };
  }

  await sendRef.set({
    templateId,
    dayIndex,
    dayKey: todayKey,
    path,
    section,
    createdAt: admin.firestore.FieldValue.serverTimestamp(),
  });

  const deepLink = { path, section };
  const link = hrefFromDeepLink(deepLink, { type: 'retention', refId: templateId });
  const title = selection.template.title;
  const body = selection.template.body;

  let inboxId = null;
  try {
    inboxId = await writeRetentionInbox(db, admin, uid, {
      templateId,
      dayKey: todayKey,
      body,
      section,
      path: link,
    });
  } catch (e) {
    console.warn('[retention] inbox', uid, e?.message || e);
  }

  let fcm = { sent: 0 };
  try {
    fcm = await sendToUser(admin, uid, {
      title,
      body,
      link,
      data: {
        type: 'retention',
        templateId,
        section,
      },
    });
  } catch (e) {
    console.warn('[retention] fcm', uid, e?.message || e);
  }

  const nextRetention = {
    lastSentDayKey: todayKey,
    lastTemplateId: templateId,
    first7Count: dayIndex >= 1 && dayIndex <= 7 ? first7Count + 1 : first7Count,
    lastInactiveSentAt:
      templateId === 'inactive_gentle'
        ? new Date().toISOString()
        : ret.lastInactiveSentAt || null,
  };

  try {
    await db.collection('chaupaalUserState').doc(uid).set({ retention: nextRetention }, { merge: true });
  } catch {
    /* ignore */
  }
  try {
    await db.collection('users').doc(uid).set({ retention: nextRetention }, { merge: true });
  } catch {
    /* ignore */
  }

  try {
    await incrementAggregates(db, admin, templateId);
  } catch (e) {
    console.warn('[retention] aggregates', e?.message || e);
  }

  return {
    sent: true,
    templateId,
    dayIndex,
    link,
    inboxId,
    fcmSent: fcm.sent || 0,
  };
}

/**
 * Cursor-batched retention pass (independent of AI gate).
 */
async function processRetentionBatch(db, admin, opts = {}) {
  const batchSize = Math.min(40, Math.max(1, Number(opts.batchSize) || 28));
  const dryRun = !!opts.dryRun;
  const cursorRef = db.collection('chaupaalMeta').doc('retentionCursor');
  const cursorSnap = await cursorRef.get();
  const cursor = cursorSnap.exists ? cursorSnap.data() || {} : {};
  let lastUid = cursor.lastUid || null;

  let q = db.collection('chaupaalUserState').orderBy('__name__').limit(batchSize);
  if (lastUid) q = q.startAfter(lastUid);

  const snap = await q.get();
  const results = {
    users: snap.size,
    sent: 0,
    skipped: 0,
    errors: 0,
    dryRun,
    samples: [],
  };

  for (const doc of snap.docs) {
    const uid = doc.id;
    try {
      const r = await processUserRetention(db, admin, uid, doc.data() || {}, { dryRun });
      if (r.sent || r.dryRun) {
        results.sent++;
        if (results.samples.length < 8) {
          results.samples.push({
            uid: uid.slice(0, 8),
            templateId: r.templateId,
            dayIndex: r.dayIndex,
            dryRun: !!r.dryRun,
          });
        }
      } else {
        results.skipped++;
      }
    } catch (e) {
      results.errors++;
      console.warn('[retention] user', uid, e?.message || e);
    }
  }

  if (!dryRun) {
    if (snap.empty || snap.size < batchSize) {
      await cursorRef.set({ lastUid: null, updatedAt: new Date(), wrapped: true }, { merge: true });
    } else {
      await cursorRef.set(
        {
          lastUid: snap.docs[snap.docs.length - 1].id,
          updatedAt: new Date(),
          wrapped: false,
        },
        { merge: true }
      );
    }
  }

  return results;
}

module.exports = {
  TEMPLATES,
  FIRST7_CAP,
  RECENT_ACTIVE_MS,
  calendarDayIndex,
  selectRetentionTemplate,
  sectionPath,
  processUserRetention,
  processRetentionBatch,
};
