/**
 * Authenticated Chaupaal system conversation.
 * Persists to chats/chat_chaupaal_{uid}/messages and routes feedback.
 */
const { sendSuccess, sendError, requireMethod, parseJsonBody } = require('../server-lib/http');
const { requireUser, initAdmin } = require('../server-lib/auth');
const { callAI, AiDisabledError } = require('../server-lib/ai');
const { isAiFeaturesEnabled } = require('../server-lib/ai-config');
const {
  CHAUPAAL_SYSTEM_PROMPT,
  CRISIS_REPLY,
  detectCrisis,
  isDirectIdentityQuestion,
  heuristicFeedbackTag,
  normalizeReply,
} = require('../server-lib/chaupaal-persona');
const { parseChaupaalIntents, buildNavigatorReply } = require('../server-lib/chaupaal-intents');

function chatIdFor(uid) {
  return `chat_chaupaal_${uid}`;
}

function isAdminUser(user) {
  return !!(user && user.decoded && user.decoded.admin === true);
}

function wantsProductFeedbackSummary(text) {
  const t = String(text || '').toLowerCase();
  if (!t.trim()) return false;
  return (
    /\b(product )?feedback\b/.test(t) &&
    /\b(summary|summarize|recent|latest|list|show|what|any|review)\b/.test(t)
  );
}

async function loadProductFeedbackBrief(db, { limit = 12 } = {}) {
  const out = { product: [], chatTagged: [] };
  try {
    const snap = await db
      .collection('companionProductFeedback')
      .orderBy('createdAt', 'desc')
      .limit(limit)
      .get();
    out.product = snap.docs.map((d) => {
      const data = d.data() || {};
      return {
        id: d.id,
        message: String(data.message || '').slice(0, 240),
        category: data.category || null,
        source: data.source || null,
        createdAt: data.createdAt?.toDate?.()?.toISOString?.() || null,
      };
    });
  } catch (e) {
    console.warn('[chaupaal-chat] product feedback brief', e?.message || e);
  }
  try {
    const snap = await db.collection('chaupaalFeedback').orderBy('timestamp', 'desc').limit(limit).get();
    out.chatTagged = snap.docs.map((d) => {
      const data = d.data() || {};
      return {
        id: d.id,
        message: String(data.message || '').slice(0, 240),
        tag: data.tag || null,
        timestamp: data.timestamp?.toDate?.()?.toISOString?.() || null,
      };
    });
  } catch (e) {
    console.warn('[chaupaal-chat] chat feedback brief', e?.message || e);
  }
  return out;
}

async function ensureChatDoc(db, uid) {
  const id = chatIdFor(uid);
  const ref = db.collection('chats').doc(id);
  const snap = await ref.get();
  if (!snap.exists) {
    await ref.set({
      participants: [uid],
      type: 'chaupaal',
      pinned: true,
      name: 'Chaupaal',
      createdAt: new Date(),
      updatedAt: new Date(),
      preview: 'Your space with Chaupaal',
      serverOwned: true,
    });
  } else {
    const data = snap.data() || {};
    const parts = Array.isArray(data.participants) ? data.participants : [];
    if (!parts.includes(uid) || data.type !== 'chaupaal') {
      await ref.set(
        {
          participants: parts.includes(uid) ? parts : [...parts, uid],
          type: 'chaupaal',
          pinned: true,
          name: data.name || 'Chaupaal',
          updatedAt: new Date(),
        },
        { merge: true }
      );
    }
  }
  return ref;
}

async function appendMessage(db, chatRef, msg) {
  const ref = await chatRef.collection('messages').add({
    ...msg,
    ts: new Date(),
  });
  await chatRef.set(
    {
      updatedAt: new Date(),
      preview: String(msg.text || '').slice(0, 120),
      lastMessageAt: new Date(),
    },
    { merge: true }
  );
  return ref.id;
}

async function writeFeedback(db, { uid, message, tag, messageId }) {
  await db.collection('chaupaalFeedback').add({
    userId: uid,
    message: String(message || '').slice(0, 4000),
    timestamp: new Date(),
    tag: tag || 'other',
    messageId: messageId || null,
    source: 'chaupaal_chat',
  });
}

module.exports = async function handler(req, res) {
  if (!requireMethod(req, res, 'POST')) return;

  const user = await requireUser(req, res, { allowWeak: false });
  if (!user) return;

  let body = {};
  try {
    body = parseJsonBody(req);
  } catch {
    return sendError(res, 400, 'INVALID_JSON', 'Invalid JSON body');
  }

  const text = String(body.message || body.text || '').trim();
  if (!text || text.length > 4000) {
    return sendError(res, 400, 'VALIDATION_ERROR', 'Message required (max 4000 chars)');
  }

  const admin = initAdmin();
  if (!admin) {
    return sendError(res, 503, 'AUTH_NOT_CONFIGURED', 'Firebase Admin not configured');
  }
  const db = admin.firestore();

  // Dual gate: env kill-switch. Client also checks feature_flags/ai_features.
  const aiOn = isAiFeaturesEnabled();

  try {
    const chatRef = await ensureChatDoc(db, user.uid);
    const userMsgId = await appendMessage(db, chatRef, {
      text,
      uid: user.uid,
      from: 'user',
      name: 'You',
      role: 'user',
      serverOwned: false,
    });

    // Crisis path runs BEFORE the kill switch on purpose: the safety reply is
    // hardcoded (no AI call, no spend), and someone in real distress should
    // never get a "quiet mode" brush-off.
    if (detectCrisis(text)) {
      const replyId = await appendMessage(db, chatRef, {
        text: CRISIS_REPLY,
        uid: 'chaupaal',
        from: 'chaupaal',
        name: 'Chaupaal',
        role: 'assistant',
        avatar: '🏠',
        serverOwned: true,
        crisis: true,
      });
      return sendSuccess(res, {
        reply: CRISIS_REPLY,
        isFeedback: false,
        feedbackTag: null,
        crisis: true,
        userMessageId: userMsgId,
        replyMessageId: replyId,
      });
    }

    const IDENTITY_REPLY =
      "I'm Chaupaal — part of the app, here to help you get around, check in, and share feedback. Not a separate human on the other end, but I'm listening.";

    async function persistNavigatorReply(navPayload) {
      const { reply, attachment, intents } = navPayload || {};
      const feedbackTag = heuristicFeedbackTag(text);
      const isFeedback = !!feedbackTag;
      const replyId = await appendMessage(db, chatRef, {
        text: reply,
        uid: 'chaupaal',
        from: 'chaupaal',
        name: 'Chaupaal',
        role: 'assistant',
        avatar: '🏠',
        serverOwned: true,
        navigator: true,
        attachment: attachment || null,
        intents: intents || null,
        isFeedback,
        feedbackTag: feedbackTag || null,
      });
      if (isFeedback) {
        try {
          await writeFeedback(db, {
            uid: user.uid,
            message: text,
            tag: feedbackTag || 'other',
            messageId: userMsgId,
          });
        } catch (fe) {
          console.warn('[chaupaal-chat] navigator feedback write failed', fe?.message || fe);
        }
      }
      return replyId;
    }

    async function respondNavigator() {
      try {
        const { checkActionRateLimit } = require('../server-lib/rate-limit');
        const rate = await checkActionRateLimit(user.uid, 'chaupaal_nav');
        if (!rate.ok) {
          return sendError(res, 429, 'RATE_LIMITED', 'Too many messages. Try again shortly.');
        }
      } catch (e) {
        console.warn('[chaupaal-chat] nav rate-limit check failed', e?.message || e);
      }

      if (isDirectIdentityQuestion(text)) {
        const replyId = await appendMessage(db, chatRef, {
          text: IDENTITY_REPLY,
          uid: 'chaupaal',
          from: 'chaupaal',
          name: 'Chaupaal',
          role: 'assistant',
          avatar: '🏠',
          serverOwned: true,
          navigator: true,
        });
        return sendSuccess(res, {
          reply: IDENTITY_REPLY,
          navigator: true,
          userMessageId: userMsgId,
          replyMessageId: replyId,
          chatId: chatIdFor(user.uid),
        });
      }

      const parsed = parseChaupaalIntents(text);
      const nav = buildNavigatorReply(parsed);
      const replyId = await persistNavigatorReply(nav);
      return sendSuccess(res, {
        reply: nav.reply,
        attachment: nav.attachment || null,
        intents: nav.intents || null,
        navigator: true,
        quiet: false,
        userMessageId: userMsgId,
        replyMessageId: replyId,
        chatId: chatIdFor(user.uid),
      });
    }

    if (!aiOn) {
      return respondNavigator();
    }

    const parsedForAi = parseChaupaalIntents(text);
    if ((parsedForAi.confidence === 'high' || parsedForAi.confidence === 'med') && parsedForAi.best) {
      return respondNavigator();
    }

    const history = Array.isArray(body.history) ? body.history.slice(-12) : [];
    let systemPrompt = CHAUPAAL_SYSTEM_PROMPT;
    let adminFeedbackBrief = null;

    // Admin-only convenience: Chaupaal can summarize recent product feedback.
    // Never inject feedback into context for non-admin users.
    if (isAdminUser(user) && wantsProductFeedbackSummary(text)) {
      try {
        adminFeedbackBrief = await loadProductFeedbackBrief(db, { limit: 14 });
        systemPrompt +=
          '\n\nADMIN CONTEXT (private — only for this admin user):\n' +
          'Recent product feedback (companionProductFeedback) and chat-tagged feedback follow as JSON. ' +
          'Summarize warmly in 3–6 short bullets for the founder. Do not invent items. ' +
          'If empty, say nothing new has come in.\n' +
          JSON.stringify(adminFeedbackBrief).slice(0, 6000);
      } catch (e) {
        console.warn('[chaupaal-chat] admin feedback inject', e?.message || e);
      }
    }

    const messages = [
      ...history
        .filter((m) => m && (m.role === 'user' || m.role === 'assistant') && m.content)
        .map((m) => ({ role: m.role, content: String(m.content).slice(0, 2000) })),
      { role: 'user', content: text },
    ];

    try {
      const { checkActionRateLimit } = require('../server-lib/rate-limit');
      const rate = await checkActionRateLimit(user.uid, 'ai');
      if (!rate.ok) {
        return sendError(res, 429, 'RATE_LIMITED', 'Too many messages. Try again shortly.');
      }
    } catch (e) {
      console.warn('[chaupaal-chat] ai rate-limit check failed', e?.message || e);
    }

    let rawText = '';
    try {
      const result = await callAI({
        tier: 'balanced',
        system: systemPrompt,
        messages,
        max_tokens: 700,
        feature: 'chaupaal_chat',
      });
      rawText = result.text || '';
    } catch (e) {
      if (e instanceof AiDisabledError || e?.code === 'AI_DISABLED') {
        return respondNavigator();
      }
      throw e;
    }

    const normalized = normalizeReply(rawText, text);
    const replyId = await appendMessage(db, chatRef, {
      text: normalized.reply,
      uid: 'chaupaal',
      from: 'chaupaal',
      name: 'Chaupaal',
      role: 'assistant',
      avatar: '🏠',
      serverOwned: true,
      isFeedback: !!normalized.isFeedback,
      feedbackTag: normalized.feedbackTag || null,
    });

    if (normalized.isFeedback && !adminFeedbackBrief) {
      try {
        await writeFeedback(db, {
          uid: user.uid,
          message: text,
          tag: normalized.feedbackTag || 'other',
          messageId: userMsgId,
        });
      } catch (fe) {
        console.warn('[chaupaal-chat] feedback write failed', fe?.message || fe);
      }
    }

    return sendSuccess(res, {
      reply: normalized.reply,
      isFeedback: !!normalized.isFeedback,
      feedbackTag: normalized.feedbackTag || null,
      crisis: !!normalized.crisis,
      userMessageId: userMsgId,
      replyMessageId: replyId,
      chatId: chatIdFor(user.uid),
      adminFeedback: !!adminFeedbackBrief,
    });
  } catch (e) {
    console.error('[chaupaal-chat]', e?.message || e);
    return sendError(res, 500, 'CHAUPAAL_CHAT_FAILED', 'Could not complete Chaupaal reply');
  }
};
