/**
 * Signal spine (P4) — consented behavioral event ingest + daily rollups + pruning.
 *
 * Envelope (client → server):
 *   { v, id, uid?, ts, type, surface, objType?, objId?, ctx?, dur?, pos?, sessionId }
 *
 * Storage:
 *   signalEvents/{yyyyMMdd}/items/{eventId}   — high-value raw (bounded TTL)
 *   users/{uid}/signalRollups/{yyyyMMdd}      — primary learnable artifact (longer TTL)
 *
 * Existing stores (do not duplicate — P5 read-map):
 *   users/{uid}/recommendationSignals     — more_like / not_interested / peepal reactions
 *   matchEngagementEvents                 — match outcome training
 *   discoveryQueryLogs                    — hashed search + intent (server discovery)
 *   chaupaalUserState.hourBuckets         — coarse activity hours
 *   search_feedback / discovery_reactions / match_outcomes — legacy client creates
 */
'use strict';

const crypto = require('crypto');

const SCHEMA_V = 1;
const RAW_TTL_DAYS = 14;
const ROLLUP_TTL_DAYS = 90;
const MAX_BATCH = 40;
const MAX_RAW_PER_USER_DAY = 80;
const MAX_EVENTS_PER_USER_DAY = 400;

/** High-value types kept in raw stream (others rollup-only). */
const RAW_TYPES = new Set([
  'game_end',
  'follow',
  'unfollow',
  'friend_request',
  'friend_accept',
  'dm_open',
  'result_click',
  'search',
  'room_leave',
  'media_complete',
  'reply',
]);

const ALLOWED_TYPES = new Set([
  'impression',
  'dwell',
  'skip',
  'open',
  'like',
  'comment',
  'save',
  'share',
  'follow',
  'unfollow',
  'friend_request',
  'friend_accept',
  'dm_open',
  'dm_send',
  'reply',
  'game_start',
  'game_end',
  'room_join',
  'room_leave',
  'media_start',
  'media_complete',
  'search',
  'result_click',
  'more_like',
  'not_interested',
]);

const ALLOWED_SURFACES = new Set([
  'duniya',
  'peepal',
  'akhbaar',
  'stories',
  'khoj',
  'baithak',
  'mehfil',
  'dangal',
  'profile',
  'pager',
  'categories',
  'system',
]);

function dayKeyUTC(d = new Date()) {
  return d.toISOString().slice(0, 10).replace(/-/g, '');
}

function dayKeyISO(d = new Date()) {
  return d.toISOString().slice(0, 10);
}

function clampStr(v, n) {
  return String(v == null ? '' : v).slice(0, n);
}

function sanitizeCtx(ctx) {
  if (!ctx || typeof ctx !== 'object') return {};
  const out = {};
  const allow = [
    'gameId',
    'mode',
    'result',
    'rated',
    'eloDelta',
    'genre',
    'intent',
    'chips',
    'qHash',
    'city',
    'role',
    'mediaKind',
    'sampleRate',
    'teen',
  ];
  for (const k of allow) {
    if (ctx[k] == null) continue;
    if (k === 'chips' && Array.isArray(ctx[k])) {
      out.chips = ctx[k].slice(0, 8).map((c) => clampStr(c, 40));
    } else if (typeof ctx[k] === 'number' && Number.isFinite(ctx[k])) {
      out[k] = ctx[k];
    } else if (typeof ctx[k] === 'boolean') {
      out[k] = ctx[k];
    } else {
      out[k] = clampStr(ctx[k], 80);
    }
  }
  // Never accept raw query / message / journal / precise coords
  return out;
}

function normalizeEvent(raw, uid) {
  if (!raw || typeof raw !== 'object') return null;
  const type = clampStr(raw.type, 40);
  const surface = clampStr(raw.surface, 40);
  if (!ALLOWED_TYPES.has(type) || !ALLOWED_SURFACES.has(surface)) return null;
  const id = clampStr(raw.id || '', 80);
  if (!id || id.length < 8) return null;
  const ts = Number(raw.ts);
  const now = Date.now();
  if (!Number.isFinite(ts) || Math.abs(now - ts) > 48 * 3600 * 1000) return null;
  const dur = Number(raw.dur);
  const pos = Number(raw.pos);
  return {
    v: SCHEMA_V,
    id,
    uid,
    ts,
    type,
    surface,
    objType: clampStr(raw.objType || '', 40) || null,
    objId: clampStr(raw.objId || '', 128) || null,
    ctx: sanitizeCtx(raw.ctx),
    dur: Number.isFinite(dur) && dur >= 0 && dur < 86400000 ? Math.floor(dur) : null,
    pos: Number.isFinite(pos) && pos >= 0 && pos < 10000 ? Math.floor(pos) : null,
    sessionId: clampStr(raw.sessionId || '', 80) || null,
  };
}

/**
 * Load consent flags for a user. Default ON (4D).
 * Opt-out stops behavioral collection entirely.
 */
async function loadConsent(db, uid) {
  try {
    const snap = await db.collection('users').doc(uid).get();
    const d = snap.exists ? snap.data() || {} : {};
    const profile = d.profile && typeof d.profile === 'object' ? d.profile : {};
    const activityOptOut =
      d.activitySignalsOptOut === true || profile.activitySignalsOptOut === true;
    const companionOptOut = d.companionOptOut === true;
    const akhbaarOptOut =
      d.akhbaarPersonalizeOptOut === true || profile.akhbaarPersonalizeOptOut === true;
    const teen =
      d.teenMode === true ||
      profile.teenMode === true ||
      (typeof d.age === 'number' && d.age < 18) ||
      (typeof profile.age === 'number' && profile.age < 18);
    return {
      collect: !activityOptOut,
      companionOptOut,
      akhbaarOptOut,
      teen: !!teen,
      openToMeet: d.openToMeet !== false,
    };
  } catch (e) {
    return { collect: true, companionOptOut: false, akhbaarOptOut: false, teen: false, openToMeet: true };
  }
}

/** Teen: no search/dwell/mehfil media affinity; keep social/game safety-relevant. */
function allowedForTeen(type) {
  const blocked = new Set(['search', 'result_click', 'dwell', 'media_start', 'media_complete', 'impression']);
  return !blocked.has(type);
}

function bumpRollup(rollup, ev) {
  const r = rollup || {
    v: SCHEMA_V,
    day: dayKeyISO(),
    counts: {},
    surfaces: {},
    dwellMs: 0,
    games: {},
    genres: {},
    updatedAt: null,
  };
  r.counts[ev.type] = (Number(r.counts[ev.type]) || 0) + 1;
  r.surfaces[ev.surface] = (Number(r.surfaces[ev.surface]) || 0) + 1;
  if (ev.type === 'dwell' && ev.dur) r.dwellMs = (Number(r.dwellMs) || 0) + ev.dur;
  if (ev.type === 'game_end' && ev.ctx?.gameId) {
    const g = clampStr(ev.ctx.gameId, 40);
    r.games[g] = (Number(r.games[g]) || 0) + 1;
    if (ev.ctx.genre) {
      const ge = clampStr(ev.ctx.genre, 40);
      r.genres[ge] = (Number(r.genres[ge]) || 0) + 1;
    }
  }
  if (ev.type === 'room_leave' && ev.dur) {
    r.mehfilMs = (Number(r.mehfilMs) || 0) + ev.dur;
  }
  r.eventTotal = (Number(r.eventTotal) || 0) + 1;
  return r;
}

/**
 * Ingest a batch of client events for uid.
 * @returns {{ accepted: number, raw: number, skipped: number, reason?: string }}
 */
async function ingestSignalBatch(db, FieldValue, uid, events, { consent } = {}) {
  const c = consent || (await loadConsent(db, uid));
  if (!c.collect) return { accepted: 0, raw: 0, skipped: Array.isArray(events) ? events.length : 0, reason: 'opt_out' };

  const list = (Array.isArray(events) ? events : []).slice(0, MAX_BATCH);
  const day = dayKeyUTC();
  const dayIso = dayKeyISO();
  const rollupRef = db.collection('users').doc(uid).collection('signalRollups').doc(dayIso);
  const capRef = db.collection('users').doc(uid).collection('signalCaps').doc(dayIso);

  let accepted = 0;
  let rawWritten = 0;
  let skipped = 0;

  await db.runTransaction(async (tx) => {
    const capSnap = await tx.get(capRef);
    const cap = capSnap.exists ? capSnap.data() || {} : {};
    let dayCount = Number(cap.count) || 0;
    let rawCount = Number(cap.rawCount) || 0;

    const rollupSnap = await tx.get(rollupRef);
    let rollup = rollupSnap.exists ? rollupSnap.data() || {} : { v: SCHEMA_V, day: dayIso, counts: {}, surfaces: {}, dwellMs: 0, games: {}, genres: {} };

    const seen = new Set(Array.isArray(cap.recentIds) ? cap.recentIds : []);

    let wroteDayMeta = false;
    for (const raw of list) {
      if (dayCount >= MAX_EVENTS_PER_USER_DAY) {
        skipped += 1;
        continue;
      }
      const ev = normalizeEvent(raw, uid);
      if (!ev) {
        skipped += 1;
        continue;
      }
      if (c.teen && !allowedForTeen(ev.type)) {
        skipped += 1;
        continue;
      }
      if (seen.has(ev.id)) {
        skipped += 1;
        continue;
      }
      seen.add(ev.id);
      dayCount += 1;
      accepted += 1;
      rollup = bumpRollup(rollup, ev);

      const keepRaw = RAW_TYPES.has(ev.type) && rawCount < MAX_RAW_PER_USER_DAY;
      if (keepRaw) {
        rawCount += 1;
        rawWritten += 1;
        if (!wroteDayMeta) {
          const dayRef = db.collection('signalEvents').doc(day);
          tx.set(dayRef, { day, updatedAt: FieldValue.serverTimestamp() }, { merge: true });
          wroteDayMeta = true;
        }
        const itemRef = db.collection('signalEvents').doc(day).collection('items').doc(ev.id);
        tx.set(itemRef, {
          ...ev,
          receivedAt: FieldValue.serverTimestamp(),
          expireAt: new Date(Date.now() + RAW_TTL_DAYS * 86400000),
        });
      }
    }

    const recentIds = [...seen].slice(-120);
    tx.set(
      capRef,
      {
        count: dayCount,
        rawCount,
        recentIds,
        updatedAt: FieldValue.serverTimestamp(),
      },
      { merge: true }
    );
    rollup.updatedAt = FieldValue.serverTimestamp();
    rollup.expireAt = new Date(Date.now() + ROLLUP_TTL_DAYS * 86400000);
    tx.set(rollupRef, rollup, { merge: true });
  });

  return { accepted, raw: rawWritten, skipped };
}

/**
 * Prune aged raw signal day partitions. Call from scheduler.
 */
async function pruneSignalEvents(db, { maxDays = 3, olderThanDays = RAW_TTL_DAYS } = {}) {
  const cutoff = new Date(Date.now() - olderThanDays * 86400000);
  const cutoffKey = dayKeyUTC(cutoff);
  const root = db.collection('signalEvents');
  const snap = await root.orderBy('__name__').limit(40).get();
  let deletedDays = 0;
  let deletedItems = 0;
  for (const dayDoc of snap.docs) {
    if (dayDoc.id >= cutoffKey) continue;
    const items = await dayDoc.ref.collection('items').limit(200).get();
    const batch = db.batch();
    items.docs.forEach((d) => batch.delete(d.ref));
    if (!items.empty) await batch.commit();
    deletedItems += items.size;
    if (items.size < 200) {
      await dayDoc.ref.delete().catch(() => {});
      deletedDays += 1;
    }
    if (deletedDays >= maxDays) break;
  }
  return { deletedDays, deletedItems, cutoffKey };
}

function hashQuery(text) {
  const t = String(text || '')
    .trim()
    .toLowerCase()
    .slice(0, 200);
  if (!t) return '';
  return crypto.createHash('sha256').update(t).digest('hex').slice(0, 32);
}

module.exports = {
  SCHEMA_V,
  RAW_TTL_DAYS,
  ROLLUP_TTL_DAYS,
  ALLOWED_TYPES,
  ALLOWED_SURFACES,
  RAW_TYPES,
  loadConsent,
  ingestSignalBatch,
  pruneSignalEvents,
  hashQuery,
  dayKeyUTC,
  dayKeyISO,
  normalizeEvent,
};
