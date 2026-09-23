/**
 * Peepal/Khoj K2 — Professional networking match path.
 *
 * Eligibility (document):
 * - Prefer Professional candidates (openToMeet, not hidden).
 * - Allow Personal candidates when lookingFor / intents / purpose suggest
 *   networking, career, hiring, mentorship, collab, or co-founder.
 * - Hard-exclude self / friends / mutuals / pending / blocked via caller
 *   (discovery-strangers + match-quality) — not reimplemented here.
 *
 * Ranking: industry + purpose overlap + light embedding/city — not Gale-Shapley dating.
 */
'use strict';

const {
  normalizeProfileType,
  cosineSimilarity,
  ageOf,
  computeSignalScores,
} = require('./matchmaking');

function industryOf(u) {
  return String(u?.industry || u?.profile?.industry || '')
    .trim()
    .toLowerCase();
}

function purposeOf(u) {
  return String(u?.purpose || u?.profile?.purpose || '')
    .trim()
    .toLowerCase();
}

function lookingBlob(u) {
  const lf = String(u?.lookingFor || u?.profile?.lookingFor || u?.matchIntent || '').toLowerCase();
  const intents = [...(u?.intents || []), ...(u?.profile?.intents || [])].map((i) =>
    String(i).toLowerCase()
  );
  const purpose = purposeOf(u);
  return [lf, purpose, ...intents].join(' ');
}

/** Personal open to career/network signals, or any Professional. */
function isOpenToNetworking(cand) {
  if (!cand) return false;
  if (normalizeProfileType(cand.profileType || cand.profile?.profileType) === 'professional') {
    return true;
  }
  return /network|career|job|hire|hiring|mentor|collab|co-?founder|professional|work with|business|recruit|client/.test(
    lookingBlob(cand)
  );
}

function cityOf(u) {
  return String(u?.profile?.currentCity || u?.city || '')
    .trim()
    .toLowerCase();
}

/**
 * Soft/hard gates for networking pool (profile-type aware).
 * @param {object} filters { city, industry, purpose, recentlyJoined }
 */
function passesNetworkingFilters(viewer, cand, filters = {}) {
  if (!cand || !cand.uid || cand.uid === viewer?.uid) return false;
  if (cand.openToMeet === false) return false;
  if (cand.hiddenFromDiscovery === true) return false;
  if (!isOpenToNetworking(cand)) return false;

  if (filters.city) {
    const want = String(filters.city).trim().toLowerCase();
    const c = cityOf(cand);
    if (want && c && c !== want && !c.includes(want) && !want.includes(c)) return false;
  }

  if (filters.industry) {
    const want = String(filters.industry).trim().toLowerCase();
    const ind = industryOf(cand);
    if (want && ind && ind !== want && !ind.includes(want) && !want.includes(ind)) return false;
    // If filter set but candidate has no industry, keep (optional fields) — soft rank only
  }

  if (filters.purpose) {
    const want = String(filters.purpose).trim().toLowerCase();
    const pur = purposeOf(cand);
    const blob = lookingBlob(cand);
    if (want && pur && pur !== want && !pur.includes(want) && !want.includes(pur) && !blob.includes(want)) {
      return false;
    }
  }

  if (filters.recentlyJoined) {
    const joined =
      cand.createdAt?.toMillis?.() ||
      cand.createdAt?.toDate?.()?.getTime?.() ||
      Number(cand.createdAt || cand.joinedAt || 0) ||
      0;
    if (!(joined > 0 && Date.now() - joined <= 30 * 24 * 60 * 60 * 1000)) return false;
  }

  return true;
}

function industryPurposeSignals(viewer, cand) {
  const signals = [];
  const vInd = industryOf(viewer);
  const cInd = industryOf(cand);
  const vPur = purposeOf(viewer);
  const cPur = purposeOf(cand);

  if (vInd && cInd && (vInd === cInd || vInd.includes(cInd) || cInd.includes(vInd))) {
    const label = String(cand.industry || cand.profile?.industry || '').trim() || cInd;
    signals.push(`Same industry · ${label}`);
  }
  if (vPur && cPur && (vPur === cPur || vPur.includes(cPur) || cPur.includes(vPur))) {
    const label = String(cand.purpose || cand.profile?.purpose || '').trim() || cPur;
    signals.push(`Same purpose · ${label}`);
  } else if (cPur) {
    if (/hire|hiring|talent/.test(cPur)) signals.push('Also open to hiring');
    else if (/work|job|find work/.test(cPur)) signals.push('Looking for work');
    else if (/collab|network|peer|learn/.test(cPur)) signals.push('Open to collaborate');
    else if (/client|share|build/.test(cPur)) signals.push(`Purpose · ${String(cand.purpose || cand.profile?.purpose).trim()}`);
  }
  if (normalizeProfileType(cand.profileType || cand.profile?.profileType) === 'professional') {
    if (!signals.some((s) => /industry|purpose|hiring|work|collaborate/i.test(s))) {
      signals.push('Professional on Chaupaal');
    }
  } else if (isOpenToNetworking(cand)) {
    signals.push('Open to networking');
  }
  return signals.slice(0, 3);
}

/**
 * Rank for networking peeks / professional_match — no dating GS.
 */
function rankNetworkingMatches({ viewer, candidates, edgeMap = {}, limit = 10, intent = '' }) {
  const intentL = String(intent || '').toLowerCase();
  const scored = [];

  for (const cand of candidates) {
    const edges = edgeMap[cand.uid] || {};
    let score = 0.35;
    const signals = industryPurposeSignals(viewer, cand);

    const vInd = industryOf(viewer);
    const cInd = industryOf(cand);
    if (vInd && cInd && (vInd === cInd || vInd.includes(cInd) || cInd.includes(vInd))) score += 0.28;
    else if (cInd && intentL && cInd.includes(intentL.slice(0, 8))) score += 0.08;

    const vPur = purposeOf(viewer);
    const cPur = purposeOf(cand);
    if (vPur && cPur && (vPur === cPur || vPur.includes(cPur) || cPur.includes(vPur))) score += 0.18;

    if (normalizeProfileType(cand.profileType || cand.profile?.profileType) === 'professional') {
      score += 0.12;
    }

    const vCity = cityOf(viewer);
    const cCity = cityOf(cand);
    if (vCity && cCity && vCity === cCity) {
      score += 0.1;
      if (!signals.some((s) => /city/i.test(s))) signals.push('Same city');
    }

    try {
      const ss = computeSignalScores(viewer, cand, edges);
      score += Math.min(0.2, (ss.embeddingSimilarity || 0) * 0.2);
      score += Math.min(0.1, (ss.interestOverlap || 0) * 0.1);
    } catch (e) {}

    if (intentL) {
      const blob = lookingBlob(cand);
      if (intentL.includes('hire') || intentL.includes('hiring')) {
        if (/hire|hiring|talent|recruit/.test(blob + ' ' + cPur)) score += 0.14;
      } else if (intentL.includes('job') || intentL.includes('work')) {
        if (/job|work|hire|career/.test(blob + ' ' + cPur)) score += 0.12;
      } else if (intentL.includes('mentor')) {
        if (/mentor|learn|peer|teach/.test(blob + ' ' + cPur)) score += 0.14;
      } else if (intentL.includes('cofounder') || intentL.includes('co-founder') || intentL.includes('startup')) {
        if (/co-?founder|startup|collab|entrepreneur/.test(blob + ' ' + cPur + ' ' + cInd)) score += 0.14;
      } else if (intentL.includes('network') || intentL.includes('collab')) {
        if (/network|collab|peer/.test(blob + ' ' + cPur)) score += 0.1;
      }
    }

    const reason =
      signals.slice(0, 2).join(' · ') || 'Someone you might work with on Chaupaal';

    scored.push({
      uid: cand.uid,
      user: cand,
      score,
      signals,
      reason,
      signalScores: {},
      mutualStable: false,
    });
  }

  scored.sort((a, b) => b.score - a.score);
  return scored.slice(0, Math.max(1, limit));
}

module.exports = {
  industryOf,
  purposeOf,
  isOpenToNetworking,
  passesNetworkingFilters,
  industryPurposeSignals,
  rankNetworkingMatches,
};
