/**
 * Product feedback digests — daily / weekly.
 * Deterministic by default; optional LLM when AI_FEATURES_ENABLED=true.
 */
const { callAI } = require('./ai');
const { isAiFeaturesEnabled } = require('./ai-config');

function founderUids() {
  return String(process.env.FEEDBACK_FOUNDER_UIDS || '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
}

function periodWindow(period) {
  const to = Date.now();
  const ms = period === 'weekly' ? 7 * 24 * 60 * 60 * 1000 : 24 * 60 * 60 * 1000;
  return { from: new Date(to - ms), to: new Date(to), period };
}

function periodKey(period, to) {
  const d = to instanceof Date ? to : new Date(to);
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, '0');
  const day = String(d.getUTCDate()).padStart(2, '0');
  if (period === 'weekly') {
    const week = Math.ceil(d.getUTCDate() / 7);
    return `weekly_${y}-${m}-w${week}`;
  }
  return `daily_${y}-${m}-${day}`;
}

function deterministicActionItems(byChip, total, samples) {
  const items = [];
  items.push(`${total} feedback item${total === 1 ? '' : 's'} in this period`);
  const ranked = Object.entries(byChip || {}).sort((a, b) => b[1] - a[1]);
  ranked.slice(0, 4).forEach(([chip, n]) => {
    if (n > 0) items.push(`${n} tagged “${chip}”`);
  });
  const bugN = byChip.bug || 0;
  const ideaN = byChip.idea || byChip.suggestion || 0;
  if (bugN) items.push(`Review ${bugN} bug report${bugN === 1 ? '' : 's'}`);
  if (ideaN) items.push(`Triage ${ideaN} feature ask${ideaN === 1 ? '' : 's'}`);
  const words = {};
  (samples || []).forEach((s) => {
    String(s.message || '')
      .toLowerCase()
      .split(/[^a-z0-9]+/)
      .filter((w) => w.length > 4)
      .forEach((w) => {
        words[w] = (words[w] || 0) + 1;
      });
  });
  const topWords = Object.entries(words)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3)
    .map(([w]) => w);
  if (topWords.length) items.push(`Frequent words: ${topWords.join(', ')}`);
  return items.slice(0, 8);
}

async function enrichWithAI({ byChip, total, samples, actionItems }) {
  if (!isAiFeaturesEnabled || !isAiFeaturesEnabled() || !callAI) return null;
  try {
    const result = await callAI({
      tier: 'fast',
      feature: 'feedback_digest',
      max_tokens: 420,
      system:
        'Summarize product feedback for founders. Return JSON: {"summary":"...","actionItems":["..."]}. Neutral, actionable.',
      messages: [
        {
          role: 'user',
          content: JSON.stringify({ total, byChip, samples: samples.slice(0, 12), actionItems }),
        },
      ],
    });
    const raw = String(result?.text || '');
    const start = raw.indexOf('{');
    const end = raw.lastIndexOf('}');
    if (start < 0) return null;
    const parsed = JSON.parse(raw.slice(start, end + 1));
    return {
      summary: String(parsed.summary || '').slice(0, 2000) || null,
      actionItems: Array.isArray(parsed.actionItems)
        ? parsed.actionItems.map((x) => String(x).slice(0, 200)).slice(0, 10)
        : null,
    };
  } catch (e) {
    console.warn('[feedback-digest] AI', e?.message || e);
    return null;
  }
}

async function sendDigestEmail(digest) {
  const to = String(process.env.FEEDBACK_DIGEST_EMAIL || '').trim();
  if (!to || digest.period !== 'weekly') return { skipped: 'no_email_or_not_weekly' };
  const key = process.env.RESEND_API_KEY || process.env.FEEDBACK_EMAIL_API_KEY;
  if (!key) return { skipped: 'no_mailer_key' };
  try {
    const subject = `Chaupaal feedback digest · ${digest.periodKey}`;
    const body = [
      digest.summary || '',
      '',
      ...(digest.actionItems || []).map((a) => `• ${a}`),
      '',
      `Total: ${digest.total}`,
    ].join('\n');
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${key}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: process.env.FEEDBACK_EMAIL_FROM || 'Chaupaal <onboarding@resend.dev>',
        to: [to],
        subject,
        text: body,
      }),
    });
    if (!res.ok) {
      const t = await res.text().catch(() => '');
      console.warn('[feedback-digest] email', res.status, t.slice(0, 200));
      return { ok: false, status: res.status };
    }
    return { ok: true };
  } catch (e) {
    console.warn('[feedback-digest] email', e?.message || e);
    return { ok: false, error: e?.message };
  }
}

async function deliverToFounders(db, admin, digest) {
  const uids = founderUids();
  if (!uids.length) return { skipped: 'no_founders' };
  const title = `Feedback digest · ${digest.period}`;
  const text =
    digest.summary ||
    `${digest.total} items. ${(digest.actionItems || []).slice(0, 3).join(' · ')}`;
  let sent = 0;
  for (const uid of uids) {
    try {
      await db
        .collection('users')
        .doc(uid)
        .collection('chaupaalEvents')
        .add({
          type: 'feedback_digest',
          displayMode: 'graphicCard',
          payload: {
            title,
            text: String(text).slice(0, 800),
            subtitle: digest.periodKey,
            kicker: 'Product',
            cta: 'Open Chaupaal',
            action: 'open_chaupaal_chat',
            fromApp: true,
            label: 'Feedback digest',
            digestId: digest.periodKey,
          },
          createdAt: admin.firestore.FieldValue.serverTimestamp(),
          dismissed: false,
          engaged: false,
          serverOwned: true,
        });
      // Also drop a short companion message when possible
      try {
        const chatId = `chat_chaupaal_${uid}`;
        await db
          .collection('chats')
          .doc(chatId)
          .collection('messages')
          .add({
            uid: 'chaupaal',
            name: 'Chaupaal',
            text: `${title}\n\n${text}`.slice(0, 2000),
            ts: admin.firestore.FieldValue.serverTimestamp(),
            serverOwned: true,
            kind: 'feedback_digest',
          });
      } catch (e2) {}
      sent++;
    } catch (e) {
      console.warn('[feedback-digest] founder', uid, e?.message || e);
    }
  }
  return { sent };
}

async function runFeedbackDigest(db, admin, { period = 'daily', force = false } = {}) {
  const win = periodWindow(period);
  const key = periodKey(period, win.to);
  const ref = db.collection('feedbackDigests').doc(key);
  if (!force) {
    const existing = await ref.get();
    if (existing.exists) return { skipped: 'exists', periodKey: key };
  }

  const snap = await db
    .collection('companionProductFeedback')
    .where('createdAt', '>=', win.from)
    .limit(400)
    .get()
    .catch(async () => {
      // Fallback if index missing: recent scan
      const all = await db.collection('companionProductFeedback').orderBy('createdAt', 'desc').limit(200).get();
      return {
        docs: all.docs.filter((d) => {
          const ts = d.data()?.createdAt?.toDate?.() || null;
          return ts && ts >= win.from;
        }),
        size: 0,
      };
    });

  const byChip = { bug: 0, idea: 0, love: 0, other: 0, suggestion: 0, complaint: 0 };
  const samples = [];
  snap.docs.forEach((d) => {
    const data = d.data() || {};
    const cat = String(data.category || (data.chips && data.chips[0]) || 'other').slice(0, 40);
    byChip[cat] = (byChip[cat] || 0) + 1;
    if (samples.length < 12) {
      samples.push({
        category: cat,
        message: String(data.message || data.text || '').slice(0, 220),
        uid: data.uid || null,
      });
    }
  });
  const total = snap.docs.length;
  let actionItems = deterministicActionItems(byChip, total, samples);
  let summary = `${total} product feedback item${total === 1 ? '' : 's'} (${period}). Top: ${
    Object.entries(byChip)
      .filter(([, n]) => n)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 3)
      .map(([k, n]) => `${k} ${n}`)
      .join(', ') || 'none'
  }.`;

  const ai = await enrichWithAI({ byChip, total, samples, actionItems });
  if (ai?.summary) summary = ai.summary;
  if (ai?.actionItems?.length) actionItems = ai.actionItems;

  const digest = {
    period,
    periodKey: key,
    from: win.from,
    to: win.to,
    total,
    byChip,
    samples,
    actionItems,
    summary,
    createdAt: admin.firestore.FieldValue.serverTimestamp(),
    emailed: false,
  };
  await ref.set(digest, { merge: true });

  await deliverToFounders(db, admin, { ...digest, periodKey: key });
  let emailOut = { skipped: true };
  if (period === 'weekly') {
    emailOut = await sendDigestEmail({ ...digest, periodKey: key });
    if (emailOut?.ok) await ref.set({ emailed: true }, { merge: true });
  }

  return { ok: true, periodKey: key, total, emailed: !!emailOut?.ok };
}

module.exports = { runFeedbackDigest, periodKey, founderUids };
