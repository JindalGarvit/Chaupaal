/**
 * Seed Phase 4 feature_flags docs (Admin SDK).
 * Usage: FIREBASE_SERVICE_ACCOUNT_JSON='...' node scripts/seed-feature-flags.js
 */
const admin = require('firebase-admin');

const SEEDS = {
  search_v1: { enabled: true, percent: 100, allowList: [], denyList: [], note: 'Universal search UI' },
  deeplinks_v1: { enabled: true, percent: 100, allowList: [], denyList: [], note: 'Shareable profile/post/chat URLs' },
  rate_limit_client: { enabled: true, percent: 100, allowList: [], denyList: [], note: 'Client calls /api/check-rate before writes' },
};

async function main() {
  const raw = process.env.FIREBASE_SERVICE_ACCOUNT_JSON;
  if (!raw) {
    console.error('Set FIREBASE_SERVICE_ACCOUNT_JSON');
    process.exit(1);
  }
  const cred = typeof raw === 'string' ? JSON.parse(raw) : raw;
  if (!admin.apps.length) {
    admin.initializeApp({ credential: admin.credential.cert(cred) });
  }
  const db = admin.firestore();
  for (const [id, data] of Object.entries(SEEDS)) {
    await db.collection('feature_flags').doc(id).set(data, { merge: true });
    console.log('seeded', id);
  }
  console.log('done');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
