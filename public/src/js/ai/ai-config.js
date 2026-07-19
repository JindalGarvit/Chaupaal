/**
 * AI configuration — provider-agnostic.
 *
 * AI_FEATURES_ENABLED
 *   Client: Firestore feature_flags/ai_features (default OFF).
 *   Server: process.env.AI_FEATURES_ENABLED must be the string "true" to allow spend.
 *
 * AI_PROVIDER — process.env.AI_PROVIDER (default "anthropic"). Only anthropic implemented.
 *
 * Model tiers (config-driven; features should prefer tier over raw model ids):
 *   fast     → Haiku-class (JSON extract, light analysis)
 *   balanced → Sonnet-class (assistant chat, richer generation)
 *
 * FUTURE: add openai/gemini by implementing api/lib/providers/<name>.js and
 * public/src/js/ai/providers/<name>.js — features keep calling callAI().
 */
(function () {
  const AI_MODELS = {
    fast: 'claude-haiku-4-5-20251001',
    balanced: 'claude-sonnet-4-6',
  };

  /** Local mirror; refreshed from Firestore. Default OFF = no live spend while testing. */
  let aiFeaturesEnabledCache = false;
  let aiFeaturesHydrated = false;

  function resolveModel(opts = {}) {
    if (opts.model) return opts.model;
    const tier = opts.tier || 'fast';
    return AI_MODELS[tier] || AI_MODELS.fast;
  }

  async function refreshAiFeaturesFlag() {
    try {
      if (typeof isFeatureEnabled === 'function') {
        aiFeaturesEnabledCache = await isFeatureEnabled('ai_features', { defaultValue: false });
      } else {
        aiFeaturesEnabledCache = false;
      }
    } catch (e) {
      aiFeaturesEnabledCache = false;
    }
    aiFeaturesHydrated = true;
    return aiFeaturesEnabledCache;
  }

  /** Sync read of last-known flag (safe default: OFF). */
  function isAiFeaturesEnabledSync() {
    return !!aiFeaturesEnabledCache;
  }

  async function isAiFeaturesEnabled() {
    if (!aiFeaturesHydrated) await refreshAiFeaturesFlag();
    else {
      // Soft refresh in background if flag helper exists
      refreshAiFeaturesFlag().catch(() => {});
    }
    return !!aiFeaturesEnabledCache;
  }

  window.AI_MODELS = AI_MODELS;
  window.resolveAiModel = resolveModel;
  window.isAiFeaturesEnabled = isAiFeaturesEnabled;
  window.isAiFeaturesEnabledSync = isAiFeaturesEnabledSync;
  window.refreshAiFeaturesFlag = refreshAiFeaturesFlag;

  // Hydrate ASAP after flags module loads
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => refreshAiFeaturesFlag());
  } else {
    setTimeout(() => refreshAiFeaturesFlag(), 0);
  }
})();
