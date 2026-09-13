/**
 * Provider-agnostic AI entrypoint for server routes + cron.
 *
 * Usage:
 *   const { callAI } = require('./ai');
 *   const result = await callAI({ tier: 'fast', system, messages, max_tokens, feature });
 *
 * Swap provider via env alone (7A):
 *   AI_PROVIDER=anthropic|openai-compatible|openai|grok
 *   + matching API key / base URL — callers never branch on vendor.
 */
'use strict';

const {
  AI_PROVIDER,
  isAiFeaturesEnabled,
  resolveModel,
  resolveProviderId,
} = require('./ai-config');
const anthropicProvider = require('./providers/anthropic');
const openaiCompatibleProvider = require('./providers/openai-compatible');

const PROVIDERS = {
  anthropic: anthropicProvider,
  'openai-compatible': openaiCompatibleProvider,
};

class AiDisabledError extends Error {
  constructor(message = 'AI features are disabled') {
    super(message);
    this.name = 'AiDisabledError';
    this.code = 'AI_DISABLED';
    this.status = 503;
  }
}

function getProvider(name = AI_PROVIDER) {
  const id = resolveProviderId(name);
  const p = PROVIDERS[id];
  if (!p) {
    const err = new AiDisabledError(`Unknown AI_PROVIDER: ${name}`);
    err.code = 'AI_PROVIDER_UNKNOWN';
    throw err;
  }
  return p;
}

/**
 * @param {object} opts
 * @param {string} [opts.tier] - 'fast' | 'balanced'
 * @param {string} [opts.model]
 * @param {array} opts.messages
 * @param {string} [opts.system]
 * @param {number} [opts.max_tokens]
 * @param {boolean} [opts.enableWebSearch] - Anthropic only; ignored elsewhere
 * @param {string} [opts.feature]
 * @param {boolean} [opts.bypassKillSwitch]
 */
async function callAI(opts = {}) {
  if (!opts.bypassKillSwitch && !isAiFeaturesEnabled()) {
    throw new AiDisabledError();
  }
  let provider;
  try {
    provider = getProvider();
  } catch (e) {
    if (e instanceof AiDisabledError) throw e;
    throw new AiDisabledError(e?.message || 'AI provider unavailable');
  }
  const model = resolveModel({ ...opts, provider: provider.id });
  let raw;
  try {
    raw = await provider.complete({
      model,
      messages: opts.messages || [],
      system: opts.system,
      max_tokens: opts.max_tokens || 1024,
      enableWebSearch: opts.enableWebSearch === true,
    });
  } catch (e) {
    if (e?.code === 'AI_NOT_CONFIGURED') {
      const err = new AiDisabledError(e.message || 'AI not configured');
      err.code = 'AI_NOT_CONFIGURED';
      throw err;
    }
    throw e;
  }
  const text = typeof provider.extractText === 'function' ? provider.extractText(raw) : '';
  return {
    text,
    content: raw?.content || [{ type: 'text', text }],
    raw,
    provider: provider.id,
    model,
    feature: opts.feature || null,
  };
}

module.exports = {
  callAI,
  getProvider,
  AiDisabledError,
  PROVIDERS,
  resolveProviderId,
};
