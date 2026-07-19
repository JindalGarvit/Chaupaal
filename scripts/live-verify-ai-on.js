/**
 * Dev/test harness: exercise the Chaupaal reply logic with AI ENABLED.
 *
 * Mirrors api/chaupaal-chat.js branching exactly:
 *   1. detectCrisis(text) BEFORE any AI call → hardcoded CRISIS_REPLY
 *   2. otherwise → callAI(persona) → normalizeReply
 *
 * AI is enabled ONLY in this local process (AI_FEATURES_ENABLED=true set
 * before requiring the config module). Production env is untouched; no real
 * users exist yet. Secrets come from .env.vercel.local (git-ignored, deleted
 * after the run).
 *
 * Run: node scripts/live-verify-ai-on.js
 */
const fs = require('fs');
const path = require('path');

// --- Load pulled env file manually (no dotenv dependency) ---
const envPath = path.join(__dirname, '..', '.env.vercel.local');
let loadedCount = 0;
if (fs.existsSync(envPath)) {
  const raw = fs.readFileSync(envPath, 'utf8');
  raw.split(/\r?\n/).forEach((line) => {
    const trimmed = line.replace(/\r$/, '');
    const eq = trimmed.indexOf('=');
    if (eq <= 0) return;
    const key = trimmed.slice(0, eq).trim();
    if (!/^[A-Za-z0-9_]+$/.test(key)) return;
    let val = trimmed.slice(eq + 1).trim();
    if (val.length >= 2 && val.startsWith('"') && val.endsWith('"')) {
      try {
        val = JSON.parse(val);
      } catch {
        val = val.slice(1, -1);
      }
    }
    process.env[key] = val;
    loadedCount++;
  });
}

// Enable AI for THIS process only (dev/test context) — must be set before require.
process.env.AI_FEATURES_ENABLED = 'true';
const anthropicKey =
  process.env.ANTHROPIC_API_KEY ||
  process.env.Anthropic_API_key ||
  process.env.ANTHROPIC_API_key ||
  process.env.anthropic_api_key;
if (anthropicKey) process.env.ANTHROPIC_API_KEY = anthropicKey;

console.log('Env vars loaded from file:', loadedCount);
console.log('Anthropic key resolved:', !!process.env.ANTHROPIC_API_KEY);

const { callAI } = require('../server-lib/ai');
const { isAiFeaturesEnabled } = require('../server-lib/ai-config');
const {
  CHAUPAAL_SYSTEM_PROMPT,
  CRISIS_REPLY,
  detectCrisis,
  normalizeReply,
} = require('../server-lib/chaupaal-persona');

const VENTING =
  'ugh today was brutal. my manager tore apart my work in front of everyone and i just feel completely drained and done with this week';
const CRISIS =
  "i haven't been sleeping and honestly i've been thinking that everyone would be better off without me. i don't really want to be here anymore";

/** Faithful replica of the endpoint's reply decision. */
async function chaupaalReply(text) {
  if (detectCrisis(text)) {
    return { path: 'crisis_override', crisis: true, reply: CRISIS_REPLY, aiCalled: false };
  }
  const result = await callAI({
    tier: 'balanced',
    system: CHAUPAAL_SYSTEM_PROMPT,
    messages: [{ role: 'user', content: text }],
    max_tokens: 700,
    feature: 'chaupaal_chat',
  });
  const normalized = normalizeReply(result.text || '', text);
  return {
    path: 'generative',
    crisis: !!normalized.crisis,
    reply: normalized.reply,
    isFeedback: normalized.isFeedback,
    feedbackTag: normalized.feedbackTag,
    aiCalled: true,
    model: result.model,
  };
}

(async () => {
  console.log('AI enabled for this process:', isAiFeaturesEnabled());
  console.log('Provider key present:', !!process.env.ANTHROPIC_API_KEY);

  console.log('\n===== A) VENTING (expect: generative warm reply, NO override) =====');
  console.log('detectCrisis(venting) =', detectCrisis(VENTING));
  const v = await chaupaalReply(VENTING);
  console.log(JSON.stringify(v, null, 2));

  console.log('\n===== B) CRISIS-SHAPED (expect: override, NO generic reply) =====');
  console.log('detectCrisis(crisis) =', detectCrisis(CRISIS));
  const c = await chaupaalReply(CRISIS);
  console.log(JSON.stringify(c, null, 2));
})().catch((e) => {
  console.error('FAILED:', e?.message || e);
  process.exit(1);
});
