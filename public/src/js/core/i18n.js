// ===================== i18n TRANSLATION SYSTEM (Global L0) =====================
/**
 * Messages live in one file per language:
 *   public/src/i18n/en.js          English — source + fallback, bundled (window.CHAUPAAL_I18N_EN)
 *   public/src/i18n/{code}.json    every other language, lazy-loaded on selection; cached by sw.js
 *                                  (offline) and the active pack in localStorage (instant boot)
 *   public/src/i18n/legacy-keys.js pre-L0 flat keys → namespaced keys (t('settings_title') still works)
 * Keys are namespaced by surface: common. auth. onboarding. profile. settings. baithak. chat. mehfil.
 * music. duniya. akhbaar. peepal. khoj. vriksha. dangal. games.<id>. errors. notifications.
 *
 * Message format: {{name}} interpolation · {n, plural, =0 {…} one {# …} other {# …}} (Intl.PluralRules,
 * so ar's six forms work) · {g, select, female {…} other {…}} · {{@dangal}} glossary tokens (brand names,
 * never translated) · rich text limited to <strong> <b> <em> <i> <br> and only via tHtml().
 * t() returns plain text (tags stripped) for textContent/attributes; tHtml() escapes the message and
 * every param, re-allowing only those tags — translations can never inject markup.
 * Lookup: selected language → English → caller fallback → the key itself (console warning in dev).
 * Validate packs: node scripts/i18n-check.js
 */

/** The 16 languages Chaupaal ships. Single source for the picker, <html lang/dir> and TTS tags. */
const LANG_CATALOG = [
  { code: 'en', native: 'English', name: 'English', tts: 'en-US', html: 'en', region: 'US' },
  { code: 'hi', native: 'हिंदी', name: 'Hindi', tts: 'hi-IN', html: 'hi', region: 'IN' },
  { code: 'bn', native: 'বাংলা', name: 'Bengali', tts: 'bn-IN', html: 'bn', region: 'BD' },
  { code: 'ta', native: 'தமிழ்', name: 'Tamil', tts: 'ta-IN', html: 'ta', region: 'IN' },
  { code: 'te', native: 'తెలుగు', name: 'Telugu', tts: 'te-IN', html: 'te', region: 'IN' },
  { code: 'mr', native: 'मराठी', name: 'Marathi', tts: 'mr-IN', html: 'mr', region: 'IN' },
  { code: 'ur', native: 'اردو', name: 'Urdu', tts: 'ur-PK', html: 'ur', dir: 'rtl', region: 'PK' },
  { code: 'ar', native: 'العربية', name: 'Arabic', tts: 'ar-SA', html: 'ar', dir: 'rtl', region: 'SA' },
  { code: 'es', native: 'Español', name: 'Spanish', tts: 'es-ES', html: 'es', region: 'ES' },
  { code: 'fr', native: 'Français', name: 'French', tts: 'fr-FR', html: 'fr', region: 'FR' },
  { code: 'pt', native: 'Português (Brasil)', name: 'Portuguese (Brazil)', tts: 'pt-BR', html: 'pt-BR', region: 'BR' },
  { code: 'de', native: 'Deutsch', name: 'German', tts: 'de-DE', html: 'de', region: 'DE' },
  { code: 'id', native: 'Bahasa Indonesia', name: 'Indonesian', tts: 'id-ID', html: 'id', region: 'ID' },
  { code: 'ja', native: '日本語', name: 'Japanese', tts: 'ja-JP', html: 'ja', region: 'JP' },
  { code: 'ko', native: '한국어', name: 'Korean', tts: 'ko-KR', html: 'ko', region: 'KR' },
  { code: 'zh', native: '简体中文', name: 'Chinese (Simplified)', tts: 'zh-CN', html: 'zh-Hans', region: 'CN' },
];

/**
 * Languages we used to list. A saved choice here falls back to English with a one-time notice.
 * Their last packs are archived in scripts/i18n-retired/ — to bring one back, move its pack to
 * public/src/i18n/, add it to LANG_CATALOG and drop it from this list.
 */
const I18N_RETIRED_LANGS = ['gu', 'kn', 'ml', 'pa', 'or', 'as', 'ne', 'it', 'tr', 'ru'];

/** Content hashes of public/src/i18n/{code}.json — stamped by scripts/bust-assets.js. */
const I18N_PACK_VERSIONS = {"ar":"5de901dc","bn":"21d813dd","de":"ba92ce46","es":"d88ed56e","fr":"93da223f","hi":"ca4988d5","id":"e6559372","ja":"e01eb255","ko":"bbbfb401","mr":"57e6ee72","pt":"c0e07011","ta":"7ecc974b","te":"b194f151","ur":"21959d72","zh":"5337db9b"};

/** Brand / surface / proper-noun game names. Messages reference them as {{@id}}; never translated. */
const I18N_GLOSSARY = Object.freeze({
  chaupaal: 'Chaupaal',
  dangal: 'Dangal',
  baithak: 'Baithak',
  mehfil: 'Mehfil',
  peepal: 'Peepal',
  akhbaar: 'Akhbaar',
  duniya: 'Duniya',
  khoj: 'Khoj',
  vriksha: 'Vriksha',
  muqabala: 'Muqabala',
  rajamantri: 'Raja Mantri Chor Sipahi',
  teenpatti: 'Teen Patti',
  carrom: 'Carrom',
  ludo: 'Ludo',
  tambola: 'Tambola',
  kakuro: 'Kakuro',
  shabdfive: 'Shabd Five',
});

const LANG_CODE_SET = new Set(LANG_CATALOG.map((l) => l.code));
const I18N_PACKS = { en: (typeof window !== 'undefined' && window.CHAUPAAL_I18N_EN) || {} };
const I18N_LEGACY = (typeof window !== 'undefined' && window.CHAUPAAL_I18N_LEGACY) || {};
/** Messages added at runtime via registerI18nLocale — consulted after the language's own pack. */
const I18N_EXTRA = {};
const I18N_PACK_LS = 'chaupaal_i18n_pack_v1';
const I18N_RETIRED_NOTICE_LS = 'chaupaal_lang_retired_notice';

function i18nBase(code) {
  return String(code || '')
    .trim()
    .toLowerCase()
    .replace(/_/g, '-')
    .split('-')[0];
}

/** Supported catalog code for a BCP-47 tag (pt-BR, zh-Hans, ar-EG, ur-IN…), or null. */
function matchSupportedLang(code) {
  const raw = String(code || '')
    .trim()
    .toLowerCase()
    .replace(/_/g, '-');
  if (!raw) return null;
  if (LANG_CODE_SET.has(raw)) return raw;
  let base = raw.split('-')[0];
  if (base === 'in') base = 'id'; // legacy Java/Android tag for Indonesian
  return LANG_CODE_SET.has(base) ? base : null;
}

function normalizeLang(code) {
  return matchSupportedLang(code) || 'en';
}

function isRetiredLang(code) {
  return I18N_RETIRED_LANGS.includes(i18nBase(code));
}

function getLangEntry(code) {
  const c = normalizeLang(code);
  return LANG_CATALOG.find((l) => l.code === c) || LANG_CATALOG[0];
}

function getTtsLang(code) {
  return getLangEntry(code != null ? code : typeof currentLang !== 'undefined' ? currentLang : 'en').tts || 'en-US';
}

function getLangDir(code) {
  return getLangEntry(code).dir === 'rtl' ? 'rtl' : 'ltr';
}

/** Supported languages from navigator.languages, best first (deduped). */
function getDeviceLangs() {
  const out = [];
  try {
    const nav = typeof navigator !== 'undefined' ? navigator : {};
    const list = (nav.languages && nav.languages.length ? Array.from(nav.languages) : [nav.language]).filter(Boolean);
    list.forEach((tag) => {
      const c = matchSupportedLang(tag);
      if (c && !out.includes(c)) out.push(c);
    });
  } catch (e) {}
  return out;
}

function i18nKey(key) {
  const k = String(key == null ? '' : key);
  return k.indexOf('.') < 0 && I18N_LEGACY[k] ? I18N_LEGACY[k] : k;
}

/** Merge messages into a language at runtime (flat legacy or namespaced keys). */
function registerI18nLocale(code, messages) {
  if (!messages || typeof messages !== 'object') return;
  const c = normalizeLang(code);
  const into = (I18N_EXTRA[c] = I18N_EXTRA[c] || {});
  Object.keys(messages).forEach((k) => {
    into[i18nKey(k)] = messages[k];
  });
}

// ─── message format ─────────────────────────────────────────────────────────

const I18N_RICH = /<(\/?)(strong|b|em|i)>|<br\s*\/?>/gi;
const i18nPluralCache = {};

function i18nEscape(v) {
  return String(v == null ? '' : v)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function i18nPluralRules(locale, type) {
  const k = locale + '|' + type;
  if (!i18nPluralCache[k]) {
    try {
      i18nPluralCache[k] = new Intl.PluralRules(locale, { type });
    } catch (e) {
      i18nPluralCache[k] = { select: (n) => (n === 1 ? 'one' : 'other') };
    }
  }
  return i18nPluralCache[k];
}

function i18nNumber(n, locale) {
  try {
    return new Intl.NumberFormat(locale).format(n);
  } catch (e) {
    return String(n);
  }
}

/** Index of the brace closing the one at `open` (skips {{…}} interpolations). */
function i18nMatchBrace(s, open) {
  let depth = 0;
  for (let i = open; i < s.length; i++) {
    if (s[i] === '{' && s[i + 1] === '{') {
      const end = s.indexOf('}}', i + 2);
      if (end < 0) return -1;
      i = end + 1;
      continue;
    }
    if (s[i] === '{') depth++;
    else if (s[i] === '}' && --depth === 0) return i;
  }
  return -1;
}

/** Resolve ICU-style {var, plural|selectordinal|select, …} blocks (nested OK). */
function i18nIcu(s, params, locale) {
  let out = '';
  for (let i = 0; i < s.length; i++) {
    if (s[i] === '{' && s[i + 1] === '{') {
      const end = s.indexOf('}}', i + 2);
      if (end < 0) {
        out += s.slice(i);
        break;
      }
      out += s.slice(i, end + 2);
      i = end + 1;
      continue;
    }
    if (s[i] !== '{') {
      out += s[i];
      continue;
    }
    const close = i18nMatchBrace(s, i);
    const m = close > 0 ? /^\{\s*(\w+)\s*,\s*(plural|selectordinal|select)\s*,([\s\S]*)\}$/.exec(s.slice(i, close + 1)) : null;
    if (!m) {
      out += s[i];
      continue;
    }
    const [, name, type, body] = m;
    const cases = {};
    const re = /\s*(=?[\w-]+)\s*\{/g;
    let pos = 0;
    let cm;
    re.lastIndex = 0;
    while ((cm = re.exec(body)) && cm.index === pos) {
      const open = cm.index + cm[0].length - 1;
      const end = i18nMatchBrace(body, open);
      if (end < 0) break;
      cases[cm[1]] = body.slice(open + 1, end);
      pos = end + 1;
      re.lastIndex = pos;
    }
    const raw = params ? params[name] : undefined;
    let chosen;
    if (type === 'select') {
      chosen = cases[String(raw)] != null ? cases[String(raw)] : cases.other;
    } else {
      const n = Number(raw);
      if (cases['=' + n] != null) chosen = cases['=' + n];
      else {
        const cat = Number.isFinite(n) ? i18nPluralRules(locale, type === 'selectordinal' ? 'ordinal' : 'cardinal').select(n) : 'other';
        chosen = cases[cat] != null ? cases[cat] : cases.other;
      }
      if (chosen != null) chosen = chosen.replace(/#/g, Number.isFinite(n) ? i18nNumber(n, locale) : String(raw));
    }
    out += chosen != null ? i18nIcu(chosen, params, locale) : '';
    i = close;
  }
  return out;
}

/**
 * Format one message. mode 'text' → plain string (rich tags stripped); 'html' → escaped HTML with
 * only the rich-tag whitelist and every param escaped.
 */
function i18nFormat(msg, params, locale, mode) {
  const p = params && typeof params === 'object' ? params : {};
  let s = String(msg == null ? '' : msg);
  if (s.indexOf('{') >= 0) s = i18nIcu(s, p, locale || 'en');
  if (mode === 'html') {
    s = i18nEscape(s).replace(/&lt;(\/?)(strong|b|em|i)&gt;/gi, '<$1$2>').replace(/&lt;br\s*\/?&gt;/gi, '<br>');
  } else {
    s = s.replace(I18N_RICH, (m) => (/^<br/i.test(m) ? '\n' : ''));
  }
  s = s.replace(/\{\{@([a-z0-9]+)\}\}/g, (m, id) => (I18N_GLOSSARY[id] != null ? I18N_GLOSSARY[id] : m));
  s = s.replace(/\{\{(\w+)\}\}/g, (m, k) => {
    if (!(k in p)) return m;
    return mode === 'html' ? i18nEscape(p[k]) : String(p[k]);
  });
  return s;
}

const i18nWarned = new Set();
function i18nDevWarn(key) {
  if (i18nWarned.has(key)) return;
  i18nWarned.add(key);
  try {
    const host = typeof location !== 'undefined' ? location.hostname : '';
    const dev = host === 'localhost' || host === '127.0.0.1' || localStorage.getItem('chaupaal_i18n_debug') === '1';
    if (dev) console.warn('[i18n] missing key:', key);
  } catch (e) {}
}

/** { v, code } for a key in the selected language, else English; null when nowhere. */
function i18nLookup(key, lang) {
  const nk = i18nKey(key);
  const order = lang === 'en' ? ['en'] : [lang, 'en'];
  for (const code of order) {
    const pack = I18N_PACKS[code];
    let v = pack ? pack[nk] : undefined;
    if (v == null || v === '') {
      const extra = I18N_EXTRA[code];
      v = extra ? extra[nk] : undefined;
    }
    if (v != null && v !== '') return { v, code };
  }
  return null;
}

function i18nRender(key, vars, fallback, mode) {
  const lang = normalizeLang(typeof currentLang !== 'undefined' ? currentLang : 'en');
  const hit = i18nLookup(key, lang);
  if (hit) return i18nFormat(hit.v, vars, getLangEntry(hit.code).html, mode);
  if (fallback) return i18nFormat(fallback, vars, 'en', mode);
  i18nDevWarn(String(key));
  return mode === 'html' ? i18nEscape(key) : String(key);
}

/** Resolve UI string: selected lang → English → optional string fallback → key. Plain text. */
function t(key, vars = {}) {
  if (typeof vars === 'string') return i18nRender(key, {}, vars, 'text');
  return i18nRender(key, vars, '', 'text');
}

/** Same lookup as t(), returned as safe HTML (message + params escaped; <strong>/<b>/<em>/<i>/<br> kept). */
function tHtml(key, vars, fallback) {
  if (typeof vars === 'string') return i18nRender(key, {}, vars, 'html');
  return i18nRender(key, vars || {}, fallback || '', 'html');
}

/** Plural helper: tn('baithak.unread', 3) → `{count}` and `{{n}}` both bound to 3. */
function tn(key, count, vars) {
  const v = Object.assign({}, vars || {}, { count });
  if (v.n == null) v.n = count;
  return t(key, v);
}

// ─── packs: lazy load + cache ───────────────────────────────────────────────

function i18nPackVersion(code) {
  return I18N_PACK_VERSIONS[code] || '0';
}

function readCachedPack(code) {
  try {
    const o = JSON.parse(localStorage.getItem(I18N_PACK_LS) || 'null');
    if (o && o.code === code && o.v === i18nPackVersion(code) && o.data && typeof o.data === 'object') return o.data;
  } catch (e) {}
  return null;
}

function writeCachedPack(code, data) {
  try {
    localStorage.setItem(I18N_PACK_LS, JSON.stringify({ code, v: i18nPackVersion(code), data }));
  } catch (e) {}
}

/** Make a pack usable without waiting when we already hold it (memory or localStorage). */
function ensurePackSync(code) {
  if (I18N_PACKS[code]) return true;
  const cached = readCachedPack(code);
  if (cached) {
    I18N_PACKS[code] = cached;
    return true;
  }
  return false;
}

const i18nPackLoads = {};
/** Fetch a language pack once (sw.js keeps it for offline). Resolves to the pack, or null. */
function loadLangPack(code) {
  const c = normalizeLang(code);
  if (ensurePackSync(c)) return Promise.resolve(I18N_PACKS[c]);
  if (i18nPackLoads[c]) return i18nPackLoads[c];
  if (typeof fetch !== 'function') return Promise.resolve(null);
  i18nPackLoads[c] = fetch(`/src/i18n/${c}.json?v=${i18nPackVersion(c)}`, { credentials: 'same-origin' })
    .then((res) => {
      if (!res.ok) throw new Error('HTTP ' + res.status);
      return res.json();
    })
    .then((data) => {
      I18N_PACKS[c] = data && typeof data === 'object' ? data : {};
      if (normalizeLang(typeof currentLang !== 'undefined' ? currentLang : 'en') === c) writeCachedPack(c, I18N_PACKS[c]);
      return I18N_PACKS[c];
    })
    .catch((e) => {
      delete i18nPackLoads[c];
      console.warn('[i18n] could not load', c, e && e.message);
      return null;
    });
  return i18nPackLoads[c];
}

// ─── apply / persist ────────────────────────────────────────────────────────

function applyDocumentLang(code) {
  try {
    const e = getLangEntry(code);
    document.documentElement.lang = e.html || e.code;
    document.documentElement.dir = e.dir === 'rtl' ? 'rtl' : 'ltr';
  } catch (err) {}
}

function i18nProfileWrite(fields) {
  try {
    if (typeof db !== 'undefined' && db && typeof currentUser !== 'undefined' && currentUser) {
      return db.collection('users').doc(currentUser.uid).set(fields, { merge: true }).catch(() => {});
    }
  } catch (e) {}
  return null;
}

function populateLangSelect() {
  const cur = normalizeLang(typeof currentLang !== 'undefined' ? currentLang : 'en');
  ['langSelect', 'regLanguage'].forEach((id) => {
    const sel = typeof document !== 'undefined' ? document.getElementById(id) : null;
    if (!sel) return;
    sel.innerHTML = LANG_CATALOG.map((l) => {
      const label = l.native === l.name ? l.native : `${l.native} (${l.name})`;
      return `<option value="${l.code}">${label}</option>`;
    }).join('');
    sel.value = cur;
  });
  try {
    if (typeof ChaupaalLangPicker !== 'undefined' && ChaupaalLangPicker.refreshSettings) ChaupaalLangPicker.refreshSettings();
  } catch (e) {}
}

function i18nEmit(name, detail) {
  try {
    document.dispatchEvent(new CustomEvent(name, { detail }));
  } catch (e) {}
}

/**
 * Persist + apply the UI language. Unsupported → English; a retired choice also queues the
 * one-time "isn't available yet" notice. Returns a promise that settles once the pack is applied.
 */
function setAppLanguage(lang, { persistRemote = false, source = 'user' } = {}) {
  const requested = String(lang || '');
  const next = normalizeLang(requested);
  if (isRetiredLang(requested) && !matchSupportedLang(requested)) {
    try {
      if (!localStorage.getItem(I18N_RETIRED_NOTICE_LS + '_seen')) localStorage.setItem(I18N_RETIRED_NOTICE_LS, i18nBase(requested));
    } catch (e) {}
  }
  currentLang = next;
  try {
    localStorage.setItem('chaupaal_lang', next);
    localStorage.setItem('chaupaal_lang_source', source);
  } catch (e) {}
  applyDocumentLang(next);
  ensurePackSync(next);
  populateLangSelect();
  if (persistRemote) i18nProfileWrite({ lang: next });
  if (typeof applyChromeI18n === 'function') applyChromeI18n();
  if (typeof populateVoiceDropdown === 'function') {
    try {
      populateVoiceDropdown();
    } catch (e) {}
  }
  return loadLangPack(next).then(() => {
    if (normalizeLang(currentLang) !== next) return next;
    if (typeof applyChromeI18n === 'function') applyChromeI18n();
    i18nEmit('chaupaal:lang-changed', { lang: next });
    return next;
  });
}

/** Saved choice wins; first run picks the best supported device language. */
function bootLanguagePreference() {
  let stored = null;
  let source = 'user';
  try {
    stored = localStorage.getItem('chaupaal_lang');
    source = localStorage.getItem('chaupaal_lang_source') || 'user';
  } catch (e) {}
  if (stored) return setAppLanguage(stored, { persistRemote: false, source });
  return setAppLanguage(getDeviceLangs()[0] || 'en', { persistRemote: false, source: 'device' });
}

/** Pending "your language isn't available yet" notice (retired language code) — shown once. */
function takeRetiredLangNotice() {
  try {
    const code = localStorage.getItem(I18N_RETIRED_NOTICE_LS);
    if (!code) return null;
    localStorage.removeItem(I18N_RETIRED_NOTICE_LS);
    localStorage.setItem(I18N_RETIRED_NOTICE_LS + '_seen', code);
    return code;
  } catch (e) {
    return null;
  }
}

// ─── languages I read (content languages) ───────────────────────────────────

function getContentLangs() {
  try {
    const list = JSON.parse(localStorage.getItem('chaupaal_content_langs') || 'null');
    if (Array.isArray(list)) {
      const clean = [...new Set(list.map(matchSupportedLang).filter(Boolean))];
      if (clean.length) return clean;
    }
  } catch (e) {}
  const ui = normalizeLang(typeof currentLang !== 'undefined' ? currentLang : 'en');
  return ui === 'en' ? ['en'] : [ui, 'en'];
}

/** Languages the user reads — feeds (Akhbaar/Duniya ranking) and the Translate target use these. */
function setContentLangs(list, { persistRemote = false } = {}) {
  const clean = [...new Set((list || []).map(matchSupportedLang).filter(Boolean))];
  const next = clean.length ? clean : [normalizeLang(currentLang)];
  try {
    localStorage.setItem('chaupaal_content_langs', JSON.stringify(next));
  } catch (e) {}
  if (persistRemote) i18nProfileWrite({ contentLangs: next });
  i18nEmit('chaupaal:content-langs-changed', { langs: next });
  return next;
}

/**
 * Sign-in: the profile's language / reading languages / region win; when the profile has none yet,
 * this device's choices are written up so every device converges.
 */
function hydrateLocaleFromProfile(profile) {
  const p = profile || {};
  const writes = {};
  if (p.lang) setAppLanguage(p.lang, { persistRemote: false, source: 'profile' });
  else writes.lang = normalizeLang(currentLang);
  if (Array.isArray(p.contentLangs) && p.contentLangs.length) setContentLangs(p.contentLangs);
  else {
    let explicit = null;
    try {
      explicit = localStorage.getItem('chaupaal_content_langs');
    } catch (e) {}
    if (explicit) writes.contentLangs = getContentLangs();
  }
  try {
    if (typeof ChaupaalRegion !== 'undefined' && ChaupaalRegion.hydrateFromProfile) {
      Object.assign(writes, ChaupaalRegion.hydrateFromProfile(p) || {});
    }
  } catch (e) {}
  if (Object.keys(writes).length) i18nProfileWrite(writes);
  return writes;
}

/**
 * Apply chrome strings marked in HTML:
 *   data-i18n="key"              → textContent
 *   data-i18n-placeholder="key"  → placeholder
 *   data-i18n-aria="key"         → aria-label
 *   data-i18n-title="key"        → title
 */
function applyChromeI18n(){
  // A key missing from every pack resolves to itself — keep the HTML's own English copy instead.
  const resolved=(key,vars,original)=>{
    const v=t(key,vars||{});
    return v&&v!==key?v:original;
  };
  const applyAttr=(sel,dataAttr,attr)=>{
    document.querySelectorAll(sel).forEach(el=>{
      const key=el.getAttribute(dataAttr);
      if(!key) return;
      const stash='i18nDefault'+attr.replace(/-/g,'');
      if(el.dataset[stash]==null) el.dataset[stash]=el.getAttribute(attr)||'';
      const v=resolved(key,null,el.dataset[stash]);
      if(v) el.setAttribute(attr,v);
    });
  };
  document.querySelectorAll('[data-i18n]').forEach(el=>{
    const key=el.getAttribute('data-i18n');
    if(!key) return;
    if(el.dataset.i18nDefault==null) el.dataset.i18nDefault=el.textContent;
    const vars={};
    if(el.hasAttribute('data-i18n-n')) vars.n=el.getAttribute('data-i18n-n');
    el.textContent=resolved(key,vars,el.dataset.i18nDefault);
  });
  applyAttr('[data-i18n-placeholder]','data-i18n-placeholder','placeholder');
  applyAttr('[data-i18n-aria]','data-i18n-aria','aria-label');
  applyAttr('[data-i18n-title]','data-i18n-title','title');
}

if (typeof window !== 'undefined') {
  Object.assign(window, {
    LANG_CATALOG,
    I18N_RETIRED_LANGS,
    I18N_GLOSSARY,
    normalizeLang,
    matchSupportedLang,
    isRetiredLang,
    getLangEntry,
    getTtsLang,
    getLangDir,
    getDeviceLangs,
    registerI18nLocale,
    populateLangSelect,
    setAppLanguage,
    loadLangPack,
    takeRetiredLangNotice,
    getContentLangs,
    setContentLangs,
    hydrateLocaleFromProfile,
    tHtml,
    tn,
  });
}

// Boot chrome as soon as this script loads (DOM already parsed — scripts are at end of body).
try{bootLanguagePreference();}catch(e){}

// Translate question text + options via Claude API (cached per session)
const translationCache = {}; // also backed by localStorage via readCache/writeCache
async function translateContent(text, targetLang){
  if(!text||targetLang==='en') return text;
  const cacheKey = `${targetLang}:${text.slice(0,50)}`;
  if(translationCache[cacheKey]) return translationCache[cacheKey];
  const lsCached = readCache('translate', cacheKey);
  if(lsCached){ translationCache[cacheKey]=lsCached; return lsCached; }
  if(typeof isAiFeaturesEnabled==='function' && !(await isAiFeaturesEnabled())) return text;
  try{
    const data = await callAI({
        tier:'fast', max_tokens:500, feature:'i18n_translate',
        system:`Translate the following text to ${targetLang}. Return ONLY the translated text, nothing else.`,
        messages:[{role:"user",content:text}]
      });
    const result = data.text||data.content?.map(b=>b.text||'').join('')||text;
    translationCache[cacheKey] = result;
    writeCache('translate', cacheKey, result);
    return result;
  }catch(e){ return text; }
}

const CATEGORY_SUGGESTIONS = [
  {emoji:'🏏',name:'Cricket'},{emoji:'🎬',name:'Bollywood'},{emoji:'🍳',name:'Food & Recipes'},
  {emoji:'🚗',name:'Automobiles'},{emoji:'📱',name:'Gadgets'},{emoji:'💰',name:'Personal Finance'},
  {emoji:'🎮',name:'Gaming'},{emoji:'✈️',name:'Travel'},{emoji:'🌿',name:'Environment'},
  {emoji:'🎵',name:'Music'},{emoji:'⚽',name:'Football'},{emoji:'🏋️',name:'Fitness'},
  {emoji:'👗',name:'Fashion'},{emoji:'🔬',name:'Science'},{emoji:'🎭',name:'Entertainment'},
  {emoji:'📚',name:'Education'},{emoji:'🏠',name:'Real Estate'},{emoji:'🌾',name:'Agriculture'},
  {emoji:'⚖️',name:'Law & Justice'},{emoji:'🎨',name:'Art & Culture'},
];

let myCategories = JSON.parse(localStorage.getItem('chaupaal_categories')||'[]');

function saveCategoriesLocal(){
  try{localStorage.setItem('chaupaal_categories',JSON.stringify(myCategories));}catch(e){}
}

function getCategoryColor(name){
  const colors=['#E63946','#2A9D8F','#E9C46A','#F4A261','#264653','#8134AF','#2E8B57','#C72E3A','#0077B6','#7B2D8B'];
  let hash=0;for(let i=0;i<name.length;i++)hash=name.charCodeAt(i)+((hash<<5)-hash);
  return colors[Math.abs(hash)%colors.length];
}

function getCategoryEmoji(name){
  const match = CATEGORY_SUGGESTIONS.find(s=>s.name.toLowerCase()===name.toLowerCase());
  if(match) return match.emoji;
  // derive from first char category
  const map={c:'🎯',b:'💼',f:'🍽️',g:'🎮',h:'🏠',i:'💡',j:'⚖️',l:'📚',m:'🎵',n:'📰',p:'💰',r:'🚀',s:'⚡',t:'💻',w:'🌍',a:'🎨',e:'🌿',v:'🎬',k:'🏏',z:'🔭'};
  return map[name[0].toLowerCase()]||'✨';
}

function initCategoriesTab(){
  const input = document.getElementById('catSearchInput');
  const suggestions = document.getElementById('catSuggestions');
  if(!input) return;

  input.addEventListener('input', ()=>{
    const q = input.value.trim().toLowerCase();
    if(!q){ suggestions.classList.remove('show'); return; }
    const filtered = CATEGORY_SUGGESTIONS.filter(s=>s.name.toLowerCase().includes(q));
    const custom = {emoji:getCategoryEmoji(input.value),name:input.value.trim()};
    const items = [...filtered.slice(0,5)];
    if(!filtered.find(f=>f.name.toLowerCase()===q)) items.push({...custom,custom:true});
    suggestions.innerHTML = items.map(s=>`
      <div class="cat-suggestion-item" data-name="${s.name}" data-emoji="${s.emoji}">
        <span class="cat-suggestion-emoji">${s.emoji}</span>
        <span>${s.name}${s.custom?' <span style="font-size:11px;color:var(--muted);">— Custom</span>':''}</span>
      </div>
    `).join('');
    suggestions.classList.add('show');
    suggestions.querySelectorAll('.cat-suggestion-item').forEach(item=>{
      item.addEventListener('click',()=>{
        addCategory(item.dataset.name, item.dataset.emoji);
        input.value='';suggestions.classList.remove('show');
      });
    });
  });

  input.addEventListener('keypress', e=>{
    if(e.key==='Enter'&&input.value.trim()){
      addCategory(input.value.trim(), getCategoryEmoji(input.value.trim()));
      input.value='';suggestions.classList.remove('show');
    }
  });

  document.addEventListener('click',e=>{if(!e.target.closest('.cat-search-wrap'))suggestions.classList.remove('show');});
  renderMyCatsList();
}

function addCategory(name, emoji){
  if(myCategories.find(c=>c.name.toLowerCase()===name.toLowerCase())){
    showToast(t('cat_exists',{name}));return;
  }
  const cat={id:`cat_${Date.now()}`,name,emoji,color:getCategoryColor(name),addedAt:new Date().toISOString()};
  myCategories.unshift(cat);saveCategoriesLocal();
  if(db&&currentUser){db.collection('users').doc(currentUser.uid).update({customCategories:firebase.firestore.FieldValue.arrayUnion(cat)}).catch(()=>{});}
  renderMyCatsList();
  showToast(t('cat_added',{name}));
}

function removeCategory(id){
  myCategories=myCategories.filter(c=>c.id!==id);saveCategoriesLocal();renderMyCatsList();
}

function renderMyCatsList(){
  const list=document.getElementById('myCatsList');if(!list)return;
  if(!myCategories.length){list.innerHTML=`<div class="cat-empty">${t('cat_empty')}</div>`;return;}
  list.innerHTML='';
  myCategories.forEach(cat=>{
    const card=document.createElement('div');card.className='cat-card';
    card.innerHTML=`
      <div class="cat-card-header">
        <div class="cat-card-icon" style="background:${cat.color}22;">${cat.emoji}</div>
        <div>
          <div class="cat-card-name">${cat.name}</div>
          <div class="cat-card-meta">AI content • Just added</div>
        </div>
        <button class="cat-card-remove" data-id="${cat.id}">🗑️</button>
      </div>
      <div class="cat-preview-strip">
        <div class="cat-preview-item"><span class="pi-num">10</span>Sawaal</div>
        <div class="cat-preview-item"><span class="pi-num">📰</span>Khabar</div>
        <div class="cat-preview-item"><span class="pi-num">✨</span>AI Pick</div>
      </div>
    `;
    card.querySelector('.cat-card-remove').addEventListener('click',e=>{e.stopPropagation();removeCategory(cat.id);});
    card.addEventListener('click',e=>{if(!e.target.closest('.cat-card-remove'))openCategoryDetail(cat);});
    list.appendChild(card);
  });
}
