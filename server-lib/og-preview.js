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

function renderOgHtml({ origin, title, description, image, url, cacheControl }) {
  const t = escapeHtml(title || 'Chaupaal');
  const d = escapeHtml(description || 'Gather under the same light');
  const img = escapeHtml(absUrl(origin, image || DEFAULT_IMAGE_PATH));
  const u = escapeHtml(url || origin);
  const canonical = escapeHtml(url || `${origin}/`);
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<title>${t}</title>
<meta name="description" content="${d}">
<meta property="og:type" content="website">
<meta property="og:site_name" content="Chaupaal">
<meta property="og:title" content="${t}">
<meta property="og:description" content="${d}">
<meta property="og:image" content="${img}">
<meta property="og:url" content="${u}">
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:title" content="${t}">
<meta name="twitter:description" content="${d}">
<meta name="twitter:image" content="${img}">
<link rel="canonical" href="${canonical}">
</head>
<body>
<p><a href="${canonical}">Open in Chaupaal</a></p>
</body>
</html>`;
}

function sendHtml(res, html, cacheControl = CACHE_PUBLIC) {
  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.setHeader('Cache-Control', cacheControl);
  res.setHeader('X-Robots-Tag', 'noindex'); // previews for unfurl; SPA is the product
  return res.status(200).send(html);
}

function genericCard(origin, pathHint) {
  return {
    title: 'Chaupaal',
    description: 'Gather under the same light — news, discussions, games, and friends.',
    image: DEFAULT_IMAGE_PATH,
    url: `${origin}${pathHint || '/'}`,
    cacheControl: CACHE_GENERIC,
  };
}

async function buildProfileOg(db, origin, usernameRaw) {
  const uname = String(usernameRaw || '')
    .replace(/^@/, '')
    .toLowerCase()
    .trim()
    .slice(0, 40);
  const path = `/profile/${encodeURIComponent(uname)}`;
  if (!uname || !db) return genericCard(origin, path);

  let uid = '';
  try {
    const snap = await db.collection('usernames').doc(uname).get();
    if (!snap.exists) return { ...genericCard(origin, path), title: 'Someone on Chaupaal' };
    uid = snap.data()?.uid || '';
  } catch (e) {
    return genericCard(origin, path);
  }
  if (!uid) return { ...genericCard(origin, path), title: 'Someone on Chaupaal' };

  let pub = {};
  try {
    const pSnap = await db.collection('users_public').doc(uid).get();
    pub = pSnap.exists ? pSnap.data() || {} : {};
  } catch (e) {
    return { ...genericCard(origin, path), title: 'Someone on Chaupaal' };
  }

  const vis = pub.profileVisibility || pub.profile?.profileVisibility || 'public';
  if (isRestrictedVisibility(vis)) {
    return {
      title: 'Someone on Chaupaal',
      description: 'Join Chaupaal to connect — this profile is limited.',
      image: DEFAULT_IMAGE_PATH,
      url: `${origin}${path}`,
      cacheControl: CACHE_GENERIC,
    };
  }

  const name = pub.name || pub.profile?.displayName || uname;
  const bio = snippet(pub.bio || pub.profile?.bio || '');
  const type = String(pub.profileType || pub.profile?.profileType || '').toLowerCase();
  const badge = type === 'professional' ? ' · Professional' : '';
  const photo = pub.photoURL || pub.photoThumb || pub.avatar || '';
  const image = /^https:\/\//i.test(String(photo)) ? photo : DEFAULT_IMAGE_PATH;

  return {
    title: `${name} (@${uname})${badge}`,
    description: bio || `See @${uname} on Chaupaal`,
    image,
    url: `${origin}${path}`,
    cacheControl: CACHE_PUBLIC,
  };
}

async function buildPostOg(db, origin, postIdRaw) {
  const id = String(postIdRaw || '')
    .trim()
    .slice(0, 180);
  const path = `/post/${encodeURIComponent(id)}`;
  if (!id || !db) return genericCard(origin, path);

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
    return { ...genericCard(origin, path), title: 'A post on Chaupaal' };
  }

  if (!data) {
    return { ...genericCard(origin, path), title: 'A post on Chaupaal' };
  }

  const audience = String(data.audience || 'public').toLowerCase();
  const gated =
    data.deleted === true ||
    data.archived === true ||
    (audience && audience !== 'public');
  if (gated) {
    return {
      title: 'A post on Chaupaal',
      description: 'Open Chaupaal to view this post.',
      image: DEFAULT_IMAGE_PATH,
      url: `${origin}${path}`,
      cacheControl: CACHE_GENERIC,
    };
  }

  const caption = snippet(data.caption || data.text || data.question || data.title || '');
  const author = data.userName || data.name || data.authorName || 'Someone';
  const media =
    data.mediaUrl ||
    data.thumbUrl ||
    data.imageUrl ||
    (Array.isArray(data.media) && data.media[0]?.url) ||
    '';
  const image = /^https:\/\//i.test(String(media)) ? media : DEFAULT_IMAGE_PATH;

  return {
    title: `${author} on ${surface}`,
    description: caption || `A ${surface} post on Chaupaal`,
    image,
    url: `${origin}${path}`,
    cacheControl: CACHE_PUBLIC,
  };
}

function buildChallengeOg(origin, gameId, query) {
  const game = String(gameId || query.game || 'quiz')
    .trim()
    .slice(0, 40) || 'quiz';
  const score = query.score != null ? String(query.score).slice(0, 24) : '';
  const name = snippet(query.name || query.challenge || '', 40) || 'Someone';
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
  const scoreBit = score ? ` score ${score}` : '';
  const catBit = cat ? ` · ${cat}` : '';
  return {
    title: `Beat ${name} on ${gameLabel}`,
    description: `${name} challenged you${scoreBit}${catBit}. Play on Chaupaal.`,
    image: DEFAULT_IMAGE_PATH,
    url: `${origin}${path}`,
    cacheControl: CACHE_PUBLIC,
  };
}

async function buildStoryOg(db, origin, storyId) {
  const id = String(storyId || '').trim().slice(0, 180);
  const path = `/story/${encodeURIComponent(id)}`;
  // Stories are often private/ephemeral — keep generic (honest)
  return {
    title: 'A story on Chaupaal',
    description: 'Open Chaupaal to view this story.',
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

  let card;
  if (kind === 'profile' || kind === 'u') {
    card = await buildProfileOg(db, origin, id);
  } else if (kind === 'post' || kind === 'p') {
    card = await buildPostOg(db, origin, id);
  } else if (kind === 'challenge' || kind === 'beat') {
    card = buildChallengeOg(origin, id || q.game, q);
  } else if (kind === 'invite') {
    // Code is username — reuse profile projection (Friends-only → generic)
    card = await buildProfileOg(db, origin, id);
    if (card && card.title === 'Chaupaal') {
      card = {
        title: 'Join me on Chaupaal',
        description: 'A warmer place to chat, play, and catch up. Virtual chips · not real money.',
        image: DEFAULT_IMAGE_PATH,
        url: `${origin}/invite/${encodeURIComponent(id || '')}`,
        cacheControl: CACHE_GENERIC,
      };
    } else if (card) {
      card.url = `${origin}/invite/${encodeURIComponent(String(id || '').toLowerCase())}`;
      card.description = (card.description || '') + ' · Invite link';
    }
  } else if (kind === 'story') {
    card = await buildStoryOg(db, origin, id);
  } else {
    card = genericCard(origin, '/');
  }

  const html = renderOgHtml({ origin, ...card });
  return sendHtml(res, html, card.cacheControl || CACHE_PUBLIC);
}

module.exports = {
  isLikelyBot,
  escapeHtml,
  siteOrigin,
  handleOgGet,
  buildProfileOg,
  buildPostOg,
  buildChallengeOg,
  genericCard,
  DEFAULT_IMAGE_PATH,
};
