/**
 * Sanitize Duniya feed post payloads (create / update).
 */

function cleanText(value, max) {
  return String(value || '')
    .trim()
    .slice(0, max);
}

function cleanUid(value) {
  const uid = String(value || '').trim();
  return /^[A-Za-z0-9_-]{1,180}$/.test(uid) ? uid : '';
}

function cleanHttps(value) {
  const media = String(value || '').trim();
  return /^https:\/\//i.test(media) ? media.slice(0, 2048) : '';
}

function cleanClientId(value) {
  const id = String(value || '').trim();
  return /^[A-Za-z0-9_-]{8,100}$/.test(id) ? id : '';
}

const SLIDE_TYPES = new Set(['image', 'video', 'gif']);
const FILTERS = new Set(['normal', 'bright', 'contrast', 'warm', 'cool', 'mono', 'fade']);
const MUSIC_SOURCES = new Set(['jiosaavn', 'itunes', 'none']);

function cleanMusic(value) {
  if (!value || typeof value !== 'object') return null;
  const title = cleanText(value.title, 160);
  if (!title) return null;
  const previewRaw = String(value.previewUrl || '').trim();
  const previewUrl = /^https:\/\//i.test(previewRaw) ? previewRaw.slice(0, 2048) : '';
  return {
    title,
    artist: cleanText(value.artist, 160) || 'Unknown artist',
    thumbnail: cleanHttps(value.thumbnail),
    previewUrl: previewUrl || null,
    source: MUSIC_SOURCES.has(String(value.source || '').toLowerCase())
      ? String(value.source).toLowerCase()
      : previewUrl
        ? 'jiosaavn'
        : 'none',
  };
}

function cleanLocation(value) {
  if (!value || typeof value !== 'object') return null;
  const lat = Number(value.lat);
  const lng = Number(value.lng);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  if (lat < -90 || lat > 90 || lng < -180 || lng > 180) return null;
  return {
    type: 'location',
    mode: ['current', 'place', 'pin', 'live'].includes(String(value.mode || '')) ? String(value.mode) : 'pin',
    lat,
    lng,
    placeName: cleanText(value.placeName || value.name, 120) || null,
    address: cleanText(value.address, 240) || null,
    label: cleanText(value.label || value.placeName, 160) || 'Location',
  };
}

function cleanSlide(item, index) {
  if (!item || typeof item !== 'object') return null;
  const type = SLIDE_TYPES.has(String(item.type || '')) ? String(item.type) : '';
  const media = cleanHttps(item.media || item.url);
  if (!type || !media) return null;
  const w = Math.max(0, Number(item.width) || 0);
  const h = Math.max(0, Number(item.height) || 0);
  return {
    type,
    media,
    thumb: cleanHttps(item.thumb) || media,
    mediaPath: cleanText(item.mediaPath, 240),
    thumbPath: cleanText(item.thumbPath, 240),
    width: w,
    height: h,
    durationMs: Math.max(0, Math.min(10 * 60 * 1000, Number(item.durationMs) || 0)),
    alt: cleanText(item.alt, 200),
    filter: FILTERS.has(String(item.filter || '')) ? String(item.filter) : 'normal',
    poster: cleanHttps(item.poster),
    crop: item.crop && typeof item.crop === 'object'
      ? {
          x: Number(item.crop.x) || 0.5,
          y: Number(item.crop.y) || 0.5,
          scale: Number(item.crop.scale) || 1,
          rotate: Number(item.crop.rotate) || 0,
        }
      : null,
    muted: !!item.muted,
    index,
  };
}

function cleanSlides(list) {
  const arr = Array.isArray(list) ? list : [];
  return arr.map(cleanSlide).filter(Boolean).slice(0, 10);
}

function cleanTags(list) {
  const arr = Array.isArray(list) ? list : [];
  const out = [];
  const seen = new Set();
  for (const t of arr) {
    const uid = cleanUid(t?.uid);
    if (!uid || seen.has(uid)) continue;
    seen.add(uid);
    out.push({
      uid,
      name: cleanText(t.name, 80),
      username: cleanText(t.username, 40),
      x: Math.max(0, Math.min(1, Number(t.x) || 0.5)),
      y: Math.max(0, Math.min(1, Number(t.y) || 0.5)),
      slideIndex: Math.max(0, Math.min(9, Number(t.slideIndex) || 0)),
    });
    if (out.length >= 20) break;
  }
  return out;
}

function cleanUidList(list, max) {
  const arr = Array.isArray(list) ? list : [];
  const out = [];
  const seen = new Set();
  for (const raw of arr) {
    const uid = cleanUid(typeof raw === 'object' ? raw.uid : raw);
    if (!uid || seen.has(uid)) continue;
    seen.add(uid);
    out.push(uid);
    if (out.length >= (max || 20)) break;
  }
  return out;
}

function cleanHashtags(list, caption) {
  const fromList = Array.isArray(list) ? list : [];
  const fromCaption = String(caption || '').match(/#([A-Za-z0-9_]{1,40})/g) || [];
  const all = fromList.concat(fromCaption.map((h) => h.replace(/^#/, '')));
  const out = [];
  const seen = new Set();
  for (const h of all) {
    const tag = cleanText(String(h).replace(/^#/, ''), 40).toLowerCase();
    if (!tag || seen.has(tag)) continue;
    seen.add(tag);
    out.push(tag);
    if (out.length >= 30) break;
  }
  return out;
}

function mentionedFromCaption(caption) {
  const matches = String(caption || '').match(/@([A-Za-z0-9_.]{2,40})/g) || [];
  return matches.map((m) => m.slice(1).toLowerCase()).slice(0, 20);
}

function validateCreate({ caption, slides, saveOnly }) {
  const text = String(caption || '').trim();
  const list = Array.isArray(slides) ? slides : [];
  if (!list.length && !text) {
    return { ok: false, error: 'Caption is required for a text post.' };
  }
  if (text.length > 4000) {
    return { ok: false, error: 'Caption is too long.' };
  }
  if (list.length > 10) {
    return { ok: false, error: 'Up to 10 slides.' };
  }
  return { ok: true, saveOnly: !!saveOnly };
}

function serializePost(doc, viewerUid) {
  const data = doc.data ? doc.data() : doc;
  const id = doc.id || data.id;
  const collabUids = Array.isArray(data.collabUids) ? data.collabUids : [];
  const own = data.uid === viewerUid || collabUids.includes(viewerUid);
  const slides = Array.isArray(data.slides) ? data.slides : [];
  const first = slides[0] || null;
  return {
    id,
    firestoreId: id,
    uid: data.uid,
    user: data.user || { uid: data.uid, name: data.name, avatar: data.avatar },
    type: first?.type || data.type || (slides.length ? first.type : 'text'),
    media: first?.media || data.media || null,
    thumb: first?.thumb || data.thumb || null,
    mediaWidth: first?.width || data.mediaWidth || null,
    mediaHeight: first?.height || data.mediaHeight || null,
    slides,
    caption: data.caption || '',
    likes: Number(data.likes) || 0,
    comments: Number(data.comments) || 0,
    shares: Number(data.shares) || 0,
    tags: data.tags || [],
    taggedPeople: Array.isArray(data.taggedPeople) ? data.taggedPeople : [],
    mentionedUids: Array.isArray(data.mentionedUids) ? data.mentionedUids : [],
    hashtags: Array.isArray(data.hashtags) ? data.hashtags : [],
    music: data.music || null,
    location: data.location || null,
    hideLikeCount: !!data.hideLikeCount,
    commentsOff: !!data.commentsOff,
    audience: data.audience || 'public',
    archived: !!data.archived,
    saveOnly: !!data.saveOnly,
    collabUids,
    collabInvites: own && Array.isArray(data.collabInvites) ? data.collabInvites : [],
    collabPendingUids: Array.isArray(data.collabPendingUids) ? data.collabPendingUids : [],
    collabUsers: Array.isArray(data.collabUsers) ? data.collabUsers : [],
    firstCommentId: data.firstCommentId || '',
    createdAt: data.createdAt?.toMillis?.() || data.ts || Date.now(),
    ts: data.ts || data.createdAt?.toMillis?.() || Date.now(),
    deleted: !!data.deleted,
    own,
  };
}

module.exports = {
  cleanText,
  cleanUid,
  cleanHttps,
  cleanClientId,
  cleanMusic,
  cleanLocation,
  cleanSlides,
  cleanTags,
  cleanUidList,
  cleanHashtags,
  mentionedFromCaption,
  validateCreate,
  serializePost,
};
