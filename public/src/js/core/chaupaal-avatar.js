/**
 * Chaupaal gift avatars — deterministic cute SVG from profile signals.
 * Uploaded photos win when avatarDisplay is 'photo'; gift always available as fallback.
 */
(function () {
  'use strict';

  const WARM_PALETTES = [
    ['#E8A598', '#F4C4B0'],
    ['#9CB8A0', '#C5D9C8'],
    ['#B8A9D4', '#D4CCE8'],
    ['#E9C46A', '#F4D58D'],
    ['#F4A261', '#FAD4A0'],
    ['#E07A8C', '#F5B8C4'],
    ['#7EB8DA', '#B8DCEF'],
    ['#C9A87C', '#E8D4B8'],
  ];

  const PRO_COOL = ['#8BA4C9', '#B8CCE8'];

  const INTEREST_BUCKETS = [
    { keys: ['sport', 'cricket', 'football', 'fitness', 'gym', 'run'], id: 'ball' },
    { keys: ['music', 'song', 'band', 'guitar'], id: 'note' },
    { keys: ['tech', 'code', 'startup', 'software', 'engineer'], id: 'chip' },
    { keys: ['food', 'cook', 'recipe', 'chef'], id: 'bowl' },
    { keys: ['travel', 'trek', 'trip', 'wander'], id: 'mountain' },
    { keys: ['art', 'design', 'film', 'photo', 'paint'], id: 'palette' },
    { keys: ['book', 'read', 'gk', 'quiz', 'learn'], id: 'book' },
    { keys: ['nature', 'garden', 'plant', 'green'], id: 'leaf' },
  ];

  const INDUSTRY_BUCKETS = [
    { keys: ['tech', 'software', 'it', 'engineer'], id: 'bracket' },
    { keys: ['health', 'medical', 'care', 'hospital'], id: 'plus' },
    { keys: ['education', 'school', 'teach', 'learn'], id: 'cap' },
    { keys: ['finance', 'bank', 'invest'], id: 'coin' },
    { keys: ['creative', 'media', 'design', 'art'], id: 'nib' },
  ];

  const SVG_CACHE = new Map();
  const CACHE_ORDER = [];
  const CACHE_MAX = 200;

  function esc(value) {
    return String(value ?? '').replace(/[&<>"']/g, (ch) =>
      ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[ch]
    );
  }

  function djb2Hex(str) {
    let h = 5381;
    const s = String(str || '');
    for (let i = 0; i < s.length; i++) h = (h * 33) ^ s.charCodeAt(i);
    return (h >>> 0).toString(16).padStart(8, '0');
  }

  function isHttpUrl(value) {
    const v = String(value || '').trim();
    return /^https?:\/\//i.test(v) || /^blob:/i.test(v);
  }

  function isEmojiGlyph(value) {
    const v = String(value || '').trim();
    if (!v || v.length > 8) return false;
    if (/^https?:\/\//i.test(v)) return false;
    if (v === '👤' || v === '🪑' || v === '📝') return true;
    try {
      return /\p{Extended_Pictographic}/u.test(v);
    } catch (e) {
      return /[\u{1F300}-\u{1FAFF}]/u.test(v);
    }
  }

  function firstNonEmpty(arr) {
    if (!Array.isArray(arr)) return '';
    const sorted = [...arr].map((x) => String(x || '').trim()).filter(Boolean).sort((a, b) =>
      a.localeCompare(b)
    );
    return sorted[0] || '';
  }

  function pickFromProfile(profile, keys) {
    const p = profile || {};
    const nested = p.profile && typeof p.profile === 'object' ? p.profile : {};
    for (const k of keys) {
      if (p[k] != null && String(p[k]).trim()) return String(p[k]).trim();
      if (nested[k] != null && String(nested[k]).trim()) return String(nested[k]).trim();
    }
    return '';
  }

  function collectSignals(profile) {
    const p = profile || {};
    const nested = p.profile && typeof p.profile === 'object' ? p.profile : {};
    const interests = [
      ...(Array.isArray(p.interests) ? p.interests : []),
      ...(Array.isArray(nested.interests) ? nested.interests : []),
    ];
    const hobbies = [
      ...(Array.isArray(p.hobbies) ? p.hobbies : []),
      ...(Array.isArray(nested.hobbies) ? nested.hobbies : []),
    ];
    return {
      uid: String(p.uid || nested.uid || ''),
      profileType: String(p.profileType || nested.profileType || 'personal').toLowerCase(),
      gender: String(p.gender || nested.gender || '').toLowerCase(),
      industry: String(p.industry || nested.industry || '').toLowerCase(),
      purpose: String(p.purpose || nested.purpose || '').toLowerCase(),
      topCat: String(p.topCat || nested.topCat || '').toLowerCase(),
      interest: firstNonEmpty(interests).toLowerCase(),
      hobby: firstNonEmpty(hobbies).toLowerCase(),
      occupation: String(p.occupation || nested.occupation || '').trim().toLowerCase(),
      personality: String(p.personality || nested.personality || '').toLowerCase(),
      city: String(p.city || nested.currentCity || p.currentCity || '').trim().toLowerCase(),
      lookingFor: String(p.lookingFor || nested.lookingFor || '').toLowerCase(),
    };
  }

  function matchBucket(text, buckets) {
    const hay = String(text || '').toLowerCase();
    if (!hay) return null;
    for (const bucket of buckets) {
      if (bucket.keys.some((k) => hay.includes(k))) return bucket.id;
    }
    return null;
  }

  function accessoryId(signals) {
    const hay = [signals.interest, signals.hobby, signals.topCat, signals.occupation].join(' ');
    return matchBucket(hay, INTEREST_BUCKETS) || 'star';
  }

  function industryBadgeId(signals) {
    const hay = [signals.industry, signals.purpose, signals.occupation].join(' ');
    return matchBucket(hay, INDUSTRY_BUCKETS) || 'briefcase';
  }

  function hasUserProfilePhoto(profile) {
    const p = profile || {};
    const nested = p.profile && typeof p.profile === 'object' ? p.profile : {};
    const candidates = [
      p.photoThumb,
      p.photoURL,
      nested.photoThumb,
      nested.photoURL,
      Array.isArray(p.photos) ? p.photos[0] : null,
      Array.isArray(nested.photos) ? nested.photos[0] : null,
      Array.isArray(p.profileMedia) ? p.profileMedia[0]?.url || p.profileMedia[0] : null,
      Array.isArray(nested.profileMedia) ? nested.profileMedia[0]?.url || nested.profileMedia[0] : null,
    ];
    for (const c of candidates) {
      if (isHttpUrl(c)) return true;
    }
    if (isHttpUrl(p.avatar)) return true;
    return false;
  }

  function bestPhotoUrl(profile) {
    const p = profile || {};
    const nested = p.profile && typeof p.profile === 'object' ? p.profile : {};
    const candidates = [
      p.photoThumb,
      p.photoURL,
      nested.photoThumb,
      nested.photoURL,
      isHttpUrl(p.avatar) ? p.avatar : null,
      Array.isArray(p.photos) ? p.photos[0] : null,
      Array.isArray(nested.photos) ? nested.photos[0] : null,
    ];
    for (const c of candidates) {
      if (isHttpUrl(c)) return String(c);
    }
    return '';
  }

  function getAvatarDisplay(profile) {
    const p = profile || {};
    const nested = p.profile && typeof p.profile === 'object' ? p.profile : {};
    const mode = p.avatarDisplay || nested.avatarDisplay;
    if (mode === 'gift' || mode === 'photo') return mode;
    return hasUserProfilePhoto(profile) ? 'photo' : 'gift';
  }

  function shouldShowUploadedPhoto(profile) {
    return hasUserProfilePhoto(profile) && getAvatarDisplay(profile) === 'photo';
  }

  function chaupaalAvatarFingerprint(profile) {
    const signals = collectSignals(profile);
    const keys = Object.keys(signals).sort();
    const stable = {};
    keys.forEach((k) => {
      stable[k] = signals[k];
    });
    return djb2Hex(JSON.stringify(stable));
  }

  function paletteFor(signals, fp) {
    const idx = parseInt(fp.slice(0, 6), 16) % WARM_PALETTES.length;
    const base = WARM_PALETTES[idx];
    if (signals.profileType === 'professional') {
      return [base[0], PRO_COOL[1]];
    }
    return base;
  }

  function hairVariant(gender) {
    const g = String(gender || '').toLowerCase();
    if (/female|she|her|woman|girl/.test(g)) return 'fluff';
    if (/male|he|him|man|boy/.test(g)) return 'short';
    return 'neutral';
  }

  function hairSvg(variant, hairColor) {
    if (variant === 'fluff') {
      return `<path d="M34 36 Q50 22 66 36 Q62 30 50 28 Q38 30 34 36" fill="${hairColor}" opacity="0.85"/>`;
    }
    if (variant === 'short') {
      return `<path d="M38 34 Q50 26 62 34 Q58 30 50 29 Q42 30 38 34" fill="${hairColor}" opacity="0.8"/>`;
    }
    return `<path d="M40 33 Q50 27 60 33" fill="none" stroke="${hairColor}" stroke-width="2.2" stroke-linecap="round" opacity="0.55"/>`;
  }

  function accessorySvg(id) {
    const g = `<g transform="translate(68,18) scale(0.9)">`;
    switch (id) {
      case 'ball':
        return `${g}<circle cx="8" cy="8" r="7" fill="#fff" stroke="#333" stroke-width="1.2"/><path d="M3 6 Q8 2 13 6" fill="none" stroke="#333" stroke-width="0.8"/></g>`;
      case 'note':
        return `${g}<ellipse cx="8" cy="12" rx="5" ry="4" fill="#fff" stroke="#333" stroke-width="1"/><rect x="11" y="2" width="2" height="10" fill="#333"/><circle cx="12" cy="13" r="2" fill="#333"/></g>`;
      case 'chip':
        return `${g}<rect x="1" y="3" width="14" height="10" rx="2.5" fill="#fff" stroke="#333" stroke-width="1"/><circle cx="5" cy="8" r="1.2" fill="#E63946"/><circle cx="8" cy="8" r="1.2" fill="#2A9D8F"/><circle cx="11" cy="8" r="1.2" fill="#8134AF"/></g>`;
      case 'bowl':
        return `${g}<ellipse cx="8" cy="12" rx="7" ry="3" fill="#fff" stroke="#333" stroke-width="1"/><path d="M3 12 Q8 6 13 12" fill="none" stroke="#333" stroke-width="1"/><path d="M6 4 Q8 1 10 4" fill="none" stroke="#aaa" stroke-width="1.2" stroke-linecap="round"/></g>`;
      case 'mountain':
        return `${g}<path d="M1 14 L8 4 L15 14 Z" fill="#fff" stroke="#333" stroke-width="1" stroke-linejoin="round"/><path d="M6 14 L10 8 L14 14" fill="#C5D9C8" stroke="#333" stroke-width="0.8"/></g>`;
      case 'palette':
        return `${g}<circle cx="8" cy="8" r="7" fill="#fff" stroke="#333" stroke-width="1"/><circle cx="5" cy="6" r="1.3" fill="#E63946"/><circle cx="8" cy="5" r="1.3" fill="#2A9D8F"/><circle cx="11" cy="7" r="1.3" fill="#8134AF"/><circle cx="7" cy="10" r="1.3" fill="#E9C46A"/></g>`;
      case 'book':
        return `${g}<rect x="2" y="3" width="12" height="11" rx="1.5" fill="#fff" stroke="#333" stroke-width="1"/><line x1="8" y1="3" x2="8" y2="14" stroke="#333" stroke-width="0.8"/></g>`;
      case 'leaf':
        return `${g}<path d="M8 2 Q14 8 8 14 Q2 8 8 2" fill="#9CB8A0" stroke="#2A9D8F" stroke-width="0.8"/><line x1="8" y1="4" x2="8" y2="12" stroke="#2A9D8F" stroke-width="0.6"/></g>`;
      default:
        return `${g}<path d="M8 2 L10 7 L15 7 L11 10 L12 15 L8 12 L4 15 L5 10 L1 7 L6 7 Z" fill="#fff" stroke="#E9C46A" stroke-width="0.8"/></g>`;
    }
  }

  function proBadgeSvg(id) {
    const g = `<g transform="translate(68,68) scale(0.85)">`;
    switch (id) {
      case 'bracket':
        return `${g}<text x="4" y="12" font-size="11" font-family="monospace" fill="#fff" stroke="#333" stroke-width="0.3">&lt;/&gt;</text></g>`;
      case 'plus':
        return `${g}<circle cx="8" cy="8" r="7" fill="#fff" stroke="#333" stroke-width="1"/><line x1="8" y1="5" x2="8" y2="11" stroke="#E63946" stroke-width="1.6"/><line x1="5" y1="8" x2="11" y2="8" stroke="#E63946" stroke-width="1.6"/></g>`;
      case 'cap':
        return `${g}<path d="M1 10 L8 5 L15 10 L8 14 Z" fill="#fff" stroke="#333" stroke-width="1"/><rect x="6" y="10" width="4" height="4" fill="#333"/></g>`;
      case 'coin':
        return `${g}<rect x="3" y="10" width="10" height="3" rx="1" fill="#E9C46A" stroke="#333" stroke-width="0.8"/><rect x="4" y="6" width="8" height="3" rx="1" fill="#F4D58D" stroke="#333" stroke-width="0.8"/><rect x="5" y="2" width="6" height="3" rx="1" fill="#fff" stroke="#333" stroke-width="0.8"/></g>`;
      case 'nib':
        return `${g}<path d="M4 14 L12 2 L14 6 L8 14 Z" fill="#fff" stroke="#333" stroke-width="1"/><circle cx="12" cy="3" r="1.5" fill="#8134AF"/></g>`;
      default:
        return `${g}<rect x="2" y="5" width="12" height="9" rx="2" fill="#fff" stroke="#333" stroke-width="1"/><rect x="4" y="2" width="8" height="4" rx="1.5" fill="#fff" stroke="#333" stroke-width="1"/></g>`;
    }
  }

  function rememberCache(key, svg) {
    if (SVG_CACHE.has(key)) return svg;
    if (SVG_CACHE.size >= CACHE_MAX) {
      const oldest = CACHE_ORDER.shift();
      if (oldest) SVG_CACHE.delete(oldest);
    }
    SVG_CACHE.set(key, svg);
    CACHE_ORDER.push(key);
    return svg;
  }

  function buildChaupaalAvatarSvg(profile, { size = 100 } = {}) {
    const signals = collectSignals(profile);
    const fp = chaupaalAvatarFingerprint(profile);
    const cacheKey = `${fp}:${size}`;
    if (SVG_CACHE.has(cacheKey)) return SVG_CACHE.get(cacheKey);

    const [c1, c2] = paletteFor(signals, fp);
    const hair = hairVariant(signals.gender);
    const hairColor = djb2Hex(fp + 'hair').slice(0, 6);
    const hairFill = `#${hairColor}`;
    const isPro = signals.profileType === 'professional';
    const badge = isPro ? proBadgeSvg(industryBadgeId(signals)) : accessorySvg(accessoryId(signals));

    const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100" width="${size}" height="${size}" role="presentation" aria-hidden="true">
  <defs>
    <linearGradient id="bg_${fp}" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="${c1}"/>
      <stop offset="100%" stop-color="${c2}"/>
    </linearGradient>
  </defs>
  <rect width="100" height="100" rx="22" ry="22" fill="url(#bg_${fp})"/>
  ${hairSvg(hair, hairFill)}
  <circle cx="50" cy="52" r="22" fill="#FCE8D8"/>
  <ellipse cx="38" cy="56" rx="4" ry="2" fill="#F4A6B8" opacity="0.28"/>
  <ellipse cx="62" cy="56" rx="4" ry="2" fill="#F4A6B8" opacity="0.28"/>
  <circle cx="42" cy="48" r="2.8" fill="#2C2E33"/>
  <circle cx="58" cy="48" r="2.8" fill="#2C2E33"/>
  <circle cx="43" cy="47" r="0.9" fill="#fff"/>
  <circle cx="59" cy="47" r="0.9" fill="#fff"/>
  <path d="M44 58 Q50 63 56 58" fill="none" stroke="#2C2E33" stroke-width="1.8" stroke-linecap="round"/>
  ${badge}
</svg>`;

    return rememberCache(cacheKey, svg);
  }

  function displayNameFor(profile) {
    const p = profile || {};
    const nested = p.profile && typeof p.profile === 'object' ? p.profile : {};
    return (
      p.name ||
      nested.displayName ||
      p.displayName ||
      p.username ||
      'Member'
    );
  }

  function chaupaalAvatarHtml(profile, { size = 44, className = 'cp-gift-avatar', alt = '', decorative = true } = {}) {
    const svg = buildChaupaalAvatarSvg(profile, { size });
    const label = alt || `Avatar for ${displayNameFor(profile)}`;
    if (decorative) {
      return `<span class="${esc(className)}" role="img" aria-label="${esc(label)}">${svg}</span>`;
    }
    return `<span class="${esc(className)}" role="img" aria-label="${esc(label)}">${svg}</span>`;
  }

  function noteGiftAvatarIntroIfNeeded(profile) {
    try {
      const uid = profile?.uid || (typeof currentUser !== 'undefined' ? currentUser?.uid : '');
      if (!uid || uid !== (typeof currentUser !== 'undefined' ? currentUser?.uid : '')) return;
      if (localStorage.getItem('chaupaal_gift_avatar_noted') === '1') return;
      if (getAvatarDisplay(profile) !== 'gift') return;
      localStorage.setItem('chaupaal_gift_avatar_noted', '1');
      const msg =
        typeof t === 'function' && t('gift_avatar_intro') !== 'gift_avatar_intro'
          ? t('gift_avatar_intro')
          : 'Chaupaal made this avatar for you — it grows as you add to your profile. Add a photo anytime.';
      if (typeof showToast === 'function') showToast(msg);
    } catch (e) {}
  }

  function renderUserAvatarHtml(profile, opts = {}) {
    const p = profile || {};
    if (shouldShowUploadedPhoto(p)) {
      const url = bestPhotoUrl(p);
      const alt = opts.alt != null ? opts.alt : displayNameFor(p);
      return `<img src="${esc(url)}" alt="${esc(alt)}" loading="lazy">`;
    }
    if (opts.noteIntroForSelf) noteGiftAvatarIntroIfNeeded(p);
    return chaupaalAvatarHtml(p, opts);
  }

  function isRealUserEntity(profile) {
    const p = profile || {};
    if (p.type === 'group' || p.isChaupaal || p.isChaupaalAi) return false;
    if (p.uid === 'chaupaal') return false;
    return true;
  }

  function duniyaUserAvatarHtml(user) {
    const u = user || {};
    if (u.photoURL && shouldShowUploadedPhoto(u)) {
      return `<img src="${esc(u.photoURL)}" style="width:100%;height:100%;border-radius:50%;object-fit:cover;" alt="">`;
    }
    const av = String(u.avatar || '').trim();
    if (av && isEmojiGlyph(av) && !isHttpUrl(av)) {
      return `<span>${esc(av)}</span>`;
    }
    if (u.uid && String(u.uid).length > 12) {
      return renderUserAvatarHtml(u, { decorative: true });
    }
    if (av && !isEmojiGlyph(av) && isHttpUrl(av)) {
      return `<img src="${esc(av)}" style="width:100%;height:100%;border-radius:50%;object-fit:cover;" alt="">`;
    }
    return av ? `<span>${esc(av)}</span>` : renderUserAvatarHtml(u, { decorative: true });
  }

  window.hasUserProfilePhoto = hasUserProfilePhoto;
  window.getAvatarDisplay = getAvatarDisplay;
  window.shouldShowUploadedPhoto = shouldShowUploadedPhoto;
  window.chaupaalAvatarFingerprint = chaupaalAvatarFingerprint;
  window.buildChaupaalAvatarSvg = buildChaupaalAvatarSvg;
  window.chaupaalAvatarHtml = chaupaalAvatarHtml;
  window.renderUserAvatarHtml = renderUserAvatarHtml;
  window.duniyaUserAvatarHtml = duniyaUserAvatarHtml;
  window.isRealUserEntity = isRealUserEntity;
  window.bestPhotoUrl = bestPhotoUrl;

  async function setAvatarDisplayMode(mode) {
    if (!currentUser || typeof db === 'undefined' || !db) return null;
    const next = mode === 'gift' ? 'gift' : 'photo';
    if (typeof userProfile !== 'undefined' && userProfile) userProfile.avatarDisplay = next;
    try {
      await db.collection('users').doc(currentUser.uid).update({ avatarDisplay: next });
      if (typeof UsersPublic?.syncPublicProfile === 'function') {
        UsersPublic.syncPublicProfile(currentUser.uid, {
          ...(typeof userProfile !== 'undefined' ? userProfile : {}),
          avatarDisplay: next,
        });
      }
    } catch (e) {
      console.warn('[avatar] display mode', e?.message || e);
    }
    return next;
  }

  window.setAvatarDisplayMode = setAvatarDisplayMode;
})();
