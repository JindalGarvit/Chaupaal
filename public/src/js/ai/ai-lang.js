/**
 * AI output language (Global L4) — shared by the browser (callAI) and the server (server-lib/ai.js).
 *
 *   directive(lang)          "Respond in <Language>" appended to the system prompt of UI-text calls
 *   validate(text, lang, o)  does the output look like that language? (script share for non-Latin
 *                            languages; stop-word check between Latin languages). o.json → only the
 *                            JSON string values are checked, never the keys / enum codes.
 *   cacheKey(base, lang)     every cache of AI UI text is keyed by language
 *
 * Policy: per-viewer UI text (rules answers, coach tips, assistant replies, explanations) is asked for
 * in the viewer's UI language; when the answer comes back in the wrong script/language the caller
 * falls back to English. Shared content that is stored once for everyone stays canonical English.
 */
(function (root) {
  'use strict';

  const NAMES = {
    en: 'English', hi: 'Hindi', bn: 'Bengali', ta: 'Tamil', te: 'Telugu', mr: 'Marathi', ur: 'Urdu', ar: 'Arabic',
    es: 'Spanish', fr: 'French', pt: 'Portuguese', de: 'German', id: 'Indonesian', ja: 'Japanese', ko: 'Korean', zh: 'Simplified Chinese',
  };

  /** Letters expected for each language (Unicode script ranges). Latin languages share one. */
  const LATIN = /[A-Za-z\u00c0-\u024f]/;
  const SCRIPT = {
    hi: /[\u0900-\u097f]/, mr: /[\u0900-\u097f]/, bn: /[\u0980-\u09ff]/, ta: /[\u0b80-\u0bff]/, te: /[\u0c00-\u0c7f]/,
    ar: /[\u0600-\u06ff\u0750-\u077f\ufb50-\ufdff\ufe70-\ufeff]/, ur: /[\u0600-\u06ff\u0750-\u077f\ufb50-\ufdff\ufe70-\ufeff]/,
    ja: /[\u3040-\u30ff\u3400-\u9fff]/, zh: /[\u3400-\u9fff]/, ko: /[\uac00-\ud7af\u1100-\u11ff\u3130-\u318f]/,
  };
  const KANA = /[\u3040-\u30ff]/;

  /** A few very common function words per Latin-script language. */
  const STOP = {
    en: ['the', 'and', 'you', 'your', 'is', 'are', 'to', 'of', 'in', 'for', 'with', 'this', 'that', 'it', 'on'],
    es: ['el', 'la', 'los', 'las', 'y', 'que', 'de', 'en', 'un', 'una', 'es', 'por', 'para', 'con', 'tu'],
    fr: ['le', 'la', 'les', 'et', 'que', 'de', 'des', 'un', 'une', 'est', 'pour', 'avec', 'vous', 'tu', 'pas'],
    pt: ['o', 'a', 'os', 'as', 'e', 'que', 'de', 'em', 'um', 'uma', 'para', 'com', 'não', 'você', 'do'],
    de: ['der', 'die', 'das', 'und', 'ist', 'nicht', 'ein', 'eine', 'zu', 'mit', 'für', 'du', 'sie', 'auf', 'den'],
    id: ['yang', 'dan', 'di', 'ini', 'itu', 'untuk', 'dengan', 'tidak', 'ada', 'kamu', 'dari', 'ke', 'akan', 'bisa', 'saya'],
  };

  function normalize(code) {
    const c = String(code || '')
      .trim()
      .toLowerCase()
      .replace(/_/g, '-')
      .split('-')[0];
    return NAMES[c] ? c : 'en';
  }

  function name(lang) {
    return NAMES[normalize(lang)];
  }

  function directive(lang) {
    const n = name(lang);
    return (
      `\n\nRespond in ${n}. Write every user-facing sentence in ${n}; keep people's names, @handles, numbers, URLs, ` +
      'brand names (Chaupaal, Dangal, Baithak, Mehfil, Peepal, Akhbaar, Duniya, Khoj, Vriksha) and any JSON keys or codes exactly as given.'
    );
  }

  function withLang(system, lang) {
    return String(system || '') + directive(lang);
  }

  /** Visible prose only: JSON keys, URLs, @handles, #tags and code-like tokens are not language evidence. */
  function prose(text, json) {
    let s = String(text == null ? '' : text);
    if (json) s = s.replace(/"[^"\n]*"\s*:/g, ' ').replace(/\b(true|false|null)\b/g, ' ');
    return s
      .replace(/https?:\/\/\S+/g, ' ')
      .replace(/[@#][\w.]+/g, ' ')
      .replace(/\b(Chaupaal|Dangal|Baithak|Mehfil|Peepal|Akhbaar|Duniya|Khoj|Vriksha)\b/gi, ' ');
  }

  function letters(s) {
    const out = [];
    for (const ch of s) if (/\p{L}/u.test(ch)) out.push(ch);
    return out;
  }

  /**
   * { ok, reason }. Very short outputs (< 4 letters) pass — nothing to judge. Non-Latin targets need
   * ≥ 35% of letters in their script (English loanwords / names are fine); Japanese must show kana,
   * Chinese must not. Latin targets need ≥ 70% Latin letters and must not read as another Latin
   * language (stop-word majority).
   */
  function validate(text, lang, opts) {
    const l = normalize(lang);
    const body = prose(text, opts && opts.json);
    const ls = letters(body);
    if (ls.length < 4) return { ok: true, reason: 'short' };
    const re = SCRIPT[l];
    if (re) {
      const share = ls.filter((c) => re.test(c)).length / ls.length;
      if (share < 0.35) return { ok: false, reason: 'script' };
      if (l === 'ja' && ls.length >= 6 && !ls.some((c) => KANA.test(c))) return { ok: false, reason: 'script' };
      if (l === 'zh' && ls.some((c) => KANA.test(c))) return { ok: false, reason: 'script' };
      return { ok: true, reason: 'script' };
    }
    const latin = ls.filter((c) => LATIN.test(c)).length / ls.length;
    if (latin < 0.7) return { ok: false, reason: 'script' };
    const words = body
      .toLowerCase()
      .split(/[^\p{L}]+/u)
      .filter(Boolean);
    if (words.length < 6) return { ok: true, reason: 'short' };
    const hits = (code) => words.filter((w) => STOP[code].includes(w)).length;
    const mine = hits(l);
    for (const other of Object.keys(STOP)) {
      if (other === l) continue;
      const theirs = hits(other);
      if (theirs >= 3 && theirs > mine * 2) return { ok: false, reason: 'language' };
    }
    return { ok: true, reason: 'language' };
  }

  function cacheKey(base, lang) {
    return String(base) + '::' + normalize(lang);
  }

  const api = { NAMES, normalize, name, directive, withLang, validate, cacheKey };
  root.AiLang = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);
