/**
 * Server-side Anthropic Messages call (cron / API only).
 * Web search is opt-in via enableWebSearch — same gate as /api/anthropic.
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

async function callAnthropicServer(body) {
  const apiKey = process.env.ANTHROPIC_API_KEY || process.env.Anthropic_API_key;
  if (!apiKey) throw new Error('ANTHROPIC_API_KEY is not configured');

  const { enableWebSearch, tools: _ignore, ...rest } = body || {};
  const payload = { ...rest };
  if (enableWebSearch) payload.tools = [WEB_SEARCH_TOOL];

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
    throw new Error(typeof msg === 'string' ? msg : JSON.stringify(msg));
  }
  return data;
}

module.exports = { callAnthropicServer, WEB_SEARCH_TOOL };
