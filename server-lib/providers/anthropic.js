/**
 * Anthropic Messages provider.
 * Provider-specific: endpoint, auth headers, request/response shape, web_search tool.
 */
const ANTHROPIC_URL = 'https://api.anthropic.com/v1/messages';
const ANTHROPIC_VERSION = '2023-06-01';

const WEB_SEARCH_TOOL = {
  type: 'web_search_20250305',
  name: 'web_search',
  max_uses: 2,
  user_location: {
    type: 'approximate',
    country: 'IN',
    timezone: 'Asia/Kolkata',
  },
};

/**
 * @param {{ model: string, messages: array, system?: string, max_tokens?: number, enableWebSearch?: boolean }} req
 * @returns {Promise<object>} Anthropic Messages response (normalized by callAI)
 */
async function complete(req) {
  const apiKey = process.env.ANTHROPIC_API_KEY || process.env.Anthropic_API_key;
  if (!apiKey) {
    const err = new Error('ANTHROPIC_API_KEY is not configured');
    err.code = 'AI_NOT_CONFIGURED';
    throw err;
  }

  const payload = {
    model: req.model,
    max_tokens: req.max_tokens || 1024,
    messages: req.messages,
  };
  if (req.system) payload.system = req.system;
  if (req.enableWebSearch) payload.tools = [WEB_SEARCH_TOOL];

  const upstream = await fetch(ANTHROPIC_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': ANTHROPIC_VERSION,
    },
    body: JSON.stringify(payload),
  });

  const data = await upstream.json();
  if (!upstream.ok) {
    const msg = data?.error?.message || data?.error || `Anthropic HTTP ${upstream.status}`;
    const err = new Error(typeof msg === 'string' ? msg : JSON.stringify(msg));
    err.code = 'UPSTREAM_ERROR';
    err.status = upstream.status;
    err.details = data;
    throw err;
  }
  return data;
}

function extractText(data) {
  if (!data?.content) return '';
  return data.content
    .filter((b) => b.type === 'text')
    .map((b) => b.text || '')
    .join('\n');
}

module.exports = {
  id: 'anthropic',
  complete,
  extractText,
  WEB_SEARCH_TOOL,
};
