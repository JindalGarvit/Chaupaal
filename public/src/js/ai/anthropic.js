/**
 * @deprecated Use callAI from /src/js/ai/call-ai.js.
 * This file is kept so any stale script tags still resolve; it loads call-ai if missing.
 */
(function () {
  if (typeof window.callAI === 'function' && typeof window.callAnthropic === 'function') return;
  console.warn('[ai] Load ai-config.js + call-ai.js before anthropic.js');
})();
