/**
 * Resolve display names from user root + active profile subdocs.
 */
async function resolveActiveProfileName(db, uid, root = {}) {
  if (!db || !uid) return '';
  const activeId = root.activeProfileId || root.profileId;
  if (activeId) {
    const p = await db.collection('users').doc(uid).collection('profiles').doc(activeId).get();
    if (p.exists) {
      const d = p.data() || {};
      return d.displayName || d.name || '';
    }
  }
  const first = await db.collection('users').doc(uid).collection('profiles').limit(1).get();
  if (!first.empty) {
    const d = first.docs[0].data() || {};
    return d.displayName || d.name || '';
  }
  return '';
}

function resolveDisplayNameFromData(data, resolvedProfileName) {
  const d = data || {};
  return (
    d.name ||
    d.displayName ||
    resolvedProfileName ||
    (d.username ? `@${d.username}` : '') ||
    'Someone'
  );
}

module.exports = {
  resolveActiveProfileName,
  resolveDisplayNameFromData,
};
