#!/usr/bin/env node
/**
 * Global L8 — Compliance 1: data rights, consent, age rules by country, Terms / Privacy drafts.
 *   age        under-13 blocked (no account, neutral screen, device lock); DOB-exact Teen mode, lifts at 18
 *   table      digital consent ages per region (DE 16, FR 15, UK 13, US 13, IN 18, default 16) + sources
 *   teen       Peepal hidden, 18+ games hidden, DMs from non-friends off, private profile, sensitive fields
 *   parental   email OTP flow records consent (parentalConsents) without lifting Teen mode
 *   export     async job → ZIP of JSON + media, secrets stripped, notification, link expiry
 *   deletion   30-day grace + cancel, cascade across Firestore / RTDB / Storage / usernames / phoneIndex,
 *              "Deleted user" rendering, Auth deleted last
 *   consent    opt-in regions fire no analytics before consent (network mock); consent log; re-prompt on bump
 *   ccpa       "Do not sell or share" only for US-CA
 *   recs       Personalised recommendations off → non-personalised ranking
 *   ai         "Use AI features" off → no AI call with personal data (client + server)
 *   legal      drafts carry the "Draft — requires legal review" banner + footer
 */
'use strict';

const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = path.join(__dirname, '..');
const read = (p) => fs.readFileSync(path.join(ROOT, p), 'utf8');
const { createFakeAdmin } = require('./lib/fake-admin');
const C = require('../public/src/js/core/compliance.js');
const Ages = require('../public/src/js/data/consent-ages.js');
const L = require('../public/src/js/core/legal.js');
const privacy = require('../server-lib/privacy');
const purge = require('../server-lib/account-purge');
const exp = require('../server-lib/account-export');
const parental = require('../server-lib/parental-consent');
const { readZip } = require('../server-lib/zip');

const enCtx = { window: {} };
vm.runInNewContext(read('public/src/i18n/en.js'), enCtx);
const EN = enCtx.window.CHAUPAAL_I18N_EN;
const tEn = (k, p) => String(EN[k] || k).replace(/\{\{(\w+)\}\}/g, (_, n) => (p && p[n] != null ? p[n] : '')).replace(/\{\{@(\w+)\}\}/g, (_, n) => n);

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

const DAY = 86400000;
const NOW = Date.UTC(2026, 10, 13, 12);
function dobYearsAgo(years, dayShift) {
  const d = new Date(NOW);
  d.setUTCFullYear(d.getUTCFullYear() - years);
  if (dayShift) d.setUTCDate(d.getUTCDate() + dayShift);
  return d.toISOString().slice(0, 10);
}

/** Minimal browser for compliance.js + privacy-ui.js / analytics.js / call-ai.js. */
function browser(opts) {
  const o = opts || {};
  const store = new Map(Object.entries(o.storage || {}));
  const elements = {};
  const el = (id) =>
    (elements[id] = elements[id] || {
      id,
      hidden: false,
      innerHTML: '',
      value: '',
      checked: false,
      open: false,
      classList: { _s: new Set(), add(c) { this._s.add(c); }, remove(c) { this._s.delete(c); }, toggle(c, on) { if (on === undefined ? !this._s.has(c) : on) this._s.add(c); else this._s.delete(c); }, contains(c) { return this._s.has(c); } },
      dataset: { tab: id === 'peepalTab' ? 'peepal' : id === 'duniyaTab' ? 'duniya' : '' },
      addEventListener() {},
      querySelector: () => null,
      querySelectorAll: () => [],
      setAttribute() {},
      click() {
        elements.__clicked = id;
      },
    });
  const peepal = el('peepalTab');
  const duniya = el('duniyaTab');
  if (o.peepalActive) peepal.classList.add('active');
  const counters = { fetch: 0, xhr: 0, analyticsInit: 0, logEvent: 0 };
  const ctx = {
    console: { log() {}, warn() {}, error() {} },
    localStorage: {
      getItem: (k) => (store.has(k) ? store.get(k) : null),
      setItem: (k, v) => store.set(k, String(v)),
      removeItem: (k) => store.delete(k),
    },
    navigator: { globalPrivacyControl: !!o.gpc, languages: ['en'] },
    document: {
      readyState: 'complete',
      documentElement: { classList: el('html').classList },
      getElementById: (id) => (o.ids && o.ids.indexOf(id) >= 0 ? el(id) : null),
      querySelector: (sel) => (/data-tab="peepal"/.test(sel) ? peepal : null),
      querySelectorAll: (sel) => (/tab-btn\[data-tab\]/.test(sel) ? [peepal, duniya] : []),
      addEventListener() {},
      dispatchEvent() {},
      createElement: () => el('created' + Math.random()),
      body: el('body'),
    },
    CustomEvent: function (type, init) {
      this.type = type;
      this.detail = init && init.detail;
    },
    MutationObserver: function () {
      this.observe = () => {};
    },
    fetch: async () => {
      counters.fetch++;
      return { ok: true, json: async () => ({ ok: true, data: { text: 'x' } }) };
    },
    XMLHttpRequest: function () {
      counters.xhr++;
    },
    firebase: {
      analytics: () => {
        counters.analyticsInit++;
        return { logEvent: () => counters.logEvent++, setAnalyticsCollectionEnabled() {} };
      },
    },
    t: tEn,
    tHtml: tEn,
    DigitalLayout: undefined,
    setTimeout: (fn) => fn && 0,
    Intl,
    Date,
    ...(o.globals || {}),
  };
  ctx.window = ctx;
  ctx.self = ctx;
  ctx.addEventListener = () => {};
  ctx.dispatchEvent = () => {};
  vm.createContext(ctx);
  ctx.ChaupaalRegion = o.region
    ? { getRegion: () => ({ country: o.region.country, subdivision: o.region.subdivision || null }), getSubdivision: () => o.region.subdivision || null, US_STATES: ['CA', 'NY'] }
    : undefined;
  const run = (file) => vm.runInContext(read(file), ctx, { filename: file });
  run('public/src/js/data/consent-ages.js');
  run('public/src/js/core/compliance.js');
  return { ctx, run, counters, el, elements, store };
}

(async () => {
  // ═══════════════ consent-age table ═══════════════
  console.log('\nConsent ages by region');
  {
    const fx = { DE: 16, FR: 15, GB: 13, US: 13, IN: 18 };
    Object.keys(fx).forEach((c) => assert(Ages.consentAge(c) === fx[c], `${c} → ${fx[c]}`));
    assert(Ages.consentAge('BR') === 16 && Ages.consentAge('') === 16 && Ages.DEFAULT.consentAge === 16, 'default (unlisted / unknown) → 16');
    assert(Ages.forCountry('IN').rule === 'parental' && Ages.forCountry('DE').rule === 'consent_basis' && Ages.forCountry('US').rule === 'none' && Ages.forCountry('GB').rule === 'none', 'rules: IN parental (DPDP), DE consent basis, US/UK none (13 = minimum age)');
    const eu = 'AT BE BG HR CY CZ DK EE FI FR DE GR HU IE IT LV LT LU MT NL PL PT RO SK SI ES SE'.split(' ');
    assert(eu.every((c) => Ages.forCountry(c).listed && Ages.consentAge(c) >= 13 && Ages.consentAge(c) <= 16), 'all 27 EU member states listed, 13–16');
    assert(Ages.table().every((r) => r.source && r.source.length > 6), 'every row cites a source');
    assert(/^\d{4}-\d{2}-\d{2}$/.test(Ages.CHECKED) && /REQUIRES LEGAL REVIEW/.test(read('public/src/js/data/consent-ages.js')), 'checked date + "requires legal review" note in the data file');
    assert(['DE', 'FR', 'GB', 'IN'].every((c) => C.trackingMode(c) === 'opt_in') && C.trackingMode('US') === 'opt_out', 'tracking: EU/UK/IN opt-in, US opt-out');
  }

  // ═══════════════ age rules ═══════════════
  console.log('\nAge rules');
  {
    assert(C.exactAge(dobYearsAgo(18), NOW) === 18 && C.exactAge(dobYearsAgo(18, 1), NOW) === 17, 'birthday-exact age (18 today; 17 the day before)');
    const kid = C.ageInfo({ dob: dobYearsAgo(12) }, { now: NOW });
    assert(kid.blocked && !kid.teen && C.ageGate({ dob: dobYearsAgo(12) }, 'peepal', { now: NOW }) === 'blocked', 'under 13 → blocked');
    assert(C.ageInfo({ dob: dobYearsAgo(13) }, { now: NOW }).teen, '13 → Teen mode');
    assert(!C.ageInfo({ dob: dobYearsAgo(18), teenMode: true, isMinor: true }, { now: NOW }).teen, 'Teen mode lifts at 18 even with stale teen flags');
    assert(C.ageInfo({ dob: dobYearsAgo(16), parentalConsent: { verified: true } }, { now: NOW, country: 'IN' }).teen, 'parental consent does not lift Teen mode');
    assert(C.ageInfo({ teenMode: true }, { now: NOW }).teen && !C.ageInfo({}, { now: NOW }).teen, 'no DOB: teen flag stands in; nothing → not teen');
    const lock = C.ageLockRecord(NOW);
    assert(C.ageLocked(lock, NOW + DAY) && !C.ageLocked(lock, NOW + (C.AGE_LOCK_DAYS + 1) * DAY) && Object.keys(lock).join() === 'until', `device lock ${C.AGE_LOCK_DAYS} days, stores only an expiry`);
    assert(C.dobPromptMode({ uid: 'x' }) === 'ask' && C.dobPromptMode({ dobPrompt: { skips: 1 } }) === 'require' && C.dobPromptMode({ dob: '2000-01-01' }) === null, 'existing users without DOB: ask once, then required');
    assert(C.ageGate({ dobPrompt: { skips: 1 } }, 'peepal') === 'need_dob' && C.ageGate({}, 'peepal') === 'ok', 'after the one skip, age-gated features need a DOB');

    const html = read('public/index.html');
    const signup = html.slice(html.indexOf('id="authRegStep1"'), html.indexOf('id="authRegStep2"'));
    assert(!/13\+|Must be 13|13 or older/.test(signup) && /data-i18n="privacy\.dob_hint"/.test(signup), 'signup age field gives no hint of the "right" answer');
    assert(!/\d/.test(EN['privacy.dob_hint']) && !/\d/.test(EN['privacy.register_legal']), 'age copy carries no threshold number');
    const ev = read('public/src/js/auth/auth-events.js');
    assert(!/you_must_be_13_or_older/.test(ev) && /abandonUnderAgeSignup/.test(ev) && /ChaupaalPrivacy\.ageLocked\(\)/.test(ev), 'under 13 at signup → no inline error, account abandoned, device lock checked');
    assert(/u\.delete\(\)/.test(ev.slice(ev.indexOf('function abandonUnderAgeSignup'), ev.indexOf('function abandonUnderAgeSignup') + 900)), 'a social sign-in Auth user without a profile is deleted (no data kept)');

    const admin = createFakeAdmin();
    await admin.db.collection('users').doc('k1').set({ username: 'k1' });
    const out = await privacy.setBirthdate(admin, 'k1', dobYearsAgo(11), {});
    const k1 = (await admin.db.collection('users').doc('k1').get()).data();
    assert(out.blocked && k1.deletionStatus === 'scheduled' && k1.purgeAfterMs <= Date.now() && k1.deletionReason === 'under_min_age' && !k1.dob, 'existing account answering under 13 → closed (purge next run), DOB not stored');
    assert((await purge.cancelDeletion(admin, 'k1')).error === 'NOT_CANCELLABLE', 'an under-13 closure cannot be cancelled');
    await admin.db.collection('users').doc('t1').set({ username: 't1', region: { country: 'DE' } });
    const t1 = await privacy.setBirthdate(admin, 't1', dobYearsAgo(15), {});
    const t1doc = (await admin.db.collection('users').doc('t1').get()).data();
    assert(t1.ok && t1doc.teenMode === true && t1doc.profileVisibility === 'Private' && t1doc.showLocation === false && t1doc.parentalConsent.required === true, 'teen DOB → Teen mode, private profile, location off, DE 15 needs a parent');
    assert((await privacy.setBirthdate(admin, 't1', dobYearsAgo(30), {})).error === 'DOB_ALREADY_SET', 'a stored DOB cannot be typed away');
  }

  // ═══════════════ Teen mode restrictions ═══════════════
  console.log('\nTeen mode');
  {
    const teen = { uid: 'tA', dob: dobYearsAgo(15) };
    const teen2 = { uid: 'tB', dob: dobYearsAgo(16) };
    const adult = { uid: 'aA', dob: dobYearsAgo(30) };
    assert(C.ageGate(teen, 'peepal') === 'ok' && C.ageGate(teen, 'stranger_matching') === 'teen' && C.ageGate(adult, 'stranger_matching') === 'ok', 'Peepal open to teens (L9); stranger matching stays 18+');
    const B = browser({ region: { country: 'US' }, peepalActive: true });
    B.ctx.userProfile = teen;
    B.ctx.currentUser = { uid: 'tA' };
    B.run('public/src/js/core/privacy-ui.js');
    B.ctx.ChaupaalPrivacyUI.applyTeenSurfaces();
    assert(B.el('peepalTab').hidden === false && !B.elements.__clicked && B.el('html').classList.contains('cp-teen-mode'), 'Peepal tab stays for teens; Teen mode class set');
    assert(!C.teenContentOk({ question: 'Best casino near me?' }) && !C.teenContentOk({ question: 'x', moderation: { ageRestricted: true } }) && C.teenContentOk({ question: 'Best books for exams?' }), 'teen Peepal feed: stricter filter + moderation age-restrictions');
    assert(/ChaupaalPrivacy\.discoveryOk\(q\)/.test(read('public/src/js/features/categories.js')), 'Peepal feed applies the teen filter');

    const G = browser({ region: { country: 'US' } });
    G.ctx.userProfile = teen;
    G.run('public/src/js/core/teen-mode.js');
    G.ctx.normId = (x) => x;
    let gateSrc = read('public/src/js/dangal/dangal-graduation.js');
    const fn = gateSrc.slice(gateSrc.indexOf('function ageGateStatus'), gateSrc.indexOf('function canSeeAgeGatedGames'));
    vm.runInContext(fn + '; this.ageGateStatus = ageGateStatus;', G.ctx);
    G.ctx.localAdultConfirmed = () => false;
    G.ctx.currentProfile = () => G.ctx.userProfile;
    assert(G.ctx.ageGateStatus(teen) === 'under_18' && G.ctx.ageGateStatus(adult) === 'ok', '18+ games: teen → under_18 (hidden), adult → ok');
    assert(G.ctx.ageGateStatus({ dob: dobYearsAgo(17), parentalConsent: { verified: true } }) === 'under_18', '18+ games stay hidden after parental consent');

    assert(C.canMessage(teen, teen2, {}).reason === 'teen_friends_only', 'teen ↔ teen strangers: DMs off by default');
    assert(C.canMessage(teen, { ...teen2, privacy: { teenNonFriendDms: true } }, {}).ok, '…on when the recipient allows other teens');
    assert(C.canMessage(adult, teen, {}).reason === 'adult_teen_stranger' && C.canMessage(teen, adult, {}).reason === 'teen_adult_stranger', 'adult ↔ teen strangers never');
    assert(C.canMessage(teen, adult, { friend: true }).ok && C.canMessage(adult, adult, {}).ok, 'friends always; adults unchanged');

    const P = privacy.privacyStateFrom({ ...teen, region: { country: 'US' } });
    assert(P.age.teen && P.teenRules.length === 10 && !P.prefs.personalizedRecs && !P.prefs.useAi, 'teen defaults: no personalised recs, AI off, 10 rules listed');
    assert(C.TEEN_RULES.every((r) => EN['privacy.teen_rule_' + r]), 'every Teen mode rule has Settings copy');

    const U = browser({ region: { country: 'US' } });
    U.ctx.db = null;
    U.run('public/src/js/core/users-public.js');
    const proj = U.ctx.UsersPublic.buildPublicProjection('tA', { ...teen, name: 'Tee', age: 15, gender: 'Female', city: 'Pune', profile: { currentCity: 'Pune', age: 15, gender: 'Female', bio: 'hi' } });
    assert(proj.teenMode === true && proj.age == null && proj.gender == null && proj.city == null && !(proj.profile && (proj.profile.age || proj.profile.gender || proj.profile.currentCity)) && !proj.dob, 'teen public card: marker only, no age / gender / city / DOB');
    const adultProj = U.ctx.UsersPublic.buildPublicProjection('aA', { ...adult, name: 'Ad', age: 30, city: 'Pune' });
    assert(!adultProj.teenMode && adultProj.age === 30, 'adult card unchanged');
    assert(/profileVisibility: 'Private', showLocation: false, activitySignalsOptOut: true/.test(read('public/src/js/auth/auth-events.js')), 'teen signup → private profile, location off, no behavioural signals');

    assert(!C.teenContentOk({ caption: 'Big poker night casino 🎰' }) && !C.teenContentOk({ nsfw: true }) && !C.teenContentOk({ category: 'dating' }) && C.teenContentOk({ caption: 'Sunday cricket in the park' }), 'stricter discovery filter (flags, lexicon, categories)');
    assert(/ChaupaalPrivacy\.discoveryOk/.test(read('public/src/js/features/duniya.js')) && /ChaupaalPrivacy\.discoveryOk/.test(read('public/src/js/features/categories.js')), 'filter wired into Duniya feed + Akhbaar news');
  }

  // ═══════════════ parental consent ═══════════════
  console.log('\nParental consent');
  {
    const admin = createFakeAdmin({ authUsers: { parent1: { email: 'mum@example.com' } } });
    await admin.db.collection('users').doc('parent1').set({ dob: dobYearsAgo(44), email: 'mum@example.com' });
    await admin.db.collection('users').doc('kid').set({ name: 'Riya', dob: dobYearsAgo(15), region: { country: 'IN' }, email: 'riya@example.com', parentalConsent: { verified: false, required: true } });
    let sent = null;
    const notified = [];
    const deps = { sendEmail: async (to, otp) => ((sent = { to, otp }), { sent: true }), notify: async (uid, p) => notified.push({ uid, p }) };
    assert((await parental.startParentalConsent(admin, 'kid', 'riya@example.com', { deps })).error === 'SELF_PARENT', 'own email rejected');
    const s1 = await parental.startParentalConsent(admin, 'kid', 'mum@example.com', { deps });
    assert(s1.ok && sent && sent.to === 'mum@example.com' && /^\d{6}$/.test(sent.otp) && s1.delivery.indexOf('email') >= 0 && notified.length === 1 && s1.sentTo === 'm***@example.com', 'code emailed to the parent (+ in-app when they have an account), contact masked');
    const pend = (await admin.db.collection('users').doc('kid').get()).data().parentalConsentPending;
    assert(pend && !JSON.stringify(pend).includes(sent.otp) && !JSON.stringify(pend).includes('mum@example.com'), 'pending record stores a hash, never the code or the raw contact');
    assert((await parental.verifyParentalConsent(admin, 'kid', '000000')).error === 'INVALID_OTP', 'wrong code rejected');
    const v = await parental.verifyParentalConsent(admin, 'kid', sent.otp);
    const kid = (await admin.db.collection('users').doc('kid').get()).data();
    const recs = (await admin.db.collection('parentalConsents').where('childUid', '==', 'kid').get()).docs.map((d) => d.data());
    assert(v.ok && kid.parentalConsent.verified && kid.parentalConsent.recordId && recs.length === 1, 'consent verified + recorded in parentalConsents');
    assert(recs[0].country === 'IN' && recs[0].consentAge === 18 && recs[0].rule === 'parental' && recs[0].method === 'email_otp' && recs[0].policyVersion === C.POLICY_VERSION && recs[0].parentUid === 'parent1', 'record: region, consent age, rule, method, policy version, parent');
    assert(kid.teenMode === true && C.ageInfo(kid).teen && !C.ageInfo(kid).needsParentalConsent && !kid.parentalConsentPending, 'Teen mode stays on; consent-dependent processing unlocked');
    await admin.db.collection('users').doc('us15').set({ dob: dobYearsAgo(15), region: { country: 'US' } });
    assert((await parental.startParentalConsent(admin, 'us15', 'mum@example.com', { deps })).error === 'NOT_REQUIRED', 'US 15-year-old: not required (COPPA covers under 13 only)');
    await admin.db.collection('users').doc('fr15').set({ dob: dobYearsAgo(15), region: { country: 'FR' } });
    await admin.db.collection('users').doc('de15').set({ dob: dobYearsAgo(15), region: { country: 'DE' } });
    assert(!C.ageInfo({ dob: dobYearsAgo(15) }, { country: 'FR' }).needsParentalConsent && C.ageInfo({ dob: dobYearsAgo(15) }, { country: 'DE' }).needsParentalConsent, 'FR 15 no parent; DE 15 needs one');
    assert((await parental.startParentalConsent(admin, 'de15', '+15550001111', { deps })).error === 'PARENT_PHONE_UNSUPPORTED', 'phone of a non-member parent → ask for email (no SMS provider)');
    const pendingProfile = { dob: dobYearsAgo(15), region: { country: 'IN' } };
    assert(!C.allows('analytics', { record: { version: C.POLICY_VERSION, choices: { analytics: true } }, country: 'IN', profile: pendingProfile }) && !C.aiAllowed(pendingProfile) && !C.personalizationAllowed(pendingProfile), 'until consent: analytics, AI, personalisation off');
  }

  // ═══════════════ export ═══════════════
  console.log('\nDownload my data');
  {
    const admin = createFakeAdmin();
    const db = admin.db;
    const media = 'https://res.cloudinary.com/demo/image/upload/v1700000000/avatars/me.jpg';
    await db.collection('users').doc('u1').set({ name: 'Asha', username: 'asha', email: 'a@x.com', photoURL: media, parentalConsentPending: { otpHash: 'SECRET' }, consents: { version: C.POLICY_VERSION, choices: { analytics: true } } });
    await db.collection('users').doc('u1').collection('journal').doc('j1').set({ text: 'dear diary', createdAt: new Date() });
    await db.collection('users').doc('u1').collection('following').doc('u2').set({ at: 1 });
    await db.collection('users').doc('u1').collection('chipTransactions').doc('c1').set({ delta: 50, reason: 'win' });
    await db.collection('users').doc('u1').collection('consentLog').doc('l1').set({ purpose: 'analytics', choice: 'granted' });
    await db.collection('duniya').doc('p1').set({ uid: 'u1', caption: 'my post', media: [{ url: 'https://res.cloudinary.com/demo/image/upload/v1/posts/p1.jpg' }] });
    await db.collection('duniya').doc('p9').set({ uid: 'u2', caption: 'their post' });
    await db.collection('duniya').doc('p9').collection('comments').doc('cm1').set({ uid: 'u1', text: 'nice one' });
    await db.collection('chats').doc('ch1').collection('messages').doc('m1').set({ uid: 'u1', text: 'hello from me' });
    await db.collection('chats').doc('ch1').collection('messages').doc('m2').set({ uid: 'u2', text: 'reply from them' });
    const realFetch = global.fetch;
    let fetched = 0;
    global.fetch = async (url) => {
      fetched++;
      return { ok: true, status: 200, arrayBuffer: async () => Buffer.from('IMG:' + url) };
    };
    const { job } = await exp.createExportJob(db, 'u1');
    const done = await exp.runExportJob(admin, job.id);
    global.fetch = realFetch;
    assert(done.status === 'ready' && done.storage === 'firestore' && done.mediaIncluded === 2 && fetched === 2, 'job runs → ready (Firestore fallback without a bucket), both uploads fetched');
    const notif = (await db.collection('notifications').doc('u1').collection('items').get()).docs.map((d) => d.data());
    assert(notif.length === 1 && notif[0].type === 'data_export_ready' && notif[0].previewKey === 'notifications.push.data_export_ready', 'ready notification sent');
    const pub = exp.publicJob(done);
    assert(pub.downloadUrl && /export=/.test(pub.downloadUrl) && /&t=[a-f0-9]{48}/.test(pub.downloadUrl) && pub.expiresAtMs - pub.readyAtMs === exp.LINK_DAYS * DAY, `download link expires after ${exp.LINK_DAYS} days`);
    const resStub = { setHeader() {} };
    const q = Object.fromEntries(new URL('https://x' + pub.downloadUrl).searchParams);
    const dl = await exp.serveExportDownload(admin, { query: q }, resStub);
    const files = readZip(dl.body);
    const names = files.map((f) => f.name);
    const get = (n) => JSON.parse(files.find((f) => f.name === n).data.toString('utf8'));
    assert(dl.status === 200 && ['README.txt', 'profile.json', 'settings.json', 'account.json', 'consents.json', 'relationships.json', 'posts.json', 'comments.json', 'messages_sent.json', 'games.json', 'notifications.json', 'media/index.json'].every((n) => names.includes(n)), 'ZIP has README + profile, settings, account, consents, relationships, posts, comments, messages, games, notifications');
    assert(names.filter((n) => /^media\/\d{3}_/.test(n)).length === 2 && files.find((f) => /me\.jpg$/.test(f.name)).data.toString().startsWith('IMG:'), 'uploaded media embedded');
    const msgs = get('messages_sent.json');
    assert(msgs.length === 1 && msgs[0].text === 'hello from me' && msgs[0].chatId === 'ch1', 'messages: only the ones the user sent');
    assert(get('comments.json')[0].text === 'nice one' && get('posts.json').duniya.length === 1 && get('posts.json').duniya[0].caption === 'my post', 'own comments + own posts only');
    assert(get('relationships.json').following[0].id === 'u2' && get('games.json').chipLedger[0].delta === 50 && get('consents.json').log.length === 1, 'relationships, chip ledger, consent log');
    assert(!JSON.stringify(get('profile.json')).includes('SECRET') && get('account.json').journal[0].text === 'dear diary', 'secrets stripped; every account sub-collection included');
    assert((await exp.serveExportDownload(admin, { query: { export: q.export, t: 'f'.repeat(48) } }, resStub)).status === 404, 'wrong token → 404');
    assert((await exp.createExportJob(db, 'u1')).reused === true, 'one live export at a time (reused)');
    await db.collection('exportJobs').doc(job.id).set({ expiresAtMs: Date.now() - 1000 }, { merge: true });
    assert((await exp.serveExportDownload(admin, { query: q }, resStub)).status === 410, 'expired link → 410');
    const sweep = await exp.processExportJobs(admin, {});
    const after = (await db.collection('exportJobs').doc(job.id).get()).data();
    assert(sweep.expired === 1 && after.status === 'expired' && after.token === null && !admin.docs.has(`exportJobs/${job.id}/chunks/000`) && exp.publicJob({ id: job.id, ...after }).downloadUrl === null, 'scheduler expires the link and deletes the file');

    const g = createFakeAdmin({ storage: true });
    process.env.FIREBASE_STORAGE_BUCKET = 'test-bucket';
    await g.db.collection('users').doc('u5').set({ name: 'G' });
    const { job: gj } = await exp.createExportJob(g.db, 'u5');
    const gd = await exp.runExportJob(g, gj.id, { skipMedia: true });
    const gq = Object.fromEntries(new URL('https://x' + exp.publicJob(gd).downloadUrl).searchParams);
    const red = await exp.serveExportDownload(g, { query: gq }, resStub);
    delete process.env.FIREBASE_STORAGE_BUCKET;
    assert(gd.storage === 'gcs' && g.storageApi.files.has(`exports/u5/${gj.id}.zip`) && red.status === 302 && /storage\.fake\/test-bucket\/exports\/u5\//.test(red.location), 'with a bucket: ZIP in Storage, link redirects to a short signed URL');
    const mc = read('api/media-config.js');
    assert(/action === 'request_export'/.test(mc) && /action === 'export_status'/.test(mc) && /req\.query\.export/.test(mc) && /'account_export'/.test(mc), 'request / status / download folded into media-config; rate-limited');
  }

  // ═══════════════ deletion cascade ═══════════════
  console.log('\nDelete my account');
  {
    const admin = createFakeAdmin({ authUsers: { gone: { email: 'g@x.com' }, other: { email: 'o@x.com' } } });
    const db = admin.db;
    const set = (p, d) => {
      const parts = p.split('/');
      let ref = db.collection(parts[0]).doc(parts[1]);
      for (let i = 2; i < parts.length; i += 2) ref = ref.collection(parts[i]).doc(parts[i + 1]);
      return ref.set(d);
    };
    await set('users/gone', { name: 'Gone', username: 'gone', phone: '+911234567890', photoURL: 'https://res.cloudinary.com/demo/image/upload/v1/a.jpg' });
    await set('users/gone/fcmTokens/t1', { token: 'x' });
    await set('users/gone/consentLog/l1', { purpose: 'analytics' });
    await set('users/gone/following/other', { at: 1 });
    await set('users/gone/followers/other', { at: 1 });
    await set('users/other', { name: 'Other', relationshipCounts: { followers: 3, following: 3 } });
    await set('users/other/followers/gone', { at: 1 });
    await set('users/other/following/gone', { at: 1 });
    await set('users_public/gone', { uid: 'gone', name: 'Gone', username: 'gone', photoURL: 'x', bio: 'b' });
    await set('users_public/gone/friend_projection/card', { bio: 'b' });
    await set('usernames/gone', { uid: 'gone', profileId: 'primary' });
    await set('usernames/gone_old', { uid: 'gone' });
    await set('usernames/other', { uid: 'other' });
    await set('phoneIndex/+911234567890', { uid: 'gone', email: 'g@x.com' });
    await set('phoneIndex/+919999999999', { uid: 'other' });
    await set('duniya/gp', { uid: 'gone', caption: 'mine' });
    await set('duniya/gp/comments/oc', { uid: 'other', text: 'on gone post' });
    await set('duniya/op', { uid: 'other', caption: 'theirs' });
    await set('duniya/op/comments/gc', { uid: 'gone', text: 'gone wrote this', user: { uid: 'gone', name: 'Gone' } });
    await set('duniya/op/likes/gone', { uid: 'gone' });
    await set('peepal/gq', { uid: 'gone', question: 'q?' });
    await set('chats/dm', { participants: ['gone', 'other'] });
    await set('chats/dm/messages/m1', { uid: 'gone', text: 'secret from gone', name: 'Gone' });
    await set('chats/dm/messages/m2', { uid: 'other', text: 'from other' });
    await set('notifications/gone/items/n1', { type: 'x' });
    await set('userModels/gone', { topics: {} });
    await set('chaupaalUserState/gone', { x: 1 });
    await set('translateUsage/2026-11-13_gone', { uid: 'gone', n: 3 });
    await set('exportJobs/e1', { uid: 'gone', status: 'ready' });
    await set('exportJobs/e1/chunks/000', { i: 0 });
    await set('chaupaalTransactions/tx1', { uid: 'gone', amount: 99, email: 'g@x.com' });
    await set('parentalConsents/pc1', { childUid: 'gone' });
    await set('daily_scores/2026-11-13/scores/gone', { uid: 'gone', score: 5 });
    await set('dangalMatches/mt1', { players: { gone: { won: true }, other: { won: false } } });

    const sched = await purge.scheduleDeletion(admin, 'gone', { now: NOW });
    const g1 = (await db.collection('users').doc('gone').get()).data();
    assert(sched.status === 'scheduled' && g1.purgeAfterMs === NOW + 30 * DAY && admin.authApi.revoked.includes('gone') && (await db.collection('users_public').doc('gone').get()).data().hiddenFromDiscovery, '30-day grace: scheduled, signed out everywhere, hidden');
    const cancel = await purge.cancelDeletion(admin, 'gone');
    assert(cancel.ok && !(await db.collection('users').doc('gone').get()).data().deletionStatus, 'log in within 30 days → cancel restores the account');
    await purge.scheduleDeletion(admin, 'gone', { now: NOW });
    assert((await purge.processDueDeletions(admin, { now: NOW + 29 * DAY, skipMedia: true })).purged === 0, 'nothing purged inside the grace period');
    const r = await purge.processDueDeletions(admin, { now: NOW + 31 * DAY, skipMedia: true });
    const has = (p) => admin.docs.has(p);
    const data = (p) => admin.docs.get(p);
    assert(r.purged === 1, 'purged after 30 days');
    assert(!has('users/gone') && !has('users/gone/fcmTokens/t1') && !has('users/gone/consentLog/l1'), 'users/{uid} + sub-collections (push tokens, consent log) deleted');
    assert(!has('usernames/gone') && !has('usernames/gone_old') && has('usernames/other'), 'usernames/{handle} freed (all of theirs, nobody else’s)');
    assert(!has('phoneIndex/+911234567890') && has('phoneIndex/+919999999999'), 'phoneIndex/{e164} deleted');
    assert(!has('duniya/gp') && !has('duniya/gp/comments/oc') && !has('peepal/gq'), 'own posts (+ their sub-collections) deleted');
    assert(has('duniya/op') && data('duniya/op/comments/gc').text === '' && data('duniya/op/comments/gc').authorDeleted === true && data('duniya/op/comments/gc').user.name === '', 'their comment on someone else’s post redacted, thread kept');
    assert(data('chats/dm/messages/m1').text === '' && data('chats/dm/messages/m1').name === '' && data('chats/dm/messages/m1').authorDeleted && data('chats/dm/messages/m2').text === 'from other', 'their messages redacted; the other person’s untouched');
    assert(data('chats/dm').deletedParticipants.includes('gone') && has('dangalMatches/mt1'), 'shared chat marked; the other player’s match history kept');
    assert(!has('duniya/op/likes/gone') && !has('daily_scores/2026-11-13/scores/gone'), 'likes + scores removed');
    assert(!has('users/other/followers/gone') && !has('users/other/following/gone') && data('users/other').relationshipCounts.followers === 2, 'graph edges on the other user removed, counts adjusted');
    assert(!has('notifications/gone/items/n1') && !has('userModels/gone') && !has('chaupaalUserState/gone') && !has('translateUsage/2026-11-13_gone') && !has('parentalConsents/pc1'), 'notifications, AI user model, cadence state, translate usage, consent records deleted');
    assert(!has('exportJobs/e1') && !has('exportJobs/e1/chunks/000'), 'export jobs + files deleted');
    assert(data('chaupaalTransactions/tx1').uid.startsWith('deleted:') && !data('chaupaalTransactions/tx1').email && data('chaupaalTransactions/tx1').amount === 99, 'payment record retained, pseudonymised');
    const tomb = data('users_public/gone');
    assert(tomb.deleted === true && tomb.name === '' && !tomb.bio && !has('users_public/gone/friend_projection/card'), 'users_public → PII-free tombstone');
    assert(admin.rtdb.removed.includes('status/gone') && admin.rtdb.removed.includes('mehfilInbox/gone'), 'RTDB presence + Mehfil inbox removed');
    const authIdx = admin.log.indexOf('auth.deleteUser gone');
    const userIdx = admin.log.indexOf('recursiveDelete users/gone');
    assert(userIdx >= 0 && authIdx > userIdx && admin.log.slice(authIdx + 1).every((x) => !/^(delete|recursiveDelete|rtdb\.remove) /.test(x)) && admin.authApi.deleted.includes('gone'), 'Firebase Auth user deleted last (no data deletes after it)');
    const audit = [...admin.docs.entries()].find(([p]) => p.startsWith('accountDeletions/'));
    assert(audit && !JSON.stringify(audit).includes('gone') && !JSON.stringify(audit).includes('g@x.com') && audit[1].counts.usernames === 2, 'deletion audit row without personal data');
    assert(purge.cloudinaryPublicId('https://res.cloudinary.com/demo/image/upload/w_400,c_fill/v17/avatars/me.jpg').publicId === 'avatars/me', 'Cloudinary public_id parsed for media purge');
    const map = purge.CASCADE.map((c) => c.store + ':' + c.path).join('\n');
    assert(['usernames/', 'phoneIndex/', 'rtdb:', 'storage:', 'cloudinary:', 'auth:', 'fcmTokens', 'translateUsage', 'userModels'].every((k) => map.includes(k)), 'cascade map documents every store');

    const U = browser({ region: { country: 'US' } });
    U.ctx.db = null;
    U.run('public/src/js/core/users-public.js');
    assert(U.ctx.UsersPublic.withDeletedLabel(tomb).name === 'Deleted user' && C.publicName(tomb, 'Deleted user') === 'Deleted user', 'tombstone renders "Deleted user"');
    const chat = read('public/src/js/features/baithak-chat.js');
    assert(/m\.authorDeleted[\s\S]{0,400}privacy\.deleted_user[\s\S]{0,200}privacy\.message_removed/.test(chat) && /authorDeleted: !!m\.authorDeleted/.test(read('public/src/js/core/baithak-transport.js')), 'chat bubble: "Deleted user" + "Message removed"');
    assert(/authorGone \? tHtml\('privacy\.deleted_user'\)/.test(read('public/src/js/core/comments.js')) && /deletedParticipants/.test(read('public/src/js/features/baithak-data.js')), 'comments + inbox render "Deleted user"');
    const ui = read('public/src/js/core/privacy-ui.js');
    assert(/cancel_account_deletion/.test(ui) && /deletion_banner/.test(ui) && /removeAccountFromDevice/.test(ui), 'login during grace shows the cancel banner; only this account leaves the device switcher');
    assert(/processDueDeletions/.test(read('api/chaupaal-scheduler.js')), 'scheduler runs the purge');
  }

  // ═══════════════ consent: no analytics before consent (network mock) ═══════════════
  console.log('\nConsent manager');
  {
    const B = browser({ region: { country: 'DE' } });
    B.run('public/src/js/core/analytics.js');
    B.ctx.trackEvent('app_open', {});
    B.ctx.trackEvent('client_error', {});
    assert(B.counters.analyticsInit === 0 && B.counters.logEvent === 0 && B.counters.fetch === 0 && B.counters.xhr === 0, 'DE before consent: Analytics never initialised, no events, no network');
    assert(B.ctx.ChaupaalPrivacy.status().needsPrompt, 'DE: banner needed on first run');
    B.ctx.ChaupaalPrivacy.setConsent({ analytics: false, crash: false, marketing: false }, { remote: false });
    B.ctx.trackEvent('app_open', {});
    assert(B.counters.analyticsInit === 0 && B.counters.logEvent === 0 && !B.ctx.ChaupaalPrivacy.status().needsPrompt, 'Reject all → still nothing, no re-prompt');
    B.ctx.ChaupaalPrivacy.setConsent({ analytics: true, crash: false, marketing: false }, { remote: false });
    B.ctx.trackEvent('app_open', {});
    B.ctx.trackEvent('client_error', {});
    assert(B.counters.analyticsInit === 1 && B.counters.logEvent === 1, 'analytics on → events flow; crash still off');
    const US = browser({ region: { country: 'US' } });
    US.run('public/src/js/core/analytics.js');
    US.ctx.trackEvent('app_open', {});
    assert(US.counters.logEvent === 1 && !US.ctx.ChaupaalPrivacy.status().needsPrompt, 'US (opt-out): on by default, no banner');
    const NoMod = browser({ region: { country: 'US' } });
    NoMod.ctx.ChaupaalPrivacy = undefined;
    NoMod.run('public/src/js/core/analytics.js');
    NoMod.ctx.trackEvent('app_open', {});
    assert(NoMod.counters.logEvent === 0, 'no consent module → deny');
    const html = read('public/index.html');
    assert(!/fonts\.googleapis|fonts\.gstatic|googletagmanager|gtag\(/.test(html) && !/fonts\.googleapis/.test(read('public/sw.js')) && fs.existsSync(path.join(ROOT, 'public/src/styles/fonts.css')), 'no Google Fonts / tag manager on first paint (fonts self-hosted)');
    assert(/C\.trackingMode\(P\.region\(\)\.country\) === 'opt_in'\) return Promise\.resolve\(false\)/.test(read('public/src/js/core/i18n-layout.js')), 'script web fonts never fetched in opt-in regions');
    assert(/ChaupaalPrivacy\.allows\('crash'\)/.test(read('public/src/js/core/runtime-guard.js')), 'crash reports (clientErrorReports) gated on consent');
    const banner = read('public/src/js/core/privacy-ui.js');
    const btns = banner.match(/class="btn cp-consent-btn" data-consent="(reject|accept)"/g) || [];
    assert(btns.length === 2 && /data-consent="choose"/.test(banner), 'banner: Accept / Reject with identical styling + granular Choose');

    const admin = createFakeAdmin();
    await admin.db.collection('users').doc('c1').set({ region: { country: 'DE' } });
    const FV = admin.firestore.FieldValue;
    const logged = await privacy.logConsent(admin.db, FV, 'c1', { choices: { analytics: true }, source: 'banner' });
    const rows = (await admin.db.collection('users').doc('c1').collection('consentLog').get()).docs.map((d) => d.data());
    const sum = (await admin.db.collection('users').doc('c1').get()).data().consents;
    assert(logged.logged === 3 && rows.length === 3 && rows.every((x) => x.policyVersion === C.POLICY_VERSION && x.region === 'DE' && x.at instanceof Date && ['granted', 'denied'].includes(x.choice)), 'consent log: purpose, choice, policy version, server timestamp, region');
    assert(rows.find((x) => x.purpose === 'analytics').choice === 'granted' && rows.find((x) => x.purpose === 'marketing').choice === 'denied' && sum.choices.analytics === true, 'per-purpose rows + summary on the user doc');
    const old = { version: '2025-01-01', choices: { analytics: true, crash: true, marketing: true } };
    const bumpDE = C.consentStatus(old, { country: 'DE' });
    const bumpUS = C.consentStatus({ ...old, choices: { analytics: false, crash: true, marketing: true } }, { country: 'US' });
    assert(bumpDE.needsPrompt && !bumpDE.choices.analytics, 'policy bump (opt-in): re-prompt, everything off until answered');
    assert(bumpUS.needsPrompt && bumpUS.choices.analytics === false && bumpUS.choices.crash === true, 'policy bump (opt-out): re-prompt, earlier choices kept');
    assert(!C.consentStatus({ version: C.POLICY_VERSION, choices: {} }, { country: 'DE' }).needsPrompt, 'current version → no prompt');
    assert(!C.legalCurrent({ terms: '2025-01-01', privacy: C.POLICY_VERSION }) && C.legalCurrent({ terms: C.TERMS_VERSION, privacy: C.POLICY_VERSION }), 'legal acceptance re-asked when a version changes');
    const acc = await privacy.acceptLegal(admin.db, FV, 'c1', { source: 'signup' });
    assert(acc.current && (await admin.db.collection('users').doc('c1').get()).data().legalAcceptance.terms === C.TERMS_VERSION, 'acceptance recorded at signup');
    const rules = read('firebase/firestore.rules');
    assert(/'consents',[\s\S]{0,80}'legalAcceptance',[\s\S]{0,40}'privacy'/.test(rules) && /match \/consentLog\/\{entryId\} \{\s*allow read: if isOwner\(userId\);\s*allow write: if false;/.test(rules), 'consents / legal / privacy prefs server-written; consent log owner-read only');
    assert(/setOnce\('dob'\)/.test(rules) && /parentalConsentUnchangedOrUnverified\(\)/.test(rules), 'clients cannot change a stored DOB or self-verify parental consent');
  }

  // ═══════════════ CCPA ═══════════════
  console.log('\nCCPA');
  {
    assert(C.showDoNotSell({ country: 'US', subdivision: 'CA' }) && !C.showDoNotSell({ country: 'US', subdivision: 'NY' }) && !C.showDoNotSell({ country: 'US' }) && !C.showDoNotSell({ country: 'GB' }), 'shown only for US-CA');
    const render = (region, gpc) => {
      const B = browser({ region, gpc, ids: ['privacyDataHost'] });
      B.ctx.userProfile = { uid: 'z', dob: dobYearsAgo(30) };
      B.ctx.currentUser = { uid: 'z' };
      B.run('public/src/js/core/privacy-ui.js');
      B.ctx.ChaupaalPrivacyUI.renderPrivacyData();
      return B.el('privacyDataHost').innerHTML;
    };
    const ca = render({ country: 'US', subdivision: 'CA' });
    assert(/id="toggleDoNotSell"/.test(ca) && !/id="toggleDoNotSell"/.test(render({ country: 'US', subdivision: 'NY' })) && !/id="toggleDoNotSell"/.test(render({ country: 'IN' })), 'Settings renders the control for CA only');
    assert(/id="toggleDoNotSell" checked disabled/.test(render({ country: 'US', subdivision: 'CA' }, true)), 'Global Privacy Control → on and locked');
    const R = browser({ globals: { Intl: { DateTimeFormat: function () { return { resolvedOptions: () => ({ timeZone: 'America/Los_Angeles' }) }; }, Locale: Intl.Locale, DisplayNames: Intl.DisplayNames } } });
    R.run('public/src/js/core/region.js');
    R.ctx.ChaupaalRegion.setRegion('US');
    const guess = R.ctx.ChaupaalRegion.getSubdivision();
    R.ctx.ChaupaalRegion.setSubdivision('NY');
    assert(guess === 'CA' && R.ctx.ChaupaalRegion.getSubdivision() === 'NY' && R.ctx.ChaupaalRegion.getRegion().subdivision === 'NY', 'US state: Pacific-time guess, user pick wins');
    const admin = createFakeAdmin();
    await admin.db.collection('users').doc('ca').set({ region: { country: 'US', subdivision: 'CA' } });
    const st = await privacy.setPrivacyPrefs(admin.db, admin.firestore.FieldValue, 'ca', { doNotSell: true });
    assert(st.prefs.doNotSell && st.showDoNotSell && (await admin.db.collection('users').doc('ca').get()).data().privacy.doNotSell === true, 'choice recorded server-side');
  }

  // ═══════════════ recommendations opt-out ═══════════════
  console.log('\nPersonalised recommendations');
  {
    const RR = require('../server-lib/retrieve-rank');
    const model = { coldStart: false, behavioral: true, topics: {}, games: { wordguess: 0.95 }, formats: {}, people: {} };
    const games = [
      { id: 'chess', plays: 10 },
      { id: 'wordguess', plays: 2 },
      { id: 'ludo', plays: 50 },
    ];
    const order = (viewer) => {
      const optedOut = RR.isOptedOutUser(viewer);
      return RR.rankManchLibrary({ games, model: optedOut ? null : model, limit: 10 }).map((g) => g.id);
    };
    const on = order({ uid: 'v' });
    const off = order({ uid: 'v', privacy: { personalizedRecs: false } });
    assert(!RR.isOptedOutUser({ uid: 'v' }) && RR.isOptedOutUser({ privacy: { personalizedRecs: false } }) && RR.isOptedOutUser({ dob: dobYearsAgo(15) }), 'isOptedOutUser: switch off / Teen mode → non-personalised');
    assert(on.indexOf('wordguess') < off.indexOf('wordguess') && off[0] === 'ludo', `ranking switches (on: ${on.join(',')} · off: ${off.join(',')})`);
    const pr = read('api/peepal-reactions.js');
    assert(/isOptedOutUser\(viewer\)/.test(pr) && /model: optedOut \? null : model/.test(pr), 'rank_content uses the same switch');
    const admin = createFakeAdmin();
    await admin.db.collection('users').doc('tt').set({ dob: dobYearsAgo(15) });
    const st = await privacy.setPrivacyPrefs(admin.db, admin.firestore.FieldValue, 'tt', { personalizedRecs: true });
    assert(st.prefs.personalizedRecs === false, 'a teen cannot switch behavioural personalisation on (server lock)');
  }

  // ═══════════════ Use AI features ═══════════════
  console.log('\nUse AI features');
  {
    const us = { region: { country: 'US' } };
    assert(!privacy.aiAllowedForUser({ privacy: { useAi: false } }) && privacy.aiAllowedForUser({}) && !privacy.aiAllowedForUser({ ...us, dob: dobYearsAgo(15) }) && privacy.aiAllowedForUser({ ...us, dob: dobYearsAgo(15), privacy: { useAi: true } }), 'switch off / teen default off (teen may opt in)');
    assert(!privacy.aiAllowedForUser({ dob: dobYearsAgo(15), privacy: { useAi: true } }), 'unknown region (default 16): a 15-year-old stays locked until a parent approves');
    const { createDangalAI } = require('../server-lib/dangal-ai');
    let calls = 0;
    const ai = createDangalAI({ env: { AI_FEATURES_ENABLED: 'true' }, callAI: async () => ((calls += 1), { text: '{}' }) });
    const out = await ai.run('coachExplain', { game: 'chess', stats: { moves: 10 } }, { uid: 'u', userAiOff: true });
    assert(out.source === 'fallback' && out.reason === 'user_off' && calls === 0, 'Dangal AI hooks: deterministic fallback, no provider call');
    const { createTranslator } = require('../server-lib/translate');
    const seen = [];
    const tr = createTranslator({
      env: { AI_FEATURES_ENABLED: 'true', ANTHROPIC_API_KEY: 'k' },
      callAI: async (o) => {
        seen.push(o.messages[0].content);
        const segs = JSON.parse(o.messages[0].content).segments;
        return { text: JSON.stringify({ segments: segs.map((s) => 'नमस्ते ' + s) }) };
      },
    });
    const res = await tr.translate('u', { target: 'hi', items: [{ text: 'private hello friend', scope: 'private', surface: 'baithak_msg' }, { text: 'public hello world', scope: 'public', surface: 'duniya_post' }] }, { userAiOff: true });
    assert(res.items[0].error === 'ai_off' && !seen.join(' ').includes('private hello friend'), 'Translate: private text never sent to the AI translator');
    const B = browser({ region: { country: 'US' } });
    B.ctx.userProfile = { uid: 'u', dob: dobYearsAgo(30), privacy: { useAi: false } };
    B.ctx.isAiFeaturesEnabled = async () => true;
    B.run('public/src/js/ai/call-ai.js');
    let err = null;
    try {
      await B.ctx.callAI({ messages: [{ role: 'user', content: 'my private journal' }] });
    } catch (e) {
      err = e;
    }
    assert(err && err.code === 'AI_OFF_BY_USER' && B.counters.fetch === 0, 'client callAI: refused before any network call');
    assert(/AI_OFF_BY_USER/.test(read('api/anthropic.js')) && /aiAllowedForUser/.test(read('api/chaupaal-chat.js')) && /userAiOff: await userAiOff/.test(read('api/media-config.js')), '/api/ai, Chaupaal chat, dangal_ai + translate check the switch server-side');
    assert(/aiAllowedForUser/.test(read('server-lib/companion-outreach.js')) && /aiAllowedForUser/.test(read('server-lib/akhbaar-personalize.js')) && /aiAllowedForUser/.test(read('api/chaupaal-scheduler.js')), 'scheduled AI on profiles (companion, Akhbaar personalisation, weekly picks) respects it');
    assert(/marketingAllowed/.test(read('server-lib/retention-d1d7.js')) && /marketingAllowed/.test(read('server-lib/companion-outreach.js')), 'marketing notifications respect the marketing consent');
  }

  // ═══════════════ legal drafts ═══════════════
  console.log('\nTerms / Privacy drafts');
  {
    L.KINDS.forEach((k) => {
      const html = L.render(k, tEn);
      const n = (html.match(/data-legal-draft/g) || []).length;
      assert(n === 2 && html.includes('Draft — requires legal review'), `${k}: review banner + footer`);
    });
    assert(['terms', 'privacy', 'guidelines', 'teens', 'processors'].every((k) => L.KINDS.includes(k)), 'Terms, Privacy, Guidelines, Children & Teens, Service providers');
    const all = L.KINDS.map((k) => L.keysFor(k).map((x) => EN[x]).join(' ')).join(' ');
    assert(/Grievance Officer \(India\): \[name\]/.test(all) && /no cash value/.test(all) && /legal bases|legal basis/i.test(all) && /International transfers/.test(all) && /retention|How long we keep/i.test(all), 'covers grievance officer placeholder, chips, legal bases, transfers, retention');
    assert(/translat/i.test(EN['legal.privacy_ai_2']) && /never stored/.test(EN['legal.privacy_ai_3']) && /30 days/.test(EN['legal.privacy_ai_4']), 'AI + translation processing documented (L7 TODO picked up)');
    assert(L.PROCESSORS.length >= 14 && L.PROCESSORS.every(([id]) => EN['legal.proc_' + id + '_purpose'] && EN['legal.proc_' + id + '_data']), 'processors list complete');
    const fr = read('public/src/js/core/first-run.js');
    assert(/L\.render\(docKind\)/.test(fr) && !/TODO\(L8\)/.test(fr), 'openLegalSheet renders the drafts');
    const html = read('public/index.html');
    assert(/data-legal="guidelines"/.test(html) && /class="settings-legal-footer"/.test(html) && /data-legal="processors"/.test(html) && /data-legal="teens"/.test(html), 'links from signup, Settings footer and the parent screen');
    assert(/TERMS_VERSION/.test(read('public/src/js/core/compliance.js')) && /legal_accept/.test(read('public/src/js/core/privacy-ui.js')), 'versioned; acceptance on signup + material change');
  }

  // ═══════════════ wiring ═══════════════
  console.log('\nWiring');
  {
    const apis = fs.readdirSync(path.join(ROOT, 'api')).filter((f) => f.endsWith('.js'));
    assert(apis.length === 12, `api/*.js === 12 (got ${apis.length})`);
    const mc = read('api/media-config.js');
    ['privacy_state', 'consent_log', 'privacy_prefs', 'set_birthdate', 'skip_dob_prompt', 'legal_accept', 'request_export', 'export_status', 'request_account_deletion', 'cancel_account_deletion'].forEach((a) =>
      assert(mc.includes(`'${a}'`), `media-config action ${a}`)
    );
    const idx = read('public/index.html');
    assert(idx.indexOf('consent-ages.js') < idx.indexOf('compliance.js') && idx.indexOf('compliance.js') < idx.indexOf('analytics.js') && /privacy-ui\.js/.test(idx) && /id="settingsPrivacyData"/.test(idx), 'scripts load in order; Settings → Privacy & data');
  }

  console.log(`\n${passed} passed, ${failed} failed`);
  process.exit(failed ? 1 : 0);
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
