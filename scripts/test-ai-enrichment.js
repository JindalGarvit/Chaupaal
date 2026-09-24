/**
 * Unit tests for P8 AI enrichment — redaction, taxonomy, providers (no network).
 */
'use strict';

const {
  redactForPrompt,
  normalizeTopicKey,
  validateTopics,
  heuristicLabel,
  contentHash,
  PROHIBITED_TOPIC_KEYS,
  LABEL_VERSION,
  budgetAllows,
  embedBudgetAllows,
  isPublicContentForEmbed,
  buildContentEmbedText,
  BATCH_CONTENT_EMBEDS,
  AI_DAILY_CALL_CAP,
} = require('../server-lib/ai-enrichment');
const { resolveProviderId, resolveModel, PROVIDER_ALIASES, isCategoryCronPaused } = require('../server-lib/ai-config');
const { PROVIDERS, AiDisabledError } = require('../server-lib/ai');
const { textHash, embeddingsConfigured } = require('../server-lib/embeddings');
const fs = require('fs');
const path = require('path');

function assert(cond, msg) {
  if (!cond) throw new Error(msg || 'assert failed');
  console.log('✓', msg);
}

// --- Redaction ---
const dirty =
  'Meet @garvit at 12.9716, 77.5946 or email me@x.com / +91 98765 43210. Journal: private thoughts.';
const clean = redactForPrompt(dirty);
assert(!clean.includes('@garvit'), 'redacts handles');
assert(!clean.includes('me@x.com'), 'redacts email');
assert(!clean.includes('98765'), 'redacts phone');
assert(!clean.includes('12.9716'), 'redacts coords');
assert(redactForPrompt('looking for dating apps', { teen: true }).includes('[redacted]'), 'teen dating redaction');

// --- Taxonomy + prohibited ---
assert(normalizeTopicKey('travel') === 'Travel', 'canonical Travel');
assert(normalizeTopicKey('religion') === null, 'drops religion');
assert(normalizeTopicKey('made-up-topic-xyz') === null, 'drops unknown');
assert(PROHIBITED_TOPIC_KEYS.has('caste'), 'caste prohibited');
const validated = validateTopics([
  { key: 'Travel', confidence: 0.9 },
  { key: 'religion', confidence: 0.99 },
  { key: 'Food', confidence: 1.2 },
  { key: 'Travel', confidence: 0.5 },
]);
assert(validated.length === 2, 'dedupe + drop prohibited');
assert(validated[0].key === 'Travel' && validated[0].confidence === 0.9, 'Travel confidence capped');
assert(validated[1].key === 'Food' && validated[1].confidence === 1, 'Food conf clamped');

const heur = heuristicLabel('Went on a trek and cooked chai after cricket');
assert(heur.some((t) => t.key === 'Nature' || t.key === 'Sports' || t.key === 'Food'), 'heuristic hits');

// --- Hash cache identity ---
assert(contentHash('same') === contentHash('same'), 'contentHash stable');
assert(contentHash('a') !== contentHash('b'), 'contentHash differs');
assert(textHash('abc') === textHash('abc'), 'textHash stable');
assert(LABEL_VERSION.startsWith('p8'), 'label version');

// --- Provider registry ---
assert(resolveProviderId('anthropic') === 'anthropic', 'anthropic id');
assert(resolveProviderId('openai') === 'openai-compatible', 'openai alias');
assert(resolveProviderId('grok') === 'openai-compatible', 'grok alias');
assert(PROVIDER_ALIASES.xai === 'openai-compatible', 'xai alias');
assert(PROVIDERS.anthropic && PROVIDERS['openai-compatible'], 'both adapters registered');
assert(typeof PROVIDERS.anthropic.complete === 'function', 'anthropic complete');
assert(typeof PROVIDERS['openai-compatible'].extractText === 'function', 'openai extractText');
assert(resolveModel({ tier: 'fast', provider: 'anthropic' }).includes('haiku') || resolveModel({ tier: 'fast', provider: 'anthropic' }), 'fast model resolves');
assert(new AiDisabledError().code === 'AI_DISABLED', 'AiDisabledError code');

// --- Category cron verdict default ---
const prev = process.env.CATEGORY_CRON_PAUSED;
delete process.env.CATEGORY_CRON_PAUSED;
assert(isCategoryCronPaused() === true, 'category cron default paused');
process.env.CATEGORY_CRON_PAUSED = 'false';
assert(isCategoryCronPaused() === false, 'category cron unpause via env');
if (prev === undefined) delete process.env.CATEGORY_CRON_PAUSED;
else process.env.CATEGORY_CRON_PAUSED = prev;

// --- Budget gate shape ---
assert(budgetAllows({ paused: true, calls: 0 }) === false, 'paused budget blocks');
assert(budgetAllows({ paused: false, calls: 999999 }) === false, 'over-cap or AI-off blocks');

// --- Content embeddings (I2) public gate + text ---
assert(BATCH_CONTENT_EMBEDS > 0 && BATCH_CONTENT_EMBEDS <= 12, 'content embed batch capped');
assert(isPublicContentForEmbed('duniya', { audience: 'public', caption: 'hi' }), 'public duniya embeddable');
assert(!isPublicContentForEmbed('duniya', { audience: 'private', caption: 'hi' }), 'private duniya skipped');
assert(!isPublicContentForEmbed('peepal', { audience: 'friends', question: 'q' }), 'friends peepal skipped');
assert(isPublicContentForEmbed('peepal', { audience: 'everyone', question: 'q' }), 'everyone peepal embeddable');
assert(!isPublicContentForEmbed('peepal', { audience: 'everyone', saveOnly: true, question: 'q' }), 'saveOnly skipped');
const embText = buildContentEmbedText({
  question: 'Best trek near @secret?',
  caption: 'email me@x.com',
  tag: 'Travel',
});
assert(!embText.includes('@secret') && !embText.includes('me@x.com'), 'embed text redacts PII');
assert(typeof embeddingsConfigured === 'function', 'embeddingsConfigured exported');

// --- Infra I3: shared embed budget (pause + cap; no AI_FEATURES required) ---
assert(typeof embedBudgetAllows === 'function', 'embedBudgetAllows exported');
assert(AI_DAILY_CALL_CAP > 0, 'daily call cap positive');
assert(embedBudgetAllows({ paused: true, calls: 0 }) === false, 'paused blocks embeds');
assert(embedBudgetAllows({ paused: false, calls: AI_DAILY_CALL_CAP }) === false, 'cap blocks embeds');
assert(embedBudgetAllows({ paused: false, calls: 0 }) === true || process.env.AI_JOBS_PAUSED === 'true', 'embed allows under cap when jobs not paused');

const envEx = fs.readFileSync(path.join(__dirname, '..', '.env.example'), 'utf8');
assert(/Unpause checklist/.test(envEx), 'env matrix unpause checklist');
assert(/CHAUPAAL_RETRIEVAL_BACKEND/.test(envEx), 'env lists retrieval backend');
assert(/AI_DAILY_CALL_CAP/.test(envEx) && /GEMINI_API_KEY/.test(envEx), 'env lists cap + embed key');
assert(/0 15 \* \* \*/.test(envEx) && /0 2 \* \* \*/.test(envEx), 'env documents staggered crons');

const sched = fs.readFileSync(path.join(__dirname, '..', 'api/chaupaal-scheduler.js'), 'utf8');
assert(/deadlineMs:\s*startedAt\s*\+\s*SOFT_BUDGET_MS/.test(sched), 'scheduler passes soft deadline to enrichment');

const enrichSrc = fs.readFileSync(path.join(__dirname, '..', 'server-lib/ai-enrichment.js'), 'utf8');
assert(/embedBudgetAllows/.test(enrichSrc) && /cursorHeld/.test(enrichSrc), 'embed jobs mid-cap hold cursor');
assert(/out\.ops\s*=/.test(enrichSrc), 'enrichment ops tally for scheduler');

const disclosure = fs.readFileSync(path.join(__dirname, '..', 'public/src/js/core/first-run.js'), 'utf8');
assert(/never call an AI model at request time/.test(disclosure), 'disclosure: no request-time LLM');
assert(/public posts|content embeddings|embeddings \(profiles/.test(disclosure), 'disclosure mentions offline embeddings honestly');
assert(!/embeddings never exist|never store embeddings/i.test(disclosure), 'disclosure does not deny embeddings');

console.log('\nAll P8 ai-enrichment tests passed.');
