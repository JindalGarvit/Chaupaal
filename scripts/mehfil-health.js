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
const mediaConfig = read('api/media-config.js');
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
Manual QA checklist (M5)
------------------------
Room chat
  [ ] Send/receive fast; collapsed unread; open clears; keyboard-safe
  [ ] Retention copy matches reality (empty room → chat cleared)
  [ ] Removed user cannot post / react

Reactions
  [ ] Dock clap one-tap; sticker from More; all clients see bursts
  [ ] Rapid taps throttle; effects never block dock; Quiet / reduced-motion

Presence + invite
  [ ] Busy join/leave coalesced; media start = one moment
  [ ] Alone → warm invite + start something; invite sheet: bubble / link / ring
  [ ] Non-member deep link → honest denial, no leak

Ops
  [ ] Leave cleans listeners/timers (several join/leave cycles)
  [ ] npm run health:mehfil; api/*.js ≤12
`);

process.exit(ok ? 0 : 1);
