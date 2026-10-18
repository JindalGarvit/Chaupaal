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
const AiLang = require('../public/src/js/ai/ai-lang.js');

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
 * @param {string} [opts.lang] - UI text for ONE viewer: "Respond in <lang>" is added, the answer is
 *   checked for that script/language, and a wrong-language answer is retried once in English
 *   (result.lang = 'en', result.langFallback = true). Omit for shared/stored content (English canonical).
 * @param {boolean} [opts.langJson] - the answer is JSON: only its string values are checked
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
  const lang = opts.lang ? AiLang.normalize(opts.lang) : null;

  async function once(system) {
    let raw;
    try {
      raw = await provider.complete({
        model,
        messages: opts.messages || [],
        system,
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
    return { raw, text };
  }

  let out = await once(lang ? AiLang.withLang(opts.system, lang) : opts.system);
  let usedLang = lang;
  let langFallback = false;
  if (lang && lang !== 'en' && !AiLang.validate(out.text, lang, { json: !!opts.langJson }).ok) {
    out = await once(AiLang.withLang(opts.system, 'en'));
    usedLang = 'en';
    langFallback = true;
  }
  return {
    text: out.text,
    content: out.raw?.content || [{ type: 'text', text: out.text }],
    raw: out.raw,
    provider: provider.id,
    model,
    feature: opts.feature || null,
    lang: usedLang,
    langFallback,
  };
}

module.exports = {
  callAI,
  getProvider,
  AiDisabledError,
  PROVIDERS,
  resolveProviderId,
  AiLang,
};
