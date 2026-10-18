/**
 * Language-aware search normalisation (Global L4). Pure + deterministic; no external services.
 *
 *   fold(s)       NFKC (full-/half-width, ligatures, compatibility forms) → lowercase → Latin/Greek/
 *                 Cyrillic diacritics stripped (é→e, ñ→n; Indic matras / Arabic harakat are letters
 *                 and stay) → special Latin letters (ß→ss, æ→ae, ø→o, ł→l, đ→d, ı→i) → katakana→hiragana →
 *                 curly quotes straightened, zero-width chars dropped, whitespace collapsed.
 *   translit(s)   Latin-script Hindi/Urdu words → English search terms ("khel" → "dangal games").
 *   expand(s)     fold(s) + the transliteration terms, for keyword matching.
 *   matches(hay, q) fold-aware substring test.
 *
 * Stored values are never rewritten with this — it only shapes comparisons.
 */
(function (root) {
  'use strict';

  const SPECIAL = { ß: 'ss', æ: 'ae', œ: 'oe', ø: 'o', ł: 'l', đ: 'd', ð: 'd', þ: 'th', ı: 'i', ħ: 'h' };
  const SPECIAL_RE = /[ßæœøłđðþıħ]/g;

  function fold(input) {
    let s = String(input == null ? '' : input);
    if (!s) return '';
    try {
      s = s.normalize('NFKC');
    } catch (e) {}
    s = s.toLowerCase();
    try {
      // Only combining marks that follow a Latin/Greek/Cyrillic letter (U+0300–036F) — Devanagari,
      // Tamil, Bengali vowel signs and Arabic marks live in other blocks and are kept.
      s = s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').normalize('NFC');
    } catch (e) {}
    s = s.replace(SPECIAL_RE, (c) => SPECIAL[c] || c);
    s = s.replace(/[\u30a1-\u30f6]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0x60));
    s = s.replace(/[\u2018\u2019\u201b\u2032]/g, "'").replace(/[\u201c\u201d\u201f\u2033]/g, '"');
    s = s.replace(/[\u200b-\u200f\u2060\ufeff]/g, '');
    return s.replace(/\s+/g, ' ').trim();
  }

  /**
   * Curated Latin-script Hindi/Urdu → English search terms. Small on purpose: everyday words people
   * type into a search box, mapped to the English keywords the intents/registry already know.
   */
  const TRANSLIT = {
    khel: 'dangal games', khelo: 'play games', khelna: 'play games', khelein: 'play games', khiladi: 'games',
    khabar: 'news akhbaar', khabaren: 'news akhbaar', khabrein: 'news akhbaar', khabre: 'news akhbaar', akhbar: 'akhbaar news',
    samachar: 'news akhbaar', surkhiyan: 'headlines', surkhiya: 'headlines',
    dost: 'friends', dosto: 'friends', doston: 'friends', dosti: 'friendship friends', yaar: 'friends', yaaron: 'friends', mitr: 'friends', mitra: 'friends',
    gaana: 'music songs', gaane: 'music songs', gana: 'music songs', gane: 'music songs', sangeet: 'music', geet: 'songs music',
    baat: 'chats message', baatein: 'chats message', baaten: 'chats message', guftagu: 'chats', sandesh: 'message', paigam: 'message',
    dhoondo: 'find people', dhundo: 'find people', dhoondh: 'find people', dhundh: 'find people', khojo: 'khoj find people', talash: 'search',
    tasveer: 'photo', tasvir: 'photo', tasveeren: 'photo', kahani: 'story', kahaani: 'story', kahaniyan: 'story',
    sawal: 'question ask', sawaal: 'question ask', poochho: 'ask question', pucho: 'ask question', puchho: 'ask question',
    janamdin: 'birthday wish', janmdin: 'birthday wish', badhai: 'wish', mubarak: 'wish', mubarakbaad: 'wish', shubhkamnayein: 'wish',
    paisa: 'money', paise: 'money', khata: 'account', sadasyata: 'membership',
    suchna: 'notifications', suchnayen: 'notifications', soochna: 'notifications',
    shatranj: 'chess', saanp: 'snakes', seedhi: 'ladders', paheli: 'puzzle', paheliyan: 'puzzle',
    duniya: 'duniya', baithak: 'baithak', peepal: 'peepal', dangal: 'dangal', mehfil: 'mehfil',
    sajha: 'share', bhejo: 'send', likho: 'write', roznamcha: 'journal',
  };

  function words(s) {
    return fold(s)
      .split(/[\s,.;:!?()[\]{}"/\\|]+/)
      .filter(Boolean);
  }

  /** English terms for the Latin-script Hindi/Urdu words in s ('' when none). */
  function translit(s) {
    const out = [];
    for (const w of words(s)) if (TRANSLIT[w]) out.push(TRANSLIT[w]);
    return out.join(' ');
  }

  function expand(s) {
    const base = fold(s);
    const extra = translit(base);
    return extra ? base + ' ' + extra : base;
  }

  function matches(hay, q) {
    const fq = fold(q);
    return !!fq && fold(hay).includes(fq);
  }

  const api = { fold, translit, expand, matches, words, TRANSLIT };
  root.SearchNormalize = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);
