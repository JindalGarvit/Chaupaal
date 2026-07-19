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
  normalizeReply,
} = require('../server-lib/chaupaal-persona');

function chatIdFor(uid) {
  return `chat_chaupaal_${uid}`;
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

    if (!aiOn) {
      return sendSuccess(res, {
        reply: null,
        quiet: true,
        message:
          "Chaupaal is resting right now — your messages and history are safe here, and Chaupaal will be back soon.",
        userMessageId: userMsgId,
      });
    }

    const history = Array.isArray(body.history) ? body.history.slice(-12) : [];
    const messages = [
      ...history
        .filter((m) => m && (m.role === 'user' || m.role === 'assistant') && m.content)
        .map((m) => ({ role: m.role, content: String(m.content).slice(0, 2000) })),
      { role: 'user', content: text },
    ];

    let rawText = '';
    try {
      const result = await callAI({
        tier: 'balanced',
        system: CHAUPAAL_SYSTEM_PROMPT,
        messages,
        max_tokens: 700,
        feature: 'chaupaal_chat',
      });
      rawText = result.text || '';
    } catch (e) {
      if (e instanceof AiDisabledError || e?.code === 'AI_DISABLED') {
        return sendSuccess(res, {
          reply: null,
          quiet: true,
          message:
            "Chaupaal is resting right now — your messages and history are safe here, and Chaupaal will be back soon.",
          userMessageId: userMsgId,
        });
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
      serverOwned: true,
      isFeedback: !!normalized.isFeedback,
      feedbackTag: normalized.feedbackTag || null,
    });

    if (normalized.isFeedback) {
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
    });
  } catch (e) {
    console.error('[chaupaal-chat]', e?.message || e);
    return sendError(res, 500, 'CHAUPAAL_CHAT_FAILED', 'Could not complete Chaupaal reply');
  }
};
