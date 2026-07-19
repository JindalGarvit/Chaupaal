/**
 * Chaupaal conversation persona + safety helpers.
 * Branding: the app itself talking — never "AI assistant" in UI copy.
 */

const CHAUPAAL_SYSTEM_PROMPT = `You are Chaupaal — the Chaupaal app itself speaking with the user in a private Baithak chat.

Identity & branding (non-negotiable):
- You are Chaupaal, not a generic assistant, chatbot, or named AI product.
- Speak as the app: warm, low-frequency, like a thoughtful friend texting.
- Never use notification-spam energy, guilt ("you haven't opened the app"), or numeric usage stats ("you spent 47 minutes").
- Never label yourself "AI Chat", "Assistant", or similar in your replies.
- HARD RULE: If the user sincerely and directly asks whether they are talking to a real person or to AI / a bot / a language model, you MUST NOT falsely claim to be human. Stay in brand voice, e.g. "I'm Chaupaal — part of the app, here to talk, recommend, and check in." Be honest without breaking warmth.

Tone:
- Short messages when possible (1–3 short paragraphs max).
- Encourage connection, reflection, and curiosity — never lecture.
- Prefer questions that invite sharing over advice dumps.

Safety (non-negotiable):
- If the user shows real distress, respond with care and presence — do not deflect, joke away, or minimize.
- Do not give clinical diagnoses or therapy substitutes.
- If they describe self-harm, suicide intent, or immediate danger, prioritize safety and encourage reaching real local help. (A server-side crisis path may override your reply.)

Feedback classification:
- When the user message is feedback/complaint/bug report about the product, still reply warmly,
  and in your JSON mark isFeedback true with a tag.

Output format — respond with ONLY valid JSON (no markdown fences):
{
  "reply": "your message to the user",
  "isFeedback": false,
  "feedbackTag": "bug" | "complaint" | "suggestion" | "other" | null
}`;

const CRISIS_PATTERNS = [
  /\b(kill myself|killing myself|end my life|take my own life)\b/i,
  /\b(suicide|suicidal)\b/i,
  /\b(self[-\s]?harm|cut myself|cutting myself)\b/i,
  /\b(want to die|wanna die|don'?t want to live|wish i (was|were) dead)\b/i,
  /\b(hurt myself|hurting myself)\b/i,
  // Realistic, non-keyword phrasings people actually type
  /\bbetter off (without me|dead)\b/i,
  /\bdon'?t (really )?want to (be here|be around|exist) anymore\b/i,
  /\b(end|ending) it all\b/i,
  /\bthinking (about|of) ending (it|things|my life)\b/i,
  /\bno reason to (live|keep going|go on)\b/i,
];

const CRISIS_REPLY =
  "I'm really glad you told me. What you're carrying sounds heavy, and you deserve real care — not just a chat in the app.\n\n" +
  "If you might hurt yourself or feel in immediate danger, please contact local emergency services now, or reach someone you trust in person.\n\n" +
  "In India you can also call AASRA at +91-9820466726 (24/7). If you're elsewhere, please use your local crisis / emergency number.\n\n" +
  "I'm Chaupaal — here with you in the app — but real people and local help matter most right now. You don't have to go through this alone.";

function detectCrisis(text) {
  const t = String(text || '');
  if (!t.trim()) return false;
  return CRISIS_PATTERNS.some((re) => re.test(t));
}

function isDirectIdentityQuestion(text) {
  const t = String(text || '').toLowerCase();
  if (!t.trim()) return false;
  return (
    /\b(are you (a |an )?(real )?(person|human|ai|bot|robot|language model|llm))\b/.test(t) ||
    /\b(am i talking to (a |an )?(real )?(person|human|ai|bot))\b/.test(t) ||
    /\b(is this (ai|a bot|a human|a real person))\b/.test(t) ||
    /\b(who(?:'| a)?re you)\b/.test(t) && /\b(ai|bot|human|real)\b/.test(t)
  );
}

function heuristicFeedbackTag(text) {
  const t = String(text || '').toLowerCase();
  if (!t.trim()) return null;
  if (/\b(bug|broken|crash|error|doesn't work|doesnt work|glitch|not loading)\b/.test(t)) return 'bug';
  if (/\b(hate|awful|terrible|worst|annoyed|frustrated|complaint|complain)\b/.test(t)) return 'complaint';
  if (/\b(suggest|feature|would be nice|please add|you should|idea:)\b/.test(t)) return 'suggestion';
  if (/\b(feedback|improve|improvement)\b/.test(t)) return 'other';
  return null;
}

function parseStructuredReply(rawText) {
  const raw = String(rawText || '').trim();
  if (!raw) return null;
  let jsonStr = raw.replace(/^```json\s*/i, '').replace(/^```\s*/i, '').replace(/```$/i, '').trim();
  const start = jsonStr.indexOf('{');
  const end = jsonStr.lastIndexOf('}');
  if (start >= 0 && end > start) jsonStr = jsonStr.slice(start, end + 1);
  try {
    const parsed = JSON.parse(jsonStr);
    const reply = String(parsed.reply || parsed.message || '').trim();
    if (!reply) return null;
    const tag = parsed.feedbackTag;
    const allowed = ['bug', 'complaint', 'suggestion', 'other'];
    return {
      reply,
      isFeedback: !!parsed.isFeedback,
      feedbackTag: allowed.includes(tag) ? tag : parsed.isFeedback ? 'other' : null,
    };
  } catch {
    return null;
  }
}

function normalizeReply(rawText, userMessage) {
  if (detectCrisis(userMessage)) {
    return { reply: CRISIS_REPLY, isFeedback: false, feedbackTag: null, crisis: true };
  }
  const structured = parseStructuredReply(rawText);
  if (structured) {
    if (!structured.isFeedback) {
      const heur = heuristicFeedbackTag(userMessage);
      if (heur) {
        structured.isFeedback = true;
        structured.feedbackTag = heur;
      }
    }
    return { ...structured, crisis: false };
  }
  // Fallback: treat plain text as reply
  const reply = String(rawText || '')
    .replace(/^```[\s\S]*?```$/g, '')
    .trim()
    .slice(0, 2000);
  const heur = heuristicFeedbackTag(userMessage);
  return {
    reply: reply || "I'm here — tell me a bit more whenever you're ready.",
    isFeedback: !!heur,
    feedbackTag: heur,
    crisis: false,
  };
}

module.exports = {
  CHAUPAAL_SYSTEM_PROMPT,
  CRISIS_REPLY,
  detectCrisis,
  isDirectIdentityQuestion,
  heuristicFeedbackTag,
  parseStructuredReply,
  normalizeReply,
};
