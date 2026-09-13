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
const effectsJs = read('public/src/js/features/mehfil-effects.js');
const cinemaCss = read('public/src/styles/mehfil-cinema.css');
const mehfilCss = read('public/src/styles/mehfil.css');
const mediaConfig = read('api/media-config.js');
const access = read('server-lib/mehfil-access.js');
const i18n = read('public/src/js/core/i18n.js');

const checks = [
  ['mehfil.js', exists('public/src/js/features/mehfil.js')],
  ['mehfil.css', exists('public/src/styles/mehfil.css')],
  ['agora-token.js', exists('server-lib/agora-token.js')],
  ['mehfil-access.js', exists('server-lib/mehfil-access.js')],
  ['database.rules.json mehfilMembers', rules.includes('"mehfilMembers"') && rules.includes('"mehfil"') && rules.includes('mehfilInbox')],
  ['RTDB mehfil read gated by mehfilMembers', rules.includes("root.child('mehfilMembers')")],
  ['mehfilLiveState helper', mehfilJs.includes('function mehfilLiveState') && mehfilJs.includes('count >= 2')],
  ['freshness 25s + heartbeat 10s', mehfilJs.includes('PRESENCE_FRESH_MS = 25000') && mehfilJs.includes('PRESENCE_HEARTBEAT_MS = 10000')],
  ['abandonMehfil teardown', mehfilJs.includes('function abandonMehfil') && mehfilJs.includes('ensureOpenMehfil')],
  ['DM ring chrome + traces', mehfilJs.includes('RING_TRACE_NO_ANSWER') && mehfilJs.includes('setRingingChrome')],
  ['mic truth + speaking hysteresis', mehfilJs.includes('SPEAK_ON_LEVEL') && mehfilJs.includes('setMicUi') && mehfilJs.includes('You’re muted')],
  ['token renew + connection UX', mehfilJs.includes('renewAgoraToken') && mehfilJs.includes('token-privilege-will-expire')],
  ['watch party search pick list', mehfilJs.includes('paintMediaResults') && mehfilJs.includes('Play for the room')],
  ['shared music path', mehfilJs.includes('playSharedMusicTrack') && mehfilJs.includes("type: 'music'")],
  ['host everyone delegate', mehfilJs.includes('openDelegatePicker') && mehfilJs.includes('controlMode')],
  ['room roles + removal', mehfilJs.includes('ensureRoomRoles') && mehfilJs.includes('hostRemoveUser') && mehfilJs.includes('roomHost')],
  ['subscriber token mint', read('server-lib/agora-token.js').includes('SUBSCRIBER') && read('server-lib/mehfil-access.js').includes('resolveMehfilVoiceRole')],
  ['RTDB roles/removed rules', rules.includes('"roomHost"') && rules.includes('"removed"') && rules.includes('"roles"')],
  ['mehfil_ensure_member action', mediaConfig.includes('mehfil_ensure_member')],
  ['agora_token membership gate', mediaConfig.includes('assertMehfilAgoraAccess')],
  ['social: room chat retain + flood', (mehfilJs.includes('mehfil_chat_retain') || i18n.includes('mehfil_chat_retain')) && mehfilJs.includes('chatFloodBlocked')],
  ['social: invite sheet', mehfilJs.includes('function openInviteSheet') && mehfilJs.includes('sendRoomReaction')],
  ['social: presence coalesce', mehfilJs.includes('PRESENCE_COALESCE_MS') && mehfilJs.includes('queuePresenceEvent')],
  ['social: effects clear', effectsJs.includes('clear()') && cinemaCss.includes('mehfil-chat-retain')],
  ['cinema: three-layer chrome', mehfilJs.includes('mehfil-glance') && mehfilJs.includes('mehfil-immersive-exit') && !mehfilJs.includes('mehfil-ring-btn')],
  ['cinema: token themes + stage rest', cinemaCss.includes('mehfil-theme--light') && cinemaCss.includes('#F5F5F5') && cinemaCss.includes('mehfil-stage-rest')],
  ['cinema: warm voice tiles', mehfilJs.includes('mehfil-tile--voice') && mehfilCss.includes('mehfil-tile-avatar')],
  ['scale: publisher/participant caps', mehfilJs.includes('MAX_PUBLISHERS = 10') && mehfilJs.includes('MAX_PARTICIPANTS = 40') && access.includes('MEHFIL_MAX_PUBLISHERS')],
  ['scale: video reconcile + pin', mehfilJs.includes('reconcileVideoSubscriptions') && mehfilJs.includes('setPinnedUid')],
  ['scale: volume/presence throttle', mehfilJs.includes('VOLUME_PAINT_MS') && mehfilJs.includes('PRESENCE_PAINT_MS')],
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
Manual QA checklist (M7)
------------------------
Caps
  [ ] >10 speakers → new joiner is listener + honest toast; host promote needs a free slot
  [ ] Room ≥40 → calm full message, not silent fail
  [ ] Cap hint shows n/10 speakers; tap for detail

Video / audio
  [ ] Only budgeted remote videos play; others avatar + “tap to view”; pin works
  [ ] Media on stage → tighter video budget; weak net → status only
  [ ] Speaking rings without per-tick layout thrash

Ops
  [ ] 20m join/leave → no listener growth; leave tears down
  [ ] npm run health:mehfil; api/*.js ≤12
`);

process.exit(ok ? 0 : 1);
