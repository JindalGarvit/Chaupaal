/**
 * Peepal cascading audience segments + response caps.
 *
 * Each peepal post may carry ordered `audienceSegments[]`. Distribution pushes
 * Segment N until its cap is hit OR engagement stalls, then auto-advances to N+1.
 * Stall is silent — no poster prompt.
 *
 * Stall heuristic: after a segment has been `active` for STALL_MIN_MS and has
 * shown enough impressions (viewsShown), if responses in the last STALL_WINDOW_MS
 * are below STALL_MIN_RESPONSES relative to recent views, mark stalled.
 */

const STALL_MIN_MS = 6 * 60 * 60 * 1000; // 6h minimum active before stall check
const STALL_WINDOW_MS = 3 * 60 * 60 * 1000; // rolling 3h window
const STALL_MIN_VIEWS = 8;
const STALL_MIN_RESPONSES = 1;

const CAP_PRESETS = {
  algorithm: null, // unlimited / AI decides
  '10': 10,
  '50': 50,
  '100': 100,
};

function clampInt(n, min, max, fallback) {
  const v = Number(n);
  if (!Number.isFinite(v)) return fallback;
  return Math.max(min, Math.min(max, Math.floor(v)));
}

/** Normalize targeting criteria (same shape as Peepal AI search filters). */
function normalizeCriteria(raw) {
  const c = raw && typeof raw === 'object' ? raw : {};
  const interests = Array.isArray(c.interests)
    ? c.interests.map((x) => String(x || '').trim()).filter(Boolean).slice(0, 12)
    : [];
  const ageMin = c.ageRange?.min != null ? clampInt(c.ageRange.min, 13, 100, null) : null;
  const ageMax = c.ageRange?.max != null ? clampInt(c.ageRange.max, 13, 100, null) : null;
  return {
    interests,
    ageRange: { min: ageMin, max: ageMax },
    gender: ['male', 'female', 'any'].includes(c.gender) ? c.gender : 'any',
    city: c.city ? String(c.city).trim().slice(0, 80) : null,
    personality: c.personality ? String(c.personality).trim().slice(0, 40) : null,
    searchIntent: c.searchIntent ? String(c.searchIntent).trim().slice(0, 40) : 'any',
    vibe: c.vibe ? String(c.vibe).trim().slice(0, 160) : '',
  };
}

function resolveCap(mode, custom) {
  if (mode === 'custom') return clampInt(custom, 1, 5000, 50);
  if (mode === 'algorithm' || mode == null || mode === '') return null;
  if (CAP_PRESETS[String(mode)] !== undefined) return CAP_PRESETS[String(mode)];
  return clampInt(mode, 1, 5000, null);
}

/**
 * Build ordered segment list for a new post.
 * @param {object} opts
 * @param {string} [opts.legacyAudience] everyone|friends|ai
 * @param {string} [opts.responseLimitMode] 10|50|100|custom|algorithm
 * @param {number} [opts.customCap]
 * @param {array} [opts.segments] raw segment drafts from composer
 */
function buildAudienceSegments(opts = {}) {
  const mode = opts.responseLimitMode || 'algorithm';
  const defaultCap = resolveCap(mode, opts.customCap);
  const drafts = Array.isArray(opts.segments) && opts.segments.length
    ? opts.segments.slice(0, 15)
    : [
        {
          criteria: {
            searchIntent: opts.legacyAudience === 'friends' ? 'friendship' : 'any',
            // friends-only is enforced via audience field; criteria stay broad
          },
          cap: defaultCap,
          label: opts.legacyAudience === 'friends' ? 'Friends' : 'Everyone',
        },
      ];

  return drafts.map((d, i) => {
    const cap =
      d.cap != null
        ? resolveCap(d.capMode || (d.cap === null ? 'algorithm' : 'custom'), d.cap)
        : defaultCap;
    return {
      id: String(d.id || `seg_${i + 1}`),
      order: i,
      label: String(d.label || `Segment ${i + 1}`).slice(0, 60),
      criteria: normalizeCriteria(d.criteria || {}),
      cap, // null = unlimited for this segment
      fulfilledCount: 0,
      viewsShown: 0,
      responsesInWindow: 0,
      windowStartedAt: null,
      status: i === 0 ? 'active' : 'pending', // active | stalled | completed | pending
      activatedAt: i === 0 ? Date.now() : null,
      completedAt: null,
      stallReason: null,
    };
  });
}

function activeSegmentIndex(segments) {
  if (!Array.isArray(segments)) return -1;
  return segments.findIndex((s) => s.status === 'active');
}

function recordSegmentResponse(segments, now = Date.now()) {
  const list = Array.isArray(segments) ? segments.map((s) => ({ ...s })) : [];
  const idx = activeSegmentIndex(list);
  if (idx < 0) return { segments: list, advanced: false };
  const seg = list[idx];
  seg.fulfilledCount = Number(seg.fulfilledCount || 0) + 1;
  seg.responsesInWindow = Number(seg.responsesInWindow || 0) + 1;
  if (!seg.windowStartedAt) seg.windowStartedAt = now;

  if (seg.cap != null && seg.fulfilledCount >= seg.cap) {
    return advanceFrom(list, idx, 'capped', now);
  }
  return { segments: list, advanced: false };
}

function recordSegmentView(segments, now = Date.now()) {
  const list = Array.isArray(segments) ? segments.map((s) => ({ ...s })) : [];
  const idx = activeSegmentIndex(list);
  if (idx < 0) return list;
  const seg = list[idx];
  seg.viewsShown = Number(seg.viewsShown || 0) + 1;
  if (!seg.windowStartedAt) seg.windowStartedAt = now;
  // Reset window if older than STALL_WINDOW_MS
  if (seg.windowStartedAt && now - seg.windowStartedAt > STALL_WINDOW_MS) {
    seg.windowStartedAt = now;
    seg.responsesInWindow = 0;
  }
  return list;
}

function advanceFrom(list, idx, reason, now) {
  const seg = list[idx];
  seg.status = reason === 'stalled' ? 'stalled' : 'completed';
  seg.completedAt = now;
  seg.stallReason = reason === 'stalled' ? 'engagement_stall' : reason;
  const next = list[idx + 1];
  if (next && next.status === 'pending') {
    next.status = 'active';
    next.activatedAt = now;
    next.windowStartedAt = now;
    next.responsesInWindow = 0;
    return { segments: list, advanced: true, nextIndex: idx + 1 };
  }
  return { segments: list, advanced: false, finished: true };
}

/** Evaluate stall / advance for one post's segments. */
function evaluateSegmentStall(segments, now = Date.now()) {
  const list = Array.isArray(segments) ? segments.map((s) => ({ ...s })) : [];
  const idx = activeSegmentIndex(list);
  if (idx < 0) return { segments: list, advanced: false };
  const seg = list[idx];
  if (seg.cap != null && Number(seg.fulfilledCount || 0) >= seg.cap) {
    return advanceFrom(list, idx, 'capped', now);
  }
  const activated = Number(seg.activatedAt || now);
  if (now - activated < STALL_MIN_MS) return { segments: list, advanced: false };
  const views = Number(seg.viewsShown || 0);
  if (views < STALL_MIN_VIEWS) return { segments: list, advanced: false };
  const windowStart = Number(seg.windowStartedAt || activated);
  if (now - windowStart < STALL_WINDOW_MS) return { segments: list, advanced: false };
  const recent = Number(seg.responsesInWindow || 0);
  if (recent < STALL_MIN_RESPONSES) {
    return advanceFrom(list, idx, 'stalled', now);
  }
  // Healthy window — roll it
  seg.windowStartedAt = now;
  seg.responsesInWindow = 0;
  return { segments: list, advanced: false };
}

/**
 * Scheduler: scan peepal posts with active segments and advance stalled ones.
 * Admin SDK only.
 */
async function advanceStalledPeepalSegments(db, { limit = 30 } = {}) {
  const snap = await db
    .collection('peepal')
    .where('segmentDistributionActive', '==', true)
    .limit(limit)
    .get();

  let advanced = 0;
  let scanned = 0;
  const now = Date.now();

  for (const doc of snap.docs) {
    scanned++;
    const data = doc.data() || {};
    if (data.deleted) continue;
    const segs = data.audienceSegments;
    if (!Array.isArray(segs) || !segs.length) continue;
    const result = evaluateSegmentStall(segs, now);
    if (!result.advanced && !result.finished && result.segments === segs) continue;

    const stillActive = result.segments.some((s) => s.status === 'active');
    await doc.ref.set(
      {
        audienceSegments: result.segments,
        segmentDistributionActive: stillActive,
        activeSegmentIndex: activeSegmentIndex(result.segments),
        segmentUpdatedAt: now,
      },
      { merge: true }
    );
    if (result.advanced || result.finished) advanced++;
  }

  return { scanned, advanced };
}

module.exports = {
  buildAudienceSegments,
  normalizeCriteria,
  resolveCap,
  recordSegmentResponse,
  recordSegmentView,
  evaluateSegmentStall,
  advanceStalledPeepalSegments,
  activeSegmentIndex,
  CAP_PRESETS,
  STALL_MIN_MS,
  STALL_WINDOW_MS,
};
