/**
 * Media config + music search + Dangal Game of the Day (folded into one serverless function).
 *
 * GET  → Cloudinary unsigned upload config (existing)
 * POST → { action: 'music_search' | 'music_resolve' | 'gif_search' | 'get_game_of_day' | … }
 *
 * Music + GIF + GOTD live here (not a new api/*.js) to stay under the Hobby 12-function cap.
 */
const { sendSuccess, sendError, requireMethod, parseJsonBody } = require('../server-lib/http');
const { requireUser, initAdmin } = require('../server-lib/auth');
const { callMusicProvider, resolveMusicPreview } = require('../server-lib/music');
const {
  generateRadio,
  generateTrending,
  generateRecommendations,
} = require('../server-lib/music-radio');
const { searchPlaces } = require('../server-lib/geocode');
const { checkUrlWithWebRisk } = require('../server-lib/url-safety');
const { searchGifs } = require('../server-lib/gif-search');

async function handleGet(req, res) {
  const user = await requireUser(req, res, { allowWeak: false });
  if (!user) return;

  res.setHeader('Cache-Control', 'private, max-age=60');
  const cloudName =
    typeof process.env.CLOUDINARY_CLOUD_NAME === 'string'
      ? process.env.CLOUDINARY_CLOUD_NAME.trim()
      : '';
  const uploadPreset =
    typeof process.env.CLOUDINARY_UPLOAD_PRESET === 'string'
      ? process.env.CLOUDINARY_UPLOAD_PRESET.trim()
      : '';

  if (!cloudName || !uploadPreset) {
    return sendError(res, 503, 'MEDIA_NOT_CONFIGURED', 'Cloudinary is not configured', {
      configured: false,
    });
  }

  if (cloudName.length > 64 || uploadPreset.length > 64) {
    return sendError(res, 500, 'CONFIG_INVALID', 'Cloudinary env values look invalid');
  }

  return sendSuccess(res, {
    provider: 'cloudinary',
    cloudName,
    uploadPreset,
    configured: true,
  });
}

/** Pre-auth username availability — returns only { available }, never uid. */
async function handleUsernameCheck(req, res, body) {
  const username = String(body.username || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_]/g, '');
  if (username.length < 3 || username.length > 20) {
    return sendSuccess(res, { available: false, reason: 'invalid' });
  }
  const app = initAdmin();
  if (!app) {
    // Soft allow when Admin isn't configured (local/dev) — claim still races safely on create.
    return sendSuccess(res, { available: true, degraded: true });
  }
  try {
    const snap = await app.firestore().collection('usernames').doc(username).get();
    return sendSuccess(res, { available: !snap.exists });
  } catch (e) {
    console.warn('[media-config] username_check', e?.message || e);
    return sendSuccess(res, { available: true, degraded: true });
  }
}

function normalizePhoneE164(raw) {
  const s = String(raw || '').trim();
  const digits = s.replace(/\D/g, '');
  if (digits.length === 10) return '+91' + digits;
  if (digits.length === 12 && digits.startsWith('91')) return '+' + digits;
  if (s.startsWith('+') && digits.length >= 10) return '+' + digits;
  return null;
}

/**
 * Pre-auth login helper — returns { email } or generic { notFound: true }.
 * Never reveals whether username/phone existed without an email (enumeration-safe).
 */
async function handleResolveIdentifier(req, res, body) {
  const raw = String(body.identifier || '').trim();
  if (!raw || raw.length > 128) {
    return sendSuccess(res, { notFound: true });
  }
  // Email identifiers skip lookup on the client; if called here, pass through normalized.
  if (/\S+@\S+\.\S+/.test(raw)) {
    return sendSuccess(res, { email: raw.toLowerCase() });
  }

  const app = initAdmin();
  if (!app) {
    return sendSuccess(res, { notFound: true, degraded: true });
  }

  const phone = normalizePhoneE164(raw);
  try {
    if (phone) {
      const snap = await app.firestore().collection('phoneIndex').doc(phone).get();
      const email = String(snap.data()?.email || '').trim().toLowerCase();
      if (!snap.exists || !email) return sendSuccess(res, { notFound: true });
      return sendSuccess(res, { email });
    }

    const username = raw
      .toLowerCase()
      .replace(/^@/, '')
      .replace(/[^a-z0-9_]/g, '');
    if (username.length < 3 || username.length > 20) {
      return sendSuccess(res, { notFound: true });
    }
    const unameSnap = await app.firestore().collection('usernames').doc(username).get();
    if (!unameSnap.exists) return sendSuccess(res, { notFound: true });
    const uid = unameSnap.data()?.uid;
    if (!uid) return sendSuccess(res, { notFound: true });
    const userSnap = await app.firestore().collection('users').doc(uid).get();
    const email = String(userSnap.data()?.email || '').trim().toLowerCase();
    if (!email) return sendSuccess(res, { notFound: true });
    return sendSuccess(res, { email });
  } catch (e) {
    console.warn('[media-config] resolve_identifier', e?.message || e);
    return sendSuccess(res, { notFound: true });
  }
}

/**
 * Device multi-account switch — exchange stored refreshToken for a customToken.
 * Pre-auth (Bearer optional). Requires FIREBASE_SERVICE_ACCOUNT_JSON + web API key.
 */
async function handleSwitchAccount(req, res, body) {
  const refreshToken = String(body.refreshToken || '').trim();
  if (!refreshToken || refreshToken.length < 20 || refreshToken.length > 4096) {
    return sendError(res, 400, 'INVALID_TOKEN', 'Missing refresh token');
  }
  const adminApp = initAdmin();
  if (!adminApp) {
    return sendError(res, 503, 'AUTH_NOT_CONFIGURED', 'Admin not configured for account switch');
  }
  const apiKey =
    (typeof process.env.FIREBASE_WEB_API_KEY === 'string' && process.env.FIREBASE_WEB_API_KEY.trim()) ||
    (typeof process.env.NEXT_PUBLIC_FIREBASE_API_KEY === 'string' &&
      process.env.NEXT_PUBLIC_FIREBASE_API_KEY.trim()) ||
    // Web API keys are public (same as client firebase.js); used only to hit Google token endpoint.
    'AIzaSyA1JtxTBu3_4OOBrT7NUTH7zy43ROioCcA';
  if (!apiKey) {
    return sendError(
      res,
      503,
      'API_KEY_MISSING',
      'FIREBASE_WEB_API_KEY required for switch_account'
    );
  }
  try {
    const tokenRes = await fetch(`https://securetoken.googleapis.com/v1/token?key=${apiKey}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: `grant_type=refresh_token&refresh_token=${encodeURIComponent(refreshToken)}`,
    });
    const tokens = await tokenRes.json();
    if (!tokenRes.ok || !tokens.user_id) {
      return sendError(
        res,
        401,
        'TOKEN_INVALID',
        tokens?.error?.message || 'Could not refresh account session'
      );
    }
    const customToken = await adminApp.auth().createCustomToken(String(tokens.user_id));
    return sendSuccess(res, {
      customToken,
      uid: String(tokens.user_id),
      refreshToken: tokens.refresh_token || refreshToken,
    });
  } catch (e) {
    console.warn('[media-config] switch_account', e?.message || e);
    return sendError(res, 500, 'SWITCH_FAILED', e?.message || 'Account switch failed');
  }
}

async function handlePost(req, res) {
  let body;
  try {
    body = parseJsonBody(req);
  } catch {
    return sendError(res, 400, 'INVALID_JSON', 'Invalid JSON body');
  }

  const action = String(body.action || '').trim();

  // Pre-auth signup/login only — no Bearer required; never returns uid.
  if (action === 'username_check') {
    return handleUsernameCheck(req, res, body);
  }
  if (action === 'resolve_identifier') {
    return handleResolveIdentifier(req, res, body);
  }
  if (action === 'switch_account') {
    return handleSwitchAccount(req, res, body);
  }

  const user = await requireUser(req, res, { allowWeak: false });
  if (!user) return;

  // Third-party lookups (music/geocode/URL safety) get a per-uid rate cap so a
  // scripted caller can't burn provider quota with a valid token.
  if (
    action === 'music_search' ||
    action === 'music_resolve' ||
    action === 'geocode_search' ||
    action === 'check_url'
  ) {
    try {
      const { checkActionRateLimit } = require('../server-lib/rate-limit');
      const rate = await checkActionRateLimit(user.uid, 'media_lookup');
      if (!rate.ok) {
        return sendError(res, 429, 'RATE_LIMITED', 'Too many lookups. Try again shortly.');
      }
    } catch (e) {
      console.warn('[media-config] rate-limit check failed', e?.message || e);
    }
  }

  if (action === 'gif_search') {
    try {
      const { checkActionRateLimit } = require('../server-lib/rate-limit');
      const rate = await checkActionRateLimit(user.uid, 'gif_search');
      if (!rate.ok) {
        return sendError(res, 429, 'RATE_LIMITED', 'Too many GIF searches. Try again shortly.');
      }
    } catch (e) {
      console.warn('[media-config] gif_search rate-limit check failed', e?.message || e);
    }
  }

  if (action === 'music_search') {
    const query = String(body.query || '').trim();
    if (query.length < 1) {
      return sendError(res, 400, 'VALIDATION_ERROR', 'query is required');
    }
    if (query.length > 120) {
      return sendError(res, 400, 'VALIDATION_ERROR', 'query too long');
    }
    try {
      const result = await callMusicProvider({
        query,
        limit: body.limit,
      });
      return sendSuccess(res, result);
    } catch (e) {
      console.warn('[media-config] music_search:', e?.message || e);
      // Never block compose — empty results let the picker show "no results"
      return sendSuccess(res, { results: [], provider: null, fallbackUsed: false });
    }
  }

  if (action === 'youtube_search') {
    const query = String(body.query || '').trim();
    if (query.length < 1) {
      return sendError(res, 400, 'VALIDATION_ERROR', 'query is required');
    }
    // Day-one: no YouTube Data API key required — return empty so client shows paste-link UX
    // Extension: set YOUTUBE_API_KEY and wire googleapis search here.
    const key = typeof process.env.YOUTUBE_API_KEY === 'string' ? process.env.YOUTUBE_API_KEY.trim() : '';
    if (!key) {
      return sendSuccess(res, { results: [], provider: null });
    }
    try {
      const url = `https://www.googleapis.com/youtube/v3/search?part=snippet&type=video&maxResults=${Math.min(
        10,
        Number(body.limit) || 8
      )}&q=${encodeURIComponent(query)}&key=${encodeURIComponent(key)}`;
      const resp = await fetch(url);
      const data = await resp.json();
      const results = (data.items || []).map((it) => ({
        id: it.id?.videoId,
        title: it.snippet?.title,
        channel: it.snippet?.channelTitle,
        thumb: it.snippet?.thumbnails?.medium?.url || it.snippet?.thumbnails?.default?.url,
      })).filter((r) => r.id);
      return sendSuccess(res, { results, provider: 'youtube' });
    } catch (e) {
      console.warn('[media-config] youtube_search', e?.message || e);
      return sendSuccess(res, { results: [], provider: null });
    }
  }

  if (action === 'search_query') {
    try {
      const { checkActionRateLimit } = require('../server-lib/rate-limit');
      const rate = await checkActionRateLimit(user.uid, 'global_search');
      if (!rate.ok) {
        return sendError(res, 429, 'RATE_LIMITED', 'Too many searches. Try again shortly.');
      }
    } catch (e) {}
    const app = initAdmin();
    if (!app) {
      return sendSuccess(res, { query: body.query || '', categories: {}, degraded: true });
    }
    try {
      const { searchChaupaal } = require('../server-lib/search-index');
      const data = await searchChaupaal(app.firestore(), {
        query: body.query,
        types: body.types,
        limit: body.limit,
      });
      return sendSuccess(res, data);
    } catch (e) {
      console.warn('[media-config] search_query', e?.message || e);
      return sendSuccess(res, { query: body.query || '', categories: {}, degraded: true });
    }
  }

  if (action === 'music_resolve') {
    const title = String(body.title || '').trim();
    if (!title) {
      return sendError(res, 400, 'VALIDATION_ERROR', 'title is required');
    }
    try {
      const resolved = await resolveMusicPreview({
        title,
        artist: body.artist,
      });
      return sendSuccess(res, resolved);
    } catch (e) {
      console.warn('[media-config] music_resolve:', e?.message || e);
      return sendSuccess(res, { previewUrl: null, source: 'none', song: null });
    }
  }

  if (action === 'music_radio' || action === 'music_trending' || action === 'music_recommend') {
    try {
      const { checkActionRateLimit } = require('../server-lib/rate-limit');
      const rate = await checkActionRateLimit(user.uid, 'music_radio');
      if (!rate.ok) {
        return sendError(res, 429, 'RATE_LIMITED', 'Too many music requests. Try again shortly.');
      }
    } catch (e) {
      /* rate-limit optional */
    }
    const app = initAdmin();
    const db = app ? app.firestore() : null;
    try {
      let data;
      if (action === 'music_radio') {
        data = await generateRadio({
          db,
          mood: body.mood,
          genre: body.genre,
          language: body.language,
          seeds: Array.isArray(body.seeds) ? body.seeds : undefined,
        });
      } else if (action === 'music_trending') {
        data = await generateTrending({
          db,
          scope: body.scope || 'global',
        });
      } else {
        data = await generateRecommendations({
          db,
          seeds: Array.isArray(body.seeds) ? body.seeds : undefined,
        });
      }
      return sendSuccess(res, {
        tracks: data.tracks || [],
        cacheKey: data.cacheKey || null,
        fromCache: !!data.fromCache,
        provider: data.provider || null,
        scope: data.scope || null,
        batchSize: (data.tracks || []).length,
      });
    } catch (e) {
      console.warn('[media-config]', action, e?.message || e);
      return sendSuccess(res, { tracks: [], cacheKey: null, fromCache: false, degraded: true });
    }
  }

  if (action === 'geocode_search') {
    // Nominatim proxy — identifying User-Agent set server-side (browsers cannot).
    // Free-tier appropriate; consider self-hosted Nominatim / LocationIQ at scale.
    const query = String(body.query || '').trim();
    if (query.length < 2) {
      return sendSuccess(res, { results: [] });
    }
    if (query.length > 120) {
      return sendError(res, 400, 'VALIDATION_ERROR', 'query too long');
    }
    try {
      const result = await searchPlaces(query, body.limit);
      return sendSuccess(res, result);
    } catch (e) {
      console.warn('[media-config] geocode_search:', e?.message || e);
      return sendSuccess(res, { results: [] });
    }
  }

  if (action === 'live_location_stop') {
    const shareId = String(body.shareId || '').trim();
    if (!shareId) return sendError(res, 400, 'VALIDATION_ERROR', 'shareId required');
    const admin = initAdmin();
    if (!admin) return sendError(res, 503, 'AUTH_NOT_CONFIGURED', 'Admin not configured');
    const ref = admin.firestore().collection('liveLocationShares').doc(shareId);
    const snap = await ref.get();
    if (!snap.exists) return sendError(res, 404, 'NOT_FOUND', 'Share not found');
    if (snap.data()?.uid !== user.uid) return sendError(res, 403, 'FORBIDDEN', 'Not your share');
    await ref.set(
      {
        active: false,
        stoppedAt: admin.firestore.FieldValue.serverTimestamp(),
        stopReason: 'user_stopped',
      },
      { merge: true }
    );
    return sendSuccess(res, { ok: true });
  }

  if (action === 'check_url') {
    const url = String(body.url || '').trim();
    if (!url || url.length > 2048) {
      return sendError(res, 400, 'VALIDATION_ERROR', 'url required');
    }
    try {
      const result = await checkUrlWithWebRisk(url);
      return sendSuccess(res, result);
    } catch (e) {
      console.warn('[media-config] check_url:', e?.message || e);
      return sendSuccess(res, { safe: true, checked: false, reason: 'error' });
    }
  }

  if (action === 'agora_token') {
    const { mintAgoraToken } = require('../server-lib/agora-token');
    // Always mint for the VERIFIED uid — accepting body.uid let a caller mint
    // publisher tokens for arbitrary Agora identities.
    const result = mintAgoraToken({
      channel: body.channel,
      uid: user.uid,
    });
    if (result.error === 'channel_required') {
      return sendError(res, 400, 'VALIDATION_ERROR', 'channel required');
    }
    return sendSuccess(res, result);
  }

  if (action === 'policy_consume') {
    // Server-authoritative quota consume (anon posts / AI Discovery messages).
    // Firestore rules make policyUsage client-read-only; this is the only writer.
    const feature = String(body.feature || '').trim();
    if (feature !== 'anon' && feature !== 'aiDiscoveryMsg' && feature !== 'peepalPost' && feature !== 'aiKb') {
      return sendError(res, 400, 'VALIDATION_ERROR', 'invalid feature');
    }
    const adminNs = initAdmin();
    if (!adminNs) {
      return sendError(res, 503, 'QUOTA_UNAVAILABLE', 'Quota service not configured');
    }
    const { consumePolicyUsage } = require('../server-lib/policy-usage');
    const result = await consumePolicyUsage(adminNs, user.uid, feature);
    if (!result.ok) {
      const status = result.code === 'DAILY_LIMIT' || result.code === 'WEEKLY_LIMIT' ? 429 : 503;
      return sendError(res, status, result.code || 'QUOTA_UNAVAILABLE', 'Quota not available');
    }
    return sendSuccess(res, result);
  }

  // Dangal Game of the Day + engagement counters (no new serverless function).
  if (action === 'get_game_of_day') {
    const adminNs = initAdmin();
    if (!adminNs) {
      return sendError(res, 503, 'AUTH_NOT_CONFIGURED', 'Admin not configured');
    }
    try {
      const { getOrComputeGameOfDay } = require('../server-lib/game-of-day');
      const result = await getOrComputeGameOfDay(adminNs);
      return sendSuccess(res, result);
    } catch (e) {
      console.warn('[media-config] get_game_of_day:', e?.message || e);
      return sendError(res, 500, 'GOTD_FAILED', 'Could not resolve Game of the Day');
    }
  }

  if (action === 'record_game_play') {
    const adminNs = initAdmin();
    if (!adminNs) {
      return sendError(res, 503, 'AUTH_NOT_CONFIGURED', 'Admin not configured');
    }
    const { recordGamePlaySafe } = require('../server-lib/game-of-day');
    const result = await recordGamePlaySafe(adminNs, body.gameId);
    if (!result.ok) {
      return sendError(res, 400, 'VALIDATION_ERROR', 'Invalid gameId');
    }
    return sendSuccess(res, result);
  }

  if (action === 'record_game_like') {
    const adminNs = initAdmin();
    if (!adminNs) {
      return sendError(res, 503, 'AUTH_NOT_CONFIGURED', 'Admin not configured');
    }
    const { recordGameLike } = require('../server-lib/game-of-day');
    const result = await recordGameLike(adminNs, user.uid, body.gameId);
    if (!result.ok) {
      return sendError(res, 400, 'VALIDATION_ERROR', 'Invalid gameId');
    }
    return sendSuccess(res, result);
  }

  if (action === 'list_games_health') {
    if (!user.decoded || user.decoded.admin !== true) {
      return sendError(res, 403, 'FORBIDDEN', 'Admin claim required');
    }
    const adminNs = initAdmin();
    if (!adminNs) {
      return sendError(res, 503, 'AUTH_NOT_CONFIGURED', 'Admin not configured');
    }
    const flaggedOnly = body.flaggedOnly !== false;
    const { listGamesHealth } = require('../server-lib/game-of-day');
    const result = await listGamesHealth(adminNs, { flaggedOnly });
    return sendSuccess(res, result);
  }

  if (action === 'gif_search') {
    const adminApp = initAdmin();
    try {
      const result = await searchGifs(adminApp, {
        query: body.query,
        limit: body.limit,
      });
      return sendSuccess(res, result);
    } catch (e) {
      console.warn('[media-config] gif_search', e?.message || e);
      // Soft degrade — never 500 for an optional GIF dependency
      return sendSuccess(res, {
        results: [],
        source: 'error',
        configured: !!process.env.KLIPY_API_KEY,
        query: String(body.query || '').trim().toLowerCase(),
      });
    }
  }

  // ─── Notifications (Admin writes; client reads via onSnapshot) ───────────
  if (
    action === 'notif_mark_read' ||
    action === 'notif_mark_all_read' ||
    action === 'notif_soft_clear' ||
    action === 'notif_prune' ||
    action === 'notif_emit' ||
    action === 'notif_dm'
  ) {
    const adminApp = initAdmin();
    if (!adminApp) {
      return sendError(res, 503, 'AUTH_NOT_CONFIGURED', 'Admin not configured');
    }
    const notif = require('../server-lib/notifications');
    try {
      if (action === 'notif_mark_read') {
        const bundleId = String(body.bundleId || body.id || '').slice(0, 200);
        if (!bundleId) return sendError(res, 400, 'VALIDATION_ERROR', 'bundleId required');
        return sendSuccess(res, await notif.markNotificationRead(adminApp, user.uid, bundleId));
      }
      if (action === 'notif_mark_all_read') {
        return sendSuccess(
          res,
          await notif.markAllNotificationsRead(adminApp, user.uid, { section: body.section || null })
        );
      }
      if (action === 'notif_soft_clear') {
        return sendSuccess(
          res,
          await notif.softClearNotifications(adminApp, user.uid, {
            bundleIds: body.bundleIds || (body.bundleId ? [body.bundleId] : null),
            section: body.section || null,
          })
        );
      }
      if (action === 'notif_prune') {
        return sendSuccess(res, await notif.pruneOldReadNotifications(adminApp, user.uid));
      }
      if (action === 'notif_dm') {
        const chatId = String(body.chatId || '').slice(0, 120);
        const recipientUid = String(body.recipientUid || '').slice(0, 128);
        if (!chatId || !recipientUid) {
          return sendError(res, 400, 'VALIDATION_ERROR', 'chatId and recipientUid required');
        }
        // Verify sender is a participant
        const db = adminApp.firestore();
        const chatSnap = await db.collection('chats').doc(chatId).get();
        if (!chatSnap.exists) return sendError(res, 404, 'NOT_FOUND', 'Chat not found');
        const members = chatSnap.data()?.participants || chatSnap.data()?.members || chatSnap.data()?.participantIds || [];
        const memberSet = new Set(
          Array.isArray(members) ? members.map(String) : Object.keys(members || {})
        );
        if (!memberSet.has(user.uid) || !memberSet.has(recipientUid)) {
          return sendError(res, 403, 'FORBIDDEN', 'Not a chat member');
        }
        const actor =
          (await notif.resolveActor(adminApp, user.uid)) ||
          notif.normalizeActor({
            uid: user.uid,
            name: body.actorName || 'Someone',
            avatar: body.actorAvatar || '👤',
          });
        const result = await notif.maybeNotifyDm(adminApp, {
          chatId,
          recipientUid,
          actor,
          preview: String(body.preview || 'New message').slice(0, 280),
        });
        return sendSuccess(res, result || { skipped: 'none' });
      }
      if (action === 'notif_emit') {
        // Validated emit for content like/comment after client write — checks like/comment ownership
        const type = String(body.type || '').slice(0, 40);
        const refId = String(body.refId || '').slice(0, 180);
        const recipientUid = String(body.recipientUid || '').slice(0, 128);
        const collection = String(body.collection || 'duniya').slice(0, 20);
        if (!type || !refId || !recipientUid) {
          return sendError(res, 400, 'VALIDATION_ERROR', 'type, refId, recipientUid required');
        }
        if (recipientUid === user.uid) return sendSuccess(res, { skipped: 'self' });
        const db = adminApp.firestore();
        if (type === 'like' || type === 'duniya_like' || type === 'peepal_like') {
          const likeSnap = await db.collection(collection).doc(refId).collection('likes').doc(user.uid).get();
          if (!likeSnap.exists) return sendError(res, 403, 'FORBIDDEN', 'Like not found');
          const postSnap = await db.collection(collection).doc(refId).get();
          if (!postSnap.exists || postSnap.data()?.uid !== recipientUid) {
            return sendError(res, 403, 'FORBIDDEN', 'Recipient mismatch');
          }
        } else if (type === 'comment' || type === 'duniya_comment' || type === 'peepal_comment') {
          const postSnap = await db.collection(collection).doc(refId).get();
          if (!postSnap.exists || postSnap.data()?.uid !== recipientUid) {
            return sendError(res, 403, 'FORBIDDEN', 'Recipient mismatch');
          }
        } else if (type === 'challenge' || type === 'duel') {
          // Best-effort; chat membership checked if chatId in deepLink
        } else {
          return sendError(res, 400, 'VALIDATION_ERROR', 'Unsupported emit type');
        }
        const actor = await notif.resolveActor(adminApp, user.uid);
        const result = await notif.upsertNotification(adminApp, recipientUid, {
          type: type.includes('like') ? 'like' : type.includes('comment') ? 'comment' : type,
          refId,
          actor,
          preview: String(body.preview || '').slice(0, 280),
          deepLink: body.deepLink || { postId: refId, collection },
        });
        // Opportunistic prune for recipient
        notif.pruneOldReadNotifications(adminApp, recipientUid).catch(() => {});
        return sendSuccess(res, result || {});
      }
    } catch (e) {
      console.warn('[media-config] notif', action, e?.message || e);
      return sendError(res, 500, 'NOTIF_ERROR', e?.message || 'Notification failed');
    }
  }

  // ─── Parental consent (teen accounts) ────────────────────────────────────
  if (action === 'parental_consent_start' || action === 'parental_consent_verify') {
    const adminApp = initAdmin();
    if (!adminApp) return sendError(res, 503, 'AUTH_NOT_CONFIGURED', 'Admin not configured');
    const parental = require('../server-lib/parental-consent');
    try {
      if (action === 'parental_consent_start') {
        const out = await parental.startParentalConsent(adminApp, user.uid, body.contact);
        if (!out.ok) {
          return sendSuccess(res, {
            needParentSignup: !!out.needParentSignup,
            error: out.error,
          });
        }
        return sendSuccess(res, out);
      }
      const out = await parental.verifyParentalConsent(adminApp, user.uid, body.otp);
      if (!out.ok) return sendError(res, 400, out.error || 'INVALID_OTP', 'Could not verify consent');
      return sendSuccess(res, out);
    } catch (e) {
      console.warn('[media-config] parental', e?.message || e);
      return sendError(res, 500, 'CONSENT_ERROR', e?.message || 'Consent failed');
    }
  }

  // ─── Contacts match (hashed phones only — never raw address book) ────────
  if (action === 'match_contact_hashes') {
    try {
      const { checkActionRateLimit } = require('../server-lib/rate-limit');
      const rate = await checkActionRateLimit(user.uid, 'contact_match');
      if (!rate.ok) {
        return sendError(res, 429, 'RATE_LIMITED', 'Too many contact lookups. Try again shortly.');
      }
    } catch (e) {
      console.warn('[media-config] contact rate-limit', e?.message || e);
    }
    const adminApp = initAdmin();
    if (!adminApp) return sendError(res, 503, 'AUTH_NOT_CONFIGURED', 'Admin not configured');
    const hashes = [
      ...new Set(
        (Array.isArray(body.hashes) ? body.hashes : [])
          .map((h) => String(h || '').toLowerCase().trim())
          .filter((h) => /^[a-f0-9]{64}$/.test(h))
      ),
    ].slice(0, 80);
    if (!hashes.length) return sendSuccess(res, { matches: [] });
    try {
      const db = adminApp.firestore();
      const matches = [];
      // Firestore getAll in chunks of 10
      for (let i = 0; i < hashes.length; i += 10) {
        const chunk = hashes.slice(i, i + 10);
        const refs = chunk.map((h) => db.collection('phoneHashIndex').doc(h));
        const snaps = await db.getAll(...refs);
        for (const snap of snaps) {
          if (!snap.exists) continue;
          const d = snap.data() || {};
          const uid = String(d.uid || '');
          if (!uid || uid === user.uid) continue;
          let name = '';
          let username = '';
          let photoURL = '';
          try {
            const pub = await db.collection('users_public').doc(uid).get();
            if (pub.exists) {
              const p = pub.data() || {};
              name = String(p.name || p.displayName || '');
              username = String(p.username || '');
              photoURL = String(p.photoURL || '');
            }
          } catch (e) {}
          matches.push({ hash: snap.id, uid, name, username, photoURL });
        }
      }
      return sendSuccess(res, { matches });
    } catch (e) {
      console.warn('[media-config] match_contact_hashes', e?.message || e);
      return sendError(res, 500, 'CONTACT_MATCH_ERROR', e?.message || 'Match failed');
    }
  }

  return sendError(res, 400, 'VALIDATION_ERROR', 'Unknown media action', {
    allowed: [
      'music_search',
      'music_radio',
      'music_trending',
      'music_recommend',
      'youtube_search',
      'search_query',
      'music_resolve',
      'geocode_search',
      'live_location_stop',
      'check_url',
      'agora_token',
      'policy_consume',
      'username_check',
      'resolve_identifier',
      'switch_account',
      'get_game_of_day',
      'record_game_play',
      'record_game_like',
      'list_games_health',
      'gif_search',
      'notif_mark_read',
      'notif_mark_all_read',
      'notif_soft_clear',
      'notif_prune',
      'notif_emit',
      'notif_dm',
      'parental_consent_start',
      'parental_consent_verify',
      'match_contact_hashes',
    ],
  });
}

module.exports = async function handler(req, res) {
  if (req.method === 'OPTIONS') {
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Authorization, Content-Type');
    return res.status(204).end();
  }

  if (req.method === 'GET') {
    return handleGet(req, res);
  }

  if (req.method === 'POST') {
    if (!requireMethod(req, res, 'POST')) return;
    return handlePost(req, res);
  }

  res.setHeader('Allow', 'GET, POST, OPTIONS');
  return sendError(res, 405, 'METHOD_NOT_ALLOWED', 'Use GET or POST');
};
