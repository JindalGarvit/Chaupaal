/**
 * Server-side AI helper for cron / internal jobs.
 * Routes through callAI (provider-agnostic + master kill-switch).
 *
 * Back-compat: callAnthropicServer(body) still works and returns Anthropic-shaped data.
 */
const { callAI } = require('./ai');
const { WEB_SEARCH_TOOL } = require('./providers/anthropic');

async function callAnthropicServer(body) {
  const result = await callAI({
    model: body?.model,
    tier: body?.tier,
    system: body?.system,
    messages: body?.messages,
    max_tokens: body?.max_tokens,
    enableWebSearch: body?.enableWebSearch === true,
    feature: body?.feature || 'server_cron',
  });
  // Callers expect Anthropic Messages JSON
  return result.raw || { content: result.content, text: result.text };
}

module.exports = { callAnthropicServer, callAI, WEB_SEARCH_TOOL };
