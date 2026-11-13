/**
 * Shared grounded Khabar/Sawaal generation for the scheduled cron.
 * Haiku-first → Sonnet escalate (same rules as the client path).
 *
 * Cache identity: see cat-cache-keys.js (category + IST day + optional city/industry).
 * Generate once per key; all users with that relevance slice reuse the same doc.
 */
const { callAnthropicServer } = require('./anthropic-server');
const AkhbaarSources = require('../public/src/js/core/akhbaar-sources.js');
const {
  CACHE_VERSION,
  TTL_MS,
  buildCatCacheDocId,
  catCacheLookupIds,
  istDayKey,
  isCatCacheFresh,
} = require('./cat-cache-keys');

function extractAnthropicText(data) {
  if (!data?.content) return '';
  return data.content.filter((b) => b.type === 'text').map((b) => b.text || '').join('\n');
}

function parseJsonArrayLoose(text) {
  if (!text) return null;
  let raw = text.replace(/```json|```/g, '').trim();
  const start = raw.indexOf('[');
  const end = raw.lastIndexOf(']');
  if (start >= 0 && end > start) raw = raw.slice(start, end + 1);
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : null;
  } catch (e) {
    return null;
  }
}

function isArticleUrl(link) {
  try {
    const u = new URL(link);
    if (u.protocol !== 'http:' && u.protocol !== 'https:') return false;
    const path = (u.pathname || '/').replace(/\/+$/, '') || '/';
    return path !== '/';
  } catch (e) {
    return false;
  }
}

function normalizeCatLink(link) {
  if (link && isArticleUrl(link)) return link;
  if (link && typeof link === 'string') {
    try {
      const u = new URL(link);
      if (/news\.google\.com|google\.com\/search/i.test(u.hostname + u.pathname)) return u.href;
    } catch (e) {}
  }
  return null;
}

/** Publisher rule: a summary is ≤80 words (never article text). Space-less scripts are capped by characters. */
const SUMMARY_MAX_WORDS = 80;
const SUMMARY_MAX_CHARS = 480;
function clampSummary(text) {
  const s = String(text || '').trim();
  const words = s.split(/\s+/);
  let out = words.length > SUMMARY_MAX_WORDS ? words.slice(0, SUMMARY_MAX_WORDS).join(' ') : s;
  if (out.length > SUMMARY_MAX_CHARS) out = out.slice(0, SUMMARY_MAX_CHARS);
  return out === s ? s : out.replace(/[\s,;:.–—-]+$/, '') + '…';
}

function sanitizeCatNewsItems(items) {
  return (items || []).map((item) => ({
    headline: item.headline || '',
    body: clampSummary(item.body),
    source: item.source || '',
    date: item.date || 'Today',
    link: normalizeCatLink(item.link),
  }));
}

function sanitizeCatMCQItems(items) {
  return (items || []).map((item) => ({
    q: item.q || '',
    options: Array.isArray(item.options) ? item.options : [],
    correct: typeof item.correct === 'number' ? item.correct : 0,
    explain: item.explain || '',
    synopsis: item.synopsis || '',
    source: item.source || '',
    link: normalizeCatLink(item.link),
  }));
}

function catNewsLooksGrounded(items) {
  if (!Array.isArray(items) || items.length < 2) return false;
  const withBody = items.filter((i) => i.body && String(i.body).length > 40 && i.headline).length;
  if (withBody < 2) return false;
  const badHomepages = items.filter(
    (i) => i.link && !isArticleUrl(i.link) && !/news\.google\.com/i.test(String(i.link))
  ).length;
  if (badHomepages >= Math.ceil(items.length / 2)) return false;
  return true;
}

function catMCQLooksGrounded(items) {
  if (!Array.isArray(items) || items.length < 3) return false;
  const withQ = items.filter(
    (i) => i.q && Array.isArray(i.options) && i.options.length >= 2 && i.synopsis
  ).length;
  if (withQ < 3) return false;
  const badHomepages = items.filter(
    (i) => i.link && !isArticleUrl(i.link) && !/news\.google\.com/i.test(String(i.link))
  ).length;
  if (badHomepages >= Math.ceil(items.length / 2)) return false;
  return true;
}

/**
 * Source scope for a cache job (L6): the region's publishers become the search tool's allowed_domains
 * and approximate location. No region → International. Prompts stay English (stored content is canonical).
 */
function sourceScope(scope = {}) {
  const regionId = AkhbaarSources.REGIONS[scope.region] ? scope.region : 'intl';
  const reg = AkhbaarSources.REGIONS[regionId];
  return {
    regionId,
    allowedDomains: AkhbaarSources.domainsFor(regionId),
    country: AkhbaarSources.searchCountry(regionId),
    audience: regionId === 'intl' ? 'a global audience' : `readers in ${reg.promptName}`,
    sourceNames: reg.sources.map((s) => s.name).join(', '),
  };
}

async function callCatAIWithSearch({ model, tier, max_tokens, system, user, src }) {
  return callAnthropicServer({
    enableWebSearch: true,
    model,
    tier,
    max_tokens,
    system,
    messages: [{ role: 'user', content: user }],
    feature: 'category_cron',
    country: src && src.country,
    allowedDomains: src && src.allowedDomains,
  });
}

/**
 * @param {string} catName
 * @param {{ city?: string, industry?: string, region?: string }} [scope]
 */
async function generateCatNewsGrounded(catName, scope = {}) {
  const src = sourceScope(scope);
  const cityBit = scope.city ? ` relevant to ${scope.city}` : '';
  const industryBit = scope.industry ? ` with an angle for ${scope.industry} professionals` : '';
  const system = `You are a news curator for Chaupaal, a global social app, writing for ${src.audience}.
You MUST use the web_search tool to find real, recent articles about "${catName}"${cityBit}${industryBit} from these sources: ${src.sourceNames}.
For each item: summarize ONLY from what the search returned, and set "link" to that article's exact URL from the search results.
If you cannot find a usable real article URL for an item, set "link" to null — NEVER invent or guess a URL, and NEVER use a publisher homepage.
Return ONLY a valid JSON array (no markdown, no commentary) with this exact shape:
[{"headline":"...","body":"...max 80 words...","source":"Publication name","link":"https://... or null","date":"Today"}]
Produce exactly 3 items.`;

  const user = `Search the web for recent news in category "${catName}"${cityBit}${industryBit}, then return 3 grounded news items as JSON.`;

  let data = await callCatAIWithSearch({ tier: 'fast', max_tokens: 2000, system, user, src });
  let items = parseJsonArrayLoose(extractAnthropicText(data));
  if (!catNewsLooksGrounded(items)) {
    data = await callCatAIWithSearch({ tier: 'balanced', max_tokens: 2500, system, user, src });
    items = parseJsonArrayLoose(extractAnthropicText(data));
  }
  return sanitizeCatNewsItems(items);
}

/**
 * @param {string} catName
 * @param {{ city?: string, industry?: string, region?: string }} [scope]
 */
async function generateCatMCQGrounded(catName, scope = {}) {
  const src = sourceScope(scope);
  const cityBit = scope.city ? ` relevant to ${scope.city}` : '';
  const industryBit = scope.industry ? ` for ${scope.industry} professionals` : '';
  const system = `You are a quiz maker for Chaupaal, a global social app, writing for ${src.audience}.
You MUST use the web_search tool to find real, recent articles about "${catName}"${cityBit}${industryBit} from these sources: ${src.sourceNames}.
Each question must be grounded in a searched story: write the synopsis from the article found, and set "link" to that article's exact URL from search results.
If no usable real article URL exists for a question, set "link" to null — NEVER invent URLs or use publisher homepages.
Return ONLY a valid JSON array (no markdown) with this exact shape:
[{
  "q":"...",
  "options":["A","B","C","D"],
  "correct":0,
  "explain":"one line why the correct answer is right",
  "synopsis":"60-word max news summary from the article you found",
  "source":"Publication name",
  "link":"https://... or null"
}]
Produce exactly 5 questions.`;

  const user = `Search the web for recent "${catName}" news${cityBit}${industryBit}, then return 5 grounded MCQ questions as JSON.`;

  let data = await callCatAIWithSearch({ tier: 'fast', max_tokens: 3000, system, user, src });
  let items = parseJsonArrayLoose(extractAnthropicText(data));
  if (!catMCQLooksGrounded(items)) {
    data = await callCatAIWithSearch({ tier: 'balanced', max_tokens: 3500, system, user, src });
    items = parseJsonArrayLoose(extractAnthropicText(data));
  }
  return sanitizeCatMCQItems(items);
}

module.exports = {
  CACHE_VERSION,
  TTL_MS,
  buildCatCacheDocId,
  catCacheLookupIds,
  istDayKey,
  isCatCacheFresh,
  generateCatNewsGrounded,
  generateCatMCQGrounded,
  sourceScope,
};
