/**
 * Shared grounded Khabar/Sawaal generation for the scheduled cron.
 * Haiku-first → Sonnet escalate (same rules as the client path).
 */
const { callAnthropicServer } = require('./anthropic-server');

const CAT_HAIKU = 'claude-haiku-4-5-20251001';
const CAT_SONNET = 'claude-sonnet-4-6';
const CACHE_VERSION = 'v2';

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

function sanitizeCatNewsItems(items) {
  return (items || []).map((item) => ({
    headline: item.headline || '',
    body: item.body || '',
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

async function callCatAIWithSearch({ model, max_tokens, system, user }) {
  return callAnthropicServer({
    enableWebSearch: true,
    model,
    max_tokens,
    system,
    messages: [{ role: 'user', content: user }],
  });
}

async function generateCatNewsGrounded(catName) {
  const system = `You are a news curator for Chaupaal, an Indian news app.
You MUST use the web_search tool to find real, recent articles about "${catName}" (prefer Indian/global mainstream sources).
For each item: summarize ONLY from what the search returned, and set "link" to that article's exact URL from the search results.
If you cannot find a usable real article URL for an item, set "link" to null — NEVER invent or guess a URL, and NEVER use a publisher homepage.
Return ONLY a valid JSON array (no markdown, no commentary) with this exact shape:
[{"headline":"...","body":"...max 80 words...","source":"Publication name","link":"https://... or null","date":"Today"}]
Produce exactly 3 items.`;

  const user = `Search the web for recent news in category "${catName}", then return 3 grounded news items as JSON.`;

  let data = await callCatAIWithSearch({ model: CAT_HAIKU, max_tokens: 2000, system, user });
  let items = parseJsonArrayLoose(extractAnthropicText(data));
  if (!catNewsLooksGrounded(items)) {
    data = await callCatAIWithSearch({ model: CAT_SONNET, max_tokens: 2500, system, user });
    items = parseJsonArrayLoose(extractAnthropicText(data));
  }
  return sanitizeCatNewsItems(items);
}

async function generateCatMCQGrounded(catName) {
  const system = `You are a quiz maker for Chaupaal, an Indian news & social app.
You MUST use the web_search tool to find real, recent articles about "${catName}" for an Indian audience.
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

  const user = `Search the web for recent "${catName}" news, then return 5 grounded MCQ questions as JSON.`;

  let data = await callCatAIWithSearch({ model: CAT_HAIKU, max_tokens: 3000, system, user });
  let items = parseJsonArrayLoose(extractAnthropicText(data));
  if (!catMCQLooksGrounded(items)) {
    data = await callCatAIWithSearch({ model: CAT_SONNET, max_tokens: 3500, system, user });
    items = parseJsonArrayLoose(extractAnthropicText(data));
  }
  return sanitizeCatMCQItems(items);
}

module.exports = {
  CACHE_VERSION,
  generateCatNewsGrounded,
  generateCatMCQGrounded,
};
