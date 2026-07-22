/**
 * URL safety check — Google Safe Browsing Lookup API when key is set,
 * otherwise lightweight heuristics. Never blocks unchecked URLs as "safe";
 * callers still show the leave-app interstitial.
 */
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

async function checkUrlWithSafeBrowsing(url) {
  const key =
    typeof process.env.GOOGLE_SAFE_BROWSING_KEY === 'string'
      ? process.env.GOOGLE_SAFE_BROWSING_KEY.trim()
      : '';
  if (!key) return heuristicCheck(url);

  try {
    const endpoint = `https://safebrowsing.googleapis.com/v4/threatMatches:find?key=${encodeURIComponent(key)}`;
    const res = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        client: { clientId: 'chaupaal', clientVersion: '1.0' },
        threatInfo: {
          threatTypes: ['MALWARE', 'SOCIAL_ENGINEERING', 'UNWANTED_SOFTWARE', 'POTENTIALLY_HARMFUL_APPLICATION'],
          platformTypes: ['ANY_PLATFORM'],
          threatEntryTypes: ['URL'],
          threatEntries: [{ url }],
        },
      }),
    });
    if (!res.ok) {
      console.warn('[url-safety] Safe Browsing HTTP', res.status);
      return heuristicCheck(url);
    }
    const data = await res.json();
    const match = Array.isArray(data.matches) && data.matches[0];
    if (match) {
      return {
        safe: false,
        checked: true,
        threat: match.threatType || 'MALWARE',
        reason: 'safe_browsing',
      };
    }
    return { safe: true, checked: true, reason: 'safe_browsing' };
  } catch (e) {
    console.warn('[url-safety]', e?.message || e);
    return heuristicCheck(url);
  }
}

module.exports = { checkUrlWithSafeBrowsing, heuristicCheck };
