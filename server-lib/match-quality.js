/**
 * People matchmaking quality (P7) — safety-first, reciprocity, anti-repetition,
 * diversity floor, personal vs professional separation.
 *
 * Used after P6 retrieve/rank (or rankPersonalMatches GS pass). Pure helpers are
 * unit-testable; Firestore helpers record recently-shown + suppressions.
 */
'use strict';

const RECENT_SHOWN_HOURS = 72;
const RECENT_SHOWN_CAP = 80;
const NOT_INTERESTED_DAYS = 180; // durable long cooldown (~permanent for product purposes)
const DIVERSITY_MIN_ARCHETYPES = 2;
const NEW_PROFILE_BOOST = 0.06;
const RECIPROCITY_WEIGHT = 0.22;

const OUTCOME_TYPES = Object.freeze({
  connected: 'connected',
  continued: 'continued',
  ghosted: 'ghosted',
  reported: 'reported',
  dismissed: 'dismissed',
});

function clamp01(n) {
  const x = Number(n);
  if (!Number.isFinite(x)) return 0;
  return Math.max(0, Math.min(1, x));
}

function profileTypeOf(u) {
  const t = String(u?.profileType || u?.profile?.profileType || 'personal').toLowerCase();
  return t === 'professional' ? 'professional' : 'personal';
}

function lookingForOf(u) {
  return String(u?.lookingFor || u?.profile?.lookingFor || u?.matchIntent || '')
    .trim()
    .toLowerCase();
}

function isDatingIntent(text) {
  return /dat|relationship|marriage|romantic/.test(String(text || '').toLowerCase());
}

function isProfessionalIntent(text) {
  return /network|hire|hiring|work|job|co-founder|mentor|client|professional|recruit/.test(
    String(text || '').toLowerCase()
  );
}

function archetypeKey(cand) {
  const city = String(cand?.profile?.currentCity || cand?.city || 'x')
    .toLowerCase()
    .slice(0, 20);
  const intent = lookingForOf(cand).slice(0, 24) || 'any';
  const type = profileTypeOf(cand);
  const interest = String((cand?.profile?.interests || cand?.interests || [])[0] || 'gen')
    .toLowerCase()
    .slice(0, 16);
  return `${type}|${city}|${intent}|${interest}`;
}

/**
 * Deterministic reciprocity estimate (0..1):
 * how likely they would want the viewer back, from follow edges + reverse
 * intent alignment + interest overlap + "they follow you" boost.
 * No LLM.
 */
function estimateReciprocity(viewer, cand, edges = {}, signalScores = {}) {
  let s = 0.35;
  if (edges.theyFollowViewer) s += 0.28;
  if (edges.viewerFollowsThem) s += 0.08;
  if (edges.reactedUp) s += 0.1;
  const vLf = lookingForOf(viewer);
  const cLf = lookingForOf(cand);
  if (vLf && cLf) {
    if (vLf.slice(0, 6) === cLf.slice(0, 6) || vLf.includes(cLf.slice(0, 5)) || cLf.includes(vLf.slice(0, 5))) {
      s += 0.18;
    } else if (isDatingIntent(vLf) !== isDatingIntent(cLf) && (isDatingIntent(vLf) || isDatingIntent(cLf))) {
      s -= 0.12; // one-sided dating long-shot
    }
  }
  const overlap = Number(signalScores.interestOverlap);
  if (Number.isFinite(overlap)) s += overlap * 0.15;
  const follow = Number(signalScores.followAffinity);
  if (Number.isFinite(follow)) s += follow * 0.1;
  return clamp01(s);
}

/**
 * Hard filters before any ranking/pairing. Returns eligible candidates only.
 */
function filterSafetyFirst(viewer, candidates, ctx = {}) {
  const {
    blockedSet = new Set(),
    mutedSet = new Set(),
    reportedSet = new Set(),
    notInterestedSet = new Set(),
    viewerIsTeen = false,
    surface = 'personal', // 'personal' | 'professional' | 'discovery'
  } = ctx;
  const viewerType = profileTypeOf(viewer);
  const out = [];
  for (const cand of candidates || []) {
    if (!cand?.uid || cand.uid === viewer.uid) continue;
    if (blockedSet.has(cand.uid) || mutedSet.has(cand.uid) || reportedSet.has(cand.uid)) continue;
    if (notInterestedSet.has(cand.uid)) continue;
    if (cand.openToMeet === false) continue;
    if (cand.hiddenFromDiscovery === true || cand.profile?.hiddenFromDiscovery === true) continue;
    if (cand.shadowbanned === true || cand.deletionStatus === 'requested') continue;
    const age = Number(cand.age || cand.profile?.age);
    if (viewerIsTeen && Number.isFinite(age) && age >= 18) continue;
    if (!viewerIsTeen && Number.isFinite(age) && age > 0 && age < 18) continue;

    const candType = profileTypeOf(cand);
    // Professional surfaces: never dating-style pairing
    if (surface === 'professional' || viewerType === 'professional') {
      if (isDatingIntent(lookingForOf(cand))) continue;
      // Prefer professional / networking; still allow personal profiles for networking if intent is pro
    }
    // Personal surfaces: don't treat professional-only credibility as romance compatibility
    if (surface === 'personal' && viewerType === 'personal') {
      if (candType === 'professional' && isProfessionalIntent(lookingForOf(cand)) && !lookingForOf(cand).includes('friend')) {
        // Allow in discovery with low priority later — skip dating path only
        if (isDatingIntent(lookingForOf(viewer))) continue;
      }
    }
    out.push(cand);
  }
  return out;
}

/**
 * Soft-penalize recently shown; rotate tail. recentMap: { uid: shownAtMs }
 */
function applyAntiRepetition(ranked, recentMap = {}, { now = Date.now(), cooldownMs = RECENT_SHOWN_HOURS * 3600000 } = {}) {
  const cooled = [];
  const fresh = [];
  (ranked || []).forEach((row) => {
    const uid = row.uid || row.user?.uid;
    const at = recentMap[uid];
    if (at && now - Number(at) < cooldownMs) {
      cooled.push({ ...row, score: (Number(row.score) || 0) * 0.35, _recent: true });
    } else {
      fresh.push(row);
    }
  });
  // Prefer fresh first, then cooled tail (rotation)
  return fresh.concat(cooled);
}

/**
 * Ensure batch has archetype variety; boost new profiles slightly.
 */
function applyDiversityFloor(ranked, { minArchetypes = DIVERSITY_MIN_ARCHETYPES, limit } = {}) {
  const list = (ranked || []).map((r) => {
    const cand = r.user || r;
    const created = cand.createdAt?.toMillis?.() || cand.createdAtMs || 0;
    const isNew = created && Date.now() - Number(created) < 14 * 864e5;
    let score = Number(r.score) || 0;
    if (isNew) score += NEW_PROFILE_BOOST;
    return {
      ...r,
      score,
      _archetype: archetypeKey(cand),
      _isNew: !!isNew,
    };
  });
  list.sort((a, b) => b.score - a.score);
  const cap = limit || list.length;
  const picked = [];
  const seenArch = new Set();
  // First pass: take top while collecting archetypes
  for (const row of list) {
    if (picked.length >= cap) break;
    if (seenArch.size < minArchetypes && seenArch.has(row._archetype) && picked.length >= minArchetypes) {
      continue; // defer duplicate archetype until floor met — actually we want variety in first slots
    }
    if (!seenArch.has(row._archetype) || picked.length >= minArchetypes) {
      picked.push(row);
      seenArch.add(row._archetype);
    }
  }
  // Fill remaining
  for (const row of list) {
    if (picked.length >= cap) break;
    if (picked.some((p) => p.uid === row.uid)) continue;
    picked.push(row);
  }
  // If still mono-archetype, force-insert different ones from rest
  if (seenArch.size < minArchetypes) {
    for (const row of list) {
      if (seenArch.has(row._archetype)) continue;
      const idx = Math.min(picked.length - 1, Math.max(1, minArchetypes - 1));
      if (!picked.some((p) => p.uid === row.uid)) {
        picked.splice(idx, 0, row);
        seenArch.add(row._archetype);
      }
      if (seenArch.size >= minArchetypes) break;
    }
  }
  return picked.slice(0, cap);
}

/**
 * Blend one-way score with reciprocity.
 */
function applyReciprocityBoost(ranked, viewer, edgeMap = {}) {
  return (ranked || []).map((row) => {
    const edges = edgeMap[row.uid] || {};
    const recip = estimateReciprocity(viewer, row.user || row, edges, row.signalScores || {});
    const base = Number(row.score) || 0;
    const score = base * (1 - RECIPROCITY_WEIGHT) + recip * RECIPROCITY_WEIGHT + base * recip * 0.05;
    const explain = Array.isArray(row.explain)
      ? [...row.explain]
      : row.signals
        ? [...row.signals]
        : [];
    if (recip >= 0.65 && !explain.some((e) => /mutual|follow|reciproc/i.test(String(e)))) {
      explain.unshift(edges.theyFollowViewer ? 'Already follows you' : 'Likely mutual interest');
    }
    return {
      ...row,
      score,
      reciprocity: recip,
      explain: explain.slice(0, 4),
      signals: (row.signals || explain).slice(0, 3),
    };
  });
}

/**
 * Full post-rank quality pass for people batches.
 */
function polishPeopleMatches({
  viewer,
  ranked,
  edgeMap = {},
  recentMap = {},
  limit = 8,
  surface = 'personal',
} = {}) {
  let list = applyReciprocityBoost(ranked, viewer, edgeMap);
  list.sort((a, b) => b.score - a.score);
  list = applyAntiRepetition(list, recentMap);
  // Mutual-stable first when present
  list.sort((a, b) => {
    if (!!b.mutualStable !== !!a.mutualStable) return b.mutualStable ? 1 : -1;
    if (!!a._recent !== !!b._recent) return a._recent ? 1 : -1;
    return b.score - a.score;
  });
  list = applyDiversityFloor(list, { limit: Math.max(limit, 6) });
  // Professional surface: strip dating explains
  if (surface === 'professional') {
    list = list.map((r) => ({
      ...r,
      explain: (r.explain || []).filter((e) => !/dat|romance|relationship/i.test(String(e))),
      signals: (r.signals || []).filter((e) => !/dat|romance|relationship/i.test(String(e))),
    }));
  }
  return list.slice(0, limit);
}

async function loadBlockMuteReportSets(db, uid) {
  const blockedSet = new Set();
  const mutedSet = new Set();
  const reportedSet = new Set();
  try {
    const [blocks, mutes, blockedBy] = await Promise.all([
      db.collection('users').doc(uid).collection('blocked').limit(200).get(),
      db.collection('users').doc(uid).collection('muted').limit(200).get(),
      db.collection('users').doc(uid).collection('blockedBy').limit(200).get(),
    ]);
    blocks.docs.forEach((d) => blockedSet.add(d.id));
    mutes.docs.forEach((d) => mutedSet.add(d.id));
    blockedBy.docs.forEach((d) => blockedSet.add(d.id));
  } catch (e) {}
  try {
    const flags = await db
      .collection('users')
      .doc(uid)
      .collection('recommendationSignals')
      .where('signal', '==', 'not_interested')
      .limit(100)
      .get();
    flags.docs.forEach((d) => {
      const x = d.data() || {};
      const t = x.candidateUid || x.authorUid;
      if (t) reportedSet.add(t); // treat as suppress — also load not_interested separately
    });
  } catch (e) {}
  return { blockedSet, mutedSet, reportedSet };
}

async function loadNotInterestedSet(db, uid, { now = Date.now() } = {}) {
  const set = new Set();
  try {
    const snap = await db
      .collection('users')
      .doc(uid)
      .collection('recommendationSignals')
      .limit(120)
      .get();
    const coolMs = NOT_INTERESTED_DAYS * 86400000;
    snap.docs.forEach((d) => {
      const x = d.data() || {};
      if (x.signal !== 'not_interested' && !(Number(x.value) < 0)) return;
      const target = x.candidateUid || x.authorUid;
      if (!target) return;
      const at = x.updatedAt?.toMillis?.() || x.updatedAt || x.createdAt?.toMillis?.() || 0;
      if (!at || now - Number(at) < coolMs) set.add(target);
    });
  } catch (e) {}
  return set;
}

async function loadRecentShown(db, uid) {
  const map = {};
  try {
    const snap = await db.collection('users').doc(uid).collection('matchRecentShown').limit(RECENT_SHOWN_CAP).get();
    snap.docs.forEach((d) => {
      const x = d.data() || {};
      map[d.id] = Number(x.shownAtMs) || x.shownAt?.toMillis?.() || 0;
    });
  } catch (e) {}
  return map;
}

async function recordRecentShown(db, admin, uid, uids) {
  if (!uid || !uids?.length) return;
  const FieldValue = admin.firestore.FieldValue;
  const batch = db.batch();
  const now = Date.now();
  uids.slice(0, 20).forEach((id) => {
    const ref = db.collection('users').doc(uid).collection('matchRecentShown').doc(String(id));
    batch.set(
      ref,
      { shownAtMs: now, shownAt: FieldValue.serverTimestamp() },
      { merge: true }
    );
  });
  try {
    await batch.commit();
  } catch (e) {
    console.warn('[match-quality] recordRecentShown', e?.message || e);
  }
}

module.exports = {
  RECENT_SHOWN_HOURS,
  NOT_INTERESTED_DAYS,
  RECIPROCITY_WEIGHT,
  OUTCOME_TYPES,
  estimateReciprocity,
  filterSafetyFirst,
  applyAntiRepetition,
  applyDiversityFloor,
  applyReciprocityBoost,
  polishPeopleMatches,
  loadBlockMuteReportSets,
  loadNotInterestedSet,
  loadRecentShown,
  recordRecentShown,
  profileTypeOf,
  isDatingIntent,
  isProfessionalIntent,
  archetypeKey,
};
