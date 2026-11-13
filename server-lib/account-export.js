/**
 * "Download my data" (Global L8): an async export job → ZIP of JSON + the user's uploaded media,
 * an in-app "ready" notification and a download link that expires.
 * Folded into api/media-config (request_export / export_status / GET ?export=) and
 * api/chaupaal-scheduler (retry + expiry) — no new Hobby function.
 *
 * Storage: Firebase Storage `exports/{uid}/{jobId}.zip` (served through a fresh 10-minute signed
 * URL after our own token + expiry check). Without a bucket, the ZIP is kept in admin-only
 * Firestore chunks and streamed by the same link (capped below the 4.5 MB Vercel response limit;
 * media then listed by URL instead of embedded).
 */
'use strict';

const crypto = require('crypto');
const { buildZip } = require('./zip');
const { collectMediaUrls } = require('./account-purge');

const LINK_DAYS = 7;
const DAY_MS = 86400000;
const BUILD_BUDGET_MS = Number(process.env.EXPORT_BUILD_BUDGET_MS) || 20000;
const MEDIA_MAX_FILES = Number(process.env.EXPORT_MEDIA_MAX_FILES) || 200;
const MEDIA_MAX_BYTES = Number(process.env.EXPORT_MEDIA_MAX_BYTES) || 60 * 1024 * 1024;
const FALLBACK_MAX_BYTES = 3.5 * 1024 * 1024;
const CHUNK_BYTES = 900 * 1024;
const SUB_LIMIT = 1000;
const LIST_LIMIT = 1000;
const REUSE_MS = 15 * 60 * 1000;

/** Never exported: secrets / internal-only values. */
const STRIP_KEYS = ['parentalConsentPending', 'otpHash', 'tokenHash', 'token', 'password', 'fcmToken'];

function bucketName(adminApp) {
  const env = String(process.env.FIREBASE_STORAGE_BUCKET || process.env.EXPORT_STORAGE_BUCKET || '').trim();
  if (env) return env;
  try {
    const sa = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_JSON || '{}');
    if (sa.project_id) return `${sa.project_id}.firebasestorage.app`;
  } catch (e) {}
  try {
    const pid = adminApp && adminApp.app && adminApp.app().options && adminApp.app().options.projectId;
    if (pid) return `${pid}.firebasestorage.app`;
  } catch (e) {}
  return null;
}

function plain(val, depth) {
  const d = depth || 0;
  if (val == null || d > 12) return val == null ? val : '[…]';
  if (typeof val.toDate === 'function') {
    try {
      return val.toDate().toISOString();
    } catch (e) {
      return null;
    }
  }
  if (Buffer.isBuffer(val)) return '[binary]';
  if (Array.isArray(val)) return val.map((v) => plain(v, d + 1));
  if (typeof val === 'object') {
    if (typeof val.latitude === 'number' && typeof val.longitude === 'number') return { lat: val.latitude, lng: val.longitude };
    if (val.path && val.firestore) return String(val.path);
    const out = {};
    Object.keys(val).forEach((k) => {
      if (STRIP_KEYS.indexOf(k) >= 0) return;
      out[k] = plain(val[k], d + 1);
    });
    return out;
  }
  return val;
}

function rows(docs) {
  return (docs || []).map((d) => ({ id: d.id, ...plain(d.data() || {}) }));
}

async function safeGet(q, limit) {
  try {
    const snap = await (limit ? q.limit(limit) : q).get();
    return snap.docs || [];
  } catch (e) {
    return [];
  }
}

/**
 * Everything the user gave us or we derived about them (their own data only — other people's
 * private posts and messages are never included).
 * @returns {Promise<{ sections: Object<string, any>, media: string[] }>}
 */
async function collectExportData(db, uid) {
  const userRef = db.collection('users').doc(uid);
  const userSnap = await userRef.get();
  const user = userSnap.exists ? plain(userSnap.data() || {}) : {};
  const sections = {};

  sections['profile.json'] = user;
  const pub = await db.collection('users_public').doc(uid).get().catch(() => null);
  sections['public_profile.json'] = pub && pub.exists ? plain(pub.data()) : null;

  sections['settings.json'] = {
    lang: user.lang || null,
    contentLangs: user.contentLangs || null,
    region: user.region || null,
    privacy: user.privacy || null,
    profileVisibility: user.profileVisibility || (user.profile && user.profile.profileVisibility) || null,
    openToMeet: user.openToMeet,
    strangerDailyLimit: user.strangerDailyLimit,
    activitySignalsOptOut: user.activitySignalsOptOut === true,
    notifications: Object.keys(user)
      .filter((k) => /^notif/i.test(k) || /Prefs$/.test(k))
      .reduce((o, k) => ((o[k] = user[k]), o), {}),
  };

  // Every sub-collection of users/{uid} (journal, saved, likes, wallet, chipTransactions, gameStats,
  // achievements, followers, following, friend requests, consentLog, sessions, drafts …).
  const account = {};
  let subs = [];
  try {
    subs = typeof userRef.listCollections === 'function' ? await userRef.listCollections() : [];
  } catch (e) {
    subs = [];
  }
  for (const col of subs) {
    if (col.id === 'fcmTokens') {
      account[col.id] = { count: (await safeGet(col, SUB_LIMIT)).length };
      continue;
    }
    account[col.id] = rows(await safeGet(col, SUB_LIMIT));
  }
  sections['account.json'] = account;

  sections['consents.json'] = {
    current: user.consents || null,
    log: account.consentLog || [],
    legalAcceptance: user.legalAcceptance || null,
    parentalConsent: user.parentalConsent || null,
    parentalConsentRecords: rows(await safeGet(db.collection('parentalConsents').where('childUid', '==', uid), 20)),
  };

  const blocks = await db.collection('blocks').doc(uid).get().catch(() => null);
  sections['relationships.json'] = {
    following: account.following || [],
    followers: account.followers || [],
    friendRequests: account.friendRequests || [],
    sentFriendRequests: account.sentFriendRequests || [],
    closeFriends: account.close_friends || [],
    blocked: blocks && blocks.exists ? plain(blocks.data()) : null,
    reportsFiled: rows(await safeGet(db.collection('user_flags').where('reporterUid', '==', uid), LIST_LIMIT)),
  };

  const owned = {};
  for (const col of ['duniya', 'peepal', 'duniya_stories', 'baithak_stories']) {
    owned[col] = rows(await safeGet(db.collection(col).where('uid', '==', uid), LIST_LIMIT));
  }
  sections['posts.json'] = owned;

  sections['comments.json'] = (await safeGet(db.collectionGroup('comments').where('uid', '==', uid), LIST_LIMIT * 2)).map((d) => ({
    id: d.id,
    on: d.ref.parent && d.ref.parent.parent ? d.ref.parent.parent.path : null,
    ...plain(d.data() || {}),
  }));

  sections['messages_sent.json'] = (await safeGet(db.collectionGroup('messages').where('uid', '==', uid), LIST_LIMIT * 3)).map((d) => ({
    id: d.id,
    chatId: d.ref.parent && d.ref.parent.parent ? d.ref.parent.parent.id : null,
    ...plain(d.data() || {}),
  }));

  sections['games.json'] = {
    wallet: account.wallet || [],
    chipLedger: account.chipTransactions || [],
    ratingsAndStats: account.gameStats || [],
    achievements: account.achievements || [],
    resolves: account.gameResolves || [],
    dailyScores: rows(await safeGet(db.collectionGroup('scores').where('uid', '==', uid), LIST_LIMIT)),
    notes: 'Virtual chips have no cash value and cannot be withdrawn.',
  };

  const extra = {};
  for (const [col, field] of [
    ['daily_checkins', 'uid'],
    ['liveLocationShares', 'uid'],
    ['search_feedback', 'uid'],
    ['discovery_reactions', 'uid'],
    ['match_outcomes', 'uid'],
    ['chaupaalTransactions', 'uid'],
    ['chaupaalFeedback', 'userId'],
    ['companionProductFeedback', 'uid'],
    ['chatRatings', 'raterUid'],
  ]) {
    extra[col] = rows(await safeGet(db.collection(col).where(field, '==', uid), LIST_LIMIT));
  }
  sections['activity.json'] = extra;

  const derived = {};
  for (const col of ['userModels', 'chaupaalUserState', 'premium', 'user_status']) {
    const s = await db.collection(col).doc(uid).get().catch(() => null);
    derived[col] = s && s.exists ? plain(s.data()) : null;
  }
  sections['inferred_and_derived.json'] = derived;

  sections['notifications.json'] = rows(await safeGet(db.collection('notifications').doc(uid).collection('items'), LIST_LIMIT));

  const media = collectMediaUrls({ user, owned, messages: sections['messages_sent.json'], account: { journal: account.journal, story_highlights: account.story_highlights } });
  return { sections, media: [...media] };
}

function readme(meta) {
  return [
    'Chaupaal — your data export',
    '',
    `Exported: ${new Date(meta.at).toISOString()}`,
    `Account: ${meta.uid}`,
    '',
    'What is inside (JSON, UTF-8):',
    '  profile.json              your account record (everything stored on users/{uid})',
    '  public_profile.json       what other people can see',
    '  settings.json             language, region, privacy and notification settings',
    '  account.json              every list under your account (journal, saved, likes, wallet, game stats …)',
    '  consents.json             your consent choices + the log of each change, legal acceptance, parental consent',
    '  relationships.json        follows, followers, friend requests, close friends, people you blocked / reported',
    '  posts.json                your Duniya posts, Peepal questions, stories',
    '  comments.json             comments you wrote',
    '  messages_sent.json        messages you sent (other people’s messages are not included)',
    '  games.json                virtual chip ledger (no cash value), ratings, achievements, scores',
    '  activity.json             check-ins, location shares, feedback, ratings you gave',
    '  inferred_and_derived.json what Chaupaal computed from your activity (interest model, cadence)',
    '  notifications.json        your notification inbox',
    '  media/                    photos and videos you uploaded',
    '  media/not_included.json   media we could not fetch in time (still downloadable from the URLs)',
    '',
    'Questions or corrections: Settings → Privacy & data.',
  ].join('\n');
}

async function fetchMedia(urls, deadlineMs, maxBytes) {
  const files = [];
  const skipped = [];
  let bytes = 0;
  const list = urls.slice(0, MEDIA_MAX_FILES);
  urls.slice(MEDIA_MAX_FILES).forEach((u) => skipped.push({ url: u, reason: 'limit' }));
  let i = 0;
  const worker = async () => {
    while (i < list.length) {
      const url = list[i++];
      if (Date.now() > deadlineMs || bytes >= maxBytes || typeof fetch !== 'function') {
        skipped.push({ url, reason: Date.now() > deadlineMs ? 'time' : 'size' });
        continue;
      }
      try {
        const ctl = typeof AbortController === 'function' ? new AbortController() : null;
        const timer = ctl ? setTimeout(() => ctl.abort(), Math.max(1000, Math.min(6000, deadlineMs - Date.now()))) : null;
        const res = await fetch(url, ctl ? { signal: ctl.signal } : {});
        if (timer) clearTimeout(timer);
        if (!res.ok) {
          skipped.push({ url, reason: 'http_' + res.status });
          continue;
        }
        const buf = Buffer.from(await res.arrayBuffer());
        if (bytes + buf.length > maxBytes) {
          skipped.push({ url, reason: 'size' });
          continue;
        }
        bytes += buf.length;
        const name = String(url.split('?')[0].split('/').pop() || 'file').replace(/[^\w.-]/g, '_').slice(-80);
        files.push({ name: 'media/' + String(files.length + 1).padStart(3, '0') + '_' + name, data: buf, url });
      } catch (e) {
        skipped.push({ url, reason: 'error' });
      }
    }
  };
  await Promise.all([worker(), worker(), worker(), worker()]);
  return { files, skipped, bytes };
}

function zipFrom(sections, mediaFiles, skipped, meta) {
  const entries = [{ name: 'README.txt', data: readme(meta) }];
  Object.keys(sections).forEach((name) => entries.push({ name, data: JSON.stringify(sections[name], null, 2) }));
  mediaFiles.forEach((f) => entries.push({ name: f.name, data: f.data }));
  entries.push({
    name: 'media/index.json',
    data: JSON.stringify({ included: mediaFiles.map((f) => ({ file: f.name, url: f.url })) }, null, 2),
  });
  if (skipped.length) entries.push({ name: 'media/not_included.json', data: JSON.stringify(skipped, null, 2) });
  return buildZip(entries);
}

async function storeZip(adminApp, job, buf, deps) {
  const d = deps || {};
  const db = adminApp.firestore();
  const name = bucketName(adminApp);
  if (!d.noStorage && name && typeof adminApp.storage === 'function') {
    try {
      const path = `exports/${job.uid}/${job.id}.zip`;
      await adminApp
        .storage()
        .bucket(name)
        .file(path)
        .save(buf, { resumable: false, contentType: 'application/zip', metadata: { cacheControl: 'private, no-store' } });
      return { storage: 'gcs', path, bucket: name };
    } catch (e) {
      console.warn('[export] storage save failed — Firestore fallback', e && e.message);
    }
  }
  if (buf.length > FALLBACK_MAX_BYTES) return { tooBig: true };
  const ref = db.collection('exportJobs').doc(job.id);
  const n = Math.ceil(buf.length / CHUNK_BYTES);
  for (let i = 0; i < n; i++) {
    await ref.collection('chunks').doc(String(i).padStart(3, '0')).set({ i, data: buf.slice(i * CHUNK_BYTES, (i + 1) * CHUNK_BYTES) });
  }
  return { storage: 'firestore', chunks: n };
}

function linkFor(job) {
  return `/api/media-config?export=${encodeURIComponent(job.id)}&t=${encodeURIComponent(job.token)}`;
}

function publicJob(job, now) {
  if (!job) return null;
  const t = now || Date.now();
  const expired = job.status === 'expired' || (job.status === 'ready' && Number(job.expiresAtMs) <= t);
  return {
    id: job.id,
    status: expired ? 'expired' : job.status,
    requestedAtMs: job.requestedAtMs || null,
    readyAtMs: job.readyAtMs || null,
    expiresAtMs: job.expiresAtMs || null,
    bytes: job.bytes || null,
    mediaIncluded: job.mediaIncluded || 0,
    mediaSkipped: job.mediaSkipped || 0,
    downloadUrl: job.status === 'ready' && !expired ? linkFor(job) : null,
  };
}

async function latestJob(db, uid) {
  const docs = await safeGet(db.collection('exportJobs').where('uid', '==', uid), 20);
  const list = docs.map((d) => ({ id: d.id, ...(d.data() || {}) }));
  list.sort((a, b) => (b.requestedAtMs || 0) - (a.requestedAtMs || 0));
  return list[0] || null;
}

/** Reuse a fresh or ready job (one export at a time), else queue a new one. */
async function createExportJob(db, uid, opts) {
  const now = (opts && opts.now) || Date.now();
  const last = await latestJob(db, uid);
  if (last) {
    const fresh = (last.status === 'queued' || last.status === 'building') && now - (last.requestedAtMs || 0) < REUSE_MS;
    const live = last.status === 'ready' && Number(last.expiresAtMs) > now;
    if (fresh || live) return { job: last, reused: true };
  }
  const ref = db.collection('exportJobs').doc();
  const job = {
    id: ref.id,
    uid,
    status: 'queued',
    token: crypto.randomBytes(24).toString('hex'),
    requestedAtMs: now,
    attempts: 0,
  };
  await ref.set(job);
  return { job, reused: false };
}

async function runExportJob(adminApp, jobOrId, opts) {
  const o = opts || {};
  const db = adminApp.firestore();
  const ref = db.collection('exportJobs').doc(typeof jobOrId === 'string' ? jobOrId : jobOrId.id);
  const snap = await ref.get();
  if (!snap.exists) return null;
  const job = { id: snap.id, ...(snap.data() || {}) };
  if (job.status === 'ready' || job.status === 'expired') return job;
  const started = Date.now();
  const deadline = o.deadlineMs || started + BUILD_BUDGET_MS;
  await ref.set({ status: 'building', attempts: (job.attempts || 0) + 1, startedAtMs: started }, { merge: true });
  try {
    const { sections, media } = await collectExportData(db, job.uid);
    const meta = { at: Date.now(), uid: job.uid };
    const fetched = o.skipMedia
      ? { files: [], skipped: media.map((url) => ({ url, reason: 'skipped' })), bytes: 0 }
      : await fetchMedia(media, deadline - 2000, MEDIA_MAX_BYTES);
    let buf = zipFrom(sections, fetched.files, fetched.skipped, meta);
    let stored = await storeZip(adminApp, job, buf, o);
    let files = fetched.files;
    let skipped = fetched.skipped;
    if (stored.tooBig) {
      skipped = skipped.concat(files.map((f) => ({ url: f.url, reason: 'size' })));
      files = [];
      buf = zipFrom(sections, [], skipped, meta);
      stored = await storeZip(adminApp, job, buf, { ...o, noStorage: true });
      if (stored.tooBig) throw Object.assign(new Error('Export too large for fallback storage'), { code: 'EXPORT_TOO_LARGE' });
    }
    const readyAtMs = Date.now();
    const patch = {
      status: 'ready',
      readyAtMs,
      expiresAtMs: readyAtMs + LINK_DAYS * DAY_MS,
      bytes: buf.length,
      mediaIncluded: files.length,
      mediaSkipped: skipped.length,
      sections: Object.keys(sections),
      ...stored,
    };
    await ref.set(patch, { merge: true });
    const done = { ...job, ...patch };
    if (o.notify !== false) await notifyReady(adminApp, done);
    return done;
  } catch (e) {
    console.warn('[export] build failed', e && e.message);
    const attempts = (job.attempts || 0) + 1;
    await ref.set({ status: attempts >= 3 ? 'failed' : 'queued', error: String((e && e.code) || 'error').slice(0, 40) }, { merge: true });
    return { ...job, status: attempts >= 3 ? 'failed' : 'queued' };
  }
}

async function notifyReady(adminApp, job) {
  try {
    const { upsertNotification } = require('./notifications');
    await upsertNotification(adminApp, job.uid, {
      type: 'data_export_ready',
      refId: job.id,
      actor: { uid: 'chaupaal', name: 'Chaupaal', avatar: '📦' },
      previewKey: 'notifications.push.data_export_ready',
      previewParams: { days: LINK_DAYS },
      deepLink: { privacy: 'export' },
    });
  } catch (e) {
    console.warn('[export] notify', e && e.message);
  }
}

/** GET /api/media-config?export=<job>&t=<token> — our token + expiry first, then the bytes. */
async function serveExportDownload(adminApp, req, res) {
  const q = req.query || {};
  const id = String(q.export || '').slice(0, 64);
  const token = String(q.t || '').slice(0, 96);
  const db = adminApp.firestore();
  const snap = id ? await db.collection('exportJobs').doc(id).get() : null;
  const job = snap && snap.exists ? { id: snap.id, ...(snap.data() || {}) } : null;
  const okToken =
    job && job.token && token.length === job.token.length && crypto.timingSafeEqual(Buffer.from(token), Buffer.from(job.token));
  res.setHeader('Cache-Control', 'private, no-store');
  if (!okToken || job.status !== 'ready') return { status: 404 };
  if (Number(job.expiresAtMs) <= Date.now()) return { status: 410 };
  const filename = `chaupaal-data-${new Date(job.readyAtMs || Date.now()).toISOString().slice(0, 10)}.zip`;
  if (job.storage === 'gcs') {
    const [url] = await adminApp
      .storage()
      .bucket(job.bucket || bucketName(adminApp))
      .file(job.path)
      .getSignedUrl({ action: 'read', expires: Date.now() + 10 * 60 * 1000, responseDisposition: `attachment; filename="${filename}"` });
    return { status: 302, location: url };
  }
  const chunks = await db.collection('exportJobs').doc(job.id).collection('chunks').get();
  const parts = (chunks.docs || [])
    .map((d) => d.data() || {})
    .sort((a, b) => a.i - b.i)
    .map((c) => (Buffer.isBuffer(c.data) ? c.data : Buffer.from(c.data && c.data.toUint8Array ? c.data.toUint8Array() : c.data || [])));
  return { status: 200, body: Buffer.concat(parts), filename };
}

/** Scheduler: finish queued jobs, expire old links (and delete their files). */
async function processExportJobs(adminApp, opts) {
  const o = opts || {};
  const db = adminApp.firestore();
  const now = Date.now();
  const out = { built: 0, expired: 0 };
  for (const d of await safeGet(db.collection('exportJobs').where('status', 'in', ['queued', 'building']), o.limit || 5)) {
    if (o.deadlineMs && Date.now() > o.deadlineMs) break;
    const r = await runExportJob(adminApp, d.id, { deadlineMs: Math.min(o.deadlineMs || Infinity, Date.now() + BUILD_BUDGET_MS) });
    if (r && r.status === 'ready') out.built++;
  }
  for (const d of await safeGet(db.collection('exportJobs').where('status', '==', 'ready'), 50)) {
    const j = d.data() || {};
    if (Number(j.expiresAtMs) > now) continue;
    try {
      if (j.storage === 'gcs' && j.path) await adminApp.storage().bucket(j.bucket || bucketName(adminApp)).file(j.path).delete({ ignoreNotFound: true });
      if (typeof db.recursiveDelete === 'function') await db.recursiveDelete(d.ref.collection('chunks'));
    } catch (e) {}
    await d.ref.set({ status: 'expired', token: null }, { merge: true });
    out.expired++;
  }
  return out;
}

module.exports = {
  LINK_DAYS,
  bucketName,
  collectExportData,
  createExportJob,
  runExportJob,
  publicJob,
  latestJob,
  serveExportDownload,
  processExportJobs,
  linkFor,
};
