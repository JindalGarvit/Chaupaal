/**
 * URL safety check — Google Web Risk Lookup API (uris:search) when key is set,
 * otherwise lightweight heuristics. Never blocks unchecked URLs as "safe";
 * callers still show the leave-app interstitial.
 *
 * Env: GOOGLE_WEB_RISK_KEY (API key with Web Risk API enabled).
 * Docs: https://cloud.google.com/web-risk/docs/lookup-api
 */
'use strict';

const THREAT_TYPES = ['MALWARE', 'SOCIAL_ENGINEERING', 'UNWANTED_SOFTWARE'];

function heuristicCheck(url) {
  try {
    const u = new URL(url);
    const host = u.hostname.toLowerCase();
    const suspicious =
      /\.(tk|ml|ga|cf|gq|zip|mov)(\.|$)/i.test(host) ||
      /login|signin|verify-account|password-reset|free-prize/i.test(u.pathname + u.search) ||
      host.split('.').some((p) => p.length > 40);
    if (suspicious) {
      return { safe: false, checked: true, threat: 'SUSPICIOUS', reason: 'heuristic' };
    }
    return { safe: true, checked: false, reason: 'heuristic_pass' };
  } catch {
    return { safe: false, checked: true, threat: 'INVALID', reason: 'invalid_url' };
  }
}

function readWebRiskKey() {
  const key =
    typeof process.env.GOOGLE_WEB_RISK_KEY === 'string' ? process.env.GOOGLE_WEB_RISK_KEY.trim() : '';
  return key || '';
}

/**
 * Lookup API: GET https://webrisk.googleapis.com/v1/uris:search
 * Empty body {} means no match. Matches return threat.threatTypes[].
 */
async function checkUrlWithWebRisk(url) {
  const key = readWebRiskKey();
  if (!key) return heuristicCheck(url);

  let parsed;
  try {
    parsed = new URL(url);
  } catch {
    return { safe: false, checked: true, threat: 'INVALID', reason: 'invalid_url' };
  }
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    return { safe: false, checked: true, threat: 'INVALID', reason: 'invalid_url' };
  }

  try {
    const params = new URLSearchParams();
    params.set('key', key);
    params.set('uri', parsed.href);
    for (const t of THREAT_TYPES) params.append('threatTypes', t);

    const endpoint = `https://webrisk.googleapis.com/v1/uris:search?${params.toString()}`;
    const res = await fetch(endpoint, {
      method: 'GET',
      headers: { Accept: 'application/json' },
    });

    if (!res.ok) {
      console.warn('[url-safety] Web Risk HTTP', res.status);
      return heuristicCheck(url);
    }

    let data;
    try {
      data = await res.json();
    } catch (e) {
      console.warn('[url-safety] Web Risk JSON parse failed', e?.message || e);
      return heuristicCheck(url);
    }

    const threatTypes = Array.isArray(data?.threat?.threatTypes) ? data.threat.threatTypes : [];
    if (threatTypes.length) {
      return {
        safe: false,
        checked: true,
        threat: threatTypes[0] || 'MALWARE',
        reason: 'web_risk',
      };
    }
    return { safe: true, checked: true, reason: 'web_risk' };
  } catch (e) {
    console.warn('[url-safety] Web Risk error', e?.message || e);
    return heuristicCheck(url);
  }
}

module.exports = {
  checkUrlWithWebRisk,
  heuristicCheck,
  /** @deprecated use checkUrlWithWebRisk */
  checkUrlWithSafeBrowsing: checkUrlWithWebRisk,
};
