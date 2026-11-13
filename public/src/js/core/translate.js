/**
 * Translate for user content (Global L7) — client.
 *
 * Renderers wrap user text with ugcHtml(surface, html, { scope, v, place }) → <span class="ugc-text" …>.
 * This module finds those spans, detects the language on device (LangDetect, no network) and adds a
 * small inline "Translate" link only when: the server flag says Translate is on (AI on + credentials),
 * the text isn't trivial (short / emoji / numbers / links), detection is confident, and the language
 * isn't one of the viewer's "Languages I read". The translation replaces the text in place with
 * "Translated from X · Show original"; dir="auto" + lang keep RTL / LTR right.
 *
 * Privacy: scope 'private' (chats, private posts / profiles, room text) asks once for consent
 * (the text goes to the translation provider and isn't stored by Chaupaal), is never cached on the
 * server, and is cached on this device only (IndexedDB, bounded, cleared on logout). Public text can
 * also hit the shared server cache. Auto-translate: per chat (opt-in) and "public posts" (opt-in),
 * only for messages that scroll into view, batched.
 */
(function (root) {
  'use strict';

  const CONSENT_KEY = 'chaupaal_translate_consent_v1';
  const AUTO_PUBLIC_KEY = 'chaupaal_translate_auto_public';
  const AUTO_CHATS_KEY = 'chaupaal_translate_auto_chats';
  const FLAG_TTL_MS = 10 * 60 * 1000;
  const MIN_CONFIDENCE = 0.6;
  const DEVICE_MAX = 400;
  const BATCH_MS = 250;

  const D = () => root.LangDetect || null;
  const tx = (key, vars) => (typeof root.t === 'function' ? root.t(key, vars || {}) : key);
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const store = () => {
    try {
      return root.localStorage || null;
    } catch (e) {
      return null;
    }
  };
  /** currentUser is a top-level `let` (config/firebase.js), so it is read by name, not off window. */
  const uid = () => {
    try {
      return (typeof currentUser !== 'undefined' && currentUser && currentUser.uid) || '';
    } catch (e) {
      return '';
    }
  };
  const norm = (c) => (typeof root.normalizeLang === 'function' ? root.normalizeLang(c) : String(c || 'en').split('-')[0]);

  // ─── flag ────────────────────────────────────────────────────────────────
  let flag = { enabled: false, at: 0, maxChars: 1500, maxItems: 8 };
  let flagLoading = null;
  function enabled() {
    return !!flag.enabled && !!uid();
  }
  async function loadFlags(force) {
    if (!uid() || typeof root.apiFetch !== 'function') return (flag = { enabled: false, at: Date.now() });
    if (!force && flag.at && Date.now() - flag.at < FLAG_TTL_MS) return flag;
    if (flagLoading) return flagLoading;
    flagLoading = root
      .apiFetch('/api/media-config', { method: 'POST', needAuth: true, body: { action: 'translate_config' } })
      .then((r) => (flag = Object.assign({ at: Date.now() }, r && r.ok && r.data ? r.data : { enabled: false })))
      .catch(() => (flag = { enabled: false, at: Date.now() }))
      .finally(() => {
        flagLoading = null;
        onFlag();
      });
    return flagLoading;
  }

  // ─── who reads what ──────────────────────────────────────────────────────
  function readLangs() {
    const list = typeof root.getContentLangs === 'function' ? root.getContentLangs() : [norm(root.currentLang)];
    return list.map(norm);
  }
  /** Target = the UI language when the viewer reads it, else their first reading language. */
  function targetLang() {
    const ui = norm(typeof root.currentLang !== 'undefined' ? root.currentLang : 'en');
    const read = readLangs();
    return read.indexOf(ui) >= 0 ? ui : read[0] || ui;
  }

  /** { offer, lang, confidence } — should this text get a Translate link? */
  function offerFor(text, opts) {
    const o = opts || {};
    const det = D();
    if (!(o.enabled != null ? o.enabled : enabled()) || !det) return { offer: false, reason: 'off' };
    if (det.trivial(text)) return { offer: false, reason: 'trivial' };
    const r = det.detect(text);
    if (r.lang === 'und' || r.confidence < MIN_CONFIDENCE) return { offer: false, reason: 'unsure', lang: r.lang, confidence: r.confidence };
    const read = (o.readLangs || readLangs()).map(norm);
    if (read.indexOf(r.lang) >= 0) return { offer: false, reason: 'reads', lang: r.lang, confidence: r.confidence };
    return { offer: true, lang: r.lang, confidence: r.confidence, romanized: r.romanized };
  }

  function langName(code) {
    const ui = norm(root.currentLang);
    try {
      if (typeof Intl !== 'undefined' && Intl.DisplayNames) {
        const n = new Intl.DisplayNames([ui], { type: 'language' }).of(code);
        if (n && n !== code) return n;
      }
    } catch (e) {}
    const cat = typeof root.LANG_CATALOG !== 'undefined' ? root.LANG_CATALOG : [];
    const e = cat.find((l) => l.code === code);
    return (e && e.name) || code;
  }

  // ─── consent (private content) ───────────────────────────────────────────
  function consentKey() {
    return CONSENT_KEY + ':' + uid();
  }
  function hasConsent() {
    const s = store();
    return !!(s && s.getItem(consentKey()) === '1');
  }
  async function askConsent() {
    if (hasConsent()) return true;
    if (typeof root.confirmSheet !== 'function') return false;
    const ok = await root.confirmSheet({
      title: tx('translate.consent_title'),
      message: esc(tx('translate.consent_body')),
      confirmLabel: tx('translate.consent_ok'),
      cancelLabel: tx('common.not_now'),
    });
    if (ok) {
      const s = store();
      if (s) s.setItem(consentKey(), '1');
    }
    return !!ok;
  }

  // ─── on-device cache (IndexedDB; memory when unavailable) ────────────────
  const memory = new Map();
  let dbp = null;
  function hash(s) {
    let h1 = 0x811c9dc5;
    let h2 = 0x01000193;
    for (let i = 0; i < s.length; i++) {
      const c = s.charCodeAt(i);
      h1 = Math.imul(h1 ^ c, 16777619) >>> 0;
      h2 = Math.imul(h2 ^ c, 2246822507) >>> 0;
    }
    return h1.toString(36) + h2.toString(36) + s.length.toString(36);
  }
  function deviceKey(text, target) {
    return uid() + '|' + target + '|' + hash(String(text));
  }
  function db() {
    if (dbp) return dbp;
    dbp = new Promise((resolve) => {
      if (typeof root.indexedDB === 'undefined') return resolve(null);
      try {
        const req = root.indexedDB.open('chaupaal_translate_v1', 1);
        req.onupgradeneeded = () => {
          const d = req.result;
          if (!d.objectStoreNames.contains('tr')) d.createObjectStore('tr', { keyPath: 'k' }).createIndex('at', 'at');
        };
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => resolve(null);
      } catch (e) {
        resolve(null);
      }
    });
    return dbp;
  }
  function idb(mode, fn) {
    return db().then(
      (d) =>
        new Promise((resolve) => {
          if (!d) return resolve(undefined);
          try {
            const tr = d.transaction('tr', mode);
            const out = fn(tr.objectStore('tr'));
            tr.oncomplete = () => resolve(out && 'result' in out ? out.result : undefined);
            tr.onerror = () => resolve(undefined);
          } catch (e) {
            resolve(undefined);
          }
        })
    );
  }
  async function deviceGet(text, target) {
    const k = deviceKey(text, target);
    if (memory.has(k)) return memory.get(k);
    const row = await idb('readonly', (s) => s.get(k));
    if (row) memory.set(k, row);
    return row || null;
  }
  async function devicePut(text, target, row) {
    const k = deviceKey(text, target);
    const rec = Object.assign({ k, at: Date.now() }, row);
    memory.set(k, rec);
    if (memory.size > DEVICE_MAX) memory.delete(memory.keys().next().value);
    await idb('readwrite', (s) => s.put(rec));
    const n = await idb('readonly', (s) => s.count());
    if (n > DEVICE_MAX) {
      await idb('readwrite', (s) => {
        let left = n - DEVICE_MAX;
        const cur = s.index('at').openCursor();
        cur.onsuccess = () => {
          const c = cur.result;
          if (c && left-- > 0) {
            c.delete();
            c.continue();
          }
        };
        return cur;
      });
    }
  }
  /** Logout: translations never outlive the session on this device. */
  async function clearAll() {
    memory.clear();
    flag = { enabled: false, at: 0 };
    const d = await db();
    if (d) {
      try {
        d.close();
      } catch (e) {}
    }
    dbp = null;
    try {
      if (typeof root.indexedDB !== 'undefined') root.indexedDB.deleteDatabase('chaupaal_translate_v1');
    } catch (e) {}
  }

  // ─── requests (batched) ──────────────────────────────────────────────────
  let limitDay = '';
  const today = () => new Date().toISOString().slice(0, 10);
  const limited = () => limitDay === today();
  let queue = [];
  let timer = null;

  /** item: { text, surface, scope, v, src } → Promise<{ ok, text, src, error }> */
  function request(item) {
    return new Promise((resolve) => {
      queue.push({ item, resolve });
      if (queue.length >= (flag.maxItems || 8)) flush();
      else if (!timer) timer = setTimeout(flush, BATCH_MS);
    });
  }
  async function flush() {
    clearTimeout(timer);
    timer = null;
    const batch = queue.splice(0, flag.maxItems || 8);
    if (!batch.length) return;
    if (queue.length) timer = setTimeout(flush, BATCH_MS);
    const target = targetLang();
    let res = null;
    try {
      res = await root.apiFetch('/api/media-config', {
        method: 'POST',
        needAuth: true,
        body: { action: 'translate', target, items: batch.map((b) => b.item) },
      });
    } catch (e) {
      res = null;
    }
    const items = res && res.ok && res.data && Array.isArray(res.data.items) ? res.data.items : null;
    batch.forEach((b, i) => {
      const r = items && items[i] ? items[i] : { ok: false, error: res && res.error && res.error.code === 'TRANSLATE_OFF' ? 'off' : 'failed' };
      if (r.error === 'limit') limitDay = today();
      b.resolve(Object.assign({ target }, r));
    });
  }

  /** Device cache → consent gate (private) → server. Returns { ok, text, src, target, error }. */
  async function translateText(text, meta) {
    const m = meta || {};
    const target = targetLang();
    const hit = await deviceGet(text, target);
    if (hit) return { ok: true, text: hit.t, src: hit.s, target, cached: true };
    if (m.scope !== 'public' && !(await (m.consent || askConsent)())) return { ok: false, error: 'consent' };
    if (limited()) return { ok: false, error: 'limit' };
    const r = await (m.send || request)({ text: String(text).slice(0, (flag.maxChars || 1500) * (flag.maxChunks || 4)), surface: m.surface || 'other', scope: m.scope === 'public' ? 'public' : 'private', v: m.v || '', src: m.src || 'und' });
    if (r.error === 'limit') limitDay = today();
    if (r.ok) await devicePut(text, target, { t: r.text, s: r.src || m.src || 'und' });
    return Object.assign({ target }, r);
  }

  // ─── DOM ─────────────────────────────────────────────────────────────────
  /** Marker for user text. html must already be escaped / decorated by the caller. */
  function ugcHtml(surface, html, meta) {
    if (html == null || html === '') return '';
    const m = meta || {};
    const scope = m.scope === 'public' ? 'public' : 'private';
    return `<span class="ugc-text" data-ugc="${esc(surface)}" data-ugc-scope="${scope}"${m.v ? ` data-ugc-v="${esc(m.v)}"` : ''}${m.place === 'inside' ? ' data-ugc-place="inside"' : ''} dir="auto">${html}</span>`;
  }

  const originals = new WeakMap();
  /** Linkified, escaped translated text (no user HTML ever). */
  function decorate(text) {
    if (typeof root.linkifyText === 'function') return root.linkifyText(String(text));
    return esc(text).replace(/\n/g, '<br>');
  }

  function barFor(el) {
    const place = el.getAttribute('data-ugc-place');
    if (place === 'inside') return el.querySelector('.ugc-tr-bar');
    const n = el.nextElementSibling;
    return n && n.classList && n.classList.contains('ugc-tr-bar') ? n : null;
  }
  function setBar(el, html) {
    let bar = barFor(el);
    if (!bar) {
      bar = (el.ownerDocument || root.document).createElement('span');
      bar.className = 'ugc-tr-bar';
      if (el.getAttribute('data-ugc-place') === 'inside') el.appendChild(bar);
      else el.insertAdjacentElement('afterend', bar);
    }
    bar.innerHTML = html;
    return bar;
  }
  function linkHtml(label, act) {
    return `<button type="button" class="ugc-tr" data-tr-act="${act}">${esc(label)}</button>`;
  }

  /** Show the translation in place (keeps the original for "Show original"). */
  function showTranslated(el, r) {
    if (!originals.has(el)) originals.set(el, el.innerHTML.replace(/<span class="ugc-tr-bar"[\s\S]*$/, ''));
    el.innerHTML = decorate(r.text);
    el.setAttribute('lang', r.target);
    el.setAttribute('dir', 'auto');
    el.setAttribute('data-tr', 'shown');
    el.__tr = r;
    setBar(el, `<span class="ugc-tr-note">${esc(tx('translate.translated_from', { lang: langName(r.src && r.src !== 'und' ? r.src : el.getAttribute('data-tr-lang') || 'und') }))}</span> · ${linkHtml(tx('translate.show_original'), 'orig')}`);
  }
  function showOriginal(el) {
    if (originals.has(el)) el.innerHTML = originals.get(el);
    el.removeAttribute('lang');
    el.setAttribute('data-tr', 'orig');
    setBar(el, linkHtml(tx('translate.show_translation'), 'again'));
  }

  /** The user's text only (an inside-placed link bar is not part of it). */
  function ownText(el) {
    const bar = el.getAttribute('data-ugc-place') === 'inside' ? el.querySelector('.ugc-tr-bar') : null;
    const all = el.textContent || '';
    return bar ? all.slice(0, Math.max(0, all.length - (bar.textContent || '').length)) : all;
  }

  async function run(el, auto) {
    const text = (originals.get(el) != null ? textOfHtml(originals.get(el)) : ownText(el)) || '';
    if (el.__tr) return showTranslated(el, el.__tr);
    const bar = setBar(el, `<span class="ugc-tr-note" aria-live="polite">${esc(tx('translate.translating'))}</span>`);
    const r = await translateText(text, {
      surface: el.getAttribute('data-ugc') || 'other',
      scope: el.getAttribute('data-ugc-scope'),
      v: el.getAttribute('data-ugc-v') || '',
      src: el.getAttribute('data-tr-lang') || 'und',
      consent: auto ? async () => hasConsent() : undefined,
    });
    if (r.ok) return showTranslated(el, r);
    if (r.error === 'consent' || r.error === 'off') return setBar(el, linkHtml(tx('translate.action'), 'go'));
    const msg = r.error === 'limit' ? tx('translate.limit') : tx('translate.failed');
    bar.innerHTML = `<span class="ugc-tr-note" role="status">${esc(msg)}</span>`;
    if (r.error !== 'limit') setTimeout(() => el.getAttribute('data-tr') !== 'shown' && setBar(el, linkHtml(tx('translate.action'), 'go')), 4000);
  }

  function textOfHtml(html) {
    const d = root.document.createElement('div');
    d.innerHTML = html;
    return d.textContent || '';
  }

  // ─── auto-translate ──────────────────────────────────────────────────────
  function readJson(k, d) {
    try {
      const v = JSON.parse((store() && store().getItem(k)) || 'null');
      return v == null ? d : v;
    } catch (e) {
      return d;
    }
  }
  function autoPublic() {
    return !!(store() && store().getItem(AUTO_PUBLIC_KEY) === '1');
  }
  function setAutoPublic(on) {
    const s = store();
    if (s) s.setItem(AUTO_PUBLIC_KEY, on ? '1' : '0');
    if (on) scan(true);
  }
  function openChatId() {
    const c = root.currentOpenChat;
    return c ? String(c.firestoreId || c.id || '') : '';
  }
  function isChatAuto(chatId) {
    const id = String(chatId || '');
    return !!(id && readJson(AUTO_CHATS_KEY + ':' + uid(), []).indexOf(id) >= 0);
  }
  /** Turning it on asks for the private-content consent first. */
  async function setChatAuto(chatId, on) {
    const id = String(chatId || '');
    if (!id) return false;
    if (on && !(await askConsent())) return false;
    const key = AUTO_CHATS_KEY + ':' + uid();
    const list = readJson(key, []).filter((x) => x !== id);
    if (on) list.push(id);
    const s = store();
    if (s) s.setItem(key, JSON.stringify(list.slice(-200)));
    if (on) scan(true);
    return true;
  }
  function wantsAuto(el) {
    const surface = el.getAttribute('data-ugc') || '';
    if (/^baithak/.test(surface)) return isChatAuto(openChatId()) && hasConsent();
    return el.getAttribute('data-ugc-scope') === 'public' && autoPublic();
  }

  /** Only messages that scroll into view are translated (lazily, batched by request()). */
  let io = null;
  function observeVisible(el) {
    if (typeof root.IntersectionObserver !== 'function') return;
    if (!io) {
      io = new root.IntersectionObserver(
        (entries) => {
          visibleOnly(entries).forEach((t) => {
            io.unobserve(t);
            if (t.getAttribute('data-tr') === 'offer' && !limited()) run(t, true);
          });
        },
        { rootMargin: '120px 0px' }
      );
    }
    io.observe(el);
  }
  function visibleOnly(entries) {
    return (entries || []).filter((e) => e.isIntersecting).map((e) => e.target);
  }

  // ─── scanner ─────────────────────────────────────────────────────────────
  function consider(el, force) {
    if (!force && el.hasAttribute('data-tr')) return;
    if (el.getAttribute('data-tr') === 'shown') return;
    const text = ownText(el);
    const o = offerFor(text);
    if (!o.offer) {
      el.setAttribute('data-tr', 'no');
      const bar = barFor(el);
      if (bar) bar.remove();
      return;
    }
    el.setAttribute('data-tr', 'offer');
    el.setAttribute('data-tr-lang', o.lang);
    if (!barFor(el)) setBar(el, linkHtml(tx('translate.action'), 'go'));
    if (wantsAuto(el)) observeVisible(el);
  }
  function scan(force) {
    if (!root.document || !enabled()) return;
    root.document.querySelectorAll(force ? '.ugc-text:not([data-tr="shown"])' : '.ugc-text:not([data-tr])').forEach((el) => consider(el, force));
  }
  let pending = null;
  function schedule() {
    if (pending) return;
    pending = setTimeout(() => {
      pending = null;
      scan(false);
    }, 120);
  }
  function onFlag() {
    const row = root.document && root.document.getElementById('autoTranslateRow');
    if (row) row.hidden = !enabled();
    const box = root.document && root.document.getElementById('toggleAutoTranslate');
    if (box) box.checked = autoPublic();
    if (enabled()) scan(true);
  }

  function boot() {
    const doc = root.document;
    if (!doc || !doc.body) return;
    doc.addEventListener('click', (e) => {
      const b = e.target && e.target.closest && e.target.closest('.ugc-tr');
      if (!b) return;
      e.preventDefault();
      e.stopPropagation();
      const bar = b.closest('.ugc-tr-bar');
      const el = bar && (bar.parentElement && bar.parentElement.classList.contains('ugc-text') ? bar.parentElement : bar.previousElementSibling);
      if (!el || !el.classList.contains('ugc-text')) return;
      const act = b.getAttribute('data-tr-act');
      if (act === 'orig') showOriginal(el);
      else run(el, false);
    });
    if (typeof root.MutationObserver === 'function') new root.MutationObserver(schedule).observe(doc.body, { childList: true, subtree: true });
    doc.getElementById('toggleAutoTranslate')?.addEventListener('change', (e) => setAutoPublic(!!e.target.checked));
    ['chaupaal:content-langs-changed', 'chaupaal:lang-changed'].forEach((ev) => doc.addEventListener(ev, () => scan(true)));
    const ready = () => loadFlags(true);
    if (root.ChaupaalEnv && typeof root.ChaupaalEnv.whenAuthReady === 'function') root.ChaupaalEnv.whenAuthReady(15000).then(ready, ready);
    else setTimeout(ready, 1500);
  }

  const api = {
    loadFlags,
    enabled,
    offerFor,
    targetLang,
    readLangs,
    translateText,
    request,
    flush,
    hasConsent,
    askConsent,
    deviceGet,
    devicePut,
    clearAll,
    isChatAuto,
    setChatAuto,
    autoPublic,
    setAutoPublic,
    showTranslated,
    showOriginal,
    visibleOnly,
    scan,
    langName,
    _setFlag: (f) => {
      flag = Object.assign({ at: Date.now() }, f);
    },
  };
  root.ChaupaalTranslate = api;
  root.ugcHtml = ugcHtml;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  if (root.document) {
    if (root.document.readyState === 'loading') root.document.addEventListener('DOMContentLoaded', boot);
    else boot();
  }
})(typeof window !== 'undefined' ? window : globalThis);
