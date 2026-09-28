/**
 * Quiz Muqabala AI pipeline + maintenance jobs (Dangal P6). Runs only from the scheduler
 * (api/chaupaal-scheduler.js → runQuizJobs); never per request.
 *
 * Generation (only when AI_FEATURES_ENABLED === "true", AI_JOBS_PAUSED off, budget under
 * AI_DAILY_CALL_CAP and the quiz share of it; provider/model from AI_PROVIDER / AI_MODEL_*):
 *   1. generate a small batch from a rotating topic, or from one fresh Akhbaar article
 *   2. strict schema validation
 *   3. safety + teen-safe filter (profanity/PII + divisive topics)
 *   4. news only: grounding — the quoted source text must appear in the article and contain the answer
 *   5. dedupe — normalised text + token overlap vs the bank and stored AI items, plus embeddings when
 *      EMBED_PROVIDER / Gemini embeddings are configured
 *   6. independent verification — a blind second pass (options reshuffled, no answer given) must
 *      pick the same answer
 *   7. difficulty estimate from the generator's tier → stored as status "pending"
 * Pending items: ≤1 per Duel, ≤2 per Party, never in the Daily. Promotion / retirement thresholds are
 * QuizCore.PROMOTE / QuizCore.RETIRE. News questions expire after 14 days.
 * Maintenance (always, AI on or off): expire news, promote / retire, calibrate difficulty from stats.
 */
'use strict';

const Core = require('../public/src/js/games/quiz-core.js');
const Bank = require('./quiz-bank.js');

const TOPIC_BATCH = 6;
const NEWS_BATCH = 3;
const QUIZ_DAILY_CALLS = 24;
const JACCARD_DUP = 0.8;
const EMBED_DUP = 0.92;
const CALIBRATE_MIN_ANSWERS = 10;
const NEWS_LOOKBACK_MS = 7 * 86400000;

const DIVISIVE =
  /\b(elections?|voting|votes?|politic\w*|politicians?|president\w*|prime minister|parliament\w*|congress\w*|senat\w*|republican\w*|democrat\w*|left-wing|right-wing|abortion|religio\w*|gods?|allah|jesus|bible|quran|terror\w*|wars?|invasion|genocide|shooting|bomb\w*|massacre|killed|murder\w*|sex\w*|drugs?|alcohol|guns?|weapons?|israel\w*|palestin\w*|gaza|kashmir|taiwan|crimea|immigra\w*|refugees?|protests?|riots?|racis\w*|casino|gambl\w*|betting)\b/i;

function isSafeText(s) {
  try {
    return require('./dangal-ai.js').isSafeText(s);
  } catch (e) {
    return true;
  }
}

const tokens = (s) => new Set(Core.normText(s).split(' ').filter((w) => w.length > 2));
function jaccard(a, b) {
  if (!a.size || !b.size) return 0;
  let inter = 0;
  a.forEach((x) => b.has(x) && inter++);
  return inter / (a.size + b.size - inter);
}
function cosine(a, b) {
  if (!Array.isArray(a) || !Array.isArray(b) || a.length !== b.length || !a.length) return 0;
  let dot = 0;
  let na = 0;
  let nb = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    na += a[i] * a[i];
    nb += b[i] * b[i];
  }
  return na && nb ? dot / Math.sqrt(na * nb) : 0;
}

function parseJsonArray(text) {
  const t = String(text || '');
  const start = t.indexOf('[');
  const end = t.lastIndexOf(']');
  if (start < 0 || end <= start) return null;
  try {
    const v = JSON.parse(t.slice(start, end + 1));
    return Array.isArray(v) ? v : null;
  } catch (e) {
    return null;
  }
}

// ---------------------------------------------------------------- validation

/** Strict schema check. @returns {{ ok: true, item } | { ok: false, reason: 'schema' }} */
function validateCandidate(c, opts) {
  const o = opts || {};
  const bad = { ok: false, reason: 'schema' };
  if (!c || typeof c !== 'object') return bad;
  const prompt = typeof c.prompt === 'string' ? c.prompt.trim() : '';
  if (prompt.length < 12 || prompt.length > 220) return bad;
  if (!Array.isArray(c.options) || c.options.length !== 4) return bad;
  const options = c.options.map((x) => (typeof x === 'string' ? x.trim() : ''));
  if (options.some((x) => !x || x.length > 90)) return bad;
  if (new Set(options.map((x) => x.toLowerCase())).size !== 4) return bad;
  const ci = c.correctIndex;
  if (!Number.isInteger(ci) || ci < 0 || ci > 3) return bad;
  const explanation = typeof c.explanation === 'string' ? c.explanation.trim() : '';
  if (explanation.length < 10 || explanation.length > 280) return bad;
  const category = o.category || c.category;
  if (!Core.CATEGORY_IDS.includes(category)) return bad;
  const difficulty = Number(c.difficulty);
  if (![1, 2, 3].includes(difficulty)) return bad;
  const quote = typeof c.quote === 'string' ? c.quote.trim() : '';
  if (o.news && (quote.length < 12 || quote.length > 400)) return bad;
  return { ok: true, item: { prompt, options, correctIndex: ci, explanation, category, difficulty, quote } };
}

function safetyReject(item) {
  const all = [item.prompt, item.explanation].concat(item.options);
  if (!all.every(isSafeText)) return true;
  return all.some((s) => DIVISIVE.test(s));
}

/** News grounding: the quote is verbatim (normalised) in the article and contains the answer's key words. */
function grounded(item, article) {
  const src = Core.normText([article.headline, article.body].join(' '));
  const quote = Core.normText(item.quote);
  if (!quote || src.indexOf(quote) < 0) return false;
  const ans = Core.normText(item.options[item.correctIndex]).split(' ').filter((w) => w.length > 2);
  const keys = ans.length ? ans : Core.normText(item.options[item.correctIndex]).split(' ');
  return keys.some((w) => quote.indexOf(w) >= 0);
}

let bankIndex = null;
function getBankIndex() {
  if (!bankIndex) {
    bankIndex = { norms: new Set(), byCat: {} };
    for (const q of Bank.bank()) {
      const n = Core.normText(q.prompt);
      bankIndex.norms.add(n);
      (bankIndex.byCat[q.category] = bankIndex.byCat[q.category] || []).push(tokens(q.prompt));
    }
  }
  return bankIndex;
}

function lexicalDup(item, existing) {
  const n = Core.normText(item.prompt);
  const idx = getBankIndex();
  if (idx.norms.has(n) || (existing.norms && existing.norms.has(n))) return true;
  const t = tokens(item.prompt);
  const lists = Object.values(idx.byCat).concat(Object.values(existing.byCat || {}));
  return lists.some((list) => list.some((u) => jaccard(t, u) >= JACCARD_DUP));
}

// ---------------------------------------------------------------- AI calls

function topicPrompt(category, n) {
  const label = (Core.CATEGORIES.find((c) => c.id === category) || {}).label || category;
  return {
    system:
      'You write fair, globally understandable multiple-choice trivia for a teen-safe social app. ' +
      'Evergreen facts only: nothing political, religious, violent, sexual or time-sensitive. ' +
      'Exactly one option is correct; the other three are plausible but clearly wrong. Reply with JSON only.',
    user:
      `Write ${n} ${label} questions of mixed difficulty. JSON array of objects: ` +
      '{"prompt": string, "options": [4 strings], "correctIndex": 0-3, "explanation": one short sentence, "difficulty": 1|2|3}.',
  };
}

function newsPrompt(article, n) {
  return {
    system:
      'You write fair news quiz questions grounded ONLY in the article provided. Teen-safe; skip politics, ' +
      'conflict, crime and anything divisive — return [] if the article is only about those. Reply with JSON only.',
    user:
      `Article headline: ${article.headline}\nArticle text: ${article.body}\n\n` +
      `Write up to ${n} questions. JSON array of objects: {"prompt", "options": [4 strings], "correctIndex": 0-3, ` +
      '"explanation": one short sentence, "difficulty": 1|2|3, "quote": the exact sentence from the article text that proves the answer}.',
  };
}

async function askJson(callAI, p, tier) {
  const out = await callAI({ tier: tier || 'fast', system: p.system, messages: [{ role: 'user', content: p.user }], max_tokens: 1800, feature: 'quiz_gen' });
  return parseJsonArray(out && out.text);
}

/** Blind verification: options reshuffled, no answer given; returns the verifier's pick per item (original index) or null. */
async function verifyBlind(callAI, items, seed) {
  if (!items.length) return [];
  const shuffles = items.map((it, k) => Core.optionOrder('verify:' + seed + ':' + k, it.prompt, 4));
  const lines = items.map((it, k) => ({ n: k, prompt: it.prompt, options: shuffles[k].map((i) => it.options[i]) }));
  const out = await callAI({
    tier: 'balanced',
    system: 'You are a careful fact checker. For each question choose the single correct option. If none or several are correct, answer -1. Reply with JSON only.',
    messages: [{ role: 'user', content: 'Questions: ' + JSON.stringify(lines) + '\nReply as a JSON array of {"n": number, "answer": 0-3 or -1}.' }],
    max_tokens: 600,
    feature: 'quiz_verify',
  });
  const arr = parseJsonArray(out && out.text) || [];
  return items.map((it, k) => {
    const hit = arr.find((a) => a && Number(a.n) === k);
    const a = hit ? Number(hit.answer) : -1;
    return Number.isInteger(a) && a >= 0 && a <= 3 ? shuffles[k][a] : null;
  });
}

// ---------------------------------------------------------------- batch processing

/**
 * Run the checks on raw candidates. ctx: { callAI, category?, article?, existing, embed?, vectors?, now, seed }
 * @returns {{ accepted: object[], rejected: { schema, safety, grounding, duplicate, verify }, calls: number }}
 */
async function processBatch(raw, ctx) {
  const rejected = { schema: 0, safety: 0, grounding: 0, duplicate: 0, verify: 0 };
  const news = !!ctx.article;
  const existing = ctx.existing || { norms: new Set(), byCat: {} };
  const survivors = [];
  const batchNorms = new Set();
  for (const c of raw || []) {
    const v = validateCandidate(c, { news, category: ctx.category || (c && c.category) || (news ? ctx.article.category : null) });
    if (!v.ok) {
      rejected.schema++;
      continue;
    }
    const it = v.item;
    if (safetyReject(it)) {
      rejected.safety++;
      continue;
    }
    if (news && !grounded(it, ctx.article)) {
      rejected.grounding++;
      continue;
    }
    const n = Core.normText(it.prompt);
    if (batchNorms.has(n) || lexicalDup(it, existing)) {
      rejected.duplicate++;
      continue;
    }
    if (ctx.embed && ctx.vectors) {
      try {
        const vec = await ctx.embed(it.prompt);
        if (vec && ctx.vectors.some((u) => cosine(vec, u.v) >= EMBED_DUP)) {
          rejected.duplicate++;
          continue;
        }
        it.emb = vec || null;
      } catch (e) {}
    }
    batchNorms.add(n);
    survivors.push(it);
  }
  let calls = 0;
  const picks = survivors.length ? await verifyBlind(ctx.callAI, survivors, ctx.seed || ctx.now || 0) : [];
  if (survivors.length) calls++;
  const accepted = [];
  survivors.forEach((it, k) => {
    if (picks[k] !== it.correctIndex) {
      rejected.verify++;
      return;
    }
    const rating = Core.TIER_RATING[it.difficulty];
    const now = ctx.now || Date.now();
    accepted.push({
      id: Core.questionId(it.prompt, it.category),
      prompt: it.prompt,
      options: it.options,
      correctIndex: it.correctIndex,
      explanation: it.explanation,
      category: it.category,
      subcategory: news ? 'news' : 'ai',
      difficulty: it.difficulty,
      rating,
      locale: 'global',
      source: news ? 'news' : 'ai',
      articleId: news ? ctx.article.id : null,
      quote: news ? it.quote : null,
      status: 'pending',
      norm: Core.normText(it.prompt),
      createdAt: now,
      expiresAt: news ? now + Core.NEWS_TTL_MS : null,
      emb: it.emb || null,
    });
  });
  return { accepted, rejected, calls };
}

/**
 * One generation pass with injected I/O (tests pass a mocked callAI + store).
 * deps: { callAI, store(items), existing, articles: [{id, headline, body, category}], category, embed?, vectors?, now, callsLeft }
 */
async function runGeneration(deps) {
  const d = deps || {};
  const out = { generated: 0, accepted: 0, rejected: { schema: 0, safety: 0, grounding: 0, duplicate: 0, verify: 0 }, calls: 0, news: 0 };
  const merge = (r) => Object.keys(r.rejected).forEach((k) => (out.rejected[k] += r.rejected[k]));
  const store = d.store || (async () => {});
  let left = Number.isFinite(d.callsLeft) ? d.callsLeft : 4;
  if (left >= 2 && d.category) {
    const raw = (await askJson(d.callAI, topicPrompt(d.category, TOPIC_BATCH))) || [];
    out.calls++;
    left--;
    out.generated += raw.length;
    const r = await processBatch(raw, { callAI: d.callAI, category: d.category, existing: d.existing, embed: d.embed, vectors: d.vectors, now: d.now, seed: 't' + d.now });
    out.calls += r.calls;
    left -= r.calls;
    merge(r);
    if (r.accepted.length) await store(r.accepted);
    out.accepted += r.accepted.length;
  }
  for (const article of d.articles || []) {
    if (left < 2) break;
    const raw = (await askJson(d.callAI, newsPrompt(article, NEWS_BATCH))) || [];
    out.calls++;
    left--;
    out.generated += raw.length;
    const r = await processBatch(raw, { callAI: d.callAI, article, existing: d.existing, embed: d.embed, vectors: d.vectors, now: d.now, seed: 'n' + article.id });
    out.calls += r.calls;
    left -= r.calls;
    merge(r);
    if (r.accepted.length) await store(r.accepted);
    out.accepted += r.accepted.length;
    out.news += r.accepted.length;
    if (d.markUsed) await d.markUsed(article.id);
  }
  return out;
}

// ---------------------------------------------------------------- maintenance

/** Pure: status + rating updates for one item given its stats (used by the job and the tests). */
function reviewItem(item, stats, now) {
  const merged = Object.assign({}, item, { stats: stats || {} });
  const status = Core.decideStatus(merged, now);
  const st = stats || {};
  const prior = Number(item.rating) || Core.TIER_RATING[item.difficulty] || 1500;
  const rating = (st.answers || 0) >= CALIBRATE_MIN_ANSWERS ? Core.ratingFromStats(st.answers, st.correct, prior) : prior;
  return { status, rating, changed: status !== item.status || rating !== prior };
}

async function maintain(db, now) {
  const out = { expired: 0, promoted: 0, retired: 0, calibrated: 0 };
  const items = db.collection('quizItems');
  const statsCol = db.collection('quizStats');
  const calibRef = db.collection('quizConfig').doc('calibration');
  const calibSnap = await calibRef.get();
  const calib = calibSnap.exists ? calibSnap.data() || {} : {};
  const ratings = Object.assign({}, calib.ratings || {});
  const retired = Object.assign({}, calib.retired || {});
  const batch = db.batch();
  let writes = 0;

  const exp = await items.where('expiresAt', '<=', now).limit(200).get();
  exp.docs.forEach((d) => {
    if ((d.data() || {}).status === 'retired') return;
    batch.set(d.ref, { status: 'retired', retiredReason: 'expired', retiredAt: now }, { merge: true });
    out.expired++;
    writes++;
  });

  const pend = await items.where('status', '==', 'pending').limit(200).get();
  const pendDocs = pend.docs.filter((d) => !exp.docs.some((x) => x.id === d.id));
  if (pendDocs.length) {
    const statSnaps = await db.getAll(...pendDocs.map((d) => statsCol.doc(d.id)));
    pendDocs.forEach((d, k) => {
      const r = reviewItem(d.data() || {}, statSnaps[k].exists ? statSnaps[k].data() : {}, now);
      if (r.status === 'active') out.promoted++;
      if (r.status === 'retired') out.retired++;
      if (r.changed) {
        batch.set(d.ref, { status: r.status, rating: r.rating, reviewedAt: now }, { merge: true });
        writes++;
      }
    });
  }

  const since = Number(calib.lastRun) || 0;
  const recent = await statsCol.where('updatedAt', '>', since).limit(500).get();
  const aiIds = [];
  recent.docs.forEach((d) => {
    const st = d.data() || {};
    const b = Bank.byId(d.id);
    if (b) {
      const r = reviewItem(Object.assign({}, b, { rating: Number(ratings[d.id]) || b.rating }), st, now);
      if (r.status === 'retired' && !retired[d.id]) {
        retired[d.id] = true;
        out.retired++;
      }
      if ((st.answers || 0) >= CALIBRATE_MIN_ANSWERS) {
        ratings[d.id] = r.rating;
        out.calibrated++;
      }
    } else aiIds.push(d);
  });
  if (aiIds.length) {
    const snaps = await db.getAll(...aiIds.map((d) => items.doc(d.id)));
    snaps.forEach((s, k) => {
      if (!s.exists) return;
      const it = s.data() || {};
      if (it.status === 'pending') return;
      const r = reviewItem(it, aiIds[k].data() || {}, now);
      if (r.changed) {
        if (r.status === 'retired' && it.status !== 'retired') out.retired++;
        batch.set(s.ref, { status: r.status, rating: r.rating, reviewedAt: now }, { merge: true });
        writes++;
        out.calibrated++;
      }
    });
  }
  batch.set(calibRef, { ratings, retired, lastRun: now, at: now }, { merge: false });
  writes++;
  if (writes) await batch.commit();
  return out;
}

async function loadExisting(db) {
  const existing = { norms: new Set(), byCat: {} };
  const vectors = [];
  const snap = await db.collection('quizItems').orderBy('createdAt', 'desc').limit(400).get();
  snap.docs.forEach((d) => {
    const it = d.data() || {};
    const n = it.norm || Core.normText(it.prompt);
    existing.norms.add(n);
    (existing.byCat[it.category] = existing.byCat[it.category] || []).push(tokens(it.prompt));
    if (Array.isArray(it.emb) && it.emb.length) vectors.push({ id: d.id, v: it.emb });
  });
  return { existing, vectors };
}

async function freshArticles(db, now, used) {
  const snap = await db.collection('category_cache').where('newsTs', '>=', now - NEWS_LOOKBACK_MS).limit(12).get();
  const out = [];
  snap.docs.forEach((d) => {
    const data = d.data() || {};
    (Array.isArray(data.news) ? data.news : []).forEach((n) => {
      if (!n || !n.headline || !n.body) return;
      const id = 'a' + Core.hash(String(n.headline) + '|' + (n.link || '')).toString(36);
      if (used[id]) return;
      out.push({ id, headline: String(n.headline).slice(0, 300), body: String(n.body).slice(0, 2400), category: 'gk', source: n.source || null, link: n.link || null });
    });
  });
  return out.slice(0, 1);
}

/**
 * Scheduler entry. Maintenance always runs; generation only when AI is on and budgeted.
 * deps (tests): { callAI, embed, embeddingsConfigured, aiEnabled, budget }
 */
async function runQuizJobs({ db, admin, now, deps }) {
  const t = now || Date.now();
  const d = deps || {};
  const result = { maintenance: null, generation: null };
  try {
    result.maintenance = await maintain(db, t);
  } catch (e) {
    result.maintenance = { error: e && e.message };
  }
  const cfg = require('./ai-config');
  const enabled = d.aiEnabled != null ? d.aiEnabled : cfg.isAiFeaturesEnabled();
  if (!enabled) {
    result.generation = { skipped: 'ai_off' };
    return result;
  }
  if (cfg.AI_JOBS_PAUSED) {
    result.generation = { skipped: 'paused' };
    return result;
  }
  try {
    const enrich = require('./ai-enrichment');
    const budget = d.budget || (await enrich.loadBudget(db));
    if (!enrich.budgetAllows(budget) && !d.budget) {
      result.generation = { skipped: 'budget' };
      return result;
    }
    const day = new Date(t).toISOString().slice(0, 10);
    const runRef = db.collection('quizConfig').doc('aiRun');
    const runSnap = await runRef.get();
    const run = runSnap.exists && runSnap.data().day === day ? runSnap.data() : { day, calls: 0, used: (runSnap.exists && runSnap.data().used) || {} };
    const callsLeft = Math.min(QUIZ_DAILY_CALLS - (Number(run.calls) || 0), Math.max(0, cfg.AI_DAILY_CALL_CAP - (Number(budget.calls) || 0)));
    if (callsLeft < 2) {
      result.generation = { skipped: 'quiz_cap' };
      return result;
    }
    const { existing, vectors } = await loadExisting(db);
    const used = Object.assign({}, run.used || {});
    const articles = await freshArticles(db, t, used).catch(() => []);
    const emb = require('./embeddings');
    const useEmbed = d.embeddingsConfigured != null ? d.embeddingsConfigured : emb.embeddingsConfigured();
    const callAI = d.callAI || require('./ai').callAI;
    const category = Core.CATEGORY_IDS[Math.floor(t / 86400000) % Core.CATEGORY_IDS.length];
    const gen = await runGeneration({
      callAI,
      category,
      articles,
      existing,
      vectors: useEmbed ? vectors : null,
      embed: useEmbed ? d.embed || emb.embedText : null,
      now: t,
      callsLeft,
      store: async (list) => {
        const b = db.batch();
        list.forEach((it) => b.set(db.collection('quizItems').doc(it.id), it, { merge: false }));
        await b.commit();
      },
      markUsed: async (id) => {
        used[id] = t;
      },
    });
    const keepUsed = {};
    Object.keys(used).forEach((k) => t - used[k] < 30 * 86400000 && (keepUsed[k] = used[k]));
    await runRef.set({ day, calls: (Number(run.calls) || 0) + gen.calls, used: keepUsed, at: t });
    if (gen.calls) await enrich.bumpBudget(db, admin, { calls: gen.calls, tokensEst: gen.calls * 1200 });
    result.generation = gen;
  } catch (e) {
    const code = e && e.code;
    result.generation = code === 'AI_NOT_CONFIGURED' || (e && e.name === 'AiDisabledError') ? { skipped: 'no_provider' } : { error: e && e.message };
  }
  return result;
}

module.exports = {
  validateCandidate,
  safetyReject,
  grounded,
  lexicalDup,
  verifyBlind,
  processBatch,
  runGeneration,
  reviewItem,
  runQuizJobs,
  parseJsonArray,
  jaccard,
  cosine,
  DIVISIVE,
  QUIZ_DAILY_CALLS,
};
