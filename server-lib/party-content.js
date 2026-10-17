/**
 * Party content quality + light AI (Dangal P15). Served through the existing `party_room` action
 * (POST /api/media-config { action: 'party_room', game, op, ... }) — no new function.
 *
 * Ops (any Party Kit game that has cards: imposter · charades · mostlikely):
 *   card_flag     { key, locale, reason? }  "Bad card" after a round. One vote per user per card;
 *                                           RETIRE_AT distinct users → retired for that game + locale.
 *   card_retired  { locale }                retired keys (Pass & Play filters its local deck with them)
 *   ai_pack       { theme, mode?, count? }  "Make a pack about…" (AI on only) → a draft the host
 *                                           previews/edits before use; never stored server-side.
 *   narrate       { code }  (werewolf)      host asks for one AI narrator line for the current beat;
 *                                           cached on the room (pub.narration) so each beat costs ≤ 1 call.
 *
 * Firestore:
 *   partyCards/{game}__{locale}__{hash}       { game, locale, pack, key, text, flags, by{uid}, retired }
 *   partyCardsRetired/{game}__{locale}        { keys: { hash: key }, updatedAt }
 *   partyCardFlagUsers/{uid}                  { day, n }  (FLAG_DAILY_CAP)
 * Rooms exclude retired keys through the adapters' `prepare` (retiredFor, cached per instance).
 */
'use strict';

const crypto = require('crypto');

const OPS = ['card_flag', 'card_retired', 'ai_pack', 'narrate'];
const CARD_GAMES = ['imposter', 'charades', 'mostlikely'];
const LOCALES = ['en', 'hi', 'ta'];
const RETIRE_AT = 5;
/** Per-pack overrides (a pack that draws more flags by design can ask for more votes). */
const RETIRE_AT_PACK = {};
const FLAG_DAILY_CAP = 60;
const REASONS = ['unclear', 'too_hard', 'offensive', 'repeat', 'other'];
const CACHE_MS = 5 * 60 * 1000;
const NARRATE_MAX = 160;
const GORE = /\b(blood\w*|bloody|gore|gory|guts|corpse|carcass|murder\w*|kill\w*|slaughter\w*|stab\w*|knife|knives|dagger|gun\w*|shoot\w*|axe|maul\w*|mangle\w*|torn|ripped|rip(?:ped)? apart|bleed\w*|wound\w*|injur\w*|flesh|bones?|skull|dead body|body parts?|devour\w*|decapitat\w*|behead\w*|scream\w* in pain|tortur\w*)\b/i;

/** "Make a pack about…" themes stay teen-safe (on top of the safety + kindness filters). */
const THEME_HARM = /\b(hurt\w*|harm\w*|bull(y|ies|ying)|weapons?|bombs?|drugs?|alcohol|drunk\w*|beers?|vodka|whisk(e)?y|smok\w*|cigarettes?|vap(e|ing)|gambl\w*|hate\w*)\b/i;

const retiredCache = new Map();

function err(code, message) {
  const e = new Error(message || code);
  e.code = code;
  return e;
}

function hashKey(key) {
  return crypto.createHash('sha1').update(String(key)).digest('hex').slice(0, 20);
}

function cleanLocale(l) {
  const x = String(l || 'en').toLowerCase().slice(0, 2);
  return LOCALES.indexOf(x) >= 0 ? x : 'en';
}

function dayKey(now) {
  return new Date(now).toISOString().slice(0, 10);
}

function cores() {
  return {
    imposter: require('../public/src/js/games/imposter-core.js'),
    charades: require('../public/src/js/games/charades-core.js'),
    mostlikely: require('../public/src/js/games/mostlikely-core.js'),
  };
}

/** A pack card by key → { key, pack, text } (null for unknown / custom / AI cards — those aren't flaggable). */
function cardFor(game, key) {
  const k = String(key || '').slice(0, 140);
  if (!k || k.indexOf('x:') === 0 || k.indexOf('c:') === 0 || k.indexOf('custom:') === 0) return null;
  const C = cores();
  if (game === 'imposter') {
    const packId = k.split(':')[0];
    const pack = C.imposter.packs.getPack(packId);
    if (!pack) return null;
    const row = pack.words.find((r) => C.imposter.wordKey(packId, r) === k);
    return row ? { key: k, pack: packId, text: row[0] } : null;
  }
  if (game === 'charades') {
    const t = C.charades.packs.byKey(k);
    return t ? { key: k, pack: t.pack, text: t.en } : null;
  }
  if (game === 'mostlikely') {
    const item = C.mostlikely.packs.byKey(k);
    if (!item) return null;
    return { key: k, pack: item.pack, text: item.a ? item.a.en + ' / ' + item.b.en : item.en };
  }
  return null;
}

function retireAt(pack) {
  return RETIRE_AT_PACK[pack] || RETIRE_AT;
}

function dbOf(adminApp, deps) {
  return (deps && deps.db) || adminApp.firestore();
}

function fieldValue(adminApp, deps) {
  const admin = (deps && deps.admin) || adminApp;
  return admin.firestore && admin.firestore.FieldValue ? admin.firestore.FieldValue : null;
}

// ------------------------------------------------------------------ bad-card loop

async function cardFlag(adminApp, uid, game, b, deps) {
  if (CARD_GAMES.indexOf(game) < 0) throw err('bad_game', 'This game has no cards to rate');
  const card = cardFor(game, b.key);
  if (!card) return { flagged: false, ignored: true };
  const locale = cleanLocale(b.locale);
  const reason = REASONS.indexOf(b.reason) >= 0 ? b.reason : 'other';
  const now = (deps && deps.now) || Date.now();
  const db = dbOf(adminApp, deps);
  const h = hashKey(card.key);
  const cardRef = db.collection('partyCards').doc(game + '__' + locale + '__' + h);
  const userRef = db.collection('partyCardFlagUsers').doc(uid);
  const retiredRef = db.collection('partyCardsRetired').doc(game + '__' + locale);
  const out = await db.runTransaction(async (tx) => {
    const [cSnap, uSnap] = await Promise.all([tx.get(cardRef), tx.get(userRef)]);
    const u = uSnap.exists ? uSnap.data() || {} : {};
    const today = dayKey(now);
    const used = u.day === today ? Number(u.n) || 0 : 0;
    if (used >= FLAG_DAILY_CAP) return { flagged: false, capped: true };
    const c = cSnap.exists ? cSnap.data() || {} : {};
    const by = Object.assign({}, c.by || {});
    if (by[uid]) return { flagged: true, already: true, retired: !!c.retired };
    by[uid] = true;
    const flags = (Number(c.flags) || 0) + 1;
    const reasons = Object.assign({}, c.reasons || {});
    reasons[reason] = (Number(reasons[reason]) || 0) + 1;
    const retire = !c.retired && flags >= retireAt(card.pack);
    tx.set(
      cardRef,
      {
        game,
        locale,
        pack: card.pack,
        key: card.key,
        text: card.text,
        flags,
        by,
        reasons,
        retired: !!c.retired || retire,
        retiredAt: retire ? now : c.retiredAt || null,
        updatedAt: now,
      },
      { merge: true }
    );
    tx.set(userRef, { day: today, n: used + 1 }, { merge: true });
    if (retire) tx.set(retiredRef, { keys: { [h]: card.key }, updatedAt: now }, { merge: true });
    return { flagged: true, retired: !!c.retired || retire, justRetired: retire };
  });
  if (out.justRetired) retiredCache.delete(game + '__' + locale);
  delete out.justRetired;
  return out;
}

/** Retired keys for a game + locale (English is always included: a bad English card is bad everywhere it shows). */
async function retiredFor(adminApp, game, locale, deps) {
  if (CARD_GAMES.indexOf(game) < 0) return [];
  const loc = cleanLocale(locale);
  const ids = loc === 'en' ? ['en'] : ['en', loc];
  const now = Date.now();
  const lists = await Promise.all(
    ids.map(async (l) => {
      const id = game + '__' + l;
      const hit = retiredCache.get(id);
      if (hit && now - hit.at < CACHE_MS) return hit.keys;
      let keys = [];
      try {
        const snap = await dbOf(adminApp, deps).collection('partyCardsRetired').doc(id).get();
        const data = snap.exists ? snap.data() || {} : {};
        keys = Object.values(data.keys || {}).filter((k) => typeof k === 'string');
      } catch (e) {
        keys = hit ? hit.keys : [];
      }
      retiredCache.set(id, { at: now, keys });
      return keys;
    })
  );
  return lists.reduce((a, l) => a.concat(l.filter((k) => a.indexOf(k) < 0)), []);
}

/** Adapter `prepare` hook: the retire list rides into the deal as ctx.args.prep.retired. */
function retiredPrepare(game) {
  return async (adminApp, rtdb, path, uid, deps, op, body) => {
    try {
      return { retired: await retiredFor(adminApp, game, body && body.locale, deps) };
    } catch (e) {
      return { retired: [] };
    }
  };
}

/** Admin feedback surface: the most-flagged cards (retired first). */
async function adminCardList(db, limit) {
  const snap = await db.collection('partyCards').orderBy('flags', 'desc').limit(Math.max(1, Math.min(200, Number(limit) || 50))).get();
  const rows = [];
  snap.forEach((d) => {
    const x = d.data() || {};
    rows.push({ id: d.id, game: x.game, locale: x.locale, pack: x.pack, key: x.key, text: x.text, flags: x.flags || 0, reasons: x.reasons || {}, retired: !!x.retired, updatedAt: x.updatedAt || null });
  });
  return rows.sort((a, b) => Number(b.retired) - Number(a.retired) || b.flags - a.flags);
}

// ------------------------------------------------------------------ custom packs (AI drafts + host edits)

function kindness(text) {
  return cores().mostlikely.kindnessFlags(text).length === 0;
}

function safeText(text) {
  const AI = require('./dangal-ai.js');
  return AI.isSafeText(text) && kindness(text);
}

function tidy(s, max) {
  return String(s == null ? '' : s).replace(/[<>\u0000-\u001f]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, max);
}

/**
 * Validate + clean a custom pack for one game (drops unsafe / duplicate items).
 * imposter { name, words: [{ w, p }] } → ImposterCore.customPack shape or null
 * charades { titles: [string] }        → string[] (≥ CUSTOM_MIN) or null
 * mostlikely { mode, prompts: [...] }  → [{ mode, prompt }] customs or null
 */
function cleanPack(game, src) {
  const C = cores();
  const s = src || {};
  if (game === 'imposter') {
    const words = (Array.isArray(s.words) ? s.words : []).filter((x) => x && safeText(tidy(x.w, 32)) && safeText(tidy(x.p, 32)));
    return C.imposter.customPack({ name: safeText(tidy(s.name, 32)) ? tidy(s.name, 32) : 'Custom pack', words });
  }
  if (game === 'charades') {
    const titles = (Array.isArray(s.titles) ? s.titles : []).map((t) => tidy(t, 48)).filter((t) => t && safeText(t));
    const keys = C.charades.customKeys(titles);
    return keys.length ? keys.map((k) => k.slice(2)) : null;
  }
  if (game === 'mostlikely') {
    const mode = C.mostlikely.MODES.indexOf(s.mode) >= 0 ? s.mode : 'mlt';
    const seen = {};
    const out = [];
    (Array.isArray(s.prompts) ? s.prompts : []).slice(0, 60).forEach((p) => {
      const input = mode === 'wyr' ? { a: p && p.a, b: p && p.b } : typeof p === 'string' ? p : p && (p.text || p.en);
      const c = C.mostlikely.cleanCustom(input, mode);
      if (!c.ok) return;
      const text = mode === 'wyr' ? c.prompt.a.en + ' / ' + c.prompt.b.en : c.prompt.en;
      const k = text.toLowerCase();
      if (seen[k] || !safeText(text)) return;
      seen[k] = true;
      out.push({ mode, prompt: c.prompt });
    });
    return out.length >= 4 ? out.slice(0, 40) : null;
  }
  return null;
}

// ------------------------------------------------------------------ deterministic fallback packs

function seeded(seed) {
  let h = 2166136261;
  const str = String(seed || '');
  for (let i = 0; i < str.length; i++) h = Math.imul(h ^ str.charCodeAt(i), 16777619) >>> 0;
  return () => {
    h = Math.imul(h ^ (h >>> 15), 2246822507) >>> 0;
    h = Math.imul(h ^ (h >>> 13), 3266489909) >>> 0;
    return ((h ^= h >>> 16) >>> 0) / 4294967296;
  };
}

function themeScore(theme, text) {
  const words = String(theme || '').toLowerCase().split(/[^a-z0-9]+/).filter((w) => w.length >= 3);
  const t = String(text || '').toLowerCase();
  return words.reduce((n, w) => n + (t.indexOf(w) >= 0 ? 1 : 0), 0);
}

/**
 * Themed fallback when the provider is off / capped / fails / returns junk: the closest built-in
 * global pack (by theme words in its name + cards), else a Mixed sample. Same shape as the AI schema.
 */
function fallbackPack(input) {
  const i = input || {};
  const C = cores();
  const rng = seeded(String(i.kind) + ':' + String(i.theme) + ':' + String(i.mode || ''));
  const n = Math.max(4, Math.min(i.kind === 'prompts' ? 30 : 40, Number(i.count) || 12));
  const pickFrom = (list) => require('../public/src/js/games/party-core.js').shuffle(list, rng).slice(0, n);
  if (i.kind === 'pairs') {
    const packs = C.imposter.packs.PACKS.filter((p) => !p.regional);
    const best = packs.map((p) => ({ p, s: themeScore(i.theme, p.en + ' ' + p.words.map((r) => r[0]).join(' ')) })).sort((a, b) => b.s - a.s)[0];
    const rows = best && best.s > 0 ? best.p.words : packs.reduce((a, p) => a.concat(p.words), []);
    return { words: pickFrom(rows).map((r) => ({ w: r[0], p: r[2] })) };
  }
  if (i.kind === 'titles') {
    const packs = C.charades.packs.PACKS.filter((p) => !p.regional);
    const best = packs.map((p) => ({ p, s: themeScore(i.theme, p.en + ' ' + p.titles.map((t) => t.en).join(' ')) })).sort((a, b) => b.s - a.s)[0];
    const titles = (best && best.s > 0 ? [best.p] : packs).reduce((a, p) => a.concat(p.titles.filter((t) => !t.regional).map((t) => t.en)), []);
    return { words: pickFrom(titles) };
  }
  const mode = i.mode === 'wyr' || i.mode === 'nhie' ? i.mode : 'mlt';
  const field = C.mostlikely.packs.FIELD[mode];
  const packs = C.mostlikely.packs.packsFor(mode).filter((p) => !p.regional);
  const best = packs.map((p) => ({ p, s: themeScore(i.theme, p.en + ' ' + JSON.stringify(p[field])) })).sort((a, b) => b.s - a.s)[0];
  const items = (best && best.s > 0 ? [best.p] : packs).reduce((a, p) => a.concat(p[field]), []);
  const picked = pickFrom(items);
  return { prompts: mode === 'wyr' ? picked.map((x) => ({ a: x.a.en, b: x.b.en })) : picked.map((x) => x.en) };
}

async function aiPack(adminApp, uid, game, b, deps) {
  if (CARD_GAMES.indexOf(game) < 0) throw err('bad_game', 'Packs can be made for Imposter, Charades and Most Likely To');
  const theme = tidy(b.theme, 40);
  if (theme.length < 2) throw err('bad_theme', 'Say what the pack is about');
  if (!safeText(theme) || GORE.test(theme) || THEME_HARM.test(theme)) throw err('bad_theme', 'Keep it kind and teen-safe — try another theme');
  const AI = require('./dangal-ai.js');
  const ai = (deps && deps.ai) || AI.sharedAI(typeof adminApp.firestore === 'function' ? { db: adminApp.firestore(), admin: adminApp } : {});
  if (!ai.enabled()) throw err('ai_off', 'Making packs isn’t available right now');
  const kind = game === 'imposter' ? 'pairs' : game === 'charades' ? 'titles' : 'prompts';
  const mode = ['mlt', 'wyr', 'nhie'].indexOf(b.mode) >= 0 ? b.mode : 'mlt';
  const input = { game, kind, theme, count: Math.max(8, Math.min(kind === 'prompts' ? 20 : 30, Number(b.count) || 20)) };
  if (kind === 'prompts') input.mode = mode;
  const res = await ai.run('generateWordPack', input, { uid });
  const draft = (data) =>
    kind === 'pairs'
      ? cleanPack('imposter', { name: theme, words: data.words })
      : kind === 'titles'
        ? cleanPack('charades', { titles: data.words })
        : cleanPack('mostlikely', { mode, prompts: data.prompts });
  let source = res.source;
  let pack = draft(res.data || {});
  if (!pack) {
    source = 'fallback';
    pack = draft(fallbackPack(input));
  }
  return { pack: shapeForClient(game, pack, theme, mode), source, theme };
}

function shapeForClient(game, pack, theme, mode) {
  if (!pack) return null;
  if (game === 'imposter') return { name: pack.en, words: pack.words.map((r) => ({ w: r[0], p: r[2] })) };
  if (game === 'charades') return { name: theme, titles: pack };
  return {
    name: theme,
    mode,
    prompts: pack.map((c) => (mode === 'wyr' ? { a: c.prompt.a.en, b: c.prompt.b.en } : c.prompt.en)),
  };
}

// ------------------------------------------------------------------ Werewolf narrator flavour

function narrationFacts(st, names) {
  const nm = (id) => tidy((names && names[id] && names[id].name) || 'Someone', 20);
  const last = (st.log || []).slice(-1)[0] || {};
  const facts = { night: st.night || 0, day: st.day || 0, aliveCount: (st.alive || []).length };
  if (last.t === 'dawn') {
    facts.taken = (last.taken || []).map(nm);
    facts.saved = !!last.saved;
  }
  if (last.t === 'vote') facts.out = last.out ? nm(last.out) : null;
  if (last.t === 'win') facts.winner = last.winner;
  return { facts, beat: last.t || st.phase };
}

function cleanNarration(line) {
  const t = tidy(line, NARRATE_MAX);
  if (!t || GORE.test(t)) return '';
  return safeText(t) ? t : '';
}

const NARRATE_BEATS = ['night', 'dawn', 'vote', 'win'];

async function narrate(adminApp, uid, b, deps) {
  const PD = require('./party-deal.js');
  const code = PD.cleanCode(b.code);
  if (!code) throw err('bad_code', 'Check the room code');
  const rtdb = adminApp.database();
  const path = `games/werewolf/${code}`;
  const snap = await rtdb.ref(path + '/pub').once('value');
  const pub = snap && snap.val ? snap.val() : null;
  if (!pub || pub.status !== 'playing' || !pub.state) return { line: '' };
  if (pub.host !== uid) throw err('host_only', 'Only the host’s phone narrates');
  const key = String(pub.phaseKey || '') + '#' + String((pub.state.log || []).length);
  if (pub.narration && pub.narration.key === key) return { line: pub.narration.line || '', cached: true };
  const { facts, beat } = narrationFacts(pub.state, pub.players || {});
  if (NARRATE_BEATS.indexOf(beat) < 0) return { line: '' };
  const AI = require('./dangal-ai.js');
  const ai = (deps && deps.ai) || AI.sharedAI(typeof adminApp.firestore === 'function' ? { db: adminApp.firestore(), admin: adminApp } : {});
  let line = '';
  if (ai.enabled()) {
    const res = await ai.run('commentary', { gameId: 'werewolf', mode: 'narrate', beat, theme: String(pub.state.theme || 'werewolf'), facts }, { uid });
    line = res.source === 'fallback' ? '' : cleanNarration(res.data && res.data.line);
  }
  try {
    await rtdb.ref(path + '/pub/narration').set({ key, line });
  } catch (e) {}
  return { line };
}

// ------------------------------------------------------------------ entry

async function contentAction(adminApp, uid, game, b, deps) {
  const op = String(b.op || '');
  if (op === 'card_flag') return cardFlag(adminApp, uid, game, b, deps);
  if (op === 'card_retired') return { keys: await retiredFor(adminApp, game, b.locale, deps) };
  if (op === 'ai_pack') return aiPack(adminApp, uid, game, b, deps);
  if (op === 'narrate') {
    if (game !== 'werewolf') throw err('bad_game', 'Narration is for Werewolf');
    return narrate(adminApp, uid, b, deps);
  }
  throw err('bad_op', 'Unknown content action');
}

module.exports = {
  OPS,
  CARD_GAMES,
  RETIRE_AT,
  FLAG_DAILY_CAP,
  NARRATE_MAX,
  GORE,
  cardFor,
  cardFlag,
  retiredFor,
  retiredPrepare,
  adminCardList,
  cleanPack,
  fallbackPack,
  aiPack,
  cleanNarration,
  narrationFacts,
  narrate,
  contentAction,
  _cache: retiredCache,
};
