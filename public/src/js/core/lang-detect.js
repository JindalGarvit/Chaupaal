/**
 * Language detection for Translate (Global L7) — on device, no network, no third-party code.
 *
 *   detect(text) → { lang, confidence 0–1, script, letters, romanized }
 *   trivial(text) → true for short / emoji-only / number-only / link-only text (never offer Translate)
 *
 * Model: Unicode script first (Bengali, Tamil, Telugu, Hangul, kana, Han, Arabic, Devanagari … are
 * unambiguous or nearly so), then small per-language signals where one script is shared:
 * Urdu vs Arabic (Urdu-only letters + function words), Hindi vs Marathi (ळ + function words), and
 * the Latin languages (stop-word + diacritic scores, incl. Latin-script Hindi). Low evidence → low
 * confidence, and the caller doesn't offer Translate. Mentions, hashtags, URLs, numbers and emoji are
 * not language evidence.
 */
(function (root) {
  'use strict';

  const SCRIPTS = [
    ['deva', /[\u0900-\u097f]/],
    ['beng', /[\u0980-\u09ff]/],
    ['guru', /[\u0a00-\u0a7f]/],
    ['gujr', /[\u0a80-\u0aff]/],
    ['orya', /[\u0b00-\u0b7f]/],
    ['taml', /[\u0b80-\u0bff]/],
    ['telu', /[\u0c00-\u0c7f]/],
    ['knda', /[\u0c80-\u0cff]/],
    ['mlym', /[\u0d00-\u0d7f]/],
    ['thai', /[\u0e00-\u0e7f]/],
    ['arab', /[\u0600-\u06ff\u0750-\u077f\u08a0-\u08ff\ufb50-\ufdff\ufe70-\ufeff]/],
    ['hebr', /[\u0590-\u05ff]/],
    ['hang', /[\uac00-\ud7af\u1100-\u11ff\u3130-\u318f]/],
    ['kana', /[\u3040-\u30ff\u31f0-\u31ff\uff66-\uff9f]/],
    ['hani', /[\u3400-\u4dbf\u4e00-\u9fff\uf900-\ufaff]/],
    ['cyrl', /[\u0400-\u04ff]/],
    ['grek', /[\u0370-\u03ff]/],
    ['latn', /[A-Za-z\u00c0-\u024f\u1e00-\u1eff]/],
  ];
  /** Scripts that name one language on their own. */
  const SCRIPT_LANG = { beng: 'bn', taml: 'ta', telu: 'te', hang: 'ko', guru: 'pa', gujr: 'gu', orya: 'or', knda: 'kn', mlym: 'ml', thai: 'th', hebr: 'he', grek: 'el', cyrl: 'ru' };

  const words = (list) => new Set(list.split(' '));
  const LATIN = {
    en: words('the and you your is are to of in for with this that it on was have not be at what my me we they so but just all about will can do know like get'), // i18n-ignore (detector stop-words)
    es: words('el la los las y que de en un una es por para con tu no se lo como pero muy más mi ya está son también yo hola gracias sé voy siento mucho eso esto estoy hoy quiero tengo puedo hay ahora bueno'), // i18n-ignore (detector stop-words)
    fr: words('le la les et que de des un une est pour avec vous tu pas ne je il elle nous sur au aux ce cette mais très bonjour merci'), // i18n-ignore (detector stop-words)
    pt: words('o a os as e que de em um uma para com não você do da dos das no na é eu muito obrigado obrigada mas seu sua ele ela nós nos hoje acho então isso isto vamos também estou está são'), // i18n-ignore (detector stop-words)
    de: words('der die das und ist nicht ein eine zu mit für du sie auf den dem ich wir es ihr auch sehr danke aber wie was'), // i18n-ignore (detector stop-words)
    id: words('yang dan di ini itu untuk dengan tidak ada kamu dari ke akan bisa saya aku apa juga sudah belum terima kasih sangat'), // i18n-ignore (detector stop-words)
    hi: words('hai hain nahi nahin kya main mein tum aap hum ho kar ka ki ke yaar bhai accha acha kaise kyun haan bahut bhi toh tha thi mujhe tumhe kuch'), // i18n-ignore (detector stop-words)
  };
  /** Letters that point at one Latin language (à, é, ê, ç are shared and don't count). */
  const ACCENT = { es: /[ñ¿¡]/g, pt: /[ãõ]/g, fr: /[èëîïûùœ]/g, de: /[äöüß]/g };

  const HI_WORDS = words('है हैं और नहीं में का की के यह क्या हूँ हूं था थे मैं आप बहुत कर रहा रही गया');
  const MR_WORDS = words('आहे आहेत आणि नाही मी तू काय हे आम्ही तुम्ही माझा माझी होते केले खूप आता झाले');
  const UR_LETTERS = /[ٹڈڑںےۓہھ]/g;
  const UR_WORDS = words('ہے ہیں کے میں کی اور نہیں یہ کیا تھا آپ ہم');
  const AR_WORDS = words('في من على إلى هذا هذه التي الذي كان أن لا ما هو هي مع عن');

  /** Remove what isn't language evidence: links, emails, @handles, #tags, numbers, emoji, symbols. */
  function strip(text) {
    return String(text == null ? '' : text)
      .replace(/https?:\/\/\S+|www\.\S+/gi, ' ')
      .replace(/[\w.+-]+@[\w-]+\.[\w.]+/g, ' ')
      .replace(/(^|\s)[@#][\p{L}\p{N}_.]+/gu, ' ')
      .replace(/[\p{N}]+/gu, ' ')
      .replace(/[\p{Extended_Pictographic}\u200d\ufe0f\u{1f3fb}-\u{1f3ff}]/gu, ' ');
  }

  function scriptOf(ch) {
    for (const [id, re] of SCRIPTS) if (re.test(ch)) return id;
    return null;
  }

  function tokens(s) {
    return s
      .toLowerCase()
      .split(/[^\p{L}\p{M}]+/u)
      .filter(Boolean);
  }

  function letterCount(text) {
    let n = 0;
    for (const ch of strip(text)) if (/\p{L}/u.test(ch)) n++;
    return n;
  }

  /** Short / emoji-only / number-only / link-only text: nothing worth translating. */
  function trivial(text) {
    const s = strip(text);
    let cjk = 0;
    let n = 0;
    for (const ch of s) {
      if (!/\p{L}/u.test(ch)) continue;
      n++;
      if (/[\u3040-\u30ff\u3400-\u9fff\uac00-\ud7af]/.test(ch)) cjk++;
    }
    if (cjk >= 2) return false;
    return n < 4;
  }

  function scoreWords(toks, set) {
    let n = 0;
    toks.forEach((w) => set.has(w) && n++);
    return n;
  }

  function latin(body) {
    const toks = tokens(body);
    const scores = {};
    Object.keys(LATIN).forEach((l) => (scores[l] = scoreWords(toks, LATIN[l])));
    Object.keys(ACCENT).forEach((l) => {
      const m = body.match(ACCENT[l]);
      if (m) scores[l] += Math.min(3, m.length) * 1.5;
    });
    const ranked = Object.keys(scores).sort((a, b) => scores[b] - scores[a]);
    const best = ranked[0];
    const top = scores[best];
    const second = scores[ranked[1]] || 0;
    if (!top) return { lang: 'und', confidence: 0 };
    const share = top / Math.max(1, toks.length);
    let confidence = 0.35 + Math.min(0.35, share * 1.2) + Math.min(0.3, ((top - second) / top) * 0.3);
    if (top < 2) confidence = Math.min(confidence, 0.45);
    if (toks.length < 3) confidence = Math.min(confidence, 0.5);
    return { lang: best, confidence: Math.round(Math.min(0.97, confidence) * 100) / 100, romanized: best === 'hi' };
  }

  function detect(text) {
    const body = strip(text);
    const counts = {};
    let letters = 0;
    for (const ch of body) {
      if (!/\p{L}/u.test(ch)) continue;
      const sc = scriptOf(ch);
      if (!sc) continue;
      letters++;
      counts[sc] = (counts[sc] || 0) + 1;
    }
    const out = { lang: 'und', confidence: 0, script: null, letters, romanized: false };
    if (!letters || trivial(text)) return out;
    // Japanese mixes kana + Han: count them together.
    const kana = counts.kana || 0;
    const hani = counts.hani || 0;
    const ranked = Object.keys(counts).sort((a, b) => counts[b] - counts[a]);
    let script = ranked[0];
    let share = counts[script] / letters;
    if (kana && kana + hani >= letters * 0.5) {
      script = 'kana';
      share = (kana + hani) / letters;
    }
    out.script = script;
    const mixedPenalty = share >= 0.85 ? 1 : share >= 0.6 ? 0.85 : 0.6;

    if (SCRIPT_LANG[script]) return Object.assign(out, { lang: SCRIPT_LANG[script], confidence: round(0.97 * mixedPenalty) });
    if (script === 'kana') return Object.assign(out, { lang: 'ja', confidence: round(0.96 * mixedPenalty) });
    if (script === 'hani') return Object.assign(out, { lang: 'zh', confidence: round((hani >= 4 ? 0.9 : 0.75) * mixedPenalty) });
    if (script === 'arab') {
      const toks = tokens(body);
      const ur = (body.match(UR_LETTERS) || []).length * 2 + scoreWords(toks, UR_WORDS);
      const ar = scoreWords(toks, AR_WORDS) + (/[ةى]/.test(body) ? 2 : 0);
      const lang = ur > ar ? 'ur' : 'ar';
      const margin = Math.abs(ur - ar);
      return Object.assign(out, { lang, confidence: round((margin >= 2 ? 0.92 : 0.75) * mixedPenalty) });
    }
    if (script === 'deva') {
      const toks = tokens(body);
      const mr = scoreWords(toks, MR_WORDS) + (/ळ/.test(body) ? 2 : 0);
      const hi = scoreWords(toks, HI_WORDS);
      const lang = mr > hi ? 'mr' : 'hi';
      const margin = Math.abs(mr - hi);
      return Object.assign(out, { lang, confidence: round((margin >= 2 ? 0.92 : margin === 1 ? 0.8 : 0.7) * mixedPenalty) });
    }
    if (script === 'latn') {
      const r = latin(body);
      return Object.assign(out, { lang: r.lang, confidence: round(r.confidence * mixedPenalty), romanized: !!r.romanized });
    }
    return out;
  }

  function round(n) {
    return Math.round(n * 100) / 100;
  }

  const api = { detect, trivial, strip, letterCount, LATIN_LANGS: Object.keys(LATIN) };
  root.LangDetect = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);
