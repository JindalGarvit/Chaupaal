/**
 * Notice & action, statements of reasons, appeals, SLA timers, transparency (Global L9).
 * Folded into api/relationships (flag_user → report), api/media-config (statement / appeal / my reports),
 * api/admin-feedback (queue, decisions, transparency) and api/chaupaal-scheduler (timers) — no new function.
 *
 *   reports/{id}     a notice (DSA Art. 16) / grievance (India IT Rules 3(2)); priority queue + SLA timers
 *   statements/{id}  statement of reasons (DSA Art. 17) for the affected user, in their language
 *   appeals/{id}     internal complaint (DSA Art. 20) — decided by a different moderator
 *
 * Child safety: reports hold references only (never a copy of media); the content is restricted at
 * once pending review. Escalation to authorities / NCMEC / national hotlines is a documented manual
 * step (docs/compliance/child-safety.md) — hash-matching is a future item.
 * DRAFT — timelines and categories require legal review.
 */
'use strict';

const HOUR = 3600000;
const DAY = 24 * HOUR;

/** reason → priority (0 first), queue, SLA hours, guideline rule key. */
const REASONS = {
  child_safety: { priority: 0, queue: 'child_safety', slaHours: 1, rule: 'guidelines_safety' },
  self_harm: { priority: 0, queue: 'imminent_harm', slaHours: 1, rule: 'guidelines_safety' },
  violence: { priority: 0, queue: 'imminent_harm', slaHours: 1, rule: 'guidelines_respect' },
  illegal: { priority: 1, queue: 'illegal', slaHours: 24, rule: 'terms_rules' },
  sexual: { priority: 1, queue: 'standard', slaHours: 24, rule: 'guidelines_safety' },
  hate: { priority: 2, queue: 'standard', slaHours: 24, rule: 'guidelines_respect' },
  harassment: { priority: 2, queue: 'standard', slaHours: 24, rule: 'guidelines_respect' },
  impersonation: { priority: 3, queue: 'standard', slaHours: 72, rule: 'guidelines_honest' },
  ip: { priority: 3, queue: 'standard', slaHours: 72, rule: 'terms_content' },
  spam: { priority: 3, queue: 'low', slaHours: 72, rule: 'guidelines_honest' },
  other: { priority: 3, queue: 'low', slaHours: 72, rule: 'guidelines_spirit' },
};
const REASON_IDS = Object.keys(REASONS);

/** Legal-basis sub-picker for "Illegal content" (DSA Art. 16(2)(a): why the notifier considers it illegal). */
const LEGAL_BASES = ['csam', 'terrorism', 'hate_speech_law', 'defamation', 'privacy', 'non_consensual_imagery', 'ip', 'fraud', 'illegal_goods', 'other_law'];

/** Legacy flag codes (safety.js before L9) → reasons. */
const LEGACY = { spam: 'spam', harassment: 'harassment', fake_profile: 'impersonation', inappropriate: 'sexual', impersonation: 'impersonation', custom: 'other' };

const TARGET_TYPES = ['duniya_post', 'duniya_comment', 'story', 'peepal', 'peepal_comment', 'message', 'chat', 'profile', 'mehfil_room', 'dangal_chat', 'scribble_drawing', 'party_prompt', 'akhbaar_comment', 'user'];

const ACTIONS = ['no_action', 'remove', 'restrict', 'age_restrict', 'suspend', 'ban'];
const SUSPEND_DAYS = 7;
const APPEAL_WINDOW_DAYS = 180;
const APPEAL_DUE_DAYS = 7;
const APPEAL_REJECT_LIMIT = 3;
const APPEAL_COOLDOWN_DAYS = 30;

/** India IT Rules 2021, r. 3(2): acknowledge within 24 h, resolve within 15 days (intimate imagery: 24 h). */
const INDIA = { ackHours: 24, resolveDays: 15, intimateImageryHours: 24 };

function code(c) {
  return String(c || '').trim().toUpperCase().slice(0, 2) || null;
}
function str(v, n) {
  return v == null ? null : String(v).trim().slice(0, n) || null;
}

/** Validate + normalise a report body → { ok, report?, error? } (pure). */
function normalizeReport(body, ctx) {
  const b = body || {};
  const c = ctx || {};
  const now = c.now || Date.now();
  const reason = REASONS[b.reason] ? b.reason : LEGACY[b.reasonCode] || (REASONS[b.reasonCode] ? b.reasonCode : null);
  if (!reason) return { ok: false, error: 'VALIDATION_ERROR' };
  const type = TARGET_TYPES.indexOf(b.targetType) >= 0 ? b.targetType : 'user';
  const target = {
    type,
    id: str(b.targetId || b.postId || b.commentId || b.chatId || b.targetUid, 160),
    ownerUid: str(b.targetUid || b.ownerUid, 128),
    chatId: str(b.chatId, 160),
    parentId: str(b.parentId || b.postId, 160),
    surface: str(b.surface || type, 40),
  };
  if (!target.id && !target.ownerUid) return { ok: false, error: 'VALIDATION_ERROR' };
  let illegal = null;
  if (reason === 'illegal') {
    const country = code(b.illegalCountry || (b.illegal && b.illegal.country));
    const basis = LEGAL_BASES.indexOf(b.legalBasis || (b.illegal && b.illegal.basis)) >= 0 ? b.legalBasis || b.illegal.basis : null;
    if (!country || !basis) return { ok: false, error: 'ILLEGAL_DETAILS_REQUIRED' };
    if (b.goodFaith !== true) return { ok: false, error: 'GOOD_FAITH_REQUIRED' };
    illegal = { country, basis, lawRef: str(b.lawRef, 200) };
  }
  const rule = REASONS[reason];
  const reporterRegion = code(c.reporterRegion);
  const ownerRegion = code(c.ownerRegion);
  const grievance = reporterRegion === 'IN' || ownerRegion === 'IN';
  let slaDueMs = now + rule.slaHours * HOUR;
  let ackDueMs = null;
  let resolveDueMs = null;
  if (grievance) {
    ackDueMs = now + INDIA.ackHours * HOUR;
    resolveDueMs = now + (reason === 'sexual' || (illegal && illegal.basis === 'non_consensual_imagery') ? INDIA.intimateImageryHours * HOUR : INDIA.resolveDays * DAY);
    slaDueMs = Math.min(slaDueMs, resolveDueMs);
  }
  return {
    ok: true,
    report: {
      reporterUid: c.reporterUid || null,
      reporterRegion,
      reporterLang: str(c.reporterLang, 12) || 'en',
      contact: str(b.contact, 180),
      target,
      reason,
      illegal,
      details: str(b.details || b.customText, 1000),
      // Child safety: references only — never a copy of the content.
      snapshot: reason === 'child_safety' ? null : str(b.snapshot, 500),
      priority: rule.priority,
      queue: rule.queue,
      status: 'open',
      grievance,
      createdAtMs: now,
      slaDueMs,
      ackDueMs,
      resolveDueMs,
      ackSentAtMs: now,
      firstTouchAtMs: null,
      claimedBy: null,
      remindersSent: [],
    },
  };
}

/** Moderator queue order: priority, then SLA deadline (overdue first), then age. */
function sortQueue(reports, now) {
  const t = now || Date.now();
  return (reports || [])
    .filter((r) => r.status === 'open' || r.status === 'in_review')
    .map((r) => ({ ...r, overdue: Number(r.slaDueMs) < t, slaRemainingMs: Number(r.slaDueMs) - t }))
    .sort((a, b) => a.priority - b.priority || a.slaDueMs - b.slaDueMs || a.createdAtMs - b.createdAtMs);
}

/** Firestore ref of a reported item (null when it lives only in RTDB / has no doc). */
function targetRef(db, t) {
  if (!t || !t.id) return null;
  switch (t.type) {
    case 'duniya_post':
      return db.collection('duniya').doc(t.id);
    case 'peepal':
      return db.collection('peepal').doc(t.id);
    case 'story':
      return db.collection('duniya_stories').doc(t.id);
    case 'duniya_comment':
      return t.parentId ? db.collection('duniya').doc(t.parentId).collection('comments').doc(t.id) : null;
    case 'peepal_comment':
      return t.parentId ? db.collection('peepal').doc(t.parentId).collection('comments').doc(t.id) : null;
    case 'message':
      return t.chatId ? db.collection('chats').doc(t.chatId).collection('messages').doc(t.id) : null;
    case 'chat':
    case 'mehfil_room':
      return db.collection('chats').doc(t.chatId || t.id);
    default:
      return null;
  }
}

async function loadUser(db, uid) {
  if (!uid) return {};
  const s = await db.collection('users').doc(uid).get();
  return s.exists ? s.data() || {} : {};
}

async function notify(adminApp, uid, payload) {
  if (!uid) return null;
  try {
    const { upsertNotification } = require('./notifications');
    return await upsertNotification(adminApp, uid, { actor: { uid: 'chaupaal', name: 'Chaupaal', avatar: '🛡️' }, ...payload });
  } catch (e) {
    return null;
  }
}

/** Store a report (+ child-safety interim restriction) and acknowledge it to the reporter. */
async function createReport(adminApp, reporterUid, body, opts) {
  const o = opts || {};
  const db = adminApp.firestore();
  const reporter = await loadUser(db, reporterUid);
  const ownerUid = body && (body.targetUid || body.ownerUid);
  const owner = ownerUid ? await loadUser(db, ownerUid) : {};
  const n = normalizeReport(body, {
    now: o.now,
    reporterUid,
    reporterRegion: reporter.region && reporter.region.country,
    reporterLang: reporter.lang,
    ownerRegion: owner.region && owner.region.country,
  });
  if (!n.ok) return n;
  const ref = db.collection('reports').doc();
  await ref.set({ ...n.report, flagId: o.flagId || null });
  if (n.report.reason === 'child_safety') {
    const tr = targetRef(db, n.report.target);
    if (tr) await tr.set({ moderation: { restricted: true, pendingReview: true, reportId: ref.id } }, { merge: true }).catch(() => {});
  }
  await notify(adminApp, reporterUid, {
    type: 'report_received',
    refId: ref.id,
    previewKey: n.report.grievance ? 'notifications.push.report_received_in' : 'notifications.push.report_received',
    deepLink: { moderationReport: ref.id },
  });
  return { ok: true, reportId: ref.id, priority: n.report.priority, queue: n.report.queue, grievance: n.report.grievance, slaDueMs: n.report.slaDueMs, resolveDueMs: n.report.resolveDueMs };
}

async function claimReport(db, reportId, moderatorUid, opts) {
  const now = (opts && opts.now) || Date.now();
  const ref = db.collection('reports').doc(reportId);
  const s = await ref.get();
  if (!s.exists) return { ok: false, error: 'NOT_FOUND' };
  const r = s.data();
  await ref.set({ status: r.status === 'open' ? 'in_review' : r.status, claimedBy: moderatorUid, firstTouchAtMs: r.firstTouchAtMs || now }, { merge: true });
  return { ok: true };
}

/** Apply an action to the reported item / account. Reversible ones store what to undo. */
async function applyAction(adminApp, action, target, ownerUid, statementId, now) {
  const db = adminApp.firestore();
  const ref = targetRef(db, target);
  const mod = { statementId, at: now };
  if (action === 'remove' && ref) await ref.set({ moderation: { ...mod, removed: true }, deleted: true }, { merge: true });
  if (action === 'restrict' && ref) await ref.set({ moderation: { ...mod, restricted: true, pendingReview: false } }, { merge: true });
  if (action === 'age_restrict' && ref) await ref.set({ moderation: { ...mod, ageRestricted: true, restricted: false, pendingReview: false } }, { merge: true });
  if ((action === 'suspend' || action === 'ban') && ownerUid) {
    const until = action === 'ban' ? null : now + SUSPEND_DAYS * DAY;
    await db.collection('users').doc(ownerUid).set({ moderation: { status: action === 'ban' ? 'banned' : 'suspended', suspendedUntilMs: until, statementId } }, { merge: true });
    await db.collection('users_public').doc(ownerUid).set({ hiddenFromDiscovery: true }, { merge: true }).catch(() => {});
    try {
      await adminApp.auth().revokeRefreshTokens(ownerUid);
    } catch (e) {}
  }
  if (action === 'no_action' && ref && target.type !== 'profile') {
    await ref.set({ moderation: { pendingReview: false, restricted: false } }, { merge: true }).catch(() => {});
  }
}

async function undoAction(adminApp, st) {
  const db = adminApp.firestore();
  const FV = adminApp.firestore.FieldValue;
  const ref = targetRef(db, st.target);
  if (ref && ['remove', 'restrict', 'age_restrict'].indexOf(st.action) >= 0) {
    await ref.set({ moderation: { removed: false, restricted: false, ageRestricted: false, reversedAt: Date.now() }, ...(st.action === 'remove' ? { deleted: false } : {}) }, { merge: true });
  }
  if ((st.action === 'suspend' || st.action === 'ban') && st.uid) {
    await db.collection('users').doc(st.uid).set({ moderation: { status: 'active', suspendedUntilMs: null, reversedStatementId: st.id } }, { merge: true });
    await db.collection('users_public').doc(st.uid).set({ hiddenFromDiscovery: FV.delete() }, { merge: true }).catch(() => {});
  }
}

/**
 * Moderator decision → action, statement of reasons (affected user), outcome (reporter).
 * @param {{ action, rule?, ground?: 'tos'|'illegal', law?, facts?, automatedDetection?, automatedDecision? }} d
 */
async function decideReport(adminApp, moderatorUid, reportId, d, opts) {
  const now = (opts && opts.now) || Date.now();
  const db = adminApp.firestore();
  const ref = db.collection('reports').doc(reportId);
  const s = await ref.get();
  if (!s.exists) return { ok: false, error: 'NOT_FOUND' };
  const r = s.data();
  if (r.status === 'actioned' || r.status === 'dismissed') return { ok: false, error: 'ALREADY_DECIDED' };
  const action = ACTIONS.indexOf(d && d.action) >= 0 ? d.action : null;
  if (!action) return { ok: false, error: 'VALIDATION_ERROR' };
  const affectedUid = r.target.ownerUid || null;
  let statementId = null;
  if (action !== 'no_action') {
    const affected = await loadUser(db, affectedUid);
    const sref = db.collection('statements').doc();
    statementId = sref.id;
    const ground = d.ground === 'illegal' || (r.reason === 'illegal' && d.ground !== 'tos') ? 'illegal' : 'tos';
    const statement = {
      uid: affectedUid,
      reportId,
      target: r.target,
      action,
      ground,
      rule: str(d.rule, 60) || REASONS[r.reason].rule,
      reason: r.reason,
      law: ground === 'illegal' ? d.law || r.illegal || null : null,
      facts: str(d.facts, 500),
      automatedDetection: d.automatedDetection === true,
      automatedDecision: d.automatedDecision === true,
      territorialScope: ground === 'illegal' && (d.law || r.illegal) ? [(d.law || r.illegal).country] : ['ALL'],
      durationDays: action === 'suspend' ? SUSPEND_DAYS : null,
      redress: ['internal_appeal', 'out_of_court_settlement', 'judicial_redress'],
      lang: str(affected.lang, 12) || 'en',
      moderatorUid,
      createdAtMs: now,
      appealable: true,
      appealDeadlineMs: now + APPEAL_WINDOW_DAYS * DAY,
      status: 'active',
    };
    await sref.set(statement);
    await applyAction(adminApp, action, r.target, affectedUid, statementId, now);
    await notify(adminApp, affectedUid, {
      type: 'moderation_action',
      refId: statementId,
      previewKey: 'notifications.push.moderation_action',
      deepLink: { moderation: statementId },
    });
  } else {
    await applyAction(adminApp, action, r.target, affectedUid, null, now);
  }
  await ref.set(
    { status: action === 'no_action' ? 'dismissed' : 'actioned', action, decidedBy: moderatorUid, decidedAtMs: now, statementId, firstTouchAtMs: r.firstTouchAtMs || now },
    { merge: true }
  );
  // Reporter outcome — privacy-safe: whether action was taken, never what or against whom in detail.
  await notify(adminApp, r.reporterUid, {
    type: 'report_outcome',
    refId: reportId,
    previewKey: action === 'no_action' ? 'notifications.push.report_outcome_none' : 'notifications.push.report_outcome_actioned',
    deepLink: { moderationReport: reportId },
  });
  return { ok: true, statementId, action };
}

/** Statement of reasons rendered in the affected user's language (push / email / web). */
function renderStatement(st, lang, tr) {
  const T = tr || ((l, k, p) => require('./i18n-server').serverT(l, k, p));
  const L = lang || st.lang || 'en';
  const lines = [
    T(L, 'moderation.sor_action_' + st.action),
    T(L, 'moderation.sor_rule', { rule: T(L, 'moderation.rule_' + st.rule) }),
  ];
  if (st.ground === 'illegal' && st.law) lines.push(T(L, 'moderation.sor_law', { country: st.law.country, basis: T(L, 'moderation.basis_' + st.law.basis) }));
  if (st.facts) lines.push(T(L, 'moderation.sor_facts', { facts: st.facts }));
  lines.push(T(L, st.automatedDetection ? 'moderation.sor_detected_auto' : 'moderation.sor_detected_report'));
  lines.push(T(L, st.automatedDecision ? 'moderation.sor_decided_auto' : 'moderation.sor_decided_human'));
  if (st.durationDays) lines.push(T(L, 'moderation.sor_duration', { days: st.durationDays }));
  lines.push(T(L, 'moderation.sor_redress'));
  return { lang: L, title: T(L, 'moderation.sor_title'), lines };
}

function publicStatement(st, appeal) {
  if (!st) return null;
  return {
    id: st.id,
    action: st.action,
    ground: st.ground,
    rule: st.rule,
    law: st.law || null,
    facts: st.facts || null,
    automatedDetection: !!st.automatedDetection,
    automatedDecision: !!st.automatedDecision,
    durationDays: st.durationDays || null,
    target: { type: st.target && st.target.type },
    createdAtMs: st.createdAtMs,
    appealDeadlineMs: st.appealDeadlineMs,
    status: st.status,
    appeal: appeal ? { id: appeal.id, status: appeal.status, decidedAtMs: appeal.decidedAtMs || null } : null,
  };
}

async function getStatementForUser(db, uid, statementId) {
  const s = await db.collection('statements').doc(String(statementId || '')).get();
  if (!s.exists || s.data().uid !== uid) return { ok: false, error: 'NOT_FOUND' };
  const st = { id: s.id, ...s.data() };
  const ap = st.appealId ? await db.collection('appeals').doc(st.appealId).get() : null;
  return { ok: true, statement: publicStatement(st, ap && ap.exists ? { id: ap.id, ...ap.data() } : null) };
}

/** Internal complaint (one per statement; repeated rejected appeals → cooldown). */
async function fileAppeal(adminApp, uid, statementId, text, opts) {
  const now = (opts && opts.now) || Date.now();
  const db = adminApp.firestore();
  const sref = db.collection('statements').doc(String(statementId || ''));
  const s = await sref.get();
  if (!s.exists || s.data().uid !== uid) return { ok: false, error: 'NOT_FOUND' };
  const st = s.data();
  if (st.appealId) return { ok: false, error: 'ALREADY_APPEALED' };
  if (st.appealDeadlineMs && now > st.appealDeadlineMs) return { ok: false, error: 'APPEAL_WINDOW_CLOSED' };
  const recent = (await db.collection('appeals').where('uid', '==', uid).get()).docs.map((d) => d.data());
  const rejected = recent.filter((a) => a.status === 'upheld' && now - (a.decidedAtMs || 0) < APPEAL_COOLDOWN_DAYS * DAY).length;
  if (rejected >= APPEAL_REJECT_LIMIT) return { ok: false, error: 'APPEAL_LIMIT' };
  const aref = db.collection('appeals').doc();
  const appeal = {
    uid,
    statementId: sref.id,
    reportId: st.reportId || null,
    text: str(text, 1000),
    status: 'open',
    originalModerator: st.moderatorUid || null,
    createdAtMs: now,
    dueMs: now + APPEAL_DUE_DAYS * DAY,
    lang: st.lang || 'en',
  };
  await aref.set(appeal);
  await sref.set({ appealId: aref.id }, { merge: true });
  await notify(adminApp, uid, { type: 'appeal_received', refId: aref.id, previewKey: 'notifications.push.appeal_received', deepLink: { moderation: sref.id } });
  return { ok: true, appealId: aref.id, dueMs: appeal.dueMs };
}

/** outcome: 'upheld' (decision stands) | 'reversed' (action undone). Never the original moderator. */
async function decideAppeal(adminApp, moderatorUid, appealId, outcome, note, opts) {
  const now = (opts && opts.now) || Date.now();
  const db = adminApp.firestore();
  const aref = db.collection('appeals').doc(String(appealId || ''));
  const a = await aref.get();
  if (!a.exists) return { ok: false, error: 'NOT_FOUND' };
  const ap = a.data();
  if (ap.status !== 'open') return { ok: false, error: 'ALREADY_DECIDED' };
  if (ap.originalModerator && ap.originalModerator === moderatorUid) return { ok: false, error: 'SAME_MODERATOR' };
  if (outcome !== 'upheld' && outcome !== 'reversed') return { ok: false, error: 'VALIDATION_ERROR' };
  const sref = db.collection('statements').doc(ap.statementId);
  const st = { id: sref.id, ...((await sref.get()).data() || {}) };
  if (outcome === 'reversed') {
    await undoAction(adminApp, st);
    await sref.set({ status: 'reversed', reversedAtMs: now }, { merge: true });
  }
  await aref.set({ status: outcome, decidedBy: moderatorUid, decidedAtMs: now, note: str(note, 500) }, { merge: true });
  await notify(adminApp, ap.uid, {
    type: 'appeal_outcome',
    refId: appealId,
    previewKey: outcome === 'reversed' ? 'notifications.push.appeal_reversed' : 'notifications.push.appeal_upheld',
    deepLink: { moderation: ap.statementId },
  });
  return { ok: true, outcome };
}

/** Reporter's own reports, privacy-safe (status + outcome only). */
async function myReports(db, uid) {
  const docs = (await db.collection('reports').where('reporterUid', '==', uid).get()).docs;
  return docs
    .map((d) => {
      const r = d.data();
      return {
        id: d.id,
        reason: r.reason,
        targetType: r.target && r.target.type,
        status: r.status === 'actioned' ? 'actioned' : r.status === 'dismissed' ? 'no_violation' : 'in_review',
        createdAtMs: r.createdAtMs,
        decidedAtMs: r.decidedAtMs || null,
        resolveDueMs: r.resolveDueMs || null,
      };
    })
    .sort((a, b) => b.createdAtMs - a.createdAtMs)
    .slice(0, 50);
}

/** Scheduler: reminders before the India 24 h / 15-day deadlines and per-queue SLAs; overdue flags. */
async function processModerationTimers(adminApp, opts) {
  const o = opts || {};
  const now = o.now || Date.now();
  const db = adminApp.firestore();
  const mods = String(process.env.MODERATOR_UIDS || o.moderators || '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
  const out = { open: 0, overdue: 0, reminders: 0, ackDue: 0, resolveDue: 0 };
  const open = [];
  for (const st of ['open', 'in_review']) open.push(...(await db.collection('reports').where('status', '==', st).get()).docs);
  for (const d of open) {
    const r = d.data();
    out.open++;
    const due = [];
    if (r.grievance && !r.firstTouchAtMs && r.ackDueMs && now >= r.ackDueMs - 6 * HOUR) due.push('ack');
    if (r.grievance && r.resolveDueMs && now >= r.resolveDueMs - 2 * DAY) due.push('resolve');
    if (r.slaDueMs && now >= r.slaDueMs) {
      due.push('sla');
      out.overdue++;
    }
    const fresh = due.filter((k) => (r.remindersSent || []).indexOf(k) < 0);
    if (due.indexOf('ack') >= 0) out.ackDue++;
    if (due.indexOf('resolve') >= 0) out.resolveDue++;
    if (!fresh.length) continue;
    for (const m of mods) {
      await notify(adminApp, m, { type: 'moderation_sla', refId: d.id + '_' + fresh.join('_'), previewKey: 'notifications.push.moderation_sla', previewParams: { queue: r.queue } });
    }
    await d.ref.set({ remindersSent: (r.remindersSent || []).concat(fresh), overdue: due.indexOf('sla') >= 0 }, { merge: true });
    out.reminders += fresh.length;
  }
  await db.collection('chaupaalMeta').doc('moderationTimers').set({ ...out, at: now }, { merge: true });
  return out;
}

function median(xs) {
  const a = xs.filter((x) => Number.isFinite(x)).sort((p, q) => p - q);
  if (!a.length) return null;
  const m = Math.floor(a.length / 2);
  return a.length % 2 ? a[m] : (a[m - 1] + a[m]) / 2;
}
function inc(o, k) {
  o[k] = (o[k] || 0) + 1;
}

/** Transparency report for a period (DSA Art. 15/24-style fields). Pure. */
function transparencyReport({ reports, statements, appeals, fromMs, toMs }) {
  const inP = (t) => t >= fromMs && t < toMs;
  const R = (reports || []).filter((r) => inP(r.createdAtMs));
  const S = (statements || []).filter((s) => inP(s.createdAtMs));
  const A = (appeals || []).filter((a) => inP(a.createdAtMs));
  const out = {
    period: { from: new Date(fromMs).toISOString(), to: new Date(toMs).toISOString() },
    notices: { total: R.length, byCategory: {}, byCountry: {}, illegalByBasis: {}, childSafety: 0 },
    actions: { total: S.length, byType: {}, byGround: {}, byCategory: {} },
    automated: { detection: S.filter((s) => s.automatedDetection).length, decision: S.filter((s) => s.automatedDecision).length, human: S.filter((s) => !s.automatedDecision).length },
    appeals: { total: A.length, upheld: 0, reversed: 0, open: 0, medianDecisionHours: null },
    handling: { medianHours: null, byCategory: {} },
    india: { grievances: 0, acknowledgedWithin24h: 0, resolvedWithin15d: 0, open: 0 },
  };
  R.forEach((r) => {
    inc(out.notices.byCategory, r.reason);
    inc(out.notices.byCountry, r.reporterRegion || 'unknown');
    if (r.illegal) inc(out.notices.illegalByBasis, r.illegal.basis);
    if (r.reason === 'child_safety') out.notices.childSafety++;
    if (r.grievance) {
      out.india.grievances++;
      if (r.ackSentAtMs && r.ackSentAtMs - r.createdAtMs <= INDIA.ackHours * HOUR) out.india.acknowledgedWithin24h++;
      if (r.decidedAtMs && r.resolveDueMs && r.decidedAtMs <= r.resolveDueMs) out.india.resolvedWithin15d++;
      if (!r.decidedAtMs) out.india.open++;
    }
  });
  S.forEach((s) => {
    inc(out.actions.byType, s.action);
    inc(out.actions.byGround, s.ground);
    inc(out.actions.byCategory, s.reason || 'other');
  });
  const hours = (r) => (r.decidedAtMs ? (r.decidedAtMs - r.createdAtMs) / HOUR : NaN);
  out.handling.medianHours = median(R.map(hours));
  const cats = {};
  R.forEach((r) => (cats[r.reason] = cats[r.reason] || []).push(hours(r)));
  Object.keys(cats).forEach((k) => (out.handling.byCategory[k] = median(cats[k])));
  A.forEach((a) => {
    if (a.status === 'upheld') out.appeals.upheld++;
    else if (a.status === 'reversed') out.appeals.reversed++;
    else out.appeals.open++;
  });
  out.appeals.medianDecisionHours = median(A.map((a) => (a.decidedAtMs ? (a.decidedAtMs - a.createdAtMs) / HOUR : NaN)));
  return out;
}

function transparencyCsv(rep) {
  const rows = [['section', 'key', 'value']];
  const walk = (prefix, obj) =>
    Object.keys(obj).forEach((k) => {
      const v = obj[k];
      if (v && typeof v === 'object') walk(prefix ? prefix + '.' + k : k, v);
      else rows.push([prefix, k, v == null ? '' : v]);
    });
  walk('', rep);
  return rows.map((r) => r.map((c) => (/[",\n]/.test(String(c)) ? '"' + String(c).replace(/"/g, '""') + '"' : String(c))).join(',')).join('\n') + '\n';
}

/** DSA Transparency Database-shaped rows (manual admin export; submission is a manual step). */
function dsaExport(statements) {
  const visibility = { remove: 'DECISION_VISIBILITY_CONTENT_REMOVED', restrict: 'DECISION_VISIBILITY_CONTENT_DEMOTED', age_restrict: 'DECISION_VISIBILITY_CONTENT_AGE_RESTRICTED' };
  const account = { suspend: 'DECISION_ACCOUNT_SUSPENDED', ban: 'DECISION_ACCOUNT_TERMINATED' };
  const category = { child_safety: 'STATEMENT_CATEGORY_PROTECTION_OF_MINORS', self_harm: 'STATEMENT_CATEGORY_RISK_FOR_PUBLIC_SECURITY', violence: 'STATEMENT_CATEGORY_VIOLENCE', illegal: 'STATEMENT_CATEGORY_ILLEGAL_OR_HARMFUL_SPEECH', sexual: 'STATEMENT_CATEGORY_PORNOGRAPHY_OR_SEXUALIZED_CONTENT', hate: 'STATEMENT_CATEGORY_ILLEGAL_OR_HARMFUL_SPEECH', harassment: 'STATEMENT_CATEGORY_CYBER_VIOLENCE', impersonation: 'STATEMENT_CATEGORY_SCAMS_AND_FRAUD', ip: 'STATEMENT_CATEGORY_INTELLECTUAL_PROPERTY_INFRINGEMENTS', spam: 'STATEMENT_CATEGORY_SCOPE_OF_PLATFORM_SERVICE', other: 'STATEMENT_CATEGORY_SCOPE_OF_PLATFORM_SERVICE' };
  return (statements || []).map((s) => ({
    puid: s.id,
    decision_visibility: visibility[s.action] ? [visibility[s.action]] : [],
    decision_account: account[s.action] || null,
    decision_ground: s.ground === 'illegal' ? 'DECISION_GROUND_ILLEGAL_CONTENT' : 'DECISION_GROUND_INCOMPATIBLE_CONTENT',
    illegal_content_legal_ground: s.ground === 'illegal' && s.law ? `${s.law.country}: ${s.law.basis}` : null,
    incompatible_content_ground: s.ground === 'tos' ? s.rule : null,
    category: category[s.reason] || 'STATEMENT_CATEGORY_SCOPE_OF_PLATFORM_SERVICE',
    content_type: [s.target && /comment|message|chat|peepal|post/.test(s.target.type) ? 'CONTENT_TYPE_TEXT' : 'CONTENT_TYPE_OTHER'],
    territorial_scope: s.territorialScope || ['ALL'],
    automated_detection: s.automatedDetection ? 'Yes' : 'No',
    automated_decision: s.automatedDecision ? 'AUTOMATED_DECISION_FULLY' : 'AUTOMATED_DECISION_NOT_AUTOMATED',
    source_type: 'SOURCE_ARTICLE_16',
    application_date: new Date(s.createdAtMs).toISOString().slice(0, 10),
  }));
}

async function loadPeriod(db, fromMs, toMs) {
  const all = async (col) => (await db.collection(col).get()).docs.map((d) => ({ id: d.id, ...d.data() })).filter((x) => x.createdAtMs >= fromMs && x.createdAtMs < toMs);
  return { reports: await all('reports'), statements: await all('statements'), appeals: await all('appeals'), fromMs, toMs };
}

module.exports = {
  REASONS,
  REASON_IDS,
  LEGAL_BASES,
  TARGET_TYPES,
  ACTIONS,
  INDIA,
  SUSPEND_DAYS,
  APPEAL_REJECT_LIMIT,
  normalizeReport,
  sortQueue,
  createReport,
  claimReport,
  decideReport,
  renderStatement,
  getStatementForUser,
  fileAppeal,
  decideAppeal,
  myReports,
  processModerationTimers,
  transparencyReport,
  transparencyCsv,
  dsaExport,
  loadPeriod,
  targetRef,
};
