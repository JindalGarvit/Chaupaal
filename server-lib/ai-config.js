/**
 * Server AI config — provider-agnostic.
 *
 * Env:
 *   AI_FEATURES_ENABLED  — must be exactly "true" to allow live provider calls (default OFF)
 *   AI_PROVIDER          — "anthropic" (default). Add others via api/lib/providers/<name>.js
 *
 * Model tiers (features should prefer tier over raw model ids):
 *   fast     → Haiku-class
 *   balanced → Sonnet-class
 *
 * LAUNCH CHECKLIST (when flipping AI on):
 *   See CONTENT.md § "AI features launch checklist"
 */
const AI_FEATURES_ENABLED = process.env.AI_FEATURES_ENABLED === 'true';
const AI_PROVIDER = (process.env.AI_PROVIDER || 'anthropic').toLowerCase();

const AI_MODELS = {
  fast: process.env.AI_MODEL_FAST || 'claude-haiku-4-5-20251001',
  balanced: process.env.AI_MODEL_BALANCED || 'claude-sonnet-4-6',
};

function isAiFeaturesEnabled() {
  return AI_FEATURES_ENABLED === true;
}

function resolveModel({ model, tier } = {}) {
  if (model) return model;
  const t = tier || 'fast';
  return AI_MODELS[t] || AI_MODELS.fast;
}

module.exports = {
  AI_FEATURES_ENABLED,
  AI_PROVIDER,
  AI_MODELS,
  isAiFeaturesEnabled,
  resolveModel,
};
