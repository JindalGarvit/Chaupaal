/**
 * Client-side Peepal audience parse, topic inference, and segment drafts.
 * Mirrors server-lib/peepal-segments.js shapes. LLM only if AI_FEATURES_ENABLED.
 */
(function () {
  'use strict';

  const FREE_MAX_CAP = 50;
  const CITY_HINTS = [
    'bangalore',
    'bengaluru',
    'mumbai',
    'delhi',
    'hyderabad',
    'chennai',
    'kolkata',
    'pune',
    'jaipur',
    'ahmedabad',
    'gurgaon',
    'gurugram',
    'noida',
    'lucknow',
    'kochi',
    'goa',
  ];
  const TOPIC_MAP = [
    ['TECH', /\b(software|code|ai|app|startup|developer|tech|programming)\b/i],
    ['CAREER', /\b(job|hiring|career|internship|salary|resume|work)\b/i],
    ['DATING', /\b(date|dating|relationship|crush|love)\b/i],
    ['FRIENDS', /\b(friend|hangout|meetup|buddy)\b/i],
    ['SPORTS', /\b(cricket|football|sport|gym|fitness|match)\b/i],
    ['FOOD', /\b(food|recipe|restaurant|cafe|biryani)\b/i],
    ['TRAVEL', /\b(travel|trip|flight|goa|hill)\b/i],
    ['MUSIC', /\b(music|song|concert|playlist)\b/i],
    ['NEWS', /\b(news|politics|election|policy)\b/i],
    ['EDU', /\b(exam|college|university|study|class)\b/i],
  ];

  function inferPeepalTopic(text) {
    const raw = String(text || '');
    for (let i = 0; i < TOPIC_MAP.length; i++) {
      if (TOPIC_MAP[i][1].test(raw)) return TOPIC_MAP[i][0];
    }
    return 'GENERAL';
  }

  function parseCustomAudienceText(text) {
    const raw = String(text || '').trim();
    const lower = raw.toLowerCase();
    const keywords = raw
      .split(/[,\n;/]+/)
      .map((s) => s.trim())
      .filter(Boolean)
      .slice(0, 16);
    const city = CITY_HINTS.find((c) => lower.includes(c)) || null;
    const ageMatch = lower.match(/\b(\d{2})\s*(?:-|to)\s*(\d{2})\b/) || lower.match(/\b(\d{2})\s*\+/);
    const ageRange = { min: null, max: null };
    if (ageMatch) {
      if (ageMatch[2]) {
        ageRange.min = Number(ageMatch[1]);
        ageRange.max = Number(ageMatch[2]);
      } else {
        ageRange.min = Number(ageMatch[1]);
      }
    }
    let gender = 'any';
    if (/\b(women|woman|female|ladies)\b/.test(lower)) gender = 'female';
    else if (/\b(men|man|male|guys)\b/.test(lower)) gender = 'male';
    const interests = keywords
      .filter((k) => k.length > 2 && !CITY_HINTS.includes(k.toLowerCase()))
      .slice(0, 12);
    return {
      customAudienceText: raw.slice(0, 400),
      audienceKeywords: keywords,
      criteria: {
        interests,
        ageRange,
        gender,
        city,
        personality: null,
        searchIntent: 'any',
        vibe: raw.slice(0, 160),
      },
    };
  }

  function membershipTier() {
    try {
      if (typeof ChaupaalMoney?.effectiveTier === 'function') return ChaupaalMoney.effectiveTier() || 'free';
    } catch (e) {}
    return 'free';
  }

  function isPremiumPeepal() {
    const t = membershipTier();
    return t === 'pradhan' || t === 'sarpanch';
  }

  function resolveCapNumber(cap) {
    if (cap === 'unlimited' || cap === 'algorithm' || cap == null || cap === '') return null;
    const n = Number(cap);
    if (!Number.isFinite(n)) return 50;
    return Math.max(1, Math.floor(n));
  }

  function buildComposerSegments(opts) {
    const o = opts || {};
    const premium = isPremiumPeepal();
    const drafts = Array.isArray(o.segments) && o.segments.length && premium ? o.segments.slice(0, 8) : null;
    const audience = o.anonymous ? 'algorithm' : o.audience || 'everyone';
    const mapped =
      audience === 'friends' || audience === 'followers'
        ? 'followers'
        : audience === 'ai'
          ? 'everyone'
          : audience;
    const cap = o.anonymous ? resolveCapNumber(o.responseCap) : resolveCapNumber(o.responseCap);
    if (drafts) {
      return drafts.map((d, i) => ({
        id: String(d.id || `seg_${i + 1}`),
        order: i,
        label: String(d.label || `Segment ${i + 1}`).slice(0, 60),
        audience: d.audience || mapped,
        customAudienceText: d.customAudienceText || '',
        criteria: (d.parsed || parseCustomAudienceText(d.customAudienceText || '')).criteria || {},
        cap: resolveCapNumber(d.cap != null ? d.cap : cap),
        fulfilledCount: 0,
        viewsShown: 0,
        responsesInWindow: 0,
        windowStartedAt: null,
        status: i === 0 ? 'active' : 'pending',
        activatedAt: i === 0 ? Date.now() : null,
        completedAt: null,
        stallReason: null,
      }));
    }
    const parsed = mapped === 'custom' ? parseCustomAudienceText(o.customAudienceText || '') : parseCustomAudienceText('');
    return [
      {
        id: 'seg_1',
        order: 0,
        label: mapped === 'followers' ? 'Followers' : mapped === 'custom' ? 'Custom' : 'Everyone',
        audience: mapped,
        customAudienceText: parsed.customAudienceText || '',
        criteria: parsed.criteria,
        cap,
        fulfilledCount: 0,
        viewsShown: 0,
        responsesInWindow: 0,
        windowStartedAt: null,
        status: 'active',
        activatedAt: Date.now(),
        completedAt: null,
        stallReason: null,
      },
    ];
  }

  window.PeepalAudience = {
    FREE_MAX_CAP,
    inferPeepalTopic,
    parseCustomAudienceText,
    membershipTier,
    isPremiumPeepal,
    resolveCapNumber,
    buildComposerSegments,
  };
})();
