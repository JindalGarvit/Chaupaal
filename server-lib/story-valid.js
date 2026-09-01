/**
 * Shared story viewability — live ring, feed, and viewer guards.
 */
function normalizeStoryInput(storyOrDoc) {
  const data = storyOrDoc && typeof storyOrDoc.data === 'function' ? storyOrDoc.data() : storyOrDoc || {};
  return {
    id: storyOrDoc?.id || data.id || '',
    active: data.active,
    archived: data.archived,
    saveOnly: data.saveOnly,
    expiresAt: data.expiresAt?.toMillis?.() ?? data.expiresAt ?? 0,
    media: data.media || '',
    thumb: data.thumb || '',
    text: data.text || '',
    overlays: Array.isArray(data.overlays) ? data.overlays : [],
    type: data.type || 'media',
    score: data.score,
    total: data.total,
    streak: data.streak,
    music: data.music || null,
    location: data.location || null,
  };
}

function isStoryViewable(storyOrDoc, now = Date.now()) {
  const s = normalizeStoryInput(storyOrDoc);
  if (!s.id) return false;
  if (s.active === false) return false;
  if (s.archived === true || s.saveOnly === true) return false;
  const exp = Number(s.expiresAt) || 0;
  if (exp && exp <= now) return false;

  const hasMedia = !!String(s.media || '').trim();
  const hasThumb = !!String(s.thumb || '').trim();
  const hasText = !!String(s.text || '').trim();
  const hasOverlays = Array.isArray(s.overlays) && s.overlays.length > 0;
  const hasScore =
    s.type === 'score' &&
    (Number(s.score) > 0 || Number(s.total) > 0 || Number(s.streak) > 0);
  const hasMusic = !!(s.music && (s.music.previewUrl || s.music.title));
  const hasLocation = !!(s.location && (s.location.placeName || s.location.label));

  return hasMedia || hasThumb || hasText || hasOverlays || hasScore || hasMusic || hasLocation;
}

module.exports = { isStoryViewable, normalizeStoryInput };
