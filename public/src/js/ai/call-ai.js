/**
 * Provider-agnostic AI client.
 *
 * Features should call callAI({ tier|model, system, messages, max_tokens, enableWebSearch, feature })
 * rather than Anthropic's API shape directly.
 *
 * callAnthropic(body) remains as a compatibility alias that routes through callAI.
 *
 * Master kill-switch: isAiFeaturesEnabled() — when false, no network call is made.
 */
(function () {
  const AI_DISABLED_MSG = 'AI is temporarily paused while we finish testing. Try again later.';

  function extractText(data) {
    if (!data) return '';
    if (typeof data.text === 'string') return data.text;
    if (Array.isArray(data.content)) {
      return data.content.map((b) => (b && b.text) || '').join('');
    }
    return '';
  }

  /**
   * Normalize provider response to a common shape:
   * { text, content: [{type:'text', text}], raw }
   */
  function normalizeResponse(raw) {
    const text = extractText(raw);
    return {
      text,
      content: raw?.content || [{ type: 'text', text }],
      raw,
    };
  }

  async function callAI(opts = {}, fetchOpts = {}) {
    const enabled =
      typeof isAiFeaturesEnabled === 'function' ? await isAiFeaturesEnabled() : false;
    if (!enabled) {
      const err = new Error(AI_DISABLED_MSG);
      err.code = 'AI_DISABLED';
      err.status = 503;
      throw err;
    }

    const model =
      typeof resolveAiModel === 'function'
        ? resolveAiModel(opts)
        : opts.model || 'claude-haiku-4-5-20251001';

    const body = {
      model,
      max_tokens: opts.max_tokens || 1024,
      messages: opts.messages || [],
    };
    if (opts.system) body.system = opts.system;
    if (opts.enableWebSearch === true) body.enableWebSearch = true;
    // Optional feature tag for future analytics / cost attribution
    if (opts.feature) body.feature = opts.feature;

    const headers = { 'Content-Type': 'application/json' };
    try {
      if (typeof auth !== 'undefined' && auth.currentUser) {
        headers.Authorization = `Bearer ${await auth.currentUser.getIdToken()}`;
      }
    } catch (e) {}
    if (fetchOpts.idempotencyKey) {
      headers['Idempotency-Key'] = String(fetchOpts.idempotencyKey).slice(0, 128);
    }

    const resp = await fetch('/api/ai', {
      method: 'POST',
      headers,
      body: JSON.stringify(body),
    });
    const json = await resp.json().catch(() => null);

    if (json && json.ok === true && json.data != null) {
      const normalized = normalizeResponse(json.data);
      // Back-compat: callers that expect Anthropic shape can use .content
      return { ...normalized.raw, text: normalized.text, content: normalized.content };
    }
    if (json && json.ok === false) {
      const err = new Error(json.error?.message || 'AI request failed');
      err.code = json.error?.code;
      err.status = resp.status;
      throw err;
    }
    if (json && (json.content || json.type)) {
      const normalized = normalizeResponse(json);
      return { ...normalized.raw, text: normalized.text, content: normalized.content };
    }
    if (!resp.ok) {
      throw new Error((json && json.error) || 'AI request failed');
    }
    return json;
  }

  /** @deprecated Prefer callAI({ tier, system, messages }). Kept so existing call sites keep working. */
  async function callAnthropic(body, { idempotencyKey } = {}) {
    return callAI(
      {
        model: body?.model,
        tier: body?.tier,
        system: body?.system,
        messages: body?.messages,
        max_tokens: body?.max_tokens,
        enableWebSearch: body?.enableWebSearch,
        feature: body?.feature || 'legacy_callAnthropic',
      },
      { idempotencyKey }
    );
  }

  window.callAI = callAI;
  window.callAnthropic = callAnthropic;
  window.AI_DISABLED_MSG = AI_DISABLED_MSG;
})();
