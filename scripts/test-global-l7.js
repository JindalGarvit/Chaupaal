#!/usr/bin/env node
/**
 * Global L7 — Translate for user content.
 *   detect     on-device detection across the 16 languages + mixed / short / emoji / numbers
 *   visibility Translate offered only when: flag on, not trivial, confident, not a "Languages I read" language
 *   flag       hidden with AI off / missing credentials / kill switch; provider swap via env
 *   quality    mentions, hashtags, URLs, emoji, code, numbers, glossary, line breaks preserved (mocked provider);
 *              wrong output language / commentary / lost placeholder → "Couldn't translate right now"
 *   privacy    private: consent gate, never cached or stored server-side, on-device cache cleared on logout;
 *              public: shared cache by content hash + target + version (edit invalidates)
 *   cost       per-user + global caps, aiBudget pause, chunked long text, batching of visible messages only
 *   render     translated text in place with lang + dir="auto" (RTL), Show original restores
 *   safety     output passes the source surface's word filter
 *   wiring     every listed surface marks its user text; route folded into media-config; api/*.js = 12
 */
'use strict';

const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = path.join(__dirname, '..');
const read = (p) => fs.readFileSync(path.join(ROOT, p), 'utf8');
const T = require('../server-lib/translate.js');
const D = require('../public/src/js/core/lang-detect.js');

let passed = 0;
let failed = 0;
function assert(cond, msg) {
  if (cond) {
    passed++;
    console.log('  ✓ ' + msg);
  } else {
    failed++;
    console.log('  FAIL ' + msg);
  }
}

// ─── fake Firestore (records every write) ─────────────────────────────────
function fakeDb() {
  const data = {};
  const writes = [];
  const inc = (n) => ({ __inc: n });
  function merge(prev, next) {
    const out = Object.assign({}, prev || {});
    Object.keys(next).forEach((k) => {
      const v = next[k];
      if (v && typeof v === 'object' && '__inc' in v) out[k] = (Number(out[k]) || 0) + v.__inc;
      else if (v && typeof v === 'object' && !Array.isArray(v)) out[k] = merge(out[k], v);
      else out[k] = v;
    });
    return out;
  }
  const db = {
    collection(c) {
      return {
        doc(id) {
          const key = c + '/' + id;
          return {
            async get() {
              return { exists: key in data, data: () => data[key] };
            },
            async set(v, opts) {
              writes.push({ c, id, v });
              data[key] = opts && opts.merge ? merge(data[key], v) : merge({}, v);
            },
          };
        },
      };
    },
  };
  return { db, data, writes, admin: { firestore: { FieldValue: { increment: inc } } } };
}

/** Mock LLM: applies fn(segment, target) to every segment of the JSON request. */
function mockAI(fn) {
  const calls = [];
  const callAI = async (opts) => {
    const req = JSON.parse(opts.messages[0].content);
    calls.push({ opts, req });
    return { text: JSON.stringify(req.segments.map((s) => fn(s, req.target))) };
  };
  return { callAI, calls };
}
const ES_EN = (s) =>
  s
    .replace(/\bHola\b/g, 'Hi')
    .replace(/\bmira\b/g, 'look at')
    .replace(/\ben\b/g, 'on')
    .replace(/\ba las\b/g, 'at')
    .replace(/\bahí\b/g, 'there')
    .replace(/\bnos vemos mañana en el partido\b/g, 'see you tomorrow at the match')
    .replace(/\bgracias por todo\b/g, 'thanks for everything');
const AI_ON = { AI_FEATURES_ENABLED: 'true', ANTHROPIC_API_KEY: 'test-key-not-real' };

(async () => {
  console.log('\nDetection (on device)');
  {
    const fx = {
      en: 'I think we should meet at the cafe this evening, what do you say?',
      hi: 'मुझे लगता है कि हमें आज शाम को मिलना चाहिए, आप क्या कहते हैं?',
      bn: 'আমার মনে হয় আজ সন্ধ্যায় আমাদের দেখা করা উচিত',
      ta: 'இன்று மாலை நாம் சந்திக்க வேண்டும் என்று நினைக்கிறேன்',
      te: 'ఈ సాయంత్రం మనం కలవాలని నేను అనుకుంటున్నాను',
      mr: 'मला वाटते की आज संध्याकाळी आपण भेटायला हवे, तुम्हाला काय वाटते आहे?',
      pa: 'ਮੈਨੂੰ ਲੱਗਦਾ ਹੈ ਕਿ ਸਾਨੂੰ ਅੱਜ ਸ਼ਾਮ ਮਿਲਣਾ ਚਾਹੀਦਾ ਹੈ',
      kn: 'ಇಂದು ಸಂಜೆ ನಾವು ಭೇಟಿಯಾಗಬೇಕು ಎಂದು ನನಗೆ ಅನಿಸುತ್ತದೆ',
      ml: 'ഇന്ന് വൈകുന്നേരം നമ്മൾ കാണണമെന്ന് എനിക്ക് തോന്നുന്നു',
      ur: 'میرا خیال ہے کہ ہمیں آج شام ملنا چاہیے، آپ کیا کہتے ہیں؟',
      ar: 'أعتقد أننا يجب أن نلتقي في المقهى هذا المساء، ما رأيك؟',
      es: 'Creo que deberíamos vernos en el café esta noche, ¿qué te parece?',
      fr: "Je pense que nous devrions nous voir au café ce soir, qu'en penses-tu ?",
      pt: 'Acho que devemos nos encontrar no café hoje à noite, o que você acha?',
      de: 'Ich denke, wir sollten uns heute Abend im Café treffen, was meinst du?',
      id: 'Saya pikir kita harus bertemu di kafe malam ini, bagaimana menurut kamu?',
      ja: '今夜カフェで会うべきだと思います。どう思いますか？',
      ko: '오늘 저녁에 카페에서 만나야 할 것 같아요. 어떻게 생각해요?',
      zh: '我觉得我们今天晚上应该在咖啡馆见面，你觉得怎么样？',
    };
    const wrong = Object.keys(fx).filter((k) => {
      const r = D.detect(fx[k]);
      return r.lang !== k || r.confidence < 0.6;
    });
    assert(Object.keys(fx).length === 19 && wrong.length === 0, `all 19 languages detected with confidence ≥ 0.6 (${wrong.join(', ') || 'all ok'})`);
    const more = [
      ['es', 'No sé si voy a llegar a tiempo, lo siento mucho'],
      ['pt', 'Eu não sei se vou conseguir chegar a tempo'],
      ['fr', 'Je ne sais pas si je vais arriver à temps'],
      ['hi', 'Kal milte hain yaar, bahut kaam hai'],
      ['en', 'Hey @priya_k check #DangalNight https://chaupaal.app/x — we play at 9 tonight 🎉'],
    ];
    more.forEach(([l, s]) => assert(D.detect(s).lang === l, `${l}: "${s.slice(0, 32)}…" (got ${D.detect(s).lang})`));
    assert(D.detect('Kal milte hain yaar, bahut kaam hai').romanized === true, 'Latin-script Hindi is marked romanized');
    ['😀😂🔥', '12345 678', '@asha #fun', 'ok', 'https://example.com/a?b=1', '👍🏽 100%'].forEach((s) => assert(D.trivial(s), `trivial → no button: ${JSON.stringify(s)}`));
    const mixed = D.detect('Great match today दोस्त, see you all tomorrow at the ground');
    assert(mixed.lang === 'en' && mixed.confidence >= 0.6, `mostly-English text with a Hindi word → English (${mixed.lang} ${mixed.confidence})`);
    const half = D.detect('नमस्ते दोस्तों कैसे हो hello friends how are you');
    assert(half.confidence < 0.8, `half / half scripts → lower confidence (${half.lang} ${half.confidence})`);
    assert(/no network/i.test(read('public/src/js/core/lang-detect.js')) && !/fetch\(|XMLHttpRequest|apiFetch/.test(read('public/src/js/core/lang-detect.js')), 'detector makes no network calls (in-house, no third-party code)');
  }

  console.log('\nFeature flag (server-computed)');
  {
    assert(T.flags({}).enabled === false && T.flags({}).reason === 'ai_off', 'AI off → hidden');
    assert(T.flags({ AI_FEATURES_ENABLED: 'TRUE', ANTHROPIC_API_KEY: 'x' }).enabled === false, 'AI_FEATURES_ENABLED must be exactly "true"');
    assert(T.flags({ AI_FEATURES_ENABLED: 'true' }).reason === 'no_credentials', 'AI on but no key → hidden');
    assert(T.flags({ AI_FEATURES_ENABLED: 'true', AI_PROVIDER: 'grok' }).reason === 'no_credentials' && T.flags({ AI_FEATURES_ENABLED: 'true', AI_PROVIDER: 'grok', GROK_API_KEY: 'x' }).enabled, 'llm path follows AI_PROVIDER credentials');
    assert(T.flags(AI_ON).enabled && T.flags(AI_ON).provider === 'llm', 'AI on + key → enabled (llm default)');
    assert(T.flags({ TRANSLATE_PROVIDER: 'deepl' }).reason === 'no_credentials' && T.flags({ TRANSLATE_PROVIDER: 'deepl', DEEPL_API_KEY: 'x' }).enabled, 'deepl adapter needs DEEPL_API_KEY (no AI switch needed)');
    assert(T.flags({ TRANSLATE_PROVIDER: 'google', GOOGLE_TRANSLATE_API_KEY: 'x' }).provider === 'google' && T.flags({ TRANSLATE_PROVIDER: 'magic' }).reason === 'unknown_provider', 'google adapter / unknown provider');
    assert(T.flags(Object.assign({ TRANSLATE_DISABLED: 'true' }, AI_ON)).enabled === false, 'TRANSLATE_DISABLED kill switch');
    let threw = null;
    try {
      await T.createTranslator({ env: {} }).translate('u1', { target: 'en', items: [{ text: 'hola' }] });
    } catch (e) {
      threw = e.code;
    }
    assert(threw === 'TRANSLATE_OFF', 'translate refuses when the flag is off');
    assert(!/sk-|AIza|DeepL-Auth-Key [A-Za-z0-9]/.test(read('server-lib/translate.js').replace("'DeepL-Auth-Key ' + env.DEEPL_API_KEY", '')), 'no keys embedded');
  }

  console.log('\nQuality guards (mocked provider)');
  {
    const f = fakeDb();
    const ai = mockAI(ES_EN);
    const tr = T.createTranslator({ env: AI_ON, callAI: ai.callAI, db: f.db, admin: f.admin });
    const src = 'Hola @asha_k, mira #DangalNight en https://chaupaal.app/x?y=1 😀👍🏽 a las 7:30 en Baithak\n\n`npm run dev` ahí';
    const r = await tr.translate('u1', { target: 'en', items: [{ text: src, surface: 'baithak_msg', scope: 'private', src: 'es' }] });
    const out = r.items[0];
    assert(out.ok, 'translation succeeds');
    ['@asha_k', '#DangalNight', 'https://chaupaal.app/x?y=1', '😀', '👍🏽', '7:30', 'Baithak', '`npm run dev`'].forEach((tok) => assert(out.text.includes(tok), `kept exactly: ${tok}`));
    assert(out.text.split('\n').length === src.split('\n').length && /\n\n/.test(out.text), 'line breaks kept');
    const sent = ai.calls[0].req.segments.join(' ');
    assert(!/asha_k|DangalNight|chaupaal\.app|Baithak|7:30|npm run/.test(sent) && /⟦\d+⟧/.test(sent), 'protected tokens never reach the provider (placeholders sent)');
    assert(/Never add notes/.test(ai.calls[0].opts.system) && ai.calls[0].opts.tier === 'fast' && ai.calls[0].opts.feature === 'translate', 'llm adapter: fast tier, no-commentary instruction');

    const drop = T.createTranslator({ env: AI_ON, callAI: mockAI((s) => s.replace(/⟦0⟧/, '')).callAI });
    assert((await drop.translate('u1', { target: 'en', items: [{ text: 'Hola @asha_k gracias por todo amigo', surface: 'baithak_msg' }] })).items[0].error === 'failed', 'lost placeholder → failed');
    const wrongLang = T.createTranslator({ env: AI_ON, callAI: mockAI(() => 'This came back in English instead of Hindi for some reason').callAI });
    assert((await wrongLang.translate('u1', { target: 'hi', items: [{ text: 'Nos vemos mañana en el partido, gracias por todo', surface: 'duniya_caption' }] })).items[0].error === 'failed', 'output not in the target language/script → failed');
    const chatty = T.createTranslator({ env: AI_ON, callAI: mockAI((s) => 'Here is the translation: ' + ES_EN(s)).callAI });
    assert((await chatty.translate('u1', { target: 'en', items: [{ text: 'nos vemos mañana en el partido', surface: 'duniya_caption' }] })).items[0].error === 'failed', 'added commentary → failed');
    const broken = T.createTranslator({ env: AI_ON, callAI: async () => ({ text: 'not json' }) });
    assert((await broken.translate('u1', { target: 'en', items: [{ text: 'nos vemos mañana en el partido', surface: 'duniya_caption' }] })).items[0].error === 'failed', 'unparseable provider output → failed');
    const ui = read('public/src/js/core/translate.js');
    assert(/translate\.failed/.test(ui) && /Couldn’t translate right now/.test(read('public/src/i18n/en.js')), 'failure shows one calm line ("Couldn’t translate right now"), never the raw error');
  }

  console.log('\nPrivacy + caching (server)');
  {
    const f = fakeDb();
    const ai = mockAI(ES_EN);
    const tr = T.createTranslator({ env: AI_ON, callAI: ai.callAI, db: f.db, admin: f.admin });
    const secret = 'nos vemos mañana en el partido secreto';
    await tr.translate('u1', { target: 'en', items: [{ text: secret, surface: 'baithak_msg', scope: 'private' }] });
    await tr.translate('u1', { target: 'en', items: [{ text: secret, surface: 'baithak_msg', scope: 'private' }] });
    assert(ai.calls.length === 2, 'private text is never served from a shared cache (each request goes to the provider)');
    assert(!f.writes.some((w) => w.c === 'translateCache'), 'private: no translateCache write');
    assert(!f.writes.some((w) => JSON.stringify(w.v).includes('partido') || JSON.stringify(w.v).includes('match')), 'private: no server write contains the text or its translation (usage / stats are counts only)');

    const pub = { text: 'gracias por todo amigos, nos vemos mañana en el partido', surface: 'duniya_caption', scope: 'public', v: 'v1' };
    const a = await tr.translate('u2', { target: 'en', items: [pub] });
    const before = ai.calls.length;
    const b = await tr.translate('u3', { target: 'en', items: [pub] });
    assert(!a.items[0].cached && b.items[0].cached && ai.calls.length === before, 'public: second viewer hits the shared cache (no provider call)');
    assert(f.writes.filter((w) => w.c === 'translateCache').length === 1, 'public: one cache row keyed by content hash');
    await tr.translate('u3', { target: 'en', items: [Object.assign({}, pub, { v: 'v2' })] });
    assert(ai.calls.length === before + 1, 'public: an edit (new version) misses the cache');
    await tr.translate('u3', { target: 'fr', items: [pub] }).catch(() => null);
    assert(T.cacheId(pub.text, 'en', 'v1') !== T.cacheId(pub.text, 'fr', 'v1') && T.cacheId(pub.text, 'en', 'v1') !== T.cacheId(pub.text + '!', 'en', 'v1'), 'cache key = content hash + target + version');
    const stats = f.data['translateStats/' + new Date().toISOString().slice(0, 10)];
    assert(stats && stats.surfaces.duniya_caption.cacheHits >= 1 && stats.surfaces.baithak_msg.requests >= 2 && !JSON.stringify(stats).includes('partido'), 'telemetry per surface per day (requests, cache hits, cost) — counts only');
    const mc = read('api/media-config.js');
    const block = mc.slice(mc.indexOf("action === 'translate_config'"), mc.indexOf('// ─── Shabd Five'));
    assert(/console\.warn\('\[media-config\] translate', e\?\.code \|\| 'error'\)/.test(block) && !/body\.items|\.text\b/.test(block.replace("tr.translate(user.uid, body)", '')), 'route logs only an error code, never message text');
    assert(!/console\./.test(read('server-lib/translate.js')) && !/console\./.test(read('public/src/js/core/translate.js')), 'translate modules never log');
  }

  console.log('\nCaps');
  {
    const f = fakeDb();
    const ai = mockAI(ES_EN);
    const tr = T.createTranslator({ env: Object.assign({ TRANSLATE_USER_DAILY_CAP: '2' }, AI_ON), callAI: ai.callAI, db: f.db, admin: f.admin });
    const item = (n) => ({ text: 'nos vemos mañana en el partido número ' + n, surface: 'baithak_msg', scope: 'private' });
    const r = await tr.translate('capped', { target: 'en', items: [item(1), item(2), item(3)] });
    assert(r.items[0].ok && r.items[1].ok && r.items[2].error === 'limit', 'per-user daily cap → "limit"');
    const r2 = await tr.translate('other', { target: 'en', items: [item(4)] });
    assert(r2.items[0].ok, 'another user is unaffected');
    const g = T.createTranslator({ env: Object.assign({ TRANSLATE_DAILY_CAP: '1' }, AI_ON), callAI: ai.callAI });
    const gr = await g.translate('a', { target: 'en', items: [item(5), item(6)] });
    assert(gr.items[0].ok && gr.items[1].error === 'limit', 'global daily cap → "limit"');
    const p = fakeDb();
    p.data['chaupaalMeta/aiBudget'] = { paused: true };
    const paused = T.createTranslator({ env: AI_ON, callAI: ai.callAI, db: p.db, admin: p.admin });
    assert((await paused.translate('a', { target: 'en', items: [item(7)] })).items[0].error === 'limit', 'budget layer pause (aiBudget.paused) stops translation');
    const big = 'Palabra larga. '.repeat(600);
    const c = T.chunk(big, 1500, 4);
    assert(c.chunks.length === 4 && c.chunks.every((x) => x.length <= 1501) && c.truncated === true, 'long articles: ≤ 4 chunks of ≤ 1500 chars, rest marked truncated');
    const many = await tr.translate('batch', { target: 'en', items: Array.from({ length: 12 }, (_, i) => item(100 + i)) });
    assert(many.items.length === T.MAX_ITEMS, `≤ ${T.MAX_ITEMS} items per request`);
    assert(/Translation limit reached for today/.test(read('public/src/i18n/en.js')) && /translate\.limit/.test(read('public/src/js/core/translate.js')), 'over cap → calm "Translation limit reached for today"');
    assert(/translate: \{ minute: 30, hour: 300 \}/.test(read('server-lib/rate-limit.js')), 'route rate limit bucket');
  }

  console.log('\nSafety (moderation on output)');
  {
    const tr = T.createTranslator({ env: AI_ON, callAI: mockAI(() => 'what the fuck is this word game').callAI });
    const r = await tr.translate('u1', { target: 'en', items: [{ text: '¿qué es este juego de palabras?', surface: 'scribble_chat', scope: 'private' }] });
    assert(r.items[0].ok && !/fuck/.test(r.items[0].text) && /f•+/.test(r.items[0].text), 'Dangal / Scribble text: the word filter masks the translation');
    assert(T.moderate('duniya_caption', 'hola amigos', 'hello fucking friends') !== 'hello fucking friends', 'a translation never introduces words the source didn’t have');
    assert(T.moderate('baithak_msg', 'mierda, fuck', 'shit, fuck') === 'shit, fuck', 'private chat: source words the user typed are not censored on translation');
  }

  console.log('\nClient: visibility, consent, device cache, batching, render');
  {
    const ls = new Map();
    const apiCalls = [];
    let confirmAnswer = false;
    let confirmAsked = 0;
    const ctx = vm.createContext({
      console,
      setTimeout,
      clearTimeout,
      Intl,
      currentUser: { uid: 'viewer1' },
      currentLang: 'en',
      normalizeLang: (c) => String(c || 'en').split('-')[0],
      getContentLangs: () => ['en'],
      t: (k, v) => (k === 'translate.translated_from' ? 'Translated from ' + v.lang : k),
      localStorage: { getItem: (k) => (ls.has(k) ? ls.get(k) : null), setItem: (k, v) => ls.set(k, String(v)), removeItem: (k) => ls.delete(k) },
      confirmSheet: async () => {
        confirmAsked++;
        return confirmAnswer;
      },
      apiFetch: async (p, o) => {
        apiCalls.push(o.body);
        if (o.body.action === 'translate_config') return { ok: true, data: { enabled: false } };
        return { ok: true, data: { items: o.body.items.map((it) => ({ ok: true, text: 'EN:' + it.text, src: it.src })) } };
      },
    });
    ctx.window = ctx;
    vm.runInContext(read('public/src/js/core/lang-detect.js'), ctx);
    vm.runInContext(read('public/src/js/core/translate.js'), ctx);
    const TR = ctx.ChaupaalTranslate;
    const es = 'Nos vemos mañana en el partido, gracias por todo';
    await TR.loadFlags(true);
    assert(!TR.enabled() && TR.offerFor(es).reason === 'off', 'server flag off (AI off / no credentials) → no Translate link anywhere');
    TR._setFlag({ enabled: true, maxItems: 8, maxChars: 1500, maxChunks: 4 });
    assert(TR.offerFor(es).offer === true && TR.offerFor(es).lang === 'es', 'Spanish for an English reader → Translate');
    assert(TR.offerFor(es, { readLangs: ['en', 'es'] }).reason === 'reads', 'language in "Languages I read" → no link');
    assert(TR.offerFor('I think we should meet at the cafe this evening').reason === 'reads', 'own language → no link');
    assert(TR.offerFor('😂😂🔥🔥').reason === 'trivial' && TR.offerFor('42 · 7:30').reason === 'trivial', 'emoji-only / number-only → no link');
    assert(TR.offerFor('si si ok la').reason !== 'reads' && TR.offerFor('si si ok la').offer === false, 'low confidence → no link');
    ctx.currentLang = 'hi';
    ctx.getContentLangs = () => ['en'];
    assert(TR.targetLang() === 'en', 'target = first reading language when the UI language isn’t read');
    ctx.getContentLangs = () => ['hi', 'en'];
    assert(TR.targetLang() === 'hi', 'target = UI language when the viewer reads it');
    ctx.currentLang = 'en';
    ctx.getContentLangs = () => ['en'];

    let sent = 0;
    const send = async (it) => {
      sent++;
      return { ok: true, text: 'EN:' + it.text, src: 'es' };
    };
    confirmAnswer = false;
    const refused = await TR.translateText(es, { scope: 'private', send });
    assert(refused.error === 'consent' && sent === 0 && confirmAsked === 1, 'private: first Translate asks for consent; declining sends nothing');
    confirmAnswer = true;
    const ok = await TR.translateText(es, { scope: 'private', send });
    assert(ok.ok && sent === 1 && TR.hasConsent(), 'private: confirming translates and is remembered');
    const again = await TR.translateText(es + '!', { scope: 'private', send });
    assert(again.ok && confirmAsked === 2, 'consent asked only once');
    const cached = await TR.translateText(es, { scope: 'private', send });
    assert(cached.ok && cached.cached && sent === 2, 'on-device cache: repeat view needs no request');
    await TR.translateText('Bonjour à tous, merci pour cette belle journée', { scope: 'public', send });
    assert(confirmAsked === 2, 'public text never asks for consent');
    await TR.clearAll();
    assert((await TR.deviceGet(es, 'en')) === null, 'logout clears the on-device cache');
    assert(/ChaupaalTranslate\?\.clearAll/.test(read('public/src/js/main.js')), 'signed-out → ChaupaalTranslate.clearAll()');
    TR._setFlag({ enabled: true, maxItems: 8 });
    const limitOnce = await TR.translateText('Hola amigos, nos vemos en el partido de mañana', { scope: 'public', send: async () => ({ ok: false, error: 'limit' }) });
    let after = 0;
    const blocked = await TR.translateText('Otro mensaje largo para traducir, por favor', { scope: 'public', send: async () => (after++, { ok: true, text: 'x' }) });
    assert(limitOnce.error === 'limit' && blocked.error === 'limit' && after === 0, 'after "limit" no more requests today');

    // batching: three requests inside the window → one API call with three items
    apiCalls.length = 0;
    const p = [1, 2, 3].map((n) => TR.request({ text: 'mensaje número ' + n, surface: 'baithak_msg', scope: 'private' }));
    await TR.flush();
    const res = await Promise.all(p);
    const batches = apiCalls.filter((b) => b.action === 'translate');
    assert(batches.length === 1 && batches[0].items.length === 3 && res.every((r) => r.ok), 'auto-translate requests are batched (one call, three items)');
    const vis = TR.visibleOnly([{ isIntersecting: true, target: 'a' }, { isIntersecting: false, target: 'b' }, { isIntersecting: true, target: 'c' }]);
    assert(vis.join() === 'a,c', 'only messages in view are translated');
    const src = read('public/src/js/core/translate.js');
    assert(/IntersectionObserver/.test(src) && /if \(wantsAuto\(el\)\) observeVisible\(el\)/.test(src), 'auto-translate observes visibility (lazy on scroll)');
    assert(/isChatAuto\(openChatId\(\)\) && hasConsent\(\)/.test(src) && /if \(on && !\(await askConsent\(\)\)\) return false;/.test(src), 'per-chat auto-translate is opt-in and needs the private consent');
    assert(/AUTO_PUBLIC_KEY\) === '1'/.test(src), 'auto-translate public posts is off unless switched on');

    // render: in place, lang + dir="auto", Show original restores
    function el(html) {
      const attrs = { 'data-ugc': 'baithak_msg', 'data-ugc-scope': 'private', dir: 'auto' };
      const node = {
        innerHTML: html,
        textContent: html,
        classList: { contains: (c) => c === 'ugc-text' },
        getAttribute: (k) => (k in attrs ? attrs[k] : null),
        setAttribute: (k, v) => (attrs[k] = String(v)),
        removeAttribute: (k) => delete attrs[k],
        hasAttribute: (k) => k in attrs,
        querySelector: () => null,
        nextElementSibling: null,
        ownerDocument: { createElement: () => ({ className: '', innerHTML: '', classList: { contains: (c) => c === 'ugc-tr-bar' } }) },
        insertAdjacentElement(pos, bar) {
          node.nextElementSibling = bar;
        },
        attrs,
      };
      return node;
    }
    const n = el('Hello &amp; welcome');
    TR.showTranslated(n, { text: 'مرحبا بكم <b>', target: 'ar', src: 'en' });
    assert(n.innerHTML === 'مرحبا بكم &lt;b&gt;' && n.attrs.lang === 'ar' && n.attrs.dir === 'auto', 'RTL translation shown in place with lang="ar" dir="auto" (escaped)');
    assert(/Translated from/.test(n.nextElementSibling.innerHTML) && /data-tr-act="orig"/.test(n.nextElementSibling.innerHTML), '"Translated from … · Show original"');
    TR.showOriginal(n);
    assert(n.innerHTML === 'Hello &amp; welcome' && !('lang' in n.attrs), 'Show original restores instantly');
    const marker = ctx.ugcHtml('duniya_caption', 'hola', { scope: 'public', v: 'v3' });
    assert(/class="ugc-text"/.test(marker) && /dir="auto"/.test(marker) && /data-ugc-scope="public"/.test(marker) && /data-ugc-v="v3"/.test(marker), 'ugcHtml marker: surface, scope, version, dir="auto"');
    assert(/data-ugc-scope="private"/.test(ctx.ugcHtml('x', 'y')), 'scope defaults to private');
    assert(/unicode-bidi: isolate/.test(read('public/src/styles/i18n.css').slice(read('public/src/styles/i18n.css').indexOf('.ugc-text'))), 'translated / original text is bidi-isolated');
  }

  console.log('\nWiring (every listed surface)');
  {
    const has = (f, re, msg) => assert(re.test(read(f)), msg);
    has('public/src/js/features/duniya.js', /ugcHtml\('duniya_caption'/, 'Duniya: post captions');
    has('public/src/js/core/comments.js', /ugcHtml\(surface \+ '_comment'/, 'Duniya / Peepal: comments');
    has('public/src/js/features/duniya.js', /scope:duniyaPostScope\(post\)/, 'Duniya comments inherit the post audience (private unless public)');
    has('public/src/js/features/duniya-story.js', /ugcHtml\('duniya_story_text', esc\(ov\.text\), \{ scope: 'private', place: 'inside' \}\)/, 'Duniya: story text overlays (text layer only)');
    has('public/src/js/features/baithak-chat.js', /ugcHtml\('baithak_msg'/, 'Baithak: chat message text');
    has('public/src/js/features/baithak-chat.js', /ugcHtml\('baithak_caption'/, 'Baithak: captions');
    has('public/src/js/features/akhbaar.js', /ugcHtml\('akhbaar_headline'/, 'Akhbaar: headline');
    has('public/src/js/features/akhbaar.js', /ugcHtml\('akhbaar_summary'/, 'Akhbaar: summary');
    has('public/src/js/core/deeplinks.js', /ugcHtml\('profile_bio'/, 'Profiles: bio');
    has('public/src/js/core/deeplinks.js', /ugcHtml\('profile_identity'/, 'Profiles: occupation / industry / purpose free text');
    has('public/src/js/features/categories.js', /ugcHtml\('peepal_question'/, 'Peepal: question / prompt text');
    has('public/src/js/features/mehfil.js', /ugcHtml\('mehfil_title'/, 'Mehfil: room title');
    has('public/src/js/games/party-kit.js', /ugcHtml\('party_chat'/, 'Dangal: room chat');
    has('public/src/js/games/scribble-ui.js', /ugcHtml\('scribble_chat'/, 'Dangal: Scribble chat');
    has('public/src/js/games/mostlikely.js', /ugcHtml\('dangal_custom_prompt'/, 'Dangal: custom prompts typed by players');
    has('public/src/js/games/charades.js', /ugcHtml\('dangal_custom_title'/, 'Dangal: custom titles typed by players');
    assert(!/<span>\$\{String\(post\.caption\|\|''\)\.slice\(0,150\)\}<\/span>/.test(read('public/src/js/features/duniya.js')), 'Duniya comment sheet escapes the caption (was raw HTML)');
    const idx = read('public/index.html');
    assert(idx.indexOf('core/lang-detect.js') > 0 && idx.indexOf('core/lang-detect.js') < idx.indexOf('core/translate.js'), 'index.html loads lang-detect.js then translate.js');
    assert(/id="autoTranslateRow" hidden/.test(idx) && /id="toggleAutoTranslate"/.test(idx), 'Settings: "Auto-translate public posts" (hidden until available, off by default)');
    assert(/translate\.auto_chat_on/.test(read('public/src/js/features/baithak-chat-actions.js')) && /TR\.enabled\(\)/.test(read('public/src/js/features/baithak-chat-actions.js')), 'chat menu: "Auto-translate this chat" (only when Translate is available)');
    const mc = read('api/media-config.js');
    assert(/action === 'translate_config'/.test(mc) && /action === 'translate'/.test(mc) && /require\('\.\.\/server-lib\/translate'\)/.test(mc), 'route folded into api/media-config.js → server-lib/translate.js');
    assert(/view === 'translate'/.test(read('api/admin-feedback.js')), 'admin view=translate (counts, no content)');
    assert(
      /Translate \+ AI processing is covered in the Privacy Policy/.test(read('public/src/js/core/first-run.js')) && /'legal\.privacy_ai_3': [^\n]*never stored by/.test(read('public/src/i18n/en.js').replace(/"/g, "'")),
      'L8 picked up the TODO: the Privacy Policy covers translation processing'
    );
    assert(/match \/translateCache\/\{docId\} \{\s*allow read, write: if false;/.test(read('firebase/firestore.rules')), 'translate collections are Admin-only');
    const apis = fs.readdirSync(path.join(ROOT, 'api')).filter((f) => f.endsWith('.js'));
    assert(apis.length === 12, `api/*.js === 12 (got ${apis.length})`);
  }

  console.log(`\n${passed} passed, ${failed} failed`);
  process.exit(failed ? 1 : 0);
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
