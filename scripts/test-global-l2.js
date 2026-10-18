#!/usr/bin/env node
/**
 * Global L2 — string extraction: shell, auth, onboarding, profile, settings, notifications, errors.
 *   lint      zero hard-coded strings in every L2 file (scripts/i18n-surfaces.json → l2)
 *   keys      every t() / tHtml() / tn() / data-i18n key in L2 files exists; option values have labels
 *   packs     hi / ta keep {{placeholders}} and plural categories; counts use plurals
 *   push      server renders the shared catalog in the recipient's language, English fallback
 *   errors    API / Firestore / Firebase auth codes → errors.<code>; no raw messages in toasts
 *   auth      auth.languageCode follows the UI language (zh → zh-CN, pt → pt-BR)
 *   taxonomy  stored option values stay canonical codes; labels come from optionLabel()
 *   pseudo    en-XA transforms every L2 key; ar-XB flips to RTL
 */
'use strict';

const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { loadI18n } = require('./lib/i18n-runtime');
const { scanJs, scanIndex } = require('./i18n-lint');
const { classify } = require('./lib/i18n-ast');
const { isCopy } = require('./i18n-lint');
const { coverage } = require('./i18n-coverage');
const options = require('./i18n-options');

const ROOT = path.join(__dirname, '..');
const read = (p) => fs.readFileSync(path.join(ROOT, p), 'utf8');
const L2 = require('./i18n-surfaces.json').l2;
const L2_FILES = Object.keys(L2).filter((f) => fs.existsSync(path.join(ROOT, f)));
const L2_NS = ['common', 'auth', 'onboarding', 'profile', 'settings', 'notifications', 'errors'];

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

(async () => {
  const rt = loadI18n({ region: false });
  const en = rt.CHAUPAAL_I18N_EN;
  const exists = (k) => !!rt.i18nLookup(k, 'en');

  console.log('\nLint (L2 files)');
  {
    const hits = [];
    L2_FILES.forEach((rel) => {
      const src = read(rel);
      hits.push(...(rel.endsWith('.html') ? scanIndex(rel, src) : scanJs(rel, src)));
    });
    assert(L2_FILES.length >= 60, `L2 surface covers ${L2_FILES.length} files`);
    assert(hits.length === 0, `zero hard-coded strings in L2 files (${hits.length})` + (hits.length ? ': ' + hits.slice(0, 5).map((h) => `${h.file}:${h.line} ${h.text}`).join(' | ') : ''));
    const html = read('public/index.html');
    assert(/data-i18n-slots="common\.signup_legal"/.test(html) && /data-i18n-slot="terms"/.test(html), 'sign-up legal line is one sentence with live links (data-i18n-slots)');
  }

  console.log('\nKeys');
  {
    const missing = [];
    L2_FILES.forEach((rel) => {
      const src = read(rel);
      if (rel.endsWith('.html')) {
        (src.match(/data-i18n(?:-[a-z]+)?="([\w.]+)"/g) || []).forEach((m) => {
          const k = /="([\w.]+)"/.exec(m)[1];
          if (!/data-i18n-slot="/.test(m) && !exists(k)) missing.push(`${rel}: ${k}`);
        });
        return;
      }
      classify(src, isCopy).calls.forEach((c) => {
        if (c.name === 'optionLabel' || c.name === 'optionLabelHtml') return;
        if (!/^[a-z][\w]*(\.[\w]+)+$/.test(c.key) && !exists(c.key) && c.fallback) return; // legacy flat key + fallback
        if (!exists(c.key)) missing.push(`${rel}:${c.line} ${c.key}`);
      });
    });
    assert(missing.length === 0, `every key used in L2 files exists (${missing.length} missing)` + (missing.length ? ': ' + missing.slice(0, 6).join(', ') : ''));
    const opt = options.run(L2_FILES, false);
    assert(opt.options.length > 250, `stored option values found: ${opt.options.length}`);
    assert(Object.keys(opt.added).length === 0, `every stored option value has a label key (${Object.keys(opt.added).length} missing)`);
    const counts = {};
    Object.keys(en).forEach((k) => {
      const ns = k.split('.')[0];
      if (L2_NS.includes(ns)) counts[ns] = (counts[ns] || 0) + 1;
    });
    console.log('    keys per namespace: ' + L2_NS.map((ns) => `${ns}=${counts[ns] || 0}`).join(' · '));
    assert(L2_NS.every((ns) => counts[ns] > 0), 'every L2 namespace has keys');
  }

  console.log('\nPacks: placeholders + plurals');
  {
    const cov = coverage();
    ['hi', 'ta'].forEach((code) => {
      const l = cov.langs[code];
      const inL2 = (k) => L2_NS.includes(k.split('.')[0]);
      assert(l.placeholderMismatches.filter(inL2).length === 0, `${code}: placeholders match English in L2 namespaces`);
      assert(l.pluralGaps.filter((g) => inL2(g)).length === 0, `${code}: plural categories complete in L2 namespaces`);
      const l2Keys = Object.keys(en).filter(inL2);
      const pack = JSON.parse(read(`public/src/i18n/${code}.json`));
      const translated = l2Keys.filter((k) => k in pack).length;
      console.log(`    ${code}: ${translated}/${l2Keys.length} L2 keys translated (${Math.round((translated / l2Keys.length) * 1000) / 10}%)`);
      assert(translated >= 100, `${code}: existing translations carried onto the new L2 keys (${translated})`);
    });
    assert(cov.enPluralGaps.length === 0, 'every English plural block has "other"');
    const plural = (k) => /\{count, plural,/.test(en[k] || '');
    ['common.minutes_ago', 'common.hours_ago', 'common.days_ago', 'common.weeks_ago', 'common.new_notifications', 'common.members_count', 'profile.interests_selected', 'profile.skills_count', 'settings.days_in_a_row'].forEach((k) =>
      assert(plural(k), `${k} is an ICU plural`)
    );
    assert(rt.tn('common.members_count', 1) === '1 member' && rt.tn('common.members_count', 3) === '3 members', 'tn picks one / other');
    const glued = L2_FILES.filter((rel) => rel.endsWith('.js') && /\$\{\w+\} \w+\$\{\w+ === 1 \? '' : 's'\}/.test(read(rel)));
    assert(glued.length === 0, `no "${'${n}'} thing${'${n === 1 ? "" : "s"}'}" plurals left (${glued.join(', ')})`);
  }

  console.log('\nPush (server catalog)');
  {
    const srv = require('../server-lib/i18n-server');
    const notif = require('../server-lib/notifications');
    const loaders = Object.keys(srv.PACK_LOADERS).sort();
    const shipped = rt.LANG_CATALOG.map((l) => l.code).filter((c) => c !== 'en').sort();
    assert(JSON.stringify(loaders) === JSON.stringify(shipped), 'server loads every shipped pack by static require (Vercel traces them)');
    const srvSrc = read('server-lib/i18n-server.js');
    assert(/path\.join\(__dirname, '\.\.', 'public', 'src', 'i18n', 'en\.js'\)/.test(srvSrc) && /'js', 'core', 'i18n\.js'\)/.test(srvSrc) && !/: '[A-Z][a-z]+ [a-z]+/.test(srvSrc), 'server renders with the client catalog + runtime (no server copy table)');
    const hiFollow = srv.serverT('hi', 'notifications.bundle_follow', { actor: 'Asha' });
    assert(/Asha/.test(hiFollow) && /follow karne lage/.test(hiFollow) && !/</.test(hiFollow), `hi push: "${hiFollow}" (plain text)`);
    assert(srv.serverT('xx', 'notifications.bundle_follow', { actor: 'Asha' }) === 'Asha started following you', 'unknown language → English');
    assert(srv.serverT('ja', 'notifications.push.story_like', { actor: 'Ken' }) === 'Ken liked your story', 'key missing from the pack → English');
    assert(srv.serverT('hi-IN', 'common.more') === srv.serverT('hi', 'common.more'), 'stored region tags normalise (hi-IN → hi)');
    const fakeDb = (lang) => ({
      collection: () => ({ doc: () => ({ get: async () => ({ exists: lang !== undefined, data: () => (lang ? { lang } : {}) }) }) }),
    });
    const a = await notif.renderPushCopy(fakeDb('hi'), 'u1', { actorName: 'Asha', previewKey: 'notifications.bundle_friend_request', previewParams: {}, previewText: '' });
    assert(a.title === 'Asha' && /friend request bheji/.test(a.body) && a.lang === 'hi', `recipient lang hi → "${a.body}"`);
    const b = await notif.renderPushCopy(fakeDb(undefined), 'u1', { actorName: 'Asha', previewKey: 'notifications.bundle_friend_request', previewText: '' });
    assert(b.body === 'Asha sent you a friend request' && b.lang === 'en', 'no lang on the user → English');
    const c = await notif.renderPushCopy(fakeDb('hi'), 'u1', { actorName: 'Asha', previewKey: null, previewText: 'kal milte hain' });
    assert(c.body === 'kal milte hain', 'user-written preview goes out as written');
    const d = await notif.renderPushCopy(fakeDb('fr'), 'u1', { actorName: 'Asha', previewKey: null, previewText: '' });
    assert(d.body === 'New activity on Chaupaal', 'no preview → generic catalog line');
    assert(JSON.stringify(notif.cleanPreviewParams({ san: 'Nf3', bad: { x: 1 }, 'no-dash': 1 })) === '{"san":"Nf3"}', 'previewParams: short strings only');
    const callers = ['api/stories.js', 'api/relationships.js', 'api/peepal-reactions.js', 'api/media-config.js', 'server-lib/chess-engine.js', 'server-lib/parental-consent.js', 'server-lib/duniya-posts.js', 'server-lib/notifications.js'];
    const english = callers.filter((f) => /preview: ['`][A-Za-z]|\|\| '(?:New message|commented on your story|mentioned you)'/.test(read(f).replace(/preview: caption \|\| 'Sent a (post|story)'/g, '')));
    assert(english.length === 0, `notification callers pass previewKey, not English (${english.join(', ')})`);
    const keys = [];
    callers.forEach((f) => (read(f).match(/previewKey: (?:[^,\n]*\? )?'([\w.]+)'(?: : '([\w.]+)')?/g) || []).forEach((m) => (m.match(/'([\w.]+)'/g) || []).forEach((q) => keys.push(q.slice(1, -1)))));
    assert(keys.length >= 15 && keys.every(exists), `every previewKey exists in the catalog (${keys.length})`);
    const ret = require('../server-lib/retention-d1d7');
    const tpls = Object.values(ret.TEMPLATES);
    assert(tpls.every((tp) => exists(tp.titleKey) && exists(tp.bodyKey)), 'retention templates are catalog keys');
    assert(!/title: '|body: '/.test(read('server-lib/retention-d1d7.js')), 'retention has no inline English copy');
    assert(ret.TEMPLATES.d3_peepal.title === 'Explore Peepal', 'retention English getter still works (dry runs / previews)');
    const panel = read('public/src/js/core/notification-panel.js');
    assert(/n\.previewKey && !n\.grouped/.test(panel) && /previewKey: raw\.previewKey/.test(panel), 'notification panel renders previewKey in the reader language');
  }

  console.log('\nErrors');
  {
    const ctx = {
      window: {},
      navigator: { onLine: true },
      document: { querySelector: () => null, getElementById: () => null, body: {}, documentElement: { classList: { toggle() {} } } },
      console: { warn() {}, log() {} },
      t: rt.t,
      tn: rt.tn,
      tHtml: rt.tHtml,
      ChaupaalFormat: undefined,
    };
    vm.createContext(ctx);
    vm.runInContext(read('public/src/js/core/ui-states.js'), ctx, { filename: 'ui-states.js' });
    const W = ctx.window;
    const map = W.ERROR_CODE_MAP;
    const missing = [...new Set(Object.values(map))].filter((c) => !exists('errors.' + c));
    assert(!missing.length && exists('errors.generic') && exists('errors.auth_generic'), `every mapped code has errors.<code> (${missing.join(', ')})`);
    const serverCodes = new Set();
    ['api', 'server-lib'].forEach((dir) =>
      fs.readdirSync(path.join(ROOT, dir)).filter((f) => f.endsWith('.js')).forEach((f) => {
        const src = read(path.join(dir, f));
        (src.match(/(?:code:\s*|fail\([^,]*,\s*|sendError\([^,]*,\s*\d+,\s*)'([A-Z][A-Z_]{2,})'/g) || []).forEach((m) => serverCodes.add(/'([A-Z_]+)'/.exec(m)[1]));
      })
    );
    const unmapped = [...serverCodes].filter((c) => !map[c] && !/_(FAILED|ERROR|SYNC)$|^(NO_PREVIOUS|HTTP_ERROR|CRON_NOT_CONFIGURED|RANK_FAILED)$/.test(c));
    assert(serverCodes.size > 40 && unmapped.length === 0, `API error codes map to errors.* (${serverCodes.size} codes; unmapped: ${unmapped.join(', ')})`);
    const cases = [
      [{ code: 'RATE_LIMITED', message: 'Slow down' }, 'rate_limited'],
      [{ error: { code: 'TEEN_BLOCKED' } }, 'teen_blocked'],
      [{ code: 'permission-denied' }, 'forbidden'],
      [{ code: 'auth/wrong-password' }, 'auth_invalid_credentials'],
      [{ code: 'auth/user-not-found' }, 'auth_invalid_credentials'],
      [{ code: 'auth/some-new-code' }, 'auth_generic'],
      [{ message: 'Failed to fetch' }, 'network'],
      [{ code: 'STORY_FAILED', message: 'boom' }, 'generic'],
    ];
    cases.forEach(([err, want]) => assert(W.errorCode(err) === want, `errorCode(${JSON.stringify(err)}) → ${want}`));
    assert(W.friendlyError({ code: 'auth/invalid-credential' }) === 'Incorrect username/email/phone or password', 'wrong password / unknown user share one generic message');
    assert(W.errorText({ code: 'STORY_FAILED', message: 'raw server text' }, 'Could not save') === 'Could not save', 'unknown code → the screen’s own message, never the raw text');
    ctx.navigator.onLine = false;
    assert(W.errorCode({ code: 'RATE_LIMITED' }) === 'offline', 'offline wins');
    const raw = [];
    L2_FILES.filter((f) => f.endsWith('.js')).forEach((rel) =>
      read(rel)
        .split('\n')
        .forEach((line, i) => {
          // `${type}: ${e?.message || e}` is a reportClientError payload (telemetry), not UI.
          if (/(showToast\(|textContent\s*=|message:\s*)[^;]*\b(e|err|error)\??\.message\b/.test(line) && !/console\.|reportClientError|=== '|errorText|friendlyError|\.message \|\| \w+\}`/.test(line)) raw.push(`${rel}:${i + 1}`);
        })
    );
    assert(raw.length === 0, `no raw error.message in L2 toasts / labels (${raw.slice(0, 5).join(', ')})`);
    const envThrows = L2_FILES.filter((f) => f.endsWith('.js') && /throw new Error\((env|envelope)\?\.error\?\.message/.test(read(f)));
    assert(envThrows.length === 0, `API envelope errors keep their code (${envThrows.join(', ')})`);
  }

  console.log('\nFirebase auth language');
  {
    const r2 = loadI18n({ region: false });
    r2.auth = { languageCode: null };
    for (const [ui, fb] of [['zh', 'zh-CN'], ['pt', 'pt-BR'], ['hi', 'hi'], ['ar', 'ar'], ['en', 'en']]) {
      await r2.setAppLanguage(ui);
      assert(r2.auth.languageCode === fb, `UI ${ui} → auth.languageCode ${fb}`);
    }
    assert(/syncFirebaseAuthLanguage\(\)/.test(read('public/src/js/config/firebase.js')), 'set right after firebase.auth() init');
    const ae = read('public/src/js/auth/auth-events.js');
    const sends = (ae.match(/sendEmailVerification\(|sendPasswordResetEmail\(/g) || []).length;
    const synced = (ae.match(/syncFirebaseAuthLanguage\(\);\r?\n[^\n]*(sendEmailVerification|\bif \(auth\))/g) || []).length;
    assert(sends >= 5 && synced >= sends, `synced before every verify / reset email (${synced}/${sends})`);
    const otp = read('public/src/js/auth/phone-otp.js');
    assert(/syncFirebaseAuthLanguage\(\);\r?\n\s*const verifier = new firebase\.auth\.RecaptchaVerifier/.test(otp) && /syncFirebaseAuthLanguage\(\);\r?\n\s*const confirmation = await auth\.signInWithPhoneNumber/.test(otp), 'synced before reCAPTCHA + SMS');
    assert(/Firebase/.test(read('CONVENTIONS.md')) && /languageCode/.test(read('CONVENTIONS.md')), 'Firebase localisation limits documented in CONVENTIONS.md');
  }

  console.log('\nTaxonomy: stored values stay codes');
  {
    const tax = read('public/src/js/core/profile-taxonomy.js');
    const marked = options.collect(tax);
    assert(marked.length > 40 && marked.every((o) => /^[\x20-\x7E’—–]+$/.test(o.value)), `taxonomy option values are canonical English codes (${marked.length})`);
    assert(!/i18n-values: \w+ \*\/ \[[^\]]*\bt\(/.test(tax), 'no t() inside a stored-value list');
    assert(rt.optionLabel('industry', 'Media & Entertainment') === 'Media & Entertainment', 'optionLabel → English label');
    const r3 = loadI18n({ region: false });
    r3.registerI18nLocale('hi', { 'profile.opt.industry.media_entertainment': 'मीडिया और मनोरंजन' });
    await r3.setAppLanguage('hi');
    assert(r3.optionLabel('industry', 'Media & Entertainment') === 'मीडिया और मनोरंजन', 'optionLabel → translated label for hi');
    assert(r3.optionLabel('industry', 'My own words') === 'My own words', 'free text shows as typed');
    assert(r3.optionLabelHtml('city', '<b>x</b>') === '&lt;b&gt;x&lt;/b&gt;', 'optionLabelHtml escapes');
    const pf = read('public/src/js/features/profile.js');
    assert(/data-val="\$\{String\(o\)\.replace/.test(pf) && /optionLabelHtml\(key,o\)/.test(pf) && /value="\$\{esc\(o\)\}"/.test(pf), 'profileField: value / data-val stay codes, labels via optionLabelHtml');
    const shell = read('public/src/js/core/profile-shell.js');
    assert(['city', 'interest', 'intent', 'industry', 'purpose', 'skill'].every((g) => new RegExp(`data-${g}="\\$\\{escAttr\\(c\\)\\}">\\$\\{optionLabelHtml\\('${g}', c\\)\\}`).test(shell)), 'deepen chips: data-* code, optionLabel label');
    const ae = read('public/src/js/auth/auth-events.js');
    assert(/data-val="\$\{String\(it\.label\)[^`]*\$\{optionLabelHtml\(field, it\.label\)\}/.test(ae) && /bumpStat\('industryStats', profile\.industry\)/.test(ae), 'industry / purpose picklist: stored value + stats doc stay canonical');
    assert(/optionLabelHtml\(f\.key,o\)/.test(read('public/src/js/features/onboarding.js')), 'onboarding chips labelled via optionLabel');
    assert(/profileVisibility: vis === 'friends only' \? 'Friends only' : 'public'/.test(read('public/src/js/core/profile-digital-layout.js')), 'stored profileVisibility is never translated');
    assert(/`chaupaal_stranger_msgs_\$\{uid\}_\$\{getTodayKey\(\)\}`/.test(read('public/src/js/features/fairness.js')) && /`chaupaal_journal_\$\{kind\}_\$\{dateKey\}_\$\{win\}`/.test(read('public/src/js/core/journal-checkin.js')), 'storage keys are never translated');
    const prompts = read('public/src/js/core/profile-prompts.js');
    assert(/en\[p\.key\]/.test(prompts) && /key: 'profile\.a_cause_i_care_about'/.test(prompts), 'matching embeddings use the English prompt text whatever the UI language');
  }

  console.log('\nPseudo-locales');
  {
    const r4 = loadI18n({ region: false });
    r4.setPseudoLocale('en-XA');
    const keys = new Set();
    L2_FILES.forEach((rel) => {
      const src = read(rel);
      if (rel.endsWith('.html')) (src.match(/data-i18n(?:-[a-z]+)?="([\w.]+)"/g) || []).filter((m) => !/data-i18n-slot="/.test(m)).forEach((m) => keys.add(/="([\w.]+)"/.exec(m)[1]));
      else classify(src, isCopy).calls.forEach((c) => exists(c.key) && keys.add(c.key));
    });
    const plain = [...keys].filter((k) => {
      const v = r4.t(k, { count: 2, n: 2 });
      return !(v.startsWith('[') && v.endsWith(']'));
    });
    assert(keys.size > 1500 && plain.length === 0, `en-XA transforms every L2 key (${keys.size}; untransformed: ${plain.slice(0, 5).join(', ')})`);
    assert(/[áéîöû]/.test(r4.t('common.signup_legal', { terms: '\u00010\u0001', privacy: '\u00011\u0001' })) && /\u00010\u0001/.test(r4.t('common.signup_legal', { terms: '\u00010\u0001', privacy: '\u00011\u0001' })), 'en-XA keeps slot markers intact (legal sentence)');
    const r5 = loadI18n({ region: false });
    r5.setPseudoLocale('ar-XB');
    await r5.setAppLanguage('en');
    const v = r5.t('errors.network');
    assert(v.startsWith('\u200F\u202E') && r5.isRtl(), 'ar-XB: RTL marks on L2 copy + isRtl()');
    assert(r5.html.dir === 'rtl', 'ar-XB: <html dir="rtl">');
  }

  console.log('\nGuards');
  {
    const apis = fs.readdirSync(path.join(ROOT, 'api')).filter((f) => f.endsWith('.js'));
    assert(apis.length === 12, `api/*.js === 12 (got ${apis.length})`);
    const i18n = read('public/src/js/core/i18n.js');
    assert(/reloadForLanguage\(code\)/.test(read('public/src/js/core/lang-picker.js')) && /function takeLanguageReloadNotice/.test(i18n), 'picking a language reloads once (load-time copy re-renders), toast after');
  }

  console.log(`\n${passed} passed, ${failed} failed`);
  process.exit(failed ? 1 : 0);
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
