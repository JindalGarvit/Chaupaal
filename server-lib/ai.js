/**
 * Provider-agnostic AI entrypoint for server routes + cron.
 *
 * Usage:
 *   const { callAI } = require('./ai');
 *   const result = await callAI({ tier: 'fast', system, messages, max_tokens, enableWebSearch });
 *
 * To add OpenAI / Gemini later:
 *   1. Create server-lib/providers/openai.js exporting { id, complete, extractText }
 *   2. Register it in PROVIDERS below
 *   3. Set AI_PROVIDER=openai in env
 *   Features / cron keep calling callAI() — no per-feature changes.
 */
const { AI_PROVIDER, isAiFeaturesEnabled, resolveModel } = require('./ai-config');
const anthropicProvider = require('./providers/anthropic');

const PROVIDERS = {
  anthropic: anthropicProvider,
  // openai: require('./providers/openai'),
  // gemini: require('./providers/gemini'),
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
  const p = PROVIDERS[name];
  if (!p) {
    const err = new Error(`Unknown AI_PROVIDER: ${name}`);
    err.code = 'AI_PROVIDER_UNKNOWN';
    throw err;
  }
  return p;
}

/**
 * @param {object} opts
 * @param {string} [opts.tier] - 'fast' | 'balanced'
 * @param {string} [opts.model] - override tier mapping
 * @param {array} opts.messages
 * @param {string} [opts.system]
 * @param {number} [opts.max_tokens]
 * @param {boolean} [opts.enableWebSearch]
 * @param {string} [opts.feature] - attribution tag (not sent upstream)
 * @param {boolean} [opts.bypassKillSwitch] - ONLY for emergency ops; default false
 */
async function callAI(opts = {}) {
  if (!opts.bypassKillSwitch && !isAiFeaturesEnabled()) {
    throw new AiDisabledError();
  }
  const provider = getProvider();
  const model = resolveModel(opts);
  const raw = await provider.complete({
    model,
    messages: opts.messages || [],
    system: opts.system,
    max_tokens: opts.max_tokens || 1024,
    enableWebSearch: opts.enableWebSearch === true,
  });
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
};
