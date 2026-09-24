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
  isPublicContentForEmbed,
  buildContentEmbedText,
  BATCH_CONTENT_EMBEDS,
} = require('../server-lib/ai-enrichment');
const { resolveProviderId, resolveModel, PROVIDER_ALIASES, isCategoryCronPaused } = require('../server-lib/ai-config');
const { PROVIDERS, AiDisabledError } = require('../server-lib/ai');
const { textHash, embeddingsConfigured } = require('../server-lib/embeddings');

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

console.log('\nAll P8 ai-enrichment tests passed.');
