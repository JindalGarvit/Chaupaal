#!/usr/bin/env node
/**
 * Global L9 — Compliance 2: notice & action, statements of reasons, appeals, transparency, store readiness.
 *   reasons    report taxonomy incl. the illegal-content country + legal-basis sub-picker (DSA Art. 16)
 *   queue      priority order (child safety + imminent harm first), SLA deadlines, overdue
 *   india      IT Rules 24 h acknowledge / 15-day resolve timers + scheduler reminders
 *   sor        statement of reasons in the affected user's language with every required field
 *   appeals    routed to a different moderator; outcome notices; frivolous-appeal limit
 *   reporter   privacy-safe outcome notice
 *   why        "Why am I seeing this?" on Duniya, Peepal, Akhbaar, Dangal suggestions
 *   report     transparency aggregates vs fixtures, CSV, DSA export shape
 *   store      listing length limits for every language, screenshot plan, privacy labels fresh,
 *              web deletion page needs login, region prices, localised manifest + hreflang
 */
'use strict';

const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = path.join(__dirname, '..');
const read = (p) => fs.readFileSync(path.join(ROOT, p), 'utf8');
const { createFakeAdmin } = require('./lib/fake-admin');
const M = require('../server-lib/moderation');
const srv = require('../server-lib/i18n-server');

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
const HOUR = 3600000;
const DAY = 24 * HOUR;
const NOW = Date.UTC(2026, 10, 13, 12);

async function seed(admin) {
  const db = admin.db;
  await db.collection('users').doc('rep').set({ lang: 'en', region: { country: 'IN' } });
  await db.collection('users').doc('rep2').set({ lang: 'en', region: { country: 'DE' } });
  await db.collection('users').doc('author').set({ lang: 'hi', region: { country: 'IN' } });
  await db.collection('duniya').doc('p1').set({ uid: 'author', caption: 'a post' });
  return db;
}
const notifs = async (db, uid) => (await db.collection('notifications').doc(uid).collection('items').get()).docs.map((d) => d.data());

(async () => {
  // ═══════════════ reasons + illegal sub-picker ═══════════════
  console.log('\nReport reasons');
  {
    assert(M.REASON_IDS.length === 11 && ['child_safety', 'self_harm', 'violence', 'illegal', 'sexual', 'hate', 'harassment', 'spam', 'impersonation', 'ip', 'other'].every((r) => M.REASONS[r]), '11 reasons incl. child safety, self-harm, illegal, IP, impersonation');
    const base = { targetType: 'duniya_post', targetId: 'p1', targetUid: 'author' };
    assert(M.normalizeReport({ ...base, reason: 'illegal' }, { now: NOW }).error === 'ILLEGAL_DETAILS_REQUIRED', 'illegal without country + legal basis → rejected');
    assert(M.normalizeReport({ ...base, reason: 'illegal', illegalCountry: 'DE', legalBasis: 'hate_speech_law' }, { now: NOW }).error === 'GOOD_FAITH_REQUIRED', 'illegal without the good-faith statement → rejected');
    const ok = M.normalizeReport({ ...base, reason: 'illegal', illegalCountry: 'de', legalBasis: 'hate_speech_law', lawRef: 'StGB §130', goodFaith: true }, { now: NOW });
    assert(ok.ok && ok.report.illegal.country === 'DE' && ok.report.illegal.basis === 'hate_speech_law' && ok.report.illegal.lawRef === 'StGB §130', 'illegal: country + basis + law reference recorded');
    assert(M.LEGAL_BASES.length >= 8 && M.LEGAL_BASES.every((b) => EN['moderation.basis_' + b]), 'legal-basis picker options all have copy');
    assert(M.normalizeReport({ ...base, reasonCode: 'fake_profile' }, { now: NOW }).report.reason === 'impersonation', 'legacy flag codes map onto the new taxonomy');
    const cs = M.normalizeReport({ ...base, reason: 'child_safety', snapshot: 'should not be kept' }, { now: NOW });
    assert(cs.report.snapshot === null, 'child safety: no copy of the content is stored');
    const ui = read('public/src/js/core/report.js');
    assert(/id="cpRepCountry"/.test(ui) && /id="cpRepBasis"/.test(ui) && /id="cpRepGoodFaith"/.test(ui) && /selfHarm\(r\)/.test(ui) && /childSafety\(r\)/.test(ui) && /id="cpRepContact"/.test(ui), 'Report sheet: country + basis + good faith, regional support resources, optional contact');
    const R = require('../public/src/js/data/safety-resources.js');
    assert(R.selfHarm('IN').length >= 1 && R.selfHarm('US')[0].contact === '988' && R.selfHarm('ZZ')[0].href.includes('findahelpline') && R.childSafety('US')[0].href.includes('cybertip'), 'self-harm helplines + child-safety hotlines by region (fallback directory)');
    ['public/src/js/core/touch.js', 'public/src/js/features/baithak-chat-actions.js', 'public/src/js/core/relationships.js', 'public/src/js/core/safety.js'].forEach((f) =>
      assert(/openReport/.test(read(f)), 'Report entry point: ' + path.basename(f))
    );
    assert(/data-report-chat/.test(read('public/src/js/games/party-kit.js')) && /targetType: 'dangal_chat'/.test(ui) && /mehfil_room/.test(read('public/src/js/features/baithak-chat-actions.js')), 'Dangal party chat + Mehfil rooms reportable');
  }

  // ═══════════════ queue ═══════════════
  console.log('\nPriority queue');
  {
    const mk = (id, reason, createdAtMs, region) => ({ id, ...M.normalizeReport({ reason, targetType: 'duniya_post', targetId: id, targetUid: 'x', ...(reason === 'illegal' ? { illegalCountry: 'DE', legalBasis: 'fraud', goodFaith: true } : {}) }, { now: createdAtMs, reporterRegion: region }).report });
    const q = M.sortQueue([mk('spam1', 'spam', NOW - 5 * DAY), mk('hate1', 'hate', NOW - HOUR), mk('cs1', 'child_safety', NOW), mk('ill1', 'illegal', NOW - 2 * HOUR), mk('sh1', 'self_harm', NOW - 10 * 60000)], NOW);
    assert(q.map((r) => r.id).join() === 'sh1,cs1,ill1,hate1,spam1', `order: imminent harm / child safety first (${q.map((r) => r.id).join(' → ')})`);
    assert(q[0].queue === 'imminent_harm' && q[1].queue === 'child_safety' && q[0].overdue === false && q.find((r) => r.id === 'spam1').overdue === true, 'queues + overdue flags (SLA visible to moderators)');
    assert(M.REASONS.child_safety.slaHours === 1 && M.REASONS.illegal.slaHours === 24 && M.REASONS.spam.slaHours === 72, 'SLA targets 1 h / 24 h / 72 h');
    assert(/view === 'moderation_queue'/.test(read('api/admin-feedback.js')) && /sortQueue/.test(read('api/admin-feedback.js')), 'admin queue view');
  }

  // ═══════════════ India timers ═══════════════
  console.log('\nIndia IT Rules timers');
  {
    const r = M.normalizeReport({ reason: 'harassment', targetType: 'profile', targetUid: 'x' }, { now: NOW, reporterRegion: 'IN' }).report;
    assert(r.grievance && r.ackDueMs === NOW + 24 * HOUR && r.resolveDueMs === NOW + 15 * DAY, 'IN grievance: acknowledge 24 h, resolve 15 days');
    const s = M.normalizeReport({ reason: 'sexual', targetType: 'profile', targetUid: 'x' }, { now: NOW, ownerRegion: 'IN' }).report;
    assert(s.resolveDueMs === NOW + 24 * HOUR && s.slaDueMs === NOW + 24 * HOUR, 'IN sexual / intimate imagery: 24 h');
    const de = M.normalizeReport({ reason: 'harassment', targetType: 'profile', targetUid: 'x' }, { now: NOW, reporterRegion: 'DE' }).report;
    assert(!de.grievance && de.resolveDueMs === null, 'non-India reports: no grievance timers');
    const admin = createFakeAdmin();
    const db = await seed(admin);
    const created = await M.createReport(admin, 'rep', { reason: 'harassment', targetType: 'duniya_post', targetId: 'p1', targetUid: 'author' }, { now: NOW });
    const ack = (await notifs(db, 'rep')).find((n) => n.type === 'report_received');
    assert(created.grievance && ack && ack.previewKey === 'notifications.push.report_received_in', 'acknowledgement sent at once (India copy)');
    const t1 = await M.processModerationTimers(admin, { now: NOW + 19 * HOUR, moderators: 'modA' });
    const t2 = await M.processModerationTimers(admin, { now: NOW + 20 * HOUR, moderators: 'modA' });
    const t3 = await M.processModerationTimers(admin, { now: NOW + 14 * DAY, moderators: 'modA' });
    assert(t1.reminders === 1 && t1.ackDue === 1 && t2.reminders === 0, 'reminder 6 h before the 24 h acknowledgement, sent once');
    assert(t3.reminders >= 1 && t3.resolveDue === 1 && t3.overdue === 1 && (await notifs(db, 'modA')).some((n) => n.type === 'moderation_sla'), '15-day resolution reminder + overdue flag to moderators');
    assert(/processModerationTimers/.test(read('api/chaupaal-scheduler.js')), 'scheduler runs the timers');
  }

  // ═══════════════ decision → statement of reasons (affected user's language) ═══════════════
  console.log('\nStatement of reasons');
  let admin;
  let statementId;
  let reportId;
  {
    admin = createFakeAdmin();
    const db = await seed(admin);
    reportId = (await M.createReport(admin, 'rep', { reason: 'hate', targetType: 'duniya_post', targetId: 'p1', targetUid: 'author' }, { now: NOW })).reportId;
    await M.claimReport(db, reportId, 'modA', { now: NOW + HOUR });
    const d = await M.decideReport(admin, 'modA', reportId, { action: 'remove', facts: 'Slur targeting a religion' }, { now: NOW + 2 * HOUR });
    statementId = d.statementId;
    const st = { id: statementId, ...(await db.collection('statements').doc(statementId).get()).data() };
    const required = ['uid', 'action', 'ground', 'rule', 'reason', 'automatedDetection', 'automatedDecision', 'territorialScope', 'redress', 'lang', 'createdAtMs', 'appealable', 'appealDeadlineMs'];
    assert(required.every((k) => st[k] !== undefined) && st.redress.length === 3, 'statement stores every DSA Art. 17 field (action, ground, rule/law, facts, automation, scope, redress, date)');
    assert(st.lang === 'hi' && st.uid === 'author' && st.moderatorUid === 'modA', 'stored in the affected user’s language (hi)');
    const hi = M.renderStatement(st);
    const en = M.renderStatement(st, 'en');
    const DEV = /[\u0900-\u097F]/;
    assert(hi.lang === 'hi' && hi.lines.length === en.lines.length && DEV.test(hi.lines[0]) && hi.lines.filter((l) => DEV.test(l)).length >= hi.lines.length - 1 && hi.lines.some((l) => /अपील/.test(l)), `Hindi statement: "${hi.lines[0]}"`);
    assert(/removed your content/.test(en.lines[0]) && en.lines.some((l) => /reported by someone/.test(l)) && en.lines.some((l) => /person on our team/.test(l)), 'English statement (second UI language)');
    const p1 = (await db.collection('duniya').doc('p1').get()).data();
    assert(p1.deleted === true && p1.moderation.removed === true && p1.moderation.statementId === statementId, 'action applied (removed)');
    const authorN = (await notifs(db, 'author')).find((n) => n.type === 'moderation_action');
    assert(authorN && authorN.previewKey === 'notifications.push.moderation_action' && authorN.deepLink.moderation === statementId, 'affected user notified in-app (deep link to the statement)');
    const pushHi = srv.serverT('hi', 'notifications.push.moderation_action');
    assert(/[\u0900-\u097F]/.test(pushHi), `push copy renders in Hindi ("${pushHi.slice(0, 40)}…")`);
    const view = await M.getStatementForUser(db, 'author', statementId);
    assert(view.ok && view.statement.action === 'remove' && !('moderatorUid' in view.statement) && (await M.getStatementForUser(db, 'rep', statementId)).error === 'NOT_FOUND', 'only the affected user can read it; moderator identity not exposed');
    const B = { window: {}, document: { addEventListener() {}, getElementById: () => null, readyState: 'complete' }, tHtml: tEn, t: tEn };
    B.window = B;
    vm.createContext(B);
    vm.runInContext(read('public/src/js/core/report.js'), B);
    const html = B.ChaupaalReport.statementHtml({ ...view.statement, ground: 'illegal', law: { country: 'DE', basis: 'hate_speech_law' }, durationDays: 7 });
    assert(/removed your content/.test(html) && /Illegal hate speech \(DE\)/.test(html) && /reported by someone/.test(html) && /person on our team/.test(html) && /7 days/.test(html) && /appeal below/.test(html), 'in-app statement shows action, rule, law, facts, automation, duration, redress');
    // illegal-ground statement + territorial scope
    const r2 = (await M.createReport(admin, 'rep2', { reason: 'illegal', illegalCountry: 'DE', legalBasis: 'hate_speech_law', goodFaith: true, targetType: 'duniya_post', targetId: 'p1', targetUid: 'author' }, { now: NOW })).reportId;
    const d2 = await M.decideReport(admin, 'modB', r2, { action: 'restrict' }, { now: NOW + HOUR });
    const st2 = (await db.collection('statements').doc(d2.statementId).get()).data();
    assert(st2.ground === 'illegal' && st2.law.country === 'DE' && st2.territorialScope.join() === 'DE', 'illegal ground: law + territorial scope (DE)');
  }

  // ═══════════════ reporter outcome ═══════════════
  console.log('\nReporter outcome');
  {
    const db = admin.db;
    const out = (await notifs(db, 'rep')).find((n) => n.type === 'report_outcome');
    assert(out && out.previewKey === 'notifications.push.report_outcome_actioned' && !Object.keys(out.previewParams || {}).length && !JSON.stringify(out).includes('Slur'), 'reporter told action was taken — no details about the other person');
    const r3 = (await M.createReport(admin, 'rep2', { reason: 'spam', targetType: 'duniya_post', targetId: 'p1', targetUid: 'author' }, { now: NOW })).reportId;
    await M.decideReport(admin, 'modA', r3, { action: 'no_action' }, { now: NOW + HOUR });
    const none = (await notifs(db, 'rep2')).filter((n) => n.type === 'report_outcome').map((n) => n.previewKey);
    assert(none.includes('notifications.push.report_outcome_none') && (await db.collection('reports').doc(r3).get()).data().status === 'dismissed', 'no violation → "no rule break found" + dismissed');
    const mine = await M.myReports(db, 'rep');
    assert(mine.length === 1 && mine[0].status === 'actioned' && !('target' in mine[0]) && !('details' in mine[0]), '“My reports”: status only (privacy-safe)');
    assert((await M.decideReport(admin, 'modA', r3, { action: 'remove' })).error === 'ALREADY_DECIDED', 'a decided report cannot be decided twice');
  }

  // ═══════════════ appeals ═══════════════
  console.log('\nAppeals');
  {
    const db = admin.db;
    const ap = await M.fileAppeal(admin, 'author', statementId, 'It was a quote from a news article', { now: NOW + 3 * HOUR });
    assert(ap.ok && ap.dueMs === NOW + 3 * HOUR + 7 * DAY && (await notifs(db, 'author')).some((n) => n.type === 'appeal_received'), 'appeal filed (one tap from the statement), acknowledged, 7-day target');
    assert((await M.fileAppeal(admin, 'author', statementId, 'again')).error === 'ALREADY_APPEALED' && (await M.fileAppeal(admin, 'rep', statementId, 'x')).error === 'NOT_FOUND', 'one appeal per decision; only the affected user');
    assert((await M.decideAppeal(admin, 'modA', ap.appealId, 'reversed')).error === 'SAME_MODERATOR', 'the original moderator cannot decide the appeal');
    const dec = await M.decideAppeal(admin, 'modC', ap.appealId, 'reversed', 'Newsworthy quote');
    const p1 = (await db.collection('duniya').doc('p1').get()).data();
    const st = (await db.collection('statements').doc(statementId).get()).data();
    assert(dec.ok && p1.deleted === false && p1.moderation.removed === false && st.status === 'reversed', 'a different moderator reverses → content restored, statement marked reversed');
    assert((await notifs(db, 'author')).some((n) => n.type === 'appeal_outcome' && n.previewKey === 'notifications.push.appeal_reversed'), 'outcome notice to the user');
    // frivolous-appeal limit: 3 upheld appeals in 30 days → cooldown
    for (let i = 0; i < 4; i++) {
      const rid = (await M.createReport(admin, 'rep2', { reason: 'spam', targetType: 'duniya_post', targetId: 'p1', targetUid: 'author' })).reportId;
      const sid = (await M.decideReport(admin, 'modA', rid, { action: 'restrict' })).statementId;
      const a = await M.fileAppeal(admin, 'author', sid, 'no');
      if (i < 3) {
        assert(a.ok, `appeal ${i + 1} accepted`);
        await M.decideAppeal(admin, 'modB', a.appealId, 'upheld');
      } else assert(a.error === 'APPEAL_LIMIT', 'after 3 rejected appeals in 30 days → cooldown');
    }
    assert(/moderation_appeal/.test(read('api/media-config.js')) && /appeal_decide/.test(read('api/admin-feedback.js')), 'appeal routes folded into media-config + admin-feedback');
  }

  // ═══════════════ transparency ═══════════════
  console.log('\nTransparency report');
  {
    const reports = [
      { reason: 'child_safety', reporterRegion: 'US', createdAtMs: NOW, decidedAtMs: NOW + 1 * HOUR },
      { reason: 'hate', reporterRegion: 'IN', grievance: true, createdAtMs: NOW, ackSentAtMs: NOW, decidedAtMs: NOW + 3 * HOUR, resolveDueMs: NOW + 15 * DAY },
      { reason: 'hate', reporterRegion: 'DE', createdAtMs: NOW, decidedAtMs: NOW + 5 * HOUR },
      { reason: 'illegal', illegal: { country: 'DE', basis: 'fraud' }, reporterRegion: 'DE', createdAtMs: NOW },
      { reason: 'spam', reporterRegion: 'US', createdAtMs: NOW - 400 * DAY },
    ];
    const statements = [
      { action: 'remove', ground: 'tos', reason: 'hate', automatedDetection: false, automatedDecision: false, createdAtMs: NOW },
      { action: 'ban', ground: 'illegal', reason: 'child_safety', automatedDetection: true, automatedDecision: false, createdAtMs: NOW },
    ];
    const appeals = [
      { status: 'upheld', createdAtMs: NOW, decidedAtMs: NOW + 10 * HOUR },
      { status: 'reversed', createdAtMs: NOW, decidedAtMs: NOW + 20 * HOUR },
      { status: 'open', createdAtMs: NOW },
    ];
    const rep = M.transparencyReport({ reports, statements, appeals, fromMs: NOW - DAY, toMs: NOW + DAY });
    assert(rep.notices.total === 4 && rep.notices.byCategory.hate === 2 && rep.notices.byCountry.DE === 2 && rep.notices.childSafety === 1 && rep.notices.illegalByBasis.fraud === 1, 'notices by category / country / legal basis (out-of-period excluded)');
    assert(rep.actions.total === 2 && rep.actions.byType.remove === 1 && rep.actions.byGround.illegal === 1 && rep.automated.detection === 1 && rep.automated.decision === 0 && rep.automated.human === 2, 'actions + automated vs human');
    assert(rep.appeals.upheld === 1 && rep.appeals.reversed === 1 && rep.appeals.open === 1 && rep.appeals.medianDecisionHours === 15, 'appeal outcomes + median decision time');
    assert(rep.handling.medianHours === 3 && rep.handling.byCategory.hate === 4, 'median handling hours (overall, per category)');
    assert(rep.india.grievances === 1 && rep.india.acknowledgedWithin24h === 1 && rep.india.resolvedWithin15d === 1, 'India grievance compliance counts');
    const csv = M.transparencyCsv(rep);
    assert(csv.startsWith('section,key,value\n') && /notices\.byCategory,hate,2/.test(csv) && /india,resolvedWithin15d,1/.test(csv), 'CSV export');
    const dsa = M.dsaExport([{ id: 's1', ...statements[1], target: { type: 'duniya_post' }, territorialScope: ['ALL'], law: { country: 'DE', basis: 'csam' } }]);
    assert(dsa[0].decision_account === 'DECISION_ACCOUNT_TERMINATED' && dsa[0].category === 'STATEMENT_CATEGORY_PROTECTION_OF_MINORS' && dsa[0].automated_detection === 'Yes' && dsa[0].decision_ground === 'DECISION_GROUND_ILLEGAL_CONTENT', 'DSA Transparency Database-shaped export');
    const live = M.transparencyReport(await M.loadPeriod(admin.db, NOW - DAY, NOW + 30 * DAY));
    assert(live.notices.total >= 6 && live.appeals.reversed === 1, 'report generated from live collections (fake Firestore)');
    assert(/view === 'transparency'/.test(read('api/admin-feedback.js')) && /format.*csv/.test(read('api/admin-feedback.js')) && /dsa_export/.test(read('api/admin-feedback.js')), 'admin views: transparency (JSON / CSV) + dsa_export');
  }

  // ═══════════════ why am I seeing this ═══════════════
  console.log('\nRecommender transparency');
  {
    const safety = read('public/src/js/core/safety.js');
    assert(/id: 'why'/.test(safety) && /openWhyThis\(content, \{ surface \}\)/.test(safety), 'Duniya + Peepal post menus: "Why am I seeing this?"');
    assert(/openWhyThis/.test(read('public/src/js/features/akhbaar-catbar.js')) && /data-why-games/.test(read('public/src/js/dangal/dangal-assist-ui.js')), 'Akhbaar category order + Dangal suggestions');
    const B = { window: {}, document: { addEventListener() {}, getElementById: () => null, readyState: 'complete' }, tHtml: tEn, t: tEn };
    B.window = B;
    vm.createContext(B);
    vm.runInContext(read('public/src/js/core/report.js'), B);
    const r = B.ChaupaalReport.whyReasons({ _rankExplain: ['From someone you follow', 'Matches your interest in Travel', 'Trending now'] }, 'duniya');
    assert(r.length === 3 && r[0] === 'You follow this person.' && /interest in Travel/.test(r[1]) && /popular/.test(r[2]), 'plain-language reasons from the ranker’s explain codes');
    assert(/recent and public/.test(B.ChaupaalReport.whyReasons({}, 'duniya')[0]) && /players, place and time/.test(B.ChaupaalReport.whyReasons({}, 'dangal')[0]), 'fallback reasons per surface');
    assert(/data-why-optout/.test(read('public/src/js/core/report.js')) && /data-legal="recommendations"/.test(read('public/src/js/core/report.js')), 'links to the non-personalised option + "How recommendations work"');
    const L = require('../public/src/js/core/legal.js');
    ['recommendations', 'contact'].forEach((k) => {
      const html = L.render(k, tEn);
      assert((html.match(/data-legal-draft/g) || []).length === 2 && L.keysFor(k).every((key) => EN[key]), `${k} page: draft banner + all copy`);
    });
    assert(/Grievance Officer/.test(L.render('contact', tEn)) && /\[authorities email\]/.test(L.render('contact', tEn)), 'contact point for authorities + users, grievance officer placeholder');
    assert(/moderation\.grievance_title/.test(read('public/src/js/core/report.js')) && /id="settingsHelpSection"/.test(read('public/index.html')), 'Settings → Help & reports shows the grievance officer');
  }

  // ═══════════════ store + web ═══════════════
  console.log('\nStore + web readiness');
  {
    const V = require('./store-validate');
    const all = V.validateAll();
    assert(all.langs.length === 16 && all.errors.length === 0, `16 listing files within store limits (${all.errors.join('; ') || 'ok'})`);
    const bad = V.validateListing({ lang: 'xx', apple: { name: 'x'.repeat(31), subtitle: 'ok', description: 'd', keywords: 'a, b' }, google: { title: 't', shortDescription: 'y'.repeat(81), fullDescription: 'f' } }, 'xx');
    assert(bad.some((e) => /apple.name: 31 > 30/.test(e)) && bad.some((e) => /shortDescription: 81 > 80/.test(e)) && bad.some((e) => /no spaces after commas/.test(e)), 'validator catches over-limit fields');
    assert(V.len('keywords', 'हिंदी') === Buffer.byteLength('हिंदी') && V.len('name', 'हिंदी') === 5, 'keywords limited in bytes, other fields in characters');
    const S = require('./store-screenshots');
    const planned = S.plan();
    assert(planned.length === 2 * Object.keys(S.DEVICES).length * 2 * S.SCREENS.length && planned.some((p) => p.lang === 'ar-XB' && p.theme === 'dark'), `screenshot plan: pseudo-locales × devices × light/dark × screens (${planned.length})`);
    const G = require('./gen-privacy-labels');
    const doc = G.build();
    const files = G.files();
    assert(Object.keys(files).every((f) => fs.existsSync(f) && fs.readFileSync(f, 'utf8').replace(/\r\n/g, '\n') === files[f]), 'privacy labels (Apple + Google) up to date with the data inventory');
    const procs = require('../public/src/js/core/legal.js').PROCESSORS.map((p) => p[0]);
    const inv = require('../server-lib/data-inventory');
    assert(inv.inventory().every((d) => d.processors.every((p) => procs.includes(p))) && doc.facts.tracking === false && doc.google.dataShared.length === 0 && doc.google.securityPractices.deletionUrl === '/delete-account', 'labels built from the L8 processor list; no tracking; deletion URL');
    const age = read('docs/store/age-rating.md');
    assert(/Simulated gambling/i.test(age) && /17\+/.test(age) && /User-generated content/.test(age) && /Location sharing/.test(age), 'age-rating answers: simulated gambling, UGC, location, likely 17+');
    ['docs/compliance/moderation.md', 'docs/compliance/child-safety.md', 'docs/compliance/risk-assessment.md', 'docs/store/checklist.md'].forEach((f) => assert(/DRAFT/.test(read(f)), f + ' (draft)'));
    assert(/Apple In-App Purchase/.test(read('docs/store/checklist.md')) && /Google Play Billing/.test(read('docs/store/checklist.md')), 'IAP compliance flagged for Premium / Chaupaal Money');

    // web deletion page
    const D = require('../public/src/js/web/delete-account.js');
    let calls = 0;
    const fakeFetch = async (url, init) => {
      calls++;
      fakeFetch.last = { url, init };
      return { json: async () => ({ ok: true, data: { status: 'scheduled', purgeAfterMs: NOW + 30 * DAY } }) };
    };
    let err = null;
    try {
      await D.submit({ user: null, ack: true }, { fetch: fakeFetch });
    } catch (e) {
      err = e;
    }
    assert(err && err.code === 'NOT_SIGNED_IN' && calls === 0 && !D.canSubmit({ user: null, ack: true }) && !D.canSubmit({ user: {}, ack: false }), 'web deletion page: nothing is sent without sign-in + confirmation');
    const out = await D.submit({ user: { getIdToken: async () => 'tok123' }, ack: true }, { fetch: fakeFetch });
    const body = JSON.parse(fakeFetch.last.init.body);
    assert(calls === 1 && fakeFetch.last.init.headers.Authorization === 'Bearer tok123' && body.action === 'request_account_deletion' && body.confirm === 'delete' && out.status === 'scheduled', 'signed in → the account’s own token, same deletion path as in-app');
    const page = read('public/delete-account.html');
    assert(/id="wdLogin"/.test(page) && /id="wdSubmit" disabled/.test(page) && /delete-account\.js/.test(page) && /"\/delete-account"/.test(read('vercel.json')), 'public /delete-account page (login form, submit disabled until signed in)');

    // region prices
    const P = require('../public/src/js/data/region-prices.js');
    const fmt = (n, c) => new Intl.NumberFormat('en-US', { style: 'currency', currency: c }).format(n);
    assert(P.display('pradhan', 'IN', { format: fmt, store: null }) === '₹499.00' && P.display('sarpanch', 'GB', { format: fmt, store: null }) === '£31.99' && P.display('pradhan', 'JP', { format: fmt, store: null }) === '¥1,500', 'region price table formatted in local currency');
    assert(P.display('pradhan', 'ZZ', { format: fmt, store: null }) === null && P.priceFor('pradhan', 'ZZ', { store: null }).cm === 250, 'unlisted country → CM price only');
    assert(P.display('pradhan', 'US', { store: { formatted: '$9.49' } }) === '$9.49' && P.priceFor('pradhan', 'US', { store: { formatted: '$9.49' } }).source === 'store', 'store-provided localised price wins');
    const BP = require('../server-lib/pricing-regions').BUCKET_PRICES;
    assert(['developed', 'developing', 'underdeveloped'].every((b) => P.BUCKETS[b].pradhan === BP[b].pradhan && P.BUCKETS[b].sarpanch === BP[b].sarpanch), 'display table mirrors the charged buckets (no pricing change)');
    assert(/localPriceHtml\('pradhan'\)/.test(read('public/src/js/core/chaupaal-money.js')), 'membership sheet shows the local price');

    // manifest + hreflang
    const langs = require('./build-store-assets').langs();
    const manifests = langs.filter((l) => l !== 'en').map((l) => JSON.parse(read(`public/manifests/manifest.${l}.json`)));
    assert(langs.length === 16 && manifests.length === 15 && manifests.every((m, i) => m.lang === langs.filter((l) => l !== 'en')[i] && m.description && m.shortcuts.length === 3), '15 localised manifests (+ English) with description + shortcuts');
    assert(manifests.find((m) => m.lang === 'ar').dir === 'rtl' && /\?lang=hi/.test(manifests.find((m) => m.lang === 'hi').start_url), 'RTL manifests + language start_url');
    const W = { document: { addEventListener() {}, readyState: 'complete', querySelector: () => null }, window: {} };
    W.window = W;
    vm.createContext(W);
    vm.runInContext(read('public/src/js/core/web-locale.js'), W);
    assert(W.ChaupaalWebLocale.manifestHref('de') === '/manifests/manifest.de.json' && W.ChaupaalWebLocale.manifestHref('en') === '/manifest.json', 'manifest link follows the UI language');
    const og = require('../server-lib/og-preview');
    const html = og.renderOgHtml({ origin: 'https://chaupaal.app', title: 'Asha', url: 'https://chaupaal.app/profile/asha', lang: 'hi' });
    assert(/<html lang="hi">/.test(html) && /og:locale" content="hi_IN"/.test(html) && (html.match(/hreflang="/g) || []).length === 17 && /hreflang="x-default" href="https:\/\/chaupaal\.app\/profile\/asha"/.test(html) && /profile\/asha\?lang=pt"/.test(html) && /hreflang="zh-Hans"/.test(html), 'share page: html lang, og:locale, 16 hreflang alternates + x-default');
    assert(og.ogLang({ query: {}, headers: { 'accept-language': 'de-DE,de;q=0.9,en;q=0.8' } }) === 'de' && og.ogLang({ query: { lang: 'ar' }, headers: {} }) === 'ar' && /dir="rtl"/.test(og.renderOgHtml({ origin: 'https://x', lang: 'ar' })), 'language from ?lang / Accept-Language; RTL');
    const enDesc = og.renderOgHtml({ origin: 'https://x', lang: 'en' });
    assert(/Gather under the same light/.test(enDesc) && /Open in Chaupaal/.test(enDesc), 'language-aware generic card copy');
  }

  // ═══════════════ wiring / constraints ═══════════════
  console.log('\nWiring');
  {
    const C = require('../public/src/js/core/compliance.js');
    assert(C.ageGate({ dob: '2011-01-01' }, 'peepal') === 'ok' && C.TEEN_RULES.includes('peepal_stricter') && !C.TEEN_RULES.includes('peepal_hidden'), 'Peepal open to teens with stricter content regulation');
    const rules = read('firebase/firestore.rules');
    assert(['reports', 'statements', 'appeals'].every((c) => new RegExp(`match /${c}/\\{\\w+\\} \\{\\s*allow read, write: if false;`).test(rules)), 'reports / statements / appeals Admin-only');
    const purge = read('server-lib/account-purge.js');
    assert(/\['reports', 'reporterUid'\], \['statements', 'uid'\], \['appeals', 'uid'\]/.test(purge) && /moderation\.json/.test(read('server-lib/account-export.js')), 'deletion pseudonymises moderation records; export includes them');
    assert(/createReport/.test(read('api/relationships.js')), 'flag_user files a structured report');
    const apis = fs.readdirSync(path.join(ROOT, 'api')).filter((f) => f.endsWith('.js'));
    assert(apis.length === 12, `api/*.js === 12 (got ${apis.length})`);
  }

  console.log(`\n${passed} passed, ${failed} failed`);
  process.exit(failed ? 1 : 0);
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
