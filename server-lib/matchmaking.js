/**
 * Personal Peepal matchmaking — filters → embeddings cosine → Gale-Shapley mutual.
 * Embeddings: Google Gemini (text-embedding-004). Cached on user doc; not gated by
 * AI_FEATURES_ENABLED (chat kill-switch) — only requires GEMINI_API_KEY.
 *
 * Media is display-only (3A). buildSemanticText uses bio/prompts/interests/hobbies.
 */
const EMBED_MODEL = process.env.GEMINI_EMBED_MODEL || 'text-embedding-004';
const GEMINI_URL = `https://generativelanguage.googleapis.com/v1beta/models/${EMBED_MODEL}:embedContent`;

function normalizeProfileType(v) {
  return String(v || 'personal').toLowerCase() === 'professional' ? 'professional' : 'personal';
}

function buildSemanticText(user) {
  const p = user?.profile || {};
  const parts = [];
  const bio = String(p.bio || user.bio || '').trim();
  if (bio) parts.push(`Bio: ${bio}`);

  const prompts = Array.isArray(p.prompts) ? p.prompts : Array.isArray(user.prompts) ? user.prompts : [];
  prompts.forEach((a) => {
    if (!a) return;
    const q = String(a.customQuestion || a.promptId || 'Prompt').trim();
    const ans = String(a.answer || '').trim();
    if (ans) parts.push(`Prompt (${q}): ${ans}`);
  });

  const interests = Array.isArray(p.interests) ? p.interests : Array.isArray(user.interests) ? user.interests : [];
  if (interests.length) parts.push(`Interests: ${interests.join(', ')}`);

  const hobbies = Array.isArray(p.hobbies) ? p.hobbies : Array.isArray(user.hobbies) ? user.hobbies : [];
  if (hobbies.length) parts.push(`Hobbies: ${hobbies.join(', ')}`);

  const city = p.currentCity || user.city || '';
  if (city) parts.push(`City: ${city}`);
  const occ = p.occupation || user.occupation || '';
  if (occ) parts.push(`Occupation: ${occ}`);

  return parts.join('\n').slice(0, 8000);
}

function cosineSimilarity(a, b) {
  if (!Array.isArray(a) || !Array.isArray(b) || !a.length || a.length !== b.length) return 0;
  let dot = 0;
  let na = 0;
  let nb = 0;
  for (let i = 0; i < a.length; i++) {
    const x = Number(a[i]) || 0;
    const y = Number(b[i]) || 0;
    dot += x * y;
    na += x * x;
    nb += y * y;
  }
  if (!na || !nb) return 0;
  return dot / (Math.sqrt(na) * Math.sqrt(nb));
}

async function embedText(text) {
  const key = process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY || '';
  if (!key) {
    const err = new Error('GEMINI_API_KEY missing');
    err.code = 'NO_GEMINI';
    throw err;
  }
  const body = {
    model: `models/${EMBED_MODEL}`,
    content: { parts: [{ text: text || 'Chaupaal profile' }] },
  };
  const res = await fetch(`${GEMINI_URL}?key=${encodeURIComponent(key)}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const err = new Error(`Gemini embed failed: ${res.status}`);
    err.code = 'GEMINI_EMBED_FAIL';
    err.status = res.status;
    throw err;
  }
  const data = await res.json();
  const values = data?.embedding?.values || data?.embeddings?.[0]?.values;
  if (!Array.isArray(values) || !values.length) {
    const err = new Error('Empty embedding');
    err.code = 'EMPTY_EMBED';
    throw err;
  }
  return values;
}

function ageOf(user) {
  if (Number.isFinite(user.age)) return Number(user.age);
  const dob = user.dateOfBirth || user.dob || user.profile?.dateOfBirth;
  if (!dob) return null;
  const ms = Date.now() - new Date(dob).getTime();
  if (!Number.isFinite(ms) || ms < 0) return null;
  return Math.floor(ms / (365.25 * 86400000));
}

function cityOf(user) {
  return String(user.profile?.currentCity || user.city || '')
    .trim()
    .toLowerCase();
}

function langsOf(user) {
  const list = user.profile?.languages || user.languages || [];
  if (Array.isArray(list)) return list.map((l) => String(l).toLowerCase());
  if (user.lang) return [String(user.lang).toLowerCase()];
  return [];
}

function lookingForOf(user) {
  return String(user.profile?.lookingFor || user.lookingFor || '')
    .trim()
    .toLowerCase();
}

/**
 * Structured gate for personal matching pool.
 * @param {object} viewer
 * @param {object} cand
 * @param {object} filters { minAge, maxAge, city, language, intent }
 */
function passesStructuredFilters(viewer, cand, filters = {}) {
  if (!cand || cand.uid === viewer.uid) return false;
  if (normalizeProfileType(cand.profileType || cand.profile?.profileType) !== 'personal') return false;
  if (cand.openToMeet === false) return false;

  const age = ageOf(cand);
  if (filters.minAge != null && age != null && age < Number(filters.minAge)) return false;
  if (filters.maxAge != null && age != null && age > Number(filters.maxAge)) return false;

  if (filters.city) {
    const want = String(filters.city).trim().toLowerCase();
    if (want && cityOf(cand) && cityOf(cand) !== want) return false;
  }

  if (filters.language) {
    const want = String(filters.language).trim().toLowerCase();
    const langs = langsOf(cand);
    if (want && langs.length && !langs.some((l) => l.includes(want) || want.includes(l))) return false;
  }

  if (filters.intent) {
    const want = String(filters.intent).trim().toLowerCase();
    const lf = lookingForOf(cand);
    const intents = (cand.intents || []).map((i) => String(i).toLowerCase());
    if (want && lf && !lf.includes(want) && !intents.some((i) => i.includes(want))) {
      // soft: don't hard-exclude if lookingFor empty; only exclude clear mismatch
      if (lf && want.length > 2) return false;
    }
  }

  return true;
}

function intersectInterests(a, b) {
  const setA = new Set(
    [...(a.profile?.interests || a.interests || []), ...(a.profile?.hobbies || a.hobbies || [])].map((x) =>
      String(x).toLowerCase()
    )
  );
  const listB = [...(b.profile?.interests || b.interests || []), ...(b.profile?.hobbies || b.hobbies || [])].map((x) =>
    String(x).toLowerCase()
  );
  return listB.filter((x) => setA.has(x)).map((x) => x.replace(/^\w/, (c) => c.toUpperCase()));
}

/**
 * Per-signal scores already used in Peepal personal matching (0..1).
 * Weighting only recombines these — does not invent new signal types.
 */
function computeSignalScores(viewer, cand, edges = {}) {
  const vEmbed = viewer.profileEmbedding?.vector || viewer.profileEmbedding;
  const cEmbed = cand.profileEmbedding?.vector || cand.profileEmbedding;
  const embeddingSimilarity = Math.max(0, Math.min(1, cosineSimilarity(vEmbed, cEmbed)));

  const shared = intersectInterests(viewer, cand);
  const interestOverlap = Math.max(0, Math.min(1, shared.length / 3));

  const ageV = ageOf(viewer);
  const ageC = ageOf(cand);
  let ageProximity = 0.5;
  if (ageV != null && ageC != null) {
    const diff = Math.abs(ageV - ageC);
    ageProximity = Math.max(0, Math.min(1, 1 - diff / 20));
  }

  const vCity = cityOf(viewer);
  const cCity = cityOf(cand);
  const locationProximity = vCity && cCity && vCity === cCity ? 1 : 0;

  const vLf = lookingForOf(viewer);
  const cLf = lookingForOf(cand);
  const candIntents = (cand.intents || []).map((i) => String(i).toLowerCase());
  let lookingForAlignment = 0;
  if (vLf && cLf && (vLf.includes(cLf.slice(0, 6)) || cLf.includes(vLf.slice(0, 6)))) lookingForAlignment = 0.85;
  else if (vLf && candIntents.some((i) => i.includes(vLf.slice(0, 6)) || vLf.includes(i.slice(0, 6)))) lookingForAlignment = 0.7;
  else if (vLf || cLf) lookingForAlignment = 0.25;

  let followAffinity = 0;
  if (edges.theyFollowViewer) followAffinity += 0.7;
  if (edges.viewerFollowsThem) followAffinity += 0.3;
  if (edges.reactedUp) followAffinity = Math.min(1, followAffinity + 0.2);
  followAffinity = Math.min(1, followAffinity);

  const occV = String(viewer.profile?.occupation || viewer.occupation || '').trim();
  const occC = String(cand.profile?.occupation || cand.occupation || '').trim();
  const occupationSignal = occV && occC ? 1 : occC || occV ? 0.35 : 0;

  const gender = String(cand.gender || cand.profile?.gender || '').toLowerCase();
  const vGender = String(viewer.gender || viewer.profile?.gender || '').toLowerCase();
  const genderComplement = vGender && gender && vGender !== gender ? 1 : vGender && gender ? 0.15 : 0.4;

  return {
    embeddingSimilarity,
    interestOverlap,
    ageProximity,
    locationProximity,
    lookingForAlignment,
    followAffinity,
    occupationSignal,
    genderComplement,
  };
}

/**
 * @deprecated Prefer computeSignalScores + intent weight profiles.
 * Kept as fallback when no weights are provided.
 */
function asymmetricBoost(viewer, cand, edges = {}, intentHint = '') {
  let b = 1;
  if (edges.theyFollowViewer) b += 0.12;
  if (edges.viewerFollowsThem) b += 0.04;
  if (edges.reactedUp) b += 0.08;
  const vCity = cityOf(viewer);
  const cCity = cityOf(cand);
  if (vCity && cCity && vCity === cCity) b += 0.06;
  const vLf = lookingForOf(viewer);
  const cLf = lookingForOf(cand);
  if (vLf && cLf && (vLf.includes(cLf.slice(0, 6)) || cLf.includes(vLf.slice(0, 6)))) b += 0.05;

  const intent = String(intentHint || vLf || '')
    .trim()
    .toLowerCase();
  const candLooking = cLf;
  const candIntents = (cand.intents || []).map((i) => String(i).toLowerCase());
  const gender = String(cand.gender || cand.profile?.gender || '').toLowerCase();
  const vGender = String(viewer.gender || viewer.profile?.gender || '').toLowerCase();
  const ageV = ageOf(viewer);
  const ageC = ageOf(cand);

  if (intent.includes('dat') || intent.includes('relationship') || intent.includes('marriage') || intent.includes('romantic')) {
    if (candLooking && (candLooking.includes('dat') || candLooking.includes('relationship') || candLooking.includes('marriage'))) b += 0.14;
    if (ageV != null && ageC != null && Math.abs(ageV - ageC) <= 6) b += 0.1;
    if (vGender && gender && vGender !== gender) b += 0.06;
    if (intersectInterests(viewer, cand).length) b += 0.04;
  } else if (intent.includes('friend') || intent.includes('hobby') || intent.includes('activity')) {
    const shared = intersectInterests(viewer, cand);
    if (shared.length) b += 0.08 + Math.min(0.12, shared.length * 0.04);
    if (candLooking.includes('friend') || candIntents.some((i) => i.includes('friend'))) b += 0.08;
    if (vCity && cCity && vCity === cCity) b += 0.04;
  } else if (intent.includes('recruit') || intent.includes('hir') || intent.includes('job') || intent.includes('network') || intent.includes('professional')) {
    const occV = String(viewer.profile?.occupation || viewer.occupation || '').toLowerCase();
    const occC = String(cand.profile?.occupation || cand.occupation || '').toLowerCase();
    if (occV && occC) b += 0.1;
    if (candLooking.includes('network') || candLooking.includes('professional') || candIntents.some((i) => i.includes('network') || i.includes('career'))) b += 0.12;
    if (vCity && cCity && vCity === cCity) b += 0.05;
  } else if (intent) {
    if (candLooking.includes(intent.slice(0, 8)) || candIntents.some((i) => i.includes(intent.slice(0, 8)))) b += 0.1;
    if (intersectInterests(viewer, cand).length) b += 0.06;
  }
  return b;
}

/**
 * Gale-Shapley (stable marriage) — proposers are all people in `ids`.
 * prefs[id] = ordered list of other ids (best first).
 * Returns map: matched partner for each id (or null).
 */
function galeShapley(ids, prefs) {
  const free = new Set(ids);
  const engagedTo = {}; // acceptor -> proposer
  const nextIdx = {};
  ids.forEach((id) => {
    nextIdx[id] = 0;
    engagedTo[id] = null;
  });

  const rank = {};
  ids.forEach((id) => {
    rank[id] = {};
    (prefs[id] || []).forEach((other, i) => {
      rank[id][other] = i;
    });
  });

  let guard = 0;
  const maxSteps = ids.length * ids.length + 10;
  while (free.size && guard++ < maxSteps) {
    const proposer = free.values().next().value;
    const list = prefs[proposer] || [];
    const i = nextIdx[proposer] || 0;
    if (i >= list.length) {
      free.delete(proposer);
      continue;
    }
    const acceptor = list[i];
    nextIdx[proposer] = i + 1;
    const current = engagedTo[acceptor];
    if (!current) {
      engagedTo[acceptor] = proposer;
      free.delete(proposer);
    } else {
      const prefersNew =
        (rank[acceptor][proposer] ?? Infinity) < (rank[acceptor][current] ?? Infinity);
      if (prefersNew) {
        engagedTo[acceptor] = proposer;
        free.add(current);
        free.delete(proposer);
      }
    }
  }

  const partnerOf = {};
  ids.forEach((id) => {
    partnerOf[id] = null;
  });
  Object.entries(engagedTo).forEach(([acceptor, proposer]) => {
    if (proposer) {
      partnerOf[acceptor] = proposer;
      partnerOf[proposer] = acceptor;
    }
  });
  return partnerOf;
}

/**
 * Rank candidates for viewer using intent-weighted signal sum, then GS among top pool.
 * Retrieval/shortlist pool is unchanged — only the score recombination uses weights.
 */
function rankPersonalMatches({ viewer, candidates, edgeMap = {}, limit = 10, intent = '', weights = null }) {
  const { weightedScore, defaultWeights } = require('./intent-weights');
  const intentHint = String(intent || lookingForOf(viewer) || '').trim();
  const w = weights || defaultWeights();
  const scored = [];

  for (const cand of candidates) {
    const edges = edgeMap[cand.uid] || {};
    const signalScores = computeSignalScores(viewer, cand, edges);
    const score = weightedScore(signalScores, w);
    const cos = signalScores.embeddingSimilarity;
    const signals = [];
    const sharedInterests = intersectInterests(viewer, cand).slice(0, 3);
    const intentL = intentHint.toLowerCase();
    if (intentL.includes('dat') || intentL.includes('relationship') || intentL.includes('marriage')) {
      const ageV = ageOf(viewer);
      const ageC = ageOf(cand);
      if (ageV != null && ageC != null && Math.abs(ageV - ageC) <= 6) signals.push('Similar age for dating');
      if (lookingForOf(cand).includes('dat') || lookingForOf(cand).includes('relationship')) signals.push('Also open to dating');
    } else if (intentL.includes('friend') || intentL.includes('hobby') || intentL.includes('study') || intentL.includes('workout')) {
      if (sharedInterests.length) signals.push(`Shared: ${sharedInterests[0]}`);
      signals.push('Friendship-friendly overlap');
    } else if (intentL.includes('recruit') || intentL.includes('hir') || intentL.includes('network') || intentL.includes('professional') || intentL.includes('co-founder') || intentL.includes('mentor')) {
      if (cand.profile?.occupation || cand.occupation) signals.push('Career / networking fit');
      if (cityOf(viewer) && cityOf(viewer) === cityOf(cand)) signals.push('Same city for meetups');
    } else if (intentL.includes('flatmate') || intentL.includes('roommate')) {
      if (cityOf(viewer) && cityOf(viewer) === cityOf(cand)) signals.push('Same city for housing');
    }
    if (cos >= 0.35) signals.push('Similar interests & prompts');
    if (edges.theyFollowViewer) signals.push('Already follows you');
    if (cityOf(viewer) && cityOf(viewer) === cityOf(cand) && !signals.some((s) => s.includes('city'))) signals.push('Same city');
    sharedInterests.forEach((t) => {
      if (!signals.some((s) => s.toLowerCase().includes(t.toLowerCase()))) signals.push(t);
    });
    if (lookingForOf(viewer) && lookingForOf(cand) && !signals.some((s) => s.includes('intent') || s.includes('dating') || s.includes('Friend'))) {
      signals.push('Aligned intent');
    }
    scored.push({
      uid: cand.uid,
      score,
      cosine: cos,
      signalScores,
      signals: signals.slice(0, 3),
      user: cand,
    });
  }

  scored.sort((a, b) => b.score - a.score);
  const pool = scored.slice(0, Math.min(24, Math.max(limit * 2, scored.length)));
  const ids = [viewer.uid, ...pool.map((p) => p.uid)];

  const byUid = { [viewer.uid]: viewer };
  pool.forEach((p) => {
    byUid[p.uid] = p.user;
  });
  const scoreBetween = (aUid, bUid) => {
    if (aUid === viewer.uid) {
      const row = pool.find((p) => p.uid === bUid);
      return row ? row.score : 0;
    }
    if (bUid === viewer.uid) {
      const row = pool.find((p) => p.uid === aUid);
      const edges = edgeMap[aUid] || {};
      const revSignals = computeSignalScores(byUid[aUid], viewer, {
        theyFollowViewer: edges.viewerFollowsThem,
        viewerFollowsThem: edges.theyFollowViewer,
        reactedUp: edges.reactedUp,
      });
      return weightedScore(revSignals, w);
    }
    const a = byUid[aUid];
    const b = byUid[bUid];
    const cos = cosineSimilarity(
      a?.profileEmbedding?.vector || a?.profileEmbedding,
      b?.profileEmbedding?.vector || b?.profileEmbedding
    );
    return cos;
  };

  const prefs = {};
  ids.forEach((id) => {
    prefs[id] = ids
      .filter((o) => o !== id)
      .map((o) => ({ o, s: scoreBetween(id, o) }))
      .sort((a, b) => b.s - a.s)
      .map((x) => x.o);
  });

  const partners = galeShapley(ids, prefs);
  const stablePartner = partners[viewer.uid];

  const ordered = [];
  const seen = new Set();
  if (stablePartner) {
    const row = pool.find((p) => p.uid === stablePartner);
    if (row) {
      ordered.push({ ...row, mutualStable: true });
      seen.add(row.uid);
    }
  }
  pool.forEach((row) => {
    if (!seen.has(row.uid)) ordered.push({ ...row, mutualStable: false });
  });

  return ordered.slice(0, limit);
}

module.exports = {
  buildSemanticText,
  cosineSimilarity,
  embedText,
  passesStructuredFilters,
  rankPersonalMatches,
  galeShapley,
  normalizeProfileType,
  ageOf,
  computeSignalScores,
  asymmetricBoost,
  EMBED_MODEL,
};
