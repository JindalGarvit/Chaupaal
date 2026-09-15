/**
 * Growth G5 — honest D1–D7 retention (no network).
 */
'use strict';

const fs = require('fs');
const path = require('path');
const {
  TEMPLATES,
  FIRST7_CAP,
  calendarDayIndex,
  selectRetentionTemplate,
  sectionPath,
} = require('../server-lib/retention-d1d7');
const { hrefFromDeepLink } = require('../server-lib/notifications');

function assert(cond, msg) {
  if (!cond) throw new Error(msg || 'assert failed');
  console.log('✓', msg);
}

// ——— Honesty audit ———
const nudgeSrc = fs.readFileSync(path.join(__dirname, '../public/src/js/core/tab-nudges.js'), 'utf8');
assert(!/Someone new matched|1,000 people online|Someone nearby matched you/i.test(nudgeSrc), 'no fiction copy in tab-nudges');
assert(/Never invents social activity/.test(nudgeSrc), 'honesty contract documented');
assert(/tipsAllowed|isNotifEnabled\('tips'\)/.test(nudgeSrc), 'tab nudges honor tips pref');
assert(/isQuiet|quietMode/.test(nudgeSrc) && /isGuest/.test(nudgeSrc), 'Quiet + guest skip');

const retSrc = fs.readFileSync(path.join(__dirname, '../server-lib/retention-d1d7.js'), 'utf8');
assert(!/someone matched you|1,000 people|attracting looks/i.test(retSrc), 'no fiction in retention module');
assert(/quietMode|tips_off|guest/.test(retSrc), 'eligibility gates present');
assert(/retentionSends/.test(retSrc), 'idempotent send keys');
assert(/RECENT_ACTIVE_MS|recently_active/.test(retSrc), 'skip recently active come-backs');

const sched = fs.readFileSync(path.join(__dirname, '../api/chaupaal-scheduler.js'), 'utf8');
assert(/processRetentionBatch/.test(sched), 'scheduler wires retention');
assert(/retentionDryRun|dryRun/.test(sched), 'dry-run query supported');

assert(hrefFromDeepLink({ section: 'dangal' }) === '/?section=dangal', 'FCM section → deep link');
assert(hrefFromDeepLink({ path: '/?section=akhbaar' }) === '/?section=akhbaar', 'path deep link preserved');
assert(sectionPath('akhbaar') === '/?section=akhbaar', 'sectionPath akhbaar');
assert(/\/invite\//.test(sectionPath('invite', 'garvit')), 'invite path with username');

const deeplink = fs.readFileSync(path.join(__dirname, '../public/src/js/core/deeplinks.js'), 'utf8');
assert(/section/.test(deeplink) && /showTab/.test(deeplink), 'client applies ?section=');

const prefs = fs.readFileSync(path.join(__dirname, '../public/src/js/core/notif-prefs.js'), 'utf8');
assert(/tips:\s*true/.test(prefs), 'tips default on');

const html = fs.readFileSync(path.join(__dirname, '../public/index.html'), 'utf8');
assert(/id="notifTips"/.test(html), 'Tips & reminders toggle in settings');

const admin = fs.readFileSync(path.join(__dirname, '../api/admin-feedback.js'), 'utf8');
assert(/view === 'retention'/.test(admin), 'admin retention peek');

const apiCount = fs.readdirSync(path.join(__dirname, '../api')).filter((f) => f.endsWith('.js')).length;
assert(apiCount === 12, `api/*.js === 12 (got ${apiCount})`);

// ——— Selection / caps ———
assert(TEMPLATES.d1_continue && TEMPLATES.d6_quiz, 'core templates defined');
assert(FIRST7_CAP === 4, 'first-7 cap is 4');

const d1 = selectRetentionTemplate({
  dayIndex: 1,
  triedDangal: false,
  invited: false,
  waiting: false,
  todayKey: '2026-09-16',
  lastSentDayKey: null,
  first7Count: 0,
});
assert(d1.templateId === 'd1_continue', 'D1 → continue template');

const d1again = selectRetentionTemplate({
  dayIndex: 1,
  triedDangal: false,
  invited: false,
  waiting: false,
  todayKey: '2026-09-16',
  lastSentDayKey: '2026-09-16',
  first7Count: 1,
});
assert(d1again.skip === 'already_today', 'idempotent same-day skip');

const d2 = selectRetentionTemplate({
  dayIndex: 2,
  triedDangal: false,
  invited: false,
  waiting: false,
  todayKey: '2026-09-17',
  lastSentDayKey: null,
  first7Count: 1,
});
assert(d2.templateId === 'd2_dangal', 'D2 → dangal if never tried');

const d2inv = selectRetentionTemplate({
  dayIndex: 2,
  triedDangal: true,
  invited: false,
  waiting: false,
  todayKey: '2026-09-17',
  lastSentDayKey: null,
  first7Count: 1,
});
assert(d2inv.templateId === 'd2_invite', 'D2 → invite if dangal done');

const d4skip = selectRetentionTemplate({
  dayIndex: 4,
  triedDangal: true,
  invited: true,
  waiting: false,
  todayKey: '2026-09-19',
  lastSentDayKey: null,
  first7Count: 2,
});
assert(d4skip.skip === 'no_event_d4', 'D4 without event → skip');

const d4wait = selectRetentionTemplate({
  dayIndex: 4,
  triedDangal: true,
  invited: true,
  waiting: true,
  waitingSection: 'baithak',
  todayKey: '2026-09-19',
  lastSentDayKey: null,
  first7Count: 4,
});
assert(d4wait.templateId === 'd4_waiting' && d4wait.section === 'baithak', 'D4 event-backed waiting');

const d6cap = selectRetentionTemplate({
  dayIndex: 6,
  triedDangal: true,
  invited: true,
  waiting: false,
  todayKey: '2026-09-21',
  lastSentDayKey: null,
  first7Count: 4,
});
assert(d6cap.skip === 'first7_cap', 'first-7 cap blocks generic');

const signup = new Date('2026-09-14T10:00:00+05:30');
const now = new Date('2026-09-15T12:00:00+05:30');
assert(calendarDayIndex(signup, 'Asia/Kolkata', now) === 1, 'calendar day index D1');

console.log('\nGrowth G5 checks passed.');
