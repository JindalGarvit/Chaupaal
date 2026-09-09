/**
 * Seed feature_flags using the logged-in Firebase CLI session.
 * Usage: node scripts/seed-feature-flags-cli.js
 */
const path = require('path');
const https = require('https');

const FT_ROOT = path.join(
  process.env.APPDATA || '',
  'npm',
  'node_modules',
  'firebase-tools',
  'lib'
);

const PROJECT = 'chaupaal-chaupaal';
const SEEDS = {
  search_v1: { enabled: true, percent: 100, allowList: [], denyList: [], note: 'Universal search UI' },
  deeplinks_v1: { enabled: true, percent: 100, allowList: [], denyList: [], note: 'Shareable profile/post/chat URLs' },
  rate_limit_client: {
    enabled: true,
    percent: 100,
    allowList: [],
    denyList: [],
    note: 'Client calls /api/check-rate before writes',
  },
  mehfil: {
    enabled: true,
    percent: 100,
    allowList: [],
    denyList: [],
    note: 'Mehfil rooms. Voice needs AGORA_APP_ID + AGORA_APP_CERTIFICATE on Vercel.',
  },
  gif_live_search: {
    enabled: true,
    percent: 100,
    allowList: [],
    denyList: [],
    note: 'Live Klipy search via media-config gif_search. KLIPY_API_KEY is server-only.',
  },
};

function toFirestoreFields(obj) {
  const fields = {};
  for (const [k, v] of Object.entries(obj)) {
    if (typeof v === 'boolean') fields[k] = { booleanValue: v };
    else if (typeof v === 'number') fields[k] = { integerValue: String(Math.trunc(v)) };
    else if (typeof v === 'string') fields[k] = { stringValue: v };
    else if (Array.isArray(v)) {
      fields[k] = {
        arrayValue: {
          values: v.map((item) => ({ stringValue: String(item) })),
        },
      };
    }
  }
  return fields;
}

function requestJson(method, url, token, body) {
  return new Promise((resolve, reject) => {
    const u = new URL(url);
    const req = https.request(
      {
        hostname: u.hostname,
        path: u.pathname + u.search,
        method,
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
          ...(body ? { 'Content-Length': Buffer.byteLength(body) } : {}),
        },
      },
      (res) => {
        let data = '';
        res.on('data', (c) => (data += c));
        res.on('end', () => {
          if (res.statusCode >= 200 && res.statusCode < 300) {
            resolve(data ? JSON.parse(data) : {});
          } else {
            reject(new Error(`HTTP ${res.statusCode}: ${data.slice(0, 400)}`));
          }
        });
      }
    );
    req.on('error', reject);
    if (body) req.write(body);
    req.end();
  });
}

async function main() {
  if (process.env.FIREBASE_SERVICE_ACCOUNT_JSON) {
    require('./seed-feature-flags.js');
    return;
  }

  let auth;
  try {
    auth = require(path.join(FT_ROOT, 'auth.js'));
  } catch (e) {
    console.error('firebase-tools not found at', FT_ROOT);
    console.error('Install: npm i -g firebase-tools && firebase login');
    process.exit(1);
  }

  const account = typeof auth.getGlobalDefaultAccount === 'function' ? auth.getGlobalDefaultAccount() : null;
  if (!account) {
    console.error('No Firebase CLI account. Run: firebase login');
    process.exit(1);
  }

  const scopes = [
    'email',
    'openid',
    'https://www.googleapis.com/auth/cloudplatformprojects.readonly',
    'https://www.googleapis.com/auth/firebase',
    'https://www.googleapis.com/auth/cloud-platform',
    'https://www.googleapis.com/auth/datastore',
  ];

  let token;
  try {
    const tok = await auth.getAccessToken(account, scopes);
    token = (tok && tok.access_token) || tok;
  } catch (e) {
    console.error(e.message || e);
    console.error('Re-auth: firebase login --reauth');
    process.exit(1);
  }
  if (!token) {
    console.error('No Firebase CLI access token. Run: firebase login --reauth');
    process.exit(1);
  }

  const mask =
    'updateMask.fieldPaths=enabled&updateMask.fieldPaths=percent&updateMask.fieldPaths=allowList&updateMask.fieldPaths=denyList&updateMask.fieldPaths=note';

  // Prefer seeding only gif_live_search when GIF_FLAG_ONLY=1 (ops enable without touching others).
  const only = process.env.GIF_FLAG_ONLY === '1' ? { gif_live_search: SEEDS.gif_live_search } : SEEDS;

  for (const [id, data] of Object.entries(only)) {
    const docPath = `projects/${PROJECT}/databases/(default)/documents/feature_flags/${id}`;
    const url = `https://firestore.googleapis.com/v1/${docPath}?${mask}`;
    const body = JSON.stringify({ fields: toFirestoreFields(data) });
    await requestJson('PATCH', url, token, body);
    console.log('seeded', id, data.enabled ? 'enabled' : 'disabled');
  }
  console.log('done');
}

main().catch((e) => {
  console.error(e.message || e);
  process.exit(1);
});
