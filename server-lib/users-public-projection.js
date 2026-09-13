/**
 * Shared users_public projection helpers (Admin / backfill).
 * Keep in sync with public/src/js/core/users-public.js (client owner sync).
 *
 * Private / Friends only → identity + profileVisibility only.
 * Public → gated fields with show* flags.
 */
function normalizeVisibility(raw) {
  const u = raw && typeof raw === 'object' ? raw : {};
  const v = String(u.profileVisibility || u.profile?.profileVisibility || 'public')
    .toLowerCase()
    .trim();
  if (v === 'private') return 'private';
  if (v === 'friends only' || v === 'friends' || v === 'friends-only') return 'friends only';
  return 'public';
}

function flagOn(raw, key, defaultOn) {
  const u = raw && typeof raw === 'object' ? raw : {};
  const p = u.profile || {};
  if (u[key] !== undefined) return u[key] !== false && u[key] !== 'false';
  if (p[key] !== undefined) return p[key] !== false && p[key] !== 'false';
  return !!defaultOn;
}

function buildPublicProjection(uid, raw) {
  const u = raw && typeof raw === 'object' ? raw : {};
  const visibility = normalizeVisibility(u);
  const showAge = flagOn(u, 'showAge', true);
  const showLocation = flagOn(u, 'showLocation', true);
  const showRelationship = flagOn(u, 'showRelationship', true);

  const proj = {
    uid: uid || u.uid || null,
    profileVisibility:
      visibility === 'friends only' ? 'Friends only' : visibility === 'private' ? 'Private' : 'public',
  };

  ['name', 'nameLower', 'username', 'usernameLower', 'photoURL', 'photoThumb', 'avatar', 'profileType', 'openToMeet', 'createdAt'].forEach(
    (k) => {
      if (u[k] !== undefined) proj[k] = u[k];
    }
  );
  if (!proj.name && u.profile?.displayName) proj.name = u.profile.displayName;
  if (!proj.username && u.profile?.username) proj.username = u.profile.username;
  if (!proj.nameLower && proj.name) proj.nameLower = String(proj.name).toLowerCase().trim();
  if (!proj.usernameLower && proj.username) proj.usernameLower = String(proj.username).toLowerCase().trim();
  if (!proj.profileType) proj.profileType = u.profile?.profileType || 'personal';

  // Preserve Admin-only relationshipCounts when present on existing public docs (caller merges).
  if (u.relationshipCounts !== undefined) proj.relationshipCounts = u.relationshipCounts;

  if (visibility === 'private' || visibility === 'friends only') {
    const nested = {
      displayName: proj.name || undefined,
      username: proj.username || undefined,
      profileType: proj.profileType,
      profileVisibility: proj.profileVisibility,
    };
    Object.keys(nested).forEach((k) => nested[k] === undefined && delete nested[k]);
    proj.profile = nested;
    return proj;
  }

  const fields = [
    'city',
    'bio',
    'age',
    'gender',
    'interests',
    'hobbies',
    'topCat',
    'prompts',
    'icebreakers',
    'profileMedia',
    'sectionOrder',
    'customSections',
    'lookingFor',
    'matchIntent',
    'intents',
    'occupation',
    'personality',
    'industry',
    'purpose',
  ];
  fields.forEach((k) => {
    if (u[k] !== undefined) proj[k] = u[k];
  });
  if (u.profile && typeof u.profile === 'object') {
    const nested = {};
    [
      'displayName',
      'username',
      'bio',
      'interests',
      'prompts',
      'profileType',
      'currentCity',
      'occupation',
      'lookingFor',
      'age',
      'gender',
      'profileMedia',
      'sectionOrder',
      'customSections',
      'industry',
      'purpose',
      'profileVisibility',
    ].forEach((k) => {
      if (u.profile[k] != null) nested[k] = u.profile[k];
    });
    nested.profileVisibility = proj.profileVisibility;
    if (Object.keys(nested).length) proj.profile = nested;
  }
  if (!proj.city && u.profile?.currentCity) proj.city = u.profile.currentCity;
  if (!proj.bio && u.profile?.bio) proj.bio = u.profile.bio;
  if (!proj.age && u.profile?.age != null) proj.age = u.profile.age;

  if (!showAge) {
    delete proj.age;
    if (proj.profile) delete proj.profile.age;
  }
  if (!showLocation) {
    delete proj.city;
    if (proj.profile) delete proj.profile.currentCity;
  }
  if (!showRelationship) {
    delete proj.lookingFor;
    if (proj.profile) delete proj.profile.lookingFor;
  }

  return proj;
}

module.exports = {
  normalizeVisibility,
  buildPublicProjection,
};
