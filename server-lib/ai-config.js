/**
 * AI config — provider-agnostic kill switch + per-provider model tiers.
 *
 * Env matrix (no real keys):
 *   AI_FEATURES_ENABLED=true|false     master LLM kill switch
 *   AI_PROVIDER=anthropic|openai-compatible|openai|grok
 *   AI_MODEL_FAST / AI_MODEL_BALANCED  tier overrides
 *   ANTHROPIC_API_KEY                  anthropic
 *   OPENAI_API_KEY / AI_API_KEY / GROK_API_KEY + OPENAI_BASE_URL
 *   EMBED_PROVIDER=gemini|openai-compatible
 *   GEMINI_API_KEY / OPENAI_EMBED_MODEL
 *   AI_JOBS_PAUSED=true                pause enrichment jobs
 *   AI_DAILY_CALL_CAP=200              enrichment call budget / UTC day
 *   CATEGORY_CRON_PAUSED=true|false    Akhbaar cache cron (default paused)
 */
'use strict';

const AI_FEATURES_ENABLED = process.env.AI_FEATURES_ENABLED === 'true';
const AI_PROVIDER = (process.env.AI_PROVIDER || 'anthropic').toLowerCase();
const AI_JOBS_PAUSED =
  process.env.AI_JOBS_PAUSED === 'true' || process.env.AI_JOBS_PAUSED === '1';
const AI_DAILY_CALL_CAP = Math.max(0, Number(process.env.AI_DAILY_CALL_CAP) || 200);

/** Default CATEGORY_CRON_PAUSED=true (keep paused). Set CATEGORY_CRON_PAUSED=false to unpause with budget. */
function isCategoryCronPaused() {
  const v = process.env.CATEGORY_CRON_PAUSED;
  if (v === 'false' || v === '0') return false;
  if (v === 'true' || v === '1') return true;
  return true; // default paused (P8 verdict)
}

const PROVIDER_ALIASES = {
  anthropic: 'anthropic',
  openai: 'openai-compatible',
  'openai-compatible': 'openai-compatible',
  grok: 'openai-compatible',
  xai: 'openai-compatible',
};

const DEFAULT_MODELS = {
  anthropic: {
    fast: 'claude-haiku-4-5-20251001',
    balanced: 'claude-sonnet-4-6',
  },
  'openai-compatible': {
    fast: process.env.AI_MODEL_FAST_DEFAULT_OPENAI || 'gpt-4o-mini',
    balanced: process.env.AI_MODEL_BALANCED_DEFAULT_OPENAI || 'gpt-4o',
  },
};

function resolveProviderId(name = AI_PROVIDER) {
  return PROVIDER_ALIASES[String(name || '').toLowerCase()] || String(name || '').toLowerCase();
}

function isAiFeaturesEnabled() {
  return AI_FEATURES_ENABLED === true;
}

function resolveModel({ model, tier, provider } = {}) {
  if (model) return model;
  const pid = resolveProviderId(provider || AI_PROVIDER);
  const t = tier || 'fast';
  const envFast = process.env.AI_MODEL_FAST;
  const envBalanced = process.env.AI_MODEL_BALANCED;
  if (t === 'balanced' && envBalanced) return envBalanced;
  if (t === 'fast' && envFast) return envFast;
  if (envFast && t !== 'balanced') return envFast;
  const defaults = DEFAULT_MODELS[pid] || DEFAULT_MODELS.anthropic;
  return defaults[t] || defaults.fast;
}

module.exports = {
  AI_FEATURES_ENABLED,
  AI_PROVIDER,
  AI_JOBS_PAUSED,
  AI_DAILY_CALL_CAP,
  PROVIDER_ALIASES,
  DEFAULT_MODELS,
  isAiFeaturesEnabled,
  isCategoryCronPaused,
  resolveProviderId,
  resolveModel,
};
