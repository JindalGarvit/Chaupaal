/**
 * Discovery Assumption Engine — versioned, testable soft defaults.
 *
 * Hard rules live elsewhere (blocks, opt-out, shadowban, teen, PolicyLimits).
 * Soft assumptions apply only when a dimension is unconstrained by the query.
 * Explicit user language always wins via assumptionsSuppressed[] / hardFilters[].
 *
 * ASSUMPTION_VERSION bumps when default behavior changes (for offline eval).
 */
'use strict';

const ASSUMPTION_VERSION = 1;

/** Documented catalogue — single source for tests + admin explainability. */
const ASSUMPTION_CATALOGUE = Object.freeze([
  {
    id: 'dating_opposite_gender',
    name: 'Opposite-gender dating default',
    whenApplies:
      'searchIntent is dating/romance/marriage AND seeker shared a binary gender AND query did not specify match gender/orientation',
    whenNot: 'Seeker gender unknown/unshared; intent is not dating/romance/marriage',
    override:
      'Explicit same-gender / everyone / any gender / LGBTQ+ / queer / bisexual language → suppress',
  },
  {
    id: 'similar_age_band',
    name: 'Similar age band',
    whenApplies: 'Age range not stated in query AND seeker age known',
    whenNot: 'Explicit age / any age / wide range in query',
    override: '"any age", "older", "younger", numeric range → hard or soft override',
  },
  {
    id: 'near_city_or_open',
    name: 'Same/near city preference',
    whenApplies: 'Location not stated AND seeker city known',
    whenNot: 'Explicit city/college/anywhere/online-only',
    override: '"any city", "anywhere", "online only", named city → hard filter or loosen',
  },
  {
    id: 'intent_overlap',
    name: 'Compatible looking-for / intent',
    whenApplies: 'Intent chip or parsed searchIntent is set',
    whenNot: 'Query is purely attribute-specific (college/company only)',
    override: 'Named looking-for text in query becomes hard filter',
  },
  {
    id: 'recently_active',
    name: 'Prefer recently active',
    whenApplies: 'Many candidates after filters',
    whenNot: 'Query implies specific named person/attribute with tiny recall set',
    override: 'N/A — ranking boost only',
  },
  {
    id: 'fof_boost',
    name: 'Friends-of-friends boost',
    whenApplies: 'Always as soft boost when graph edges exist',
    whenNot: 'Never a hard filter unless query implies FoF ("friend of a friend")',
    override: '"only friends of friends" → hard graph filter (future)',
  },
  {
    id: 'profile_type_career',
    name: 'Career → Professional soft boost',
    whenApplies: 'Query sounds career/job/hiring/co-founder',
    whenNot: 'Dating/friendship/social intents',
    override: 'Explicit Personal/Professional preference in query',
  },
  {
    id: 'profile_type_social',
    name: 'Social/dating → Personal soft boost',
    whenApplies: 'Dating/friendship/flatmate/travel social intents',
    whenNot: 'Career-sounding queries',
    override: 'Explicit Professional preference',
  },
]);

const DATING_INTENTS = new Set(['dating', 'romance', 'marriage', 'romantic', 'relationship']);
const CAREER_INTENTS = new Set([
  'job',
  'hiring',
  'recruitment',
  'career',
  'cofounder',
  'co-founder',
  'professional',
]);
const SOCIAL_INTENTS = new Set([
  'dating',
  'friendship',
  'flatmate',
  'roommate',
  'travel',
  'gaming',
  'music',
]);

const OPPOSITE_GENDER = Object.freeze({
  male: 'female',
  man: 'female',
  m: 'female',
  female: 'male',
  woman: 'male',
  f: 'male',
});

function normalizeGender(g) {
  const s = String(g || '')
    .trim()
    .toLowerCase();
  if (!s) return '';
  if (s === 'man' || s === 'm' || s === 'men') return 'male';
  if (s === 'woman' || s === 'f' || s === 'women') return 'female';
  return s;
}

function isDatingIntent(intent) {
  const s = String(intent || '')
    .trim()
    .toLowerCase();
  if (!s) return false;
  if (DATING_INTENTS.has(s)) return true;
  return /dat(e|ing)|romance|romantic|marriage|spouse|partner\b|boy\s*friend|girl\s*friend/.test(s);
}

function detectSuppressedAssumptions(query) {
  const q = String(query || '').toLowerCase();
  const suppressed = [];
  if (
    /\b(same[- ]gender|same sex|gay|lesbian|lgbtq?\+?|queer|bisexual|bi\b|non[- ]binary|everyone|any gender|all genders|no gender preference)\b/.test(
      q
    )
  ) {
    suppressed.push('dating_opposite_gender');
  }
  if (/\b(any age|all ages|older|younger|\d{2}\s*[-–to]+\s*\d{2})\b/.test(q)) {
    suppressed.push('similar_age_band');
  }
  if (/\b(any city|anywhere|any place|online only|remotely|remote only|nationwide|worldwide)\b/.test(q)) {
    suppressed.push('near_city_or_open');
  }
  return [...new Set(suppressed)];
}

function extractHardFilters(query, parsed) {
  const q = String(query || '');
  const ql = q.toLowerCase();
  const hard = {};
  const assumptionsSuppressed = detectSuppressedAssumptions(q);

  // College / university first (recall-first named attributes) — before city so
  // "from IIT Bombay in Mumbai" does not treat the campus as a city.
  const collegeMatch = q.match(
    /\b(?:from|at)\s+((?:IIT|IIM|NIT|BITS)(?:\s+[A-Z][A-Za-z]*){0,3}|[A-Z][A-Za-z0-9&.]*(?:\s+[A-Z][A-Za-z0-9&.]*){0,4}\s+(?:College|University))\b/
  );
  if (collegeMatch) hard.college = collegeMatch[1].trim();
  else {
    const lowerCollege = ql.match(
      /\b((?:iit|iim|nit|bits)(?:\s+[a-z]+){0,3}|[a-z0-9&.]+(?:\s+[a-z0-9&.]+){0,4}\s+(?:college|university))\b/
    );
    if (lowerCollege) hard.college = lowerCollege[1].trim();
  }

  // Prefer "in <city>" after campus phrases; also allow "from/near/around <city>"
  const inCity = ql.match(/\bin\s+([a-z][a-z]+)(?:\s|,|$)/);
  if (inCity) {
    const city = inCity[1].trim();
    if (city.length >= 3 && !/^(the|and|who|with|for|near)$/.test(city)) hard.city = city;
  }
  if (!hard.city) {
    const cityMatch = ql.match(/\b(?:from|near|around)\s+([a-z][a-z]+)(?:\s|,|$)/);
    if (cityMatch) {
      const city = cityMatch[1].trim();
      if (
        city.length >= 3 &&
        !/^(the|and|who|with|for|iit|iim|nit|bits)$/.test(city) &&
        !(hard.college && hard.college.toLowerCase().includes(city))
      ) {
        hard.city = city;
      }
    }
  }

  const companyMatch = q.match(/\b(?:works? at|at)\s+([A-Z][A-Za-z0-9&.]{1,28})\b/);
  if (companyMatch && !hard.college) {
    const c = companyMatch[1].trim();
    if (!/^(College|University|IIT|IIM|NIT|BITS)$/i.test(c)) hard.company = c;
  }

  const ageRange = ql.match(/\b(\d{2})\s*[-–to]+\s*(\d{2})\b/);
  if (ageRange) {
    hard.minAge = Number(ageRange[1]);
    hard.maxAge = Number(ageRange[2]);
  } else {
    const aroundAge = ql.match(/\b(?:around|about|age)\s*(\d{2})\b/);
    if (aroundAge) {
      const a = Number(aroundAge[1]);
      hard.minAge = a - 3;
      hard.maxAge = a + 3;
    }
  }

  if (/\b(women|woman|girls?|females?)\b/.test(ql) && !/\b(men|man|guys?|males?)\b/.test(ql)) {
    hard.gender = 'female';
    assumptionsSuppressed.push('dating_opposite_gender');
  } else if (/\b(men|man|guys?|males?)\b/.test(ql) && !/\b(women|woman|girls?|females?)\b/.test(ql)) {
    hard.gender = 'male';
    assumptionsSuppressed.push('dating_opposite_gender');
  }

  if (parsed) {
    if (parsed.city && !hard.city) hard.city = String(parsed.city).trim();
    if (parsed.college && !hard.college) hard.college = String(parsed.college).trim();
    if (parsed.company && !hard.company) hard.company = String(parsed.company).trim();
    if (parsed.gender && parsed.gender !== 'any' && !hard.gender) {
      hard.gender = normalizeGender(parsed.gender);
      assumptionsSuppressed.push('dating_opposite_gender');
    }
    if (parsed.ageRange) {
      if (parsed.ageRange.min != null && hard.minAge == null) hard.minAge = Number(parsed.ageRange.min);
      if (parsed.ageRange.max != null && hard.maxAge == null) hard.maxAge = Number(parsed.ageRange.max);
    }
    if (Array.isArray(parsed.interests) && parsed.interests.length) {
      hard.interests = parsed.interests.map((x) => String(x).trim()).filter(Boolean);
    }
  }

  return {
    hardFilters: hard,
    assumptionsSuppressed: [...new Set(assumptionsSuppressed)],
  };
}

function applySoftAssumptions({ viewer, query, searchIntent, hardFilters, assumptionsSuppressed }) {
  const suppressed = new Set(assumptionsSuppressed || []);
  const soft = {};
  const applied = [];
  const intent = String(searchIntent || '').toLowerCase();
  const seekerGender = normalizeGender(viewer?.gender || viewer?.profile?.gender);

  if (isDatingIntent(intent) && !hardFilters?.gender && !suppressed.has('dating_opposite_gender')) {
    if (seekerGender && OPPOSITE_GENDER[seekerGender]) {
      soft.gender = OPPOSITE_GENDER[seekerGender];
      soft.genderMode = 'opposite_default';
      applied.push('dating_opposite_gender');
    } else {
      soft.genderMode = 'unknown_seeker';
      soft.refineChips = [
        { id: 'gender_women', label: 'Women' },
        { id: 'gender_men', label: 'Men' },
        { id: 'gender_everyone', label: 'Everyone' },
      ];
    }
  }

  const age = Number(viewer?.age || viewer?.profile?.age);
  if (
    !suppressed.has('similar_age_band') &&
    hardFilters?.minAge == null &&
    hardFilters?.maxAge == null &&
    Number.isFinite(age) &&
    age > 0
  ) {
    soft.minAge = Math.max(18, age - 5);
    soft.maxAge = age + 5;
    soft.ageMode = 'similar_band';
    applied.push('similar_age_band');
  }

  const city = String(viewer?.profile?.currentCity || viewer?.city || '').trim();
  if (!suppressed.has('near_city_or_open') && !hardFilters?.city && city) {
    soft.preferCity = city.toLowerCase();
    soft.openToRelocateOk = true;
    soft.cityMode = 'prefer_near';
    applied.push('near_city_or_open');
    soft.refineChips = soft.refineChips || [];
    soft.refineChips.push({ id: 'widen_location', label: 'Widen location' });
  }

  if (intent && intent !== 'any') {
    soft.preferLookingFor = intent;
    applied.push('intent_overlap');
  }

  soft.preferRecentlyActive = true;
  applied.push('recently_active');

  soft.fofBoost = true;
  applied.push('fof_boost');

  if (CAREER_INTENTS.has(intent) || /job|hir|career|co-?founder|startup/.test(String(query || '').toLowerCase())) {
    soft.preferProfileType = 'professional';
    applied.push('profile_type_career');
  } else if (SOCIAL_INTENTS.has(intent) || isDatingIntent(intent)) {
    soft.preferProfileType = 'personal';
    applied.push('profile_type_social');
  }

  if (hardFilters?.gender) {
    delete soft.gender;
    delete soft.genderMode;
  }

  return {
    softAssumptions: soft,
    appliedAssumptionIds: [...new Set(applied)],
    suppressedAssumptionIds: [...suppressed],
  };
}

function buildQueryPlan(opts) {
  const o = opts || {};
  const query = String(o.query || '').trim();
  const chipIntent = o.chipIntent || null;
  const parsed = o.parsed || null;
  const viewer = o.viewer || {};
  const aiEnabled = !!o.aiEnabled;

  const searchIntent =
    (parsed && parsed.searchIntent) || chipIntent || detectChipIntent(query) || 'any';

  const { hardFilters, assumptionsSuppressed } = extractHardFilters(query, parsed);
  const soft = applySoftAssumptions({
    viewer,
    query,
    searchIntent,
    hardFilters,
    assumptionsSuppressed,
  });

  return {
    version: ASSUMPTION_VERSION,
    query,
    searchIntent,
    aiEnabled,
    hardFilters,
    softAssumptions: soft.softAssumptions,
    appliedAssumptionIds: soft.appliedAssumptionIds,
    suppressedAssumptionIds: soft.suppressedAssumptionIds,
    assumptionsSuppressed,
    vibe: (parsed && parsed.vibe) || '',
    conversationStarter: (parsed && parsed.conversationStarter) || '',
  };
}

function detectChipIntent(query) {
  const ql = String(query || '').toLowerCase();
  const map = [
    ['dating', /dat(e|ing)|romance|romantic|marriage|someone special/],
    ['friendship', /friend|buddy|hang\s*out/],
    ['job', /job|hiring|hire|recruit|career/],
    ['flatmate', /flatmate|roommate|room\s*mate|housemate/],
    ['travel', /travel|trip|trek/],
    ['gaming', /game|gaming|chess|play with/],
    ['music', /music|song|concert/],
    ['cofounder', /co-?founder|startup|collaborate/],
  ];
  for (const [id, re] of map) {
    if (re.test(ql)) return id;
  }
  return null;
}

function passesHardEligibility(viewer, cand, ctx) {
  if (!cand || !cand.uid) return false;
  if (cand.uid === viewer?.uid) return false;
  if (cand.hiddenFromDiscovery === true) return false;
  if (cand.discoveryOptOut === true || cand.optOutDiscovery === true) return false;
  if (cand.shadowbanned === true) return false;
  if (cand.deleted === true || cand.banned === true) return false;
  if (ctx?.blockedSet?.has?.(cand.uid)) return false;
  if (ctx?.mutedSet?.has?.(cand.uid)) return false;

  const candAge = Number(cand.age || cand.profile?.age);
  const viewerAge = Number(viewer?.age || viewer?.profile?.age);
  const viewerTeen = !!ctx?.viewerIsTeen || (Number.isFinite(viewerAge) && viewerAge > 0 && viewerAge < 18);
  const candTeen = !!cand.teenMode || (Number.isFinite(candAge) && candAge > 0 && candAge < 18);
  if (viewerTeen && !candTeen) return false;
  if (!viewerTeen && candTeen) return false;

  if (cand.openToMeet === false) return false;
  return true;
}

function passesQueryHardFilters(cand, hardFilters) {
  if (!hardFilters) return true;
  const hf = hardFilters;

  if (hf.gender) {
    const g = normalizeGender(cand.gender || cand.profile?.gender);
    if (g && g !== normalizeGender(hf.gender)) return false;
  }

  if (hf.minAge != null || hf.maxAge != null) {
    const age = Number(cand.age || cand.profile?.age);
    if (Number.isFinite(age)) {
      if (hf.minAge != null && age < Number(hf.minAge)) return false;
      if (hf.maxAge != null && age > Number(hf.maxAge)) return false;
    }
  }

  if (hf.city) {
    const want = String(hf.city).toLowerCase();
    const city = String(cand.profile?.currentCity || cand.city || '').toLowerCase();
    if (city && city !== want && !city.includes(want) && !want.includes(city)) return false;
  }

  if (hf.college) {
    const want = String(hf.college).toLowerCase();
    const blob = [
      cand.college,
      cand.profile?.college,
      cand.education,
      cand.profile?.education,
      cand.school,
      cand.profile?.school,
    ]
      .filter(Boolean)
      .join(' ')
      .toLowerCase();
    if (!blob.includes(want)) {
      const tokens = want.split(/\s+/).filter((w) => w.length >= 3);
      if (!tokens.length || !tokens.every((w) => blob.includes(w))) return false;
    }
  }

  if (hf.company) {
    const want = String(hf.company).toLowerCase();
    const blob = [cand.company, cand.profile?.company, cand.occupation, cand.profile?.occupation]
      .filter(Boolean)
      .join(' ')
      .toLowerCase();
    if (!blob.includes(want)) return false;
  }

  if (Array.isArray(hf.interests) && hf.interests.length) {
    const theirs = new Set(
      [...(cand.interests || []), ...(cand.profile?.interests || []), ...(cand.hobbies || [])].map((x) =>
        String(x).toLowerCase()
      )
    );
    const hit = hf.interests.some((i) => theirs.has(String(i).toLowerCase()));
    if (!hit && !hf.college && !hf.city && !hf.company) return false;
  }

  return true;
}

function softAssumptionFit(cand, plan) {
  const soft = plan?.softAssumptions || {};
  let score = 0.5;
  let parts = 0;

  if (soft.gender && soft.genderMode === 'opposite_default') {
    const g = normalizeGender(cand.gender || cand.profile?.gender);
    if (g && g !== normalizeGender(soft.gender)) return { fit: 0, exclude: true };
    if (g) {
      score += 0.35;
      parts++;
    }
  }

  if (soft.minAge != null || soft.maxAge != null) {
    const age = Number(cand.age || cand.profile?.age);
    if (Number.isFinite(age)) {
      const mid = ((soft.minAge || age) + (soft.maxAge || age)) / 2;
      const diff = Math.abs(age - mid);
      score += Math.max(0, 1 - diff / 12) * 0.25;
      parts++;
    }
  }

  if (soft.preferCity) {
    const city = String(cand.profile?.currentCity || cand.city || '').toLowerCase();
    const open = !!(cand.openToRelocate || cand.profile?.openToRelocate);
    if (city && city === soft.preferCity) {
      score += 0.3;
      parts++;
    } else if (open && soft.openToRelocateOk) {
      score += 0.12;
      parts++;
    }
  }

  if (soft.preferLookingFor) {
    const lf = String(cand.lookingFor || cand.profile?.lookingFor || '').toLowerCase();
    const intents = (cand.intents || []).map((i) => String(i).toLowerCase());
    const want = soft.preferLookingFor;
    if (lf.includes(want) || intents.some((i) => i.includes(want))) {
      score += 0.25;
      parts++;
    }
  }

  if (soft.preferProfileType) {
    const pt = String(cand.profileType || cand.profile?.profileType || 'personal').toLowerCase();
    if (pt === soft.preferProfileType) {
      score += 0.15;
      parts++;
    }
  }

  return {
    fit: Math.max(0, Math.min(1, parts ? score / Math.max(1, 0.5 + parts * 0.2) : 0.5)),
    exclude: false,
  };
}

function explainMatch(cand, plan, signalScores) {
  const bits = [];
  const hf = plan?.hardFilters || {};
  const soft = plan?.softAssumptions || {};
  if (hf.city || soft.preferCity) {
    const city = cand.profile?.currentCity || cand.city;
    if (city) bits.push('city');
  }
  if (hf.college) bits.push('college');
  if (hf.interests?.length || (signalScores && signalScores.interestOverlap > 0.3)) bits.push('interests');
  if (soft.genderMode === 'opposite_default' || hf.gender) bits.push('preferences');
  if (signalScores && signalScores.followAffinity > 0.4) bits.push('shared connections');
  if (!bits.length && plan?.searchIntent && plan.searchIntent !== 'any') bits.push('intent');
  if (!bits.length) return 'Matched on open profile';
  return `Matched on ${bits.slice(0, 3).join(' & ')}`;
}

module.exports = {
  ASSUMPTION_VERSION,
  ASSUMPTION_CATALOGUE,
  buildQueryPlan,
  extractHardFilters,
  applySoftAssumptions,
  detectSuppressedAssumptions,
  detectChipIntent,
  passesHardEligibility,
  passesQueryHardFilters,
  softAssumptionFit,
  explainMatch,
  isDatingIntent,
  normalizeGender,
  OPPOSITE_GENDER,
};
