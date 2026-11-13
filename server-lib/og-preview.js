/**
 * Dynamic Open Graph HTML for crawlers (Growth G1).
 * Served via GET /api/stories?og=1&kind=… (no new serverless file).
 * Privacy: Friends-only / Private / gated posts → generic Chaupaal card only.
 */
'use strict';

const { initAdmin } = require('./auth');

const DEFAULT_IMAGE_PATH = '/icon-charpai-v2as.png';
const CACHE_PUBLIC = 'public, max-age=300, s-maxage=600, stale-while-revalidate=86400';
const CACHE_GENERIC = 'public, max-age=120, s-maxage=300';

const BOT_HINT =
  /facebookexternalhit|facebot|twitterbot|whatsapp|linkedinbot|slackbot|discordbot|telegrambot|googlebot|bingbot|applebot|preview|embedly|quora|pinterest|redditbot|skypeuripreview|vkshare|w3c_validator/i;

function isLikelyBot(ua) {
  return BOT_HINT.test(String(ua || ''));
}

function escapeHtml(s) {
  return String(s || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function siteOrigin(req) {
  const proto = String(req.headers['x-forwarded-proto'] || 'https').split(',')[0].trim() || 'https';
  const host = String(req.headers['x-forwarded-host'] || req.headers.host || 'chaupaal.com')
    .split(',')[0]
    .trim();
  return `${proto}://${host}`;
}

function absUrl(origin, pathOrUrl) {
  const p = String(pathOrUrl || DEFAULT_IMAGE_PATH).trim();
  if (/^https?:\/\//i.test(p)) return p.slice(0, 2048);
  if (p.startsWith('//')) return `https:${p}`.slice(0, 2048);
  if (!p.startsWith('/')) return `${origin}${DEFAULT_IMAGE_PATH}`;
  return `${origin}${p}`.slice(0, 2048);
}

function snippet(text, max = 140) {
  const t = String(text || '')
    .replace(/\s+/g, ' ')
    .trim();
  if (!t) return '';
  return t.length > max ? `${t.slice(0, max - 1)}…` : t;
}

function isRestrictedVisibility(v) {
  const s = String(v || '').toLowerCase();
  return s === 'private' || s.includes('friend');
}

/** Global L9: the 16 UI languages — html lang, og:locale, hreflang alternates. */
const OG_LANGS = [
  ['en', 'en', 'en_US'], ['hi', 'hi', 'hi_IN'], ['bn', 'bn', 'bn_BD'], ['ta', 'ta', 'ta_IN'], ['te', 'te', 'te_IN'], ['mr', 'mr', 'mr_IN'],
  ['ur', 'ur', 'ur_PK'], ['ar', 'ar', 'ar_AR'], ['es', 'es', 'es_ES'], ['fr', 'fr', 'fr_FR'], ['pt', 'pt-BR', 'pt_BR'], ['de', 'de', 'de_DE'],
  ['id', 'id', 'id_ID'], ['ja', 'ja', 'ja_JP'], ['ko', 'ko', 'ko_KR'], ['zh', 'zh-Hans', 'zh_CN'],
];

/** ?lang= first, then Accept-Language, then English. */
function ogLang(req) {
  const q = (req && req.query) || {};
  const tags = [q.lang].concat(String((req && req.headers && req.headers['accept-language']) || '').split(',').map((s) => s.split(';')[0]));
  for (const raw of tags) {
    const base = String(raw || '').trim().toLowerCase().split(/[-_]/)[0];
    if (OG_LANGS.some((l) => l[0] === base)) return base;
  }
  return 'en';
}

function withLang(url, lang) {
  const u = String(url || '');
  if (lang === 'en') return u.replace(/([?&])lang=[^&]*&?/, '$1').replace(/[?&]$/, '');
  return u + (u.includes('?') ? '&' : '?') + 'lang=' + lang;
}

function ogText(lang, key, fallback, params) {
  try {
    const v = require('./i18n-server').serverT(lang, key, params || {});
    return v && v !== key ? v : fallback;
  } catch (e) {
    return fallback;
  }
}

function renderOgHtml({ origin, title, description, image, url, cacheControl, lang }) {
  const L = OG_LANGS.find((l) => l[0] === lang) || OG_LANGS[0];
  const t = escapeHtml(title || 'Chaupaal');
  const d = escapeHtml(description || ogText(L[0], 'common.og_default_desc', 'Gather under the same light'));
  const img = escapeHtml(absUrl(origin, image || DEFAULT_IMAGE_PATH));
  const base = url || `${origin}/`;
  const u = escapeHtml(withLang(base, L[0]));
  const canonical = escapeHtml(base);
  const dir = L[0] === 'ar' || L[0] === 'ur' ? ' dir="rtl"' : '';
  const alternates = OG_LANGS.map((l) => `<link rel="alternate" hreflang="${l[1]}" href="${escapeHtml(withLang(base, l[0]))}">`).join('\n');
  const ogAlt = OG_LANGS.filter((l) => l[0] !== L[0]).map((l) => `<meta property="og:locale:alternate" content="${l[2]}">`).join('\n');
  return `<!DOCTYPE html>
<html lang="${L[1]}"${dir}>
<head>
<meta charset="UTF-8">
<title>${t}</title>
<meta name="description" content="${d}">
<meta property="og:type" content="website">
<meta property="og:site_name" content="Chaupaal">
<meta property="og:locale" content="${L[2]}">
${ogAlt}
<meta property="og:title" content="${t}">
<meta property="og:description" content="${d}">
<meta property="og:image" content="${img}">
<meta property="og:url" content="${u}">
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:title" content="${t}">
<meta name="twitter:description" content="${d}">
<meta name="twitter:image" content="${img}">
<link rel="canonical" href="${canonical}">
${alternates}
<link rel="alternate" hreflang="x-default" href="${canonical}">
</head>
<body>
<p><a href="${u}">${escapeHtml(ogText(L[0], 'common.og_open_in_app', 'Open in Chaupaal'))}</a></p>
</body>
</html>`;
}

function sendHtml(res, html, cacheControl = CACHE_PUBLIC, method) {
  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.setHeader('Cache-Control', cacheControl);
  res.setHeader('X-Robots-Tag', 'noindex'); // previews for unfurl; SPA is the product
  const verb = method || res.req?.method || '';
  // HEAD probes (WhatsApp etc.) — same headers, no body
  if (verb === 'HEAD') {
    res.setHeader('Content-Length', Buffer.byteLength(html, 'utf8'));
    return res.status(200).end();
  }
  return res.status(200).send(html);
}

function genericCard(origin, pathHint, lang) {
  return {
    title: 'Chaupaal', // i18n-ignore (brand)
    description: ogText(lang || 'en', 'common.og_default_desc', 'Gather under the same light'),
    image: DEFAULT_IMAGE_PATH,
    url: `${origin}${pathHint || '/'}`,
    cacheControl: CACHE_GENERIC,
  };
}

async function buildProfileOg(db, origin, usernameRaw, lang) {
  const L = lang || 'en';
  const uname = String(usernameRaw || '')
    .replace(/^@/, '')
    .toLowerCase()
    .trim()
    .slice(0, 40);
  const path = `/profile/${encodeURIComponent(uname)}`;
  if (!uname || !db) return genericCard(origin, path, L);

  let uid = '';
  try {
    const snap = await db.collection('usernames').doc(uname).get();
    if (!snap.exists) return { ...genericCard(origin, path), title: ogText(L, 'common.og_someone', 'Chaupaal') };
    uid = snap.data()?.uid || '';
  } catch (e) {
    return genericCard(origin, path, L);
  }
  if (!uid) return { ...genericCard(origin, path), title: ogText(L, 'common.og_someone', 'Chaupaal') };

  let pub = {};
  try {
    const pSnap = await db.collection('users_public').doc(uid).get();
    pub = pSnap.exists ? pSnap.data() || {} : {};
  } catch (e) {
    return { ...genericCard(origin, path), title: ogText(L, 'common.og_someone', 'Chaupaal') };
  }

  const vis = pub.profileVisibility || pub.profile?.profileVisibility || 'public';
  if (isRestrictedVisibility(vis)) {
    return {
      title: ogText(L, 'common.og_someone', 'Chaupaal'),
      description: ogText(L, 'common.og_profile_limited', 'Chaupaal'),
      image: DEFAULT_IMAGE_PATH,
      url: `${origin}${path}`,
      cacheControl: CACHE_GENERIC,
    };
  }

  const name = pub.name || pub.profile?.displayName || uname;
  const bio = snippet(pub.bio || pub.profile?.bio || '');
  const type = String(pub.profileType || pub.profile?.profileType || '').toLowerCase();
  const badge = type === 'professional' ? ' · ' + ogText(L, 'common.professional', 'Professional') : '';
  const photo = pub.photoURL || pub.photoThumb || pub.avatar || '';
  const image = /^https:\/\//i.test(String(photo)) ? photo : DEFAULT_IMAGE_PATH;

  return {
    title: `${name} (@${uname})${badge}`,
    description: bio || ogText(L, 'common.og_see_profile', 'Chaupaal', { username: uname }),
    image,
    url: `${origin}${path}`,
    cacheControl: CACHE_PUBLIC,
  };
}

async function buildPostOg(db, origin, postIdRaw, lang) {
  const L = lang || 'en';
  const id = String(postIdRaw || '')
    .trim()
    .slice(0, 180);
  const path = `/post/${encodeURIComponent(id)}`;
  if (!id || !db) return genericCard(origin, path, L);

  let data = null;
  let surface = 'Duniya';
  try {
    let snap = await db.collection('duniya').doc(id).get();
    if (snap.exists) {
      data = snap.data() || {};
      surface = 'Duniya';
    } else {
      snap = await db.collection('peepal').doc(id).get();
      if (snap.exists) {
        data = snap.data() || {};
        surface = 'Peepal';
      }
    }
  } catch (e) {
    return { ...genericCard(origin, path), title: ogText(L, 'common.og_a_post', 'Chaupaal') };
  }

  if (!data) {
    return { ...genericCard(origin, path), title: ogText(L, 'common.og_a_post', 'Chaupaal') };
  }

  const audience = String(data.audience || 'public').toLowerCase();
  const gated =
    data.deleted === true ||
    data.archived === true ||
    (audience && audience !== 'public');
  if (gated) {
    return {
      title: ogText(L, 'common.og_a_post', 'Chaupaal'),
      description: ogText(L, 'common.og_open_post', 'Chaupaal'),
      image: DEFAULT_IMAGE_PATH,
      url: `${origin}${path}`,
      cacheControl: CACHE_GENERIC,
    };
  }

  const caption = snippet(data.caption || data.text || data.question || data.title || '');
  const author = data.userName || data.name || data.authorName || ogText(L, 'common.someone', 'Someone');
  const media =
    data.mediaUrl ||
    data.thumbUrl ||
    data.imageUrl ||
    (Array.isArray(data.media) && data.media[0]?.url) ||
    '';
  const image = /^https:\/\//i.test(String(media)) ? media : DEFAULT_IMAGE_PATH;

  return {
    title: ogText(L, 'common.og_author_on', author, { author, surface }),
    description: caption || ogText(L, 'common.og_surface_post', 'Chaupaal', { surface }),
    image,
    url: `${origin}${path}`,
    cacheControl: CACHE_PUBLIC,
  };
}

function buildChallengeOg(origin, gameId, query, lang) {
  const L = lang || 'en';
  const game = String(gameId || query.game || 'quiz')
    .trim()
    .slice(0, 40) || 'quiz';
  const score = query.score != null ? String(query.score).slice(0, 24) : '';
  const name = snippet(query.name || query.challenge || '', 40) || ogText(L, 'common.someone', 'Someone');
  const cat = snippet(query.cat || '', 40);
  const params = new URLSearchParams();
  if (score) params.set('score', score);
  if (name) params.set('name', name);
  if (cat) params.set('cat', cat);
  const qs = params.toString();
  const path = `/challenge/${encodeURIComponent(game)}${qs ? `?${qs}` : ''}`;
  const gameLabel =
    game === 'quiz' || game === 'muqabala'
      ? 'Muqabala'
      : game === 'akhbaar'
        ? 'Akhbaar'
        : game;
  const catBit = cat ? ` · ${cat}` : '';
  return {
    title: ogText(L, 'common.og_beat', name, { name, game: gameLabel }),
    description: ogText(L, score ? 'common.og_challenged_score' : 'common.og_challenged', name, { name, score }) + catBit,
    image: DEFAULT_IMAGE_PATH,
    url: `${origin}${path}`,
    cacheControl: CACHE_PUBLIC,
  };
}

async function buildStoryOg(db, origin, storyId, lang) {
  const L = lang || 'en';
  const id = String(storyId || '').trim().slice(0, 180);
  const path = `/story/${encodeURIComponent(id)}`;
  // Stories are often private/ephemeral — keep generic (honest)
  return {
    title: ogText(L, 'common.og_a_story', 'Chaupaal'),
    description: ogText(L, 'common.og_open_story', 'Chaupaal'),
    image: DEFAULT_IMAGE_PATH,
    url: `${origin}${path}`,
    cacheControl: CACHE_GENERIC,
  };
}

/**
 * Express/Vercel handler fragment for GET ?og=1
 */
async function handleOgGet(req, res) {
  const origin = siteOrigin(req);
  const q = req.query || {};
  const kind = String(q.kind || q.k || '').toLowerCase();
  const id = String(q.id || q.username || q.postId || q.game || '').trim();

  let admin = null;
  try {
    admin = initAdmin();
  } catch (e) {
    admin = null;
  }
  const db = admin ? admin.firestore() : null;

  const lang = ogLang(req);
  let card;
  if (kind === 'profile' || kind === 'u') {
    card = await buildProfileOg(db, origin, id, lang);
  } else if (kind === 'post' || kind === 'p') {
    card = await buildPostOg(db, origin, id, lang);
  } else if (kind === 'challenge' || kind === 'beat') {
    card = buildChallengeOg(origin, id || q.game, q, lang);
  } else if (kind === 'invite') {
    // Code is username — reuse profile projection (Friends-only → generic)
    card = await buildProfileOg(db, origin, id, lang);
    if (card && card.title === 'Chaupaal') {
      card = {
        title: ogText(lang, 'common.og_invite_title', 'Chaupaal'),
        description: ogText(lang, 'common.og_invite_desc', 'Chaupaal'),
        image: DEFAULT_IMAGE_PATH,
        url: `${origin}/invite/${encodeURIComponent(id || '')}`,
        cacheControl: CACHE_GENERIC,
      };
    } else if (card) {
      card.url = `${origin}/invite/${encodeURIComponent(String(id || '').toLowerCase())}`;
      card.description = (card.description || '') + ' · ' + ogText(lang, 'common.og_invite_link', 'Invite');
    }
  } else if (kind === 'story') {
    card = await buildStoryOg(db, origin, id, lang);
  } else {
    card = genericCard(origin, '/', lang);
  }

  res.setHeader('Vary', 'Accept-Language');
  const html = renderOgHtml({ origin, ...card, lang });
  return sendHtml(res, html, card.cacheControl || CACHE_PUBLIC, req.method);
}

module.exports = {
  isLikelyBot,
  escapeHtml,
  siteOrigin,
  handleOgGet,
  renderOgHtml,
  ogLang,
  OG_LANGS,
  buildProfileOg,
  buildPostOg,
  buildChallengeOg,
  buildStoryOg,
  genericCard,
  DEFAULT_IMAGE_PATH,
};
