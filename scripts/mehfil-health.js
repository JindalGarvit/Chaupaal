/**
 * Lightweight Mehfil / Teen Mode health notes for local QA.
 * Usage: node scripts/mehfil-health.js
 * Does not call live APIs — prints a checklist + static env probes.
 */
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');

function exists(rel) {
  return fs.existsSync(path.join(root, rel));
}

function read(rel) {
  try {
    return fs.readFileSync(path.join(root, rel), 'utf8');
  } catch (e) {
    return '';
  }
}

const rules = read('firebase/database.rules.json');
const mehfilJs = read('public/src/js/features/mehfil.js');
const mediaConfig = read('api/media-config.js');

const checks = [
  ['mehfil.js', exists('public/src/js/features/mehfil.js')],
  ['mehfil.css', exists('public/src/styles/mehfil.css')],
  ['agora-token.js', exists('server-lib/agora-token.js')],
  ['mehfil-access.js', exists('server-lib/mehfil-access.js')],
  ['database.rules.json mehfilMembers', rules.includes('"mehfilMembers"') && rules.includes('"mehfil"') && rules.includes('mehfilInbox')],
  ['RTDB mehfil read gated by mehfilMembers', rules.includes("root.child('mehfilMembers')")],
  ['mehfilLiveState helper', mehfilJs.includes('function mehfilLiveState') && mehfilJs.includes('count >= 2')],
  ['freshness 25s + heartbeat 10s', mehfilJs.includes('PRESENCE_FRESH_MS = 25000') && mehfilJs.includes('PRESENCE_HEARTBEAT_MS = 10000')],
  ['mehfil_ensure_member action', mediaConfig.includes('mehfil_ensure_member')],
  ['agora_token membership gate', mediaConfig.includes('assertMehfilAgoraAccess')],
  ['youtube-search.js', exists('server-lib/youtube-search.js')],
  ['YOUTUBE_API_KEY documented', read('.env.example').includes('YOUTUBE_API_KEY')],
  ['teen-mode assertCanMessage', read('public/src/js/core/teen-mode.js').includes('assertCanMessage')],
  ['api/*.js count ≤12', fs.readdirSync(path.join(root, 'api')).filter((f) => f.endsWith('.js')).length <= 12],
];

const agoraConfigured = !!(process.env.AGORA_APP_ID && process.env.AGORA_APP_CERTIFICATE);
const apiCount = fs.readdirSync(path.join(root, 'api')).filter((f) => f.endsWith('.js')).length;

console.log('Chaupaal Mehfil / Teen health\n');
let ok = true;
checks.forEach(([label, pass]) => {
  console.log(`${pass ? '✓' : '✗'} ${label}`);
  if (!pass) ok = false;
});
console.log(`${agoraConfigured ? '✓' : '○'} AGORA_APP_ID + CERTIFICATE (optional — voice only)`);
console.log(`○ api/*.js count: ${apiCount} (Hobby max 12)`);

console.log(`
Manual QA checklist (M0)
------------------------
Live honesty
  [ ] One person in room → peers see “Waiting in Mehfil” (not Live)
  [ ] Second joins → Live on header, banner, inbox
  [ ] Kill tab → ghost gone within ~25s; ring skips ghosts

Security
  [ ] Non-member agora_token → rejected
  [ ] Non-member RTDB mehfil/{chatId} → denied
  [ ] Self-chat / Chaupaal AI blocked client + server
  [ ] Ring cooldown ~15s · TTL ~40s · fanout ≤20

Ops
  [ ] firebase deploy --only database
  [ ] Vercel env: AGORA_APP_ID, AGORA_APP_CERTIFICATE
`);

process.exit(ok ? 0 : 1);
