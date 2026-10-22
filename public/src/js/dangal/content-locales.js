/**
 * Dangal content localisation manifest (Global L5). One place that says, for every content set
 * behind the 25 games, how it is localised and in which languages it actually exists — so the UI
 * can hide or label what isn't there instead of silently showing English.
 *
 * Strategies
 *   translate          one canonical (English) set, translated per language. UI-keyed sets (`keys`)
 *                      are available wherever the i18n pack covers them; data sets (`files`) wherever
 *                      a locale overlay file exists (data/locales/<lang>/*.js, applied via applyLocale).
 *   language-specific  each language has its own set (lexicons, regional packs) — never translated;
 *                      a language without one shows the mode as "not yet" (hidden).
 *   canonical-subset   English canonical bank; a language pass translates a curated core subset
 *                      (Quiz: server-lib/quiz-locales.js, ≥ CORE_MIN questions incl. the Daily pool).
 *   en-only            English flavour with no equivalent (traditional Tambola calls) — the toggle
 *                      is hidden in every other language.
 *
 * Room content language: a host setting (`settings.contentLang`, default = host's UI language).
 * Each player's UI stays in their own language; words / titles / guesses use the room language.
 * UMD: window.DangalContentLocales / require().
 */
(function (root, factory) {
  const api = factory(root);
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.DangalContentLocales = api;
})(typeof self !== 'undefined' ? self : this, function (root) {
  'use strict';

  const GAMES = ['tiptap', 'brickbreaker', 'ankjod', 'wordguess', 'chess', 'ttt', 'snakes', 'ludo', 'uno', 'scribble', 'quiz', 'carrom', 'rummy', 'teenpatti', 'bluff', 'tambola', 'streetcricket', 'badminton', 'imposter', 'rajamantri', 'charades', 'mostlikely', 'werewolf', 'penalty', 'poker'];

  /** Share of a keyed set that must be translated before it counts as available in a language. */
  const KEY_COVERAGE = 0.9;

  const SETS = {
    // ---- every game: rules sheet, FAQ, post-game tips (UI-keyed, translate) ----
    rules: { strategy: 'translate', games: GAMES, keys: GAMES.map((g) => 'games.' + g + '.rules.'), note: 'Rules declarations (glance + sections + variants)' },
    faq: { strategy: 'translate', games: GAMES, keys: GAMES.map((g) => 'games.' + g + '.faq.'), note: 'Rules FAQ (≥5 per game)' },
    tips: { strategy: 'translate', games: GAMES, keys: GAMES.map((g) => 'games.' + g + '.tip.'), note: 'Post-game tip library' },

    // ---- party word / prompt content ----
    'imposter.packs': { strategy: 'translate', games: ['imposter'], files: { hi: ['data/locales/hi/imposter-packs.hi.js'] }, guess: true, note: 'Imposter core packs + Undercover partners' },
    'charades.packs': { strategy: 'translate', games: ['charades'], files: { hi: ['data/locales/hi/charades-packs.hi.js'] }, guess: true, note: 'Charades core packs' },
    'mostlikely.prompts': { strategy: 'translate', games: ['mostlikely'], files: { hi: ['data/locales/hi/mostlikely-packs.hi.js'] }, keys: ['games.mostlikely.nhie.'], note: 'Most Likely To / Would You Rather / Never Have I Ever core prompts' },
    'rajamantri.roles': { strategy: 'translate', games: ['rajamantri'], files: { hi: ['data/locales/hi/rajamantri.hi.js'] }, keys: ['games.rajamantri.'], note: 'Raja Mantri Chor Sipahi roles + calls' },
    'werewolf.narration': { strategy: 'translate', games: ['werewolf'], keys: ['games.werewolf.'], note: 'Werewolf roles + narration' },
    'scribble.words': { strategy: 'translate', games: ['scribble'], files: {}, min: 600, guess: true, note: 'Scribble core word packs (≥600 words per language)' },

    // ---- templated speech ----
    'streetcricket.commentary': { strategy: 'translate', games: ['streetcricket'], keys: ['games.streetcricket.comm.'], speech: true, note: 'Cricket commentary templates' },
    'badminton.umpire': { strategy: 'translate', games: ['badminton'], keys: ['games.badminton.'], speech: true, note: 'Umpire calls' },
    'tambola.caller': { strategy: 'translate', games: ['tambola'], keys: ['games.tambola.'], speech: true, note: 'Caller phrases (numbers via the L1 number helper)' },
    'uno.shouts': { strategy: 'translate', games: ['uno'], keys: ['games.uno.'], note: 'Oh No! shouts' },
    'chess.openings': { strategy: 'translate', games: ['chess'], keys: ['games.chess.opening.'], note: 'Opening names (ECO)' },
    'coach.explain': { strategy: 'translate', games: ['chess', 'ankjod', 'wordguess', 'ttt'], keys: ['dangal.'], note: 'Coach / hint explanations' },

    // ---- language-specific ----
    'shabd.lexicon': { strategy: 'language-specific', games: ['wordguess'], langs: ['en', 'hi'], modes: { daily: ['en', 'hi'], archive: ['en', 'hi'] }, note: 'Shabd Five five-letter lexicon (Hindi readers play the English lexicon; other languages: not yet)' },
    'scribble.regional': { strategy: 'language-specific', games: ['scribble'], langs: ['en'], regional: true, note: 'Regional add-on packs (Bollywood, cricket) — opt-in, never the default' },
    'imposter.regional': { strategy: 'language-specific', games: ['imposter'], langs: ['en', 'hi'], regional: true, note: 'Regional add-on packs — opt-in by locale or host' },

    // ---- canonical subset ----
    'quiz.bank': { strategy: 'canonical-subset', games: ['quiz'], server: 'server-lib/quiz-locales.js', min: 500, note: 'English bank; language passes translate a ≥500-question core subset incl. the Daily pool' },

    // ---- English-only flavour ----
    'tambola.traditional': { strategy: 'en-only', games: ['tambola'], langs: ['en'], note: 'Traditional Tambola calls (“Two little ducks — 22”)' },
  };

  const base = (lang) => String(lang == null ? 'en' : lang).toLowerCase().split(/[-_]/)[0] || 'en';

  /** Pseudo-locales (en-XA / ar-XB) and English read the English canonical content. */
  function contentBase(lang) {
    const l = String(lang || '').toLowerCase();
    if (l === 'en-xa' || l === 'ar-xb') return 'en';
    return base(lang);
  }

  function uiLang() {
    const raw = typeof root.currentLang !== 'undefined' ? root.currentLang : typeof currentLang !== 'undefined' ? currentLang : 'en';
    return typeof root.normalizeLang === 'function' ? root.normalizeLang(raw) : raw;
  }

  function keyCoverage(prefixes, lang) {
    const fn = typeof root.i18nCoverage === 'function' ? root.i18nCoverage : null;
    if (!fn) return 0;
    let have = 0;
    let total = 0;
    (prefixes || []).forEach((p) => {
      const c = fn(p, lang) || { have: 0, total: 0 };
      have += c.have;
      total += c.total;
    });
    return total ? have / total : 0;
  }

  /** Is this content set really there in `lang`? */
  function available(setId, lang) {
    const set = SETS[setId];
    if (!set) return false;
    const l = contentBase(lang);
    if (set.strategy === 'en-only') return l === 'en';
    if (l === 'en') return true;
    if (set.langs) return set.langs.indexOf(l) >= 0;
    if (set.files && set.files[l] && set.files[l].length) return true;
    if (set.keys && !set.files) return keyCoverage(set.keys, l) >= KEY_COVERAGE;
    if (set.server) return Array.isArray(root.__quizQuestionLangs) && root.__quizQuestionLangs.indexOf(l) >= 0;
    return false;
  }

  /** A mode backed by a language-specific set (Shabd Five daily…). */
  function modeAvailable(gameId, mode, lang) {
    const l = contentBase(lang);
    for (const id of Object.keys(SETS)) {
      const s = SETS[id];
      if (s.games.indexOf(gameId) < 0 || !s.modes || !s.modes[mode]) continue;
      if (s.modes[mode].indexOf(l) < 0) return false;
    }
    return true;
  }

  /** English-only flavour toggles (traditional Tambola calls) show only in English. */
  function flavourVisible(setId, lang) {
    const s = SETS[setId];
    return !s || s.strategy !== 'en-only' || contentBase(lang) === 'en';
  }

  function setsFor(gameId) {
    return Object.keys(SETS).filter((id) => SETS[id].games.indexOf(gameId) >= 0);
  }

  /** Content-bearing sets for a game (what a "words in …" indicator talks about). */
  function contentSetsFor(gameId) {
    return setsFor(gameId).filter((id) => {
      const s = SETS[id];
      return !s.regional && s.strategy !== 'en-only' && ['rules', 'faq', 'tips', 'coach.explain'].indexOf(id) < 0;
    });
  }

  /**
   * Per-game availability in `lang`: { lang, full, english: [setIds falling back to English] }.
   * `full` = every content set exists in that language (or the language is English).
   */
  function status(gameId, lang) {
    const l = contentBase(lang);
    const ids = [].concat(gameId).reduce((a, g) => a.concat(contentSetsFor(g).filter((id) => a.indexOf(id) < 0)), []);
    const english = ids.filter((id) => !available(id, l) && !SETS[id].modes);
    return { lang: l, full: l === 'en' || !english.length, english };
  }

  /** Overlay files to load for these games / languages (relative to /src/js/). */
  function overlaysFor(gameId, langs) {
    const out = [];
    const ids = [].concat(gameId).reduce((a, g) => a.concat(setsFor(g)), []);
    (Array.isArray(langs) ? langs : [langs]).map(contentBase).forEach((l) => {
      ids.forEach((id) => {
        const f = SETS[id].files && SETS[id].files[l];
        (f || []).forEach((rel) => out.indexOf(rel) < 0 && out.push(rel));
      });
    });
    return out;
  }

  /** Apply overlays that loaded before their pack (queued on window.__dangalPendingLocales). */
  function drain() {
    const q = root.__dangalPendingLocales;
    if (!Array.isArray(q) || !q.length) return 0;
    let n = 0;
    for (let i = q.length - 1; i >= 0; i--) {
      const it = q[i];
      const target = it && root[it.target];
      if (target && typeof target.applyLocale === 'function') {
        target.applyLocale(it.lang, it.data);
        q.splice(i, 1);
        n++;
      }
    }
    return n;
  }

  /** Room content language: the room's setting, else the host's / device UI language. */
  function roomLang(settings, fallback) {
    const s = settings && settings.contentLang;
    return contentBase(s || fallback || uiLang());
  }

  /** Languages a host can pick (one game or a party's games): English + languages where the content exists. */
  function roomChoices(gameId) {
    const langs = ['en'];
    const cands = typeof root.LANG_CATALOG !== 'undefined' && Array.isArray(root.LANG_CATALOG) ? root.LANG_CATALOG.map((x) => x.code) : ['hi'];
    const sets = [].concat(gameId).reduce((a, g) => a.concat(contentSetsFor(g).filter((id) => SETS[id].guess || SETS[id].files)), []);
    cands.forEach((code) => {
      const l = contentBase(code);
      if (langs.indexOf(l) >= 0) return;
      if (sets.some((id) => available(id, l))) langs.push(l);
    });
    const ui = contentBase(uiLang());
    if (langs.indexOf(ui) < 0) langs.push(ui);
    return langs;
  }

  /** Games whose content language matters for play (typed guesses / secret words). */
  function hasRoomContent(gameId) {
    return [].concat(gameId).some((g) => setsFor(g).some((id) => SETS[id].guess));
  }

  /** Party night: the word / title games whose content follows the party's language. */
  const PARTY_WORD_GAMES = ['imposter', 'charades', 'scribble'];

  return { GAMES, SETS, KEY_COVERAGE, available, modeAvailable, flavourVisible, setsFor, contentSetsFor, status, overlaysFor, drain, roomLang, roomChoices, hasRoomContent, contentBase, PARTY_WORD_GAMES };
});
