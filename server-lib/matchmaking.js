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

function asymmetricBoost(viewer, cand, edges = {}) {
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
 * Rank candidates for viewer using cosine * asymmetric boost, then GS among top pool.
 * Returns ordered matches with signals for transparency UI.
 */
function rankPersonalMatches({ viewer, candidates, edgeMap = {}, limit = 10 }) {
  const vEmbed = viewer.profileEmbedding?.vector || viewer.profileEmbedding;
  const scored = [];

  for (const cand of candidates) {
    const cEmbed = cand.profileEmbedding?.vector || cand.profileEmbedding;
    const cos = cosineSimilarity(vEmbed, cEmbed);
    const edges = edgeMap[cand.uid] || {};
    const boost = asymmetricBoost(viewer, cand, edges);
    const score = Math.max(0, Math.min(1, cos * boost));
    const signals = [];
    if (cos >= 0.35) signals.push('Similar interests & prompts');
    if (edges.theyFollowViewer) signals.push('Already follows you');
    if (cityOf(viewer) && cityOf(viewer) === cityOf(cand)) signals.push('Same city');
    const sharedInterests = intersectInterests(viewer, cand).slice(0, 3);
    sharedInterests.forEach((t) => signals.push(t));
    if (lookingForOf(viewer) && lookingForOf(cand)) signals.push('Aligned intent');
    scored.push({
      uid: cand.uid,
      score,
      cosine: cos,
      boost,
      signals: signals.slice(0, 3),
      user: cand,
    });
  }

  scored.sort((a, b) => b.score - a.score);
  const pool = scored.slice(0, Math.min(24, Math.max(limit * 2, scored.length)));
  const ids = [viewer.uid, ...pool.map((p) => p.uid)];

  // Preference lists: viewer by score; each candidate ranks others by cosine*boost toward them
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
      // mutual: how much they'd like viewer — reuse cosine * their asymmetric toward viewer
      const cos = row?.cosine || 0;
      const edges = edgeMap[aUid] || {};
      const revBoost = asymmetricBoost(byUid[aUid], viewer, {
        theyFollowViewer: edges.viewerFollowsThem,
        viewerFollowsThem: edges.theyFollowViewer,
        reactedUp: edges.reactedUp,
      });
      return Math.max(0, Math.min(1, cos * revBoost));
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

  // Order: stable partner first, then remaining by score
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

module.exports = {
  buildSemanticText,
  cosineSimilarity,
  embedText,
  passesStructuredFilters,
  rankPersonalMatches,
  galeShapley,
  normalizeProfileType,
  ageOf,
  EMBED_MODEL,
};
