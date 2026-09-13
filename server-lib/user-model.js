/**
 * User model (P5) — deterministic interest & affinity document.
 *
 * Storage: userModels/{uid}  (Admin SDK write; client read denied — 10B)
 * Interface: getUserModel / putUserModel / deleteUserModel / queryByTopic /
 *            buildUserModelFromInputs / refreshUserModel / processUserModelBatch
 *
 * Authority order for interests (do not invent a parallel vocabulary):
 *   1. Declared profile.interests (+ hobbies merged) — P1 INTEREST_CHIPS
 *   2. Behavioral: recommendationSignals tags + signal rollups (surfaces/games)
 *   3. personalityProfile — LEGACY client-only; NEVER feeds this model
 *
 * Half-lives: declared 45d · behavioral 14d · negative 21d
 * Caps: topics 20 · people 40 · games 24 · formats 8 · explain 8/block
 * Cold-start until eventCount >= 25 (or rich declared-only with behavioral:false)
 */
'use strict';

const SCHEMA_V = 1;
const COLLECTION = 'userModels';
const SOURCE_WINDOW_DAYS = 28;
const BATCH_DEFAULT = 28;
const COLD_START_EVENT_MIN = 25;

const HALF_LIFE = {
  declared: 45,
  behavioral: 14,
  negative: 21,
};

const WEIGHTS = {
  declaredInterest: 0.55,
  industry: 0.32,
  purpose: 0.28,
  cityPrior: 0.12,
  popularityPrior: 0.08,
  like: 1.0,
  comment: 1.15,
  save: 0.9,
  share: 0.85,
  dwellNorm: 0.35,
  open: 0.25,
  skip: -0.35,
  notInterested: -1.0,
  moreLike: 1.0,
  unfollow: -0.85,
  follow: 0.7,
  reply: 0.9,
  dmOpen: 0.35,
  gameEnd: 1.0,
  gameWin: 1.2,
  eloBracketBoost: 0.15,
  formatPhoto: 0.4,
  formatText: 0.35,
  formatQuestion: 0.45,
  formatWatch: 0.5,
  negativeFloor: -0.55,
};

const CAPS = {
  topics: 20,
  people: 40,
  games: 24,
  formats: 8,
  explainPerBlock: 8,
};

/** P1 INTEREST_CHIPS — same vocabulary as profile-taxonomy.js */
const INTEREST_CHIPS = [
  'Travel',
  'Food',
  'Films',
  'Music',
  'Fitness',
  'Books',
  'Tech',
  'Startups',
  'Art',
  'Comedy',
  'Sports',
  'Gaming',
  'Photography',
  'Cooking',
  'Nature',
  'Spirituality',
  'Fashion',
  'Volunteer work',
  'Politics',
  'Animals',
];

const SENSITIVE_PROFILE_KEYS = new Set([
  'religion',
  'religion2',
  'annualIncome',
  'politics',
  'disability',
  'haveChildren',
  'wantChildren',
  'maritalHistory',
  'sexuality',
  'caste',
  'health',
  'bloodGroup',
  'height',
  'zodiac',
  'mbti',
  'personalityType',
]);

const DATING_INTENTS = new Set([
  'dating',
  'serious relationship',
  'marriage',
  'open to dating',
]);

const SURFACE_TOPIC = {
  peepal: 'Questions',
  duniya: 'Social feed',
  akhbaar: 'News',
  mehfil: 'Watch together',
  dangal: 'Gaming',
  khoj: 'Discovery',
};

const GLOBAL_TOPIC_PRIORS = {
  Travel: 0.06,
  Food: 0.07,
  Films: 0.05,
  Music: 0.06,
  Sports: 0.05,
  Tech: 0.04,
  Gaming: 0.05,
  Comedy: 0.04,
};

function clamp01(n) {
  const x = Number(n);
  if (!Number.isFinite(x)) return 0;
  if (x < 0) return 0;
  if (x > 1) return 1;
  return x;
}

function clampNeg(n) {
  const x = Number(n);
  if (!Number.isFinite(x)) return 0;
  return Math.max(WEIGHTS.negativeFloor, Math.min(1, x));
}

function decayFactor(ageDays, halfLife) {
  if (!Number.isFinite(ageDays) || ageDays <= 0) return 1;
  return Math.pow(0.5, ageDays / halfLife);
}

function dayAge(dayKey, now = Date.now()) {
  // dayKey: yyyy-MM-dd or yyyyMMdd
  const s = String(dayKey || '');
  let iso = s;
  if (/^\d{8}$/.test(s)) iso = `${s.slice(0, 4)}-${s.slice(4, 6)}-${s.slice(6, 8)}`;
  const t = Date.parse(iso);
  if (!Number.isFinite(t)) return 0;
  return Math.max(0, (now - t) / 86400000);
}

function normalizeKey(raw) {
  const s = String(raw || '')
    .trim()
    .replace(/\s+/g, ' ');
  if (!s) return '';
  const lower = s.toLowerCase();
  const hit = INTEREST_CHIPS.find((c) => c.toLowerCase() === lower);
  return hit || s.slice(0, 40);
}

function topNMap(map, n) {
  const entries = Object.entries(map || {})
    .filter(([, v]) => Number.isFinite(v) && v !== 0)
    .sort((a, b) => Math.abs(b[1]) - Math.abs(a[1]));
  const out = {};
  entries.slice(0, n).forEach(([k, v]) => {
    out[k] = Math.round(v * 1000) / 1000;
  });
  return out;
}

function maxNormalize(map) {
  const vals = Object.values(map || {}).map(Number).filter(Number.isFinite);
  const max = vals.length ? Math.max(...vals.map(Math.abs)) : 0;
  if (max <= 0) return {};
  const out = {};
  Object.entries(map).forEach(([k, v]) => {
    out[k] = Math.round((v / max) * 1000) / 1000;
  });
  return out;
}

function bump(map, key, delta) {
  if (!key || !Number.isFinite(delta) || delta === 0) return;
  map[key] = clampNeg((Number(map[key]) || 0) + delta);
}

function intentBucket(lookingFor, { teen } = {}) {
  const raw = String(lookingFor || '').trim();
  if (!raw) return null;
  const lower = raw.toLowerCase();
  if (teen || DATING_INTENTS.has(lower)) {
    if (teen && DATING_INTENTS.has(lower)) return null;
    if (teen) {
      /* teens: only non-dating buckets */
    } else if (DATING_INTENTS.has(lower)) {
      return 'dating';
    }
  }
  if (/network|hire|work|co-founder|mentor|client|speaking|collaborat/i.test(raw)) return 'professional';
  if (/friend|buddy|flatmate|roommate|study|workout|travel buddy|nothing|open to anything/i.test(raw)) {
    return 'friendship';
  }
  if (DATING_INTENTS.has(lower)) return 'dating';
  return 'other';
}

function eloBracket(elo) {
  const e = Number(elo) || 1200;
  if (e < 1000) return 'learning';
  if (e < 1300) return 'solid';
  if (e < 1600) return 'strong';
  return 'elite';
}

/**
 * Pure scorer — no I/O.
 * @returns {object} user model document (without storage timestamps)
 */
function buildUserModelFromInputs(input = {}) {
  const now = Number(input.now) || Date.now();
  const consent = input.consent || {};
  const teen = !!consent.teen;
  const collectBehavioral = consent.collect !== false && !consent.activityOptOut;
  const profile = input.profile && typeof input.profile === 'object' ? input.profile : {};
  const user = input.user && typeof input.user === 'object' ? input.user : {};
  const prev = input.previousModel && typeof input.previousModel === 'object' ? input.previousModel : null;
  const rollups = Array.isArray(input.rollups) ? input.rollups : [];
  const signals = Array.isArray(input.recommendationSignals) ? input.recommendationSignals : [];
  const gameStats = Array.isArray(input.gameStats) ? input.gameStats : [];
  const hourBuckets = input.hourBuckets && typeof input.hourBuckets === 'object' ? input.hourBuckets : {};
  const tabHabits = input.tabHabits && typeof input.tabHabits === 'object' ? input.tabHabits : {};

  const topics = {};
  const people = {};
  const games = {};
  const formats = {};
  const explain = { topics: [], people: [], games: [], formats: [], social: [] };
  let eventCount = 0;

  // --- Declared (always, except sensitive) ---
  const declaredInterests = [];
  const rawInterests = []
    .concat(profile.interests || [])
    .concat(profile.hobbies || [])
    .concat(user.interests || []);
  rawInterests.forEach((x) => {
    const k = normalizeKey(x);
    if (!k) return;
    if (SENSITIVE_PROFILE_KEYS.has(k.toLowerCase())) return;
    declaredInterests.push(k);
    bump(topics, k, WEIGHTS.declaredInterest);
  });
  if (declaredInterests.length) {
    explain.topics.push({
      key: declaredInterests[0],
      score: WEIGHTS.declaredInterest,
      reason: `You listed ${declaredInterests.slice(0, 3).join(', ')} as interests`,
    });
  }

  const industry = String(profile.industry || user.industry || '').trim();
  if (industry && !SENSITIVE_PROFILE_KEYS.has(industry.toLowerCase())) {
    const k = normalizeKey(industry);
    bump(topics, k, WEIGHTS.industry);
    explain.topics.push({
      key: k,
      score: WEIGHTS.industry,
      reason: `Your industry is ${industry}`,
    });
  }
  const purpose = String(profile.purpose || user.purpose || '').trim();
  if (purpose) {
    const k = normalizeKey(purpose);
    bump(topics, k, WEIGHTS.purpose);
  }

  const city = String(profile.currentCity || user.city || '').trim().slice(0, 40);
  if (city) {
    bump(topics, `city:${city}`, WEIGHTS.cityPrior);
  }

  Object.entries(GLOBAL_TOPIC_PRIORS).forEach(([k, v]) => bump(topics, k, v));

  // Seed previous behavioral with decay (incremental fold)
  if (prev && collectBehavioral) {
    const age = prev.updatedAtMs ? (now - Number(prev.updatedAtMs)) / 86400000 : 1;
    const f = decayFactor(age, HALF_LIFE.behavioral);
    Object.entries(prev.topics || {}).forEach(([k, v]) => {
      if (String(k).startsWith('city:')) return;
      if (declaredInterests.includes(k)) return; // declared re-applied fresh
      bump(topics, k, Number(v) * f * 0.85);
    });
    Object.entries(prev.people || {}).forEach(([k, v]) => bump(people, k, Number(v) * f));
    Object.entries(prev.games || {}).forEach(([k, v]) => bump(games, k, Number(v) * f));
    Object.entries(prev.formats || {}).forEach(([k, v]) => bump(formats, k, Number(v) * f));
  }

  // --- Behavioral from rollups ---
  if (collectBehavioral) {
    rollups.forEach((r) => {
      const age = dayAge(r.day || r.id, now);
      if (age > SOURCE_WINDOW_DAYS) return;
      const f = decayFactor(age, HALF_LIFE.behavioral);
      const nf = decayFactor(age, HALF_LIFE.negative);
      const counts = r.counts || {};
      const surfaces = r.surfaces || {};
      Object.entries(counts).forEach(([type, c]) => {
        const n = Number(c) || 0;
        if (n <= 0) return;
        eventCount += n;
        if (type === 'like') {
          /* surface attribution below */
        } else if (type === 'skip') {
          Object.keys(surfaces).forEach((s) => {
            const topic = SURFACE_TOPIC[s];
            if (topic) bump(topics, topic, WEIGHTS.skip * nf * (n / Math.max(1, Object.keys(surfaces).length)));
          });
        } else if (type === 'unfollow') {
          /* people handled via signals; posture below */
        }
      });
      Object.entries(surfaces).forEach(([surface, c]) => {
        const n = Number(c) || 0;
        if (n <= 0) return;
        const topic = SURFACE_TOPIC[surface];
        if (topic) bump(topics, topic, 0.08 * f * Math.min(n, 40) / 10);
        if (surface === 'peepal') bump(formats, 'question', WEIGHTS.formatQuestion * f * Math.min(n, 20) / 15);
        if (surface === 'duniya') bump(formats, 'photo', WEIGHTS.formatPhoto * f * Math.min(n, 20) / 15);
        if (surface === 'mehfil') bump(formats, 'watch_together', WEIGHTS.formatWatch * f * Math.min(n, 10) / 8);
        if (surface === 'akhbaar') bump(formats, 'text', WEIGHTS.formatText * f * Math.min(n, 20) / 15);
      });
      const dwell = Number(r.dwellMs) || 0;
      if (dwell > 0) {
        bump(formats, 'text', WEIGHTS.dwellNorm * f * Math.min(dwell / 60000, 8) / 8);
      }
      Object.entries(r.games || {}).forEach(([gid, c]) => {
        const n = Number(c) || 0;
        if (n <= 0) return;
        eventCount += n;
        bump(games, gid, WEIGHTS.gameEnd * f * Math.min(n, 20));
      });
      Object.entries(r.genres || {}).forEach(([g, c]) => {
        const n = Number(c) || 0;
        if (n <= 0) return;
        bump(games, `genre:${normalizeKey(g)}`, 0.6 * f * Math.min(n, 20));
        bump(topics, normalizeKey(g) === 'Gaming' ? 'Gaming' : normalizeKey(g), 0.2 * f * Math.min(n, 10));
      });
      const likes = Number(counts.like) || 0;
      const comments = Number(counts.comment) || 0;
      const saves = Number(counts.save) || 0;
      const shares = Number(counts.share) || 0;
      if (likes) bump(formats, 'photo', WEIGHTS.like * f * Math.min(likes, 30) / 25);
      if (comments) bump(formats, 'text', WEIGHTS.comment * f * Math.min(comments, 20) / 18);
      if (saves) bump(formats, 'photo', WEIGHTS.save * f * Math.min(saves, 15) / 12);
      if (shares) bump(formats, 'photo', WEIGHTS.share * f * Math.min(shares, 10) / 8);
      if (Number(counts.media_complete) > 0) {
        bump(formats, 'watch_together', WEIGHTS.formatWatch * f * Math.min(Number(counts.media_complete), 8));
        explain.formats.push({
          key: 'watch_together',
          score: WEIGHTS.formatWatch,
          reason: `You finished ${Math.min(Number(counts.media_complete), 8)} watch-together sessions recently`,
        });
      }
    });
  }

  // --- recommendationSignals (deduped by doc — one action one vote) ---
  if (collectBehavioral) {
    const tagCounts = {};
    const peoplePos = {};
    const peopleNeg = {};
    signals.forEach((s) => {
      const age = s.updatedAtMs != null ? (now - Number(s.updatedAtMs)) / 86400000 : 3;
      const f = decayFactor(age, HALF_LIFE.behavioral);
      const nf = decayFactor(age, HALF_LIFE.negative);
      const signal = String(s.signal || '');
      const value = Number(s.value);
      const tag = normalizeKey(s.tag);
      if (tag) {
        const delta =
          signal === 'not_interested' || value < 0
            ? WEIGHTS.notInterested * nf
            : WEIGHTS.moreLike * f;
        bump(topics, tag, delta);
        tagCounts[tag] = (tagCounts[tag] || 0) + (delta > 0 ? 1 : -1);
        eventCount += 1;
      }
      const target = String(s.candidateUid || s.authorUid || '').slice(0, 128);
      if (target && (s.type === 'discovery_person' || s.type === 'content_interest')) {
        if (signal === 'not_interested' || value < 0) {
          bump(people, target, WEIGHTS.notInterested * nf);
          peopleNeg[target] = (peopleNeg[target] || 0) + 1;
        } else if (signal === 'more_like' || value > 0) {
          bump(people, target, WEIGHTS.moreLike * f);
          peoplePos[target] = (peoplePos[target] || 0) + 1;
        }
        eventCount += 1;
      }
    });
    Object.entries(tagCounts)
      .sort((a, b) => Math.abs(b[1]) - Math.abs(a[1]))
      .slice(0, 5)
      .forEach(([k, c]) => {
        if (c > 0) {
          explain.topics.push({
            key: k,
            score: topics[k] || 0,
            reason: `You engaged positively with ${c} ${k}-tagged items`,
          });
        } else if (c < 0) {
          explain.topics.push({
            key: k,
            score: topics[k] || 0,
            reason: `You marked not interested on ${Math.abs(c)} ${k} items`,
          });
        }
      });
    Object.entries(peoplePos)
      .slice(0, 3)
      .forEach(([uid, c]) => {
        explain.people.push({
          key: uid,
          score: people[uid] || 0,
          reason: `You asked for more like this person (${c}×)`,
        });
      });
  }

  // --- Game stats (Elo brackets) ---
  if (collectBehavioral || gameStats.length) {
    gameStats.forEach((g) => {
      const id = String(g.id || g.gameType || '').slice(0, 40);
      if (!id) return;
      const plays = Number(g.plays || g.gamesPlayed || g.sessions) || 0;
      const elo = Number(g.elo) || 1200;
      const bracket = eloBracket(elo);
      const base = collectBehavioral ? WEIGHTS.gameEnd * Math.min(plays || 1, 30) / 10 : WEIGHTS.popularityPrior;
      bump(games, id, base);
      bump(games, `elo:${id}:${bracket}`, WEIGHTS.eloBracketBoost);
      if (plays >= 3) {
        explain.games.push({
          key: id,
          score: games[id] || base,
          reason: `You played ${id} ${plays || 'a few'} times (${bracket} bracket)`,
        });
      }
      if (plays) eventCount += plays;
    });
  }

  // Teen: strip dating people-affinity exploitation; drop search-derived topics already absent
  if (teen) {
    Object.keys(people).forEach((k) => {
      /* keep only strong negatives for safety? Prompt: restricted set — drop people affinity for dating surfaces */
      delete people[k];
    });
    delete formats.watch_together;
  }

  // Opt-out: wipe behavioral blocks, keep declared + priors
  if (!collectBehavioral) {
    Object.keys(people).forEach((k) => delete people[k]);
    // Keep declared-driven topics only + soft priors already mixed — zero out surface topics that aren't declared
    const keep = new Set(declaredInterests.concat(industry ? [normalizeKey(industry)] : []).concat(purpose ? [normalizeKey(purpose)] : []));
    Object.keys(topics).forEach((k) => {
      if (keep.has(k) || String(k).startsWith('city:') || GLOBAL_TOPIC_PRIORS[k] != null) return;
      // remove purely behavioral surface labels unless also declared
      if (Object.values(SURFACE_TOPIC).includes(k)) delete topics[k];
      else if (!keep.has(k) && !GLOBAL_TOPIC_PRIORS[k]) {
        // keep mild priors only
        if (!INTEREST_CHIPS.includes(k)) delete topics[k];
        else if (!keep.has(k)) topics[k] = Math.min(topics[k], GLOBAL_TOPIC_PRIORS[k] || 0.05);
      }
    });
    Object.keys(games).forEach((k) => delete games[k]);
    Object.keys(formats).forEach((k) => delete formats[k]);
    explain.people = [];
    explain.games = [];
    explain.formats = [];
  }

  const topicsN = topNMap(maxNormalize(topics), CAPS.topics);
  const peopleN = topNMap(maxNormalize(people), CAPS.people);
  const gamesN = topNMap(maxNormalize(games), CAPS.games);
  const formatsN = topNMap(maxNormalize(formats), CAPS.formats);

  // Ensure never empty
  if (!Object.keys(topicsN).length) {
    INTEREST_CHIPS.slice(0, 5).forEach((k, i) => {
      topicsN[k] = Math.round((0.2 - i * 0.02) * 1000) / 1000;
    });
    explain.topics.push({
      key: INTEREST_CHIPS[0],
      score: 0.2,
      reason: 'Starter interests while we learn what you enjoy',
    });
  }

  const lookingFor = String(profile.lookingFor || profile.matchIntent || user.lookingFor || '').trim();
  const bucket = intentBucket(lookingFor, { teen });
  const openToMeet = user.openToMeet !== false && profile.openToMeet !== false;
  const replyOpens = rollups.reduce((a, r) => a + (Number(r.counts?.dm_open) || 0), 0);
  const replies = rollups.reduce((a, r) => a + (Number(r.counts?.reply) || 0) + (Number(r.counts?.dm_send) || 0), 0);
  const replyRate = replyOpens > 0 ? clamp01(replies / replyOpens) : null;
  const follows = rollups.reduce((a, r) => a + (Number(r.counts?.follow) || 0), 0);
  const unfollows = rollups.reduce((a, r) => a + (Number(r.counts?.unfollow) || 0), 0);
  const strangerComfort = clamp01(0.4 + follows * 0.05 - unfollows * 0.08 + (replyRate || 0) * 0.3);

  if (bucket && !teen) {
    explain.social.push({
      key: 'intent',
      score: 0.5,
      reason: `You're open to ${bucket} connections`,
    });
  }

  const coldStart = eventCount < COLD_START_EVENT_MIN;
  const confTopics = clamp01(0.25 + declaredInterests.length * 0.08 + (collectBehavioral ? Math.min(eventCount, 40) / 80 : 0));
  const confPeople = collectBehavioral && !teen ? clamp01(Object.keys(peopleN).length / 10) : 0.1;
  const confGames = clamp01(Object.keys(gamesN).length / 8);
  const confFormats = clamp01(Object.keys(formatsN).length / 4);
  const confRhythm = Object.keys(hourBuckets).length ? 0.7 : 0.2;
  const confSocial = lookingFor || replyRate != null ? 0.55 : 0.25;
  const overall = clamp01(
    (confTopics + confPeople + confGames + confFormats + confRhythm + confSocial) / 6
  );

  const trimExplain = (arr) =>
    (arr || [])
      .filter((x) => x && x.reason)
      .slice(0, CAPS.explainPerBlock)
      .map((x) => ({
        key: String(x.key || '').slice(0, 64),
        score: Math.round(clamp01(x.score) * 1000) / 1000,
        reason: String(x.reason).slice(0, 160),
      }));

  const hasProfileEmbedding = !!(
    input.hasProfileEmbedding ||
    user.profileEmbedding?.vector ||
    (Array.isArray(user.profileEmbedding) && user.profileEmbedding.length)
  );

  return {
    v: SCHEMA_V,
    uid: String(input.uid || user.uid || '').slice(0, 128) || null,
    sourceWindowDays: SOURCE_WINDOW_DAYS,
    eventCount,
    coldStart,
    behavioral: !!collectBehavioral,
    topics: topicsN,
    people: peopleN,
    games: gamesN,
    formats: formatsN,
    rhythm: {
      hourBuckets: hourBuckets || {},
      tabHabits: tabHabits || {},
    },
    social: {
      replyRate,
      strangerComfort: collectBehavioral ? strangerComfort : null,
      openToMeet: !!openToMeet,
      teen,
      intentBucket: teen ? (bucket === 'dating' ? null : bucket) : bucket,
    },
    embeddingRefs: {
      hasProfileEmbedding,
      // Never duplicate the vector — P6 reads users.profileEmbedding directly
    },
    confidence: {
      overall,
      topics: confTopics,
      people: confPeople,
      games: confGames,
      formats: confFormats,
      rhythm: confRhythm,
      social: confSocial,
    },
    explain: {
      topics: trimExplain(explain.topics),
      people: trimExplain(explain.people),
      games: trimExplain(explain.games),
      formats: trimExplain(explain.formats),
      social: trimExplain(explain.social),
    },
    consent: {
      activityOptOut: !collectBehavioral,
      teen,
    },
    updatedAtMs: now,
  };
}

// ——— Storage interface (swappable) ———

function modelRef(db, uid) {
  return db.collection(COLLECTION).doc(String(uid));
}

async function getUserModel(db, uid) {
  if (!uid) return null;
  const snap = await modelRef(db, uid).get();
  return snap.exists ? snap.data() || null : null;
}

async function putUserModel(db, uid, model, FieldValue) {
  if (!uid || !model) throw new Error('putUserModel requires uid + model');
  const payload = {
    ...model,
    uid: String(uid),
    updatedAt: FieldValue ? FieldValue.serverTimestamp() : new Date(),
    updatedAtMs: Number(model.updatedAtMs) || Date.now(),
  };
  await modelRef(db, uid).set(payload, { merge: false });
  return payload;
}

async function deleteUserModel(db, uid) {
  if (!uid) return { deleted: false };
  try {
    await modelRef(db, uid).delete();
    return { deleted: true };
  } catch (e) {
    return { deleted: false, error: e?.message || String(e) };
  }
}

/**
 * Soft topic lookup — Firestore has no inverted index here.
 * Scans a bounded page of models (for future index swap). Callers should not rely on this at scale yet.
 */
async function queryByTopic(db, topicKey, { limit = 20, startAfterUid = null } = {}) {
  const key = normalizeKey(topicKey);
  if (!key) return { uids: [], nextCursor: null };
  let q = db.collection(COLLECTION).orderBy('__name__').limit(Math.min(80, Math.max(limit * 4, 20)));
  if (startAfterUid) q = q.startAfter(startAfterUid);
  const snap = await q.get();
  const uids = [];
  snap.docs.forEach((d) => {
    const topics = d.data()?.topics || {};
    if (topics[key] != null && Number(topics[key]) > 0.15) uids.push(d.id);
  });
  return {
    uids: uids.slice(0, limit),
    nextCursor: snap.size ? snap.docs[snap.docs.length - 1].id : null,
  };
}

function loadConsentFromUser(userDoc) {
  const d = userDoc || {};
  const profile = d.profile && typeof d.profile === 'object' ? d.profile : {};
  const activityOptOut =
    d.activitySignalsOptOut === true || profile.activitySignalsOptOut === true;
  const teen =
    d.teenMode === true ||
    profile.teenMode === true ||
    (typeof d.age === 'number' && d.age < 18) ||
    (typeof profile.age === 'number' && profile.age < 18);
  return {
    collect: !activityOptOut,
    activityOptOut,
    teen: !!teen,
  };
}

function tsToMs(v) {
  if (v == null) return null;
  if (typeof v.toMillis === 'function') return v.toMillis();
  if (typeof v.toDate === 'function') return v.toDate().getTime();
  if (typeof v === 'number') return v;
  const p = Date.parse(v);
  return Number.isFinite(p) ? p : null;
}

async function gatherInputs(db, uid) {
  const userRef = db.collection('users').doc(uid);
  const [userSnap, prev, stateSnap] = await Promise.all([
    userRef.get(),
    getUserModel(db, uid),
    db.collection('chaupaalUserState').doc(uid).get().catch(() => null),
  ]);
  const user = userSnap.exists ? userSnap.data() || {} : {};
  const profile = user.profile && typeof user.profile === 'object' ? user.profile : {};
  const state = stateSnap && stateSnap.exists ? stateSnap.data() || {} : {};

  const dayKeys = [];
  const now = Date.now();
  for (let i = 0; i < 14; i++) {
    const d = new Date(now - i * 86400000);
    dayKeys.push(d.toISOString().slice(0, 10));
  }
  // signal-spine writes rollups at users/{uid}/signalRollups/{yyyy-MM-dd}
  const rollupSnaps = await Promise.all(
    dayKeys.map((day) => userRef.collection('signalRollups').doc(day).get().catch(() => null))
  );
  const rollups = [];
  const seen = new Set();
  for (let i = 0; i < dayKeys.length; i++) {
    const day = dayKeys[i];
    const snap = rollupSnaps[i];
    if (snap && snap.exists && !seen.has(snap.id)) {
      seen.add(snap.id);
      const data = snap.data() || {};
      rollups.push({ id: snap.id, day: data.day || day, ...data });
    }
  }

  let recommendationSignals = [];
  try {
    const sigSnap = await userRef.collection('recommendationSignals').limit(80).get();
    recommendationSignals = sigSnap.docs.map((d) => {
      const x = d.data() || {};
      return {
        ...x,
        updatedAtMs: tsToMs(x.updatedAt) || tsToMs(x.createdAt) || now - 3 * 86400000,
      };
    });
  } catch (e) {}

  let gameStats = [];
  try {
    const gSnap = await userRef.collection('gameStats').limit(40).get();
    gameStats = gSnap.docs.map((d) => ({ id: d.id, ...(d.data() || {}) }));
  } catch (e) {}

  return {
    uid,
    user: { ...user, uid },
    profile,
    previousModel: prev,
    rollups,
    recommendationSignals,
    gameStats,
    hourBuckets: state.hourBuckets || user.hourBuckets || {},
    tabHabits: state.tabHabits || {},
    consent: loadConsentFromUser(user),
    hasProfileEmbedding: !!(user.profileEmbedding?.vector || user.profileEmbedding),
    now,
  };
}

async function refreshUserModel(db, uid, { admin } = {}) {
  const FieldValue = admin?.firestore?.FieldValue || null;
  const inputs = await gatherInputs(db, uid);
  const model = buildUserModelFromInputs(inputs);
  await putUserModel(db, uid, model, FieldValue);
  return { ok: true, uid, coldStart: model.coldStart, eventCount: model.eventCount, behavioral: model.behavioral };
}

async function processUserModelBatch(db, admin, { batchSize = BATCH_DEFAULT } = {}) {
  const cursorRef = db.collection('chaupaalMeta').doc('userModelCursor');
  const cursorSnap = await cursorRef.get();
  const cursor = cursorSnap.exists ? cursorSnap.data() || {} : {};
  let lastUid = cursor.lastUid || null;

  let q = db.collection('users').orderBy('__name__').limit(batchSize);
  if (lastUid) q = q.startAfter(lastUid);
  const snap = await q.get();

  const results = { users: snap.size, refreshed: 0, skipped: 0, errors: 0, coldStart: 0 };
  for (const doc of snap.docs) {
    try {
      const r = await refreshUserModel(db, doc.id, { admin });
      results.refreshed += 1;
      if (r.coldStart) results.coldStart += 1;
    } catch (e) {
      results.errors += 1;
      console.warn('[user-model] refresh', doc.id, e?.message || e);
    }
  }

  if (snap.empty || snap.size < batchSize) {
    await cursorRef.set({ lastUid: null, updatedAt: new Date(), wrapped: true }, { merge: true });
    results.wrapped = true;
  } else {
    await cursorRef.set(
      { lastUid: snap.docs[snap.docs.length - 1].id, updatedAt: new Date(), wrapped: false },
      { merge: true }
    );
    results.nextUid = snap.docs[snap.docs.length - 1].id;
  }
  return results;
}

/**
 * Replace discoveryPreferenceDeltas stub work: refresh models for uids that
 * wrote high-signal preference feedback. Empty uids → document only (scheduler
 * owns the cursor batch via processUserModelBatch).
 */
async function feedPreferenceDeltasIntoModels(db, admin, { uids = [], dayKey } = {}) {
  const key = dayKey || new Date().toISOString().slice(0, 10);
  const list = [...new Set((uids || []).filter(Boolean))].slice(0, 25);
  let refreshed = 0;
  for (const uid of list) {
    try {
      await refreshUserModel(db, uid, { admin });
      refreshed += 1;
    } catch (e) {
      console.warn('[user-model] delta refresh', uid, e?.message || e);
    }
  }
  await db
    .collection('discoveryPreferenceDeltas')
    .doc(key)
    .set(
      {
        dayKey: key,
        job: 'user_model_preference_feed',
        refreshedUids: list.length,
        refreshed,
        note: 'P5: preference deltas fold into userModels via refreshUserModel; recommendationSignals remain source of truth for more_like/not_interested. Nightly cursor batch is processUserModelBatch in chaupaal-scheduler.',
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      },
      { merge: true }
    );
  return { ok: true, dayKey: key, refreshed, targeted: list.length };
}

module.exports = {
  SCHEMA_V,
  COLLECTION,
  SOURCE_WINDOW_DAYS,
  COLD_START_EVENT_MIN,
  HALF_LIFE,
  WEIGHTS,
  CAPS,
  INTEREST_CHIPS,
  buildUserModelFromInputs,
  getUserModel,
  putUserModel,
  deleteUserModel,
  queryByTopic,
  refreshUserModel,
  processUserModelBatch,
  feedPreferenceDeltasIntoModels,
  loadConsentFromUser,
  intentBucket,
  decayFactor,
  maxNormalize,
  topNMap,
  normalizeKey,
  eloBracket,
};
