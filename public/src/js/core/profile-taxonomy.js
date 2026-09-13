/**
 * Profile field taxonomy (P1) — canonical catalogs + keep/merge/retire map.
 *
 * STRUCTURED (learnable): interests, matchIntent/lookingFor, industry, purpose,
 *   languages, city (canonical when from chips), skills, diet/drink/smoke enums.
 * EXPRESSIVE (free text): bio, prompts answers, interestsFreeText, lifeGoals.
 * SENSITIVE (private/friends default): religion, annualIncome, politics,
 *   relationshipStatus, haveChildren/wantChildren, maritalHistory, disability.
 *
 * KEEP (Glance/Act): displayName, username, bio, photo, gender, DOB, pronouns,
 *   currentCity, languages, interests, prompts, lookingFor/matchIntent,
 *   occupation, industry, purpose (Pro), skills, linkedin/website (Pro),
 *   profileVisibility + show* flags.
 * MERGE: hobbies→interests (read both, write interests); lookingFor↔matchIntent
 *   (write both); sports/music/movies as interest chip groups not separate %.
 * RETIRE / Power-only: bloodGroup, disability, nationality, religion2,
 *   personalityType, openToDating, certifications, books/travel/food/art arrays,
 *   bucketList, mediaCaptions, height/zodiac/mbti/politics (More tab).
 *
 * Templates: Personal = matching depth; Professional = credibility/portfolio.
 * Backward compat: always read legacy keys; never delete user docs.
 */
(function () {
  'use strict';

  const CITY_CHIPS = [
    'Mumbai',
    'Delhi',
    'Bengaluru',
    'Hyderabad',
    'Chennai',
    'Kolkata',
    'Pune',
    'Ahmedabad',
    'Jaipur',
    'Chandigarh',
    'Lucknow',
    'Kochi',
    'Goa',
    'Indore',
    'Surat',
  ];

  const INTEREST_CHIPS = [
    'Travel',
    'Food',
    'Films',
    'Music',
    'Fitness',
    'Books',
    'Tech',
    'Startups',
    'Art',
    'Comedy',
    'Sports',
    'Gaming',
    'Photography',
    'Cooking',
    'Nature',
    'Spirituality',
    'Fashion',
    'Volunteer work',
    'Politics',
    'Animals',
  ];

  const MATCH_INTENTS = [
    'Friendship',
    'Dating',
    'Serious relationship',
    'Marriage',
    'Networking / Professional connections',
    'Co-founder / Collaborator',
    'Study buddy',
    'Workout buddy',
    'Travel buddy',
    'Flatmate / Roommate',
    'Mentorship',
    'Nothing specific',
    'Open to anything',
  ];

  /** Professional "open to" — no dating-style intents. */
  const PRO_INTENTS = [
    'Networking / Professional connections',
    'Hiring',
    'Looking for work',
    'Co-founder / Collaborator',
    'Mentorship',
    'Clients / customers',
    'Speaking / media',
    'Nothing specific',
  ];

  const INDUSTRIES = [
    'Technology',
    'Finance & Banking',
    'Healthcare',
    'Education',
    'Media & Entertainment',
    'Government',
    'Legal',
    'Real Estate',
    'Retail',
    'Manufacturing',
    'Agriculture',
    'Hospitality',
    'Consulting',
    'NGO / Non-profit',
    'Student',
    'Freelancer',
    'Entrepreneur',
    'Creator / Influencer',
  ];

  const PURPOSES = [
    'Grow my network',
    'Find collaborators',
    'Hire talent',
    'Find work',
    'Share my work',
    'Build in public',
    'Learn from peers',
    'Find clients',
  ];

  const SKILL_CHIPS = [
    'Leadership',
    'Public speaking',
    'Writing',
    'Coding',
    'Design',
    'Data analysis',
    'Marketing',
    'Sales',
    'Finance',
    'Research',
    'Teaching',
    'Product',
    'Operations',
    'Strategy',
  ];

  /** Sensitive fields → default audience for new answers. */
  const SENSITIVE_DEFAULTS = {
    religion: 'private',
    annualIncome: 'private',
    politics: 'private',
    relationshipStatus: 'friends',
    lookingFor: 'friends',
    haveChildren: 'private',
    wantChildren: 'private',
    maritalHistory: 'private',
    disability: 'private',
  };

  const FIELD_META = {
    bio: { layer: 'glance', templates: ['personal', 'professional'], structured: false, matching: true, payoff: 'People get a feel for you before they tap Message' },
    currentCity: { layer: 'glance', templates: ['personal', 'professional'], structured: true, matching: true, payoff: 'Unlocks nearby people in Khoj' },
    interests: { layer: 'act', templates: ['personal', 'professional'], structured: true, matching: true, payoff: 'Better people in Khoj who share your world' },
    prompts: { layer: 'act', templates: ['personal'], structured: false, matching: true, payoff: 'Conversation starters on your Digital tab' },
    lookingFor: { layer: 'act', templates: ['personal'], structured: true, matching: true, sensitive: true, defaultAudience: 'friends', payoff: 'Used for matching — friends see this by default' },
    matchIntent: { layer: 'act', templates: ['personal', 'professional'], structured: true, matching: true, payoff: 'Helps Khoj know what you’re open to' },
    occupation: { layer: 'act', templates: ['personal', 'professional'], structured: false, matching: true, payoff: 'Shows up on your card' },
    industry: { layer: 'act', templates: ['professional'], structured: true, matching: true, payoff: 'Helps professionals find you' },
    purpose: { layer: 'act', templates: ['professional'], structured: true, matching: true, payoff: 'Says why you’re here' },
    skills: { layer: 'act', templates: ['professional'], structured: true, matching: true, payoff: 'Credibility on your portfolio' },
    linkedin: { layer: 'act', templates: ['professional'], structured: false, matching: false, payoff: 'One tap to your work' },
    website: { layer: 'act', templates: ['professional'], structured: false, matching: false, payoff: 'Portfolio or shop link' },
    religion: { layer: 'power', templates: ['personal'], structured: true, sensitive: true, defaultAudience: 'private' },
    annualIncome: { layer: 'power', templates: ['personal', 'professional'], structured: true, sensitive: true, defaultAudience: 'private' },
    relationshipStatus: { layer: 'act', templates: ['personal'], structured: true, sensitive: true, defaultAudience: 'friends' },
  };

  function canonKey(label) {
    return String(label || '')
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '_')
      .replace(/^_|_$/g, '')
      .slice(0, 48);
  }

  /** Map free-text / Other to a catalog label when close; else keep raw. */
  function mapToCatalog(raw, catalog) {
    const t = String(raw || '').trim();
    if (!t) return { value: '', key: '', other: false };
    const lower = t.toLowerCase();
    const hit = (catalog || []).find((c) => String(c).toLowerCase() === lower);
    if (hit) return { value: hit, key: canonKey(hit), other: false };
    const soft = (catalog || []).find(
      (c) => String(c).toLowerCase().includes(lower) || lower.includes(String(c).toLowerCase())
    );
    if (soft && Math.abs(soft.length - t.length) <= 4) {
      return { value: soft, key: canonKey(soft), other: false };
    }
    return { value: t, key: canonKey(t), other: true };
  }

  function normalizeInterestList(list) {
    const out = [];
    const seen = new Set();
    (Array.isArray(list) ? list : []).forEach((item) => {
      const m = mapToCatalog(item, INTEREST_CHIPS);
      if (!m.value || seen.has(m.value.toLowerCase())) return;
      seen.add(m.value.toLowerCase());
      out.push(m.value);
    });
    return out;
  }

  /** Union interests + hobbies for display / completion (compat). */
  function resolvedInterests(dp) {
    const p = dp || {};
    const merged = [
      ...(Array.isArray(p.interests) ? p.interests : []),
      ...(Array.isArray(p.hobbies) ? p.hobbies : []),
    ];
    const free = [p.interestsFreeText, p.hobbiesFreeText]
      .filter(Boolean)
      .join(', ')
      .split(/[,;]/)
      .map((s) => s.trim())
      .filter(Boolean);
    return normalizeInterestList([...merged, ...free]);
  }

  function resolvedMatchIntent(dp) {
    const p = dp || {};
    return String(p.lookingFor || p.matchIntent || '').trim();
  }

  function isProfessional() {
    const t =
      (typeof getProfileType === 'function' && getProfileType()) ||
      (typeof digitalProfile !== 'undefined' && digitalProfile?.profileType) ||
      'personal';
    return String(t).toLowerCase() === 'professional';
  }

  function deepenStepsForTemplate(profileType) {
    const pro = String(profileType || '').toLowerCase() === 'professional';
    if (pro) {
      return [
        { id: 'bio', key: 'bio', title: 'Headline spark', payoff: FIELD_META.bio.payoff, kind: 'bio' },
        { id: 'city', key: 'currentCity', title: 'Where you’re based', payoff: FIELD_META.currentCity.payoff, kind: 'city' },
        { id: 'industry', key: 'industry', title: 'Industry', payoff: FIELD_META.industry.payoff, kind: 'industry' },
        { id: 'purpose', key: 'purpose', title: 'Why you’re here', payoff: FIELD_META.purpose.payoff, kind: 'purpose' },
        { id: 'skills', key: 'skills', title: 'Skills', payoff: FIELD_META.skills.payoff, kind: 'skills' },
      ];
    }
    return [
      { id: 'bio', key: 'bio', title: 'A line about you', payoff: FIELD_META.bio.payoff, kind: 'bio' },
      { id: 'city', key: 'currentCity', title: 'Your city', payoff: FIELD_META.currentCity.payoff, kind: 'city' },
      { id: 'interests', key: 'interests', title: 'Things that excite you', payoff: FIELD_META.interests.payoff, kind: 'interests' },
      { id: 'intent', key: 'lookingFor', title: 'What you’re open to', payoff: FIELD_META.lookingFor.payoff, kind: 'intent', sensitive: true },
      { id: 'prompt', key: 'prompts', title: 'One prompt', payoff: FIELD_META.prompts.payoff, kind: 'prompt' },
    ];
  }

  function needsDeepenStep(dp, step) {
    const p = dp || {};
    switch (step.kind) {
      case 'bio':
        return !String(p.bio || '').trim();
      case 'city':
        return !String(p.currentCity || p.city || '').trim();
      case 'interests':
        return resolvedInterests(p).length < 1;
      case 'intent':
        return !resolvedMatchIntent(p);
      case 'prompt': {
        const prompts = Array.isArray(p.prompts) ? p.prompts.filter((x) => x?.answer) : [];
        return prompts.length < 1;
      }
      case 'industry':
        return !String(p.industry || '').trim();
      case 'purpose':
        return !String(p.purpose || '').trim();
      case 'skills':
        return !(Array.isArray(p.skills) && p.skills.length);
      default:
        return false;
    }
  }

  function quietCelebrate() {
    try {
      if (typeof Quiet !== 'undefined' && Quiet?.motion === false) return true;
      if (window.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches) return true;
    } catch (e) {}
    return false;
  }

  const root = typeof window !== 'undefined' ? window : typeof global !== 'undefined' ? global : {};
  root.ProfileTaxonomy = {
    CITY_CHIPS,
    INTEREST_CHIPS,
    MATCH_INTENTS,
    PRO_INTENTS,
    INDUSTRIES,
    PURPOSES,
    SKILL_CHIPS,
    SENSITIVE_DEFAULTS,
    FIELD_META,
    canonKey,
    mapToCatalog,
    normalizeInterestList,
    resolvedInterests,
    resolvedMatchIntent,
    isProfessional,
    deepenStepsForTemplate,
    needsDeepenStep,
    quietCelebrate,
  };
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = root.ProfileTaxonomy;
  }
})();
