// Proxy client — forwards Messages API payloads to /api/anthropic
// Phase 5: expects { ok, data } envelope; unwraps Anthropic payload for callers.
async function callAnthropic(body, { idempotencyKey } = {}) {
  const headers = { 'Content-Type': 'application/json' };
  try {
    if (typeof auth !== 'undefined' && auth.currentUser) {
      headers.Authorization = `Bearer ${await auth.currentUser.getIdToken()}`;
    }
  } catch (e) {}
  if (idempotencyKey) headers['Idempotency-Key'] = String(idempotencyKey).slice(0, 128);

  const resp = await fetch('/api/anthropic', {
    method: 'POST',
    headers,
    body: JSON.stringify(body),
  });
  const json = await resp.json().catch(() => null);
  if (json && json.ok === true && json.data != null) return json.data;
  if (json && json.ok === false) {
    const err = new Error(json.error?.message || 'AI request failed');
    err.code = json.error?.code;
    err.status = resp.status;
    throw err;
  }
  // Legacy raw Anthropic response (pre-envelope)
  if (json && (json.content || json.type)) return json;
  if (!resp.ok) {
    throw new Error((json && json.error) || 'AI request failed');
  }
  return json;
}
